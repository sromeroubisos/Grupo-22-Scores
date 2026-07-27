import type { CareerState } from '../types/career.ts';
import type { GameEvent } from '../types/event.ts';
import type { CreatePlayerInput } from './create-player.ts';
import { careerReducer, createInitialCareer } from '../state/career-reducer.ts';
import { getPendingEvent } from './event-selector.ts';
import { TRANSFER_EVENT_ID } from '../data/events/index.ts';

// Estrategia de decisión: dado el evento y el estado, devuelve el id de opción.
export type Chooser = (event: GameEvent, state: CareerState) => string;

/**
 * Siempre elige la primera opción.
 *
 * CUIDADO: en el mercado de pases la opción 0 es "quedarte", así que esta
 * estrategia produce carreras SIN NINGUNA transferencia. Es un baseline
 * determinístico válido, pero no sirve para auditar el mercado: para eso está
 * `acceptBestEligibleOfferChooser`. No se reordenan las opciones de producción
 * para maquillar esto — se elige la estrategia a propósito.
 */
export const firstOptionChooser: Chooser = (event) => event.options[0].id;

/** Nunca se mueve: se queda siempre que pueda. Alias explícito del anterior. */
export const stayChooser: Chooser = firstOptionChooser;

/**
 * Acepta la mejor oferta disponible cuando hay mercado (las ofertas ya vienen
 * ordenadas por prestigio, y la opción 0 es "quedarte"); en el resto de los
 * eventos se comporta como el baseline.
 */
export const acceptBestEligibleOfferChooser: Chooser = (event) =>
    event.id === TRANSFER_EVENT_ID && event.options.length > 1 ? event.options[1].id : event.options[0].id;

/** Estrategia por defecto de `runCareer`, explícita para que no sorprenda. */
export const DEFAULT_CHOOSER: Chooser = firstOptionChooser;

/**
 * Corre una carrera completa de punta a punta con una estrategia de decisión.
 * Determinístico dada (input, seed, chooser). `maxSeasons` es un cinturón de
 * seguridad contra bucles (el retiro real ocurre mucho antes).
 *
 * El default es `DEFAULT_CHOOSER` (= `stayChooser`): NO produce transferencias.
 * Toda simulación o test sobre el mercado debe pasar su estrategia a propósito.
 */
export function runCareer(
    input: CreatePlayerInput,
    seed: number,
    chooser: Chooser = DEFAULT_CHOOSER,
    maxSeasons = 60,
): CareerState {
    let state = createInitialCareer(input, seed);
    let guard = 0;

    while (state.phase !== 'retired' && guard < maxSeasons) {
        guard++;
        if (state.phase === 'event') {
            const event = getPendingEvent(state);
            if (event) {
                state = careerReducer(state, { type: 'CHOOSE', optionId: chooser(event, state) });
            } else {
                state = careerReducer(state, { type: 'ADVANCE' });
            }
        } else {
            state = careerReducer(state, { type: 'ADVANCE' });
        }
    }

    return state;
}
