import test from 'node:test';
import assert from 'node:assert/strict';
import { decidirRugbyPass, RUGBY_MATCH_SPAN_MS } from './rugbyPassLiveDecision.ts';

const KICK = Date.parse('2026-11-06T20:10:00Z');
const fila = (status: string, home: number | null = 0, away: number | null = 0) => ({
    status,
    date_time: new Date(KICK).toISOString(),
    score: { home, away, penalties: null },
});
const pollMudo = { status: 'scheduled' as const, home: 0, away: 0 };

test('la ficha manda: poll 0-0 mudo, partido 42-12 a los 105 min sigue en vivo con su marcador', () => {
    const d = decidirRugbyPass(
        fila('live'), 1,
        { gameId: 1, terminado: false, home: 42, away: 12 },
        pollMudo, KICK + RUGBY_MATCH_SPAN_MS + 5 * 60_000,
    );
    assert.equal(d.status, 'live');
    assert.deepEqual(d.score, { home: 42, away: 12, penalties: null });
    assert.equal(d.cambio, true);
});

test('ficha terminada cierra con el marcador final, no con el 0-0 del poll', () => {
    const d = decidirRugbyPass(
        fila('live', 40, 12), 1,
        { gameId: 1, terminado: true, home: 42, away: 12 },
        pollMudo, KICK + 120 * 60_000,
    );
    assert.equal(d.status, 'final');
    assert.deepEqual(d.score, { home: 42, away: 12, penalties: null });
});

test('una ficha de OTRO partido se descarta', () => {
    const d = decidirRugbyPass(
        fila('live', 10, 3), 1,
        { gameId: 2, terminado: false, home: 0, away: 0 },
        null, KICK + 30 * 60_000,
    );
    assert.equal(d.status, 'live');
    assert.deepEqual(d.score, { home: 10, away: 3, penalties: null });
    assert.equal(d.cambio, false);
});

test('antes del kickoff la ficha 0-0 no pasa el partido a vivo', () => {
    const d = decidirRugbyPass(
        fila('scheduled', null, null), 1,
        { gameId: 1, terminado: false, home: 0, away: 0 },
        null, KICK - 5 * 60_000,
    );
    assert.equal(d.status, 'scheduled');
    assert.equal(d.cambio, false);
});

test('sin ficha, el poll en 0-0 y no-vivo NO pisa el marcador guardado', () => {
    const d = decidirRugbyPass(fila('live', 21, 7), 1, null, pollMudo, KICK + 120 * 60_000);
    assert.equal(d.status, 'final');
    assert.deepEqual(d.score, { home: 21, away: 7, penalties: null });
});

test('sin ficha, el poll vivo escribe su marcador', () => {
    const d = decidirRugbyPass(fila('scheduled'), 1, null, { status: 'live', home: 7, away: 0 }, KICK + 20 * 60_000);
    assert.equal(d.status, 'live');
    assert.deepEqual(d.score, { home: 7, away: 0, penalties: null });
});
