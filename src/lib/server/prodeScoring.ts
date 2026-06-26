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

    // Solo puntuamos cuando el partido finalizó. Algunos proveedores (ESPN) envían
    // marcador 0 para partidos no jugados; sin esta guarda se puntuarían picks contra
    // un resultado inexistente apenas aparece un official_result.
    const isFinalized = eventStatus === 'final' || eventStatus === 'scored';

    if (!officialResult || !isFinalized) {
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

    const multiplier = rules.doubleFinals && isFinalStage(eventRow) ? 2 : 1;
    const breakdown = computePredictionPoints(
        { predictedHomeScore, predictedAwayScore, predictedOutcome },
        officialResult,
        rules,
        multiplier,
    );

    return {
        ...predictionRow,
        points_awarded: breakdown.totalPoints,
        status: 'scored',
        locked_at: lockedAt,
        scored_at: nowIso,
        scoring_breakdown: breakdown,
    } satisfies AnyRow;
}

type ProdePredictionInput = {
    predictedHomeScore: number | null;
    predictedAwayScore: number | null;
    predictedOutcome: string | null;
};

type ProdeOfficialScore = {
    homeScore: number;
    awayScore: number;
    outcome: string;
};

// Núcleo del puntaje: compara un pronóstico contra un marcador (oficial o en vivo)
// y devuelve el desglose. Fuente única usada tanto por el scoring persistido como
// por el cálculo provisorio en vivo, para que ambos den exactamente lo mismo.
export function computePredictionPoints(
    predicted: ProdePredictionInput,
    official: ProdeOfficialScore,
    rules: ProdeScoringRules,
    multiplier: number,
) {
    const exactHome = predicted.predictedHomeScore !== null && predicted.predictedHomeScore === official.homeScore;
    const exactAway = predicted.predictedAwayScore !== null && predicted.predictedAwayScore === official.awayScore;
    const exactScore = exactHome && exactAway;
    const predictedDiff = predicted.predictedHomeScore !== null && predicted.predictedAwayScore !== null
        ? predicted.predictedHomeScore - predicted.predictedAwayScore
        : null;
    const officialDiff = official.homeScore - official.awayScore;
    const winnerHit = predicted.predictedOutcome === official.outcome;
    const diffHit = predictedDiff !== null && predictedDiff === officialDiff;
    const oneTeamExactHit = !exactScore && (exactHome || exactAway);

    const basePoints = {
        winner: winnerHit ? rules.winner : 0,
        diff: diffHit ? rules.diff : 0,
        oneTeamExact: oneTeamExactHit && rules.oneTeamExact !== null ? rules.oneTeamExact : 0,
        exact: exactScore ? rules.exact : 0,
    };

    const totalPoints = Object.values(basePoints).reduce((sum, value) => sum + value, 0) * multiplier;

    return { winnerHit, diffHit, exactHome, exactAway, exactScore, oneTeamExactHit, multiplier, totalPoints, basePoints };
}

// Marcador oficial/en vivo de un evento, o null si todavía no hay (partido sin
// empezar). Expuesto para que las vistas en vivo lean el score con la misma
// lógica de parseo que el motor de scoring.
export function readEventOfficialScore(eventRow: AnyRow) {
    return parseOfficialResult(eventRow.official_result);
}

// Puntaje PROVISORIO en vivo: igual que scorePredictionRow pero sin exigir que el
// partido esté finalizado. Sirve para mostrar, mientras el partido va en curso,
// cuántos puntos lleva cada pronóstico con el marcador actual (que luego, al
// cerrarse el partido, el motor persiste como definitivo). No escribe nada.
export function scoreLivePrediction(eventRow: AnyRow, predictionRow: AnyRow, rules: ProdeScoringRules) {
    const status = toSafeString(eventRow.status);
    const official = parseOfficialResult(eventRow.official_result);

    if (status === 'cancelled' || !official) {
        return { hasScore: false, isFinal: false, points: 0, breakdown: null, official };
    }

    const predictedHomeScore = toNullableNumber(predictionRow.predicted_home_score);
    const predictedAwayScore = toNullableNumber(predictionRow.predicted_away_score);
    const predictedOutcome = toSafeString(predictionRow.predicted_outcome)
        || buildPredictionOutcome(predictedHomeScore, predictedAwayScore);
    const multiplier = rules.doubleFinals && isFinalStage(eventRow) ? 2 : 1;
    const breakdown = computePredictionPoints(
        { predictedHomeScore, predictedAwayScore, predictedOutcome },
        official,
        rules,
        multiplier,
    );

    return {
        hasScore: true,
        isFinal: status === 'final' || status === 'scored',
        points: breakdown.totalPoints,
        breakdown,
        official,
    };
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

type ProdeRuleEpoch = {
    // Momento en que esta versión de reglas tomó efecto. La base (v1) arranca en
    // -Infinity, así aplica desde el origen de la liga.
    appliedAtMs: number;
    // Si el admin eligió "cambiar todo", el cambio aplica a TODO partido sin importar
    // cuándo se jugó. Si eligió "mantener", solo a los partidos que cierran después.
    retroactive: boolean;
    rules: ProdeScoringRules;
};

function parseTimeMs(value: unknown): number | null {
    const parsed = new Date(toSafeString(value)).getTime();
    return Number.isFinite(parsed) ? parsed : null;
}

// Reconstruye la línea de tiempo de reglas de una liga privada desde
// metadata.rulesHistory. La v1 (sembrada al crear la liga) es la base. Cada cambio
// posterior conserva su flag `retroactive`, lo que permite puntuar cada partido con
// las reglas que correspondían a su momento sin tener que persistir el puntaje por
// liga: se recalcula desde el resultado oficial con las reglas correctas de época.
export function resolveLeagueRuleEpochs(
    competitionRow: AnyRow,
    rulesetRow: AnyRow | null | undefined,
    privateLeagueRow: AnyRow,
): ProdeRuleEpoch[] {
    const metadata = toRecord(privateLeagueRow.metadata);
    const history = Array.isArray(metadata.rulesHistory)
        ? metadata.rulesHistory.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object')
        : [];

    if (!history.length) {
        // Liga legacy sin historial: una sola época retroactiva con las reglas
        // vigentes. Equivale al comportamiento previo (recálculo total).
        return [{
            appliedAtMs: Number.NEGATIVE_INFINITY,
            retroactive: true,
            rules: resolveProdeScoringRules(competitionRow, rulesetRow, privateLeagueRow),
        }];
    }

    const ordered = [...history].sort((left, right) => {
        const versionDiff = toFiniteNumber(left.version) - toFiniteNumber(right.version);
        if (versionDiff !== 0) return versionDiff;
        return (parseTimeMs(left.appliedAt) ?? 0) - (parseTimeMs(right.appliedAt) ?? 0);
    });

    return ordered.map((entry, index) => ({
        appliedAtMs: index === 0
            ? Number.NEGATIVE_INFINITY
            : (parseTimeMs(entry.appliedAt) ?? Number.NEGATIVE_INFINITY),
        retroactive: index === 0 ? true : toBoolean(entry.retroactive),
        rules: resolveProdeScoringRules(
            competitionRow,
            rulesetRow,
            { metadata: { rules: toRecord(entry.rules) } },
        ),
    }));
}

function selectEpochRules(epochs: ProdeRuleEpoch[], eventBoundaryMs: number | null): ProdeScoringRules {
    let effective = epochs[0].rules;
    for (let i = 1; i < epochs.length; i += 1) {
        const epoch = epochs[i];
        // Retroactivo → pisa siempre. No retroactivo → solo afecta partidos cuyo
        // cierre (locks_at) cae en/después del cambio, o que todavía no se jugaron.
        if (epoch.retroactive || eventBoundaryMs === null || eventBoundaryMs >= epoch.appliedAtMs) {
            effective = epoch.rules;
        }
    }
    return effective;
}

export function applyLeagueScoringEpochs(
    eventRows: AnyRow[],
    predictionRows: AnyRow[],
    epochs: ProdeRuleEpoch[],
): AnyRow[] {
    const eventMap = new Map(
        eventRows.map((row) => [toSafeString(row.id), row]),
    );

    return predictionRows.map((row) => {
        const eventRow = eventMap.get(toSafeString(row.event_id));
        if (!eventRow) {
            return row;
        }

        // locks_at (≈ inicio del partido) es el límite estable para decidir si un
        // partido "ya se jugó" frente a un cambio de reglas. scored_at no sirve: el
        // motor lo reescribe a now() en cada corrida.
        const boundaryMs = parseTimeMs(eventRow.locks_at);
        const rules = selectEpochRules(epochs, boundaryMs);
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
    // Upsert atómico sobre la clave única de scope. Antes esto hacía
    // read-then-insert/update en la app, lo que bajo refresh concurrente (cron +
    // render de /prode/[slug] en lambdas distintos, sin lock compartido) podía
    // insertar la misma fila dos veces → rankings duplicados que refreshUserTotals
    // suma por usuario. Con el constraint prode_rankings_scope_unique
    // (NULLS NOT DISTINCT) el ON CONFLICT converge a una sola fila por scope.
    if (rankingPayloads.length) {
        const upsertResult = await admin
            .from('prode_rankings')
            .upsert(rankingPayloads, {
                onConflict: 'competition_id,user_id,scope_type,round_key,private_league_id',
            });

        if (upsertResult.error && !isMissingRelationError(upsertResult.error)) {
            throw new Error(upsertResult.error.message || 'No se pudieron persistir los rankings.');
        }
    }

    // Limpieza de filas obsoletas: usuarios que ya no pertenecen a este scope
    // (salieron de la liga/competencia o quedaron sin predicciones) deben dejar de
    // figurar en la tabla. El upsert no las toca, así que las borramos aparte.
    const existingRowsResult = await admin
        .from('prode_rankings')
        .select('id, user_id, scope_type, private_league_id, round_key')
        .eq('competition_id', competitionId);

    if (existingRowsResult.error) {
        if (isMissingRelationError(existingRowsResult.error)) {
            return;
        }
        throw new Error(existingRowsResult.error.message || 'No se pudieron cargar los rankings previos.');
    }

    const desiredKeys = new Set(
        rankingPayloads.map((row) => [
            toSafeString(row.scope_type),
            toSafeString(row.user_id),
            toSafeString(row.private_league_id),
            toSafeString(row.round_key),
        ].join('::')),
    );

    const staleIds = (existingRowsResult.data || [])
        .filter((row) => {
            if (toSafeString(row.scope_type) !== scope.scopeType) {
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
        const deleteResult = await admin
            .from('prode_rankings')
            .delete()
            .in('id', staleIds);

        if (deleteResult.error) {
            throw new Error(deleteResult.error.message || 'No se pudieron limpiar rankings obsoletos.');
        }
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

    // OJO: este refresh solo conoce a los usuarios de UNA competencia (userIds), así
    // que NO se puede asignar una posición global acá — hacerlo daba posiciones 1..N
    // dentro de cada subset y el ranking global terminaba intercalado sin orden real
    // de puntos. La posición global se deriva en la lectura (listPublicProdeUserTotals),
    // que ordena sobre TODOS los usuarios. Persistimos position = null a propósito.
    const result = await admin.from('prode_user_totals').upsert(totalsPayload, { onConflict: 'user_id' });
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
                const leagueEpochs = resolveLeagueRuleEpochs(competitionRow, rulesetResult.data, leagueRow);
                const scopedPredictions = applyLeagueScoringEpochs(eventRows, predictionRows, leagueEpochs);
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
        // Solo competencias en curso. Las 'finished' ya no reciben picks ni
        // cambian de puntaje, así que recalcularlas en cada corrida del cron sería
        // trabajo perpetuo e inútil que crecería con cada torneo terminado. Su
        // scoreboard final se sigue calculando cuando alguien abre su página
        // (/prode/[slug] llama a refreshCompetitionScoreboards sin filtrar por
        // estado), y prode_user_totals persiste una vez computado.
        const competitionResult = await admin
            .from('prode_competitions')
            .select('id')
            .in('status', ['active', 'published']);

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
