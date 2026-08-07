import test from 'node:test';
import assert from 'node:assert/strict';

import { planTournamentRow, planPhaseRow, legsDeChampionship, PREFIJO_NOMBRE } from './tournamentRow.ts';

/**
 * Los valores esperados NO son de gusto: se leyeron de los 126 torneos que la
 * carga de 2026 creó en `public.tournaments`, campo por campo. La derivación los
 * reproduce sin una sola diferencia.
 *
 * Lo que este archivo protege es que el histórico entre IGUAL que 2026. Si
 * alguien afloja una constante acá, los torneos de 2021-2025 quedan con otra
 * forma que sus hermanos de 2026 y los dos desplegables de navegación —que
 * agrupan por `(season_id, category, subcategory, age_grade, gender)`— los
 * separan en claves distintas sin que nada falle.
 */

/** Cuatro filas reales del inventario, una por forma de torneo. */
const TOP14_SUPERIOR = {
  urba_id: 2025176, nombre: 'TOP 14 - Superior', anio: 2026,
  division: 'Top 14', age_grade: 'mayores', gender: 'masculino', equipos: 14,
};
const JUVENIL = {
  urba_id: 2025226, nombre: 'Menores de 19 - Primera Rueda - G1 Formativa A', anio: 2026,
  division: 'Formativo', age_grade: 'M19', gender: 'masculino', equipos: 12,
};
const FEMENINO = {
  urba_id: 2025208, nombre: 'FEMENINO - TOP 9', anio: 2026,
  division: 'Femenino', age_grade: 'mayores', gender: 'femenino', equipos: 9,
};
const HISTORICO_M18 = {
  urba_id: 2021070, nombre: 'Menores de 18 - Grupo 1 - Zona A - Primera Rueda', anio: 2021,
  division: 'otro', age_grade: 'M18', gender: 'masculino', equipos: 10,
};

test('la fila reproduce la forma con la que entraron los 126 de 2026', () => {
  const fila = planTournamentRow(TOP14_SUPERIOR, { isVisible: false });

  assert.equal(fila.external_id, 'urba:2025176');
  assert.equal(fila.name, 'URBA: TOP 14 - Superior');
  assert.equal(fila.original_name, fila.name);
  assert.equal(fila.season_id, '2026');
  assert.equal(fila.category, 'Top 14');
  assert.equal(fila.subcategory, 'Superior');
  assert.equal(fila.age_grade, 'mayores');
  assert.equal(fila.gender, 'masculino');

  // Las constantes. Un torneo que entre con `sport_id` distinto no lo ve nadie.
  assert.equal(fila.union_id, 'urba');
  assert.equal(fila.region, 'Buenos Aires');
  assert.equal(fila.country, 'Argentina');
  assert.equal(fila.country_id, 'argentina');
  assert.equal(fila.sport_id, 'rugby');
  assert.equal(fila.sport, 'rugby');
  assert.equal(fila.sport_name, 'Rugby');
  assert.equal(fila.country_name, 'Argentina');
  assert.equal(fila.status, 'draft');
  assert.equal(fila.review_status, 'approved');
  assert.equal(fila.priority, 0);
  assert.equal(fila.display_order, 0);
  assert.equal(fila.ruleset_version, 1);
  assert.equal(fila.is_active, false);
  assert.equal(fila.is_popular, false);
});

test('el nombre lleva el prefijo, y el prefijo es uno solo', () => {
  assert.equal(PREFIJO_NOMBRE, 'URBA: ');
  assert.equal(planTournamentRow(JUVENIL, { isVisible: false }).name,
    'URBA: Menores de 19 - Primera Rueda - G1 Formativa A');
});

test('la visibilidad la decide el llamador, no la derivación', () => {
  assert.equal(planTournamentRow(TOP14_SUPERIOR, { isVisible: false }).is_visible, false);
  assert.equal(planTournamentRow(TOP14_SUPERIOR, { isVisible: true }).is_visible, true);
});

test('sin logo pedido, logo_url queda NULL y no en string vacío', () => {
  assert.equal(planTournamentRow(TOP14_SUPERIOR, { isVisible: false }).logo_url, null);
  assert.equal(
    planTournamentRow(TOP14_SUPERIOR, { isVisible: false, logoUrl: '/competiciones/ar-urba.png' }).logo_url,
    '/competiciones/ar-urba.png',
  );
});

test('un torneo juvenil sale con su eje de grupo y zona, no con NULL', () => {
  // Un torneo sin subcategory queda fuera del desplegable de grados: el NULL
  // acá no es inocuo, es una desaparición silenciosa. Y el literal 'juvenil'
  // tampoco servía: hacía que el menú de una división lo dijera 28 veces.
  assert.equal(planTournamentRow(JUVENIL, { isVisible: false }).subcategory, 'G1 Formativa A');
  assert.equal(planTournamentRow(HISTORICO_M18, { isVisible: false }).subcategory, 'G1 Zona A');
});

test('el femenino sale con subcategory NULL a propósito: es de un solo nivel', () => {
  assert.equal(planTournamentRow(FEMENINO, { isVisible: false }).subcategory, null);
  assert.equal(planTournamentRow(FEMENINO, { isVisible: false }).gender, 'femenino');
});

test('las categorías que URBA ya no juega entran igual, con su age_grade', () => {
  // M18 y M20 son historia real de 2021-2023. Que hoy no se jueguen no las
  // convierte en dato inválido: caen en `otro`/`juvenil`, que es lo coherente.
  const fila = planTournamentRow(HISTORICO_M18, { isVisible: false });
  assert.equal(fila.age_grade, 'M18');
  assert.equal(fila.season_id, '2021');
  assert.equal(fila.category, 'otro');
});

test('un torneo sin nombre no se deriva en silencio', () => {
  assert.throws(() => planTournamentRow({ ...TOP14_SUPERIOR, nombre: '  ' }, { isVisible: false }));
});

/* ── la fase ──────────────────────────────────────────────────────────────── */

const ronda = (pares: [number, number][]) => ({
  matches: pares.map(([a, b]) => ({ local_team_id: a, visit_team_id: b })),
});

test('legs sale de cuántas veces se cruza el par que más se cruza', () => {
  assert.equal(legsDeChampionship({ rounds: [ronda([[1, 2], [3, 4]]), ronda([[1, 3], [2, 4]])] }), 1);
  assert.equal(legsDeChampionship({ rounds: [ronda([[1, 2]]), ronda([[2, 1]])] }), 2);
});

test('legs no se confunde con el orden de local y visitante', () => {
  // `1 vs 2` y `2 vs 1` son el MISMO cruce jugado dos veces: eso es ida y vuelta.
  assert.equal(legsDeChampionship({ rounds: [ronda([[2, 1]]), ronda([[1, 2]])] }), 2);
});

test('un partido sin equipo no cuenta como cruce', () => {
  // Los Bye llegan con `visit_team_id` en null. Contarlos inventaría una revancha.
  assert.equal(legsDeChampionship({
    rounds: [{ matches: [{ local_team_id: 1, visit_team_id: null }, { local_team_id: 1, visit_team_id: null }] }],
  }), 1);
});

test('un torneo vacío no rompe la derivación de legs', () => {
  assert.equal(legsDeChampionship({}), 1);
  assert.equal(legsDeChampionship({ rounds: [] }), 1);
});

test('la fase entra activa, de liga y en el orden 1', () => {
  const fase = planPhaseRow({ tournamentId: 'abc', teamsCount: 14, legs: 2 });
  assert.equal(fase.name, 'Fase Regular');
  assert.equal(fase.phase_type, 'league');
  assert.equal(fase.order_index, 1);
  assert.equal(fase.is_active, true);
  assert.equal(fase.tournament_id, 'abc');
});

test('la fase lleva el 4/2/0 de URBA y los dos bonus', () => {
  const s = planPhaseRow({ tournamentId: 'abc', teamsCount: 14, legs: 1 }).settings as any;
  assert.deepEqual(s.points, { win: 4, draw: 2, loss: 0 });
  assert.equal(s.pointsSystem.win, 4);
  assert.equal(s.pointsSystem.allowBonusPoints, true);
  assert.equal(s.bonus.offensive.tries, 4);
  assert.equal(s.bonus.defensive.margin, 7);
  // La tabla se calcula sola desde los partidos: si entra en manual, queda vacía.
  assert.deepEqual(s.standings, { mode: 'automatic', editable: false });
});

test('el matchFormat acompaña a legs y no se elige aparte', () => {
  const uno = planPhaseRow({ tournamentId: 'a', teamsCount: 12, legs: 1 }).settings as any;
  const dos = planPhaseRow({ tournamentId: 'a', teamsCount: 12, legs: 2 }).settings as any;
  assert.equal(uno.matchFormat.type, 'single_match');
  assert.equal(dos.matchFormat.type, 'series');
  assert.equal(uno.legs, 1);
  assert.equal(dos.legs, 2);
});

test('la fase lleva la marca de origen que hace exacto el rollback', () => {
  const s = planPhaseRow({ tournamentId: 'abc', teamsCount: 9, legs: 1 }).settings as any;
  assert.equal(s.editor_source, 'urba_backfill');
  assert.equal(s.teamsCount, 9);
});

test('los desempates son los mismos que ya rigen las tablas de 2026', () => {
  const s = planPhaseRow({ tournamentId: 'abc', teamsCount: 9, legs: 1 }).settings as any;
  assert.equal(s.tiebreakers[0], 'points');
  assert.equal(s.tiebreakers[1], 'points_difference');
  assert.equal(s.tiebreakers[2], 'headToHead');
  assert.equal(s.tiebreakers.length, 14);
});
