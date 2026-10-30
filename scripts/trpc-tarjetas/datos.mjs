/**
 * Canon de la carga "Torneo TRPC 2026" (captura de tarjetas del sistema de la UAR).
 * El zip trae 8 torneos de la Patagonia: 4 ya estaban en la base (solo ficha) y 4 son
 * nuevos (se crean acá). Datos puros: el que escribe es `seed.mjs`.
 */
export const ORIGEN = 'trpc-tarjetas-2026';
export const TEMPORADA = '2026';

/** Nombre en la tarjeta (sin el sufijo de unión) -> id de club en G22. */
export const CLUB_POR_NOMBRE = {
  'BIGORNIA': 'bigornia-r-c',
  'MARABUNTA R.C.': 'marabunta-r-c',
  'ROCA R.C.': 'roca-r-c',
  'DEPORTIVO PORTUGUES': 'deportivo-portugues',
  'NEUQUEN R.C.': 'neuquen-r-c',
  'CHENQUE': 'chenque-r-c',
  'CLUB LAS AGUILAS': 'club-las-aguilas',
  'TRELEW R.C.': 'trelew-r-c',
  'USHUAIA RUGBY CLUB': 'ushuaia-rugby-club',
  'CLUB UNIVERSITARIO DE RUGBY': 'universitario-de-rio-grande',
  'CLUB COLEGIO DEL SUR': 'club-colegio-del-sur',
  'RIO GRANDE RUGBY Y HOCKEY CLUB': 'rio-grande-rugby-hockey-club',
  'TOLHUIN RUGBY CLUB': 'tolhuin-rugby-club',
  'PUERTO MADRYN R.C.': 'puerto-madryn-r-c',
  'SAN JORGE - AUSTRAL': 'san-jorge-r-c-ua',
  'CALAFATE': 'calafate-r-c',
  'COMODORO R.C.': 'comodoro-r-c',
  'PATORUZU R.C.': 'patoruzu-r-c',
  'DRAIG GOCH': 'draig-goch-r-c',
  'COIHUES R.C.': 'coihues-r-c',
  'SAN MARTIN DE LOS ANDES RUGBY Y HOCKEY CLUB': 'san-martin-de-los-andes-rugby-hockey-club',
  'PATAGONIA R.C.': 'patagonia-r-c',
  'PEHUENES': 'pehuenes-r-c',
  'LOS PATOS': 'los-patos-r-c',
  'CATRIEL R.C.': 'catriel-r-c',
  'EL NACIONAL': 'club-el-nacional',
  'SOCIEDAD SPORTIVA': 'sociedad-sportiva-de-bahia-blanca',
  'UNIVERSITARIO BB': 'universitario-de-bahia-blanca',
  'SANTA ROSA R.': 'santa-rosa-r-c',
};

/** La captura trae una tarjeta rotulada con el torneo equivocado (el rótulo va en la segunda tarjeta del bloque). */
export const TORNEO_CORREGIDO = { 309921: 'PRIMERA B 2026' };

/** Clubes que no estaban en la base. */
export const CLUBES_NUEVOS = [
  { id: 'los-patos-r-c', name: 'Los Patos R.C.', city: 'Cipolletti', union: 'union-de-rugby-de-alto-valle' },
  { id: 'san-martin-de-los-andes-rugby-hockey-club', name: 'San Martín de los Andes Rugby y Hockey Club', city: 'San Martín de los Andes', union: null },
];

export const RULESET = {
  pointsWin: 4, pointsDraw: 2, pointsLoss: 0, pointsBonusTry: 1, pointsBonusLoss: 1,
  competition: { parameters: { season_model: 'single_event', ranking_scope: 'match_points' }, format_type: 'league' },
};

export const TIEBREAKERS = [
  { label: 'Puntos obtenidos', order: 1, metric: 'points_table', enabled: true, priority: 1 },
  { label: 'Diferencia de Tantos', order: 2, metric: 'points_diff', enabled: true, priority: 2 },
];

export const ORDINALES = { PRIMERA: 1, SEGUNDA: 2, TERCERA: 3, CUARTA: 4, QUINTA: 5, SEXTA: 6 };

/** Torneos nuevos. `tarjeta` = valor del campo "Torneo" de la captura. */
export const TORNEOS = [
  {
    clave: 'urtdf-apertura', tarjeta: 'URTF ZONA COMPETENCIA - APERTURA 2026',
    nombre: 'Tierra del Fuego Apertura', slug: 'urtdf-zona-competencia-apertura',
    union: 'union-de-rugby-de-tierra-del-fuego', region: 'Tierra del Fuego', categoria: 'Primera',
    edicion: '1º semestre', tienefinal: true,
  },
  {
    clave: 'cordillerano', tarjeta: 'CORDILLERANO 2026',
    nombre: 'Torneo Cordillerano', slug: 'torneo-cordillerano',
    union: 'union-de-rugby-de-alto-valle', region: 'Patagonia', categoria: 'Primera',
    edicion: 'Clasificatoria', tienefinal: false,
  },
  {
    clave: 'oficial-mayores', tarjeta: 'OFICIAL MAYORES 2026',
    nombre: 'Torneo Oficial Mayores - Alto Valle', slug: 'oficial-mayores-alto-valle',
    union: 'union-de-rugby-de-alto-valle', region: 'Patagonia', categoria: 'Primera',
    edicion: 'Primera', tienefinal: false,
  },
  {
    clave: 'primera-b', tarjeta: 'PRIMERA B 2026',
    nombre: 'Primera B - Alto Valle', slug: 'primera-b-alto-valle',
    union: 'union-de-rugby-de-alto-valle', region: 'Patagonia', categoria: 'Primera B',
    edicion: 'Primera B', tienefinal: false,
  },
];
