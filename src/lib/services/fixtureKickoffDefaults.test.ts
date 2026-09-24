import test from 'node:test';
import assert from 'node:assert/strict';

import {
  readKickoffDefaults,
  sanitizeKickoffDefaults,
  suggestKickoff,
  withKickoffDefaults,
} from './fixtureKickoffDefaults.ts';

const DEFAULTS = sanitizeKickoffDefaults({
  source: 'home',
  tournamentTimes: ['15:30'],
  teamTimes: { tala: ['16:00', '14:00'], jockey: ['17:00'] },
});

test('local: sugiere el primer horario del local y ofrece el resto', () => {
  const suggestion = suggestKickoff(DEFAULTS, 'tala', 'jockey');
  assert.deepEqual(suggestion, { time: '16:00', origin: 'home', alternatives: ['14:00', '17:00', '15:30'] });
});

test('visitante: manda el horario del visitante', () => {
  const suggestion = suggestKickoff({ ...DEFAULTS, source: 'away' }, 'tala', 'jockey');
  assert.equal(suggestion?.time, '17:00');
  assert.equal(suggestion?.origin, 'away');
});

test('sin horario del club elegido cae al general, nunca al otro club', () => {
  const suggestion = suggestKickoff(DEFAULTS, 'crai', 'jockey');
  assert.equal(suggestion?.time, '15:30');
  assert.equal(suggestion?.origin, 'tournament');
});

test('general del torneo: ignora los horarios de los clubes', () => {
  const suggestion = suggestKickoff({ ...DEFAULTS, source: 'tournament' }, 'tala', 'jockey');
  assert.equal(suggestion?.time, '15:30');
});

test('sin nada cargado no hay sugerencia', () => {
  assert.equal(suggestKickoff(sanitizeKickoffDefaults(null), 'tala', 'jockey'), null);
});

test('saneo: horas inválidas y repetidas afuera, clubes ajenos afuera', () => {
  const clean = sanitizeKickoffDefaults(
    { source: 'nope', tournamentTimes: ['9:05', '25:00', '09:05', 'x'], teamTimes: { tala: ['16:00'], intruso: ['12:00'], vacio: [] } },
    new Set(['tala', 'vacio']),
  );
  assert.deepEqual(clean, { source: 'home', tournamentTimes: ['09:05'], teamTimes: { tala: ['16:00'] } });
});

test('guardar toca sólo su clave del ruleset', () => {
  const ruleset = { points: { win: 4 }, fixtureImport: { otra: true } };
  const next = withKickoffDefaults(ruleset, DEFAULTS);
  assert.deepEqual(next.points, { win: 4 });
  assert.equal((next.fixtureImport as Record<string, unknown>).otra, true);
  assert.deepEqual(readKickoffDefaults(next), DEFAULTS);
});
