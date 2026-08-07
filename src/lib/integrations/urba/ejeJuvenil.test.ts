import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ejeJuvenil, ruedaDeTorneoUrba, compararEjesJuveniles, ETIQUETA_RUEDA,
} from './ejeJuvenil.ts';
import { subcategoriaDeTorneoUrba } from './externalId.ts';

/**
 * Los tres formatos de nombre que conviven en el histórico. La función existe
 * porque una plantilla no los cubre: hay que extraer componentes y emitirlos en
 * orden canónico.
 */

test('2026: el formato con G y NIVEL', () => {
  assert.equal(ejeJuvenil('Menores de 19 - Primera Rueda - G2 NIVEL 1 A'), 'G2 Nivel 1 Zona A');
  assert.equal(ejeJuvenil('Menores de 17 - Segunda Rueda - G1 Ganadores'), 'G1 Ganadores');
  assert.equal(ejeJuvenil('Menores de 15 - Primera Rueda - G1 Formativa B'), 'G1 Formativa B');
  assert.equal(ejeJuvenil('Menores de 16 - Primera Rueda - G2 NIVEL 2 Desarrollo Eq B'), 'G2 Nivel 2 Desarrollo Eq B');
});

test('2021-2023: el formato con Grupo y Zona', () => {
  assert.equal(ejeJuvenil('Menores de 16 - Grupo 2 - Zona B - Segunda Rueda'), 'G2 Zona B');
  assert.equal(ejeJuvenil('Menores de 15 - Grupo 2 - Zona C - Equipos B - Segunda Rueda'), 'G2 Zona C Eq B');
  assert.equal(ejeJuvenil('Menores de 17 - Grupo 1 - Formativa A - Segunda Rueda'), 'G1 Formativa A');
});

test('2024-2025: el formato Juveniles, con el grupo en romanos', () => {
  assert.equal(ejeJuvenil('Juveniles - Primera rueda - M16 - Grupo II - Nivel 1 - Zona B Equipos B'), 'G2 Nivel 1 Zona B Eq B');
  assert.equal(ejeJuvenil('Juveniles - Primera rueda - M 17 - Grupo I - Zona A'), 'G1 Zona A');
});

test('el orden de los tokens NO cambia el resultado', () => {
  // 2024 escribe `Grupo II - Nivel 1`; 2025 lo da vuelta. Es el mismo torneo, y
  // sin orden canónico la competencia se parte en dos entre años.
  const a = ejeJuvenil('Juveniles - Primera rueda - M16 - Grupo II - Nivel 1 - Zona A');
  const b = ejeJuvenil('Juveniles - Primera rueda - M 16 - Nivel 1 - Grupo II - Zona A');
  assert.equal(a, b);
  assert.equal(a, 'G2 Nivel 1 Zona A');
});

test('Grupo con eles minúsculas es Grupo II', () => {
  // URBA escribe `Grupo ll` (dos eles) donde quiere decir el romano II.
  assert.equal(ejeJuvenil('Juveniles - Segunda Rueda - M19 - Grupo ll - Nivel 1 - Ganadores'), 'G2 Nivel 1 Ganadores');
  assert.equal(ejeJuvenil('Juveniles - Segunda Rueda - M19 - Grupo l - Desarrollo'), 'G1 Desarrollo');
});

test('LA LETRA SUELTA ES UNA ZONA', () => {
  // En 2026 URBA dejó de escribir la palabra. Sin esto, `G1 A` y `G1 Zona A` son
  // dos competencias distintas y el desplegable de temporadas se rompe.
  assert.equal(ejeJuvenil('Menores de 17 - Primera Rueda - G1 B'), 'G1 Zona B');
  assert.equal(ejeJuvenil('Menores de 16 - Primera Rueda - G1 A'), 'G1 Zona A');
  assert.equal(ejeJuvenil('Menores de 16 - Primera Rueda - G2 NIVEL 1 B Eq B'), 'G2 Nivel 1 Zona B Eq B');
  // Y el de 2021 tiene que dar exactamente lo mismo.
  assert.equal(
    ejeJuvenil('Menores de 16 - Grupo 1 - Zona A - Primera Rueda'),
    ejeJuvenil('Menores de 16 - Primera Rueda - G1 A'),
  );
});

test('una letra que NO está suelta no se toca', () => {
  // `Formativa A` ya trae descriptor: la A no es una zona, es la variante.
  assert.equal(ejeJuvenil('Menores de 19 - Primera Rueda - G1 Formativa A'), 'G1 Formativa A');
  assert.equal(ejeJuvenil('Menores de 15 - Segunda Rueda - Formativa B'), 'Formativa B');
});

test('la rueda NO entra en el eje', () => {
  // Son dos mitades del mismo campeonato, no dos grados.
  assert.equal(
    ejeJuvenil('Menores de 16 - Grupo 2 - Zona B - Primera Rueda'),
    ejeJuvenil('Menores de 16 - Grupo 2 - Zona B - Segunda Rueda'),
  );
});

test('la rueda se lee aparte, para que la UI desambigüe', () => {
  assert.equal(ruedaDeTorneoUrba('Menores de 16 - Grupo 2 - Zona B - Primera Rueda'), 'primera');
  assert.equal(ruedaDeTorneoUrba('Menores de 16 - Grupo 2 - Zona B - Segunda Rueda'), 'segunda');
  assert.equal(ruedaDeTorneoUrba('Formativo - Rueda Final - Desarrollo A'), 'final');
  assert.equal(ruedaDeTorneoUrba('Menores de 15 - Grupo 2 - Zona B'), 'unica');
  assert.equal(ETIQUETA_RUEDA.primera, '1ª rueda');
  // 'unica' no se muestra: no desambigua nada.
  assert.equal(ETIQUETA_RUEDA.unica, null);
});

test('un nombre sin eje devuelve null y no una cadena vacía', () => {
  assert.equal(ejeJuvenil('Menores de 19'), null);
  assert.equal(ejeJuvenil(''), null);
  assert.equal(ejeJuvenil(null), null);
});

test('el orden es por componentes, no alfabético', () => {
  // Alfabéticamente `G2 Nivel 1 Zona A` vendría antes que `G2 Zona A` y el menú
  // quedaría mezclado. El orden es grupo → nivel → zona → equipo, y el que no
  // declara nivel va primero: es el menos específico de los tres.
  const desordenado = ['G2 Zona A', 'G1 Zona B', 'G2 Nivel 1 Zona A', 'G1 Zona A', 'G2 Zona A Eq B'];
  assert.deepEqual(desordenado.slice().sort(compararEjesJuveniles), [
    'G1 Zona A', 'G1 Zona B', 'G2 Zona A', 'G2 Zona A Eq B', 'G2 Nivel 1 Zona A',
  ]);
});

test('G1 va antes que G2, y Zona A antes que Zona B', () => {
  assert.ok(compararEjesJuveniles('G1 Zona A', 'G2 Zona A') < 0);
  assert.ok(compararEjesJuveniles('G2 Zona A', 'G2 Zona B') < 0);
  assert.ok(compararEjesJuveniles('G2 Zona A', 'G2 Zona A Eq B') < 0);
});

test('subcategoriaDeTorneoUrba devuelve el eje, no el literal juvenil', () => {
  // Es LA fuente de `tournaments.subcategory`: si acá se rompe, se rompe la columna.
  assert.equal(subcategoriaDeTorneoUrba('URBA: Menores de 19 - Primera Rueda - G2 NIVEL 1 A'), 'G2 Nivel 1 Zona A');
  assert.equal(subcategoriaDeTorneoUrba('Menores de 16 - Grupo 2 - Zona B - Segunda Rueda'), 'G2 Zona B');
});

test('un juvenil sin eje cae en el respaldo y no en NULL', () => {
  // Un NULL lo dejaría fuera de la navegación sin que nadie se entere.
  assert.equal(subcategoriaDeTorneoUrba('Menores de 19'), 'juvenil');
});

test('el M22 y los grados de mayores siguen intactos', () => {
  // El eje juvenil no puede haberse comido las otras ramas de la función.
  assert.equal(subcategoriaDeTorneoUrba('URBA: TOP 14 - Menores de 22'), 'M22');
  assert.equal(subcategoriaDeTorneoUrba('URBA: TOP 14 - Preintermedia B'), 'Preintermedia B');
  assert.equal(subcategoriaDeTorneoUrba('URBA: SEGUNDA - Superior'), 'Superior');
  assert.equal(subcategoriaDeTorneoUrba('URBA: FEMENINO - TOP 9'), null);
});
