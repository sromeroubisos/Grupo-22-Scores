import test from 'node:test';
import assert from 'node:assert/strict';

import { planTournamentMatches, type ExistenteHockey } from './planMatches.ts';
import { claveDeNombre } from './nombres.ts';
import type { SeccionDeFixture } from './fixture-parser.ts';

/**
 * El caso de fondo: el gestor ya tiene partidos cargados A MANO, con
 * `external_id` NULL. El plan tiene que adoptarlos —nunca duplicarlos— y
 * pisar lo mínimo: la identidad siempre, la agenda sólo si de verdad cambió,
 * el resultado nunca cuando la fila ya es final.
 */

const ALIAS = new Map<string, string>([
  [claveDeNombre('LA TABLADA "ROJO"'), 'la-tablada-roja'],
  [claveDeNombre('BARRIO PARQUE "VERDE"'), 'barrio-parque'],
  [claveDeNombre('JOCKEY VILLA MARIA'), 'jockey-villa-maria'],
  [claveDeNombre('PALERMO BAJO "B"'), 'palermo-bajo-b'],
]);
const resolver = (clave: string) => ALIAS.get(clave) ?? null;

const seccion = (dia: string, partidos: SeccionDeFixture['partidos']): SeccionDeFixture => ({
  torneo: 'COPA CÓRDOBA Damas 2026',
  slug: 'copa-cordoba-damas-2026',
  fase: 'Fase 2',
  fechaNro: null,
  dia,
  partidos,
});

const partido = (local: string, visitante: string, hora: string | null = '16:00') => ({
  division: '1', local, visitante, hora, cancha: 'LA TABLADA', arbitros: [],
});

const existente = (sobre: Partial<ExistenteHockey>): ExistenteHockey => ({
  id: 'm1',
  external_id: null,
  home_club_id: 'la-tablada-roja',
  away_club_id: 'barrio-parque',
  date_time: '2026-08-17T19:00:00+00:00',
  status: 'scheduled',
  score: null,
  phase_id: 'fase-uuid',
  ...sobre,
});

const plan = (sobre: Partial<Parameters<typeof planTournamentMatches>[0]>) =>
  planTournamentMatches({
    slug: 'copa-cordoba-damas-2026',
    secciones: [],
    division: '1',
    resultados: [],
    resolverClub: resolver,
    existentes: [],
    hoy: '2026-08-19',
    ...sobre,
  });

test('un partido del fixture sin fila previa se crea con identidad, agenda y cancha', () => {
  const p = plan({ secciones: [seccion('2026-08-17', [partido('LA TABLADA "ROJO"', 'BARRIO PARQUE "VERDE"')])] });
  assert.equal(p.crear.length, 1);
  assert.deepEqual(p.crear[0], {
    external_id: 'fedhockeycba:copa-cordoba-damas-2026:2026-08-17:la-tablada-roja~barrio-parque',
    home_club_id: 'la-tablada-roja',
    away_club_id: 'barrio-parque',
    date_time: '2026-08-17T16:00:00-03:00',
    status: 'scheduled',
    score: null,
    venue: 'LA TABLADA',
    round_label: 'Fase 2',
    points_autocalculated: false,
    home_base_points: 0,
    away_base_points: 0,
    home_bonus_points: 0,
    away_bonus_points: 0,
  });
});

test('la fila cargada a mano se ADOPTA: gana external_id y no se duplica', () => {
  // 19:00+00:00 y 16:00-03:00 son el MISMO instante: no hay cambio de agenda.
  const p = plan({
    secciones: [seccion('2026-08-17', [partido('LA TABLADA "ROJO"', 'BARRIO PARQUE "VERDE"')])],
    existentes: [existente({})],
  });
  assert.equal(p.crear.length, 0);
  assert.equal(p.actualizar.length, 1);
  assert.deepEqual(p.actualizar[0].cambios, ['external_id (adoptado)']);
  assert.equal(
    p.actualizar[0].patch.external_id,
    'fedhockeycba:copa-cordoba-damas-2026:2026-08-17:la-tablada-roja~barrio-parque',
  );
});

test('el par pendiente en otro día es una reprogramación, no un partido nuevo', () => {
  const p = plan({
    secciones: [seccion('2026-08-24', [partido('LA TABLADA "ROJO"', 'BARRIO PARQUE "VERDE"')])],
    existentes: [existente({ external_id: 'fedhockeycba:ya-adoptado' })],
  });
  assert.equal(p.crear.length, 0);
  assert.equal(p.actualizar.length, 1);
  assert.equal(p.actualizar[0].patch.date_time, '2026-08-24T16:00:00-03:00');
});

test('sin hora en el PDF no se pisa la hora cargada a mano', () => {
  const p = plan({
    secciones: [seccion('2026-08-17', [partido('LA TABLADA "ROJO"', 'BARRIO PARQUE "VERDE"', null)])],
    existentes: [existente({ external_id: 'fedhockeycba:ya-adoptado' })],
  });
  assert.equal(p.actualizar.length, 0);
  assert.equal(p.sinCambios, 1);
});

test('el resultado se orienta por home/away de la fila, no por el orden de la crónica', () => {
  // La crónica nombra primero al visitante: el marcador tiene que cruzarse.
  const p = plan({
    resultados: [{ clubA: 'barrio-parque', clubB: 'la-tablada-roja', golesA: 1, golesB: 3, texto: 'Barrio Parque 1 vs La Tablada 3' }],
    existentes: [existente({ external_id: 'fedhockeycba:x' })],
  });
  assert.equal(p.actualizar.length, 1);
  const patch = p.actualizar[0].patch;
  assert.deepEqual(patch.score, { home: 3, away: 1 });
  assert.equal(patch.status, 'final');
  assert.equal(patch.home_base_points, 3);
  assert.equal(patch.away_base_points, 0);
  assert.equal(patch.points_autocalculated, false);
});

test('el empate reparte los puntos del empate', () => {
  const p = plan({
    resultados: [{ clubA: 'la-tablada-roja', clubB: 'barrio-parque', golesA: 2, golesB: 2, texto: 'x' }],
    existentes: [existente({ external_id: 'fedhockeycba:x' })],
  });
  const patch = p.actualizar[0].patch;
  assert.equal(patch.home_base_points, 1);
  assert.equal(patch.away_base_points, 1);
});

test('una fila final no se toca: el mismo marcador es noticia repetida, otro es conflicto', () => {
  const final = existente({ external_id: 'fedhockeycba:x', status: 'final', score: { home: 3, away: 1 } });
  const repetido = plan({
    resultados: [{ clubA: 'la-tablada-roja', clubB: 'barrio-parque', golesA: 3, golesB: 1, texto: 'repetido' }],
    existentes: [final],
  });
  assert.equal(repetido.actualizar.length, 0);
  assert.equal(repetido.omitidos.length, 0);

  const conflicto = plan({
    resultados: [{ clubA: 'la-tablada-roja', clubB: 'barrio-parque', golesA: 2, golesB: 2, texto: 'conflicto' }],
    existentes: [final],
  });
  assert.equal(conflicto.actualizar.length, 0);
  assert.deepEqual(conflicto.omitidos.map((o) => o.motivo), ['resultado_contradice_final']);
});

test('fixture y crónica en la misma corrida: el alta ya nace final y con puntos', () => {
  const p = plan({
    secciones: [seccion('2026-08-17', [partido('JOCKEY VILLA MARIA', 'PALERMO BAJO "B"', '12:00')])],
    resultados: [{ clubA: 'jockey-villa-maria', clubB: 'palermo-bajo-b', golesA: 4, golesB: 0, texto: 'x' }],
  });
  assert.equal(p.crear.length, 1);
  assert.equal(p.crear[0].status, 'final');
  assert.deepEqual(p.crear[0].score, { home: 4, away: 0 });
  assert.equal(p.crear[0].home_base_points, 3);
});

test('con ida y vuelta pendientes, el resultado va al partido más cercano a hoy', () => {
  const ida = existente({ id: 'ida', external_id: 'fedhockeycba:ida', date_time: '2026-08-16T19:00:00+00:00' });
  const vuelta = existente({
    id: 'vuelta', external_id: 'fedhockeycba:vuelta', date_time: '2026-09-20T19:00:00+00:00',
    home_club_id: 'barrio-parque', away_club_id: 'la-tablada-roja',
  });
  const p = plan({
    resultados: [{ clubA: 'la-tablada-roja', clubB: 'barrio-parque', golesA: 1, golesB: 0, texto: 'x' }],
    existentes: [ida, vuelta],
  });
  assert.equal(p.actualizar.length, 1);
  assert.equal(p.actualizar[0].id, 'ida');
});

test('el equipo sin alias no se escribe y queda reportado con nombre y apellido', () => {
  const p = plan({ secciones: [seccion('2026-08-17', [partido('LA TABLADA "ROJO"', 'CLUB FANTASMA')])] });
  assert.equal(p.crear.length, 0);
  assert.equal(p.omitidos.length, 1);
  assert.equal(p.omitidos[0].motivo, 'equipo_no_resuelto');
  assert.ok(p.omitidos[0].detalle.includes('CLUB FANTASMA'));
});

test('la sección repetida (el mismo PDF cuelga de dos posts) no duplica nada', () => {
  const s = seccion('2026-08-17', [partido('LA TABLADA "ROJO"', 'BARRIO PARQUE "VERDE"')]);
  const conFila = plan({ secciones: [s, s], existentes: [existente({})] });
  assert.equal(conFila.crear.length, 0);
  assert.deepEqual(conFila.actualizar[0].cambios, ['external_id (adoptado)']);
  const sinFila = plan({ secciones: [s, s] });
  assert.equal(sinFila.crear.length, 1);
});

test('el resultado sin partido a la vista se reporta, no se inventa una fila', () => {
  const p = plan({
    resultados: [{ clubA: 'jockey-villa-maria', clubB: 'palermo-bajo-b', golesA: 4, golesB: 0, texto: 'JVM 4-0 a PB' }],
  });
  assert.equal(p.crear.length, 0);
  assert.deepEqual(p.omitidos.map((o) => o.motivo), ['resultado_sin_partido']);
});

test('con fuente estructurada y fecha, el resultado huérfano crea su partido final', () => {
  const p = plan({
    resultados: [{ clubA: 'jockey-villa-maria', clubB: 'palermo-bajo-b', golesA: 4, golesB: 0, texto: 'x', fechaNro: 1 }],
    crearDesdeResultado: { diaDeFecha: (n) => (n === 1 ? '2026-07-05' : null) },
  });
  assert.equal(p.omitidos.length, 0);
  assert.equal(p.crear.length, 1);
  const alta = p.crear[0];
  assert.equal(alta.status, 'final');
  assert.deepEqual(alta.score, { home: 4, away: 0 });
  assert.equal(alta.round_label, 'Fecha 1');
  assert.equal(alta.home_base_points, 3);
  assert.equal(alta.away_base_points, 0);
  assert.ok(alta.date_time.startsWith('2026-07-05'));
});

test('sin día estimable, el resultado huérfano sigue reportándose aunque la opción esté', () => {
  const p = plan({
    resultados: [{ clubA: 'jockey-villa-maria', clubB: 'palermo-bajo-b', golesA: 4, golesB: 0, texto: 'x', fechaNro: 9 }],
    crearDesdeResultado: { diaDeFecha: () => null },
  });
  assert.equal(p.crear.length, 0);
  assert.deepEqual(p.omitidos.map((o) => o.motivo), ['resultado_sin_partido']);
});
