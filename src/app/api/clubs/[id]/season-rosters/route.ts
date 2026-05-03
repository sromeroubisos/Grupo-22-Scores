import { NextRequest, NextResponse } from 'next/server';
import { getReadClient } from '@/lib/supabase/read';

export const dynamic = 'force-dynamic';

function jsonError(error: unknown) {
    return NextResponse.json(
        { ok: false, error: error instanceof Error ? error.message : 'Internal server error' },
        { status: 500 },
    );
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const { id: clubId } = await params;
        const includeMemberships = request.nextUrl.searchParams.get('includeMemberships') === 'true';
        const db = await getReadClient();

        const { data: rosters, error: rostersError } = await db
            .from('season_rosters')
            .select('id, season_id, tournament_id, team_season_entry_id, club_id, team_id, name, roster_type, status, created_at, updated_at')
            .eq('club_id', clubId)
            .order('created_at', { ascending: false });
        if (rostersError) throw new Error(rostersError.message || 'No se pudieron cargar los planteles por temporada.');

        const rosterRows = rosters ?? [];
        const seasonIds = Array.from(new Set(rosterRows.map((roster: any) => roster.season_id).filter(Boolean)));
        const tournamentIds = Array.from(new Set(rosterRows.map((roster: any) => roster.tournament_id).filter(Boolean)));
        const rosterIds = rosterRows.map((roster: any) => roster.id).filter(Boolean);

        const [{ data: seasons }, { data: tournaments }, membershipsResult] = await Promise.all([
            seasonIds.length > 0
                ? db
                    .from('tournament_seasons')
                    .select('id, tournament_id, season_code, name, display_name, status, is_active, start_date, end_date')
                    .in('id', seasonIds)
                : Promise.resolve({ data: [] }),
            tournamentIds.length > 0
                ? db
                    .from('tournaments')
                    .select('id, name, display_name, slug')
                    .in('id', tournamentIds)
                : Promise.resolve({ data: [] }),
            includeMemberships && rosterIds.length > 0
                ? db
                    .from('roster_memberships')
                    .select('id, roster_id, season_id, player_id, status, jersey_number, position, role, joined_at, left_at, player:people(id, first_name, last_name, full_name, name)')
                    .in('roster_id', rosterIds)
                    .order('created_at', { ascending: true })
                : Promise.resolve({ data: [] }),
        ]);

        if ('error' in membershipsResult && membershipsResult.error) {
            throw new Error(membershipsResult.error.message || 'No se pudieron cargar los jugadores por temporada.');
        }

        const seasonsById = new Map((seasons ?? []).map((season: any) => [season.id, season]));
        const tournamentsById = new Map((tournaments ?? []).map((tournament: any) => [tournament.id, tournament]));
        const membershipsByRoster = new Map<string, any[]>();
        for (const membership of membershipsResult.data ?? []) {
            membershipsByRoster.set(membership.roster_id, [
                ...(membershipsByRoster.get(membership.roster_id) ?? []),
                membership,
            ]);
        }

        const enriched = rosterRows.map((roster: any) => ({
            ...roster,
            season: seasonsById.get(roster.season_id) ?? null,
            tournament: tournamentsById.get(roster.tournament_id) ?? null,
            memberships: includeMemberships ? membershipsByRoster.get(roster.id) ?? [] : undefined,
        }));

        return NextResponse.json({ ok: true, rosters: enriched });
    } catch (error) {
        return jsonError(error);
    }
}
