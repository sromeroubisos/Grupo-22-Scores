import { createAdminClient } from '@/lib/supabase/admin';
import { getAllTournaments } from '@/lib/data/tournaments';
import { normalizeProdeSourceBinding } from '@/lib/prode/source';
import { getTournamentFixtures, getTournamentIds } from '@/lib/services/flashscore';
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
    switch (toSafeString(value)) {
        case 'live':
        case 'in_progress':
            return 'live';
        case 'final':
        case 'finished':
        case 'completed':
            return 'final';
        case 'cancelled':
            return 'cancelled';
        case 'postponed':
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

function mapLeaderboardEntry(row: AnyRow, currentUserId: string | null): ProdePlayLeaderboardEntry {
    const userRow = toRecord(row.users);
    const userId = toSafeString(row.user_id);

    return {
        userId,
        userName: toSafeString(userRow.name) || 'Usuario',
        avatarUrl: toNullableString(userRow.avatar_url),
        totalPoints: toFiniteNumber(row.total_points),
        exactHits: toFiniteNumber(row.exact_hits),
        correctOutcomes: toFiniteNumber(row.correct_outcomes),
        position: toNullableNumber(row.position),
        isCurrentUser: Boolean(currentUserId) && userId === currentUserId,
    };
}

function buildFallbackLeaderboard(memberRows: AnyRow[], currentUserId: string | null) {
    return memberRows.map((row, index) => {
        const userRow = toRecord(row.users);
        const userId = toSafeString(row.user_id);
        return {
            userId,
            userName: toSafeString(userRow.name) || 'Usuario',
            avatarUrl: toNullableString(userRow.avatar_url),
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
    const latestScoredPrediction = currentUserId
        ? [...events]
            .filter((event) => event.prediction?.status === 'scored' || event.prediction?.scoredAt)
            .sort((left, right) => right.startsAt.localeCompare(left.startsAt))[0]
        : null;

    return {
        position: currentEntry?.position ?? null,
        totalPoints: currentEntry?.totalPoints ?? 0,
        exactHits: currentEntry?.exactHits ?? 0,
        correctOutcomes: currentEntry?.correctOutcomes ?? 0,
        latestPoints: latestScoredPrediction?.prediction?.pointsAwarded ?? 0,
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

async function getExternalBaseMatches(
    admin: LooseMutationClient,
    provider: string,
    tournamentId: string,
): Promise<BaseMatchRow[]> {
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

    const tournamentIds = toRecord(await getTournamentIds(tournamentUrl));
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

    const fixturePayload = await getTournamentFixtures(tournamentTemplateId, seasonId, 1);
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
        baseMatches = await getExternalBaseMatches(admin, sourceBinding.externalProvider, sourceBinding.externalTournamentId);
    } else {
        return;
    }

    if (!baseMatches.length) {
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
}

function buildCompetitionSubtitle(competitionRow: AnyRow) {
    return toNullableString(competitionRow.description) || 'Liga global oficial del torneo.';
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

    await syncCompetitionBaseEvents(admin, competitionResult.data);

    const competitionId = toSafeString(competitionResult.data.id);
    const activeRulesetId = toSafeString(competitionResult.data.active_ruleset_id);
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

    const events = mapEvents(eventRows, predictionResult.data || []);
    const leaderboardRows = rankingRows.length
        ? rankingRows.map((row) => mapLeaderboardEntry(row, currentUserId))
        : buildFallbackLeaderboard(memberRows, currentUserId);
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
    const leagueResult = await admin
        .from('prode_private_leagues')
        .select('id, competition_id, owner_user_id, name, invite_code, visibility, metadata')
        .eq('slug', slug)
        .maybeSingle();

    if (leagueResult.error) {
        throw new Error(leagueResult.error.message || 'No se pudo cargar la liga.');
    }

    if (!leagueResult.data) {
        return null;
    }

    if (getLeagueLifecycle(leagueResult.data) !== 'active') {
        return null;
    }

    const leagueId = toSafeString(leagueResult.data.id);
    const leagueVisibility = toSafeString(leagueResult.data.visibility) || 'private';
    const ownerUserId = toSafeString(leagueResult.data.owner_user_id);

    const [leagueMemberResult, competitionResult] = await Promise.all([
        admin
            .from('prode_private_league_members')
            .select('user_id, role, users(name, avatar_url)')
            .eq('private_league_id', leagueId),
        admin
            .from('prode_competitions')
            .select('id, name, description, status, sport_id, prediction_lead_minutes, source_type, local_tournament_id, external_provider, external_tournament_id, active_ruleset_id, metadata')
            .eq('id', toSafeString(leagueResult.data.competition_id))
            .maybeSingle(),
    ]);

    if (leagueMemberResult.error) {
        throw new Error(leagueMemberResult.error.message || 'No se pudieron cargar los miembros de la liga.');
    }
    if (competitionResult.error) {
        throw new Error(competitionResult.error.message || 'No se pudo cargar la competencia asociada.');
    }
    if (!competitionResult.data) {
        return null;
    }

    const isMember = currentUserId
        ? leagueMemberResult.data?.some((row) => toSafeString(row.user_id) === currentUserId) || ownerUserId === currentUserId
        : false;
    const currentMembershipRole = currentUserId
        ? toSafeString(leagueMemberResult.data?.find((row) => toSafeString(row.user_id) === currentUserId)?.role)
        : '';
    const canManage = Boolean(currentUserId) && (ownerUserId === currentUserId || currentMembershipRole === 'admin');

    if (leagueVisibility === 'private' && !isMember) {
        return null;
    }

    await syncCompetitionBaseEvents(admin, competitionResult.data);

    const competitionId = toSafeString(competitionResult.data.id);
    const activeRulesetId = toSafeString(competitionResult.data.active_ruleset_id);
    const [{ eventRows, errors }, rankingResult, predictionResult, rulesetResult] = await Promise.all([
        getCompetitionRows(admin, competitionId),
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

    const events = mapEvents(eventRows, predictionResult.data || []);
    const leaderboardRows = rankingResult.data?.length
        ? rankingResult.data.map((row) => mapLeaderboardEntry(row, currentUserId))
        : buildFallbackLeaderboard(leagueMemberResult.data || [], currentUserId);
    const nextLockAt = events.filter((event) => event.isOpen).map((event) => event.locksAt)[0] || null;

    return {
        scope: 'private_league',
        privateLeagueId: leagueId,
        title: toSafeString(leagueResult.data.name),
        subtitle: buildLeagueSubtitle(leagueResult.data, competitionResult.data),
        competitionName: toSafeString(competitionResult.data.name),
        competitionStatus: normalizeCompetitionStatus(competitionResult.data.status),
        sportLabel: getSportLabel(toNullableString(competitionResult.data.sport_id)),
        memberCount: (leagueMemberResult.data || []).length,
        nextLockAt,
        inviteCode: toNullableString(leagueResult.data.invite_code),
        shareUrl: toNullableString(leagueResult.data.invite_code)
            ? `${baseUrl.replace(/\/$/, '')}/prode/ligas/unirse?codigo=${encodeURIComponent(toSafeString(leagueResult.data.invite_code))}`
            : null,
        canInvite: isMember,
        canManage,
        canPlay: Boolean(currentUserId) && isMember,
        isFinished: normalizeCompetitionStatus(competitionResult.data.status) === 'finished',
        events,
        leaderboard: leaderboardRows,
        personalSummary: buildPersonalSummary(leaderboardRows, events, currentUserId),
        rules: resolveRulesSummary(competitionResult.data, leagueResult.data, rulesetResult.data),
    };
}
