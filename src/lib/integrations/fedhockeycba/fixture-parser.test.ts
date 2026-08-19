import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseFixture } from './fixture-parser.ts';

const AQUI = path.dirname(fileURLToPath(import.meta.url));

/**
 * El fixture de prueba es el TEXTO REAL del Fixture Nº 27/2026 tal como lo
 * extrae `lineasDelPdf` (no un ejemplo inventado): si la federación cambia la
 * diagramación, el próximo PDF que falle se agrega acá y el parser se corrige
 * con el caso real adelante.
 */
const LINEAS = fs
  .readFileSync(path.join(AQUI, '__fixtures__', 'fixture-27-2026.txt'), 'utf8')
  .split('\n')
  .filter((l) => l.trim() !== '');

test('el fixture 27 se parte en sus cinco secciones', () => {
  const { secciones } = parseFixture(LINEAS);
  assert.deepEqual(
    secciones.map((s) => [s.torneo, s.fase, s.fechaNro, s.dia]),
    [
      ["TORNEO OFICIAL DAMAS 'D' 2026", 'Fase Campeonato', 8, '2026-08-14'],
      ['TORNEO INTERPROVINCIAL CABALLEROS 2026', null, 4, '2026-08-12'],
      ['TORNEO INTERPROVINCIAL CABALLEROS 2026', null, 4, '2026-08-14'],
      ['TORNEO INTERPROVINCIAL CABALLEROS 2026', null, 4, '2026-08-16'],
      ['COPA CÓRDOBA Damas 2026', 'Fase 2', null, '2026-08-17'],
    ],
  );
});

test('el slug de la sección es estable y apto para external_id', () => {
  const { secciones } = parseFixture(LINEAS);
  assert.equal(secciones[0].slug, 'torneo-oficial-damas-d-2026');
  assert.equal(secciones[4].slug, 'copa-cordoba-damas-2026');
});

test('una fila completa trae división, equipos, hora, cancha y árbitros', () => {
  const { secciones } = parseFixture(LINEAS);
  const s14 = secciones[0].partidos.find((p) => p.division === 'S14');
  assert.deepEqual(s14, {
    division: 'S14',
    local: 'JOCKEY CLUB "BLANCO"',
    visitante: 'LA TABLADA "AZUL"',
    hora: '18:45',
    cancha: 'JOCKEY CLUB',
    arbitros: ['FREDES G', 'BERRONDO M'],
  });
});

test('la fila sin hora (ACOMPAÑANTES) queda con hora null y sin árbitros fantasma', () => {
  const { secciones } = parseFixture(LINEAS);
  const octava = secciones[0].partidos.find((p) => p.division === '8');
  assert.equal(octava?.hora, null);
  assert.deepEqual(octava?.arbitros, []);
});

test('la cancha rige para sus filas y cambia con el próximo "Cancha:"', () => {
  const { secciones } = parseFixture(LINEAS);
  const copa = secciones[4];
  assert.deepEqual(
    copa.partidos.map((p) => [p.local, p.cancha]),
    [
      ['LA TABLADA "ROJO"', 'LA TABLADA'],
      ['ATHLETIC "NEGRO"', 'CÓRDOBA ATHLETIC'],
      ['LA SALLE HC "BLANCO"', 'LA SALLE HC'],
      ['JOCKEY VILLA MARIA', 'JOCKEY VILLA MARIA'],
    ],
  );
});

test('el tercer árbitro que cae en la línea de abajo se pega a su partido', () => {
  const { secciones } = parseFixture(LINEAS);
  const copa = secciones[4];
  assert.deepEqual(copa.partidos[0].arbitros, ['TORRES N', 'LOPEZ M', 'FERREIROS G']);
  assert.deepEqual(copa.partidos[3].arbitros, ['MOLINA V', 'GOMEZ G', 'LAGOA G']);
});

test('el membrete y las notas van a ignoradas, no a una sección', () => {
  const { ignoradas } = parseFixture(LINEAS);
  assert.ok(ignoradas.some((l) => l.includes('FEDERACIÓN AMATEUR CORDOBESA')));
  assert.ok(ignoradas.some((l) => l.startsWith('NOTA:')));
  assert.equal(ignoradas.length, 2);
});

test('la celda partida por el PDF se repara: "BLANCO Y | NEGRO" es UN equipo', () => {
  // Línea real del Fixture Nº 24: la celda del visitante llegó en dos columnas.
  const { secciones } = parseFixture([
    'COPA CÓRDOBA Damas 2026 - Fase 1 - 25/07/2026',
    '1º | TALA RC "BLANCO" | TALA RC "BLANCO Y | NEGRO" | 20:30',
  ]);
  const p = secciones[0].partidos[0];
  assert.equal(p.local, 'TALA RC "BLANCO"');
  assert.equal(p.visitante, 'TALA RC "BLANCO Y NEGRO"');
  assert.equal(p.hora, '20:30');
});

test('la división de primera pierde el ordinal: 1º y 1° dan lo mismo', () => {
  const { secciones } = parseFixture([
    'TORNEO OFICIAL CABALLEROS 2026 - 5º FECHA - 21/08/2026',
    '1º | A | B | 16:00',
    '1° | C | D | 17:00',
  ]);
  assert.deepEqual(secciones[0].partidos.map((p) => p.division), ['1', '1']);
});
