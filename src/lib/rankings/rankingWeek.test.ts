import test from 'node:test';
import assert from 'node:assert/strict';

import {
  formatRankingWeekLabel,
  getRankingWeekKey,
  getRankingWeekStart,
  getWeeklyReferenceCutoff,
  isNewRankingWeek,
  legacyWeeklyBaselineMark,
  readWeeklyBaselineMark,
} from './rankingWeek.ts';

/* ── la semana del ranking ──────────────────────────────────────────────── */

test('la semana arranca el martes a las 00:00 de Argentina, que es cuando corre el cron', () => {
  // 2026-09-08 es martes. A las 03:00 UTC son las 00:00 en Argentina.
  assert.equal(getRankingWeekKey(new Date('2026-09-08T03:00:00Z')), '2026-09-08');
  // Un minuto antes todavia es lunes en Argentina: semana del martes anterior.
  assert.equal(getRankingWeekKey(new Date('2026-09-08T02:59:00Z')), '2026-09-01');
});

test('todos los dias hasta el lunes siguiente caen en la misma semana', () => {
  assert.equal(getRankingWeekKey(new Date('2026-09-10T15:00:00Z')), '2026-09-08'); // jueves
  assert.equal(getRankingWeekKey(new Date('2026-09-13T20:00:00Z')), '2026-09-08'); // domingo
  assert.equal(getRankingWeekKey(new Date('2026-09-15T02:00:00Z')), '2026-09-08'); // lunes 23:00 AR
  assert.equal(getRankingWeekKey(new Date('2026-09-15T03:00:00Z')), '2026-09-15'); // martes 00:00 AR
});

test('el corte de semana no depende del huso del servidor', () => {
  // El mismo instante, expresado con otro desfase, da la misma semana.
  assert.equal(
    getRankingWeekKey(new Date('2026-09-08T00:00:00-03:00')),
    getRankingWeekKey(new Date('2026-09-08T03:00:00Z')),
  );
});

/* ── la marca guardada en metadata ──────────────────────────────────────── */

test('la marca se lee de metadata.weeklyBaseline y tolera basura', () => {
  assert.deepEqual(
    readWeeklyBaselineMark({ weeklyBaseline: { weekKey: '2026-09-08', capturedAt: '2026-09-08T03:00:12.000Z' } }),
    { weekKey: '2026-09-08', capturedAt: '2026-09-08T03:00:12.000Z' },
  );
  assert.equal(readWeeklyBaselineMark(null), null);
  assert.equal(readWeeklyBaselineMark({}), null);
  assert.equal(readWeeklyBaselineMark({ weeklyBaseline: 'martes' }), null);
  assert.equal(readWeeklyBaselineMark({ weeklyBaseline: { weekKey: 'ayer' } }), null);
  assert.equal(readWeeklyBaselineMark({ weeklyBaseline: [] }), null);
});

test('sin marca, la ultima corrida hace de marca: si fue esta semana, lo guardado ya es la referencia', () => {
  // El cron corrio el martes 8 con la logica anterior; el miercoles 9 alguien
  // aprieta Recalcular. La referencia guardada es la de la semana pasada y se
  // adopta, no se retoma.
  const marca = legacyWeeklyBaselineMark('2026-09-08T03:00:23.886+00:00');
  assert.deepEqual(marca, { weekKey: '2026-09-08', capturedAt: '2026-09-08T03:00:23.886Z' });
  assert.equal(isNewRankingWeek(marca, getRankingWeekKey(new Date('2026-09-09T15:00:00Z'))), false);
  // Si la ultima corrida fue la semana pasada, la de hoy si abre semana.
  assert.equal(isNewRankingWeek(marca, getRankingWeekKey(new Date('2026-09-15T03:00:00Z'))), true);
  assert.equal(legacyWeeklyBaselineMark(null), null);
  assert.equal(legacyWeeklyBaselineMark('nunca'), null);
});

test('sin marca, o con una de otra semana, la semana es nueva', () => {
  assert.equal(isNewRankingWeek(null, '2026-09-08'), true);
  assert.equal(isNewRankingWeek({ weekKey: '2026-09-01', capturedAt: '' }, '2026-09-08'), true);
  assert.equal(isNewRankingWeek({ weekKey: '2026-09-08', capturedAt: '' }, '2026-09-08'), false);
});

/* ── el corte de la referencia ──────────────────────────────────────────── */

test('la semana arranca en un instante concreto: el martes a las 00:00 de Argentina', () => {
  assert.equal(getRankingWeekStart('2026-09-15'), '2026-09-15T03:00:00.000Z');
  // El sabado anterior queda antes del corte; el propio martes ya no.
  assert.ok('2026-09-12T18:30:00Z' < getRankingWeekStart('2026-09-15'));
  assert.ok(getRankingWeekStart('2026-09-15') <= '2026-09-15T03:00:00.000Z');
  // Ida y vuelta: el instante de arranque cae en su propia semana.
  assert.equal(getRankingWeekKey(new Date(getRankingWeekStart('2026-09-15'))), '2026-09-15');
});

test('la referencia de una semana es la tabla del martes anterior: siete dias antes del arranque', () => {
  assert.equal(getWeeklyReferenceCutoff('2026-09-15'), '2026-09-08T03:00:00.000Z');
  // Los partidos del fin de semana 12-13/9 quedan del lado de "esta semana".
  assert.ok('2026-09-12T18:30:00Z' >= getWeeklyReferenceCutoff('2026-09-15'));
  // Los del 5-6/9 ya estaban en la tabla de la semana pasada.
  assert.ok('2026-09-06T19:00:00Z' < getWeeklyReferenceCutoff('2026-09-15'));
});

/* ── el rotulo ──────────────────────────────────────────────────────────── */

test('el rotulo de la semana se lee en castellano y no se corre un dia por el huso', () => {
  assert.equal(formatRankingWeekLabel('2026-09-08'), 'martes, 8 de septiembre');
  assert.equal(formatRankingWeekLabel(null), null);
  assert.equal(formatRankingWeekLabel('8/9/2026'), null);
});
