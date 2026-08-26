import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
    defaultPollTitle,
    integerPercentages,
    isPollExpired,
    isPollOpen,
    normalizePollOptions,
    parseIsoTime,
    playLabelForSport,
    pollOptionId,
    summarizePoll,
    MAX_POLL_OPTIONS,
    type VideoPoll,
} from './polls';

const NOW = Date.parse('2026-08-26T12:00:00.000Z');

function pollWith(optionRefs: Array<[string, string]>): VideoPoll {
    return {
        id: 'poll-1',
        tournamentId: 'torneo-1',
        name: 'Fecha 19',
        title: '¿Cuál fue el mejor try?',
        status: 'open',
        options: optionRefs.map(([matchId, videoId]) => ({ id: pollOptionId({ matchId, videoId }), matchId, videoId, label: `Try ${videoId}` })),
        closesAt: null,
        createdAt: '2026-08-26T00:00:00.000Z',
        updatedAt: '2026-08-26T00:00:00.000Z',
    };
}

test('normalizar opciones: descarta lo incompleto, deduplica y respeta el tope', () => {
    const options = normalizePollOptions([
        { matchId: 'm1', videoId: 'v1', label: '  Try de Boffelli ' },
        { matchId: ' m1 ', videoId: 'v1', label: 'otra' },   // repetida (con espacios)
        { matchId: 'm1', videoId: 'v2' },                    // sin titulo: queda vacio
        { matchId: 'm2' },                                   // sin video
        { videoId: 'v9' },                                   // sin partido
        null,
        'texto',
    ]);
    assert.deepEqual(options, [
        { id: 'm1|v1', matchId: 'm1', videoId: 'v1', label: 'Try de Boffelli' },
        { id: 'm1|v2', matchId: 'm1', videoId: 'v2', label: '' },
    ]);

    const many = Array.from({ length: MAX_POLL_OPTIONS + 3 }, (_, i) => ({ matchId: 'm', videoId: `v${i}` }));
    assert.equal(normalizePollOptions(many).length, MAX_POLL_OPTIONS);
    assert.deepEqual(normalizePollOptions(null), []);
});

test('resumen: cuenta por opcion, marca el voto del usuario y a los que van primero', () => {
    const poll = pollWith([['m1', 'v1'], ['m1', 'v2'], ['m2', 'v3']]);
    const summary = summarizePoll(poll, [
        { optionId: 'm1|v1', userId: 'u1' },
        { optionId: 'm1|v1', userId: 'u2' },
        { optionId: 'm2|v3', userId: 'u3' },
        { optionId: 'm9|v9', userId: 'u4' },     // opcion que ya no esta: no cuenta
    ], 'u3', NOW);

    assert.equal(summary.isOpen, true);
    assert.equal(summary.totalVotes, 3);
    assert.deepEqual(summary.votes, { 'm1|v1': 2, 'm1|v2': 0, 'm2|v3': 1 });
    assert.deepEqual(summary.percentages, { 'm1|v1': 67, 'm1|v2': 0, 'm2|v3': 33 });
    assert.deepEqual(summary.leaderIds, ['m1|v1']);
    assert.equal(summary.userOptionId, 'm2|v3');
});

test('resumen sin votos: todo en cero, nadie va primero, y el usuario anonimo no tiene voto', () => {
    const summary = summarizePoll(pollWith([['m1', 'v1'], ['m1', 'v2']]), [], null, NOW);
    assert.equal(summary.totalVotes, 0);
    assert.deepEqual(summary.percentages, { 'm1|v1': 0, 'm1|v2': 0 });
    assert.deepEqual(summary.leaderIds, []);
    assert.equal(summary.userOptionId, null);
});

test('empate: van primero las dos', () => {
    const summary = summarizePoll(pollWith([['m1', 'v1'], ['m1', 'v2'], ['m2', 'v3']]), [
        { optionId: 'm1|v1', userId: 'u1' },
        { optionId: 'm2|v3', userId: 'u2' },
    ], null, NOW);
    assert.deepEqual(summary.leaderIds, ['m1|v1', 'm2|v3']);
});

test('la fecha de cierre manda: pasada, la votacion esta cerrada aunque diga open', () => {
    const base = pollWith([['m1', 'v1'], ['m1', 'v2']]);
    assert.equal(isPollOpen(base, NOW), true, 'sin fecha, abierta');
    assert.equal(isPollOpen({ ...base, closesAt: '2026-08-27T00:00:00.000Z' }, NOW), true, 'con fecha futura, abierta');
    assert.equal(isPollOpen({ ...base, closesAt: '2026-08-26T11:59:59.000Z' }, NOW), false, 'con fecha pasada, cerrada');
    assert.equal(isPollOpen({ ...base, closesAt: '2026-08-26T12:00:00.000Z' }, NOW), false, 'justo a la hora, cerrada');
    assert.equal(isPollOpen({ ...base, status: 'closed' }, NOW), false, 'cerrada a mano, cerrada');
    assert.equal(isPollExpired({ closesAt: 'no es una fecha' }, NOW), false, 'una fecha rota no cierra nada');
    assert.equal(parseIsoTime('2026-08-26T12:00:00.000Z'), NOW);
    assert.equal(parseIsoTime(''), null);
    assert.equal(parseIsoTime(42), null);

    const expired = summarizePoll({ ...base, closesAt: '2026-08-26T00:00:00.000Z' }, [{ optionId: 'm1|v1', userId: 'u1' }], null, NOW);
    assert.equal(expired.isOpen, false);
    assert.deepEqual(expired.leaderIds, ['m1|v1'], 'los resultados se siguen contando');
});

test('los porcentajes son enteros y suman 100', () => {
    assert.deepEqual(integerPercentages({ a: 1, b: 1, c: 1 }, 3), { a: 34, b: 33, c: 33 });
    assert.deepEqual(integerPercentages({ a: 2, b: 1 }, 3), { a: 67, b: 33 });
    assert.deepEqual(integerPercentages({ a: 0, b: 0 }, 0), { a: 0, b: 0 });
    for (const votes of [{ a: 5, b: 3, c: 1, d: 1 }, { a: 7, b: 7, c: 7 }, { a: 1, b: 0 }]) {
        const total = Object.values(votes).reduce((sum, value) => sum + value, 0);
        const sum = Object.values(integerPercentages(votes, total)).reduce((acc, value) => acc + value, 0);
        assert.equal(sum, 100, JSON.stringify(votes));
    }
});

test('la pregunta habla el idioma del deporte', () => {
    assert.equal(playLabelForSport('rugby').singular, 'try');
    assert.equal(playLabelForSport('field-hockey').singular, 'gol');
    assert.equal(playLabelForSport('football').singular, 'gol');
    assert.equal(playLabelForSport('volleyball').singular, 'punto');
    assert.equal(playLabelForSport('basketball').singular, 'jugada');
    assert.equal(playLabelForSport(null).singular, 'jugada');
    assert.equal(defaultPollTitle('rugby'), '¿Cuál fue el mejor try?');
    assert.equal(defaultPollTitle('football'), '¿Cuál fue el mejor gol?');
});
