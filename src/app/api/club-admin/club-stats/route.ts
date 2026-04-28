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
    type TeamMetricPair,
} from '@/lib/matchStatsFromEvents';
import { getDefaultMatchEventDefinitions, buildMatchEventDefinitionMap } from '@/lib/matchEventCatalog';

function err(message: string, status: number) {
    return NextResponse.json({ ok: false, error: message }, { status });
}

const FINAL_MATCH_STATUSES = ['final', 'finished', 'ft'] as const;
const MATCHES_PAGE_SIZE = 1000;
const MATCH_EVENTS_PAGE_SIZE = 1000;
const MATCH_EVENT_ID_CHUNK_SIZE = 80;

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type MatchRow = {
    id: string;
    home_club_id: string | null;
    away_club_id: string | null;
    sport_id?: string | null;
    sport?: string | null;
    score?: unknown;
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

type TeamSide = 'home' | 'away';
type TeamMetricKey = {
    [K in keyof CompleteMatchStats]: CompleteMatchStats[K] extends TeamMetricPair ? K : never
}[keyof CompleteMatchStats];

const TEAM_METRIC_KEYS: TeamMetricKey[] = [
    'assignedEvents',
    'points',
    'scoringEvents',
    'goalKickAttempts',
    'goalKicksMade',
    'goalKicksMissed',
    'tries',
    'penaltyTries',
    'conversionAttempts',
    'conversionsMade',
    'conversionsMissed',
    'penaltyGoalAttempts',
    'penaltyGoalsMade',
    'penaltyGoalsMissed',
    'dropGoalAttempts',
    'dropGoalsMade',
    'dropGoalsMissed',
    'yellowCards',
    'redCards',
    'substitutions',
    'injuries',
    'scrumsTotal',
    'scrumsWon',
    'scrumsLost',
    'linesTotal',
    'linesWon',
    'linesLost',
    'rucksTotal',
    'rucksWon',
    'rucksLost',
    'maulsTotal',
    'maulsWon',
    'maulsLost',
    'tackles',
    'kicks',
    'passes',
    'recoveries',
    'turnoversWon',
    'turnoversLost',
    'penaltiesWon',
    'penaltiesConceded',
    'penaltiesCommitted',
    'freeKicks',
    'knockOns',
    'forwardPasses',
    'handlingErrors',
    'entradas22',
    'kickMeters',
];

function normalizeText(value: unknown): string {
    if (typeof value !== 'string') return '';
    return value.replace(/\s+/g, ' ').trim();
}

function normalizeTeam(value: unknown): 'home' | 'away' | null {
    return value === 'home' || value === 'away' ? value : null;
}

function normalizeScoreValue(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '') {
        const parsed = Number(value.replace(',', '.'));
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
}

function parseMatchScore(score: unknown): { home: number | null; away: number | null } {
    if (!score || typeof score !== 'object') return { home: null, away: null };
    const source = score as Record<string, unknown>;

    return {
        home: normalizeScoreValue(source.home ?? source.home_score),
        away: normalizeScoreValue(source.away ?? source.away_score),
    };
}

function applyScoreToStats(stats: CompleteMatchStats, score: { home: number | null; away: number | null }) {
    if (score.home !== null) stats.points.home = score.home;
    if (score.away !== null) stats.points.away = score.away;
}

function chunkArray<T>(items: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let index = 0; index < items.length; index += size) {
        chunks.push(items.slice(index, index + size));
    }
    return chunks;
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

function accumulateSideStats(
    target: CompleteMatchStats,
    source: CompleteMatchStats,
    sourceSide: TeamSide,
    targetSide: TeamSide,
) {
    target.totalEvents += source.assignedEvents[sourceSide];

    for (const key of TEAM_METRIC_KEYS) {
        target[key][targetSide] += source[key][sourceSide];
    }
}

async function fetchFinalizedClubMatchesForSide(
    supabase: SupabaseServerClient,
    clubIds: string[],
    sideColumn: 'home_club_id' | 'away_club_id',
    season: string | null,
) {
    const rows: MatchRow[] = [];
    let from = 0;

    while (true) {
        let query = supabase
            .from('matches')
            .select('id, home_club_id, away_club_id, sport_id, sport, score, events')
            .in('status', [...FINAL_MATCH_STATUSES])
            .in(sideColumn, clubIds);

        if (season && /^\d{4}$/.test(season)) {
            const start = `${season}-01-01T00:00:00`;
            const end = `${season}-12-31T23:59:59`;
            query = query.gte('date_time', start).lte('date_time', end);
        }

        const { data, error } = await query
            .order('date_time', { ascending: false, nullsFirst: false })
            .range(from, from + MATCHES_PAGE_SIZE - 1);

        if (error) {
            throw error;
        }

        const page = (data ?? []) as MatchRow[];
        rows.push(...page);

        if (page.length < MATCHES_PAGE_SIZE) {
            break;
        }

        from += MATCHES_PAGE_SIZE;
    }

    return rows;
}

async function fetchFinalizedClubMatches(
    supabase: SupabaseServerClient,
    clubIds: string[],
    season: string | null,
) {
    if (clubIds.length === 0) return [];

    const [homeRows, awayRows] = await Promise.all([
        fetchFinalizedClubMatchesForSide(supabase, clubIds, 'home_club_id', season),
        fetchFinalizedClubMatchesForSide(supabase, clubIds, 'away_club_id', season),
    ]);

    return Array.from(
        [...homeRows, ...awayRows].reduce((byId, row) => byId.set(row.id, row), new Map<string, MatchRow>()).values()
    );
}

async function fetchRelationalEventsByMatch(
    supabase: SupabaseServerClient,
    matchIds: string[],
) {
    const relationalEventsByMatch = new Map<string, MatchEventRow[]>();

    for (const chunk of chunkArray(matchIds, MATCH_EVENT_ID_CHUNK_SIZE)) {
        let from = 0;

        while (true) {
            const { data, error } = await supabase
                .from('match_events')
                .select('id, match_id, club_id, event_type, minute, details')
                .in('match_id', chunk)
                .order('minute', { ascending: true })
                .range(from, from + MATCH_EVENTS_PAGE_SIZE - 1);

            if (error) {
                console.warn('[api/club-admin/club-stats] relational events unavailable:', error);
                return relationalEventsByMatch;
            }

            const page = (data ?? []) as MatchEventRow[];
            for (const row of page) {
                const list = relationalEventsByMatch.get(row.match_id) ?? [];
                list.push(row);
                relationalEventsByMatch.set(row.match_id, list);
            }

            if (page.length < MATCH_EVENTS_PAGE_SIZE) {
                break;
            }

            from += MATCH_EVENTS_PAGE_SIZE;
        }
    }

    return relationalEventsByMatch;
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

        const scopedClubIds = Array.from(new Set(
            [clubId, ...target.familyClubIds]
                .filter((value): value is string => typeof value === 'string' && value.length > 0)
        ));
        const scopedClubIdSet = new Set(scopedClubIds);

        let matches: MatchRow[];
        try {
            matches = await fetchFinalizedClubMatches(supabase, scopedClubIds, season);
        } catch (matchesError) {
            console.error('[api/club-admin/club-stats] matches error:', matchesError);
            return err('Error al cargar partidos', 500);
        }

        if (matches.length === 0) {
            return NextResponse.json({
                ok: true,
                data: {
                    matchesCount: 0,
                    matchesWithStatsCount: 0,
                    totalMatchesCount: 0,
                    season: season || null,
                    clubStats: createEmptyAggregatedStats(),
                    rivalStats: createEmptyAggregatedStats(),
                    comparisonStats: createEmptyAggregatedStats(),
                },
            });
        }

        const matchIds = matches.map((m) => m.id);
        const relationalEventsByMatch = await fetchRelationalEventsByMatch(supabase, matchIds);

        const definitionMap = buildMatchEventDefinitionMap(getDefaultMatchEventDefinitions('rugby'));
        const clubStats = createEmptyAggregatedStats();
        const rivalStats = createEmptyAggregatedStats();
        const comparisonStats = createEmptyAggregatedStats();

        for (const match of matches) {
            const homeInScope = match.home_club_id ? scopedClubIdSet.has(match.home_club_id) : false;
            const awayInScope = match.away_club_id ? scopedClubIdSet.has(match.away_club_id) : false;
            const clubSide: TeamSide = homeInScope || !awayInScope ? 'home' : 'away';
            const rivalSide: TeamSide = clubSide === 'home' ? 'away' : 'home';
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

            const score = parseMatchScore(match.score);
            const matchStats = aggregatableEvents.length > 0
                ? buildCompleteMatchStats(aggregatableEvents, definitionMap)
                : createEmptyAggregatedStats();
            applyScoreToStats(matchStats, score);

            accumulateSideStats(clubStats, matchStats, clubSide, 'home');
            accumulateSideStats(rivalStats, matchStats, rivalSide, 'away');
            accumulateSideStats(comparisonStats, matchStats, clubSide, 'home');
            accumulateSideStats(comparisonStats, matchStats, rivalSide, 'away');
        }

        return NextResponse.json({
            ok: true,
            data: {
                matchesCount: matches.length,
                matchesWithStatsCount: matches.length,
                totalMatchesCount: matches.length,
                season: season || null,
                clubStats,
                rivalStats,
                comparisonStats,
            },
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Error al cargar estadísticas';
        console.error('[api/club-admin/club-stats]', error);
        return err(message, 500);
    }
}
