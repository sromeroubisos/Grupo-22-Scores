// La negociación (minijuego 3): determinista, la reserva nunca se dice, la
// paciencia se gasta.

import assert from 'node:assert/strict';
import test from 'node:test';
import type { Negotiation } from '../types/coach.ts';
import {
    CLOSE,
    FAR,
    REPLY_TEXT,
    acceptCounter,
    makeOffer,
    patienceWord,
    replyFor,
    startNegotiation,
    walkAway,
} from './negotiation.ts';

const SALE = { subject: 'La compensación', side: 'venta' as const, unit: 'pesos' as const, anchor: 1_000_000, reserve: 2_000_000, patience: 4, step: 50_000 };
const BUY = { subject: 'El vínculo', side: 'compra' as const, unit: 'pesos' as const, anchor: 100_000, reserve: 80_000, patience: 3, step: 500 };

test('vendiendo: una cifra por debajo de la reserva cierra ahí; por encima, contesta y se gasta la paciencia', () => {
    const neg = startNegotiation(SALE);
    assert.equal(neg.counter, 1_000_000, 'la primera cifra es la del rival');
    const ok = makeOffer(neg, 1_900_000);
    assert.equal(ok.status, 'cerrada');
    assert.equal(ok.agreed, 1_900_000);

    const high = makeOffer(neg, 2_200_000);
    assert.equal(high.status, 'abierta');
    assert.equal(high.rounds[0].reply, 'se-acerca');
    assert.equal(high.patience, 3);
    assert.ok(high.counter > neg.counter && high.counter <= SALE.reserve, 'la contraoferta se acerca sin pasar la reserva');
});

test('comprando: es al revés, y la contraoferta nunca es peor que lo que ya se ofreció', () => {
    const neg = startNegotiation(BUY);
    const low = makeOffer(neg, 50_000);
    assert.equal(low.rounds[0].reply, 'lejos');
    assert.ok(low.counter < neg.counter && low.counter >= BUY.reserve);
    const ok = makeOffer(low, 80_000);
    assert.equal(ok.status, 'cerrada');
    assert.equal(ok.agreed, 80_000);
});

test('las pistas se ordenan por distancia: lejos, se acerca, casi', () => {
    const neg = startNegotiation(SALE);
    assert.equal(replyFor(neg, SALE.reserve * (1 + FAR + 0.01)), 'lejos');
    assert.equal(replyFor(neg, SALE.reserve * (1 + (FAR + CLOSE) / 2)), 'se-acerca');
    assert.equal(replyFor(neg, SALE.reserve * (1 + CLOSE / 2)), 'casi');
    assert.equal(replyFor(neg, SALE.reserve), 'acepta');
});

test('la paciencia se agota: pedir de más todo el tiempo rompe la negociación', () => {
    let neg: Negotiation = startNegotiation(SALE);
    let rounds = 0;
    while (neg.status === 'abierta' && rounds < 20) {
        neg = makeOffer(neg, 3_000_000);
        rounds++;
    }
    assert.equal(neg.status, 'rota');
    assert.equal(neg.patience, 0);
    assert.ok(rounds <= SALE.patience, `aguantó ${rounds} rondas con paciencia ${SALE.patience}`);
    assert.equal(neg.rounds[neg.rounds.length - 1].reply, 'rompe');
    // Rota, no se mueve más.
    assert.equal(makeOffer(neg, 1), neg);
    assert.equal(acceptCounter(neg), neg);
});

test('una oferta "lejos" gasta el doble de paciencia que una "casi"', () => {
    const neg = startNegotiation(SALE);
    assert.equal(makeOffer(neg, 3_000_000).patience, SALE.patience - 2);
    assert.equal(makeOffer(neg, 2_080_000).patience, SALE.patience - 1);
});

test('es determinista: las mismas cifras dan la misma negociación', () => {
    const offers = [3_000_000, 2_500_000, 2_150_000, 2_050_000];
    const run = () => offers.reduce((n, o) => makeOffer(n, o), startNegotiation(SALE));
    assert.deepEqual(run(), run());
});

test('la reserva no aparece en ningún texto de la negociación', () => {
    // Ni el número crudo ni escrito como lo escribe la pantalla.
    const neg = startNegotiation(SALE);
    const texts = [...Object.values(REPLY_TEXT), patienceWord(neg), patienceWord({ patience: 1, maxPatience: 4 }), neg.subject];
    const forms = [String(SALE.reserve), SALE.reserve.toLocaleString('es-AR'), '2,0', '2,00', '2.0'];
    for (const t of texts) {
        for (const f of forms) assert.ok(!t.includes(f), `"${t}" deja ver la reserva (${f})`);
        assert.ok(!/\d/.test(t), `"${t}" lleva un número`);
    }
});

test('aceptar la contraoferta cierra en la cifra del rival; levantarse la rompe', () => {
    const neg = makeOffer(startNegotiation(SALE), 2_600_000);
    const took = acceptCounter(neg);
    assert.equal(took.status, 'cerrada');
    assert.equal(took.agreed, neg.counter);
    assert.equal(walkAway(neg).status, 'rota');
});

test('el ancla nunca queda del lado malo de la reserva', () => {
    assert.equal(startNegotiation({ ...SALE, anchor: 5_000_000 }).anchor, SALE.reserve);
    assert.equal(startNegotiation({ ...BUY, anchor: 10_000 }).anchor, BUY.reserve);
});
