import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { esEtapaDeZona, fechaDelDia, parsearLado, parsearSicah } from './sicah.ts';

/**
 * El Sub 14 A Damas 2026, ya jugado: 12 partidos de zona y 8 de llave, con una
 * semifinal definida por penales. Es la página real de SICAH con los planteles
 * vaciados (no se usan y pesaban la mitad del archivo).
 */
const HTML = fs.readFileSync(path.join(import.meta.dirname, '__fixtures__', 'sicah-1572.html'), 'utf8');

test('la cabecera trae el nombre y el rango del torneo', () => {
  const t = parsearSicah(HTML);
  assert.equal(t.nombre, '2026 - Selecciones Damas Sub 14 Campeonato A');
  assert.equal(t.desde, '2026-08-13');
  assert.equal(t.hasta, '2026-08-16');
});

test('salen los 20 partidos con su número, etapa, día, hora y cancha', () => {
  const { partidos } = parsearSicah(HTML);
  assert.equal(partidos.length, 20);
  assert.deepEqual([...new Set(partidos.map((p) => p.nro))].length, 20);

  const p13 = partidos.find((p) => p.nro === '13')!;
  assert.equal(p13.etapa, 'Cuadrangular');
  assert.equal(p13.dia, 'Sábado');
  assert.equal(p13.hora, '08:30');
  assert.match(p13.cancha ?? '', /^#1/);

  const p01 = partidos.find((p) => p.nro === '01')!;
  assert.equal(p01.etapa, 'Zona A');
  assert.equal(p01.dia, 'Jueves');
  assert.equal(p01.hora, '10:40');
});

test('los resultados vienen con tildes enteras y la definición por penales aparte', () => {
  const { partidos } = parsearSicah(HTML);
  const p01 = partidos.find((p) => p.nro === '01')!;
  assert.deepEqual(p01.local, { equipo: 'Asociación Amateur de Hockey Sobre Cesped de Buenos Aires', goles: 0, penales: null });
  assert.deepEqual(p01.visitante, { equipo: 'Federación Cordobesa', goles: 0, penales: null });

  // La semifinal 2-2 (3-2 en penales): los goles son 2 y los penales van aparte.
  const conPenales = partidos.find((p) => p.local?.penales !== null && p.local?.penales !== undefined)!;
  assert.ok(conPenales, 'hay una definición por penales en el fixture');
  assert.equal(conPenales.local!.goles, 2);
  assert.equal(conPenales.local!.penales, 3);
  assert.equal(conPenales.visitante!.penales, 2);
});

test('un lado sin jugar es el nombre solo, sin el guión', () => {
  assert.deepEqual(parsearLado('Federación Cordobesa &nbsp;&nbsp; - '), { equipo: 'Federación Cordobesa', goles: null, penales: null });
  assert.deepEqual(parsearLado('G. Y ESGRIMA 6 (4)'), { equipo: 'G. Y ESGRIMA', goles: 6, penales: 4 });
  assert.deepEqual(parsearLado('LOS TORDOS 5'), { equipo: 'LOS TORDOS', goles: 5, penales: null });
  assert.equal(parsearLado(''), null);
});

test('la fecha sale del día de la semana dentro del rango del torneo', () => {
  assert.equal(fechaDelDia('Jueves', '2026-08-13', '2026-08-16'), '2026-08-13');
  assert.equal(fechaDelDia('Sábado', '2026-08-13', '2026-08-16'), '2026-08-15');
  assert.equal(fechaDelDia('Sabado', '2026-08-13', '2026-08-16'), '2026-08-15');
  // un lunes no cae en un torneo de jueves a domingo: nada de inventar
  assert.equal(fechaDelDia('Lunes', '2026-08-13', '2026-08-16'), null);
  assert.equal(fechaDelDia(null, '2026-08-13', '2026-08-16'), null);
});

test('la zona es fase de grupos; el resto es llave', () => {
  assert.equal(esEtapaDeZona('Zona A'), true);
  assert.equal(esEtapaDeZona('Cuadrangular'), false);
  assert.equal(esEtapaDeZona('Semifinales'), false);
  assert.equal(esEtapaDeZona(null), false);
});
