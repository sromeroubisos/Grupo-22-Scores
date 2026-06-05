import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getServiceWriter } from '@/lib/supabase/serviceWriter';
import { requireTournamentAdminContext } from '@/lib/auth/permissions';
import {
    isScopeAllowedTournament,
    resolveTournamentAdminScope,
} from '@/lib/auth/tournamentAdminScope';
import { FixtureService } from '@/lib/services/fixtureService';
import { recalculatePhaseStandingsScopes } from '@/lib/server/recalculateStandings';
import type { MatchStatus } from '@/lib/types/fixture';

const ALLOWED_STATUSES = new Set<MatchStatus>([
    'scheduled',
    'live',
    'final',
    'postponed',
    'suspended',
    'cancelled',
]);

export const dynamic = 'force-dynamic';

function err(message: string, status = 400, details?: unknown) {
    return NextResponse.json({ error: message, details: details ?? null }, { status });
}

const MATCH_LIST_SELECT = `
  id,
  tournament_id,
  phase_id,
  round_id,
  date_time,
  venue,
  status,
  score,
  home_club_id,
  away_club_id,
  homeClub:home_club_id (id, name, short_name, logo_url),
  awayClub:away_club_id (id, name, short_name, logo_url),
  tournament:tournament_id (id, name, display_name)
`;

export async function GET(request: NextRequest) {
    const supabase = await createClient();

    let context;
    try {
        context = await requireTournamentAdminContext(supabase);
    } catch {
        return err('Unauthorized', 401);
    }

    const scope = await resolveTournamentAdminScope(supabase, context);

    const requestedTournamentId = request.nextUrl.searchParams.get('tournamentId');
    if (requestedTournamentId && !isScopeAllowedTournament(scope, requestedTournamentId)) {
        return err('No tenés acceso a este torneo', 403);
    }

    // Scope already enforced here. Service-role read so draft/hidden
    // tournaments' matches are not dropped by RLS for the owning gestor.
    const writer = getServiceWriter(supabase, 'admin/torneo/matches');
    let query = writer
        .from('matches')
        .select(MATCH_LIST_SELECT)
        .order('date_time', { ascending: false })
        .limit(500);

    if (requestedTournamentId) {
        query = query.eq('tournament_id', requestedTournamentId);
    } else if (!scope.isUnlimited) {
        const ids = Array.from(scope.tournamentIds);
        if (ids.length === 0) {
            return NextResponse.json({ data: [] });
        }
        query = query.in('tournament_id', ids);
    }

    const { data, error } = await query;
    if (error) {
        return err('No se pudieron cargar los partidos', 500, error.message);
    }

    return NextResponse.json({ data: data ?? [] });
}

/**
 * Create a match inside one of the gestor's own tournaments.
 *
 * Authorized with the SAME scope model as the rest of the tournament-admin
 * panel (requireTournamentAdminContext + resolveTournamentAdminScope), not
 * the per-tournament membership-role model of /api/tournaments/[id]/matches —
 * `gestor_torneos` is not a global admin role and would 403 there. The actual
 * insert reuses FixtureService.createMatch (service-role writer, phase/round
 * validation, standings recalc) so behaviour matches the entity editor.
 */
export async function POST(request: NextRequest) {
    const supabase = await createClient();

    let context;
    try {
        context = await requireTournamentAdminContext(supabase);
    } catch {
        return err('Unauthorized', 401);
    }

    let body: Record<string, unknown>;
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return err('Cuerpo de la solicitud inválido', 400);
    }

    const tournamentId = String(body.tournamentId ?? '').trim();
    if (!tournamentId) return err('tournamentId es requerido', 400);

    const scope = await resolveTournamentAdminScope(supabase, context);
    if (!isScopeAllowedTournament(scope, tournamentId)) {
        return err('No tenés acceso a este torneo', 403);
    }

    const phaseId = String(body.phaseId ?? '').trim();
    const homeClubId = String(body.homeClubId ?? '').trim();
    const awayClubId = String(body.awayClubId ?? '').trim();
    const dateTime = String(body.dateTime ?? '').trim();

    if (!phaseId) return err('Debes seleccionar una fase.', 400);
    if (!homeClubId || !awayClubId) return err('Debes seleccionar ambos equipos.', 400);
    if (homeClubId === awayClubId) {
        return err('El equipo local y el visitante no pueden ser el mismo.', 400);
    }
    if (!dateTime) return err('Debes seleccionar una fecha y hora.', 400);

    const roundIdRaw = body.roundId == null ? '' : String(body.roundId).trim();
    const roundId = roundIdRaw ? roundIdRaw : null;
    const venue = typeof body.venue === 'string' ? body.venue.trim() : '';
    const statusRaw = String(body.status ?? 'scheduled').trim() as MatchStatus;
    const status: MatchStatus = ALLOWED_STATUSES.has(statusRaw) ? statusRaw : 'scheduled';

    let match;
    try {
        match = await FixtureService.createMatch({
            tournamentId,
            phaseId,
            roundId,
            homeClubId,
            awayClubId,
            dateTime,
            venue,
            status,
        });
    } catch (e) {
        // createMatch throws user-facing Spanish messages for validation
        // failures (same teams, playoff needs round, bad date, …).
        return err(e instanceof Error ? e.message : 'No se pudo crear el partido.', 400);
    }

    if (!match) {
        return err('No se pudo crear el partido.', 500);
    }

    if (match.tournamentId && match.phaseId) {
        recalculatePhaseStandingsScopes(match.tournamentId, match.phaseId, 'general').catch(
            (e) =>
                console.error(
                    '[POST /api/admin/torneo/matches] Auto-recalculate standings failed:',
                    e,
                ),
        );
    }

    return NextResponse.json({ data: match }, { status: 201 });
}
