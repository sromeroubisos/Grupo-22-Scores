/**
 * Tournament Bonus Engine — Skeleton (etapa 2)
 *
 * Reemplaza los campos hardcoded `pointsBonusTry` / `pointsBonusLoss` por un
 * sistema de reglas evaluables. Cada regla compila a una condición que el motor
 * recorre sobre cada partido cargado y suma los puntos correspondientes.
 *
 * TODO (etapa 2):
 *   - [ ] Persistir reglas en `tournaments.ruleset.bonusRules` (jsonb)
 *   - [ ] Migración: backfill desde pointsBonusTry/pointsBonusLoss a las reglas BNS-RUGBY-OFENSIVO y BNS-RUGBY-DEFENSIVO
 *   - [ ] API: POST /api/tournaments/[id]/bonus-rules (CRUD)
 *   - [ ] Frontend: editor visual basado en BonusRule (campo + operador + valor)
 *   - [ ] Evaluador en backend: aplicar reglas al guardar resultados de partido
 *   - [ ] Simulador en frontend: tomar últimos N partidos y mostrar qué reglas se cumplirían
 *   - [ ] Auditoría: log de cada bonus otorgado con regla, partido y equipo
 */

/* ============== Tipos ============== */

/**
 * Campos del modelo de partido que una regla puede evaluar.
 * El motor expone cada uno como un valor numérico por partido por equipo.
 */
export type BonusField =
    // Por equipo evaluado en el partido
    | 'tries_for'
    | 'tries_against'
    | 'points_for'
    | 'points_against'
    | 'points_diff'         // points_for - points_against (positivo si gana)
    | 'tries_diff'
    | 'red_cards'
    | 'yellow_cards'
    | 'conversion_pct'
    // Por partido (mismo valor para ambos equipos)
    | 'total_tries'
    | 'total_points'
    | 'sets_lost'           // voley/tenis: sets perdidos por el ganador
    | 'overtime'            // bool 0/1
    | 'venue_attendance'
    // Custom
    | string;

/**
 * Operadores soportados al comparar el campo con un valor de referencia.
 */
export type BonusOperator =
    | 'gte'                 // >=
    | 'gt'                  // >
    | 'lte'                 // <=
    | 'lt'                  // <
    | 'eq'                  // ===
    | 'neq'                 // !==
    | 'between'             // x ∈ [a, b]
    | 'between_excl';       // x ∈ (a, b)

/**
 * Valor contra el que se compara. Puede ser una constante, una referencia a
 * otro campo (ej: tries del rival + 3), o un parámetro global del torneo.
 */
export type BonusValueRef =
    | { kind: 'constant'; value: number }
    | { kind: 'range'; min: number; max: number }
    | { kind: 'field'; field: BonusField; offset?: number }
    | { kind: 'tournament_param'; key: string };

/**
 * A quién aplica la regla cuando se cumple. El motor evalúa por equipo.
 */
export type BonusAppliesTo =
    | 'both'                // ambos equipos del partido
    | 'winner'
    | 'loser'
    | 'draw_both'
    | 'home_winner'
    | 'away_winner'
    | 'home'
    | 'away'
    | 'evaluated_team';     // el equipo desde cuyo punto de vista se calcula

/**
 * Modo de cómputo del puntaje cuando la regla se cumple.
 */
export type BonusComputeMode =
    /** Suma `points` fijo si la condición se cumple. */
    | { kind: 'fixed'; points: number }
    /** Suma `points * (campo - umbral)`, ej: +1 por cada try sobre 4. */
    | { kind: 'multiplier'; points: number; field: BonusField; threshold: number }
    /** Suma según una tabla escalonada. Ej: 1pt @4, 2pt @6, 3pt @8. */
    | { kind: 'tiered'; field: BonusField; tiers: Array<{ at: number; points: number }> };

export interface BonusRule {
    id: string;                          // ej: 'bonus_rule_4cd3...'
    code?: string;                       // ej: 'BNS-001' — para auditoría
    label: string;                       // 'Bonus ofensivo · 4+ tries'
    description?: string;
    field: BonusField;
    operator: BonusOperator;
    value: BonusValueRef;
    appliesTo: BonusAppliesTo;
    compute: BonusComputeMode;
    /** Límite de veces que la regla puede aplicarse por partido. 0 = sin límite. */
    perMatchLimit: number;
    /** Categoría para agrupación en UI: 'match', 'team', 'player', 'event'. */
    category: 'match' | 'team' | 'player' | 'event';
    enabled: boolean;
    /** Notas internas para el organizador. */
    notes?: string;
    /** Cuándo se creó/modificó. */
    createdAt?: string;
    updatedAt?: string;
}

/**
 * Resultado de aplicar una regla a un partido específico para un equipo.
 */
export interface BonusEvaluation {
    ruleId: string;
    ruleLabel: string;
    matchId: string;
    teamId: string;
    /** Si la condición se cumplió. */
    matched: boolean;
    /** Puntos otorgados (0 si no matched). */
    pointsAwarded: number;
    /** Traza para auditoría: qué valor se evaluó, contra qué. */
    trace: {
        fieldValue: number;
        referenceValue: number | [number, number];
        operator: BonusOperator;
        operands: Record<string, number | string | boolean>;
    };
}

/* ============== Reglas predefinidas (presets) ============== */

export const BONUS_PRESETS: BonusRule[] = [
    {
        id: 'preset_rugby_offensive',
        code: 'BNS-RUGBY-OFENSIVO',
        label: 'Bonus ofensivo · 4 tries o más',
        description: 'Premia al ataque sin importar el resultado del partido.',
        field: 'tries_for',
        operator: 'gte',
        value: { kind: 'constant', value: 4 },
        appliesTo: 'evaluated_team',
        compute: { kind: 'fixed', points: 1 },
        perMatchLimit: 1,
        category: 'match',
        enabled: true,
    },
    {
        id: 'preset_rugby_offensive_margin',
        code: 'BNS-RUGBY-OFENSIVO-DIFERENCIA',
        label: 'Bonus ofensivo · 3 tries más que el rival',
        description: 'Premia al ataque sólo cuando supera al rival por tres tries (3-0, 4-1, 5-2). Es la regla de World Rugby desde 2016.',
        field: 'tries_diff',
        operator: 'gte',
        value: { kind: 'constant', value: 3 },
        appliesTo: 'evaluated_team',
        compute: { kind: 'fixed', points: 1 },
        perMatchLimit: 1,
        category: 'match',
        enabled: false,
    },
    {
        id: 'preset_rugby_defensive',
        code: 'BNS-RUGBY-DEFENSIVO',
        label: 'Bonus defensivo · perder por ≤ 7',
        description: 'Premia al perdedor que jugó cerrado.',
        field: 'points_diff',
        operator: 'between',
        value: { kind: 'range', min: -7, max: -1 },
        appliesTo: 'loser',
        compute: { kind: 'fixed', points: 1 },
        perMatchLimit: 1,
        category: 'match',
        enabled: true,
    },
    {
        id: 'preset_clean_sheet',
        code: 'BNS-CLEAN-SHEET',
        label: 'Valla invicta',
        description: 'No le anotaron al equipo.',
        field: 'points_against',
        operator: 'eq',
        value: { kind: 'constant', value: 0 },
        appliesTo: 'evaluated_team',
        compute: { kind: 'fixed', points: 1 },
        perMatchLimit: 1,
        category: 'match',
        enabled: false,
    },
    {
        id: 'preset_blowout',
        code: 'BNS-BLOWOUT',
        label: 'Goleada · diferencia ≥ 4',
        field: 'points_diff',
        operator: 'gte',
        value: { kind: 'constant', value: 4 },
        appliesTo: 'winner',
        compute: { kind: 'fixed', points: 1 },
        perMatchLimit: 1,
        category: 'match',
        enabled: false,
    },
    {
        id: 'preset_no_cards',
        code: 'BNS-NO-CARDS',
        label: 'Sin tarjetas rojas',
        field: 'red_cards',
        operator: 'eq',
        value: { kind: 'constant', value: 0 },
        appliesTo: 'evaluated_team',
        compute: { kind: 'fixed', points: 1 },
        perMatchLimit: 1,
        category: 'match',
        enabled: false,
    },
    {
        id: 'preset_no_sets_lost',
        code: 'BNS-CLEAN-SETS',
        label: 'Sin perder set · voley/tenis',
        field: 'sets_lost',
        operator: 'eq',
        value: { kind: 'constant', value: 0 },
        appliesTo: 'winner',
        compute: { kind: 'fixed', points: 1 },
        perMatchLimit: 1,
        category: 'match',
        enabled: false,
    },
];

/* ============== Stub del evaluador ============== */

export interface MatchEvaluationContext {
    matchId: string;
    homeTeamId: string;
    awayTeamId: string;
    fields: Record<BonusField, { home: number; away: number; both?: number }>;
}

/**
 * Evalúa una regla sobre un partido y devuelve hasta 2 BonusEvaluation
 * (uno por cada equipo evaluado, si la regla aplica a ambos).
 *
 * TODO: implementar con tests unitarios.
 */
export function evaluateBonusRule(
    _rule: BonusRule,
    _ctx: MatchEvaluationContext,
): BonusEvaluation[] {
    // TODO etapa 2 — implementar.
    return [];
}

/**
 * Aplica todas las reglas activas a un partido. Útil al guardar resultados.
 *
 * TODO: implementar con tests unitarios.
 */
export function evaluateAllBonusRules(
    _rules: BonusRule[],
    _ctx: MatchEvaluationContext,
): BonusEvaluation[] {
    // TODO etapa 2 — implementar.
    return [];
}

/**
 * Convierte una regla en un string humano legible para mostrar en UI.
 * Ej: 'IF tries_for >= 4 THEN +1 pt al equipo'
 *
 * TODO: implementar con i18n.
 */
export function describeBonusRule(_rule: BonusRule): string {
    // TODO etapa 2 — implementar.
    return '';
}
