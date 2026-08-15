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
//   1. Si el ledger está congelado y NO es el club donde estás jugando, no pasa
//      nada: esa cuenta te espera donde la dejaste.
//   2. Si es GANANCIA y estás afuera del país, rinde la mitad.
//   3. Si es GANANCIA y ya llegaste a 85, rinde la mitad otra vez.
//   4. Se suma.
//   5. Se acota a [0, techo].
//
// Las PÉRDIDAS no se amortiguan ni se dividen. Irse es irse: que el exterior te
// proteja de perder Pertenencia sería premiar justo lo que la gasta.
//
// ── EL CONGELAMIENTO ERA GLOBAL, Y ESE ERA EL BICHO (0.23.0) ──
// El paso 1 decía «si el ledger está congelado, no pasa nada», sin mirar de qué
// club. Como el congelamiento se prende al firmar profesional y solo lo apaga
// volver a casa, el efecto medido era que NINGÚN club sumaba Pertenencia
// durante toda la etapa profesional. La sonda de distribución lo puso en
// números: en la muestra que rota decisiones —81% de carreras profesionales— la
// barra iba 4,6 en la tercera temporada, 0,7 en la sexta y 0,0 en la décima, y
// el 94% se retiraba en «Uno del plantel». Una carrera entera de figura en un
// club de Japón mostraba cero y ningún escalón.
//
// Lo que el congelamiento existe para proteger es LA CUENTA DEL CLUB QUE
// DEJASTE —el reglamento URBA te saca de su plantel, así que esos años no
// construyen SU cancha con tu nombre— y eso no dice nada del club donde estás
// parado. Los hinchas de ese club te ven jugar todos los domingos.

import {
    BELONGING_ABROAD_FACTOR,
    BELONGING_CAP_NO_TITLES,
    BELONGING_CAP_RIVAL_JUMP,
    BELONGING_DAMPEN_FACTOR,
    BELONGING_DAMPEN_FROM,
    BELONGING_FORM_MAX,
    BELONGING_FORM_MIN,
    BELONGING_FORM_WEIGHT,
    BELONGING_MAX,
    BELONGING_MIN,
    BELONGING_TIERS,
} from '../types/currencies.ts';
import type { BelongingLedger, BelongingTierId } from '../types/currencies.ts';
import { RATING_PIVOT } from './season-rating.ts';

export interface BelongingContext {
    /** El club sobre el que se mueve la cuenta. */
    clubId: string;
    /** ¿El club está fuera del país de origen del jugador? */
    abroad: boolean;
    /** ¿Ganaste algo con este club? Sin un título hay techo (`BELONGING_CAP_NO_TITLES`). */
    hasTitleWithClub: boolean;
    /**
     * ¿Te fuiste de ESTE club a su clásico rival? El techo baja a
     * `BELONGING_CAP_RIVAL_JUMP` y no vuelve a subir.
     *
     * Es por club y no por carrera: lo decide `engine/betrayal.ts` leyendo la
     * trayectoria. Al que te ficha no le debés nada.
     */
    jumpedToRival: boolean;
    /**
     * ¿Es el club donde estás jugando AHORA?
     *
     * Solo lo mira el congelamiento, y es lo que lo vuelve una regla sobre el
     * club que dejaste en vez de un apagón general. Se deriva de
     * `state.player.clubId` en `contracts.ts` y no se guarda: dos fuentes de
     * verdad para «dónde juego» es exactamente lo que el CLAUDE.md prohíbe.
     */
    playingHere: boolean;
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

/**
 * Cuánto vale la temporada que te quedaste, según cómo jugaste.
 *
 * Devuelve un multiplicador centrado en `RATING_PIVOT` —la temporada correcta,
 * ni buena ni mala, vale 1— y acotado a [0,5 – 2]. No puede devolver un número
 * negativo a propósito: una mala temporada construye menos, no destruye. Que la
 * hinchada te BAJE de escalón es una consecuencia de irte, no de jugar mal.
 *
 * Pura y sin azar, como el puntaje del que sale.
 */
export function belongingFormFactor(rating: number): number {
    const bruto = 1 + (rating - RATING_PIVOT) * BELONGING_FORM_WEIGHT;
    return Math.min(BELONGING_FORM_MAX, Math.max(BELONGING_FORM_MIN, bruto));
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
    // 1 · Con contrato profesional, la cuenta de los clubes donde NO estás queda
    //     quieta. Ni sube ni baja: no estás ahí. La del club donde jugás corre
    //     normalmente —con el descuento del exterior, si corresponde—, porque su
    //     hinchada te ve todos los domingos.
    if (ledger.frozen && !ctx.playingHere) return ledger;

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
 * Borra la cuenta de un club. Devuelve un ledger NUEVO. No muta.
 *
 * La usa el salto al clásico (`engine/betrayal.ts`) y no debería usarla nadie
 * más: es la ÚNICA operación que no es un delta. Un `applyBelonging` con el
 * negativo de lo que hay daría el mismo número hoy y otro mañana, porque pasaría
 * por el congelamiento —que mira si estás parado en ese club— y por los techos.
 * Acá no hay nada que acotar: la cuenta se va a cero y se acabó.
 *
 * La clave se BORRA en vez de quedar en cero, y es a propósito: un club con cero
 * y un club donde nunca jugaste son la misma cosa para `belongingOf`, así que
 * dejar la clave sería guardar basura en el JSON del guardado. El techo del
 * traidor no viaja acá —sale de la trayectoria— así que borrar no pierde nada.
 */
export function clearBelonging(ledger: BelongingLedger, clubId: string): BelongingLedger {
    if (!(clubId in ledger.byClub)) return ledger;
    const byClub = { ...ledger.byClub };
    delete byClub[clubId];
    return { frozen: ledger.frozen, byClub };
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
