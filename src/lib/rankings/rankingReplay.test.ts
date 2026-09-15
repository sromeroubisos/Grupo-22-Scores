import test from 'node:test';
import assert from 'node:assert/strict';

import { computeWorldRugbyExchange, rankByRating, replaySeason } from './rankingReplay.ts';

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
