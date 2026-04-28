import { createAdminClient } from '@/lib/supabase/admin';

type AnyRow = Record<string, unknown>;
type QueryError = { code?: string; message?: string | null } | null;

type QueryResult = { data: AnyRow[] | null; error: QueryError };
type MaybeSingleResult = { data: AnyRow | null; error: QueryError };
type MutationResult = { data: AnyRow[] | AnyRow | null; error: QueryError };

interface LooseQueryBuilder extends PromiseLike<QueryResult> {
    select(columns: string): LooseQueryBuilder;
    eq(column: string, value: string | number | boolean): LooseQueryBuilder;
    in(column: string, values: string[]): LooseQueryBuilder;
    order(column: string, options?: { ascending?: boolean }): LooseQueryBuilder;
    maybeSingle(): PromiseLike<MaybeSingleResult>;
}

interface LooseMutationBuilder extends PromiseLike<MutationResult> {
    eq(column: string, value: string | number | boolean): LooseMutationBuilder;
    in(column: string, values: string[]): LooseMutationBuilder;
}

interface LooseMutationClient {
    from(table: string): {
        select(columns: string): LooseQueryBuilder;
        insert(payload: AnyRow | AnyRow[]): PromiseLike<MutationResult>;
        update(payload: AnyRow): LooseMutationBuilder;
        delete(): LooseMutationBuilder;
        upsert(payload: AnyRow | AnyRow[], options?: { onConflict?: string }): PromiseLike<MutationResult>;
    };
}

export type ProdeScoringRules = {
    winner: number;
    diff: number;
    oneTeamExact: number | null;
    exact: number;
    doubleFinals: boolean;
};

const COMPETITION_REFRESH_TTL_MS = 15_000;
const GLOBAL_REFRESH_TTL_MS = 15_000;

const competitionRefreshInFlight = new Map<string, { promise: Promise<boolean>; version: number }>();
const competitionRefreshCompletedAt = new Map<string, number>();
const competitionRefreshVersion = new Map<string, number>();

let globalRefreshInFlight: { promise: Promise<boolean>; version: number } | null = null;
let globalRefreshCompletedAt = 0;
let globalRefreshVersion = 0;

function toSafeString(value: unknown) {
    return typeof value === 'string' ? value : '';
}

function toNullableString(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
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

function getRuleNumber(record: Record<string, unknown>, ...keys: string[]) {
    for (const key of keys) {
        const numericValue = toNullableNumber(record[key]);
        if (numericValue !== null) {
            return numericValue;
        }
    }

    return null;
}

function isMissingRelationError(error: QueryError) {
    const message = error?.message || '';
    return message.includes('does not exist') || message.includes('schema cache') || message.includes('Could not find');
}

function isFreshEnough(lastCompletedAt: number | undefined, ttlMs: number) {
    return typeof lastCompletedAt === 'number' && (Date.now() - lastCompletedAt) < ttlMs;
}

export function invalidateProdeRefresh(competitionId?: string | null) {
    if (competitionId) {
        competitionRefreshCompletedAt.delete(competitionId);
        competitionRefreshVersion.set(competitionId, (competitionRefreshVersion.get(competitionId) || 0) + 1);
    } else {
        competitionRefreshCompletedAt.clear();
        competitionRefreshVersion.clear();
    }

    globalRefreshCompletedAt = 0;
    globalRefreshVersion += 1;
}

function parseOfficialResult(rawValue: unknown) {
    const record = toRecord(rawValue);
    const homeScore = toNullableNumber(
        record.home_score ?? record.homeScore ?? toRecord(record.home).score ?? toRecord(record.score).home,
    );
    const awayScore = toNullableNumber(
        record.away_score ?? record.awayScore ?? toRecord(record.away).score ?? toRecord(record.score).away,
    );

    if (homeScore === null || awayScore === null) {
        return null;
    }

    return {
        homeScore,
        awayScore,
        outcome: homeScore === awayScore ? 'draw' : homeScore > awayScore ? 'home' : 'away',
    } as const;
}

function buildPredictionOutcome(homeScore: number | null, awayScore: number | null) {
    if (homeScore === null || awayScore === null) {
        return null;
    }

    return homeScore === awayScore ? 'draw' : homeScore > awayScore ? 'home' : 'away';
}

function isFinalStage(eventRow: AnyRow) {
    const snapshot = toRecord(eventRow.match_snapshot);
    const roundLabel = [
        snapshot.roundLabel,
        snapshot.round,
        snapshot.stage,
        snapshot.phase,
    ]
        .map((value) => toSafeString(value))
        .filter(Boolean)
        .join(' ')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();

    if (!roundLabel) {
        return false;
    }

    return /(final|semi|quarter|playoff|knockout|elimin|octavos|cuartos)/.test(roundLabel);
}

export function resolveProdeScoringRules(
    competitionRow: AnyRow,
    rulesetRow?: AnyRow | null,
    privateLeagueRow?: AnyRow | null,
): ProdeScoringRules {
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

    const winner = sources
        .map((source) => getRuleNumber(source, 'winner', 'outcome', 'correctOutcome'))
        .find((value): value is number => value !== null && value !== undefined) ?? 3;
    const diff = sources
        .map((source) => getRuleNumber(source, 'diff', 'difference', 'exactDifference'))
        .find((value): value is number => value !== null && value !== undefined) ?? 2;
    const oneTeamExact = sources
        .map((source) => getRuleNumber(source, 'oneTeamExact', 'singleExact', 'teamExact', 'exactTeam'))
        .find((value): value is number => value !== null && value !== undefined) ?? null;
    const exact = sources
        .map((source) => getRuleNumber(source, 'exact', 'exactScore', 'twoTeamsExact', 'fullExact'))
        .find((value): value is number => value !== null && value !== undefined) ?? 5;
    const doubleFinals = toBoolean(leagueRules.doubleFinals)
        || toBoolean(defaultPrivateLeagueRules.doubleFinals)
        || toBoolean(rulesetModel.doubleFinals);

    return {
        winner,
        diff,
        oneTeamExact,
        exact,
        doubleFinals,
    };
}

function scorePredictionRow(eventRow: AnyRow, predictionRow: AnyRow, rules: ProdeScoringRules): AnyRow {
    const eventStatus = toSafeString(eventRow.status);
    const officialResult = parseOfficialResult(eventRow.official_result);
    const predictedHomeScore = toNullableNumber(predictionRow.predicted_home_score);
    const predictedAwayScore = toNullableNumber(predictionRow.predicted_away_score);
    const predictedOutcome = toSafeString(predictionRow.predicted_outcome) || buildPredictionOutcome(predictedHomeScore, predictedAwayScore);
    const lockedAt = toNullableString(predictionRow.locked_at) || toNullableString(eventRow.locks_at);
    const nowIso = new Date().toISOString();

    if (eventStatus === 'cancelled') {
        return {
            ...predictionRow,
            points_awarded: 0,
            status: 'void',
            locked_at: lockedAt,
            scored_at: nowIso,
            scoring_breakdown: {
                void: true,
                reason: 'cancelled',
                multiplier: 1,
                totalPoints: 0,
            },
        } satisfies AnyRow;
    }

    if (!officialResult) {
        const eventLockTime = new Date(toSafeString(eventRow.locks_at)).getTime();
        const isLocked = Number.isFinite(eventLockTime) && eventLockTime <= Date.now();

        return {
            ...predictionRow,
            points_awarded: toFiniteNumber(predictionRow.points_awarded),
            status: isLocked ? 'locked' : 'open',
            locked_at: isLocked ? lockedAt : toNullableString(predictionRow.locked_at),
            scored_at: toNullableString(predictionRow.scored_at),
            scoring_breakdown: toRecord(predictionRow.scoring_breakdown),
        } satisfies AnyRow;
    }

    const exactHome = predictedHomeScore !== null && predictedHomeScore === officialResult.homeScore;
    const exactAway = predictedAwayScore !== null && predictedAwayScore === officialResult.awayScore;
    const exactScore = exactHome && exactAway;
    const predictedDiff = predictedHomeScore !== null && predictedAwayScore !== null
        ? predictedHomeScore - predictedAwayScore
        : null;
    const officialDiff = officialResult.homeScore - officialResult.awayScore;
    const winnerHit = predictedOutcome === officialResult.outcome;
    const diffHit = predictedDiff !== null && predictedDiff === officialDiff;
    const oneTeamExactHit = !exactScore && (exactHome || exactAway);
    const multiplier = rules.doubleFinals && isFinalStage(eventRow) ? 2 : 1;

    const basePoints = {
        winner: winnerHit ? rules.winner : 0,
        diff: diffHit ? rules.diff : 0,
        oneTeamExact: oneTeamExactHit && rules.oneTeamExact !== null ? rules.oneTeamExact : 0,
        exact: exactScore ? rules.exact : 0,
    };

    const totalPoints = Object.values(basePoints).reduce((sum, value) => sum + value, 0) * multiplier;

    return {
        ...predictionRow,
        points_awarded: totalPoints,
        status: 'scored',
        locked_at: lockedAt,
        scored_at: nowIso,
        scoring_breakdown: {
            winnerHit,
            diffHit,
            exactHome,
            exactAway,
            exactScore,
            oneTeamExactHit,
            multiplier,
            totalPoints,
            basePoints,
        },
    } satisfies AnyRow;
}

export function applyScoringRulesToPredictionRows(
    eventRows: AnyRow[],
    predictionRows: AnyRow[],
    rules: ProdeScoringRules,
): AnyRow[] {
    const eventMap = new Map(
        eventRows.map((row) => [toSafeString(row.id), row]),
    );

    return predictionRows.map((row) => {
        const eventRow = eventMap.get(toSafeString(row.event_id));
        if (!eventRow) {
            return row;
        }

        return scorePredictionRow(eventRow, row, rules);
    });
}

function isPredictionChanged(originalRow: AnyRow, nextRow: AnyRow) {
    return (
        toFiniteNumber(originalRow.points_awarded) !== toFiniteNumber(nextRow.points_awarded)
        || toSafeString(originalRow.status) !== toSafeString(nextRow.status)
        || toNullableString(originalRow.locked_at) !== toNullableString(nextRow.locked_at)
        || toNullableString(originalRow.scored_at) !== toNullableString(nextRow.scored_at)
        || JSON.stringify(toRecord(originalRow.scoring_breakdown)) !== JSON.stringify(toRecord(nextRow.scoring_breakdown))
    );
}

function buildRankingPayload(
    competitionId: string,
    userIds: string[],
    scopedPredictionRows: AnyRow[],
    scope: { scopeType: 'global' | 'private_league'; privateLeagueId?: string | null },
) {
    const predictionMap = new Map<string, AnyRow[]>();

    scopedPredictionRows.forEach((row) => {
        const userId = toSafeString(row.user_id);
        if (!userId) return;
        const current = predictionMap.get(userId) || [];
        current.push(row);
        predictionMap.set(userId, current);
    });

    const rankingRows = userIds.map((userId) => {
        const userPredictions = predictionMap.get(userId) || [];
        const totalPoints = userPredictions.reduce((sum, row) => sum + toFiniteNumber(row.points_awarded), 0);
        const exactHits = userPredictions.reduce((sum, row) => sum + (toBoolean(toRecord(row.scoring_breakdown).exactScore) ? 1 : 0), 0);
        const correctOutcomes = userPredictions.reduce((sum, row) => sum + (toBoolean(toRecord(row.scoring_breakdown).winnerHit) ? 1 : 0), 0);
        const scoredPredictionCount = userPredictions.reduce((sum, row) => sum + (toSafeString(row.status) === 'scored' ? 1 : 0), 0);

        return {
            competition_id: competitionId,
            user_id: userId,
            scope_type: scope.scopeType,
            round_key: null,
            private_league_id: scope.privateLeagueId ?? null,
            total_points: totalPoints,
            exact_hits: exactHits,
            correct_outcomes: correctOutcomes,
            position: null,
            tie_break_payload: {
                scoredPredictionCount,
            },
            computed_at: new Date().toISOString(),
        } satisfies AnyRow;
    });

    rankingRows.sort((left, right) => {
        const pointDiff = toFiniteNumber(right.total_points) - toFiniteNumber(left.total_points);
        if (pointDiff !== 0) return pointDiff;

        const exactDiff = toFiniteNumber(right.exact_hits) - toFiniteNumber(left.exact_hits);
        if (exactDiff !== 0) return exactDiff;

        const outcomeDiff = toFiniteNumber(right.correct_outcomes) - toFiniteNumber(left.correct_outcomes);
        if (outcomeDiff !== 0) return outcomeDiff;

        return toSafeString(left.user_id).localeCompare(toSafeString(right.user_id), 'es');
    });

    return rankingRows.map((row, index) => ({
        ...row,
        position: index + 1,
    }));
}

async function upsertCompetitionRankingScope(
    admin: LooseMutationClient,
    competitionId: string,
    rankingPayloads: AnyRow[],
    scope: { scopeType: 'global' | 'private_league'; privateLeagueId?: string | null },
) {
    const existingRowsResult = await admin
        .from('prode_rankings')
        .select('id, user_id, scope_type, private_league_id, round_key')
        .eq('competition_id', competitionId);

    if (existingRowsResult.error && !isMissingRelationError(existingRowsResult.error)) {
        throw new Error(existingRowsResult.error.message || 'No se pudieron cargar los rankings previos.');
    }

    const existingRows = existingRowsResult.data || [];
    const existingMap = new Map<string, AnyRow>();

    existingRows.forEach((row) => {
        const key = [
            toSafeString(row.scope_type),
            toSafeString(row.user_id),
            toSafeString(row.private_league_id),
            toSafeString(row.round_key),
        ].join('::');

        if (!existingMap.has(key)) {
            existingMap.set(key, row);
        }
    });

    const inserts: AnyRow[] = [];
    const updates: Array<{ id: string; payload: AnyRow }> = [];

    rankingPayloads.forEach((row) => {
        const key = [
            toSafeString(row.scope_type),
            toSafeString(row.user_id),
            toSafeString(row.private_league_id),
            toSafeString(row.round_key),
        ].join('::');
        const existingRow = existingMap.get(key);

        if (existingRow?.id) {
            updates.push({
                id: toSafeString(existingRow.id),
                payload: {
                    total_points: row.total_points,
                    exact_hits: row.exact_hits,
                    correct_outcomes: row.correct_outcomes,
                    position: row.position,
                    tie_break_payload: row.tie_break_payload,
                    computed_at: row.computed_at,
                },
            });
            return;
        }

        inserts.push(row);
    });

    const operations: Array<PromiseLike<MutationResult>> = [];

    if (inserts.length) {
        operations.push(admin.from('prode_rankings').insert(inserts));
    }

    updates.forEach((updateRow) => {
        operations.push(
            admin
                .from('prode_rankings')
                .update(updateRow.payload)
                .eq('id', updateRow.id),
        );
    });

    const desiredKeys = new Set(
        rankingPayloads.map((row) => [
            toSafeString(row.scope_type),
            toSafeString(row.user_id),
            toSafeString(row.private_league_id),
            toSafeString(row.round_key),
        ].join('::')),
    );
    const staleIds = existingRows
        .filter((row) => {
            const scopeMatches = toSafeString(row.scope_type) === scope.scopeType;
            if (!scopeMatches) {
                return false;
            }

            if (scope.scopeType === 'private_league') {
                return toSafeString(row.private_league_id) === toSafeString(scope.privateLeagueId);
            }

            return !toSafeString(row.private_league_id);
        })
        .filter((row) => {
            const key = [
                toSafeString(row.scope_type),
                toSafeString(row.user_id),
                toSafeString(row.private_league_id),
                toSafeString(row.round_key),
            ].join('::');
            return !desiredKeys.has(key);
        })
        .map((row) => toSafeString(row.id))
        .filter(Boolean);

    if (staleIds.length) {
        operations.push(
            admin
                .from('prode_rankings')
                .delete()
                .in('id', staleIds),
        );
    }

    const results = operations.length ? await Promise.all(operations) : [];
    const failedResult = results.find((result) => result.error);

    if (failedResult?.error) {
        throw new Error(failedResult.error.message || 'No se pudieron persistir los rankings.');
    }
}

async function refreshUserTotals(admin: LooseMutationClient, userIds: string[]) {
    if (!userIds.length) {
        return;
    }

    const [membershipResult, rankingResult] = await Promise.all([
        admin
            .from('prode_competition_members')
            .select('competition_id, user_id, status')
            .in('user_id', userIds)
            .eq('status', 'active'),
        admin
            .from('prode_rankings')
            .select('competition_id, user_id, total_points, exact_hits, correct_outcomes, tie_break_payload')
            .in('user_id', userIds)
            .eq('scope_type', 'global'),
    ]);

    if (membershipResult.error) {
        throw new Error(membershipResult.error.message || 'No se pudieron cargar las membresias del prode.');
    }
    if (rankingResult.error) {
        throw new Error(rankingResult.error.message || 'No se pudieron cargar los rankings globales del prode.');
    }

    const membershipMap = new Map<string, Set<string>>();
    (membershipResult.data || []).forEach((row) => {
        const userId = toSafeString(row.user_id);
        const competitionId = toSafeString(row.competition_id);
        if (!userId || !competitionId) return;

        const current = membershipMap.get(userId) || new Set<string>();
        current.add(competitionId);
        membershipMap.set(userId, current);
    });

    const rankingMap = new Map<string, AnyRow[]>();
    (rankingResult.data || []).forEach((row) => {
        const userId = toSafeString(row.user_id);
        if (!userId) return;

        const current = rankingMap.get(userId) || [];
        current.push(row);
        rankingMap.set(userId, current);
    });

    const totalsPayload = userIds.map((userId) => {
        const rankings = rankingMap.get(userId) || [];
        const joinedCompetitions = membershipMap.get(userId)?.size || 0;
        const competitionsScored = rankings.reduce((sum, row) => {
            const scoredPredictionCount = toFiniteNumber(toRecord(row.tie_break_payload).scoredPredictionCount);
            return sum + (scoredPredictionCount > 0 ? 1 : 0);
        }, 0);

        return {
            user_id: userId,
            total_points: rankings.reduce((sum, row) => sum + toFiniteNumber(row.total_points), 0),
            exact_hits: rankings.reduce((sum, row) => sum + toFiniteNumber(row.exact_hits), 0),
            correct_outcomes: rankings.reduce((sum, row) => sum + toFiniteNumber(row.correct_outcomes), 0),
            competitions_joined: joinedCompetitions,
            competitions_scored: competitionsScored,
            position: null,
            metadata: {
                competitionsScored,
            },
            computed_at: new Date().toISOString(),
        } satisfies AnyRow;
    });

    totalsPayload.sort((left, right) => {
        const pointDiff = toFiniteNumber(right.total_points) - toFiniteNumber(left.total_points);
        if (pointDiff !== 0) return pointDiff;

        const exactDiff = toFiniteNumber(right.exact_hits) - toFiniteNumber(left.exact_hits);
        if (exactDiff !== 0) return exactDiff;

        const outcomeDiff = toFiniteNumber(right.correct_outcomes) - toFiniteNumber(left.correct_outcomes);
        if (outcomeDiff !== 0) return outcomeDiff;

        return toSafeString(left.user_id).localeCompare(toSafeString(right.user_id), 'es');
    });

    const finalPayload = totalsPayload.map((row, index) => ({
        ...row,
        position: index + 1,
    }));

    const result = await admin.from('prode_user_totals').upsert(finalPayload, { onConflict: 'user_id' });
    if (result.error) {
        throw new Error(result.error.message || 'No se pudieron actualizar los totales del prode.');
    }
}

export async function refreshCompetitionScoreboards(competitionId: string) {
    if (!competitionId) {
        return false;
    }

    if (isFreshEnough(competitionRefreshCompletedAt.get(competitionId), COMPETITION_REFRESH_TTL_MS)) {
        return true;
    }

    const refreshVersion = competitionRefreshVersion.get(competitionId) || 0;
    const existingRefresh = competitionRefreshInFlight.get(competitionId);
    if (existingRefresh && existingRefresh.version === refreshVersion) {
        return existingRefresh.promise;
    }

    const refreshPromise = (async () => {
        const admin = createAdminClient() as unknown as LooseMutationClient;
        const competitionResult = await admin
            .from('prode_competitions')
            .select('id, active_ruleset_id, metadata')
            .eq('id', competitionId)
            .maybeSingle();

        if (competitionResult.error) {
            if (isMissingRelationError(competitionResult.error)) {
                return false;
            }

            throw new Error(competitionResult.error.message || 'No se pudo cargar la competencia del prode.');
        }

        if (!competitionResult.data) {
            return false;
        }

        const activeRulesetId = toSafeString(competitionResult.data.active_ruleset_id);
        const [rulesetResult, eventResult, predictionResult, competitionMembersResult, privateLeagueResult] = await Promise.all([
            activeRulesetId
                ? admin
                    .from('prode_rulesets')
                    .select('id, scoring_model')
                    .eq('id', activeRulesetId)
                    .maybeSingle()
                : Promise.resolve({ data: null, error: null }),
            admin
                .from('prode_events')
                .select('id, competition_id, status, scoring_status, official_result, match_snapshot, locks_at, scored_at')
                .eq('competition_id', competitionId)
                .order('starts_at', { ascending: true }),
            admin
                .from('prode_predictions')
                .select('id, competition_id, event_id, user_id, predicted_outcome, predicted_home_score, predicted_away_score, points_awarded, status, scoring_breakdown, submitted_at, locked_at, scored_at')
                .eq('competition_id', competitionId),
            admin
                .from('prode_competition_members')
                .select('competition_id, user_id, status')
                .eq('competition_id', competitionId)
                .eq('status', 'active'),
            admin
                .from('prode_private_leagues')
                .select('id, competition_id, metadata')
                .eq('competition_id', competitionId),
        ]);

        const blockingError = [
            rulesetResult.error,
            eventResult.error,
            predictionResult.error,
            competitionMembersResult.error,
            privateLeagueResult.error,
        ].find((error) => error && !isMissingRelationError(error));

        if (blockingError) {
            throw new Error(blockingError.message || 'No se pudo refrescar el scoring del prode.');
        }

        const competitionRow = competitionResult.data;
        const eventRows = eventResult.data || [];
        const predictionRows = predictionResult.data || [];
        const memberUserIds = Array.from(new Set([
            ...(competitionMembersResult.data || []).map((row) => toSafeString(row.user_id)).filter(Boolean),
            ...predictionRows.map((row) => toSafeString(row.user_id)).filter(Boolean),
        ]));
        const activeLeagueRows = (privateLeagueResult.data || []).filter((row) => {
            const lifecycle = toSafeString(toRecord(row.metadata).lifecycle);
            return !lifecycle || lifecycle === 'active';
        });

        const globalRules = resolveProdeScoringRules(competitionRow, rulesetResult.data);
        const scoredPredictions = applyScoringRulesToPredictionRows(eventRows, predictionRows, globalRules);

        // Bulk upsert all changed predictions instead of firing one UPDATE per
        // row. With 1k users x 50 events that's the difference between 50k
        // round-trips and ~50 (one per chunk). onConflict: 'id' upserts the
        // existing rows in place — a missing id would re-insert, which we
        // explicitly avoid by filtering rows with valid ids first.
        const changedPredictions = scoredPredictions
            .map((row, index) => ({ row, index }))
            .filter(({ row, index }) => isPredictionChanged(predictionRows[index] || {}, row))
            .map(({ row }) => row)
            .filter((row) => Boolean(toSafeString(row.id)));

        const PREDICTION_CHUNK = 500;
        for (let i = 0; i < changedPredictions.length; i += PREDICTION_CHUNK) {
            const chunk = changedPredictions.slice(i, i + PREDICTION_CHUNK).map((row) => ({
                id: toSafeString(row.id),
                competition_id: toSafeString(row.competition_id),
                event_id: toSafeString(row.event_id),
                user_id: toSafeString(row.user_id),
                predicted_outcome: toNullableString(row.predicted_outcome),
                predicted_home_score: toNullableNumber(row.predicted_home_score),
                predicted_away_score: toNullableNumber(row.predicted_away_score),
                points_awarded: row.points_awarded,
                status: row.status,
                scoring_breakdown: row.scoring_breakdown,
                submitted_at: toNullableString(row.submitted_at),
                locked_at: row.locked_at,
                scored_at: row.scored_at,
            }));
            const { error } = await admin
                .from('prode_predictions')
                .upsert(chunk, { onConflict: 'id' });
            if (error) {
                throw new Error(error.message || 'No se pudieron persistir los puntos del prode.');
            }
        }

        // Group events by their target update payload so we can dispatch one
        // UPDATE…WHERE id IN (...) per distinct status transition.
        const nowIso = new Date().toISOString();
        const eventBuckets = new Map<string, { payload: AnyRow; ids: string[] }>();

        for (const row of eventRows) {
            const officialResult = parseOfficialResult(row.official_result);
            const status = toSafeString(row.status);
            const id = toSafeString(row.id);
            if (!id) continue;

            let payload: AnyRow | null = null;
            if (status === 'cancelled') {
                payload = { scoring_status: 'void', scored_at: nowIso };
            } else if (officialResult && (status === 'final' || status === 'scored')) {
                payload = { status: 'scored', scoring_status: 'scored', scored_at: nowIso };
            }

            if (!payload) continue;

            const bucketKey = JSON.stringify(payload);
            const bucket = eventBuckets.get(bucketKey) ?? { payload, ids: [] };
            bucket.ids.push(id);
            eventBuckets.set(bucketKey, bucket);
        }

        for (const { payload, ids } of eventBuckets.values()) {
            for (let i = 0; i < ids.length; i += PREDICTION_CHUNK) {
                const chunk = ids.slice(i, i + PREDICTION_CHUNK);
                const { error } = await admin
                    .from('prode_events')
                    .update(payload)
                    .in('id', chunk);
                if (error) {
                    throw new Error(error.message || 'No se pudieron persistir los puntos del prode.');
                }
            }
        }

        const globalRankings = buildRankingPayload(competitionId, memberUserIds, scoredPredictions, { scopeType: 'global' });
        await upsertCompetitionRankingScope(admin, competitionId, globalRankings, { scopeType: 'global' });

        const activeLeagueIds = activeLeagueRows.map((row) => toSafeString(row.id)).filter(Boolean);
        if (activeLeagueIds.length) {
            const leagueMembersResult = await admin
                .from('prode_private_league_members')
                .select('private_league_id, user_id, role')
                .in('private_league_id', activeLeagueIds);

            if (leagueMembersResult.error) {
                throw new Error(leagueMembersResult.error.message || 'No se pudieron cargar los miembros de las ligas privadas.');
            }

            const leagueMembershipMap = new Map<string, Set<string>>();
            (leagueMembersResult.data || []).forEach((row) => {
                const leagueId = toSafeString(row.private_league_id);
                const userId = toSafeString(row.user_id);
                if (!leagueId || !userId) return;

                const current = leagueMembershipMap.get(leagueId) || new Set<string>();
                current.add(userId);
                leagueMembershipMap.set(leagueId, current);
            });

            const privateLeagueRankings = activeLeagueRows.flatMap((leagueRow) => {
                const leagueId = toSafeString(leagueRow.id);
                const scopedRules = resolveProdeScoringRules(competitionRow, rulesetResult.data, leagueRow);
                const scopedPredictions = applyScoringRulesToPredictionRows(eventRows, predictionRows, scopedRules);
                const leagueUserIds = Array.from(leagueMembershipMap.get(leagueId) || []);

                return buildRankingPayload(
                    competitionId,
                    leagueUserIds,
                    scopedPredictions.filter((row) => leagueUserIds.includes(toSafeString(row.user_id))),
                    { scopeType: 'private_league', privateLeagueId: leagueId },
                );
            });

            const privateLeagueIds = Array.from(new Set(
                privateLeagueRankings.map((row) => toSafeString(row.private_league_id)).filter(Boolean),
            ));

            await Promise.all(
                privateLeagueIds.map((privateLeagueId) => (
                    upsertCompetitionRankingScope(
                        admin,
                        competitionId,
                        privateLeagueRankings.filter((row) => toSafeString(row.private_league_id) === privateLeagueId),
                        { scopeType: 'private_league', privateLeagueId },
                    )
                )),
            );
        }

        await refreshUserTotals(admin, memberUserIds);
        if ((competitionRefreshVersion.get(competitionId) || 0) === refreshVersion) {
            competitionRefreshCompletedAt.set(competitionId, Date.now());
        }
        return true;
    })().finally(() => {
        competitionRefreshInFlight.delete(competitionId);
    });

    competitionRefreshInFlight.set(competitionId, { promise: refreshPromise, version: refreshVersion });
    return refreshPromise;
}

export async function refreshStoredProdeScoreboards() {
    if (isFreshEnough(globalRefreshCompletedAt, GLOBAL_REFRESH_TTL_MS)) {
        return true;
    }

    const refreshVersion = globalRefreshVersion;
    if (globalRefreshInFlight && globalRefreshInFlight.version === refreshVersion) {
        return globalRefreshInFlight.promise;
    }

    const refreshPromise = (async () => {
        const admin = createAdminClient() as unknown as LooseMutationClient;
        const competitionResult = await admin
            .from('prode_competitions')
            .select('id')
            .in('status', ['active', 'published', 'finished']);

        if (competitionResult.error) {
            if (isMissingRelationError(competitionResult.error)) {
                return false;
            }

            throw new Error(competitionResult.error.message || 'No se pudieron cargar las competencias del prode.');
        }

        // Limit concurrency: each refreshCompetitionScoreboards already
        // dispatches dozens of queries internally, so refreshing all
        // competitions in parallel was a fast path to exhausting the
        // connection pool. Run them with bounded concurrency instead.
        const competitionIds = (competitionResult.data || [])
            .map((row) => toSafeString(row.id))
            .filter(Boolean);
        const REFRESH_CONCURRENCY = 2;

        for (let i = 0; i < competitionIds.length; i += REFRESH_CONCURRENCY) {
            const batch = competitionIds.slice(i, i + REFRESH_CONCURRENCY);
            await Promise.allSettled(
                batch.map(async (competitionId) => {
                    try {
                        await refreshCompetitionScoreboards(competitionId);
                    } catch (error) {
                        console.error('[prode/scoring] refresh failed for competition', competitionId, error);
                    }
                }),
            );
        }

        if (globalRefreshVersion === refreshVersion) {
            globalRefreshCompletedAt = Date.now();
        }
        return true;
    })().finally(() => {
        globalRefreshInFlight = null;
    });

    globalRefreshInFlight = { promise: refreshPromise, version: refreshVersion };
    return refreshPromise;
}
