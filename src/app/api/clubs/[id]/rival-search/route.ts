import { NextRequest, NextResponse } from 'next/server';
import {
    canManageClubContext,
    getClubManagementTarget,
    requireUserAccessContext,
} from '@/lib/auth/permissions';
import { MANAGEMENT_MEMBERSHIP_ROLES } from '@/lib/auth/roles';
import { getReadClient } from '@/lib/supabase/read';
import { createClient } from '@/lib/supabase/server';
import { canonicalizeSportId } from '@/lib/clubDerivatives';

export const dynamic = 'force-dynamic';

/**
 * GET /api/clubs/:id/rival-search?q=jockey
 *
 * Buscador de rival para el alta de partido del panel. Devuelve el club y SUS
 * CATEGORÍAS, porque en este modelo el rival no es "Jockey": es "Jockey M15",
 * que es un club derivado con ficha propia.
 *
 * Existe aparte de `/api/admin/clubs` porque aquel exige `requireAdminApiUser()`
 * —admin global—, así que un dirigente de club no puede ni buscar a su rival.
 * Acá la puerta es la membresía sobre el club que está cargando el partido.
 */

function err(message: string, status: number) {
    return NextResponse.json({ ok: false, error: message }, { status });
}

function normalizeText(value: unknown) {
    if (typeof value !== 'string') return '';
    return value.replace(/\s+/g, ' ').trim();
}

const MAX_CLUBS = 12;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const clubId = normalizeText(id);
        const query = normalizeText(request.nextUrl.searchParams.get('q'));

        if (!clubId) return err('club requerido', 400);
        if (query.length < 2) {
            return NextResponse.json({ ok: true, clubs: [] });
        }

        const supabase = await createClient();
        const context = await requireUserAccessContext(supabase).catch(() => null);
        if (!context) return err('No autenticado', 401);

        const target = await getClubManagementTarget(supabase, clubId);
        if (!target) return err('Club no encontrado', 404);
        if (!canManageClubContext(context, target, MANAGEMENT_MEMBERSHIP_ROLES)) {
            return err('Sin permisos para administrar este club', 403);
        }

        const db = await getReadClient();
        const ownFamily = new Set(target.familyClubIds ?? [target.clubId]);
        const targetSport = canonicalizeSportId(target.sportId);

        // El `%` va escapado: un nombre con `%` o `_` sin escapar convierte la
        // búsqueda en un comodín y devuelve el catálogo entero.
        const safeQuery = query.replace(/[%_]/g, char => `\\${char}`);

        const { data: rows, error } = await (db as any)
            .from('clubs')
            .select('id, name, short_name, sport, sport_id')
            .ilike('name', `%${safeQuery}%`)
            .limit(60);

        if (error) throw error;

        // Se busca sobre el club BASE: sus categorías se resuelven abajo y no
        // tienen por qué competir por los doce lugares del listado.
        const candidates = ((rows ?? []) as Array<{ id: string; name?: string | null; short_name?: string | null; sport?: string | null; sport_id?: string | null }>)
            .filter(row => !ownFamily.has(row.id))
            .filter(row => {
                if (!targetSport) return true;
                const rowSport = canonicalizeSportId(row.sport_id || row.sport);
                return !rowSport || rowSport === targetSport;
            })
            .slice(0, MAX_CLUBS);

        if (candidates.length === 0) {
            return NextResponse.json({ ok: true, clubs: [] });
        }

        const baseIds = candidates.map(row => row.id);

        // Una sola consulta para las categorías de los doce candidatos: pedirlas
        // club por club serían doce viajes contra una base cross-region.
        const { data: derivativeRows } = await (db as any)
            .from('club_derivatives')
            .select('base_club_id, derived_club_id')
            .in('base_club_id', baseIds);

        const derivedIds = Array.from(new Set(
            ((derivativeRows ?? []) as Array<{ derived_club_id?: string | null }>)
                .map(row => row.derived_club_id)
                .filter((value): value is string => Boolean(value))
        ));

        const derivedNames = new Map<string, string>();
        if (derivedIds.length > 0) {
            const { data: derivedClubs } = await (db as any)
                .from('clubs')
                .select('id, name, short_name')
                .in('id', derivedIds);

            for (const row of (derivedClubs ?? []) as Array<{ id: string; name?: string | null; short_name?: string | null }>) {
                derivedNames.set(row.id, row.name || row.short_name || row.id);
            }
        }

        const derivedByBase = new Map<string, string[]>();
        for (const row of (derivativeRows ?? []) as Array<{ base_club_id?: string | null; derived_club_id?: string | null }>) {
            if (!row.base_club_id || !row.derived_club_id) continue;
            const list = derivedByBase.get(row.base_club_id);
            if (list) list.push(row.derived_club_id);
            else derivedByBase.set(row.base_club_id, [row.derived_club_id]);
        }

        const clubs = candidates.map(row => {
            const name = row.name || row.short_name || row.id;
            const categories = [
                { id: row.id, name, isBase: true },
                ...(derivedByBase.get(row.id) ?? [])
                    .filter(derivedId => !ownFamily.has(derivedId))
                    .map(derivedId => ({ id: derivedId, name: derivedNames.get(derivedId) || derivedId, isBase: false }))
                    .sort((left, right) => left.name.localeCompare(right.name)),
            ];

            return { id: row.id, name, categories };
        });

        return NextResponse.json({ ok: true, clubs });
    } catch (error) {
        console.error('[clubs/rival-search]', error);
        return err('No se pudo buscar el rival', 500);
    }
}
