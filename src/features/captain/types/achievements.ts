// EL CAPITÁN — lo que queda en la vitrina, además de las copas.
//
// Dos familias, y son distintas a propósito:
//
//   PREMIO  se gana una temporada, con una condición dura y una tirada. Dice
//           QUÉ TAN ALTO llegaste. El XV ideal es repetible; los otros dos, en
//           la práctica, también — el que fue el mejor del mundo una vez puede
//           serlo dos.
//   HITO    se detecta, no se otorga, y pasa UNA SOLA VEZ. Dice QUÉ FORMA tuvo
//           la carrera: cuándo debutaste, cuándo firmaste, cuándo te fuiste.
//
// ── Por qué los tipos viven acá y no al lado de su motor ───────────────────
// Porque `CaptainState` los guarda, y `types/captain.ts` no puede importar de
// `engine/`: el árbol de tipos es la raíz y la dependencia va en un solo sentido
// (ver la cabecera de `types/player.ts`). Las REGLAS —qué umbral pide cada
// premio, cómo se detecta cada hito— viven en `engine/awards.ts` y
// `engine/milestones.ts`, que es donde se discuten.

export type SeasonAwardId = 'mejor-del-mundo' | 'xv-ideal' | 'mejor-local';

/** Un premio ganado, con el año en que se ganó. */
export interface SeasonAward {
    id: SeasonAwardId;
    season: number;
}

export type MilestoneId =
    | 'debut-senior'
    | 'primera-convocatoria'
    | 'debut-mayor'
    | 'primer-contrato'
    | 'primer-titulo'
    | 'competicion-de-elite'
    | 'transferencia-internacional'
    | 'vuelta-a-casa'
    | 'capitan-de-la-seleccion'
    | 'salon-de-la-fama';

export interface Milestone {
    id: MilestoneId;
    season: number;
    age: number;
    /** La línea que se lee en la trayectoria. Crónica, no planilla. */
    text: string;
}
