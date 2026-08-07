import test from 'node:test';
import assert from 'node:assert/strict';

import {
  etiquetaDeTemporada,
  filtrarPorTemporada,
  temporadaActual,
  temporadasDisponibles,
} from './tournamentSeasonFilter.ts';

/** Un momento fijo dentro de 2026, para no depender del reloj de quien corre. */
const EN_2026 = new Date('2026-08-06T15:00:00Z');
/** 1 de enero de 2027, hora argentina: el día en que la portada podría vaciarse. */
const PRIMERO_DE_2027 = new Date('2027-01-01T15:00:00Z');

const fila = (id: string, season_id: string | null, union_id: string | null = null) =>
  ({ id, season_id, union_id });

const ids = (filas: Array<{ id: string }>) => filas.map((f) => f.id);

test('la temporada anterior de URBA no entra al listado', () => {
  const filas = [
    fila('urba-2026', '2026', 'urba'),
    fila('urba-2025', '2025', 'urba'),
    fila('urba-2026-b', '2026', 'urba'),
  ];
  assert.deepEqual(ids(filtrarPorTemporada(filas, null, EN_2026)), ['urba-2026', 'urba-2026-b']);
});

test('lo que NO es de URBA se muestra siempre, tenga el año que tenga', () => {
  // La decisión: el filtro contiene los 677 históricos de URBA, no reordena el
  // catálogo cargado a mano. La Unions Cup (asia-rugby, 2024) y los dos "Rugby
  // Championship U20" (sin unión) vuelven al listado por esto, y NO por tener
  // una prioridad que los rescate.
  const filas = [
    fila('urba-2026', '2026', 'urba'),
    fila('urba-2025', '2025', 'urba'),
    fila('unions-cup', '2024', 'asia-rugby'),
    fila('u20-2025', '2025'),
    fila('u20-2024', '2024'),
  ];
  assert.deepEqual(
    ids(filtrarPorTemporada(filas, null, EN_2026)),
    ['urba-2026', 'unions-cup', 'u20-2025', 'u20-2024'],
  );
});

test('una unión que no filtra no se contagia de otra que sí', () => {
  // asia-rugby tiene un torneo de 2026 y otro de 2024, y los dos se quedan: no
  // está en la lista de uniones que cargan por temporada.
  const filas = [fila('asia-2026', '2026', 'asia-rugby'), fila('asia-2024', '2024', 'asia-rugby')];
  assert.deepEqual(ids(filtrarPorTemporada(filas, null, EN_2026)), ['asia-2026', 'asia-2024']);
});

test('el 1 de enero la portada no se vacía: si URBA no cargó el año nuevo, muestra el anterior', () => {
  // 2027 arrancó y el conector todavía no cargó un solo torneo. Sin esta
  // cláusula el listado se queda sin sus 126 competencias y no falla nada.
  const filas = [fila('urba-2026', '2026', 'urba'), fila('urba-2025', '2025', 'urba')];
  assert.deepEqual(ids(filtrarPorTemporada(filas, null, PRIMERO_DE_2027)), ['urba-2026']);
});

test('el respaldo se apaga solo en cuanto URBA carga la temporada nueva', () => {
  const filas = [
    fila('urba-2027', '2027', 'urba'),
    fila('urba-2026', '2026', 'urba'),
    fila('urba-2025', '2025', 'urba'),
  ];
  assert.deepEqual(ids(filtrarPorTemporada(filas, null, PRIMERO_DE_2027)), ['urba-2027']);
});

test('una fila de URBA sin temporada se queda: no se la puede juzgar', () => {
  const filas = [fila('con', '2026', 'urba'), fila('sin', null, 'urba')];
  assert.deepEqual(ids(filtrarPorTemporada(filas, null, EN_2026)), ['con', 'sin']);
});

test('el año pedido filtra URBA y deja pasar el resto', () => {
  // `?season=2025` es "quiero la temporada 2025 de URBA", no "escondeme el
  // catálogo cargado a mano".
  const filas = [
    fila('urba-2026', '2026', 'urba'),
    fila('urba-2025', '2025', 'urba'),
    fila('unions-cup', '2024', 'asia-rugby'),
  ];
  assert.deepEqual(ids(filtrarPorTemporada(filas, '2025', EN_2026)), ['urba-2025', 'unions-cup']);
});

test('un año pedido que URBA no tiene la deja afuera entera, no la ignora', () => {
  // Devolver "todos los años" ante un filtro que no matchea le miente al que
  // filtró: vacío se ve y se corrige, lleno se lee como si fuera 2019.
  const filas = [fila('urba-2026', '2026', 'urba')];
  assert.deepEqual(filtrarPorTemporada(filas, '2019', EN_2026), []);
});

test('un season_id numérico se trata igual que su cadena', () => {
  const filas = [
    { id: 'n', season_id: 2026, union_id: 'urba' },
    { id: 's', season_id: '2025', union_id: 'urba' },
  ];
  assert.deepEqual(ids(filtrarPorTemporada(filas, null, EN_2026)), ['n']);
});

test('temporadasDisponibles ordena de la más nueva a la más vieja y no repite', () => {
  const filas = [fila('a', '2025', 'urba'), fila('b', '2026', 'urba'), fila('c', '2025', 'urba'), fila('d', null)];
  assert.deepEqual(temporadasDisponibles(filas), ['2026', '2025']);
});

test('la etiqueta se calla en la temporada en curso y habla en las demás', () => {
  assert.equal(etiquetaDeTemporada('2026', EN_2026), null);
  assert.equal(etiquetaDeTemporada('2024', EN_2026), '2024');
  assert.equal(etiquetaDeTemporada(null, EN_2026), null);
});

test('la temporada en curso se lee en hora de Buenos Aires, no en UTC', () => {
  // 31 de diciembre a las 23:00 argentinas: en UTC ya es el 1 de enero. Sin la
  // zona, el listado saltaría de año un día antes que el rugby.
  assert.equal(temporadaActual(new Date('2026-01-01T02:00:00Z')), '2025');
  assert.equal(temporadaActual(new Date('2026-01-01T03:00:00Z')), '2026');
});
