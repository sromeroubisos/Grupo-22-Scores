import test from 'node:test';
import assert from 'node:assert/strict';

import { canUseStyle, effectiveBrand, planAtLeast, planFor, planRules, readBrand, readPlan } from './overlayPlan.ts';

test('sin fila es básico; el super admin es premium siempre', () => {
  assert.equal(readPlan(undefined), 'basico');
  assert.equal(readPlan('inventado'), 'basico');
  assert.equal(planFor('usuario_overlay', null), 'basico');
  assert.equal(planFor('usuario_overlay', 'colores'), 'colores');
  assert.equal(planFor('super_admin', null), 'premium');
  assert.equal(planFor('super_admin', 'basico'), 'premium');
});

test('cada plan destraba lo suyo', () => {
  assert.deepEqual(planRules('basico'), { plan: 'basico', colors: false, fonts: false, tournamentLogo: false, sponsors: false, hideBrand: false });
  assert.deepEqual(planRules('colores'), { plan: 'colores', colors: true, fonts: true, tournamentLogo: false, sponsors: false, hideBrand: false });
  assert.deepEqual(planRules('premium'), { plan: 'premium', colors: true, fonts: true, tournamentLogo: true, sponsors: true, hideBrand: true });
  assert.ok(planAtLeast('premium', 'colores'));
  assert.ok(!planAtLeast('basico', 'colores'));
});

test('el básico usa los marcadores de la casa; el resto pide Colores', () => {
  assert.ok(canUseStyle('basico', 'marcador'));
  assert.ok(canUseStyle('basico', 'tarjeta'));
  assert.ok(!canUseStyle('basico', 'medallon'));
  assert.ok(canUseStyle('colores', 'medallon'));
});

test('la marca de G22 solo se saca con premium', () => {
  assert.equal(readBrand('abajo-der'), 'abajo-der');
  assert.equal(readBrand('cualquiera'), 'arriba-der');
  assert.equal(effectiveBrand('basico', 'no'), 'arriba-der');
  assert.equal(effectiveBrand('colores', 'no'), 'arriba-der');
  assert.equal(effectiveBrand('premium', 'no'), 'no');
  assert.equal(effectiveBrand('basico', 'abajo-der'), 'abajo-der');
});
