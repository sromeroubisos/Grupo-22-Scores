import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_GAMES,
  applyClockAction,
  applyGameAction,
  applyScoreAction,
  currentHeadline,
  defaultManualState,
  manualElapsed,
  manualToOverlayMatch,
  mergeManualState,
  parseClockAction,
  parseGameAction,
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

test('varios partidos en un marcador: se cargan, se pasan al aire y cada uno guarda lo suyo', () => {
  let state = defaultManualState('marcador');
  state = mergeManualState('marcador', state, { home: { name: 'Pucará' }, away: { name: 'Hindú' } }) as ManualScoreState;
  state = applyClockAction(state, 'start', T0);
  state = applyScoreAction(state, { event: { team: 'home', type: 'try', player: null } }, T0 + 60_000);
  assert.equal(state.home.score, 5);

  state = applyGameAction(state, parseGameAction({ add: { home: { name: 'CASI' }, away: { name: 'SIC', color: '#112233' } } })!, T0 + 61_000);
  assert.equal(state.queue.length, 1);
  const second = state.queue[0];
  assert.equal(second.away.color, '#112233');
  assert.equal(second.home.short, 'CAS');
  assert.equal(second.home.score, 0);

  // Pasar al segundo: el primero queda en la fila, con su resultado y el reloj PARADO donde iba.
  state = applyGameAction(state, { switch: second.id }, T0 + 120_000);
  assert.equal(state.gameId, second.id);
  assert.equal(state.home.name, 'CASI');
  assert.equal(state.home.score, 0);
  assert.equal(state.shot, null);
  const first = state.queue[0];
  assert.equal(first.home.name, 'Pucará');
  assert.equal(first.home.score, 5);
  assert.equal(first.clock.running, false);
  assert.equal(first.clock.base, 120);

  // Volver: queda como estaba.
  state = applyGameAction(state, { switch: first.id }, T0 + 200_000);
  assert.equal(state.home.score, 5);
  assert.equal(manualElapsed(state.clock, T0 + 900_000), 120);
  assert.equal(state.queue[0].home.name, 'CASI');

  // Sobrevive al guardado (JSON) y al saneo.
  const reread = mergeManualState('marcador', JSON.parse(JSON.stringify(state)), {}) as ManualScoreState;
  assert.deepEqual(reread.queue, state.queue);
  assert.equal(reread.gameId, state.gameId);
  // El estado del panel no puede tocar la fila.
  const tampered = mergeManualState('marcador', state, { queue: [], gameId: 'x' }) as ManualScoreState;
  assert.equal(tampered.queue.length, 1);
  assert.equal(tampered.gameId, state.gameId);

  state = applyGameAction(state, { remove: state.queue[0].id }, T0);
  assert.equal(state.queue.length, 0);
  assert.equal(manualToOverlayMatch('m', state, 0).manual?.gameId, state.gameId);
});

test('una fila vieja (sin partidos) se lee con uno solo, y hay tope de partidos', () => {
  const legacy = mergeManualState('marcador', { home: { name: 'A' } }, {}) as ManualScoreState;
  assert.equal(legacy.gameId, 'g1');
  assert.deepEqual(legacy.queue, []);
  let state = legacy;
  for (let i = 0; i < MAX_GAMES + 3; i += 1) state = applyGameAction(state, { add: {} }, T0 + i);
  assert.equal(state.queue.length, MAX_GAMES - 1);
  assert.equal(new Set(state.queue.map((game) => game.id)).size, MAX_GAMES - 1);
});

/* ─── puntos de G22 con corrección a mano ─── */

test('vinculado a G22: sin corrección muestra G22; corregido, manda lo cargado hasta que G22 cambia', async () => {
  const { rebaseOnG22, resolveLinkedScore } = await import('./manualOverlay.ts');
  const linked = mergeManualState('marcador', defaultManualState('marcador'), { link: { matchId: 'abc-123' } }) as ManualScoreState;
  assert.deepEqual(linked.link, { matchId: 'abc-123', seen: null });
  assert.equal(resolveLinkedScore(linked, { home: 7, away: 3 }).home, 7);
  assert.equal(resolveLinkedScore(linked, { home: 7, away: 3 }).source, 'g22');

  // G22 viene atrasado: el operador carga un try encima de lo que se ve (7-3).
  const corrected = applyScoreAction(rebaseOnG22(linked, { home: 7, away: 3 }), { event: { team: 'home', type: 'try' } }, 1000);
  assert.deepEqual(corrected.link?.seen, { home: 7, away: 3 });
  const shown = resolveLinkedScore(corrected, { home: 7, away: 3 });
  assert.deepEqual([shown.home, shown.away, shown.source], [12, 3, 'corregido']);

  // G22 se pone al día: vuelve a mandar G22.
  const caught = resolveLinkedScore(corrected, { home: 12, away: 3 });
  assert.deepEqual([caught.home, caught.away, caught.source], [12, 3, 'g22']);

  // Corregir otra vez parte de lo que se ve, no de lo viejo cargado a mano.
  const again = applyScoreAction(rebaseOnG22(corrected, { home: 14, away: 3 }), { event: { team: 'away', type: 'penalty_goal' } }, 2000);
  const after = resolveLinkedScore(again, { home: 14, away: 3 });
  assert.deepEqual([after.home, after.away], [14, 6]);
});

test('vínculo: null lo saca, otro partido arranca sin corrección y viaja con su partido en la fila', () => {
  const base = mergeManualState('marcador', defaultManualState('marcador'), { link: { matchId: 'm1', seen: { home: 1, away: 2 } } }) as ManualScoreState;
  assert.deepEqual(base.link, { matchId: 'm1', seen: { home: 1, away: 2 } });
  const other = mergeManualState('marcador', base, { link: { matchId: 'm2' } }) as ManualScoreState;
  assert.deepEqual(other.link, { matchId: 'm2', seen: null });
  const follow = mergeManualState('marcador', base, { link: { seen: null } }) as ManualScoreState;
  assert.deepEqual(follow.link, { matchId: 'm1', seen: null });
  assert.equal((mergeManualState('marcador', base, { link: null }) as ManualScoreState).link, null);
  assert.equal((mergeManualState('marcador', base, { link: { matchId: 'no válido!' } }) as ManualScoreState).link, null);

  const added = applyGameAction(base, { add: { home: { name: 'Otro' } } }, 1000);
  const switched = applyGameAction(added, { switch: added.queue[0].id }, 2000);
  assert.equal(switched.link, null);
  assert.equal(switched.queue.at(-1)?.link?.matchId, 'm1');
  const back = applyGameAction(switched, { switch: switched.queue.at(-1)!.id }, 3000);
  assert.equal(back.link?.matchId, 'm1');
});
