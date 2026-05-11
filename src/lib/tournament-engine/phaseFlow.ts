/**
 * Phase Flow Engine — Skeleton (etapa 2)
 *
 * Define el flujo declarado de equipos entre fases de un torneo. Cada fase
 * declara explícitamente sus inputs (de dónde vienen los equipos) y outputs
 * (qué pasa con los equipos al terminar). El motor encadena las fases
 * automáticamente: cuando termina la fase N, los equipos pasan a la fase N+1
 * según las reglas declaradas.
 *
 * TODO (etapa 2):
 *   - [ ] Persistir flow en `phases.settings.flow` (jsonb)
 *   - [ ] Migración: convertir las fases actuales (que tienen advanceCount como número simple)
 *         a la nueva estructura con PhaseInput/PhaseOutput
 *   - [ ] UI: grafo visual de fases con flechas etiquetadas (top 2 × 4 grupos, perdedores SF, etc.)
 *   - [ ] Validador: alertar si los cupos no cuadran (Fase 2 espera 8 pero Fase 1 solo clasifica 6)
 *   - [ ] Trigger: cuando se cierra una fase, autoload de la siguiente con los equipos correctos
 *   - [ ] Tests: simular el end-to-end completo de un torneo con N fases
 */

/* ============== Tipos ============== */

/**
 * Origen de equipos para una fase.
 */
export type PhaseInputSource =
    /** Catálogo: equipos elegidos manualmente del catálogo de clubes. */
    | { kind: 'catalog'; clubIds: string[] }
    /** Top N de la tabla general de una fase anterior. */
    | { kind: 'top_of_phase'; phaseId: string; count: number }
    /** Top N por grupo de una fase de grupos previa. */
    | { kind: 'top_of_each_group'; phaseId: string; perGroup: number }
    /** Perdedores de una ronda específica (ej: losers(semifinals) → final 3°). */
    | { kind: 'losers_of_round'; phaseId: string; round: 'quarters' | 'semis' | 'finals' }
    /** Ganadores de una ronda específica. */
    | { kind: 'winners_of_round'; phaseId: string; round: 'quarters' | 'semis' | 'finals' }
    /** Mezcla de fuentes (concatena). */
    | { kind: 'combined'; sources: PhaseInputSource[] }
    /** Importar de un torneo histórico (mismos teams). */
    | { kind: 'historical'; tournamentId: string }
    /** Asignación manual a posteriori. */
    | { kind: 'manual'; clubIds: string[] };

/**
 * Destino de los equipos al terminar la fase.
 */
export type PhaseOutputDestination =
    /** Top N → siguiente fase. */
    | { kind: 'advance_top'; toPhaseId: string; count: number }
    /** Top N por grupo → siguiente fase. */
    | { kind: 'advance_top_each_group'; toPhaseId: string; perGroup: number }
    /** Eliminados al terminar (no van a ninguna fase). */
    | { kind: 'eliminated' }
    /** Termina el torneo en esta fase: define el campeón. */
    | { kind: 'crown_champion' }
    /** Mixto. */
    | { kind: 'split'; rules: PhaseOutputDestination[] };

export interface PhaseFlow {
    phaseId: string;
    inputs: PhaseInputSource;
    outputs: PhaseOutputDestination[];
    /** Cupos esperados (calculado o manual). */
    expectedTeamCount: number;
}

/* ============== Validación ============== */

export type FlowIssueLevel = 'error' | 'warning' | 'info';

export interface FlowIssue {
    level: FlowIssueLevel;
    phaseId: string;
    message: string;
    suggestion?: string;
    code: string;
}

/**
 * Valida el grafo completo del flujo. Devuelve issues si los cupos no cuadran
 * o si hay referencias circulares/incorrectas.
 *
 * TODO etapa 2 — implementar con tests:
 *   - cupos no cuadran (input.count !== expectedTeamCount)
 *   - referencia a fase que no existe
 *   - referencias circulares (fase X → fase Y → fase X)
 *   - fase sin output (huérfana)
 *   - fase sin input (no se puede poblar)
 *   - múltiples coronaciones (más de un crown_champion)
 */
export function validateFlow(_flow: PhaseFlow[]): FlowIssue[] {
    // TODO etapa 2 — implementar.
    return [];
}

/* ============== Resolución (cuando se cierra una fase) ============== */

export interface PhaseStandings {
    phaseId: string;
    teamsByPosition: Array<{ position: number; teamId: string; groupName?: string }>;
}

/**
 * Calcula qué equipos pasan a las fases destino cuando se cierra `closedPhaseId`.
 *
 * TODO etapa 2 — implementar con tests:
 *   - top N global
 *   - top N por grupo
 *   - perdedores de semifinales
 *   - ganadores de cuartos
 *   - combinaciones
 */
export function resolveTransitions(
    _closedPhaseId: string,
    _flow: PhaseFlow[],
    _standings: PhaseStandings,
): Array<{ toPhaseId: string; teamIds: string[] }> {
    // TODO etapa 2 — implementar.
    return [];
}

/**
 * Genera una descripción humana del flujo entre dos fases para el grafo de UI.
 * Ej: 'top 2 × 4 grupos' o 'perdedores SF'.
 *
 * TODO etapa 2 — implementar.
 */
export function describeTransition(_source: PhaseInputSource): string {
    // TODO etapa 2 — implementar.
    return '';
}
