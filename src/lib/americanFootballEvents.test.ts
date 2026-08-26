import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildMatchEventDefinitionMap,
  formatOutcomeTag,
  getDefaultMatchEventDefinitions,
  outcomeScores,
  resolveOutcomeId,
} from './matchEventCatalog.ts';
import { formatYardsDetail, parseYardsFromDetail } from './matchEventStats.ts';
import { buildCompleteMatchStats, buildCompleteStatTabs } from './matchStatsFromEvents.ts';

/**
 * El catalogo de futbol americano segun el reglamento de la NFL.
 *
 * Lo que se prueba es sobre todo que EL MARCADOR NO MIENTA: un field goal
 * fallado no suma, un touchdown sin tipo sigue valiendo seis, y un fumble no
 * es turnover hasta que lo recupera el rival. Si alguien vuelve a poner un
 * evento "field goal fallado" aparte, o le saca el `defaultOutcome` al
 * touchdown, estos casos se ponen en rojo.
 */

const AMFOOT = 'american-football';
const definitions = getDefaultMatchEventDefinitions(AMFOOT);
const map = buildMatchEventDefinitionMap(definitions);

const ev = (type: string, team: 'home' | 'away', detail = '') => ({ type, team, detail });

test('el sistema de anotacion es el de la NFL: 6, 3, 1, 2 y 2', () => {
  assert.equal(map.touchdown.points, 6);
  assert.equal(map.field_goal.points, 3);
  assert.equal(map.extra_point.points, 1);
  assert.equal(map.two_point_conversion.points, 2);
  assert.equal(map.safety.points, 2);
});

test('lo fallado es un desenlace, no un evento aparte', () => {
  const types = definitions.map((definition) => definition.type);
  for (const descartado of ['field_goal_missed', 'extra_point_missed', 'two_point_failed', 'touchdown_rushing']) {
    assert.ok(!types.includes(descartado), `${descartado} volvio como tipo aparte`);
  }
  assert.ok(map.field_goal.outcomes?.some((outcome) => outcome.id === 'blocked'));
  assert.ok(map.extra_point.outcomes?.some((outcome) => outcome.id === 'missed'));
});

test('un field goal suma tres solo si entra; fallado y bloqueado cuentan como intento', () => {
  const stats = buildCompleteMatchStats(
    [
      ev('field_goal', 'home', formatOutcomeTag('good')),
      ev('field_goal', 'home', formatOutcomeTag('missed')),
      ev('field_goal', 'home', formatOutcomeTag('blocked')),
    ],
    map,
  );

  assert.equal(stats.points.home, 3);
  assert.equal(stats.fieldGoals.home, 1);
  assert.equal(stats.fieldGoalAttempts.home, 3);
  assert.equal(stats.fieldGoalsBlocked.home, 1);
});

test('el punto extra y la conversion de dos siguen la misma regla', () => {
  const stats = buildCompleteMatchStats(
    [
      ev('extra_point', 'away', formatOutcomeTag('good')),
      ev('extra_point', 'away', formatOutcomeTag('missed')),
      ev('two_point_conversion', 'away', formatOutcomeTag('good')),
      ev('two_point_conversion', 'away', formatOutcomeTag('failed')),
    ],
    map,
  );

  assert.equal(stats.points.away, 3);
  assert.equal(stats.extraPoints.away, 1);
  assert.equal(stats.extraPointAttempts.away, 2);
  assert.equal(stats.twoPointConversions.away, 1);
  assert.equal(stats.twoPointAttempts.away, 2);
});

test('el touchdown siempre vale seis y su desenlace es el tipo', () => {
  const stats = buildCompleteMatchStats(
    [
      ev('touchdown', 'home', formatOutcomeTag('rushing')),
      ev('touchdown', 'home', formatOutcomeTag('passing')),
      ev('touchdown', 'home', formatOutcomeTag('interception_return')),
      ev('touchdown', 'home', formatOutcomeTag('punt_return')),
    ],
    map,
  );

  assert.equal(stats.points.home, 24);
  assert.equal(stats.touchdowns.home, 4);
  assert.equal(stats.touchdownsRushing.home, 1);
  assert.equal(stats.touchdownsPassing.home, 1);
  assert.equal(stats.touchdownsDefensive.home, 1);
  assert.equal(stats.touchdownsReturn.home, 1);
});

test('un touchdown SIN tipo (ESPN, carga vieja) sigue valiendo seis', () => {
  // Es la diferencia con el corner corto de hockey: alli un evento sin
  // desenlace no suma porque no se sabe como termino. Un touchdown sin tipo
  // es un touchdown igual.
  assert.equal(outcomeScores(map.touchdown, ''), true);
  assert.equal(resolveOutcomeId(map.touchdown, ''), 'other');

  const stats = buildCompleteMatchStats([ev('touchdown', 'away')], map);
  assert.equal(stats.points.away, 6);
  assert.equal(stats.touchdowns.away, 1);
});

test('un field goal sin desenlace NO suma: no declara default', () => {
  const stats = buildCompleteMatchStats([ev('field_goal', 'home')], map);
  assert.equal(stats.points.home, 0);
  assert.equal(stats.fieldGoalAttempts.home, 1);
});

test('un fumble es turnover solo si lo recupera el rival', () => {
  const stats = buildCompleteMatchStats(
    [
      ev('fumble', 'home', formatOutcomeTag('recovered')),
      ev('fumble', 'home', formatOutcomeTag('lost')),
      ev('fumble', 'home'),
    ],
    map,
  );

  assert.equal(stats.fumbles.home, 3);
  assert.equal(stats.fumblesLost.home, 1);
  assert.equal(stats.turnovers.home, 1);
  // La recuperacion se la lleva el otro club.
  assert.equal(stats.fumbleRecoveries.away, 1);
  assert.equal(stats.fumbleRecoveries.home, 0);
});

test('la intercepcion es del defensor; el turnover es del que la sufre', () => {
  const stats = buildCompleteMatchStats(
    [
      ev('interception', 'away'),
      ev('turnover_on_downs', 'home'),
    ],
    map,
  );

  assert.equal(stats.interceptions.away, 1);
  assert.equal(stats.turnovers.home, 2);
  assert.equal(stats.turnovers.away, 0);
});

test('las yardas viajan en el detalle con signo y se suman por jugada', () => {
  assert.equal(formatYardsDetail(7), 'Yds: +7');
  assert.equal(formatYardsDetail(-8), 'Yds: -8');
  assert.equal(parseYardsFromDetail('Yds: +24 | pase largo'), 24);
  assert.equal(parseYardsFromDetail('carrera de 12 yd'), 12);
  assert.equal(parseYardsFromDetail('sin dato'), 0);

  const stats = buildCompleteMatchStats(
    [
      ev('rush', 'home', formatYardsDetail(7)),
      ev('rush', 'home', formatYardsDetail(-2)),
      ev('pass_complete', 'home', `Recibe: Jones | ${formatYardsDetail(24)}`),
      ev('pass_incomplete', 'home'),
      ev('penalty', 'away', `Holding | ${formatYardsDetail(10)}`),
    ],
    map,
  );

  assert.equal(stats.rushes.home, 2);
  assert.equal(stats.rushYards.home, 5);
  assert.equal(stats.passAttempts.home, 2);
  assert.equal(stats.passCompletions.home, 1);
  assert.equal(stats.passYards.home, 24);
  assert.equal(stats.penaltiesCommitted.away, 1);
  assert.equal(stats.penaltyYards.away, 10);
});

test('la penalidad NO es un tiro a los palos: en rugby si lo es', () => {
  // `penalty` es a la vez el penal a los palos del rugby y la penalidad del
  // futbol americano. Lo distingue la definicion, nunca el nombre.
  assert.equal(map.penalty.category, 'discipline');
  assert.ok(!map.penalty.kickAtGoal);
  const rugby = buildMatchEventDefinitionMap(getDefaultMatchEventDefinitions('rugby'));
  assert.equal(rugby.penalty.kickAtGoal, true);
});

test('las pestanas son las del deporte: marcador, ofensiva, turnovers y disciplina', () => {
  const stats = buildCompleteMatchStats(
    [
      ev('touchdown', 'home', formatOutcomeTag('rushing')),
      ev('first_down', 'home', formatOutcomeTag('rushing')),
      ev('interception', 'away'),
      ev('penalty', 'home', formatYardsDetail(5)),
      ev('timeout', 'home'),
    ],
    map,
  );
  const tabs = buildCompleteStatTabs(stats, 'Local', 'Visita', { sportId: AMFOOT });
  assert.deepEqual(tabs.map((tab) => tab.id), ['marcador', 'ofensiva', 'turnovers', 'disciplina']);
  const labels = tabs.flatMap((tab) => tab.sections.flatMap((section) => section.rows.map((row) => row.label)));
  for (const rugby of ['Tries', 'Conversiones OK', 'Entradas en 22', 'Scrums']) {
    assert.ok(!labels.includes(rugby), `${rugby} se colo en las estadisticas de futbol americano`);
  }
  assert.ok(labels.includes('Primeros downs'));
  assert.ok(labels.includes('Turnovers'));
});
