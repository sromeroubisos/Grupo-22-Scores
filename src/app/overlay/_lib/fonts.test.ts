import test from 'node:test';
import assert from 'node:assert/strict';

import { ROLE_DEFAULTS, customFontFaceCss, familyCss, googleFontUrls, parseCustomFont, parseRoleFont } from './fonts.ts';

test('familia y peso: el peso cae en el más cercano que exista', () => {
  assert.deepEqual(parseRoleFont('dharma-m:650', ROLE_DEFAULTS.head), { family: 'dharma-m', weight: 700 });
  assert.deepEqual(parseRoleFont('articulat:700', ROLE_DEFAULTS.num), { family: 'articulat', weight: 600 });
  assert.deepEqual(parseRoleFont('dharma-e', ROLE_DEFAULTS.score), { family: 'dharma-e', weight: 900 });
  assert.deepEqual(parseRoleFont('comic-sans', ROLE_DEFAULTS.text), ROLE_DEFAULTS.text);
});

test('la fuente propia acepta Google, archivo o instalada, y nada que rompa el CSS', () => {
  assert.deepEqual(parseCustomFont('google:Oswald'), { kind: 'google', name: 'Oswald' });
  assert.deepEqual(parseCustomFont('local:Mi Fuente Bold'), { kind: 'local', name: 'Mi Fuente Bold' });
  assert.deepEqual(parseCustomFont('url:https://cdn.example.com/f.woff2'), { kind: 'url', url: 'https://cdn.example.com/f.woff2' });
  assert.equal(parseCustomFont("google:Oswald'); } body { display:none"), null);
  assert.equal(parseCustomFont('url:javascript:alert(1)'), null);
  assert.equal(parseCustomFont('url:https://cdn.example.com/f.exe'), null);
  assert.equal(parseCustomFont('Oswald'), null);
});

test('Google Fonts: una hoja por peso usado por la fuente propia', () => {
  const fonts = {
    score: { family: 'propia', weight: 900 },
    num: { family: 'propia', weight: 700 },
    head: { family: 'dharma-c', weight: 800 },
    text: { family: 'propia', weight: 700 },
    customScale: 1,
    custom: { kind: 'google' as const, name: 'Bebas Kai' },
  };
  assert.deepEqual(googleFontUrls(fonts), [
    'https://fonts.googleapis.com/css2?family=Bebas+Kai:wght@700&display=block',
    'https://fonts.googleapis.com/css2?family=Bebas+Kai:wght@900&display=block',
  ]);
  assert.match(familyCss(fonts.score, fonts.custom), /^'Bebas Kai'/);
});

test('fuente instalada: @font-face con local()', () => {
  const css = customFontFaceCss({ ...ROLE_DEFAULTS, customScale: 1, custom: { kind: 'local', name: 'Gotham Black' } });
  assert.match(css, /src: local\('Gotham Black'\)/);
});
