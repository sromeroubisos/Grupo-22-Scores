import test from 'node:test';
import assert from 'node:assert/strict';

import { instanciaDeTorneoUrba, subcategoriaDeTorneoUrba } from './externalId.ts';

/**
 * Los 134 torneos de 2026, con la subcategory que quedó backfilleada en la base.
 *
 * No es una muestra: es la tabla entera, volcada de `tournaments.subcategory`.
 * La función se escribió DESPUÉS del backfill —que se hizo por fuera del repo—,
 * así que esto es lo único que garantiza que un torneo nuevo se clasifique igual
 * que sus hermanos. Si mañana alguien afloja un regex, acá se ve cuál se movió.
 */
const CASOS: Array<[string, string | null]> = [
  ['Top 14 de la URBA', 'Superior'],
  ['Primera "A" de la URBA', 'Superior'],
  ['Primera "B" de la URBA', 'Superior'],
  ['Primera "C" de la URBA', 'Superior'],
  ['URBA: SEGUNDA - Superior', 'Superior'],
  ['URBA: TERCERA - Superior', 'Superior'],
  ['URBA: DESARROLLO - Superior', 'Superior'],
  ['URBA: TOP 14 - Intermedia', 'Intermedia'],
  ['URBA: TOP 14 - Preintermedia', 'Preintermedia'],
  ['URBA: TOP 14 - Preintermedia B', 'Preintermedia B'],
  ['URBA: PRIMERA A - Intermedia', 'Intermedia'],
  ['URBA: PRIMERA A - Preintermedia', 'Preintermedia'],
  ['URBA: PRIMERA A - Preintermedia B', 'Preintermedia B'],
  ['URBA: PRIMERA B - Intermedia', 'Intermedia'],
  ['URBA: PRIMERA B - Preintermedia', 'Preintermedia'],
  ['URBA: PRIMERA B - Preintermedia B', 'Preintermedia B'],
  ['URBA: PRIMERA C - Intermedia', 'Intermedia'],
  ['URBA: PRIMERA C - Preintermedia', 'Preintermedia'],
  ['URBA: SEGUNDA - Intermedia', 'Intermedia'],
  ['URBA: TOP 14 - Preintermedia C', 'Preintermedia C'],
  ['URBA: TOP 14 - Preintermedia D', 'Preintermedia D'],
  ['URBA: TERCERA - Intermedia', 'Intermedia'],
  ['URBA: TOP 14 - Preintermedia E', 'Preintermedia E'],
  ['URBA: TOP 14 - Preintermedia F', 'Preintermedia F'],
  ['URBA: PRIMERA A - Preintermedia C', 'Preintermedia C'],
  ['URBA: PRIMERA A - Preintermedia D', 'Preintermedia D'],
  ['URBA: PRIMERA B - Preintermedia C', 'Preintermedia C'],
  ['URBA: PRIMERA C - Preintermedia B', 'Preintermedia B'],
  ['URBA: TOP 14 - Menores de 22', 'M22'],
  ['URBA: DESARROLLO - Intermedia', 'Intermedia'],
  ['URBA: FEMENINO - TOP 9', null],
  ['URBA: FEMENINO - Primera División', null],
  ['URBA: FEMENINO - Segunda División', null],
  ['URBA: Rugby Universitario - Campeonato', null],
  ['URBA: MENORES DE 19 - G2 NIVEL 1 "A"', 'G2 Nivel 1 Zona A'],
  ['URBA: Menores de 19 - Primera Rueda - G2 NIVEL 1 A Eq B', 'G2 Nivel 1 Zona A Eq B'],
  ['URBA: MENORES DE 19 - G2 NIVEL 1 "B"', 'G2 Nivel 1 Zona B'],
  ['URBA: Menores de 19 - Primera Rueda - G2 NIVEL 1 B Eq B', 'G2 Nivel 1 Zona B Eq B'],
  ['URBA: Menores de 19 - Primera Rueda - G2 NIVEL 2 C', 'G2 Nivel 2 Zona C'],
  ['URBA: Menores de 19 - Primera Rueda - G2 NIVEL 2 C Eq B', 'G2 Nivel 2 Zona C Eq B'],
  ['URBA: Menores de 19 - Primera Rueda - G2 NIVEL 2 D', 'G2 Nivel 2 Zona D'],
  ['URBA: Menores de 19 - Primera Rueda - G2 NIVEL 2 D Eq B', 'G2 Nivel 2 Zona D Eq B'],
  ['URBA: Menores de 19 - Primera Rueda - G1 A', 'G1 Zona A'],
  ['URBA: Menores de 19 - Primera Rueda - G1 B', 'G1 Zona B'],
  ['URBA: Menores de 19 - Primera Rueda - G1 Formativa A', 'G1 Formativa A'],
  ['URBA: Menores de 19 - Primera Rueda - G2 NIVEL 2 Desarrollo', 'G2 Nivel 2 Desarrollo'],
  ['URBA: Menores de 19 - Primera Rueda - G2 NIVEL 2 Desarrollo Eq B', 'G2 Nivel 2 Desarrollo Eq B'],
  ['URBA: Menores de 19 - Primera Rueda - G1 Formativa B', 'G1 Formativa B'],
  ['URBA: Menores de 19 - Primera Rueda - G1 Formativa C', 'G1 Formativa C'],
  ['URBA: Menores de 17 - G2 NIVEL 1 "A"', 'G2 Nivel 1 Zona A'],
  ['URBA: Menores de 17 - Primera Rueda - G2 NIVEL 1 A Eq B', 'G2 Nivel 1 Zona A Eq B'],
  ['URBA: Menores de 17 - G2 NIVEL 1 "B"', 'G2 Nivel 1 Zona B'],
  ['URBA: Menores de 17 - Primera Rueda - G2 NIVEL 1 B Eq B', 'G2 Nivel 1 Zona B Eq B'],
  ['URBA: Menores de 17 - Primera Rueda - G2 NIVEL 2 C', 'G2 Nivel 2 Zona C'],
  ['URBA: Menores de 17 - Primera Rueda - G2 NIVEL 2 C Eq B', 'G2 Nivel 2 Zona C Eq B'],
  ['URBA: Menores de 17 - Primera Rueda - G1 A', 'G1 Zona A'],
  ['URBA: Menores de 17 - Primera Rueda - G1 B', 'G1 Zona B'],
  ['URBA: Menores de 17 - Primera Rueda - G1 C', 'G1 Zona C'],
  ['URBA: Menores de 17 - Primera Rueda - G1 Formativo  A', 'G1 Formativa A'],
  ['URBA: Menores de 17 - Primera Rueda - G1 Formativo  B', 'G1 Formativa B'],
  ['URBA: Menores de 17 - Primera Rueda - G1 Formativo  C', 'G1 Formativa C'],
  ['URBA: Menores de 16 - Primera Rueda - G2 NIVEL 1 A', 'G2 Nivel 1 Zona A'],
  ['URBA: Menores de 16 - Primera Rueda - G2 NIVEL 1 A Eq B', 'G2 Nivel 1 Zona A Eq B'],
  ['URBA: Menores de 16 - Primera Rueda - G2 NIVEL 1 B', 'G2 Nivel 1 Zona B'],
  ['URBA: Menores de 16 - Primera Rueda - G2 NIVEL 1 B Eq B', 'G2 Nivel 1 Zona B Eq B'],
  ['URBA: Menores de 16 - Primera Rueda - G2 NIVEL 2 C', 'G2 Nivel 2 Zona C'],
  ['URBA: Menores de 16 - Primera Rueda - G2 NIVEL 2 C Eq B', 'G2 Nivel 2 Zona C Eq B'],
  ['URBA: Menores de 16 - Primera Rueda - G2 NIVEL 2 Desarrollo', 'G2 Nivel 2 Desarrollo'],
  ['URBA: Menores de 16 - Primera Rueda - G2 NIVEL 2 Desarrollo Eq B', 'G2 Nivel 2 Desarrollo Eq B'],
  ['URBA: Menores de 16 - Primera Rueda - G1 A', 'G1 Zona A'],
  ['URBA: Menores de 16 - Primera Rueda - G1 B', 'G1 Zona B'],
  ['URBA: Menores de 16 - Primera Rueda - G1 Formativa A', 'G1 Formativa A'],
  ['URBA: Menores de 16 - Primera Rueda - G1 Formativa B', 'G1 Formativa B'],
  ['URBA: Menores de 15 - Primera Rueda - G2 NIVEL 1 A', 'G2 Nivel 1 Zona A'],
  ['URBA: Menores de 15 - Primera Rueda - G2 NIVEL 1 A Eq B', 'G2 Nivel 1 Zona A Eq B'],
  ['URBA: Menores de 15 - Primera Rueda - G2 NIVEL 1 B', 'G2 Nivel 1 Zona B'],
  ['URBA: Menores de 15 - Primera Rueda - G2 NIVEL 1 B Eq B', 'G2 Nivel 1 Zona B Eq B'],
  ['URBA: Menores de 15 - Primera Rueda - G2 NIVEL 2 Desarrollo', 'G2 Nivel 2 Desarrollo'],
  ['URBA: Menores de 15 - Primera Rueda - G2 NIVEL 2 Desarrollo Eq B', 'G2 Nivel 2 Desarrollo Eq B'],
  ['URBA: Menores de 15 - Primera Rueda - G1 A', 'G1 Zona A'],
  ['URBA: Menores de 15 - Primera Rueda - G1 B', 'G1 Zona B'],
  ['URBA: Menores de 15 - Primera Rueda - G1 Formativa A', 'G1 Formativa A'],
  ['URBA: Menores de 15 - Primera Rueda - G1 Formativa B', 'G1 Formativa B'],
  ['URBA: Rugby Formativo - Campeonato', null],
  ['URBA: Rugby Formativo - Primera Division', null],
  ['URBA: Menores de 19 - Segunda Rueda - G2 Nivel 1 Ganadores', 'G2 Nivel 1 Ganadores'],
  ['URBA: Menores de 19 - Segunda Rueda - G2 Nivel 1 Ganadores Eq B', 'G2 Nivel 1 Ganadores Eq B'],
  ['URBA: Menores de 19 - Segunda Rueda - G2 Nivel 1 Intermedia', 'G2 Nivel 1 Intermedia'],
  ['URBA: Menores de 19 - Segunda Rueda - G2 Nivel 1 Intermedia Eq B', 'G2 Nivel 1 Intermedia Eq B'],
  ['URBA: Menores de 19 - Segunda Rueda - G2 Nivel 2 Ganadores', 'G2 Nivel 2 Ganadores'],
  ['URBA: Menores de 19 - Segunda Rueda - G2 Nivel 2 Ganadores Eq B', 'G2 Nivel 2 Ganadores Eq B'],
  ['URBA: Menores de 19 - Segunda Rueda - G2 Nivel 2 Intermedia', 'G2 Nivel 2 Intermedia'],
  ['URBA: Menores de 19 - Segunda Rueda - G2 Nivel 2 Intermedia Eq B', 'G2 Nivel 2 Intermedia Eq B'],
  ['URBA: Menores de 19 - Segunda Rueda - G2 Desarrollo', 'G2 Desarrollo'],
  ['URBA: Menores de 19 - Segunda Rueda - G2 Desarrollo Eq B', 'G2 Desarrollo Eq B'],
  ['URBA: Menores de 19 - Segunda Rueda -  G1 Ganadores', 'G1 Ganadores'],
  ['URBA: Menores de 19 - Segunda Rueda - G1 Desarrollo', 'G1 Desarrollo'],
  ['URBA: Menores de 19 - Segunda Rueda - Formativa A', 'Formativa A'],
  ['URBA: Menores de 19 - Segunda Rueda - Formativa B', 'Formativa B'],
  ['URBA: Menores de 17 - Segunda Rueda - G2 Ganadores', 'G2 Ganadores'],
  ['URBA: Menores de 17 - Segunda Rueda - G2 Ganadores Eq B', 'G2 Ganadores Eq B'],
  ['URBA: Menores de 17 - Segunda Rueda - G2  Intermedia', 'G2 Intermedia'],
  ['URBA: Menores de 17 - Segunda Rueda - G2 Intermedia Eq B', 'G2 Intermedia Eq B'],
  ['URBA: Menores de 17 - Segunda Rueda - G2  Desarrollo', 'G2 Desarrollo'],
  ['URBA: Menores de 17 - Segunda Rueda - G2 Desarrollo Eq B', 'G2 Desarrollo Eq B'],
  ['URBA: Menores de 17 - Segunda Rueda - G1 Ganadores', 'G1 Ganadores'],
  ['URBA: Menores de 17 - Segunda Rueda - G1 Intermedia', 'G1 Intermedia'],
  ['URBA: Menores de 17 - Segunda Rueda - G1 Desarrollo', 'G1 Desarrollo'],
  ['URBA: Menores de 17 - Segunda Rueda - Formativa A', 'Formativa A'],
  ['URBA: Menores de 17 - Segunda Rueda - Formativa B', 'Formativa B'],
  ['URBA: Menores de 17 - Segunda Rueda - Formativa C', 'Formativa C'],
  ['URBA: Menores de 16 - Segunda Rueda - G2 Nivel 1 Ganadores', 'G2 Nivel 1 Ganadores'],
  ['URBA: Menores de 16 - Segunda Rueda - G2 Nivel 1 Intermedia', 'G2 Nivel 1 Intermedia'],
  ['URBA: Menores de 16 - Segunda Rueda - G2 Nivel 1 Ganadores Eq B', 'G2 Nivel 1 Ganadores Eq B'],
  ['URBA: Menores de 16 - Segunda Rueda - G2 Nivel 1 Intermedia Eq B', 'G2 Nivel 1 Intermedia Eq B'],
  ['URBA: Menores de 16 - Segunda Rueda - G2 Nivel 2 Ganadores', 'G2 Nivel 2 Ganadores'],
  ['URBA: Menores de 16 - Segunda Rueda - G2 Nivel 2 Ganadores Eq B', 'G2 Nivel 2 Ganadores Eq B'],
  ['URBA: Menores de 16 - Segunda Rueda - G2 Desarrollo', 'G2 Desarrollo'],
  ['URBA: Menores de 16 - Segunda Rueda - G2 Desarrollo Eq B', 'G2 Desarrollo Eq B'],
  ['URBA: Menores de 16 - Segunda Rueda - G1 Ganadores', 'G1 Ganadores'],
  ['URBA: Menores de 16 - Segunda Rueda - G1 Desarrollo', 'G1 Desarrollo'],
  ['URBA: Menores de 16 - Segunda Rueda - Formativa A', 'Formativa A'],
  ['URBA: Menores de 16 - Segunda Rueda - Formativa B', 'Formativa B'],
  ['URBA: Menores de 15 - Segunda Rueda - G2 A', 'G2 Zona A'],
  ['URBA: Menores de 15 - Segunda Rueda - G2 A Eq B', 'G2 Zona A Eq B'],
  ['URBA: Menores de 15 - Segunda Rueda - G2 B', 'G2 Zona B'],
  ['URBA: Menores de 15 - Segunda Rueda - G2 B Eq B', 'G2 Zona B Eq B'],
  ['URBA: Menores de 15 - Segunda Rueda - G2 Desarrollo', 'G2 Desarrollo'],
  ['URBA: Menores de 15 - Segunda Rueda - G2 Desarrollo Eq B', 'G2 Desarrollo Eq B'],
  ['URBA: Menores de 15 - Segunda Rueda - G1 A', 'G1 Zona A'],
  ['URBA: Menores de 15 - Segunda Rueda - G1 B', 'G1 Zona B'],
  ['URBA: Menores de 15 - Segunda Rueda - Formativa A', 'Formativa A'],
  ['URBA: Menores de 15 - Segunda Rueda - Formativa B', 'Formativa B'],
  ['URBA: Menores de 15 - Segunda Rueda - Formativa C', 'Formativa C'],
];

test('reproduce la subcategory de los 134 torneos de 2026', () => {
  const mal: string[] = [];
  for (const [nombre, esperado] of CASOS) {
    const dio = subcategoriaDeTorneoUrba(nombre);
    if (dio !== esperado) mal.push(`${nombre}: esperaba ${esperado} y dio ${dio}`);
  }
  assert.deepEqual(mal, [], `${mal.length} torneos cambiarían de subcategory`);
});

test('están los 134, no una muestra', () => {
  assert.equal(CASOS.length, 134);
});

/* ── las reglas, una por rama ───────────────────────────────────────────── */

/** "Intermedia" es subcadena de "Preintermedia": el orden del match importa. */
test('Preintermedia gana sobre Intermedia', () => {
  assert.equal(subcategoriaDeTorneoUrba('URBA: TOP 14 - Preintermedia'), 'Preintermedia');
  assert.equal(subcategoriaDeTorneoUrba('URBA: TOP 14 - Preintermedia F'), 'Preintermedia F');
  assert.equal(subcategoriaDeTorneoUrba('URBA: TOP 14 - Intermedia'), 'Intermedia');
});

/**
 * La precedencia va al REVÉS que en `categoriaDeTorneoUrba`: para el triple del
 * club manda el corte de edad, para la navegación manda el grado. El mismo
 * torneo es 'M17' allá y 'Intermedia' acá, y las dos cosas están bien.
 */
/**
 * Intermedia y Preintermedia son grados de MAYORES. Un juvenil que URBA llama
 * "G2 Intermedia" no es la Intermedia del Top 14: es el segundo escalón del
 * Grupo 2 de esa edad, y su grado es el eje entero.
 *
 * Antes salía `'Intermedia'` a secas y quedaba en la misma etiqueta que la
 * Intermedia de mayores. Peor: `G1 Intermedia`, `G2 Intermedia` y
 * `G2 Nivel 1 Intermedia` —tres competencias distintas de la misma división—
 * colapsaban en un solo valor y el desplegable no las distinguía.
 */
test('un juvenil no hereda las etiquetas de grado de mayores', () => {
  assert.equal(
    subcategoriaDeTorneoUrba('URBA: Menores de 17 - Segunda Rueda - G2 Intermedia'),
    'G2 Intermedia',
  );
  assert.equal(
    subcategoriaDeTorneoUrba('URBA: Menores de 19 - Segunda Rueda - G2 Nivel 1 Intermedia'),
    'G2 Nivel 1 Intermedia',
  );
  // Y la Intermedia de mayores sigue siendo la de mayores.
  assert.equal(subcategoriaDeTorneoUrba('URBA: TOP 14 - Intermedia'), 'Intermedia');
});

/**
 * Los juveniles NO caen en el literal `'juvenil'`: su grado es el eje de grupo y
 * zona, que es lo que subdivide una competencia juvenil igual que Superior /
 * Intermedia / Preintermedia subdividen una de mayores. Ver `ejeJuvenil.ts`.
 */
test('un juvenil se clasifica por su grupo y su zona', () => {
  assert.equal(subcategoriaDeTorneoUrba('URBA: MENORES DE 19 - G2 NIVEL 1 "A"'), 'G2 Nivel 1 Zona A');
  assert.equal(subcategoriaDeTorneoUrba('URBA: Menores de 19 - Primera Rueda - G1 Formativa A'), 'G1 Formativa A');
});

test('el literal juvenil queda sólo de respaldo', () => {
  // Para el torneo cuyo nombre no traiga eje ninguno. Es preferible a un NULL,
  // que lo dejaría fuera de la navegación sin que nadie se entere.
  assert.equal(subcategoriaDeTorneoUrba('URBA: Menores de 19'), 'juvenil');
  assert.equal(CASOS.filter(([, s]) => s === 'juvenil').length, 0);
});

/** M22 es un grado, no una categoría juvenil. */
test('Menores de 22 no cae en juvenil', () => {
  assert.equal(subcategoriaDeTorneoUrba('URBA: TOP 14 - Menores de 22'), 'M22');
});

/** Los cuatro torneos previos a la carga no llevan el sufijo "- Superior". */
test('la forma vieja "de la URBA" también es Superior', () => {
  assert.equal(subcategoriaDeTorneoUrba('Top 14 de la URBA'), 'Superior');
  assert.equal(subcategoriaDeTorneoUrba('Primera "A" de la URBA'), 'Superior');
  assert.equal(subcategoriaDeTorneoUrba('URBA: SEGUNDA - Superior'), 'Superior');
});

/**
 * `null` no es inocuo: deja el torneo fuera de la navegación por grados y no se
 * entera nadie. Estos 6 están así a propósito —Femenino, Universitario y
 * Formativo no tienen grado en el sentido de esta columna—; cualquier null nuevo
 * es un torneo que hay que mirar.
 */
test('los 6 sin grado dan null, y son sólo esos 6', () => {
  for (const n of [
    'URBA: FEMENINO - TOP 9',
    'URBA: Rugby Universitario - Campeonato',
    'URBA: Rugby Formativo - Campeonato',
  ]) {
    assert.equal(subcategoriaDeTorneoUrba(n), null);
  }
  assert.equal(CASOS.filter(([, s]) => s === null).length, 6);
});

/* ────────────────────────────────────────────────────────────────────────────
 * LA INSTANCIA NO ES UN GRADO
 *
 * La regla "una división de mayores sin grado en el nombre es la Superior" fue
 * correcta para 6 de los 7 casos que la motivaron, y falla en el séptimo:
 * `TOP 12 - Play Off` no es la Superior, es la fase final DE la Superior.
 *
 * El síntoma medible: el menú de temporadas del Top 14 de 2026 ofrecía "2025"
 * DOS VECES —`TOP 12 - Superior` y `TOP 12 - Play Off`—, porque `competitionKey`
 * incluye la subcategory y las dos decían 'Superior'.
 * ──────────────────────────────────────────────────────────────────────────── */

test('un Play Off de mayores no se hace pasar por la Superior', () => {
  // Los 5 medidos sobre los 811, todos de 2025.
  assert.equal(subcategoriaDeTorneoUrba('URBA: TOP 12 - Play Off'), 'Play Off');
  assert.equal(subcategoriaDeTorneoUrba('URBA: PRIMERA A - Play Off'), 'Play Off');
  assert.equal(subcategoriaDeTorneoUrba('URBA: PRIMERA B - Play Off'), 'Play Off');
  assert.equal(subcategoriaDeTorneoUrba('URBA: PRIMERA C - Play Off'), 'Play Off');
  assert.equal(subcategoriaDeTorneoUrba('URBA: SEGUNDA - Play Off'), 'Play Off');
});

test('el torneo que SÍ dice su grado lo conserva, aunque además sea una instancia', () => {
  // Los 24 del otro grupo. Salen por las ramas de arriba y no llegan al
  // fallback, así que la instancia no les toca la subcategory: su grado es
  // real y meterles la fase adentro llevaría el menú del Top 13 de 7 a 15.
  assert.equal(subcategoriaDeTorneoUrba('URBA: TOP 13 - Superior - Final'), 'Superior');
  assert.equal(subcategoriaDeTorneoUrba('URBA: TOP 13 - Intermedia - Semifinal'), 'Intermedia');
  assert.equal(subcategoriaDeTorneoUrba('URBA: TOP 12 - Preintermedia B - Clasificacion'), 'Preintermedia B');
  assert.equal(subcategoriaDeTorneoUrba('URBA: DESARROLLO - Superior - Torneo Final A'), 'Superior');
});

test('los 6 sin grado siguen dando null: la instancia no los rescata', () => {
  // `Femenino - Campeonato - Clasificacion` no es de mayores para
  // `categoriaDeTorneoUrba`, así que ni siquiera llega al fallback. Si la
  // instancia se mirara ANTES, estos 15 pasarían de null a 'Clasificación' y
  // se les inventaría un grado que no tienen.
  assert.equal(subcategoriaDeTorneoUrba('URBA: FEMENINO - Campeonato 12 - Clasificacion'), null);
  assert.equal(subcategoriaDeTorneoUrba('URBA: Rugby Universitario - Campeonato - Semifinal'), null);
  assert.equal(subcategoriaDeTorneoUrba('URBA: Rugby Formativo - Segunda Rueda - Ascenso'), null);
});

test('la división sin grado y sin instancia sigue siendo Superior', () => {
  // Los otros 6 de los 7 que motivaron la regla: sin esto vuelven a NULL y se
  // caen de la navegación.
  assert.equal(subcategoriaDeTorneoUrba('URBA: SEGUNDA'), 'Superior');
  assert.equal(subcategoriaDeTorneoUrba('URBA: PRIMERA A - Pre-Desarrollo'), 'Superior');
});

test('instanciaDeTorneoUrba reconoce las fases y nada más', () => {
  assert.equal(instanciaDeTorneoUrba('URBA: TOP 12 - Play Off'), 'Play Off');
  assert.equal(instanciaDeTorneoUrba('URBA: TOP 13 - Superior - Semi Final'), 'Semifinal');
  assert.equal(instanciaDeTorneoUrba('URBA: TOP 13 - Superior - Final'), 'Final');
  assert.equal(instanciaDeTorneoUrba('URBA: TOP 12 - Superior - Clasificacion'), 'Clasificación');
  assert.equal(instanciaDeTorneoUrba('URBA: TOP 14 - Superior'), null);
  // "semifinal" pegado no debe leerse como "final": el orden de la lista lo
  // cubre, pero el que importa es el caso con espacio, que matchea los dos.
  assert.equal(instanciaDeTorneoUrba('URBA: Semifinal'), 'Semifinal');
});
