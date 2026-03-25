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

export type MatchCenterEventInput = {
  id?: string;
  minute?: number | null;
  type?: string | null;
  team?: 'home' | 'away' | null;
  playerName?: string | null;
  detail?: string | null;
};

export type MatchCenterLineupsInput = {
  home?: unknown[];
  away?: unknown[];
} | null | undefined;

const EMPTY_LINEUPS = { home: [] as unknown[], away: [] as unknown[] };

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

function normalizeTeam(value: unknown): 'home' | 'away' | null {
  return value === 'home' || value === 'away' ? value : null;
}

function normalizeLineups(lineups: MatchCenterLineupsInput) {
  return {
    home: Array.isArray(lineups?.home) ? lineups.home : [],
    away: Array.isArray(lineups?.away) ? lineups.away : [],
  };
}

function normalizeEventInput(event: MatchCenterEventInput) {
  return {
    id: event.id,
    minute: Number.isFinite(event.minute) ? Math.max(0, Math.trunc(event.minute as number)) : 0,
    type: typeof event.type === 'string' && event.type.trim() ? event.type.trim() : 'note',
    team: normalizeTeam(event.team),
    playerName: typeof event.playerName === 'string' ? event.playerName.trim() : '',
    detail: typeof event.detail === 'string' ? event.detail.trim() : '',
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
    id: row?.id || crypto.randomUUID(),
    minute: Number.isFinite(row?.minute) ? Number(row.minute) : 0,
    type: typeof row?.event_type === 'string' && row.event_type.trim() ? row.event_type : 'note',
    team,
    playerName:
      typeof row?.player_name === 'string' && row.player_name.trim()
        ? row.player_name
        : typeof (details as Record<string, unknown>).playerName === 'string'
          ? ((details as Record<string, unknown>).playerName as string)
          : '',
    detail:
      typeof (details as Record<string, unknown>).detail === 'string'
        ? ((details as Record<string, unknown>).detail as string)
        : '',
  };
}

function mapEventToInsert(
  match: { id: string; home_club_id?: string | null; away_club_id?: string | null },
  event: MatchCenterEventInput,
) {
  const normalized = normalizeEventInput(event);

  return {
    match_id: match.id,
    club_id:
      normalized.team === 'home'
        ? match.home_club_id || null
        : normalized.team === 'away'
          ? match.away_club_id || null
          : null,
    player_name: normalized.playerName || null,
    event_type: normalized.type,
    minute: normalized.minute,
    details: {
      detail: normalized.detail || null,
      team: normalized.team,
      legacy_id: normalized.id || null,
    },
  };
}

export async function fetchMatchCenterMatch(client: SupabaseLike, matchId: string) {
  const { data, error } = await client
    .from('matches')
    .select(`
      *,
      homeClub:home_club_id (id, name, short_name, logo_url, primary_color),
      awayClub:away_club_id (id, name, short_name, logo_url, primary_color),
      tournament:tournament_id (id, name)
    `)
    .eq('id', matchId)
    .single();

  if (error || !data) {
    return { data: null, error };
  }

  let events = Array.isArray((data as any).events) ? (data as any).events : null;

  if (!events) {
    const { data: eventRows, error: eventsError } = await client
      .from('match_events')
      .select('id, club_id, player_name, event_type, minute, details')
      .eq('match_id', matchId)
      .order('minute', { ascending: true });

    if (!eventsError) {
      events = (eventRows || []).map((row: any) => mapStoredEvent(row, data));
    } else if (!isMissingMatchEventsTableError(eventsError)) {
      console.error('[matchCenterService] Failed to load match events:', eventsError);
      events = [];
    } else {
      events = [];
    }
  }

  const homeClubRaw = (data as any).homeClub;
  const awayClubRaw = (data as any).awayClub;

  return {
    data: {
      ...data,
      // Normalize snake_case DB columns to camelCase for the frontend
      dateTime: (data as any).date_time ?? null,
      tournamentId: (data as any).tournament_id ?? null,
      homeClubId: (data as any).home_club_id ?? null,
      awayClubId: (data as any).away_club_id ?? null,
      roundLabel: (data as any).round_label ?? null,
      roundId: (data as any).round_id ?? null,
      homeClub: homeClubRaw ? { ...homeClubRaw, logo: homeClubRaw.logo_url ?? null } : null,
      awayClub: awayClubRaw ? { ...awayClubRaw, logo: awayClubRaw.logo_url ?? null } : null,
      events: Array.isArray(events) ? events : [],
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
    .select('id, home_club_id, away_club_id')
    .eq('id', matchId)
    .single();

  if (matchError || !match) {
    throw new Error('El partido que intentas actualizar no existe.');
  }

  const [supportsEventsColumn, supportsLineupsColumn] = await Promise.all([
    payload.events !== undefined ? supportsMatchesColumn(client, 'events') : Promise.resolve(false),
    payload.lineups !== undefined ? supportsMatchesColumn(client, 'lineups') : Promise.resolve(false),
  ]);

  const directUpdates: Record<string, unknown> = {};

  if (payload.events !== undefined && supportsEventsColumn) {
    directUpdates.events = payload.events.map(normalizeEventInput);
  }

  if (payload.lineups !== undefined && supportsLineupsColumn) {
    directUpdates.lineups = normalizeLineups(payload.lineups);
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

  if (payload.events !== undefined && !supportsEventsColumn) {
    const { error: deleteError } = await client
      .from('match_events')
      .delete()
      .eq('match_id', matchId);

    if (deleteError && !isMissingMatchEventsTableError(deleteError)) {
      throw new Error(deleteError.message || 'No se pudieron reemplazar los eventos del partido.');
    }

    if (deleteError && isMissingMatchEventsTableError(deleteError)) {
      throw new Error('No hay almacenamiento disponible para los eventos del partido.');
    }

    const eventRows = payload.events.map((event) => mapEventToInsert(match, event));
    if (eventRows.length > 0) {
      const { error: insertError } = await client
        .from('match_events')
        .insert(eventRows);

      if (insertError) {
        throw new Error(insertError.message || 'No se pudieron guardar los eventos del partido.');
      }
    }
  }

  return {
    persistedLineups: supportsLineupsColumn,
    lineups: normalizeLineups(payload.lineups),
  };
}

export function getEmptyMatchCenterLineups() {
  return { ...EMPTY_LINEUPS };
}
