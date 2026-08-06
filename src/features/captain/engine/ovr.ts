// EL CAPITÁN — la media.
//
// La media es DERIVADA y no se declara nunca a mano: es el promedio de los
// cuatro atributos de la familia, pesado por lo que esa familia declara. Por
// eso un pilar y un wing con los mismos números crudos no tienen la misma
// media, y por eso `aguante` no la mueve — no está en las cuatro de nadie.
//
// La media NO SUBE POR RENDIR. Sube por cartas, por eventos y por edad. Es la
// decisión de diseño de El Ídolo que se traslada tal cual, y en rugby es
// todavía más defendible: la evidencia muestra que la fuerza bruta no predice
// el rendimiento en partido de un forward, y la capacidad aeróbica sí.

import type { CaptainAttributes, CaptainPlayer, PositionFamilyId } from '../types/player.ts';
import { OVR_MAX, OVR_MIN } from '../types/currencies.ts';
import { getFamily } from '../data/positions.ts';

function clamp(value: number, min: number, max: number): number {
    if (value < min) return min;
    if (value > max) return max;
    return value;
}

/**
 * La media de un juego de atributos en una familia dada.
 *
 * Los pesos suman 100 —lo verifica `positions.test.ts`— así que la cuenta es un
 * promedio ponderado y no hace falta normalizar.
 */
export function ovrFromAttributes(family: PositionFamilyId, attrs: CaptainAttributes): number {
    const def = getFamily(family);
    let total = 0;
    for (let i = 0; i < def.attributes.length; i += 1) {
        total += attrs[def.attributes[i]] * def.weights[i];
    }
    return clamp(Math.round(total / 100), OVR_MIN, OVR_MAX);
}

/** La media de un jugador, recalculada desde sus atributos. */
export function ovrOf(player: CaptainPlayer): number {
    return ovrFromAttributes(player.family, player.attrs);
}

/**
 * EL TECHO, que es la suma de las dos mitades: lo que te tocó y lo que
 * construiste.
 *
 * Es DERIVADO y por eso es una función y no un campo (CLAUDE.md §2): un
 * `potential` guardado sería una segunda fuente de verdad, y alcanzaría un solo
 * camino que se olvide de actualizarlo para que el techo mienta. Se recorta a
 * `OVR_MAX` acá y en un solo lugar, así que nadie puede construir un techo de
 * 104 sumando por su cuenta.
 */
export function potentialOf(player: CaptainPlayer): number {
    return Math.min(OVR_MAX, player.potentialBase + player.built);
}

/**
 * Cuánto le falta al jugador para su techo. Nunca negativo: si la media pasó al
 * potencial, la brecha es cero y no un número al revés.
 */
export function gapToPotential(player: CaptainPlayer): number {
    return Math.max(0, potentialOf(player) - ovrOf(player));
}
