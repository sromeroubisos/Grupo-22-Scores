import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AMERICAN_FOOTBALL_PRESETS,
  buildAmericanFootballEventDefinitions,
  createAmericanFootballRuleset,
  describeAmericanFootballRuleset,
  getAmericanFootballQuickActions,
  normalizeAmericanFootballRuleset,
  readAmericanFootballRuleset,
  toPeriodRules,
} from './americanFootballRules.ts';
import { buildMatchEventDefinitionMap, formatOutcomeTag, getDefaultMatchEventDefinitions, resolveMatchEventDefinitions } from './matchEventCatalog.ts';
import { buildCompleteMatchStats, buildCompleteStatTabs } from './matchStatsFromEvents.ts';
import { getClockPeriodOptions, getNextActivePeriodAfterEvent, getPeriodSequence } from './matchPeriods.ts';
import { getPeriodOffsetSeconds } from './matchClock.ts';

/**
 * El reglamento de futbol americano por torneo. Lo que se prueba:
 *
 *  - que el FLAG no herede lo que no tiene (patadas, fumble) y tenga lo suyo;
 *  - que un reglamento personalizado mande sobre el deporte en periodos,
 *    reloj y catalogo;
 *  - que lo guardado viejo o incompleto se complete y nunca reviente;
 *  - que el deporte SIN reglamento siga siendo exactamente el NFL de antes.
 */

const ev = (type: string, team: 'home' | 'away', detail = '') => ({ type, team, detail });

test('cada preset produce un reglamento completo y coherente con su disciplina', () => {
  for (const preset of AMERICAN_FOOTBALL_PRESETS) {
    const rules = createAmericanFootballRuleset(preset.id);
    assert.equal(rules.preset, preset.id);
    assert.equal(rules.discipline, preset.discipline);
    if (preset.discipline === 'flag') {
      assert.equal(rules.kicking.fieldGoal, false, `${preset.id}: el flag no patea`);
      assert.equal(rules.firstDownRule, 'midfield', `${preset.id}: el primer down del flag es la mitad`);
      assert.equal(rules.fumbles, false, `${preset.id}: en flag el balon al piso es muerto`);
    } else {
      assert.equal(rules.periods, 4);
      assert.equal(rules.kicking.fieldGoal, true);
    }
  }
});

test('el deporte sin reglamento es exactamente el catalogo NFL', () => {
  const fromSport = getDefaultMatchEventDefinitions('american-football').map((definition) => definition.type);
  const fromRules = buildAmericanFootballEventDefinitions(createAmericanFootballRuleset('nfl')).map((definition) => definition.type);
  assert.deepEqual(fromSport, fromRules);
  assert.ok(fromSport.includes('field_goal'));
  assert.ok(fromSport.includes('punt'));
  assert.ok(fromSport.includes('kickoff'));
  assert.ok(fromSport.includes('fumble'));
});

test('el flag no tiene patadas ni fumble, y si tiene flag pull y blitz', () => {
  const types = buildAmericanFootballEventDefinitions(createAmericanFootballRuleset('ifaf-flag-5v5')).map((definition) => definition.type);
  for (const missing of ['field_goal', 'punt', 'kickoff', 'touchback', 'fumble', 'forced_fumble']) {
    assert.ok(!types.includes(missing), `${missing} se colo en el flag`);
  }
  for (const own of ['flag_pull', 'flag_pull_for_loss', 'blitz', 'pass_defended', 'extra_point', 'two_point_conversion', 'touchdown', 'safety']) {
    assert.ok(types.includes(own), `${own} falta en el flag`);
  }
});

test('en flag el try de 1 y de 2 usan los mismos tipos que el tackle, con otro rotulo', () => {
  const map = buildMatchEventDefinitionMap(buildAmericanFootballEventDefinitions(createAmericanFootballRuleset('nfl-flag')));
  assert.equal(map.extra_point.label, 'Try de 1 punto');
  assert.equal(map.two_point_conversion.label, 'Try de 2 puntos');
  // No hay bloqueo en flag: el try de 1 se convierte o se falla, nada mas.
  assert.deepEqual(map.extra_point.outcomes?.map((outcome) => outcome.id), ['good', 'failed']);

  const stats = buildCompleteMatchStats(
    [
      ev('touchdown', 'home', formatOutcomeTag('passing')),
      ev('extra_point', 'home', formatOutcomeTag('good')),
      ev('touchdown', 'home', formatOutcomeTag('rushing')),
      ev('two_point_conversion', 'home', formatOutcomeTag('failed')),
      ev('flag_pull', 'away'),
      ev('flag_pull_for_loss', 'away'),
    ],
    map,
  );
  assert.equal(stats.points.home, 13);
  assert.equal(stats.extraPoints.home, 1);
  assert.equal(stats.twoPointAttempts.home, 1);
  assert.equal(stats.twoPointConversions.home, 0);
  assert.equal(stats.flagPulls.away, 2);
  assert.equal(stats.flagPullsForLoss.away, 1);
});

test('las pestanas de flag hablan de flag pulls, no de field goals', () => {
  const rules = createAmericanFootballRuleset('nfl-flag');
  const map = buildMatchEventDefinitionMap(buildAmericanFootballEventDefinitions(rules));
  const stats = buildCompleteMatchStats([ev('flag_pull', 'home'), ev('touchdown', 'away', formatOutcomeTag('rushing'))], map);
  const tabs = buildCompleteStatTabs(stats, 'Local', 'Visita', { sportId: 'american-football', discipline: 'flag' });
  const labels = tabs.flatMap((tab) => tab.sections.flatMap((section) => section.rows.map((row) => row.label)));
  assert.ok(labels.includes('Flag pulls'));
  assert.ok(!labels.some((label) => label.startsWith('Field goal')), 'field goals en las estadisticas del flag');
});

test('un tackle sin patadas deja de ofrecer field goal, punt y kickoff', () => {
  const rules = createAmericanFootballRuleset('ifaf');
  rules.kicking = { fieldGoal: false, punt: false, kickoff: false };
  const types = buildAmericanFootballEventDefinitions(rules).map((definition) => definition.type);
  assert.ok(!types.includes('field_goal'));
  assert.ok(!types.includes('punt'));
  assert.ok(!types.includes('kickoff'));
  // Y la accion rapida de field goal simplemente no resuelve contra el catalogo.
  assert.ok(getAmericanFootballQuickActions('tackle').scoring.includes('field_goal'));
});

test('los puntos del reglamento mandan sobre los del deporte', () => {
  const rules = createAmericanFootballRuleset('nfl');
  rules.scoring.touchdown = 7;
  const map = buildMatchEventDefinitionMap(buildAmericanFootballEventDefinitions(rules));
  const stats = buildCompleteMatchStats([ev('touchdown', 'home')], map);
  assert.equal(stats.points.home, 7);
});

test('el reglamento del torneo redefine periodos y reloj: dos tiempos de 20', () => {
  const ref = { sportId: 'american-football', periodRules: toPeriodRules(createAmericanFootballRuleset('ifaf-flag-5v5')) };
  assert.deepEqual(getPeriodSequence(ref), ['1T', '2T']);
  assert.deepEqual(getClockPeriodOptions(ref), ['PRE', '1T', 'HT', '2T', 'ET', 'FT']);
  assert.equal(getPeriodOffsetSeconds(ref, '2T'), 1200);
  assert.equal(getPeriodOffsetSeconds(ref, 'FT'), 2400);
  assert.equal(getNextActivePeriodAfterEvent('match_half', '1T', ref), '2T');
});

test('cuartos de 12 minutos: el segundo tiempo arranca a los 24', () => {
  const ref = { sportId: 'american-football', periodRules: toPeriodRules(createAmericanFootballRuleset('high-school')) };
  assert.deepEqual(getPeriodSequence(ref), ['Q1', 'Q2', 'Q3', 'Q4']);
  assert.equal(getPeriodOffsetSeconds(ref, 'Q3'), 1440);
  assert.equal(getPeriodOffsetSeconds(ref, 'FT'), 2880);
});

test('un deporte a secas sigue resolviendo igual que antes (el ref string no cambia nada)', () => {
  assert.deepEqual(getPeriodSequence('american-football'), ['Q1', 'Q2', 'Q3', 'Q4']);
  assert.equal(getPeriodOffsetSeconds('american-football', 'Q3'), 1800);
  assert.deepEqual(getPeriodSequence('rugby'), ['1T', '2T']);
  assert.equal(getPeriodOffsetSeconds('rugby', '2T'), 2400);
});

test('lo guardado incompleto se completa desde su preset y nunca revienta', () => {
  const partial = normalizeAmericanFootballRuleset({ preset: 'ncaa', discipline: 'tackle', periodDurationMinutes: 10 });
  assert.ok(partial);
  assert.equal(partial.periodDurationMinutes, 10);
  assert.equal(partial.overtime.format, 'possession-series');
  assert.equal(partial.roster.size, 70);

  // Un preset que ya no existe cae al default de su disciplina, sin perder lo suyo.
  const orphan = normalizeAmericanFootballRuleset({ preset: 'liga-que-no-existe', discipline: 'flag', timeoutsPerHalf: 4 });
  assert.ok(orphan);
  assert.equal(orphan.discipline, 'flag');
  assert.equal(orphan.timeoutsPerHalf, 4);
  assert.equal(orphan.kicking.fieldGoal, false);

  assert.equal(normalizeAmericanFootballRuleset(null), null);
  assert.equal(normalizeAmericanFootballRuleset('basura'), null);
  assert.equal(readAmericanFootballRuleset({ pointsWin: 2 }), null);
});

test('el catalogo resuelto de un partido sale del reglamento del torneo', () => {
  const tournamentRuleset = { pointsWin: 2, americanFootball: createAmericanFootballRuleset('nfl-flag') };
  const types = resolveMatchEventDefinitions({ sportId: 'american-football', phaseSettings: null, tournamentRuleset })
    .map((definition) => definition.type);
  assert.ok(types.includes('flag_pull'));
  assert.ok(!types.includes('field_goal'));
});

test('la descripcion corta dice disciplina, reglamento y formato', () => {
  assert.equal(describeAmericanFootballRuleset(createAmericanFootballRuleset('nfl')), 'Tackle · NFL · temporada regular · 4×15′');
  assert.equal(describeAmericanFootballRuleset(createAmericanFootballRuleset('ifaf-flag-5v5')), 'Flag · IFAF 5v5 · 2×20′');
});
