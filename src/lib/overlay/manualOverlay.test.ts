import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyClockAction,
  applyScoreAction,
  currentHeadline,
  defaultManualState,
  manualElapsed,
  manualToOverlayMatch,
  mergeManualState,
  parseClockAction,
  parseScoreAction,
  type ManualHeadlineState,
  type ManualScoreState,
} from './manualOverlay.ts';
import { newPlates, overlayClock, teamCards } from './matchOverlayModel.ts';

const T0 = Date.parse('2026-11-28T19:00:00Z');

test('el reloj corre con la hora del servidor, se pausa, se fija y se corrige', () => {
  let state = defaultManualState('marcador');
  state = applyClockAction(state, 'start', T0);
  assert.equal(manualElapsed(state.clock, T0 + 65_000), 65);
  state = applyClockAction(state, 'pause', T0 + 65_000);
  assert.equal(manualElapsed(state.clock, T0 + 999_000), 65);
  state = applyClockAction(state, { adjust: 60 }, T0 + 999_000);
  assert.equal(manualElapsed(state.clock, T0 + 999_000), 125);
  state = applyClockAction(state, { adjust: -10 }, T0 + 999_000);
  assert.equal(manualElapsed(state.clock, T0 + 999_000), 115);
  state = applyClockAction(state, 'start', T0 + 1_000_000);
  state = applyClockAction(state, { set: 40 * 60 }, T0 + 1_010_000);
  assert.equal(manualElapsed(state.clock, T0 + 1_020_000), 40 * 60 + 10);
  state = applyClockAction(state, 'reset', T0 + 1_030_000);
  assert.equal(manualElapsed(state.clock, T0 + 2_000_000), 0);
});

test('anotar suma los puntos del deporte, guarda quién y sale como placa', () => {
  let state: ManualScoreState = { ...defaultManualState('marcador'), status: 'vivo' };
  state = applyClockAction(state, 'start', T0);
  state = applyScoreAction(state, { event: { team: 'home', type: 'try', player: '10 Juan Pérez' } }, T0 + 12 * 60_000);
  state = applyScoreAction(state, { event: { team: 'home', type: 'conversion', player: '10 Juan Pérez' } }, T0 + 13 * 60_000);
  assert.equal(state.home.score, 7);
  assert.equal(state.events[0].at, 12 * 60);

  const match = manualToOverlayMatch('m', state, 0);
  const plates = newPlates(match.events, new Set(), { substitutions: false });
  assert.deepEqual(plates.map((plate) => [plate.title, plate.player, plate.minute]), [
    ['TRY', '10 Juan Pérez', 13],
    ['CONVERSIÓN', '10 Juan Pérez', 14],
  ]);
});

test('deshacer resta lo que sumó; un tipo que no es del deporte no suma', () => {
  let state = defaultManualState('marcador');
  state = applyScoreAction(state, { event: { team: 'away', type: 'penalty_goal' } }, T0);
  state = applyScoreAction(state, { event: { team: 'away', type: 'goal' } }, T0);
  assert.equal(state.away.score, 3);
  state = applyScoreAction(state, { undo: true }, T0);
  assert.equal(state.away.score, 0);
  assert.equal(state.events.length, 0);
});

test('las tarjetas son eventos: la amarilla abre su sin-bin', () => {
  let state: ManualScoreState = { ...defaultManualState('marcador'), status: 'vivo' };
  state = applyClockAction(state, 'start', T0);
  state = applyScoreAction(state, { event: { team: 'away', type: 'yellow_card', player: '7 Díaz' } }, T0 + 60_000);
  const cards = teamCards(manualToOverlayMatch('m', state, 0), T0 + 4 * 60_000);
  assert.equal(cards.away.yellow, 1);
  assert.deepEqual(cards.away.sinBins, [600 - 180]);
});

test('el reloj manual se pone en rojo al llegar al minuto en que termina el período', () => {
  let state: ManualScoreState = { ...defaultManualState('marcador'), status: 'vivo', period: '1T' };
  state = applyClockAction(state, 'start', T0);
  const match = manualToOverlayMatch('m', state, 0);
  assert.equal(overlayClock(match, T0 + 39 * 60_000).expired, false);
  assert.equal(overlayClock(match, T0 + 40 * 60_000).expired, true);
});

test('lo que manda el panel se sanea y no puede tocar el reloj ni los eventos', () => {
  const next = mergeManualState('marcador', defaultManualState('marcador'), {
    home: { score: 12, name: 'Club Atlético', players: ['10 Juan Pérez', '', '9 Tomás'] },
    away: { color: 'no-es-un-color', logo: 'javascript:alert(1)' },
    status: 'cualquiera',
    sport: 'cricket',
    clock: { running: true },
    events: [{ id: 'x', type: 'try', team: 'home', at: 0, points: 50 }],
  }) as ManualScoreState;
  assert.equal(next.home.score, 12);
  assert.deepEqual(next.home.players, ['10 Juan Pérez', '9 Tomás']);
  assert.equal(next.away.color, null);
  assert.equal(next.away.logo, null);
  assert.equal(next.status, 'previa');
  assert.equal(next.sport, 'rugby');
  assert.equal(next.clock.running, false);
  assert.equal(next.events.length, 0);
});

test('las acciones se reconocen', () => {
  assert.equal(parseClockAction('start'), 'start');
  assert.deepEqual(parseClockAction({ set: 90 }), { set: 90 });
  assert.deepEqual(parseClockAction({ adjust: -10 }), { adjust: -10 });
  assert.equal(parseClockAction('borrar-todo'), null);
  assert.deepEqual(parseScoreAction({ event: { team: 'home', type: 'try', player: 'X' } }), { event: { team: 'home', type: 'try', player: 'X' } });
  assert.deepEqual(parseScoreAction({ undo: true }), { undo: true });
  assert.equal(parseScoreAction({ event: { team: 'otro', type: 'try' } }), null);
});

test('titulares: varios, con rotación por reloj del servidor, y las filas viejas se migran', () => {
  const state: ManualHeadlineState = {
    ...defaultManualState('titular'),
    items: [
      { id: 'a', kicker: '', title: 'Uno', subtitle: '' },
      { id: 'b', kicker: '', title: 'Dos', subtitle: '' },
      { id: 'c', kicker: '', title: 'Tres', subtitle: '' },
    ],
    current: 1,
  };
  assert.equal(currentHeadline(state, T0).item.title, 'Dos');
  const rotating = { ...state, rotate: 10 };
  const first = currentHeadline(rotating, 30_000).index;
  assert.equal(currentHeadline(rotating, 40_000).index, (first + 1) % 3);

  const legacy = mergeManualState('titular', { kicker: 'VIEJO', title: 'Titular de antes', subtitle: '', style: 'zocalo' }, {}) as ManualHeadlineState;
  assert.equal(legacy.items[0].title, 'Titular de antes');
  assert.equal(legacy.style, 'noticiero');
});
