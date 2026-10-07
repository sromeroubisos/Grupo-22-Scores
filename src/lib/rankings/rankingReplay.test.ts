import test from 'node:test';
import assert from 'node:assert/strict';

import {
  computeMatchExchange,
  computeWorldRugbyExchange,
  playoffStageWithBonus,
  rankByRating,
  replaySeason,
  resolvePlayoffStage,
} from './rankingReplay.ts';

const config = { home_advantage: 0, margin_threshold: 15, margin_multiplier: 1.5, event_multiplier: 1 };

/* ── la formula ─────────────────────────────────────────────────────────── */

test('el intercambio es suma cero y crece con lo que el resultado sorprende', () => {
  // El mas bajo gana: se lleva mas de un punto. El mas alto pierde lo mismo.
  const sorpresa = computeWorldRugbyExchange(config, 80, 84, { home: 30, away: 20 });
  assert.equal(sorpresa.homeDelta, 1.4);
  assert.equal(sorpresa.awayDelta, -1.4);

  // El mas alto gana lo esperado: se lleva menos de un punto.
  const esperado = computeWorldRugbyExchange(config, 84, 80, { home: 30, away: 20 });
  assert.equal(esperado.homeDelta, 0.6);
});

test('la brecha se acota a diez puntos: piso cero y techo dos, sin regla aparte', () => {
  assert.equal(computeWorldRugbyExchange(config, 90, 40, { home: 20, away: 10 }).homeDelta, 0);
  assert.equal(computeWorldRugbyExchange(config, 40, 90, { home: 20, away: 10 }).homeDelta, 2);
});

test('ganar por mas de quince multiplica por 1,5; el empate solo mueve la brecha', () => {
  assert.equal(computeWorldRugbyExchange(config, 80, 82, { home: 40, away: 10 }).homeDelta, 1.8);
  assert.equal(computeWorldRugbyExchange(config, 80, 82, { home: 20, away: 20 }).homeDelta, 0.2);
});

/* ── el bonus de playoff ────────────────────────────────────────────────── */

test('la instancia sale del nombre de la ronda dentro de una fase de eliminacion', () => {
  assert.equal(resolvePlayoffStage({ roundName: 'Cuartos de final', phaseName: 'Playoffs', phaseType: 'playoff' }), 'quarterfinal');
  assert.equal(resolvePlayoffStage({ roundName: 'Semifinal', phaseName: 'Playoff', phaseType: 'knockout' }), 'semifinal');
  assert.equal(resolvePlayoffStage({ roundName: 'Final', phaseName: 'Final', phaseType: 'playoff' }), 'final');
  assert.equal(resolvePlayoffStage({ roundName: 'Final · Copa Oro', phaseName: 'Playoffs', phaseType: 'playoff' }), 'final');

  // Lo que no paga: la fase regular, los octavos, el tercer puesto.
  assert.equal(resolvePlayoffStage({ roundName: 'Fecha 12', phaseName: 'Fase regular', phaseType: 'group_stage' }), null);
  assert.equal(resolvePlayoffStage({ roundName: 'Final', phaseName: 'Zona A', phaseType: 'league' }), null);
  assert.equal(resolvePlayoffStage({ roundName: 'Octavos de final', phaseName: 'Playoffs', phaseType: 'playoff' }), null);
  assert.equal(resolvePlayoffStage({ roundName: 'Tercer puesto', phaseName: 'Playoffs', phaseType: 'playoff' }), null);
  assert.equal(resolvePlayoffStage({ roundName: null, phaseName: 'Repechaje', phaseType: 'knockout' }), null);
});

test('el repechaje del TDI se llama "Cuartos de final" y no es un cuarto de final', () => {
  // Medido el 16/9/2026: el Torneo del Interior "A" tuvo 8 "Cuartos de final"
  // el 12/9, 4 de la fase Cuartos y 4 de la fase Repechaje. Solo pagan los 4.
  assert.equal(resolvePlayoffStage({ roundName: 'Cuartos de final', phaseName: 'Cuartos de Final', phaseType: 'playoff' }), 'quarterfinal');
  assert.equal(resolvePlayoffStage({ roundName: 'Cuartos de final', phaseName: 'Repechaje', phaseType: 'playoff' }), null);
  assert.equal(resolvePlayoffStage({ roundName: 'Cuartos de final', phaseName: 'Reválida', phaseType: 'playoff' }), null);
  // Las copas de consuelo tampoco: la final del torneo es una sola.
  assert.equal(resolvePlayoffStage({ roundName: 'Final · Copa Plata', phaseName: 'Playoffs', phaseType: 'playoff' }), null);
});

test('el bonus lo cobra solo el ganador, aparte del intercambio, y el perdedor no pierde nada mas', () => {
  const base = computeWorldRugbyExchange(config, 80, 84, { home: 30, away: 20 });
  const cuartos = computeMatchExchange(config, 80, 84, { home: 30, away: 20 }, 'quarterfinal');
  const semis = computeMatchExchange(config, 80, 84, { home: 30, away: 20 }, 'semifinal');

  assert.equal(cuartos.homeDelta, Number((base.homeDelta + 0.5).toFixed(4)));
  assert.equal(cuartos.awayDelta, base.awayDelta);
  assert.equal(semis.homeDelta, Number((base.homeDelta + 1.5).toFixed(4)));
  assert.equal(semis.awayDelta, base.awayDelta);

  // Gana la visita: el bonus va a la visita y el local queda con su intercambio.
  const baseVisita = computeWorldRugbyExchange(config, 80, 84, { home: 20, away: 30 });
  const final = computeMatchExchange(config, 80, 84, { home: 20, away: 30 }, 'final');
  assert.equal(final.awayDelta, Number((baseVisita.awayDelta + 2).toFixed(4)));
  assert.equal(final.homeDelta, baseVisita.homeDelta);
  assert.equal(final.metadata.playoffBonus, 2);
  assert.equal(final.metadata.playoffStage, 'final');
});

test('sin instancia o sin ganador no hay bonus: la cuenta sigue siendo suma cero', () => {
  const regular = computeMatchExchange(config, 80, 84, { home: 30, away: 20 }, null);
  assert.equal(Number((regular.homeDelta + regular.awayDelta).toFixed(4)), 0);
  assert.equal(regular.metadata.playoffBonus, 0);

  const empate = computeMatchExchange(config, 80, 84, { home: 20, away: 20 }, 'final');
  assert.equal(Number((empate.homeDelta + empate.awayDelta).toFixed(4)), 0);
  assert.equal(empate.metadata.playoffBonus, 0);
});

test('en la temporada reproducida la final paga sus dos puntos al campeon', () => {
  const partido = { id: 'f', date_time: '2026-09-12T18:30:00Z', home_club_id: 'belgrano', away_club_id: 'tilos', score: { home: 30, away: 20 } };
  const sinBonus = replaySeason({ entries, matches: [partido], adjustments: [], config });
  const conBonus = replaySeason({ entries, matches: [{ ...partido, stage: 'final' as const }], adjustments: [], config });

  assert.equal(Number((conBonus.ratings.get('belgrano')! - sinBonus.ratings.get('belgrano')!).toFixed(4)), 2);
  assert.equal(conBonus.ratings.get('tilos'), sinBonus.ratings.get('tilos'));
});

/* ── la temporada reproducida ───────────────────────────────────────────── */

const entries = [
  { club_id: 'belgrano', initial_rating: '86.25' },
  { club_id: 'regatas', initial_rating: 80 },
  { club_id: 'rosario', initial_rating: 70 },
  { club_id: 'tilos', initial_rating: 84 },
];

// Tres fines de semana seguidos. La semana del ranking arranca el martes 15/9
// y su referencia es la tabla del martes 8/9 (03:00Z): solo el ultimo partido
// es "de esta semana".
const matches = [
  { id: 'm3', date_time: '2026-09-12T18:30:00Z', home_club_id: 'belgrano', away_club_id: 'tilos', score: { home: 30, away: 40 } },
  { id: 'm1', date_time: '2026-08-29T18:30:00Z', home_club_id: 'belgrano', away_club_id: 'regatas', score: { home: 8, away: 26 } },
  { id: 'm2', date_time: '2026-09-05T18:30:00Z', home_club_id: 'rosario', away_club_id: 'belgrano', score: { home: 35, away: 33 } },
];

test('la referencia cortada en el martes deja afuera el fin de semana de esta semana', () => {
  const hoy = replaySeason({ entries, matches, adjustments: [], config });
  const referencia = replaySeason({ entries, matches, adjustments: [], config, until: '2026-09-08T03:00:00.000Z' });

  assert.equal(hoy.applied, 3);
  assert.equal(referencia.applied, 2);

  // La variacion de la semana es SOLO el partido con Los Tilos, y es suma cero.
  const belgrano = hoy.ratings.get('belgrano')! - referencia.ratings.get('belgrano')!;
  const tilos = hoy.ratings.get('tilos')! - referencia.ratings.get('tilos')!;
  assert.ok(Math.abs(belgrano) < 1, `un partido perdido por diez no puede valer ${belgrano}`);
  assert.equal(Number((belgrano + tilos).toFixed(4)), 0);

  // Y contra el inicio de temporada si se ve todo lo acumulado: ese es el bug
  // que se corrigio, no la variacion semanal.
  assert.ok(hoy.ratings.get('belgrano')! < 86.25 - 4);
});

test('los partidos entran en orden cronologico aunque lleguen desordenados', () => {
  const desordenado = replaySeason({ entries, matches, adjustments: [], config });
  const ordenado = replaySeason({ entries, matches: [matches[1], matches[2], matches[0]], adjustments: [], config });
  assert.deepEqual([...desordenado.ratings], [...ordenado.ratings]);
  assert.equal(desordenado.lastMatchByClub.get('belgrano'), 'm3');
  assert.equal(desordenado.lastMatchByClub.get('rosario'), 'm2');
});

test('un ajuste manual se ve una sola vez: la semana en que se cargo', () => {
  // Cargado el miercoles 9/9: entra en la tabla del martes 15 y no en la
  // referencia (martes 8); la semana siguiente ya esta en las dos.
  const ajuste = { club_id: 'regatas', mode: 'delta' as const, value: 2.5, created_at: '2026-09-09T12:00:00Z' };

  const hoy = replaySeason({ entries, matches, adjustments: [ajuste], config });
  const estaSemana = replaySeason({ entries, matches, adjustments: [ajuste], config, until: '2026-09-08T03:00:00.000Z' });
  const semanaQueViene = replaySeason({ entries, matches, adjustments: [ajuste], config, until: '2026-09-15T03:00:00.000Z' });

  assert.equal(hoy.adjustments.length, 1);
  assert.equal(hoy.adjustments[0].resulting_rating, hoy.ratings.get('regatas'));
  // Esta semana la referencia no lo tiene: aparece como +2,5.
  assert.equal(Number((hoy.ratings.get('regatas')! - estaSemana.ratings.get('regatas')!).toFixed(4)), 2.5);
  // La semana que viene ya esta en las dos cuentas: no vuelve a aparecer.
  assert.equal(semanaQueViene.ratings.get('regatas'), hoy.ratings.get('regatas'));
});

test('un club que no esta en la tabla no mueve a nadie', () => {
  const ajeno = { id: 'x', date_time: '2026-09-05T18:30:00Z', home_club_id: 'belgrano', away_club_id: 'hockey', score: { home: 1, away: 2 } };
  const con = replaySeason({ entries, matches: [ajeno], adjustments: [], config });
  assert.equal(con.applied, 0);
  assert.equal(con.ratings.get('belgrano'), 86.25);
});

test('los puestos salen del puntaje, y a igual puntaje por nombre', () => {
  const puestos = rankByRating(new Map([['b', 80], ['a', 80], ['c', 90]]), (id) => id.toUpperCase());
  assert.deepEqual([...puestos], [['c', 1], ['a', 2], ['b', 3]]);
});

test('el bonus no paga hacia atras: los playoffs previos al 7/10/2026 se premiaron a mano', () => {
  // La final del TDI "A" (Tala 34-20 Jockey Rosario, 3/10) ya cobro su +3 manual.
  assert.equal(playoffStageWithBonus('final', '2026-10-03T19:00:00Z'), null);
  // Martes 6/10 23:59 de Argentina: todavia no rige.
  assert.equal(playoffStageWithBonus('semifinal', '2026-10-07T02:59:00Z'), null);
  assert.equal(playoffStageWithBonus('semifinal', '2026-10-07T03:00:00Z'), 'semifinal');
  assert.equal(playoffStageWithBonus('final', '2026-11-14T18:00:00Z'), 'final');
  assert.equal(playoffStageWithBonus(null, '2026-11-14T18:00:00Z'), null);
  assert.equal(playoffStageWithBonus('final', null), null);
});
