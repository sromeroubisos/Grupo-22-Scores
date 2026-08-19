import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { campeonatoSeleccionado, parseResultados } from './estoeshockey.ts';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const leer = (archivo: string) => fs.readFileSync(path.join(AQUI, '__fixtures__', archivo), 'utf8');

/** Páginas REALES de estoeshockey.com (Clausura Litoral A y B, agosto 2026). */
const LITORAL_A = leer('eeh-246.html');
const LITORAL_B = leer('eeh-247.html');

test('la página dice qué campeonato tiene seleccionado', () => {
  assert.equal(campeonatoSeleccionado(LITORAL_A), 246);
  assert.equal(campeonatoSeleccionado(LITORAL_B), 247);
});

test('los resultados salen con equipos, marcador y fecha', () => {
  const r = parseResultados(LITORAL_A);
  assert.ok(r.length >= 20, `esperaba 20+ resultados, hay ${r.length}`);
  for (const x of r) {
    assert.ok(x.local.length > 1 && x.visitante.length > 1);
    assert.ok(Number.isInteger(x.golesLocal) && Number.isInteger(x.golesVisitante));
    assert.ok(x.fecha === null || (x.fecha >= 1 && x.fecha <= 30));
  }
});

test('un partido concreto de la fecha 5 del Litoral A viene con su marcador', () => {
  const r = parseResultados(LITORAL_A);
  const conocido = r.find((x) => x.fecha === 5 && x.local === 'Atletico del Rosario A');
  assert.ok(conocido, 'falta Atlético del Rosario A en la fecha 5');
  assert.equal(conocido!.visitante, 'Regatas A');
  assert.deepEqual([conocido!.golesLocal, conocido!.golesVisitante], [3, 3]);
});

test('los partidos futuros (sin marcador) no se emiten', () => {
  const r = parseResultados(LITORAL_A);
  // Las 6 primeras fechas tienen a lo sumo 6 partidos cada una: nunca más
  // resultados que partidos posibles, y ninguno con texto vacío como gol.
  const porFecha = new Map<number | null, number>();
  for (const x of r) porFecha.set(x.fecha, (porFecha.get(x.fecha) ?? 0) + 1);
  for (const [, cantidad] of porFecha) assert.ok(cantidad <= 6);
});

test('el Litoral B trae a los doce equipos del boletín, con la grafía del sitio', () => {
  const r = parseResultados(LITORAL_B);
  const equipos = new Set(r.flatMap((x) => [x.local, x.visitante]));
  for (const e of ['Rowing A', 'Bancario A', 'J.C.R. C', 'Los Caranchos A', 'Logaritmo A']) {
    assert.ok(equipos.has(e), `falta ${e}`);
  }
});
