/**
 * CANON del Torneo Juvenil de la Unión de Rugby de Tucumán (URT) 2026 en G22.
 * Misma interfaz que `scripts/dos-orillas/datos.mjs`: el seed es el mismo molde.
 *
 * Fuente: los boletines semanales de la URT (urtuc.com.ar/pagina/308/boletin).
 * NO publican resultados: traen las tablas de posiciones y la programación. Cada
 * marcador se reconstruyó de la diferencia entre la tabla de una semana y la de
 * la anterior (`extract/2026.json`, generado por `fuente/` — ver README ahí).
 *
 * Cómo se modela:
 * - Un torneo por división y nivel: "Torneo Juvenil de Tucumán M19" (Campeonato)
 *   y "Torneo Juvenil de Tucumán M19 Reserva". La clave de división lleva el
 *   nivel: `M19` y `M19R`.
 * - Fases de la temporada: Iniciación (zonas A y B) y Anual (primera ronda, Copa
 *   de Oro, Copa de Plata).
 * - Fichas por club y COLOR: Tucumán Rugby presenta "Verde" y "Negro", Lawn
 *   Tennis "Azul" y "Blanco", Universitario "Azul" y "Gris". La "B" es el
 *   segundo equipo del mismo color.
 */

export const MADRES = {
  'Aguará Guazú':        { id: 'aguara-guazu',           nombre: 'Aguará Guazú' },
  'Cardenales':          { id: 'cardenales-r-c',         nombre: 'Cardenales' },
  'Coipú':               { id: 'coipu-r-c',              nombre: 'Coipú' },
  'Huirapuca':           { id: 'huirapuca',              nombre: 'Huirapuca' },
  'Jockey Club':         { id: 'jockey-club-de-tucuman', nombre: 'Jockey Club de Tucumán' },
  'La Querencia':        { id: 'la-querencia',           nombre: 'La Querencia' },
  'Lince':               { id: 'lince-rugby-club',       nombre: 'Lince' },
  'Los Tarcos':          { id: 'los-tarcos',             nombre: 'Los Tarcos' },
  'Natación y Gimnasia': { id: 'natacion-y-gimnasia',    nombre: 'Natación y Gimnasia' },
  'Lawn Tennis':         { id: 'tucuman-lawn-tennis',    nombre: 'Tucumán Lawn Tennis' },
  'Tucumán Rugby':       { id: 'tucuman-rugby-club',     nombre: 'Tucumán Rugby' },
  'Universitario':       { id: 'universitario-de-tucuman', nombre: 'Universitario de Tucumán' },
  // Nuevos: no había ficha.
  'Liceo':               { id: 'liceo-rugby-club-tucuman', nombre: 'Liceo Rugby Club', nuevo: true,
                           nombreMadre: 'Liceo Rugby Club (Tucumán)', ciudad: 'Tucumán', region: 'Tucumán',
                           union: 'e558d0d9-c01b-40ce-a1c7-e533cb81f97c', escudo: null },
  'San Martín':          { id: 'san-martin-rugby-club-tucuman', nombre: 'San Martín Rugby Club', nuevo: true,
                           nombreMadre: 'San Martín Rugby Club', ciudad: 'Tucumán', region: 'Tucumán',
                           union: 'e558d0d9-c01b-40ce-a1c7-e533cb81f97c', escudo: null },
};

export const COMBINADOS = {};

const COLORES = ['Verde', 'Negro', 'Azul', 'Blanco', 'Gris'];

/** "Tucumán Rugby Negro B" → { madre, color: 'Negro', b: true }. */
export function resolverAlias(alias) {
  let resto = alias.trim(); let b = false; let color = '';
  if (/ B$/.test(resto)) { b = true; resto = resto.slice(0, -2); }
  const ultima = resto.split(' ').pop();
  if (COLORES.includes(ultima)) { color = ultima; resto = resto.slice(0, -(ultima.length + 1)); }
  const madre = MADRES[resto];
  return madre ? { madre, color, b } : null;
}

/** La clave de división lleva el nivel: M19 (Campeonato) o M19R (Reserva). */
const divDe = (clave) => clave.replace(/R$/, '');

export function fichaDe(alias, division) {
  const r = resolverAlias(alias);
  if (!r) throw new Error(`alias sin madre: "${alias}"`);
  const div = divDe(division);
  const color = r.color ? `-${r.color.toLowerCase()}` : '';
  return {
    id: `${r.madre.id}${color}-${div.toLowerCase()}${r.b ? '-b' : ''}`,
    nombre: `${r.madre.nombre}${r.color ? ` ${r.color}` : ''} ${div}${r.b ? ' B' : ''}`,
    madreId: r.madre.id,
  };
}

export const DIVISIONES = ['M15', 'M16', 'M17', 'M19', 'M15R', 'M16R', 'M17R', 'M19R'];

export function torneoDe(division) {
  const div = divDe(division); const reserva = division.endsWith('R');
  return {
    division, ageGrade: div,
    nombre: `Torneo Juvenil de Tucumán ${div}${reserva ? ' Reserva' : ''}`,
    slug: `urt-juvenil-${div.toLowerCase()}${reserva ? '-reserva' : ''}`,
  };
}

export const UNION_TORNEO = 'e558d0d9-c01b-40ce-a1c7-e533cb81f97c';

export const ORDEN_FASES = [
  'Iniciación · Zona A', 'Iniciación · Zona B',
  'Anual · Primera ronda', 'Anual · Copa de Oro', 'Anual · Copa de Plata',
];

export const HORA_POR_DEFECTO = '15:00';
export function instanteDe(fecha, hora) {
  return new Date(`${fecha}T${hora || HORA_POR_DEFECTO}:00-03:00`).toISOString();
}

export const PUNTOS = { win: 4, draw: 2, loss: 0, bonusTry: 1, bonusLoss: 1 };

export const TIEBREAKERS = [
  { metric: 'points',            label: 'Puntos obtenidos',     priority: 1, enabled: true },
  { metric: 'head_to_head',      label: 'Resultado entre sí',   priority: 2, enabled: true },
  { metric: 'points_difference', label: 'Diferencia de tantos', priority: 3, enabled: true },
  { metric: 'tries_for',         label: 'Tries a favor',        priority: 4, enabled: true },
  { metric: 'won',               label: 'Partidos ganados',     priority: 5, enabled: true },
];

/**
 * 4/2/0 con bonus. La URT da el ofensivo por DIFERENCIA de tries ("B.dif. Try"),
 * el defensivo por diferencia de tantos y uno de "destrezas": los puntos de
 * cada partido salen de la tabla, así que el motor no los calcula.
 */
export const SISTEMA_ACTUAL = { win: 4, draw: 2, loss: 0, bonus: true };
export const sistemaDe = () => SISTEMA_ACTUAL;

export function reglamentoDe(s) {
  const base = { win: s.win, draw: s.draw, loss: s.loss };
  return {
    pointsWin: s.win, pointsDraw: s.draw, pointsLoss: s.loss,
    pointsBonusTry: PUNTOS.bonusTry, pointsBonusLoss: PUNTOS.bonusLoss,
    points: base,
    pointsSystem: { ...base, allowBonusPoints: true, bonusTry: PUNTOS.bonusTry, bonusLoss: PUNTOS.bonusLoss },
    bonus: { offensive: { tries: 4, points: PUNTOS.bonusTry }, defensive: { margin: 7, points: PUNTOS.bonusLoss } },
    standings: { points_base: base, bonus_rules: [] },
    competition: { format_type: 'league', parameters: { season_model: 'multi_phase' } },
    tiebreakers: TIEBREAKERS,
  };
}
export const RULESET_TORNEO = () => reglamentoDe(SISTEMA_ACTUAL);
export const RULESET = RULESET_TORNEO();

// El seed del Dos Orillas carga además el Regional M19 y completa un escudo:
// acá no hay nada de eso.
export const TRL = [];
export const TRL_FECHA1 = null;
export const LOGO_TRL = null;
export const ESCUDO_BROWN = { id: '__ninguno__', escudo: null };
