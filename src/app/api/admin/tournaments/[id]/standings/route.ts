import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { StandingsEngine } from '@/lib/services/standingsEngine';
import { CIRCUIT_GLOBAL_SENTINEL } from '@/components/admin/entities/tournament/standings/types';
import {
    FINAL_STANDINGS_STATUSES,
    filterMatchesForGroupScope,
    isFinalStandingsStatus,
} from '@/lib/standings/matchScope';
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
        (s: any) =>
            String(s?.id || '') === phaseId ||
            Number(s?.order) === phaseOrder + 1 ||
            Number(s?.order) === phaseOrder,
    );
    const fromRuleset = parseCircuitPlacementPoints(stageMatch?.circuit_points);
    if (fromRuleset.length > 0) return fromRuleset;

    return getDefaultCircuitPlacementPoints();
}

// --- Circuit global aggregation ---

async function handleCircuitGlobalStandings(tournamentId: string, supabase: any, seasonId?: string | null) {
    // Fetch tournament ruleset
    const { data: tournament, error: tErr } = await supabase
        .from('tournaments')
        .select('id, ruleset')
        .eq('id', tournamentId)
        .single();
    if (tErr) return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });

    const ruleset = (tournament.ruleset ?? {}) as Record<string, unknown>;

    // Fetch all phases ordered
    let phasesQuery = supabase
        .from('tournament_phases')
        .select('id, name, order_index, settings')
        .eq('tournament_id', tournamentId)
        .order('order_index', { ascending: true });

    if (seasonId) {
        phasesQuery = phasesQuery.eq('season_id', seasonId);
    }

    const { data: phases, error: pErr } = await phasesQuery;
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

        let rowsQuery = supabase
            .from('tournament_standings')
            .select('club_id, position, points, stats')
            .eq('tournament_id', tournamentId)
            .eq('phase_id', phase.id)
            .order('position', { ascending: true });

        if (seasonId) {
            rowsQuery = rowsQuery.eq('season_id', seasonId);
        }

        const { data: rows } = await rowsQuery;

        if (!rows || rows.length === 0) continue;

        // Count final matches for this phase as a proxy for "played"
        let phaseMatchQuery = supabase
            .from('matches')
            .select('id', { count: 'exact', head: true })
            .eq('tournament_id', tournamentId)
            .eq('phase_id', phase.id)
            .in('status', [...FINAL_STANDINGS_STATUSES]);

        if (seasonId) {
            phaseMatchQuery = phaseMatchQuery.eq('season_id', seasonId);
        }

        const { count: phaseMatchCount } = await phaseMatchQuery;
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
        let seasonId =
            searchParams.get('seasonId') ||
            searchParams.get('season_id') ||
            searchParams.get('season');

        if (!phaseId) {
            return NextResponse.json({ error: 'phaseId is required' }, { status: 400 });
        }

        const supabase = await createClient();
        if (!seasonId) {
            const { data: tournamentSeason } = await supabase
                .from('tournaments')
                .select('current_season_id')
                .eq('id', tournamentId)
                .maybeSingle();
            seasonId = tournamentSeason?.current_season_id ?? null;
        }

        if (phaseId === CIRCUIT_GLOBAL_SENTINEL) {
            return handleCircuitGlobalStandings(tournamentId, supabase, seasonId);
        }

        // 1. Fetch phase + tournament rules
        const { data: phase, error: phaseError } = await supabase
            .from('tournament_phases')
            .select('id, phase_type, settings, tournament_id')
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
        const supportsGroups = phase.phase_type === 'group_stage';
        const scopedGroupId = supportsGroups ? groupId : null;

        if (resolvedRules.calculation_mode === 'fully_manual') {
            let standingsQuery = supabase
                .from('tournament_standings')
                .select('club_id, position, played, won, drawn, lost, points, scored, conceded, bonus_points, form, stats, last_updated')
                .eq('tournament_id', tournamentId)
                .eq('phase_id', phaseId)
                .order('position', { ascending: true });

            if (scopedGroupId) {
                standingsQuery = standingsQuery.eq('group_id', scopedGroupId);
            } else {
                standingsQuery = (standingsQuery as typeof standingsQuery & { is: (column: string, value: null) => typeof standingsQuery }).is('group_id', null);
            }

            if (seasonId) {
                standingsQuery = standingsQuery.eq('season_id', seasonId);
            }

            let participantsQuery = scopedGroupId
                ? supabase
                    .from('tournament_participants')
                    .select('id, club_id, name, group_id, status, clubs(name, logo_url)')
                    .eq('tournament_id', tournamentId)
                    .eq('group_id', scopedGroupId)
                    .not('status', 'in', '("withdrawn","disqualified")')
                : supabase
                    .from('tournament_participants')
                    .select('id, club_id, name, group_id, status, clubs(name, logo_url)')
                    .eq('tournament_id', tournamentId)
                    .not('status', 'in', '("withdrawn","disqualified")');

            let manualMatchesQuery = scopedGroupId
                ? supabase
                    .from('matches')
                    .select('id, status, group_id, home_club_id, away_club_id')
                    .eq('tournament_id', tournamentId)
                    .eq('phase_id', phaseId)
                : supabase
                    .from('matches')
                    .select('id, status, group_id, home_club_id, away_club_id')
                    .eq('tournament_id', tournamentId)
                    .eq('phase_id', phaseId);

            if (seasonId) {
                participantsQuery = participantsQuery.eq('season_id', seasonId);
                manualMatchesQuery = manualMatchesQuery.eq('season_id', seasonId);
            }

            const [{ data: persistedRows, error: persistedError }, { data: participants, error: pError }, { data: matches, error: mError }] = await Promise.all([
                standingsQuery,
                participantsQuery,
                manualMatchesQuery,
            ]);

            if (persistedError) {
                throw persistedError;
            }
            if (pError) throw pError;
            if (mError) throw mError;

            const participantRows = (participants || []) as any[];
            const persistedStandingRows = (persistedRows || []) as any[];
            const matchRows = (matches || []) as any[];

            const participantMap = new Map<string, any>(
                participantRows.map((participant) => [
                    participant.club_id || participant.id,
                    participant,
                ])
            );

            const table = persistedStandingRows.map((row) => {
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

            const scopedMatches = filterMatchesForGroupScope(matchRows, participantRows, scopedGroupId);
            const metrics = {
                counted_matches: scopedMatches.filter((match) => isFinalStandingsStatus(match.status)).length,
                pending_results: scopedMatches.filter((match) => ['scheduled', 'live', 'suspended', 'delayed', 'postponed'].includes(String(match.status ?? ''))).length,
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

        if (seasonId) pQuery = pQuery.eq('season_id', seasonId);
        if (scopedGroupId) pQuery = pQuery.eq('group_id', scopedGroupId);
        const { data: participants, error: pError } = await pQuery;
        if (pError) throw pError;

        // 3. Fetch final matches for this phase
        const fetchMatchesWithEvents = async (): Promise<{ data: StandingMatchRow[] | null; error: QueryError }> => {
            let query = supabase
                .from('matches')
                .select('id, home_club_id, away_club_id, score, events, status, date_time, phase_id, group_id, home_base_points, away_base_points, home_bonus_points, away_bonus_points, points_autocalculated, points_override_reason')
                .eq('tournament_id', tournamentId)
                .eq('phase_id', phaseId)
                .in('status', [...FINAL_STANDINGS_STATUSES]);
            if (seasonId) query = query.eq('season_id', seasonId);
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
                .in('status', [...FINAL_STANDINGS_STATUSES]);
            if (seasonId) query = query.eq('season_id', seasonId);
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

        const scopedMatches = filterMatchesForGroupScope(matches || [], participants || [], scopedGroupId);

        // 4. Compute standings
        const table = StandingsEngine.generateTable(
            participants || [],
            scopedMatches,
            resolvedRules,
            tableType,
        );

        // 5. Metrics
        const metrics = {
            counted_matches: scopedMatches.length,
            pending_results: 0,
            manual_overrides:
                scopedMatches.filter((match) => match.points_autocalculated === false).length +
                (resolvedRules.adjustments?.length || 0),
        };

        // Count non-final matches for this phase
        let pendingQuery = supabase
            .from('matches')
            .select('id, group_id, home_club_id, away_club_id, status')
            .eq('tournament_id', tournamentId)
            .eq('phase_id', phaseId)
            .in('status', ['scheduled', 'live', 'suspended', 'delayed', 'postponed']);
        if (seasonId) pendingQuery = pendingQuery.eq('season_id', seasonId);
        const { data: pendingMatches, error: pendingError } = await pendingQuery;
        if (pendingError) throw pendingError;
        metrics.pending_results = filterMatchesForGroupScope(
            pendingMatches || [],
            participants || [],
            scopedGroupId,
        ).length;

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

            if (seasonId) {
                cQuery = cQuery.eq('season_id', seasonId);
            }

            if (scopedGroupId) {
                cQuery = cQuery.eq('group_id', scopedGroupId);
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
