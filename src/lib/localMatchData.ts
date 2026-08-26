import {
  buildMatchEventDefinitionMap,
  getDefaultMatchEventDefinitions,
  normalizeSportBucket,
  type MatchEventCategory,
} from './matchEventCatalog';
import { goalKickOutcomeSuffixSpanish, parseSubstitutionIncomingPlayer } from './matchEventStats';
import { getEventPeriodForType, getNextActivePeriodAfterEvent, normalizeMatchPeriod } from './matchPeriods';

export type LocalMatchTeam = 'home' | 'away';

export type LocalLineupPlayer = {
  id?: string | null;
  number?: number | null;
  name?: string | null;
  position?: string | null;
  role?: string | null;
  rating?: number | null;
  isCaptain?: boolean | null;
};

export type LocalMatchEvent = {
  id?: string | null;
  minute?: number | null;
  type?: string | null;
  team?: LocalMatchTeam | null;
  playerId?: string | null;
  playerName?: string | null;
  secondaryPlayerId?: string | null;
  secondaryPlayerName?: string | null;
  subPlayerId?: string | null;
  subPlayer?: string | null;
  detail?: string | null;
  period?: string | null;
  order?: number | null;
};

export type LocalPublicEvent = {
  id: string;
  time: number;
  minute: number;
  type: string;
  team: LocalMatchTeam | null;
  player: string;
  playerId: string | null;
  subPlayer: string | null;
  subPlayerId: string | null;
  description: string;
  period: string;
  order: number;
};

export type LocalPlayerStatsRow = {
  key: string;
  playerId: string | null;
  name: string;
  team: LocalMatchTeam;
  teamName: string;
  number: number | null;
  position: string | null;
  rating: number | null;
  isCaptain: boolean;
  matchesPlayed: number;
  points: number;
  tries: number;
  tackles: number;
  /** Hockey / futbol: goles convertidos, incluidos los de penal. */
  goals: number;
  /** Subconjunto de `goals`: los que salieron de un penal. */
  penaltyGoals: number;
  /** Solo hockey. Se contaba a nivel equipo y se perdia en la tabla de jugadores. */
  greenCards: number;
  yellowCards: number;
  redCards: number;
  events: number;
};

function text(value: unknown) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function key(value: unknown) {
  return text(value).toLowerCase();
}

function lineupRating(value: unknown) {
  const parsed =
    typeof value === 'number' && Number.isFinite(value)
      ? value
      : typeof value === 'string'
        ? Number(value.replace(',', '.'))
        : Number.NaN;

  if (!Number.isFinite(parsed)) return null;
  const clamped = Math.min(10, Math.max(0, parsed));
  return Math.round(clamped * 10) / 10;
}

function toLineupPlayers(raw: unknown) {
  const players = Array.isArray(raw) ? raw : [];
  return players.map((entry, index) => {
    const source = entry && typeof entry === 'object' ? (entry as Record<string, unknown>) : {};
    const number =
      typeof source.number === 'number' && Number.isFinite(source.number)
        ? Number(source.number)
        : typeof source.jerseyNumber === 'number' && Number.isFinite(source.jerseyNumber)
          ? Number(source.jerseyNumber)
          : index + 1;

    return {
      id: text(source.id) || text(source.playerId) || null,
      number,
      name: text(source.name) || text(source.playerName) || '',
      position: text(source.position) || null,
      role: text(source.role) || null,
      rating: lineupRating(source.rating ?? source.playerRating),
      isCaptain: Boolean(source.isCaptain),
    } satisfies LocalLineupPlayer;
  });
}

export function normalizeLocalLineups(raw: unknown) {
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    home: toLineupPlayers(source.home),
    away: toLineupPlayers(source.away),
  };
}

export function normalizeLocalEvents(raw: unknown, sportId?: string | null): LocalPublicEvent[] {
  const events = Array.isArray(raw) ? raw : [];
  // Sin el deporte la secuencia cae al default de dos tiempos: es lo correcto
  // para rugby y futbol, y lo que hacian todos los llamadores hasta ahora.
  let activePeriod = normalizeMatchPeriod(null);

  return events.map((entry, index) => {
    const source = entry && typeof entry === 'object' ? (entry as Record<string, unknown>) : {};
    const minute =
      typeof source.minute === 'number' && Number.isFinite(source.minute)
        ? Number(source.minute)
        : Number(source.minute || 0);

    const type = text(source.type) || 'note';
    const rawOrder = source.order === null || source.order === undefined || source.order === ''
      ? Number.NaN
      : Number(source.order);
    const period = text(source.period)
      ? normalizeMatchPeriod(source.period)
      : getEventPeriodForType(type, activePeriod, sportId);
    const rawDescription = text(source.detail) || text(source.description);
    const subPlayer =
      text(source.secondaryPlayerName) ||
      text(source.secondary_player_name) ||
      text(source.subPlayer) ||
      text(source.sub_player) ||
      (type === 'substitution' ? parseSubstitutionIncomingPlayer(rawDescription) : '') ||
      null;
    const description = rawDescription || (type === 'substitution' && subPlayer ? `Entra: ${subPlayer}` : '');
    const team: LocalMatchTeam | null = source.team === 'home' || source.team === 'away' ? source.team : null;

    const normalizedEvent = {
      id: text(source.id) || `local-event-${index}`,
      time: Number.isFinite(minute) ? minute : 0,
      minute: Number.isFinite(minute) ? minute : 0,
      type,
      team,
      player: text(source.playerName) || text(source.player_name) || 'Jugador',
      playerId: text(source.playerId) || text(source.player_id) || null,
      subPlayer,
      subPlayerId:
        text(source.secondaryPlayerId) ||
        text(source.secondary_player_id) ||
        text(source.subPlayerId) ||
        text(source.sub_player_id) ||
        null,
      description,
      period,
      order: Number.isFinite(rawOrder) ? Math.max(0, Math.trunc(rawOrder)) : index,
    };
    activePeriod = getNextActivePeriodAfterEvent(type, period, sportId);
    return normalizedEvent;
  });
}

/** Texto del tipo de evento en vistas públicas; añade acertada/fallada en tiros a palos cuando el detalle lo permite. */
export function publicEventTypeDisplay(evt: Pick<LocalPublicEvent, 'type' | 'description'>): string {
  const rawType = text(evt.type) || 'note';
  const label = rawType.toLowerCase();
  return `${label}${goalKickOutcomeSuffixSpanish(rawType, evt.description)}`;
}

function getEventPoints(type: string) {
  switch (type) {
    case 'try': return 5;
    case 'conversion': return 2;
    case 'penalty_goal':
    case 'penalty':
    case 'drop_goal':
    case 'field_goal':
    case 'three_pointer':
      return 3;
    case 'two_pointer':
    case 'two_point_conversion':
    case 'safety':
      return 2;
    case 'goal':
    case 'own_goal':
    case 'free_throw':
    case 'point':
    case 'ace':
    case 'extra_point':
    case 'touchdown':
    case 'run':
    case 'home_run':
      return 1;
    default:
      return 0;
  }
}

export function buildLocalPlayerStatsRows(args: {
  lineups: ReturnType<typeof normalizeLocalLineups>;
  events: LocalPublicEvent[];
  homeName: string;
  awayName: string;
  sportId?: string | null;
}) {
  const map = new Map<string, LocalPlayerStatsRow>();

  // Que cuenta como GOL se decide por el deporte y por la definicion, nunca
  // por el nombre del tipo:
  //
  //  - Solo los deportes cuya unidad de anotacion ES el gol tienen la cuenta.
  //    Sin esta guarda un TRY entraba como gol: en rugby tambien es
  //    `category: 'score'` y tampoco es `kickAtGoal`.
  //  - `penalty_goal` es el gol de penal en hockey y futbol, pero en rugby es
  //    el penal A LOS PALOS, que se puede errar. Es la misma trampa que
  //    documenta `kickAtGoal` en matchEventCatalog.
  //  - El gol en contra no se le acredita al que lo hizo (`creditsOpponent`).
  const bucket = normalizeSportBucket(args.sportId);
  const sportScoresInGoals = bucket === 'hockey' || bucket === 'football' || bucket === 'handball';
  const definitionMap = buildMatchEventDefinitionMap(getDefaultMatchEventDefinitions(args.sportId));
  const countsAsGoal = (type: string) => {
    if (!sportScoresInGoals) return false;
    const definition = definitionMap[type];
    if (!definition || definition.category !== 'score') return false;
    return !definition.kickAtGoal && !definition.creditsOpponent;
  };

  const ensureRow = (
    team: LocalMatchTeam,
    teamName: string,
    playerName: string,
    playerId: string | null,
    meta?: Partial<LocalPlayerStatsRow>,
  ) => {
    const normalizedName = key(playerName);
    if (!normalizedName) return null;

    const rowKey = playerId || `${team}:${normalizedName}`;
    if (!map.has(rowKey)) {
      map.set(rowKey, {
        key: rowKey,
        playerId,
        name: playerName,
        team,
        teamName,
        number: meta?.number ?? null,
        position: meta?.position ?? null,
        rating: typeof meta?.rating === 'number' ? meta.rating : null,
        isCaptain: Boolean(meta?.isCaptain),
        matchesPlayed: 1,
        points: 0,
        tries: 0,
        tackles: 0,
        goals: 0,
        penaltyGoals: 0,
        greenCards: 0,
        yellowCards: 0,
        redCards: 0,
        events: 0,
      });
    }

    const current = map.get(rowKey)!;
    if (!current.playerId && playerId) current.playerId = playerId;
    if ((!current.position || current.position === '—') && meta?.position) current.position = meta.position;
    if (current.number == null && meta?.number != null) current.number = meta.number;
    if (current.rating == null && typeof meta?.rating === 'number') current.rating = meta.rating;
    if (meta?.isCaptain) current.isCaptain = true;
    return current;
  };

  args.lineups.home.forEach((player) => {
    const name = text(player.name);
    if (!name) return;
    ensureRow('home', args.homeName, name, text(player.id) || null, {
      number: typeof player.number === 'number' ? player.number : null,
      position: text(player.position) || null,
      rating: typeof player.rating === 'number' ? player.rating : null,
      isCaptain: Boolean(player.isCaptain),
    });
  });

  args.lineups.away.forEach((player) => {
    const name = text(player.name);
    if (!name) return;
    ensureRow('away', args.awayName, name, text(player.id) || null, {
      number: typeof player.number === 'number' ? player.number : null,
      position: text(player.position) || null,
      rating: typeof player.rating === 'number' ? player.rating : null,
      isCaptain: Boolean(player.isCaptain),
    });
  });

  args.events.forEach((event) => {
    if (!event.team) return;
    const playerName = text(event.player);
    if (!playerName) return;

    const row = ensureRow(
      event.team,
      event.team === 'home' ? args.homeName : args.awayName,
      playerName,
      text(event.playerId) || null,
    );

    if (!row) return;

    row.events += 1;
    row.points += getEventPoints(event.type);
    if (event.type === 'try') row.tries += 1;
    if (event.type === 'tackle') row.tackles += 1;
    // El gol de penal es un gol: entra en las dos cuentas, igual que en las
    // estadisticas de equipo (`penaltyGoals` es un subconjunto de los goles).
    if (countsAsGoal(event.type)) {
      row.goals += 1;
      if (event.type === 'penalty_goal') row.penaltyGoals += 1;
    }
    if (event.type === 'green_card') row.greenCards += 1;
    if (event.type === 'yellow_card' || event.type === 'card_yellow') row.yellowCards += 1;
    if (event.type === 'red_card' || event.type === 'card_red') row.redCards += 1;
  });

  return Array.from(map.values()).sort((a, b) =>
    b.points - a.points ||
    b.tries - a.tries ||
    b.events - a.events ||
    a.name.localeCompare(b.name, 'es'),
  );
}

const STAT_VISIBLE_CATEGORIES: ReadonlyArray<MatchEventCategory> = [
  'score',
  'card',
  'discipline',
  'substitution',
];

const STAT_CATEGORY_ORDER: Record<MatchEventCategory, number> = {
  score: 0,
  card: 1,
  discipline: 2,
  substitution: 3,
  other: 4,
  // La definicion por shoot-out va despues de todo, porque pasa despues del
  // partido. No entra en STAT_VISIBLE_CATEGORIES: no es estadistica del juego.
  shootout: 5,
  clock: 5,
};

const STAT_LABEL_OVERRIDES: Record<string, string> = {
  try: 'Tries',
  penalty_try: 'Penalty tries',
  conversion: 'Conversiones',
  penalty: 'Penales',
  penalty_goal: 'Penales a los palos',
  drop_goal: 'Drops',
  goal: 'Goles',
  own_goal: 'Goles en contra',
  free_throw: 'Tiros libres',
  two_pointer: 'Dobles',
  three_pointer: 'Triples',
  point: 'Puntos',
  ace: 'Aces',
  block_point: 'Bloqueos ganadores',
  touchdown: 'Touchdowns',
  field_goal: 'Field goals',
  extra_point: 'Puntos extra',
  two_point_conversion: 'Conversiones de 2',
  safety: 'Safeties',
  run: 'Carreras',
  home_run: 'Home runs',
  seven_meter_goal: 'Goles de 7m',
  card_yellow: 'Tarjetas amarillas',
  card_red: 'Tarjetas rojas',
  yellow_card: 'Tarjetas amarillas',
  red_card: 'Tarjetas rojas',
  green_card: 'Tarjetas verdes',
  penalty_corner: 'Corners cortos',
  penalty_stroke: 'Penales',
  foul: 'Faltas',
  free_hit: 'Free hits',
  assist: 'Asistencias',
  shot_on_goal: 'Tiros al arco',
  shot_off_target: 'Tiros desviados',
  circle_entry: 'Ingresos al circulo',
  interception: 'Intercepciones',
  block: 'Bloqueos',
  save: 'Atajadas',
  clearance: 'Despejes',
  shootout_scored: 'Shoot-outs convertidos',
  shootout_missed: 'Shoot-outs fallados',
  knock_on: 'Knock-ons',
  forward_pass: 'Pases forward',
  penalty_committed: 'Penales cometidos',
  free_kick: 'Free kicks',
  handling_error: 'Errores de manejo',
  turnover_lost: 'Turnovers perdidos',
  two_min_suspension: 'Suspensiones 2 min',
  substitution: 'Cambios',
};

export function buildLocalTeamStats(events: LocalPublicEvent[], sportId?: string | null) {
  const definitions = getDefaultMatchEventDefinitions(sportId).filter((definition) =>
    STAT_VISIBLE_CATEGORIES.includes(definition.category),
  );

  const ordered = definitions
    .map((definition, index) => ({ definition, index }))
    .sort((a, b) => {
      const orderDiff = STAT_CATEGORY_ORDER[a.definition.category] - STAT_CATEGORY_ORDER[b.definition.category];
      if (orderDiff !== 0) return orderDiff;
      return a.index - b.index;
    })
    .map((entry) => entry.definition);

  // Una sola pasada sobre los eventos en vez de dos filtros por definicion
  // (eran ~30 recorridos completos en rugby). El conteo se arma primero y las
  // definiciones solo lo leen, asi que las filas en cero se siguen mostrando.
  const counts = new Map<string, { home: number; away: number }>();
  for (const event of events) {
    if (event.team !== 'home' && event.team !== 'away') continue;
    let entry = counts.get(event.type);
    if (!entry) {
      entry = { home: 0, away: 0 };
      counts.set(event.type, entry);
    }
    entry[event.team] += 1;
  }

  return ordered.map((definition) => {
    const entry = counts.get(definition.type);
    return {
      label: STAT_LABEL_OVERRIDES[definition.type] || definition.label,
      home: entry?.home ?? 0,
      away: entry?.away ?? 0,
    };
  });
}
