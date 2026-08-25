export type BonusMetricTeam = 'home' | 'away';

export type BonusMetricEvent = {
  type?: unknown;
  team?: unknown;
};

/**
 * Contra qué se compara el umbral del bonus ofensivo.
 *
 * En rugby hay dos reglamentos vivos y los dos son "bonus por tries":
 *
 * - `count`: lo anotado por el equipo. Cuatro tries o más, sin mirar al rival
 *   (Six Nations, URBA, el clásico).
 * - `difference`: lo anotado POR ENCIMA del rival. Tres tries más que el otro:
 *   3-0, 4-1, 5-2 (World Rugby desde 2016, Super Rugby, Top 14, Rugby
 *   Championship). Con este modo un 4-4 no da bonus a nadie y un 3-0 sí.
 *
 * Es un modo de la misma regla y no una regla aparte porque comparten todo lo
 * demás —la unidad, los puntos, quién la configura— y porque un torneo elige
 * UNA de las dos, nunca las dos a la vez.
 */
export type OffensiveBonusMode = 'count' | 'difference';

export type NormalizedOffensiveBonusRule = {
  threshold: number;
  points: number;
  metric: 'event_count' | 'team_score';
  eventType: string | null;
  label: string;
  mode: OffensiveBonusMode;
};

/** El umbral que cada modo trae de fábrica: 4 tries anotados, 3 de diferencia. */
export const DEFAULT_OFFENSIVE_BONUS_THRESHOLD: Record<OffensiveBonusMode, number> = {
  count: 4,
  difference: 3,
};

const DIFFERENCE_MODE_TOKENS = new Set([
  'difference',
  'diff',
  'differential',
  'delta',
  'margin',
  'diferencia',
  'triesdifference',
  'trydifference',
  'tries_difference',
]);

const COUNT_MODE_TOKENS = new Set([
  'count',
  'total',
  'for',
  'scored',
  'absolute',
  'anotados',
  'threshold',
]);

const TEAM_SCORE_TOKENS = new Set([
  'score',
  'scores',
  'teamscore',
  'teamscores',
  'points',
  'point',
  'pointsfor',
  'points_for',
  'goalscore',
  'goalscored',
]);

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function compactToken(value: unknown) {
  return normalizeText(value).replace(/[\s_-]/g, '').toLowerCase();
}

function toFiniteNumber(value: unknown): number | null {
  const normalized = typeof value === 'string' && value.trim() === '' ? Number.NaN : Number(value);
  return Number.isFinite(normalized) ? normalized : null;
}

function getTeamScore(score: unknown, team: BonusMetricTeam): number {
  if (!score || typeof score !== 'object' || Array.isArray(score)) {
    return 0;
  }

  const source = score as Record<string, unknown>;
  const value = team === 'home' ? source.home ?? source.home_score : source.away ?? source.away_score;
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function getTeamCounter(score: unknown, team: BonusMetricTeam, baseKey: string): number | null {
  if (!score || typeof score !== 'object' || Array.isArray(score)) {
    return null;
  }

  const source = score as Record<string, unknown>;
  const prefix = team === 'home' ? 'home' : 'away';
  const pascalBase = baseKey.charAt(0).toUpperCase() + baseKey.slice(1);
  const candidates = [
    source[`${prefix}${pascalBase}`],
    source[`${prefix}_${baseKey}`],
  ];

  const groupValue = source[baseKey];
  if (groupValue && typeof groupValue === 'object' && !Array.isArray(groupValue)) {
    candidates.push((groupValue as Record<string, unknown>)[team]);
  }

  for (const candidate of candidates) {
    const value = Number(candidate);
    if (Number.isFinite(value)) {
      return value;
    }
  }

  return null;
}

function normalizeEventTypeToken(value: unknown): string | null {
  const normalized = normalizeText(value);
  if (!normalized) return null;

  const compact = compactToken(normalized);
  if (['try', 'tries', 'trycount', 'trycounts'].includes(compact)) return 'try';
  if (['goal', 'goals'].includes(compact)) return 'goal';
  if (['point', 'points'].includes(compact)) return 'point';
  if (['run', 'runs'].includes(compact)) return 'run';
  if (['touchdown', 'touchdowns'].includes(compact)) return 'touchdown';

  return normalized.replace(/[\s-]+/g, '_').toLowerCase();
}

function getRuleLabel(rule: {
  label?: unknown;
  metricLabel?: unknown;
  eventLabel?: unknown;
  type?: unknown;
  eventType?: unknown;
  event_type?: unknown;
  metric?: unknown;
  tries?: unknown;
}, metric: 'event_count' | 'team_score', eventType: string | null) {
  const explicit =
    normalizeText(rule.label) ||
    normalizeText(rule.metricLabel) ||
    normalizeText(rule.eventLabel);

  if (explicit) return explicit;
  if (metric === 'team_score') return 'puntos';

  if (eventType === 'try') return 'tries';
  if (eventType === 'goal') return 'goles';
  if (eventType === 'point') return 'puntos';
  if (eventType === 'run') return 'carreras';
  if (eventType === 'touchdown') return 'touchdowns';
  if (eventType) return eventType.replace(/_/g, ' ');
  return 'eventos';
}

function getCandidateEventTypes(eventType: string | null): string[] {
  if (!eventType) return [];

  if (eventType === 'goal') {
    // `penalty_corner_goal` es el gol de corner corto del hockey: sin el, un
    // bonus configurado por goles contaba de menos justo la jugada que mas
    // goles produce en ese deporte.
    return ['goal', 'penalty_goal', 'own_goal', 'seven_meter_goal', 'penalty_corner_goal'];
  }

  return [eventType];
}

/**
 * Tipos que se cargan a un equipo pero cuyo tanto es del rival.
 *
 * Espeja `creditsOpponent` del catalogo de eventos. Se declara aca en vez de
 * leer la definicion porque este modulo es puro a proposito —lo importa
 * `matchPointsCore`, que tiene que poder correr en un test de Node sin
 * arrastrar el catalogo—. Si algun dia aparece un segundo evento asi, va en
 * los dos lados.
 */
const OPPONENT_CREDITED_EVENT_TYPES = new Set(['own_goal']);

/**
 * Lee el modo de una regla escrita a mano o guardada por otra versión.
 * Devuelve `null` si no dice nada, para que quien llama decida el default.
 */
export function normalizeOffensiveBonusMode(value: unknown): OffensiveBonusMode | null {
  const compact = compactToken(value);
  if (!compact) return null;
  if (DIFFERENCE_MODE_TOKENS.has(compact)) return 'difference';
  if (COUNT_MODE_TOKENS.has(compact)) return 'count';
  return null;
}

export function resolveOffensiveBonusRule(rawRule: unknown): NormalizedOffensiveBonusRule | null {
  if (rawRule === true) {
    return {
      threshold: DEFAULT_OFFENSIVE_BONUS_THRESHOLD.count,
      points: 1,
      metric: 'event_count',
      eventType: 'try',
      label: 'tries',
      mode: 'count',
    };
  }

  if (!rawRule || typeof rawRule !== 'object') {
    return null;
  }

  const source = rawRule as Record<string, unknown>;

  // `triesDifference: 3` es la forma corta de `{ mode: 'difference', tries: 3 }`.
  // Se acepta por si alguien la escribe así en un settings a mano, pero lo que
  // se guarda es siempre la forma larga, que un lector viejo entiende como
  // "3 tries o más" en vez de ignorarla.
  const differenceShortcut = toFiniteNumber(
    source.triesDifference ?? source.tries_difference ?? source.tryDifference ?? source.difference,
  );
  const explicitMode = normalizeOffensiveBonusMode(
    source.mode ?? source.basis ?? source.comparison ?? source.compare,
  );
  const mode: OffensiveBonusMode = explicitMode ?? (differenceShortcut !== null ? 'difference' : 'count');

  const threshold = toFiniteNumber(
    source.threshold ?? source.tries ?? source.count ?? source.minimum ?? source.min,
  ) ?? (mode === 'difference' ? differenceShortcut : null) ?? DEFAULT_OFFENSIVE_BONUS_THRESHOLD[mode];
  const points = toFiniteNumber(source.points ?? source.value) ?? 1;
  const rawMetric =
    source.metric ??
    source.type ??
    source.eventType ??
    source.event_type ??
    source.stat ??
    source.measure ??
    source.target;
  const normalizedMetric = compactToken(rawMetric);

  if (!Number.isFinite(threshold) || threshold < 0 || !Number.isFinite(points)) {
    return null;
  }

  const metric: 'event_count' | 'team_score' =
    TEAM_SCORE_TOKENS.has(normalizedMetric) ? 'team_score' : 'event_count';
  const eventType =
    metric === 'event_count'
      ? normalizeEventTypeToken(source.eventType ?? source.event_type ?? rawMetric ?? (source.tries != null ? 'try' : null))
      : null;

  return {
    threshold,
    points,
    metric,
    eventType,
    label: getRuleLabel(source, metric, eventType),
    mode,
  };
}

/**
 * La UNIDAD que se cuenta, no el nombre de la regla.
 *
 * Ojo con `rule.label`: en el catálogo suele traer el nombre de la regla, no el
 * sustantivo. Super Rugby Americas la llama "4+ Tries", así que usarla tal cual
 * escribiría "7 4+ Tries · +1". La unidad sale del `eventType` —que ya viene
 * normalizado a 'try' | 'goal' | ...— y el label queda como último recurso, para
 * un deporte que cuente algo que no está en la tabla.
 */
export function offensiveBonusUnit(rule: Pick<NormalizedOffensiveBonusRule, 'metric' | 'eventType' | 'label'>): string {
  if (rule.metric === 'team_score') return 'puntos';
  switch (rule.eventType) {
    case 'try': return 'tries';
    case 'goal': return 'goles';
    case 'point': return 'puntos';
    case 'run': return 'carreras';
    case 'touchdown': return 'touchdowns';
    default:
      return rule.eventType ? rule.eventType.replace(/_/g, ' ') : (rule.label || 'unidades');
  }
}

/**
 * La regla en una frase corta, para rótulos: "4+ tries", "3+ tries de
 * diferencia". Es la misma traducción en el creador, el gestor y el Match
 * Center, así que ninguna pantalla puede describir la regla distinto de como
 * el motor la aplica.
 */
export function describeOffensiveBonusRule(
  rule: Pick<NormalizedOffensiveBonusRule, 'metric' | 'eventType' | 'label' | 'threshold' | 'mode'>,
): string {
  const unit = offensiveBonusUnit(rule);
  return rule.mode === 'difference'
    ? `${rule.threshold}+ ${unit} de diferencia`
    : `${rule.threshold}+ ${unit}`;
}

export type OffensiveBonusOutcome = {
  /** Lo que anotó el equipo evaluado (tries, goles o puntos según la regla). */
  own: number;
  /** Lo que anotó el rival, en la misma unidad. */
  opponent: number;
  /** Lo que se compara contra el umbral: `own` o `own - opponent` según el modo. */
  value: number;
  fires: boolean;
};

/**
 * La ÚNICA cuenta de "¿le toca el bonus ofensivo?". El motor de posiciones, la
 * vista previa de puntos y el Match Center pasan por acá: antes cada uno
 * repetía `metric >= threshold` y agregar un modo hubiera sido agregarlo en
 * cuatro lugares, con la garantía de olvidarse de uno.
 *
 * Sin dato no se inventa: si no hay tries cargados los dos lados cuentan cero
 * y el bonus no se cumple, igual que antes. En modo `difference` la diferencia
 * de cero contra cero es cero, así que tampoco.
 */
export function resolveOffensiveBonusOutcome(
  score: unknown,
  events: BonusMetricEvent[] | null | undefined,
  team: BonusMetricTeam,
  rule: NormalizedOffensiveBonusRule | null | undefined,
): OffensiveBonusOutcome {
  if (!rule) {
    return { own: 0, opponent: 0, value: 0, fires: false };
  }

  const own = countTeamOffensiveMetric(score, events, team, rule);
  const opponent = countTeamOffensiveMetric(score, events, team === 'home' ? 'away' : 'home', rule);
  const value = rule.mode === 'difference' ? own - opponent : own;

  return { own, opponent, value, fires: value >= rule.threshold };
}

export function countTeamEventMetric(
  score: unknown,
  events: BonusMetricEvent[] | null | undefined,
  team: BonusMetricTeam,
  rawEventType: string,
): number {
  const eventType = normalizeEventTypeToken(rawEventType);
  if (!eventType) return 0;

  if (eventType === 'try') {
    const scoreCounter = getTeamCounter(score, team, 'tries');
    if (scoreCounter !== null) {
      return scoreCounter;
    }
  }

  const eventTypes = new Set(getCandidateEventTypes(eventType));
  if (eventTypes.size === 0 || !Array.isArray(events)) {
    return 0;
  }

  const opponent: BonusMetricTeam = team === 'home' ? 'away' : 'home';

  return events.filter((event) => {
    const typeValue = normalizeEventTypeToken(event?.type);
    if (!typeValue || !eventTypes.has(typeValue)) return false;

    // El gol en contra suma para el rival del equipo al que se cargo.
    const creditedTeam = OPPONENT_CREDITED_EVENT_TYPES.has(typeValue) ? opponent : team;
    return event?.team === creditedTeam;
  }).length;
}

export function countTeamOffensiveMetric(
  score: unknown,
  events: BonusMetricEvent[] | null | undefined,
  team: BonusMetricTeam,
  rule: NormalizedOffensiveBonusRule | null | undefined,
): number {
  if (!rule) return 0;

  if (rule.metric === 'team_score') {
    return getTeamScore(score, team);
  }

  if (!rule.eventType) {
    return 0;
  }

  return countTeamEventMetric(score, events, team, rule.eventType);
}
