// Minijuego 3: la negociación (El Entrenador v2, etapa 3).
//
// Rondas de oferta y contraoferta contra un rival que tiene un VALOR DE RESERVA
// OCULTO —lo máximo que paga si compra, lo mínimo que acepta si vende— y una
// PACIENCIA que se gasta en cada ronda que no cierra. Las reacciones dan pistas
// en palabras ("lejos", "se acerca", "casi"); el número de la reserva no aparece
// nunca en un texto. Si la paciencia se agota, el rival se levanta de la mesa.
//
// Es GENÉRICA a propósito: la usan la compensación por un jugador que se va
// (el club vende), la renovación de un vínculo y la incorporación de un jugador
// (el club paga), y la va a usar la etapa 5 con los sponsors. Lo único que sabe
// es comparar cifras: el qué (`subject`) y la unidad (`unit`) son de quien la
// abre.
//
// SIN AZAR. La reserva y la paciencia las fija quien abre la negociación, con un
// RNG derivado de la semilla y el contexto (ver `transfers.ts`), y de ahí en más
// cada ronda es una cuenta: misma negociación, mismas ofertas, mismo final.
//
// LADOS, desde el club del jugador:
//   · `venta`: el club cobra (una compensación). El rival es el que paga y su
//     reserva es lo MÁXIMO que pone. Arranca abajo (`anchor` < `reserve`).
//   · `compra`: el club paga (un vínculo). El rival es el que cobra y su reserva
//     es lo MÍNIMO que acepta. Arranca arriba (`anchor` > `reserve`).

import type { Negotiation, NegotiationReply } from '../types/coach.ts';

/** Más lejos que esto de la reserva (en fracción de la reserva) es "lejos". */
export const FAR = 0.25;
/** Más cerca que esto es "casi". En el medio, "se acerca". */
export const CLOSE = 0.08;
/** Lo que el rival se mueve hacia su reserva en cada contraoferta. */
export const CONCESSION = 0.35;
/** Una oferta "lejos" le gasta dos de paciencia: no es una charla, es una falta de respeto. */
export const FAR_PATIENCE_COST = 2;

export interface NegotiationSpec {
    subject: string;
    side: Negotiation['side'];
    unit: Negotiation['unit'];
    anchor: number;
    reserve: number;
    patience: number;
    /** Redondeo de las cifras (500 pesos, un punto de porcentaje). */
    step: number;
}

function roundTo(v: number, step: number): number {
    return Math.round(v / step) * step;
}

/** Abre una negociación. La primera cifra sobre la mesa es la del rival (`anchor`). */
export function startNegotiation(spec: NegotiationSpec): Negotiation {
    const step = Math.max(1, spec.step);
    const reserve = roundTo(spec.reserve, step);
    // El ancla nunca está del lado malo de la reserva: un rival que arranca
    // pagando más de lo que puede no es un rival.
    const anchor =
        spec.side === 'venta' ? Math.min(roundTo(spec.anchor, step), reserve) : Math.max(roundTo(spec.anchor, step), reserve);
    const patience = Math.max(1, Math.round(spec.patience));
    return {
        subject: spec.subject,
        side: spec.side,
        unit: spec.unit,
        anchor,
        reserve,
        patience,
        maxPatience: patience,
        counter: anchor,
        rounds: [],
        status: 'abierta',
        agreed: null,
        step,
    };
}

/**
 * ¿Esta cifra le sirve al rival? Vendiendo, el club pide; le sirve si no pasa de
 * lo que el rival pone. Comprando, el club ofrece; le sirve si llega a lo que el
 * rival pide.
 */
export function acceptable(neg: Pick<Negotiation, 'side' | 'reserve'>, amount: number): boolean {
    return neg.side === 'venta' ? amount <= neg.reserve : amount >= neg.reserve;
}

/** La distancia entre lo que se ofreció y la reserva, en fracción de la reserva. */
function gap(neg: Pick<Negotiation, 'side' | 'reserve'>, amount: number): number {
    const d = neg.side === 'venta' ? amount - neg.reserve : neg.reserve - amount;
    return Math.max(0, d) / Math.max(1, Math.abs(neg.reserve));
}

/** La reacción del rival a una cifra que no le sirve. */
export function replyFor(neg: Pick<Negotiation, 'side' | 'reserve'>, amount: number): NegotiationReply {
    if (acceptable(neg, amount)) return 'acepta';
    const g = gap(neg, amount);
    if (g > FAR) return 'lejos';
    if (g > CLOSE) return 'se-acerca';
    return 'casi';
}

/**
 * Una ronda: el club pone una cifra. Si al rival le sirve, cierra ahí. Si no,
 * contesta con una pista y una contraoferta un poco más cerca de su reserva, y
 * se le gasta la paciencia. Sin paciencia, se rompe. Sobre una negociación
 * cerrada o rota no hace nada (devuelve la MISMA).
 */
export function makeOffer(neg: Negotiation, amount: number): Negotiation {
    if (neg.status !== 'abierta' || !Number.isFinite(amount)) return neg;
    const offer = roundTo(amount, neg.step);
    const reply = replyFor(neg, offer);
    if (reply === 'acepta') {
        return { ...neg, status: 'cerrada', agreed: offer, rounds: [...neg.rounds, { offer, reply, counter: null }] };
    }
    const patience = neg.patience - (reply === 'lejos' ? FAR_PATIENCE_COST : 1);
    if (patience <= 0) {
        return { ...neg, patience: 0, status: 'rota', rounds: [...neg.rounds, { offer, reply: 'rompe', counter: null }] };
    }
    // La contraoferta se mueve hacia la reserva, pero nunca más allá de lo que el
    // club ya ofreció: no tiene sentido contestar con algo peor para uno mismo.
    let counter = roundTo(neg.counter + (neg.reserve - neg.counter) * CONCESSION, neg.step);
    counter = neg.side === 'venta' ? Math.min(counter, offer) : Math.max(counter, offer);
    return { ...neg, patience, counter, rounds: [...neg.rounds, { offer, reply, counter }] };
}

/** El club acepta la última cifra del rival. */
export function acceptCounter(neg: Negotiation): Negotiation {
    if (neg.status !== 'abierta') return neg;
    return {
        ...neg,
        status: 'cerrada',
        agreed: neg.counter,
        rounds: [...neg.rounds, { offer: neg.counter, reply: 'acepta', counter: null }],
    };
}

/** El club se levanta de la mesa. */
export function walkAway(neg: Negotiation): Negotiation {
    if (neg.status !== 'abierta') return neg;
    return { ...neg, status: 'rota' };
}

/** Lo que dice el rival, en palabras. Ninguna frase lleva un número. */
export const REPLY_TEXT: Readonly<Record<NegotiationReply, string>> = {
    lejos: 'Lejos. Así no hay conversación.',
    'se-acerca': 'Se acerca, pero todavía no.',
    casi: 'Casi. Un esfuerzo más y se cierra.',
    acepta: 'Trato hecho.',
    rompe: 'Se cansaron: se levantan de la mesa.',
};

/** Cómo viene la paciencia del rival, en palabras. */
export function patienceWord(neg: Pick<Negotiation, 'patience' | 'maxPatience'>): string {
    const r = neg.patience / Math.max(1, neg.maxPatience);
    if (neg.patience <= 1) return 'Una más y se levantan.';
    if (r <= 0.5) return 'Se les está acabando la paciencia.';
    return 'Tienen paciencia.';
}
