/* eslint-disable @typescript-eslint/no-explicit-any */
import { isMissingColumnError } from '@/lib/utils/supabaseSchema';

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
  category?: string | null;
  date_time?: string | null;
  events?: unknown;
  lineups?: unknown;
  home_club_id?: string | null;
  away_club_id?: string | null;
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

type ClubRosterCache = {
  entries: ClubRosterEntry[];
  byId: Map<string, ClubRosterEntry>;
  byName: Map<string, ClubRosterEntry>;
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
  detail?: string | null;
};

export type MatchCenterLineupsInput = {
  home?: unknown[];
  away?: unknown[];
} | null | undefined;

const EMPTY_LINEUPS = { home: [] as PersistedLineupPlayer[], away: [] as PersistedLineupPlayer[] };
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
  return {
    home: Array.isArray(source.home) ? normalizeLineupCollection(source.home) : [],
    away: Array.isArray(source.away) ? normalizeLineupCollection(source.away) : [],
  };
}

function normalizeEventInput(event: MatchCenterEventInput) {
  return {
    id: normalizeEventId(event.id),
    minute: Number.isFinite(event.minute) ? Math.max(0, Math.trunc(event.minute as number)) : 0,
    type: normalizeText(event.type) || 'note',
    team: normalizeTeam(event.team),
    playerId: normalizeText(event.playerId) || null,
    playerName: normalizeText(event.playerName),
    detail: normalizeText(event.detail),
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
    detail: normalizeText((details as Record<string, unknown>).detail),
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
    detail: normalizeText(source.detail) || normalizeText(source.description),
  });
}

function mapEventToInsert(
  match: { id: string; home_club_id?: string | null; away_club_id?: string | null },
  event: ReturnType<typeof normalizeEventInput>,
) {
  return {
    id: event.id,
    match_id: match.id,
    club_id:
      event.team === 'home'
        ? match.home_club_id || null
        : event.team === 'away'
          ? match.away_club_id || null
          : null,
    player_id: event.playerId || null,
    player_name: event.playerName || null,
    event_type: event.type,
    minute: event.minute,
    details: {
      detail: event.detail || null,
      team: event.team,
      legacy_id: event.id || null,
      playerId: event.playerId || null,
      playerName: event.playerName || null,
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

  if (rolesRes.error) {
    throw new Error(rolesRes.error.message || 'No se pudo cargar el plantel del club.');
  }

  if (peopleRes.error) {
    throw new Error(peopleRes.error.message || 'No se pudieron cargar las personas del club.');
  }

  if (squadRes.error) {
    throw new Error(squadRes.error.message || 'No se pudo cargar la composicion del plantel.');
  }

  const squadByPerson = new Map<string, any>(
    (squadRes.data || []).map((row: any) => [String(row.person_id), row]),
  );

  const entries: ClubRosterEntry[] = [];
  const seen = new Set<string>();

  for (const row of rolesRes.data || []) {
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

  for (const person of peopleRes.data || []) {
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
  if (!scoped.error && Array.isArray(scoped.data) && scoped.data.length > 0) {
    return scoped.data as DivisionRow[];
  }

  const fallback = await buildQuery(null);
  if (fallback.error) {
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
          id: undefined,
          squadMemberId: null,
          divisionId: context.divisionId,
        });
        continue;
      }

      const rosterEntry = await ensurePlayerInContext(client, context, player, index);
      resolved[team].push({
        ...player,
        id: rosterEntry?.personId || undefined,
        name: rosterEntry?.name || cleanedName,
        position: normalizeText(player.position) || rosterEntry?.position || '',
        squadMemberId: rosterEntry?.squadMemberId || null,
        divisionId: context.divisionId,
      });
    }
  }

  return resolved;
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

    if (!context || !event.playerName) {
      resolved.push(event);
      continue;
    }

    const nameKey = normalizeNameKey(event.playerName);
    const preferredId = event.playerId || context.lineupPlayerIds.get(nameKey) || null;
    const existing =
      (preferredId ? context.roster.byId.get(preferredId) : null) ||
      context.roster.byName.get(nameKey) ||
      null;

    if (existing) {
      context.lineupPlayerIds.set(nameKey, existing.personId);
      resolved.push({
        ...event,
        playerId: existing.personId,
        playerName: existing.name,
      });
      continue;
    }

    const created = await ensurePlayerInContext(
      client,
      context,
      {
        id: event.playerId || undefined,
        number: 0,
        name: event.playerName,
        position: '',
        role: '',
      },
      999,
    );

    resolved.push({
      ...event,
      playerId: created?.personId || null,
      playerName: created?.name || event.playerName,
    });
  }

  return resolved;
}

export async function fetchMatchCenterMatch(client: SupabaseLike, matchId: string) {
  const { data, error } = await client
    .from('matches')
    .select(`
      *,
      homeClub:home_club_id (id, name, short_name, logo_url, primary_color),
      awayClub:away_club_id (id, name, short_name, logo_url, primary_color),
      tournament:tournament_id (id, name, logo_url, sport_id)
    `)
    .eq('id', matchId)
    .single();

  if (error || !data) {
    return { data: null, error };
  }

  let events: ReturnType<typeof normalizeEventInput>[] = [];
  let loadedFromRelationalTable = false;

  const { data: eventRows, error: eventsError } = await client
    .from('match_events')
    .select('id, club_id, player_id, player_name, event_type, minute, details')
    .eq('match_id', matchId)
    .order('minute', { ascending: true });

  if (!eventsError) {
    loadedFromRelationalTable = true;
    events = (eventRows || []).map((row: any) => mapStoredEvent(row, data));
  } else if (!isMissingMatchEventsTableError(eventsError)) {
    console.error('[matchCenterService] Failed to load match events:', eventsError);
  }

  if ((!loadedFromRelationalTable || events.length === 0) && Array.isArray((data as any).events)) {
    events = ((data as any).events as unknown[]).map((row) => mapJsonEvent(row));
  }

  const homeClubRaw = (data as any).homeClub;
  const awayClubRaw = (data as any).awayClub;
  const tournamentRaw = (data as any).tournament;

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
      homeClub: homeClubRaw ? { ...homeClubRaw, logo: homeClubRaw.logo_url ?? null } : null,
      awayClub: awayClubRaw ? { ...awayClubRaw, logo: awayClubRaw.logo_url ?? null } : null,
      tournament: tournamentRaw
        ? {
            ...tournamentRaw,
            logo: tournamentRaw.logo_url ?? null,
            sportId: tournamentRaw.sport_id ?? null,
          }
        : null,
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
    lineups?: MatchCenterLineupsInput;
  },
) {
  const { data: match, error: matchError } = await client
    .from('matches')
    .select('*')
    .eq('id', matchId)
    .single();

  if (matchError || !match) {
    throw new Error('El partido que intentas actualizar no existe.');
  }

  const [supportsEventsColumn, supportsLineupsColumn, supportsRelationalEvents] = await Promise.all([
    payload.events !== undefined ? supportsMatchesColumn(client, 'events') : Promise.resolve(false),
    payload.lineups !== undefined ? supportsMatchesColumn(client, 'lineups') : Promise.resolve(false),
    payload.events !== undefined ? supportsMatchEventsTable(client) : Promise.resolve(false),
  ]);

  if (payload.lineups !== undefined && !supportsLineupsColumn) {
    throw new Error('No hay almacenamiento disponible para las alineaciones del partido. Ejecuta la migracion que restaura la columna "lineups".');
  }

  if (payload.events !== undefined && !supportsRelationalEvents && !supportsEventsColumn) {
    throw new Error('No hay almacenamiento disponible para los eventos del partido.');
  }

  const normalizedExistingLineups = normalizeLineups((match as any).lineups);
  const baseLineups = payload.lineups !== undefined ? normalizeLineups(payload.lineups) : normalizedExistingLineups;
  const contexts = await buildTeamContexts(client, match as MatchContextRow, baseLineups);

  const resolvedLineups =
    payload.lineups !== undefined
      ? await resolvePersistedLineups(client, contexts, payload.lineups)
      : normalizedExistingLineups;

  const resolvedEvents =
    payload.events !== undefined
      ? await resolvePersistedEvents(client, contexts, payload.events)
      : Array.isArray((match as any).events)
        ? ((match as any).events as unknown[]).map((row) => mapJsonEvent(row))
        : [];

  const shouldPersistHomeDivisionId =
    !normalizeText((match as any).home_division_id) && Boolean(contexts.home.divisionId);
  const shouldPersistAwayDivisionId =
    !normalizeText((match as any).away_division_id) && Boolean(contexts.away.divisionId);

  const [supportsHomeDivisionColumn, supportsAwayDivisionColumn] = await Promise.all([
    shouldPersistHomeDivisionId ? supportsMatchesColumn(client, 'home_division_id') : Promise.resolve(false),
    shouldPersistAwayDivisionId ? supportsMatchesColumn(client, 'away_division_id') : Promise.resolve(false),
  ]);

  const directUpdates: Record<string, unknown> = {};

  if (payload.lineups !== undefined && supportsLineupsColumn) {
    directUpdates.lineups = resolvedLineups;
  }

  if (shouldPersistHomeDivisionId && supportsHomeDivisionColumn) {
    directUpdates.home_division_id = contexts.home.divisionId;
  }

  if (shouldPersistAwayDivisionId && supportsAwayDivisionColumn) {
    directUpdates.away_division_id = contexts.away.divisionId;
  }

  if (Object.keys(directUpdates).length > 0) {
    const { error: updateError } = await client
      .from('matches')
      .update(directUpdates)
      .eq('id', matchId);

    if (updateError) {
      throw new Error(updateError.message || 'No se pudo actualizar el partido.');
    }
  }

  if (payload.events !== undefined && supportsRelationalEvents) {
    const { data: existingRows, error: existingRowsError } = await client
      .from('match_events')
      .select('id')
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

  if (payload.events !== undefined && supportsEventsColumn) {
    const { error: eventsUpdateError } = await client
      .from('matches')
      .update({ events: resolvedEvents })
      .eq('id', matchId);

    if (eventsUpdateError) {
      throw new Error(eventsUpdateError.message || 'No se pudieron sincronizar los eventos del partido.');
    }
  }

  return {
    persistedLineups: supportsLineupsColumn,
    lineups: payload.lineups !== undefined ? resolvedLineups : normalizedExistingLineups,
  };
}

export function getEmptyMatchCenterLineups() {
  return { ...EMPTY_LINEUPS };
}

