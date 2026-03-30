export type LocalMatchTeam = 'home' | 'away';

export type LocalLineupPlayer = {
  id?: string | null;
  number?: number | null;
  name?: string | null;
  position?: string | null;
  role?: string | null;
  isCaptain?: boolean | null;
};

export type LocalMatchEvent = {
  id?: string | null;
  minute?: number | null;
  type?: string | null;
  team?: LocalMatchTeam | null;
  playerId?: string | null;
  playerName?: string | null;
  detail?: string | null;
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
};

export type LocalPlayerStatsRow = {
  key: string;
  playerId: string | null;
  name: string;
  team: LocalMatchTeam;
  teamName: string;
  number: number | null;
  position: string | null;
  isCaptain: boolean;
  matchesPlayed: number;
  points: number;
  tries: number;
  tackles: number;
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

export function normalizeLocalEvents(raw: unknown): LocalPublicEvent[] {
  const events = Array.isArray(raw) ? raw : [];
  return events.map((entry, index) => {
    const source = entry && typeof entry === 'object' ? (entry as Record<string, unknown>) : {};
    const minute =
      typeof source.minute === 'number' && Number.isFinite(source.minute)
        ? Number(source.minute)
        : Number(source.minute || 0);

    return {
      id: text(source.id) || `local-event-${index}`,
      time: Number.isFinite(minute) ? minute : 0,
      minute: Number.isFinite(minute) ? minute : 0,
      type: text(source.type) || 'note',
      team: source.team === 'home' || source.team === 'away' ? source.team : null,
      player: text(source.playerName) || text(source.player_name) || 'Jugador',
      playerId: text(source.playerId) || text(source.player_id) || null,
      subPlayer: null,
      subPlayerId: null,
      description: text(source.detail) || text(source.description),
    };
  });
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
}) {
  const map = new Map<string, LocalPlayerStatsRow>();

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
        isCaptain: Boolean(meta?.isCaptain),
        matchesPlayed: 1,
        points: 0,
        tries: 0,
        tackles: 0,
        yellowCards: 0,
        redCards: 0,
        events: 0,
      });
    }

    const current = map.get(rowKey)!;
    if (!current.playerId && playerId) current.playerId = playerId;
    if ((!current.position || current.position === '—') && meta?.position) current.position = meta.position;
    if (current.number == null && meta?.number != null) current.number = meta.number;
    if (meta?.isCaptain) current.isCaptain = true;
    return current;
  };

  args.lineups.home.forEach((player) => {
    const name = text(player.name);
    if (!name) return;
    ensureRow('home', args.homeName, name, text(player.id) || null, {
      number: typeof player.number === 'number' ? player.number : null,
      position: text(player.position) || null,
      isCaptain: Boolean(player.isCaptain),
    });
  });

  args.lineups.away.forEach((player) => {
    const name = text(player.name);
    if (!name) return;
    ensureRow('away', args.awayName, name, text(player.id) || null, {
      number: typeof player.number === 'number' ? player.number : null,
      position: text(player.position) || null,
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
    if (event.type === 'yellow_card') row.yellowCards += 1;
    if (event.type === 'red_card') row.redCards += 1;
  });

  return Array.from(map.values()).sort((a, b) =>
    b.points - a.points ||
    b.tries - a.tries ||
    b.events - a.events ||
    a.name.localeCompare(b.name, 'es'),
  );
}

export function buildLocalTeamStats(events: LocalPublicEvent[]) {
  const trackedTypes = [
    { type: 'try', label: 'Tries' },
    { type: 'goal', label: 'Goles' },
    { type: 'conversion', label: 'Conversiones' },
    { type: 'penalty_goal', label: 'Penales' },
    { type: 'drop_goal', label: 'Drop goals' },
    { type: 'yellow_card', label: 'Tarjetas amarillas' },
    { type: 'red_card', label: 'Tarjetas rojas' },
    { type: 'substitution', label: 'Cambios' },
  ];

  return trackedTypes
    .map((definition) => ({
      label: definition.label,
      home: events.filter((event) => event.team === 'home' && event.type === definition.type).length,
      away: events.filter((event) => event.team === 'away' && event.type === definition.type).length,
    }))
    .filter((row) => row.home > 0 || row.away > 0);
}
