// EL CAPITÁN — EL ROSTER DE LOS SESENTA Y CINCO.
//
// Cuatro minijuegos por dorsal del 1 al 15, más cinco que le tocan a cualquiera.
// Sesenta y cinco casillas, y el test exige que estén las sesenta y cinco: un
// dorsal con tres es un puesto que repite jugada una de cada cuatro temporadas,
// y eso se nota en la segunda carrera.
//
// ── La versión ──
// `CAPTAIN_MINIGAMES_VERSION` se sella en el guardado. Agregar un minijuego
// cambia QUÉ SE SORTEA cada temporada, así que invalida una partida en curso
// igual que un cambio de reglas — la misma lógica que ya se aplica al calendario
// internacional en Carrera de Rugby: es catálogo, no lógica, pero cambia el
// resultado.
//
// Cambiar un TEXTO de `copy.outcome` o `copy.result` también la sube, y eso sí
// es distinto de Carrera de Rugby: acá esos textos terminan en `MomentRecord` y
// entran en el digest congelado. El `brief`, el `hint` y el `cta` son
// presentación pura y no suben nada.

import type { AnyMinigameSpec, MinigameKind, MinigameSlot } from '../../types/minigame.ts';
import { isLegacySlot } from '../../types/minigame.ts';
import { PACK_MINIGAMES } from './pack.ts';
import { LINEA_MINIGAMES } from './linea.ts';
import { UNIVERSAL_MINIGAMES } from './universal.ts';

export const CAPTAIN_MINIGAMES_VERSION = '2026-08.1';

/** Cuántos minijuegos tiene cada dorsal. No es un número decorativo: hay test. */
export const PER_SHIRT = 4;

/** Los dorsales, del 1 al 15. Se DERIVA: nadie mantiene la lista a mano. */
export const ALL_SHIRTS: readonly number[] = Array.from({ length: 15 }, (_, i) => i + 1);

/**
 * El roster completo, en ORDEN DECLARADO: pack, línea, universales.
 *
 * Es un array y el índice se arma a partir de él, nunca al revés. Iterar un
 * `Record` con `Object.keys` para sortear es la fuente de no-determinismo
 * encubierta que CLAUDE.md §1 prohíbe, y acá el sorteo es exactamente lo que se
 * hace con esta lista.
 */
export const ALL_MINIGAMES: readonly MinigameSlot[] = [
    ...PACK_MINIGAMES,
    ...LINEA_MINIGAMES,
    ...UNIVERSAL_MINIGAMES,
];

/**
 * Los que la fábrica convierte en `MomentDef`. Los `legacyOf` quedan afuera:
 * su def ya existe, escrita a mano, en `engine/moment-defs/`.
 */
export const MINIGAME_SPECS: readonly AnyMinigameSpec[] = ALL_MINIGAMES.filter(
    (slot): slot is AnyMinigameSpec => !isLegacySlot(slot),
);

/** Las casillas que ocupa un Momento ya escrito. */
export const LEGACY_SLOTS = ALL_MINIGAMES.filter(isLegacySlot);

const BY_KIND: Map<MinigameKind, MinigameSlot> = new Map();
for (const slot of ALL_MINIGAMES) BY_KIND.set(slot.kind, slot);

/** La casilla de un id, o `null` si no es del catálogo. */
export function getMinigame(kind: MinigameKind): MinigameSlot | null {
    return BY_KIND.get(kind) ?? null;
}

/**
 * Los minijuegos de un dorsal, en orden declarado.
 *
 * Se recorre `ALL_MINIGAMES` y se filtra en vez de mantener un índice
 * `Record<number, …>`: el índice sería la derivada congelada de siempre
 * (CLAUDE.md §1.9) y el filtro sobre sesenta y cinco elementos no le cuesta
 * nada a nadie.
 */
export function minigamesOfShirt(shirt: number): readonly MinigameSlot[] {
    return ALL_MINIGAMES.filter((m) => m.shirt === shirt);
}

/** Los cinco que le tocan a cualquiera. */
export function universalMinigames(): readonly MinigameSlot[] {
    return ALL_MINIGAMES.filter((m) => m.shirt === null);
}

export { PACK_MINIGAMES } from './pack.ts';
export { LINEA_MINIGAMES } from './linea.ts';
export { UNIVERSAL_MINIGAMES } from './universal.ts';
export { payFor } from './pay.ts';
