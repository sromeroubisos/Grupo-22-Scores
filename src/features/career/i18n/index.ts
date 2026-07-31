// LA CAPA DE IDIOMA DEL MINIJUEGO.
//
// Español canónico + inglés como presentación. Tres piezas y ninguna toca el
// motor:
//
//   · `locale.ts`   — qué idioma, y dónde se guarda (clave propia, NO el save)
//   · `catalog.ts`  — lo que el motor emite y no es nombre propio, por ID
//   · `events/`     — las 92 decisiones, por id de evento/opción/desenlace
//   · `ui.ts`       — lo que escriben los componentes
//   · `localize.ts` — la puerta: traduce lo que se va a dibujar, no lo que se guarda
//
// Nada de esto entra en `CareerState`, así que ninguna partida guardada se
// invalida y el `stateHash` del digest congelado no se mueve.

export * from './locale.ts';
export * from './catalog.ts';
export * from './localize.ts';
export { UI, stringsFor, type UiStrings } from './ui.ts';
export { ALL_EVENTS_EN, MARKET_EN, SHARED_OPTIONS_EN } from './events/index.ts';
export type { EventTextEn, EventOptionTextEn, EventTableEn } from './events/index.ts';
