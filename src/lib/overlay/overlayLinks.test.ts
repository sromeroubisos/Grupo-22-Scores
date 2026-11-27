import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LINK_TTL_DAYS,
  linkAirPath,
  linkExpiry,
  linkKindFromPath,
  linkMatchesPath,
  linkStatus,
  linksSummary,
  normalizeLinkPath,
  sameLinkTarget,
} from './overlayLinks.ts';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-11-26T20:00:00.000Z');

test('un enlace guardado vale 15 días', () => {
  assert.equal(LINK_TTL_DAYS, 15);
  assert.equal(linkExpiry(NOW), '2026-12-11T20:00:00.000Z');
  assert.equal(linkStatus(linkExpiry(NOW), NOW).label, 'Vence en 15 días');
  // La pantalla con la hora unos segundos atrasada no dice 16.
  assert.equal(linkStatus(linkExpiry(NOW + 30_000), NOW).label, 'Vence en 15 días');
});

test('el aviso cuenta días, después horas, después cuánto hace que venció', () => {
  const at = (ms: number) => new Date(NOW + ms).toISOString();
  assert.deepEqual(linkStatus(at(10 * DAY), NOW), { state: 'vigente', daysLeft: 10, label: 'Vence en 10 días' });
  assert.equal(linkStatus(at(4 * DAY), NOW).state, 'vigente');
  assert.deepEqual(linkStatus(at(3 * DAY), NOW), { state: 'por-vencer', daysLeft: 3, label: 'Vence en 3 días' });
  assert.equal(linkStatus(at(1.5 * DAY), NOW).label, 'Vence en 2 días');
  assert.equal(linkStatus(at(DAY), NOW).label, 'Vence mañana');
  assert.deepEqual(linkStatus(at(5 * 60 * 60 * 1000), NOW), { state: 'por-vencer', daysLeft: 0, label: 'Vence en 5 horas' });
  assert.equal(linkStatus(at(20 * 60 * 1000), NOW).label, 'Vence en menos de una hora');
  assert.deepEqual(linkStatus(at(-60 * 1000), NOW), { state: 'vencido', daysLeft: -1, label: 'Venció hoy' });
  assert.equal(linkStatus(at(-1.2 * DAY), NOW).label, 'Venció ayer');
  assert.equal(linkStatus(at(-4 * DAY), NOW).label, 'Venció hace 4 días');
  assert.equal(linkStatus('basura', NOW).state, 'vencido');
});

test('el resumen cuenta los que vencen pronto y los vencidos', () => {
  const at = (ms: number) => ({ expiresAt: new Date(NOW + ms).toISOString() });
  assert.deepEqual(linksSummary([at(10 * DAY), at(2 * DAY), at(3600_000), at(-DAY)], NOW), { soon: 2, expired: 1 });
});

test('solo se guardan rutas al aire, sin enlace ni prueba', () => {
  assert.equal(normalizeLinkPath('/overlay/partido/abc?estilo=barra&prueba=1'), '/overlay/partido/abc?estilo=barra');
  assert.equal(normalizeLinkPath('https://www.g22scores.com/overlay/tabla?torneo=9&enlace=viejo'), '/overlay/tabla?torneo=9');
  assert.equal(normalizeLinkPath('http://localhost:3000/overlay/manual/4b1f'), '/overlay/manual/4b1f');
  assert.equal(normalizeLinkPath('/overlay'), null);
  assert.equal(normalizeLinkPath('/overlay/control/4b1f'), null);
  assert.equal(normalizeLinkPath('/overlay/inventado'), null);
  assert.equal(normalizeLinkPath('/profile'), null);
  assert.equal(normalizeLinkPath('https://otro-sitio.com/overlay/tabla?torneo=9'), null);
  assert.equal(normalizeLinkPath('//otro-sitio.com/overlay/tabla'), null);
  assert.equal(normalizeLinkPath(42), null);
});

test('el token va pegado a la ruta, no a los ajustes', () => {
  assert.equal(linkAirPath('/overlay/tabla?torneo=9', 'tok'), '/overlay/tabla?torneo=9&enlace=tok');
  assert.equal(linkAirPath('/overlay/manual/x', 'tok'), '/overlay/manual/x?enlace=tok');
  assert.ok(linkMatchesPath('/overlay/partido/abc?estilo=barra', '/overlay/partido/abc'));
  assert.ok(linkMatchesPath('/overlay/partido/ext%3A12', '/overlay/partido/ext:12'));
  assert.ok(!linkMatchesPath('/overlay/partido/abc', '/overlay/partido/otro'));
  assert.ok(!linkMatchesPath('/overlay/tabla?torneo=9', '/overlay/goleadores'));
  assert.equal(linkKindFromPath('/overlay/goleadores?torneo=1'), 'goleadores');
});

test('sameLinkTarget: lo mismo en otro orden y con enlace/prueba es lo mismo', () => {
  const saved = '/overlay/partido/abc?estilo=bloques&pos=abajo';
  assert.equal(sameLinkTarget(saved, '/overlay/partido/abc', { pos: 'abajo', estilo: 'bloques', enlace: 'tok' }), true);
  assert.equal(sameLinkTarget('/overlay/tabla', '/overlay/tabla', { enlace: 'tok', prueba: '1' }), true);
});

test('sameLinkTarget: editado (otro ajuste u otro partido) ya no es lo mismo', () => {
  const saved = '/overlay/partido/abc?estilo=bloques&pos=arriba';
  assert.equal(sameLinkTarget(saved, '/overlay/partido/abc', { estilo: 'bloques', pos: 'abajo', enlace: 'tok' }), false);
  assert.equal(sameLinkTarget(saved, '/overlay/partido/abc', { estilo: 'bloques', enlace: 'tok' }), false);
  assert.equal(sameLinkTarget(saved, '/overlay/partido/otro', { estilo: 'bloques', pos: 'arriba', enlace: 'tok' }), false);
});
