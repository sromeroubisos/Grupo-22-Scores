/**
 * CANON de los dos torneos M19 2026 de la Unión de Rugby del Noreste (URNE):
 * "Torneo Apertura" (una rueda, 7 fechas) y "Torneo Oficial" (1ª rueda, 14 partidos
 * por club + semifinales pendientes). Datos puros; el que escribe es `seed.mjs`.
 *
 * Fuente: fichas de la base de datos UAR (texto pegado, 2026-10-29). El marcador
 * y los puntos de cada partido salen del encabezado de la ficha: `[n]` es el total
 * de puntos de tabla del club (4/2/0 + bonus), así que el bonus se deriva como
 * `n - base` y no se infiere del tanteador. Los W.O. suman 21-0 y 5 puntos al ganador.
 *
 * Los clubes son fichas M19 propias (Taraguy y Aranduroga mandan A y B) con el
 * escudo del club base.
 */
export const TEMPORADA = '2026';
export const UNION = 'urne';
export const ORIGEN = 'urne-m19-2026';

/** Argentina no mueve el reloj: UTC-3 todo el año. */
export function instanteDe(dia, hora) {
  return new Date(`${dia}T${hora}:00-03:00`).toISOString();
}

export const CLUBES = {
  REG: { id: 'regatas-de-resistencia-m19', name: 'Regatas de Resistencia M19', city: 'Resistencia', base: 'regatas-de-resistencia' },
  TA: { id: 'taraguy-r-c-m19-a', name: 'Taraguy R.C. M19 "A"', city: 'Resistencia', base: 'taraguy-r-c' },
  TB: { id: 'taraguy-r-c-m19-b', name: 'Taraguy R.C. M19 "B"', city: 'Resistencia', base: 'taraguy-r-c' },
  AA: { id: 'aranduroga-r-c-m19-a', name: 'Aranduroga R.C. M19 "A"', city: 'Resistencia', base: 'aranduroga-r-c' },
  AB: { id: 'aranduroga-r-c-m19-b', name: 'Aranduroga R.C. M19 "B"', city: 'Resistencia', base: 'aranduroga-r-c' },
  SIX: { id: 'sixty-r-c-m19', name: 'Sixty R.C. M19', city: 'Resistencia', base: 'sixty-r-c' },
  CUR: { id: 'curne-m19', name: 'CURNE M19', city: 'Resistencia', base: 'curne' },
  SPA: { id: 'san-patricio-m19', name: 'San Patricio M19', city: 'Corrientes', base: 'san-patricio' },
};

export const RULESET = {
  pointsWin: 4, pointsDraw: 2, pointsLoss: 0, pointsBonusTry: 1, pointsBonusLoss: 1,
  competition: { parameters: { season_model: 'single_event', ranking_scope: 'match_points' }, format_type: 'league' },
};

export const TIEBREAKERS = [
  { label: 'Puntos obtenidos', order: 1, metric: 'points_table', enabled: true, priority: 1 },
  { label: 'Diferencia de Tantos', order: 2, metric: 'points_diff', enabled: true, priority: 2 },
];

/** Partidos cuya sede NO es la cancha del local (la ficha trae "Lugar"). */
const SEDE_DISTINTA = { 307886: 'TA', 307073: 'CUR' };

/**
 * nro | fecha | dd/mm | hh:mm | local | visitante | tantos L | tantos V | puntos tabla L | puntos tabla V
 */
function parse(filas) {
  return filas.map(([nro, fecha, dm, hora, local, visitante, gl, gv, pl, pv]) => {
    const [d, m] = dm.split('/');
    const base = (a, b) => (a > b ? 4 : a === b ? 2 : 0);
    const bl = pl - base(gl, gv);
    const bv = pv - base(gv, gl);
    if (bl < 0 || bv < 0 || bl > 1 || bv > 1) throw new Error(`partido ${nro}: puntos de tabla inconsistentes (${pl}/${pv})`);
    return {
      nro, fecha, dia: `2026-${m}-${d}`, hora, local, visitante, sede: SEDE_DISTINTA[nro] ?? local,
      r: [gl, gv, bl, bv],
    };
  });
}

const APERTURA = parse([
  [296245, 1, '22/03', '14:30', 'AB', 'SIX', 14, 26, 0, 4],
  [296243, 1, '22/03', '16:00', 'AA', 'CUR', 20, 10, 4, 0],
  [296244, 1, '21/03', '13:30', 'TA', 'TB', 22, 26, 1, 4],
  [296242, 1, '21/03', '14:30', 'SPA', 'REG', 5, 46, 0, 5],
  [297101, 2, '28/03', '14:30', 'TB', 'AB', 24, 29, 1, 4],
  [297100, 2, '28/03', '14:30', 'SPA', 'SIX', 24, 35, 0, 4],
  [297099, 2, '28/03', '16:00', 'CUR', 'REG', 17, 53, 0, 5],
  [297098, 2, '28/03', '16:00', 'TA', 'AA', 26, 8, 5, 0],
  [302096, 3, '11/04', '14:00', 'REG', 'TB', 45, 10, 5, 0],
  [302095, 3, '11/04', '14:00', 'AA', 'SPA', 43, 7, 5, 0],
  [302094, 3, '11/04', '14:00', 'SIX', 'CUR', 17, 7, 4, 0],
  [307886, 3, '25/04', '14:00', 'AB', 'TA', 0, 24, 0, 5],
  [307074, 4, '18/04', '14:00', 'SPA', 'AB', 24, 38, 0, 4],
  [307073, 4, '18/04', '16:00', 'TB', 'CUR', 12, 19, 1, 4],
  [307072, 4, '18/04', '14:00', 'AA', 'REG', 21, 63, 0, 5],
  [307071, 4, '18/04', '14:00', 'SIX', 'TA', 12, 67, 0, 5],
  [308547, 5, '03/05', '14:00', 'REG', 'SIX', 54, 3, 5, 0],
  [308550, 5, '02/05', '14:30', 'CUR', 'AB', 38, 26, 4, 0],
  [308548, 5, '02/05', '14:00', 'TA', 'SPA', 59, 19, 5, 0],
  [308549, 5, '01/05', '13:30', 'AA', 'TB', 50, 33, 4, 0],
  [309151, 6, '09/05', '14:30', 'AB', 'REG', 0, 21, 0, 5],
  [309150, 6, '09/05', '11:00', 'TB', 'SPA', 0, 21, 0, 5],
  [309149, 6, '09/05', '14:00', 'SIX', 'AA', 38, 38, 2, 2],
  [309148, 6, '09/05', '14:00', 'TA', 'CUR', 19, 10, 4, 0],
  [309499, 7, '16/05', '14:00', 'AB', 'AA', 0, 21, 0, 5],
  [309498, 7, '16/05', '12:30', 'SIX', 'TB', 32, 14, 5, 0],
  [309497, 7, '16/05', '14:00', 'REG', 'TA', 41, 38, 4, 1],
  [309496, 7, '16/05', '14:00', 'CUR', 'SPA', 43, 7, 5, 0],
]);

const OFICIAL = parse([
  [326811, 16, '17/10', '14:00', 'TA', 'CUR', 0, 21, 0, 5],
  [326809, 16, '17/10', '14:00', 'TB', 'SPA', 57, 24, 5, 0],
  [326807, 16, '17/10', '14:00', 'AA', 'AB', 12, 50, 0, 5],
  [326806, 16, '17/10', '14:00', 'SIX', 'REG', 15, 57, 0, 5],
  [326093, 15, '21/10', '21:00', 'TB', 'AB', 24, 12, 4, 0],
  [326094, 15, '11/10', '14:00', 'REG', 'AA', 24, 10, 5, 0],
  [326092, 15, '10/10', '14:00', 'SIX', 'CUR', 12, 20, 0, 4],
  [326091, 15, '10/10', '14:00', 'SPA', 'TA', 43, 29, 4, 0],
  [325561, 14, '03/10', '14:00', 'AB', 'SPA', 58, 0, 5, 0],
  [325559, 14, '03/10', '14:00', 'CUR', 'REG', 5, 49, 0, 5],
  [325557, 14, '03/10', '16:00', 'AA', 'SIX', 22, 38, 0, 5],
  [325555, 14, '03/10', '16:00', 'TA', 'TB', 12, 31, 0, 5],
  [324577, 13, '23/09', '21:00', 'TA', 'AB', 29, 15, 4, 0],
  [324580, 13, '19/09', '16:00', 'TB', 'SIX', 47, 10, 5, 0],
  [324579, 13, '19/09', '14:00', 'AA', 'CUR', 26, 12, 4, 0],
  [324578, 13, '19/09', '14:00', 'REG', 'SPA', 41, 7, 5, 0],
  [323405, 12, '06/09', '16:00', 'TB', 'REG', 14, 36, 0, 5],
  [323407, 12, '05/09', '14:00', 'CUR', 'SPA', 24, 24, 2, 2],
  [323404, 12, '05/09', '14:00', 'AA', 'TA', 5, 29, 0, 5],
  [323406, 12, '04/09', '21:30', 'SIX', 'AB', 7, 22, 0, 5],
  [325951, 11, '07/10', '21:00', 'SPA', 'AA', 14, 28, 0, 4],
  [322680, 11, '29/08', '13:00', 'CUR', 'TB', 28, 12, 4, 0],
  [322677, 11, '30/08', '16:00', 'TA', 'SIX', 62, 22, 5, 0],
  [322681, 11, '29/08', '13:00', 'REG', 'AB', 48, 20, 5, 0],
  [320823, 10, '23/08', '16:00', 'AA', 'TB', 34, 27, 4, 1],
  [320822, 10, '23/08', '12:30', 'AB', 'CUR', 12, 12, 2, 2],
  [320821, 10, '22/08', '14:30', 'SIX', 'SPA', 20, 15, 4, 1],
  [320820, 10, '22/08', '14:00', 'REG', 'TA', 21, 14, 4, 1],
  [320213, 9, '16/08', '14:00', 'REG', 'SIX', 52, 19, 5, 0],
  [320212, 9, '15/08', '12:30', 'SPA', 'AB', 31, 33, 1, 4],
  [320211, 9, '15/08', '14:00', 'CUR', 'TA', 15, 31, 0, 5],
  [319754, 8, '07/08', '22:15', 'AB', 'SIX', 38, 21, 5, 0],
  [319753, 8, '08/08', '11:30', 'REG', 'TB', 38, 19, 5, 0],
  [319752, 8, '12/08', '21:00', 'TA', 'AA', 33, 14, 5, 0],
  [315109, 7, '26/09', '16:00', 'SIX', 'TA', 27, 52, 0, 5],
  [315110, 7, '01/08', '13:00', 'CUR', 'AB', 14, 20, 1, 4],
  [314432, 7, '18/07', '12:30', 'SPA', 'TB', 19, 57, 0, 5],
  [324070, 6, '12/09', '14:30', 'SIX', 'TB', 33, 34, 1, 4],
  [314228, 6, '11/07', '12:45', 'AA', 'REG', 15, 42, 0, 5],
  [314227, 6, '11/07', '12:45', 'TA', 'SPA', 43, 19, 5, 0],
  [320613, 5, '26/08', '21:00', 'TA', 'TB', 21, 0, 5, 0],
  [313684, 5, '05/07', '14:00', 'REG', 'CUR', 38, 17, 5, 0],
  [313683, 5, '05/07', '11:30', 'AA', 'AB', 31, 24, 4, 1],
  [313685, 5, '04/07', '12:30', 'SIX', 'SPA', 56, 31, 5, 0],
  [312712, 4, '20/06', '14:00', 'SPA', 'REG', 0, 68, 0, 5],
  [312713, 4, '20/06', '14:00', 'CUR', 'AA', 24, 27, 1, 4],
  [312711, 4, '19/06', '21:30', 'AB', 'TB', 19, 38, 0, 5],
  [312136, 3, '14/06', '15:30', 'SPA', 'CUR', 17, 26, 0, 4],
  [312135, 3, '13/06', '14:00', 'SIX', 'AA', 40, 36, 4, 1],
  [312134, 3, '13/06', '14:00', 'TA', 'REG', 27, 27, 2, 2],
  [311479, 2, '06/06', '14:00', 'AA', 'SPA', 40, 41, 1, 4],
  [311478, 2, '06/06', '15:30', 'TB', 'CUR', 33, 22, 4, 0],
  [311477, 2, '06/06', '12:30', 'AB', 'TA', 29, 49, 0, 4],
  [310527, 1, '30/05', '15:30', 'TB', 'AA', 33, 22, 4, 0],
  [310526, 1, '30/05', '14:00', 'CUR', 'SIX', 22, 19, 4, 1],
  [312904, 1, '28/06', '14:00', 'AB', 'REG', 26, 24, 4, 1],
]);

export const TORNEOS = [
  {
    clave: 'apertura',
    nombre: 'Torneo Apertura URNE 2026 - M19',
    slug: 'urne-apertura-2026-m19',
    desde: '2026-03-21', hasta: '2026-05-16',
    fechas: 7, legs: 1,
    partidos: APERTURA,
    semis: [],
    // [PJ, G, E, P, TF, TC, PTS] — tabla oficial.
    tabla: {
      REG: [7, 7, 0, 0, 323, 94, 34], TA: [7, 5, 0, 2, 255, 116, 26], AA: [7, 4, 1, 2, 201, 177, 20],
      SIX: [7, 4, 1, 2, 163, 218, 19], CUR: [7, 3, 0, 4, 144, 154, 13], AB: [7, 2, 0, 5, 107, 178, 8],
      TB: [7, 1, 0, 6, 119, 218, 6], SPA: [7, 1, 0, 6, 107, 264, 5],
    },
  },
  {
    clave: 'oficial',
    nombre: 'Torneo Oficial URNE 2026 - M19',
    slug: 'urne-oficial-2026-m19',
    desde: '2026-05-30', hasta: '2026-11-08',
    fechas: 16, legs: 2,
    partidos: OFICIAL,
    // Semifinales pendientes (1º-4º y 2º-3º de la tabla).
    semis: [
      { nro: 327973, dia: '2026-10-31', hora: '12:30', local: 'TA', visitante: 'TB', codigo: 'SF-2' },
      { nro: 327972, dia: '2026-11-01', hora: '14:00', local: 'REG', visitante: 'AB', codigo: 'SF-1' },
    ],
    tabla: {
      REG: [14, 12, 1, 1, 565, 208, 62], TA: [14, 9, 1, 4, 431, 289, 46], TB: [14, 9, 0, 5, 426, 330, 42],
      AB: [14, 7, 1, 6, 378, 340, 35], CUR: [14, 5, 2, 7, 262, 320, 27], AA: [14, 5, 0, 9, 322, 431, 22],
      SIX: [14, 4, 0, 10, 339, 510, 20], SPA: [14, 2, 1, 11, 285, 580, 12],
    },
  },
];
