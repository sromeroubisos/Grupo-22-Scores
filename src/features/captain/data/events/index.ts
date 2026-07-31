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
//   mer-   mercado (se arma en el momento, ver market.ts)

import type { CaptainEvent } from '../../types/event.ts';
import { CLUB_EVENTS } from './club.ts';
import { PERSONAL_EVENTS } from './personal.ts';
import { NATIONAL_EVENTS } from './national.ts';
import { BODY_EVENTS } from './body.ts';

export { buildMarketEvent, buildReturnEvent, MARKET_EVENT_ID, RETURN_EVENT_ID } from './market.ts';

/** Todos los eventos estáticos, en orden declarado y estable. */
export const ALL_EVENTS: readonly CaptainEvent[] = [
    ...CLUB_EVENTS,
    ...PERSONAL_EVENTS,
    ...NATIONAL_EVENTS,
    ...BODY_EVENTS,
];

const BY_ID: Record<string, CaptainEvent> = {};
for (const event of ALL_EVENTS) BY_ID[event.id] = event;

export function getEvent(id: string): CaptainEvent | null {
    return BY_ID[id] ?? null;
}
