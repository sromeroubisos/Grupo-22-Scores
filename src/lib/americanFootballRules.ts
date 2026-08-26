import type { MatchEventDefinition } from './matchEventCatalog.ts';

/**
 * Reglamento de FUTBOL AMERICANO por torneo.
 *
 * No existe un unico futbol americano. La logica es la misma —posesion,
 * downs, avance, anotacion— pero cambian los cuartos, el reloj, el overtime,
 * las patadas y el plantel segun quien organiza (NFL, NCAA, IFAF, secundario,
 * una liga local). Y el FLAG no es "tackle sin tackle": tiene sus propios
 * eventos (flag pull, blitz, no-run zone), no patea y avanza a mitad de
 * cancha en vez de a diez yardas.
 *
 * Por eso el deporte no lleva un reglamento fijo: el torneo elige una
 * DISCIPLINA (tackle o flag), arranca de un PRESET y puede tocar cualquier
 * campo. Lo que sale de aca es UN objeto normalizado (`AmericanFootballRuleset`)
 * que se guarda en `tournaments.ruleset.americanFootball`, y de ese objeto se
 * derivan:
 *
 *   - el catalogo de eventos (`buildAmericanFootballEventDefinitions`)
 *   - los periodos y el reloj (`toPeriodRules`)
 *   - la planilla (`roster`)
 *   - los tiempos muertos por mitad
 *
 * Nada de esto tiene que ver con los puntos de la tabla de posiciones: eso
 * sigue en `pointsWin/pointsDraw/pointsLoss` como en todos los deportes.
 *
 * Los presets son un PUNTO DE PARTIDA editable, no una transcripcion oficial
 * del reglamento: la NFL cambia el kickoff cada temporada y la NCAA el
 * overtime cada tanto. Lo que se guarda son los numeros, no el nombre del
 * preset, asi que un torneo no cambia solo cuando cambiamos un preset.
 *
 * Modulo PURO: sin React, sin DOM, sin catalogo de deportes. Tiene que poder
 * correr en un test de Node.
 */

export type AmericanFootballDiscipline = 'tackle' | 'flag';

export type AmericanFootballOvertimeFormat =
  | 'none'
  /** Un periodo; el primero que anota gana (y si nadie anota, empate). */
  | 'sudden-death'
  /** NFL temporada regular: un periodo de 10', cada club tiene una posesion salvo TD inicial. */
  | 'nfl-regular'
  /** NFL postemporada: periodos de 15' hasta que haya ganador. */
  | 'nfl-postseason'
  /** NCAA / NFHS / IFAF: series alternadas de posesion desde una yarda fija. */
  | 'possession-series'
  /** Flag: series alternadas de posesion (una jugada o una serie corta). */
  | 'flag-series'
  | 'custom';

export type AmericanFootballFirstDownRule = 'yards' | 'midfield';

export interface AmericanFootballRuleset {
  version: 1;
  /** Preset del que se partio. `custom` cuando se toco algun campo. */
  preset: string;
  discipline: AmericanFootballDiscipline;
  /** 2 (tiempos) o 4 (cuartos). */
  periods: 2 | 4;
  periodDurationMinutes: number;
  /** Segundos que tiene la ofensiva para iniciar la jugada. */
  playClockSeconds: number;
  downs: number;
  firstDownRule: AmericanFootballFirstDownRule;
  /** Solo cuando `firstDownRule === 'yards'`. */
  firstDownYards: number;
  scoring: {
    touchdown: number;
    fieldGoal: number;
    safety: number;
    tryOne: number;
    tryTwo: number;
  };
  kicking: {
    fieldGoal: boolean;
    punt: boolean;
    kickoff: boolean;
  };
  overtime: {
    format: AmericanFootballOvertimeFormat;
    periodDurationMinutes: number;
    /** null = hasta que haya ganador. */
    maxPeriods: number | null;
    /** A partir de que overtime la conversion es obligatoriamente de dos. null = nunca. */
    twoPointAfterPeriod: number | null;
  };
  timeoutsPerHalf: number;
  roster: {
    size: number;
    starters: number;
  };
  /** Flag: yardas antes de la zona de anotacion donde no se puede correr. null = no aplica. */
  noRunZoneYards: number | null;
  /** Flag: distancia minima desde la que se puede blitzear. null = sin restriccion. */
  blitzYards: number | null;
  /** Flag: segundos que tiene el QB para lanzar. null = sin limite. */
  qbSecondsToThrow: number | null;
  /** Si el balon suelto esta en juego. En flag casi siempre es balon muerto. */
  fumbles: boolean;
}

export interface AmericanFootballPreset {
  id: string;
  label: string;
  discipline: AmericanFootballDiscipline;
  /** Una linea para el selector: que reglamento es y para quien. */
  description: string;
  rules: Omit<AmericanFootballRuleset, 'version' | 'preset'>;
}

export const AMERICAN_FOOTBALL_DISCIPLINE_LABELS: Record<AmericanFootballDiscipline, string> = {
  tackle: 'Tackle',
  flag: 'Flag',
};

export const AMERICAN_FOOTBALL_OVERTIME_LABELS: Record<AmericanFootballOvertimeFormat, string> = {
  none: 'Sin tiempo extra (queda empate)',
  'sudden-death': 'Muerte súbita',
  'nfl-regular': 'NFL temporada regular (10′, una posesión cada uno)',
  'nfl-postseason': 'NFL postemporada (15′ hasta que haya ganador)',
  'possession-series': 'Series de posesión (NCAA / secundario / IFAF)',
  'flag-series': 'Series de posesión (flag)',
  custom: 'Personalizado',
};

export const AMERICAN_FOOTBALL_FIRST_DOWN_LABELS: Record<AmericanFootballFirstDownRule, string> = {
  yards: 'Yardas a recorrer',
  midfield: 'Cruzar mitad de cancha',
};

const TACKLE_SCORING = { touchdown: 6, fieldGoal: 3, safety: 2, tryOne: 1, tryTwo: 2 } as const;
const FLAG_SCORING = { touchdown: 6, fieldGoal: 0, safety: 2, tryOne: 1, tryTwo: 2 } as const;
const ALL_KICKING = { fieldGoal: true, punt: true, kickoff: true } as const;
const NO_KICKING = { fieldGoal: false, punt: false, kickoff: false } as const;

/**
 * El orden es el del selector: primero el tackle de mas a menos conocido,
 * despues el flag. `custom` no es un preset: es el estado al que cae un
 * torneo que toco un campo, y se resuelve sobre lo guardado.
 */
export const AMERICAN_FOOTBALL_PRESETS: readonly AmericanFootballPreset[] = [
  {
    id: 'nfl',
    label: 'NFL · temporada regular',
    discipline: 'tackle',
    description: '4 cuartos de 15′, play clock de 40″, overtime de 10′ con una posesión para cada uno.',
    rules: {
      discipline: 'tackle',
      periods: 4,
      periodDurationMinutes: 15,
      playClockSeconds: 40,
      downs: 4,
      firstDownRule: 'yards',
      firstDownYards: 10,
      scoring: TACKLE_SCORING,
      kicking: ALL_KICKING,
      overtime: { format: 'nfl-regular', periodDurationMinutes: 10, maxPeriods: 1, twoPointAfterPeriod: null },
      timeoutsPerHalf: 3,
      roster: { size: 48, starters: 22 },
      noRunZoneYards: null,
      blitzYards: null,
      qbSecondsToThrow: null,
      fumbles: true,
    },
  },
  {
    id: 'nfl-postseason',
    label: 'NFL · postemporada',
    discipline: 'tackle',
    description: 'Como la temporada regular, pero el overtime son periodos de 15′ hasta que haya ganador.',
    rules: {
      discipline: 'tackle',
      periods: 4,
      periodDurationMinutes: 15,
      playClockSeconds: 40,
      downs: 4,
      firstDownRule: 'yards',
      firstDownYards: 10,
      scoring: TACKLE_SCORING,
      kicking: ALL_KICKING,
      overtime: { format: 'nfl-postseason', periodDurationMinutes: 15, maxPeriods: null, twoPointAfterPeriod: null },
      timeoutsPerHalf: 3,
      roster: { size: 48, starters: 22 },
      noRunZoneYards: null,
      blitzYards: null,
      qbSecondsToThrow: null,
      fumbles: true,
    },
  },
  {
    id: 'ncaa',
    label: 'NCAA · universitario',
    discipline: 'tackle',
    description: '4 cuartos de 15′; overtime por series de posesión desde la yarda 25, conversión de dos obligatoria desde el tercero.',
    rules: {
      discipline: 'tackle',
      periods: 4,
      periodDurationMinutes: 15,
      playClockSeconds: 40,
      downs: 4,
      firstDownRule: 'yards',
      firstDownYards: 10,
      scoring: TACKLE_SCORING,
      kicking: ALL_KICKING,
      overtime: { format: 'possession-series', periodDurationMinutes: 0, maxPeriods: null, twoPointAfterPeriod: 3 },
      timeoutsPerHalf: 3,
      roster: { size: 70, starters: 22 },
      noRunZoneYards: null,
      blitzYards: null,
      qbSecondsToThrow: null,
      fumbles: true,
    },
  },
  {
    id: 'high-school',
    label: 'Secundario (NFHS)',
    discipline: 'tackle',
    description: '4 cuartos de 12′; overtime por series de posesión desde la yarda 10.',
    rules: {
      discipline: 'tackle',
      periods: 4,
      periodDurationMinutes: 12,
      playClockSeconds: 40,
      downs: 4,
      firstDownRule: 'yards',
      firstDownYards: 10,
      scoring: TACKLE_SCORING,
      kicking: ALL_KICKING,
      overtime: { format: 'possession-series', periodDurationMinutes: 0, maxPeriods: null, twoPointAfterPeriod: null },
      timeoutsPerHalf: 3,
      roster: { size: 60, starters: 22 },
      noRunZoneYards: null,
      blitzYards: null,
      qbSecondsToThrow: null,
      fumbles: true,
    },
  },
  {
    id: 'ifaf',
    label: 'IFAF · internacional',
    discipline: 'tackle',
    description: 'Reglas de base NCAA con cuartos de 12′, lo habitual en competencias internacionales y ligas locales.',
    rules: {
      discipline: 'tackle',
      periods: 4,
      periodDurationMinutes: 12,
      playClockSeconds: 40,
      downs: 4,
      firstDownRule: 'yards',
      firstDownYards: 10,
      scoring: TACKLE_SCORING,
      kicking: ALL_KICKING,
      overtime: { format: 'possession-series', periodDurationMinutes: 0, maxPeriods: null, twoPointAfterPeriod: 3 },
      timeoutsPerHalf: 3,
      roster: { size: 45, starters: 22 },
      noRunZoneYards: null,
      blitzYards: null,
      qbSecondsToThrow: null,
      fumbles: true,
    },
  },
  {
    id: 'ifaf-flag-5v5',
    label: 'Flag · IFAF 5v5',
    discipline: 'flag',
    description: 'Dos tiempos de 20′, sin patadas, cuatro jugadas para cruzar la mitad y cuatro para anotar; try de 1 (5 yd) o de 2 (10 yd).',
    rules: {
      discipline: 'flag',
      periods: 2,
      periodDurationMinutes: 20,
      playClockSeconds: 25,
      downs: 4,
      firstDownRule: 'midfield',
      firstDownYards: 0,
      scoring: FLAG_SCORING,
      kicking: NO_KICKING,
      overtime: { format: 'flag-series', periodDurationMinutes: 0, maxPeriods: null, twoPointAfterPeriod: null },
      timeoutsPerHalf: 1,
      roster: { size: 12, starters: 5 },
      noRunZoneYards: 5,
      blitzYards: 7,
      qbSecondsToThrow: 7,
      fumbles: false,
    },
  },
  {
    id: 'usa-flag-5v5',
    label: 'Flag · USA Flag 5′s',
    discipline: 'flag',
    description: 'Formato 5v5 de USA Football: no-run zone de 5 yardas, blitz desde 7 yardas, QB con 7″ para lanzar.',
    rules: {
      discipline: 'flag',
      periods: 2,
      periodDurationMinutes: 20,
      playClockSeconds: 25,
      downs: 4,
      firstDownRule: 'midfield',
      firstDownYards: 0,
      scoring: FLAG_SCORING,
      kicking: NO_KICKING,
      overtime: { format: 'flag-series', periodDurationMinutes: 0, maxPeriods: null, twoPointAfterPeriod: null },
      timeoutsPerHalf: 2,
      roster: { size: 12, starters: 5 },
      noRunZoneYards: 5,
      blitzYards: 7,
      qbSecondsToThrow: 7,
      fumbles: false,
    },
  },
  {
    id: 'nfl-flag',
    label: 'Flag · NFL FLAG',
    discipline: 'flag',
    description: '5v5 sin patadas ni contacto; try de 1 desde la 5 y de 2 desde la 10; blitz desde 7 yardas.',
    rules: {
      discipline: 'flag',
      periods: 2,
      periodDurationMinutes: 20,
      playClockSeconds: 25,
      downs: 4,
      firstDownRule: 'midfield',
      firstDownYards: 0,
      scoring: FLAG_SCORING,
      kicking: NO_KICKING,
      overtime: { format: 'flag-series', periodDurationMinutes: 0, maxPeriods: null, twoPointAfterPeriod: null },
      timeoutsPerHalf: 1,
      roster: { size: 10, starters: 5 },
      noRunZoneYards: 5,
      blitzYards: 7,
      qbSecondsToThrow: 7,
      fumbles: false,
    },
  },
];

export const DEFAULT_AMERICAN_FOOTBALL_PRESET_ID = 'nfl';
export const CUSTOM_AMERICAN_FOOTBALL_PRESET_ID = 'custom';

export function getAmericanFootballPreset(presetId: string | null | undefined): AmericanFootballPreset {
  return AMERICAN_FOOTBALL_PRESETS.find((preset) => preset.id === presetId)
    ?? AMERICAN_FOOTBALL_PRESETS.find((preset) => preset.id === DEFAULT_AMERICAN_FOOTBALL_PRESET_ID)!;
}

export function getAmericanFootballPresetsByDiscipline(discipline: AmericanFootballDiscipline): AmericanFootballPreset[] {
  return AMERICAN_FOOTBALL_PRESETS.filter((preset) => preset.discipline === discipline);
}

/** El primer preset de la disciplina: lo que se ofrece al cambiar de tackle a flag. */
export function getDefaultAmericanFootballPreset(discipline: AmericanFootballDiscipline): AmericanFootballPreset {
  return getAmericanFootballPresetsByDiscipline(discipline)[0] ?? getAmericanFootballPreset(null);
}

export function createAmericanFootballRuleset(presetId: string | null | undefined): AmericanFootballRuleset {
  const preset = getAmericanFootballPreset(presetId);
  return { version: 1, preset: preset.id, ...cloneRules(preset.rules) };
}

function cloneRules<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/* ─── normalizacion ─── */

function toInt(value: unknown, fallback: number, min = 0, max = 999): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

function toNullableInt(value: unknown, fallback: number | null, min = 0, max = 999): number | null {
  if (value === null || value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

function toBool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function isOvertimeFormat(value: unknown): value is AmericanFootballOvertimeFormat {
  return typeof value === 'string' && value in AMERICAN_FOOTBALL_OVERTIME_LABELS;
}

/**
 * Lee lo guardado en `ruleset.americanFootball` y devuelve un reglamento
 * completo, o null si no hay nada. Un torneo guardado con una version vieja
 * del preset conserva SUS numeros: lo que falte se completa desde el preset
 * que declara, y si el preset ya no existe, desde el default de la disciplina.
 */
export function normalizeAmericanFootballRuleset(raw: unknown): AmericanFootballRuleset | null {
  if (!raw || typeof raw !== 'object') return null;
  const source = raw as Record<string, unknown>;

  const discipline: AmericanFootballDiscipline = source.discipline === 'flag' ? 'flag' : 'tackle';
  const declaredPreset = typeof source.preset === 'string' ? source.preset : '';
  const base = AMERICAN_FOOTBALL_PRESETS.find((preset) => preset.id === declaredPreset && preset.discipline === discipline)
    ?? getDefaultAmericanFootballPreset(discipline);
  const defaults = base.rules;

  const scoring = (source.scoring && typeof source.scoring === 'object' ? source.scoring : {}) as Record<string, unknown>;
  const kicking = (source.kicking && typeof source.kicking === 'object' ? source.kicking : {}) as Record<string, unknown>;
  const overtime = (source.overtime && typeof source.overtime === 'object' ? source.overtime : {}) as Record<string, unknown>;
  const roster = (source.roster && typeof source.roster === 'object' ? source.roster : {}) as Record<string, unknown>;

  const periods = toInt(source.periods, defaults.periods, 2, 4);

  return {
    version: 1,
    preset: declaredPreset === CUSTOM_AMERICAN_FOOTBALL_PRESET_ID ? CUSTOM_AMERICAN_FOOTBALL_PRESET_ID : base.id,
    discipline,
    periods: periods >= 3 ? 4 : 2,
    periodDurationMinutes: toInt(source.periodDurationMinutes, defaults.periodDurationMinutes, 1, 90),
    playClockSeconds: toInt(source.playClockSeconds, defaults.playClockSeconds, 5, 120),
    downs: toInt(source.downs, defaults.downs, 1, 10),
    firstDownRule: source.firstDownRule === 'midfield' ? 'midfield' : source.firstDownRule === 'yards' ? 'yards' : defaults.firstDownRule,
    firstDownYards: toInt(source.firstDownYards, defaults.firstDownYards, 0, 100),
    scoring: {
      touchdown: toInt(scoring.touchdown, defaults.scoring.touchdown, 0, 20),
      fieldGoal: toInt(scoring.fieldGoal, defaults.scoring.fieldGoal, 0, 20),
      safety: toInt(scoring.safety, defaults.scoring.safety, 0, 20),
      tryOne: toInt(scoring.tryOne, defaults.scoring.tryOne, 0, 20),
      tryTwo: toInt(scoring.tryTwo, defaults.scoring.tryTwo, 0, 20),
    },
    kicking: {
      fieldGoal: toBool(kicking.fieldGoal, defaults.kicking.fieldGoal),
      punt: toBool(kicking.punt, defaults.kicking.punt),
      kickoff: toBool(kicking.kickoff, defaults.kicking.kickoff),
    },
    overtime: {
      format: isOvertimeFormat(overtime.format) ? overtime.format : defaults.overtime.format,
      periodDurationMinutes: toInt(overtime.periodDurationMinutes, defaults.overtime.periodDurationMinutes, 0, 60),
      maxPeriods: toNullableInt(overtime.maxPeriods, defaults.overtime.maxPeriods, 1, 20),
      twoPointAfterPeriod: toNullableInt(overtime.twoPointAfterPeriod, defaults.overtime.twoPointAfterPeriod, 1, 20),
    },
    timeoutsPerHalf: toInt(source.timeoutsPerHalf, defaults.timeoutsPerHalf, 0, 10),
    roster: {
      size: toInt(roster.size, defaults.roster.size, 1, 120),
      starters: toInt(roster.starters, defaults.roster.starters, 1, 120),
    },
    noRunZoneYards: toNullableInt(source.noRunZoneYards, defaults.noRunZoneYards, 0, 50),
    blitzYards: toNullableInt(source.blitzYards, defaults.blitzYards, 0, 50),
    qbSecondsToThrow: toNullableInt(source.qbSecondsToThrow, defaults.qbSecondsToThrow, 1, 60),
    fumbles: toBool(source.fumbles, defaults.fumbles),
  };
}

/** Lee el reglamento desde el `ruleset` completo del torneo. */
export function readAmericanFootballRuleset(tournamentRuleset: unknown): AmericanFootballRuleset | null {
  if (!tournamentRuleset || typeof tournamentRuleset !== 'object') return null;
  return normalizeAmericanFootballRuleset((tournamentRuleset as Record<string, unknown>).americanFootball);
}

/* ─── derivados ─── */

/** Lo que el reloj y los periodos necesitan saber: cuantos y de cuanto. */
export interface MatchPeriodRules {
  periods: 2 | 4;
  periodDurationMinutes: number;
}

export function toPeriodRules(rules: AmericanFootballRuleset | null | undefined): MatchPeriodRules | null {
  if (!rules) return null;
  return { periods: rules.periods, periodDurationMinutes: rules.periodDurationMinutes };
}

/** Una linea para la cabecera o el resumen: "Flag · IFAF 5v5 · 2×20′". */
export function describeAmericanFootballRuleset(rules: AmericanFootballRuleset): string {
  const preset = rules.preset === CUSTOM_AMERICAN_FOOTBALL_PRESET_ID
    ? 'Personalizado'
    : getAmericanFootballPreset(rules.preset).label.replace(/^Flag · /, '');
  return `${AMERICAN_FOOTBALL_DISCIPLINE_LABELS[rules.discipline]} · ${preset} · ${rules.periods}×${rules.periodDurationMinutes}′`;
}

/* ─── catalogo de eventos ─── */

const TOUCHDOWN_KINDS = {
  tackle: [
    { id: 'rushing', label: 'De carrera', scores: true },
    { id: 'passing', label: 'De pase', scores: true },
    { id: 'interception_return', label: 'Devolución de intercepción', scores: true },
    { id: 'fumble_return', label: 'Devolución de fumble', scores: true },
    { id: 'kickoff_return', label: 'Devolución de kickoff', scores: true },
    { id: 'punt_return', label: 'Devolución de punt', scores: true },
    { id: 'other', label: 'Otro', scores: true },
  ],
  flag: [
    { id: 'rushing', label: 'De carrera', scores: true },
    { id: 'passing', label: 'De pase', scores: true },
    { id: 'interception_return', label: 'Devolución de intercepción', scores: true },
    { id: 'other', label: 'Otro', scores: true },
  ],
} as const;

const KICK_OUTCOMES = [
  { id: 'good', label: 'Convertido', scores: true },
  { id: 'missed', label: 'Fallado' },
  { id: 'blocked', label: 'Bloqueado' },
];

const TRY_OUTCOMES = [
  { id: 'good', label: 'Convertida', scores: true },
  { id: 'failed', label: 'Fallada' },
];

/**
 * Motivos de penalidad del flag. En tackle la lista es tan larga que va en
 * texto libre; en flag son pocas y siempre las mismas, asi que se eligen.
 */
const FLAG_PENALTY_OUTCOMES = [
  { id: 'flag_guarding', label: 'Flag guarding' },
  { id: 'illegal_contact', label: 'Contacto ilegal' },
  { id: 'illegal_block', label: 'Bloqueo ilegal' },
  { id: 'offside', label: 'Offside' },
  { id: 'false_start', label: 'Salida en falso' },
  { id: 'illegal_motion', label: 'Movimiento ilegal' },
  { id: 'illegal_run', label: 'Carrera en no-run zone' },
  { id: 'other', label: 'Otra' },
];

function clockEvents(periods: 2 | 4): MatchEventDefinition[] {
  const unit = periods === 4 ? 'cuarto' : 'tiempo';
  return [
    { type: 'match_start', label: 'Inicio del partido', category: 'clock', points: 0, team: 'none', player: 'none' },
    { type: 'end_period', label: `Fin de ${unit}`, category: 'clock', points: 0, team: 'none', player: 'none' },
    { type: 'start_period', label: `Inicio de ${unit}`, category: 'clock', points: 0, team: 'none', player: 'none' },
    { type: 'match_half', label: 'Entretiempo', category: 'clock', points: 0, team: 'none', player: 'none' },
    { type: 'match_end', label: 'Final del partido', category: 'clock', points: 0, team: 'none', player: 'none' },
  ];
}

/**
 * El catalogo de eventos que sale de un reglamento. Es la UNICA fuente del
 * catalogo de futbol americano: el preset "del deporte" es este mismo
 * catalogo con el reglamento NFL.
 *
 * Decisiones que no cambian entre disciplinas:
 * 1. Lo que se patea se puede errar y lo errado es un DESENLACE del mismo
 *    evento (`good` suma; `missed`/`blocked` no). Nunca un evento aparte.
 * 2. El touchdown siempre suma y su desenlace es el TIPO. `defaultOutcome`
 *    es para los touchdowns sin tipo (ESPN, cargas viejas).
 * 3. Un fumble NO es turnover hasta que lo recupera el rival. La intercepcion
 *    se carga al equipo que la captura.
 * 4. Las yardas viajan en el detalle (`Yds: +7`).
 *
 * Los tipos son los mismos en tackle y flag cuando el hecho es el mismo:
 * `extra_point` es el punto extra pateado en tackle y el try de 1 desde la 5
 * en flag; el marcador y las estadisticas no tienen que saber cual de los dos.
 */
export function buildAmericanFootballEventDefinitions(rules: AmericanFootballRuleset): MatchEventDefinition[] {
  const flag = rules.discipline === 'flag';
  const { scoring, kicking } = rules;
  const definitions: MatchEventDefinition[] = [];

  /* ── Anotacion ── */
  definitions.push({
    type: 'touchdown',
    label: 'Touchdown',
    category: 'score',
    points: scoring.touchdown,
    team: 'required',
    player: 'optional',
    outcomePrompt: 'Tipo de touchdown',
    defaultOutcome: 'other',
    outcomes: [...TOUCHDOWN_KINDS[rules.discipline]],
  });
  if (!flag && kicking.fieldGoal) {
    definitions.push({
      type: 'field_goal',
      label: 'Field goal',
      category: 'score',
      points: scoring.fieldGoal,
      team: 'required',
      player: 'optional',
      outcomes: [...KICK_OUTCOMES],
    });
  }
  definitions.push({
    type: 'extra_point',
    label: flag ? 'Try de 1 punto' : 'Punto extra',
    category: 'score',
    points: scoring.tryOne,
    team: 'required',
    player: 'optional',
    outcomes: flag ? [...TRY_OUTCOMES] : [...KICK_OUTCOMES],
  });
  definitions.push({
    type: 'two_point_conversion',
    label: flag ? 'Try de 2 puntos' : 'Conversión de 2',
    category: 'score',
    points: scoring.tryTwo,
    team: 'required',
    player: 'optional',
    outcomes: [...TRY_OUTCOMES],
  });
  definitions.push({ type: 'safety', label: 'Safety', category: 'score', points: scoring.safety, team: 'required', player: 'optional' });

  /* ── Ofensiva ── */
  definitions.push(
    { type: 'rush', label: 'Carrera', category: 'other', points: 0, team: 'required', player: 'optional' },
    // Jugador = quien lanza; el receptor va como segundo jugador.
    { type: 'pass_complete', label: 'Pase completo', category: 'other', points: 0, team: 'required', player: 'optional' },
    { type: 'pass_incomplete', label: 'Pase incompleto', category: 'other', points: 0, team: 'required', player: 'optional' },
    {
      type: 'first_down',
      label: rules.firstDownRule === 'midfield' ? 'Primer down (mitad de cancha)' : 'Primer down',
      category: 'other',
      points: 0,
      team: 'required',
      player: 'none',
      outcomePrompt: 'Cómo se consiguió',
      defaultOutcome: 'other',
      outcomes: [
        { id: 'rushing', label: 'Por carrera' },
        { id: 'passing', label: 'Por pase' },
        { id: 'penalty', label: 'Por penalidad' },
        { id: 'other', label: 'Otro' },
      ],
    },
  );

  /* ── Defensa: se cargan al equipo que defiende ── */
  if (flag) {
    definitions.push(
      { type: 'flag_pull', label: 'Flag pull', category: 'other', points: 0, team: 'required', player: 'optional' },
      { type: 'flag_pull_for_loss', label: 'Flag pull con pérdida', category: 'other', points: 0, team: 'required', player: 'optional' },
      { type: 'sack', label: 'Sack (flag al QB)', category: 'other', points: 0, team: 'required', player: 'optional' },
      { type: 'interception', label: 'Intercepción', category: 'other', points: 0, team: 'required', player: 'optional' },
      { type: 'pass_defended', label: 'Pase defendido', category: 'other', points: 0, team: 'required', player: 'optional' },
      { type: 'blitz', label: 'Blitz', category: 'other', points: 0, team: 'required', player: 'optional' },
    );
  } else {
    definitions.push(
      { type: 'sack', label: 'Sack', category: 'other', points: 0, team: 'required', player: 'optional' },
      { type: 'interception', label: 'Intercepción', category: 'other', points: 0, team: 'required', player: 'optional' },
      { type: 'pass_defended', label: 'Pase defendido', category: 'other', points: 0, team: 'required', player: 'optional' },
      { type: 'forced_fumble', label: 'Fumble forzado', category: 'other', points: 0, team: 'required', player: 'optional' },
    );
  }

  /* ── Posesion ── */
  if (rules.fumbles) {
    definitions.push({
      // Se carga al equipo que lo SUELTA. Es turnover solo si lo recupera el rival.
      type: 'fumble',
      label: 'Fumble',
      category: 'other',
      points: 0,
      team: 'required',
      player: 'optional',
      outcomePrompt: 'Quién lo recuperó',
      outcomes: [
        { id: 'recovered', label: 'Lo recupera el mismo club' },
        { id: 'lost', label: 'Lo recupera el rival' },
      ],
    });
  }
  definitions.push({ type: 'turnover_on_downs', label: 'Pérdida en downs', category: 'other', points: 0, team: 'required', player: 'none' });
  if (!flag && kicking.punt) {
    definitions.push({ type: 'punt', label: 'Punt', category: 'other', points: 0, team: 'required', player: 'optional' });
  }
  if (!flag && kicking.kickoff) {
    definitions.push(
      {
        type: 'kickoff',
        label: 'Kickoff',
        category: 'other',
        points: 0,
        team: 'required',
        player: 'optional',
        outcomePrompt: 'Cómo terminó',
        defaultOutcome: 'return',
        outcomes: [
          { id: 'return', label: 'Devuelto' },
          { id: 'touchback', label: 'Touchback' },
          { id: 'out_of_bounds', label: 'Afuera' },
          { id: 'onside', label: 'Onside kick' },
        ],
      },
      { type: 'touchback', label: 'Touchback', category: 'other', points: 0, team: 'required', player: 'none' },
    );
  }

  /* ── Disciplina ── */
  definitions.push(flag
    ? {
      type: 'penalty',
      label: 'Penalidad',
      category: 'discipline',
      points: 0,
      team: 'required',
      player: 'optional',
      outcomePrompt: 'Tipo de penalidad',
      defaultOutcome: 'other',
      outcomes: [...FLAG_PENALTY_OUTCOMES],
    }
    : { type: 'penalty', label: 'Penalidad', category: 'discipline', points: 0, team: 'required', player: 'optional' });

  /* ── Partido ── */
  definitions.push({ type: 'timeout', label: 'Tiempo muerto', category: 'other', points: 0, team: 'required', player: 'none' });
  definitions.push(...clockEvents(rules.periods));

  return definitions;
}

/**
 * Acciones rapidas de la consola, por disciplina. Lo que no exista en el
 * catalogo del torneo (un field goal en un reglamento sin patadas) se filtra
 * solo al resolver los tipos contra las definiciones.
 */
export function getAmericanFootballQuickActions(discipline: AmericanFootballDiscipline): {
  scoring: readonly string[];
  plays: readonly string[];
  clock: readonly string[];
} {
  const clock = ['match_start', 'end_period', 'start_period', 'match_half', 'match_end'] as const;
  if (discipline === 'flag') {
    return {
      scoring: ['touchdown', 'extra_point', 'two_point_conversion', 'safety', 'penalty'],
      plays: ['rush', 'pass_complete', 'pass_incomplete', 'first_down', 'flag_pull', 'flag_pull_for_loss', 'interception', 'blitz', 'pass_defended', 'timeout'],
      clock,
    };
  }
  return {
    scoring: ['touchdown', 'field_goal', 'extra_point', 'two_point_conversion', 'safety', 'penalty'],
    plays: ['rush', 'pass_complete', 'pass_incomplete', 'first_down', 'sack', 'interception', 'fumble', 'punt', 'timeout'],
    clock,
  };
}
