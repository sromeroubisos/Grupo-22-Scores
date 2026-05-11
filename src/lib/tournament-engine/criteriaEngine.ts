/**
 * Tournament Criteria Engine — Skeleton (etapa 2)
 *
 * Define criterios de desempate funcionales (no labels decorativos): cada uno
 * es una función comparadora pura `(equipoA, equipoB) => -1 | 0 | +1`.
 * El motor aplica los criterios en cascada en el orden definido hasta romper
 * el empate. Cada criterio tiene opciones funcionales propias.
 *
 * TODO (etapa 2):
 *   - [ ] Persistir criterios en `phases.settings.tiebreakers` (jsonb), ya parcialmente persistido
 *   - [ ] Migración: convertir el array actual de criterios simples a TiebreakCriterion completo (con options)
 *   - [ ] Frontend: editor reordenable + opciones por criterio + simulador
 *   - [ ] Evaluador: aplicar al calcular standings de una fase
 *   - [ ] Simulador: dado un set de teams empatados, mostrar trace paso a paso
 *   - [ ] Tests: cubrir cada combinación de opciones (head-to-head, N=2 vs N>=3, etc.)
 */

/* ============== Tipos ============== */

export type TiebreakField =
    | 'points'
    | 'h2h_points'
    | 'points_diff'
    | 'tries_diff'
    | 'points_for'
    | 'tries_for'
    | 'red_cards_inv'        // menos rojas → ranking mayor (invertido)
    | 'walkovers_inv'        // menos walkovers → ranking mayor
    | 'coin_toss'
    | string;                // custom

/**
 * Opciones funcionales que afectan cómo el comparador calcula el campo.
 */
export interface TiebreakOptions {
    /** Para puntos: contar bonus o solo base. */
    includeBonus?: boolean;
    /** Para head-to-head y diff: alcance del cálculo. */
    scope?: 'whole_phase' | 'between_tied_only';
    /** Para head-to-head: aplicar solo si N=2 tied o también con N>=3. */
    requireExactPair?: boolean;
    /** Orden: descendente (típico) o ascendente (para `red_cards_inv`, `walkovers_inv`). */
    order?: 'desc' | 'asc';
}

export interface TiebreakCriterion {
    id: string;
    label: string;
    field: TiebreakField;
    /** Fórmula visible en UI. Ej: 'sum(points) DESC'. */
    formula?: string;
    options: TiebreakOptions;
    enabled: boolean;
    /** Posición en la cascada (1 es el primero que rompe el empate). */
    order: number;
}

/* ============== Catálogo de criterios disponibles ============== */

export const CRITERION_CATALOG: TiebreakCriterion[] = [
    {
        id: 'points',
        label: 'Puntos obtenidos',
        field: 'points',
        formula: 'sum(points) DESC',
        options: { includeBonus: true, order: 'desc' },
        enabled: true,
        order: 1,
    },
    {
        id: 'h2h',
        label: 'Resultados entre sí (head-to-head)',
        field: 'h2h_points',
        formula: 'h2h_points DESC',
        options: { scope: 'between_tied_only', requireExactPair: true, order: 'desc' },
        enabled: true,
        order: 2,
    },
    {
        id: 'diff_points',
        label: 'Diferencia de tantos',
        field: 'points_diff',
        formula: 'points_for - points_against',
        options: { scope: 'whole_phase', order: 'desc' },
        enabled: true,
        order: 3,
    },
    {
        id: 'diff_tries',
        label: 'Diferencia de tries',
        field: 'tries_diff',
        formula: 'tries_for - tries_against',
        options: { scope: 'whole_phase', order: 'desc' },
        enabled: true,
        order: 4,
    },
    {
        id: 'points_for',
        label: 'Tantos a favor',
        field: 'points_for',
        formula: 'sum(points_for) DESC',
        options: { scope: 'whole_phase', order: 'desc' },
        enabled: false,
        order: 5,
    },
    {
        id: 'tries_for',
        label: 'Tries a favor',
        field: 'tries_for',
        formula: 'sum(tries_for) DESC',
        options: { scope: 'whole_phase', order: 'desc' },
        enabled: false,
        order: 6,
    },
    {
        id: 'red_cards',
        label: 'Menos tarjetas rojas',
        field: 'red_cards_inv',
        formula: 'sum(red_cards) ASC',
        options: { scope: 'whole_phase', order: 'asc' },
        enabled: false,
        order: 7,
    },
    {
        id: 'coin_toss',
        label: 'Sorteo',
        field: 'coin_toss',
        formula: 'random()',
        options: {},
        enabled: false,
        order: 99,
    },
];

/* ============== Stub del simulador ============== */

export interface TeamStanding {
    teamId: string;
    teamName: string;
    points: number;
    pointsFor: number;
    pointsAgainst: number;
    triesFor: number;
    triesAgainst: number;
    redCards: number;
    yellowCards: number;
    walkovers: number;
    /** Resultados directos: map<rivalId, sumPointsObtainedAgainstRival> */
    h2h: Record<string, number>;
    /** Tag asignado por reglas de posición (opcional). */
    tag?: string;
}

export interface TiebreakStep {
    criterionId: string;
    criterionLabel: string;
    operands: Record<string, number>;
    resolution: 'resolved' | 'still_tied' | 'skipped';
    note?: string;
}

export interface TiebreakSimulation {
    inputTeams: TeamStanding[];
    finalOrder: TeamStanding[];
    trace: TiebreakStep[];
    /** Si se llegó a un sorteo. */
    coinTossUsed: boolean;
}

/**
 * Dada una lista de equipos empatados, aplicar la cascada de criterios y
 * devolver el orden final + el trace paso a paso. Útil para la UI del
 * simulador (qué pasa si 3 equipos empatan a 10 pts).
 *
 * TODO etapa 2: implementar con tests unitarios cubriendo:
 *   - 2 equipos empatados
 *   - 3+ equipos empatados
 *   - Sub-empates parciales (A y B desempatan, C queda atrás)
 *   - head-to-head con N=2 solamente
 *   - head-to-head mini-tabla con N>=3
 *   - llegada a sorteo
 */
export function simulateTiebreak(
    _criteria: TiebreakCriterion[],
    _tiedTeams: TeamStanding[],
): TiebreakSimulation {
    // TODO etapa 2 — implementar.
    return {
        inputTeams: [],
        finalOrder: [],
        trace: [],
        coinTossUsed: false,
    };
}

/**
 * Compara dos equipos para una posición. Devuelve <0 si A va primero, >0 si B.
 *
 * TODO: implementar usando los criterios activos en orden.
 */
export function compareTeams(
    _criteria: TiebreakCriterion[],
    _teamA: TeamStanding,
    _teamB: TeamStanding,
    _tiedSet: TeamStanding[],
): number {
    // TODO etapa 2 — implementar.
    return 0;
}
