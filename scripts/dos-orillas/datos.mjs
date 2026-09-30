/**
 * CANON del Torneo Juvenil Dos Orillas (USR + UER) y del Torneo Regional del
 * Litoral M19 en G22. Datos puros, sin dependencias — el que escribe en la base
 * es `seed.mjs`.
 *
 * Fuente: el archivo de tercertiemporugby.com.ar, categoría "Torneo Juvenil Dos
 * Orillas" (586 notas, 2012-2026). Los partidos NO viven acá: cada temporada se
 * extrajo de las notas a `extract/<año>.json` (formato en `extract/SPEC.md`), y
 * este archivo resuelve los nombres de la fuente a clubes de la base.
 *
 * Cómo se modela:
 *
 * - UN torneo por división (M15, M16, M17, M19) y una TEMPORADA por año. Cada
 *   fase del año (clasificatoria, Final Six Oro/Plata, Final Four
 *   Oro/Plata/Bronce, Apertura/Clausura…) es una fase de liga de esa temporada:
 *   el formato cambió casi todos los años y la fase es lo único que lo nombra
 *   sin forzarlo.
 * - Cada equipo juvenil es una FICHA propia ("Santa Fe RC M19") colgada de su
 *   club madre en `club_derivatives`, como las categorías de URBA y ARUSA. La
 *   ficha no lleva escudo: hereda el de la madre (ver `logoUrl.ts`).
 * - Las reservas de M19 ("SFRC R", "CRAI B", "Estudiantes B") y el segundo
 *   equipo de M15-M17 ("SFRC B", "Santa Fe RC Azul") son OTRA ficha, con sufijo
 *   B. Un equipo B que juega el mismo torneo que el A no puede ser la misma
 *   ficha: tendría dos filas en la tabla con el mismo id.
 */

/**
 * Los clubes madre. Los que ya existen se reusan por id y no se tocan; los
 * `nuevo: true` los crea el seed.
 *
 * `nombre` es cómo se llama la FICHA juvenil ("<nombre> M19"): el corto que usa
 * la prensa de la región, no el de la madre, que a veces trae la razón social o
 * el nombre del hockey.
 */
export const MADRES = {
  'Santa Fe RC':        { id: 'santa-fe-r-c',               nombre: 'Santa Fe RC' },
  'CRAI':               { id: 'crai',                       nombre: 'CRAI' },
  'CRAR':               { id: 'crar',                       nombre: 'CRAR' },
  'Estudiantes':        { id: 'estudiantes-de-parana',      nombre: 'Estudiantes de Paraná' },
  'Rowing':             { id: 'parana-rowing',              nombre: 'Paraná Rowing' },
  'Tilcara':            { id: 'club-tilcara',               nombre: 'Tilcara' },
  'La Salle':           { id: 'la-salle-jobson',            nombre: 'La Salle Jobson' },
  'Universitario':      { id: 'universitario-de-santa-fe',  nombre: 'Universitario de Santa Fe' },
  'Cha Roga Club':      { id: 'cha-roga-r-c',               nombre: 'Cha Roga Club' },
  'Alma Juniors':       { id: 'alma-juniors',               nombre: 'Alma Juniors' },
  'At. Brown':          { id: 'atletico-brown-san-vicente', nombre: 'Brown de San Vicente' },
  // Nuevos: sólo aparecen en el juvenil, no había ficha de mayores.
  'San Carlos':         { id: 'san-carlos-r-c-santa-fe',    nombre: 'San Carlos RC', nuevo: true,
                          nombreMadre: 'San Carlos R.C.', ciudad: 'San Carlos Centro', region: 'Santa Fé',
                          union: 'union-santafesina-de-rugby', escudo: 'san-carlos-usr.png' },
  'Querandí RC':        { id: 'querandi-r-c',               nombre: 'Querandí RC', nuevo: true,
                          nombreMadre: 'Querandí R.C.', ciudad: 'Santa Fe', region: 'Santa Fé',
                          union: 'union-santafesina-de-rugby', escudo: 'logoquerandi2-7a6cdf0c.png' },
  'Capibá':             { id: 'capiba-rugby-club',          nombre: 'Capibá', nuevo: true,
                          nombreMadre: 'Capibá Rugby Club', ciudad: 'Paraná', region: 'Entre Ríos',
                          union: 'union-entrerriana-de-rugby', escudo: null },
  'Náutico El Quillá':  { id: 'nautico-el-quilla',          nombre: 'Náutico El Quillá', nuevo: true,
                          nombreMadre: 'Club Náutico El Quillá', ciudad: 'Santa Fe', region: 'Santa Fé',
                          union: 'union-santafesina-de-rugby', escudo: null },
  // Regional del Litoral M19: los rosarinos y el de Venado Tuerto.
  'Jockey CR':          { id: 'jockey-club-de-rosario',     nombre: 'Jockey Club de Rosario' },
  'Duendes RC':         { id: 'duendes-r-c',                nombre: 'Duendes' },
  'Atlético del Rosario': { id: 'atletico-del-rosario',     nombre: 'Atlético del Rosario' },
  'GER':                { id: 'gimnasia-y-esgrima-de-rosario', nombre: 'GER' },
  'Old Resian':         { id: 'old-resian-club',            nombre: 'Old Resian' },
  'Los Caranchos':      { id: 'los-caranchos',              nombre: 'Los Caranchos' },
  'Jockey VT':          { id: 'jockey-club-de-venado-tuerto', nombre: 'Jockey de Venado Tuerto' },
  'Universitario R':    { id: 'universitario-de-rosario',   nombre: 'Universitario de Rosario' },
};

/**
 * Equipos combinados: dos clubes que presentan un solo plantel en una
 * división. Van con ficha propia colgada del PRIMERO que nombra la fuente —la
 * familia admite una sola base por ficha.
 */
export const COMBINADOS = {
  'Cha Roga Club / Querandí RC': { base: 'Cha Roga Club', clave: 'cha-roga-querandi', nombre: 'Cha Roga / Querandí' },
  'At. Brown / San Carlos':      { base: 'At. Brown',     clave: 'brown-san-carlos',  nombre: 'Brown / San Carlos' },
  'At. Brown / San Jorge':       { base: 'At. Brown',     clave: 'brown-san-jorge',   nombre: 'Brown / San Jorge' },
};

/**
 * Formas cortas que quedaron en la extracción de algunos años. Se resuelven
 * acá y no reescribiendo los JSON, que son la copia fiel de la fuente.
 */
const SINONIMOS = {
  'Cha Roga': 'Cha Roga Club',
  'Querandí': 'Querandí RC',
};

/** Sufijos de la fuente que marcan el segundo equipo de un club. */
const SUFIJO_B = /\s+(R|B|Azul)$/;

/**
 * El alias de la fuente → { madre, variante }. `variante` es '' para el equipo
 * principal y 'b' para el segundo.
 */
export function resolverAlias(aliasFuente) {
  const alias = SINONIMOS[aliasFuente] ?? aliasFuente;
  if (COMBINADOS[alias]) return { combinado: COMBINADOS[alias], variante: '' };
  // Un alias que es club por sí mismo gana sobre la regla del sufijo:
  // "Universitario R" es Universitario de ROSARIO, no la reserva del de Santa Fe.
  if (MADRES[alias]) return { madre: MADRES[alias], raiz: alias, variante: '' };
  const m = alias.match(SUFIJO_B);
  const raiz = m ? alias.slice(0, m.index) : alias;
  const madre = MADRES[raiz];
  if (!madre) return null;
  return { madre, raiz, variante: m ? 'b' : '' };
}

/** Id y nombre de la ficha juvenil de un alias en una división. */
export function fichaDe(alias, division) {
  const r = resolverAlias(alias);
  if (!r) throw new Error(`alias sin madre: "${alias}"`);
  const div = division.toLowerCase();
  if (r.combinado) {
    const base = MADRES[r.combinado.base];
    return { id: `${r.combinado.clave}-${div}`, nombre: `${r.combinado.nombre} ${division}`, madreId: base.id };
  }
  const sufijo = r.variante ? '-b' : '';
  return {
    id: `${r.madre.id}-${div}${sufijo}`,
    nombre: `${r.madre.nombre} ${division}${r.variante ? ' B' : ''}`,
    madreId: r.madre.id,
  };
}

export const DIVISIONES = ['M15', 'M16', 'M17', 'M19'];

/** Un torneo por división. */
export function torneoDe(division) {
  return {
    division,
    nombre: `Torneo Juvenil Dos Orillas ${division}`,
    slug: `dos-orillas-juvenil-${division.toLowerCase()}`,
  };
}

export const UNION_TORNEO = 'union-santafesina-de-rugby';

/**
 * Orden de las fases dentro de una temporada. La que no está en la lista va al
 * final en el orden en que aparece en la extracción.
 */
export const ORDEN_FASES = [
  'Fase clasificatoria', 'Apertura', 'Competencia Formación', 'Reservas',
  'Clausura', 'Campeonato', 'Clasificación', 'Reclasificación', 'Estímulo',
  'Final Six Oro', 'Final Six Plata',
  'Final Four Oro', 'Final Four Plata', 'Final Four Bronce',
  'Copa Oro', 'Copa Plata', 'Copa Bronce', 'Final',
];

export const HORA_POR_DEFECTO = '12:00';

/** El instante en UTC. El offset va escrito: Argentina no mueve el reloj. */
export function instanteDe(fecha, hora) {
  return new Date(`${fecha}T${hora || HORA_POR_DEFECTO}:00-03:00`).toISOString();
}

export const PUNTOS = { win: 4, draw: 2, loss: 0, bonusTry: 1, bonusLoss: 1 };

/**
 * El sistema de puntos CAMBIÓ con los años y la tabla de cada temporada se
 * calcula con el suyo — con el de hoy, una tabla de 2014 no se parece a la que
 * se publicó. Se eligió MIDIENDO: para cada año, los puntos de cada club con
 * cada sistema candidato contra la última tabla publicada de cada fase
 * (desvío medio por club, en puntos):
 *
 *              2/1/0   3/2/1   4/2/0   4/2/0 + defensivo
 *   2014       13,4     5,5     6,1     5,6
 *   2015        7,5     1,9     3,6     3,5
 *   2016        7,5     0,9     3,7     3,7
 *   2017        7,4     0,8     3,8     3,9
 *   2018       12,4     6,8     4,5     3,8
 *   2022        8,4     4,5     3,0     2,2
 *
 * - 2012-2017: 3/2/1 (la derrota suma uno), sin bonus. En 2013 Santa Fe RC M15
 *   hizo 19 victorias y 2 derrotas y publicó 59 = 19x3 + 2x1.
 * - Desde 2018, cuando aparecen los puntos por partido "(5-0)": 4/2/0 con
 *   bonus. Lo que queda de desvío son partidos sin marcador publicado y bonus
 *   ofensivos que la nota no informa (ver verificar.mjs).
 *
 * `bonus: false` deja la fase sin bonus aunque el torneo lo tenga: por eso el
 * reglamento del TORNEO va sin bonus y el bonus viaja sólo en las fases que lo
 * usan (el motor mira primero la fase y después el torneo).
 */
const TRES_DOS_UNO = { win: 3, draw: 2, loss: 1, bonus: false };
export const SISTEMA_POR_ANIO = {
  2012: TRES_DOS_UNO, 2013: TRES_DOS_UNO, 2014: TRES_DOS_UNO,
  2015: TRES_DOS_UNO, 2016: TRES_DOS_UNO, 2017: TRES_DOS_UNO,
};
export const SISTEMA_ACTUAL = { win: 4, draw: 2, loss: 0, bonus: true };
export const sistemaDe = (anio) => SISTEMA_POR_ANIO[anio] ?? SISTEMA_ACTUAL;

/**
 * El reglamento de un sistema, con las tres formas que leen los consumidores
 * (ver `m16-desarrollo/datos.mjs`). Sin bonus, NO lleva ni `bonus` ni
 * `pointsBonus*`: con cualquiera de los dos el motor lo activa.
 */
export function reglamentoDe(s) {
  const base = { win: s.win, draw: s.draw, loss: s.loss };
  const r = {
    pointsWin: s.win, pointsDraw: s.draw, pointsLoss: s.loss,
    points: base,
    pointsSystem: { ...base, allowBonusPoints: s.bonus },
    standings: { points_base: base, bonus_rules: [] },
    competition: { format_type: 'league', parameters: { season_model: 'multi_phase' } },
    tiebreakers: TIEBREAKERS,
  };
  if (s.bonus) {
    Object.assign(r, { pointsBonusTry: PUNTOS.bonusTry, pointsBonusLoss: PUNTOS.bonusLoss });
    r.pointsSystem = { ...r.pointsSystem, bonusTry: PUNTOS.bonusTry, bonusLoss: PUNTOS.bonusLoss };
    r.bonus = RULESET.bonus;
    r.standings = { points_base: base, bonus_rules: RULESET.standings.bonus_rules };
  }
  return r;
}

/** El del TORNEO: el sistema de hoy SIN bonus, que va en las fases que lo usan. */
export const RULESET_TORNEO = () => reglamentoDe({ ...SISTEMA_ACTUAL, bonus: false });

export const TIEBREAKERS = [
  { metric: 'points',            label: 'Puntos obtenidos',     priority: 1, enabled: true },
  { metric: 'head_to_head',      label: 'Resultado entre sí',   priority: 2, enabled: true },
  { metric: 'points_difference', label: 'Diferencia de tantos', priority: 3, enabled: true },
  { metric: 'tries_for',         label: 'Tries a favor',        priority: 4, enabled: true },
  { metric: 'won',               label: 'Partidos ganados',     priority: 5, enabled: true },
];

/**
 * 4/2/0 más bonus ofensivo y defensivo, las tres formas (ver
 * `m16-desarrollo/datos.mjs`: cada consumidor lee una distinta).
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
  competition: { format_type: 'league', parameters: { season_model: 'multi_phase' } },
  tiebreakers: TIEBREAKERS,
};

// ─────────────────────────────────────────────────────────────────────────────
// Torneo Regional del Litoral M19
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Dos bloques, A y B, como los torneos de mayores del Litoral: van como dos
 * torneos porque se juegan en paralelo y cada uno tiene su campeón.
 *
 * 2026: sólo está publicada la 1ª fecha (nota de Tercer Tiempo del 30/9). Las
 * zonas y el resto del fixture no salieron: la fase va como liga única de 8 y
 * se reparte en zonas cuando se publiquen. En 2025 fueron dos zonas de 4, tres
 * fechas, semis y final.
 *
 * Palmarés: 2022 Jockey (37-15 a Estudiantes), 2024 Jockey (32-22 a CRAI, "bicampeón"),
 * 2025 Atlético del Rosario (29-27 a Jockey) y GER en el B (39-26 a Rowing).
 * 2023: la final fue CRAI–Jockey (28/10) y el resultado no está en la fuente —
 * queda sin temporada: una temporada sin campeón se lee como "se jugó y no
 * sabemos", que es justamente el caso, pero sin fixture no aporta nada.
 */
export const TRL = [
  {
    bloque: 'A',
    nombre: 'Torneo Regional del Litoral M19 "A"',
    slug: 'torneo-regional-del-litoral-m19-a',
    palmares: [
      { anio: '2022', campeon: 'Jockey CR' },
      { anio: '2024', campeon: 'Jockey CR' },
      { anio: '2025', campeon: 'Atlético del Rosario' },
    ],
    fecha1: [
      { local: 'Jockey CR',   visitante: 'CRAR',                 hora: null,    arbitro: 'URR' },
      { local: 'CRAI',        visitante: 'Duendes RC',           hora: '13:00', arbitro: 'Javier Villalba (USR)' },
      { local: 'Santa Fe RC', visitante: 'Atlético del Rosario', hora: '13:30', arbitro: 'Alfredo Fun (USR)' },
      { local: 'GER',         visitante: 'Estudiantes',          hora: null,    arbitro: 'URR' },
    ],
  },
  {
    bloque: 'B',
    nombre: 'Torneo Regional del Litoral M19 "B"',
    slug: 'torneo-regional-del-litoral-m19-b',
    palmares: [
      { anio: '2025', campeon: 'GER' },
    ],
    fecha1: [
      { local: 'Old Resian',      visitante: 'La Salle',      hora: null,    arbitro: 'URR' },
      { local: 'Tilcara',         visitante: 'Los Caranchos', hora: null,    arbitro: 'Julián Caviglia (E. Ríos)' },
      { local: 'Rowing',          visitante: 'Jockey VT',     hora: '13:30', arbitro: 'Diego Sueldo (E. Ríos)' },
      { local: 'Universitario R', visitante: 'Universitario', hora: null,    arbitro: 'URR' },
    ],
  },
];

/** Brown ya existía en la base SIN escudo: el seed lo completa sólo si sigue vacío. */
export const ESCUDO_BROWN = { id: 'atletico-brown-san-vicente', escudo: 'brown san vicente.png' };

/** Sábado de la 1ª fecha del Regional M19 2026. */
export const TRL_FECHA1 = '2026-10-03';

// En Storage y no en public/: una ruta de public/ recién existe en producción
// después del deploy, y la base la sirve desde ya.
export const LOGO_TRL = 'https://vxsolicapdcpemfsahbk.supabase.co/storage/v1/object/public/tournaments/logos/trl-m19-c089f83b3d150580.png';
