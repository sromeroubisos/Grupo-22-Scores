import {
  applyExternalTournamentOverride,
  getExternalTournamentOverride,
} from '@/lib/server/externalTournamentOverrides';
import {
  DEFAULT_MATCH_POINTS_RULES,
  resolveMatchPointsRules,
} from '@/lib/standings/matchPointsPreview';
import { parseSubstitutionIncomingPlayer } from '@/lib/matchEventStats';
import { isMissingColumnError, isMissingTableError } from '@/lib/utils/supabaseSchema';
import { isUuid } from '@/lib/utils/postgrest';
import { buildTeamLogoProxyUrl } from '@/lib/utils/logoUrl';

type SupabaseLike = {
  from: (table: string) => any;
};

type SupabaseLikeError = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
} | null | undefined;

type MatchContextRow = {
  id: string;
  season_id?: string | null;
  category?: string | null;
  date_time?: string | null;
  events?: unknown;
  lineups?: unknown;
  home_club_id?: string | null;
  away_club_id?: string | null;
  home_team_id?: string | null;
  away_team_id?: string | null;
  home_division_id?: string | null;
  away_division_id?: string | null;
};

type TeamKey = 'home' | 'away';

type PersistedLineupPlayer = {
  id?: string;
  number: number;
  name: string;
  position?: string;
  role?: string;
  rating?: number | null;
  isCaptain?: boolean;
  squadMemberId?: string | null;
  divisionId?: string | null;
};

type DivisionRow = {
  id: string;
  name: string | null;
  category: string | null;
  season: string | null;
  status: string | null;
};

type ClubRosterEntry = {
  personId: string;
  name: string;
  normalizedName: string;
  position: string | null;
  divisionId: string | null;
  squadMemberId: string | null;
  jerseyNumber: number | null;
};

export type MatchCenterRosterPlayer = {
  personId: string;
  name: string;
  position: string | null;
  divisionId: string | null;
  squadMemberId: string | null;
  jerseyNumber: number | null;
};

type ClubRosterCache = {
  entries: ClubRosterEntry[];
  byId: Map<string, ClubRosterEntry>;
  byName: Map<string, ClubRosterEntry>;
};

type MatchPointsRulesContext = {
  phase_id?: string | null;
  round_id?: string | null;
  tournament_id?: string | null;
};

type TeamResolutionContext = {
  team: TeamKey;
  clubId: string | null;
  divisionId: string | null;
  roster: ClubRosterCache;
  lineupPlayerIds: Map<string, string>;
};

export type MatchCenterEventInput = {
  id?: string;
  minute?: number | null;
  type?: string | null;
  team?: TeamKey | null;
  playerId?: string | null;
  playerName?: string | null;
  secondaryPlayerId?: string | null;
  secondaryPlayerName?: string | null;
  subPlayerId?: string | null;
  subPlayer?: string | null;
  detail?: string | null;
  videoTime?: string | null;
  parentEventId?: string | null;
  sequence?: number | null;
};

export type MatchCenterClockInput = {
  minute?: unknown;
  seconds?: unknown;
  period?: unknown;
  running?: unknown;
  syncedAt?: unknown;
} | null | undefined;

export type MatchCenterLineupsInput = {
  home?: unknown[];
  away?: unknown[];
  [key: string]: unknown;
} | null | undefined;

export type MatchCenterEventPatchInput = {
  upsert?: MatchCenterEventInput[];
  deleteIds?: string[];
} | null | undefined;

const EMPTY_LINEUPS = { home: [] as PersistedLineupPlayer[], away: [] as PersistedLineupPlayer[] };
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CLOCK_SNAPSHOT_EVENT_TYPE = '__clock_state__';
const MATCH_CENTER_MATCH_SELECT = `
  id,
  tournament_id,
  phase_id,
  round_id,
  date_time,
  venue,
  notes,
  home_club_id,
  away_club_id,
  home_division_id,
  away_division_id,
  status,
  score,
  clock,
  lineups,
  broadcast_url,
  stream_url,
  replay_url,
  created_at,
  updated_at,
  home_base_points,
  away_base_points,
  home_bonus_points,
  away_bonus_points,
  points_autocalculated,
  points_override_reason,
  category,
  round_label,
  sport_id,
  sport,
  season_id,
  home_team_id,
  away_team_id,
  homeClub:home_club_id (id, name, short_name, primary_color),
  awayClub:away_club_id (id, name, short_name, primary_color),
  tournament:tournament_id (id, name, sport_id, external_id)
`;
const PERSIST_MATCH_SELECT_BASE = `
  id,
  season_id,
  category,
  date_time,
  tournament_id,
  phase_id,
  round_id,
  home_club_id,
  away_club_id,
  home_team_id,
  away_team_id,
  home_division_id,
  away_division_id,
  lineups
`;
const PERSIST_MATCH_SELECT_EVENT_PATCH = `
  id,
  season_id,
  category,
  date_time,
  tournament_id,
  phase_id,
  round_id,
  home_club_id,
  away_club_id,
  home_team_id,
  away_team_id,
  home_division_id,
  away_division_id
`;
const PERSIST_MATCH_SELECT_WITH_EVENTS = `${PERSIST_MATCH_SELECT_BASE}, events`;

async function fetchMatchPointsRules(client: SupabaseLike, match: MatchPointsRulesContext) {
  try {
    let phaseId = match.phase_id ?? null;

    if (!phaseId && match.round_id) {
      const { data: round } = await client
        .from('tournament_rounds')
        .select('phase_id')
        .eq('id', match.round_id)
        .single();
      phaseId = round?.phase_id ?? null;
    }

    let phaseSettings: Record<string, unknown> | null = null;
    let tournamentId = match.tournament_id ?? null;

    if (phaseId) {
      const { data: phase } = await client
        .from('tournament_phases')
        .select('settings, tournament_id')
        .eq('id', phaseId)
        .single();

      phaseSettings = (phase?.settings as Record<string, unknown> | null) ?? null;
      tournamentId = phase?.tournament_id ?? tournamentId;
    }

    let tournamentRuleset: Record<string, unknown> | null = null;
    if (tournamentId) {
      const { data: tournament } = await client
        .from('tournaments')
        .select('ruleset')
        .eq('id', tournamentId)
        .single();
      tournamentRuleset = (tournament?.ruleset as Record<string, unknown> | null) ?? null;
    }

    return resolveMatchPointsRules(phaseSettings, tournamentRuleset);
  } catch {
    return DEFAULT_MATCH_POINTS_RULES;
  }
}

function isMissingMatchEventsTableError(error: SupabaseLikeError) {
  if (!error) return false;

  const haystack = `${error.message || ''} ${error.details || ''}`.toLowerCase();
  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    error.code === 'PGRST200' ||
    haystack.includes('match_events') ||
    haystack.includes('does not exist') ||
    haystack.includes('schema cache')
  );
}

function isMissingAnyTableError(error: SupabaseLikeError, tables: string[]) {
  return tables.some((table) => isMissingTableError(error, table));
}

async function supportsMatchesColumn(client: SupabaseLike, column: string) {
  const { error } = await client
    .from('matches')
    .select(column)
    .limit(0);

  if (!error) return true;
  if (isMissingColumnError(error, column)) return false;
  return false;
}

async function supportsMatchEventsTable(client: SupabaseLike) {
  const { error } = await client
    .from('match_events')
    .select('id')
    .limit(0);

  if (!error) return true;
  if (isMissingMatchEventsTableError(error)) return false;
  throw new Error(error.message || 'No se pudo verificar la disponibilidad de match_events.');
}

function normalizeTeam(value: unknown): TeamKey | null {
  return value === 'home' || value === 'away' ? value : null;
}

function normalizeText(value: unknown) {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeNameKey(value: unknown) {
  return normalizeText(value).toLowerCase();
}

function normalizeEventId(value: unknown) {
  const normalized = normalizeText(value);
  return UUID_PATTERN.test(normalized) ? normalized : crypto.randomUUID();
}

function getMatchSeason(match: MatchContextRow) {
  const raw = typeof match.date_time === 'string' ? match.date_time.slice(0, 4) : '';
  return /^\d{4}$/.test(raw) ? raw : String(new Date().getFullYear());
}

function splitPersonName(fullName: string) {
  const normalized = normalizeText(fullName);
  if (!normalized) {
    return { firstName: '', lastName: '' };
  }

  const parts = normalized.split(' ');
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: '' };
  }

  return {
    firstName: parts.slice(0, -1).join(' '),
    lastName: parts.slice(-1).join(' '),
  };
}

function normalizeLineupRole(role: unknown, jerseyNumber: number) {
  const normalized = normalizeText(role).toLowerCase();
  if (normalized === 'titular' || normalized === 'starter') return 'titular';
  if (normalized === 'suplente' || normalized === 'substitute') return 'suplente';
  if (normalized === 'desarrollo') return 'desarrollo';
  if (jerseyNumber < 1) return 'suplente';
  return jerseyNumber <= 15 ? 'titular' : 'suplente';
}

function normalizeLineupRating(value: unknown) {
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

function normalizeStoredLineupPlayer(player: unknown, index: number): PersistedLineupPlayer {
  const source = player && typeof player === 'object' ? (player as Record<string, unknown>) : {};
  const preferredNumber =
    typeof source.number === 'number' && Number.isFinite(source.number)
      ? Math.trunc(source.number)
      : typeof source.jerseyNumber === 'number' && Number.isFinite(source.jerseyNumber)
        ? Math.trunc(source.jerseyNumber)
        : index + 1;

  return {
    id: normalizeText(source.id) || normalizeText(source.playerId) || undefined,
    number: Math.max(1, preferredNumber),
    name: normalizeText(source.name) || normalizeText(source.playerName),
    position: normalizeText(source.position) || '',
    role: normalizeText(source.role) || (preferredNumber <= 15 ? 'starter' : 'substitute'),
    rating: normalizeLineupRating(source.rating ?? source.playerRating),
    isCaptain: Boolean(source.isCaptain),
    squadMemberId: normalizeText(source.squadMemberId) || null,
    divisionId: normalizeText(source.divisionId) || null,
  };
}

function normalizeLineupCollection(players: unknown[]) {
  return players.map((player, index) => normalizeStoredLineupPlayer(player, index));
}

function normalizeLineups(lineups: MatchCenterLineupsInput | unknown) {
  const source = lineups && typeof lineups === 'object' ? (lineups as Record<string, unknown>) : {};
  const metadata = Object.fromEntries(
    Object.entries(source).filter(([key]) => key !== 'home' && key !== 'away')
  );

  return {
    ...metadata,
    home: Array.isArray(source.home) ? normalizeLineupCollection(source.home) : [],
    away: Array.isArray(source.away) ? normalizeLineupCollection(source.away) : [],
  };
}

function normalizeEventInput(event: MatchCenterEventInput) {
  const source = event as MatchCenterEventInput & Record<string, unknown>;
  const type = normalizeText(source.type) || 'note';
  const detail = normalizeText(source.detail);
  const secondaryPlayerName =
    normalizeText(source.secondaryPlayerName) ||
    normalizeText(source.secondary_player_name) ||
    normalizeText(source.subPlayer) ||
    normalizeText(source.sub_player) ||
    (type === 'substitution' ? parseSubstitutionIncomingPlayer(detail) : '');
  const normalizedDetail = type === 'substitution' && !detail && secondaryPlayerName
    ? `Entra: ${secondaryPlayerName}`
    : detail;

  return {
    id: normalizeEventId(event.id),
    minute: Number.isFinite(event.minute) ? Math.max(0, Math.trunc(event.minute as number)) : 0,
    type,
    team: normalizeTeam(event.team),
    playerId: normalizeText(event.playerId) || null,
    playerName: normalizeText(event.playerName),
    secondaryPlayerId:
      normalizeText(source.secondaryPlayerId) ||
      normalizeText(source.secondary_player_id) ||
      normalizeText(source.subPlayerId) ||
      normalizeText(source.sub_player_id) ||
      null,
    secondaryPlayerName,
    detail: normalizedDetail,
    videoTime: normalizeText(event.videoTime) || null,
    parentEventId: normalizeText(event.parentEventId) || null,
    sequence: Number.isFinite(event.sequence) ? Math.max(0, Math.trunc(event.sequence as number)) : null,
  };
}

function normalizeClockPayload(clock: MatchCenterClockInput) {
  if (!clock || typeof clock !== 'object') return null;

  const minuteValue = Number(clock.minute);
  const secondsValue = Number(clock.seconds);
  const syncedAt = normalizeText(clock.syncedAt);

  return {
    minute: Number.isFinite(minuteValue) ? Math.max(0, Math.trunc(minuteValue)) : 0,
    seconds: Number.isFinite(secondsValue) ? Math.max(0, Math.trunc(secondsValue)) : 0,
    period: normalizeText(clock.period),
    running: Boolean(clock.running),
    syncedAt: syncedAt || new Date().toISOString(),
  };
}

function isClockSnapshotRecord(source: Record<string, unknown>) {
  return normalizeText(source.type) === CLOCK_SNAPSHOT_EVENT_TYPE
    || normalizeText(source.event_type) === CLOCK_SNAPSHOT_EVENT_TYPE
    || normalizeText(source.kind) === 'clock_state';
}

function extractClockSnapshotFromDetails(details: Record<string, unknown>) {
  const normalized = normalizeClockPayload({
    minute: details.minute,
    seconds: details.seconds,
    period: details.period,
    running: details.running,
    syncedAt: details.syncedAt,
  });

  return normalized ? { ...normalized, syncedAt: normalized.syncedAt || null } : null;
}

function buildClockSnapshotJsonEvent(clock: NonNullable<ReturnType<typeof normalizeClockPayload>>) {
  return {
    id: `clock-${crypto.randomUUID()}`,
    minute: clock.minute,
    type: CLOCK_SNAPSHOT_EVENT_TYPE,
    team: null,
    playerId: null,
    playerName: '',
    detail: '',
    kind: 'clock_state',
    seconds: clock.seconds,
    period: clock.period,
    running: clock.running,
    syncedAt: clock.syncedAt,
  };
}

function findClockSnapshotJsonEvent(events: unknown[]) {
  for (const row of events) {
    const source = row && typeof row === 'object' ? row as Record<string, unknown> : null;
    if (source && isClockSnapshotRecord(source)) {
      return source;
    }
  }

  return null;
}

function buildClockSnapshotRelationalEvent(
  match: { id: string; season_id?: string | null; home_club_id?: string | null; away_club_id?: string | null },
  clock: NonNullable<ReturnType<typeof normalizeClockPayload>>,
) {
  return {
    id: crypto.randomUUID(),
    match_id: match.id,
    season_id: match.season_id ?? null,
    club_id: null,
    player_id: null,
    player_name: null,
    event_type: CLOCK_SNAPSHOT_EVENT_TYPE,
    minute: clock.minute,
    details: {
      kind: 'clock_state',
      minute: clock.minute,
      seconds: clock.seconds,
      period: clock.period,
      running: clock.running,
      syncedAt: clock.syncedAt,
    },
  };
}

function mapStoredEvent(row: any, match: { home_club_id?: string | null; away_club_id?: string | null }) {
  const details = row?.details && typeof row.details === 'object' ? row.details : {};
  const teamFromDetails = normalizeTeam((details as Record<string, unknown>).team);
  const team =
    row?.club_id && row.club_id === match.home_club_id
      ? 'home'
      : row?.club_id && row.club_id === match.away_club_id
        ? 'away'
        : teamFromDetails;

  return {
    id: normalizeEventId(row?.id),
    minute: Number.isFinite(row?.minute) ? Number(row.minute) : 0,
    type: normalizeText(row?.event_type) || 'note',
    team,
    playerId:
      normalizeText(row?.player_id) ||
      normalizeText((details as Record<string, unknown>).playerId) ||
      null,
    playerName:
      normalizeText(row?.player_name) ||
      normalizeText((details as Record<string, unknown>).playerName) ||
      '',
    secondaryPlayerId:
      normalizeText((details as Record<string, unknown>).secondaryPlayerId) ||
      normalizeText((details as Record<string, unknown>).secondary_player_id) ||
      normalizeText((details as Record<string, unknown>).subPlayerId) ||
      normalizeText((details as Record<string, unknown>).sub_player_id) ||
      null,
    secondaryPlayerName:
      normalizeText((details as Record<string, unknown>).secondaryPlayerName) ||
      normalizeText((details as Record<string, unknown>).secondary_player_name) ||
      normalizeText((details as Record<string, unknown>).subPlayer) ||
      normalizeText((details as Record<string, unknown>).sub_player) ||
      (normalizeText(row?.event_type) === 'substitution'
        ? parseSubstitutionIncomingPlayer(normalizeText((details as Record<string, unknown>).detail))
        : ''),
    detail: normalizeText((details as Record<string, unknown>).detail),
    videoTime:
      normalizeText(row?.video_time) ||
      normalizeText((details as Record<string, unknown>).videoTime) ||
      normalizeText((details as Record<string, unknown>).video_time) ||
      '',
    parentEventId:
      normalizeText(row?.parent_event_id) ||
      normalizeText((details as Record<string, unknown>).parentEventId) ||
      normalizeText((details as Record<string, unknown>).parent_event_id) ||
      undefined,
    sequence:
      Number.isFinite(row?.sequence)
        ? Number(row.sequence)
        : Number.isFinite((details as Record<string, unknown>).sequence)
          ? Number((details as Record<string, unknown>).sequence)
          : undefined,
  };
}

function mapJsonEvent(row: unknown) {
  const source = row && typeof row === 'object' ? (row as Record<string, unknown>) : {};
  return normalizeEventInput({
    id: normalizeText(source.id) || undefined,
    minute: typeof source.minute === 'number' ? source.minute : Number(source.minute || 0),
    type: normalizeText(source.type),
    team: normalizeTeam(source.team),
    playerId: normalizeText(source.playerId) || normalizeText(source.player_id) || null,
    playerName: normalizeText(source.playerName) || normalizeText(source.player_name),
    secondaryPlayerId:
      normalizeText(source.secondaryPlayerId) ||
      normalizeText(source.secondary_player_id) ||
      normalizeText(source.subPlayerId) ||
      normalizeText(source.sub_player_id) ||
      null,
    secondaryPlayerName:
      normalizeText(source.secondaryPlayerName) ||
      normalizeText(source.secondary_player_name) ||
      normalizeText(source.subPlayer) ||
      normalizeText(source.sub_player),
    detail: normalizeText(source.detail) || normalizeText(source.description),
    videoTime: normalizeText(source.videoTime) || normalizeText(source.video_time) || null,
    parentEventId: normalizeText(source.parentEventId) || normalizeText(source.parent_event_id) || null,
    sequence:
      typeof source.sequence === 'number'
        ? source.sequence
        : Number.isFinite(Number(source.sequence))
          ? Number(source.sequence)
          : null,
  });
}

async function fetchLegacyJsonEvents(client: SupabaseLike, matchId: string) {
  const { data, error } = await client
    .from('matches')
    .select('events')
    .eq('id', matchId)
    .single();

  if (error) {
    if (isMissingColumnError(error, 'events')) {
      return [];
    }

    console.error('[matchCenterService] Failed to load legacy match events:', error);
    return [];
  }

  return Array.isArray((data as any)?.events) ? (data as any).events as unknown[] : [];
}

function buildMatchCenterLogoUrl(entity: unknown, fallbackKey?: string | null) {
  const source = entity && typeof entity === 'object' ? entity as Record<string, unknown> : {};
  return buildTeamLogoProxyUrl({
    key: normalizeText(source.id) || normalizeText(fallbackKey) || null,
    name: normalizeText(source.name) || normalizeText(source.display_name) || null,
  });
}

function hasResolvedEventPlayerReferences(event: ReturnType<typeof normalizeEventInput>) {
  if (!event.team) return true;
  if (event.playerName && !event.playerId) return false;
  if (event.secondaryPlayerName && !event.secondaryPlayerId) return false;
  return true;
}

async function resolveEventsForPersistence(
  client: SupabaseLike,
  match: MatchContextRow,
  lineups: ReturnType<typeof normalizeLineups>,
  events: MatchCenterEventInput[],
) {
  const normalizedEvents = events.map((event) => normalizeEventInput(event));
  if (normalizedEvents.every(hasResolvedEventPlayerReferences)) {
    return normalizedEvents;
  }

  const contexts = await buildTeamContexts(client, match, lineups);
  return resolvePersistedEvents(client, contexts, events);
}

function mapEventToInsert(
  match: {
    id: string;
    season_id?: string | null;
    home_club_id?: string | null;
    away_club_id?: string | null;
    home_team_id?: string | null;
    away_team_id?: string | null;
  },
  event: ReturnType<typeof normalizeEventInput>,
) {
  const clubId =
    event.team === 'home'
      ? match.home_club_id || null
      : event.team === 'away'
        ? match.away_club_id || null
        : null;
  const teamId =
    event.team === 'home'
      ? match.home_team_id || null
      : event.team === 'away'
        ? match.away_team_id || null
        : null;

  return {
    id: event.id,
    match_id: match.id,
    season_id: match.season_id ?? null,
    club_id: clubId,
    team_id: teamId,
    player_id: event.playerId || null,
    player_name: event.playerName || null,
    event_type: event.type,
    minute: event.minute,
    video_time: event.videoTime || null,
    parent_event_id: event.parentEventId || null,
    sequence: event.sequence ?? null,
    details: {
      detail: event.detail || null,
      team: event.team,
      legacy_id: event.id || null,
      playerId: event.playerId || null,
      playerName: event.playerName || null,
      secondaryPlayerId: event.secondaryPlayerId || null,
      secondaryPlayerName: event.secondaryPlayerName || null,
      subPlayerId: event.secondaryPlayerId || null,
      subPlayer: event.secondaryPlayerName || null,
      videoTime: event.videoTime || null,
      parentEventId: event.parentEventId || null,
      sequence: event.sequence ?? null,
    },
  };
}

function createRosterCache(entries: ClubRosterEntry[], preferredDivisionId: string | null): ClubRosterCache {
  const byId = new Map<string, ClubRosterEntry>();
  const byName = new Map<string, ClubRosterEntry>();

  const shouldPreferEntry = (candidate: ClubRosterEntry, current: ClubRosterEntry) => {
    if (preferredDivisionId) {
      if (candidate.divisionId === preferredDivisionId && current.divisionId !== preferredDivisionId) return true;
      if (candidate.squadMemberId && !current.squadMemberId) return true;
    }

    return false;
  };

  for (const entry of entries) {
    byId.set(entry.personId, entry);

    const current = byName.get(entry.normalizedName);
    if (!current || shouldPreferEntry(entry, current)) {
      byName.set(entry.normalizedName, entry);
    }
  }

  return { entries, byId, byName };
}

function toPublicRosterEntries(cache: ClubRosterCache): MatchCenterRosterPlayer[] {
  return cache.entries.map((entry) => ({
    personId: entry.personId,
    name: entry.name,
    position: entry.position,
    divisionId: entry.divisionId,
    squadMemberId: entry.squadMemberId,
    jerseyNumber: entry.jerseyNumber,
  }));
}

async function fetchClubRosterCache(
  client: SupabaseLike,
  clubId: string | null,
  divisionId: string | null,
): Promise<ClubRosterCache> {
  if (!clubId) {
    return createRosterCache([], divisionId);
  }

  const [rolesRes, peopleRes, squadRes] = await Promise.all([
    client
      .from('club_person_roles')
      .select(`
        id,
        division_id,
        position,
        role,
        status,
        people:person_id (
          id,
          first_name,
          last_name,
          full_name,
          name,
          position,
          club_id,
          role,
          status
        )
      `)
      .eq('club_id', clubId)
      .eq('role', 'player'),
    client
      .from('people')
      .select('id, first_name, last_name, full_name, name, position, club_id, role, status')
      .eq('club_id', clubId),
    divisionId
      ? client
        .from('squad_members')
        .select('id, person_id, division_id, jersey_number, position')
        .eq('division_id', divisionId)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (rolesRes.error && !isMissingAnyTableError(rolesRes.error, ['club_person_roles', 'people'])) {
    throw new Error(rolesRes.error.message || 'No se pudo cargar el plantel del club.');
  }

  if (peopleRes.error && !isMissingTableError(peopleRes.error, 'people')) {
    throw new Error(peopleRes.error.message || 'No se pudieron cargar las personas del club.');
  }

  if (squadRes.error && !isMissingTableError(squadRes.error, 'squad_members')) {
    throw new Error(squadRes.error.message || 'No se pudo cargar la composicion del plantel.');
  }

  const squadByPerson = new Map<string, any>(
    ((isMissingTableError(squadRes.error, 'squad_members') ? [] : squadRes.data) || []).map((row: any) => [String(row.person_id), row]),
  );

  const entries: ClubRosterEntry[] = [];
  const seen = new Set<string>();

  for (const row of (isMissingAnyTableError(rolesRes.error, ['club_person_roles', 'people']) ? [] : rolesRes.data) || []) {
    const person = row?.people;
    if (!person?.id) continue;

    const name =
      normalizeText(person.full_name) ||
      normalizeText(person.name) ||
      normalizeText(`${person.first_name || ''} ${person.last_name || ''}`);

    if (!name) continue;

    const squadMember = squadByPerson.get(String(person.id));
    const entry: ClubRosterEntry = {
      personId: String(person.id),
      name,
      normalizedName: normalizeNameKey(name),
      position: normalizeText(row.position) || normalizeText(person.position) || null,
      divisionId: normalizeText(row.division_id) || divisionId || null,
      squadMemberId: normalizeText(squadMember?.id) || null,
      jerseyNumber:
        typeof squadMember?.jersey_number === 'number' && Number.isFinite(squadMember.jersey_number)
          ? Number(squadMember.jersey_number)
          : null,
    };

    entries.push(entry);
    seen.add(entry.personId);
  }

  for (const person of (isMissingTableError(peopleRes.error, 'people') ? [] : peopleRes.data) || []) {
    const personId = normalizeText(person.id);
    if (!personId || seen.has(personId)) continue;

    const role = normalizeText(person.role).toLowerCase();
    if (role && role !== 'player') continue;

    const name =
      normalizeText(person.full_name) ||
      normalizeText(person.name) ||
      normalizeText(`${person.first_name || ''} ${person.last_name || ''}`);

    if (!name) continue;

    const squadMember = squadByPerson.get(personId);
    entries.push({
      personId,
      name,
      normalizedName: normalizeNameKey(name),
      position: normalizeText(person.position) || null,
      divisionId: divisionId || null,
      squadMemberId: normalizeText(squadMember?.id) || null,
      jerseyNumber:
        typeof squadMember?.jersey_number === 'number' && Number.isFinite(squadMember.jersey_number)
          ? Number(squadMember.jersey_number)
          : null,
    });
  }

  return createRosterCache(entries, divisionId);
}

async function fetchDivisionCandidates(
  client: SupabaseLike,
  clubId: string | null,
  season: string | null,
): Promise<DivisionRow[]> {
  if (!clubId) return [];

  const buildQuery = (targetSeason?: string | null) => {
    let query = client
      .from('club_divisions')
      .select('id, name, category, season, status')
      .eq('club_id', clubId)
      .order('updated_at', { ascending: false });

    if (targetSeason) {
      query = query.eq('season', targetSeason);
    }

    return query;
  };

  const scoped = await buildQuery(season);
  if (scoped.error) {
    if (isMissingTableError(scoped.error, 'club_divisions')) {
      return [];
    }

    throw new Error(scoped.error.message || 'No se pudieron cargar las categorias del club.');
  }

  if (Array.isArray(scoped.data) && scoped.data.length > 0) {
    return scoped.data as DivisionRow[];
  }

  const fallback = await buildQuery(null);
  if (fallback.error) {
    if (isMissingTableError(fallback.error, 'club_divisions')) {
      return [];
    }

    throw new Error(fallback.error.message || 'No se pudieron cargar las categorias del club.');
  }

  return (fallback.data || []) as DivisionRow[];
}

async function resolveTeamDivisionId(
  client: SupabaseLike,
  match: MatchContextRow,
  team: TeamKey,
) {
  const explicitId = team === 'home' ? normalizeText(match.home_division_id) : normalizeText(match.away_division_id);
  if (explicitId) {
    return explicitId;
  }

  const clubId = team === 'home' ? normalizeText(match.home_club_id) : normalizeText(match.away_club_id);
  if (!clubId) {
    return null;
  }

  const candidates = await fetchDivisionCandidates(client, clubId, getMatchSeason(match));
  if (candidates.length === 0) {
    return null;
  }

  const pool = candidates.filter((row) => normalizeText(row.status).toLowerCase() !== 'archived');
  const activeCandidates = pool.length > 0 ? pool : candidates;
  const normalizedCategory = normalizeNameKey(match.category);

  if (normalizedCategory) {
    const matched = activeCandidates.find((row) => {
      const names = [row.name, row.category].map((value) => normalizeNameKey(value));
      return names.some((value) => value && (value === normalizedCategory || value.includes(normalizedCategory) || normalizedCategory.includes(value)));
    });

    if (matched?.id) {
      return matched.id;
    }
  }

  return activeCandidates.length === 1 ? activeCandidates[0].id : null;
}

async function ensureClubPlayerRole(
  client: SupabaseLike,
  clubId: string,
  personId: string,
  divisionId: string | null,
  position: string | null,
) {
  const { data: existingRows, error: existingError } = await client
    .from('club_person_roles')
    .select('id, division_id, position, role, status')
    .eq('club_id', clubId)
    .eq('person_id', personId)
    .eq('role', 'player');

  if (existingError) {
    if (isMissingTableError(existingError, 'club_person_roles')) {
      return null;
    }

    throw new Error(existingError.message || 'No se pudo verificar el vinculo del jugador con el club.');
  }

  const sameDivision = (existingRows || []).find((row: any) => {
    const existingDivisionId = normalizeText(row.division_id) || null;
    return existingDivisionId === divisionId;
  });

  if (sameDivision) {
    const nextPosition = position || normalizeText(sameDivision.position) || null;
    const shouldUpdatePosition = nextPosition !== (normalizeText(sameDivision.position) || null);

    if (shouldUpdatePosition) {
      const { error } = await client
        .from('club_person_roles')
        .update({ position: nextPosition, status: 'active' })
        .eq('id', sameDivision.id);

      if (error) {
        if (isMissingTableError(error, 'club_person_roles')) {
          return null;
        }

        throw new Error(error.message || 'No se pudo actualizar la ficha del jugador en el club.');
      }
    }

    return sameDivision.id as string;
  }

  const existing = (existingRows || [])[0];
  if (existing) {
    const { error } = await client
      .from('club_person_roles')
      .update({
        division_id: divisionId,
        position: position || normalizeText(existing.position) || null,
        status: 'active',
      })
      .eq('id', existing.id);

    if (error) {
      if (isMissingTableError(error, 'club_person_roles')) {
        return null;
      }

      throw new Error(error.message || 'No se pudo reasignar el jugador al plantel del partido.');
    }

    return existing.id as string;
  }

  const { data: inserted, error: insertError } = await client
    .from('club_person_roles')
    .insert({
      club_id: clubId,
      person_id: personId,
      division_id: divisionId,
      role: 'player',
      status: 'active',
      position: position,
    })
    .select('id')
    .single();

  if (insertError) {
    if (isMissingTableError(insertError, 'club_person_roles')) {
      return null;
    }

    throw new Error(insertError.message || 'No se pudo registrar el jugador en el club.');
  }

  return inserted?.id as string;
}

async function ensureSquadMember(
  client: SupabaseLike,
  divisionId: string | null,
  personId: string,
  player: PersistedLineupPlayer,
  order: number,
) {
  if (!divisionId) return null;

  const role = normalizeLineupRole(player.role, player.number);
  const position = normalizeText(player.position) || 'Jugador';
  const notes = player.isCaptain ? 'Capitan' : null;

  const { data: existing, error: existingError } = await client
    .from('squad_members')
    .select('id, jersey_number, role, position, notes')
    .eq('division_id', divisionId)
    .eq('person_id', personId)
    .maybeSingle();

  if (existingError) {
    if (isMissingTableError(existingError, 'squad_members')) {
      return null;
    }

    throw new Error(existingError.message || 'No se pudo verificar la pertenencia del jugador al plantel.');
  }

  if (existing?.id) {
    const { error } = await client
      .from('squad_members')
      .update({
        jersey_number: player.number || null,
        role,
        position,
        order,
        notes,
        status: 'disponible',
      })
      .eq('id', existing.id);

    if (error) {
      if (isMissingTableError(error, 'squad_members')) {
        return null;
      }

      throw new Error(error.message || 'No se pudo actualizar el jugador dentro del plantel.');
    }

    return String(existing.id);
  }

  const { data: inserted, error: insertError } = await client
    .from('squad_members')
    .insert({
      division_id: divisionId,
      person_id: personId,
      position,
      role,
      jersey_number: player.number || null,
      status: 'disponible',
      order,
      notes,
    })
    .select('id')
    .single();

  if (insertError) {
    if (isMissingTableError(insertError, 'squad_members')) {
      return null;
    }

    throw new Error(insertError.message || 'No se pudo agregar el jugador al plantel correspondiente.');
  }

  return normalizeText(inserted?.id) || null;
}

async function maybeUpdatePersonMetadata(
  client: SupabaseLike,
  personId: string,
  player: PersistedLineupPlayer,
) {
  const position = normalizeText(player.position) || null;
  if (!position) return;

  const { error } = await client
    .from('people')
    .update({ position, role: 'player', status: 'active' })
    .eq('id', personId);

  if (error) {
    if (isMissingTableError(error, 'people')) {
      return;
    }

    throw new Error(error.message || 'No se pudo actualizar la ficha del jugador.');
  }
}

function upsertRosterEntry(cache: ClubRosterCache, entry: ClubRosterEntry) {
  const nextEntries = cache.entries.filter((current) => current.personId !== entry.personId);
  nextEntries.push(entry);
  const rebuilt = createRosterCache(nextEntries, entry.divisionId || null);
  cache.entries = rebuilt.entries;
  cache.byId = rebuilt.byId;
  cache.byName = rebuilt.byName;
}

async function ensurePlayerInContext(
  client: SupabaseLike,
  context: TeamResolutionContext,
  player: PersistedLineupPlayer,
  order: number,
): Promise<ClubRosterEntry | null> {
  const name = normalizeText(player.name);
  if (!name || !context.clubId) return null;

  const normalizedName = normalizeNameKey(name);
  const preferredId = normalizeText(player.id);
  let existing =
    (preferredId ? context.roster.byId.get(preferredId) : null) ||
    context.roster.byName.get(normalizedName) ||
    null;

  if (!existing) {
    const { firstName, lastName } = splitPersonName(name);
    const { data: insertedPerson, error: insertPersonError } = await client
      .from('people')
      .insert({
        first_name: firstName || name,
        last_name: lastName,
        full_name: name,
        name,
        club_id: context.clubId,
        position: normalizeText(player.position) || null,
        role: 'player',
        status: 'active',
      })
      .select('id')
      .single();

    if (insertPersonError) {
      if (isMissingTableError(insertPersonError, 'people')) {
        return null;
      }

      throw new Error(insertPersonError.message || 'No se pudo crear el jugador en la base de datos.');
    }

    existing = {
      personId: String(insertedPerson.id),
      name,
      normalizedName,
      position: normalizeText(player.position) || null,
      divisionId: context.divisionId,
      squadMemberId: null,
      jerseyNumber: player.number || null,
    };
  } else {
    await maybeUpdatePersonMetadata(client, existing.personId, player);
  }

  await ensureClubPlayerRole(
    client,
    context.clubId,
    existing.personId,
    context.divisionId,
    normalizeText(player.position) || existing.position || null,
  );

  const squadMemberId = await ensureSquadMember(client, context.divisionId, existing.personId, player, order);
  const nextEntry: ClubRosterEntry = {
    ...existing,
    name,
    normalizedName,
    position: normalizeText(player.position) || existing.position || null,
    divisionId: context.divisionId,
    squadMemberId: squadMemberId || existing.squadMemberId || null,
    jerseyNumber: player.number || existing.jerseyNumber || null,
  };

  upsertRosterEntry(context.roster, nextEntry);
  context.lineupPlayerIds.set(normalizedName, nextEntry.personId);
  return nextEntry;
}

async function buildTeamContexts(client: SupabaseLike, match: MatchContextRow, lineups: ReturnType<typeof normalizeLineups>) {
  const [homeDivisionId, awayDivisionId] = await Promise.all([
    resolveTeamDivisionId(client, match, 'home'),
    resolveTeamDivisionId(client, match, 'away'),
  ]);

  const [homeRoster, awayRoster] = await Promise.all([
    fetchClubRosterCache(client, normalizeText(match.home_club_id) || null, homeDivisionId),
    fetchClubRosterCache(client, normalizeText(match.away_club_id) || null, awayDivisionId),
  ]);

  const contexts: Record<TeamKey, TeamResolutionContext> = {
    home: {
      team: 'home',
      clubId: normalizeText(match.home_club_id) || null,
      divisionId: homeDivisionId,
      roster: homeRoster,
      lineupPlayerIds: new Map<string, string>(),
    },
    away: {
      team: 'away',
      clubId: normalizeText(match.away_club_id) || null,
      divisionId: awayDivisionId,
      roster: awayRoster,
      lineupPlayerIds: new Map<string, string>(),
    },
  };

  (['home', 'away'] as const).forEach((team) => {
    lineups[team].forEach((player) => {
      const nameKey = normalizeNameKey(player.name);
      if (!nameKey) return;

      const playerId = normalizeText(player.id) || contexts[team].roster.byName.get(nameKey)?.personId || null;
      if (playerId) {
        contexts[team].lineupPlayerIds.set(nameKey, playerId);
      }
    });
  });

  return contexts;
}

async function resolvePersistedLineups(
  client: SupabaseLike,
  contexts: Record<TeamKey, TeamResolutionContext>,
  lineups: MatchCenterLineupsInput | unknown,
) {
  const normalized = normalizeLineups(lineups);
  const resolved: ReturnType<typeof normalizeLineups> = { home: [], away: [] };

  for (const team of ['home', 'away'] as const) {
    const players = normalized[team];
    const context = contexts[team];

    for (let index = 0; index < players.length; index += 1) {
      const player = players[index];
      const cleanedName = normalizeText(player.name);

      if (!cleanedName) {
        resolved[team].push({
          ...player,
          id: normalizeText(player.id) || undefined,
          squadMemberId: normalizeText(player.squadMemberId) || null,
          divisionId: context.divisionId || normalizeText(player.divisionId) || null,
        });
        continue;
      }

      const rosterEntry = await ensurePlayerInContext(client, context, player, index);
      resolved[team].push({
        ...player,
        id: rosterEntry?.personId || normalizeText(player.id) || undefined,
        name: rosterEntry?.name || cleanedName,
        position: normalizeText(player.position) || rosterEntry?.position || '',
        squadMemberId: rosterEntry?.squadMemberId || normalizeText(player.squadMemberId) || null,
        divisionId: context.divisionId || normalizeText(player.divisionId) || null,
      });
    }
  }

  return resolved;
}

async function resolveEventPlayerReference(
  client: SupabaseLike,
  context: TeamResolutionContext,
  playerId: string | null | undefined,
  playerName: string | null | undefined,
  fallbackIndex: number,
) {
  const cleanedName = normalizeText(playerName);
  const normalizedPlayerId = normalizeText(playerId) || null;

  if (!cleanedName) {
    return { playerId: normalizedPlayerId, playerName: '' };
  }

  const nameKey = normalizeNameKey(cleanedName);
  const preferredId = normalizedPlayerId || context.lineupPlayerIds.get(nameKey) || null;
  const existing =
    (preferredId ? context.roster.byId.get(preferredId) : null) ||
    context.roster.byName.get(nameKey) ||
    null;

  if (existing) {
    context.lineupPlayerIds.set(nameKey, existing.personId);
    return { playerId: existing.personId, playerName: existing.name };
  }

  const created = await ensurePlayerInContext(
    client,
    context,
    {
      id: preferredId || undefined,
      number: 0,
      name: cleanedName,
      position: '',
      role: '',
    },
    fallbackIndex,
  );

  return {
    playerId: created?.personId || preferredId || null,
    playerName: created?.name || cleanedName,
  };
}

async function resolvePersistedEvents(
  client: SupabaseLike,
  contexts: Record<TeamKey, TeamResolutionContext>,
  events: MatchCenterEventInput[],
) {
  const resolved: ReturnType<typeof normalizeEventInput>[] = [];

  for (const rawEvent of events) {
    const event = normalizeEventInput(rawEvent);
    const context = event.team ? contexts[event.team] : null;
    let nextEvent = event;

    if (!context) {
      resolved.push(nextEvent);
      continue;
    }

    if (event.playerName) {
      const resolvedPlayer = await resolveEventPlayerReference(
        client,
        context,
        event.playerId,
        event.playerName,
        999,
      );
      nextEvent = {
        ...nextEvent,
        playerId: resolvedPlayer.playerId,
        playerName: resolvedPlayer.playerName,
      };
    }

    if (event.secondaryPlayerName) {
      const resolvedSecondaryPlayer = await resolveEventPlayerReference(
        client,
        context,
        event.secondaryPlayerId,
        event.secondaryPlayerName,
        1000,
      );
      nextEvent = {
        ...nextEvent,
        secondaryPlayerId: resolvedSecondaryPlayer.playerId,
        secondaryPlayerName: resolvedSecondaryPlayer.playerName,
        detail: nextEvent.type === 'substitution'
          ? `Entra: ${resolvedSecondaryPlayer.playerName}`
          : nextEvent.detail,
      };
    }

    resolved.push(nextEvent);
  }

  return resolved;
}

export async function fetchMatchCenterMatch(client: SupabaseLike, matchId: string) {
  // `matches.id` is UUID; bail out for external/provider IDs (FlashScore, ESPN, Rugby API)
  // so we don't spam Postgres with `invalid input syntax for type uuid` errors.
  if (!isUuid(matchId)) {
    return { data: null, error: null };
  }

  const { data, error } = await client
    .from('matches')
    .select(MATCH_CENTER_MATCH_SELECT)
    .eq('id', matchId)
    .single();

  if (error || !data) {
    return { data: null, error };
  }

  let events: ReturnType<typeof normalizeEventInput>[] = [];
  let supplementalClock: ReturnType<typeof extractClockSnapshotFromDetails> = null;
  let loadedFromRelationalTable = false;

  const { data: eventRows, error: eventsError } = await client
    .from('match_events')
    .select('id, club_id, player_id, player_name, event_type, minute, details, video_time, parent_event_id, sequence')
    .eq('match_id', matchId)
    .order('minute', { ascending: true });

  if (!eventsError) {
    loadedFromRelationalTable = true;
    events = (eventRows || []).flatMap((row: any) => {
      const details = row?.details && typeof row.details === 'object' ? row.details as Record<string, unknown> : {};
      if (normalizeText(row?.event_type) === CLOCK_SNAPSHOT_EVENT_TYPE || normalizeText(details.kind) === 'clock_state') {
        supplementalClock = extractClockSnapshotFromDetails(details);
        return [];
      }

      return [mapStoredEvent(row, data)];
    });
  } else if (!isMissingMatchEventsTableError(eventsError)) {
    console.error('[matchCenterService] Failed to load match events:', eventsError);
  }

  if (!loadedFromRelationalTable || events.length === 0) {
    const legacyEvents = await fetchLegacyJsonEvents(client, matchId);
    events = legacyEvents.flatMap((row) => {
      const source = row && typeof row === 'object' ? row as Record<string, unknown> : {};
      if (isClockSnapshotRecord(source)) {
        supplementalClock = extractClockSnapshotFromDetails(source);
        return [];
      }

      return [mapJsonEvent(row)];
    });
  }

  const homeClubRaw = (data as any).homeClub;
  const awayClubRaw = (data as any).awayClub;
  const tournamentRaw = (data as any).tournament;
  const tournamentOverrideId =
    normalizeText(tournamentRaw?.external_id) ||
    normalizeText(tournamentRaw?.id);
  const tournamentOverride = tournamentOverrideId
    ? await getExternalTournamentOverride(tournamentOverrideId).catch(() => null)
    : null;
  const resolvedTournament = tournamentRaw
    ? applyExternalTournamentOverride(tournamentRaw, tournamentOverride)
    : null;
  const homeLogoUrl = buildMatchCenterLogoUrl(homeClubRaw, (data as any).home_club_id);
  const awayLogoUrl = buildMatchCenterLogoUrl(awayClubRaw, (data as any).away_club_id);
  const tournamentLogoUrl = resolvedTournament
    ? buildMatchCenterLogoUrl(resolvedTournament, tournamentOverrideId)
    : null;
  const [homeDivisionId, awayDivisionId, pointsRules] = await Promise.all([
    resolveTeamDivisionId(client, data as MatchContextRow, 'home'),
    resolveTeamDivisionId(client, data as MatchContextRow, 'away'),
    fetchMatchPointsRules(client, data as MatchPointsRulesContext),
  ]);
  const [homeRoster, awayRoster] = await Promise.all([
    fetchClubRosterCache(client, normalizeText((data as any).home_club_id) || null, homeDivisionId),
    fetchClubRosterCache(client, normalizeText((data as any).away_club_id) || null, awayDivisionId),
  ]);

  return {
    data: {
      ...data,
      dateTime: (data as any).date_time ?? null,
      tournamentId: (data as any).tournament_id ?? null,
      sportId: (data as any).sport_id ?? (data as any).sport ?? tournamentRaw?.sport_id ?? null,
      homeClubId: (data as any).home_club_id ?? null,
      awayClubId: (data as any).away_club_id ?? null,
      homeSquadId: (data as any).home_division_id ?? null,
      awaySquadId: (data as any).away_division_id ?? null,
      category: (data as any).category ?? null,
      roundLabel: (data as any).round_label ?? null,
      roundId: (data as any).round_id ?? null,
      clock: (data as any).clock ?? supplementalClock ?? null,
      homeClub: homeClubRaw ? { ...homeClubRaw, logo_url: homeLogoUrl, logo: homeLogoUrl } : null,
      awayClub: awayClubRaw ? { ...awayClubRaw, logo_url: awayLogoUrl, logo: awayLogoUrl } : null,
      tournament: resolvedTournament
        ? {
            ...resolvedTournament,
            logo_url: tournamentLogoUrl,
            logo: tournamentLogoUrl,
            sportId: resolvedTournament.sport_id ?? null,
          }
        : null,
      homeRoster: toPublicRosterEntries(homeRoster),
      awayRoster: toPublicRosterEntries(awayRoster),
      pointsRules,
      events,
      lineups: normalizeLineups((data as any).lineups),
      replay_url: (data as any).replay_url ?? null,
      broadcast_url: (data as any).broadcast_url ?? null,
      stream_url: (data as any).stream_url ?? null,
    },
    error: null,
  };
}

export async function persistMatchCenterSupplementalData(
  client: SupabaseLike,
  matchId: string,
  payload: {
    events?: MatchCenterEventInput[];
    eventPatch?: MatchCenterEventPatchInput;
    lineups?: MatchCenterLineupsInput;
    clock?: MatchCenterClockInput;
  },
) {
  const eventPatchUpserts = Array.isArray(payload.eventPatch?.upsert) ? payload.eventPatch.upsert : [];
  const canUseResolvedEventPatch =
    payload.eventPatch !== undefined
    && payload.events === undefined
    && payload.lineups === undefined
    && payload.clock === undefined
    && eventPatchUpserts.map((event) => normalizeEventInput(event)).every(hasResolvedEventPlayerReferences);
  const needsLegacyEvents =
    payload.events === undefined
    && payload.eventPatch === undefined
    && payload.clock === undefined;
  const matchSelect = needsLegacyEvents
    ? PERSIST_MATCH_SELECT_WITH_EVENTS
    : canUseResolvedEventPatch
      ? PERSIST_MATCH_SELECT_EVENT_PATCH
      : PERSIST_MATCH_SELECT_BASE;
  const { data: match, error: matchError } = await client
    .from('matches')
    .select(matchSelect)
    .eq('id', matchId)
    .single();

  if (matchError || !match) {
    throw new Error('El partido que intentas actualizar no existe.');
  }

  const normalizedClock = normalizeClockPayload(payload.clock);
  const hasEventReplacement = payload.events !== undefined;
  const hasEventPatch = payload.eventPatch !== undefined;
  const touchesEvents = hasEventReplacement || hasEventPatch;
  const touchesEventStorage = touchesEvents || payload.clock !== undefined;

  const supportsRelationalEvents = hasEventPatch
    ? true
    : touchesEventStorage
    ? await supportsMatchEventsTable(client)
    : false;
  const supportsEventsColumn = (touchesEvents || payload.clock !== undefined) && !supportsRelationalEvents
    ? await supportsMatchesColumn(client, 'events')
    : false;

  if (touchesEvents && !supportsRelationalEvents && !supportsEventsColumn) {
    throw new Error('No hay almacenamiento disponible para los eventos del partido.');
  }

  if (hasEventPatch && !supportsRelationalEvents) {
    throw new Error('El guardado incremental de eventos requiere la tabla match_events.');
  }

  const normalizedExistingLineups = normalizeLineups((match as any).lineups);
  const normalizedIncomingLineups =
    payload.lineups !== undefined
      ? normalizeLineups(payload.lineups)
      : null;
  const mergedIncomingLineups = normalizedIncomingLineups
    ? {
        ...normalizedExistingLineups,
        ...normalizedIncomingLineups,
        home: normalizedIncomingLineups.home,
        away: normalizedIncomingLineups.away,
      }
    : normalizedExistingLineups;
  const needsLineupResolution = payload.lineups !== undefined;
  const contexts = needsLineupResolution
    ? await buildTeamContexts(client, match as MatchContextRow, mergedIncomingLineups)
    : null;

  const resolvedLineups =
    payload.lineups !== undefined
      ? await resolvePersistedLineups(client, contexts!, mergedIncomingLineups)
      : normalizedExistingLineups;

  const resolvedEvents =
    payload.events !== undefined
      ? await resolveEventsForPersistence(client, match as MatchContextRow, mergedIncomingLineups, payload.events)
      : Array.isArray((match as any).events)
        ? ((match as any).events as unknown[]).map((row) => mapJsonEvent(row))
        : [];
  const existingClockSnapshotJsonEvent = Array.isArray((match as any).events)
    ? findClockSnapshotJsonEvent((match as any).events as unknown[])
    : null;
  const nextJsonEvents = normalizedClock
    ? [...resolvedEvents, buildClockSnapshotJsonEvent(normalizedClock)]
    : payload.clock === undefined && existingClockSnapshotJsonEvent
      ? [...resolvedEvents, existingClockSnapshotJsonEvent]
      : resolvedEvents;

  const shouldPersistHomeDivisionId =
    !normalizeText((match as any).home_division_id) && Boolean(contexts.home.divisionId);
  const shouldPersistAwayDivisionId =
    !normalizeText((match as any).away_division_id) && Boolean(contexts.away.divisionId);

  let persistedLineups = false;
  let persistedClock = payload.clock === undefined;

  if (payload.lineups !== undefined) {
    const { error: lineupsUpdateError } = await client
      .from('matches')
      .update({ lineups: resolvedLineups })
      .eq('id', matchId);

    if (!lineupsUpdateError) {
      persistedLineups = true;
    } else if (!isMissingColumnError(lineupsUpdateError, 'lineups')) {
      throw new Error(lineupsUpdateError.message || 'No se pudieron guardar las alineaciones del partido.');
    }
  }

  if (shouldPersistHomeDivisionId) {
    const { error: divisionUpdateError } = await client
      .from('matches')
      .update({ home_division_id: contexts.home.divisionId })
      .eq('id', matchId);

    if (divisionUpdateError && !isMissingColumnError(divisionUpdateError, 'home_division_id')) {
      throw new Error(divisionUpdateError.message || 'No se pudo guardar la division local del partido.');
    }
  }

  if (shouldPersistAwayDivisionId) {
    const { error: divisionUpdateError } = await client
      .from('matches')
      .update({ away_division_id: contexts.away.divisionId })
      .eq('id', matchId);

    if (divisionUpdateError && !isMissingColumnError(divisionUpdateError, 'away_division_id')) {
      throw new Error(divisionUpdateError.message || 'No se pudo guardar la division visitante del partido.');
    }
  }

  if (payload.events !== undefined && supportsRelationalEvents) {
    const { data: existingRows, error: existingRowsError } = await client
      .from('match_events')
      .select('id, event_type')
      .eq('match_id', matchId);

    if (existingRowsError) {
      throw new Error(existingRowsError.message || 'No se pudieron preparar los eventos del partido.');
    }

    const eventRows = resolvedEvents.map((event) => mapEventToInsert(match, event));
    if (eventRows.length > 0) {
      const { error: upsertError } = await client
        .from('match_events')
        .upsert(eventRows, { onConflict: 'id' });

      if (upsertError) {
        throw new Error(upsertError.message || 'No se pudieron guardar los eventos del partido.');
      }
    }

    const incomingIds = new Set(eventRows.map((row) => String(row.id)));
    const idsToDelete = (existingRows || [])
      .filter((row: { id: string; event_type?: string | null }) => normalizeText(row.event_type) !== CLOCK_SNAPSHOT_EVENT_TYPE)
      .map((row: { id: string }) => String(row.id))
      .filter((id: string) => !incomingIds.has(id));

    if (idsToDelete.length > 0) {
      const { error: deleteError } = await client
        .from('match_events')
        .delete()
        .in('id', idsToDelete);

      if (deleteError) {
        throw new Error(deleteError.message || 'No se pudieron depurar los eventos antiguos del partido.');
      }
    }
  }

  if (payload.eventPatch !== undefined && supportsRelationalEvents) {
    const upsertEvents = Array.isArray(payload.eventPatch?.upsert) ? payload.eventPatch.upsert : [];
    const deleteIds = Array.isArray(payload.eventPatch?.deleteIds)
      ? payload.eventPatch.deleteIds.map((id) => normalizeText(id)).filter(Boolean)
      : [];

    if (upsertEvents.length > 0) {
      const resolvedUpsertEvents = await resolveEventsForPersistence(
        client,
        match as MatchContextRow,
        mergedIncomingLineups,
        upsertEvents,
      );
      const eventRows = resolvedUpsertEvents.map((event) => mapEventToInsert(match, event));
      const { error: upsertError } = await client
        .from('match_events')
        .upsert(eventRows, { onConflict: 'id' });

      if (upsertError) {
        throw new Error(upsertError.message || 'No se pudo guardar el evento del partido.');
      }
    }

    if (deleteIds.length > 0) {
      const { error: deleteError } = await client
        .from('match_events')
        .delete()
        .eq('match_id', matchId)
        .in('id', deleteIds);

      if (deleteError) {
        throw new Error(deleteError.message || 'No se pudieron eliminar eventos del partido.');
      }
    }
  }

  if (payload.clock !== undefined && supportsRelationalEvents) {
    const { data: existingClockRows, error: existingClockRowsError } = await client
      .from('match_events')
      .select('id')
      .eq('match_id', matchId)
      .eq('event_type', CLOCK_SNAPSHOT_EVENT_TYPE);

    if (existingClockRowsError) {
      throw new Error(existingClockRowsError.message || 'No se pudo preparar el reloj del partido.');
    }

    const clockIdsToDelete = (existingClockRows || [])
      .map((row: { id: string }) => String(row.id))
      .filter(Boolean);

    if (clockIdsToDelete.length > 0) {
      const { error: deleteClockError } = await client
        .from('match_events')
        .delete()
        .in('id', clockIdsToDelete);

      if (deleteClockError) {
        throw new Error(deleteClockError.message || 'No se pudo limpiar el reloj anterior del partido.');
      }
    }

    if (normalizedClock) {
      const { error: insertClockError } = await client
        .from('match_events')
        .insert(buildClockSnapshotRelationalEvent(match, normalizedClock));

      if (insertClockError) {
        throw new Error(insertClockError.message || 'No se pudo guardar el reloj del partido.');
      }
    }

    persistedClock = true;
  }

  if ((payload.events !== undefined || (payload.clock !== undefined && !supportsRelationalEvents)) && supportsEventsColumn) {
    const { error: eventsUpdateError } = await client
      .from('matches')
      .update({ events: nextJsonEvents })
      .eq('id', matchId);

    if (eventsUpdateError) {
      throw new Error(eventsUpdateError.message || 'No se pudieron sincronizar los eventos del partido.');
    }

    if (payload.clock !== undefined) {
      persistedClock = true;
    }
  }

  return {
    persistedLineups,
    persistedClock,
    lineups: payload.lineups !== undefined ? resolvedLineups : normalizedExistingLineups,
  };
}

export function getEmptyMatchCenterLineups() {
  return { ...EMPTY_LINEUPS };
}

