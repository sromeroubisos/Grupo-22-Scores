/**
 * CANON del Campeonato Argentino Juvenil 2026 en G22: equipos, fixture,
 * cruces de la fase final y cuadro de honor. Datos puros, sin dependencias —
 * el que escribe en la base es `seed.mjs`.
 *
 * Fuente: fixture oficial 2026 (Anexo 1) y cuadro de honor 2001-2025.
 */

/** Los 16 seleccionados van con el nombre del fixture oficial, no con el de la provincia. */
export const CLUBES_M17 = [
  { id: 'uruguay-m17',       name: 'Uruguay M17',       union_id: 'uru-rugby',                       region: null,                    country: 'URY' },
  { id: 'buenos-aires-m17',  name: 'Buenos Aires M17',  union_id: 'urba',                            region: 'Buenos Aires',          country: 'ARG' },
  { id: 'tucuman-m17',       name: 'Tucumán M17',       union_id: null,                              region: 'Tucumán',               country: 'ARG' },
  { id: 'cordobesa-m17',     name: 'Cordobesa M17',     union_id: null,                              region: 'Córdoba',               country: 'ARG' },
  { id: 'cuyo-m17',          name: 'Cuyo M17',          union_id: null,                              region: 'Cuyo',                  country: 'ARG' },
  { id: 'santafesina-m17',   name: 'Santafesina M17',   union_id: 'union-santafesina-de-rugby',      region: 'Santa Fe',              country: 'ARG' },
  { id: 'rosario-m17',       name: 'Rosario M17',       union_id: null,                              region: 'Rosario',               country: 'ARG' },
  { id: 'salta-m17',         name: 'Salta M17',         union_id: null,                              region: 'Salta',                 country: 'ARG' },
  { id: 'austral-m17',       name: 'Austral M17',       union_id: 'union-austral',                   region: 'Santa Cruz',            country: 'ARG' },
  { id: 'alto-valle-m17',    name: 'Alto Valle M17',    union_id: 'union-de-rugby-de-alto-valle',    region: 'Alto Valle',            country: 'ARG' },
  { id: 'entrerriana-m17',   name: 'Entrerriana M17',   union_id: 'union-entrerriana-de-rugby',      region: 'Entre Ríos',            country: 'ARG' },
  { id: 'nordeste-m17',      name: 'Nordeste M17',      union_id: 'urne',                            region: 'Nordeste',              country: 'ARG' },
  { id: 'oeste-m17',         name: 'Oeste M17',         union_id: 'uroba',                           region: 'Oeste de Buenos Aires', country: 'ARG' },
  { id: 'sanjuanina-m17',    name: 'Sanjuanina M17',    union_id: null,                              region: 'San Juan',              country: 'ARG' },
  { id: 'mar-del-plata-m17', name: 'Mar del Plata M17', union_id: 'union-de-rugby-de-mar-del-plata', region: 'Mar del Plata',         country: 'ARG' },
  { id: 'chile-m17',         name: 'Chile M17',         union_id: 'chile-rugby',                     region: null,                    country: 'CHL' },
];

/** Sólo los cuatro campeones del M18: el resto de las uniones nunca ganó la categoría. */
export const CLUBES_M18 = [
  { id: 'buenos-aires-m18', name: 'Buenos Aires M18', union_id: 'urba', region: 'Buenos Aires', country: 'ARG' },
  { id: 'cordoba-m18',      name: 'Córdoba M18',      union_id: null,   region: 'Córdoba',      country: 'ARG' },
  { id: 'tucuman-m18',      name: 'Tucumán M18',      union_id: null,   region: 'Tucumán',      country: 'ARG' },
  { id: 'rosario-m18',      name: 'Rosario M18',      union_id: null,   region: 'Rosario',      country: 'ARG' },
];

/** El día de cada fecha. La hora va por partido, abajo. */
export const DIAS = {
  1: '2026-08-22',
  2: '2026-09-19',
  3: '2026-10-17',
  4: '2026-11-11',
  5: '2026-11-15',
};

/**
 * La hora que rige salvo que el partido diga otra. El fixture declaraba 16:00
 * para las fechas 1 a 3 y el pedido lo movió a las 12.
 */
export const HORA_POR_DEFECTO = '12:00';

/**
 * El instante en UTC, que es como lo guarda la base.
 *
 * El offset va escrito (`-03:00`) en vez de sumarle tres horas a mano: Argentina
 * no mueve el reloj desde 2009, pero la cuenta a mano es la que se olvida de
 * revisar si algún día lo mueve, y acá el error serían 40 partidos a la hora
 * equivocada sin que nada falle.
 */
export function instanteDe(fecha, hora = HORA_POR_DEFECTO) {
  return new Date(`${DIAS[fecha]}T${hora}:00-03:00`).toISOString();
}

/**
 * Los dos torneos. `posiciones` es el tramo de la tabla general que define
 * cada uno: el Campeonato pelea del 1º al 8º y el Ascenso del 9º al 16º.
 *
 * En `final`, un cruce de fecha 4 sale de la TABLA de una zona
 * (`{ pos, zona }`) y uno de fecha 5 sale de OTRO PARTIDO
 * (`{ de, resultado }`), que es lo que el motor de avance resuelve solo.
 */
export const TORNEOS = [
  {
    clave: 'campeonato',
    nombre: 'Campeonato Argentino Juvenil M17 - Zona Campeonato',
    slug: 'campeonato-argentino-juvenil-m17-campeonato',
    posiciones: '1º a 8º',
    zonas: [
      { nombre: 'Zona 1', clubes: ['uruguay-m17', 'buenos-aires-m17', 'tucuman-m17', 'cordobesa-m17'] },
      { nombre: 'Zona 2', clubes: ['cuyo-m17', 'santafesina-m17', 'rosario-m17', 'salta-m17'] },
    ],
    grupos: [
      { fecha: 1, n: 1,  zona: 'Zona 1', hora: '12:30', local: 'uruguay-m17',      visitante: 'buenos-aires-m17' },
      { fecha: 1, n: 2,  zona: 'Zona 2', hora: '14:00', local: 'cuyo-m17',         visitante: 'santafesina-m17' },
      { fecha: 1, n: 3,  zona: 'Zona 1', hora: '13:00', local: 'tucuman-m17',      visitante: 'cordobesa-m17' },
      { fecha: 1, n: 4,  zona: 'Zona 2', hora: '11:00', local: 'rosario-m17',      visitante: 'salta-m17' },
      { fecha: 2, n: 9,  zona: 'Zona 1', local: 'tucuman-m17',      visitante: 'uruguay-m17' },
      { fecha: 2, n: 10, zona: 'Zona 2', local: 'rosario-m17',      visitante: 'cuyo-m17' },
      { fecha: 2, n: 11, zona: 'Zona 1', local: 'buenos-aires-m17', visitante: 'cordobesa-m17' },
      { fecha: 2, n: 12, zona: 'Zona 2', local: 'santafesina-m17',  visitante: 'salta-m17' },
      { fecha: 3, n: 17, zona: 'Zona 1', local: 'buenos-aires-m17', visitante: 'tucuman-m17' },
      { fecha: 3, n: 18, zona: 'Zona 2', local: 'santafesina-m17',  visitante: 'rosario-m17' },
      { fecha: 3, n: 19, zona: 'Zona 1', local: 'cordobesa-m17',    visitante: 'uruguay-m17' },
      { fecha: 3, n: 20, zona: 'Zona 2', local: 'salta-m17',        visitante: 'cuyo-m17' },
    ],
    final: [
      { fecha: 4, n: 30, definicion: 'Semifinal',      local: { pos: 1, zona: 'Zona 1' },       visitante: { pos: 2, zona: 'Zona 2' } },
      { fecha: 4, n: 32, definicion: 'Semifinal',      local: { pos: 1, zona: 'Zona 2' },       visitante: { pos: 2, zona: 'Zona 1' } },
      { fecha: 4, n: 26, definicion: 'Cruce 5º a 8º',  local: { pos: 3, zona: 'Zona 1' },       visitante: { pos: 4, zona: 'Zona 2' } },
      { fecha: 4, n: 28, definicion: 'Cruce 5º a 8º',  local: { pos: 3, zona: 'Zona 2' },       visitante: { pos: 4, zona: 'Zona 1' } },
      { fecha: 5, n: 40, definicion: 'Final',          local: { de: 30, resultado: 'winner' },  visitante: { de: 32, resultado: 'winner' } },
      { fecha: 5, n: 39, definicion: '3º y 4º puesto', local: { de: 30, resultado: 'loser' },   visitante: { de: 32, resultado: 'loser' } },
      { fecha: 5, n: 36, definicion: '5º y 6º puesto', local: { de: 26, resultado: 'winner' },  visitante: { de: 28, resultado: 'winner' } },
      { fecha: 5, n: 37, definicion: '7º y 8º puesto', local: { de: 26, resultado: 'loser' },   visitante: { de: 28, resultado: 'loser' } },
    ],
  },
  {
    clave: 'ascenso',
    nombre: 'Campeonato Argentino Juvenil M17 - Zona Ascenso',
    slug: 'campeonato-argentino-juvenil-m17-ascenso',
    posiciones: '9º a 16º',
    zonas: [
      { nombre: 'Zona 3', clubes: ['austral-m17', 'alto-valle-m17', 'entrerriana-m17', 'nordeste-m17'] },
      { nombre: 'Zona 4', clubes: ['oeste-m17', 'sanjuanina-m17', 'mar-del-plata-m17', 'chile-m17'] },
    ],
    grupos: [
      { fecha: 1, n: 5,  zona: 'Zona 3', hora: '12:00', local: 'austral-m17',       visitante: 'alto-valle-m17' },
      { fecha: 1, n: 6,  zona: 'Zona 4', hora: '16:00', local: 'oeste-m17',         visitante: 'sanjuanina-m17' },
      { fecha: 1, n: 7,  zona: 'Zona 3', hora: '16:00', local: 'entrerriana-m17',   visitante: 'nordeste-m17' },
      { fecha: 1, n: 8,  zona: 'Zona 4', hora: '16:00', local: 'mar-del-plata-m17', visitante: 'chile-m17' },
      { fecha: 2, n: 13, zona: 'Zona 3', local: 'entrerriana-m17',   visitante: 'austral-m17' },
      { fecha: 2, n: 14, zona: 'Zona 4', local: 'mar-del-plata-m17', visitante: 'oeste-m17' },
      { fecha: 2, n: 15, zona: 'Zona 3', local: 'alto-valle-m17',    visitante: 'nordeste-m17' },
      { fecha: 2, n: 16, zona: 'Zona 4', local: 'sanjuanina-m17',    visitante: 'chile-m17' },
      { fecha: 3, n: 21, zona: 'Zona 3', local: 'alto-valle-m17',    visitante: 'entrerriana-m17' },
      { fecha: 3, n: 22, zona: 'Zona 4', local: 'sanjuanina-m17',    visitante: 'mar-del-plata-m17' },
      { fecha: 3, n: 23, zona: 'Zona 3', local: 'nordeste-m17',      visitante: 'austral-m17' },
      { fecha: 3, n: 24, zona: 'Zona 4', local: 'chile-m17',         visitante: 'oeste-m17' },
    ],
    final: [
      { fecha: 4, n: 29, definicion: 'Semifinal',          local: { pos: 1, zona: 'Zona 3' },      visitante: { pos: 2, zona: 'Zona 4' } },
      { fecha: 4, n: 31, definicion: 'Semifinal',          local: { pos: 1, zona: 'Zona 4' },      visitante: { pos: 2, zona: 'Zona 3' } },
      { fecha: 4, n: 25, definicion: 'Cruce 13º a 16º',    local: { pos: 3, zona: 'Zona 4' },      visitante: { pos: 4, zona: 'Zona 3' } },
      { fecha: 4, n: 27, definicion: 'Cruce 13º a 16º',    local: { pos: 3, zona: 'Zona 3' },      visitante: { pos: 4, zona: 'Zona 4' } },
      { fecha: 5, n: 38, definicion: 'Final del Ascenso',  local: { de: 29, resultado: 'winner' }, visitante: { de: 31, resultado: 'winner' } },
      { fecha: 5, n: 34, definicion: '11º y 12º puesto',   local: { de: 29, resultado: 'loser' },  visitante: { de: 31, resultado: 'loser' } },
      { fecha: 5, n: 33, definicion: '13º y 14º puesto',   local: { de: 25, resultado: 'winner' }, visitante: { de: 27, resultado: 'winner' } },
      { fecha: 5, n: 35, definicion: '15º y 16º puesto',   local: { de: 25, resultado: 'loser' },  visitante: { de: 27, resultado: 'loser' } },
    ],
  },
];

/** Campeones del M17 desde que la categoría existe (2022). El 2026 es el que se crea ahora. */
export const PALMARES_M17 = [
  { anio: '2022', campeon: 'cuyo-m17' },
  { anio: '2023', campeon: 'rosario-m17' },
  { anio: '2024', campeon: 'buenos-aires-m17' },
  { anio: '2025', campeon: 'buenos-aires-m17' },
];

/** Cuadro de honor del M18. 2020 no se disputó y por eso no tiene temporada. */
export const PALMARES_M18 = [
  { anio: '2001', campeon: 'cordoba-m18' },
  { anio: '2002', campeon: 'buenos-aires-m18' },
  { anio: '2003', campeon: 'buenos-aires-m18' },
  { anio: '2004', campeon: 'buenos-aires-m18' },
  { anio: '2005', campeon: 'buenos-aires-m18' },
  { anio: '2006', campeon: 'tucuman-m18' },
  { anio: '2007', campeon: 'buenos-aires-m18' },
  { anio: '2008', campeon: 'buenos-aires-m18' },
  { anio: '2009', campeon: 'tucuman-m18' },
  { anio: '2010', campeon: 'buenos-aires-m18' },
  { anio: '2011', campeon: 'tucuman-m18' },
  { anio: '2012', campeon: 'rosario-m18' },
  { anio: '2013', campeon: 'tucuman-m18' },
  { anio: '2014', campeon: 'buenos-aires-m18' },
  { anio: '2015', campeon: 'buenos-aires-m18' },
  { anio: '2016', campeon: 'buenos-aires-m18' },
  { anio: '2017', campeon: 'tucuman-m18' },
  { anio: '2018', campeon: 'tucuman-m18' },
  { anio: '2019', campeon: 'buenos-aires-m18' },
  { anio: '2021', campeon: 'buenos-aires-m18' },
  { anio: '2022', campeon: 'cordoba-m18' },
];

export const TORNEO_M18 = {
  nombre: 'Campeonato Argentino Juvenil M18',
  slug: 'campeonato-argentino-juvenil-m18',
};

export const LOGO_TORNEO = '/competiciones/ar-argentino-juvenil.png';

export const PUNTOS = { win: 4, draw: 2, loss: 0, bonusTry: 1, bonusLoss: 1 };

/**
 * Desempates en el orden del reglamento. Va como ARRAY: de la otra forma que
 * usan los torneos viejos —objeto `{ order: [...] }`— falla el `Array.isArray`
 * del motor y la tabla se desempata sólo por diferencia de tantos.
 */
export const TIEBREAKERS = [
  { metric: 'points',             label: 'Puntos obtenidos',      priority: 1, enabled: true },
  { metric: 'head_to_head',       label: 'Resultado entre sí',    priority: 2, enabled: true },
  { metric: 'points_difference',  label: 'Diferencia de tantos',  priority: 3, enabled: true },
  { metric: 'tries_for',          label: 'Tries a favor',         priority: 4, enabled: true },
  { metric: 'won',                label: 'Partidos ganados',      priority: 5, enabled: true },
];

/**
 * Reglamento: 4/2/0 con bonus ofensivo (4 tries) y defensivo (derrota por 7 o
 * menos). Se emiten LAS TRES formas a propósito — `points`/`pointsSystem`
 * canónicos que lee el gestor, `pointsWin...` legacy que lee el fallback del
 * motor, y `standings.points_base` del reglamento — porque cada consumidor
 * mira una distinta y el que no encuentra la suya cae a los defaults del
 * deporte sin avisar.
 */
export const RULESET = {
  pointsWin: PUNTOS.win,
  pointsDraw: PUNTOS.draw,
  pointsLoss: PUNTOS.loss,
  pointsBonusTry: PUNTOS.bonusTry,
  pointsBonusLoss: PUNTOS.bonusLoss,
  points: { win: PUNTOS.win, draw: PUNTOS.draw, loss: PUNTOS.loss },
  pointsSystem: { ...PUNTOS, allowBonusPoints: true },
  bonus: {
    offensive: { tries: 4, points: PUNTOS.bonusTry },
    defensive: { margin: 7, points: PUNTOS.bonusLoss },
  },
  standings: {
    points_base: { win: PUNTOS.win, draw: PUNTOS.draw, loss: PUNTOS.loss },
    bonus_rules: [
      { id: 'try_bonus', label: '4+ Tries', points_awarded: PUNTOS.bonusTry },
      { id: 'close_loss', label: 'Derrota por 7 o menos', points_awarded: PUNTOS.bonusLoss },
    ],
  },
  competition: { format_type: 'groups', parameters: { season_model: 'single_event' } },
  tiebreakers: TIEBREAKERS,
};
