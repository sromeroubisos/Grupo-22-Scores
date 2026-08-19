import test from 'node:test';
import assert from 'node:assert/strict';

import { extraerResultados, htmlATexto } from './cronicas.ts';
import { claveDeNombre } from './nombres.ts';

/**
 * Los textos de prueba son frases REALES de las crónicas de la federación
 * (post "El «A» cerró la fecha 10" y vecinos), no ejemplos de laboratorio.
 * El alias map juega el papel del de `club_external_ids`.
 */
const ALIAS = new Map<string, string>([
  [claveDeNombre('Jockey Club'), 'jockey-club-cordoba-hockey'],
  [claveDeNombre('Jockey Club Córdoba'), 'jockey-club-cordoba-hockey'],
  [claveDeNombre('Tala RC'), 'tala-rugby-club-hockey'],
  [claveDeNombre('La Salle HC'), 'la-salle-h-c'],
  [claveDeNombre('San Martín RC'), 'san-martin-rc-hockey'],
  [claveDeNombre('La Tablada'), 'la-tablada-damas-a'],
  [claveDeNombre('Córdoba Athletic «Negro»'), 'cordoba-athletic-club-hockey'],
  [claveDeNombre('Universidad Nacional de Río Cuarto'), 'univ-nac-rio-cuarto'],
  [claveDeNombre('Univ. Nac. de Río Cuarto'), 'univ-nac-rio-cuarto'],
  [claveDeNombre('Palermo Bajo'), 'palermo-bajo-hockey'],
]);
const resolver = (clave: string) => ALIAS.get(clave) ?? null;

const extraer = (texto: string) => extraerResultados(texto, resolver, claveDeNombre);

test('la forma "X 2-1 a Y" asigna el primer número al primer nombrado', () => {
  const r = extraer('En el cierre, Jockey Club 2-1 a Tala RC en un partido cerrado.');
  assert.deepEqual(r, [{
    clubA: 'jockey-club-cordoba-hockey', golesA: 2,
    clubB: 'tala-rugby-club-hockey', golesB: 1,
    texto: 'Jockey Club 2-1 a Tala RC',
  }]);
});

test('la forma "X 1 🆚 Y 2" pega cada número a su equipo', () => {
  const r = extraer('Tala RC 1 🆚 Jockey Club Córdoba 2');
  assert.equal(r.length, 1);
  assert.equal(r[0].clubA, 'tala-rugby-club-hockey');
  assert.equal(r[0].golesA, 1);
  assert.equal(r[0].clubB, 'jockey-club-cordoba-hockey');
  assert.equal(r[0].golesB, 2);
});

test('una crónica entera saca todos los resultados de la fecha, sin inventar', () => {
  const cronica = htmlATexto(`
    <p>El «A» cerró la fecha 10. Jockey Club 2-1 a Tala RC,
    La Salle HC 5-1 a San Martín RC,
    Palermo Bajo 4-1 a Universidad Nacional de Río Cuarto y
    La Tablada 3-0 a Córdoba Athletic «Negro».</p>
    <p>En Sub 14 hubo 3 fechas de suspensión y el 14/08 se juega la próxima.</p>
  `);
  const r = extraer(cronica);
  assert.deepEqual(
    r.map((x) => [x.clubA, x.golesA, x.clubB, x.golesB]),
    [
      ['jockey-club-cordoba-hockey', 2, 'tala-rugby-club-hockey', 1],
      ['la-salle-h-c', 5, 'san-martin-rc-hockey', 1],
      ['palermo-bajo-hockey', 4, 'univ-nac-rio-cuarto', 1],
      ['la-tablada-damas-a', 3, 'cordoba-athletic-club-hockey', 0],
    ],
  );
});

test('sin los DOS lados resueltos no hay resultado: un solo club conocido no alcanza', () => {
  assert.deepEqual(extraer('Jockey Club 2-1 a Deportivo Inexistente.'), []);
  assert.deepEqual(extraer('Un Cualquiera 3-2 a Tala RC.'), []);
});

test('fechas, categorías y sanciones no producen marcadores fantasma', () => {
  assert.deepEqual(extraer('La Sub 14 de Jockey Club juega el 14/08 a las 18:45 y La Tablada descansa.'), []);
});

test('el mismo resultado repetido en la crónica entra una sola vez', () => {
  const r = extraer('Jockey Club 2-1 a Tala RC. Como decíamos, Jockey Club 2-1 a Tala RC.');
  assert.equal(r.length, 1);
});

test('htmlATexto resuelve entidades: las comillas «» de los equipos sobreviven', () => {
  assert.equal(htmlATexto('La Tablada 3-0 a C&oacute;rdoba Athletic &laquo;Negro&raquo;').includes('«Negro»'), true);
  assert.equal(htmlATexto('A &#8211; B &amp; C'), 'A – B & C');
});
