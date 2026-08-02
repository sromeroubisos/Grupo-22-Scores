// EL CAPITÁN — el registry de Momentos del motor.
//
// La lista es un ARRAY en orden declarado, y el índice por kind se arma a partir
// de ella. Nunca al revés: un `Record` literal obligaría a recorrerlo con
// `Object.keys` para listar los Momentos, y elegir sobre el orden de inserción
// de un objeto es la fuente de no-determinismo encubierta que CLAUDE.md §1
// prohíbe.
//
// Acá NO hay React. La pantalla de cada Momento se registra aparte, del lado de
// `app/`, para que el motor pueda correr en un test de Node sin DOM.
//
// ═══════════════════════════════════════════════════════════════════════════
//  LA REGLA DEL statBoost — leerla antes de escribir el próximo Momento
// ═══════════════════════════════════════════════════════════════════════════
//
//   `statBoost` es para Momentos cuyo premio NO ES YA la métrica-gloria del
//   puesto.
//
// Cada familia tiene su propio gol (`data/positions.ts`): el pilar cuenta
// penales de scrum, el 7 turnovers, la segunda línea line-outs, el apertura
// puntos. Si un Momento paga en la misma moneda que la planilla ya cuenta, el
// `statBoost` cobra dos veces la misma jugada — el jugador ve el turnover en la
// crónica Y otra vez inflado en la planilla de fin de año, y la calibración del
// puesto queda mintiendo sin que nada falle.
//
// Por eso no lo usa ninguno de los cinco: los cinco pagan exactamente en la
// gloria de su puesto, así que cobran en Cartel y Pertenencia y nada más. La
// Banda es el caso más claro de todos —el wing tiene DOS métricas-gloria, tries
// y metros, y la corrida paga en las dos— así que un `statBoost` ahí cobraría
// tres veces la misma jugada. El Tackle SÍ lo usa, y por el mismo criterio:
// frenar en seco no es la gloria de ninguna familia, así que no hay dónde se
// cuente solo.
//
// Está escrita acá y no en cada def a propósito. Es la clase de decisión que se
// vuelve a derivar de cero en el Momento #12 y se deriva distinto.

import type { MomentKind } from '../../types/moment-kinds.ts';
import type { MomentOutcome } from '../../types/moment.ts';
import type { MomentDef, MomentSetup } from '../../types/moment-def.ts';
import { JACKAL } from './jackal.ts';
import { ANCLA } from './ancla.ts';
import { CODIGO } from './codigo.ts';
import { PALOS } from './palos.ts';
import { BANDA } from './banda.ts';

/**
 * La definición como la ve el registry, con los genéricos borrados.
 *
 * El borrado es seguro POR CONSTRUCCIÓN: el registry indexa por `kind`, y el
 * `kind` ya discrimina el par (Setup, Input) —un pendiente de kind `jackal`
 * lleva un `JackalSetup` y solo se resuelve con un outcome de kind `jackal`—.
 * Que sea seguro por construcción no alcanza, así que `moment-contract.test.ts`
 * lo verifica: cada def declara el kind con el que está indexada y su `setup`
 * devuelve ese mismo kind.
 */
export type AnyMomentDef = MomentDef<MomentSetup, MomentOutcome>;

/**
 * La conversión, UNA sola vez y acá.
 *
 * Que esté en un solo lugar es lo que hace que agregar un Momento no requiera
 * escribir un cast: se escribe la def con sus tipos propios y se la suma a la
 * lista de abajo.
 */
function widen<S extends MomentSetup, I extends MomentOutcome>(def: MomentDef<S, I>): AnyMomentDef {
    return def as unknown as AnyMomentDef;
}

/**
 * Todas las definiciones, en ORDEN DECLARADO y estable.
 *
 * El orden es el del equipo, de adelante hacia atrás, igual que `ALL_FAMILIES`:
 * primera línea, line-out, tercera línea, apertura, wing. Que sea el mismo
 * criterio en los dos lugares no es estética — es que cuando alguien busque "el
 * Momento del hooker" mire en el mismo renglón en los dos archivos.
 */
export const MOMENT_DEFS: readonly AnyMomentDef[] = [
    widen(ANCLA),
    widen(CODIGO),
    widen(JACKAL),
    widen(PALOS),
    widen(BANDA),
];

const BY_KIND: Partial<Record<MomentKind, AnyMomentDef>> = {};
for (const def of MOMENT_DEFS) BY_KIND[def.kind] = def;

/**
 * La definición de un kind, o `null`.
 *
 * `null` no es un error: `tackle` y `bunker` son PRE-CONTRATO y se resuelven por
 * su carril propio en `engine/moments.ts`. El porqué está en `moment-kinds.ts`.
 */
export function getMomentDef(kind: MomentKind): AnyMomentDef | null {
    return BY_KIND[kind] ?? null;
}

export type { JackalSetup } from './jackal.ts';
export { JACKAL, JACKAL_ROUNDS, jackalBeat, jackalGrade, jackalWindows } from './jackal.ts';

export type { AnclaSetup } from './ancla.ts';
export { ANCLA, ANCLA_MAX_PUSHES, anclaGrade, anclaHoldChance } from './ancla.ts';

export type { CodigoSetup } from './codigo.ts';
export {
    CODIGO,
    CODIGO_LENGTH,
    CODIGO_SYMBOLS,
    codigoAciertos,
    codigoDestreza,
    codigoGrade,
    codigoShowMs,
} from './codigo.ts';

export type { PalosSetup } from './palos.ts';
export { PALOS, palosGrade, palosLanding, palosPerfectAim, palosTolerance } from './palos.ts';

export type { BandaSetup } from './banda.ts';
export {
    BANDA,
    bandaAmagueEnd,
    bandaCloseMs,
    bandaGrade,
    bandaMoveAt,
    bandaMuscleRisk,
    bandaSpaceCost,
} from './banda.ts';
