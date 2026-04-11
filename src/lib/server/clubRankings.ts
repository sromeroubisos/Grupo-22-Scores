import { canonicalizeSportId } from '@/lib/clubDerivatives';
import { normalizeRankingPositionLabels } from '@/lib/rankings/rankingTable';
import { createAdminClient } from '@/lib/supabase/admin';
import { isMissingTableError } from '@/lib/utils/supabaseSchema';

type AdminClient = ReturnType<typeof createAdminClient>;

type RankingRow = {
    id: string;
    name: string;
    sport: string | null;
    season: string;
    results_season: number;
    scope: string | null;
    description: string | null;
    algorithm: string | null;
    home_advantage: number | string | null;
    margin_threshold: number | null;
    margin_multiplier: number | string | null;
    event_multiplier: number | string | null;
    initial_imported_at: string | null;
    backfill_completed_at: string | null;
    stale_from_match_id: string | null;
    stale_from_match_date: string | null;
    stale_reason: string | null;
    last_incremental_match_id: string | null;
    metadata: Record<string, unknown> | null;
    created_at: string;
    updated_at: string;
};

type RankingEntryRow = {
    id: string;
    ranking_id: string;
    club_id: string;
    source_row_index: number | null;
    source_name: string;
    source_region: string | null;
    source_position: number | null;
    source_previous_position: number | null;
    source_variation: number | string | null;
    source_payload: Record<string, unknown> | null;
    initial_rating: number | string;
    previous_rating?: number | string | null;
    current_rating: number | string;
    current_position: number | null;
    is_active: boolean;
    last_applied_match_id: string | null;
    created_at: string;
    updated_at: string;
    clubs?:
        | {
            id: string;
            name: string;
            short_name?: string | null;
            logo_url?: string | null;
        }
        | Array<{
            id: string;
            name: string;
            short_name?: string | null;
            logo_url?: string | null;
        }>
        | null;
};

type RankingClubRow = {
    id: string;
    name: string;
    short_name?: string | null;
    logo_url?: string | null;
    sport?: string | null;
    sport_id?: string | null;
};

type RankingApplicationRow = {
    id: string;
    ranking_id: string;
    match_id: string;
    match_date_time: string | null;
    applied_at: string;
    applied_mode: 'incremental' | 'backfill' | 'rebuild';
    home_club_id: string;
    away_club_id: string;
    home_rating_before: number | string;
    away_rating_before: number | string;
    home_delta: number | string;
    away_delta: number | string;
    home_rating_after: number | string;
    away_rating_after: number | string;
    home_score: number;
    away_score: number;
    margin: number;
    result: 'home_win' | 'away_win' | 'draw';
    metadata: Record<string, unknown> | null;
};

type RankingManualAdjustmentRow = {
    id: string;
    ranking_id: string;
    club_id: string;
    mode: 'delta' | 'set';
    value: number | string;
    reason: string;
    resulting_rating: number | string | null;
    created_by: string | null;
    created_at: string;
    metadata: Record<string, unknown> | null;
};

type RankingLeadershipPeriodRow = {
    id: string;
    ranking_id: string;
    club_id: string;
    started_at: string;
    ended_at: string | null;
    days_as_leader: number;
    started_reason: 'initial' | 'match' | 'manual';
    ended_reason: 'match' | 'manual' | null;
    started_match_id: string | null;
    ended_match_id: string | null;
    started_adjustment_id: string | null;
    ended_adjustment_id: string | null;
    metadata: Record<string, unknown> | null;
    created_at: string;
};

type RankingLeadershipPeriod = RankingLeadershipPeriodRow & {
    club: RankingClubRow | null;
};

type RankingLeadershipSummary = {
    club_id: string;
    club: RankingClubRow | null;
    total_days_as_leader: number;
    times_as_leader: number;
    current_streak_days: number;
    current_streak_started_at: string | null;
    last_reached_at: string | null;
    is_current_leader: boolean;
};

type MatchSnapshot = {
    id: string;
    home_club_id: string | null;
    away_club_id: string | null;
    score: unknown;
    status: string | null;
    date_time: string | null;
    sport: string | null;
    sport_id: string | null;
    tournament_id: string | null;
    phase_id: string | null;
    group_id: string | null;
    round_uuid: string | null;
    updated_at: string | null;
};

type ImportRankingEntryInput = {
    clubId: string;
    sourceName: string;
    initialRating: number;
    sourceRowIndex?: number | null;
    sourceRegion?: string | null;
    sourcePosition?: number | null;
    sourcePreviousPosition?: number | null;
    sourceVariation?: number | null;
    sourcePayload?: Record<string, unknown> | null;
};

type ImportRankingBaseInput = {
    id: string;
    name: string;
    sport: string;
    season: string;
    resultsSeason?: number | null;
    scope?: string | null;
    description?: string | null;
    entries: ImportRankingEntryInput[];
    actorUserId?: string | null;
};

type ManualAdjustmentInput = {
    clubId: string;
    mode: 'delta' | 'set';
    value: number;
    reason: string;
    actorUserId?: string | null;
};

type RankingEntryMutationInput = {
    clubId: string;
    sourceName?: string | null;
    initialRating: number;
    sourceRegion?: string | null;
    sourcePosition?: number | null;
    sourcePreviousPosition?: number | null;
    sourceVariation?: number | null;
    sourcePayload?: Record<string, unknown> | null;
    isActive?: boolean;
    actorUserId?: string | null;
};

type RankingDetail = {
    ranking: RankingRow;
    entries: RankingEntryRow[];
    recentApplications: RankingApplicationRow[];
    manualAdjustments: RankingManualAdjustmentRow[];
    leadershipPeriods: RankingLeadershipPeriod[];
    leadershipSummary: RankingLeadershipSummary[];
    currentLeaderClubId: string | null;
};

const MATCH_SELECT =
    'id, home_club_id, away_club_id, score, status, date_time, tournament_id, phase_id, group_id, round_uuid, updated_at';
const CLUB_RANKING_SCHEMA_MESSAGE =
    "El sistema de rankings no esta disponible en el schema cache de Supabase. Si ya aplicaste las migraciones de rankings, recarga el schema cache de PostgREST con `NOTIFY pgrst, 'reload schema';` y vuelve a probar.";

function getAdminClient() {
    return createAdminClient() as AdminClient;
}

function isMissingClubRankingSchemaError(error: unknown) {
    return [
        'club_rankings',
        'club_ranking_entries',
        'club_ranking_match_applications',
        'club_ranking_manual_adjustments',
    ].some((tableName) => isMissingTableError(error as { code?: string | null; message?: string | null; details?: string | null }, tableName));
}

function isMissingLeadershipHistorySchemaError(error: unknown) {
    return isMissingTableError(
        error as { code?: string | null; message?: string | null; details?: string | null },
        'club_ranking_leadership_periods',
    );
}

function createClubRankingQueryError(error: unknown, fallbackMessage: string) {
    if (isMissingClubRankingSchemaError(error)) {
        return new Error(CLUB_RANKING_SCHEMA_MESSAGE);
    }

    const message =
        error && typeof error === 'object' && 'message' in error
            ? String((error as { message?: unknown }).message || '')
            : '';

    return new Error(message || fallbackMessage);
}

function toNumber(value: unknown, fallback = 0) {
    if (value === null || value === undefined || value === '') return fallback;
    const numeric = Number(String(value).replace(',', '.'));
    return Number.isFinite(numeric) ? numeric : fallback;
}

function roundRating(value: number) {
    return Number(value.toFixed(4));
}

function getRankingEntryClub(entry: Pick<RankingEntryRow, 'clubs'>) {
    if (Array.isArray(entry.clubs)) {
        return entry.clubs[0] ?? null;
    }

    return entry.clubs ?? null;
}

function compareRankingEntries(left: RankingEntryRow, right: RankingEntryRow) {
    const ratingDelta = toNumber(right.current_rating) - toNumber(left.current_rating);
    if (ratingDelta !== 0) return ratingDelta;
    const leftName = getRankingEntryClub(left)?.name || left.source_name;
    const rightName = getRankingEntryClub(right)?.name || right.source_name;
    return leftName.localeCompare(rightName, 'es');
}

function getRankingLeader(entries: Iterable<RankingEntryRow>) {
    return Array.from(entries)
        .filter((entry) => entry.is_active !== false)
        .sort(compareRankingEntries)[0] ?? null;
}

const DAY_IN_MS = 24 * 60 * 60 * 1000;

function calculateInclusiveDaySpan(
    startedAt: string | null | undefined,
    endedAt: string | null | undefined,
) {
    if (!startedAt || !endedAt) return 0;
    const startDate = new Date(startedAt);
    const endDate = new Date(endedAt);

    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
        return 0;
    }

    const startUtc = Date.UTC(
        startDate.getUTCFullYear(),
        startDate.getUTCMonth(),
        startDate.getUTCDate(),
    );
    const endUtc = Date.UTC(
        endDate.getUTCFullYear(),
        endDate.getUTCMonth(),
        endDate.getUTCDate(),
    );

    return Math.max(1, Math.floor((endUtc - startUtc) / DAY_IN_MS) + 1);
}

function readText(value: unknown) {
    const text = String(value ?? '').trim();
    return text || null;
}

function normalizeSourcePayload(sourcePayload: Record<string, unknown> | null | undefined) {
    if (!sourcePayload || typeof sourcePayload !== 'object' || Array.isArray(sourcePayload)) {
        return {} as Record<string, unknown>;
    }

    return { ...sourcePayload };
}

function readPreviousRating(
    sourcePayload: Record<string, unknown> | null | undefined,
    fallback: unknown,
) {
    const payload = normalizeSourcePayload(sourcePayload);
    const numeric = Number(String(payload.previous_rating ?? '').replace(',', '.'));

    if (Number.isFinite(numeric)) {
        return roundRating(numeric);
    }

    return roundRating(toNumber(fallback));
}

function withPreviousRating(
    sourcePayload: Record<string, unknown> | null | undefined,
    previousRating: number,
) {
    return {
        ...normalizeSourcePayload(sourcePayload),
        previous_rating: roundRating(previousRating),
    };
}

function parseScore(score: unknown) {
    if (!score || typeof score !== 'object' || Array.isArray(score)) {
        return null;
    }

    const source = score as Record<string, unknown>;
    const home = source.home ?? source.home_score;
    const away = source.away ?? source.away_score;
    const parsedHome = Number(home);
    const parsedAway = Number(away);

    if (!Number.isFinite(parsedHome) || !Number.isFinite(parsedAway)) {
        return null;
    }

    return { home: parsedHome, away: parsedAway };
}

function clampRatingGap(value: number) {
    if (value > 10) return 10;
    if (value < -10) return -10;
    return value;
}

function computeWorldRugbyExchange(
    ranking: RankingRow,
    homeRating: number,
    awayRating: number,
    score: { home: number; away: number },
) {
    const homeAdvantage = toNumber(ranking.home_advantage, 3);
    const marginThreshold = ranking.margin_threshold ?? 15;
    const marginMultiplier = toNumber(ranking.margin_multiplier, 1.5);
    const eventMultiplier = toNumber(ranking.event_multiplier, 1);

    const homeGap = clampRatingGap(awayRating - (homeRating + homeAdvantage));
    const homeResultSignal = score.home > score.away ? 1 : score.home < score.away ? -1 : 0;

    let homeDelta = homeResultSignal + 0.1 * homeGap;
    const margin = Math.abs(score.home - score.away);

    if (margin > marginThreshold) {
        homeDelta *= marginMultiplier;
    }

    homeDelta *= eventMultiplier;
    homeDelta = roundRating(homeDelta);

    return {
        homeDelta,
        awayDelta: roundRating(-homeDelta),
        margin,
        result:
            homeResultSignal > 0
                ? ('home_win' as const)
                : homeResultSignal < 0
                    ? ('away_win' as const)
                    : ('draw' as const),
        metadata: {
            algorithm: 'world_rugby',
            homeAdvantage,
            ratingGap: homeGap,
            marginThreshold,
            marginMultiplier: margin > marginThreshold ? marginMultiplier : 1,
            eventMultiplier,
        },
    };
}

function getSeasonRange(resultsSeason: number) {
    return {
        start: `${resultsSeason}-01-01T00:00:00.000Z`,
        end: `${resultsSeason + 1}-01-01T00:00:00.000Z`,
    };
}

function isSeasonMatch(match: MatchSnapshot, resultsSeason: number) {
    if (!match.date_time) return false;
    const year = Number(match.date_time.slice(0, 4));
    return year === resultsSeason;
}

function normalizeMatchSnapshot(row: MatchSnapshot | null | undefined): MatchSnapshot | null {
    if (!row) return null;
    return {
        id: row.id,
        home_club_id: row.home_club_id ?? null,
        away_club_id: row.away_club_id ?? null,
        score: row.score ?? null,
        status: readText(row.status),
        date_time: readText(row.date_time),
        sport: readText(row.sport),
        sport_id: readText(row.sport_id),
        tournament_id: readText(row.tournament_id),
        phase_id: readText(row.phase_id),
        group_id: readText(row.group_id),
        round_uuid: readText(row.round_uuid),
        updated_at: readText(row.updated_at),
    };
}

function hasMeaningfulMatchChange(previousMatch: MatchSnapshot | null, currentMatch: MatchSnapshot | null) {
    if (!previousMatch || !currentMatch) return true;

    const previousScore = parseScore(previousMatch.score);
    const currentScore = parseScore(currentMatch.score);

    return (
        previousMatch.home_club_id !== currentMatch.home_club_id ||
        previousMatch.away_club_id !== currentMatch.away_club_id ||
        previousMatch.status !== currentMatch.status ||
        previousMatch.date_time !== currentMatch.date_time ||
        JSON.stringify(previousScore) !== JSON.stringify(currentScore)
    );
}

function compareMatchOrder(left: MatchSnapshot | null, right: MatchSnapshot | null) {
    if (!left?.date_time || !right?.date_time) return 0;
    const leftTime = new Date(left.date_time).getTime();
    const rightTime = new Date(right.date_time).getTime();

    if (!Number.isFinite(leftTime) || !Number.isFinite(rightTime)) return 0;
    if (leftTime !== rightTime) return leftTime - rightTime;

    return left.id.localeCompare(right.id, 'en');
}

async function writeAudit(
    supabase: ReturnType<typeof getAdminClient>,
    actorUserId: string | null | undefined,
    entityId: string,
    action: string,
    changes: Record<string, unknown>,
    source = 'club-ranking',
) {
    if (!actorUserId) return;
    try {
        await supabase.from('admin_audit_log').insert({
            actor_user_id: actorUserId,
            entity_type: 'club_ranking',
            entity_id: entityId,
            action,
            changes,
            source,
        });
    } catch {
        // Audit should not block ranking updates.
    }
}

async function getRankingRow(
    supabase: ReturnType<typeof getAdminClient>,
    rankingId: string,
) {
    const { data, error } = await supabase
        .from('club_rankings')
        .select('*')
        .eq('id', rankingId)
        .single();

    if (error || !data) {
        if (error) {
            throw createClubRankingQueryError(error, 'No se encontro el ranking solicitado.');
        }
        throw new Error('No se encontro el ranking solicitado.');
    }

    return data as RankingRow;
}

async function listRankingRows(
    supabase: ReturnType<typeof getAdminClient>,
    rankingIds: string[],
) {
    if (rankingIds.length === 0) {
        return [] as RankingRow[];
    }

    const { data, error } = await supabase
        .from('club_rankings')
        .select('*')
        .in('id', rankingIds);

    if (error) {
        throw createClubRankingQueryError(error, 'No se pudieron cargar los rankings solicitados.');
    }

    return (data || []) as RankingRow[];
}

async function getMatchSnapshot(matchId: string) {
    const supabase = getAdminClient();
    const { data, error } = await supabase
        .from('matches')
        .select(MATCH_SELECT)
        .eq('id', matchId)
        .single();

    if (error || !data) {
        return null;
    }

    const [enrichedMatch] = await enrichMatchesWithTournamentSport(
        supabase,
        [data as MatchSnapshot],
    );

    return enrichedMatch ?? null;
}

async function getTournamentSportMap(
    supabase: ReturnType<typeof getAdminClient>,
    tournamentIds: string[],
) {
    const uniqueTournamentIds = Array.from(new Set(tournamentIds.filter(Boolean)));
    if (uniqueTournamentIds.length === 0) return new Map<string, string | null>();

    const columnVariants = [
        'id, sport_id, sport',
        'id, sport_id',
        'id, sport',
        'id',
    ] as const;

    let lastError: unknown = null;

    for (const columns of columnVariants) {
        const { data, error } = await supabase
            .from('tournaments')
            .select(columns)
            .in('id', uniqueTournamentIds);

        if (!error) {
            return new Map(
                ((data || []) as unknown as Array<{ id: string; sport_id?: string | null; sport?: string | null }>)
                    .map((row) => [row.id, canonicalizeSportId(row.sport_id || row.sport || null)]),
            );
        }

        lastError = error;
    }

    throw createClubRankingQueryError(
        lastError,
        'No se pudo resolver el deporte de los torneos vinculados a los partidos del ranking.',
    );
}

async function enrichMatchesWithTournamentSport(
    supabase: ReturnType<typeof getAdminClient>,
    matches: MatchSnapshot[],
) {
    if (matches.length === 0) return [] as MatchSnapshot[];

    const tournamentSportMap = await getTournamentSportMap(
        supabase,
        matches.map((match) => match.tournament_id ?? '').filter(Boolean),
    );

    return matches
        .map((match) => normalizeMatchSnapshot({
            ...match,
            sport_id: match.sport_id ?? tournamentSportMap.get(match.tournament_id ?? '') ?? null,
            sport: match.sport ?? tournamentSportMap.get(match.tournament_id ?? '') ?? null,
        } as MatchSnapshot))
        .filter((match): match is MatchSnapshot => Boolean(match));
}

async function getClubsByIds(
    supabase: ReturnType<typeof getAdminClient>,
    clubIds: string[],
) {
    const uniqueClubIds = Array.from(new Set(clubIds.filter(Boolean)));
    if (uniqueClubIds.length === 0) return new Map<string, RankingClubRow>();

    const { data, error } = await supabase
        .from('clubs')
        .select('id, name, short_name, logo_url')
        .in('id', uniqueClubIds);

    if (error) {
        throw new Error(error.message || 'No se pudieron cargar los clubes vinculados al ranking.');
    }

    return new Map(
        ((data || []) as RankingClubRow[]).map((club) => [club.id, club]),
    );
}

async function getClubById(
    supabase: ReturnType<typeof getAdminClient>,
    clubId: string,
) {
    const { data, error } = await supabase
        .from('clubs')
        .select('id, name, short_name, logo_url, sport, sport_id')
        .eq('id', clubId)
        .single();

    if (error || !data) {
        throw new Error('No se encontro el club seleccionado.');
    }

    return data as RankingClubRow;
}

function assertClubMatchesRankingSport(ranking: RankingRow, club: RankingClubRow) {
    const rankingSport = canonicalizeSportId(ranking.sport || null);
    const clubSport = canonicalizeSportId(club.sport_id || club.sport || null);

    if (!rankingSport || !clubSport || rankingSport === clubSport) {
        return;
    }

    throw new Error('El club seleccionado no corresponde al deporte de este ranking.');
}

async function getRankingEntryById(
    supabase: ReturnType<typeof getAdminClient>,
    rankingId: string,
    entryId: string,
) {
    const { data, error } = await supabase
        .from('club_ranking_entries')
        .select('*')
        .eq('ranking_id', rankingId)
        .eq('id', entryId)
        .single();

    if (error || !data) {
        throw new Error('No se encontro la fila del ranking que queres editar.');
    }

    return data as RankingEntryRow;
}

async function getRankingEntryByClubId(
    supabase: ReturnType<typeof getAdminClient>,
    rankingId: string,
    clubId: string,
) {
    const { data, error } = await supabase
        .from('club_ranking_entries')
        .select('*')
        .eq('ranking_id', rankingId)
        .eq('club_id', clubId)
        .maybeSingle();

    if (error) {
        throw createClubRankingQueryError(
            error,
            'No se pudo verificar si el club ya pertenece al ranking.',
        );
    }

    return (data || null) as RankingEntryRow | null;
}

async function getRankingEntries(
    supabase: ReturnType<typeof getAdminClient>,
    rankingId: string,
) {
    const { data, error } = await supabase
        .from('club_ranking_entries')
        .select('*')
        .eq('ranking_id', rankingId)
        .order('current_position', { ascending: true, nullsFirst: false })
        .order('current_rating', { ascending: false });

    if (error) {
        throw createClubRankingQueryError(error, 'No se pudieron cargar los clubes del ranking.');
    }

    const rows = (data || []) as RankingEntryRow[];
    const clubsById = await getClubsByIds(
        supabase,
        rows.map((row) => row.club_id),
    );

    return rows.map((row) => ({
        ...row,
        initial_rating: roundRating(toNumber(row.initial_rating)),
        previous_rating: readPreviousRating(row.source_payload, row.initial_rating),
        current_rating: roundRating(toNumber(row.current_rating)),
        source_variation: row.source_variation === null ? null : roundRating(toNumber(row.source_variation)),
        clubs: clubsById.get(row.club_id) ?? null,
    }));
}

type LeadershipTimelineEvent =
    | {
        id: string;
        at: string;
        recorded_at: string;
        reason: 'match';
        match_id: string;
        home_club_id: string;
        away_club_id: string;
        home_rating_after: number;
        away_rating_after: number;
    }
    | {
        id: string;
        at: string;
        recorded_at: string;
        reason: 'manual';
        adjustment_id: string;
        club_id: string;
        resulting_rating: number | null;
        mode: 'delta' | 'set';
        value: number;
    };

type PendingLeadershipPeriod = Omit<RankingLeadershipPeriodRow, 'id' | 'created_at'>;

function cloneRankingEntryForHistory(entry: RankingEntryRow): RankingEntryRow {
    const initialRating = roundRating(toNumber(entry.initial_rating));
    return {
        ...entry,
        current_rating: initialRating,
        previous_rating: initialRating,
        current_position: null,
        source_previous_position: null,
        source_payload: withPreviousRating(entry.source_payload, initialRating),
    };
}

function buildLeadershipTimeline(
    applications: RankingApplicationRow[],
    manualAdjustments: RankingManualAdjustmentRow[],
) {
    const matchEvents: LeadershipTimelineEvent[] = [];
    applications.forEach((application) => {
        const at = application.match_date_time || application.applied_at;
        if (!at) return;

        matchEvents.push({
            id: application.id,
            at,
            recorded_at: application.applied_at || at,
            reason: 'match',
            match_id: application.match_id,
            home_club_id: application.home_club_id,
            away_club_id: application.away_club_id,
            home_rating_after: roundRating(toNumber(application.home_rating_after)),
            away_rating_after: roundRating(toNumber(application.away_rating_after)),
        });
    });

    const adjustmentEvents: LeadershipTimelineEvent[] = [];
    manualAdjustments.forEach((adjustment) => {
        const at = adjustment.created_at;
        if (!at) return;

        adjustmentEvents.push({
            id: adjustment.id,
            at,
            recorded_at: adjustment.created_at,
            reason: 'manual',
            adjustment_id: adjustment.id,
            club_id: adjustment.club_id,
            resulting_rating:
                adjustment.resulting_rating === null
                    ? null
                    : roundRating(toNumber(adjustment.resulting_rating)),
            mode: adjustment.mode,
            value: roundRating(toNumber(adjustment.value)),
        });
    });

    return [...matchEvents, ...adjustmentEvents].sort((left, right) => {
        const leftAt = new Date(left.at).getTime();
        const rightAt = new Date(right.at).getTime();
        const safeLeftAt = Number.isFinite(leftAt) ? leftAt : 0;
        const safeRightAt = Number.isFinite(rightAt) ? rightAt : 0;

        if (safeLeftAt !== safeRightAt) {
            return safeLeftAt - safeRightAt;
        }

        const leftRecorded = new Date(left.recorded_at).getTime();
        const rightRecorded = new Date(right.recorded_at).getTime();
        const safeLeftRecorded = Number.isFinite(leftRecorded) ? leftRecorded : safeLeftAt;
        const safeRightRecorded = Number.isFinite(rightRecorded) ? rightRecorded : safeRightAt;

        if (safeLeftRecorded !== safeRightRecorded) {
            return safeLeftRecorded - safeRightRecorded;
        }

        if (left.reason !== right.reason) {
            return left.reason === 'match' ? -1 : 1;
        }

        return left.id.localeCompare(right.id, 'en');
    });
}

async function rebuildLeadershipHistory(
    supabase: ReturnType<typeof getAdminClient>,
    rankingId: string,
    options?: {
        ranking?: RankingRow;
        entries?: RankingEntryRow[];
    },
) {
    const ranking = options?.ranking ?? await getRankingRow(supabase, rankingId);
    const entries = options?.entries ?? await getRankingEntries(supabase, rankingId);
    const activeEntries = entries.filter((entry) => entry.is_active !== false);
    const { error: clearError } = await supabase
        .from('club_ranking_leadership_periods')
        .delete()
        .eq('ranking_id', rankingId);

    if (clearError) {
        if (isMissingLeadershipHistorySchemaError(clearError)) {
            return {
                periods: [] as PendingLeadershipPeriod[],
                currentLeaderClubId: null,
            };
        }

        throw createClubRankingQueryError(
            clearError,
            'No se pudo limpiar el historial de punteros del ranking.',
        );
    }

    if (activeEntries.length === 0) {
        return {
            periods: [] as PendingLeadershipPeriod[],
            currentLeaderClubId: null,
        };
    }

    const [applicationsRes, manualAdjustmentsRes] = await Promise.all([
        supabase
            .from('club_ranking_match_applications')
            .select('*')
            .eq('ranking_id', rankingId),
        supabase
            .from('club_ranking_manual_adjustments')
            .select('*')
            .eq('ranking_id', rankingId),
    ]);

    if (applicationsRes.error) {
        throw createClubRankingQueryError(
            applicationsRes.error,
            'No se pudo reconstruir el historial de punteros del ranking.',
        );
    }

    if (manualAdjustmentsRes.error) {
        throw createClubRankingQueryError(
            manualAdjustmentsRes.error,
            'No se pudo reconstruir el historial de punteros del ranking.',
        );
    }

    const simulationEntries = new Map(
        activeEntries.map((entry) => [entry.club_id, cloneRankingEntryForHistory(entry)]),
    );
    const timeline = buildLeadershipTimeline(
        (applicationsRes.data || []) as RankingApplicationRow[],
        (manualAdjustmentsRes.data || []) as RankingManualAdjustmentRow[],
    );
    const periods: PendingLeadershipPeriod[] = [];
    const initialLeader = getRankingLeader(simulationEntries.values());
    const historyStartAt = ranking.initial_imported_at || ranking.created_at || new Date().toISOString();
    const now = new Date().toISOString();

    let openPeriod: PendingLeadershipPeriod | null = initialLeader
        ? {
            ranking_id: rankingId,
            club_id: initialLeader.club_id,
            started_at: historyStartAt,
            ended_at: null,
            days_as_leader: calculateInclusiveDaySpan(historyStartAt, now),
            started_reason: 'initial',
            ended_reason: null,
            started_match_id: null,
            ended_match_id: null,
            started_adjustment_id: null,
            ended_adjustment_id: null,
            metadata: {},
        }
        : null;

    for (const event of timeline) {
        if (event.reason === 'match') {
            const homeEntry = simulationEntries.get(event.home_club_id);
            const awayEntry = simulationEntries.get(event.away_club_id);
            if (homeEntry) homeEntry.current_rating = event.home_rating_after;
            if (awayEntry) awayEntry.current_rating = event.away_rating_after;
        } else {
            const entry = simulationEntries.get(event.club_id);
            if (entry) {
                const fallbackRating =
                    event.mode === 'set'
                        ? event.value
                        : roundRating(toNumber(entry.current_rating) + event.value);
                entry.current_rating = roundRating(event.resulting_rating ?? fallbackRating);
            }
        }

        const nextLeader = getRankingLeader(simulationEntries.values());
        const nextLeaderClubId = nextLeader?.club_id ?? null;
        const currentLeaderClubId = openPeriod?.club_id ?? null;

        if (nextLeaderClubId === currentLeaderClubId) {
            continue;
        }

        if (openPeriod) {
            openPeriod.ended_at = event.at;
            openPeriod.ended_reason = event.reason;
            openPeriod.ended_match_id = event.reason === 'match' ? event.match_id : null;
            openPeriod.ended_adjustment_id = event.reason === 'manual' ? event.adjustment_id : null;
            openPeriod.days_as_leader = calculateInclusiveDaySpan(openPeriod.started_at, event.at);
            periods.push(openPeriod);
        }

        openPeriod = nextLeader
            ? {
                ranking_id: rankingId,
                club_id: nextLeader.club_id,
                started_at: event.at,
                ended_at: null,
                days_as_leader: calculateInclusiveDaySpan(event.at, now),
                started_reason: event.reason,
                ended_reason: null,
                started_match_id: event.reason === 'match' ? event.match_id : null,
                ended_match_id: null,
                started_adjustment_id: event.reason === 'manual' ? event.adjustment_id : null,
                ended_adjustment_id: null,
                metadata: {},
            }
            : null;
    }

    if (openPeriod) {
        openPeriod.days_as_leader = calculateInclusiveDaySpan(openPeriod.started_at, now);
        periods.push(openPeriod);
    }

    if (periods.length > 0) {
        const { error: insertError } = await supabase
            .from('club_ranking_leadership_periods')
            .insert(periods);

        if (insertError) {
            if (isMissingLeadershipHistorySchemaError(insertError)) {
                return {
                    periods: [] as PendingLeadershipPeriod[],
                    currentLeaderClubId: null,
                };
            }

            throw createClubRankingQueryError(
                insertError,
                'No se pudo guardar el historial de punteros del ranking.',
            );
        }
    }

    return {
        periods,
        currentLeaderClubId: openPeriod?.club_id ?? periods[periods.length - 1]?.club_id ?? null,
    };
}

async function getLeadershipHistory(
    supabase: ReturnType<typeof getAdminClient>,
    rankingId: string,
) {
    const { data, error } = await supabase
        .from('club_ranking_leadership_periods')
        .select('*')
        .eq('ranking_id', rankingId)
        .order('started_at', { ascending: false });

    if (error) {
        if (isMissingLeadershipHistorySchemaError(error)) {
            return {
                leadershipPeriods: [] as RankingLeadershipPeriod[],
                leadershipSummary: [] as RankingLeadershipSummary[],
                currentLeaderClubId: null,
            };
        }

        throw createClubRankingQueryError(
            error,
            'No se pudo cargar el historial de punteros del ranking.',
        );
    }

    const rows = (data || []) as RankingLeadershipPeriodRow[];
    const now = new Date().toISOString();
    const clubsById = await getClubsByIds(
        supabase,
        rows.map((row) => row.club_id),
    );
    const periods: RankingLeadershipPeriod[] = rows.map((row) => ({
        ...row,
        days_as_leader: row.ended_at
            ? Number(row.days_as_leader)
            : calculateInclusiveDaySpan(row.started_at, now),
        club: clubsById.get(row.club_id) ?? null,
    }));

    const summaryMap = new Map<string, RankingLeadershipSummary>();
    periods.forEach((period) => {
        const current = summaryMap.get(period.club_id) ?? {
            club_id: period.club_id,
            club: period.club,
            total_days_as_leader: 0,
            times_as_leader: 0,
            current_streak_days: 0,
            current_streak_started_at: null,
            last_reached_at: null,
            is_current_leader: false,
        };

        current.club = current.club ?? period.club;
        current.total_days_as_leader += Number(period.days_as_leader) || 0;
        current.times_as_leader += 1;

        if (!current.last_reached_at || period.started_at > current.last_reached_at) {
            current.last_reached_at = period.started_at;
        }

        if (period.ended_at === null) {
            current.is_current_leader = true;
            current.current_streak_days = Number(period.days_as_leader) || 0;
            current.current_streak_started_at = period.started_at;
        }

        summaryMap.set(period.club_id, current);
    });

    const leadershipSummary = Array.from(summaryMap.values()).sort((left, right) => {
        if (left.is_current_leader !== right.is_current_leader) {
            return left.is_current_leader ? -1 : 1;
        }

        if (right.total_days_as_leader !== left.total_days_as_leader) {
            return right.total_days_as_leader - left.total_days_as_leader;
        }

        if (right.times_as_leader !== left.times_as_leader) {
            return right.times_as_leader - left.times_as_leader;
        }

        const leftName = left.club?.name || left.club_id;
        const rightName = right.club?.name || right.club_id;
        return leftName.localeCompare(rightName, 'es');
    });

    const currentLeaderClubId =
        leadershipSummary.find((item) => item.is_current_leader)?.club_id ?? null;

    return {
        leadershipPeriods: periods,
        leadershipSummary,
        currentLeaderClubId,
    };
}

async function recomputeEntryPositions(
    supabase: ReturnType<typeof getAdminClient>,
    rankingId: string,
) {
    const entries = await getRankingEntries(supabase, rankingId);
    const sorted = [...entries].sort(compareRankingEntries);

    for (let index = 0; index < sorted.length; index += 1) {
        const entry = sorted[index];
        const nextPosition = index + 1;
        const previousPosition =
            entry.current_position === null || entry.current_position === undefined
                ? null
                : Number(entry.current_position);

        entry.source_previous_position = previousPosition;
        entry.current_position = nextPosition;

        await supabase
            .from('club_ranking_entries')
            .update({
                current_position: nextPosition,
                source_previous_position: previousPosition,
            })
            .eq('id', entry.id);
    }

    return sorted.length;
}

function buildEntryMutationPayload(
    rankingId: string,
    club: RankingClubRow,
    input: RankingEntryMutationInput,
    currentRating: number,
    previousRating?: number | null,
) {
    const initialRating = roundRating(toNumber(input.initialRating));
    const nextCurrentRating = roundRating(currentRating);

    return {
        ranking_id: rankingId,
        club_id: club.id,
        source_name: readText(input.sourceName) || club.name,
        source_region: readText(input.sourceRegion),
        source_position:
            input.sourcePosition === null || input.sourcePosition === undefined
                ? null
                : Number(input.sourcePosition),
        source_previous_position:
            input.sourcePreviousPosition === null || input.sourcePreviousPosition === undefined
                ? null
                : Number(input.sourcePreviousPosition),
        source_variation:
            input.sourceVariation === null || input.sourceVariation === undefined
                ? null
                : roundRating(toNumber(input.sourceVariation)),
        source_payload: withPreviousRating(
            input.sourcePayload,
            roundRating(previousRating ?? nextCurrentRating),
        ),
        initial_rating: initialRating,
        current_rating: nextCurrentRating,
        is_active: input.isActive !== false,
    };
}

async function finalizeEntryMutation(
    rankingId: string,
    _actorUserId?: string | null,
) {
    void _actorUserId;
    const supabase = getAdminClient();
    await recomputeEntryPositions(supabase, rankingId);
    await rebuildLeadershipHistory(supabase, rankingId);
    return getClubRankingDetail(rankingId);
}

async function markRankingStale(
    supabase: ReturnType<typeof getAdminClient>,
    ranking: RankingRow,
    match: MatchSnapshot,
    reason: string,
) {
    const nextDate = match.date_time ?? null;
    const shouldReplace =
        !ranking.stale_from_match_date ||
        (nextDate !== null &&
            ranking.stale_from_match_date !== null &&
            nextDate < ranking.stale_from_match_date);

    if (!ranking.stale_from_match_id || shouldReplace) {
        await supabase
            .from('club_rankings')
            .update({
                stale_from_match_id: match.id,
                stale_from_match_date: nextDate,
                stale_reason: reason,
            })
            .eq('id', ranking.id);
    }
}

async function applyManualAdjustments(
    supabase: ReturnType<typeof getAdminClient>,
    rankingId: string,
    entryMap: Map<string, RankingEntryRow>,
) {
    const { data, error } = await supabase
        .from('club_ranking_manual_adjustments')
        .select('*')
        .eq('ranking_id', rankingId)
        .order('created_at', { ascending: true });

    if (error) {
        throw createClubRankingQueryError(error, 'No se pudieron cargar los ajustes manuales del ranking.');
    }

    for (const adjustment of (data || []) as RankingManualAdjustmentRow[]) {
        const entry = entryMap.get(adjustment.club_id);
        if (!entry) continue;

        const currentRating = toNumber(entry.current_rating);
        const requestedValue = toNumber(adjustment.value);
        const nextRating =
            adjustment.mode === 'set'
                ? requestedValue
                : currentRating + requestedValue;

        entry.previous_rating = roundRating(currentRating);
        entry.source_payload = withPreviousRating(entry.source_payload, currentRating);
        entry.current_rating = roundRating(nextRating);

        await supabase
            .from('club_ranking_entries')
            .update({
                current_rating: entry.current_rating,
                source_payload: entry.source_payload,
            })
            .eq('ranking_id', rankingId)
            .eq('club_id', adjustment.club_id);

        await supabase
            .from('club_ranking_manual_adjustments')
            .update({ resulting_rating: entry.current_rating })
            .eq('id', adjustment.id);
    }
}

async function fetchRankingEntryMap(
    supabase: ReturnType<typeof getAdminClient>,
    rankingId: string,
) {
    const entries = await getRankingEntries(supabase, rankingId);
    return new Map(entries.map((entry) => [entry.club_id, entry]));
}

function isRankingEligibleForMatch(
    ranking: RankingRow,
    match: MatchSnapshot,
    entryMap: Map<string, RankingEntryRow>,
) {
    const normalizedSport = canonicalizeSportId(ranking.sport || null);
    const matchSport = canonicalizeSportId(match.sport_id || match.sport || null);
    const score = parseScore(match.score);

    if (!match.home_club_id || !match.away_club_id) return false;
    if (!entryMap.has(match.home_club_id) || !entryMap.has(match.away_club_id)) return false;
    if (normalizedSport && matchSport && normalizedSport !== matchSport) return false;
    if (readText(match.status)?.toLowerCase() !== 'final') return false;
    if (!score) return false;
    if (!isSeasonMatch(match, ranking.results_season)) return false;

    return true;
}

async function applyMatchToRanking(
    supabase: ReturnType<typeof getAdminClient>,
    ranking: RankingRow,
    entryMap: Map<string, RankingEntryRow>,
    match: MatchSnapshot,
    appliedMode: 'incremental' | 'backfill' | 'rebuild',
) {
    if (!match.home_club_id || !match.away_club_id) {
        return false;
    }

    const homeEntry = entryMap.get(match.home_club_id);
    const awayEntry = entryMap.get(match.away_club_id);
    const score = parseScore(match.score);

    if (!homeEntry || !awayEntry || !score) {
        return false;
    }

    const exchange = computeWorldRugbyExchange(
        ranking,
        toNumber(homeEntry.current_rating),
        toNumber(awayEntry.current_rating),
        score,
    );

    const homeRatingBefore = roundRating(toNumber(homeEntry.current_rating));
    const awayRatingBefore = roundRating(toNumber(awayEntry.current_rating));
    const homeRatingAfter = roundRating(homeRatingBefore + exchange.homeDelta);
    const awayRatingAfter = roundRating(awayRatingBefore + exchange.awayDelta);

    homeEntry.previous_rating = homeRatingBefore;
    awayEntry.previous_rating = awayRatingBefore;
    homeEntry.source_payload = withPreviousRating(homeEntry.source_payload, homeRatingBefore);
    awayEntry.source_payload = withPreviousRating(awayEntry.source_payload, awayRatingBefore);
    homeEntry.current_rating = homeRatingAfter;
    awayEntry.current_rating = awayRatingAfter;
    homeEntry.last_applied_match_id = match.id;
    awayEntry.last_applied_match_id = match.id;

    await supabase
        .from('club_ranking_entries')
        .update({
            current_rating: homeRatingAfter,
            source_payload: homeEntry.source_payload,
            last_applied_match_id: match.id,
        })
        .eq('ranking_id', ranking.id)
        .eq('club_id', homeEntry.club_id);

    await supabase
        .from('club_ranking_entries')
        .update({
            current_rating: awayRatingAfter,
            source_payload: awayEntry.source_payload,
            last_applied_match_id: match.id,
        })
        .eq('ranking_id', ranking.id)
        .eq('club_id', awayEntry.club_id);

    await supabase.from('club_ranking_match_applications').insert({
        ranking_id: ranking.id,
        match_id: match.id,
        match_date_time: match.date_time,
        applied_mode: appliedMode,
        home_club_id: homeEntry.club_id,
        away_club_id: awayEntry.club_id,
        home_rating_before: homeRatingBefore,
        away_rating_before: awayRatingBefore,
        home_delta: exchange.homeDelta,
        away_delta: exchange.awayDelta,
        home_rating_after: homeRatingAfter,
        away_rating_after: awayRatingAfter,
        home_score: score.home,
        away_score: score.away,
        margin: exchange.margin,
        result: exchange.result,
        metadata: {
            ...exchange.metadata,
            tournamentId: match.tournament_id,
            phaseId: match.phase_id,
            roundId: match.round_uuid,
        },
    });

    await supabase
        .from('club_rankings')
        .update({
            last_incremental_match_id: match.id,
            stale_from_match_id: null,
            stale_from_match_date: null,
            stale_reason: null,
        })
        .eq('id', ranking.id);

    return true;
}

async function listEligibleSeasonMatches(
    supabase: ReturnType<typeof getAdminClient>,
    ranking: RankingRow,
    clubIds: string[],
) {
    if (clubIds.length === 0) return [];

    const range = getSeasonRange(ranking.results_season);
    const { data, error } = await supabase
        .from('matches')
        .select(MATCH_SELECT)
        .eq('status', 'final')
        .gte('date_time', range.start)
        .lt('date_time', range.end)
        .in('home_club_id', clubIds)
        .in('away_club_id', clubIds)
        .order('date_time', { ascending: true })
        .order('id', { ascending: true });

    if (error) {
        throw createClubRankingQueryError(error, 'No se pudieron cargar los partidos del ranking.');
    }

    return enrichMatchesWithTournamentSport(
        supabase,
        ((data || []) as MatchSnapshot[]),
    );
}

async function rebuildRankingInternal(
    rankingId: string,
    actorUserId?: string | null,
) {
    const supabase = getAdminClient();
    const ranking = await getRankingRow(supabase, rankingId);
    const entries = await getRankingEntries(supabase, rankingId);
    const activeEntries = entries.filter((entry) => entry.is_active);

    for (const entry of entries) {
        const resetRating = roundRating(toNumber(entry.initial_rating));
        entry.previous_rating = resetRating;
        entry.current_rating = resetRating;
        entry.current_position = null;
        entry.source_previous_position = null;
        entry.last_applied_match_id = null;
        entry.source_payload = withPreviousRating(entry.source_payload, resetRating);

        await supabase
            .from('club_ranking_entries')
            .update({
                current_rating: resetRating,
                current_position: null,
                source_previous_position: null,
                source_payload: entry.source_payload,
                last_applied_match_id: null,
            })
            .eq('id', entry.id);
    }

    await supabase
        .from('club_ranking_match_applications')
        .delete()
        .eq('ranking_id', rankingId);

    const entryMap = await fetchRankingEntryMap(supabase, rankingId);
    const seasonMatches = await listEligibleSeasonMatches(
        supabase,
        ranking,
        activeEntries.map((entry) => entry.club_id),
    );

    let lastAppliedMatchId: string | null = null;
    for (const match of seasonMatches) {
        if (!isRankingEligibleForMatch(ranking, match, entryMap)) continue;
        const applied = await applyMatchToRanking(
            supabase,
            ranking,
            entryMap,
            match,
            ranking.backfill_completed_at ? 'rebuild' : 'backfill',
        );
        if (applied) {
            lastAppliedMatchId = match.id;
        }
    }

    await applyManualAdjustments(supabase, rankingId, entryMap);
    await recomputeEntryPositions(supabase, rankingId);

    await supabase
        .from('club_rankings')
        .update({
            backfill_completed_at: new Date().toISOString(),
            last_incremental_match_id: lastAppliedMatchId,
            stale_from_match_id: null,
            stale_from_match_date: null,
            stale_reason: null,
        })
        .eq('id', rankingId);

    await writeAudit(
        supabase,
        actorUserId,
        rankingId,
        ranking.backfill_completed_at ? 'rebuild' : 'backfill',
        {
            appliedMatches: seasonMatches.length,
            resultsSeason: ranking.results_season,
        },
    );

    await rebuildLeadershipHistory(supabase, rankingId);

    return getClubRankingDetail(rankingId);
}

export async function listClubRankings() {
    const supabase = getAdminClient();
    const { data, error } = await supabase
        .from('club_rankings')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        throw createClubRankingQueryError(error, 'No se pudieron cargar los rankings.');
    }

    return (data || []) as RankingRow[];
}

export async function updateClubRankingMetadata(
    rankingId: string,
    input: {
        name: string;
        description?: string | null;
        positionLabels?: unknown;
        actorUserId?: string | null;
    },
) {
    const nextName = input.name.trim();
    if (!nextName) {
        throw new Error('El ranking necesita un nombre.');
    }

    const supabase = getAdminClient();
    const ranking = await getRankingRow(supabase, rankingId);
    const nextDescription = readText(input.description);
    const nextMetadata = {
        ...(ranking.metadata && typeof ranking.metadata === 'object' ? ranking.metadata : {}),
    };
    const changes: Record<string, unknown> = {};

    if (ranking.name !== nextName) {
        changes.name = {
            before: ranking.name,
            after: nextName,
        };
    }

    if ((ranking.description ?? null) !== nextDescription) {
        changes.description = {
            before: ranking.description ?? null,
            after: nextDescription,
        };
    }

    if (input.positionLabels !== undefined) {
        const previousPositionLabels = normalizeRankingPositionLabels(nextMetadata.positionLabels);
        const nextPositionLabels = normalizeRankingPositionLabels(input.positionLabels);
        if (JSON.stringify(previousPositionLabels) !== JSON.stringify(nextPositionLabels)) {
            nextMetadata.positionLabels = nextPositionLabels;
            changes.positionLabels = {
                before: previousPositionLabels,
                after: nextPositionLabels,
            };
        }
    }

    if (Object.keys(changes).length === 0) {
        return getClubRankingDetail(rankingId);
    }

    const { error } = await supabase
        .from('club_rankings')
        .update({
            name: nextName,
            description: nextDescription,
            metadata: nextMetadata,
        })
        .eq('id', rankingId);

    if (error) {
        throw createClubRankingQueryError(
            error,
            `No se pudo actualizar el ranking: ${error.message}`,
        );
    }

    await writeAudit(
        supabase,
        input.actorUserId,
        rankingId,
        'metadata_updated',
        changes,
    );

    return getClubRankingDetail(rankingId);
}

export async function getClubRankingDetail(rankingId: string): Promise<RankingDetail> {
    const supabase = getAdminClient();
    const ranking = await getRankingRow(supabase, rankingId);
    const [entries, recentApplicationsRes, manualAdjustmentsRes, leadershipHistory] = await Promise.all([
        getRankingEntries(supabase, rankingId),
        supabase
            .from('club_ranking_match_applications')
            .select('*')
            .eq('ranking_id', rankingId)
            .order('match_date_time', { ascending: false })
            .limit(15),
        supabase
            .from('club_ranking_manual_adjustments')
            .select('*')
            .eq('ranking_id', rankingId)
            .order('created_at', { ascending: false })
            .limit(20),
        getLeadershipHistory(supabase, rankingId),
    ]);

    if (recentApplicationsRes.error) {
        throw createClubRankingQueryError(
            recentApplicationsRes.error,
            'No se pudo cargar el historial reciente del ranking.',
        );
    }

    if (manualAdjustmentsRes.error) {
        throw createClubRankingQueryError(
            manualAdjustmentsRes.error,
            'No se pudieron cargar los ajustes manuales del ranking.',
        );
    }

    return {
        ranking,
        entries,
        recentApplications: ((recentApplicationsRes.data || []) as RankingApplicationRow[]).map((row) => ({
            ...row,
            home_rating_before: roundRating(toNumber(row.home_rating_before)),
            away_rating_before: roundRating(toNumber(row.away_rating_before)),
            home_delta: roundRating(toNumber(row.home_delta)),
            away_delta: roundRating(toNumber(row.away_delta)),
            home_rating_after: roundRating(toNumber(row.home_rating_after)),
            away_rating_after: roundRating(toNumber(row.away_rating_after)),
        })),
        manualAdjustments: ((manualAdjustmentsRes.data || []) as RankingManualAdjustmentRow[]).map((row) => ({
            ...row,
            value: roundRating(toNumber(row.value)),
            resulting_rating: row.resulting_rating === null ? null : roundRating(toNumber(row.resulting_rating)),
        })),
        leadershipPeriods: leadershipHistory.leadershipPeriods,
        leadershipSummary: leadershipHistory.leadershipSummary,
        currentLeaderClubId: leadershipHistory.currentLeaderClubId,
    };
}

export async function importClubRankingBase(input: ImportRankingBaseInput) {
    if (!input.id || !input.name.trim()) {
        throw new Error('El ranking necesita un id y un nombre.');
    }

    if (!Array.isArray(input.entries) || input.entries.length === 0) {
        throw new Error('No hay filas validas para importar en la base del ranking.');
    }

    const sport = canonicalizeSportId(input.sport) || 'rugby';
    const season = readText(input.season) || String(new Date().getUTCFullYear());
    const resultsSeason =
        input.resultsSeason && Number.isFinite(Number(input.resultsSeason))
            ? Number(input.resultsSeason)
            : Number(season) + 1;

    const normalizedEntries = input.entries.map((entry, index) => ({
        club_id: entry.clubId,
        source_name: entry.sourceName,
        initial_rating: roundRating(toNumber(entry.initialRating)),
        current_rating: roundRating(toNumber(entry.initialRating)),
        source_row_index: entry.sourceRowIndex ?? index,
        source_region: readText(entry.sourceRegion),
        source_position:
            entry.sourcePosition === null || entry.sourcePosition === undefined
                ? null
                : Number(entry.sourcePosition),
        source_previous_position:
            entry.sourcePreviousPosition === null || entry.sourcePreviousPosition === undefined
                ? null
                : Number(entry.sourcePreviousPosition),
        source_variation:
            entry.sourceVariation === null || entry.sourceVariation === undefined
                ? null
                : roundRating(toNumber(entry.sourceVariation)),
        source_payload: withPreviousRating(
            entry.sourcePayload,
            roundRating(toNumber(entry.initialRating)),
        ),
    }));
    const seenClubIds = new Set<string>();
    let duplicatesIgnored = 0;
    const dedupedEntries = normalizedEntries.filter((entry) => {
        if (seenClubIds.has(entry.club_id)) {
            duplicatesIgnored += 1;
            return false;
        }
        seenClubIds.add(entry.club_id);
        return true;
    });

    if (dedupedEntries.length === 0) {
        throw new Error('No hay filas validas para importar en la base del ranking.');
    }

    const supabase = getAdminClient();
    const rankingPayload = {
        id: input.id,
        name: input.name.trim(),
        sport,
        season,
        results_season: resultsSeason,
        scope: readText(input.scope) || 'clubes-designados',
        description: readText(input.description),
        algorithm: 'world_rugby',
        home_advantage: 3,
        margin_threshold: 15,
        margin_multiplier: 1.5,
        event_multiplier: 1,
        initial_imported_at: new Date().toISOString(),
        backfill_completed_at: null,
        stale_from_match_id: null,
        stale_from_match_date: null,
        stale_reason: null,
        last_incremental_match_id: null,
        metadata: {
            importedRows: dedupedEntries.length,
            duplicatesIgnored,
        },
    };

    const { error: rankingError } = await supabase
        .from('club_rankings')
        .upsert(rankingPayload, { onConflict: 'id' });

    if (rankingError) {
        throw createClubRankingQueryError(
            rankingError,
            `No se pudo guardar el ranking: ${rankingError.message}`,
        );
    }

    await supabase.from('club_ranking_match_applications').delete().eq('ranking_id', input.id);
    await supabase.from('club_ranking_manual_adjustments').delete().eq('ranking_id', input.id);
    await supabase.from('club_ranking_leadership_periods').delete().eq('ranking_id', input.id);
    await supabase.from('club_ranking_entries').delete().eq('ranking_id', input.id);

    const { error: entriesError } = await supabase.from('club_ranking_entries').insert(
        dedupedEntries.map((entry) => ({
            ranking_id: input.id,
            ...entry,
        })),
    );

    if (entriesError) {
        throw createClubRankingQueryError(
            entriesError,
            `No se pudo guardar la base del ranking: ${entriesError.message}`,
        );
    }

    await recomputeEntryPositions(supabase, input.id);
    await rebuildLeadershipHistory(supabase, input.id);
    await writeAudit(
        supabase,
        input.actorUserId,
        input.id,
        'import_base',
        {
            importedRows: dedupedEntries.length,
            duplicatesIgnored,
            resultsSeason,
        },
    );

    return getClubRankingDetail(input.id);
}

export async function backfillClubRankingSeason(
    rankingId: string,
    actorUserId?: string | null,
) {
    const supabase = getAdminClient();
    const ranking = await getRankingRow(supabase, rankingId);

    if (ranking.backfill_completed_at) {
        throw new Error(`La corrida inicial ${ranking.results_season} ya fue ejecutada. Desde ahora el ranking se actualiza con resultados finales guardados entre clubes del ranking.`);
    }

    return rebuildRankingInternal(rankingId, actorUserId);
}

export async function rebuildClubRankingFromMatch(
    rankingId: string,
    matchId: string,
    actorUserId?: string | null,
) {
    const targetMatch = await getMatchSnapshot(matchId);
    if (!targetMatch) {
        throw new Error('No se encontro el partido desde el cual queres recalcular.');
    }

    const detail = await rebuildRankingInternal(rankingId, actorUserId);
    const supabase = getAdminClient();
    await writeAudit(
        supabase,
        actorUserId,
        rankingId,
        'recalculate_from_match',
        {
            matchId,
            matchDateTime: targetMatch.date_time,
        },
    );
    return detail;
}

export async function createClubRankingEntry(
    rankingId: string,
    input: RankingEntryMutationInput,
) {
    if (!input.clubId) {
        throw new Error('Tenes que seleccionar un club.');
    }

    if (!Number.isFinite(input.initialRating)) {
        throw new Error('La fila necesita un rating inicial numerico.');
    }

    const supabase = getAdminClient();
    const ranking = await getRankingRow(supabase, rankingId);

    const [club, existingEntry] = await Promise.all([
        getClubById(supabase, input.clubId),
        getRankingEntryByClubId(supabase, rankingId, input.clubId),
    ]);

    assertClubMatchesRankingSport(ranking, club);

    if (existingEntry) {
        throw new Error('Ese club ya forma parte del ranking.');
    }

    const payload = buildEntryMutationPayload(
        rankingId,
        club,
        input,
        roundRating(input.initialRating),
        roundRating(input.initialRating),
    );

    const { error } = await supabase
        .from('club_ranking_entries')
        .insert(payload);

    if (error) {
        throw createClubRankingQueryError(
            error,
            `No se pudo agregar el club al ranking: ${error.message}`,
        );
    }

    await writeAudit(
        supabase,
        input.actorUserId,
        rankingId,
        'create_entry',
        {
            clubId: input.clubId,
            sourceName: payload.source_name,
            initialRating: payload.initial_rating,
            isActive: payload.is_active,
        },
    );

    return finalizeEntryMutation(rankingId, input.actorUserId);
}

export async function updateClubRankingEntry(
    rankingId: string,
    entryId: string,
    input: RankingEntryMutationInput,
) {
    if (!input.clubId) {
        throw new Error('Tenes que seleccionar un club.');
    }

    if (!Number.isFinite(input.initialRating)) {
        throw new Error('La fila necesita un rating inicial numerico.');
    }

    const supabase = getAdminClient();
    const [ranking, existingEntry, club] = await Promise.all([
        getRankingRow(supabase, rankingId),
        getRankingEntryById(supabase, rankingId, entryId),
        getClubById(supabase, input.clubId),
    ]);
    const duplicateEntry = await getRankingEntryByClubId(supabase, rankingId, input.clubId);

    assertClubMatchesRankingSport(ranking, club);

    if (duplicateEntry && duplicateEntry.id !== existingEntry.id) {
        throw new Error('Ese club ya forma parte del ranking.');
    }

    const nextInitialRating = roundRating(input.initialRating);
    const keepLiveRating =
        Boolean(ranking.backfill_completed_at || ranking.last_incremental_match_id) &&
        existingEntry.club_id === input.clubId;
    const nextCurrentRating = keepLiveRating
        ? roundRating(toNumber(existingEntry.current_rating))
        : nextInitialRating;
    const nextPreviousRating = keepLiveRating
        ? readPreviousRating(existingEntry.source_payload, existingEntry.current_rating)
        : nextInitialRating;

    const payload = buildEntryMutationPayload(
        rankingId,
        club,
        input,
        nextCurrentRating,
        nextPreviousRating,
    );

    const { error } = await supabase
        .from('club_ranking_entries')
        .update(payload)
        .eq('ranking_id', rankingId)
        .eq('id', entryId);

    if (error) {
        throw createClubRankingQueryError(
            error,
            `No se pudo actualizar la fila del ranking: ${error.message}`,
        );
    }

    if (existingEntry.club_id !== input.clubId) {
        await supabase
            .from('club_ranking_manual_adjustments')
            .delete()
            .eq('ranking_id', rankingId)
            .eq('club_id', existingEntry.club_id);
    }

    await writeAudit(
        supabase,
        input.actorUserId,
        rankingId,
        'update_entry',
        {
            entryId,
            previousClubId: existingEntry.club_id,
            nextClubId: input.clubId,
            sourceName: payload.source_name,
            initialRating: payload.initial_rating,
            isActive: payload.is_active,
        },
    );

    return finalizeEntryMutation(rankingId, input.actorUserId);
}

export async function deleteClubRankingEntry(
    rankingId: string,
    entryId: string,
    actorUserId?: string | null,
) {
    const supabase = getAdminClient();
    const entry = await getRankingEntryById(supabase, rankingId, entryId);

    const { error } = await supabase
        .from('club_ranking_entries')
        .delete()
        .eq('ranking_id', rankingId)
        .eq('id', entryId);

    if (error) {
        throw createClubRankingQueryError(
            error,
            `No se pudo quitar el club del ranking: ${error.message}`,
        );
    }

    await supabase
        .from('club_ranking_manual_adjustments')
        .delete()
        .eq('ranking_id', rankingId)
        .eq('club_id', entry.club_id);

    await writeAudit(
        supabase,
        actorUserId,
        rankingId,
        'delete_entry',
        {
            entryId,
            clubId: entry.club_id,
            sourceName: entry.source_name,
        },
    );

    return finalizeEntryMutation(rankingId, actorUserId);
}

export async function applyManualClubRankingAdjustment(
    rankingId: string,
    input: ManualAdjustmentInput,
) {
    if (!input.clubId) {
        throw new Error('Tenes que seleccionar un club.');
    }
    if (!Number.isFinite(input.value)) {
        throw new Error('El ajuste manual necesita un valor numerico.');
    }
    if (!input.reason.trim()) {
        throw new Error('El ajuste manual necesita un motivo.');
    }

    const supabase = getAdminClient();
    const entryMap = await fetchRankingEntryMap(supabase, rankingId);
    const entry = entryMap.get(input.clubId);

    if (!entry) {
        throw new Error('Ese club no pertenece al ranking seleccionado.');
    }

    const currentRating = roundRating(toNumber(entry.current_rating));
    const nextRating =
        input.mode === 'set'
            ? roundRating(input.value)
            : roundRating(currentRating + input.value);

    const { error: adjustmentError } = await supabase
        .from('club_ranking_manual_adjustments')
        .insert({
            ranking_id: rankingId,
            club_id: input.clubId,
            mode: input.mode,
            value: roundRating(input.value),
            reason: input.reason.trim(),
            resulting_rating: nextRating,
            created_by: input.actorUserId ?? null,
        });

    if (adjustmentError) {
        throw createClubRankingQueryError(
            adjustmentError,
            `No se pudo guardar el ajuste manual: ${adjustmentError.message}`,
        );
    }

    const { error: entryError } = await supabase
        .from('club_ranking_entries')
        .update({
            current_rating: nextRating,
            source_payload: withPreviousRating(entry.source_payload, currentRating),
        })
        .eq('ranking_id', rankingId)
        .eq('club_id', input.clubId);

    if (entryError) {
        throw createClubRankingQueryError(
            entryError,
            `No se pudo aplicar el ajuste manual: ${entryError.message}`,
        );
    }

    await recomputeEntryPositions(supabase, rankingId);
    await rebuildLeadershipHistory(supabase, rankingId);
    await writeAudit(
        supabase,
        input.actorUserId,
        rankingId,
        'manual_adjustment',
        {
            clubId: input.clubId,
            mode: input.mode,
            value: input.value,
            resultingRating: nextRating,
            reason: input.reason.trim(),
        },
    );

    return getClubRankingDetail(rankingId);
}

async function findCandidateRankingsForMatch(
    supabase: ReturnType<typeof getAdminClient>,
    match: MatchSnapshot,
) {
    if (!match.home_club_id || !match.away_club_id) return [] as RankingRow[];

    const { data: memberships, error } = await supabase
        .from('club_ranking_entries')
        .select('ranking_id, club_id')
        .in('club_id', [match.home_club_id, match.away_club_id])
        .eq('is_active', true);

    if (error) {
        throw createClubRankingQueryError(
            error,
            'No se pudo resolver a que rankings pertenece el partido.',
        );
    }

    const grouped = new Map<string, Set<string>>();
    ((memberships || []) as Array<{ ranking_id: string; club_id: string }>).forEach((row) => {
        const set = grouped.get(row.ranking_id) ?? new Set<string>();
        set.add(row.club_id);
        grouped.set(row.ranking_id, set);
    });

    const rankingIds = Array.from(grouped.entries())
        .filter(([, clubIds]) => clubIds.has(match.home_club_id as string) && clubIds.has(match.away_club_id as string))
        .map(([rankingId]) => rankingId);

    if (rankingIds.length === 0) return [] as RankingRow[];

    return listRankingRows(supabase, rankingIds);
}

async function findRankingsWithAppliedMatch(
    supabase: ReturnType<typeof getAdminClient>,
    matchId: string,
) {
    const { data, error } = await supabase
        .from('club_ranking_match_applications')
        .select('ranking_id')
        .eq('match_id', matchId);

    if (error) {
        throw createClubRankingQueryError(
            error,
            'No se pudieron resolver los rankings ya aplicados para este partido.',
        );
    }

    const rankingIds = Array.from(
        new Set(
            ((data || []) as Array<{ ranking_id: string }>)
                .map((row) => row.ranking_id)
                .filter(Boolean),
        ),
    );

    return listRankingRows(supabase, rankingIds);
}

async function resolveRankingsForMatchUpdate(
    supabase: ReturnType<typeof getAdminClient>,
    matchId: string,
    currentMatch: MatchSnapshot | null,
    previousMatch: MatchSnapshot | null,
) {
    const rankingMap = new Map<string, RankingRow>();

    const rankingGroups = await Promise.all([
        currentMatch
            ? findCandidateRankingsForMatch(supabase, currentMatch)
            : Promise.resolve([] as RankingRow[]),
        previousMatch
            ? findCandidateRankingsForMatch(supabase, previousMatch)
            : Promise.resolve([] as RankingRow[]),
        findRankingsWithAppliedMatch(supabase, matchId),
    ]);

    for (const rankings of rankingGroups) {
        rankings.forEach((ranking) => rankingMap.set(ranking.id, ranking));
    }

    return Array.from(rankingMap.values());
}

export async function syncClubRankingsForMatchUpdate(
    matchId: string,
    previousMatch?: MatchSnapshot | null,
) {
    const supabase = getAdminClient();
    const currentMatch = await getMatchSnapshot(matchId);
    const normalizedPreviousMatch = normalizeMatchSnapshot(previousMatch);
    const candidateRankings = await resolveRankingsForMatchUpdate(
        supabase,
        matchId,
        currentMatch,
        normalizedPreviousMatch,
    );

    if (candidateRankings.length === 0) {
        return { processedRankings: 0 };
    }
    let processedRankings = 0;

    for (const ranking of candidateRankings) {
        const { data: application } = await supabase
            .from('club_ranking_match_applications')
            .select('*')
            .eq('ranking_id', ranking.id)
            .eq('match_id', matchId)
            .maybeSingle();

        if (application) {
            if (
                !currentMatch ||
                hasMeaningfulMatchChange(normalizedPreviousMatch ?? null, currentMatch)
            ) {
                await markRankingStale(
                    supabase,
                    ranking,
                    currentMatch ?? normalizedPreviousMatch ?? {
                        id: matchId,
                        home_club_id: null,
                        away_club_id: null,
                        score: null,
                        status: null,
                        date_time: null,
                        sport: ranking.sport,
                        sport_id: ranking.sport,
                        tournament_id: null,
                        phase_id: null,
                        group_id: null,
                        round_uuid: null,
                        updated_at: null,
                    },
                    'El partido ya aplicado cambio y requiere recálculo desde ese punto.',
                );
            }
            processedRankings += 1;
            continue;
        }

        if (!currentMatch) {
            continue;
        }

        if (ranking.stale_from_match_id) {
            processedRankings += 1;
            continue;
        }

        const entryMap = await fetchRankingEntryMap(supabase, ranking.id);
        if (!isRankingEligibleForMatch(ranking, currentMatch, entryMap)) {
            continue;
        }

        if (ranking.last_incremental_match_id) {
            const lastAppliedMatch = await getMatchSnapshot(ranking.last_incremental_match_id);
            if (lastAppliedMatch && compareMatchOrder(currentMatch, lastAppliedMatch) < 0) {
                await markRankingStale(
                    supabase,
                    ranking,
                    currentMatch,
                    'Se guardo un partido anterior al ultimo resultado aplicado. Recalcula desde ese punto para mantener el orden cronologico.',
                );
                processedRankings += 1;
                continue;
            }
        }

        await applyMatchToRanking(supabase, ranking, entryMap, currentMatch, 'incremental');
        await recomputeEntryPositions(supabase, ranking.id);
        await rebuildLeadershipHistory(supabase, ranking.id);
        processedRankings += 1;
    }

    return { processedRankings };
}

export async function syncClubRankingsForMatches(matchIds: string[]) {
    const uniqueIds = Array.from(new Set(matchIds.filter(Boolean)));
    let processedRankings = 0;

    for (const matchId of uniqueIds) {
        const result = await syncClubRankingsForMatchUpdate(matchId);
        processedRankings += result.processedRankings;
    }

    return { processedRankings, processedMatches: uniqueIds.length };
}

export async function getMatchRankingSnapshot(matchId: string) {
    return getMatchSnapshot(matchId);
}
