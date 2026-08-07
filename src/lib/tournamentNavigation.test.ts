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
 * UNA TEMPORADA ES UN AÑO
 *
 * El menú emitía una opción por TORNEO, así que 2022 salía tres veces
 * —Clasificación, Semifinal, Final— como si fueran tres temporadas. Son una
 * sola: la clasificación es la temporada regular y las otras dos son sus
 * playoffs, que no son ediciones del torneo sino cómo termina la edición.
 * ──────────────────────────────────────────────────────────────────────────── */

const div = (id: string, name: string, season_id: string) => ({
  id, name, season_id,
  category: 'Top 12', subcategory: 'Superior', age_grade: 'mayores', gender: 'masculino',
});

test('un año con playoffs sale UNA vez, y lleva a la temporada regular', () => {
  const actual = div('a', 'Top 14 de la URBA', '2026');
  const hermanos = [
    actual,
    div('f', 'URBA: TOP 12 - Superior - Final', '2025'),
    div('r', 'URBA: TOP 12 - Superior', '2025'),
    div('s', 'URBA: TOP 12 - Superior - Semifinal', '2025'),
  ];
  const menu = menuDeTemporadas(actual, hermanos);
  assert.deepEqual(menu.map((o) => o.label), ['2026', '2025']);
  assert.equal(menu[1].id, 'r');
});

test('sin torneo regular, el año lleva a la CLASIFICACION y no a la semifinal', () => {
  // Los 4 casos medidos de 2022: URBA partió la división en fases y no publicó
  // un torneo regular. La clasificación ES la fase de grupos, o sea la
  // temporada regular con otro nombre.
  const actual = div('a', 'Top 14 de la URBA', '2026');
  const hermanos = [
    actual,
    div('s', 'URBA: TOP 13 - Superior - Semifinal', '2022'),
    div('c', 'URBA: TOP 13 - Superior - Clasificacion', '2022'),
    div('f', 'URBA: TOP 13 - Superior - Final', '2022'),
  ];
  const menu = menuDeTemporadas(actual, hermanos);
  assert.deepEqual(menu.map((o) => o.label), ['2026', '2022']);
  assert.equal(menu[1].id, 'c');
  assert.equal(menu[1].detalle, 'TOP 13 - Superior - Clasificacion');
});

test('las ruedas tampoco son temporadas: el año lleva a la regular', () => {
  const actual = div('a', 'Top 14 de la URBA', '2026');
  const hermanos = [
    actual,
    div('zb', 'URBA: Top 12 - Superior - Zona B - Segunda Rueda', '2021'),
    div('r', 'URBA: Top 12 - Superior', '2021'),
    div('za', 'URBA: Top 12 - Superior - Zona A - Segunda Rueda', '2021'),
  ];
  const menu = menuDeTemporadas(actual, hermanos);
  assert.deepEqual(menu.map((o) => o.label), ['2026', '2021']);
  assert.equal(menu[1].id, 'r');
});

test('parado en un playoff, el menu marca su AÑO como el actual', () => {
  // Si estoy en la Semifinal de 2022, 2022 es donde estoy: ofrecérmelo como
  // destino sería mandarme a donde ya estoy.
  const semi = div('s', 'URBA: TOP 13 - Superior - Semifinal', '2022');
  const hermanos = [semi, div('c', 'URBA: TOP 13 - Superior - Clasificacion', '2022'), div('n', 'Top 14 de la URBA', '2026')];
  const menu = menuDeTemporadas(semi, hermanos);
  assert.deepEqual(menu.map((o) => o.label), ['2026', '2022']);
  assert.equal(menu.find((o) => o.label === '2022')?.esActual, true);
  assert.equal(menu.find((o) => o.label === '2026')?.esActual, false);
});

test('los años siguen del mas nuevo al mas viejo, y no se repite ninguno', () => {
  const actual = div('a', 'Top 14 de la URBA', '2026');
  const hermanos = [actual, div('v', 'URBA: TOP 12 - Superior', '2021'), div('m', 'URBA: TOP 12 - Superior', '2024')];
  assert.deepEqual(menuDeTemporadas(actual, hermanos).map((o) => o.label), ['2026', '2024', '2021']);
});

test('una fase tampoco es un grado: el menu no repite Superior tres veces', () => {
  // El Top 13 de 2022 listaba 18 items para 6 grados, porque cada grado tenia
  // su Clasificacion, su Semifinal y su Final compartiendo subcategory.
  const g = (id: string, name: string, subcategory: string) => ({
    id, name, season_id: '2022',
    category: 'Top 13', subcategory, age_grade: 'mayores', gender: 'masculino',
  });
  const clasi = g('c', 'URBA: TOP 13 - Superior - Clasificacion', 'Superior');
  const hermanos = [
    clasi,
    g('s', 'URBA: TOP 13 - Superior - Semifinal', 'Superior'),
    g('f', 'URBA: TOP 13 - Superior - Final', 'Superior'),
    g('i', 'URBA: TOP 13 - Intermedia - Clasificacion', 'Intermedia'),
    g('is', 'URBA: TOP 13 - Intermedia - Semifinal', 'Intermedia'),
  ];
  const menu = menuDeGrados(clasi, hermanos);
  assert.deepEqual(menu.map((o) => o.label), ['Superior', 'Intermedia']);
  assert.deepEqual(menu.map((o) => o.id), ['c', 'i']);
});

test('parado en una fase, el menu de grados marca SU grado como el actual', () => {
  const g = (id: string, name: string, subcategory: string) => ({
    id, name, season_id: '2022',
    category: 'Top 13', subcategory, age_grade: 'mayores', gender: 'masculino',
  });
  const semi = g('s', 'URBA: TOP 13 - Preintermedia A - Semifinal', 'Preintermedia A');
  const hermanos = [
    semi,
    g('r', 'URBA: TOP 13 - Preintermedia A', 'Preintermedia A'),
    g('sup', 'URBA: TOP 13 - Superior', 'Superior'),
  ];
  const menu = menuDeGrados(semi, hermanos);
  // La semifinal no esta, pero su grado si, y marcado.
  assert.deepEqual(menu.map((o) => o.label), ['Superior', 'Preintermedia A']);
  assert.equal(menu.find((o) => o.label === 'Preintermedia A')?.esActual, true);
});

test('las ruedas del mismo grado siguen apareciendo las dos', () => {
  const g = (id: string, name: string) => ({
    id, name, season_id: '2021',
    category: 'otro', subcategory: 'G2 Zona B', age_grade: 'M16', gender: 'masculino',
  });
  const primera = g('p', 'URBA: Menores de 16 - Grupo 2 - Zona B - Primera Rueda');
  const hermanos = [
    primera,
    g('s', 'URBA: Menores de 16 - Grupo 2 - Zona B - Segunda Rueda'),
    { ...g('o', 'URBA: Menores de 16 - Grupo 1 - Zona A'), subcategory: 'G1 Zona A' },
  ];
  const menu = menuDeGrados(primera, hermanos);
  assert.equal(menu.filter((o) => o.label === 'G2 Zona B').length, 2);
});
