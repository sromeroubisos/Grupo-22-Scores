import { NextRequest, NextResponse } from 'next/server';
import {
    canManageClubContext,
    getClubManagementTarget,
    requireUserAccessContext,
} from '@/lib/auth/permissions';
import { MANAGEMENT_MEMBERSHIP_ROLES } from '@/lib/auth/roles';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import {
    buildCategoryClubName,
    buildCategorySlug,
    categoryKey,
    findSimilarCategories,
} from '@/lib/clubs/categoryName';
import { isMissingColumnError } from '@/lib/utils/supabaseSchema';

const CLAIM_COLUMNS = ['claim_status', 'created_by_club_id', 'created_by_user_id'] as const;

export const dynamic = 'force-dynamic';

/**
 * POST /api/clubs/:id/categories — dar de alta una categoría.
 *
 * Sirve para las dos puntas: la categoría propia ("nuestra M15") y la del rival
 * ("Jockey M15"), que puede no existir todavía cuando se carga el partido.
 *
 * En los dos casos la categoría nace como un CLUB REAL colgado de su base por
 * `club_derivatives`: entra al catálogo, tiene ficha pública, acumula historial
 * y se puede seguir. No es un texto en el catálogo privado de quien la cargó,
 * y por eso queda disponible para todos de ahí en más.
 *
 * La diferencia entre una y otra es de quién es:
 *   · si la base está en tu familia   -> claim_status 'own'
 *   · si es de otro club              -> claim_status 'proposed', y aparece en
 *     la bandeja de su dueño, que puede tomarla y renombrarla.
 *
 * Renombrar no rompe nada: los partidos apuntan al `id`. Lo caro es fusionar
 * dos categorías gemelas, así que el control de duplicados va ACÁ, antes de
 * crear, y no en una limpieza posterior.
 */

function err(message: string, status: number, extra?: Record<string, unknown>) {
    return NextResponse.json({ ok: false, error: message, ...(extra ?? {}) }, { status });
}

function normalizeText(value: unknown) {
    if (typeof value !== 'string') return '';
    return value.replace(/\s+/g, ' ').trim();
}

function inferDerivativeType(label: string): 'youth' | 'women' | 'divisions' {
    const key = categoryKey(label);
    if (/\bm\d{1,2}\b/.test(key)) return 'youth';
    if (/\bdamas\b/.test(key)) return 'women';
    return 'divisions';
}

type ClubRow = {
    id: string;
    name: string | null;
    short_name?: string | null;
    sport?: string | null;
    sport_id?: string | null;
    union_id?: string | null;
    country?: string | null;
    city?: string | null;
    region?: string | null;
};

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const clubId = normalizeText(id);
        if (!clubId) return err('club requerido', 400);

        const body = await request.json().catch(() => ({}));
        const baseClubId = normalizeText(body?.baseClubId);
        const label = normalizeText(body?.label);
        const force = body?.force === true;

        if (!baseClubId) return err('Falta el club al que pertenece la categoría', 400);
        if (!label) return err('Poné el nombre de la categoría', 400);
        if (label.length > 80) return err('El nombre no puede pasar de 80 caracteres', 400);

        const supabase = await createClient();
        const context = await requireUserAccessContext(supabase).catch(() => null);
        if (!context) return err('No autenticado', 401);

        const target = await getClubManagementTarget(supabase, clubId);
        if (!target) return err('Club no encontrado', 404);
        if (!canManageClubContext(context, target, MANAGEMENT_MEMBERSHIP_ROLES)) {
            return err('Sin permisos para administrar este club', 403);
        }

        const admin = createAdminClient();

        const { data: baseClub } = await admin
            .from('clubs')
            .select('id, name, short_name, sport, sport_id, union_id, country, city, region')
            .eq('id', baseClubId)
            .maybeSingle();

        if (!baseClub) return err('No encontramos ese club', 404);
        const base = baseClub as ClubRow;

        // Solo se puede colgar de una BASE, no de otra categoría: si "Jockey M15"
        // pudiera tener hijas, el grafo de familia deja de ser una estrella y el
        // resolutor —que sube un nivel y baja uno— empieza a perder ramas.
        const { data: parentLink } = await admin
            .from('club_derivatives')
            .select('base_club_id')
            .eq('derived_club_id', base.id)
            .maybeSingle();

        if (parentLink?.base_club_id) {
            return err('Esa ya es una categoría. Elegí el club principal.', 400);
        }

        // Las categorías que ya tiene esa base, para no crear una gemela.
        const { data: existingLinks } = await admin
            .from('club_derivatives')
            .select('derived_club_id')
            .eq('base_club_id', base.id);

        const existingIds = ((existingLinks ?? []) as Array<{ derived_club_id?: string | null }>)
            .map(row => row.derived_club_id)
            .filter((value): value is string => Boolean(value));

        let existing: Array<{ id: string; name: string }> = [];
        if (existingIds.length > 0) {
            const { data: existingClubs } = await admin
                .from('clubs')
                .select('id, name, short_name')
                .in('id', existingIds);

            existing = ((existingClubs ?? []) as ClubRow[])
                .map(row => ({ id: row.id, name: row.name || row.short_name || row.id }));
        }

        const similar = findSimilarCategories(existing, base.name || base.id, label);
        if (similar.length > 0 && !force) {
            // No se crea: se devuelve lo que ya existe para que la elijan. Elegir
            // la que está tiene que ser más fácil que hacer una nueva.
            return err('Esa categoría ya existe en ese club', 409, { similar });
        }

        const fullName = buildCategoryClubName(base.name || base.id, label);
        const slug = buildCategorySlug(base.name || base.id, label);

        // `clubs.id` es TEXT y en este catálogo son slugs. Si el slug ya está
        // tomado por otro club, se desempata con un sufijo corto en vez de pisar.
        let newId = slug;
        const { data: taken } = await admin.from('clubs').select('id').eq('id', newId).maybeSingle();
        if (taken) newId = `${slug}-${Date.now().toString(36).slice(-4)}`;

        const ownFamily = new Set(target.familyClubIds ?? [target.clubId]);
        const isOwn = ownFamily.has(base.id);

        const clubPayload: Record<string, unknown> = {
            id: newId,
            name: fullName,
            slug: newId,
            short_name: label,
            sport: base.sport ?? null,
            sport_id: base.sport_id ?? null,
            union_id: base.union_id ?? null,
            country: base.country ?? null,
            city: base.city ?? null,
            region: base.region ?? null,
            is_visible: true,
            claim_status: isOwn ? 'own' : 'proposed',
            created_by_club_id: target.clubId,
            created_by_user_id: context.userId,
        };

        let insertClub = await admin.from('clubs').insert(clubPayload).select('id, name').single();

        // Base sin la migración de reclamo: la categoría se crea igual, pero sin
        // trazabilidad. Acá SÍ se degrada —a diferencia del alta de partido— porque
        // una categoría sin marca de origen no se filtra en ningún lado: es un club
        // más del catálogo, que es exactamente lo que se quería crear.
        //
        // El chequeo va por `isMissingColumnError` y no por el código `42703` a
        // secas: cuando falta la columna, PostgREST rechaza ANTES de llegar a
        // Postgres y contesta `PGRST204` con "Could not find the 'claim_status'
        // column of 'clubs' in the schema cache". Mirando solo el código de
        // Postgres, ese caso —el más común de los dos— se escapaba y el alta moría.
        if (insertClub.error && CLAIM_COLUMNS.some(column => isMissingColumnError(insertClub.error, column))) {
            console.warn('[clubs/categories] clubs sin columnas de reclamo; alta sin trazabilidad', {
                clubId,
                newId,
                falta: 'migración 20260824120000_club_categorias_creadas_por_terceros.sql',
            });
            for (const column of CLAIM_COLUMNS) {
                delete clubPayload[column];
            }
            insertClub = await admin.from('clubs').insert(clubPayload).select('id, name').single();
        }

        if (insertClub.error) {
            console.error('[clubs/categories] alta de club fallida', insertClub.error);
            return err(insertClub.error.message || 'No se pudo crear la categoría', 500);
        }

        const { error: linkError } = await admin.from('club_derivatives').insert({
            base_club_id: base.id,
            derived_club_id: newId,
            derivative_type: inferDerivativeType(label),
        });

        if (linkError) {
            // Sin el vínculo la categoría queda huérfana: no aparece en la familia
            // de nadie y no se puede elegir. Se deshace el alta antes de devolver.
            await admin.from('clubs').delete().eq('id', newId);
            console.error('[clubs/categories] vinculo fallido; se revirtio el alta', linkError);
            return err('No se pudo vincular la categoría a su club', 500);
        }

        // Si el alta degradó, la fila NO tiene `claim_status`: informarlo como
        // 'proposed' sería mentir, y la bandeja de reclamo del dueño nunca la
        // vería. Se dice lo que quedó guardado de verdad.
        const claimPersisted = Object.prototype.hasOwnProperty.call(clubPayload, 'claim_status');

        return NextResponse.json({
            ok: true,
            category: {
                id: newId,
                name: fullName,
                baseClubId: base.id,
                claimStatus: claimPersisted ? (isOwn ? 'own' : 'proposed') : null,
                claimTrackingEnabled: claimPersisted,
            },
        }, { status: 201 });
    } catch (error) {
        console.error('[clubs/categories] POST', error);
        return err('No se pudo crear la categoría', 500);
    }
}
