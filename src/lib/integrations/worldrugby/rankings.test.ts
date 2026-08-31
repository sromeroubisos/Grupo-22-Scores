import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeWorldRugbyEntries } from './rankings.ts';

const fila = (over: Record<string, unknown> = {}) => ({
  team: { id: '39', name: 'South Africa', abbreviation: 'RSA', countryCode: 'ZAF' },
  pts: 93.38886712392247,
  pos: 1,
  previousPts: 92.2063093167397,
  previousPos: 2,
  ...over,
});

const payload = (entries: unknown[]) => ({ label: 'Mens Rugby Union', entries });

/* ── la traduccion de una fila ──────────────────────────────────────────── */

test('una union queda con nombre en espaniol, bandera local y continente', () => {
  const [entrada] = normalizeWorldRugbyEntries(payload([fila()]));

  assert.equal(entrada.teamId, '39');
  assert.equal(entrada.name, 'South Africa');
  assert.equal(entrada.nameEs, 'Sudáfrica');
  assert.equal(entrada.code, 'RSA');
  assert.equal(entrada.countryId, 'south-africa');
  assert.equal(entrada.flagUrl, '/flags/za.svg');
  assert.equal(entrada.region, 'Africa');
  assert.equal(entrada.position, 1);
  assert.equal(entrada.previousPosition, 2);
  assert.equal(entrada.previousPoints, 92.2063093167397);
});

test('los puntos NO se redondean: la API los da enteros y la pantalla decide', () => {
  const [entrada] = normalizeWorldRugbyEntries(payload([fila()]));
  assert.equal(entrada.points, 93.38886712392247);
});

/* ── las banderas que no son alpha-2 ────────────────────────────────────── */

test('las naciones britanicas no van por codigo de pais', () => {
  const britanicas = [
    { nombre: 'England', codigo: 'ENG', bandera: '/flags/gb-eng.svg' },
    { nombre: 'Scotland', codigo: 'SCO', bandera: '/flags/gb-sct.svg' },
    { nombre: 'Wales', codigo: 'WAL', bandera: '/flags/gb-wls.svg' },
  ];

  for (const { nombre, codigo, bandera } of britanicas) {
    const [entrada] = normalizeWorldRugbyEntries(payload([
      fila({ team: { id: '1', name: nombre, abbreviation: codigo, countryCode: codigo } }),
    ]));
    assert.equal(entrada.flagUrl, bandera, `${nombre} deberia resolver a ${bandera}`);
  }
});

test('las seis uniones que World Rugby escribe distinto que el catalogo resuelven igual', () => {
  // El sintoma era una tabla con seis banderas en blanco. La causa: la API dice
  // "Czechia" y "Chinese Taipei" donde nosotros decimos "Czech Republic" y
  // "Taiwan". Se arreglo con alias en `countries.ts`, no con un if aca.
  const raras = [
    { nombre: 'Czechia', codigo: 'CZE', bandera: '/flags/cz.svg' },
    { nombre: 'Chinese Taipei', codigo: 'TPE', bandera: '/flags/tw.svg' },
    { nombre: "Cote D'Ivoire", codigo: 'CIV', bandera: '/flags/ci.svg' },
    { nombre: 'St Vincent and the Grenadines', codigo: 'VCT', bandera: '/flags/vc.svg' },
    { nombre: 'St Lucia', codigo: 'LCA', bandera: '/flags/lc.svg' },
    { nombre: 'Niue Island', codigo: 'NIU', bandera: '/flags/nu.svg' },
  ];

  for (const { nombre, codigo, bandera } of raras) {
    const [entrada] = normalizeWorldRugbyEntries(payload([
      fila({ team: { id: '9', name: nombre, abbreviation: codigo, countryCode: codigo } }),
    ]));
    assert.equal(entrada.flagUrl, bandera, `${nombre} deberia resolver a ${bandera}`);
    assert.ok(entrada.region, `${nombre} deberia tener continente`);
  }
});

/* ── el orden y las filas que no se pueden leer ─────────────────────────── */

test('la tabla sale ordenada por puesto aunque llegue desordenada', () => {
  const entradas = normalizeWorldRugbyEntries(payload([
    fila({ pos: 3, team: { id: '3', name: 'Ireland', abbreviation: 'IRE', countryCode: 'IRL' } }),
    fila({ pos: 1 }),
    fila({ pos: 2, team: { id: '2', name: 'New Zealand', abbreviation: 'NZL', countryCode: 'NZL' } }),
  ]));

  assert.deepEqual(entradas.map((entrada) => entrada.position), [1, 2, 3]);
});

test('una fila sin nombre, sin puesto o sin puntos se descarta, no se pinta con guiones', () => {
  const entradas = normalizeWorldRugbyEntries(payload([
    fila(),
    fila({ team: { id: '2', name: '', abbreviation: 'XXX', countryCode: 'XXX' }, pos: 2 }),
    fila({ pos: null }),
    fila({ pts: 'sin datos' }),
  ]));

  assert.equal(entradas.length, 1);
  assert.equal(entradas[0].name, 'South Africa');
});

test('un pais que no esta en el catalogo conserva su nombre y se queda sin bandera', () => {
  const [entrada] = normalizeWorldRugbyEntries(payload([
    fila({ team: { id: '999', name: 'Atlantis', abbreviation: 'ATL', countryCode: 'ATL' } }),
  ]));

  assert.equal(entrada.nameEs, 'Atlantis');
  assert.equal(entrada.countryId, null);
  assert.equal(entrada.flagUrl, null);
});

/* ── una falla nunca sale como tabla vacia ──────────────────────────────── */

test('una respuesta sin lista de posiciones tira, no devuelve vacio', () => {
  assert.throws(() => normalizeWorldRugbyEntries({ label: 'Mens Rugby Union' }), /lista de posiciones/);
  assert.throws(() => normalizeWorldRugbyEntries(null), /lista de posiciones/);
});

test('una tabla en la que no se pudo leer ninguna fila tira, no devuelve vacio', () => {
  // Es la trampa que ya nos comimos con FlashScore: un vacio guardado como si
  // fuera bueno tapa la falla y despues nadie sabe por que el ranking esta mudo.
  assert.throws(() => normalizeWorldRugbyEntries(payload([])), /tabla vacia/);
  assert.throws(() => normalizeWorldRugbyEntries(payload([fila({ pos: null })])), /tabla vacia/);
});
