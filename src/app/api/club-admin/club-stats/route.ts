import { NextRequest, NextResponse } from 'next/server';
import {
    ACCESS_VIEW_ROLE_SET,
    canManageClubContext,
    getClubManagementTarget,
    requireUserAccessContext,
} from '@/lib/auth/permissions';
import { createClient } from '@/lib/supabase/server';
import {
    buildCompleteMatchStats,
    type AggregatableMatchEvent,
    type CompleteMatchStats,
} from '@/lib/matchStatsFromEvents';
import { getDefaultMatchEventDefinitions, buildMatchEventDefinitionMap } from '@/lib/matchEventCatalog';

function err(message: string, status: number) {
    return NextResponse.json({ ok: false, error: message }, { status });
}

const FINAL_MATCH_STATUSES = ['final', 'finished', 'ft'] as const;

type MatchRow = {
    id: string;
    home_club_id: string | null;
    away_club_id: string | null;
    sport_id?: string | null;
    sport?: string | null;
    events?: unknown;
};

type MatchEventRow = {
    id: string;
    match_id: string;
    club_id: string | null;
    event_type: string;
    minute: number | null;
    details: Record<string, unknown> | null;
};

function normalizeText(value: unknown): string {
    if (typeof value !== 'string') return '';
    return value.replace(/\s+/g, ' ').trim();
}

function normalizeTeam(value: unknown): 'home' | 'away' | null {
    return value === 'home' || value === 'away' ? value : null;
}

function mapRelationalEventToAggregatable(
    row: MatchEventRow,
    match: MatchRow,
): AggregatableMatchEvent | null {
    const details = row.details ?? {};
    const teamFromDetails = normalizeTeam(details.team);
    const team =
        row.club_id && row.club_id === match.home_club_id
            ? 'home'
            : row.club_id && row.club_id === match.away_club_id
                ? 'away'
                : teamFromDetails;

    const type = normalizeText(row.event_type);
    if (!type) return null;
    if (type.startsWith('__') || type === 'clock_state' || type === 'match_start' || type === 'match_half' || type === 'match_end' || type === 'start_period' || type === 'end_period') {
        return null;
    }

    return {
        type,
        team,
        detail: normalizeText(details.detail),
    };
}

function mapJsonEventToAggregatable(row: unknown): AggregatableMatchEvent | null {
    const source = row && typeof row === 'object' ? (row as Record<string, unknown>) : {};
    const type = normalizeText(source.type);
    if (!type) return null;
    if (type.startsWith('__') || type === 'clock_state' || type === 'match_start' || type === 'match_half' || type === 'match_end' || type === 'start_period' || type === 'end_period') {
        return null;
    }
    return {
        type,
        team: normalizeTeam(source.team),
        detail: normalizeText(source.detail ?? source.description),
    };
}

function createEmptyAggregatedStats(): CompleteMatchStats {
    const zero = () => ({ home: 0, away: 0 });
    return {
        totalEvents: 0,
        clockEvents: 0,
        assignedEvents: zero(),
        points: zero(),
        scoringEvents: zero(),
        goalKickAttempts: zero(),
        goalKicksMade: zero(),
        goalKicksMissed: zero(),
        tries: zero(),
        penaltyTries: zero(),
        conversionAttempts: zero(),
        conversionsMade: zero(),
        conversionsMissed: zero(),
        penaltyGoalAttempts: zero(),
        penaltyGoalsMade: zero(),
        penaltyGoalsMissed: zero(),
        dropGoalAttempts: zero(),
        dropGoalsMade: zero(),
        dropGoalsMissed: zero(),
        yellowCards: zero(),
        redCards: zero(),
        substitutions: zero(),
        injuries: zero(),
        scrumsTotal: zero(),
        scrumsWon: zero(),
        scrumsLost: zero(),
        linesTotal: zero(),
        linesWon: zero(),
        linesLost: zero(),
        rucksTotal: zero(),
        rucksWon: zero(),
        rucksLost: zero(),
        maulsTotal: zero(),
        maulsWon: zero(),
        maulsLost: zero(),
        tackles: zero(),
        kicks: zero(),
        passes: zero(),
        recoveries: zero(),
        turnoversWon: zero(),
        turnoversLost: zero(),
        penaltiesWon: zero(),
        penaltiesConceded: zero(),
        penaltiesCommitted: zero(),
        freeKicks: zero(),
        knockOns: zero(),
        forwardPasses: zero(),
        handlingErrors: zero(),
        entradas22: zero(),
        kickMeters: zero(),
    };
}

function addTeamMetricPair(
    target: { home: number; away: number },
    source: { home: number; away: number },
) {
    target.home += source.home;
    target.away += source.away;
}

function accumulateStats(target: CompleteMatchStats, source: CompleteMatchStats) {
    target.totalEvents += source.totalEvents;
    target.clockEvents += source.clockEvents;
    addTeamMetricPair(target.assignedEvents, source.assignedEvents);
    addTeamMetricPair(target.points, source.points);
    addTeamMetricPair(target.scoringEvents, source.scoringEvents);
    addTeamMetricPair(target.goalKickAttempts, source.goalKickAttempts);
    addTeamMetricPair(target.goalKicksMade, source.goalKicksMade);
    addTeamMetricPair(target.goalKicksMissed, source.goalKicksMissed);
    addTeamMetricPair(target.tries, source.tries);
    addTeamMetricPair(target.penaltyTries, source.penaltyTries);
    addTeamMetricPair(target.conversionAttempts, source.conversionAttempts);
    addTeamMetricPair(target.conversionsMade, source.conversionsMade);
    addTeamMetricPair(target.conversionsMissed, source.conversionsMissed);
    addTeamMetricPair(target.penaltyGoalAttempts, source.penaltyGoalAttempts);
    addTeamMetricPair(target.penaltyGoalsMade, source.penaltyGoalsMade);
    addTeamMetricPair(target.penaltyGoalsMissed, source.penaltyGoalsMissed);
    addTeamMetricPair(target.dropGoalAttempts, source.dropGoalAttempts);
    addTeamMetricPair(target.dropGoalsMade, source.dropGoalsMade);
    addTeamMetricPair(target.dropGoalsMissed, source.dropGoalsMissed);
    addTeamMetricPair(target.yellowCards, source.yellowCards);
    addTeamMetricPair(target.redCards, source.redCards);
    addTeamMetricPair(target.substitutions, source.substitutions);
    addTeamMetricPair(target.injuries, source.injuries);
    addTeamMetricPair(target.scrumsTotal, source.scrumsTotal);
    addTeamMetricPair(target.scrumsWon, source.scrumsWon);
    addTeamMetricPair(target.scrumsLost, source.scrumsLost);
    addTeamMetricPair(target.linesTotal, source.linesTotal);
    addTeamMetricPair(target.linesWon, source.linesWon);
    addTeamMetricPair(target.linesLost, source.linesLost);
    addTeamMetricPair(target.rucksTotal, source.rucksTotal);
    addTeamMetricPair(target.rucksWon, source.rucksWon);
    addTeamMetricPair(target.rucksLost, source.rucksLost);
    addTeamMetricPair(target.maulsTotal, source.maulsTotal);
    addTeamMetricPair(target.maulsWon, source.maulsWon);
    addTeamMetricPair(target.maulsLost, source.maulsLost);
    addTeamMetricPair(target.tackles, source.tackles);
    addTeamMetricPair(target.kicks, source.kicks);
    addTeamMetricPair(target.passes, source.passes);
    addTeamMetricPair(target.recoveries, source.recoveries);
    addTeamMetricPair(target.turnoversWon, source.turnoversWon);
    addTeamMetricPair(target.turnoversLost, source.turnoversLost);
    addTeamMetricPair(target.penaltiesWon, source.penaltiesWon);
    addTeamMetricPair(target.penaltiesConceded, source.penaltiesConceded);
    addTeamMetricPair(target.penaltiesCommitted, source.penaltiesCommitted);
    addTeamMetricPair(target.freeKicks, source.freeKicks);
    addTeamMetricPair(target.knockOns, source.knockOns);
    addTeamMetricPair(target.forwardPasses, source.forwardPasses);
    addTeamMetricPair(target.handlingErrors, source.handlingErrors);
    addTeamMetricPair(target.entradas22, source.entradas22);
    addTeamMetricPair(target.kickMeters, source.kickMeters);
}

function swapHomeAway(source: CompleteMatchStats): CompleteMatchStats {
    return {
        ...source,
        assignedEvents: { home: source.assignedEvents.away, away: source.assignedEvents.home },
        points: { home: source.points.away, away: source.points.home },
        scoringEvents: { home: source.scoringEvents.away, away: source.scoringEvents.home },
        goalKickAttempts: { home: source.goalKickAttempts.away, away: source.goalKickAttempts.home },
        goalKicksMade: { home: source.goalKicksMade.away, away: source.goalKicksMade.home },
        goalKicksMissed: { home: source.goalKicksMissed.away, away: source.goalKicksMissed.home },
        tries: { home: source.tries.away, away: source.tries.home },
        penaltyTries: { home: source.penaltyTries.away, away: source.penaltyTries.home },
        conversionAttempts: { home: source.conversionAttempts.away, away: source.conversionAttempts.home },
        conversionsMade: { home: source.conversionsMade.away, away: source.conversionsMade.home },
        conversionsMissed: { home: source.conversionsMissed.away, away: source.conversionsMissed.home },
        penaltyGoalAttempts: { home: source.penaltyGoalAttempts.away, away: source.penaltyGoalAttempts.home },
        penaltyGoalsMade: { home: source.penaltyGoalsMade.away, away: source.penaltyGoalsMade.home },
        penaltyGoalsMissed: { home: source.penaltyGoalsMissed.away, away: source.penaltyGoalsMissed.home },
        dropGoalAttempts: { home: source.dropGoalAttempts.away, away: source.dropGoalAttempts.home },
        dropGoalsMade: { home: source.dropGoalsMade.away, away: source.dropGoalsMade.home },
        dropGoalsMissed: { home: source.dropGoalsMissed.away, away: source.dropGoalsMissed.home },
        yellowCards: { home: source.yellowCards.away, away: source.yellowCards.home },
        redCards: { home: source.redCards.away, away: source.redCards.home },
        substitutions: { home: source.substitutions.away, away: source.substitutions.home },
        injuries: { home: source.injuries.away, away: source.injuries.home },
        scrumsTotal: { home: source.scrumsTotal.away, away: source.scrumsTotal.home },
        scrumsWon: { home: source.scrumsWon.away, away: source.scrumsWon.home },
        scrumsLost: { home: source.scrumsLost.away, away: source.scrumsLost.home },
        linesTotal: { home: source.linesTotal.away, away: source.linesTotal.home },
        linesWon: { home: source.linesWon.away, away: source.linesWon.home },
        linesLost: { home: source.linesLost.away, away: source.linesLost.home },
        rucksTotal: { home: source.rucksTotal.away, away: source.rucksTotal.home },
        rucksWon: { home: source.rucksWon.away, away: source.rucksWon.home },
        rucksLost: { home: source.rucksLost.away, away: source.rucksLost.home },
        maulsTotal: { home: source.maulsTotal.away, away: source.maulsTotal.home },
        maulsWon: { home: source.maulsWon.away, away: source.maulsWon.home },
        maulsLost: { home: source.maulsLost.away, away: source.maulsLost.home },
        tackles: { home: source.tackles.away, away: source.tackles.home },
        kicks: { home: source.kicks.away, away: source.kicks.home },
        passes: { home: source.passes.away, away: source.passes.home },
        recoveries: { home: source.recoveries.away, away: source.recoveries.home },
        turnoversWon: { home: source.turnoversWon.away, away: source.turnoversWon.home },
        turnoversLost: { home: source.turnoversLost.away, away: source.turnoversLost.home },
        penaltiesWon: { home: source.penaltiesWon.away, away: source.penaltiesWon.home },
        penaltiesConceded: { home: source.penaltiesConceded.away, away: source.penaltiesConceded.home },
        penaltiesCommitted: { home: source.penaltiesCommitted.away, away: source.penaltiesCommitted.home },
        freeKicks: { home: source.freeKicks.away, away: source.freeKicks.home },
        knockOns: { home: source.knockOns.away, away: source.knockOns.home },
        forwardPasses: { home: source.forwardPasses.away, away: source.forwardPasses.home },
        handlingErrors: { home: source.handlingErrors.away, away: source.handlingErrors.home },
        entradas22: { home: source.entradas22.away, away: source.entradas22.home },
        kickMeters: { home: source.kickMeters.away, away: source.kickMeters.home },
    };
}

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = request.nextUrl;
        const clubId = searchParams.get('club');
        const season = searchParams.get('season'); // optional: filter by year

        if (!clubId) {
            return err('club param required', 400);
        }

        const supabase = await createClient();
        const context = await requireUserAccessContext(supabase).catch(() => null);
        if (!context) {
            return err('No autenticado', 401);
        }

        const target = await getClubManagementTarget(supabase, clubId);
        if (!target) {
            return err('Club no encontrado', 404);
        }

        if (!canManageClubContext(context, target, ACCESS_VIEW_ROLE_SET)) {
            return err('Sin permisos para ver este club', 403);
        }

        // Fetch all played matches for the club
        let matchesQuery = supabase
            .from('matches')
            .select('id, home_club_id, away_club_id, sport_id, sport, events')
            .in('status', [...FINAL_MATCH_STATUSES])
            .or(`home_club_id.eq.${clubId},away_club_id.eq.${clubId}`);

        if (season && /^\d{4}$/.test(season)) {
            const start = `${season}-01-01T00:00:00`;
            const end = `${season}-12-31T23:59:59`;
            matchesQuery = matchesQuery.gte('date_time', start).lte('date_time', end);
        }

        const { data: matchesData, error: matchesError } = await matchesQuery.limit(500);

        if (matchesError) {
            console.error('[api/club-admin/club-stats] matches error:', matchesError);
            return err('Error al cargar partidos', 500);
        }

        const matches = (matchesData ?? []) as MatchRow[];

        if (matches.length === 0) {
            return NextResponse.json({
                ok: true,
                data: {
                    matchesCount: 0,
                    season: season || null,
                    stats: null,
                },
            });
        }

        const matchIds = matches.map((m) => m.id);

        // Try relational events first
        const { data: relationalEvents, error: relationalError } = await supabase
            .from('match_events')
            .select('id, match_id, club_id, event_type, minute, details')
            .in('match_id', matchIds)
            .order('minute', { ascending: true });

        const hasRelationalEvents = !relationalError && Array.isArray(relationalEvents);

        // Group relational events by match_id
        const relationalEventsByMatch = new Map<string, MatchEventRow[]>();
        if (hasRelationalEvents) {
            for (const row of relationalEvents as MatchEventRow[]) {
                const list = relationalEventsByMatch.get(row.match_id) ?? [];
                list.push(row);
                relationalEventsByMatch.set(row.match_id, list);
            }
        }

        const definitionMap = buildMatchEventDefinitionMap(getDefaultMatchEventDefinitions('rugby'));
        const clubStats = createEmptyAggregatedStats();
        const rivalStats = createEmptyAggregatedStats();

        for (const match of matches) {
            const isHome = match.home_club_id === clubId;
            const aggregatableEvents: AggregatableMatchEvent[] = [];

            const matchRelationalEvents = relationalEventsByMatch.get(match.id);
            if (matchRelationalEvents && matchRelationalEvents.length > 0) {
                for (const row of matchRelationalEvents) {
                    const ev = mapRelationalEventToAggregatable(row, match);
                    if (ev) aggregatableEvents.push(ev);
                }
            } else if (Array.isArray(match.events)) {
                // Fallback to JSONB events
                for (const row of match.events as unknown[]) {
                    const ev = mapJsonEventToAggregatable(row);
                    if (ev) aggregatableEvents.push(ev);
                }
            }

            if (aggregatableEvents.length === 0) continue;

            const matchStats = buildCompleteMatchStats(aggregatableEvents, definitionMap);

            if (isHome) {
                accumulateStats(clubStats, matchStats);
                accumulateStats(rivalStats, swapHomeAway(matchStats));
            } else {
                accumulateStats(clubStats, swapHomeAway(matchStats));
                accumulateStats(rivalStats, matchStats);
            }
        }

        return NextResponse.json({
            ok: true,
            data: {
                matchesCount: matches.length,
                season: season || null,
                clubStats,
                rivalStats,
            },
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Error al cargar estadísticas';
        console.error('[api/club-admin/club-stats]', error);
        return err(message, 500);
    }
}
