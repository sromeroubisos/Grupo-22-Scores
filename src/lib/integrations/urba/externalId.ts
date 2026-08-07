/**
 * La identidad de un equipo de URBA — única implementación.
 *
 * URBA no tiene un id estable por equipo: `teams[].id` cambia cada temporada y
 * `teams[].club_id` identifica a la INSTITUCIÓN, no al equipo que juega. Un club
 * mete varios equipos a la vez (GEBA juega mayores, intermedia y cuatro
 * preintermedias), así que lo que identifica a un equipo es el triple
 *
 *     (club_id de URBA, categoría del torneo, sufijo del equipo)
 *
 * Este módulo es el ÚNICO lugar donde ese triple se serializa y se parsea. Lo usan
 * el generador del CSV de mapeo y, después, el resolvedor de partidos de la sync.
 * Si hubiera dos implementaciones se desincronizarían y los partidos dejarían de
 * encontrar su club en silencio, sin error: por eso hay una sola y tiene tests.
 *
 * Formato: `{urba_club_id}|{categoria}|{sufijo}`
 * El sufijo vacío es string vacío — nunca null, nunca "A" por defecto.
 */

import { ejeJuvenil } from './ejeJuvenil.ts';

export const URBA_PROVIDER = 'urba';

/** Separador del triple. No puede aparecer dentro de ningún componente. */
const SEP = '|';

/**
 * Categorías canónicas. Salen del nombre del torneo, no del equipo.
 * M18 y M20 son del histórico 2021-2022 (URBA cambió los cortes de edad después);
 * `empresarial` y `universitario` son competencias propias, no divisiones.
 */
export const URBA_CATEGORIAS = [
  'mayores',
  'intermedia',
  'preintermedia',
  'femenino',
  'universitario',
  'formativo',
  'empresarial',
  'M15',
  'M16',
  'M17',
  'M18',
  'M19',
  'M20',
  'M22',
] as const;

export type UrbaCategoria = (typeof URBA_CATEGORIAS)[number];

/** Sufijos observados en los 776 torneos de 2021-2026: de A a H, más el vacío. */
export const URBA_SUFIJOS = ['', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const;

export type UrbaSufijo = (typeof URBA_SUFIJOS)[number];

export interface UrbaTeamTriple {
  urbaClubId: number;
  categoria: UrbaCategoria;
  sufijo: UrbaSufijo;
}

const CATEGORIAS = new Set<string>(URBA_CATEGORIAS);
const SUFIJOS = new Set<string>(URBA_SUFIJOS);

function normalizeClubId(value: number | string): number {
  const n = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`urba_club_id inválido: ${JSON.stringify(value)} (se espera un entero positivo)`);
  }
  return n;
}

function normalizeCategoria(value: string): UrbaCategoria {
  const v = String(value ?? '').trim();
  if (!CATEGORIAS.has(v)) {
    throw new Error(
      `categoría inválida: ${JSON.stringify(value)}. Válidas: ${URBA_CATEGORIAS.join(', ')}`,
    );
  }
  return v as UrbaCategoria;
}

/**
 * Ausencia de sufijo es string vacío. Se aceptan null/undefined como entrada
 * porque el CSV y la API los producen, pero salen siempre como ''.
 * NO se completa con "A": si URBA no informa la letra, el equipo no es el "A".
 */
function normalizeSufijo(value: string | null | undefined): UrbaSufijo {
  const v = String(value ?? '').trim().toUpperCase();
  if (!SUFIJOS.has(v)) {
    throw new Error(
      `sufijo inválido: ${JSON.stringify(value)}. Válidos: vacío o ${URBA_SUFIJOS.filter(Boolean).join(', ')}`,
    );
  }
  return v as UrbaSufijo;
}

/**
 * Serializa el triple al `external_id` que va en `club_external_ids`.
 *
 * @example buildUrbaExternalId({ urbaClubId: 30, categoria: 'preintermedia', sufijo: 'B' })
 *          // '30|preintermedia|B'
 * @example buildUrbaExternalId({ urbaClubId: 30, categoria: 'mayores', sufijo: '' })
 *          // '30|mayores|'
 */
export function buildUrbaExternalId(input: {
  urbaClubId: number | string;
  categoria: string;
  sufijo?: string | null;
}): string {
  const urbaClubId = normalizeClubId(input.urbaClubId);
  const categoria = normalizeCategoria(input.categoria);
  const sufijo = normalizeSufijo(input.sufijo);
  return `${urbaClubId}${SEP}${categoria}${SEP}${sufijo}`;
}

/**
 * Inversa de `buildUrbaExternalId`. Devuelve null si la cadena no es un triple
 * válido, para que el que consulta decida qué hacer en vez de recibir basura.
 */
export function parseUrbaExternalId(externalId: string): UrbaTeamTriple | null {
  if (typeof externalId !== 'string') return null;
  const parts = externalId.split(SEP);
  if (parts.length !== 3) return null;
  try {
    return {
      urbaClubId: normalizeClubId(parts[0]),
      categoria: normalizeCategoria(parts[1]),
      sufijo: normalizeSufijo(parts[2]),
    };
  } catch {
    return null;
  }
}

/**
 * El sufijo tal como URBA lo publica: la última palabra del nombre del equipo
 * cuando es una sola letra de A a H ("SIC A", "Hindu D", "Newman H").
 * Devuelve '' cuando no hay letra — que es un dato, no un faltante.
 */
export function extractSufijoFromTeamName(teamName: string): UrbaSufijo {
  const m = String(teamName ?? '').trim().match(/\s+([A-H])$/);
  return (m ? m[1] : '') as UrbaSufijo;
}

/* ────────────────────────────────────────────────────────────────────────────
 * CUANDO URBA SE EQUIVOCA DE INSTITUCIÓN
 *
 * >>> El porqué completo, con las CINCO pruebas que fijan de qué lado está el
 * >>> error, está en `docs/urba-club-id-14.md`. Leelo antes de tocar esto.
 *
 * El triple entero se apoya en que `teams[].club_id` identifica a la institución.
 * En 2021-2023 hay un caso donde no: URBA publicó los equipos de SAN ANDRÉS con
 * el `club_id` de SAN ALBANO.
 *
 * Está medido sobre los 811 payloads. De los 153 `club_id` distintos, 44 aparecen
 * con más de un nombre — y 43 son variantes de escritura del MISMO club
 * ("Belgrano Athletic" / "Belgrano Athl.", "Tiro Federal de San Pedro" /
 * "T.F. de San Pedro"), que son inofensivas porque el nombre no entra en el
 * triple. Queda UNO solo donde los dos nombres son instituciones distintas:
 *
 *     club_id 14 → "San Albano"  116 apariciones  2021-2026
 *                  "San Andrés"   53 apariciones  2021-2023
 *
 * San Andrés TIENE su propio `club_id` en URBA —el 31— y sus 17 triples ya están
 * mapeados a los registros `san-andres-*`. O sea que el dato correcto existe: lo
 * que falla es de qué institución cuelga el equipo en esos 53 casos.
 *
 * Sin esta corrección la carga histórica escribe **553 partidos de San Andrés
 * como si fueran de San Albano**, y sólo 13 fallan de forma visible (los
 * cruces directos entre los dos, que caen por "mismo club de los dos lados").
 * Los otros 553 entran sin un error, y el motor de posiciones los suma en la
 * fila de San Albano. Es el mismo modo de falla que los tres equipos de Newman.
 *
 * URBA lo arregló solo: desde 2024 no vuelve a aparecer. La corrección igual va
 * en el conector y no en un UPDATE post-carga, porque el histórico se puede
 * volver a cargar y el `external_id` haría que la segunda pasada no lo tocara.
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * `club_id` que URBA usa mal, con el nombre que delata al dueño real.
 *
 * La clave es el `club_id` equivocado; adentro, el nombre de la institución que
 * NO le corresponde y el `club_id` que sí. Se compara sobre el nombre
 * normalizado y sin el sufijo de equipo, para que "San Andres B" y
 * "San Andres" caigan los dos.
 */
const CLUB_ID_CORREGIDO: Readonly<Record<number, Readonly<Record<string, number>>>> = Object.freeze({
  14: Object.freeze({ 'san andres': 31 }),
});

/**
 * El `club_id` que de verdad le corresponde a un equipo.
 *
 * Devuelve el mismo que entró en el 99,9% de los casos: sólo se mueve cuando el
 * par (club_id, nombre) está en la tabla de arriba. No adivina ni compara por
 * parecido — una corrección por heurística acá reasignaría equipos legítimos.
 */
export function corregirUrbaClubId(urbaClubId: number | string, teamName: string): number {
  const id = normalizeClubId(urbaClubId);
  const correcciones = CLUB_ID_CORREGIDO[id];
  if (!correcciones) return id;

  const nombre = String(teamName ?? '')
    .trim()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+[a-h]$/, '')      // el sufijo de equipo no distingue institución
    .replace(/\s+/g, ' ')
    .trim();

  return correcciones[nombre] ?? id;
}

/* ────────────────────────────────────────────────────────────────────────────
 * TORNEOS Y PARTIDOS
 *
 * Acá el riesgo es el inverso al del triple: la cadena es trivial de armar, y por
 * eso mismo invita a escribirla a mano en el conector (`'urba:' + id`). Si eso
 * pasa, el día que la convención cambie el conector se desincroniza del
 * inventario EN SILENCIO — los partidos dejan de encontrar su torneo y no salta
 * ningún error, sólo faltan filas.
 *
 * Y el prefijo no es decorativo: `tournaments.external_id` y `matches.external_id`
 * son columnas COMPARTIDAS, sin columna `provider` al lado. Sin prefijo,
 * un id numérico de URBA podría colisionar con el de otro proveedor y el UNIQUE
 * parcial rechazaría una fila legítima — o peor, la ataría al torneo equivocado.
 *
 * A diferencia del triple del equipo, acá el id SÍ es estable: URBA no lo cambia
 * entre consultas. No hace falta componer nada.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Prefijo de proveedor para columnas `external_id` compartidas. */
export const URBA_ID_PREFIX = 'urba:';

/** Un id de URBA es un entero positivo; los torneos de 2026 rondan los 2.025.xxx. */
function normalizeUrbaId(value: number | string, what: string): number {
  const n = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`${what} inválido: ${JSON.stringify(value)} (se espera un entero positivo)`);
  }
  return n;
}

/**
 * `external_id` de un torneo de URBA, para `tournaments.external_id`.
 *
 * @example buildUrbaTournamentExternalId(2025176)  // 'urba:2025176'
 */
export function buildUrbaTournamentExternalId(urbaTournamentId: number | string): string {
  return `${URBA_ID_PREFIX}${normalizeUrbaId(urbaTournamentId, 'urba_tournament_id')}`;
}

/**
 * `external_id` de un partido de URBA, para `matches.external_id`.
 * Misma convención que el torneo a propósito: un solo prefijo que aprender.
 *
 * @example buildUrbaMatchExternalId(2023134558)  // 'urba:2023134558'
 */
export function buildUrbaMatchExternalId(urbaMatchId: number | string): string {
  return `${URBA_ID_PREFIX}${normalizeUrbaId(urbaMatchId, 'urba_match_id')}`;
}

/**
 * Inversa de las dos anteriores. Devuelve null si la cadena no es un id de URBA
 * —incluido el caso de un id de OTRO proveedor—, para que el llamador distinga
 * "no es mío" de "es mío y está roto" sin recibir un NaN.
 */
export function parseUrbaId(externalId: string): number | null {
  if (typeof externalId !== 'string') return null;
  if (!externalId.startsWith(URBA_ID_PREFIX)) return null;
  const rest = externalId.slice(URBA_ID_PREFIX.length);
  if (!/^[0-9]+$/.test(rest)) return null;
  try {
    return normalizeUrbaId(rest, 'urba_id');
  } catch {
    return null;
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 * LA SERIE — el vínculo entre las ruedas de una misma competencia
 *
 * URBA parte muchas competencias en dos torneos con ids distintos. Se cargan
 * SEPARADOS, porque el campo de equipos cambia entre una rueda y otra —el
 * solapamiento medido va de 2 sobre 9 a 9 sobre 12— y una tabla que las fusione
 * ordena clubes que nunca se enfrentaron. Eso no es una vista fea: es una
 * afirmación falsa, y además una afirmación NUESTRA, porque la fuente ya los
 * modela separados (los `played` no acumulan, cada rueda tiene su
 * `championship_id`, sus `team_id` y sus contadores).
 *
 * Lo que sí se guarda es el VÍNCULO, y sólo donde es seguro: la serie deja que
 * la pantalla ofrezca "Segunda Rueda de este torneo" sin que el modelo afirme
 * que son una sola competencia.
 *
 * ── La disciplina, que es la misma que la de `ambiguo` ──
 * Un vínculo inventado es peor que ninguno. La serie se arma SÓLO cuando las
 * mitades aparean por nombre base y año. Las que no aparean quedan sin serie y
 * se cuentan en el informe — nunca se adivina cuál es la segunda rueda de cuál.
 * ──────────────────────────────────────────────────────────────────────────── */

export const URBA_SERIES_PREFIX = `${URBA_PROVIDER}:serie:`;

/**
 * La clave de una serie, anclada al id MÁS BAJO de sus miembros.
 *
 * Anclarla a un id real y no a un hash del nombre es deliberado: el nombre es
 * justamente lo que URBA escribe distinto en cada mitad, así que una clave
 * derivada del nombre se rompería con la próxima edición. El id no se mueve.
 *
 * @example buildUrbaSeriesKey([2025313, 2025261]) // 'urba:serie:2025261'
 */
export function buildUrbaSeriesKey(urbaTournamentIds: readonly (number | string)[]): string {
  if (!Array.isArray(urbaTournamentIds) || urbaTournamentIds.length === 0) {
    throw new Error('una serie necesita al menos un torneo');
  }
  const ids = urbaTournamentIds.map((id) => normalizeUrbaId(id, 'urba_tournament_id'));
  return `${URBA_SERIES_PREFIX}${Math.min(...ids)}`;
}

/** Inversa: el id ancla de una serie, o `null` si la cadena no es una serie. */
export function parseUrbaSeriesKey(seriesKey: string): number | null {
  if (typeof seriesKey !== 'string') return null;
  if (!seriesKey.startsWith(URBA_SERIES_PREFIX)) return null;
  const rest = seriesKey.slice(URBA_SERIES_PREFIX.length);
  if (!/^[0-9]+$/.test(rest)) return null;
  try {
    return normalizeUrbaId(rest, 'urba_id');
  } catch {
    return null;
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 * NOMBRE NORMALIZADO PARA EL CRUCE
 *
 * Los DOS lados del cruce —la columna `nombre_norm` de `stg_urba_torneos` y el
 * `normalizar(t.name)` que se aplica sobre `public.tournaments`— tienen que salir
 * de esta función. Si divergen, el LEFT JOIN no encuentra nada y el resultado se
 * lee como "no existe ninguno" en vez de como "la normalización no coincide".
 * Es el mismo modo de falla silencioso del triple de equipo.
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * La categoría del triple, derivada del NOMBRE del torneo.
 *
 * No se puede leer de `stg_urba_torneos.age_grade`: esa columna es el corte de
 * EDAD (`mayores` para todo lo adulto), y la categoría del triple distingue
 * además `intermedia` de `preintermedia` de `mayores`. Usar `age_grade` arma
 * `{club}|mayores|B` donde el mapeo tiene `{club}|preintermedia|B`, y el partido
 * no encuentra su club — 1.946 partidos omitidos en la primera corrida en seco.
 *
 * Es LA MISMA derivación con la que se generó `club_external_ids`. Si acá se
 * cambia y allá no, el mapeo entero deja de resolver en silencio.
 *
 * Tres convenciones de nombre conviven en el histórico:
 *   `Menores de 17 - …` · `Juveniles - … - M 17 - …` (con espacio) · `… M17 …`
 */
export function categoriaDeTorneoUrba(nombre: string): UrbaCategoria | null {
  const n = String(nombre ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/^urba:\s*/, '');   // los torneos de G22 llevan el prefijo en el name

  // Los "Menores de N" mandan sobre todo lo demás: un M19 puede llamarse
  // "… Segunda Rueda - G2 Nivel 1 Intermedia" y NO es intermedia.
  const m = n.match(/menores de (\d{2})/);
  if (m) return (CATEGORIAS.has(`M${m[1]}`) ? `M${m[1]}` : null) as UrbaCategoria | null;
  const m2 = n.match(/\bm\s?(15|16|17|18|19|20|22)\b/);
  if (m2) return `M${m2[1]}` as UrbaCategoria;

  if (/femenin/.test(n)) return 'femenino';
  if (/universitario/.test(n)) return 'universitario';
  if (/formativ/.test(n)) return 'formativo';
  if (/empresarial/.test(n)) return 'empresarial';
  if (/preintermedia|pre intermedia/.test(n)) return 'preintermedia';
  if (/intermedia/.test(n)) return 'intermedia';
  if (/superior/.test(n)) return 'mayores';
  // Divisiones mayores sin el sufijo "- Superior": "Segunda" a secas,
  // "TOP 12 - Play Off", "Primera A - Pre-Desarrollo".
  if (/^(top\s*\d+|primera\s*[abc]?|segunda|tercera|desarrollo)\b/.test(n.trim())) return 'mayores';
  return null;
}

/**
 * El GRADO del torneo, para `tournaments.subcategory`.
 *
 * Es otra pregunta que `categoriaDeTorneoUrba`, aunque las dos empiecen por la
 * edad. Allá el corte de edad ES la respuesta —define el triple del equipo—;
 * acá es sólo el desvío hacia el eje que corresponde:
 *
 *   'Menores de 17 - Segunda Rueda - G2 Intermedia'
 *      categoria    -> 'M17'             (para el triple del club)
 *      subcategory  -> 'G2 Intermedia'   (para la navegación)
 *
 * En mayores el grado es Superior / Intermedia / Preintermedia; en juveniles es
 * el grupo y la zona. Son la misma pregunta en distinto idioma, y por eso las
 * dos terminan en esta columna.
 *
 * `null` NO es inocuo: un torneo sin subcategory queda fuera de la navegación
 * por grados y no se entera nadie. Hoy caen ahí, a propósito, los tres de
 * Femenino, el Universitario y los dos de Formativo: no tienen grado en el
 * sentido de esta columna. Cualquier otro null es un torneo que hay que mirar.
 *
 * Reproduce exactamente el backfill de los 134 torneos de 2026 — está pineado
 * en `subcategoria.test.ts` contra las 134 filas.
 */
export function subcategoriaDeTorneoUrba(nombre: string): string | null {
  const n = String(nombre ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/^urba:\s*/, '')
    .replace(/["'`´’]/g, '')
    .trim();

  // M22 antes que juvenil: "Menores de 22" es un grado, no una categoría juvenil.
  if (/menores de 22|\bm\s?22\b/.test(n)) return 'M22';

  // JUVENILES ANTES QUE LOS GRADOS DE MAYORES.
  //
  // En juveniles el grado ES el eje de grupo y zona: es lo que subdivide una
  // competencia juvenil, igual que Superior / Intermedia / Preintermedia
  // subdividen una de mayores. Ver `ejeJuvenil.ts`.
  //
  // El orden importa y antes estaba al revés. Un `Menores de 17 - G2 Intermedia`
  // caía en la rama genérica de Intermedia y salía `'Intermedia'` a secas, así
  // que `G1 Intermedia`, `G2 Intermedia` y `G2 Nivel 1 Intermedia` —tres
  // competencias distintas de la misma división— colapsaban en un solo valor.
  // Medido: la diferencia entre 58 y 85 valores distintos sobre los 554 juveniles.
  //
  // El `'juvenil'` de respaldo queda para el torneo cuyo nombre no traiga eje
  // ninguno: es preferible a un NULL, que lo dejaría fuera de la navegación.
  if (/menores de (15|16|17|18|19|20)\b/.test(n) || /\bm\s?(15|16|17|18|19|20)\b/.test(n)) {
    return ejeJuvenil(nombre) ?? 'juvenil';
  }

  // Preintermedia antes que Intermedia: la segunda es subcadena de la primera.
  const pre = n.match(/pre\s?-?\s?intermedia(?:\s+([a-h]))?\b/);
  if (pre) return pre[1] ? `Preintermedia ${pre[1].toUpperCase()}` : 'Preintermedia';
  if (/\bintermedia\b/.test(n)) return 'Intermedia';

  // "… de la URBA" es la forma vieja de nombrar la Superior: los cuatro torneos
  // que ya existían antes de la carga no llevan el sufijo "- Superior".
  if (/\bsuperior\b/.test(n) || /de la urba$/.test(n)) return 'Superior';

  // Una división de mayores que llegó hasta acá NO tiene grado en el nombre, y
  // eso en URBA significa la Superior: la Intermedia y las Preintermedias SÍ lo
  // llevan siempre. En 2026 no pasa —todas se llaman "… - Superior"—, pero el
  // histórico está lleno: `Segunda` a secas (2021), `TOP 12 - Play Off`,
  // `Primera A - Pre-Desarrollo` (2025). Sin esta línea son 7 torneos que quedan
  // con subcategory NULL, o sea fuera del desplegable de grados, sin que nada falle.
  //
  // Se apoya en `categoriaDeTorneoUrba` a propósito: la pregunta "¿es una división
  // de mayores?" ya está contestada ahí, con su lista de divisiones y sus tests.
  // Duplicar el regex acá sería la segunda implementación que después diverge.
  if (categoriaDeTorneoUrba(nombre) === 'mayores') {
    // …salvo que lo que el nombre trae no sea un grado sino una INSTANCIA.
    //
    // `TOP 12 - Play Off` no es la Superior: es la fase final DE la Superior.
    // Llamarlo 'Superior' hacía que el Top 12 de 2025 tuviera dos torneos con la
    // misma `competitionKey` y el mismo año, y entonces el menú de temporadas
    // del Top 14 ofrecía "2025" DOS VECES. Un menú que ofrece el mismo año dos
    // veces obliga a elegir sin datos.
    //
    // Con grado propio se acomoda solo, y en los dos menús: `competitionKey`
    // incluye la subcategory, así que el año deja de duplicarse, y el Play Off
    // pasa a ofrecerse en el menú de GRADO de su división, que es donde uno lo
    // busca cuando está parado en el Top 12.
    //
    // Sólo entra acá el torneo cuyo nombre NO dice ningún grado: los 24 que sí
    // lo dicen (`TOP 13 - Superior - Final`) ya salieron por las ramas de
    // arriba y conservan el suyo. Medido sobre los 811: son 5, los cinco Play
    // Off de 2025.
    return instanciaDeTorneoUrba(nombre) ?? 'Superior';
  }

  return null;
}

/**
 * Las fases de definición, cuando URBA las publica como un torneo aparte.
 *
 * El orden importa: `Semifinal` va antes que `Final` porque "semi final" —con
 * espacio, y URBA lo escribe de las dos formas— matchea las dos.
 */
const INSTANCIAS: Array<readonly [string, RegExp]> = [
  ['Play Off', /\bplay\s?-?\s?offs?\b/],
  ['Semifinal', /\bsemi\s?-?\s?finals?\b/],
  ['Final', /\bfinals?\b/],
  ['Clasificación', /\b(?:re)?clasificacion\b/],
  ['Ascenso', /\bascensos?\b/],
  ['Permanencia', /\bpermanencia\b/],
];

/**
 * La INSTANCIA que nombra un torneo, o null si nombra una competencia entera.
 *
 * Es una tercera dimensión, perpendicular al grado: un torneo puede ser de la
 * Superior Y ser su semifinal. Por eso esto no reemplaza a `subcategory` en
 * general — sólo la ocupa cuando el nombre no trae ningún grado y el hueco lo
 * iba a llenar un `Superior` inventado.
 */
export function instanciaDeTorneoUrba(nombre: string): string | null {
  const n = String(nombre ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/^urba:\s*/, '')
    .trim();

  return INSTANCIAS.find(([, re]) => re.test(n))?.[0] ?? null;
}

/**
 * Normalización MÍNIMA y predecible del nombre de un torneo, para comparar.
 *
 *   · a minúsculas
 *   · sin acentos
 *   · sin puntos ni comillas
 *   · espacios múltiples colapsados a uno
 *   · sin espacios al principio ni al final
 *
 * Y nada más: no saca palabras, no reordena, no quita artículos ni guiones. La
 * decisión de qué vincula la toma una persona mirando los casos, y para eso la
 * transformación tiene que ser fácil de predecir de cabeza.
 *
 * Los puntos y comillas se BORRAN, no se reemplazan por espacio: así `Bs. As.`
 * queda `bs as` (el espacio ya estaba) y `R.C.` queda `rc` en vez de `r c`.
 *
 * @example normalizeTournamentName('  TOP 14 -  Superior ')      // 'top 14 - superior'
 * @example normalizeTournamentName('Ciudad "B" - Damas')          // 'ciudad b - damas'
 */
export function normalizeTournamentName(value: string | null | undefined): string {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')   // acentos
    .replace(/["'`´’.]/g, '')           // puntos y comillas, sin dejar espacio
    .replace(/\s+/g, ' ')
    .trim();
}
