export type BonusMetricTeam = 'home' | 'away';

export type BonusMetricEvent = {
  type?: unknown;
  team?: unknown;
};

export type NormalizedOffensiveBonusRule = {
  threshold: number;
  points: number;
  metric: 'event_count' | 'team_score';
  eventType: string | null;
  label: string;
};

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

export function resolveOffensiveBonusRule(rawRule: unknown): NormalizedOffensiveBonusRule | null {
  if (rawRule === true) {
    return {
      threshold: 4,
      points: 1,
      metric: 'event_count',
      eventType: 'try',
      label: 'tries',
    };
  }

  if (!rawRule || typeof rawRule !== 'object') {
    return null;
  }

  const source = rawRule as Record<string, unknown>;
  const threshold = toFiniteNumber(
    source.threshold ?? source.tries ?? source.count ?? source.minimum ?? source.min,
  ) ?? 4;
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
  };
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
