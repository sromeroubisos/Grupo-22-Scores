/**
 * La identidad de una COMPETENCIA a través de los años.
 *
 * Un torneo es una edición: `Top 14 - Superior` de 2026. La competencia es lo
 * que se repite temporada tras temporada, y es lo que el desplegable de
 * temporadas necesita para ofrecer "2025, 2024, 2023…" parado en 2026.
 *
 * La tentación es usar `(category, subcategory, age_grade, gender)` tal cual
 * están en la fila. **No alcanza, y está medido**: sobre los 811 torneos de URBA
 * quedan 79 claves, 31 de ellas en un solo año, y 92 torneos sin ninguna
 * temporada que ofrecer. La causa principal no es el histórico sucio:
 *
 *     2021  Top 12      2024  Top 12
 *     2022  Top 13      2025  Top 12
 *     2023  Top 12      2026  Top 14
 *
 * **La máxima categoría de URBA cambia de nombre con su tamaño.** Es UNA
 * competencia y la clave cruda la parte en tres, así que parado en el Top 14 de
 * 2026 el desplegable no ofrece ningún año, aunque haya cinco debajo.
 *
 * No hace falta una columna nueva: el dato ya está en la fila, lo que faltaba
 * era leerlo bien. Por eso esto es una derivación y no un `ALTER TABLE` — un
 * campo persistido sería una segunda fuente de verdad que se desincroniza el día
 * que alguien corrige una `category` a mano.
 */

/**
 * Divisiones cuyo nombre lleva el tamaño adentro y por eso cambia con los años.
 *
 * `Top 12`, `Top 13` y `Top 14` son la misma competencia: la máxima. Se colapsan
 * a `Top`, que es lo único estable. NO se colapsa `Primera A` con `Primera B`:
 * ésas sí son divisiones distintas, y juntarlas mezclaría dos torneos reales.
 */
const DIVISION_CON_TAMANO = /^top\s*\d+$/i;

/** La forma canónica de una división, para comparar entre años. */
export function normalizeCategory(value: string | null | undefined): string {
  const v = String(value ?? '').trim();
  if (!v) return '';
  if (DIVISION_CON_TAMANO.test(v)) return 'Top';
  return v;
}

/**
 * El corte de edad, en la grafía del conector.
 *
 * Los torneos que ya existían en G22 antes de URBA traen `'Mayores'`,
 * `'Mayores (Adults)'` y `'Juveniles'` donde el conector escribe `'mayores'` y
 * `'M19'`. Sin normalizar, cada uno cae en una clave propia y queda solo — que
 * es exactamente lo que le pasa hoy al Top 14 Superior.
 *
 * `'Juveniles'` NO se puede mapear a un M concreto desde acá (no dice de qué
 * edad), así que se deja como está: la fila hay que corregirla en la base, y
 * este normalizador no puede inventar el dato que falta.
 */
export function normalizeAgeGrade(value: string | null | undefined): string {
  const v = String(value ?? '').trim();
  if (!v) return '';
  if (/^mayores/i.test(v)) return 'mayores';         // 'Mayores', 'Mayores (Adults)'
  const m = v.match(/^m\s*(\d{2})$/i);
  if (m) return `M${m[1]}`;
  return v;
}

/**
 * El género. `null` cuenta como masculino a propósito.
 *
 * En URBA el femenino SIEMPRE viene declarado —`gender = 'femenino'` y además
 * `category = 'Femenino'`—, así que un NULL nunca es un femenino sin marcar: es
 * una fila vieja a la que nadie le escribió el campo. Tratarlo como una tercera
 * categoría parte competencias masculinas en dos.
 */
export function normalizeGender(value: string | null | undefined): string {
  const v = String(value ?? '').trim().toLowerCase();
  return v === 'femenino' ? 'femenino' : 'masculino';
}

export interface TournamentIdentityFields {
  category?: string | null;
  subcategory?: string | null;
  age_grade?: string | null;
  gender?: string | null;
}

/**
 * La clave de la COMPETENCIA: lo que se mantiene igual entre temporadas.
 *
 * Dos torneos con la misma `competitionKey` y distinto `season_id` son dos
 * ediciones de lo mismo, y por eso van juntos en el desplegable de temporadas.
 *
 * `subcategory` en null se serializa como `∅` y no como cadena vacía: así una
 * competencia sin grado (femenino, universitario) no colisiona con una cuyo
 * grado sea el string vacío, que sería un dato roto y no un "no tiene".
 */
export function competitionKey(t: TournamentIdentityFields): string {
  return [
    normalizeCategory(t.category),
    t.subcategory ?? '∅',
    normalizeAgeGrade(t.age_grade),
    normalizeGender(t.gender),
  ].join('|');
}

/**
 * La clave de la DIVISIÓN dentro de una temporada: lo que comparten los grados
 * de una misma competencia. Es la del otro desplegable, el de tipo de torneo.
 *
 * Es `competitionKey` sin la `subcategory` y con el año: los hermanos de un
 * torneo son los que comparten división y se distinguen justamente por el grado.
 */
export function divisionKey(t: TournamentIdentityFields & { season_id?: string | number | null }): string {
  return [
    String(t.season_id ?? ''),
    normalizeCategory(t.category),
    normalizeAgeGrade(t.age_grade),
    normalizeGender(t.gender),
  ].join('|');
}

/**
 * El orden de los grados en el desplegable: jerárquico, no alfabético.
 * "Intermedia" va antes que "Preintermedia" porque está más arriba, no porque
 * empiece con I.
 */
const ORDEN_GRADO = [
  'Superior', 'Intermedia', 'Preintermedia',
  'Preintermedia A', 'Preintermedia B', 'Preintermedia C',
  'Preintermedia D', 'Preintermedia E', 'Preintermedia F',
  'M22', 'juvenil',
];

/** Índice de orden de un grado. Lo desconocido va al final, en orden alfabético. */
export function ordenDeSubcategory(subcategory: string | null | undefined): number {
  const i = ORDEN_GRADO.indexOf(String(subcategory ?? '').trim());
  return i === -1 ? ORDEN_GRADO.length : i;
}

/** Ordena grados por jerarquía; los que no están en la lista, alfabéticos al final. */
export function ordenarSubcategories(valores: (string | null)[]): (string | null)[] {
  return [...valores].sort((a, b) => {
    const d = ordenDeSubcategory(a) - ordenDeSubcategory(b);
    return d !== 0 ? d : String(a ?? '').localeCompare(String(b ?? ''));
  });
}
