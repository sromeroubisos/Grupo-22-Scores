import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildMatchEventDefinitionMap,
  formatOutcomeTag,
  getDefaultMatchEventDefinitions,
  outcomeScores,
} from './matchEventCatalog.ts';
import { buildCompleteMatchStats } from './matchStatsFromEvents.ts';

/**
 * El catalogo de hockey segun el reglamento FIH.
 *
 * Lo que se prueba acá es sobre todo que el MARCADOR NO SE DUPLIQUE: un corner
 * corto que termina en gol es UN evento con su desenlace, no un corner mas un
 * gol, y no existe un tipo "gol de corner corto". Si alguien vuelve a agregar
 * uno, estos casos se ponen en rojo.
 */

const HOCKEY = 'field-hockey';
const definitions = getDefaultMatchEventDefinitions(HOCKEY);
const map = buildMatchEventDefinitionMap(definitions);

const ev = (type: string, team: 'home' | 'away', detail = '') => ({ type, team, detail });

test('no existe un tipo de gol por jugada fija: el gol es el gol', () => {
  const types = definitions.map((definition) => definition.type);
  assert.ok(!types.includes('penalty_corner_goal'), 'volvio el gol de corner corto como tipo aparte');
  // `penalty_goal` es "Penal a los palos" en rugby. Mientras exista en hockey,
  // el diccionario de etiquetas y los rulesets viejos lo pueden pisar.
  assert.ok(!types.includes('penalty_goal'), 'el penal a los palos del rugby volvio al hockey');
});

test('el catalogo no tiene las acciones que se descartaron por subjetivas o ruidosas', () => {
  const types = definitions.map((definition) => definition.type);
  for (const descartado of ['pass', 'pass_failed', 'clear_chance', 'offensive_recovery']) {
    assert.ok(!types.includes(descartado), `${descartado} sigue en el catalogo`);
  }
});

test('la falta esta, porque de ahi nace casi todo free hit', () => {
  const types = definitions.map((definition) => definition.type);
  assert.ok(types.includes('foul'));
  assert.ok(types.includes('free_hit'));
});

test('un corner corto convertido suma UN gol, no dos', () => {
  const stats = buildCompleteMatchStats(
    [ev('penalty_corner', 'home', formatOutcomeTag('goal'))],
    map,
  );

  assert.equal(stats.points.home, 1);
  assert.equal(stats.penaltyCorners.home, 1);
  assert.equal(stats.penaltyCornerGoals.home, 1);
});

test('un corner corto que no termina en gol se cuenta pero no suma', () => {
  const stats = buildCompleteMatchStats(
    [
      ev('penalty_corner', 'home', formatOutcomeTag('defended')),
      ev('penalty_corner', 'home', formatOutcomeTag('wide')),
      ev('penalty_corner', 'home', formatOutcomeTag('new_corner')),
    ],
    map,
  );

  assert.equal(stats.points.home, 0);
  // Los tres se ejecutaron: de esta resta sale la efectividad, sin que nadie
  // tenga que cargar un evento "corner fallado" aparte.
  assert.equal(stats.penaltyCorners.home, 3);
  assert.equal(stats.penaltyCornerGoals.home, 0);
});

test('un corner sin desenlace cargado NO se cuenta como gol', () => {
  const stats = buildCompleteMatchStats([ev('penalty_corner', 'home')], map);

  assert.equal(stats.points.home, 0, 'un corner del que no se sabe como termino sumo un gol');
  assert.equal(stats.penaltyCorners.home, 1);
});

test('el penal stroke distingue gol, atajado y desviado', () => {
  const stats = buildCompleteMatchStats(
    [
      ev('penalty_stroke', 'away', formatOutcomeTag('goal')),
      ev('penalty_stroke', 'away', formatOutcomeTag('saved')),
      ev('penalty_stroke', 'away', formatOutcomeTag('wide')),
    ],
    map,
  );

  assert.equal(stats.points.away, 1);
  assert.equal(stats.penaltyStrokes.away, 3);
  assert.equal(stats.penaltyStrokeGoals.away, 1);
  assert.equal(stats.penaltyStrokesSaved.away, 1);
});

test('el marcador es la suma de las tres formas de convertir', () => {
  const stats = buildCompleteMatchStats(
    [
      ev('goal', 'home'),
      ev('goal', 'home'),
      ev('penalty_corner', 'home', formatOutcomeTag('goal')),
      ev('penalty_stroke', 'home', formatOutcomeTag('goal')),
      ev('penalty_corner', 'home', formatOutcomeTag('saved')),
    ],
    map,
  );

  assert.equal(stats.points.home, 4);
});

test('el shoot-out NO toca el marcador', () => {
  const stats = buildCompleteMatchStats(
    [
      ev('goal', 'home'),
      ev('goal', 'away'),
      ev('shootout_scored', 'home'),
      ev('shootout_scored', 'home'),
      ev('shootout_missed', 'away'),
    ],
    map,
  );

  // El resultado reglamentario queda 1-1: el shoot-out solo decide quien avanza.
  assert.equal(stats.points.home, 1);
  assert.equal(stats.points.away, 1);
  assert.equal(stats.shootoutScored.home, 2);
  assert.equal(stats.shootoutMissed.away, 1);
});

test('los eventos de shoot-out viven en su propia categoria', () => {
  for (const type of ['shootout_start', 'shootout_scored', 'shootout_missed', 'shootout_end']) {
    assert.equal(map[type]?.category, 'shootout', type);
    assert.equal(map[type]?.points, 0, `${type} suma puntos al marcador`);
  }
});

test('outcomeScores: sin desenlaces declarados el evento suma normal', () => {
  // El gol de jugada no tiene resultados: no hay nada que elegir.
  assert.equal(outcomeScores(map.goal, ''), true);
});
