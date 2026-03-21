import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { StandingsEngine } from '@/lib/services/standingsEngine';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: tournamentId } = await params;
        const searchParams = request.nextUrl.searchParams;
        const phaseId = searchParams.get('phaseId');
        const groupId = searchParams.get('groupId');
        const tableType = searchParams.get('tableType') || 'general';

        if (!phaseId) {
            return NextResponse.json({ error: 'phaseId is required' }, { status: 400 });
        }

        const supabase = await createClient();

        // 1. Fetch phase + tournament rules
        const { data: phase, error: phaseError } = await supabase
            .from('tournament_phases')
            .select('id, settings, tournament_id')
            .eq('id', phaseId)
            .eq('tournament_id', tournamentId)
            .single();

        if (phaseError) {
            return NextResponse.json({ error: 'Phase not found' }, { status: 404 });
        }

        const { data: tournament, error: tournamentError } = await supabase
            .from('tournaments')
            .select('id, name, ruleset, status')
            .eq('id', tournamentId)
            .single();

        if (tournamentError) {
            return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
        }

        const resolvedRules = StandingsEngine.resolveRules(phase.settings, tournament?.ruleset);

        if (resolvedRules.calculation_mode === 'fully_manual') {
            let standingsQuery = supabase
                .from('tournament_standings')
                .select('club_id, position, played, won, drawn, lost, points, scored, conceded, bonus_points, form, stats, last_updated')
                .eq('tournament_id', tournamentId)
                .eq('phase_id', phaseId)
                .order('position', { ascending: true });

            if (groupId) {
                standingsQuery = standingsQuery.eq('group_id', groupId);
            } else {
                standingsQuery = (standingsQuery as typeof standingsQuery & { is: (column: string, value: null) => typeof standingsQuery }).is('group_id', null);
            }

            const [{ data: persistedRows, error: persistedError }, { data: participants, error: pError }, { data: matches, error: mError }] = await Promise.all([
                standingsQuery,
                (groupId
                    ? supabase
                        .from('tournament_participants')
                        .select('id, club_id, name, group_id, status, clubs(name, logo_url)')
                        .eq('tournament_id', tournamentId)
                        .eq('group_id', groupId)
                        .not('status', 'in', '("withdrawn","disqualified")')
                    : supabase
                        .from('tournament_participants')
                        .select('id, club_id, name, group_id, status, clubs(name, logo_url)')
                        .eq('tournament_id', tournamentId)
                        .not('status', 'in', '("withdrawn","disqualified")')),
                (groupId
                    ? supabase
                        .from('matches')
                        .select('id, status')
                        .eq('tournament_id', tournamentId)
                        .eq('phase_id', phaseId)
                        .eq('group_id', groupId)
                    : supabase
                        .from('matches')
                        .select('id, status')
                        .eq('tournament_id', tournamentId)
                        .eq('phase_id', phaseId)),
            ]);

            if (persistedError) {
                throw persistedError;
            }
            if (pError) throw pError;
            if (mError) throw mError;

            const participantMap = new Map(
                (participants || []).map((participant) => [
                    participant.club_id || participant.id,
                    participant,
                ])
            );

            const table = (persistedRows || []).map((row) => {
                const participant = participantMap.get(row.club_id);
                const participantClub = Array.isArray(participant?.clubs) ? participant.clubs[0] : participant?.clubs;
                return {
                    participantId: participant?.id || row.club_id,
                    teamId: row.club_id,
                    team: {
                        id: row.club_id,
                        name: row.stats?.team_name || participantClub?.name || participant?.name || 'Equipo',
                        logo: row.stats?.team_logo || participantClub?.logo_url || null,
                    },
                    position: row.position,
                    played: row.played,
                    won: row.won,
                    drawn: row.drawn,
                    lost: row.lost,
                    points_for: row.scored,
                    points_against: row.conceded,
                    difference: row.stats?.difference ?? (row.scored - row.conceded),
                    base_points: row.points - row.bonus_points,
                    bonus_offensive: row.stats?.try_bonus ?? row.stats?.bonus_offensive ?? 0,
                    bonus_defensive: row.stats?.losing_bonus ?? row.stats?.bonus_defensive ?? 0,
                    adjustments: row.stats?.adjustments ?? 0,
                    total_points: row.points,
                    form: row.form ? String(row.form).split('') : [],
                    status: row.stats?.status || null,
                };
            });

            const allMatches = matches || [];
            const metrics = {
                counted_matches: allMatches.filter((match) => match.status === 'final').length,
                pending_results: allMatches.filter((match) => ['scheduled', 'live', 'suspended', 'delayed', 'postponed'].includes(match.status)).length,
                manual_overrides: table.length,
            };

            return NextResponse.json({
                ok: true,
                table,
                metrics,
                rules: resolvedRules,
                last_calculated_at: persistedRows?.[0]?.last_updated ?? null,
            });
        }

        // 2. Fetch participants (exclude explicitly inactive)
        let pQuery = supabase
            .from('tournament_participants')
            .select('id, club_id, name, group_id, status, clubs(name, logo_url)')
            .eq('tournament_id', tournamentId)
            .not('status', 'in', '("withdrawn","disqualified")');

        if (groupId) pQuery = pQuery.eq('group_id', groupId);
        const { data: participants, error: pError } = await pQuery;
        if (pError) throw pError;

        // 3. Fetch final matches for this phase
        let mQuery = supabase
            .from('matches')
            .select('id, home_club_id, away_club_id, score, status, date_time, phase_id, group_id, home_base_points, away_base_points, home_bonus_points, away_bonus_points, points_autocalculated, points_override_reason')
            .eq('tournament_id', tournamentId)
            .eq('phase_id', phaseId)
            .eq('status', 'final');

        if (groupId) mQuery = mQuery.eq('group_id', groupId);
        const { data: matches, error: mError } = await mQuery;
        if (mError) throw mError;

        // 4. Compute standings
        const table = StandingsEngine.generateTable(
            participants || [],
            matches || [],
            resolvedRules,
            tableType,
        );

        // 5. Metrics
        const finalMatches = matches || [];
        const metrics = {
            counted_matches: finalMatches.length,
            pending_results: 0,
            manual_overrides:
                finalMatches.filter((match) => match.points_autocalculated === false).length +
                (resolvedRules.adjustments?.length || 0),
        };

        // Count non-final matches for this phase
        let pendingQuery = supabase
            .from('matches')
            .select('id', { count: 'exact', head: true })
            .eq('tournament_id', tournamentId)
            .eq('phase_id', phaseId)
            .in('status', ['scheduled', 'live', 'suspended', 'delayed', 'postponed']);

        if (groupId) pendingQuery = pendingQuery.eq('group_id', groupId);
        const { count: pendingCount } = await pendingQuery;
        metrics.pending_results = pendingCount || 0;

        // 6. last_calculated_at from persisted standings
        let lastCalculatedAt: string | null = null;
        {
            let cQuery = supabase
                .from('tournament_standings')
                .select('last_updated')
                .eq('tournament_id', tournamentId)
                .eq('phase_id', phaseId)
                .order('last_updated', { ascending: false })
                .limit(1);

            if (groupId) {
                cQuery = cQuery.eq('group_id', groupId);
            } else {
                cQuery = (cQuery as typeof cQuery & { is: (column: string, value: null) => typeof cQuery }).is('group_id', null);
            }
            const { data: cached } = await cQuery;
            lastCalculatedAt = cached?.[0]?.last_updated ?? null;
        }

        return NextResponse.json({
            ok: true,
            table,
            metrics,
            rules: resolvedRules,
            last_calculated_at: lastCalculatedAt,
        });
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Unknown error';
        console.error('Exception generating standings:', e);
        return NextResponse.json(
            { error: 'Internal server error', details: message },
            { status: 500 },
        );
    }
}
