// El pool de decisiones, unido. Para agregar contenido se suma un objeto al
// archivo de su familia — este índice no se toca salvo que nazca una familia
// nueva, y en ese caso el prefijo también va en `FAMILY_PREFIX` (types/event.ts)
// y lo verifica `events-shape.test.ts`.

import type { CoachEvent } from '../../types/event.ts';
import { CANTERA_EVENTS } from './cantera.ts';
import { CLUB_EVENTS } from './club.ts';
import { LESIONES_EVENTS } from './lesiones.ts';
import { PLANTEL_EVENTS } from './plantel.ts';
import { PRENSA_EVENTS } from './prensa.ts';
import { VIAJE_EVENTS } from './viaje.ts';

/**
 * Versión del CONTENIDO. Los eventos entran en el guardado por dos vías: el
 * `decisionLog` guarda el `resultText` que ya leyó el jugador, y `seenEvents`
 * guarda los ids para el cooldown. Cambiar un id o un texto de desenlace
 * invalida una partida en curso; cambiar un `hint`, no —eso es presentación—.
 * Ante la duda, subila: el costo de subirla de más es una pantalla de
 * "empezá de nuevo", y el de no subirla es una partida que miente.
 */
export const EVENTS_VERSION = '1.0.0';

// El orden es el de las familias, y es estable: el selector ordena por id antes
// de sortear, así que el orden de este array no puede filtrarse al resultado.
export const ALL_EVENTS: readonly CoachEvent[] = [
    ...CLUB_EVENTS,
    ...PLANTEL_EVENTS,
    ...CANTERA_EVENTS,
    ...LESIONES_EVENTS,
    ...PRENSA_EVENTS,
    ...VIAJE_EVENTS,
];

const BY_ID = new Map(ALL_EVENTS.map((e) => [e.id, e]));

export function getEvent(id: string): CoachEvent | null {
    return BY_ID.get(id) ?? null;
}

export { CANTERA_EVENTS, CLUB_EVENTS, LESIONES_EVENTS, PLANTEL_EVENTS, PRENSA_EVENTS, VIAJE_EVENTS };
