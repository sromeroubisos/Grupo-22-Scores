import test from 'node:test';
import assert from 'node:assert/strict';

import { reconcileLiveOverlay, puedeDarPorTerminado } from './liveOverlay.ts';

/* El caso real: Chile XV - Paraguay (Americas Rugby Championship, 2026-09-02),
   partido de la base, en el segundo tiempo. La portada lo dibujó «FT 52-12»
   mientras la base decía `live` y ya iba 54-19. */
const CHILE = { id: 'e9982c22', status: 'live', source: 'db', score: { home: 52, away: 12 } };
const OTRO = { id: 'ALypVsfU', status: 'live', source: 'flashscore', score: { home: 12, away: 36 } };
const PROGRAMADO = { id: 'xyz', status: 'scheduled', source: 'db', score: null };

const OK = { flashscore: { ok: true }, supabase: { ok: true } };

test('sin respuesta del sondeo no se toca nada', () => {
    const out = reconcileLiveOverlay([CHILE, OTRO, PROGRAMADO], null);
    assert.deepEqual(out, [CHILE, OTRO, PROGRAMADO]);
});

test('el partido que viene en el sondeo se refresca y sigue en vivo', () => {
    const fresco = { ...CHILE, score: { home: 54, away: 19 } };
    const out = reconcileLiveOverlay([CHILE, PROGRAMADO], { matches: [fresco], sources: OK });
    assert.equal(out[0].status, 'live');
    assert.deepEqual(out[0].score, { home: 54, away: 19 });
    assert.equal(out[1].status, 'scheduled');
});

test('un sondeo sano y vacío cierra lo que estaba en vivo', () => {
    const out = reconcileLiveOverlay([CHILE, OTRO, PROGRAMADO], { matches: [], sources: OK });
    assert.equal(out[0].status, 'final');
    assert.equal(out[1].status, 'final');
    assert.equal(out[2].status, 'scheduled');
});

test('la base que no contestó no cierra un partido de la base', () => {
    const out = reconcileLiveOverlay([CHILE, OTRO], {
        matches: [],
        sources: { flashscore: { ok: true }, supabase: { ok: false } },
    });
    assert.equal(out[0].status, 'live', 'Chile sale de la base: la base no contestó, no se cierra');
    assert.equal(out[1].status, 'final', 'el de FlashScore sí: su fuente contestó y no lo trajo');
});

test('FlashScore caído no cierra un partido de FlashScore', () => {
    const out = reconcileLiveOverlay([CHILE, OTRO], {
        matches: [],
        sources: { flashscore: { ok: false }, supabase: { ok: true } },
    });
    assert.equal(out[0].status, 'final');
    assert.equal(out[1].status, 'live');
});

test('sin `sources` rige el contrato viejo: el sondeo se toma por bueno', () => {
    const out = reconcileLiveOverlay([CHILE], { matches: [] });
    assert.equal(out[0].status, 'final');
});

test('puedeDarPorTerminado mira la fuente del partido, no la otra', () => {
    assert.equal(puedeDarPorTerminado(CHILE, { supabase: { ok: false } }), false);
    assert.equal(puedeDarPorTerminado(CHILE, { flashscore: { ok: false } }), true);
    assert.equal(puedeDarPorTerminado(OTRO, { flashscore: { ok: false } }), false);
    assert.equal(puedeDarPorTerminado(OTRO, { supabase: { ok: false } }), true);
    assert.equal(puedeDarPorTerminado(CHILE, null), true);
});
