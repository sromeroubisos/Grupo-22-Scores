/**
 * CANON del Regional Centro "A" y "B" 2026: el torneo que la Unión Cordobesa
 * juega con la Unión Andina, en paralelo al Súper 9 "B" y al Apertura andino.
 * Datos puros, sin dependencias — el que escribe en la base es `seed.mjs`.
 *
 * Dos zonas de seis, todos contra todos a una rueda (cinco fechas) y final
 * directa entre el 1º y el 2º de cada zona. No hubo semifinales.
 *
 * FUENTE DEL FIXTURE — y es la que manda sobre la localía y las fechas:
 *   "Fixtures Super 9 y Regional 2026" de la Unión Cordobesa
 *   https://unioncordobesaderugby.com.ar/wp-content/uploads/2026/01/Fixtures-Super-9-y-Regional-2026.pdf
 *
 * OJO: esto NO es el `Regional del Centro` que ya vive en G22 (comp 128/129 de
 * rugbyarchive, 2007-2017). Aquel era el interregional entre el Litoral y
 * Córdoba y lo ganaron La Tablada o Universitario de Rosario. Éste es la
 * segunda y tercera división de la línea cordobesa: el campeón del "A" juega
 * la reválida con el 10º del Top 10 "A", y el del "B" con el último del "A".
 * Por eso van como torneos nuevos y no como una temporada de aquél.
 *
 * LOS OCHO PARTIDOS SIN RESULTADO. El torneo terminó, pero ocho marcadores no
 * los publicó nadie: son los cruces entre clubes cordobeses, que la prensa de
 * Catamarca y La Rioja —la que cubrió fecha a fecha— no toca, y que la de
 * Córdoba tampoco levantó. Se revisaron El Esquiú, El Ancasti, Catamarca
 * Actual, Botineros, Nueva Rioja, DiarioSports y El Periódico de San
 * Francisco, Al Toque Deportes, CordobaXV, Canal Showsport, y los boletines y
 * programaciones oficiales de la UCR. Están en los carruseles de Instagram de
 * @unioncordobesaderugby, que no son texto.
 *
 * Van con `pts: null` y entran a la base como 'scheduled' sin marcador: el día
 * que aparezcan, se completan acá y se rehace la tabla. Lo que SÍ se sabe de
 * tres de ellos es quién ganó (`gano`), y queda anotado para que nadie lo
 * vuelva a averiguar.
 *
 * EL BONUS. Ningún parte publicó tries, así que el bonus ofensivo (4 tries) no
 * se puede reconstruir y va en cero. El defensivo (perder por 7 o menos) sale
 * del marcador y sí se aplica. La tabla, entonces, queda POR DEBAJO de la
 * oficial: San Francisco cerró con 20 puntos reales (cuatro triunfos y una
 * derrota) y acá le van a dar menos. Está declarado partido por partido en
 * `points_override_reason`.
 */

export const TEMPORADA = '2026';

/** Unión Cordobesa de Rugby: organiza el torneo junto con la Andina. */
export const UNION_CORDOBESA = '0c515ac1-af49-4699-b3c5-7273bc424357';

/** Las cinco fechas de la fase regular y el día de las dos finales. */
export const FECHAS = {
  1: '2026-03-28',
  2: '2026-04-25',
  3: '2026-05-30',
  4: '2026-06-27',
  5: '2026-08-01',
};
export const DIA_FINAL = '2026-09-12';

/**
 * Primera a las 16, con la Intermedia de preliminar a las 14 (así lo publicó
 * la Unión Andina fecha a fecha). El único horario distinto que se conoce es
 * el Alta Gracia - Catamarca RC de la 5ª, a las 15.30, y va en el partido.
 */
export const HORA = '16:00';

/** Ciudad de cada club: de ahí sale la sede, que es siempre la del local. */
export const CIUDAD = {
  'los-cuervos-r-c': 'Bell Ville, Córdoba',
  'los-teros-r-c': 'San Fernando del Valle de Catamarca',
  'alta-gracia-r-c': 'Alta Gracia, Córdoba',
  'baguales-r-c': 'Jesús María, Córdoba',
  'catamarca-r-c': 'San Fernando del Valle de Catamarca',
  'cordoba-rugby-club': 'Córdoba',
  'aero-club-rio-iv': 'Río Cuarto, Córdoba',
  'los-hurones': 'Valle Viejo, Catamarca',
  'club-social-la-rioja': 'La Rioja',
  'rio-tercero-r-c': 'Río Tercero, Córdoba',
  'los-chelcos': 'La Rioja',
  'san-francisco-r-c': 'San Francisco, Córdoba',
};

/**
 * Las dos zonas. `pts: [local, visitante]`, o `null` si el marcador no se
 * publicó; `gano` sólo en esos, cuando el ganador se deduce de otra fuente.
 * `fuente` es el medio que publicó ese marcador, para que la próxima corrida
 * no tenga que rastrearlo de nuevo.
 */
export const ZONAS = [
  {
    clave: 'A',
    slug: 'regional-centro-a',
    nombre: 'Regional Centro "A"',
    clubes: [
      'los-cuervos-r-c', 'los-teros-r-c', 'alta-gracia-r-c',
      'baguales-r-c', 'catamarca-r-c', 'cordoba-rugby-club',
    ],
    campeon: 'los-teros-r-c',
    subcampeon: 'los-cuervos-r-c',
    partidos: [
      { fecha: 1, local: 'los-cuervos-r-c', visitante: 'cordoba-rugby-club', pts: [39, 29], fuente: 'UCR/Instagram' },
      { fecha: 1, local: 'los-teros-r-c', visitante: 'catamarca-r-c', pts: [31, 11], fuente: 'UCR/Instagram' },
      { fecha: 1, local: 'alta-gracia-r-c', visitante: 'baguales-r-c', pts: [30, 33], fuente: 'UCR/Instagram' },

      { fecha: 2, local: 'catamarca-r-c', visitante: 'los-cuervos-r-c', pts: [12, 31], fuente: 'El Esquiú' },
      { fecha: 2, local: 'alta-gracia-r-c', visitante: 'cordoba-rugby-club', pts: null },
      { fecha: 2, local: 'los-teros-r-c', visitante: 'baguales-r-c', pts: [56, 24], fuente: 'El Esquiú' },

      { fecha: 3, local: 'los-cuervos-r-c', visitante: 'alta-gracia-r-c', pts: [17, 19], fuente: 'Prensa Andina' },
      { fecha: 3, local: 'cordoba-rugby-club', visitante: 'los-teros-r-c', pts: [13, 25], fuente: 'El Esquiú' },
      { fecha: 3, local: 'baguales-r-c', visitante: 'catamarca-r-c', pts: [27, 28], fuente: 'Prensa Andina' },

      { fecha: 4, local: 'baguales-r-c', visitante: 'los-cuervos-r-c', pts: null },
      { fecha: 4, local: 'los-teros-r-c', visitante: 'alta-gracia-r-c', pts: [20, 17], fuente: 'Botineros' },
      { fecha: 4, local: 'catamarca-r-c', visitante: 'cordoba-rugby-club', pts: [33, 31], fuente: 'Botineros' },

      { fecha: 5, local: 'los-cuervos-r-c', visitante: 'los-teros-r-c', pts: [48, 17], fuente: 'El Esquiú' },
      { fecha: 5, local: 'alta-gracia-r-c', visitante: 'catamarca-r-c', pts: [39, 43], fuente: 'Botineros', hora: '15:30' },
      { fecha: 5, local: 'cordoba-rugby-club', visitante: 'baguales-r-c', pts: null },
    ],
    /** Los Teros terminó 1º y jugó la final de local; Cuervos, 2º. */
    final: {
      local: 'los-teros-r-c', visitante: 'los-cuervos-r-c', pts: [47, 21],
      fuente: 'El Ancasti / El Esquiú',
    },
  },
  {
    clave: 'B',
    slug: 'regional-centro-b',
    nombre: 'Regional Centro "B"',
    clubes: [
      'san-francisco-r-c', 'los-chelcos', 'rio-tercero-r-c',
      'aero-club-rio-iv', 'club-social-la-rioja', 'los-hurones',
    ],
    campeon: 'los-hurones',
    subcampeon: 'san-francisco-r-c',
    partidos: [
      { fecha: 1, local: 'san-francisco-r-c', visitante: 'los-chelcos', pts: [34, 31], fuente: 'UCR/Instagram' },
      { fecha: 1, local: 'rio-tercero-r-c', visitante: 'aero-club-rio-iv', pts: [26, 20], fuente: 'UCR/Instagram' },
      { fecha: 1, local: 'club-social-la-rioja', visitante: 'los-hurones', pts: [18, 31], fuente: 'UCR/Instagram' },

      // Hurones cerró la fase regular invicto y la única derrota de San
      // Francisco fue ésta: los dos datos salen de DiarioSports (04/08).
      { fecha: 2, local: 'los-hurones', visitante: 'san-francisco-r-c', pts: null, gano: 'local' },
      { fecha: 2, local: 'aero-club-rio-iv', visitante: 'club-social-la-rioja', pts: [19, 12], fuente: 'El Esquiú' },
      { fecha: 2, local: 'rio-tercero-r-c', visitante: 'los-chelcos', pts: [19, 33], fuente: 'El Esquiú' },

      { fecha: 3, local: 'san-francisco-r-c', visitante: 'rio-tercero-r-c', pts: null, gano: 'local' },
      { fecha: 3, local: 'los-chelcos', visitante: 'club-social-la-rioja', pts: [43, 21], fuente: 'Prensa Andina' },
      { fecha: 3, local: 'aero-club-rio-iv', visitante: 'los-hurones', pts: [0, 62], fuente: 'Prensa Andina' },

      { fecha: 4, local: 'aero-club-rio-iv', visitante: 'san-francisco-r-c', pts: null, gano: 'visitante' },
      { fecha: 4, local: 'los-hurones', visitante: 'los-chelcos', pts: null, gano: 'local' },
      { fecha: 4, local: 'club-social-la-rioja', visitante: 'rio-tercero-r-c', pts: null },

      { fecha: 5, local: 'san-francisco-r-c', visitante: 'club-social-la-rioja', pts: [64, 10], fuente: 'DiarioSports' },
      { fecha: 5, local: 'rio-tercero-r-c', visitante: 'los-hurones', pts: [14, 17], fuente: 'El Esquiú' },
      { fecha: 5, local: 'los-chelcos', visitante: 'aero-club-rio-iv', pts: [40, 35], fuente: 'El Esquiú' },
    ],
    /** Hurones terminó 1º e invicto; San Francisco, 2º con 20 puntos. */
    final: {
      local: 'los-hurones', visitante: 'san-francisco-r-c', pts: [24, 15],
      fuente: 'El Esquiú / DiarioSports',
      cancha: 'La Fortaleza, Valle Viejo, Catamarca',
    },
  },
];

/** 4/2/0 con bonus ofensivo por 4 tries y defensivo por perder por 7 o menos. */
export const PUNTOS = { win: 4, draw: 2, loss: 0, bonusTry: 1, bonusLoss: 1 };

/**
 * Como ARRAY: la forma de objeto `{ order: [...] }` que usan los torneos
 * viejos falla el `Array.isArray` del motor y la tabla termina desempatada
 * sólo por diferencia de tantos.
 */
export const TIEBREAKERS = [
  { metric: 'points', label: 'Puntos obtenidos', priority: 1, enabled: true },
  { metric: 'head_to_head', label: 'Resultado entre sí', priority: 2, enabled: true },
  { metric: 'points_difference', label: 'Diferencia de tantos', priority: 3, enabled: true },
  { metric: 'tries_for', label: 'Tries a favor', priority: 4, enabled: true },
  { metric: 'won', label: 'Partidos ganados', priority: 5, enabled: true },
];

/**
 * Las tres formas del reglamento van a propósito: `points`/`pointsSystem` es
 * lo que lee el gestor, `pointsWin...` el fallback del motor y
 * `standings.points_base` el reglamento. El consumidor que no encuentra la
 * suya cae a los defaults del deporte sin avisar.
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
  competition: { format_type: 'league', parameters: { season_model: 'single_year' } },
  tiebreakers: TIEBREAKERS,
};

/** El instante en UTC. El offset va escrito en vez de restarle tres horas a mano. */
export function instanteDe(dia, hora = HORA) {
  return new Date(`${dia}T${hora}:00-03:00`).toISOString();
}

/** Puntos base de un lado, sacados del marcador. */
export function puntosBase(propios, ajenos) {
  if (propios > ajenos) return PUNTOS.win;
  return propios === ajenos ? PUNTOS.draw : PUNTOS.loss;
}

/**
 * El único bonus reconstruible sin tries: el defensivo. Perder por 7 o menos
 * da un punto. El ofensivo queda en cero por falta de dato, no por regla.
 */
export function bonusDefensivo(propios, ajenos) {
  return propios < ajenos && ajenos - propios <= 7 ? PUNTOS.bonusLoss : 0;
}

/** Todos los partidos de una zona, la final incluida, en orden cronológico. */
export function partidosDe(zona) {
  return [
    ...zona.partidos.map((p) => ({ ...p, dia: FECHAS[p.fecha], ronda: `Fecha ${p.fecha}`, esFinal: false })),
    { ...zona.final, fecha: 6, dia: DIA_FINAL, ronda: 'Final', esFinal: true },
  ];
}
