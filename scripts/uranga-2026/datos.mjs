/**
 * CANON del Torneo Juvenil M15 "Eduardo Uranga" 2026 (Paraná, 24 y 25 de octubre).
 * Datos puros, sin dependencias — el que escribe en la base es `seed.mjs`.
 *
 * Fuente: las seis placas que publicó @rugbyclick en Instagram (partidos por cancha,
 * posiciones por zona, cuadros de las cuatro copas), con resultados actualizados al
 * sábado 24/10 a las 19:29. Cada tabla de zona se contrastó con la suma de sus
 * partidos (PF, PC, PJ y puntos) y cierra en las ocho.
 *
 * Reglamento (pie de la placa): ganado 4, empate 2, perdido 1, ganador por W.O. 4
 * (10 a 0), no presentado 0. Sin bonus. Los empates de llave se definen por drops.
 *
 * Formato: 8 zonas de 4 (todos contra todos, 3 partidos cada uno) y el domingo cuatro
 * copas de cuartos, semis y final según el puesto en la zona: 1.º Oro, 2.º Plata,
 * 3.º Bronce, 4.º Cristal.
 */

export const TORNEO_SLUG = 'torneo-juvenil-m15-eduardo-uranga';
export const NOMBRE = 'Torneo Juvenil M15 "Eduardo Uranga"';
export const NOMBRE_CORTO = 'Uranga';
export const TEMPORADA = '2026';
export const UNION = 'union-entrerriana-de-rugby';
export const SEDE = 'El Plumazo, Paraná';
export const LOGO_TORNEO = '/competiciones/ar-litoral-uranga-m15.png';
export const ORIGINAL = 'URANGA 2026 · Torneo Juvenil M15 "Eduardo Uranga" · 24 y 25 de octubre · El Plumazo, Paraná';

export const DIAS = { sab: '2026-10-24', dom: '2026-10-25' };

/** El instante en UTC, que es como lo guarda la base. El offset va escrito (`-03:00`). */
export const instanteDe = (dia, hora) => new Date(`${DIAS[dia]}T${hora}:00-03:00`).toISOString();

// ── Clubes ───────────────────────────────────────────────────────────────────

/**
 * Bases que NO existen todavía. `escudoDe`: de qué club se copia el escudo; `logo_url`: ruta
 * propia (public/clubs, generada con scripts/escudos/variantes.mjs). Sin ninguno = sin escudo.
 * CPBM (Unión de Rugby de Cuyo, "Oeste") tiene el escudo en Recursos/ARGENTINA/CUYO. La placa
 * lo escribe "CPMB", pero el escudo dice CPBM.
 */
export const BASES_NUEVAS = [
  { id: 'san-patricio-corrientes', name: 'San Patricio (Corrientes)', city: 'Corrientes', region: 'Corrientes', union_id: 'urne', escudoDe: 'san-patricio-femenino' },
  { id: 'cpbm-mendoza', name: 'CPBM Mendoza', city: 'Mendoza', region: 'Mendoza', union_id: '40159cd1-5876-4720-b953-d639b09d5f5b', logo_url: '/clubs/cpbm-mendoza.png' },
];

/**
 * Los 32 equipos. `ficha` es el club de la categoría M15 (el que juega y se ve en la
 * tabla); `base` el club madre del que cuelga. Cinco clubes mandan dos equipos y cada
 * uno es una variante propia (`...-m15-blanco`, `-negro`, `-rojo`, `-azul`): la
 * planilla los trata como equipos distintos y juegan entre sí en zonas y copas.
 * `existe: true` = la ficha ya está en la base y se reusa sin tocarla.
 */
export const EQUIPOS = {
  caeB:     { base: 'estudiantes-de-parana',        ficha: 'estudiantes-de-parana-m15-blanco',  variante: 'Blanco', planilla: 'CAE BLANCO' },
  caeN:     { base: 'estudiantes-de-parana',        ficha: 'estudiantes-de-parana-m15-negro',   variante: 'Negro',  planilla: 'CAE NEGRO' },
  social:   { base: 'club-social-la-rioja',         ficha: 'club-social-la-rioja-m15',          planilla: 'CLUB SOCIAL LA RIOJA' },
  suri:     { base: 'suri-r-c',                     ficha: 'suri-r-c-m15',                      planilla: 'SURI JUJUY' },
  sanp:     { base: 'san-patricio-corrientes',      ficha: 'san-patricio-corrientes-m15',       planilla: 'SAN PATRICIO ( CTES )' },
  tigres:   { base: 'tigres-r-c',                   ficha: 'tigres-r-c-m15',                    existe: true, planilla: 'TIGRES SALTA' },
  cpmb:     { base: 'cpbm-mendoza',                 ficha: 'cpbm-mendoza-m15',                  planilla: 'CPMB MENDOZA' },
  sixty:    { base: 'sixty-r-c',                    ficha: 'sixty-r-c-m15',                     planilla: 'SIXTY' },
  jockeyR:  { base: 'jockey-club-salta',            ficha: 'jockey-club-salta-m15-rojo',        variante: 'Rojo',   planilla: 'JOCKEY SALTA ROJO' },
  jockeyB:  { base: 'jockey-club-salta',            ficha: 'jockey-club-salta-m15-blanco',      variante: 'Blanco', planilla: 'JOCKEY SALTA BLANCO' },
  teque:    { base: 'teque-r-c',                    ficha: 'teque-r-c-m15',                     planilla: 'TEQUE' },
  crar:     { base: 'crar',                         ficha: 'crar-m15',                          existe: true, planilla: 'CRAR' },
  nqnA:     { base: 'neuquen-r-c',                  ficha: 'neuquen-r-c-m15-azul',              variante: 'Azul',   planilla: 'NEUQUEN RUGBY AZUL' },
  nqnR:     { base: 'neuquen-r-c',                  ficha: 'neuquen-r-c-m15-rojo',              variante: 'Rojo',   planilla: 'NEUQUEN RUGBY ROJO' },
  lasalle:  { base: 'la-salle-jobson',              ficha: 'la-salle-jobson-m15',               existe: true, planilla: 'LA SALLE' },
  regatas:  { base: 'regatas-de-resistencia',       ficha: 'regatas-de-resistencia-m15',        planilla: 'REGATAS RESIST' },
  taraguy:  { base: 'taraguy-r-c',                  ficha: 'taraguy-r-c-m15',                   existe: true, planilla: 'TARAGUY' },
  slawnR:   { base: 'santiago-lawn-tennis-club',    ficha: 'santiago-lawn-tennis-m15-rojo',     variante: 'Rojo',   planilla: 'SANTIAGO L. TENIS ROJO' },
  slawnB:   { base: 'santiago-lawn-tennis-club',    ficha: 'santiago-lawn-tennis-m15-blanco',   variante: 'Blanco', planilla: 'SANTIAGO L. TENIS BLANCO' },
  teros:    { base: 'los-teros-r-c',                ficha: 'los-teros-r-c-m15',                 planilla: 'TEROS CATAMARCA' },
  prc:      { base: 'parana-rowing',                ficha: 'parana-rowing-m15',                 existe: true, planilla: 'PRC' },
  mendoza:  { base: 'mendoza-rugby-club',           ficha: 'mendoza-rugby-club-m15',            planilla: 'MENDOZA RUGBY' },
  lomas:    { base: 'lomas-r-c-posadas',            ficha: 'lomas-r-c-posadas-m15',             planilla: 'LOMAS POSADAS' },
  unisf:    { base: 'universitario-de-santa-fe',    ficha: 'universitario-de-santa-fe-m15',     existe: true, planilla: 'UNI de SANTA FE' },
  crai:     { base: 'crai',                         ficha: 'crai-m15',                          existe: true, planilla: 'CRAI' },
  unisalta: { base: 'universitario-de-salta',       ficha: 'universitario-de-salta-m15',        planilla: 'UNI SALTA' },
  aranB:    { base: 'aranduroga-r-c',               ficha: 'aranduroga-r-c-m15-blanco',         variante: 'Blanco', planilla: 'ARANDUROGA BLANCO' },
  aranN:    { base: 'aranduroga-r-c',               ficha: 'aranduroga-r-c-m15-negro',          variante: 'Negro',  planilla: 'ARANDUROGA NEGRO' },
  cata:     { base: 'catamarca-r-c',                ficha: 'catamarca-r-c-m15',                 existe: true, planilla: 'CATAMARCA RUGBY' },
  tilcara:  { base: 'club-tilcara',                 ficha: 'club-tilcara-m15',                  existe: true, planilla: 'TILCARA' },
  sanjuan:  { base: 'san-juan-rugby-club',          ficha: 'san-juan-r-c-m15',                  existe: true, planilla: 'SAN JUAN RUGBY' },
  charoga:  { base: 'cha-roga-r-c',                 ficha: 'cha-roga-r-c-m15',                  existe: true, planilla: 'CHAROGA' },
};

// ── Zonas ────────────────────────────────────────────────────────────────────

/**
 * Cada zona con su cancha del sábado (las placas agrupan los partidos por cancha) y la
 * tabla OFICIAL en el orden publicado: [equipo, PJ, PG, PE, PP, PF, PC, Pts].
 * El script de carga compara contra esta tabla lo que calcula el motor de posiciones.
 */
export const ZONAS = [
  { clave: 'A', cancha: 1, tabla: [['caeB', 3, 3, 0, 0, 57, 0, 12], ['social', 3, 2, 0, 1, 19, 20, 9], ['suri', 3, 1, 0, 2, 36, 24, 6], ['sanp', 3, 0, 0, 3, 0, 68, 3]] },
  { clave: 'B', cancha: 1, tabla: [['tigres', 3, 2, 1, 0, 40, 0, 10], ['cpmb', 3, 2, 1, 0, 21, 6, 10], ['caeN', 3, 1, 0, 2, 12, 43, 6], ['sixty', 3, 0, 0, 3, 16, 40, 3]] },
  { clave: 'C', cancha: 1, tabla: [['jockeyR', 3, 3, 0, 0, 111, 10, 12], ['teque', 3, 2, 0, 1, 44, 26, 9], ['crar', 3, 1, 0, 2, 24, 65, 6], ['nqnA', 3, 0, 0, 3, 10, 88, 3]] },
  { clave: 'D', cancha: 2, tabla: [['lasalle', 3, 3, 0, 0, 45, 12, 12], ['nqnR', 3, 2, 0, 1, 36, 27, 9], ['jockeyB', 3, 1, 0, 2, 13, 36, 6], ['regatas', 3, 0, 0, 3, 17, 36, 3]] },
  { clave: 'E', cancha: 2, tabla: [['taraguy', 3, 3, 0, 0, 37, 10, 12], ['slawnR', 3, 2, 0, 1, 33, 10, 9], ['teros', 3, 1, 0, 2, 8, 42, 6], ['prc', 3, 0, 0, 3, 0, 16, 3]] },
  { clave: 'F', cancha: 2, tabla: [['mendoza', 3, 3, 0, 0, 69, 0, 12], ['lomas', 3, 2, 0, 1, 28, 27, 9], ['unisf', 3, 1, 0, 2, 19, 26, 6], ['slawnB', 3, 0, 0, 3, 5, 68, 3]] },
  { clave: 'G', cancha: 3, tabla: [['crai', 3, 3, 0, 0, 63, 0, 12], ['unisalta', 3, 2, 0, 1, 71, 13, 9], ['aranB', 3, 1, 0, 2, 12, 61, 6], ['cata', 3, 0, 0, 3, 10, 82, 3]] },
  { clave: 'H', cancha: 3, tabla: [['tilcara', 3, 3, 0, 0, 55, 8, 12], ['aranN', 3, 1, 1, 1, 13, 10, 7], ['sanjuan', 3, 1, 1, 1, 14, 32, 7], ['charoga', 3, 0, 0, 3, 18, 50, 3]] },
];

/** Los 48 partidos de zona del sábado 24/10: [zona, hora, local, goles local, goles visitante, visitante]. */
export const PARTIDOS_ZONA = [
  // Cancha 1 · zonas A, B, C
  ['A', '09:30', 'caeB', 17, 0, 'suri'],
  ['B', '10:00', 'sixty', 0, 14, 'tigres'],
  ['C', '10:30', 'crar', 0, 48, 'jockeyR'],
  ['A', '11:00', 'sanp', 0, 12, 'social'],
  ['B', '11:30', 'caeN', 0, 7, 'cpmb'],
  ['C', '12:00', 'nqnA', 0, 27, 'teque'],
  ['A', '12:30', 'caeB', 25, 0, 'sanp'],
  ['B', '13:00', 'sixty', 10, 12, 'caeN'],
  ['C', '13:30', 'crar', 24, 5, 'nqnA'],
  ['A', '14:00', 'social', 7, 5, 'suri'],
  ['B', '14:30', 'cpmb', 0, 0, 'tigres'],
  ['C', '15:00', 'teque', 5, 26, 'jockeyR'],
  ['A', '15:30', 'caeB', 15, 0, 'social'],
  ['B', '16:00', 'sixty', 6, 14, 'cpmb'],
  ['C', '16:30', 'nqnA', 5, 37, 'jockeyR'],
  ['A', '17:00', 'sanp', 0, 31, 'suri'],
  ['B', '17:30', 'caeN', 0, 26, 'tigres'],
  ['C', '18:00', 'crar', 0, 12, 'teque'],
  // Cancha 2 · zonas D, E, F
  ['D', '09:30', 'lasalle', 19, 5, 'jockeyB'],
  ['E', '10:00', 'prc', 0, 3, 'slawnR'],
  ['F', '10:30', 'unisf', 19, 0, 'slawnB'],
  ['D', '11:00', 'regatas', 10, 19, 'nqnR'],
  ['E', '11:30', 'taraguy', 17, 5, 'teros'],
  ['F', '12:00', 'lomas', 0, 22, 'mendoza'],
  ['D', '12:30', 'lasalle', 12, 7, 'regatas'],
  ['E', '13:00', 'prc', 0, 10, 'taraguy'],
  ['F', '13:30', 'unisf', 0, 7, 'lomas'],
  ['D', '14:00', 'nqnR', 17, 3, 'jockeyB'],
  ['E', '14:30', 'teros', 0, 25, 'slawnR'],
  ['F', '15:00', 'mendoza', 28, 0, 'slawnB'],
  ['D', '15:30', 'lasalle', 14, 0, 'nqnR'],
  ['E', '16:00', 'prc', 0, 3, 'teros'],
  ['F', '16:30', 'unisf', 0, 19, 'mendoza'],
  ['D', '17:00', 'regatas', 0, 5, 'jockeyB'],
  ['E', '17:30', 'taraguy', 10, 5, 'slawnR'],
  ['F', '18:00', 'lomas', 21, 5, 'slawnB'],
  // Cancha 3 · zonas G, H
  ['G', '10:00', 'crai', 13, 0, 'unisalta'],
  ['H', '10:30', 'aranN', 10, 5, 'charoga'],
  ['G', '11:00', 'aranB', 12, 10, 'cata'],
  ['H', '11:30', 'tilcara', 24, 0, 'sanjuan'],
  ['G', '12:00', 'crai', 15, 0, 'aranB'],
  ['H', '12:30', 'aranN', 3, 5, 'tilcara'],
  ['G', '13:00', 'cata', 0, 35, 'unisalta'],
  ['H', '13:30', 'sanjuan', 14, 8, 'charoga'],
  ['G', '14:00', 'crai', 35, 0, 'cata'],
  ['H', '14:30', 'aranN', 0, 0, 'sanjuan'],
  ['G', '15:00', 'aranB', 0, 36, 'unisalta'],
  ['H', '15:30', 'tilcara', 26, 5, 'charoga'],
];

// ── Copas del domingo 25/10 ──────────────────────────────────────────────────

/**
 * Cuatro copas, cada una con cuartos (cruces fijos por puesto de zona: A-B, C-D, E-F,
 * G-H), dos semis y la final. Los equipos de los cuartos salen de la tabla; semis y
 * final son placeholders que completa el motor de avance cuando se cargan los
 * resultados (`tournament_match_advancement_rules`).
 *
 * `puesto`: 1 Oro, 2 Plata, 3 Bronce, 4 Cristal. `cuartos`: [hora, cancha, local, visitante].
 * `semis` y `final`: [hora, cancha].
 */
export const COPAS = [
  {
    clave: 'ORO', nombre: 'Copa Oro', puesto: 1,
    cuartos: [['10:00', 1, 'caeB', 'tigres'], ['11:00', 1, 'jockeyR', 'lasalle'], ['12:00', 1, 'taraguy', 'mendoza'], ['13:00', 1, 'crai', 'tilcara']],
    semis: [['14:30', 1], ['15:00', 1]], final: ['16:30', 1],
  },
  {
    clave: 'PLATA', nombre: 'Copa Plata', puesto: 2,
    cuartos: [['10:30', 1, 'social', 'cpmb'], ['11:30', 1, 'teque', 'nqnR'], ['12:30', 1, 'slawnR', 'lomas'], ['13:30', 1, 'unisalta', 'aranN']],
    semis: [['14:00', 2], ['14:30', 2]], final: ['16:00', 1],
  },
  {
    clave: 'BRONCE', nombre: 'Copa Bronce', puesto: 3,
    cuartos: [['10:00', 2, 'suri', 'caeN'], ['10:30', 2, 'crar', 'jockeyB'], ['11:00', 2, 'teros', 'unisf'], ['11:30', 2, 'aranB', 'sanjuan']],
    semis: [['12:30', 2], ['13:00', 2]], final: ['15:30', 1],
  },
  {
    clave: 'CRISTAL', nombre: 'Copa Cristal', puesto: 4,
    cuartos: [['10:00', 3, 'sanp', 'sixty'], ['10:30', 3, 'nqnA', 'regatas'], ['11:00', 3, 'prc', 'slawnB'], ['11:30', 3, 'cata', 'charoga']],
    semis: [['13:00', 3], ['13:30', 3]], final: ['15:00', 2],
  },
];

// ── Reglamento ───────────────────────────────────────────────────────────────

export const PUNTOS = { win: 4, draw: 2, loss: 1 };

/**
 * Desempates como ARRAY (de la otra forma el motor sólo desempata por diferencia).
 *
 * La placa no publica el criterio: se infirió de los dos empates de puntos que hay.
 * Zona B (Tigres y CPMB, 10 y 10, empataron 0-0 entre sí) y Zona H (Aranduroga Negro y
 * San Juan, 7 y 7, también 0-0) se ordenan por la diferencia GENERAL (+40 sobre +15,
 * +3 sobre -18). No va `head_to_head` antes: tras un cara a cara empatado el motor
 * calcula la diferencia sólo entre los empatados, que da 0-0, y cae a orden estable.
 */
export const TIEBREAKERS = [
  { metric: 'points',            label: 'Puntos obtenidos',     priority: 1, enabled: true },
  { metric: 'points_difference', label: 'Diferencia de tantos', priority: 2, enabled: true },
  { metric: 'points_for',        label: 'Tantos a favor',       priority: 3, enabled: true },
  { metric: 'won',               label: 'Partidos ganados',     priority: 4, enabled: true },
];

/** Las tres formas (canónica, legacy y `standings.points_base`): cada consumidor mira una distinta. */
export const RULESET = {
  pointsWin: PUNTOS.win,
  pointsDraw: PUNTOS.draw,
  pointsLoss: PUNTOS.loss,
  points: { ...PUNTOS },
  pointsSystem: { ...PUNTOS, allowBonusPoints: false },
  standings: { points_base: { ...PUNTOS }, bonus_rules: [] },
  walkover: { winnerPoints: PUNTOS.win, score: { winner: 10, loser: 0 }, noShowPoints: 0 },
  knockoutTiebreak: 'drops',
  competition: { format_type: 'groups', parameters: { season_model: 'single_event' } },
  tiebreakers: TIEBREAKERS,
};
