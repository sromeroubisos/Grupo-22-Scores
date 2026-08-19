import type { LocalPlayerStatsRow } from './localMatchData';

export type PlayerMetricKind = 'number' | 'percent' | 'duration' | 'rating';
export type PlayerMetricSortDirection = 'desc' | 'asc';

/**
 * Con que carga viene una metrica cuando se la lee de un vistazo. Es el UNICO
 * lugar donde se declara: la ficha de una amarilla se pinta ambar porque la
 * metrica lo dice, no porque el componente sepa que existe el hockey.
 *
 * Un deporte que sume su propia tarjeta la declara aca y hereda el color; el
 * que no declare nada cae en 'neutral', que es lo correcto para una metrica
 * desconocida (`getPlayerMetricMeta` la arma sola desde la etiqueta cruda).
 */
export type PlayerMetricTone = 'neutral' | 'caution' | 'danger';

export type PlayerMetricMeta = {
  id: string;
  label: string;
  shortLabel: string;
  kind: PlayerMetricKind;
  tone?: PlayerMetricTone;
};

export type PlayerStatsTableRow = {
  key: string;
  playerId: string | null;
  name: string;
  team: 'home' | 'away' | null;
  teamName: string;
  number: number | null;
  position: string | null;
  rating: number | null;
  isCaptain: boolean;
  metrics: Record<string, number | string | null>;
};

export const PLAYER_METRIC_PRESETS: Record<string, PlayerMetricMeta> = {
  points: { id: 'points', label: 'Puntos', shortLabel: 'Pts', kind: 'number' },
  tries: { id: 'tries', label: 'Tries', shortLabel: 'Tries', kind: 'number' },
  assists: { id: 'assists', label: 'Asistencias', shortLabel: 'Ast', kind: 'number' },
  tackles: { id: 'tackles', label: 'Tackles', shortLabel: 'Tkl', kind: 'number' },
  minutes: { id: 'minutes', label: 'Tiempo jugado', shortLabel: 'Min', kind: 'duration' },
  matchesPlayed: { id: 'matchesPlayed', label: 'Partidos jugados', shortLabel: 'PJ', kind: 'number' },
  // El hockey es el unico deporte con verde, y sin esta entrada la tarjeta se
  // contaba a nivel equipo pero desaparecia en la tabla de jugadores.
  greenCards: { id: 'greenCards', label: 'Verdes', shortLabel: 'GC', kind: 'number', tone: 'caution' },
  yellowCards: { id: 'yellowCards', label: 'Amarillas', shortLabel: 'YC', kind: 'number', tone: 'caution' },
  redCards: { id: 'redCards', label: 'Rojas', shortLabel: 'RC', kind: 'number', tone: 'danger' },
  conversionsMade: { id: 'conversionsMade', label: 'Conversiones', shortLabel: 'Conv', kind: 'number' },
  conversionAttempts: { id: 'conversionAttempts', label: 'Intentos de conversion', shortLabel: 'Int.', kind: 'number' },
  conversionRate: { id: 'conversionRate', label: 'Tasa de conversion', shortLabel: 'Conv %', kind: 'percent' },
  penalties: { id: 'penalties', label: 'Penales', shortLabel: 'Pen', kind: 'number' },
  dropGoals: { id: 'dropGoals', label: 'Drop goals', shortLabel: 'Drop', kind: 'number' },
  goals: { id: 'goals', label: 'Goles', shortLabel: 'Gol', kind: 'number' },
  rating: { id: 'rating', label: 'Rating', shortLabel: 'Rat', kind: 'rating' },
  events: { id: 'events', label: 'Intervenciones', shortLabel: 'Ev', kind: 'number' },
};

const PLAYER_METRIC_ALIASES: Array<[RegExp, string]> = [
  [/^(pts?|points?|puntos?)$/, 'points'],
  [/^(tries?|ensayos?)$/, 'tries'],
  [/^(assists?|asistencias?)$/, 'assists'],
  [/^(tackles?|placajes?)$/, 'tackles'],
  [/^(minutes?|mins?|minutes_played|played_minutes|time_played|time_on_field|tiempo|tiempo_jugado)$/, 'minutes'],
  [/^(matches_played|games_played|played|partidos_jugados|pj)$/, 'matchesPlayed'],
  [/^(green_cards?|greencards?|tarjetas?_verdes?|verdes?|gc)$/, 'greenCards'],
  [/^(yellow_cards?|yellowcards?|tarjetas?_amarillas?|amarillas?|yc)$/, 'yellowCards'],
  [/^(red_cards?|redcards?|tarjetas?_rojas?|rojas?|rc)$/, 'redCards'],
  [/^(conversions?|successful_conversions|conversions_made|conversiones?)$/, 'conversionsMade'],
  [/^(conversion_attempts|conversions_attempted|intentos_de_conversion)$/, 'conversionAttempts'],
  [/^(conversion_rate|conversion_pct|conversion_percentage|tasa_de_conversion|porcentaje_de_conversion)$/, 'conversionRate'],
  [/^(penalties?|penalty_goals?|penales?)$/, 'penalties'],
  [/^(drop_goals?|dropgoals?)$/, 'dropGoals'],
  [/^(goals?|goles?)$/, 'goals'],
  [/^(rating|player_rating|puntaje|calificacion)$/, 'rating'],
  [/^(events?|intervenciones?)$/, 'events'],
];

function normalizeComparableTeamValue(value: unknown) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function readTextValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

export function parseNumericStat(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const normalized = value.replace(',', '.').trim();
    if (!normalized) return null;
    const match = normalized.match(/-?\d+(\.\d+)?/);
    if (!match) return null;
    const parsed = Number(match[0]);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function readRecordValue(value: unknown) {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : null;
}

function normalizePlayerMetricKey(value: unknown) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[%().]/g, '')
    .replace(/[^\w\s-]/g, ' ')
    .replace(/[\s/-]+/g, '_')
    .replace(/^_+|_+$/g, '');

  if (!normalized) return null;

  for (const [pattern, metricId] of PLAYER_METRIC_ALIASES) {
    if (pattern.test(normalized)) return metricId;
  }

  return normalized;
}

function formatMetricLabel(value: string | null | undefined) {
  if (typeof value !== 'string' || value.length === 0) return '—';
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function getPlayerMetricMeta(metricId: string | null | undefined, fallbackLabel?: string | null): PlayerMetricMeta {
  const safeId = typeof metricId === 'string' ? metricId : '';
  const preset = safeId ? PLAYER_METRIC_PRESETS[safeId] : undefined;
  if (preset) return preset;

  const label = fallbackLabel?.trim() || formatMetricLabel(safeId);
  return {
    id: safeId,
    label,
    shortLabel: label,
    kind: label.includes('%') ? 'percent' : 'number',
  };
}

export function formatPlayerMetricValue(metricId: string | null | undefined, value: number | string | null | undefined, fallbackLabel?: string | null) {
  if (value == null || value === '') return '—';

  const meta = getPlayerMetricMeta(metricId, fallbackLabel);
  const numericValue = parseNumericStat(value);

  if (numericValue == null) {
    return String(value);
  }

  if (meta.kind === 'percent') {
    const fixed = Number.isInteger(numericValue) ? numericValue.toFixed(0) : numericValue.toFixed(1);
    return `${fixed}%`;
  }

  if (meta.kind === 'duration') {
    return `${Math.round(numericValue)} min`;
  }

  if (meta.kind === 'rating') {
    return numericValue.toFixed(1);
  }

  return Number.isInteger(numericValue) ? numericValue.toString() : numericValue.toFixed(1);
}

function resolvePlayerSideFromTeamName(teamName: string, homeName: string, awayName: string) {
  const normalizedTeamName = normalizeComparableTeamValue(teamName);
  if (!normalizedTeamName) return null;
  if (normalizedTeamName === normalizeComparableTeamValue(homeName)) return 'home';
  if (normalizedTeamName === normalizeComparableTeamValue(awayName)) return 'away';
  return null;
}

export function chooseDefaultPlayerMetrics(metricIds: string[]) {
  const preferred = [
    'points',
    'goals',
    'conversionRate',
    'minutes',
    'tries',
    'assists',
    'rating',
    'tackles',
    'conversionsMade',
    'greenCards',
    'yellowCards',
    'redCards',
    'events',
    'matchesPlayed',
  ];

  const selected: string[] = [];

  preferred.forEach((metricId) => {
    if (metricIds.includes(metricId) && !selected.includes(metricId) && selected.length < 3) {
      selected.push(metricId);
    }
  });

  metricIds.forEach((metricId) => {
    if (!selected.includes(metricId) && selected.length < 3) {
      selected.push(metricId);
    }
  });

  return selected;
}

export function buildPlayerStatsTableData(args: {
  localPlayerRows: LocalPlayerStatsRow[];
  playerStats: any;
  homeName: string;
  awayName: string;
}) {
  const rows = new Map<string, PlayerStatsTableRow>();
  const metricLabels = new Map<string, string>();

  const registerMetric = (metricId: string, label?: string | null) => {
    if (!metricLabels.has(metricId)) {
      metricLabels.set(metricId, label?.trim() || getPlayerMetricMeta(metricId, label).label);
    }
  };

  const ensureRow = (input: {
    playerId?: string | null;
    name?: string | null;
    team?: 'home' | 'away' | null;
    teamName?: string | null;
    number?: number | null;
    position?: string | null;
    rating?: number | null;
    isCaptain?: boolean;
  }) => {
    const playerName = readTextValue(input.name);
    const teamName = readTextValue(input.teamName) || (input.team === 'home' ? args.homeName : input.team === 'away' ? args.awayName : '');
    const normalizedName = normalizeComparableTeamValue(playerName || teamName);
    const playerId = readTextValue(input.playerId) || null;
    const team = input.team || resolvePlayerSideFromTeamName(teamName, args.homeName, args.awayName);
    const key = playerId || `${team || 'neutral'}:${normalizedName}`;

    if (!playerName && !playerId) return null;

    if (!rows.has(key)) {
      rows.set(key, {
        key,
        playerId,
        name: playerName || 'Jugador',
        team,
        teamName: teamName || (team === 'home' ? args.homeName : team === 'away' ? args.awayName : 'Equipo'),
        number: input.number ?? null,
        position: input.position ?? null,
        rating: typeof input.rating === 'number' ? input.rating : null,
        isCaptain: Boolean(input.isCaptain),
        metrics: {},
      });
    }

    const row = rows.get(key)!;
    if (!row.playerId && playerId) row.playerId = playerId;
    if (playerName && row.name === 'Jugador') row.name = playerName;
    if (!row.team && team) row.team = team;
    if ((!row.teamName || row.teamName === 'Equipo') && teamName) row.teamName = teamName;
    if (row.number == null && input.number != null) row.number = input.number;
    if (!row.position && input.position) row.position = input.position;
    if (row.rating == null && typeof input.rating === 'number') row.rating = input.rating;
    if (input.isCaptain) row.isCaptain = true;
    return row;
  };

  const setMetric = (row: PlayerStatsTableRow | null, metricId: string | null, rawValue: unknown, label?: string | null) => {
    if (!row || !metricId) return;
    const numericValue = parseNumericStat(rawValue);
    const normalizedValue = numericValue ?? (typeof rawValue === 'string' ? rawValue.trim() : null);
    if (normalizedValue == null || normalizedValue === '') return;

    row.metrics[metricId] = normalizedValue;
    registerMetric(metricId, label);

    if (metricId === 'rating' && numericValue != null && row.rating == null) {
      row.rating = numericValue;
    }
  };

  args.localPlayerRows.forEach((player) => {
    const row = ensureRow({
      playerId: player.playerId,
      name: player.name,
      team: player.team,
      teamName: player.teamName,
      number: player.number,
      position: player.position,
      rating: player.rating,
      isCaptain: player.isCaptain,
    });

    setMetric(row, 'points', player.points, 'Puntos');
    setMetric(row, 'tries', player.tries, 'Tries');
    setMetric(row, 'tackles', player.tackles, 'Tackles');
    // Solo si hubo. `setMetric` acepta el 0, asi que sin esta guarda una
    // planilla de rugby estrenaba columnas "Goles" y "Verdes" siempre vacias.
    if (player.goals > 0) setMetric(row, 'goals', player.goals, 'Goles');
    if (player.penaltyGoals > 0) setMetric(row, 'penalties', player.penaltyGoals, 'De penal');
    if (player.greenCards > 0) setMetric(row, 'greenCards', player.greenCards, 'Verdes');
    setMetric(row, 'yellowCards', player.yellowCards, 'Amarillas');
    setMetric(row, 'redCards', player.redCards, 'Rojas');
    setMetric(row, 'events', player.events, 'Intervenciones');
    setMetric(row, 'matchesPlayed', player.matchesPlayed, 'Partidos jugados');
    if (typeof player.rating === 'number') {
      setMetric(row, 'rating', player.rating, 'Rating');
    }
  });

  const playerArray = Array.isArray(args.playerStats?.players) ? args.playerStats.players : [];
  playerArray.forEach((entry: any, index: number) => {
    const source = readRecordValue(entry) || {};
    const statsRecord = readRecordValue(source.stats);
    const teamRecord = readRecordValue(source.team);
    const teamName =
      readTextValue(source.team_name) ||
      readTextValue(source.teamName) ||
      readTextValue(teamRecord?.name);
    const row = ensureRow({
      playerId: readTextValue(source.player_id) || readTextValue(source.id) || readTextValue(source.playerId) || null,
      name: readTextValue(source.player_name) || readTextValue(source.name) || `Jugador ${index + 1}`,
      team: resolvePlayerSideFromTeamName(teamName, args.homeName, args.awayName),
      teamName,
      number: parseNumericStat(source.number ?? source.player_number ?? source.shirt_number),
      position: readTextValue(source.position) || readTextValue(source.player_position) || null,
      rating: parseNumericStat(source.rating ?? source.player_rating),
      isCaptain: Boolean(source.is_captain || source.captain || source.isCaptain),
    });

    [
      ['points', source.points ?? statsRecord?.points],
      ['tries', source.tries ?? statsRecord?.tries],
      ['assists', source.assists ?? statsRecord?.assists],
      ['tackles', source.tackles ?? statsRecord?.tackles],
      ['minutes', source.minutes ?? source.minutes_played ?? source.time_played ?? source.played_minutes ?? statsRecord?.minutes ?? statsRecord?.minutes_played ?? statsRecord?.time_played ?? statsRecord?.played_minutes],
      ['matchesPlayed', source.played ?? source.matches_played ?? source.games_played ?? statsRecord?.played ?? statsRecord?.matches_played ?? statsRecord?.games_played],
      ['greenCards', source.green_cards ?? source.greenCards ?? source.gc ?? statsRecord?.green_cards ?? statsRecord?.greenCards ?? statsRecord?.gc],
      ['yellowCards', source.yellow_cards ?? source.yellowCards ?? source.yc ?? statsRecord?.yellow_cards ?? statsRecord?.yellowCards ?? statsRecord?.yc],
      ['redCards', source.red_cards ?? source.redCards ?? source.rc ?? statsRecord?.red_cards ?? statsRecord?.redCards ?? statsRecord?.rc],
      ['conversionsMade', source.conversions ?? source.conversions_made ?? source.successful_conversions ?? statsRecord?.conversions ?? statsRecord?.conversions_made ?? statsRecord?.successful_conversions],
      ['conversionAttempts', source.conversion_attempts ?? source.conversions_attempted ?? statsRecord?.conversion_attempts ?? statsRecord?.conversions_attempted],
      ['conversionRate', source.conversion_rate ?? source.conversion_pct ?? source.conversion_percentage ?? statsRecord?.conversion_rate ?? statsRecord?.conversion_pct ?? statsRecord?.conversion_percentage],
      ['penalties', source.penalties ?? source.penalty_goals ?? statsRecord?.penalties ?? statsRecord?.penalty_goals],
      ['dropGoals', source.drop_goals ?? source.dropGoals ?? statsRecord?.drop_goals ?? statsRecord?.dropGoals],
      ['goals', source.goals ?? statsRecord?.goals],
      ['rating', source.rating ?? source.player_rating ?? statsRecord?.rating ?? statsRecord?.player_rating],
    ].forEach(([metricId, value]) => {
      setMetric(row, String(metricId), value);
    });
  });

  const statGroups = Array.isArray(args.playerStats?.stat_groups) ? args.playerStats.stat_groups : [];
  statGroups.forEach((group: any) => {
    const groupRecord = readRecordValue(group) || {};
    const stats = Array.isArray(groupRecord.stats) ? groupRecord.stats : [];

    stats.forEach((entry: any) => {
      const statRecord = readRecordValue(entry) || {};
      const metricLabel = readTextValue(statRecord.name) || readTextValue(groupRecord.group_name) || 'Metric';
      const metricId = normalizePlayerMetricKey(metricLabel);
      if (!metricId) return;

      ([
        ['home', readRecordValue(statRecord.home_team)],
        ['away', readRecordValue(statRecord.away_team)],
      ] as const).forEach(([teamSide, teamRecord]) => {
        if (!teamRecord) return;

        const row = ensureRow({
          playerId: readTextValue(teamRecord.player_id) || readTextValue(teamRecord.id) || readTextValue(teamRecord.playerId) || null,
          name: readTextValue(teamRecord.player_name) || readTextValue(teamRecord.name) || 'Jugador',
          team: teamSide,
          teamName: teamSide === 'home' ? args.homeName : args.awayName,
        });

        setMetric(row, metricId, teamRecord.value ?? teamRecord.stat_value ?? teamRecord.stat, metricLabel);
      });
    });
  });

  rows.forEach((row) => {
    const conversionsMade = parseNumericStat(row.metrics.conversionsMade);
    const conversionAttempts = parseNumericStat(row.metrics.conversionAttempts);
    if (row.metrics.conversionRate == null && conversionsMade != null && conversionAttempts != null && conversionAttempts > 0) {
      row.metrics.conversionRate = Number(((conversionsMade / conversionAttempts) * 100).toFixed(1));
      registerMetric('conversionRate', 'Tasa de conversion');
    }

    if (row.metrics.rating == null && typeof row.rating === 'number') {
      row.metrics.rating = row.rating;
      registerMetric('rating', 'Rating');
    }
  });

  const metricIds = Array.from(metricLabels.keys()).sort((left, right) => {
    const leftIndex = Object.keys(PLAYER_METRIC_PRESETS).indexOf(left);
    const rightIndex = Object.keys(PLAYER_METRIC_PRESETS).indexOf(right);
    if (leftIndex === -1 && rightIndex === -1) return left.localeCompare(right);
    if (leftIndex === -1) return 1;
    if (rightIndex === -1) return -1;
    return leftIndex - rightIndex;
  });

  const resolvedRows = Array.from(rows.values()).filter((row) => Object.keys(row.metrics).length > 0);

  return {
    rows: resolvedRows,
    metricIds,
    metricLabels: Object.fromEntries(metricLabels),
  };
}

export function comparePlayerMetricValues(
  left: PlayerStatsTableRow,
  right: PlayerStatsTableRow,
  metricSorts: Array<{ metricId: string; direction: PlayerMetricSortDirection }>,
  primarySortIndex: number,
) {
  const prioritizedSorts = metricSorts.length === 0
    ? []
    : [
        metricSorts[Math.max(0, Math.min(primarySortIndex, metricSorts.length - 1))],
        ...metricSorts.filter((_, index) => index !== Math.max(0, Math.min(primarySortIndex, metricSorts.length - 1))),
      ];

  for (const metricSort of prioritizedSorts) {
    const { metricId, direction } = metricSort;
    const leftValue = parseNumericStat(left.metrics[metricId]) ?? Number.NEGATIVE_INFINITY;
    const rightValue = parseNumericStat(right.metrics[metricId]) ?? Number.NEGATIVE_INFINITY;
    if (rightValue !== leftValue) {
      return direction === 'asc'
        ? leftValue - rightValue
        : rightValue - leftValue;
    }
  }

  const leftRating = typeof left.rating === 'number' ? left.rating : Number.NEGATIVE_INFINITY;
  const rightRating = typeof right.rating === 'number' ? right.rating : Number.NEGATIVE_INFINITY;
  if (rightRating !== leftRating) return rightRating - leftRating;

  return left.name.localeCompare(right.name, 'es');
}
