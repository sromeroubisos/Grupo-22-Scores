import type { CareerAction, CareerState } from '../../../../features/career/index.ts';
import { careerReducer, getPendingEvent } from '../../../../features/career/index.ts';

// Helper de INTEGRACIÓN, no de reglas: la lógica sigue viviendo entera en el
// motor. Acá solo se encadenan acciones públicas hasta que haya algo que
// mostrar (una decisión pendiente o el retiro), para que la consola no tenga
// que exponer un botón "Continuar" por cada paso interno.

const MAX_STEPS = 8; // cinturón contra bucles: una decisión avanza 1-2 temporadas

export interface AdvanceResult {
    state: CareerState;
    /** Índice de la primera temporada agregada por esta transición, si hubo. */
    firstNewSeason: number | null;
}

/**
 * Aplica la acción y sigue avanzando mientras el motor no requiera decisión.
 * Se detiene en: fase `event` con evento disponible, o `retired`.
 */
export function advanceCareerToNextDecision(current: CareerState, action: CareerAction): AdvanceResult {
    const seasonsBefore = current.seasons.length;
    let state = careerReducer(current, action);
    let steps = 0;

    // Se detiene en cuanto hay algo que mostrar. Ojo: la fase `season` TAMBIÉN
    // frena — es el "Jugar temporada" del usuario. Si se siguiera de largo, una
    // sola decisión encadenaría varias temporadas de golpe y el jugador se
    // perdería lo que pasó en el medio.
    while (steps < MAX_STEPS) {
        if (state.phase === 'retired' || state.phase === 'season') break;
        if (state.phase === 'event' && getPendingEvent(state) !== null) break;

        // Único caso a resolver acá: fase `event` con un pendiente que ya no se
        // puede reconstruir (p. ej. ofertas vencidas). El motor lo destraba solo.
        const next = careerReducer(state, { type: 'ADVANCE' });
        if (next.phase === state.phase && next.seasons.length === state.seasons.length) {
            state = next;
            break;
        }
        state = next;
        steps++;
    }

    return {
        state,
        firstNewSeason: state.seasons.length > seasonsBefore ? seasonsBefore : null,
    };
}
