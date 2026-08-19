import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseBoletinCompetencia } from './boletin-parser.ts';

const AQUI = path.dirname(fileURLToPath(import.meta.url));

/**
 * El texto de prueba es el Boletín Competencia 2026-22 REAL, tal como lo
 * extrae `lineasDelPdf`. Si la AHL cambia la diagramación, el boletín que
 * falle se suma acá y el parser se corrige con el caso verdadero adelante.
 */
const LINEAS = fs
  .readFileSync(path.join(AQUI, '__fixtures__', 'boletin-competencia-22.txt'), 'utf8')
  .split('\n')
  .filter((l) => l.trim() !== '');

test('las secciones salen del torneo vigente, con su fecha y su día', () => {
  const { secciones } = parseBoletinCompetencia(LINEAS);
  const litoralA = secciones.filter((s) => s.slug === 'clausura-litoral-a');
  assert.deepEqual(litoralA.map((s) => [s.fechaNro, s.dia]), [[4, '2026-08-15'], [5, '2026-08-17']]);
});

test('la primera de la fecha 4 del Litoral A trae sus seis partidos', () => {
  const { secciones } = parseBoletinCompetencia(LINEAS);
  const fecha4 = secciones.find((s) => s.slug === 'clausura-litoral-a' && s.fechaNro === 4)!;
  const primera = fecha4.partidos.filter((p) => p.division === '1');
  assert.deepEqual(
    primera.map((p) => [p.local, p.visitante]),
    [
      ['OLD RESIAN A', 'ATL DEL ROSARIO A'],
      ['JOCKEY B', 'DUENDES A'],
      ['SOMISA', 'FISHERTON A'],
      ['PROVINCIAL A', 'GER A'],
      ['ATL DEL ROSARIO B', 'JOCKEY A'],
      ['UNIVERSITARIO A', 'REGATAS A'],
    ],
  );
});

test('la hora sale de Observaciones, con punto y sufijo H', () => {
  const { secciones } = parseBoletinCompetencia(LINEAS);
  const fecha4 = secciones.find((s) => s.slug === 'clausura-litoral-a' && s.fechaNro === 4)!;
  const estadio = fecha4.partidos.find((p) => p.division === '1' && p.local === 'OLD RESIAN A');
  assert.equal(estadio?.hora, '20:00');
  const sinHora = fecha4.partidos.find((p) => p.division === '1' && p.local === 'JOCKEY B');
  assert.equal(sinHora?.hora, null);
});

test('las categorías cambian dentro de la fecha y no se mezclan con primera', () => {
  const { secciones } = parseBoletinCompetencia(LINEAS);
  const fecha4 = secciones.find((s) => s.slug === 'clausura-litoral-a' && s.fechaNro === 4)!;
  const divisiones = new Set(fecha4.partidos.map((p) => p.division));
  assert.ok(divisiones.has('1'));
  assert.ok(divisiones.has('RES'));
  assert.ok(divisiones.has('S19'));
  assert.equal(fecha4.partidos.filter((p) => p.division === '1').length, 6);
});

test('lo reprogramado o de recupero no entra con la fecha equivocada', () => {
  const { secciones, ignoradas } = parseBoletinCompetencia(LINEAS);
  for (const s of secciones) {
    for (const p of s.partidos) {
      for (const a of p.arbitros) assert.ok(!/REPROGRAMAD|RECUPERO/i.test(a), `${s.torneo}: ${a}`);
    }
  }
  assert.ok(ignoradas.some((l) => /REPROGRAMAD|RECUPERO/i.test(l)));
});

test('el Litoral B, C y D también salen con sus fechas', () => {
  const { secciones } = parseBoletinCompetencia(LINEAS);
  for (const slug of ['clausura-litoral-b', 'clausura-litoral-c', 'clausura-litoral-d']) {
    const del = secciones.filter((s) => s.slug === slug);
    assert.ok(del.length >= 1, `falta ${slug}`);
    assert.ok(del[0].partidos.filter((p) => p.division === '1').length >= 4, `${slug} sin primera`);
  }
});
