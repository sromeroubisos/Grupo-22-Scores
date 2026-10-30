import test from 'node:test';
import assert from 'node:assert/strict';
import {
    buildPositionSeries,
    computeRoundCutoffs,
    majorityThreshold,
    positionDelta,
    type TimelineMatch,
} from './standingsTimeline.ts';

const TZ = 'America/Argentina/Buenos_Aires';

// 16:00 en Argentina = 19:00 UTC: el día del corte tiene que ser el local.
const m = (homeId: string, awayId: string, day: string, isFinal = true, hour = '19:00'): TimelineMatch => ({
    homeId,
    awayId,
    dateTime: `${day}T${hour}:00Z`,
    isFinal,
});

test('cuatro equipos, dos fechas completas: dos cortes', () => {
    const cutoffs = computeRoundCutoffs([
        m('A', 'B', '2026-03-07'), m('C', 'D', '2026-03-07'),
        m('A', 'C', '2026-03-14'), m('B', 'D', '2026-03-14'),
        m('A', 'D', '2026-03-21', false), m('B', 'C', '2026-03-21', false),
    ], TZ);
    assert.deepEqual(cutoffs.map((c) => [c.round, c.dayKey, c.matchesPlayed]), [
        [1, '2026-03-07', 2],
        [2, '2026-03-14', 4],
    ]);
});

test('una fecha de sábado y domingo se fotografía el domingo', () => {
    const cutoffs = computeRoundCutoffs([
        m('A', 'B', '2026-03-07'), m('C', 'D', '2026-03-07'),
        m('E', 'F', '2026-03-08'), m('G', 'H', '2026-03-08'),
    ], TZ);
    assert.equal(cutoffs.length, 1);
    assert.equal(cutoffs[0].fromDayKey, '2026-03-07');
    assert.equal(cutoffs[0].dayKey, '2026-03-08');
});

test('torneo impar: la fecha libre no frena el corte', () => {
    // Cinco equipos, juegan cuatro por fecha. 4/5 supera el 75 %.
    const cutoffs = computeRoundCutoffs([
        m('A', 'B', '2026-03-07'), m('C', 'D', '2026-03-07'),
        m('A', 'E', '2026-03-14'), m('B', 'C', '2026-03-14'),
    ], TZ);
    assert.deepEqual(cutoffs.map((c) => c.round), [1, 2]);
});

test('un partido postergado no tapa la fecha, pero media fecha no cuenta', () => {
    const fecha1 = [
        m('A', 'B', '2026-03-07'), m('C', 'D', '2026-03-07'),
        m('E', 'F', '2026-03-07'), m('G', 'H', '2026-03-07'),
    ];
    // Fecha 2 con un partido postergado: 6 de 8 jugaron dos (75 %).
    const conPostergado = computeRoundCutoffs([
        ...fecha1,
        m('A', 'C', '2026-03-14'), m('B', 'D', '2026-03-14'), m('E', 'G', '2026-03-14'),
        m('F', 'H', '2026-03-14', false),
    ], TZ);
    assert.deepEqual(conPostergado.map((c) => c.round), [1, 2]);

    // Solo dos partidos de la fecha 2 (4 de 8): no hay foto de la fecha 2.
    const mitad = computeRoundCutoffs([
        ...fecha1,
        m('A', 'C', '2026-03-14'), m('B', 'D', '2026-03-14'),
    ], TZ);
    assert.deepEqual(mitad.map((c) => c.round), [1]);
});

test('el día del corte es el de Argentina, no el UTC', () => {
    // 22:30 del sábado en Argentina = 01:30 UTC del domingo.
    const cutoffs = computeRoundCutoffs([
        m('A', 'B', '2026-03-07'),
        { homeId: 'C', awayId: 'D', dateTime: '2026-03-08T01:30:00Z', isFinal: true },
    ], TZ);
    assert.equal(cutoffs[0].dayKey, '2026-03-07');
});

test('un mismo día que completa dos rondas da una sola foto', () => {
    const cutoffs = computeRoundCutoffs([
        m('A', 'B', '2026-03-07'), m('C', 'D', '2026-03-07'),
        m('A', 'C', '2026-03-07', true, '21:00'), m('B', 'D', '2026-03-07', true, '21:00'),
    ], TZ);
    assert.deepEqual(cutoffs.map((c) => c.round), [2]);
});

test('el orden de llegada de los partidos no cambia los cortes', () => {
    const matches = [
        m('A', 'B', '2026-03-07'), m('C', 'D', '2026-03-07'),
        m('A', 'C', '2026-03-14'), m('B', 'D', '2026-03-14'),
    ];
    assert.deepEqual(
        computeRoundCutoffs([...matches].reverse(), TZ),
        computeRoundCutoffs(matches, TZ),
    );
});

test('sin fecha o con menos de tres equipos no hay cortes', () => {
    assert.deepEqual(computeRoundCutoffs([m('A', 'B', '2026-03-07')], TZ), []);
    assert.deepEqual(computeRoundCutoffs([
        { homeId: 'A', awayId: 'B', dateTime: null, isFinal: true },
        { homeId: 'C', awayId: 'D', dateTime: null, isFinal: true },
    ], TZ), []);
});

test('torneo impar a lo largo de la rueda: corta todas las fechas', () => {
    // Cinco equipos, cinco fechas, cada uno libre una vez. Contando "k partidos
    // por equipo" la quinta no se cortaba nunca: todos terminan con cuatro.
    const cutoffs = computeRoundCutoffs([
        m('A', 'B', '2026-03-07'), m('C', 'D', '2026-03-07'),   // libre E
        m('A', 'E', '2026-03-14'), m('B', 'C', '2026-03-14'),   // libre D
        m('A', 'D', '2026-03-21'), m('B', 'E', '2026-03-21'),   // libre C
        m('A', 'C', '2026-03-28'), m('D', 'E', '2026-03-28'),   // libre B
        m('B', 'D', '2026-04-04'), m('C', 'E', '2026-04-04'),   // libre A
    ], TZ);
    assert.deepEqual(cutoffs.map((c) => c.round), [1, 2, 3, 4, 5]);
});

test('el postergado entra en la foto siguiente, no inventa una fecha', () => {
    const cutoffs = computeRoundCutoffs([
        m('A', 'B', '2026-03-07'), m('C', 'D', '2026-03-07'), m('E', 'F', '2026-03-07'), m('G', 'H', '2026-03-07'),
        m('A', 'C', '2026-03-14'), m('B', 'D', '2026-03-14'), m('E', 'G', '2026-03-14'),
        // Fecha 3 más el postergado de la 2, el miércoles siguiente y el sábado.
        m('F', 'H', '2026-03-18'),
        m('A', 'D', '2026-03-21'), m('B', 'C', '2026-03-21'), m('E', 'H', '2026-03-21'), m('F', 'G', '2026-03-21'),
    ], TZ);
    assert.deepEqual(cutoffs.map((c) => [c.round, c.dayKey]), [
        [1, '2026-03-07'],
        [2, '2026-03-14'],
        [3, '2026-03-21'],
    ]);
});

test('una fecha a medias se completa con la siguiente: la foto lleva el número que corresponde', () => {
    const cutoffs = computeRoundCutoffs([
        m('A', 'B', '2026-03-07'), m('C', 'D', '2026-03-07'), m('E', 'F', '2026-03-07'), m('G', 'H', '2026-03-07'),
        m('A', 'C', '2026-03-14'), m('B', 'D', '2026-03-14'), m('E', 'G', '2026-03-14'), m('F', 'H', '2026-03-14'),
        // Fecha 3 con dos postergados (2 de 4: no alcanza).
        m('A', 'D', '2026-03-21'), m('B', 'C', '2026-03-21'),
        // Fecha 4 completa más los dos postergados: el 28 todos tienen cuatro
        // jugados. Es la foto de la fecha 4; no hay una de la 3 que mostrar.
        m('E', 'H', '2026-03-28'), m('F', 'G', '2026-03-28'),
        m('A', 'E', '2026-03-28'), m('B', 'F', '2026-03-28'), m('C', 'G', '2026-03-28'), m('D', 'H', '2026-03-28'),
    ], TZ);
    assert.deepEqual(cutoffs.map((c) => c.round), [1, 2, 4]);
});

test('un postergado suelto con la fecha siguiente no suma una fecha de más', () => {
    const cutoffs = computeRoundCutoffs([
        m('A', 'B', '2026-03-07'), m('C', 'D', '2026-03-07'), m('E', 'F', '2026-03-07'), m('G', 'H', '2026-03-07'),
        m('A', 'C', '2026-03-14'), m('B', 'D', '2026-03-14'), m('E', 'G', '2026-03-14'),
        // Fecha 3 completa más el postergado de la 2: cinco partidos, una fecha.
        m('F', 'H', '2026-03-21'),
        m('A', 'D', '2026-03-21'), m('B', 'C', '2026-03-21'), m('E', 'H', '2026-03-21'), m('F', 'G', '2026-03-21'),
    ], TZ);
    assert.deepEqual(cutoffs.map((c) => c.round), [1, 2, 3]);
});

test('el umbral es el 75 % de la ronda redondeado para arriba', () => {
    assert.equal(majorityThreshold(5), 4);
    assert.equal(majorityThreshold(4), 3);
    assert.equal(majorityThreshold(2), 2);
    assert.equal(majorityThreshold(1), 1);
});

test('las series siguen el orden de la última tabla y marcan ausencias', () => {
    const series = buildPositionSeries([
        [{ teamId: 'A' }, { teamId: 'B' }],
        [{ teamId: 'B' }, { teamId: 'A' }, { teamId: 'C' }],
    ]);
    assert.deepEqual(series, [
        { teamId: 'B', positions: [2, 1] },
        { teamId: 'A', positions: [1, 2] },
        { teamId: 'C', positions: [null, 3] },
    ]);
});

test('el delta es positivo cuando el equipo sube', () => {
    assert.equal(positionDelta(5, 2), 3);
    assert.equal(positionDelta(1, 4), -3);
    assert.equal(positionDelta(null, 4), null);
});
