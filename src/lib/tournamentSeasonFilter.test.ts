import test from 'node:test';
import assert from 'node:assert/strict';

import {
  filtrarPorTemporada,
  temporadaActual,
  temporadasDisponibles,
} from './tournamentSeasonFilter.ts';

/** Un momento fijo dentro de 2026, para no depender del reloj de quien corre. */
const EN_2026 = new Date('2026-08-06T15:00:00Z');
/** 1 de enero de 2027, hora argentina: el día en que la portada podría vaciarse. */
const PRIMERO_DE_2027 = new Date('2027-01-01T15:00:00Z');

const fila = (
  id: string,
  season_id: string | null,
  union_id: string | null = null,
  priority = 0,
) => ({ id, season_id, union_id, priority });

const ids = (filas: Array<{ id: string }>) => filas.map((f) => f.id);

test('la temporada anterior de una unión no entra al listado', () => {
  const filas = [
    fila('urba-2026', '2026', 'urba'),
    fila('urba-2025', '2025', 'urba'),
    fila('urba-2026-b', '2026', 'urba'),
  ];
  assert.deepEqual(ids(filtrarPorTemporada(filas, null, EN_2026)), ['urba-2026', 'urba-2026-b']);
});

test('un torneo FIJADO A MANO sobrevive aunque sea de un año viejo', () => {
  // El caso Unions Cup: 2024, `priority = 90`, y su unión SÍ tiene un torneo de
  // 2026 —otro torneo, no otra edición del mismo—. La primera versión de este
  // módulo agrupaba por unión y se la comía.
  const filas = [
    fila('asia-2026', '2026', 'asia-rugby'),
    fila('unions-cup', '2024', 'asia-rugby', 90),
  ];
  assert.deepEqual(ids(filtrarPorTemporada(filas, null, EN_2026)), ['asia-2026', 'unions-cup']);
});

test('sin fijar y con la unión al día, el año viejo se va', () => {
  // El contraste del test anterior: lo único que cambia es la prioridad.
  const filas = [
    fila('asia-2026', '2026', 'asia-rugby'),
    fila('viejo', '2024', 'asia-rugby', 0),
  ];
  assert.deepEqual(ids(filtrarPorTemporada(filas, null, EN_2026)), ['asia-2026']);
});

test('el 1 de enero la portada no se vacía: si la unión no cargó el año nuevo, muestra el anterior', () => {
  // 2027 arrancó y URBA todavía no cargó un solo torneo. Sin la tercera
  // cláusula el listado se queda sin sus 126 competencias hasta que corra el
  // conector, y no falla nada mientras tanto.
  const filas = [fila('urba-2026', '2026', 'urba'), fila('urba-2025', '2025', 'urba')];
  assert.deepEqual(ids(filtrarPorTemporada(filas, null, PRIMERO_DE_2027)), ['urba-2026']);
});

test('el respaldo se apaga solo en cuanto la unión carga la temporada nueva', () => {
  const filas = [
    fila('urba-2027', '2027', 'urba'),
    fila('urba-2026', '2026', 'urba'),
    fila('urba-2025', '2025', 'urba'),
  ];
  assert.deepEqual(ids(filtrarPorTemporada(filas, null, PRIMERO_DE_2027)), ['urba-2027']);
});

test('un torneo suelto viejo NO revive: sin unión no hay respaldo', () => {
  // Los dos "Rugby Championship U20" (2024 y 2025, sin union_id). No son el
  // catálogo de nadie, así que se juzgan sólo por su año.
  const filas = [fila('u20-2025', '2025'), fila('u20-2024', '2024'), fila('vigente', '2026')];
  assert.deepEqual(ids(filtrarPorTemporada(filas, null, EN_2026)), ['vigente']);
});

test('una fila sin temporada se queda, con y sin año pedido', () => {
  // Es el caso de los torneos del catálogo externo: no tienen temporada nuestra.
  const filas = [fila('con', '2026', 'urba'), fila('sin', null, 'urba')];
  assert.deepEqual(ids(filtrarPorTemporada(filas, null, EN_2026)), ['con', 'sin']);
  assert.deepEqual(ids(filtrarPorTemporada(filas, '2025', EN_2026)), ['sin']);
});

test('el año pedido manda sobre todo, incluso sobre la prioridad', () => {
  const filas = [
    fila('a', '2026', 'urba'),
    fila('b', '2025', 'urba'),
    fila('fijado', '2024', 'asia-rugby', 90),
  ];
  assert.deepEqual(ids(filtrarPorTemporada(filas, '2025', EN_2026)), ['b']);
});

test('un año pedido que no existe deja el listado vacío, no lo ignora', () => {
  // Devolver "todo" ante un filtro que no matchea le miente al que filtró.
  const filas = [fila('a', '2026', 'urba')];
  assert.deepEqual(filtrarPorTemporada(filas, '2019', EN_2026), []);
});

test('un season_id numérico se trata igual que su cadena', () => {
  const filas = [
    { id: 'n', season_id: 2026, union_id: 'urba', priority: 0 },
    { id: 's', season_id: '2025', union_id: 'urba', priority: 0 },
  ];
  assert.deepEqual(ids(filtrarPorTemporada(filas, null, EN_2026)), ['n']);
});

test('una prioridad negativa o nula no fija nada', () => {
  const filas = [
    fila('vigente', '2026', 'u'),
    fila('negativa', '2025', 'u', -5),
    fila('cero', '2025', 'u', 0),
  ];
  assert.deepEqual(ids(filtrarPorTemporada(filas, null, EN_2026)), ['vigente']);
});

test('temporadasDisponibles ordena de la más nueva a la más vieja y no repite', () => {
  const filas = [fila('a', '2025', 'urba'), fila('b', '2026', 'urba'), fila('c', '2025', 'urba'), fila('d', null)];
  assert.deepEqual(temporadasDisponibles(filas), ['2026', '2025']);
});

test('la temporada en curso se lee en hora de Buenos Aires, no en UTC', () => {
  // 31 de diciembre a las 23:00 argentinas: en UTC ya es el 1 de enero. Sin la
  // zona, el listado saltaría de año un día antes que el rugby.
  assert.equal(temporadaActual(new Date('2026-01-01T02:00:00Z')), '2025');
  assert.equal(temporadaActual(new Date('2026-01-01T03:00:00Z')), '2026');
});
