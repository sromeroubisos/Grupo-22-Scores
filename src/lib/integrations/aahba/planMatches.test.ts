import test from 'node:test';
import assert from 'node:assert/strict';

import type { PartidoCrudo } from './client.ts';
import { planAahbaMatches, horarioIso, type ExistenteAahba } from './planMatches.ts';
import { claveDeNombre } from './nombres.ts';

const AHORA = new Date('2026-09-22T12:00:00-03:00');

const partido = (over: Partial<PartidoCrudo> = {}): PartidoCrudo => ({
  id: '00204173',
  idClubLocal: '00000019',
  idClubVisitante: '00000003',
  nombreLocal: 'S.A.G. ',
  nombreVisitante: 'SAN MARTÍN ',
  golesLocal: '3',
  golesVisitante: '2',
  golesPenalLocal: '0',
  golesPenalVisitante: '0',
  horario: '2026/09/20 16:00:00',
  numeroFecha: '20',
  played: true,
  playing: false,
  presenteLocal: true,
  presenteVisitante: true,
  isGhostMatch: false,
  campoJuegoNombre: 'S.A.G.',
  arbitros: 'Alvarez, Alan / Diaz, Silvana',
  ...over,
});

const fila = (over: Partial<ExistenteAahba> = {}): ExistenteAahba => ({
  id: 'fila-1',
  external_id: null,
  home_club_id: 'sag',
  away_club_id: 'san-martin-caballeros',
  date_time: '2026-09-20T16:00:00-03:00',
  status: 'scheduled',
  score: { home: 0, away: 0 },
  phase_id: 'fase-1',
  round_label: null,
  venue: 'Cancha 1.',
  referee: null,
  ...over,
});

/**
 * El alias se arma con la misma `claveDeNombre` que usa el plan, a propósito:
 * "S.A.G." normaliza a `s a g` y no a `sag`, y un mapa escrito a mano acá se
 * desfasaría del que arma el cron sin que ningún test lo note.
 */
const NOMBRES: Record<string, string> = {
  'S.A.G.': 'sag',
  'SAN MARTÍN': 'san-martin-caballeros',
  QUILMES: 'quilmes-a-c-caballeros',
};
const porClave = new Map(Object.entries(NOMBRES).map(([n, id]) => [claveDeNombre(n), id]));
const resolver = (clave: string) => porClave.get(clave) ?? null;

const plan = (p: PartidoCrudo, existentes: ExistenteAahba[], ahora = AHORA) =>
  planAahbaMatches({ partidos: [p], existentes, resolverClub: resolver, ahora });

/* ── el horario de la fuente ───────────────────────────────────────────── */

test('el horario viene en hora de Buenos Aires, que no tiene horario de verano', () => {
  assert.equal(horarioIso('2026/03/08 16:00:00'), '2026-03-08T16:00:00-03:00');
});

test('un horario con otra forma no se adivina: es null y el partido se omite', () => {
  assert.equal(horarioIso('08/03/2026'), null);
  const r = plan(partido({ horario: '08/03/2026' }), []);
  assert.equal(r.omitidos[0]?.motivo, 'horario_ilegible');
  assert.equal(r.crear.length, 0);
});

/* ── la regla de los tres días ─────────────────────────────────────────── */

/**
 * El caso que la motivó: la base tenía siete partidos de Caballeros con fecha
 * 19/7 todavía en `scheduled`, y la pantalla del torneo los ofrecía como "el
 * próximo partido" dos meses después.
 */
test('una fecha que pasó hace más de tres días sin resultado queda postergada', () => {
  const r = plan(partido({ played: false, horario: '2026/09/10 16:00:00' }), [fila({ date_time: '2026-09-10T16:00:00-03:00' })]);
  assert.equal(r.actualizar[0]?.patch.status, 'postponed');
});

/**
 * La AAHBA carga las planillas con atraso: un lunes a la mañana el partido del
 * sábado todavía no es una postergación, es una planilla que no llegó.
 */
test('el partido de anteayer sigue programado: tres días, no uno', () => {
  const r = plan(partido({ played: false, horario: '2026/09/20 16:00:00' }), [fila()]);
  assert.equal(r.actualizar.find((c) => 'status' in c.patch), undefined);
});

/**
 * El olvido de ARUSA: un estado al que solo se entra deja la ficha mintiendo
 * para siempre. Si la asociación reprograma, el partido vuelve a programado.
 */
test('un postergado que la AAHBA reprograma a futuro vuelve a scheduled', () => {
  const r = plan(
    partido({ played: false, horario: '2026/10/11 16:00:00' }),
    [fila({ status: 'postponed', date_time: '2026-09-10T16:00:00-03:00' })],
  );
  assert.equal(r.actualizar[0]?.patch.status, 'scheduled');
});

/* ── el marcador ───────────────────────────────────────────────────────── */

test('un partido sin jugar no tiene marcador: es null, no 0 a 0', () => {
  const r = plan(partido({ played: false, horario: '2026/10/11 16:00:00' }), [fila()]);
  assert.equal(r.actualizar[0]?.patch.score, null);
});

test('un jugado cierra en final con los puntos de hockey, 3 y 0', () => {
  const r = plan(partido(), [fila()]);
  const patch = r.actualizar[0]?.patch;
  assert.equal(patch?.status, 'final');
  assert.deepEqual(patch?.score, { home: 3, away: 2 });
  assert.equal(patch?.home_base_points, 3);
  assert.equal(patch?.away_base_points, 0);
});

/**
 * Al revés que el resto de los conectores de la casa, y a propósito: había diez
 * finales cargados con otro marcador que el de la planilla oficial. La fuente
 * gana, pero la corrección se reporta — pisar en silencio sería peor que el
 * error.
 */
test('un final que la fuente contradice se pisa Y se reporta', () => {
  const r = plan(partido(), [fila({ status: 'final', score: { home: 3, away: 1 } })]);
  assert.deepEqual(r.actualizar[0]?.patch.score, { home: 3, away: 2 });
  assert.equal(r.correcciones.length, 1);
  assert.match(r.correcciones[0], /estaba 3-1.*3-2/);
});

/* ── la identidad y la adopción ────────────────────────────────────────── */

test('una fila cargada a mano se adopta por el par ordenado, no se duplica', () => {
  const r = plan(partido(), [fila()]);
  assert.equal(r.crear.length, 0);
  assert.equal(r.actualizar[0]?.patch.external_id, 'aahba:m00204173');
  assert.ok(r.actualizar[0]?.cambios.includes('adoptado'));
});

/**
 * El par se invierte y deja de ser el mismo partido: S.A.G. de local es la
 * fecha 1 y de visitante es la 14. Adoptar por par sin orden los cruzaría.
 */
test('el par invertido no se adopta: es el otro partido del cruce', () => {
  const r = plan(partido(), [fila({ home_club_id: 'san-martin-caballeros', away_club_id: 'sag' })]);
  assert.equal(r.crear.length, 1);
  assert.equal(r.crear[0]?.external_id, 'aahba:m00204173');
});

/**
 * Dos filas con el mismo par significa que el fixture se cargó mal. Elegir una
 * al azar sería pisar el partido equivocado; esto lo mira una persona.
 */
test('un par duplicado en la base no se adivina: se omite y se reporta', () => {
  const r = plan(partido(), [fila({ id: 'a' }), fila({ id: 'b' })]);
  assert.equal(r.omitidos[0]?.motivo, 'par_ambiguo');
  assert.equal(r.crear.length, 0);
  assert.equal(r.actualizar.length, 0);
});

test('con external_id ya puesto, el par no se usa: manda el id de la fuente', () => {
  const r = plan(
    partido(),
    [fila({ id: 'vieja', external_id: 'aahba:m00204173', home_club_id: 'quilmes-a-c-caballeros', away_club_id: 'sag' })],
  );
  assert.equal(r.actualizar[0]?.id, 'vieja');
  assert.equal(r.crear.length, 0);
});

/* ── los equipos que no resuelven ──────────────────────────────────────── */

/**
 * En Caballeros A el id de club 00000009 es CIUDAD y CIUDAD B a la vez, así
 * que el alias se resuelve por nombre. Un nombre desconocido es una fila de
 * alias, no un deploy: se reporta y no se escribe nada.
 */
test('un equipo que no resuelve no se escribe: se reporta', () => {
  const r = plan(partido({ nombreVisitante: 'CIUDAD B' }), []);
  assert.equal(r.omitidos[0]?.motivo, 'equipo_no_resuelto');
  assert.match(r.omitidos[0]?.detalle ?? '', /CIUDAD B/);
  assert.equal(r.crear.length, 0);
});

/* ── lo que el plan completa además del resultado ──────────────────────── */

test('la cancha de relleno y la fecha sin rótulo se completan con lo de la fuente', () => {
  const r = plan(partido(), [fila()]);
  const patch = r.actualizar[0]?.patch;
  assert.equal(patch?.venue, 'S.A.G.');
  assert.equal(patch?.round_label, 'Fecha 20');
  assert.equal(patch?.referee, 'Alvarez, Alan / Diaz, Silvana');
});

test('sin novedades no hay parche', () => {
  const r = plan(partido(), [fila({
    external_id: 'aahba:m00204173', status: 'final', score: { home: 3, away: 2 },
    round_label: 'Fecha 20', venue: 'S.A.G.', referee: 'Alvarez, Alan / Diaz, Silvana',
  })]);
  assert.equal(r.actualizar.length, 0);
  assert.equal(r.sinCambios, 1);
});

/**
 * Un walkover es un resultado válido, pero conviene que alguien lo mire: la
 * asociación a veces lo corrige después.
 */
test('un jugado sin uno de los equipos presente se reporta igual', () => {
  const r = plan(partido({ presenteVisitante: false }), [fila()]);
  assert.equal(r.sinPresentacion.length, 1);
  assert.equal(r.actualizar[0]?.patch.status, 'final');
});
