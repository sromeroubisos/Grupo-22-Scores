import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeUrl } from './normalize.ts';

/**
 * La rama que importa es la de la ruta desde la raíz.
 *
 * `tournaments.logo_url` y `clubs.logo_url` guardan hoy data URIs de 280 KB —
 * 8,8 MB entre 72 filas. Los 811 torneos de URBA comparten UN logo, así que van
 * a guardar una ruta (`/competiciones/ar-urba.png`) y no 811 copias del PNG.
 *
 * Esa ruta pasa por `normalizeLogoUrl` → `normalizeUrl` antes de llegar al
 * `<img>`, y sin la rama salía `https:///competiciones/ar-urba.png`: una URL
 * inválida que no tira ningún error, sólo deja el escudo roto.
 */

test('una ruta desde la raíz pasa intacta', () => {
  assert.equal(normalizeUrl('/competiciones/ar-urba.png'), '/competiciones/ar-urba.png');
  assert.equal(normalizeUrl('/clubs/sic.svg'), '/clubs/sic.svg');
  assert.equal(normalizeUrl('  /competiciones/ar-urba.png  '), '/competiciones/ar-urba.png');
});

test('una URL protocol-relative sigue tratándose como dominio', () => {
  // `//cdn.club.com/x.png` empieza con `/` pero ES un host, no una ruta del sitio.
  assert.equal(normalizeUrl('//cdn.club.com/x.png'), 'https:////cdn.club.com/x.png');
});

test('lo que ya andaba sigue andando', () => {
  assert.equal(normalizeUrl('https://club.com/logo.png'), 'https://club.com/logo.png');
  assert.equal(normalizeUrl('http://club.com/logo.png'), 'http://club.com/logo.png');
  assert.equal(normalizeUrl('www.club.com'), 'https://www.club.com');
  assert.equal(normalizeUrl('club.com'), 'https://club.com');
  assert.equal(normalizeUrl('data:image/png;base64,AAAA'), 'data:image/png;base64,AAAA');
});

test('vacío y basura siguen dando null', () => {
  assert.equal(normalizeUrl(''), null);
  assert.equal(normalizeUrl('   '), null);
  assert.equal(normalizeUrl(null), null);
  assert.equal(normalizeUrl(undefined), null);
});
