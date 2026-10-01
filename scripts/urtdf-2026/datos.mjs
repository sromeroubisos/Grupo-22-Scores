/**
 * CANON de los torneos 2026 (2º semestre) de la Unión de Rugby de Tierra del
 * Fuego en G22: Plantel Superior (Zona Competencia) y Juveniles M18. Datos
 * puros, sin dependencias — el que escribe en la base es `seed.mjs`.
 *
 * Fuentes:
 * - "Fixture 2026 2er semestre version 16-09" de la URTDF (PDF): fechas, canchas,
 *   horarios y libres de cada categoría.
 * - Tabla de posiciones de la fecha 2 (Instagram @unionrugbytdf, 28/9/2026):
 *   resultados y bonus de Plantel Superior y M18.
 *
 * Rarezas del fixture, todas reales:
 * - La FECHA 1 de las dos categorías se juega DESPUÉS: Competencia F1 el 10/10
 *   y M18 F1 el 7/11. Por eso la tabla "fecha 2" tiene clubes con 1 PJ y Ushuaia
 *   con 0 en Primera (libre en la F2). Las fechas van numeradas como las
 *   numera la Unión, no por orden de calendario.
 * - Primera: cinco clubes, doble rueda, uno libre por fecha. Final 1º vs 2º.
 * - M18: cuatro clubes, doble rueda en siete fechas — la F3 y la F4 tienen un
 *   solo partido y dos libres. Final 1º vs 2º y partido por el 3º.
 * - El 23-25/10 no hay M18: Torneo Select 12 de la URTDF.
 * - El PDF escribe "RGRHC" en algunas celdas: es RGHRC (Río Grande R&HC).
 * - Las finales del 5/12 dicen "A DEFINIR" en cancha y horario: entran a las
 *   16:00 con la nota `horario a definir`.
 *
 * El bonus va como lo publica la Unión (columna BP), no deducido del tanteador.
 */

export const TEMPORADA = '2026';
export const UNION = 'union-de-rugby-de-tierra-del-fuego';
export const ORIGEN = 'urtdf-2026';

/** Tierra del Fuego no mueve el reloj: UTC-3 todo el año. */
export function instanteDe(dia, hora) {
  return new Date(`${dia}T${hora}:00-03:00`).toISOString();
}

/**
 * Siglas del fixture → club. `nuevo` = hay que darlo de alta; `escudo` = id del
 * archivo en public/clubs (si no está, el club entra sin escudo y se completa
 * después con `seed.mjs --escudos`).
 */
export const CLUBES = {
  URC: { id: 'ushuaia-rugby-club', name: 'Ushuaia Rugby Club', city: 'Ushuaia', nuevo: true },
  CUR: { id: 'universitario-de-rio-grande', name: 'Club Universitario de Rugby', city: 'Río Grande', nuevo: true },
  TRC: { id: 'tolhuin-rugby-club', name: 'Tolhuin Rugby Club', city: 'Tolhuin', nuevo: true },
  CCDS: { id: 'club-colegio-del-sur', name: 'Club Colegio del Sur', city: 'Ushuaia', nuevo: true },
  RGHRC: { id: 'rio-grande-rugby-hockey-club', name: 'Río Grande Rugby & Hockey Club', city: 'Río Grande', nuevo: true },
  // Ya existía (escudo en Storage, unión TDF). No confundir con `aguilas-rc-saenz-pena`.
  CLA: { id: 'club-las-aguilas', name: 'Club Las Águilas', city: 'Ushuaia', nuevo: false },
};

export const RULESET = {
  pointsWin: 4, pointsDraw: 2, pointsLoss: 0, pointsBonusTry: 1, pointsBonusLoss: 1,
  competition: { parameters: { season_model: 'single_event', ranking_scope: 'match_points' }, format_type: 'league' },
};

export const TIEBREAKERS = [
  { label: 'Puntos obtenidos', order: 1, metric: 'points_table', enabled: true, priority: 1 },
  { label: 'Diferencia de Tantos', order: 2, metric: 'points_diff', enabled: true, priority: 2 },
];

/**
 * Un partido de la fase regular. Si se jugó, `r` es
 * [tantos local, tantos visitante, bonus local, bonus visitante].
 */
const p = (fecha, dia, hora, local, visitante, r = null) => ({ fecha, dia, hora, local, visitante, r });

export const TORNEOS = [
  {
    clave: 'primera',
    nombre: 'Tierra del Fuego Clausura',
    slug: 'urtdf-zona-competencia',
    categoria: 'Primera', edad: 'Mayores (Adults)',
    desde: '2026-09-26', hasta: '2026-12-05',
    fechas: 10,
    tags: [{ id: '1', color: '#00a365', label: 'Final', fromPosition: 1, toPosition: 2 }],
    partidos: [
      p(2, '2026-09-26', '16:00', 'TRC', 'CCDS', [3, 60, 0, 1]),
      p(2, '2026-09-26', '16:00', 'CUR', 'CLA', [31, 8, 1, 0]),
      p(3, '2026-10-03', '16:00', 'CLA', 'TRC'),
      p(3, '2026-10-03', '16:00', 'CCDS', 'URC'),
      p(1, '2026-10-10', '16:00', 'TRC', 'URC'),
      p(1, '2026-10-10', '16:00', 'CUR', 'CCDS'),
      p(4, '2026-10-17', '16:00', 'CUR', 'TRC'),
      p(4, '2026-10-17', '16:00', 'URC', 'CLA'),
      p(5, '2026-10-24', '16:00', 'CCDS', 'CLA'),
      p(5, '2026-10-24', '16:00', 'CUR', 'URC'),
      p(6, '2026-10-31', '16:00', 'URC', 'TRC'),
      p(6, '2026-10-31', '16:00', 'CCDS', 'CUR'),
      p(7, '2026-11-07', '16:00', 'CCDS', 'TRC'),
      p(7, '2026-11-07', '16:00', 'CLA', 'CUR'),
      p(8, '2026-11-14', '16:00', 'TRC', 'CLA'),
      p(8, '2026-11-14', '16:00', 'URC', 'CCDS'),
      p(9, '2026-11-21', '16:00', 'CLA', 'CCDS'),
      p(9, '2026-11-21', '16:00', 'URC', 'CUR'),
      p(10, '2026-11-28', '16:00', 'TRC', 'CUR'),
      p(10, '2026-11-28', '16:00', 'CLA', 'URC'),
    ],
    libres: { 1: 'CLA', 2: 'URC', 3: 'CUR', 4: 'CCDS', 5: 'TRC', 6: 'CLA', 7: 'URC', 8: 'CUR', 9: 'TRC', 10: 'CCDS' },
    finales: [{ nombre: 'Final', dia: '2026-12-05', hora: '16:00', local: 1, visitante: 2 }],
    // Tabla oficial de la fecha 2: PJ G E P TF TC BP PTS. Se valida antes de escribir.
    tabla: {
      CCDS: [1, 1, 0, 0, 60, 3, 1, 5], CUR: [1, 1, 0, 0, 31, 8, 1, 5],
      CLA: [1, 0, 0, 1, 8, 31, 0, 0], TRC: [1, 0, 0, 1, 3, 60, 0, 0], URC: [0, 0, 0, 0, 0, 0, 0, 0],
    },
  },
  {
    clave: 'm18',
    nombre: 'Tierra del Fuego Clausura M18',
    slug: 'urtdf-juveniles-m18',
    categoria: 'Juvenil', edad: 'M18',
    desde: '2026-09-26', hasta: '2026-12-05',
    fechas: 7,
    tags: [
      { id: '1', color: '#00a365', label: 'Final', fromPosition: 1, toPosition: 2 },
      { id: '2', color: '#3b82f6', label: 'Por el 3º', fromPosition: 3, toPosition: 4 },
    ],
    partidos: [
      p(2, '2026-09-26', '14:00', 'RGHRC', 'URC', [17, 43, 0, 1]),
      p(2, '2026-09-26', '14:20', 'CUR', 'CLA', [12, 20, 0, 1]),
      p(3, '2026-10-03', '14:20', 'CLA', 'RGHRC'),
      p(4, '2026-10-10', '14:00', 'URC', 'CUR'),
      p(5, '2026-10-17', '14:20', 'CUR', 'RGHRC'),
      p(5, '2026-10-17', '14:10', 'URC', 'CLA'),
      p(6, '2026-10-31', '14:20', 'CLA', 'CUR'),
      p(6, '2026-10-31', '14:20', 'URC', 'RGHRC'),
      p(1, '2026-11-07', '14:00', 'CUR', 'URC'),
      p(1, '2026-11-07', '14:00', 'RGHRC', 'CLA'),
      p(7, '2026-11-28', '14:00', 'RGHRC', 'CUR'),
      p(7, '2026-11-28', '14:10', 'CLA', 'URC'),
    ],
    libres: { 3: 'CUR y URC', 4: 'CLA y RGHRC' },
    finales: [
      { nombre: 'Final', dia: '2026-12-05', hora: '16:00', local: 1, visitante: 2 },
      { nombre: 'Tercer puesto', dia: '2026-12-05', hora: '16:00', local: 3, visitante: 4 },
    ],
    tabla: {
      URC: [1, 1, 0, 0, 43, 17, 1, 5], CLA: [1, 1, 0, 0, 20, 12, 1, 5],
      RGHRC: [1, 0, 0, 1, 17, 43, 0, 0], CUR: [1, 0, 0, 1, 12, 20, 0, 0],
    },
  },
];
