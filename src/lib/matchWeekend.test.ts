/**
 * La regla del fin de semana, congelada.
 *
 *   node --test src/lib/matchWeekend.test.ts
 *
 * Import relativo con extension, no el alias `@/`: el runner del proyecto no
 * resuelve el alias, solo lo hace el build de Next. Misma convencion que
 * `phaseDefaults.test.ts`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
    dayKeyInTimeZone,
    findMatchdayFor,
    findSplitWeekends,
    formatPeriod,
    isWeekendDay,
    nominalPeriodOf,
    periodKeyOf,
    periodOfDays,
    sameMatchday,
    weekdayOf,
    weekendAnchor,
} from './matchWeekend.ts';

// Referencias: 2026-03-14 es sabado.
const VIE = '2026-03-13';
const SAB = '2026-03-14';
const DOM = '2026-03-15';
const LUN = '2026-03-16';
const MIE = '2026-03-18';
const SAB_SIGUIENTE = '2026-03-21';

test('los dias de referencia son los que digo que son', () => {
    assert.equal(weekdayOf(VIE), 5);
    assert.equal(weekdayOf(SAB), 6);
    assert.equal(weekdayOf(DOM), 0);
    assert.equal(weekdayOf(LUN), 1);
    assert.equal(weekdayOf(MIE), 3);
});

test('el fin de semana es viernes, sabado y domingo', () => {
    assert.equal(isWeekendDay(VIE), true);
    assert.equal(isWeekendDay(SAB), true);
    assert.equal(isWeekendDay(DOM), true);
    assert.equal(isWeekendDay(LUN), false);
    assert.equal(isWeekendDay(MIE), false);
});

test('el ancla del fin de semana es siempre el sabado', () => {
    assert.equal(weekendAnchor(VIE), SAB);
    assert.equal(weekendAnchor(SAB), SAB);
    assert.equal(weekendAnchor(DOM), SAB);
});

test('de lunes a jueves no hay ancla: cada dia es su propia fecha', () => {
    assert.equal(weekendAnchor(LUN), null);
    assert.equal(weekendAnchor(MIE), null);
    assert.equal(periodKeyOf(MIE), MIE);
    assert.equal(sameMatchday(LUN, MIE), false);
});

test('EL CASO DE LOS 808 PARES: sabado y domingo seguidos son la misma fecha', () => {
    assert.equal(sameMatchday(SAB, DOM), true);
    assert.equal(sameMatchday(VIE, DOM), true);
});

test('el domingo NO se junta con el sabado de la semana siguiente', () => {
    assert.equal(sameMatchday(DOM, SAB_SIGUIENTE), false);
});

test('el lunes no se pega al fin de semana anterior', () => {
    assert.equal(sameMatchday(DOM, LUN), false);
});

test('el periodo nominal de un fin de semana va de viernes a domingo', () => {
    assert.deepEqual(nominalPeriodOf(SAB), { start: VIE, end: DOM });
    assert.deepEqual(nominalPeriodOf(DOM), { start: VIE, end: DOM });
});

test('el periodo nominal de un dia de semana es ese dia solo', () => {
    assert.deepEqual(nominalPeriodOf(MIE), { start: MIE, end: MIE });
});

test('el periodo guardado es el REAL, del primer partido al ultimo', () => {
    assert.deepEqual(periodOfDays([DOM, SAB]), { start: SAB, end: DOM });
    assert.deepEqual(periodOfDays([SAB]), { start: SAB, end: SAB });
    assert.equal(periodOfDays([]), null);
});

test('periodOfDays descarta lo que no es un dia', () => {
    assert.deepEqual(periodOfDays(['', 'ayer', SAB]), { start: SAB, end: SAB });
});

test('un partido del domingo cae en la fecha que solo tiene el sabado', () => {
    // El caso que parte a los 808: la fecha existe con periodo [sab, sab] y el
    // domingo queda FUERA del rango guardado. Tiene que entrar igual.
    const rounds = [
        { id: 'f1', period: { start: SAB, end: SAB } },
        { id: 'f2', period: { start: SAB_SIGUIENTE, end: SAB_SIGUIENTE } },
    ];
    assert.equal(findMatchdayFor(rounds, DOM)?.id, 'f1');
});

test('un partido del sabado siguiente no cae en la fecha anterior', () => {
    const rounds = [{ id: 'f1', period: { start: SAB, end: DOM } }];
    assert.equal(findMatchdayFor(rounds, SAB_SIGUIENTE), null);
});

test('una fecha sin periodo no atrae partidos', () => {
    const rounds = [{ id: 'f1', period: null }];
    assert.equal(findMatchdayFor(rounds, SAB), null);
});

test('detecta la fecha partida al medio', () => {
    const periods = [
        { start: SAB, end: SAB },
        { start: DOM, end: DOM },
        { start: SAB_SIGUIENTE, end: SAB_SIGUIENTE },
    ];
    assert.deepEqual(findSplitWeekends(periods), [0]);
});

test('no marca como partidas dos fechas de fines de semana distintos', () => {
    const periods = [
        { start: SAB, end: DOM },
        { start: SAB_SIGUIENTE, end: SAB_SIGUIENTE },
    ];
    assert.deepEqual(findSplitWeekends(periods), []);
});

test('el rotulo del periodo dice un dia, dos, o cruza de mes', () => {
    assert.equal(formatPeriod({ start: SAB, end: SAB }), '14 mar');
    assert.equal(formatPeriod({ start: SAB, end: DOM }), '14-15 mar');
    assert.equal(formatPeriod({ start: '2026-03-30', end: '2026-04-01' }), '30 mar - 1 abr');
    assert.equal(formatPeriod(null), 'Sin fecha');
});

test('el dia sale de la ZONA del torneo, no de UTC', () => {
    // Sabado 14 a las 22:00 en Buenos Aires es domingo 15 a la 01:00 UTC. Sin
    // zona explicita el partido se iria a la fecha siguiente.
    const iso = '2026-03-15T01:00:00Z';
    assert.equal(dayKeyInTimeZone(iso, 'America/Argentina/Buenos_Aires'), SAB);
    assert.equal(dayKeyInTimeZone(iso, 'UTC'), DOM);
});

test('dayKeyInTimeZone no revienta con basura', () => {
    assert.equal(dayKeyInTimeZone(null, 'UTC'), null);
    assert.equal(dayKeyInTimeZone('', 'UTC'), null);
    assert.equal(dayKeyInTimeZone('no es una fecha', 'UTC'), null);
});
