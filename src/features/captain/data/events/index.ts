// EL CAPITÁN — el catálogo de eventos.
//
// Para agregar contenido se agrega un objeto al archivo de la familia que
// corresponda. Acá solo se componen y se indexan.
//
// PREFIJOS VIGENTES. Si agregás una familia, sumá el prefijo también en
// `events-shape.test.ts`, que falla si un id no lo lleva:
//
//   club-  vida de club          per-  personal (trabajo, facultad, casa)
//   nt-    vía representativa    inj-  cuerpo y conmoción
//   dis-   disciplina            vet-  fin de carrera
//   of-    el oficio del puesto (ver oficio.ts: le habla a UNA familia)
//   mer-   mercado (se arma en el momento, ver market.ts)
//
// LA RAREZA NO ES UNA FAMILIA y por eso no tiene prefijo: es un campo
// (`rarity`) que cualquier evento puede llevar. `of-` agrupa por PUESTO —que es
// lo que decide a quién le llega la tarjeta— y adentro hay raros y oros.

import type { CaptainEvent } from '../../types/event.ts';
import type { CaptainState } from '../../types/captain.ts';
import { CLUB_EVENTS } from './club.ts';
import { PERSONAL_EVENTS } from './personal.ts';
import {
    buildFlagSwitchEvent,
    buildRivalEvent,
    buildTrialTourEvent,
    buildTwoFlagsEvent,
    FLAG_SWITCH_EVENT_ID,
    NATIONAL_EVENTS,
    RIVAL_EVENT_IDS,
    TRIAL_TOUR_EVENT_ID,
    TWO_FLAGS_EVENT_ID,
} from './national.ts';
import { BODY_EVENTS } from './body.ts';
import { OFICIO_EVENTS } from './oficio.ts';
import { buildMarketEvent, buildReturnEvent, MARKET_EVENT_ID, RETURN_EVENT_ID } from './market.ts';

export { buildMarketEvent, buildReturnEvent, MARKET_EVENT_ID, RETURN_EVENT_ID } from './market.ts';
export {
    buildFlagSwitchEvent, callingUnionOf, FLAG_SWITCH_EVENT_ID,
    TRIAL_TOUR_EVENT_ID, TWO_FLAGS_EVENT_ID,
} from './national.ts';

/** Todos los eventos estáticos, en orden declarado y estable. */
export const ALL_EVENTS: readonly CaptainEvent[] = [
    ...CLUB_EVENTS,
    ...PERSONAL_EVENTS,
    ...NATIONAL_EVENTS,
    ...BODY_EVENTS,
    ...OFICIO_EVENTS,
];

const BY_ID: Record<string, CaptainEvent> = {};
for (const event of ALL_EVENTS) BY_ID[event.id] = event;

export function getEvent(id: string): CaptainEvent | null {
    return BY_ID[id] ?? null;
}

/**
 * LAS TARJETAS QUE SE ARMAN EN EL MOMENTO, indexadas por id.
 *
 * ── POR QUÉ ES UN MAPA Y NO UNA CADENA DE `if` EN EL SELECTOR ──────────────
 * Vivía en `getPendingEvent` como tres `if` con el id adentro, y con tres
 * funcionaba. Con siete pasa a ser el catálogo escrito dos veces —una en su
 * archivo y otra en el motor— y alcanza con olvidarse un renglón para que una
 * tarjeta que el selector sortea se dibuje con el reloj vacío o con el nombre
 * del archirrival sin reemplazar. Nadie lo notaría hasta que le tocara a una
 * carrera de verdad, que es el peor momento posible.
 *
 * Acá, al lado del catálogo, agregar un evento construido es agregar un renglón
 * en el mismo archivo donde se agrega el evento: es la regla del §3 del CLAUDE
 * raíz llevada un paso más lejos —el motor no sabe qué eventos existen, y ahora
 * tampoco sabe cuáles se arman en el momento—.
 *
 * Un constructor puede devolver `null` —el regreso a casa cuando ya estás en
 * casa, el mercado sin ofertas— y eso NO es un error: es una tarjeta que hoy no
 * se puede dibujar, y `openEventOrClose` ya sabe seguir de largo.
 */
export type EventBuilder = (state: CaptainState) => CaptainEvent | null;

export const EVENT_BUILDERS: Record<string, EventBuilder> = {
    [MARKET_EVENT_ID]: buildMarketEvent,
    [RETURN_EVENT_ID]: buildReturnEvent,
    // La otra bandera se arma con la unión que llama adentro: sin eso, la
    // decisión que el juego declara irreversible se toma sin saber contra qué se
    // cambia.
    [FLAG_SWITCH_EVENT_ID]: buildFlagSwitchEvent,
    // Las dos banderas, con el reloj del 8.1(c) adentro.
    [TWO_FLAGS_EVENT_ID]: buildTwoFlagsEvent,
    [TRIAL_TOUR_EVENT_ID]: buildTrialTourEvent,
    // Las tres del archirrival comparten constructor: lo único que les agrega es
    // el nombre, así que escribir tres funciones idénticas sería el mismo dato
    // declarado tres veces.
    ...Object.fromEntries(RIVAL_EVENT_IDS.map((id) => [id, buildRivalEvent])),
};
