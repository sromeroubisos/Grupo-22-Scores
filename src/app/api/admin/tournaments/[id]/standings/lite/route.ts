import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { StandingsEngine } from '@/lib/services/standingsEngine';
import { loadPhaseScopedParticipants } from '@/lib/server/phaseParticipants';

type ParticipantScopeRow = {
    id?: unknown;
    club_id?: unknown;
};

function normalizeScopeId(value: unknown): string {
    return String(value ?? '').trim();
}

function buildParticipantTeamIdSet(participants: ParticipantScopeRow[]): Set<string> {
    return new Set(
        participants
            .map((participant) => normalizeScopeId(participant.club_id ?? participant.id))
            .filter(Boolean),
    );
}

function filterStandingRowsForParticipantScope<TRow extends { club_id?: unknown }>(
    rows: TRow[],
    participants: ParticipantScopeRow[],
): TRow[] {
    const allowedTeamIds = buildParticipantTeamIdSet(participants);
    if (allowedTeamIds.size === 0) return [];

    return rows.filter((row) => allowedTeamIds.has(normalizeScopeId(row.club_id)));
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: tournamentId } = await params;
        const searchParams = request.nextUrl.searchParams;
        const phaseId = searchParams.get('phaseId');
        const groupId = searchParams.get('groupId');
        const requestedSeasonId =
            searchParams.get('seasonId') ||
            searchParams.get('season_id') ||
            searchParams.get('season');

        if (!phaseId) {
            return NextResponse.json({ error: 'phaseId is required' }, { status: 400 });
        }

        const supabase = await createClient();

        // 1. Fetch phase/tournament context for season and rules
        const [{ data: phase }, { data: tournament }] = await Promise.all([
            supabase
                .from('tournament_phases')
                .select('settings, season_id')
                .eq('id', phaseId)
                .eq('tournament_id', tournamentId)
                .single(),
            supabase
                .from('tournaments')
                .select('ruleset, current_season_id')
                .eq('id', tournamentId)
                .single(),
        ]);

        const scopedSeasonId = requestedSeasonId ?? phase?.season_id ?? tournament?.current_season_id ?? null;

        // 2. Fetch persisted standings and the authoritative phase roster
        let query = supabase
            .from('tournament_standings')
            .select(`
                club_id,
                position,
                played,
                won,
                drawn,
                lost,
                points,
                scored,
                conceded,
                bonus_points,
                form,
                stats,
                last_updated
            `)
            .eq('tournament_id', tournamentId)
            .eq('phase_id', phaseId)
            .order('position', { ascending: true });

        if (scopedSeasonId) {
            query = query.eq('season_id', scopedSeasonId);
        }

        if (groupId) {
            query = query.eq('group_id', groupId);
        } else {
            query = (query as any).is('group_id', null);
        }

        const [
            { data: standings, error: standingsError },
            participantScope,
        ] = await Promise.all([
            query,
            loadPhaseScopedParticipants(supabase, {
                tournamentId,
                phaseId,
                groupId,
                seasonId: scopedSeasonId,
            }),
        ]);

        if (standingsError) throw standingsError;

        const resolvedRules = StandingsEngine.resolveRules(phase?.settings, tournament?.ruleset);
        const scopedStandings = filterStandingRowsForParticipantScope(
            (standings || []) as any[],
            participantScope.participants || [],
        );

        // 3. Map to expected frontend structure
        const table = scopedStandings.map(row => ({
            teamId: row.club_id,
            team: {
                name: row.stats?.team_name || 'Desconocido',
                logo: row.stats?.team_logo || null
            },
            position: row.position,
            played: row.played,
            won: row.won,
            drawn: row.drawn,
            lost: row.lost,
            points_for: row.scored,
            points_against: row.conceded,
            difference: row.stats?.difference || 0,
            bonus_offensive: row.stats?.bonus_offensive || 0,
            bonus_defensive: row.stats?.bonus_defensive || 0,
            total_points: row.points,
            form: row.form ? row.form.split('') : [],
            adjustments: row.stats?.adjustments || [],
            status: row.stats?.status || null
        }));

        const lastCalculatedAt = scopedStandings?.[0]?.last_updated ?? null;

        return NextResponse.json({
            ok: true,
            table,
            rules: resolvedRules,
            last_calculated_at: lastCalculatedAt,
            is_lite: true
        });

    } catch (e: any) {
        console.error('Exception fetching standings-lite:', e);
        return NextResponse.json(
            { error: 'Internal server error', details: e.message },
            { status: 500 },
        );
    }
}
