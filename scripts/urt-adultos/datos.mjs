/**
 * CANON de los torneos de MAYORES de la Unión de Rugby de Tucumán (URT) 2026 en
 * G22: Tucumano A y B, Regional del NOA A, B y C, Desarrollo, Preintermedia,
 * Bi Uniones y M-23. Misma interfaz que `scripts/urt-juveniles/datos.mjs`: el
 * seed es el mismo molde.
 *
 * Fuente: los boletines semanales de la URT. NO publican resultados: traen
 * tablas de posiciones y programación; cada marcador se reconstruyó de la
 * diferencia entre dos tablas (`fuente/deduce.mjs`). Validado contra el Regional
 * A Primera, que ya estaba cargado con resultados oficiales: 30 de 30 iguales.
 *
 * Qué NO se crea acá: la Primera del Regional A, la del Regional B y la del
 * Tucumano A, que ya existen en la base (con sus nombres históricos).
 *
 * Modelo de fichas: la Primera juega con el club madre. El segundo equipo de
 * cada club vive en su propia ficha: "<Club> Intermedia" (la "B" de la Intermedia),
 * "<Club> Preintermedia A/B" y "<Club> M23".
 */

export const UNION_TORNEO = 'e558d0d9-c01b-40ce-a1c7-e533cb81f97c'; // URT

const T = (id, nombre, ciudad, region = 'Tucumán', extra = {}) => ({ id, nombre, ciudad, region, ...extra });
const NUEVO = (id, nombre, ciudad, region, union = UNION_TORNEO) => ({
  id, nombre, nombreMadre: nombre, ciudad, region, union, nuevo: true, escudo: null,
});

/** Clave de club (la de `fuente/deduce.mjs`) → club madre. */
export const MADRES = {
  AGUARA: T('aguara-guazu', 'Aguará Guazú', 'Tucumán'),
  CARDENALES: T('cardenales-r-c', 'Cardenales', 'Tucumán'),
  COIPU: T('coipu-r-c', 'Coipú', 'Famaillá'),
  HUIRAPUCA: T('huirapuca', 'Huirapuca', 'Tucumán'),
  JOCKEY: T('jockey-club-de-tucuman', 'Jockey Club de Tucumán', 'Tucumán'),
  'JOCKEY SALTA': T('jockey-club-salta', 'Jockey Club Salta', 'Salta', 'Salta'),
  QUERENCIA: T('la-querencia', 'La Querencia', 'Tucumán'),
  LINCE: T('lince-rugby-club', 'Lince', 'Tucumán'),
  LICEO: T('liceo-rugby-club-tucuman', 'Liceo Rugby Club', 'Tucumán'),
  TARCOS: T('los-tarcos', 'Los Tarcos', 'Tucumán'),
  NATACION: T('natacion-y-gimnasia', 'Natación y Gimnasia', 'Tucumán'),
  SANMARTIN: T('san-martin-rugby-club-tucuman', 'San Martín Rugby Club', 'Tucumán'),
  'STGO LAWN': T('santiago-lawn-tennis-club', 'Santiago Lawn Tennis Club', 'Santiago del Estero', 'Santiago del Estero'),
  'STGO RUGBY': T('santiago-rugby-club', 'Santiago Rugby Club', 'Santiago del Estero', 'Santiago del Estero'),
  LAWN: T('tucuman-lawn-tennis', 'Tucumán Lawn Tennis', 'Tucumán'),
  TRUGBY: T('tucuman-rugby-club', 'Tucumán Rugby Club', 'Tucumán'),
  'UNI SALTA': T('universitario-de-salta', 'Universitario de Salta', 'Salta', 'Salta'),
  UNI: T('universitario-de-tucuman', 'Universitario de Tucumán', 'Tucumán'),
  'BAJO HONDO': T('bajo-hondo', 'Bajo Hondo', 'Tucumán'),
  CORSARIOS: T('corsarios-r-c', 'Corsarios', 'Tafí Viejo'),
  'GIM Y TIRO': T('gimnasia-y-tiro', 'Gimnasia y Tiro', 'Salta', 'Salta'),
  'TIRO FEDERAL': T('tiro-federal-salta', 'Tiro Federal Salta', 'Salta', 'Salta'),
  'OLD LIONS': T('old-lions-r-c', 'Old Lions', 'Santiago del Estero', 'Santiago del Estero'),
  MONTEROS: T('monteros-r-c', 'Monteros', 'Monteros'),
  SURI: T('suri-r-c', 'Suri', 'San Salvador de Jujuy', 'Jujuy'),
  TIGRES: T('tigres-r-c', 'Tigres', 'Salta', 'Salta'),
  'SAN ISIDRO': T('san-isidro-de-lules', 'San Isidro de Lules', 'San Isidro de Lules'),
  // Nuevos: no había ficha.
  'TAFI VIEJO': NUEVO('tafi-viejo-r-c', 'Tafí Viejo R.C.', 'Tafí Viejo', 'Tucumán'),
  ALISOS: NUEVO('los-alisos-rugby-club', 'Los Alisos Rugby Club', 'Tucumán', 'Tucumán'),
  ANATUYA: NUEVO('anatuya-r-c', 'Añatuya R.C.', 'Añatuya', 'Santiago del Estero'),
  COBRAS: NUEVO('cobras-rugby-club', 'Cobras Rugby Club', 'Tucumán', 'Tucumán'),
  'SANTA ANA': NUEVO('santa-ana-rugby-club', 'Santa Ana Rugby Club', 'Tucumán', 'Tucumán'),
  JUJUY: NUEVO('atletico-gimnasia-y-esgrima-de-jujuy', 'Atlético Gimnasia y Esgrima de Jujuy', 'San Salvador de Jujuy', 'Jujuy'),
};

/** Clubes que solo juegan la Intermedia: su equipo ES la ficha madre. */
const SOLO_INTERMEDIA = new Set(['SANTA ANA']);

/** Un alias es "CLUB|LETRA" (la letra puede ir vacía), p.ej. "LAWN|B". */
export function fichaDe(alias, division) {
  const [club, letra = ''] = alias.split('|');
  const madre = MADRES[club];
  if (!madre) throw new Error(`alias sin madre: "${alias}"`);
  const nivel = TORNEOS[division]?.nivel;
  if (!nivel || SOLO_INTERMEDIA.has(club) || nivel === 'PRIMERA') {
    return { id: madre.id, nombre: madre.nombreMadre ?? madre.nombre, madreId: madre.id };
  }
  const sufijo = { INTERMEDIA: 'intermedia', PREINTERMEDIA: 'preintermedia', M23: 'm23' }[nivel];
  const etiqueta = { INTERMEDIA: 'Intermedia', PREINTERMEDIA: 'Preintermedia', M23: 'M23' }[nivel];
  const l = nivel === 'PREINTERMEDIA' ? letra : '';
  return {
    id: `${madre.id}-${sufijo}${l ? `-${l.toLowerCase()}` : ''}`,
    nombre: `${madre.nombre} ${etiqueta}${l ? ` ${l}` : ''}`,
    madreId: madre.id,
  };
}

/** Un torneo por clave de competencia (deduce.mjs: torneo|división). */
export const TORNEOS = {
  TA_INT: { nombre: 'Torneo Anual Tucumano - Intermedia', slug: 'urt-tucumano-a-intermedia', nivel: 'INTERMEDIA', region: 'Tucumán' },
  TB_PRI: { nombre: 'Torneo Anual Tucumano "B" - Primera', slug: 'urt-tucumano-b-primera', nivel: 'PRIMERA', region: 'Tucumán' },
  TB_INT: { nombre: 'Torneo Anual Tucumano "B" - Intermedia', slug: 'urt-tucumano-b-intermedia', nivel: 'INTERMEDIA', region: 'Tucumán' },
  RA_INT: { nombre: 'Torneo Regional del NOA "A" - Intermedia', slug: 'urt-regional-noa-a-intermedia', nivel: 'INTERMEDIA', region: 'NOA' },
  RB_INT: { nombre: 'Torneo Regional del NOA "B" - Intermedia', slug: 'urt-regional-noa-b-intermedia', nivel: 'INTERMEDIA', region: 'NOA' },
  RC_PRI: { nombre: 'Torneo Regional del NOA "C" - Primera', slug: 'urt-regional-noa-c-primera', nivel: 'PRIMERA', region: 'NOA' },
  RC_INT: { nombre: 'Torneo Regional del NOA "C" - Intermedia', slug: 'urt-regional-noa-c-intermedia', nivel: 'INTERMEDIA', region: 'NOA' },
  DE_PRI: { nombre: 'Torneo Anual Desarrollo - Primera', slug: 'urt-desarrollo-primera', nivel: 'PRIMERA', region: 'Tucumán' },
  DE_INT: { nombre: 'Torneo Anual Desarrollo - Intermedia', slug: 'urt-desarrollo-intermedia', nivel: 'INTERMEDIA', region: 'Tucumán' },
  CD_PRI: { nombre: 'Torneo Clausura Desarrollo - Primera', slug: 'urt-clausura-desarrollo-primera', nivel: 'PRIMERA', region: 'Tucumán' },
  CD_INT: { nombre: 'Torneo Clausura Desarrollo - Intermedia', slug: 'urt-clausura-desarrollo-intermedia', nivel: 'INTERMEDIA', region: 'Tucumán' },
  PI_ANU: { nombre: 'Torneo Anual Preintermedia', slug: 'urt-anual-preintermedia', nivel: 'PREINTERMEDIA', region: 'Tucumán' },
  PI_INI: { nombre: 'Torneo Iniciación Preintermedia', slug: 'urt-iniciacion-preintermedia', nivel: 'PREINTERMEDIA', region: 'Tucumán' },
  BI_UNI: { nombre: 'Torneo Bi Uniones Preintermedia', slug: 'urt-bi-uniones-preintermedia', nivel: 'PREINTERMEDIA', region: 'NOA' },
  M23: { nombre: 'Torneo M-23 de Tucumán', slug: 'urt-m23', nivel: 'M23', region: 'Tucumán' },
};
export const DIVISIONES = Object.keys(TORNEOS);
export const torneoDe = (division) => ({ division, ...TORNEOS[division], ageGrade: 'Mayores (Adults)' });

/** Competencia de deduce.mjs → torneo nuestro (null = ya existe, no se carga). */
export function torneoDeCompetencia(c) {
  const k = `${c.torneo}|${c.div}`;
  return {
    'TUCUMANO A|PRIMERA': null, 'TUCUMANO A|INTERMEDIA': 'TA_INT',
    'TUCUMANO B|PRIMERA': 'TB_PRI', 'TUCUMANO B|INTERMEDIA': 'TB_INT',
    'REGIONAL A|PRIMERA': null, 'REGIONAL A|INTERMEDIA': 'RA_INT',
    'REGIONAL B|PRIMERA': null, 'REGIONAL B|INTERMEDIA': 'RB_INT',
    'REGIONAL C|PRIMERA': 'RC_PRI', 'REGIONAL C|INTERMEDIA': 'RC_INT',
    'DESARROLLO|PRIMERA': 'DE_PRI', 'DESARROLLO|INTERMEDIA': 'DE_INT',
    'CLAUSURA DESARROLLO|PRIMERA': 'CD_PRI', 'CLAUSURA DESARROLLO|INTERMEDIA': 'CD_INT',
    'ANUAL PREINTERMEDIA|PREINTERMEDIA': 'PI_ANU', 'INICIACION PREINTERMEDIA|PREINTERMEDIA': 'PI_INI',
    'BI UNIONES|PREINTERMEDIA': 'BI_UNI', 'M23|M23': 'M23',
  }[k] ?? null;
}

/** Nombre de la fase dentro del torneo. */
export function faseDeCompetencia(c) {
  if (!c.zona) return 'Fase regular';
  if (c.torneo === 'CLAUSURA DESARROLLO') return `Zona ${c.zona}`;
  if (c.zona === 'CAMPEONATO') return 'Campeonato';
  if (c.zona === 'REUBICACION') return 'Reubicación';
  return `Zona ${c.zona}`;
}
export const ORDEN_FASES = ['Fase regular', 'Zona A', 'Zona B', 'Zona 1', 'Zona 2', 'Campeonato', 'Reubicación'];

export const HORA_POR_DEFECTO = '15:30';
export function instanteDe(fecha, hora) {
  return new Date(`${fecha}T${hora || HORA_POR_DEFECTO}:00-03:00`).toISOString();
}

export const PUNTOS = { win: 4, draw: 2, loss: 0, bonusTry: 1, bonusLoss: 1 };
export const TIEBREAKERS = [
  { metric: 'points', label: 'Puntos obtenidos', priority: 1, enabled: true },
  { metric: 'head_to_head', label: 'Resultado entre sí', priority: 2, enabled: true },
  { metric: 'points_difference', label: 'Diferencia de tantos', priority: 3, enabled: true },
  { metric: 'tries_for', label: 'Tries a favor', priority: 4, enabled: true },
  { metric: 'won', label: 'Partidos ganados', priority: 5, enabled: true },
];
export const SISTEMA_ACTUAL = { win: 4, draw: 2, loss: 0, bonus: true };
export const sistemaDe = () => SISTEMA_ACTUAL;
export function reglamentoDe(s) {
  const base = { win: s.win, draw: s.draw, loss: s.loss };
  return {
    pointsWin: s.win, pointsDraw: s.draw, pointsLoss: s.loss,
    pointsBonusTry: PUNTOS.bonusTry, pointsBonusLoss: PUNTOS.bonusLoss,
    points: base,
    pointsSystem: { ...base, allowBonusPoints: true, bonusTry: PUNTOS.bonusTry, bonusLoss: PUNTOS.bonusLoss },
    bonus: { offensive: { tries: 4, points: PUNTOS.bonusTry }, defensive: { margin: 7, points: PUNTOS.bonusLoss } },
    standings: { points_base: base, bonus_rules: [] },
    competition: { format_type: 'league', parameters: { season_model: 'multi_phase' } },
    tiebreakers: TIEBREAKERS,
  };
}
export const RULESET_TORNEO = () => reglamentoDe(SISTEMA_ACTUAL);

// Lo que el seed de juveniles carga además y acá no hay.
export const TRL = [];
export const TRL_FECHA1 = null;
export const LOGO_TRL = null;
export const ESCUDO_BROWN = { id: '__ninguno__', escudo: null };
