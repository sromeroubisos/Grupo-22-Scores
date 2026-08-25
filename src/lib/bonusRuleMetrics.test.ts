import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_OFFENSIVE_BONUS_THRESHOLD,
  describeOffensiveBonusRule,
  normalizeOffensiveBonusMode,
  resolveOffensiveBonusOutcome,
  resolveOffensiveBonusRule,
} from './bonusRuleMetrics.ts';

/**
 * En rugby conviven dos reglamentos para el mismo bonus por tries:
 *
 * - 4 tries anotados, sin mirar al rival (Six Nations, URBA).
 * - 3 tries más que el rival: 3-0, 4-1, 5-2 (World Rugby desde 2016, Super
 *   Rugby, Top 14, Rugby Championship).
 *
 * Son un MODO de la misma regla. Lo que se prueba acá es que la regla se lee
 * bien desde las formas guardadas y que la cuenta —una sola para todo el
 * sistema— distingue los dos modos en los partidos donde difieren.
 */

const rugby = (over: Record<string, unknown> = {}) =>
  resolveOffensiveBonusRule({ tries: 4, points: 1, ...over })!;

const rugbyDifference = (over: Record<string, unknown> = {}) =>
  resolveOffensiveBonusRule({ mode: 'difference', tries: 3, points: 1, ...over })!;

test('la forma guardada de siempre ({ tries: 4 }) sigue siendo "4 anotados"', () => {
  const rule = rugby();
  assert.equal(rule.mode, 'count');
  assert.equal(rule.threshold, 4);
  assert.equal(rule.eventType, 'try');
  assert.equal(rule.metric, 'event_count');
});

test('`true` es el clásico: 4 tries anotados, 1 punto', () => {
  const rule = resolveOffensiveBonusRule(true)!;
  assert.equal(rule.mode, 'count');
  assert.equal(rule.threshold, DEFAULT_OFFENSIVE_BONUS_THRESHOLD.count);
  assert.equal(rule.points, 1);
});

test('{ mode: "difference", tries: 3 } es "3 más que el rival"', () => {
  const rule = rugbyDifference();
  assert.equal(rule.mode, 'difference');
  assert.equal(rule.threshold, 3);
  assert.equal(rule.eventType, 'try', 'la unidad sigue saliendo de `tries`');
});

test('sin umbral, cada modo trae el suyo de fábrica: 4 anotados, 3 de diferencia', () => {
  assert.equal(resolveOffensiveBonusRule({ mode: 'count' })!.threshold, 4);
  assert.equal(resolveOffensiveBonusRule({ mode: 'difference' })!.threshold, 3);
});

test('el modo se lee con sinónimos y sin distinguir mayúsculas', () => {
  assert.equal(normalizeOffensiveBonusMode('Difference'), 'difference');
  assert.equal(normalizeOffensiveBonusMode('margin'), 'difference');
  assert.equal(normalizeOffensiveBonusMode('diferencia'), 'difference');
  assert.equal(normalizeOffensiveBonusMode('count'), 'count');
  assert.equal(normalizeOffensiveBonusMode('total'), 'count');
  assert.equal(normalizeOffensiveBonusMode('cualquier cosa'), null, 'lo desconocido no se adivina');
  assert.equal(normalizeOffensiveBonusMode(undefined), null);
});

test('la forma corta { triesDifference: 3 } se entiende como modo diferencia', () => {
  const rule = resolveOffensiveBonusRule({ triesDifference: 3, points: 1 })!;
  assert.equal(rule.mode, 'difference');
  assert.equal(rule.threshold, 3);
});

test('un modo explícito le gana a la forma corta', () => {
  const rule = resolveOffensiveBonusRule({ mode: 'count', tries: 4, triesDifference: 3 })!;
  assert.equal(rule.mode, 'count');
  assert.equal(rule.threshold, 4);
});

// ---------------------------------------------------------------------------
// La cuenta: los partidos donde los dos reglamentos se separan.
// ---------------------------------------------------------------------------

const score = (homeTries: number, awayTries: number) => ({
  home: homeTries * 7,
  away: awayTries * 7,
  homeTries,
  awayTries,
});

test('4 tries a 1: los dos reglamentos lo premian', () => {
  const s = score(4, 1);
  assert.equal(resolveOffensiveBonusOutcome(s, [], 'home', rugby()).fires, true);
  assert.equal(resolveOffensiveBonusOutcome(s, [], 'home', rugbyDifference()).fires, true);
  assert.equal(resolveOffensiveBonusOutcome(s, [], 'away', rugby()).fires, false);
  assert.equal(resolveOffensiveBonusOutcome(s, [], 'away', rugbyDifference()).fires, false);
});

test('3 tries a 0: sólo por diferencia (el clásico pide cuatro)', () => {
  const s = score(3, 0);
  assert.equal(resolveOffensiveBonusOutcome(s, [], 'home', rugby()).fires, false);
  const outcome = resolveOffensiveBonusOutcome(s, [], 'home', rugbyDifference());
  assert.equal(outcome.fires, true);
  assert.deepEqual({ own: outcome.own, opponent: outcome.opponent, value: outcome.value }, { own: 3, opponent: 0, value: 3 });
});

test('5 tries a 2: por diferencia sí, exactamente en el umbral', () => {
  assert.equal(resolveOffensiveBonusOutcome(score(5, 2), [], 'home', rugbyDifference()).fires, true);
});

test('4 tries a 2: sólo el clásico (dos de diferencia no alcanzan)', () => {
  const s = score(4, 2);
  assert.equal(resolveOffensiveBonusOutcome(s, [], 'home', rugby()).fires, true);
  assert.equal(resolveOffensiveBonusOutcome(s, [], 'home', rugbyDifference()).fires, false);
});

test('4 tries a 4: el clásico se lo da a los dos; por diferencia a ninguno', () => {
  const s = score(4, 4);
  assert.equal(resolveOffensiveBonusOutcome(s, [], 'home', rugby()).fires, true);
  assert.equal(resolveOffensiveBonusOutcome(s, [], 'away', rugby()).fires, true);
  assert.equal(resolveOffensiveBonusOutcome(s, [], 'home', rugbyDifference()).fires, false);
  assert.equal(resolveOffensiveBonusOutcome(s, [], 'away', rugbyDifference()).fires, false);
});

test('el que recibió más tries tiene diferencia negativa y no cobra', () => {
  const outcome = resolveOffensiveBonusOutcome(score(1, 4), [], 'home', rugbyDifference());
  assert.equal(outcome.value, -3);
  assert.equal(outcome.fires, false);
});

test('sin tries cargados no se inventa nada, en ningún modo', () => {
  const s = { home: 28, away: 7 };
  assert.equal(resolveOffensiveBonusOutcome(s, [], 'home', rugby()).fires, false);
  assert.equal(resolveOffensiveBonusOutcome(s, [], 'home', rugbyDifference()).fires, false);
});

test('por diferencia también cuenta desde los eventos cuando el marcador no trae tries', () => {
  const events = [
    { type: 'try', team: 'home' },
    { type: 'try', team: 'home' },
    { type: 'try', team: 'home' },
    { type: 'try', team: 'away' },
  ];
  const outcome = resolveOffensiveBonusOutcome({ home: 21, away: 7 }, events, 'home', rugbyDifference());
  assert.deepEqual({ own: outcome.own, opponent: outcome.opponent }, { own: 3, opponent: 1 });
  assert.equal(outcome.fires, false, 'dos de diferencia');
});

test('sin regla no hay bonus', () => {
  assert.equal(resolveOffensiveBonusOutcome(score(9, 0), [], 'home', null).fires, false);
});

// ---------------------------------------------------------------------------
// El rótulo: la misma frase en el creador, el gestor y el Match Center.
// ---------------------------------------------------------------------------

test('la regla se describe en el idioma del deporte', () => {
  assert.equal(describeOffensiveBonusRule(rugby()), '4+ tries');
  assert.equal(describeOffensiveBonusRule(rugbyDifference()), '3+ tries de diferencia');
  assert.equal(
    describeOffensiveBonusRule(resolveOffensiveBonusRule({ type: 'score', threshold: 4 })!),
    '4+ puntos',
  );
  assert.equal(
    describeOffensiveBonusRule(resolveOffensiveBonusRule({ type: 'goals', threshold: 3, mode: 'difference' })!),
    '3+ goles de diferencia',
  );
});
