/**
 * CANON del Sudamericano de Rugby Seven 2026 (Sudamérica Rugby) en G22: las
 * selecciones, los grupos, el fixture de las dos ramas y los cruces del
 * domingo. Datos puros, sin dependencias — el que escribe es `seed.mjs`.
 *
 * Fuente: ESPN, "Los Pumas 7's y Las Yaguaretés en el Sudamericano de Seven:
 * fixture completo, partidos y resultados" (FUENTE_ESPN). La nota se va
 * actualizando con los resultados; `seed.mjs --resultados` la vuelve a leer.
 *
 * Erratas de la nota, corregidas acá:
 * - Masculino 16:42 "Perú - Guatemala · Trophy-Grupo D": es del Grupo C (Perú
 *   y Guatemala están en el C; el D es Venezuela, Rep. Dominicana y Honduras).
 * - Femenino 17:15 "1° Grupo A - 1° Grupo A · 1° puesto": es 1° A contra 1° B.
 *
 * Formato masculino: Cup (Grupos A y B) y Trophy (C y D), todos contra todos el
 * sábado. El domingo los 1° y 2° de la Cup juegan la ZONA ORO —los cruces del
 * mismo grupo no se repiten, así que arrastran el del sábado— y de ahí salen la
 * final y el 3° puesto. Los 3° de la Cup cruzan con los 1° del Trophy (5° al 8°)
 * y los 2° y 3° del Trophy definen del 9° al 12°.
 *
 * Formato femenino: dos zonas de cinco, todas contra todas (sábado y domingo a
 * la mañana), y finales por puesto entre las zonas (7°, 5°, 3° y final). Los 5°
 * de zona no juegan definición.
 */

export const TEMPORADA = '2026';
export const SEDE = 'Carlos Paz Rugby Club, Villa Carlos Paz';
export const LOGO_TORNEO = '/competiciones/sudamerica-rugby-seven.png';
export const UNION_SAR = '4edd19cb-d935-4710-a27a-f248fc87d7f3'; // Sudamerica Rugby
export const FUENTE_ESPN = 'https://www.espn.com.ar/rugby/nota/_/id/17346620/rugby-argentina-los-pumas-7s-las-yaguaretes-sudamericano-seven-fixture-completo-partidos-resultados';

export const DIAS = {
  sabado: '2026-10-10',
  domingo: '2026-10-11',
};

/** La nota publica la hora de Argentina (UTC-3 todo el año). */
export function instanteDe(dia, hora) {
  return new Date(`${DIAS[dia]}T${hora}:00-03:00`).toISOString();
}

/**
 * Selecciones de seven que hay que DAR DE ALTA. Las demás ya estaban en `clubs`
 * con escudo propio (Los Pumas 7s, Uruguay 7s, Argentina 7s W = Las
 * Yaguaretés, Brazil 7s W, Chile W 7s, Perú W 7s).
 *
 * Escudo: la bandera del país de `public/logos/selecciones` — una rama de seven
 * sin escudo propio no tiene otro. Si aparece el escudo de la unión, se
 * reemplaza con `scripts/escudos/variantes.mjs`.
 */
export const CLUBES_NUEVOS = [
  { id: 'chile-7s', name: 'Chile 7s', short: 'Chile', pais: 'Chile', bandera: 'chile' },
  { id: 'brasil-7s', name: 'Brasil 7s', short: 'Brasil', pais: 'Brasil', bandera: 'brazil' },
  { id: 'colombia-7s', name: 'Colombia 7s', short: 'Colombia', pais: 'Colombia', bandera: 'colombia' },
  { id: 'paraguay-7s', name: 'Paraguay 7s', short: 'Paraguay', pais: 'Paraguay', bandera: 'paraguay' },
  { id: 'peru-7s', name: 'Perú 7s', short: 'Perú', pais: 'Perú', bandera: 'peru' },
  { id: 'guatemala-7s', name: 'Guatemala 7s', short: 'Guatemala', pais: 'Guatemala', bandera: 'guatemala' },
  { id: 'ecuador-7s', name: 'Ecuador 7s', short: 'Ecuador', pais: 'Ecuador', bandera: 'ecuador' },
  { id: 'venezuela-7s', name: 'Venezuela 7s', short: 'Venezuela', pais: 'Venezuela', bandera: 'venezuela' },
  { id: 'republica-dominicana-7s', name: 'República Dominicana 7s', short: 'Rep. Dominicana', pais: 'República Dominicana', bandera: 'dominican-republic' },
  { id: 'honduras-7s', name: 'Honduras 7s', short: 'Honduras', pais: 'Honduras', bandera: 'honduras' },
  { id: 'uruguay-7s-w', name: 'Uruguay 7s W', short: 'Uruguay', pais: 'Uruguay', bandera: 'uruguay' },
  { id: 'paraguay-7s-w', name: 'Paraguay 7s W', short: 'Paraguay', pais: 'Paraguay', bandera: 'paraguay' },
  { id: 'guatemala-7s-w', name: 'Guatemala 7s W', short: 'Guatemala', pais: 'Guatemala', bandera: 'guatemala' },
  { id: 'republica-dominicana-7s-w', name: 'República Dominicana 7s W', short: 'Rep. Dominicana', pais: 'República Dominicana', bandera: 'dominican-republic' },
  { id: 'colombia-7s-w', name: 'Colombia 7s W', short: 'Colombia', pais: 'Colombia', bandera: 'colombia' },
  { id: 'ecuador-7s-w', name: 'Ecuador 7s W', short: 'Ecuador', pais: 'Ecuador', bandera: 'ecuador' },
];

/** País como lo escribe la nota (sin tildes, minúsculas) → club de cada rama. */
export const EQUIPOS = {
  m: {
    argentina: 'los-pumas-7-s',
    uruguay: 'uruguay-7s',
    chile: 'chile-7s',
    brasil: 'brasil-7s',
    colombia: 'colombia-7s',
    paraguay: 'paraguay-7s',
    peru: 'peru-7s',
    guatemala: 'guatemala-7s',
    ecuador: 'ecuador-7s',
    venezuela: 'venezuela-7s',
    'republica dominicana': 'republica-dominicana-7s',
    honduras: 'honduras-7s',
  },
  w: {
    argentina: 'argentina-7s-w',
    uruguay: 'uruguay-7s-w',
    paraguay: 'paraguay-7s-w',
    guatemala: 'guatemala-7s-w',
    'republica dominicana': 'republica-dominicana-7s-w',
    brasil: 'brazil-7s-w',
    colombia: 'colombia-7s-w',
    chile: 'chile-w-7s',
    peru: 'peru-w-7s',
    ecuador: 'ecuador-7s-w',
  },
};

/** Nombre que lleva cada selección en el torneo (la ficha puede decir "7s W"). */
export const NOMBRES = {
  'los-pumas-7-s': 'Argentina', 'uruguay-7s': 'Uruguay', 'chile-7s': 'Chile', 'brasil-7s': 'Brasil',
  'colombia-7s': 'Colombia', 'paraguay-7s': 'Paraguay', 'peru-7s': 'Perú', 'guatemala-7s': 'Guatemala',
  'ecuador-7s': 'Ecuador', 'venezuela-7s': 'Venezuela', 'republica-dominicana-7s': 'República Dominicana',
  'honduras-7s': 'Honduras',
  'argentina-7s-w': 'Argentina', 'uruguay-7s-w': 'Uruguay', 'paraguay-7s-w': 'Paraguay',
  'guatemala-7s-w': 'Guatemala', 'republica-dominicana-7s-w': 'República Dominicana',
  'brazil-7s-w': 'Brasil', 'colombia-7s-w': 'Colombia', 'chile-w-7s': 'Chile', 'peru-w-7s': 'Perú',
  'ecuador-7s-w': 'Ecuador',
};

const M = EQUIPOS.m;
const W = EQUIPOS.w;

/**
 * Las dos ramas. En `final`, un cruce sale de la TABLA de un grupo
 * (`{ pos, zona }`) o de OTRO PARTIDO (`{ de, resultado }`). Los equipos del
 * domingo los completa `seed.mjs --resultados` con lo que publique la nota.
 * `ronda` agrupa los partidos del domingo; la final va SOLA en su ronda: el
 * trigger del campeón sólo decide con una ronda "Final" de un partido.
 */
export const TORNEOS = [
  {
    clave: 'm',
    nombre: 'Sudamericano de Rugby Seven',
    slug: 'sudamericano-de-rugby-seven',
    genero: 'masculino',
    desde: DIAS.sabado,
    hasta: DIAS.domingo,
    zonas: [
      { nombre: 'Grupo A', copa: 'Cup', clubes: [M.argentina, M.colombia, M.paraguay] },
      { nombre: 'Grupo B', copa: 'Cup', clubes: [M.chile, M.uruguay, M.brasil] },
      { nombre: 'Grupo C', copa: 'Trophy', clubes: [M.peru, M.guatemala, M.ecuador] },
      { nombre: 'Grupo D', copa: 'Trophy', clubes: [M.venezuela, M['republica dominicana'], M.honduras] },
    ],
    grupos: [
      { n: 1, dia: 'sabado', hora: '10:28', zona: 'Grupo D', local: M['republica dominicana'], visitante: M.honduras },
      { n: 2, dia: 'sabado', hora: '10:50', zona: 'Grupo C', local: M.guatemala, visitante: M.ecuador },
      { n: 3, dia: 'sabado', hora: '11:12', zona: 'Grupo B', local: M.uruguay, visitante: M.brasil },
      { n: 4, dia: 'sabado', hora: '11:34', zona: 'Grupo A', local: M.colombia, visitante: M.paraguay },
      { n: 5, dia: 'sabado', hora: '13:24', zona: 'Grupo D', local: M.venezuela, visitante: M.honduras },
      { n: 6, dia: 'sabado', hora: '13:46', zona: 'Grupo C', local: M.peru, visitante: M.ecuador },
      { n: 7, dia: 'sabado', hora: '14:08', zona: 'Grupo B', local: M.chile, visitante: M.brasil },
      { n: 8, dia: 'sabado', hora: '14:30', zona: 'Grupo A', local: M.argentina, visitante: M.paraguay },
      { n: 9, dia: 'sabado', hora: '16:20', zona: 'Grupo D', local: M.venezuela, visitante: M['republica dominicana'] },
      { n: 10, dia: 'sabado', hora: '16:42', zona: 'Grupo C', local: M.peru, visitante: M.guatemala },
      { n: 11, dia: 'sabado', hora: '17:04', zona: 'Grupo B', local: M.chile, visitante: M.uruguay },
      { n: 12, dia: 'sabado', hora: '17:26', zona: 'Grupo A', local: M.argentina, visitante: M.colombia },
    ],
    rondasFinal: ['Zona Oro', 'Definiciones por puesto', 'Final'],
    final: [
      { n: 13, hora: '09:44', ronda: 'Definiciones por puesto', definicion: 'Semifinal 9° puesto', local: { pos: 2, zona: 'Grupo C' }, visitante: { pos: 3, zona: 'Grupo D' } },
      { n: 14, hora: '10:09', ronda: 'Definiciones por puesto', definicion: 'Semifinal 9° puesto', local: { pos: 2, zona: 'Grupo D' }, visitante: { pos: 3, zona: 'Grupo C' } },
      { n: 15, hora: '10:34', ronda: 'Definiciones por puesto', definicion: 'Semifinal 5° puesto', local: { pos: 3, zona: 'Grupo A' }, visitante: { pos: 1, zona: 'Grupo D' } },
      { n: 16, hora: '10:59', ronda: 'Definiciones por puesto', definicion: 'Semifinal 5° puesto', local: { pos: 3, zona: 'Grupo B' }, visitante: { pos: 1, zona: 'Grupo C' } },
      { n: 17, hora: '11:24', ronda: 'Zona Oro', definicion: 'Zona Oro', local: { pos: 1, zona: 'Grupo B' }, visitante: { pos: 2, zona: 'Grupo A' } },
      { n: 18, hora: '11:46', ronda: 'Zona Oro', definicion: 'Zona Oro', local: { pos: 1, zona: 'Grupo A' }, visitante: { pos: 2, zona: 'Grupo B' } },
      { n: 19, hora: '13:36', ronda: 'Definiciones por puesto', definicion: '11° puesto', local: { de: 13, resultado: 'loser' }, visitante: { de: 14, resultado: 'loser' } },
      { n: 20, hora: '14:01', ronda: 'Definiciones por puesto', definicion: '9° puesto', local: { de: 13, resultado: 'winner' }, visitante: { de: 14, resultado: 'winner' } },
      { n: 21, hora: '14:26', ronda: 'Zona Oro', definicion: 'Zona Oro', local: { pos: 2, zona: 'Grupo B' }, visitante: { pos: 2, zona: 'Grupo A' } },
      { n: 22, hora: '14:48', ronda: 'Zona Oro', definicion: 'Zona Oro', local: { pos: 1, zona: 'Grupo A' }, visitante: { pos: 1, zona: 'Grupo B' } },
      { n: 23, hora: '15:10', ronda: 'Definiciones por puesto', definicion: '7° puesto', local: { de: 15, resultado: 'loser' }, visitante: { de: 16, resultado: 'loser' } },
      { n: 24, hora: '16:25', ronda: 'Definiciones por puesto', definicion: '5° puesto', local: { de: 15, resultado: 'winner' }, visitante: { de: 16, resultado: 'winner' } },
      { n: 25, hora: '17:40', ronda: 'Definiciones por puesto', definicion: '3° puesto', local: { pos: 3, zona: 'Zona Oro' }, visitante: { pos: 4, zona: 'Zona Oro' } },
      { n: 26, hora: '18:05', ronda: 'Final', definicion: 'Final', local: { pos: 1, zona: 'Zona Oro' }, visitante: { pos: 2, zona: 'Zona Oro' } },
    ],
  },
  {
    clave: 'w',
    nombre: 'Sudamericano de Rugby Seven Femenino',
    slug: 'sudamericano-de-rugby-seven-femenino',
    genero: 'femenino',
    desde: DIAS.sabado,
    hasta: DIAS.domingo,
    zonas: [
      { nombre: 'Grupo A', clubes: [W.argentina, W.paraguay, W.uruguay, W.guatemala, W['republica dominicana']] },
      { nombre: 'Grupo B', clubes: [W.brasil, W.colombia, W.chile, W.peru, W.ecuador] },
    ],
    grupos: [
      { n: 1, dia: 'sabado', hora: '09:00', zona: 'Grupo B', local: W.chile, visitante: W.ecuador },
      { n: 2, dia: 'sabado', hora: '09:22', zona: 'Grupo B', local: W.colombia, visitante: W.peru },
      { n: 3, dia: 'sabado', hora: '09:44', zona: 'Grupo A', local: W.uruguay, visitante: W['republica dominicana'] },
      { n: 4, dia: 'sabado', hora: '10:06', zona: 'Grupo A', local: W.paraguay, visitante: W.guatemala },
      { n: 5, dia: 'sabado', hora: '11:56', zona: 'Grupo B', local: W.chile, visitante: W.peru },
      { n: 6, dia: 'sabado', hora: '12:18', zona: 'Grupo B', local: W.brasil, visitante: W.ecuador },
      { n: 7, dia: 'sabado', hora: '12:40', zona: 'Grupo A', local: W.uruguay, visitante: W.guatemala },
      { n: 8, dia: 'sabado', hora: '13:02', zona: 'Grupo A', local: W.argentina, visitante: W['republica dominicana'] },
      { n: 9, dia: 'sabado', hora: '14:52', zona: 'Grupo B', local: W.colombia, visitante: W.chile },
      { n: 10, dia: 'sabado', hora: '15:14', zona: 'Grupo B', local: W.brasil, visitante: W.peru },
      { n: 11, dia: 'sabado', hora: '15:36', zona: 'Grupo A', local: W.paraguay, visitante: W.uruguay },
      { n: 12, dia: 'sabado', hora: '15:58', zona: 'Grupo A', local: W.argentina, visitante: W.guatemala },
      { n: 13, dia: 'sabado', hora: '17:48', zona: 'Grupo B', local: W.brasil, visitante: W.colombia },
      { n: 14, dia: 'sabado', hora: '18:10', zona: 'Grupo A', local: W.argentina, visitante: W.paraguay },
      { n: 15, dia: 'domingo', hora: '09:00', zona: 'Grupo B', local: W.peru, visitante: W.ecuador },
      { n: 16, dia: 'domingo', hora: '09:22', zona: 'Grupo A', local: W.guatemala, visitante: W['republica dominicana'] },
      { n: 17, dia: 'domingo', hora: '12:08', zona: 'Grupo B', local: W.colombia, visitante: W.ecuador },
      { n: 18, dia: 'domingo', hora: '12:30', zona: 'Grupo B', local: W.brasil, visitante: W.chile },
      { n: 19, dia: 'domingo', hora: '12:52', zona: 'Grupo A', local: W.paraguay, visitante: W['republica dominicana'] },
      { n: 20, dia: 'domingo', hora: '13:14', zona: 'Grupo A', local: W.argentina, visitante: W.uruguay },
    ],
    rondasFinal: ['Definiciones por puesto', 'Final'],
    final: [
      { n: 21, hora: '15:35', ronda: 'Definiciones por puesto', definicion: '7° puesto', local: { pos: 4, zona: 'Grupo A' }, visitante: { pos: 4, zona: 'Grupo B' } },
      { n: 22, hora: '16:00', ronda: 'Definiciones por puesto', definicion: '5° puesto', local: { pos: 3, zona: 'Grupo A' }, visitante: { pos: 3, zona: 'Grupo B' } },
      { n: 23, hora: '16:50', ronda: 'Definiciones por puesto', definicion: '3° puesto', local: { pos: 2, zona: 'Grupo A' }, visitante: { pos: 2, zona: 'Grupo B' } },
      { n: 24, hora: '17:15', ronda: 'Final', definicion: 'Final', local: { pos: 1, zona: 'Grupo A' }, visitante: { pos: 1, zona: 'Grupo B' } },
    ],
  },
];

/**
 * Seven (criterio del 10/10): 3 por ganar, 2 por empatar, 0 por perder y 1 de
 * bonus defensivo por perder por 7 o menos (margen 7, como el rugby XV: el
 * motor cuenta `diferencia <= margin`).
 */
export const MARGEN_BONUS = 7;
export const PUNTOS = { win: 3, draw: 2, loss: 0, bonusTry: 0, bonusLoss: 1 };

/** Como ARRAY: el `{ order: [...] }` viejo falla el `Array.isArray` del motor. */
export const TIEBREAKERS = [
  { metric: 'points', label: 'Puntos obtenidos', priority: 1, enabled: true },
  { metric: 'head_to_head', label: 'Resultado entre sí', priority: 2, enabled: true },
  { metric: 'points_difference', label: 'Diferencia de tantos', priority: 3, enabled: true },
  { metric: 'tries_for', label: 'Tries a favor', priority: 4, enabled: true },
  { metric: 'won', label: 'Partidos ganados', priority: 5, enabled: true },
];

/**
 * Las TRES formas del puntaje a propósito (canónica del gestor, legacy del
 * motor y `standings` del reglamento): cada consumidor lee una distinta y el
 * que no encuentra la suya cae a los defaults de rugby 4/2/0 sin avisar.
 */
export const RULESET = {
  modality: 'Seven',
  pointsWin: PUNTOS.win,
  pointsDraw: PUNTOS.draw,
  pointsLoss: PUNTOS.loss,
  pointsBonusTry: 0,
  pointsBonusLoss: PUNTOS.bonusLoss,
  points: { win: PUNTOS.win, draw: PUNTOS.draw, loss: PUNTOS.loss },
  pointsSystem: { ...PUNTOS, allowBonusPoints: true },
  bonus: { offensive: { tries: 0, points: 0 }, defensive: { margin: MARGEN_BONUS, points: PUNTOS.bonusLoss } },
  standings: {
    points_base: { win: PUNTOS.win, draw: PUNTOS.draw, loss: PUNTOS.loss },
    bonus_rules: [],
  },
  competition: { format_type: 'groups', parameters: { season_model: 'single_event' } },
  tiebreakers: TIEBREAKERS,
  organizers: [{ name: 'Sudamérica Rugby', union_id: UNION_SAR, is_primary: true }],
};
