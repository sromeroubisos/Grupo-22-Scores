/**
 * CANON del Torneo Regional Norpatagónico 2026: ocho clubes de la Unión de
 * Rugby del Sur y de la Unión de Rugby de Alto Valle, en dos zonas mixtas de
 * cuatro. Datos puros, sin dependencias — el que escribe es `seed.mjs`.
 *
 * NO es el `Torneo Regional Patagónico` que ya vive en G22
 * (`0c774fd6-7153-403d-9d33-b1a4f8516a63`). Aquél lo juegan Alto Valle y
 * Chubut —Chenque, Trelew, Las Águilas, Deportivo Portugués, Bigornia— y su
 * 2026 ya está cargado con la final del 20 de junio (Neuquén 35 - Bigornia
 * 26). Éste cruza Bahía Blanca y La Pampa con el Alto Valle, y no comparte más
 * que tres clubes. Ojo con el buscador: mezcla los dos todo el tiempo.
 *
 * FORMATO: dos zonas de cuatro a una sola rueda (tres fechas), después
 * semifinales Oro —1º de una zona contra 2º de la otra— y final.
 *
 * LA FECHA 1 NO SE JUGÓ COMO TAL. Los cruces de esa ronda son todos entre
 * clubes de la MISMA unión, y las uniones tomaron los puntos de sus propios
 * torneos: el Oficial Oro de la URS y el del Alto Valle. Por eso no hay día,
 * sede ni localía publicados para esos cuatro partidos. Los marcadores sí se
 * conocen, y con exactitud: salen despejados de la tabla oficial que publicó
 * Rugby Report tras esa ronda, y cierran de una sola forma —85:0 y 0:85, 75:5
 * y 5:75, 70:0 y 0:70, 24:23 y 23:24—. El script lo valida antes de escribir.
 *
 * LAS SEMIFINALES TAMPOCO SE JUGARON. Los dos cruces de Oro quedaron entre
 * clubes de la misma unión (Sportiva-Santa Rosa por la URS, Neuquén-Marabunta
 * por Alto Valle) y el reglamento manda resolverlos por el resultado entre sí
 * en el torneo de esa unión. Pasaron Sociedad Sportiva y Neuquén RC. No se
 * cargan como partidos porque no los hubo: quedan documentados acá y en la
 * fase Final.
 *
 * LA FINAL ESTÁ PENDIENTE. Se anunció para el 30 de mayo y quedó sin fecha ni
 * sede: "quedará en manos de las uniones organizadoras ponerle fecha". Al
 * 16/09/2026 no hay un parte que la dé por jugada, ni en La Nueva ni en LM
 * Neuquén ni en Rugby Report. Entra como 'postponed'.
 *
 * Fuentes: Rugby Report (programación y tablas oficiales), La Nueva de Bahía
 * Blanca (fecha a fecha), LM Neuquén y Diario Río Negro.
 */

export const TEMPORADA = '2026';
export const TORNEO_SLUG = 'torneo-norpatagonico';
export const NOMBRE = 'Torneo Norpatagónico';

/** Lo organiza la unión bahiense junto con Alto Valle. */
export const UNION = 'union-de-rugby-del-sur';

/**
 * La fecha 1 no tiene día propio: es el fin de semana en que cada unión jugó
 * la ronda de la que se tomaron los puntos. Queda el 19/04 —el que marcó La
 * Nueva como el del arranque regional— y está declarado en las notas.
 */
export const FECHAS = {
  1: '2026-04-19',
  2: '2026-05-09',
  3: '2026-05-16',
};

/** La final anunciada, que nunca se jugó. */
export const DIA_FINAL = '2026-05-30';

export const CIUDAD = {
  'sociedad-sportiva-de-bahia-blanca': 'Bahía Blanca, Buenos Aires',
  'club-el-nacional': 'Bahía Blanca, Buenos Aires',
  'universitario-de-bahia-blanca': 'Bahía Blanca, Buenos Aires',
  'santa-rosa-r-c': 'Santa Rosa, La Pampa',
  'marabunta-r-c': 'Cipolletti, Río Negro',
  'neuquen-r-c': 'Neuquén',
  'roca-r-c': 'General Roca, Río Negro',
  'patagonia-r-c': 'Neuquén',
};

export const ZONAS = [
  {
    clave: 'Zona 1',
    clubes: ['sociedad-sportiva-de-bahia-blanca', 'marabunta-r-c', 'roca-r-c', 'club-el-nacional'],
  },
  {
    clave: 'Zona 2',
    clubes: ['neuquen-r-c', 'santa-rosa-r-c', 'universitario-de-bahia-blanca', 'patagonia-r-c'],
  },
];

/**
 * Los doce partidos de zona. `pts: [local, visitante]`.
 *
 * `bonus: [local, visitante]` sólo donde la tabla oficial lo publicó: la de la
 * fecha 1, que trae columna PB. En las fechas 2 y 3 no hubo tabla publicada,
 * así que el ofensivo va en cero y sólo se aplica el defensivo, que sale del
 * marcador. Son goleadas: casi seguro hubo bonus ofensivo, pero "casi seguro"
 * no se escribe en una tabla.
 *
 * `localiaDesconocida` marca los cuatro de la fecha 1: se listan con el
 * ganador primero porque hay que listarlos de algún modo, no porque haya sido
 * local.
 */
export const PARTIDOS = [
  // ── Fecha 1: despejada de la tabla oficial, sin día ni sede propios ───────
  { fecha: 1, zona: 'Zona 1', local: 'sociedad-sportiva-de-bahia-blanca', visitante: 'club-el-nacional', pts: [85, 0], bonus: [1, 0], localiaDesconocida: true },
  { fecha: 1, zona: 'Zona 1', local: 'marabunta-r-c', visitante: 'roca-r-c', pts: [75, 5], bonus: [1, 0], localiaDesconocida: true },
  { fecha: 1, zona: 'Zona 2', local: 'neuquen-r-c', visitante: 'patagonia-r-c', pts: [70, 0], bonus: [1, 0], localiaDesconocida: true },
  { fecha: 1, zona: 'Zona 2', local: 'santa-rosa-r-c', visitante: 'universitario-de-bahia-blanca', pts: [24, 23], bonus: [0, 1], localiaDesconocida: true },

  // ── Fecha 2: sábado 09/05 en el Alto Valle, domingo 10/05 en Bahía ───────
  { fecha: 2, zona: 'Zona 1', local: 'marabunta-r-c', visitante: 'club-el-nacional', pts: [68, 22], dia: '2026-05-09', hora: '16:00' },
  { fecha: 2, zona: 'Zona 2', local: 'neuquen-r-c', visitante: 'santa-rosa-r-c', pts: [75, 0], dia: '2026-05-09', hora: '16:00' },
  { fecha: 2, zona: 'Zona 1', local: 'sociedad-sportiva-de-bahia-blanca', visitante: 'roca-r-c', pts: [111, 7], dia: '2026-05-10', hora: '15:00', cancha: 'La Carrindanga, Bahía Blanca' },
  { fecha: 2, zona: 'Zona 2', local: 'universitario-de-bahia-blanca', visitante: 'patagonia-r-c', pts: [52, 5], dia: '2026-05-10', hora: '15:00', cancha: 'Complejo Héctor Gatica, Bahía Blanca' },

  // ── Fecha 3: sábado 16/05 y domingo 17/05 ────────────────────────────────
  { fecha: 3, zona: 'Zona 1', local: 'sociedad-sportiva-de-bahia-blanca', visitante: 'marabunta-r-c', pts: [64, 0], dia: '2026-05-16', hora: '15:30', cancha: 'La Carrindanga, Bahía Blanca' },
  { fecha: 3, zona: 'Zona 1', local: 'club-el-nacional', visitante: 'roca-r-c', pts: [17, 47], dia: '2026-05-16', hora: '15:00' },
  { fecha: 3, zona: 'Zona 2', local: 'universitario-de-bahia-blanca', visitante: 'neuquen-r-c', pts: [14, 85], dia: '2026-05-17', hora: '15:00' },
  { fecha: 3, zona: 'Zona 2', local: 'santa-rosa-r-c', visitante: 'patagonia-r-c', pts: [46, 17], dia: '2026-05-17', hora: '13:30' },
];

/**
 * La tabla oficial publicada tras la fecha 1. Está acá para que el script
 * valide que los cuatro marcadores despejados la reproducen exacta: si el
 * despeje estuviera mal, la página diría otra cosa que la fuente y nadie lo
 * notaría hasta que un lector lo marque.
 */
export const TABLA_F1 = {
  'Zona 1': [
    { club: 'sociedad-sportiva-de-bahia-blanca', tf: 85, tc: 0, pts: 5 },
    { club: 'marabunta-r-c', tf: 75, tc: 5, pts: 5 },
    { club: 'roca-r-c', tf: 5, tc: 75, pts: 0 },
    { club: 'club-el-nacional', tf: 0, tc: 85, pts: 0 },
  ],
  'Zona 2': [
    { club: 'neuquen-r-c', tf: 70, tc: 0, pts: 5 },
    { club: 'santa-rosa-r-c', tf: 24, tc: 23, pts: 4 },
    { club: 'universitario-de-bahia-blanca', tf: 23, tc: 24, pts: 1 },
    { club: 'patagonia-r-c', tf: 0, tc: 70, pts: 0 },
  ],
};

/**
 * La final que quedó pendiente. Sportiva ganó la Zona 1 y Neuquén la Zona 2;
 * las semis de Oro se resolvieron sin jugarse. Sin sede definida: se lista a
 * Sportiva primero por ser el campeón defensor, no por localía.
 */
export const FINAL = {
  local: 'sociedad-sportiva-de-bahia-blanca',
  visitante: 'neuquen-r-c',
  nota: 'Los dos cruces de semifinal Oro quedaron entre clubes de la misma unión y el reglamento los resolvió por el resultado entre sí en el torneo de esa unión: pasaron Sociedad Sportiva y Neuquén RC sin jugar. La final se anunció para el 30 de mayo y quedó sin fecha ni sede.',
};

/** 4/2/0 con bonus ofensivo por 4 tries y defensivo por perder por 7 o menos. */
export const PUNTOS = { win: 4, draw: 2, loss: 0, bonusTry: 1, bonusLoss: 1 };

export const TIEBREAKERS = [
  { metric: 'points', label: 'Puntos obtenidos', priority: 1, enabled: true },
  { metric: 'head_to_head', label: 'Resultado entre sí', priority: 2, enabled: true },
  { metric: 'points_difference', label: 'Diferencia de tantos', priority: 3, enabled: true },
  { metric: 'tries_for', label: 'Tries a favor', priority: 4, enabled: true },
  { metric: 'won', label: 'Partidos ganados', priority: 5, enabled: true },
];

/** Las tres formas a propósito: cada consumidor mira una distinta. */
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
  competition: { format_type: 'groups', parameters: { season_model: 'single_year' } },
  tiebreakers: TIEBREAKERS,
};

export function instanteDe(dia, hora = '16:00') {
  return new Date(`${dia}T${hora}:00-03:00`).toISOString();
}

export function puntosBase(propios, ajenos) {
  if (propios > ajenos) return PUNTOS.win;
  return propios === ajenos ? PUNTOS.draw : PUNTOS.loss;
}

/** El único bonus reconstruible sin tries. El ofensivo va aparte, si la fuente lo dio. */
export function bonusDefensivo(propios, ajenos) {
  return propios < ajenos && ajenos - propios <= 7 ? PUNTOS.bonusLoss : 0;
}

/** El bonus de un lado: el publicado si lo hay, si no el defensivo que da el marcador. */
export function bonusDe(partido, lado) {
  if (partido.bonus) return partido.bonus[lado === 'local' ? 0 : 1];
  const [l, v] = partido.pts;
  return lado === 'local' ? bonusDefensivo(l, v) : bonusDefensivo(v, l);
}
