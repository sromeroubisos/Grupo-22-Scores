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
import { getShopItem, resolveShopTarget } from '../data/shop.ts';

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
 * CUÁNTO TECHO DE MEDIA COMPRASTE.
 *
 * Un ítem de techo se declara en PUNTOS DE ATRIBUTO —«+5 al techo de la Pegada»—
 * y lo que mueve la media es ese número por el PESO de ese atributo en tu
 * puesto. Por eso el mismo entrenador vale distinto para un apertura (Pegada 30
 * → +1,5 de techo) que para un pilar (Pegada fuera de su media → +0 de techo, y
 * por eso el catálogo le ofrece otro atributo).
 *
 * ── El aguante no aparece acá, y no es un olvido ────────────────────────────
 * `aguante` no está en la media de ninguna familia, así que su peso es cero y
 * un techo de aguante mueve el de la media en nada. Ese ítem NO es decorativo:
 * levanta el tope de puntos de aguante que se pueden comprar
 * (`SHOP_AGUANTE_CAP` en `engine/shop.ts`), que es el único techo que el aguante
 * tiene. Dos techos distintos para dos cosas distintas, cada uno donde muerde.
 *
 * ── Por qué vive en este archivo y no en `engine/shop.ts` ───────────────────
 * Para que no haya ciclo. `potentialOf` es la función más llamada del motor y la
 * usa `engine/shop.ts` para recortar lo que una compra puede entregar; si el
 * techo se leyera desde allá, los dos archivos se importarían mutuamente. Acá
 * solo entra `data/shop.ts`, que es catálogo puro y no importa a nadie del
 * motor.
 */
export function shopCeilingOf(player: CaptainPlayer): number {
    if (player.shop.length === 0) return 0;

    const family = getFamily(player.family);
    const total = family.weights.reduce((a, w) => a + w, 0);

    let bonus = 0;
    // Orden de compra: es una lista y no un `Record`, así que el recorrido ya es
    // estable. La suma es conmutativa igual, pero el orden estable es la regla.
    for (const purchase of player.shop) {
        const item = getShopItem(purchase.id);
        if (!item?.ceiling) continue;
        for (const effect of item.ceiling) {
            const attr = resolveShopTarget(effect.target, player.family, purchase.attr);
            if (!attr) continue;
            const i = family.attributes.indexOf(attr);
            if (i < 0) continue; // no está en tu media: no la mueve
            bonus += effect.points * (family.weights[i] / total);
        }
    }
    return bonus;
}

/**
 * EL TECHO, que es la suma de las tres mitades: lo que te tocó, lo que
 * construiste y lo que compraste.
 *
 * Es DERIVADO y por eso es una función y no un campo (CLAUDE.md §2): un
 * `potential` guardado sería una segunda fuente de verdad, y alcanzaría un solo
 * camino que se olvide de actualizarlo para que el techo mienta. Se recorta a
 * `OVR_MAX` acá y en un solo lugar, así que nadie puede construir un techo de
 * 104 sumando por su cuenta.
 *
 * Lo COMPRADO va afuera de `POTENTIAL_BAND` a propósito. Esa banda acota lo que
 * las PRETEMPORADAS pueden construir, y su razón de ser es que el sorteo del
 * material siga significando algo; la tienda no es una pretemporada gratis, es
 * otra cosa entera —se paga con años de contrato— y tiene su propio tope, que es
 * cuántos ítems de techo existen en el catálogo.
 */
export function potentialOf(player: CaptainPlayer): number {
    return Math.min(OVR_MAX, player.potentialBase + player.built + shopCeilingOf(player));
}

/**
 * Cuánto le falta al jugador para su techo. Nunca negativo: si la media pasó al
 * potencial, la brecha es cero y no un número al revés.
 */
export function gapToPotential(player: CaptainPlayer): number {
    return Math.max(0, potentialOf(player) - ovrOf(player));
}
