import test from 'node:test';
import assert from 'node:assert/strict';

import { instanciaDePlayoff } from './instanciaDePlayoff.ts';

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
