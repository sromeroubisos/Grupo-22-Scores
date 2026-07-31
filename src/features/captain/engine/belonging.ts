// EL CAPITÁN — la Pertenencia.
//
// Es la idolatría de El Ídolo con las reglas del rugby, y es la moneda que
// define el final del juego: a 95 el club le pone tu nombre a la cancha 1 y te
// hace socio vitalicio.
//
// ── El orden de operaciones ──
// Es lo que este archivo existe para congelar. Los cuatro techos y las dos
// amortiguaciones se pisan entre sí, y aplicarlos en otro orden da otro número.
// Escrito una vez acá, nadie lo tiene que volver a recordar:
//
//   1. Si el ledger está congelado (tenés contrato profesional), no pasa nada.
//   2. Si es GANANCIA y estás afuera del país, rinde la mitad.
//   3. Si es GANANCIA y ya llegaste a 85, rinde la mitad otra vez.
//   4. Se suma.
//   5. Se acota a [0, techo].
//
// Las PÉRDIDAS no se amortiguan ni se dividen. Irse es irse: que el exterior te
// proteja de perder Pertenencia sería premiar justo lo que la gasta.

import {
    BELONGING_ABROAD_FACTOR,
    BELONGING_CAP_NO_TITLES,
    BELONGING_CAP_RIVAL_JUMP,
    BELONGING_DAMPEN_FACTOR,
    BELONGING_DAMPEN_FROM,
    BELONGING_MAX,
    BELONGING_MIN,
    BELONGING_TIERS,
} from '../types/currencies.ts';
import type { BelongingLedger, BelongingTierId } from '../types/currencies.ts';

export interface BelongingContext {
    /** El club sobre el que se mueve la cuenta. */
    clubId: string;
    /** ¿El club está fuera del país de origen del jugador? */
    abroad: boolean;
    /** ¿Ganaste algo con este club? Sin un título, el techo es 80. */
    hasTitleWithClub: boolean;
    /** ¿Te fuiste de este club al clásico rival? El techo baja a 49 y no vuelve. */
    jumpedToRival: boolean;
}

/**
 * Redondeo a tres decimales.
 *
 * Los deltas son fraccionarios y chicos (+2 por temporada, +0,02 por punto
 * pateado), así que sin esto la cuenta arrastra colas de coma flotante que
 * después viajan al guardado y ensucian el JSON. Tres decimales alcanzan y
 * sobran para una escala de 0 a 100.
 */
function round3(value: number): number {
    return Math.round(value * 1000) / 1000;
}

/** El techo de este club para este jugador. */
export function belongingCap(ctx: BelongingContext): number {
    let cap = BELONGING_MAX;
    // Sin un solo título con el club no hay cancha con tu nombre.
    if (!ctx.hasTitleWithClub) cap = Math.min(cap, BELONGING_CAP_NO_TITLES);
    // El techo del traidor. Este no se levanta ganando nada.
    if (ctx.jumpedToRival) cap = Math.min(cap, BELONGING_CAP_RIVAL_JUMP);
    return cap;
}

/** La Pertenencia con un club. Cero si nunca jugaste ahí. */
export function belongingOf(ledger: BelongingLedger, clubId: string | null): number {
    if (!clubId) return 0;
    return ledger.byClub[clubId] ?? 0;
}

/** En qué escalón cae un valor. Se recorre de mayor a menor: gana el primero. */
export function belongingTier(value: number): BelongingTierId {
    for (let i = BELONGING_TIERS.length - 1; i >= 0; i -= 1) {
        if (value >= BELONGING_TIERS[i].min) return BELONGING_TIERS[i].id;
    }
    return BELONGING_TIERS[0].id;
}

/**
 * Aplica un delta de Pertenencia y devuelve un ledger NUEVO. No muta.
 *
 * El orden de operaciones está en la cabecera del archivo y es la razón de que
 * esta función exista en vez de un `+=` repartido por el motor.
 */
export function applyBelonging(
    ledger: BelongingLedger,
    delta: number,
    ctx: BelongingContext,
): BelongingLedger {
    // 1 · Con contrato profesional la cuenta del club queda quieta. Ni sube ni
    //     baja: no estás ahí.
    if (ledger.frozen) return ledger;

    const current = belongingOf(ledger, ctx.clubId);
    let applied = delta;

    if (applied > 0) {
        // 2 · Afuera rinde la mitad. La cancha con tu nombre se hace en tu club.
        if (ctx.abroad) applied *= BELONGING_ABROAD_FACTOR;
        // 3 · Los últimos quince cuestan el doble.
        if (current >= BELONGING_DAMPEN_FROM) applied *= BELONGING_DAMPEN_FACTOR;
    }

    // 4 y 5 · Se suma y se acota.
    const cap = belongingCap(ctx);
    const next = round3(Math.min(cap, Math.max(BELONGING_MIN, current + applied)));

    return {
        frozen: ledger.frozen,
        byClub: { ...ledger.byClub, [ctx.clubId]: next },
    };
}

/**
 * Congela o descongela la cuenta.
 *
 * Se congela al firmar profesional —el reglamento te saca del plantel— y se
 * descongela al volver. Es lo que hace que la Pertenencia del club de origen
 * te espere en el mismo número donde la dejaste.
 */
export function setFrozen(ledger: BelongingLedger, frozen: boolean): BelongingLedger {
    if (ledger.frozen === frozen) return ledger;
    return { byClub: { ...ledger.byClub }, frozen };
}

/** Un ledger vacío: sin clubes y sin congelar. */
export function emptyBelonging(): BelongingLedger {
    return { byClub: {}, frozen: false };
}
