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

import type { MomentKind } from '../../types/moment-kinds.ts';
import type { MomentOutcome } from '../../types/moment.ts';
import type { MomentDef, MomentSetup } from '../../types/moment-def.ts';
import { JACKAL } from './jackal.ts';

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

/** Todas las definiciones, en orden declarado y estable. */
export const MOMENT_DEFS: readonly AnyMomentDef[] = [widen(JACKAL)];

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
