import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getServiceWriter } from '@/lib/supabase/serviceWriter';
import { requireTournamentAdminContext } from '@/lib/auth/permissions';
import {
    isScopeAllowedClub,
    isScopeAllowedTournament,
    resolveTournamentAdminScope,
    type TournamentAdminScope,
} from '@/lib/auth/tournamentAdminScope';
import { isMissingTableError } from '@/lib/utils/supabaseSchema';
import {
    addPlayerToSeasonRoster,
    ensureRostersForSeasonEntries,
    listClubRosters,
    listSeasonRosters,
    removeRosterMembership,
    resolveSeasonIdForTournament,
    updateRosterMembership,
} from '@/lib/services/tournamentSeasonService';

export const dynamic = 'force-dynamic';

function err(message: string, status = 400, details?: unknown) {
    return NextResponse.json({ error: message, details: details ?? null }, { status });
}

/**
 * Loads a roster's tournament+club so membership/roster actions are
 * scope-checked. Returns a NextResponse to short-circuit on denial, or null
 * when access is allowed.
 */
async function assertRosterScope(
    writer: ReturnType<typeof getServiceWriter>,
    scope: TournamentAdminScope,
    rosterId: string,
): Promise<NextResponse | null> {
    const { data: roster } = await writer
        .from('season_rosters')
        .select('id, tournament_id, club_id')
        .eq('id', rosterId)
        .maybeSingle();
    if (!roster) return err('Plantel no encontrado', 404);
    if (!isScopeAllowedTournament(scope, String(roster.tournament_id))) {
        return err('No tenés acceso a este torneo', 403);
    }
    if (roster.club_id && !isScopeAllowedClub(scope, String(roster.club_id))) {
        return err('No tenés acceso a este club', 403);
    }
    return null;
}

async function assertMembershipScope(
    writer: ReturnType<typeof getServiceWriter>,
    scope: TournamentAdminScope,
    membershipId: string,
): Promise<NextResponse | null> {
    const { data: membership } = await writer
        .from('roster_memberships')
        .select('id, tournament_id, club_id')
        .eq('id', membershipId)
        .maybeSingle();
    if (!membership) return err('Inscripción no encontrada', 404);
    if (!isScopeAllowedTournament(scope, String(membership.tournament_id))) {
        return err('No tenés acceso a este torneo', 403);
    }
    if (membership.club_id && !isScopeAllowedClub(scope, String(membership.club_id))) {
        return err('No tenés acceso a este club', 403);
    }
    return null;
}

export async function GET(request: NextRequest) {
    const supabase = await createClient();

    let context;
    try {
        context = await requireTournamentAdminContext(supabase);
    } catch {
        return err('Unauthorized', 401);
    }

    const tournamentId = request.nextUrl.searchParams.get('tournamentId');
    const clubId = request.nextUrl.searchParams.get('clubId');

    const scope = await resolveTournamentAdminScope(supabase, context);

    // Club-centric lookup: every roster the club has across the tournaments
    // this admin can access. Powers the unified Clubes → plantel flow.
    if (!tournamentId && clubId) {
        if (!isScopeAllowedClub(scope, clubId)) {
            return err('No tenés acceso a este club', 403);
        }
        const writer = getServiceWriter(supabase, 'admin/torneo/rosters');
        try {
            const allRosters = await listClubRosters(writer, clubId, true);
            const rosters = (allRosters ?? []).filter((roster: { tournament_id?: string | null }) =>
                roster.tournament_id
                    ? isScopeAllowedTournament(scope, String(roster.tournament_id))
                    : false,
            );
            return NextResponse.json({ data: { clubId, rosters } });
        } catch (error) {
            if (isMissingTableError(error as never, 'season_rosters')) {
                return err('Los planteles por torneo no están disponibles (migración pendiente).', 503);
            }
            return err('No se pudieron cargar los planteles del club', 500, (error as Error)?.message);
        }
    }

    if (!tournamentId) return err('Falta tournamentId', 400);

    if (!isScopeAllowedTournament(scope, tournamentId)) {
        return err('No tenés acceso a este torneo', 403);
    }

    const writer = getServiceWriter(supabase, 'admin/torneo/rosters');
    try {
        const seasonId = await resolveSeasonIdForTournament(writer, tournamentId);
        if (!seasonId) {
            return NextResponse.json({ data: { seasonId: null, rosters: [] } });
        }
        const rosters = await listSeasonRosters(writer, seasonId, true);
        return NextResponse.json({ data: { seasonId, rosters } });
    } catch (error) {
        if (isMissingTableError(error as never, 'season_rosters')) {
            return err('Los planteles por torneo no están disponibles (migración pendiente).', 503);
        }
        return err('No se pudieron cargar los planteles', 500, (error as Error)?.message);
    }
}

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
        return err('Payload JSON inválido', 400);
    }

    const action = String(body.action ?? '');
    const scope = await resolveTournamentAdminScope(supabase, context);
    const writer = getServiceWriter(supabase, 'admin/torneo/rosters');

    try {
        if (action === 'ensureFromEntries') {
            const tournamentId = String(body.tournamentId ?? '');
            if (!isScopeAllowedTournament(scope, tournamentId)) {
                return err('No tenés acceso a este torneo', 403);
            }
            const seasonId = await resolveSeasonIdForTournament(writer, tournamentId);
            if (!seasonId) return err('El torneo no tiene una temporada configurada.', 409);
            const rosters = await ensureRostersForSeasonEntries(writer, seasonId);
            return NextResponse.json({ data: { seasonId, rosters } });
        }

        if (action === 'addPlayer') {
            const rosterId = String(body.rosterId ?? '');
            if (!rosterId) return err('rosterId es requerido', 400);
            const denied = await assertRosterScope(writer, scope, rosterId);
            if (denied) return denied;

            const result = await addPlayerToSeasonRoster(writer, rosterId, {
                playerId: (body.playerId as string) ?? null,
                firstName: (body.firstName as string) ?? null,
                lastName: (body.lastName as string) ?? null,
                birthDate: (body.birthDate as string) ?? null,
                joinedAt: (body.joinedAt as string) ?? null,
                status: (body.status as string) ?? 'active',
                jerseyNumber:
                    typeof body.jerseyNumber === 'number' ? body.jerseyNumber : null,
                position: (body.position as string) ?? null,
                role: (body.role as string) ?? null,
                notes: (body.notes as string) ?? null,
            });
            return NextResponse.json({ data: result });
        }

        if (action === 'updateMembership') {
            const membershipId = String(body.membershipId ?? '');
            if (!membershipId) return err('membershipId es requerido', 400);
            const denied = await assertMembershipScope(writer, scope, membershipId);
            if (denied) return denied;

            const result = await updateRosterMembership(writer, membershipId, {
                jerseyNumber:
                    body.jerseyNumber === undefined
                        ? undefined
                        : typeof body.jerseyNumber === 'number'
                            ? body.jerseyNumber
                            : null,
                position: body.position === undefined ? undefined : (body.position as string),
                role: body.role === undefined ? undefined : (body.role as string),
                status: body.status === undefined ? undefined : (body.status as string),
                notes: body.notes === undefined ? undefined : (body.notes as string),
            });
            return NextResponse.json({ data: result });
        }

        if (action === 'removeMembership') {
            const membershipId = String(body.membershipId ?? '');
            if (!membershipId) return err('membershipId es requerido', 400);
            const denied = await assertMembershipScope(writer, scope, membershipId);
            if (denied) return denied;

            const result = await removeRosterMembership(writer, membershipId);
            return NextResponse.json({ data: result });
        }

        return err('Acción inválida', 400);
    } catch (error) {
        if (isMissingTableError(error as never, 'season_rosters')) {
            return err('Los planteles por torneo no están disponibles (migración pendiente).', 503);
        }
        return err((error as Error)?.message || 'No se pudo procesar la solicitud', 500);
    }
}
