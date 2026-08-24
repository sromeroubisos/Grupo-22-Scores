/**
 * Adaptador del Torneo del Interior (A/B/C), el Nacional de Clubes (A/B) y el
 * Regional del Centro (A/B) de rugbyarchive.net al import histórico de G22.
 *
 * Competiciones de la fuente:
 *   118 → Torneo del Interior (la rama principal; 1998-2000 sin letra)
 *   119 → Torneo del Interior B (existe desde 2001)
 *   462 → Torneo del Interior C (una sola edición: 2018)
 *   114 → Nacional de Clubes
 *   115 → Nacional de Clubes B (1993, 2001-2002 solo campeón; 2005/2017/2018 completas)
 *   128 → Torneo del Centro (2007-2013 y 2017; en 2011 fue "Torneo Cuatro
 *         Regiones"). Es el torneo REGIONAL entre el Litoral y Córdoba: no
 *         está relacionado ni con el Top 10 del Centro ni con el Súper 9 "B",
 *         que son la línea de la Unión Cordobesa (pedido explícito del usuario).
 *   129 → Torneo del Centro B (2007-2008 como llave interregional con
 *         invitados uruguayos, 2017 como "Copa de Plata")
 *   457 → Copa Amistad (tercera copa de 2017): detectada pero NO se importa —
 *         no es segunda división y nadie la pidió todavía.
 *   650 → Torneo Preparación Córdoba (2021, asociada al Cordobés): tampoco.
 *
 * OJO con la herencia del padre: cuando una rama (119/462/115) no tiene datos
 * propios en un año, la API devuelve el payload del PADRE con su nombre. La
 * verdad está en `competizioneStagione.nomeCompetizione`: si no coincide con
 * el esperado de la rama, esa temporada NO es de la rama y se saltea.
 */

export interface CompetenciaInterior {
  comp: number;
  /**
   * Nombre de referencia de la competición (documental). La pertenencia de un
   * payload se decide por `competizioneStagione.idCompetizione === comp`: los
   * heredados del padre traen el id del PADRE, y el nombre puede cambiar por
   * época (la URBA fue Campeonato de Buenos Aires, Top 14, Top 12…).
   */
  nombreEsperado: string;
  slug: string;
  /** Años a intentar (los que la API lista para el árbol padre). */
  years: string[];
  /** El segundo argumento es el `nomeCompetizione` del payload de ESA temporada (para nombrar por era). */
  nombreTemporada: (year: string, nomeFuente: string) => string;
  /** Solo para torneos que hay que crear. */
  crear?: {
    name: string;
    priority: number;
    /** season_id (texto) con el que nace la fila del torneo. */
    seasonCode: string;
    region: string;
  };
  /**
   * Correcciones de mapeo que valen SOLO en esta competición. La fuente a veces
   * usa el id de un club homónimo de otra región: en el NEA, "San Patricio"
   * aparece como 1397 (el de Pilar, URBA) en 2016 y 2023-2026, y como 1427 (el
   * de Resistencia) en 2002-2022 — es siempre el club del NEA.
   */
  overridesClubMap?: Record<number, string>;
  /**
   * Ids de competición ADEMÁS de `comp` cuyos payloads pertenecen a este
   * torneo. No es la herencia del padre: el Super Rugby Americas (678) es la
   * MISMA competición que la Super Liga Americana de Rugby (579) renombrada
   * (idPrincipale 678 en la fuente), y sus 2020-2022 llegan con el id viejo.
   */
  compsAceptadas?: number[];
  /**
   * Cuando una comp de la fuente contiene DOS torneos de G22 (el Oeste trae el
   * Top 10/Oro y la Plata en el mismo payload), cada entrada se queda solo con
   * las fases que su filtro acepta. Ver `filtrarEstructura`.
   */
  soloFases?: (nombreFuente: string, year: string) => boolean;
  /**
   * El `vincitori` del payload declara al campeón de la línea principal; la
   * rama filtrada (Plata) deriva el suyo de su propia final.
   */
  campeonDesdeLlave?: boolean;
  /**
   * Turno → fase, solo para rótulos que no son ninguna fase de esa temporada.
   * Ver `construirEstructuraDeTemporada` (opts.aliasTurno).
   */
  aliasTurno?: Record<string, string>;
}

const YEARS_INTERIOR = ['1998', '1999', '2000', '2001', '2002', '2003', '2004', '2009', '2010', '2011', '2012', '2013', '2014', '2015', '2016', '2017', '2018', '2019', '2022', '2023', '2024', '2025', '2026'];
const YEARS_CENTRO = ['2007', '2008', '2009', '2010', '2011', '2013', '2017'];
const YEARS_NACIONAL = ['1973', '1993', '1994', '1995', '1996', '1997', '1998', '1999', '2001', '2002', '2003', '2004', '2005', '2006', '2007', '2008', '2009', '2010', '2011', '2014', '2015', '2016', '2017', '2018', '2019', '2022', '2023', '2024', '2025'];

// La URBA arranca en 1899; 1916 no está en la lista de la fuente.
const YEARS_URBA: string[] = [];
for (let y = 1899; y <= 2026; y++) if (y !== 1916) YEARS_URBA.push(String(y));
// El NEA corta en 2025: su 2026 está en juego y G22 no lo tiene cargado a
// mano (importarlo a mitad de temporada lo dejaría como 'completed' mintiendo).
const YEARS_NEA: string[] = [];
for (let y = 1999; y <= 2025; y++) YEARS_NEA.push(String(y));
const YEARS_LITORAL: string[] = [];
for (let y = 2000; y <= 2026; y++) YEARS_LITORAL.push(String(y));

// ── Tanda regionales 2026-08 (comps 678, 123, 124, 125, 127) ────────────────
// El 2026 de todos estos torneos vive en G22 cargado a mano (fixture en curso);
// la guarda de season_code lo saltea, pero el año va en la lista para que el
// día que se relean estas comps el runner lo considere.
const YEARS_SRA = ['2020', '2021', '2022', '2023', '2024', '2025', '2026'];
// El NOA arranca en 1944; 1950 no está en la lista de la fuente.
const YEARS_NOA: string[] = [];
for (let y = 1944; y <= 2026; y++) if (y !== 1950) YEARS_NOA.push(String(y));
const YEARS_OESTE: string[] = [];
for (let y = 2000; y <= 2026; y++) YEARS_OESTE.push(String(y));
const YEARS_PAMPEANO: string[] = [];
for (let y = 2008; y <= 2026; y++) YEARS_PAMPEANO.push(String(y));
const YEARS_PATAGONICO: string[] = [];
for (let y = 2008; y <= 2026; y++) YEARS_PATAGONICO.push(String(y));

/**
 * ¿Esta fase del Oeste (comp 124) pertenece a la línea PLATA?
 * Decidido fase por fase contra la membresía real de clubes (2026-08):
 *  - Las reválidas/reubicaciones "Oro/Plata" y "Top 8 / Ascenso" son la
 *    frontera de ARRIBA y quedan en Oro (mismo criterio que la Promoción del
 *    Litoral, que vive en la A).
 *  - Todo lo "Plata", "Plata/Bronce" y "Plata/Desarrollo" es de la Plata.
 *  - El "Torneo Ascenso" 2019 es la segunda división de ese año (mismos
 *    clubes que el Torneo Plata 2021+): va a Plata. El "Zona Ascenso" 2001 NO:
 *    es la frontera del torneo único con las ligas de abajo y queda en Oro.
 *  - La "Reubicacion" 2023 la jugaron cuatro clubes de la Plata: es de Plata.
 */
function esFaseDePlata(nombreFase: string, year: string): boolean {
  const n = nombreFase.toLowerCase();
  if (/oro\s*\/\s*plata|top 8\s*\/\s*ascenso/.test(n)) return false;
  if (/plata|desarrollo/.test(n)) return true;
  if (year === '2019' && /ascenso/.test(n)) return true;
  if (year === '2023' && n === 'reubicacion') return true;
  return false;
}

/**
 * Nombre por época a partir del `nomeCompetizione` de cada temporada, como en
 * el Torneo Cordobés. La URBA cambió de nombre muchas veces; el torneo de G22
 * es uno solo y la época vive en el nombre de la temporada.
 */
const ERAS: Record<string, string> = {
  'Argentina - Primera Division': 'Primera División',
  'Argentina - Torneo de Invitacion': 'Torneo de Invitación',
  'Argentina - Division Superior': 'División Superior',
  'Argentina - Torneo de la URBA - Grupo I': 'Torneo de la URBA – Grupo I',
  'Argentina - Torneo de la URBA - Primera A': 'Torneo de la URBA – Primera A',
  'Argentina - URBA - Top 12': 'URBA Top 12',
  'Argentina - URBA - Top 13': 'URBA Top 13',
  'Argentina - URBA - Top 14': 'URBA Top 14',
  'Argentina - Segunda Division': 'Segunda División',
  'Argentina - Division de Ascenso': 'División de Ascenso',
  'Argentina - Torneo de la URBA - Primera B': 'Torneo de la URBA – Primera B',
  'Argentina - Torneo de la URBA - Grupo II': 'Torneo de la URBA – Grupo II',
  'Argentina - URBA - 1° Division A': 'URBA Primera A',
  'Argentina - URBA - 1° Division B': 'URBA Primera B',
  'Argentina - URBA - 1° Division C': 'URBA Primera C',
  'Argentina - Torneo regional del NEA': 'Torneo Regional del NEA',
  'Argentina - Torneo regional del Litoral': 'Torneo Regional del Litoral',
};

function nombrePorEra(year: string, nomeFuente: string): string {
  const era = ERAS[nomeFuente] || nomeFuente.replace(/^Argentina - /, '').replace(/^URBA - /, 'URBA ');
  return `${era} ${year}`;
}

export const COMPETENCIAS: CompetenciaInterior[] = [
  {
    comp: 118,
    nombreEsperado: 'Argentina - Torneo del Interior',
    slug: 'torneo-del-interior-a',
    years: YEARS_INTERIOR,
    // Hasta 2000 no existía la "B": el torneo era simplemente el Torneo del
    // Interior. Desde 2001 la rama principal es la "A".
    nombreTemporada: (y) => (Number(y) <= 2000 ? `Torneo del Interior ${y}` : `Torneo del Interior "A" ${y}`),
  },
  {
    comp: 119,
    nombreEsperado: 'Argentina - Torneo del Interior B',
    slug: 'torneo-del-interior-b',
    years: YEARS_INTERIOR,
    nombreTemporada: (y) => `Torneo del Interior "B" ${y}`,
  },
  {
    comp: 462,
    nombreEsperado: 'Argentina - Torneo del Interior C',
    slug: 'torneo-del-interior-c',
    years: YEARS_INTERIOR,
    nombreTemporada: (y) => `Torneo del Interior "C" ${y}`,
    crear: { name: 'Torneo del Interior "C"', priority: 75, seasonCode: '2018', region: 'Interior' },
  },
  {
    comp: 114,
    nombreEsperado: 'Argentina - Nacional de Clubes',
    slug: 'nacional-de-clubes',
    years: YEARS_NACIONAL,
    nombreTemporada: (y) => `Nacional de Clubes ${y}`,
    crear: { name: 'Nacional de Clubes', priority: 88, seasonCode: '2025', region: 'Nacional' },
  },
  {
    comp: 115,
    nombreEsperado: 'Argentina - Nacional de Clubes B',
    slug: 'nacional-de-clubes-b',
    years: YEARS_NACIONAL,
    nombreTemporada: (y) => `Nacional de Clubes "B" ${y}`,
    crear: { name: 'Nacional de Clubes "B"', priority: 78, seasonCode: '2018', region: 'Nacional' },
  },
  {
    comp: 128,
    nombreEsperado: 'Argentina - Torneo del Centro',
    slug: 'regional-del-centro',
    years: YEARS_CENTRO,
    nombreTemporada: (y, nome) => (nome.includes('Cuatro Regiones') ? `Torneo Cuatro Regiones ${y}` : `Torneo del Centro ${y}`),
    crear: { name: 'Regional del Centro', priority: 72, seasonCode: '2017', region: 'Centro' },
  },
  {
    comp: 129,
    nombreEsperado: 'Argentina - Torneo del Centro B',
    slug: 'regional-del-centro-b',
    years: YEARS_CENTRO,
    nombreTemporada: (y, nome) => (nome.includes('Copa de Plata') ? `Copa de Plata ${y}` : `Torneo del Centro "B" ${y}`),
    crear: { name: 'Regional del Centro "B"', priority: 68, seasonCode: '2017', region: 'Centro' },
  },
  // ── URBA (el árbol 116: la rama principal y sus tres divisiones) ──────────
  {
    comp: 116,
    nombreEsperado: 'Argentina - URBA - Top 14',
    slug: 'urba-top-14',
    years: YEARS_URBA,
    nombreTemporada: nombrePorEra,
  },
  {
    comp: 117,
    nombreEsperado: 'Argentina - URBA - 1° Division A',
    slug: 'primera-a-de-la-urba',
    years: YEARS_URBA,
    nombreTemporada: nombrePorEra,
  },
  {
    comp: 342,
    nombreEsperado: 'Argentina - URBA - 1° Division B',
    slug: 'primera-b-de-la-urba',
    years: YEARS_URBA,
    nombreTemporada: nombrePorEra,
  },
  {
    comp: 343,
    nombreEsperado: 'Argentina - URBA - 1° Division C',
    slug: 'primera-c-de-la-urba',
    years: YEARS_URBA,
    nombreTemporada: nombrePorEra,
  },
  // ── Regionales del NEA y del Litoral ──────────────────────────────────────
  // La Segunda División del Litoral NO tiene competición propia en la fuente:
  // el ascenso vive dentro del payload de la Primera (fases Promoción A /
  // Reclasificación A), así que `torneo-regional-del-litoral-b` no recibe
  // temporadas de acá.
  {
    comp: 126,
    nombreEsperado: 'Argentina - Torneo regional del NEA',
    slug: 'torneo-regionale-del-nea-1779542145074',
    years: YEARS_NEA,
    nombreTemporada: nombrePorEra,
    overridesClubMap: { 1397: 'san-patricio' },
  },
  {
    comp: 121,
    nombreEsperado: 'Argentina - Torneo regional del Litoral',
    slug: 'torneo-regional-del-litoral-a',
    years: YEARS_LITORAL,
    nombreTemporada: nombrePorEra,
  },
  // ── Tanda regionales 2026-08: SRA + NOA + Oeste + Pampeano + Patagónico ───
  // Los siete torneos destino YA existen en G22 (ninguno se crea); sus 2026,
  // cargados a mano, se saltean por la guarda de season_code.
  {
    comp: 678,
    nombreEsperado: 'Super Rugby Americas',
    slug: 'super-rugby-americas',
    years: YEARS_SRA,
    // 2020-2022 llegan con el id de la Super Liga Americana de Rugby (579),
    // que es la misma competición renombrada (idPrincipale 678 en la fuente).
    compsAceptadas: [579],
    // La era vive en el nombre de la fuente: SLAR hasta 2022, SRA desde 2023.
    nombreTemporada: (y, nome) => `${nome || 'Super Rugby Americas'} ${y}`,
  },
  {
    // La fuente archiva UNA competición del NOA (la línea principal, 1944-):
    // va entera al "A". El "B" de G22 es la segunda división creada en 2026 y
    // no recibe historia de acá.
    comp: 123,
    nombreEsperado: 'Argentina - Torneo regional del NOA',
    slug: 'torneo-regional-del-noa-a-1786145622450',
    years: YEARS_NOA,
    nombreTemporada: (y) => `Torneo Regional del NOA ${y}`,
  },
  {
    // El Oeste/Cuyano (124) trae las DOS copas en el mismo payload: esta
    // entrada es la línea principal (Top 10 / Copa de Oro) y la de abajo la
    // Plata. El nombre por era sale de la fuente: Torneo Regional del Oeste /
    // Torneo Cuyano / Top 10 Cuyano / Top 9 Cuyano.
    comp: 124,
    nombreEsperado: 'Argentina - Torneo Regional del Oeste',
    slug: 'copa-oro-del-oeste-1779310761566',
    years: YEARS_OESTE,
    nombreTemporada: (y, nome) => `${(nome || 'Torneo Regional del Oeste').replace(/^Argentina - /, '')} ${y}`,
    soloFases: (nombre, year) => !esFaseDePlata(nombre, year),
    // 2015/2016 rotulan las ruedas del Top 8 como "Regular season".
    aliasTurno: { 'Regular season': 'Top 8' },
  },
  {
    comp: 124,
    nombreEsperado: 'Argentina - Torneo Regional del Oeste',
    slug: 'copa-plata-del-oeste-1779311499870',
    years: YEARS_OESTE,
    // La línea Plata cambió de rótulo: Copa de Plata (2014-2018), Torneo
    // Ascenso (2019), Torneo Plata (2021-2025).
    nombreTemporada: (y) => (y === '2019' ? `Torneo Ascenso ${y}`
      : Number(y) >= 2021 && Number(y) <= 2025 ? `Torneo Plata ${y}`
        : `Copa de Plata ${y}`),
    soloFases: esFaseDePlata,
    campeonDesdeLlave: true,
    aliasTurno: { 'Regular season': 'Top 8' },
  },
  {
    comp: 125,
    nombreEsperado: 'Argentina - Torneo regional Pampeano',
    slug: 'torneo-regional-pampeano-1782146358438',
    years: YEARS_PAMPEANO,
    // 2008 se jugó como "Torneo regional Mar del Plata - Sur".
    nombreTemporada: (y, nome) => (nome.includes('Mar del Plata')
      ? `Torneo Regional Mar del Plata - Sur ${y}`
      : `Torneo Regional Pampeano ${y}`),
  },
  {
    comp: 127,
    nombreEsperado: 'Argentina - Torneo regional patagonico',
    slug: 'torneo-regional-patagonico',
    years: YEARS_PATAGONICO,
    // 2008 se jugó como "Torneo regional de los valles".
    nombreTemporada: (y, nome) => (nome.includes('valles')
      ? `Torneo Regional de los Valles ${y}`
      : `Torneo Regional Patagónico ${y}`),
  },
];

/**
 * Mapeo club de rugbyarchive → `clubs.id` de G22, verificado club por club
 * contra la ficha de la fuente (`/api/squadra/{id}`: localita, región, sitio
 * oficial) y el catálogo de la base (nombre, ciudad, unión, deporte).
 *
 * Decisiones que NO son obvias por el nombre (todas con evidencia):
 *  - 1244 "Sporting Club" (MDP) → `ipr-sporting`: la ficha apunta a
 *    iprsportingclub.com.ar — es el mismo club.
 *  - 1267 "Mar del Plata R.C." → `mar-del-plata-club`: la ficha apunta a
 *    mardelplataclub.wordpress.com.
 *  - 1242 "Pueyrredon" (Boulogne) es el de URBA; 1362 "Pueyrredon R.C."
 *    (Mar del Plata) es OTRO club y se crea aparte. No confundirlos.
 *  - 1308 "Champagnat" (General Pacheco, donde está su sede deportiva) es el
 *    de URBA (`club-champagnat`), NO el Champagnat de Montevideo.
 *  - 1229 "Alumni" → `asoc-alumni` (URBA), NO `cd-alumni` (Chile).
 *  - 1394 "Old Boys" (Montevideo) → `old-boys-girls-club` (Uruguay), NO el
 *    Old Boys chileno.
 *  - 1427 "San Patricio R.C." (Resistencia, 1991, juega el Regional del NEA)
 *    → `san-patricio` (URNE; la base lo tiene con ciudad Corrientes, pero es
 *    el único San Patricio del NEA en las dos fuentes). REVISABLE.
 *  - 1305 "Cha Roga" (Santo Tomé) → `cha-roga-r-c` (la base lo tiene como
 *    Rosario; es el único Cha Roga). REVISABLE.
 *  - 1428 "Tacuru Social Club" (Posadas) NO es `tacuru-rugby-hockey-club`
 *    (Mendoza, Cuyo): se crea aparte.
 *  - 1240 "U.N.S.J." es la Universidad Nacional de San Juan; en la base existe
 *    `universidad-nacional-de-san-juan` pero es la entidad de HOCKEY: se crea
 *    la de rugby aparte.
 *  - 1343 "Cordoba Rugby" → `cordoba-rugby-club` (el actual), NO `cordoba-r-c`
 *    (el histórico desaparecido): rugbyarchive los distingue y G22 también.
 */
export const CLUB_MAP_INTERIOR: Record<number, string> = {
  // ── Buenos Aires (URBA) ───────────────────────────────────────────────────
  1220: 'san-isidro-club',
  1224: 'belgrano-athletic',
  1225: 'club-newman',
  1228: 'la-plata',
  1229: 'asoc-alumni',
  1231: 'hindu-club',
  1234: 'san-cirano',
  1235: 'atletico-chascomus',
  1242: 'pueyrredon',
  1247: 'club-pucara',
  1249: 'olivos-r-c',
  1256: 'banco-nacion',
  1257: 'casi',
  1259: 'cuba',
  1272: 'regatas-de-bella-vista',
  1277: 'san-luis',
  1282: 'los-tilos',
  1285: 'san-fernando',
  1308: 'club-champagnat',
  1309: 'buenos-aires-crc',
  1317: 'liceo-naval',
  1318: 'lomas-athletic',
  1325: 'san-martin',
  1328: 'hurling',
  // ── Rosario / Santa Fe / Litoral ──────────────────────────────────────────
  1221: 'jockey-club-de-rosario',
  1223: 'duendes-r-c',
  1248: 'universitario-de-santa-fe',
  1260: 'atletico-del-rosario',
  1265: 'gimnasia-y-esgrima-de-rosario',
  1271: 'santa-fe-r-c',
  1281: 'logaritmo-rugby-club',
  1284: 'universitario-de-rosario',
  1290: 'crai',
  1294: 'old-resian-club',
  1305: 'cha-roga-r-c',
  1334: 'c-a-provincial',
  1336: 'los-caranchos',
  8396: 'jockey-club-de-venado-tuerto',
  // Los del Regional del Centro (128/129) que no jugaban el Interior:
  1333: 'crar',                            // C.Ra.R. de Rafaela (crar.org.ar)
  1335: 'la-salle-jobson',                 // Santa Fe
  1339: 'regatas-belgrano-san-nicolas',    // ficha: "Regatas & Belgrano SN", unión rosarina
  1332: 'atletico-brown-san-vicente',      // San Vicente (Santa Fe), se crea
  1429: 'los-pinguinos-pergamino',         // Pergamino (unión rosarina), se crea
  // ── Córdoba ───────────────────────────────────────────────────────────────
  1204: 'san-martin-de-villa-maria',
  1226: 'cordoba-athletic-club',
  1227: 'jockey-club-cordoba',
  1245: 'club-la-tablada',
  1263: 'tala-rugby-club',
  1278: 'club-palermo-bajo',
  1287: 'jockey-club-de-villa-maria',
  1293: 'club-universitario-de-cordoba',
  1340: 'uru-cure-rugby-club',
  1341: 'los-cuervos-r-c',
  1342: 'carlos-paz-rugby-club',
  1343: 'cordoba-rugby-club',
  // ── Tucumán / Santiago / NOA ──────────────────────────────────────────────
  1230: 'tucuman-lawn-tennis',
  1233: 'tucuman-rugby-club',
  1250: 'universitario-de-tucuman',
  1254: 'los-tarcos',
  1262: 'natacion-y-gimnasia',
  1280: 'huirapuca',
  1283: 'cardenales-r-c',
  1306: 'lince-rugby-club',
  1236: 'old-lions-r-c',
  1307: 'santiago-lawn-tennis-club',
  1350: 'jockey-club-de-tucuman',
  1243: 'gimnasia-y-tiro',
  1269: 'universitario-de-salta',
  1289: 'jockey-club-salta',
  1351: 'tigres-r-c',
  1299: 'club-social-la-rioja',
  // ── Cuyo / San Juan ───────────────────────────────────────────────────────
  1222: 'los-tordos-rugby-club',
  1232: 'liceo-rugby-club',
  1238: 'mendoza-rugby-club',
  1261: 'marista-rugby-club',
  1279: 'teque-r-c',
  1291: 'universitario-de-mendoza',
  1296: 'peumayen-rugby-club',
  1297: 'rivadavia-rugby-club',
  1355: 'banco-rugby-club',
  1650: 'c-p-b-m',
  1264: 'san-juan-rugby-club',
  // ── NEA (URNE / Misiones / Formosa) ───────────────────────────────────────
  1239: 'aranduroga-r-c',
  1253: 'aguara',
  1258: 'centro-cazadores',
  1270: 'taraguy-r-c',
  1276: 'sixty-r-c',
  1300: 'chaja',
  1301: 'capri',
  1391: 'regatas-de-resistencia',
  1400: 'curne',
  1427: 'san-patricio',
  // ── Entre Ríos ────────────────────────────────────────────────────────────
  1186: 'estudiantes-de-parana',
  1268: 'club-tilcara',
  1338: 'parana-rowing',
  // ── Mar del Plata / Oeste / Sur bonaerense ────────────────────────────────
  // 1192 es la página del "seleccionado de Mar del Plata", pero en el Interior
  // A 2016 la fuente lo usó para las 3 fechas de la Zona D del MISMO equipo que
  // en cuartos aparece como 1267 "Mar del Plata R.C." (el 2º de la Zona D jugó
  // ese cuarto). Los dos ids van al mismo club.
  1192: 'mar-del-plata-club',
  1244: 'ipr-sporting',
  1251: 'los-cardos-r-c',
  1252: 'los-miuras',
  1267: 'mar-del-plata-club',
  1286: 'universitario-de-mar-del-plata',
  1288: 'san-ignacio-r-c',
  1295: 'comercial-r-c',
  1237: 'sociedad-sportiva-de-bahia-blanca',
  1298: 'universitario-de-bahia-blanca',
  1361: 'argentino-de-bahia-blanca',
  1396: 'club-el-nacional',
  // ── Patagonia ─────────────────────────────────────────────────────────────
  1241: 'trelew-r-c',
  1246: 'san-jorge-r-c-ua',
  1255: 'roca-r-c',
  1273: 'patoruzu-r-c',
  1303: 'neuquen-r-c',
  1359: 'marabunta-r-c',
  1392: 'comodoro-r-c',
  1393: 'puerto-madryn-r-c',
  1401: 'bigornia-r-c',
  1659: 'calafate-r-c',
  1877: 'deportivo-portugues',
  // ── Uruguay / Paraguay (invitados) ────────────────────────────────────────
  1194: 'montevideo-c-c',
  1389: 'carrasco-polo',
  1390: 'old-christians-club',
  1394: 'old-boys-girls-club',
  1399: 'trebol-de-paysandu',
  5066: 'psg',
  1398: 'curda',
  // ── URBA (tanda 2: comps 116/117/342/343) ─────────────────────────────────
  // Trampas verificadas de esta tanda:
  //  - 1330 "Old Georgians" (Palermo) → `old-georgian` (URBA), NO el
  //    `old-georgians` chileno (ARUSA).
  //  - 1397 "San Patricio" (Pilar) es el de URBA; en el NEA la fuente lo usa
  //    por error para el de Resistencia (override en la comp 126).
  //  - 1339 "Regatas San Nicolas" → `regatas-belgrano-san-nicolas` (rugby,
  //    Unión de Rosario), NO `regatas-de-san-nicolas` (hockey).
  //  - 1337 "Los Pampas" (Rufino) → `pampas-de-rufino`, NO `pampas` (UAR).
  //  - 1322 "Old Philomathian / San Albano" → `san-albano` (mismo club,
  //    renombrado).
  //  - 1404 "Argentino Avellaneda" → `argentino-r-c` (único Argentino de
  //    URBA en las dos fuentes). REVISABLE.
  1310: 'deportiva-francesa',
  1311: 'casa-de-padua',
  1312: 'ciudad-de-buenos-aires',
  1314: 'curupayti',
  1315: 'geba',
  1316: 'liceo-militar',
  1319: 'los-matreros',
  1320: 'manuel-belgrano',
  1321: 'mariano-moreno',
  1322: 'san-albano',
  1323: 'san-andres',
  1324: 'san-carlos',
  1326: 'st-brendan-s',
  1327: 'universitario-de-la-plata',
  1329: 'obras-sanitarias',
  1330: 'old-georgian',
  1397: 'club-san-patricio',
  1402: 'albatros',
  1403: 'club-areco',
  1404: 'argentino-r-c',
  1405: 'atletico-y-progreso',
  1406: 'banco-hipotecario',
  1408: 'centro-naval',
  1409: 'delta-r-c',
  1410: 'don-bosco',
  1411: 'g-y-e-de-ituzaingo',
  1412: 'club-italiano',
  1413: 'la-salle',
  1414: 'lanus-r-c',
  1415: 'las-canas',
  1416: 'los-cedros',
  1417: 'lujan-r-c',
  1418: 'monte-grande',
  1419: 'sitas',
  1420: 'san-marcos',
  1421: 'tigre',
  1422: 'varela-jr',
  1664: 'arsenal-zarate',
  1665: 'los-pinos',
  1666: 'club-daom',
  1668: 'beromama',
  1670: 'san-miguel-r-c',
  1671: 'el-retiro',
  2930: 'porteno',
  3258: 'vicentinos',
  6873: 'mercedes',
  6878: 'virreyes-r-c',
  9334: 'vicente-lopez',
  11101: 'asoc-del-sur',
  11937: 'los-molinos',
  // ── NEA / Litoral (tanda 2: comps 126/121; 1332/1333/1335/1339 ya están
  //    arriba, los agregó la carga del Regional del Centro) ─────────────────
  1337: 'pampas-de-rufino',
  1425: 'caza-y-pesca',
  1653: 'pay-ubre',
  2523: 'italiana-de-charata',
  6004: 'alma-juniors',
  6936: 'san-jose',
  // ── Se crean (no existen en la base) ──────────────────────────────────────
  1240: 'universidad-nacional-de-san-juan-rugby',
  1266: 'estudiantes-de-olavarria',
  1274: 'suri-r-c',
  1275: 'encarnacion-rugby-club',
  1292: 'jockey-club-mar-del-plata',
  1302: 'paraiso-r-c',
  1304: 'azul-rugby-club',
  1348: 'bajo-hondo',
  1362: 'pueyrredon-mar-del-plata',
  1428: 'tacuru-social-club',
  2943: 'jabalies-r-c',
  // ── Se crean (tanda URBA/NEA/Litoral) ─────────────────────────────────────
  // Históricos de la Primera/Segunda porteña. 1331 "Buenos Aires FC" NO es
  // `buenos-aires-crc`: son el pre y el post fusión de 1951, y la fuente los
  // distingue (mismo criterio que `cordoba-r-c` vs `cordoba-rugby-club`).
  // 2957 "Flores A.C." NO es `floresta` (club moderno). 2933 "Oeste R.C." no
  // se fusiona con `del-oeste-rugby` (identidad no comprobada). 9335 "San
  // Ignacio R.C." es porteño (región Buenos Aires en la ficha), NO el de MDP.
  // 1313 C.U.Q. (Club Universitario de Quilmes) NO es `univ-nac-de-quilmes`.
  1331: 'buenos-aires-f-c',
  2915: 'ymca-buenos-aires',
  2944: 'central-buenos-aires',
  2916: 'gimnasia-y-esgrima-la-plata',
  1407: 'belgrano-day-school',
  1669: 'universitario-de-belgrano',
  2957: 'flores-athletic-club',
  2913: 'ateneo-de-la-juventud',
  2917: 'charruas-r-c',
  2922: 'sportivo-barracas',
  2928: 'el-tala-r-c',
  2933: 'oeste-r-c',
  2934: 'deportivo-del-comercio',
  2939: 'atalaya-polo-club',
  2940: 'comunicaciones-r-c',
  2941: 'ypf-r-c',
  2942: 'los-sauces-r-c',
  1313: 'c-u-q',
  1667: 'stepinac',
  9335: 'san-ignacio-buenos-aires',
  // 1672 "San Jose R.C." es porteño (Segunda 1956-59), NO el San José paraguayo (6936)
  1672: 'san-jose-buenos-aires',
  // Filiales "A" de la vieja Segunda División (equipos propios con id propio
  // en la fuente; por regla del proyecto las filiales NUNCA se fusionan con el
  // club principal). REVISABLES como conjunto.
  2918: 'casi-a',
  2919: 'cuba-a',
  2920: 'geba-a',
  2921: 'belgrano-athletic-a',
  2923: 'buenos-aires-f-c-a',
  2924: 'curupayti-a',
  2925: 'hindu-club-a',
  2927: 'ymca-buenos-aires-a',
  2929: 'olivos-r-c-a',
  2931: 'san-isidro-club-a',
  2932: 'old-georgian-a',
  2935: 'obras-sanitarias-a',
  2936: 'club-pucara-a',
  2937: 'deportiva-francesa-a',
  2938: 'san-martin-a',
  // NEA
  1426: 'lomas-r-c-posadas',
  1651: 'san-cipriano',
  1652: 'chaco-r-c',
  6742: 'cataratas-r-c',
  2362: 'paraguay-xv',
  // ── Tanda regionales 2026-08 (comps 678/123/124/125/127) ──────────────────
  // Trampas verificadas de esta tanda (ficha de la fuente + participantes 2026
  // ya cargados en G22, que traen el club_id puesto a mano):
  //  - 6886 "Cobras Brasil Rugby" y 6889 "Yacaré XV" son UN id por franquicia
  //    en toda la historia SLAR/SRA (la ficha ya lleva el nombre actual).
  //  - 10559 "Pampas Rugby" → `pampas` (la franquicia UAR; nada que ver con
  //    `pampas-de-rufino`).
  //  - 1356 "San Jorge R.C." (San Rafael, Mendoza) → `san-jorge-r-c`, NO es
  //    `san-jorge-r-c-ua` (Caleta Olivia, Patagonia; RA 1246, ya mapeado).
  //  - 1395 "Tacuru" (San Martín de Mendoza) → `tacuru-rugby-hockey-club`
  //    (Cuyo), NO el Tacurú de Posadas (1428). El participante 2026 de la
  //    Copa Plata lo confirma.
  //  - 1349 "Tiro Federal" (Salta) → `tiro-federal-salta` (participante del
  //    NOA "B" 2026).
  //  - 1823 "Aguara Guazu" (Aguilares, Tucumán) → `aguara-guazu`, NO `aguara`
  //    (Formosa, NEA; RA 1253).
  //  - 1655 "Sporting Valparaiso" → `sporting-r-c` (Chile): G22 lo tiene con
  //    ciudad "Santiago de Chile" pero es el Sporting de la V Región, único
  //    Sporting chileno en las dos fuentes. REVISABLE.
  //  - 11211 "Los Teros" (San Luis) NO es `los-teros-r-c` (Catamarca): se crea
  //    aparte. REVISABLE como par.
  //  - 6719 "Mercedes San Luis" (Villa Mercedes) NO es `mercedes` (URBA;
  //    RA 6873): se crea aparte.
  //  - 6885 "Los Ceibos" (Córdoba, franquicia SLAR 2020) NO es `ceibos-club`
  //    (Montevideo): se crea aparte.
  // ── Super Rugby Americas / SLAR ──
  883: 'jaguares-xv',
  3153: 'american-raptors',
  6885: 'los-ceibos',
  6886: 'cobras-brasil-xv',
  6887: 'selknam',
  6888: 'cafeteros-pro',
  6889: 'yacare-xv',
  6890: 'penarol',
  10559: 'pampas',
  10560: 'dogos-xv',
  11521: 'tarucas',
  11913: 'capibaras-xv',
  // ── NOA ──
  1349: 'tiro-federal-salta',
  1352: 'jockey-club-santiago',
  1353: 'corsarios-r-c',
  1761: 'santiago-rugby-club',
  1823: 'aguara-guazu',
  3059: 'coipu-r-c',
  5005: 'monteros-r-c',
  // ── Oeste / Cuyo ──
  1354: 'universidad-catolica',
  1356: 'san-jorge-r-c',
  1357: 'alfiles-s-c',
  1358: 'huazihul',
  1360: 'jockey-club-san-juan',
  1395: 'tacuru-rugby-hockey-club',
  1655: 'sporting-r-c',
  1760: 'belgrano-rugby-club',
  1824: 'chancay-r-c',
  6719: 'mercedes-san-luis',
  11211: 'los-teros-san-luis',
  // ── Pampeano ──
  1363: 'club-los-50',
  1364: 'santa-rosa-r-c',
  1509: 'union-del-sur',
  6012: 'uncas-r-c',
  6013: 'bigua-rugby-club',
  // ── Patagónico ──
  1656: 'pehuenes-r-c',
  1657: 'catriel-r-c',
  1658: 'patagonia-r-c',
  1876: 'coihues-r-c',
  6972: 'chenque-r-c',
  10635: 'club-las-aguilas',
};

const U_TUCUMAN = 'e558d0d9-c01b-40ce-a1c7-e533cb81f97c';
const U_SAN_JUAN = '765e6c46-b1c1-4e44-8490-aa0085ebeb99';
const U_CUYO = '40159cd1-5876-4720-b953-d639b09d5f5b';
const U_MDP = 'union-de-rugby-de-mar-del-plata';
const U_MISIONES = 'union-de-rugby-de-misiones';

/**
 * Clubes que el catálogo de G22 todavía no tiene, con la ciudad y la unión de
 * su ficha en rugbyarchive. Los que no tienen unión cargada en G22 (Jujuy,
 * Centro/Oeste bonaerense sin UROBA, Lagos del Sur) van con `union_id: null`.
 * Ninguno nace con escudo; rugbyarchive tiene badge para 1266/1304/1348/1362
 * en `/assets/{id}Badge.png` por si se quieren sumar después.
 */
export const CLUBES_NUEVOS_INTERIOR: Array<Record<string, unknown>> = [
  { id: 'universidad-nacional-de-san-juan-rugby', name: 'Universidad Nacional de San Juan', short_name: 'U.N.S.J.', city: 'San Juan', union_id: U_SAN_JUAN, region: 'San Juan', country: 'ARG' },
  { id: 'estudiantes-de-olavarria', name: 'Estudiantes de Olavarría', short_name: 'Estudiantes', city: 'Olavarría', union_id: 'uroba', region: 'Buenos Aires', country: 'ARG' },
  { id: 'suri-r-c', name: 'Suri R.C.', short_name: 'Suri', city: 'San Salvador de Jujuy', union_id: null, region: 'Jujuy', country: 'ARG' },
  { id: 'encarnacion-rugby-club', name: 'Encarnación Rugby Club', short_name: 'Encarnación', city: 'Encarnación', union_id: U_MISIONES, region: 'Misiones', country: 'Paraguay' },
  { id: 'jockey-club-mar-del-plata', name: 'Jockey Club Mar del Plata', short_name: 'Jockey MDP', city: 'Mar del Plata', union_id: U_MDP, region: 'Mar del Plata', country: 'ARG' },
  { id: 'paraiso-r-c', name: 'Paraíso R.C.', short_name: 'Paraíso', city: 'San Juan', union_id: U_SAN_JUAN, region: 'San Juan', country: 'ARG' },
  { id: 'azul-rugby-club', name: 'Azul Rugby Club', short_name: 'Azul', city: 'Azul', union_id: null, region: 'Buenos Aires', country: 'ARG' },
  { id: 'bajo-hondo', name: 'Bajo Hondo', short_name: 'Bajo Hondo', city: 'Tucumán', union_id: U_TUCUMAN, region: 'Tucumán', country: 'ARG' },
  { id: 'pueyrredon-mar-del-plata', name: 'Pueyrredón R.C. (Mar del Plata)', short_name: 'Pueyrredón MDP', city: 'Mar del Plata', union_id: U_MDP, region: 'Mar del Plata', country: 'ARG' },
  { id: 'tacuru-social-club', name: 'Tacurú Social Club', short_name: 'Tacurú', city: 'Posadas', union_id: U_MISIONES, region: 'Misiones', country: 'ARG' },
  { id: 'jabalies-r-c', name: 'Jabalíes R.C.', short_name: 'Jabalíes', city: 'El Bolsón', union_id: null, region: 'Río Negro', country: 'ARG' },
  // Regional del Centro (128/129)
  { id: 'atletico-brown-san-vicente', name: 'Atlético Brown de San Vicente', short_name: 'Brown SV', city: 'San Vicente', union_id: 'union-santafesina-de-rugby', region: 'Santa Fe', country: 'ARG' },
  { id: 'los-pinguinos-pergamino', name: 'Los Pingüinos', short_name: 'Los Pingüinos', city: 'Pergamino', union_id: 'a37639f8-197c-44c6-a095-2f16f40d7b04', region: 'Buenos Aires', country: 'ARG' },
  // URBA histórica (comps 116/117): clubes desaparecidos o que ya no juegan rugby
  { id: 'buenos-aires-f-c', name: 'Buenos Aires F.C.', short_name: 'Buenos Aires FC', city: 'Buenos Aires', union_id: 'urba', region: 'Buenos Aires', country: 'ARG' },
  { id: 'ymca-buenos-aires', name: 'YMCA Buenos Aires', short_name: 'YMCA', city: 'Buenos Aires', union_id: 'urba', region: 'Buenos Aires', country: 'ARG' },
  { id: 'central-buenos-aires', name: 'Central Buenos Aires', short_name: 'Central BA', city: 'Buenos Aires', union_id: 'urba', region: 'Buenos Aires', country: 'ARG' },
  { id: 'gimnasia-y-esgrima-la-plata', name: 'Gimnasia y Esgrima La Plata', short_name: 'GELP', city: 'La Plata', union_id: 'urba', region: 'Buenos Aires', country: 'ARG' },
  { id: 'belgrano-day-school', name: 'Belgrano Day School', short_name: 'Belgrano Day', city: 'Buenos Aires', union_id: 'urba', region: 'Buenos Aires', country: 'ARG' },
  { id: 'universitario-de-belgrano', name: 'Universitario de Belgrano', short_name: 'U. de Belgrano', city: 'Buenos Aires', union_id: 'urba', region: 'Buenos Aires', country: 'ARG' },
  { id: 'flores-athletic-club', name: 'Flores Athletic Club', short_name: 'Flores A.C.', city: 'Buenos Aires', union_id: 'urba', region: 'Buenos Aires', country: 'ARG' },
  { id: 'ateneo-de-la-juventud', name: 'Ateneo de la Juventud', short_name: 'Ateneo', city: 'Buenos Aires', union_id: 'urba', region: 'Buenos Aires', country: 'ARG' },
  { id: 'charruas-r-c', name: 'Charrúas R.C.', short_name: 'Charrúas', city: 'Buenos Aires', union_id: 'urba', region: 'Buenos Aires', country: 'ARG' },
  { id: 'sportivo-barracas', name: 'Sportivo Barracas', short_name: 'Sp. Barracas', city: 'Buenos Aires', union_id: 'urba', region: 'Buenos Aires', country: 'ARG' },
  { id: 'el-tala-r-c', name: 'El Tala R.C.', short_name: 'El Tala', city: 'Buenos Aires', union_id: 'urba', region: 'Buenos Aires', country: 'ARG' },
  { id: 'oeste-r-c', name: 'Oeste R.C.', short_name: 'Oeste', city: 'Buenos Aires', union_id: 'urba', region: 'Buenos Aires', country: 'ARG' },
  { id: 'deportivo-del-comercio', name: 'Deportivo del Comercio', short_name: 'Dep. Comercio', city: 'Buenos Aires', union_id: 'urba', region: 'Buenos Aires', country: 'ARG' },
  { id: 'atalaya-polo-club', name: 'Atalaya Polo Club', short_name: 'Atalaya', city: 'Buenos Aires', union_id: 'urba', region: 'Buenos Aires', country: 'ARG' },
  { id: 'comunicaciones-r-c', name: 'Comunicaciones', short_name: 'Comunicaciones', city: 'Buenos Aires', union_id: 'urba', region: 'Buenos Aires', country: 'ARG' },
  { id: 'ypf-r-c', name: 'Y.P.F.', short_name: 'Y.P.F.', city: 'Buenos Aires', union_id: 'urba', region: 'Buenos Aires', country: 'ARG' },
  { id: 'los-sauces-r-c', name: 'Los Sauces', short_name: 'Los Sauces', city: 'Buenos Aires', union_id: 'urba', region: 'Buenos Aires', country: 'ARG' },
  { id: 'c-u-q', name: 'Club Universitario de Quilmes', short_name: 'C.U.Q.', city: 'Quilmes', union_id: 'urba', region: 'Buenos Aires', country: 'ARG' },
  { id: 'stepinac', name: 'Stepinac', short_name: 'Stepinac', city: 'Buenos Aires', union_id: 'urba', region: 'Buenos Aires', country: 'ARG' },
  { id: 'san-ignacio-buenos-aires', name: 'San Ignacio (Buenos Aires)', short_name: 'San Ignacio BA', city: 'Buenos Aires', union_id: 'urba', region: 'Buenos Aires', country: 'ARG' },
  { id: 'san-jose-buenos-aires', name: 'San José (Buenos Aires)', short_name: 'San José BA', city: 'Buenos Aires', union_id: 'urba', region: 'Buenos Aires', country: 'ARG' },
  // Filiales "A" de la vieja Segunda División porteña
  { id: 'casi-a', name: 'C.A.S.I. "A"', short_name: 'CASI "A"', city: 'San Isidro', union_id: 'urba', region: 'Buenos Aires', country: 'ARG' },
  { id: 'cuba-a', name: 'C.U.B.A. "A"', short_name: 'CUBA "A"', city: 'Buenos Aires', union_id: 'urba', region: 'Buenos Aires', country: 'ARG' },
  { id: 'geba-a', name: 'G.E.B.A. "A"', short_name: 'GEBA "A"', city: 'Buenos Aires', union_id: 'urba', region: 'Buenos Aires', country: 'ARG' },
  { id: 'belgrano-athletic-a', name: 'Belgrano Athletic "A"', short_name: 'Belgrano "A"', city: 'Buenos Aires', union_id: 'urba', region: 'Buenos Aires', country: 'ARG' },
  { id: 'buenos-aires-f-c-a', name: 'Buenos Aires F.C. "A"', short_name: 'BAFC "A"', city: 'Buenos Aires', union_id: 'urba', region: 'Buenos Aires', country: 'ARG' },
  { id: 'curupayti-a', name: 'Curupaytí "A"', short_name: 'Curupaytí "A"', city: 'Hurlingham', union_id: 'urba', region: 'Buenos Aires', country: 'ARG' },
  { id: 'hindu-club-a', name: 'Hindú Club "A"', short_name: 'Hindú "A"', city: 'Don Torcuato', union_id: 'urba', region: 'Buenos Aires', country: 'ARG' },
  { id: 'ymca-buenos-aires-a', name: 'YMCA Buenos Aires "A"', short_name: 'YMCA "A"', city: 'Buenos Aires', union_id: 'urba', region: 'Buenos Aires', country: 'ARG' },
  { id: 'olivos-r-c-a', name: 'Olivos R.C. "A"', short_name: 'Olivos "A"', city: 'Munro', union_id: 'urba', region: 'Buenos Aires', country: 'ARG' },
  { id: 'san-isidro-club-a', name: 'S.I.C. "A"', short_name: 'SIC "A"', city: 'San Isidro', union_id: 'urba', region: 'Buenos Aires', country: 'ARG' },
  { id: 'old-georgian-a', name: 'Old Georgian "A"', short_name: 'Old Georgian "A"', city: 'Buenos Aires', union_id: 'urba', region: 'Buenos Aires', country: 'ARG' },
  { id: 'obras-sanitarias-a', name: 'Obras Sanitarias "A"', short_name: 'Obras "A"', city: 'Buenos Aires', union_id: 'urba', region: 'Buenos Aires', country: 'ARG' },
  { id: 'club-pucara-a', name: 'Club Pucará "A"', short_name: 'Pucará "A"', city: 'Burzaco', union_id: 'urba', region: 'Buenos Aires', country: 'ARG' },
  { id: 'deportiva-francesa-a', name: 'Deportiva Francesa "A"', short_name: 'Dep. Francesa "A"', city: 'Pilar', union_id: 'urba', region: 'Buenos Aires', country: 'ARG' },
  { id: 'san-martin-a', name: 'San Martín "A"', short_name: 'San Martín "A"', city: 'Sáenz Peña', union_id: 'urba', region: 'Buenos Aires', country: 'ARG' },
  // NEA
  { id: 'lomas-r-c-posadas', name: 'Lomas R.C. (Posadas)', short_name: 'Lomas Posadas', city: 'Posadas', union_id: U_MISIONES, region: 'Misiones', country: 'ARG' },
  { id: 'san-cipriano', name: 'San Cipriano', short_name: 'San Cipriano', city: 'Formosa', union_id: 'union-de-rugby-de-formosa', region: 'Formosa', country: 'ARG' },
  { id: 'chaco-r-c', name: 'Chaco R.C.', short_name: 'Chaco', city: 'Resistencia', union_id: 'urne', region: 'Chaco', country: 'ARG' },
  { id: 'cataratas-r-c', name: 'Cataratas R.C.', short_name: 'Cataratas', city: 'Puerto Iguazú', union_id: U_MISIONES, region: 'Misiones', country: 'ARG' },
  { id: 'paraguay-xv', name: 'Paraguay XV', short_name: 'Paraguay XV', city: 'Asunción', union_id: 'union-de-rugby-de-paraguay', region: 'Paraguay', country: 'Paraguay' },
  // ── Tanda regionales 2026-08 ──────────────────────────────────────────────
  // Franquicias SLAR/SRA desaparecidas o sin ficha en G22
  { id: 'jaguares-xv', name: 'Jaguares XV', short_name: 'Jaguares XV', city: 'Buenos Aires', union_id: 'union-argentina-de-rugby', region: 'Buenos Aires', country: 'Argentina' },
  { id: 'los-ceibos', name: 'Los Ceibos', short_name: 'Los Ceibos', city: 'Córdoba', union_id: 'union-argentina-de-rugby', region: 'Córdoba', country: 'Argentina' },
  { id: 'american-raptors', name: 'American Raptors', short_name: 'Raptors', city: 'Glendale', union_id: 'usa-rugby', region: 'Colorado', country: 'Estados Unidos' },
  { id: 'cafeteros-pro', name: 'Cafeteros Pro', short_name: 'Cafeteros', city: 'Medellín', union_id: null, region: 'Antioquia', country: 'Colombia' },
  // NOA
  { id: 'jockey-club-santiago', name: 'Jockey Club Santiago', short_name: 'Jockey Santiago', city: 'Santiago del Estero', union_id: 'union-santiaguena-de-rugby', region: 'Santiago del Estero', country: 'ARG' },
  { id: 'corsarios-r-c', name: 'Corsarios R.C.', short_name: 'Corsarios', city: 'Tafí Viejo', union_id: U_TUCUMAN, region: 'Tucumán', country: 'ARG' },
  { id: 'coipu-r-c', name: 'Coipú R.C.', short_name: 'Coipú', city: 'Famaillá', union_id: U_TUCUMAN, region: 'Tucumán', country: 'ARG' },
  { id: 'monteros-r-c', name: 'Monteros R.C.', short_name: 'Monteros', city: 'Monteros', union_id: U_TUCUMAN, region: 'Tucumán', country: 'ARG' },
  // Oeste / Cuyo (los sanluiseños juegan en la Unión de Rugby de Cuyo)
  { id: 'chancay-r-c', name: 'Chancay R.C.', short_name: 'Chancay', city: 'San Luis', union_id: U_CUYO, region: 'San Luis', country: 'ARG' },
  { id: 'mercedes-san-luis', name: 'Mercedes Rugby (San Luis)', short_name: 'Mercedes SL', city: 'Villa Mercedes', union_id: U_CUYO, region: 'San Luis', country: 'ARG' },
  { id: 'los-teros-san-luis', name: 'Los Teros (San Luis)', short_name: 'Los Teros SL', city: 'San Luis', union_id: U_CUYO, region: 'San Luis', country: 'ARG' },
  // Patagónico (Lagos del Sur no tiene unión cargada en G22: van sin unión)
  { id: 'pehuenes-r-c', name: 'Pehuenes R.C.', short_name: 'Pehuenes', city: 'Bariloche', union_id: null, region: 'Río Negro', country: 'ARG' },
  { id: 'coihues-r-c', name: 'Coihues R.C.', short_name: 'Coihues', city: 'Villa La Angostura', union_id: null, region: 'Neuquén', country: 'ARG' },
  { id: 'catriel-r-c', name: 'Catriel Rugby Club', short_name: 'Catriel', city: 'Catriel', union_id: 'union-de-rugby-de-alto-valle', region: 'Río Negro', country: 'ARG' },
  { id: 'patagonia-r-c', name: 'Patagonia R.C.', short_name: 'Patagonia', city: 'Neuquén', union_id: 'union-de-rugby-de-alto-valle', region: 'Neuquén', country: 'ARG' },
].map((c) => ({
  ...c,
  slug: c.id,
  sport: 'rugby',
  sport_id: 'rugby',
  entity_type: 'club',
  status: 'active',
  visibility: 'visible',
  is_visible: true,
  categories: [],
}));
