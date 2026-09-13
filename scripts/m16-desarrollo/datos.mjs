/**
 * CANON del Torneo Nacional Desarrollo M16 en G22: los seleccionados, la
 * edición 2026 del Desarrollo Sur con sus seis partidos, y el cuadro de honor
 * completo 2016-2026. Datos puros, sin dependencias — el que escribe en la base
 * es `seed.mjs`.
 *
 * La competencia cambió de forma en 2023: hasta 2022 era UN torneo nacional con
 * Copa de Oro y Copa de Plata; desde 2023 son DOS torneos por región, Sur y
 * Norte. Por eso van cuatro torneos y no uno: el campeón de la Copa de Plata no
 * es el subcampeón de la de Oro, es el campeón de otra copa, y guardarlo en un
 * `settings` lo dejaría invisible en la pantalla.
 *
 * Fuente: parte oficial del M16 Desarrollo Sur 2026 (Roca R.C., 29 y 30 de
 * agosto) y cuadro de campeones 2016-2026.
 */

/**
 * Los nueve seleccionados que toca esta carga: los cuatro de 2026 y los cinco
 * que sólo aparecen en el palmarés.
 *
 * El nombre sigue al catálogo que ya está en la base, no al parte de prensa: la
 * unión del oeste bonaerense juega como "Oeste" y la entrerriana como
 * "Entrerriana" en el Argentino Juvenil, así que acá también. Un mismo escudo
 * con dos nombres según el torneo es una ficha partida al medio.
 */
export const CLUBES = [
  // Los cuatro del Desarrollo Sur 2026
  { id: 'chubut-m16',        name: 'Chubut M16',        union_id: 'union-de-rugby-del-valle-del-chubut', region: 'Chubut',                country: 'ARG', escudo: 'Chubut.png' },
  { id: 'alto-valle-m16',    name: 'Alto Valle M16',    union_id: 'union-de-rugby-de-alto-valle',        region: 'Alto Valle',            country: 'ARG', escudo: 'Alto Valle.png' },
  { id: 'austral-m16',       name: 'Austral M16',       union_id: 'union-austral',                       region: 'Santa Cruz',            country: 'ARG', escudo: 'Austral.png' },
  // La Unión de Rugby de los Lagos del Sur (Bariloche) no está en `unions`: el
  // club queda sin vínculo, como los seis del Argentino Juvenil.
  { id: 'lagos-del-sur-m16', name: 'Lagos del Sur M16', union_id: null,                                  region: 'Lagos del Sur',         country: 'ARG', escudo: 'Lagos Sur.png' },
  // Sólo palmarés
  { id: 'oeste-m16',         name: 'Oeste M16',         union_id: 'uroba',                               region: 'Oeste de Buenos Aires', country: 'ARG', escudo: 'UROBA.png' },
  { id: 'buenos-aires-m16',  name: 'Buenos Aires M16',  union_id: 'urba',                                region: 'Buenos Aires',          country: 'ARG', escudo: 'URBA.png' },
  { id: 'entrerriana-m16',   name: 'Entrerriana M16',   union_id: 'union-entrerriana-de-rugby',          region: 'Entre Ríos',            country: 'ARG', escudo: 'Entre Ríos.png' },
  { id: 'mar-del-plata-m16', name: 'Mar del Plata M16', union_id: 'union-de-rugby-de-mar-del-plata',     region: 'Mar del Plata',         country: 'ARG', escudo: 'Mar del Plata.png' },
  { id: 'andina-m16',        name: 'Andina M16',        union_id: 'union-andina-de-rugby',               region: 'Andina',                country: 'ARG', escudo: 'Andina.png' },
];

/** La sede del certamen 2026: las dos jornadas se jugaron en la misma cancha. */
export const SEDE = 'Roca Rugby Club, General Roca, Río Negro';

/** El día de cada jornada. El torneo entero entra en un fin de semana. */
export const DIAS = { 1: '2026-08-29', 2: '2026-08-30' };

/**
 * El horario NO se publicó: el parte oficial da el día y el número de partido,
 * nada más. `date_time` es obligatorio, así que los partidos se escalonan de 90
 * en 90 minutos desde las 10:00 para conservar el ORDEN del parte, que sí es
 * dato. Si la unión publica los horarios reales se corrigen acá y se vuelve a
 * correr: el fixture —quién jugó contra quién y cuánto— no se toca.
 */
export const PRIMER_SAQUE = '10:00';
export const PASO_MINUTOS = 90;

/**
 * El instante en UTC, que es como lo guarda la base.
 *
 * El offset va escrito (`-03:00`) en vez de sumarle tres horas a mano:
 * Argentina no mueve el reloj desde 2009, pero la cuenta a mano es la que se
 * olvida de revisar si algún día lo mueve.
 */
export function instanteDe(jornada, orden) {
  const [h, m] = PRIMER_SAQUE.split(':').map(Number);
  const minutos = h * 60 + m + (orden - 1) * PASO_MINUTOS;
  const hh = String(Math.floor(minutos / 60)).padStart(2, '0');
  const mm = String(minutos % 60).padStart(2, '0');
  return new Date(`${DIAS[jornada]}T${hh}:${mm}:00-03:00`).toISOString();
}

/**
 * Los seis partidos, en el orden del parte oficial.
 *
 * `bonusLocal` / `bonusVisitante` son los puntos de bonus de cada uno. NO salen
 * de contar tries —el parte no publicó ninguno— sino de despejarlos contra los
 * totales publicados (Chubut 14, Alto Valle 9, Austral 5, Lagos del Sur 1)
 * sobre el reglamento 4/2/0 más bonus. La cuenta cierra de una sola forma:
 *
 * - Lagos del Sur: su único punto es la derrota 18-24, por seis. No hay otra.
 * - Austral: sus dos derrotas son por 26 y por 15, así que su punto suelto es
 *   ofensivo y sólo puede estar en el 24-18.
 * - Alto Valle: perdió por 14 (sin bonus defensivo) y ganó 41-0 y 15-0. Su
 *   punto es el 41-0.
 * - Chubut: ganó los tres, le sobran DOS bonus para tres partidos, y los dos
 *   seguros son las goleadas (31-5 y 43-0). El 20-6 queda sin bonus.
 *
 * Por eso los partidos van con `points_autocalculated: false`: sin tries
 * cargados el motor calcularía cero bonus y la tabla mostraría 12/8/4/0 en vez
 * de la publicada.
 */
export const PARTIDOS = [
  { jornada: 1, orden: 1, local: 'chubut-m16',     visitante: 'austral-m16',       ptsLocal: 31, ptsVisitante:  5, bonusLocal: 1, bonusVisitante: 0 },
  { jornada: 1, orden: 2, local: 'alto-valle-m16', visitante: 'lagos-del-sur-m16', ptsLocal: 41, ptsVisitante:  0, bonusLocal: 1, bonusVisitante: 0 },
  { jornada: 1, orden: 3, local: 'chubut-m16',     visitante: 'lagos-del-sur-m16', ptsLocal: 43, ptsVisitante:  0, bonusLocal: 1, bonusVisitante: 0 },
  { jornada: 1, orden: 4, local: 'alto-valle-m16', visitante: 'austral-m16',       ptsLocal: 15, ptsVisitante:  0, bonusLocal: 0, bonusVisitante: 0 },
  { jornada: 2, orden: 1, local: 'austral-m16',    visitante: 'lagos-del-sur-m16', ptsLocal: 24, ptsVisitante: 18, bonusLocal: 1, bonusVisitante: 1 },
  { jornada: 2, orden: 2, local: 'alto-valle-m16', visitante: 'chubut-m16',        ptsLocal:  6, ptsVisitante: 20, bonusLocal: 0, bonusVisitante: 0 },
];

/** Los cuatro que jugaron la edición 2026, en el orden final de la tabla. */
export const PLANTEL_2026 = ['chubut-m16', 'alto-valle-m16', 'austral-m16', 'lagos-del-sur-m16'];

/** La tabla publicada. `verificar.mjs` la compara contra la que calculó el motor. */
export const TABLA_2026 = [
  { club: 'chubut-m16',        pj: 3, pg: 3, pp: 0, pts: 14 },
  { club: 'alto-valle-m16',    pj: 3, pg: 2, pp: 1, pts:  9 },
  { club: 'austral-m16',       pj: 3, pg: 1, pp: 2, pts:  5 },
  { club: 'lagos-del-sur-m16', pj: 3, pg: 0, pp: 3, pts:  1 },
];

/**
 * Los cuatro torneos. El de 2026 con fixture es `sur`; los otros tres entran
 * sólo con su cuadro de honor, que es todo lo que hay.
 *
 * 2020 no se disputó y por eso no lleva temporada: una temporada vacía en la
 * base se lee como "se jugó y no sabemos quién ganó", que es otra cosa.
 */
export const TORNEOS = [
  {
    clave: 'sur',
    nombre: 'M16 Desarrollo Sur',
    slug: 'm16-desarrollo-sur',
    conFixture: true,
    seasonActual: '2026',
    palmares: [
      { anio: '2023', campeon: 'chubut-m16' },
      { anio: '2024', campeon: 'chubut-m16' },
      { anio: '2025', campeon: 'alto-valle-m16' },
    ],
  },
  {
    clave: 'norte',
    nombre: 'M16 Desarrollo Norte',
    slug: 'm16-desarrollo-norte',
    conFixture: false,
    seasonActual: '2025',
    palmares: [
      { anio: '2023', campeon: 'oeste-m16' },
      { anio: '2024', campeon: 'buenos-aires-m16' },
      { anio: '2025', campeon: 'buenos-aires-m16' },
    ],
  },
  {
    clave: 'oro',
    nombre: 'Torneo Nacional Desarrollo M16 - Copa de Oro',
    slug: 'torneo-nacional-desarrollo-m16-copa-de-oro',
    conFixture: false,
    seasonActual: '2022',
    palmares: [
      { anio: '2016', campeon: 'oeste-m16' },
      { anio: '2017', campeon: 'oeste-m16' },
      { anio: '2018', campeon: 'buenos-aires-m16' },
      { anio: '2019', campeon: 'oeste-m16' },
      { anio: '2021', campeon: 'buenos-aires-m16' },
      { anio: '2022', campeon: 'oeste-m16' },
    ],
  },
  {
    clave: 'plata',
    nombre: 'Torneo Nacional Desarrollo M16 - Copa de Plata',
    slug: 'torneo-nacional-desarrollo-m16-copa-de-plata',
    conFixture: false,
    seasonActual: '2022',
    palmares: [
      { anio: '2016', campeon: 'entrerriana-m16' },
      { anio: '2017', campeon: 'andina-m16' },
      { anio: '2018', campeon: 'mar-del-plata-m16' },
      { anio: '2019', campeon: 'mar-del-plata-m16' },
      { anio: '2021', campeon: 'mar-del-plata-m16' },
      { anio: '2022', campeon: 'austral-m16' },
    ],
  },
];

/** El campeón 2026 del Sur, que es la única temporada con fixture. */
export const CAMPEON_2026 = 'chubut-m16';

export const LOGO_TORNEO = '/competiciones/ar-m16-desarrollo.png';

export const PUNTOS = { win: 4, draw: 2, loss: 0, bonusTry: 1, bonusLoss: 1 };

/**
 * Desempates en el orden del reglamento. Va como ARRAY: de la otra forma que
 * usan los torneos viejos —objeto `{ order: [...] }`— falla el `Array.isArray`
 * del motor y la tabla se desempata sólo por diferencia de tantos.
 */
export const TIEBREAKERS = [
  { metric: 'points',            label: 'Puntos obtenidos',     priority: 1, enabled: true },
  { metric: 'head_to_head',      label: 'Resultado entre sí',   priority: 2, enabled: true },
  { metric: 'points_difference', label: 'Diferencia de tantos', priority: 3, enabled: true },
  { metric: 'tries_for',         label: 'Tries a favor',        priority: 4, enabled: true },
  { metric: 'won',               label: 'Partidos ganados',     priority: 5, enabled: true },
];

/**
 * Reglamento: 4/2/0 con bonus ofensivo (4 tries) y defensivo (derrota por 7 o
 * menos). Se emiten LAS TRES formas a propósito — `points`/`pointsSystem`
 * canónicos que lee el gestor, `pointsWin...` legacy que lee el fallback del
 * motor, y `standings.points_base` del reglamento — porque cada consumidor mira
 * una distinta y el que no encuentra la suya cae a los defaults del deporte sin
 * avisar.
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
  competition: { format_type: 'league', parameters: { season_model: 'single_event' } },
  tiebreakers: TIEBREAKERS,
};
