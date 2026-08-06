import test from 'node:test';
import assert from 'node:assert/strict';

import { temporadaEnCurso, parsearAnioPedido, PRIMER_ANIO_URBA } from './temporada.ts';

/**
 * El test que importa es el de la medianoche del 31 de diciembre. La constante
 * que esto reemplazó (`const ANIO = 2026`) habría dejado de ver la temporada
 * nueva el 1 de enero de 2027 sin que nada fallara.
 */

test('la temporada sale del reloj, no de una constante', () => {
  assert.equal(temporadaEnCurso(new Date('2026-06-15T12:00:00Z')), 2026);
  assert.equal(temporadaEnCurso(new Date('2027-06-15T12:00:00Z')), 2027);
  assert.equal(temporadaEnCurso(new Date('2031-06-15T12:00:00Z')), 2031);
});

test('el año cambia con el reloj de Buenos Aires, no con el de UTC', () => {
  // 31-12-2026 23:00 en Buenos Aires es 01-01-2027 02:00 UTC. Sin zona, el cron
  // cambiaría de temporada tres horas antes que la unión.
  assert.equal(temporadaEnCurso(new Date('2027-01-01T02:00:00Z')), 2026);
  // Y a las 00:30 del 1 de enero en Buenos Aires (03:30 UTC) ya es la nueva.
  assert.equal(temporadaEnCurso(new Date('2027-01-01T03:30:00Z')), 2027);
});

test('el primer día de la temporada nueva ya se ve', () => {
  assert.equal(temporadaEnCurso(new Date('2027-01-01T15:00:00Z')), 2027);
});

test('sin ?anio, se sincroniza la temporada en curso', () => {
  const ahora = new Date('2026-08-06T12:00:00Z');
  assert.deepEqual(parsearAnioPedido(null, ahora), { anio: 2026, esHistorico: false });
  assert.deepEqual(parsearAnioPedido('', ahora), { anio: 2026, esHistorico: false });
  assert.deepEqual(parsearAnioPedido(undefined, ahora), { anio: 2026, esHistorico: false });
});

test('?anio de un año viejo se marca como histórico', () => {
  const ahora = new Date('2026-08-06T12:00:00Z');
  assert.deepEqual(parsearAnioPedido('2024', ahora), { anio: 2024, esHistorico: true });
  assert.deepEqual(parsearAnioPedido('2021', ahora), { anio: 2021, esHistorico: true });
});

test('?anio con la temporada en curso NO es histórico', () => {
  const ahora = new Date('2026-08-06T12:00:00Z');
  assert.deepEqual(parsearAnioPedido('2026', ahora), { anio: 2026, esHistorico: false });
});

test('un año fuera de rango se rechaza en vez de devolver cero torneos', () => {
  // Devolver 0 torneos escondería el error de tipeo detrás de un 200 en verde.
  const ahora = new Date('2026-08-06T12:00:00Z');
  assert.equal(parsearAnioPedido('2030', ahora), null);   // futuro
  assert.equal(parsearAnioPedido('2020', ahora), null);   // antes de que URBA publique
  assert.equal(parsearAnioPedido('abc', ahora), null);
  assert.equal(parsearAnioPedido('20', ahora), null);
  assert.equal(parsearAnioPedido('2026-01', ahora), null);
});

test('el techo se mueve solo con el año', () => {
  // En 2027, pedir 2027 tiene que ser válido sin tocar una línea.
  const en2027 = new Date('2027-05-01T12:00:00Z');
  assert.deepEqual(parsearAnioPedido('2027', en2027), { anio: 2027, esHistorico: false });
  assert.deepEqual(parsearAnioPedido('2026', en2027), { anio: 2026, esHistorico: true });
});

test('el primer año es el que URBA publica, y está declarado', () => {
  assert.equal(PRIMER_ANIO_URBA, 2021);
});
