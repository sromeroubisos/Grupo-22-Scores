import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { StandingsEngine } from '@/lib/services/standingsEngine';
import { CIRCUIT_GLOBAL_SENTINEL } from '@/components/admin/entities/tournament/standings/types';
import { queryMatchesWithOptionalEvents } from '@/lib/utils/queryMatchesWithOptionalEvents';

// --- Circuit placement points helpers ---

const DEFAULT_CIRCUIT_POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];

type QueryError = {
    code?: string | null;
    message?: string | null;
    details?: string | null;
} | null;

type StandingMatchRow = {
    id: string | null;
    home_club_id: string | null;
    away_club_id: string | null;
    score: Record<string, unknown> | null;
    events: unknown[] | null;
    status: string | null;
    date_time: string | null;
    phase_id: string | null;
    group_id: string | null;
    home_base_points: number | null;
    away_base_points: number | null;
    home_bonus_points: number | null;
    away_bonus_points: number | null;
    points_autocalculated: boolean | null;
    points_override_reason: string | null;
};

type StandingMatchRowWithoutEvents = Omit<StandingMatchRow, 'events'>;

function getDefaultCircuitPlacementPoints(): Array<{ position: number; points: number }> {
    return DEFAULT_CIRCUIT_POINTS.map((pts, i) => ({ position: i + 1, points: pts }));
}

function parseCircuitPlacementPoints(input: unknown): Array<{ position: number; points: number }> {
    if (!input) return [];
    if (Array.isArray(input)) {
        return input
            .map((item, i) => {
                if (typeof item === 'number') return { position: i + 1, points: item };
                if (item && typeof item === 'object') {
                    const pt = item as Record<string, unknown>;
                    const pos = Number(pt.position ?? pt.pos ?? i + 1);
                    const pts = Number(pt.points ?? pt.pts ?? 0);
                    return { position: pos, points: pts };
                }
                return null;
            })
            .filter(Boolean) as Array<{ position: number; points: number }>;
    }
    return [];
}

function resolveCircuitPlacementPoints(
    phaseSettings: Record<string, unknown> | null,
    tournamentRuleset: Record<string, unknown> | null,
    phaseId: string,
    phaseOrder: number,
): Array<{ position: number; points: number }> {
    const fromPhase = parseCircuitPlacementPoints(
        (phaseSettings as any)?.circuit?.pointsByPlacement ?? (phaseSettings as any)?.placementPoints,
    );
    if (fromPhase.length > 0) return fromPhase;

    const stages = Array.isArray((tournamentRuleset as any)?.circuit?.stages)
        ? (tournamentRuleset as any).circuit.stages
        : [];
    const stageMatch = stages.find(
        (s: any, index: number) =>
            String(s?.id || '') === phaseId ||
            Number(s?.order) === phaseOrder + 1 ||
            Number(s?.order) === phaseOrder,
    );
    const fromRuleset = parseCircuitPlacementPoints(stageMatch?.circuit_points);
    if (fromRuleset.length > 0) return fromRuleset;

    return getDefaultCircuitPlacementPoints();
}

// --- Circuit global aggregation ---

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleCircuitGlobalStandings(tournamentId: string, supabase: any) {
    // Fetch tournament ruleset
    const { data: tournament, error: tErr } = await supabase
        .from('tournaments')
        .select('id, ruleset')
        .eq('id', tournamentId)
        .single();
    if (tErr) return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });

    const ruleset = (tournament.ruleset ?? {}) as Record<string, unknown>;

    // Fetch all phases ordered
    const { data: phases, error: pErr } = await supabase
        .from('tournament_phases')
        .select('id, name, order_index, settings')
        .eq('tournament_id', tournamentId)
        .order('order_index', { ascending: true });
    if (pErr) return NextResponse.json({ error: 'Error fetching phases' }, { status: 500 });

    if (!phases || phases.length === 0) {
        return NextResponse.json({ ok: true, table: [], metrics: { counted_matches: 0, pending_results: 0, manual_overrides: 0 }, rules: null, last_calculated_at: null });
    }

    // Aggregate placement points across phases
    const rowsByClub = new Map<string, {
        teamId: string;
        team: { id: string; name: string; logo: string | null };
        total_points: number;
        stages_played: number;
        stage_titles: number;
        podiums: number;
        best_finish: number | null;
    }>();

    let totalFinalMatches = 0;

    for (const phase of phases) {
        const phaseSettings = (phase.settings ?? {}) as Record<string, unknown>;
        const placementMap = new Map(
            resolveCircuitPlacementPoints(phaseSettings, ruleset, phase.id, phase.order_index ?? 0)
                .map(({ position, points }) => [position, points]),
        );

        const { data: rows } = await supabase
            .from('tournament_standings')
            .select('club_id, position, points, stats')
            .eq('tournament_id', tournamentId)
            .eq('phase_id', phase.id)
            .order('position', { ascending: true });

        if (!rows || rows.length === 0) continue;

        // Count final matches for this phase as a proxy for "played"
        const { count: phaseMatchCount } = await supabase
            .from('matches')
            .select('id', { count: 'exact', head: true })
            .eq('tournament_id', tournamentId)
            .eq('phase_id', phase.id)
            .eq('status', 'final');
        totalFinalMatches += phaseMatchCount ?? 0;

        for (const row of rows) {
            const teamId = row.club_id;
            const position = Number(row.position ?? 0);
            const pts = position > 0 ? (placementMap.get(position) ?? 0) : 0;
            const stats = row.stats as Record<string, unknown> | null;
            const teamName = (stats?.team_name as string) || 'Equipo';
            const teamLogo = (stats?.team_logo as string) || null;

            const prev = rowsByClub.get(teamId);
            if (prev) {
                prev.total_points += pts;
                prev.stages_played += 1;
                if (position === 1) prev.stage_titles += 1;
                if (position <= 3) prev.podiums += 1;
                if (prev.best_finish === null || position < prev.best_finish) prev.best_finish = position;
            } else {
                rowsByClub.set(teamId, {
                    teamId,
                    team: { id: teamId, name: teamName, logo: teamLogo },
                    total_points: pts,
                    stages_played: 1,
                    stage_titles: position === 1 ? 1 : 0,
                    podiums: position <= 3 ? 1 : 0,
                    best_finish: position > 0 ? position : null,
                });
            }
        }
    }

    // Sort and assign positions
    const sorted = Array.from(rowsByClub.values()).sort((a, b) => {
        if (b.total_points !== a.total_points) return b.total_points - a.total_points;
        if (b.stage_titles !== a.stage_titles) return b.stage_titles - a.stage_titles;
        if (b.podiums !== a.podiums) return b.podiums - a.podiums;
        const aBest = a.best_finish ?? 9999;
        const bBest = b.best_finish ?? 9999;
        return aBest - bBest;
    });

    const table = sorted.map((row, index) => ({
        teamId: row.teamId,
        team: row.team,
        position: index + 1,
        played: row.stages_played,
        won: row.stage_titles,
        drawn: 0,
        lost: 0,
        points_for: 0,
        points_against: 0,
        difference: 0,
        bonus_offensive: 0,
        bonus_defensive: 0,
        adjustments: 0,
        total_points: row.total_points,
        form: [],
        status: null,
    }));

    return NextResponse.json({
        ok: true,
        table,
        metrics: { counted_matches: totalFinalMatches, pending_results: 0, manual_overrides: 0 },
        rules: null,
        last_calculated_at: null,
    });
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
        const tableType = searchParams.get('tableType') || 'general';

        if (!phaseId) {
            return NextResponse.json({ error: 'phaseId is required' }, { status: 400 });
        }

        if (phaseId === CIRCUIT_GLOBAL_SENTINEL) {
            const supabase = await createClient();
            return handleCircuitGlobalStandings(tournamentId, supabase);
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
        const fetchMatchesWithEvents = async (): Promise<{ data: StandingMatchRow[] | null; error: QueryError }> => {
            let query = supabase
                .from('matches')
                .select('id, home_club_id, away_club_id, score, events, status, date_time, phase_id, group_id, home_base_points, away_base_points, home_bonus_points, away_bonus_points, points_autocalculated, points_override_reason')
                .eq('tournament_id', tournamentId)
                .eq('phase_id', phaseId)
                .eq('status', 'final');

            if (groupId) query = query.eq('group_id', groupId);
            const { data, error } = await query;
            return {
                data: data as StandingMatchRow[] | null,
                error,
            };
        };

        const fetchMatchesWithoutEvents = async (): Promise<{ data: StandingMatchRowWithoutEvents[] | null; error: QueryError }> => {
            let query = supabase
                .from('matches')
                .select('id, home_club_id, away_club_id, score, status, date_time, phase_id, group_id, home_base_points, away_base_points, home_bonus_points, away_bonus_points, points_autocalculated, points_override_reason')
                .eq('tournament_id', tournamentId)
                .eq('phase_id', phaseId)
                .eq('status', 'final');

            if (groupId) query = query.eq('group_id', groupId);
            const { data, error } = await query;
            return {
                data: data as StandingMatchRowWithoutEvents[] | null,
                error,
            };
        };

        const { data: matches, error: mError } = await queryMatchesWithOptionalEvents(
            fetchMatchesWithEvents,
            fetchMatchesWithoutEvents,
        );
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
