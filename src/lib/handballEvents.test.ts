import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildMatchEventDefinitionMap,
  formatOutcomeTag,
  getDefaultMatchEventDefinitions,
  joinOutcomeDetail,
  normalizeSportBucket,
} from './matchEventCatalog.ts';
import { buildCompleteMatchStats, buildCompleteStatTabs } from './matchStatsFromEvents.ts';
import { getPeriodOffsetSeconds, getSportClockConfig } from './matchClock.ts';
import { getClockPeriodOptions } from './matchPeriods.ts';

/**
 * Handball entra sin proveedor externo: todo se carga a mano. Lo que se prueba
 * aca es que el catalogo alcance solo, que el MARCADOR NO SE DUPLIQUE ni se
 * pierda (un 7 metros atajado no es gol; un gol viejo sin origen sigue
 * sumando), que los tipos viejos del 7 metros sigan resolviendo, y que el
 * reloj hable de 30 minutos y no de 40.
 */

const HANDBALL = 'handball';
const definitions = getDefaultMatchEventDefinitions(HANDBALL);
const map = buildMatchEventDefinitionMap(definitions);

const ev = (type: string, team: 'home' | 'away', detail = '') => ({ type, team, detail });

test('el catalogo tiene los eventos base del deporte', () => {
  const types = definitions.map((definition) => definition.type);
  for (const esperado of [
    'goal', 'seven_meter', 'shot', 'assist', 'save', 'block', 'steal', 'turnover_lost', 'foul',
    'yellow_card', 'two_min_suspension', 'red_card', 'blue_card',
    'timeout', 'official_timeout', 'substitution',
    'match_start', 'start_period', 'end_period', 'match_half', 'match_end',
    'shootout_start', 'shootout_scored', 'shootout_missed', 'shootout_end',
  ]) {
    assert.ok(types.includes(esperado), `${esperado} no esta en el catalogo`);
  }
});

test('los tipos viejos del 7 metros siguen resolviendo pero no se ofrecen', () => {
  assert.equal(map.seven_meter_goal?.legacy, true);
  assert.equal(map.seven_meter_miss?.legacy, true);
  assert.equal(map.seven_meter_goal?.points, 1);
  // El reemplazo no es legacy.
  assert.ok(!map.seven_meter?.legacy);
});

test('el origen del gol no multiplica tipos: hay UN gol con desenlaces', () => {
  const types = definitions.map((definition) => definition.type);
  for (const noDeberia of ['goal_wing', 'goal_pivot', 'goal_fast_break', 'goal_backcourt', 'goal_7m']) {
    assert.ok(!types.includes(noDeberia), `${noDeberia} aparecio como tipo aparte`);
  }
  const origins = (map.goal.outcomes ?? []).map((outcome) => outcome.id);
  assert.ok(origins.includes('fast_break'));
  assert.ok(origins.includes('wing'));
  assert.ok(origins.includes('pivot'));
  assert.ok((map.goal.outcomes ?? []).every((outcome) => outcome.scores), 'un origen de gol que no suma');
});

test('un gol viejo sin origen sigue sumando y cae en "de jugada"', () => {
  const stats = buildCompleteMatchStats([ev('goal', 'home')], map);
  assert.equal(stats.points.home, 1);
  assert.equal(stats.goalsFastBreak.home, 0);
  assert.equal(stats.goalsWing.home, 0);
});

test('el origen del gol se reparte sin tocar el total', () => {
  const stats = buildCompleteMatchStats(
    [
      ev('goal', 'home', formatOutcomeTag('fast_break')),
      ev('goal', 'home', formatOutcomeTag('wing')),
      ev('goal', 'home', formatOutcomeTag('pivot')),
      ev('goal', 'home', formatOutcomeTag('backcourt')),
      ev('goal', 'home', formatOutcomeTag('open_play')),
    ],
    map,
  );
  assert.equal(stats.points.home, 5);
  assert.equal(stats.goalsFastBreak.home, 1);
  assert.equal(stats.goalsWing.home, 1);
  assert.equal(stats.goalsPivot.home, 1);
  assert.equal(stats.goalsBackcourt.home, 1);
});

test('un 7 metros convertido suma UN gol y se cuenta como ejecutado', () => {
  const stats = buildCompleteMatchStats([ev('seven_meter', 'home', formatOutcomeTag('goal'))], map);
  assert.equal(stats.points.home, 1);
  assert.equal(stats.sevenMeters.home, 1);
  assert.equal(stats.sevenMeterGoals.home, 1);
});

test('un 7 metros atajado o desviado se cuenta pero NO suma', () => {
  const stats = buildCompleteMatchStats(
    [
      ev('seven_meter', 'home', formatOutcomeTag('saved')),
      ev('seven_meter', 'home', formatOutcomeTag('missed')),
    ],
    map,
  );
  assert.equal(stats.points.home, 0);
  assert.equal(stats.sevenMeters.home, 2);
  assert.equal(stats.sevenMeterGoals.home, 0);
  assert.equal(stats.sevenMetersSaved.home, 1);
});

test('un 7 metros sin desenlace cargado NO es gol', () => {
  const stats = buildCompleteMatchStats([ev('seven_meter', 'home')], map);
  assert.equal(stats.points.home, 0);
  assert.equal(stats.sevenMeters.home, 1);
});

test('un partido guardado con los tipos viejos del 7 metros no pierde nada', () => {
  const stats = buildCompleteMatchStats(
    [
      ev('seven_meter_goal', 'home'),
      ev('seven_meter_goal', 'home'),
      ev('seven_meter_miss', 'home'),
    ],
    map,
  );
  assert.equal(stats.points.home, 2);
  assert.equal(stats.sevenMeters.home, 3);
  assert.equal(stats.sevenMeterGoals.home, 2);
});

test('el lanzamiento sin gol se reparte por desenlace y no toca el marcador', () => {
  const stats = buildCompleteMatchStats(
    [
      ev('shot', 'away', formatOutcomeTag('saved')),
      ev('shot', 'away', formatOutcomeTag('blocked')),
      ev('shot', 'away', formatOutcomeTag('missed')),
    ],
    map,
  );
  assert.equal(stats.points.away, 0);
  assert.equal(stats.shotsSaved.away, 1);
  assert.equal(stats.shotsBlocked.away, 1);
  assert.equal(stats.shotsMissed.away, 1);
});

test('la atajada es del arquero y distingue la de 7 metros', () => {
  const stats = buildCompleteMatchStats(
    [
      ev('save', 'home', formatOutcomeTag('open_play')),
      ev('save', 'home', formatOutcomeTag('seven_meter')),
    ],
    map,
  );
  assert.equal(stats.saves.home, 2);
  assert.equal(stats.savesSevenMeter.home, 1);
});

test('la perdida lleva el motivo; el robo se carga al que recupera sin duplicarla', () => {
  const stats = buildCompleteMatchStats(
    [
      ev('turnover_lost', 'home', formatOutcomeTag('bad_pass')),
      ev('turnover_lost', 'home', formatOutcomeTag('passive_play')),
      ev('steal', 'away'),
    ],
    map,
  );
  assert.equal(stats.turnoversLost.home, 2);
  assert.equal(stats.turnoversBadPass.home, 1);
  assert.equal(stats.turnoversPassivePlay.home, 1);
  assert.equal(stats.steals.away, 1);
  // El robo NO suma un turnover al rival: la perdida ya la cargo el rival.
  assert.equal(stats.turnovers.home, 0);
});

test('las sanciones propias del deporte se cuentan aparte', () => {
  const stats = buildCompleteMatchStats(
    [
      ev('two_min_suspension', 'home'),
      ev('two_min_suspension', 'home'),
      ev('blue_card', 'away'),
      ev('yellow_card', 'away'),
    ],
    map,
  );
  assert.equal(stats.twoMinSuspensions.home, 2);
  assert.equal(stats.blueCards.away, 1);
  assert.equal(stats.yellowCards.away, 1);
});

test('la tanda de 7 metros NO toca el marcador', () => {
  const stats = buildCompleteMatchStats(
    [
      ev('goal', 'home', formatOutcomeTag('open_play')),
      ev('goal', 'away', formatOutcomeTag('open_play')),
      ev('shootout_scored', 'home'),
      ev('shootout_scored', 'home'),
      ev('shootout_missed', 'away'),
    ],
    map,
  );
  assert.equal(stats.points.home, 1);
  assert.equal(stats.points.away, 1);
  assert.equal(stats.shootoutScored.home, 2);
  assert.equal(stats.shootoutMissed.away, 1);
  assert.equal(map.shootout_scored.category, 'shootout');
});

test('lo que arma la UI suma: un gol cargado desde el modal termina en el marcador', () => {
  const detail = joinOutcomeDetail(map.goal, 'wing', 'desde la izquierda');
  const stats = buildCompleteMatchStats([ev('goal', 'home', detail)], map);
  assert.equal(stats.points.home, 1);
  assert.equal(stats.goalsWing.home, 1);
});

test('las pestanas de estadisticas son las del handball, no las de rugby', () => {
  const stats = buildCompleteMatchStats(
    [
      ev('goal', 'home', formatOutcomeTag('open_play')),
      ev('seven_meter', 'away', formatOutcomeTag('saved')),
      ev('two_min_suspension', 'home'),
    ],
    map,
  );
  const tabs = buildCompleteStatTabs(stats, 'Local', 'Visitante', { sportId: HANDBALL });
  const ids = tabs.map((tab) => tab.id);
  assert.ok(ids.includes('lanzamientos'));
  assert.ok(ids.includes('disciplina'));
  assert.ok(!ids.includes('formaciones'), 'volvieron las pestanas de rugby');
  const labels = tabs.flatMap((tab) => tab.sections.flatMap((section) => section.rows.map((row) => row.label)));
  assert.ok(labels.includes('Exclusiones de 2 min'));
  assert.ok(!labels.includes('Entradas en 22'));
});

/* ─── reloj ─── */

test('el reloj de handball rebasa a 30 minutos en el segundo tiempo, no a 40 como el rugby', () => {
  assert.equal(getPeriodOffsetSeconds(HANDBALL, '2T'), 1800);
  assert.equal(getPeriodOffsetSeconds(HANDBALL, 'HT'), 1800);
  assert.equal(getPeriodOffsetSeconds(HANDBALL, 'ET'), 3600);
  assert.equal(getPeriodOffsetSeconds(HANDBALL, 'FT'), 3600);
  assert.deepEqual(getSportClockConfig(HANDBALL).periods, ['PRE', '1T', '2T', 'ET', 'FT']);
});

test('el handball sigue siendo dos tiempos: el selector no ofrece cuartos', () => {
  assert.deepEqual(getClockPeriodOptions(HANDBALL), ['PRE', '1T', 'HT', '2T', 'ET', 'FT']);
});

test('rugby no se movio al sumar el reloj de handball', () => {
  assert.equal(getPeriodOffsetSeconds('rugby', '2T'), 2400);
  assert.equal(normalizeSportBucket(HANDBALL), 'handball');
});
