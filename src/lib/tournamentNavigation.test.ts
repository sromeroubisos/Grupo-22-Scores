import test from 'node:test';
import assert from 'node:assert/strict';

import {
  menuDeGrados, menuDeTemporadas, compararGrados,
  ocultarGradosSubordinados, esGradoSubordinado,
  type TorneoHermano,
} from './tournamentNavigation.ts';

const mayores = (id: string, sub: string | null, anio = '2026', cat = 'Top 14'): TorneoHermano => ({
  id, name: `URBA: ${cat} - ${sub}`, season_id: anio,
  category: cat, subcategory: sub, age_grade: 'mayores', gender: 'masculino',
});

const juvenil = (id: string, sub: string, name: string, anio = '2026'): TorneoHermano => ({
  id, name, season_id: anio, category: 'otro', subcategory: sub,
  age_grade: 'M19', gender: 'masculino',
});

/* ── grados ──────────────────────────────────────────────────────────────── */

test('el menú de grados lista los hermanos en orden jerárquico', () => {
  const todos = [
    mayores('c', 'Preintermedia B'), mayores('a', 'Superior'),
    mayores('d', 'Preintermedia'), mayores('b', 'Intermedia'),
  ];
  const menu = menuDeGrados(todos[1], todos);
  assert.deepEqual(menu.map((o) => o.label),
    ['Superior', 'Intermedia', 'Preintermedia', 'Preintermedia B']);
  assert.equal(menu.find((o) => o.esActual)?.label, 'Superior');
});

test('un menú de un solo grado NO se dibuja', () => {
  // Es el hueco raro en el diseño: un desplegable que sólo se ofrece a sí mismo.
  const solo = [mayores('a', 'Superior')];
  assert.deepEqual(menuDeGrados(solo[0], solo), []);
});

test('los grados de OTRA división no entran', () => {
  const t14 = mayores('a', 'Superior', '2026', 'Top 14');
  const otros = [t14, mayores('b', 'Intermedia', '2026', 'Top 14'), mayores('z', 'Superior', '2026', 'Primera A')];
  assert.deepEqual(menuDeGrados(t14, otros).map((o) => o.id), ['a', 'b']);
});

test('los de otra TEMPORADA tampoco', () => {
  const t = mayores('a', 'Superior', '2026');
  const otros = [t, mayores('b', 'Intermedia', '2026'), mayores('v', 'Intermedia', '2025')];
  assert.deepEqual(menuDeGrados(t, otros).map((o) => o.id), ['a', 'b']);
});

test('un grado NULL no entra: no tiene lugar en la jerarquía', () => {
  const fem = { ...mayores('f', null), category: 'Femenino' };
  const todos = [mayores('a', 'Superior'), mayores('b', 'Intermedia'), fem];
  assert.ok(!menuDeGrados(todos[0], todos).some((o) => o.id === 'f'));
});

/* ── la rueda ────────────────────────────────────────────────────────────── */

test('la rueda aparece SÓLO donde desambigua', () => {
  const todos = [
    juvenil('a', 'G2 Zona B', 'Menores de 19 - Primera Rueda - G2 Zona B'),
    juvenil('b', 'G2 Zona B', 'Menores de 19 - Segunda Rueda - G2 Zona B'),
    juvenil('c', 'G1 Zona A', 'Menores de 19 - Primera Rueda - G1 Zona A'),
  ];
  const menu = menuDeGrados(todos[0], todos);
  // G1 Zona A aparece una sola vez: no necesita etiqueta.
  assert.equal(menu.find((o) => o.id === 'c')?.detalle, null);
  // Los dos G2 Zona B sí, y en orden de rueda.
  assert.equal(menu.find((o) => o.id === 'a')?.detalle, '1ª rueda');
  assert.equal(menu.find((o) => o.id === 'b')?.detalle, '2ª rueda');
  assert.ok(menu.findIndex((o) => o.id === 'a') < menu.findIndex((o) => o.id === 'b'));
});

test('no quedan dos ítems idénticos', () => {
  const todos = [
    juvenil('a', 'G2 Zona B', 'Menores de 19 - Primera Rueda - G2 Zona B'),
    juvenil('b', 'G2 Zona B', 'Menores de 19 - Segunda Rueda - G2 Zona B'),
    juvenil('c', 'G1 Zona A', 'Menores de 19 - Primera Rueda - G1 Zona A'),
  ];
  const menu = menuDeGrados(todos[0], todos);
  const textos = menu.map((o) => `${o.label}|${o.detalle ?? ''}`);
  assert.equal(new Set(textos).size, textos.length, `hay ítems repetidos: ${textos.join(' · ')}`);
});

test('el orden juvenil es G1 antes que G2, Zona A antes que Zona B', () => {
  const todos = [
    juvenil('d', 'G2 Zona A Eq B', 'x'), juvenil('b', 'G1 Zona B', 'x'),
    juvenil('c', 'G2 Zona A', 'x'), juvenil('a', 'G1 Zona A', 'x'),
  ];
  assert.deepEqual(menuDeGrados(todos[3], todos).map((o) => o.label),
    ['G1 Zona A', 'G1 Zona B', 'G2 Zona A', 'G2 Zona A Eq B']);
});

test('los grados de mayores y los juveniles no se ordenan con la misma regla', () => {
  assert.ok(compararGrados('Superior', 'Intermedia') < 0);
  assert.ok(compararGrados('G1 Zona A', 'G2 Zona A') < 0);
});

/* ── temporadas ──────────────────────────────────────────────────────────── */

test('el menú de temporadas va de más nueva a más vieja', () => {
  const todos = [
    mayores('a', 'Superior', '2024'), mayores('b', 'Superior', '2026'), mayores('c', 'Superior', '2025'),
  ];
  assert.deepEqual(menuDeTemporadas(todos[1], todos).map((o) => o.label), ['2026', '2025', '2024']);
});

test('Top 12, Top 13 y Top 14 son la misma competencia', () => {
  // Es el caso que motivó `competitionKey`: la máxima cambia de nombre con su
  // tamaño y sin esto el Top 14 de 2026 no ofrece ningún año.
  const todos = [
    mayores('a', 'Superior', '2021', 'Top 12'),
    mayores('b', 'Superior', '2022', 'Top 13'),
    mayores('c', 'Superior', '2026', 'Top 14'),
  ];
  assert.deepEqual(menuDeTemporadas(todos[2], todos).map((o) => o.label), ['2026', '2022', '2021']);
});

test('un solo año: el menú NO se dibuja', () => {
  const solo = [mayores('a', 'Superior', '2026')];
  assert.deepEqual(menuDeTemporadas(solo[0], solo), []);
});

test('otra competencia no entra en el menú de temporadas', () => {
  const t = mayores('a', 'Superior', '2026');
  const otros = [t, mayores('b', 'Superior', '2025'), mayores('z', 'Intermedia', '2025')];
  assert.deepEqual(menuDeTemporadas(t, otros).map((o) => o.id), ['a', 'b']);
});

test('la temporada lleva el nombre del torneo como detalle', () => {
  // En el histórico la misma competencia cambió de nombre: sin esto el usuario
  // no entiende por qué "2022" lo lleva a algo que se llama Top 13.
  const todos = [
    mayores('a', 'Superior', '2026', 'Top 14'),
    mayores('b', 'Superior', '2022', 'Top 13'),
  ];
  assert.equal(menuDeTemporadas(todos[0], todos).find((o) => o.label === '2022')?.detalle, 'Top 13 - Superior');
});

/* ── la pantalla principal ───────────────────────────────────────────────── */

test('Intermedia y Preintermedia no van al listado si está su Superior', () => {
  const lista = [
    mayores('a', 'Superior'), mayores('b', 'Intermedia'),
    mayores('c', 'Preintermedia'), mayores('d', 'Preintermedia B'),
  ];
  assert.deepEqual(ocultarGradosSubordinados(lista).map((t) => t.id), ['a']);
});

test('pero si su Superior NO está en la lista, se quedan', () => {
  // Sin esta condición, una división cuya Superior no se publicó desaparecería
  // entera del listado y no quedaría por dónde entrar.
  const lista = [mayores('b', 'Intermedia'), mayores('c', 'Preintermedia B')];
  assert.deepEqual(ocultarGradosSubordinados(lista).map((t) => t.id), ['b', 'c']);
});

test('la Superior de OTRA división no tapa a estos grados', () => {
  const lista = [
    mayores('a', 'Superior', '2026', 'Top 14'),
    mayores('b', 'Intermedia', '2026', 'Primera A'),
  ];
  assert.deepEqual(ocultarGradosSubordinados(lista).map((t) => t.id), ['a', 'b']);
});

test('la Superior de otro AÑO tampoco', () => {
  const lista = [mayores('a', 'Superior', '2026'), mayores('b', 'Intermedia', '2025')];
  assert.deepEqual(ocultarGradosSubordinados(lista).map((t) => t.id), ['a', 'b']);
});

test('los juveniles no se tocan: no tienen cabeza de división', () => {
  // `G1 Zona A` y `G2 Zona B` son pares, no uno debajo del otro.
  const lista = [
    juvenil('a', 'G1 Zona A', 'x'), juvenil('b', 'G2 Zona B', 'x'),
    juvenil('c', 'G2 Nivel 1 Intermedia', 'x'),
  ];
  assert.deepEqual(ocultarGradosSubordinados(lista).map((t) => t.id), ['a', 'b', 'c']);
});

test('el M22, el femenino y los sin grado se quedan', () => {
  const lista = [
    mayores('a', 'Superior'), mayores('m', 'M22'), mayores('f', null),
  ];
  assert.deepEqual(ocultarGradosSubordinados(lista).map((t) => t.id), ['a', 'm', 'f']);
});

test('esGradoSubordinado reconoce las variantes y nada más', () => {
  assert.ok(esGradoSubordinado('Intermedia'));
  assert.ok(esGradoSubordinado('Preintermedia'));
  assert.ok(esGradoSubordinado('Preintermedia F'));
  assert.ok(!esGradoSubordinado('Superior'));
  assert.ok(!esGradoSubordinado('M22'));
  assert.ok(!esGradoSubordinado('G2 Nivel 1 Intermedia'));
  assert.ok(!esGradoSubordinado(null));
});

/* ────────────────────────────────────────────────────────────────────────────
 * EL ORDEN DENTRO DE UN AÑO QUE APARECE VARIAS VECES
 * ──────────────────────────────────────────────────────────────────────────── */

const div = (id: string, name: string, season_id: string) => ({
  id, name, season_id,
  category: 'Top 12', subcategory: 'Superior', age_grade: 'mayores', gender: 'masculino',
});

test('cuando el año tiene fases, van despues de la regular y en orden cronologico', () => {
  const actual = div('a', 'Top 14 de la URBA', '2026');
  const hermanos = [
    actual,
    div('f', 'URBA: TOP 12 - Superior - Final', '2025'),
    div('c', 'URBA: TOP 12 - Superior - Clasificacion', '2025'),
    div('r', 'URBA: TOP 12 - Superior', '2025'),
    div('s', 'URBA: TOP 12 - Superior - Semifinal', '2025'),
  ];
  assert.deepEqual(
    menuDeTemporadas(actual, hermanos).map((o) => o.id),
    ['a', 'r', 'c', 's', 'f'],
  );
});

test('si el año NO tiene regular, arranca por la clasificacion y no por la semifinal', () => {
  // Los 4 pares de 2022 medidos: URBA partio la division en fases y no publico
  // una temporada regular. Antes el menu ofrecia "2022" empezando por
  // `Semifinal`, que es la mitad del torneo.
  const actual = div('a', 'Top 14 de la URBA', '2026');
  const hermanos = [
    actual,
    div('s', 'URBA: TOP 13 - Superior - Semifinal', '2022'),
    div('c', 'URBA: TOP 13 - Superior - Clasificacion', '2022'),
    div('f', 'URBA: TOP 13 - Superior - Final', '2022'),
  ];
  assert.deepEqual(
    menuDeTemporadas(actual, hermanos).map((o) => o.detalle),
    ['Top 14 de la URBA', 'TOP 13 - Superior - Clasificacion', 'TOP 13 - Superior - Semifinal', 'TOP 13 - Superior - Final'],
  );
});

test('las ruedas no son fases: la regular sigue primero y el orden es estable', () => {
  const actual = div('a', 'Top 14 de la URBA', '2026');
  const hermanos = [
    actual,
    div('zb', 'URBA: Top 12 - Superior - Zona B - Segunda Rueda', '2021'),
    div('r', 'URBA: Top 12 - Superior', '2021'),
    div('za', 'URBA: Top 12 - Superior - Zona A - Segunda Rueda', '2021'),
  ];
  assert.deepEqual(
    menuDeTemporadas(actual, hermanos).map((o) => o.id),
    ['a', 'r', 'za', 'zb'],
  );
});

test('el orden de los años no se toca: del mas nuevo al mas viejo', () => {
  const actual = div('a', 'Top 14 de la URBA', '2026');
  const hermanos = [actual, div('v', 'URBA: TOP 12 - Superior', '2021'), div('m', 'URBA: TOP 12 - Superior', '2024')];
  assert.deepEqual(menuDeTemporadas(actual, hermanos).map((o) => o.label), ['2026', '2024', '2021']);
});
