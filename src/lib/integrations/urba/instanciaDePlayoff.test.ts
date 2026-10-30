import test from 'node:test';
import assert from 'node:assert/strict';

import { instanciaDePlayoff, nombreDeRonda, rondaDeInstancia } from './instanciaDePlayoff.ts';

test('PLAYOFF y SEMI FINAL son la semifinal, con cualquier mayúscula o espacio', () => {
  assert.equal(instanciaDePlayoff('PLAYOFF'), 'semifinal');
  assert.equal(instanciaDePlayoff('SEMI FINAL'), 'semifinal');
  assert.equal(instanciaDePlayoff(' Semifinal '), 'semifinal');
});

test('FINAL es la final', () => {
  assert.equal(instanciaDePlayoff('FINAL'), 'final');
  assert.equal(instanciaDePlayoff('final'), 'final');
});

test('las fechas del regular y lo que no se entiende no son playoff', () => {
  assert.equal(instanciaDePlayoff('FECHA 12'), null);
  assert.equal(instanciaDePlayoff('Primera rueda - Fecha 1'), null);
  assert.equal(instanciaDePlayoff('3er puesto'), null);
  assert.equal(instanciaDePlayoff(''), null);
  assert.equal(instanciaDePlayoff(null), null);
  assert.equal(instanciaDePlayoff(undefined), null);
});

const ronda = (id: string, name: string, order_index: number) => ({ id, name, order_index });

test('la semifinal busca una ronda de semifinales y la final una que arranque con "Final"', () => {
  const rondas = [ronda('sf', 'Semifinales', 1), ronda('f', 'Final', 2)];
  assert.equal(rondaDeInstancia(rondas, 'semifinal')?.id, 'sf');
  assert.equal(rondaDeInstancia(rondas, 'final')?.id, 'f');
});

test('"Semifinales" no se confunde con la final aunque contenga la palabra', () => {
  assert.equal(rondaDeInstancia([ronda('sf', 'Semifinales', 1)], 'final'), null);
});

test('entiende los nombres de las rondas ya cargadas en el torneo', () => {
  const top14 = [ronda('a', 'Semifinal · Copa', 1), ronda('b', 'Final · Copa', 2)];
  assert.equal(rondaDeInstancia(top14, 'semifinal')?.id, 'a');
  assert.equal(rondaDeInstancia(top14, 'final')?.id, 'b');
  const historica = [ronda('a', 'Promotion semifinals', 1), ronda('b', 'Final por el ascenso', 2)];
  assert.equal(rondaDeInstancia(historica, 'semifinal')?.id, 'a');
  assert.equal(rondaDeInstancia(historica, 'final')?.id, 'b');
});

test('sin ronda que corresponda devuelve null, y con varias toma la primera por orden', () => {
  assert.equal(rondaDeInstancia([], 'semifinal'), null);
  const dos = [ronda('z', 'Semifinal B', 2), ronda('y', 'Semifinal A', 1)];
  assert.equal(rondaDeInstancia(dos, 'semifinal')?.id, 'y');
});

test('el nombre de la ronda que se crea es el que después se reconoce', () => {
  assert.equal(nombreDeRonda('semifinal'), 'Semifinales');
  assert.equal(nombreDeRonda('final'), 'Final');
  assert.equal(rondaDeInstancia([ronda('x', nombreDeRonda('semifinal'), 1)], 'semifinal')?.id, 'x');
  assert.equal(rondaDeInstancia([ronda('x', nombreDeRonda('final'), 1)], 'final')?.id, 'x');
});
