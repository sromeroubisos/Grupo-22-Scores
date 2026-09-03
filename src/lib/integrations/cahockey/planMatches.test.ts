import assert from 'node:assert/strict';
import { test } from 'node:test';

import { planTournamentMatches, type ExistenteCah } from './planMatches.ts';
import type { PartidoSicah, TorneoSicah } from './sicah.ts';

const TORNEO = 'cahockey:1580';
const CLUBES = new Set([
  'federacion-cordobesa-cah-hockey',
  'asociacion-tucumana-cah-hockey',
  'asociacion-saltena-cah-hockey',
  'asociacion-litoral-cah-hockey',
]);

const partido = (p: Partial<PartidoSicah> & { nro: string }): PartidoSicah => ({
  etapa: 'Zona A', dia: 'Jueves', hora: '10:40', cancha: '#3 GER',
  local: { equipo: 'Federación Cordobesa', goles: null, penales: null },
  visitante: { equipo: 'Asociación Tucumana', goles: null, penales: null },
  ...p,
});

const sicah = (partidos: PartidoSicah[]): TorneoSicah => ({
  nombre: '2026 - Selecciones Damas Sub 16 Campeonato A', desde: '2026-09-03', hasta: '2026-09-06', partidos,
});

const existente = (e: Partial<ExistenteCah> & { external_id: string }): ExistenteCah => ({
  id: `id-${e.external_id}`,
  home_club_id: 'federacion-cordobesa-cah-hockey',
  away_club_id: 'asociacion-tucumana-cah-hockey',
  date_time: '2026-09-03T10:40:00-03:00',
  status: 'scheduled', score: null, phase_id: 'fase-zona', round_label: 'Zona A', venue: '#3 GER',
  ...e,
});

const base = {
  torneoExternalId: TORNEO,
  resolverClub: () => null,
  clubConocido: (id: string) => CLUBES.has(id),
  // el jueves a las 18:00 de Buenos Aires: el partido de las 10:40 ya terminó
  ahora: '2026-09-03T21:00:00Z',
};

test('un partido programado se da de alta con el número de SICAH como identidad', () => {
  const plan = planTournamentMatches({ ...base, sicah: sicah([partido({ nro: '01' })]), existentes: [] });
  assert.equal(plan.crear.length, 1);
  const alta = plan.crear[0];
  assert.equal(alta.external_id, 'cahockey:1580:01');
  assert.equal(alta.home_club_id, 'federacion-cordobesa-cah-hockey');
  assert.equal(alta.away_club_id, 'asociacion-tucumana-cah-hockey');
  assert.equal(alta.date_time, '2026-09-03T10:40:00-03:00');
  assert.equal(alta.status, 'scheduled');
  assert.equal(alta.score, null);
  assert.equal(alta.fase, 'zona');
  assert.equal(alta.round_label, 'Zona A');
  assert.equal(alta.home_base_points, 0);
});

test('un resultado nuevo sobre una fila existente es un patch con puntos 3/1/0', () => {
  const plan = planTournamentMatches({
    ...base,
    sicah: sicah([partido({
      nro: '01',
      local: { equipo: 'Federación Cordobesa', goles: 2, penales: null },
      visitante: { equipo: 'Asociación Tucumana', goles: 0, penales: null },
    })]),
    existentes: [existente({ external_id: 'cahockey:1580:01' })],
  });
  assert.equal(plan.crear.length, 0);
  assert.equal(plan.actualizar.length, 1);
  const cambio = plan.actualizar[0];
  assert.deepEqual(cambio.patch.score, { home: 2, away: 0 });
  assert.equal(cambio.patch.status, 'final');
  assert.equal(cambio.patch.home_base_points, 3);
  assert.equal(cambio.patch.away_base_points, 0);
  assert.equal(cambio.patch.points_autocalculated, false);
  assert.match(cambio.cambios.join(' '), /resultado 2-0/);
});

test('el mismo resultado ya cargado no genera escritura', () => {
  const plan = planTournamentMatches({
    ...base,
    sicah: sicah([partido({
      nro: '01',
      local: { equipo: 'Federación Cordobesa', goles: 2, penales: null },
      visitante: { equipo: 'Asociación Tucumana', goles: 0, penales: null },
    })]),
    existentes: [existente({ external_id: 'cahockey:1580:01', status: 'final', score: { home: 2, away: 0 } })],
  });
  assert.equal(plan.actualizar.length, 0);
  assert.equal(plan.sinCambios, 1);
});

test('con goles cargados antes de que termine el partido, está en juego y todavía no reparte puntos', () => {
  const plan = planTournamentMatches({
    ...base,
    ahora: '2026-09-03T14:10:00Z', // 11:10 de Buenos Aires: 30 minutos de juego
    sicah: sicah([partido({
      nro: '01',
      local: { equipo: 'Federación Cordobesa', goles: 1, penales: null },
      visitante: { equipo: 'Asociación Tucumana', goles: 0, penales: null },
    })]),
    existentes: [existente({ external_id: 'cahockey:1580:01' })],
  });
  const cambio = plan.actualizar[0];
  assert.equal(cambio.patch.status, 'live');
  assert.equal(cambio.patch.home_base_points, 0);
});

test('un empate definido por penales guarda los goles y los penales aparte', () => {
  const plan = planTournamentMatches({
    ...base,
    sicah: sicah([partido({
      nro: '15', etapa: 'Semifinales', dia: 'Sábado', hora: '16:10',
      local: { equipo: 'Federación Cordobesa', goles: 2, penales: 3 },
      visitante: { equipo: 'Asociación Salteña', goles: 2, penales: 2 },
    })]),
    existentes: [],
  });
  const alta = plan.crear[0];
  assert.deepEqual(alta.score, { home: 2, away: 2, penalties: { home: 3, away: 2 } });
  assert.equal(alta.fase, 'llave');
  assert.equal(alta.round_label, 'Semifinales');
  assert.equal(alta.date_time, '2026-09-05T16:10:00-03:00');
});

test('un cruce por definir se omite hasta que SICAH ponga un equipo real', () => {
  const plan = planTournamentMatches({
    ...base,
    sicah: sicah([partido({
      nro: '15', etapa: 'Semifinales', dia: 'Sábado',
      local: { equipo: '1° Zona A', goles: null, penales: null },
      visitante: { equipo: '2° Zona B', goles: null, penales: null },
    })]),
    existentes: [],
  });
  assert.equal(plan.crear.length, 0);
  assert.deepEqual(plan.omitidos.map((o) => o.motivo), ['cruce por definir']);
});

test('un club que la base no tiene se reporta y no se inventa', () => {
  const plan = planTournamentMatches({
    ...base,
    sicah: sicah([partido({
      nro: '01',
      visitante: { equipo: 'Federación Bonaerense', goles: null, penales: null },
    })]),
    existentes: [],
  });
  assert.equal(plan.crear.length, 0);
  assert.deepEqual(plan.clubesDesconocidos, ['federacion-bonaerense-cah-hockey']);
  assert.equal(plan.omitidos[0].motivo, 'club desconocido');
});

test('el alias del torneo manda sobre el id derivado del nombre', () => {
  const plan = planTournamentMatches({
    ...base,
    resolverClub: (nombre) => (nombre === 'Asociación Tucumana' ? 'asociacion-tucumana-cah-hockey' : null),
    clubConocido: (id) => id === 'federacion-cordobesa-cah-hockey' || id === 'asociacion-tucumana-cah-hockey',
    sicah: sicah([partido({ nro: '01' })]),
    existentes: [],
  });
  assert.equal(plan.crear[0].away_club_id, 'asociacion-tucumana-cah-hockey');
});

test('un cambio de horario o de equipos actualiza la fila sin tocar el resultado', () => {
  const plan = planTournamentMatches({
    ...base,
    sicah: sicah([partido({ nro: '01', hora: '11:00', local: { equipo: 'Asociación Salteña', goles: null, penales: null } })]),
    existentes: [existente({ external_id: 'cahockey:1580:01' })],
  });
  const cambio = plan.actualizar[0];
  assert.equal(cambio.patch.date_time, '2026-09-03T11:00:00-03:00');
  assert.equal(cambio.patch.home_club_id, 'asociacion-saltena-cah-hockey');
  assert.equal('score' in cambio.patch, false);
});

test('un día fuera del rango del torneo no inventa fecha', () => {
  const plan = planTournamentMatches({
    ...base,
    sicah: sicah([partido({ nro: '01', dia: 'Lunes' })]),
    existentes: [],
  });
  assert.equal(plan.crear.length, 0);
  assert.equal(plan.omitidos[0].motivo, 'día fuera del rango del torneo');
});
