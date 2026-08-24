import { NextRequest, NextResponse } from 'next/server';
import {
    canManageClubContext,
    getClubManagementTarget,
    requireUserAccessContext,
} from '@/lib/auth/permissions';
import { MANAGEMENT_MEMBERSHIP_ROLES } from '@/lib/auth/roles';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { TOURNAMENT_REVIEW_STATUS } from '@/lib/tournamentReview';
import { APP_TIMEZONE, combineLocalDateTimeToUtcIso } from '@/lib/timezone';

export const dynamic = 'force-dynamic';

/**
 * POST /api/clubs/:id/panel-matches — el club carga un partido desde su panel.
 *
 * Esta ruta existe porque `POST /api/matches` exige `requireAdminApiUser()`, o
 * sea admin global: un dirigente de club no puede cargar ni un amistoso de su
 * propia categoría. Acá la puerta es la membresía sobre ESTE club.
 *
 * El partido nace suelto (`tournament_id` NULL) salvo que se lo meta en una
 * competencia propia del club. En los dos casos queda fuera de la portada:
 *   · suelto → lo filtra la guarda de partidos de club en /api/matches
 *   · en competencia → el torneo del club es invisible, y /api/matches ya
 *     descarta el partido cuyo torneo no es público
 */

function err(message: string, status: number) {
    return NextResponse.json({ ok: false, error: message }, { status });
}

function normalizeText(value: unknown) {
    if (typeof value !== 'string') return '';
    return value.replace(/\s+/g, ' ').trim();
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const clubId = normalizeText(id);
        if (!clubId) return err('club requerido', 400);

        const body = await request.json().catch(() => ({}));
        const ourClubId = normalizeText(body?.ourClubId);
        const rivalClubId = normalizeText(body?.rivalClubId);
        const date = normalizeText(body?.date);
        const time = normalizeText(body?.time) || '00:00';
        const venue = normalizeText(body?.venue);
        const competitionId = normalizeText(body?.competitionId);
        const isHome = body?.isHome !== false;

        if (!ourClubId) return err('Elegí qué categoría de tu club juega', 400);
        if (!rivalClubId) return err('Elegí el rival', 400);
        if (ourClubId === rivalClubId) return err('El rival no puede ser el mismo equipo', 400);
        if (!DATE_RE.test(date)) return err('La fecha tiene que ser YYYY-MM-DD', 400);
        if (!TIME_RE.test(time)) return err('La hora tiene que ser HH:MM', 400);

        const supabase = await createClient();
        const context = await requireUserAccessContext(supabase).catch(() => null);
        if (!context) return err('No autenticado', 401);

        const target = await getClubManagementTarget(supabase, clubId);
        if (!target) return err('Club no encontrado', 404);
        if (!canManageClubContext(context, target, MANAGEMENT_MEMBERSHIP_ROLES)) {
            return err('Sin permisos para cargar partidos en este club', 403);
        }

        // El lado propio tiene que ser de LA FAMILIA de este club. Sin esto, con
        // permiso sobre un club se podrían crear partidos de cualquier otro.
        const familyIds = new Set(target.familyClubIds ?? [target.clubId]);
        if (!familyIds.has(ourClubId)) {
            return err('Esa categoría no pertenece a este club', 403);
        }

        const admin = createAdminClient();

        const { data: rival } = await admin
            .from('clubs')
            .select('id')
            .eq('id', rivalClubId)
            .maybeSingle();

        if (!rival) return err('No encontramos ese rival', 404);

        // La hora viene en hora local del sitio y se guarda en UTC, como todo el
        // resto de la base. Convertirla a mano restando 3 se rompe con el horario
        // de verano; `combineLocalDateTimeToUtcIso` lo resuelve con la timezone.
        const dateTime = combineLocalDateTimeToUtcIso(date, time, APP_TIMEZONE);
        if (!dateTime) return err('No pudimos interpretar esa fecha y hora', 400);

        // Una competencia solo vale si es DE ESTE CLUB. Sin este chequeo, un
        // dirigente podría colgar partidos de un torneo oficial ajeno.
        let tournamentId: string | null = null;
        if (competitionId) {
            const { data: competition } = await admin
                .from('tournaments')
                .select('id, created_by_club_id, review_status')
                .eq('id', competitionId)
                .maybeSingle();

            const ownedByClub = competition
                && competition.created_by_club_id === target.clubId
                && competition.review_status === TOURNAMENT_REVIEW_STATUS.pendingLink;

            if (!ownedByClub) {
                return err('Esa competencia no es de este club', 403);
            }

            tournamentId = competition.id;
        }

        const payload: Record<string, unknown> = {
            tournament_id: tournamentId,
            home_club_id: isHome ? ourClubId : rivalClubId,
            away_club_id: isHome ? rivalClubId : ourClubId,
            date_time: dateTime,
            venue: venue || null,
            status: 'scheduled',
            sport_id: target.sportId,
            created_by_club_id: target.clubId,
            created_by_user_id: context.userId,
            is_visible: true,
            review_status: 'approved',
        };

        const insert = await admin.from('matches').insert(payload).select('id').single();

        // Acá NO se degrada. `created_by_club_id` es lo único que le permite a la
        // portada distinguir un partido de club de uno de torneo: sin esa columna
        // el partido nace sin marca y se cuela en el feed general, que es
        // justamente lo que este panel promete que no pasa. Antes que crear un
        // partido que no se puede filtrar, no se crea.
        if (insert.error && (insert.error as { code?: string }).code === '42703') {
            console.error('[clubs/panel-matches] falta una columna de trazabilidad en matches', { clubId, error: insert.error });
            return err(
                'La base todavía no tiene las columnas para cargar partidos de club. Falta correr la migración 20260430143000.',
                409,
            );
        }

        if (insert.error) {
            console.error('[clubs/panel-matches] alta fallida', insert.error);
            return err(insert.error.message || 'No se pudo cargar el partido', 500);
        }

        return NextResponse.json({ ok: true, matchId: insert.data?.id ?? null }, { status: 201 });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'No se pudo cargar el partido';
        console.error('[clubs/panel-matches] POST', error);
        return err(message, 500);
    }
}
