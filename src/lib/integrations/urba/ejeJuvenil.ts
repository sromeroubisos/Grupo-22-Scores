/**
 * El eje que subdivide una competencia juvenil: grupo, nivel y zona.
 *
 * En mayores la subdivisión de una competencia es el GRADO —Superior,
 * Intermedia, Preintermedia B—. En juveniles es el GRUPO y la ZONA. Son la misma
 * pregunta en distinto idioma, y por eso las dos terminan en `subcategory`:
 * así el desplegable de navegación funciona para los dos mundos sin una regla
 * por `age_grade`.
 *
 * Antes acá iba el literal `'juvenil'` para los 557 torneos juveniles. Medido:
 * el menú de una división llegaba a decir "juvenil" veintiocho veces. Con el eje
 * son 85 valores distintos y 73 de las 85 divisiones quedan con un desplegable
 * que distingue algo.
 *
 * ── Tres convenciones de nombre, un solo eje ───────────────────────────────
 *
 *   2021-2023  Menores de 16 - Grupo 2 - Zona B - Segunda Rueda
 *   2024-2025  Juveniles - Primera rueda - M16 - Grupo II - Nivel 1 - Zona B Equipos B
 *   2026       Menores de 16 - Primera Rueda - G2 NIVEL 1 B Eq B
 *
 * Por eso NO se parsea con una plantilla: se EXTRAEN componentes y se emiten en
 * orden canónico. Sin eso, `G2 Nivel 1 Zona A` (2024) y `Nivel 1 G2 Zona A`
 * (2025) —que son el mismo torneo— salen como dos valores distintos y parten la
 * competencia en dos en el desplegable de temporadas.
 *
 * ── Lo que NO entra en el eje ──────────────────────────────────────────────
 * La RUEDA. Primera y segunda rueda son dos mitades del mismo campeonato, no dos
 * grados. Dejarla adentro convertiría `G2 Zona B` en dos subcategorías que no lo
 * son. La consecuencia está medida y es conocida: 87 pares de torneos comparten
 * eje y sólo los separa la rueda. Colisiones donde coinciden eje Y rueda: cero.
 * La desambiguación es de PRESENTACIÓN y vive en la UI, no en el dato.
 */

/** `Grupo I`, `Grupo ll` (con eles), `Grupo 2`. URBA usa las tres. */
const ROMANO: Readonly<Record<string, number>> = Object.freeze({
  I: 1, II: 2, III: 3,
  L: 1, LL: 2, LLL: 3,
});

/** Las palabras del descriptor, con su grafía canónica. */
const PALABRAS: ReadonlyArray<[RegExp, string]> = [
  [/\bzona\b/gi, 'Zona'],
  [/\bformativa\b/gi, 'Formativa'],
  [/\bformativo\b/gi, 'Formativa'],
  [/\bganadores\b/gi, 'Ganadores'],
  [/\bperdedores\b/gi, 'Perdedores'],
  [/\bdesarrollo\b/gi, 'Desarrollo'],
  [/\bintermedia\b/gi, 'Intermedia'],
  [/\bascenso\b/gi, 'Ascenso'],
];

/**
 * El eje de un torneo juvenil, o `null` si el nombre no trae ninguno.
 *
 * @example ejeJuvenil('Menores de 19 - Primera Rueda - G2 NIVEL 1 A')  // 'G2 Nivel 1 Zona A'
 * @example ejeJuvenil('Menores de 17 - Segunda Rueda - G1 Ganadores')  // 'G1 Ganadores'
 * @example ejeJuvenil('Menores de 16 - Grupo 2 - Zona B - Segunda Rueda')  // 'G2 Zona B'
 */
export function ejeJuvenil(nombre: string | null | undefined): string | null {
  let n = String(nombre ?? '')
    .replace(/^URBA:\s*/i, '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/["'`´’]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // El corte de edad no es el eje: ya vive en `age_grade`.
  n = n.replace(/\bMenores de \d{2}\b/gi, ' ');
  n = n.replace(/^Juveniles\b/i, ' ');
  n = n.replace(/\bM\s?\d{2}\b/gi, ' ');
  // La rueda tampoco. Ver la nota de arriba.
  n = n.replace(/\b(primera|segunda|1ra|2da)\s+rueda\b/gi, ' ');
  n = n.replace(/\brueda\s+final\b/gi, ' ');

  let grupo: number | null = null;
  let nivel: number | null = null;
  let equipos: string | null = null;

  n = n.replace(/\bgrupo\s+([IVXLl]+|\d)\b/gi, (_m, v: string) => {
    const k = String(v).toUpperCase();
    grupo = ROMANO[k] ?? (Number(k) || null);
    return ' ';
  });
  n = n.replace(/\bG\s?([123])\b/g, (_m, d: string) => { grupo = Number(d); return ' '; });
  n = n.replace(/\bnivel\s*([123])\b/gi, (_m, d: string) => { nivel = Number(d); return ' '; });
  // "Equipos B" / "Eq B" es el torneo paralelo de los segundos equipos: es otra
  // competencia, con otros jugadores, así que sí es parte del eje.
  n = n.replace(/\b(equipos?|eq)\.?\s*([ab])\b/gi, (_m, _p: string, l: string) => {
    equipos = l.toUpperCase();
    return ' ';
  });

  let resto = n.replace(/\s*-\s*/g, ' ').replace(/\s+/g, ' ').trim();
  for (const [re, canon] of PALABRAS) resto = resto.replace(re, canon);
  resto = resto.replace(/\b([a-h])\b/g, (m) => m.toUpperCase());

  // ── la letra suelta ES una zona ──────────────────────────────────────────
  // En 2026 URBA dejó de escribir la palabra: `G1 A` donde antes ponía
  // `G1 Zona A`. Sin esto son dos valores distintos y la competencia se parte en
  // el desplegable de temporadas — la misma deriva de nombre que Top 12/13/14.
  // Medido: recupera 41 claves y 43 torneos que quedaban sin temporadas.
  if (/^[A-H]$/.test(resto)) resto = `Zona ${resto}`;

  const partes: string[] = [];
  if (grupo) partes.push(`G${grupo}`);
  if (nivel) partes.push(`Nivel ${nivel}`);
  if (resto) partes.push(resto);
  if (equipos) partes.push(`Eq ${equipos}`);
  return partes.length ? partes.join(' ') : null;
}

/**
 * La rueda del torneo. NO va en `subcategory` —no es un grado— pero la UI la
 * necesita para desambiguar los 87 pares que comparten eje.
 */
export type RuedaUrba = 'primera' | 'segunda' | 'final' | 'unica';

export function ruedaDeTorneoUrba(nombre: string | null | undefined): RuedaUrba {
  const s = String(nombre ?? '');
  if (/rueda\s+final/i.test(s)) return 'final';
  if (/\b(primera|1ra)\s+rueda\b/i.test(s)) return 'primera';
  if (/\b(segunda|2da)\s+rueda\b/i.test(s)) return 'segunda';
  return 'unica';
}

/** Cómo se lee una rueda en pantalla. `unica` no se muestra: no desambigua nada. */
export const ETIQUETA_RUEDA: Readonly<Record<RuedaUrba, string | null>> = Object.freeze({
  primera: '1ª rueda',
  segunda: '2ª rueda',
  final: 'rueda final',
  unica: null,
});

/**
 * El orden natural de los ejes juveniles: G1 antes que G2, Zona A antes que
 * Zona B, y el equipo A antes que el B.
 *
 * Es un orden por COMPONENTES y no alfabético, porque alfabéticamente
 * `G2 Nivel 1 Zona A` vendría antes que `G2 Zona A` y el menú quedaría mezclado.
 */
export function ordenDeEjeJuvenil(eje: string | null | undefined): number[] {
  const s = String(eje ?? '');
  const grupo = Number(s.match(/^G(\d)/)?.[1] ?? 9);
  const nivel = Number(s.match(/\bNivel (\d)\b/)?.[1] ?? 0);
  const equipos = /\bEq B\b/.test(s) ? 1 : 0;
  // El descriptor sin grupo/nivel/equipos, para ordenar Zona A < Zona B y para
  // que Ganadores y Desarrollo caigan juntos.
  const resto = s
    .replace(/^G\d\s*/, '')
    .replace(/\bNivel \d\s*/, '')
    .replace(/\s*\bEq [AB]\b/, '')
    .trim();
  const zona = resto.match(/^Zona ([A-H])$/)?.[1];
  // Las zonas primero (son el caso normal), después el resto en alfabético.
  const familia = zona ? 0 : 1;
  const letra = zona ? zona.charCodeAt(0) - 65 : 0;
  return [grupo, nivel, familia, letra, equipos];
}

/** Comparador para `sort`, con el orden de `ordenDeEjeJuvenil`. */
export function compararEjesJuveniles(a: string | null, b: string | null): number {
  const oa = ordenDeEjeJuvenil(a);
  const ob = ordenDeEjeJuvenil(b);
  for (let i = 0; i < oa.length; i++) {
    if (oa[i] !== ob[i]) return oa[i] - ob[i];
  }
  return String(a ?? '').localeCompare(String(b ?? ''));
}
