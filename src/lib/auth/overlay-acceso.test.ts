import test from 'node:test';
import assert from 'node:assert/strict';

import { getRoleLabel, hasOverlayAccess, isAdminUser, normalizeRole, resolveAdminPanel } from './roles.ts';

/* El rol `usuario_overlay` abre el generador de overlays y nada más. */

test('el usuario con overlays y la administración global entran; el resto no', () => {
  assert.equal(hasOverlayAccess('usuario_overlay'), true);
  assert.equal(hasOverlayAccess('super_admin'), true);
  assert.equal(hasOverlayAccess('admin_general'), true);
  for (const role of ['fan', 'user', null, undefined, '', 'admin_torneo', 'admin_club', 'redactor', 'cualquiera']) {
    assert.equal(hasOverlayAccess(role), false, String(role));
  }
});

test('se guarda con su nombre y se muestra como "Usuario con overlays"', () => {
  assert.equal(normalizeRole('usuario_overlay'), 'usuario_overlay');
  assert.equal(normalizeRole('overlay'), 'usuario_overlay');
  assert.equal(getRoleLabel('usuario_overlay'), 'Usuario con overlays');
});

test('no abre ningún panel de administración', () => {
  assert.equal(resolveAdminPanel('usuario_overlay', []), null);
  assert.equal(isAdminUser('usuario_overlay', []), false);
});
