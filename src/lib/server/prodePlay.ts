import { createAdminClient } from '@/lib/supabase/admin';
import { getAllTournaments } from '@/lib/data/tournaments';
import { normalizeProdeSourceBinding } from '@/lib/prode/source';
import { applyScoringRulesToPredictionRows, refreshCompetitionScoreboards, resolveProdeScoringRules } from '@/lib/server/prodeScoring';
import { getTournamentFixtures, getTournamentIds } from '@/lib/services/flashscore';
import { getEspnFootballProdeEvents, inferEspnFootballLeague } from '@/lib/services/espnFootball';
import { isFootballSport } from '@/lib/externalProviderPolicy';
import { resolveTeamLogo } from '@/lib/utils/teamLogoOverrides';
import type {
    ProdeCompetitionStatus,
    ProdePlayEvent,
    ProdePlayLeaderboardEntry,
    ProdePlayOfficialResult,
    ProdePlayPersonalSummary,
    ProdePlayPrediction,
    ProdePlayRuleItem,
    ProdePlayRulesSummary,
    ProdePlayView,
    ProdePredictionOutcome,
} from '@/lib/prode/types';
import type { Tournament } from '@/lib/types';

type AnyRow = Record<string, unknown>;
type QueryError = { message?: string | null } | null;

type QueryResult = { data: AnyRow[] | null; error: QueryError };
type MaybeSingleResult = { data: AnyRow | null; error: QueryError };
type MutationResult = { data: AnyRow[] | AnyRow | null; error: QueryError };

interface LooseQueryBuilder extends PromiseLike<QueryResult> {
    select(columns: string): LooseQueryBuilder;
    eq(column: string, value: string | number | boolean): LooseQueryBuilder;
    in(column: string, values: string[]): LooseQueryBuilder;
    order(column: string, options?: { ascending?: boolean }): LooseQueryBuilder;
    maybeSingle(): PromiseLike<MaybeSingleResult>;
    single(): PromiseLike<MaybeSingleResult>;
}

interface LooseMutationBuilder extends PromiseLike<MutationResult> {
    select(columns: string): LooseMutationBuilder;
    eq(column: string, value: string | number | boolean): LooseMutationBuilder;
    single(): PromiseLike<MaybeSingleResult>;
}

interface LooseMutationClient {
    from(table: string): {
        select(columns: string): LooseQueryBuilder;
        insert(payload: AnyRow | AnyRow[]): LooseMutationBuilder;
        update(payload: AnyRow): LooseMutationBuilder;
        upsert(payload: AnyRow | AnyRow[], options?: { onConflict?: string }): PromiseLike<MutationResult>;
    };
}

type UserIdentity = {
    name: string;
    avatarUrl: string | null;
};

type BaseMatchRow = {
    sourceType: 'local' | 'external';
    localMatchId: string | null;
    externalProvider: string | null;
    externalMatchId: string | null;
    tournamentId: string | null;
    homeLabel: string;
    awayLabel: string;
    startsAt: string;
    status: ProdePlayEvent['status'];
    officialResult: Record<string, unknown> | null;
    matchSnapshot: Record<string, unknown>;
};

const EVENT_SYNC_TTL_MS = 30_000;
// Techo de espera para CUALQUIER llamada a un proveedor externo (ESPN /
// FlashScore) dentro del render. Sin esto, un proveedor lento o caído cuelga
// el SSR de /prode/[slug] hasta el timeout de la plataforma. Ante timeout
// degradamos al fallback (cache local) en vez de bloquear.
const EXTERNAL_FETCH_TIMEOUT_MS = 6_000;

const eventSyncInFlight = new Map<string, Promise<void>>();
const eventSyncCompletedAt = new Map<string, number>();

async function withExternalTimeout<T>(operation: Promise<T>, fallback: T): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeoutGuard = new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), EXTERNAL_FETCH_TIMEOUT_MS);
    });

    try {
        return await Promise.race([operation, timeoutGuard]);
    } catch {
        return fallback;
    } finally {
        if (timer) clearTimeout(timer);
    }
}

function toSafeString(value: unknown) {
    return typeof value === 'string' ? value : '';
}

function toNullableString(value: unknown) {
    return typeof value === 'string' && value.trim() ? value : null;
}

function toFiniteNumber(value: unknown, fallback = 0) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : fallback;
}

function toNullableNumber(value: unknown) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : null;
}

function toRecord(value: unknown) {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : {};
}

function toRelatedRecord(value: unknown) {
    if (Array.isArray(value)) {
        return toRecord(value[0]);
    }

    return toRecord(value);
}

function toBoolean(value: unknown) {
    return typeof value === 'boolean' ? value : false;
}

function resolveStoredLogo(...sources: Array<Record<string, unknown> | null>) {
    for (const source of sources) {
        if (!source) continue;

        const directLogo = toNullableString(
            source.logo_url
            ?? source.logo
            ?? source.image_path
            ?? source.small_image_path
            ?? source.team_logo,
        );

        if (directLogo) {
            return directLogo;
        }
    }

    return null;
}

function toOutcome(value: unknown): ProdePredictionOutcome | null {
    return value === 'home' || value === 'draw' || value === 'away'
        ? value
        : null;
}

function normalizeCompetitionStatus(value: unknown): ProdeCompetitionStatus {
    return value === 'draft' || value === 'published' || value === 'active' || value === 'finished' || value === 'archived'
        ? value
        : 'draft';
}

function normalizeEventStatus(value: unknown): ProdePlayEvent['status'] {
    // Normalizamos mayúsculas/espacios/guiones para tolerar literales de distintos
    // proveedores ('FT', 'In Progress', 'after-penalties', etc.). Si un partido
    // terminado quedara como 'scheduled', el motor no lo puntuaría nunca y la UI
    // podría reabrir picks, así que cubrimos los estados finales/en-juego conocidos.
    const key = toSafeString(value).trim().toLowerCase().replace(/[\s-]+/g, '_');
    switch (key) {
        case 'live':
        case 'in_progress':
        case 'inprogress':
        case 'playing':
        case 'halftime':
        case 'half_time':
        case 'ht':
        case '1h':
        case '2h':
        case 'first_half':
        case 'second_half':
        case 'extra_time':
        case 'et':
            return 'live';
        case 'final':
        case 'finished':
        case 'completed':
        case 'ft':
        case 'full_time':
        case 'fulltime':
        case 'aet':
        case 'pen':
        case 'after_extra_time':
        case 'after_penalties':
        case 'ended':
        case 'awarded':
        case 'walkover':
        case 'wo':
            return 'final';
        case 'cancelled':
        case 'canceled':
        case 'abandoned':
        case 'aborted':
            return 'cancelled';
        case 'postponed':
        case 'suspended':
        case 'susp':
        case 'interrupted':
        case 'delayed':
            return 'postponed';
        case 'scored':
            return 'scored';
        default:
            return 'scheduled';
    }
}

function normalizeLookupKey(value: unknown) {
    return toSafeString(value)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

function getExternalMatchDateTime(match: AnyRow) {
    const directDateTime = toNullableString(match.date_time) || toNullableString(match.start_date);
    if (directDateTime) {
        return directDateTime;
    }

    const timestamp = toNullableNumber(
        match.start_time
        ?? match.timestamp
        ?? match.time
        ?? match.event_timestamp,
    );

    return timestamp !== null
        ? new Date(timestamp * 1000).toISOString()
        : null;
}

function getExternalMatchScore(match: AnyRow) {
    const score = toRecord(match.score);
    const nestedScores = toRecord(match.scores);

    const homeScore = toNullableNumber(
        score.home
        ?? score.home_score
        ?? score.homeScore
        ?? nestedScores.home
        ?? nestedScores.home_score
        ?? nestedScores.homeScore
        ?? match.home_score
        ?? match.homeScore,
    );
    const awayScore = toNullableNumber(
        score.away
        ?? score.away_score
        ?? score.awayScore
        ?? nestedScores.away
        ?? nestedScores.away_score
        ?? nestedScores.awayScore
        ?? match.away_score
        ?? match.awayScore,
    );

    return {
        rawScore: Object.keys(score).length ? score : nestedScores,
        homeScore,
        awayScore,
    };
}

function extractExternalFixtureMatches(payload: unknown): AnyRow[] {
    const rawList = Array.isArray(payload)
        ? payload
        : Array.isArray(toRecord(payload).DATA)
            ? toRecord(payload).DATA as unknown[]
            : Array.isArray(toRecord(payload).data)
                ? toRecord(payload).data as unknown[]
                : [];

    const matches: AnyRow[] = [];

    for (const item of rawList) {
        const row = toRecord(item);
        const nestedMatches = Array.isArray(row.matches) ? row.matches : null;

        if (nestedMatches) {
            for (const nestedItem of nestedMatches) {
                const nestedRow = toRecord(nestedItem);
                if (Object.keys(nestedRow).length) {
                    matches.push(nestedRow);
                }
            }
            continue;
        }

        if (Object.keys(row).length) {
            matches.push(row);
        }
    }

    return matches;
}

function findCatalogTournamentByName(name: string | null, displayName: string | null) {
    const lookupKeys = [name, displayName]
        .map((value) => normalizeLookupKey(value))
        .filter(Boolean);

    if (!lookupKeys.length) {
        return null;
    }

    const tournaments = getAllTournaments().filter((tournament) => Boolean(tournament.url));

    return tournaments.find((tournament: Tournament) => {
        const candidateKeys = [
            tournament.name,
            tournament.displayName,
            tournament.originalName,
            tournament.nameEs,
        ]
            .map((value) => normalizeLookupKey(value))
            .filter(Boolean);

        return lookupKeys.some((lookupKey) => (
            candidateKeys.includes(lookupKey)
            || candidateKeys.some((candidateKey) => candidateKey.includes(lookupKey) || lookupKey.includes(candidateKey))
        ));
    }) || null;
}

function getSportLabel(value: string | null) {
    switch (value) {
        case 'rugby':
            return 'Rugby';
        case 'football':
            return 'Futbol';
        case 'basketball':
            return 'Basquet';
        case 'tennis':
            return 'Tenis';
        default:
            return value;
    }
}

function getRuleNumber(record: Record<string, unknown>, ...keys: string[]) {
    for (const key of keys) {
        const numericValue = toNullableNumber(record[key]);
        if (numericValue !== null) {
            return numericValue;
        }
    }

    return null;
}

function resolveRulesSummary(
    competitionRow: AnyRow,
    privateLeagueRow?: AnyRow | null,
    rulesetRow?: AnyRow | null,
): ProdePlayRulesSummary {
    const competitionMetadata = toRecord(competitionRow.metadata);
    const leagueMetadata = toRecord(privateLeagueRow?.metadata);
    const rulesetModel = toRecord(rulesetRow?.scoring_model);
    const rulesetPoints = toRecord(rulesetModel.points);
    const defaultPrivateLeagueRules = toRecord(competitionMetadata.defaultPrivateLeagueRules);
    const leagueRules = toRecord(leagueMetadata.rules);

    const sources = [
        leagueRules,
        rulesetPoints,
        rulesetModel,
        defaultPrivateLeagueRules,
    ];

    const winnerPoints: number = sources
        .map((source) => getRuleNumber(source, 'winner', 'outcome', 'correctOutcome'))
        .find((value): value is number => value !== null && value !== undefined) ?? 3;
    const diffPoints: number = sources
        .map((source) => getRuleNumber(source, 'diff', 'difference', 'exactDifference'))
        .find((value): value is number => value !== null && value !== undefined) ?? 2;
    const oneTeamExactPoints: number | null = sources
        .map((source) => getRuleNumber(source, 'oneTeamExact', 'singleExact', 'teamExact', 'exactTeam'))
        .find((value): value is number => value !== null && value !== undefined) ?? null;
    const exactPoints: number = sources
        .map((source) => getRuleNumber(source, 'exact', 'exactScore', 'twoTeamsExact', 'fullExact'))
        .find((value): value is number => value !== null && value !== undefined) ?? 5;
    const lockMinutes = sources.map((source) => getRuleNumber(source, 'minutes', 'lockMinutes', 'predictionLeadMinutes')).find((value) => value !== null)
        ?? toNullableNumber(competitionRow.prediction_lead_minutes);
    const doubleFinals = toBoolean(leagueRules.doubleFinals)
        || toBoolean(defaultPrivateLeagueRules.doubleFinals)
        || toBoolean(rulesetModel.doubleFinals);

    const items: ProdePlayRuleItem[] = [
        {
            key: 'winner',
            label: 'Ganador correcto',
            points: winnerPoints,
            description: 'Acertas el resultado general del partido.',
        },
        {
            key: 'diff',
            label: 'Diferencia exacta',
            points: diffPoints,
            description: 'Clavas la diferencia de puntos entre ambos equipos.',
        },
        ...(oneTeamExactPoints !== null ? [{
            key: 'one-team-exact',
            label: 'Un equipo exacto',
            points: oneTeamExactPoints,
            description: 'Acertas el marcador exacto de uno de los dos equipos.',
        }] : []),
        {
            key: 'exact',
            label: oneTeamExactPoints !== null ? 'Dos equipos exactos' : 'Marcador exacto',
            points: exactPoints,
            description: oneTeamExactPoints !== null
                ? 'Clavas el marcador completo de ambos equipos.'
                : 'Acertas el resultado exacto del partido.',
        },
    ];

    const notes = [
        lockMinutes !== null ? `Los picks cierran ${lockMinutes} minutos antes del inicio.` : null,
        doubleFinals ? 'Las fases finales pueden otorgar puntaje extra.' : null,
    ].filter((value): value is string => Boolean(value));

    return {
        title: toSafeString(rulesetRow?.name) || 'Reglas del prode',
        lockMinutes,
        doubleFinals,
        items,
        notes,
    };
}

function parseOfficialResult(rawValue: unknown): ProdePlayOfficialResult | null {
    const record = toRecord(rawValue);
    if (!Object.keys(record).length) return null;

    const homeScore = toNullableNumber(
        record.home_score ?? record.homeScore ?? toRecord(record.home).score ?? toRecord(record.score).home,
    );
    const awayScore = toNullableNumber(
        record.away_score ?? record.awayScore ?? toRecord(record.away).score ?? toRecord(record.score).away,
    );
    let outcome = toOutcome(record.outcome ?? record.winner);

    if (!outcome && homeScore !== null && awayScore !== null) {
        outcome = homeScore === awayScore ? 'draw' : homeScore > awayScore ? 'home' : 'away';
    }

    if (homeScore === null && awayScore === null && !outcome) {
        return null;
    }

    return {
        homeScore,
        awayScore,
        outcome,
    };
}

function buildOfficialResultFromScores(homeScore: number | null, awayScore: number | null) {
    if (homeScore === null && awayScore === null) {
        return null;
    }

    const outcome = homeScore === null || awayScore === null
        ? null
        : homeScore === awayScore
            ? 'draw'
            : homeScore > awayScore
                ? 'home'
                : 'away';

    return {
        home_score: homeScore,
        away_score: awayScore,
        outcome,
    };
}

function computeLockTimestamp(startsAt: string, leadMinutes: number) {
    const startsAtMillis = new Date(startsAt).getTime();
    if (!Number.isFinite(startsAtMillis)) return startsAt;
    return new Date(startsAtMillis - Math.max(0, leadMinutes) * 60000).toISOString();
}

function isMissingRelationError(error: QueryError) {
    const message = error?.message || '';
    return message.includes('does not exist') || message.includes('schema cache') || message.includes('Could not find');
}

function isFreshEnough(lastCompletedAt: number | undefined, ttlMs: number) {
    return typeof lastCompletedAt === 'number' && (Date.now() - lastCompletedAt) < ttlMs;
}

function hasEmbeddedUserIdentity(row: AnyRow) {
    const userRow = toRelatedRecord(row.users);
    return Boolean(
        toNullableString(userRow.name)
        || toNullableString(userRow.email)
        || toNullableString(userRow.avatar_url),
    );
}

function resolveUserIdentity(source: unknown, fallback?: UserIdentity | null): UserIdentity {
    const userRow = toRelatedRecord(source);
    const name = toNullableString(userRow.name)
        || (() => {
            const email = toNullableString(userRow.email);
            return email ? email.split('@')[0] || null : null;
        })()
        || fallback?.name
        || 'Usuario';

    return {
        name,
        avatarUrl: toNullableString(userRow.avatar_url) || fallback?.avatarUrl || null,
    };
}

async function loadUserIdentityMap(admin: LooseMutationClient, userIds: string[]) {
    const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)));
    const identityMap = new Map<string, UserIdentity>();

    if (!uniqueUserIds.length) {
        return identityMap;
    }

    const result = await admin
        .from('users')
        .select('id, name, avatar_url, email')
        .in('id', uniqueUserIds);

    if (result.error) {
        throw new Error(result.error.message || 'No se pudieron cargar los nombres de usuario del prode.');
    }

    (result.data || []).forEach((row) => {
        const userId = toSafeString(row.id);
        if (!userId) return;

        identityMap.set(userId, resolveUserIdentity(row));
    });

    return identityMap;
}

function mapPrediction(row: AnyRow): ProdePlayPrediction {
    return {
        id: toSafeString(row.id),
        outcome: toOutcome(row.predicted_outcome),
        predictedHomeScore: toNullableNumber(row.predicted_home_score),
        predictedAwayScore: toNullableNumber(row.predicted_away_score),
        pointsAwarded: toFiniteNumber(row.points_awarded),
        status: toSafeString(row.status) || 'open',
        scoringBreakdown: toRecord(row.scoring_breakdown),
        submittedAt: toNullableString(row.submitted_at),
        scoredAt: toNullableString(row.scored_at),
    };
}

function mapLeaderboardEntry(
    row: AnyRow,
    currentUserId: string | null,
    userIdentityMap?: Map<string, UserIdentity>,
): ProdePlayLeaderboardEntry {
    const userId = toSafeString(row.user_id);
    const userIdentity = resolveUserIdentity(row.users, userIdentityMap?.get(userId));

    return {
        userId,
        userName: userIdentity.name,
        avatarUrl: userIdentity.avatarUrl,
        totalPoints: toFiniteNumber(row.total_points),
        exactHits: toFiniteNumber(row.exact_hits),
        correctOutcomes: toFiniteNumber(row.correct_outcomes),
        position: toNullableNumber(row.position),
        isCurrentUser: Boolean(currentUserId) && userId === currentUserId,
    };
}

function buildFallbackLeaderboard(
    memberRows: AnyRow[],
    currentUserId: string | null,
    userIdentityMap?: Map<string, UserIdentity>,
) {
    return memberRows.map((row, index) => {
        const userId = toSafeString(row.user_id);
        const userIdentity = resolveUserIdentity(row.users, userIdentityMap?.get(userId));
        return {
            userId,
            userName: userIdentity.name,
            avatarUrl: userIdentity.avatarUrl,
            totalPoints: 0,
            exactHits: 0,
            correctOutcomes: 0,
            position: index + 1,
            isCurrentUser: Boolean(currentUserId) && userId === currentUserId,
        } satisfies ProdePlayLeaderboardEntry;
    });
}

function buildPersonalSummary(
    leaderboard: ProdePlayLeaderboardEntry[],
    events: ProdePlayEvent[],
    currentUserId: string | null,
): ProdePlayPersonalSummary {
    const currentEntry = leaderboard.find((entry) => entry.userId === currentUserId) || null;
    const scoredEvents = currentUserId
        ? events.filter((event) => event.prediction?.status === 'scored' || event.prediction?.scoredAt)
        : [];
    // "Ultima fecha" = la jornada más reciente, no un único partido. Sumamos los
    // puntos de todos los eventos puntuados que comparten la fecha (día) más nueva.
    const latestDateKey = scoredEvents
        .map((event) => event.startsAt.slice(0, 10))
        .sort()
        .pop() ?? null;
    const latestPoints = latestDateKey
        ? scoredEvents
            .filter((event) => event.startsAt.slice(0, 10) === latestDateKey)
            .reduce((sum, event) => sum + (event.prediction?.pointsAwarded ?? 0), 0)
        : 0;

    return {
        position: currentEntry?.position ?? null,
        totalPoints: currentEntry?.totalPoints ?? 0,
        exactHits: currentEntry?.exactHits ?? 0,
        correctOutcomes: currentEntry?.correctOutcomes ?? 0,
        latestPoints,
    };
}

function mapEvents(eventRows: AnyRow[], predictionRows: AnyRow[]) {
    const now = Date.now();
    const predictionMap = new Map(
        predictionRows.map((row) => [toSafeString(row.event_id), mapPrediction(row)]),
    );

    return eventRows.map((row) => {
        const startsAt = toSafeString(row.starts_at);
        const locksAt = toSafeString(row.locks_at);
        const eventTime = new Date(locksAt || startsAt).getTime();
        const status = normalizeEventStatus(row.status);
        const isOpen = Number.isFinite(eventTime)
            ? eventTime > now && status === 'scheduled'
            : false;

        return {
            id: toSafeString(row.id),
            homeLabel: toSafeString(row.home_label),
            awayLabel: toSafeString(row.away_label),
            homeLogoUrl: toNullableString(toRecord(row.match_snapshot).homeLogoUrl),
            awayLogoUrl: toNullableString(toRecord(row.match_snapshot).awayLogoUrl),
            startsAt,
            locksAt,
            status,
            scoringStatus: toSafeString(row.scoring_status) || 'pending',
            isOpen,
            prediction: predictionMap.get(toSafeString(row.id)) || null,
            officialResult: parseOfficialResult(row.official_result),
        } satisfies ProdePlayEvent;
    });
}

async function getCompetitionRows(admin: LooseMutationClient, competitionId: string) {
    const [eventResult, memberResult, rankingResult] = await Promise.all([
        admin
        .from('prode_events')
        .select('id, competition_id, home_label, away_label, starts_at, locks_at, status, scoring_status, official_result, match_snapshot')
        .eq('competition_id', competitionId)
        .order('starts_at', { ascending: true }),
        admin
            .from('prode_competition_members')
            .select('user_id, users(name, avatar_url)')
            .eq('competition_id', competitionId)
            .eq('status', 'active'),
        admin
            .from('prode_rankings')
            .select('user_id, total_points, exact_hits, correct_outcomes, position, users(name, avatar_url)')
            .eq('competition_id', competitionId)
            .eq('scope_type', 'global')
            .order('position', { ascending: true }),
    ]);

    return {
        eventRows: eventResult.data || [],
        memberRows: memberResult.data || [],
        rankingRows: rankingResult.data || [],
        errors: [eventResult.error, memberResult.error, rankingResult.error].filter(Boolean),
    };
}

async function getCompetitionEventRows(admin: LooseMutationClient, competitionId: string) {
    const eventResult = await admin
        .from('prode_events')
        .select('id, competition_id, home_label, away_label, starts_at, locks_at, status, scoring_status, official_result, match_snapshot')
        .eq('competition_id', competitionId)
        .order('starts_at', { ascending: true });

    return {
        eventRows: eventResult.data || [],
        errors: eventResult.error ? [eventResult.error] : [],
    };
}

async function getLocalBaseMatches(admin: LooseMutationClient, tournamentId: string): Promise<BaseMatchRow[]> {
    const result = await admin
        .from('matches')
        .select(`
            id,
            tournament_id,
            date_time,
            status,
            score,
            round_label,
            home_club:clubs!matches_home_club_id_fkey(name, short_name, logo_url),
            away_club:clubs!matches_away_club_id_fkey(name, short_name, logo_url)
        `)
        .eq('tournament_id', tournamentId)
        .order('date_time', { ascending: true });

    if (result.error) {
        throw new Error(result.error.message || 'No se pudieron cargar los partidos del torneo base.');
    }

    return (result.data || []).map((row) => {
        const homeClub = toRecord(row.home_club);
        const awayClub = toRecord(row.away_club);
        const score = toRecord(row.score);
        const homeScore = toNullableNumber(score.home);
        const awayScore = toNullableNumber(score.away);

        return {
            sourceType: 'local',
            localMatchId: toSafeString(row.id),
            externalProvider: null,
            externalMatchId: null,
            tournamentId: toNullableString(row.tournament_id),
            homeLabel: toSafeString(homeClub.short_name) || toSafeString(homeClub.name) || 'Local',
            awayLabel: toSafeString(awayClub.short_name) || toSafeString(awayClub.name) || 'Visitante',
            startsAt: toSafeString(row.date_time),
            status: normalizeEventStatus(row.status),
            officialResult: buildOfficialResultFromScores(homeScore, awayScore),
            matchSnapshot: {
                roundLabel: toNullableString(row.round_label),
                homeLogoUrl: resolveStoredLogo(homeClub) || toNullableString(resolveTeamLogo(homeClub)),
                awayLogoUrl: resolveStoredLogo(awayClub) || toNullableString(resolveTeamLogo(awayClub)),
                score,
                sourceMatchStatus: toSafeString(row.status) || 'scheduled',
            },
        } satisfies BaseMatchRow;
    }).filter((row) => Boolean(row.localMatchId && row.startsAt));
}

function mapEspnEventToBaseMatch(event: AnyRow, tournamentId: string): BaseMatchRow {
    const homeTeam = toRecord(event.home_team);
    const awayTeam = toRecord(event.away_team);
    const score = toRecord(event.scores ?? event.score);
    const homeScore = toNullableNumber(score.home);
    const awayScore = toNullableNumber(score.away);
    const status = toSafeString(event.status || event.match_status);
    const normalizedStatus = normalizeEventStatus(status);
    const roundNumber = toNullableNumber(event.round);

    // ESPN devuelve score "0" para partidos NO jugados (scheduled), así que solo
    // tomamos el marcador como resultado oficial cuando el partido finalizó. De lo
    // contrario el motor puntuaría picks contra un 0-0 inexistente y la UI mostraría
    // un "resultado" para un partido que todavía no se jugó.
    const isFinalized = normalizedStatus === 'final' || normalizedStatus === 'scored';

    return {
        sourceType: 'external',
        localMatchId: null,
        externalProvider: 'espn',
        externalMatchId: toSafeString(event.match_id || event.event_key),
        tournamentId,
        homeLabel: toSafeString(homeTeam.short_name) || toSafeString(event.home_team_name) || toSafeString(homeTeam.name) || 'Local',
        awayLabel: toSafeString(awayTeam.short_name) || toSafeString(event.away_team_name) || toSafeString(awayTeam.name) || 'Visitante',
        startsAt: toSafeString(event.date),
        status: normalizedStatus,
        officialResult: isFinalized ? buildOfficialResultFromScores(homeScore, awayScore) : null,
        matchSnapshot: {
            tournamentName: toNullableString(event.tournament_name),
            countryName: toNullableString(event.country_name),
            roundLabel: roundNumber !== null ? `Fecha ${roundNumber}` : null,
            sport: 'football',
            homeLogoUrl: toNullableString(event.home_team_logo) || toNullableString(homeTeam.logo),
            awayLogoUrl: toNullableString(event.away_team_logo) || toNullableString(awayTeam.logo),
            score,
            sourceMatchStatus: status || 'scheduled',
        },
    } satisfies BaseMatchRow;
}

async function getEspnFootballBaseMatches(leagueSlug: string, tournamentId: string): Promise<BaseMatchRow[]> {
    const events = await withExternalTimeout(
        getEspnFootballProdeEvents(leagueSlug as Parameters<typeof getEspnFootballProdeEvents>[0]),
        [] as AnyRow[],
    );

    return events
        .map((event) => mapEspnEventToBaseMatch(event as AnyRow, tournamentId))
        .filter((row) => Boolean(row.externalMatchId && row.startsAt));
}

/**
 * Resuelve el slug de liga ESPN para un torneo del prode. La web usa ESPN como
 * fuente de fútbol, así que el prode debe hacer lo mismo. Cubre tanto los
 * vínculos ya bindeados a ESPN (id `espn-soccer-league-*`) como los de fútbol
 * con otro proveedor, resolviendo por nombre/alias desde external_tournaments.
 */
async function resolveEspnFootballLeagueSlug(
    admin: LooseMutationClient,
    tournamentId: string,
    sportId: string | null,
): Promise<string | null> {
    const direct = inferEspnFootballLeague({ id: tournamentId, externalId: tournamentId });
    if (direct) return direct;

    if (!isFootballSport(sportId)) return null;

    const externalTournamentResult = await admin
        .from('external_tournaments')
        .select('id, name, display_name')
        .eq('id', tournamentId)
        .maybeSingle();

    if (externalTournamentResult.error || !externalTournamentResult.data) {
        return null;
    }

    return inferEspnFootballLeague({
        id: tournamentId,
        name: toNullableString(externalTournamentResult.data.display_name)
            || toNullableString(externalTournamentResult.data.name),
    });
}

async function getExternalBaseMatches(
    admin: LooseMutationClient,
    provider: string,
    tournamentId: string,
    sportId: string | null = null,
): Promise<BaseMatchRow[]> {
    // Fútbol = ESPN, igual que el resto de la web. Si ESPN responde con
    // partidos los usamos; si falla o viene vacío, caemos al cache local.
    const espnLeagueSlug = await resolveEspnFootballLeagueSlug(admin, tournamentId, sportId);
    if (espnLeagueSlug) {
        const espnMatches = await getEspnFootballBaseMatches(espnLeagueSlug, tournamentId);
        if (espnMatches.length) {
            return espnMatches;
        }
    }

    const result = await admin
        .from('external_match_cache')
        .select('id, tournament_id, tournament_name, country_name, home_team, away_team, score, status, date_time, round_label, sport')
        .eq('tournament_id', tournamentId)
        .order('date_time', { ascending: true });

    if (result.error) {
        if (isMissingRelationError(result.error)) {
            return getFlashscoreExternalBaseMatches(admin, provider, tournamentId);
        }

        throw new Error(result.error.message || 'No se pudieron cargar los partidos externos cacheados.');
    }

    const externalRows = result.data || [];
    if (!externalRows.length && provider === 'flashscore') {
        return getFlashscoreExternalBaseMatches(admin, provider, tournamentId);
    }

    const externalTeamIds = Array.from(new Set(
        externalRows.flatMap((row) => {
            const homeTeam = toRecord(row.home_team);
            const awayTeam = toRecord(row.away_team);
            return [toNullableString(homeTeam.id), toNullableString(awayTeam.id)].filter(Boolean) as string[];
        }),
    ));
    const externalTeamNames = Array.from(new Set(
        externalRows.flatMap((row) => {
            const homeTeam = toRecord(row.home_team);
            const awayTeam = toRecord(row.away_team);
            return [
                toNullableString(homeTeam.name),
                toNullableString(homeTeam.shortName),
                toNullableString(awayTeam.name),
                toNullableString(awayTeam.shortName),
            ].filter(Boolean) as string[];
        }),
    ));

    const [externalTeamsByIdResult, externalTeamsByNameResult, externalTeamsByShortNameResult] = await Promise.all([
        externalTeamIds.length
            ? admin
                .from('external_teams')
                .select('id, name, short_name, logo_url')
                .in('id', externalTeamIds)
            : Promise.resolve({ data: [], error: null }),
        externalTeamNames.length
            ? admin
                .from('external_teams')
                .select('id, name, short_name, logo_url')
                .in('name', externalTeamNames)
            : Promise.resolve({ data: [], error: null }),
        externalTeamNames.length
            ? admin
                .from('external_teams')
                .select('id, name, short_name, logo_url')
                .in('short_name', externalTeamNames)
            : Promise.resolve({ data: [], error: null }),
    ]);

    const externalTeamErrors = [
        externalTeamsByIdResult.error,
        externalTeamsByNameResult.error,
        externalTeamsByShortNameResult.error,
    ].filter((error) => error && !isMissingRelationError(error));

    if (externalTeamErrors.length) {
        throw new Error(externalTeamErrors[0]?.message || 'No se pudieron cargar los escudos externos de la base.');
    }

    const externalTeamRows = [
        ...(externalTeamsByIdResult.data || []),
        ...(externalTeamsByNameResult.data || []),
        ...(externalTeamsByShortNameResult.data || []),
    ];
    const externalTeamsById = new Map<string, AnyRow>();
    const externalTeamsByName = new Map<string, AnyRow>();
    const externalTeamsByShortName = new Map<string, AnyRow>();

    for (const row of externalTeamRows) {
        const id = toNullableString(row.id);
        const name = toNullableString(row.name);
        const shortName = toNullableString(row.short_name);

        if (id && !externalTeamsById.has(id)) {
            externalTeamsById.set(id, row);
        }
        if (name && !externalTeamsByName.has(name)) {
            externalTeamsByName.set(name, row);
        }
        if (shortName && !externalTeamsByShortName.has(shortName)) {
            externalTeamsByShortName.set(shortName, row);
        }
    }

    return externalRows.map((row) => {
        const homeTeam = toRecord(row.home_team);
        const awayTeam = toRecord(row.away_team);
        const homeTeamLookup = externalTeamsById.get(toSafeString(homeTeam.id))
            || externalTeamsByName.get(toSafeString(homeTeam.name))
            || externalTeamsByShortName.get(toSafeString(homeTeam.shortName))
            || null;
        const awayTeamLookup = externalTeamsById.get(toSafeString(awayTeam.id))
            || externalTeamsByName.get(toSafeString(awayTeam.name))
            || externalTeamsByShortName.get(toSafeString(awayTeam.shortName))
            || null;
        const score = toRecord(row.score);
        const homeScore = toNullableNumber(score.home);
        const awayScore = toNullableNumber(score.away);

        return {
            sourceType: 'external',
            localMatchId: null,
            externalProvider: provider,
            externalMatchId: toSafeString(row.id),
            tournamentId: null,
            homeLabel: toSafeString(homeTeam.shortName) || toSafeString(homeTeam.name) || 'Local',
            awayLabel: toSafeString(awayTeam.shortName) || toSafeString(awayTeam.name) || 'Visitante',
            startsAt: toSafeString(row.date_time),
            status: normalizeEventStatus(row.status),
            officialResult: buildOfficialResultFromScores(homeScore, awayScore),
            matchSnapshot: {
                tournamentName: toNullableString(row.tournament_name),
                countryName: toNullableString(row.country_name),
                roundLabel: toNullableString(row.round_label),
                sport: toNullableString(row.sport),
                homeLogoUrl: resolveStoredLogo(homeTeamLookup, homeTeam) || toNullableString(resolveTeamLogo(homeTeamLookup || homeTeam, homeTeam)),
                awayLogoUrl: resolveStoredLogo(awayTeamLookup, awayTeam) || toNullableString(resolveTeamLogo(awayTeamLookup || awayTeam, awayTeam)),
                score,
                sourceMatchStatus: toSafeString(row.status) || 'scheduled',
            },
        } satisfies BaseMatchRow;
    }).filter((row) => Boolean(row.externalMatchId && row.startsAt));
}

async function getFlashscoreExternalBaseMatches(
    admin: LooseMutationClient,
    provider: string,
    tournamentId: string,
): Promise<BaseMatchRow[]> {
    if (provider !== 'flashscore') {
        return [];
    }

    const externalTournamentResult = await admin
        .from('external_tournaments')
        .select('id, source, name, display_name, sport, country')
        .eq('id', tournamentId)
        .maybeSingle();

    if (externalTournamentResult.error) {
        if (isMissingRelationError(externalTournamentResult.error)) {
            return [];
        }

        throw new Error(externalTournamentResult.error.message || 'No se pudo resolver el torneo externo del prode.');
    }

    const externalTournament = externalTournamentResult.data;
    if (!externalTournament) {
        return [];
    }

    const catalogTournament = findCatalogTournamentByName(
        toNullableString(externalTournament.name),
        toNullableString(externalTournament.display_name),
    );
    const tournamentUrl = toNullableString(catalogTournament?.url);

    if (!tournamentUrl) {
        return [];
    }

    const tournamentIds = toRecord(await withExternalTimeout(getTournamentIds(tournamentUrl), {}));
    const tournamentTemplateId = toNullableString(
        tournamentIds.tournament_template_id
        ?? tournamentIds.tournamentTemplateId
        ?? catalogTournament?.flashScoreIds?.tournamentTemplateId,
    );
    const seasonId = toNullableString(
        tournamentIds.season_id
        ?? tournamentIds.seasonId
        ?? catalogTournament?.flashScoreIds?.seasonId,
    );

    if (!tournamentTemplateId || !seasonId) {
        return [];
    }

    const fixturePayload = await withExternalTimeout(
        getTournamentFixtures(tournamentTemplateId, seasonId, 1),
        [] as unknown,
    );
    const matches = extractExternalFixtureMatches(fixturePayload);

    return matches.map((match) => {
        const homeTeam = toRecord(
            match.home_team
            ?? match.home
            ?? match.event_home_team,
        );
        const awayTeam = toRecord(
            match.away_team
            ?? match.away
            ?? match.event_away_team,
        );
        const matchDateTime = getExternalMatchDateTime(match);
        const score = getExternalMatchScore(match);

        return {
            sourceType: 'external',
            localMatchId: null,
            externalProvider: provider,
            externalMatchId: toSafeString(match.id || match.match_id || match.event_id || match.event_key),
            tournamentId,
            homeLabel: toSafeString(homeTeam.shortName) || toSafeString(homeTeam.name) || toSafeString(match.home_team_name) || 'Local',
            awayLabel: toSafeString(awayTeam.shortName) || toSafeString(awayTeam.name) || toSafeString(match.away_team_name) || 'Visitante',
            startsAt: matchDateTime || '',
            status: normalizeEventStatus(match.status || match.state || match.match_status),
            officialResult: buildOfficialResultFromScores(score.homeScore, score.awayScore),
            matchSnapshot: {
                tournamentName: toNullableString(externalTournament.display_name) || toNullableString(externalTournament.name),
                countryName: toNullableString(externalTournament.country),
                roundLabel: toNullableString(match.round_label || match.round || match.stage),
                sport: toNullableString(externalTournament.sport),
                homeLogoUrl: resolveStoredLogo(homeTeam) || toNullableString(resolveTeamLogo(homeTeam, homeTeam)),
                awayLogoUrl: resolveStoredLogo(awayTeam) || toNullableString(resolveTeamLogo(awayTeam, awayTeam)),
                score: score.rawScore,
                sourceMatchStatus: toSafeString(match.status || match.state || match.match_status) || 'scheduled',
            },
        } satisfies BaseMatchRow;
    }).filter((row) => Boolean(row.externalMatchId && row.startsAt));
}

async function syncCompetitionBaseEvents(admin: LooseMutationClient, competitionRow: AnyRow) {
    const competitionId = toSafeString(competitionRow.id);
    if (!competitionId) {
        return;
    }

    if (isFreshEnough(eventSyncCompletedAt.get(competitionId), EVENT_SYNC_TTL_MS)) {
        return;
    }

    const existingSync = eventSyncInFlight.get(competitionId);
    if (existingSync) {
        await existingSync;
        return;
    }

    const syncPromise = (async () => {
        const predictionLeadMinutes = toFiniteNumber(competitionRow.prediction_lead_minutes, 0);
        const sourceBinding = normalizeProdeSourceBinding({
            source_type: competitionRow.source_type,
            local_tournament_id: competitionRow.local_tournament_id,
            external_provider: competitionRow.external_provider,
            external_tournament_id: competitionRow.external_tournament_id,
        });

        let baseMatches: BaseMatchRow[] = [];

        if (sourceBinding.sourceType === 'local' && sourceBinding.localTournamentId) {
            baseMatches = await getLocalBaseMatches(admin, sourceBinding.localTournamentId);
        } else if (sourceBinding.sourceType === 'external' && sourceBinding.externalProvider && sourceBinding.externalTournamentId) {
            baseMatches = await getExternalBaseMatches(
                admin,
                sourceBinding.externalProvider,
                sourceBinding.externalTournamentId,
                toNullableString(competitionRow.sport_id),
            );
        } else {
            return;
        }

        if (!baseMatches.length) {
            eventSyncCompletedAt.set(competitionId, Date.now());
            return;
        }

        const existingEventsResult = await admin
            .from('prode_events')
            .select('id, local_match_id, external_provider, external_match_id')
            .eq('competition_id', competitionId);

        if (existingEventsResult.error) {
            throw new Error(existingEventsResult.error.message || 'No se pudieron cargar los eventos existentes del prode.');
        }

        const existingLocalEventIds = new Map<string, string>();
        const existingExternalEventIds = new Map<string, string>();

        for (const row of existingEventsResult.data || []) {
            const existingId = toSafeString(row.id);
            const localMatchId = toNullableString(row.local_match_id);
            const externalProvider = toNullableString(row.external_provider);
            const externalMatchId = toNullableString(row.external_match_id);

            if (existingId && localMatchId) {
                existingLocalEventIds.set(localMatchId, existingId);
            }

            if (existingId && externalProvider && externalMatchId) {
                existingExternalEventIds.set(`${externalProvider}:${externalMatchId}`, existingId);
            }
        }

        const localPayloads = baseMatches
            .filter((row) => row.sourceType === 'local' && row.localMatchId)
            .map((row) => ({
                competition_id: competitionId,
                source_type: 'local',
                local_match_id: row.localMatchId,
                tournament_id: row.tournamentId,
                home_label: row.homeLabel,
                away_label: row.awayLabel,
                starts_at: row.startsAt,
                locks_at: computeLockTimestamp(row.startsAt, predictionLeadMinutes),
                status: row.status,
                scoring_status: row.status === 'final' ? 'ready' : 'pending',
                official_result: row.officialResult,
                match_snapshot: row.matchSnapshot,
            }));

        const externalPayloads = baseMatches
            .filter((row) => row.sourceType === 'external' && row.externalMatchId && row.externalProvider)
            .map((row) => ({
                competition_id: competitionId,
                source_type: 'external',
                external_provider: row.externalProvider,
                external_match_id: row.externalMatchId,
                tournament_id: null,
                home_label: row.homeLabel,
                away_label: row.awayLabel,
                starts_at: row.startsAt,
                locks_at: computeLockTimestamp(row.startsAt, predictionLeadMinutes),
                status: row.status,
                scoring_status: row.status === 'final' ? 'ready' : 'pending',
                official_result: row.officialResult,
                match_snapshot: row.matchSnapshot,
            }));

        const inserts: AnyRow[] = [];
        const updates: Array<{ id: string; payload: AnyRow }> = [];

        for (const payload of localPayloads) {
            const localMatchId = toNullableString(payload.local_match_id);
            if (!localMatchId) continue;

            const existingEventId = existingLocalEventIds.get(localMatchId);
            if (existingEventId) {
                updates.push({ id: existingEventId, payload });
            } else {
                inserts.push(payload);
            }
        }

        for (const payload of externalPayloads) {
            const externalProvider = toNullableString(payload.external_provider);
            const externalMatchId = toNullableString(payload.external_match_id);
            if (!externalProvider || !externalMatchId) continue;

            const existingEventId = existingExternalEventIds.get(`${externalProvider}:${externalMatchId}`);
            if (existingEventId) {
                updates.push({ id: existingEventId, payload });
            } else {
                inserts.push(payload);
            }
        }

        if (!inserts.length && !updates.length) {
            eventSyncCompletedAt.set(competitionId, Date.now());
            return;
        }

        const operations: Array<PromiseLike<MutationResult>> = [];

        if (inserts.length) {
            operations.push(admin.from('prode_events').insert(inserts));
        }

        for (const updateOperation of updates) {
            operations.push(
                admin
                    .from('prode_events')
                    .update(updateOperation.payload)
                    .eq('id', updateOperation.id),
            );
        }

        const results = await Promise.all(operations);
        const failedOperation = results.find((result) => result.error);

        if (failedOperation?.error) {
            throw new Error(failedOperation.error.message || 'No se pudieron sincronizar los partidos del prode.');
        }
        eventSyncCompletedAt.set(competitionId, Date.now());
    })().finally(() => {
        eventSyncInFlight.delete(competitionId);
    });

    eventSyncInFlight.set(competitionId, syncPromise);
    await syncPromise;
}

function buildCompetitionSubtitle(competitionRow: AnyRow) {
    return toNullableString(competitionRow.description) || 'Liga global no oficial del torneo.';
}

function buildLeagueSubtitle(leagueRow: AnyRow, competitionRow: AnyRow) {
    const metadata = toRecord(leagueRow.metadata);
    const description = toNullableString(metadata.description);
    return description || `Competi con tus amigos dentro de ${toSafeString(competitionRow.name)}.`;
}

function getLeagueLifecycle(leagueRow: AnyRow) {
    const metadata = toRecord(leagueRow.metadata);
    const lifecycle = toSafeString(metadata.lifecycle);
    return lifecycle === 'archived' || lifecycle === 'deleted' ? lifecycle : 'active';
}

/**
 * Sincroniza los eventos base (partidos) de todas las competencias en curso desde
 * sus proveedores (ESPN para fútbol, FlashScore/cache para el resto). Pensado para
 * ejecutarse desde el cron, no en el render: así las páginas leen datos ya frescos
 * sin disparar llamadas a proveedores externos en cada request. Best-effort por
 * competencia y con concurrencia acotada para no saturar el pool ni los proveedores.
 */
export async function syncActiveProdeCompetitionsBaseEvents(): Promise<{ total: number; synced: number; errors: number }> {
    const admin = createAdminClient() as unknown as LooseMutationClient;
    const competitionResult = await admin
        .from('prode_competitions')
        .select('id, prediction_lead_minutes, source_type, local_tournament_id, external_provider, external_tournament_id, sport_id, status')
        .in('status', ['active', 'published']);

    if (competitionResult.error) {
        throw new Error(competitionResult.error.message || 'No se pudieron cargar las competencias activas del prode.');
    }

    const rows = competitionResult.data || [];
    let synced = 0;
    let errors = 0;
    const SYNC_CONCURRENCY = 2;

    for (let i = 0; i < rows.length; i += SYNC_CONCURRENCY) {
        const batch = rows.slice(i, i + SYNC_CONCURRENCY);
        const results = await Promise.allSettled(batch.map((row) => syncCompetitionBaseEvents(admin, row)));
        results.forEach((result) => {
            if (result.status === 'fulfilled') {
                synced += 1;
            } else {
                errors += 1;
                console.error('[prode/cron] sync de eventos base fallido', result.reason);
            }
        });
    }

    return { total: rows.length, synced, errors };
}

// Presupuesto máximo (ms) que el render de una vista del prode espera por el sync
// de eventos + refresh de scoring. Si un proveedor externo (ESPN/FlashScore) está
// lento, no bloqueamos la página: renderizamos con lo ya persistido y el cron
// `/api/cron/prode-scoring` (más el sync en vuelo, que sigue por su cuenta) ponen
// los datos al día. El TTL interno del sync evita repegar al proveedor en cada visita.
const PLAY_SYNC_BUDGET_MS = 1800;

async function syncPlayDataWithinBudget(
    admin: LooseMutationClient,
    competitionRow: AnyRow,
    competitionId: string,
) {
    let timer: ReturnType<typeof setTimeout> | null = null;
    try {
        await Promise.race([
            (async () => {
                await syncCompetitionBaseEvents(admin, competitionRow);
                await refreshCompetitionScoreboards(competitionId);
            })(),
            new Promise<void>((resolve) => {
                timer = setTimeout(resolve, PLAY_SYNC_BUDGET_MS);
            }),
        ]);
    } catch (error) {
        console.error('[prode/play] sync/scoring skipped for competition', competitionId, error);
    } finally {
        if (timer) clearTimeout(timer);
    }
}

export async function getPublicCompetitionPlayView(slug: string, currentUserId: string | null): Promise<ProdePlayView | null> {
    const admin = createAdminClient() as unknown as LooseMutationClient;
    const competitionResult = await admin
        .from('prode_competitions')
        .select('id, name, description, status, sport_id, prediction_lead_minutes, source_type, local_tournament_id, external_provider, external_tournament_id, active_ruleset_id, metadata')
        .eq('slug', slug)
        .maybeSingle();

    if (competitionResult.error) {
        throw new Error(competitionResult.error.message || 'No se pudo cargar la competencia.');
    }

    if (!competitionResult.data) {
        return null;
    }

    const competitionId = toSafeString(competitionResult.data.id);
    const activeRulesetId = toSafeString(competitionResult.data.active_ruleset_id);

    // Sync y refresh acotados por tiempo: si un proveedor externo o el motor de
    // scoring están lentos, igual renderizamos con los datos ya persistidos en vez
    // de bloquear (o devolver un 500 que tira toda la página del prode).
    await syncPlayDataWithinBudget(admin, competitionResult.data, competitionId);

    const [{ eventRows, memberRows, rankingRows, errors }, predictionResult, rulesetResult] = await Promise.all([
        getCompetitionRows(admin, competitionId),
        currentUserId
            ? admin
                .from('prode_predictions')
                .select('id, event_id, predicted_outcome, predicted_home_score, predicted_away_score, scoring_breakdown, points_awarded, status, submitted_at, scored_at')
                .eq('competition_id', competitionId)
                .eq('user_id', currentUserId)
            : Promise.resolve({ data: [], error: null }),
        activeRulesetId
            ? admin
                .from('prode_rulesets')
                .select('id, name, scoring_model')
                .eq('id', activeRulesetId)
                .maybeSingle()
            : Promise.resolve({ data: null, error: null }),
    ]);

    if (errors.length || predictionResult.error || rulesetResult.error) {
        const firstError = errors[0] || predictionResult.error || rulesetResult.error;
        throw new Error(firstError?.message || 'No se pudo cargar la vista de juego.');
    }

    const scoringRules = resolveProdeScoringRules(competitionResult.data, rulesetResult.data);
    const scopedPredictionRows = applyScoringRulesToPredictionRows(eventRows, predictionResult.data || [], scoringRules);
    const events = mapEvents(eventRows, scopedPredictionRows);
    const leaderboardSourceRows = rankingRows.length ? rankingRows : memberRows;
    const leaderboardUserIds = leaderboardSourceRows
        .map((row) => toSafeString(row.user_id))
        .filter(Boolean);
    const userIdentityMap = leaderboardSourceRows.some((row) => !hasEmbeddedUserIdentity(row))
        ? await loadUserIdentityMap(admin, leaderboardUserIds)
        : undefined;
    const leaderboardRows = rankingRows.length
        ? rankingRows.map((row) => mapLeaderboardEntry(row, currentUserId, userIdentityMap))
        : buildFallbackLeaderboard(memberRows, currentUserId, userIdentityMap);
    const nextLockAt = events.filter((event) => event.isOpen).map((event) => event.locksAt)[0] || null;

    return {
        scope: 'competition',
        privateLeagueId: null,
        title: toSafeString(competitionResult.data.name),
        subtitle: buildCompetitionSubtitle(competitionResult.data),
        competitionName: toSafeString(competitionResult.data.name),
        competitionStatus: normalizeCompetitionStatus(competitionResult.data.status),
        sportLabel: getSportLabel(toNullableString(competitionResult.data.sport_id)),
        memberCount: memberRows.length,
        nextLockAt,
        inviteCode: null,
        shareUrl: null,
        canInvite: false,
        canManage: false,
        canPlay: Boolean(currentUserId),
        isFinished: normalizeCompetitionStatus(competitionResult.data.status) === 'finished',
        events,
        leaderboard: leaderboardRows,
        personalSummary: buildPersonalSummary(leaderboardRows, events, currentUserId),
        rules: resolveRulesSummary(competitionResult.data, null, rulesetResult.data),
    };
}

export async function getPrivateLeaguePlayView(slug: string, currentUserId: string | null, baseUrl: string): Promise<ProdePlayView | null> {
    const admin = createAdminClient() as unknown as LooseMutationClient;
    const leagueListResult = await admin
        .from('prode_private_leagues')
        .select('id, competition_id, owner_user_id, name, invite_code, visibility, metadata, created_at')
        .eq('slug', slug)
        .order('created_at', { ascending: false });

    if (leagueListResult.error) {
        throw new Error(leagueListResult.error.message || 'No se pudo cargar la liga.');
    }

    const activeLeagueCandidates = (leagueListResult.data || []).filter((row) => getLeagueLifecycle(row) === 'active');

    if (!activeLeagueCandidates.length) {
        return null;
    }

    let leagueRow = activeLeagueCandidates[0];

    if (activeLeagueCandidates.length > 1 && currentUserId) {
        const candidateIds = activeLeagueCandidates.map((row) => toSafeString(row.id)).filter(Boolean);
        const membershipProbeResult = candidateIds.length
            ? await admin
                .from('prode_private_league_members')
                .select('private_league_id, user_id, role')
                .in('private_league_id', candidateIds)
                .eq('user_id', currentUserId)
            : { data: [], error: null };

        if (membershipProbeResult.error) {
            throw new Error(membershipProbeResult.error.message || 'No se pudo resolver la liga privada.');
        }

        const membershipLeagueIds = new Set(
            (membershipProbeResult.data || []).map((row) => toSafeString(row.private_league_id)).filter(Boolean),
        );

        const ownedLeague = activeLeagueCandidates.find((row) => toSafeString(row.owner_user_id) === currentUserId);
        const memberLeague = activeLeagueCandidates.find((row) => membershipLeagueIds.has(toSafeString(row.id)));
        leagueRow = ownedLeague || memberLeague || activeLeagueCandidates[0];
    }

    const leagueId = toSafeString(leagueRow.id);
    const leagueVisibility = toSafeString(leagueRow.visibility) || 'private';
    const ownerUserId = toSafeString(leagueRow.owner_user_id);

    const [leagueMembershipResult, competitionResult] = await Promise.all([
        admin
            .from('prode_private_league_members')
            .select('user_id, role')
            .eq('private_league_id', leagueId),
        admin
            .from('prode_competitions')
            .select('id, name, description, status, sport_id, prediction_lead_minutes, source_type, local_tournament_id, external_provider, external_tournament_id, active_ruleset_id, metadata')
            .eq('id', toSafeString(leagueRow.competition_id))
            .maybeSingle(),
    ]);

    if (leagueMembershipResult.error) {
        throw new Error(leagueMembershipResult.error.message || 'No se pudieron cargar los miembros de la liga.');
    }
    if (competitionResult.error) {
        throw new Error(competitionResult.error.message || 'No se pudo cargar la competencia asociada.');
    }
    if (!competitionResult.data) {
        return null;
    }

    const leagueMembershipRows = leagueMembershipResult.data || [];
    const isMember = currentUserId
        ? leagueMembershipRows.some((row) => toSafeString(row.user_id) === currentUserId) || ownerUserId === currentUserId
        : false;
    const currentMembershipRole = currentUserId
        ? toSafeString(leagueMembershipRows.find((row) => toSafeString(row.user_id) === currentUserId)?.role)
        : '';
    const canManage = Boolean(currentUserId) && (
        ownerUserId === currentUserId
        || currentMembershipRole === 'admin'
        || currentMembershipRole === 'owner'
        || currentMembershipRole === 'moderator'
    );

    if (leagueVisibility === 'private' && !isMember) {
        return null;
    }

    const competitionId = toSafeString(competitionResult.data.id);
    const activeRulesetId = toSafeString(competitionResult.data.active_ruleset_id);

    // Best-effort acotado por tiempo: un fallo o lentitud del sync/scoring no debe
    // tumbar ni colgar la página de la liga (ver syncPlayDataWithinBudget).
    await syncPlayDataWithinBudget(admin, competitionResult.data, competitionId);

    const [{ eventRows, errors }, rankingResult, predictionResult, rulesetResult] = await Promise.all([
        getCompetitionEventRows(admin, competitionId),
        admin
            .from('prode_rankings')
            .select('user_id, total_points, exact_hits, correct_outcomes, position, users(name, avatar_url)')
            .eq('competition_id', competitionId)
            .eq('scope_type', 'private_league')
            .eq('private_league_id', leagueId)
            .order('position', { ascending: true }),
        currentUserId
            ? admin
                .from('prode_predictions')
                .select('id, event_id, predicted_outcome, predicted_home_score, predicted_away_score, scoring_breakdown, points_awarded, status, submitted_at, scored_at')
                .eq('competition_id', competitionId)
                .eq('user_id', currentUserId)
            : Promise.resolve({ data: [], error: null }),
        activeRulesetId
            ? admin
                .from('prode_rulesets')
                .select('id, name, scoring_model')
                .eq('id', activeRulesetId)
                .maybeSingle()
            : Promise.resolve({ data: null, error: null }),
    ]);

    if (errors.length || rankingResult.error || predictionResult.error || rulesetResult.error) {
        const firstError = errors[0] || rankingResult.error || predictionResult.error || rulesetResult.error;
        throw new Error(firstError?.message || 'No se pudo cargar la vista de la liga.');
    }

    const scoringRules = resolveProdeScoringRules(competitionResult.data, rulesetResult.data, leagueRow);
    const scopedPredictionRows = applyScoringRulesToPredictionRows(eventRows, predictionResult.data || [], scoringRules);
    const events = mapEvents(eventRows, scopedPredictionRows);
    const rankingSourceRows = rankingResult.data?.length ? rankingResult.data : leagueMembershipRows;
    const rankingUserIds = rankingSourceRows.map((row) => toSafeString(row.user_id)).filter(Boolean);
    const userIdentityMap = rankingSourceRows.some((row) => !hasEmbeddedUserIdentity(row))
        ? await loadUserIdentityMap(admin, rankingUserIds)
        : undefined;
    let leaderboardRows = rankingResult.data?.length
        ? rankingResult.data.map((row) => mapLeaderboardEntry(row, currentUserId, userIdentityMap))
        : [];

    if (!leaderboardRows.length) {
        const fallbackMemberResult = await admin
            .from('prode_private_league_members')
            .select('user_id, role, users(name, avatar_url)')
            .eq('private_league_id', leagueId);

        if (fallbackMemberResult.error) {
            throw new Error(fallbackMemberResult.error.message || 'No se pudo cargar el ranking base de la liga.');
        }

        leaderboardRows = buildFallbackLeaderboard(fallbackMemberResult.data || [], currentUserId, userIdentityMap);
    }

    const nextLockAt = events.filter((event) => event.isOpen).map((event) => event.locksAt)[0] || null;

    return {
        scope: 'private_league',
        privateLeagueId: leagueId,
        title: toSafeString(leagueRow.name),
        subtitle: buildLeagueSubtitle(leagueRow, competitionResult.data),
        competitionName: toSafeString(competitionResult.data.name),
        competitionStatus: normalizeCompetitionStatus(competitionResult.data.status),
        sportLabel: getSportLabel(toNullableString(competitionResult.data.sport_id)),
        memberCount: leagueMembershipRows.length,
        nextLockAt,
        inviteCode: toNullableString(leagueRow.invite_code),
        shareUrl: toNullableString(leagueRow.invite_code)
            ? `${baseUrl.replace(/\/$/, '')}/prode/ligas/unirse?codigo=${encodeURIComponent(toSafeString(leagueRow.invite_code))}`
            : null,
        canInvite: isMember,
        canManage,
        canPlay: Boolean(currentUserId) && isMember,
        isFinished: normalizeCompetitionStatus(competitionResult.data.status) === 'finished',
        events,
        leaderboard: leaderboardRows,
        personalSummary: buildPersonalSummary(leaderboardRows, events, currentUserId),
        rules: resolveRulesSummary(competitionResult.data, leagueRow, rulesetResult.data),
    };
}
