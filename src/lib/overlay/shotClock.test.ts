import test from 'node:test';
import assert from 'node:assert/strict';

import {
  pauseShot,
  readShotClock,
  resumeShot,
  shotFromFreshEvents,
  shotView,
  startShot,
  SHOT_LINGER_MS,
} from './shotClock.ts';
import { applyScoreAction, applyShotAction, defaultManualState, mergeManualState } from './manualOverlay.ts';

const NOW = Date.parse('2026-11-26T20:00:00.000Z');

test('la cuenta baja, se pone urgente en los últimos 10 y se va sola al rato de llegar a cero', () => {
  const shot = startShot(NOW, { label: 'conversión', seconds: 90, team: 'home' });
  assert.equal(shot.label, 'CONVERSIÓN');
  // Al aire dice SHOT CLOCK, se haya guardado con el nombre que sea.
  assert.deepEqual(shotView(shot, NOW), { label: 'SHOT CLOCK', time: '1:30', progress: 1, urgent: false, done: false, paused: false, team: 'home' });
  assert.equal(shotView(shot, NOW + 18_500)?.time, '1:12');
  assert.equal(shotView(shot, NOW + 81_000)?.urgent, true);
  assert.equal(shotView(shot, NOW + 90_000)?.done, true);
  assert.equal(shotView(shot, NOW + 90_000 + SHOT_LINGER_MS + 1), null);
});

test('pausar congela lo que falta y seguir lo retoma desde ahí', () => {
  const paused = pauseShot(startShot(NOW, { label: 'TMO', seconds: 60 }), NOW + 20_000);
  assert.equal(paused.pausedLeft, 40);
  assert.equal(shotView(paused, NOW + 999_000)?.time, '0:40');
  const resumed = resumeShot(paused, NOW + 100_000);
  assert.equal(shotView(resumed, NOW + 110_000)?.time, '0:30');
  assert.deepEqual(readShotClock(JSON.parse(JSON.stringify(paused))), paused);
  assert.equal(readShotClock({ seconds: 0 }), null);
  assert.equal(readShotClock('basura'), null);
});

test('en un partido de G22, el try arranca la conversión y la conversión la cierra', () => {
  const after = shotFromFreshEvents(null, [{ id: 'e1', type: 'try', team: 'away' }], NOW, 90);
  assert.equal(after?.team, 'away');
  assert.equal(shotFromFreshEvents(after, [{ id: 'e2', type: 'conversion', team: 'away' }], NOW, 90), null);
  assert.equal(shotFromFreshEvents(null, [{ id: 'e1', type: 'try', team: 'away' }], NOW, 0), null);
  // Una puesta a mano no la cierra la conversión; una vieja de "CONVERSIÓN", sí.
  const manual = startShot(NOW, { label: 'SHOT CLOCK', seconds: 60 });
  assert.equal(shotFromFreshEvents(manual, [{ id: 'e3', type: 'conversion', team: 'home' }], NOW, 60), manual);
  const legacy = startShot(NOW, { label: 'CONVERSIÓN', seconds: 90 });
  assert.equal(shotFromFreshEvents(legacy, [{ id: 'e4', type: 'conversion', team: 'home' }], NOW, 60), null);
});

test('marcador manual: try con conversión automática, deshacer y cuenta propia', () => {
  let state = defaultManualState('marcador');
  assert.equal(state.autoShot, 60);
  state = applyScoreAction(state, { event: { team: 'home', type: 'try' } }, NOW);
  assert.equal(state.shot?.label, 'SHOT CLOCK');
  assert.equal(shotView(state.shot, NOW)?.time, '1:00');
  assert.equal(state.shot?.team, 'home');
  // Deshacer el try saca la cuenta.
  assert.equal(applyScoreAction(state, { undo: true }, NOW + 1000).shot, null);
  // La conversión la cierra.
  assert.equal(applyScoreAction(state, { event: { team: 'home', type: 'conversion' } }, NOW + 30_000).shot, null);
  // Apagada: el try no arranca nada.
  const off = mergeManualState('marcador', defaultManualState('marcador'), { autoShot: 0 });
  assert.equal(applyScoreAction(off as typeof state, { event: { team: 'home', type: 'try' } }, NOW).shot, null);
  // Una propia, desde el panel.
  const own = applyShotAction(state, { start: { label: 'Tiempo médico', seconds: 120, team: null } }, NOW);
  assert.equal(shotView(own.shot, NOW)?.time, '2:00');
  assert.equal(applyShotAction(own, 'stop', NOW).shot, null);
  // El estado guardado la conserva.
  const saved = mergeManualState('marcador', JSON.parse(JSON.stringify(own)), {});
  assert.deepEqual((saved as typeof state).shot, own.shot);
});
