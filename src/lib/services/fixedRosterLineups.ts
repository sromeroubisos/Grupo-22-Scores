/**
 * Derives match lineups from a team's fixed tournament roster
 * (`season_rosters` + `roster_memberships`).
 *
 * Used only when `getFixedRosterConfig(...).enabled` is true. Returns `null`
 * (so callers fall back to the current per-match behavior) when the tournament
 * has no season, the team has no roster, or the roster tables are not yet
 * present on the remote (migration not applied — read errors degrade to null).
 */

import { isMissingTableError } from '@/lib/utils/supabaseSchema';
import {
  getFixedRosterConfig,
  type FixedRosterConfig,
  DEFAULT_FIXED_ROSTER_CONFIG,
} from '@/lib/tournament/fixedRoster';

type DbClient = any;

/** Raw lineup player, intentionally shaped so `normalizeLineups` can normalize it. */
export type DerivedLineupPlayer = {
  id: string;
  number: number | null;
  name: string;
  position: string;
  role: string | undefined;
};

export type DerivedFixedRosterLineups = {
  home: DerivedLineupPlayer[];
  away: DerivedLineupPlayer[];
  /** Marker so the editor/UI can show "auto-cargado del plantel del torneo". */
  fixedRosterDerived: true;
};

type MatchTeamContext = {
  seasonId: string | null;
  homeClubId: string | null;
  homeTeamId: string | null;
  awayClubId: string | null;
  awayTeamId: string | null;
};

const SUBSTITUTE_ROLE_TOKENS = new Set(['suplente', 'substitute', 'sub', 'bench', 'banco']);
const STARTER_ROLE_TOKENS = new Set(['titular', 'starter']);

function text(value: unknown): string | null {
  if (typeof value !== 'string') return value == null ? null : String(value);
  const trimmed = value.trim();
  return trimmed || null;
}

function resolvePlayerName(person: unknown): string {
  if (!person || typeof person !== 'object') return '';
  const p = person as Record<string, unknown>;
  return (
    text(p.full_name) ||
    text(p.name) ||
    text(`${text(p.first_name) || ''} ${text(p.last_name) || ''}`.trim()) ||
    ''
  );
}

function mapMembershipRole(role: unknown): string | undefined {
  const normalized = text(role)?.toLowerCase();
  if (!normalized) return undefined;
  if (SUBSTITUTE_ROLE_TOKENS.has(normalized)) return 'substitute';
  if (STARTER_ROLE_TOKENS.has(normalized)) return 'starter';
  return undefined;
}

/**
 * Finds the official roster for a team in a season. Prefers a team-scoped
 * roster (`team_id`), falling back to a club-scoped one (`team_id IS NULL`),
 * mirroring the `season_rosters_unique_*` indexes. Status priority:
 * active > draft > locked. Archived rosters are ignored.
 */
export async function resolveSeasonRosterForTeam(
  client: DbClient,
  seasonId: string,
  clubId: string | null,
  teamId: string | null,
): Promise<{ id: string; status: string } | null> {
  if (!seasonId || (!clubId && !teamId)) return null;

  let query = client
    .from('season_rosters')
    .select('id, status, team_id, club_id, roster_type')
    .eq('season_id', seasonId)
    .eq('roster_type', 'official')
    .neq('status', 'archived');

  if (clubId) {
    query = query.eq('club_id', clubId);
  }

  const { data, error } = await query;
  if (error) {
    if (isMissingTableError(error, 'season_rosters')) return null;
    console.error('[fixedRosterLineups] season_rosters lookup failed:', error);
    return null;
  }

  const rows: any[] = Array.isArray(data) ? data : [];
  if (rows.length === 0) return null;

  const statusRank = (status: unknown): number => {
    switch (text(status)?.toLowerCase()) {
      case 'active':
        return 0;
      case 'draft':
        return 1;
      case 'locked':
        return 2;
      default:
        return 3;
    }
  };

  const teamScoped = teamId ? rows.filter((row) => text(row.team_id) === teamId) : [];
  const clubScoped = rows.filter((row) => !text(row.team_id));
  const candidates = teamScoped.length > 0 ? teamScoped : clubScoped.length > 0 ? clubScoped : rows;

  candidates.sort((a, b) => statusRank(a.status) - statusRank(b.status));
  const chosen = candidates[0];
  return chosen ? { id: String(chosen.id), status: String(chosen.status) } : null;
}

async function loadRosterPlayers(
  client: DbClient,
  rosterId: string,
): Promise<DerivedLineupPlayer[]> {
  const { data, error } = await client
    .from('roster_memberships')
    .select(
      'id, player_id, status, jersey_number, position, role, created_at, ' +
        'player:people(id, first_name, last_name, full_name, name, position)',
    )
    .eq('roster_id', rosterId)
    .eq('status', 'active')
    .order('jersey_number', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true });

  if (error) {
    if (isMissingTableError(error, 'roster_memberships')) return [];
    console.error('[fixedRosterLineups] roster_memberships lookup failed:', error);
    return [];
  }

  const rows: any[] = Array.isArray(data) ? data : [];
  return rows
    .map((row): DerivedLineupPlayer | null => {
      const person = Array.isArray(row.player) ? row.player[0] : row.player;
      const name = resolvePlayerName(person);
      const playerId = text(row.player_id) || text(person?.id);
      if (!playerId || !name) return null;
      const jersey =
        typeof row.jersey_number === 'number' && Number.isFinite(row.jersey_number)
          ? Math.trunc(row.jersey_number)
          : null;
      return {
        id: playerId,
        number: jersey,
        name,
        position: text(row.position) || text(person?.position) || '',
        role: mapMembershipRole(row.role),
      };
    })
    .filter((p): p is DerivedLineupPlayer => p !== null);
}

/** Fecha (YYYY-MM-DD) contra la que se mide si un jugador sigue en el club. */
function toDateOnly(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : null;
}

/**
 * EL PLANTEL ACTUAL DEL CLUB (`team_memberships`), a la fecha del partido: los
 * que ya habian llegado (`joined_at`) y todavia no se fueron (`left_at`). Es lo
 * que se muestra cuando el equipo no armo un plantel para esta edicion.
 *
 * Orden: por numero si lo tienen, si no por nombre — el mismo de la ficha del
 * club, asi la planilla y la ficha se leen igual.
 */
export async function loadCurrentClubSquad(
  client: DbClient,
  clubId: string,
  asOfDate: string | null,
): Promise<DerivedLineupPlayer[]> {
  if (!clubId) return [];
  const asOf = asOfDate ?? new Date().toISOString().slice(0, 10);
  const { data, error } = await client
    .from('team_memberships')
    .select(
      'person_id, position, jersey_number, status, joined_at, left_at, ' +
        'person:people(id, first_name, last_name, full_name, name, position)',
    )
    .eq('club_id', clubId)
    .neq('status', 'inactive')
    .or(`left_at.is.null,left_at.gte.${asOf}`)
    .limit(200);

  if (error) {
    if (isMissingTableError(error, 'team_memberships')) return [];
    console.error('[fixedRosterLineups] team_memberships lookup failed:', error);
    return [];
  }

  const seen = new Set<string>();
  const players: DerivedLineupPlayer[] = [];
  for (const row of (Array.isArray(data) ? data : []) as any[]) {
    const joined = toDateOnly(row.joined_at);
    if (joined && joined > asOf) continue;
    const person = Array.isArray(row.person) ? row.person[0] : row.person;
    const name = resolvePlayerName(person);
    const playerId = text(person?.id) || text(row.person_id);
    if (!playerId || !name || seen.has(playerId)) continue;
    seen.add(playerId);
    const jersey =
      typeof row.jersey_number === 'number' && Number.isFinite(row.jersey_number)
        ? Math.trunc(row.jersey_number)
        : null;
    players.push({
      id: playerId,
      number: jersey,
      name,
      position: text(row.position) || text(person?.position) || '',
      role: undefined,
    });
  }

  players.sort((a, b) => {
    if (a.number !== null && b.number !== null) return a.number - b.number;
    if (a.number !== null) return -1;
    if (b.number !== null) return 1;
    return a.name.localeCompare(b.name, 'es');
  });
  return players;
}

/**
 * Los primeros `startersCount` arrancan y el resto va al banco, salvo que el
 * plantel ya diga quien es titular. Sin `startersCount` no se toca nada.
 */
function assignDefaultRoles(players: DerivedLineupPlayer[], startersCount: number | null): DerivedLineupPlayer[] {
  if (!startersCount || players.some((player) => player.role)) return players;
  return players.map((player, index) => ({
    ...player,
    role: index < startersCount ? 'starter' : 'substitute',
  }));
}

export type DeriveFixedRosterOptions = {
  /**
   * Si un equipo no tiene plantel de la edicion, usar el plantel actual del
   * club. Solo para mostrar una planilla VACIA: nunca pisa lo que el operador
   * ya cargo a mano en el partido.
   */
  clubSquadFallback?: boolean;
  /** Fecha del partido, para leer el plantel del club a ese dia. */
  matchDate?: string | null;
};

/**
 * Builds `{ home, away }` lineups from each team's fixed roster, or `null` when
 * the feature can't apply for this match (no roster either side, tables
 * missing). Partial result is allowed: a side with no roster is `[]`.
 *
 * Sin temporada (o sin plantel de la edicion) y con `clubSquadFallback`, cada
 * lado cae al plantel actual de su club.
 */
export async function deriveFixedRosterLineups(
  client: DbClient,
  match: MatchTeamContext,
  cfg: FixedRosterConfig,
  options: DeriveFixedRosterOptions = {},
): Promise<DerivedFixedRosterLineups | null> {
  const seasonId = text(match.seasonId);
  if (!seasonId && !options.clubSquadFallback) return null;

  const cap =
    typeof cfg.rosterSize === 'number' && cfg.rosterSize > 0 ? cfg.rosterSize : null;
  const matchDate = toDateOnly(options.matchDate);

  const loadSide = async (clubId: string | null, teamId: string | null): Promise<DerivedLineupPlayer[]> => {
    const roster = seasonId ? await resolveSeasonRosterForTeam(client, seasonId, clubId, teamId) : null;
    const fromRoster = roster ? await loadRosterPlayers(client, roster.id) : [];
    if (fromRoster.length > 0 || !options.clubSquadFallback || !clubId) return fromRoster;
    const squad = await loadCurrentClubSquad(client, clubId, matchDate);
    // Solo si el plantel del club ENTRA en el del torneo. Un club con 61 fichas
    // no tiene "su" doce: cortar por orden seria inventar la convocatoria, y la
    // planilla queda vacia para que la arme el gestor.
    return cap && squad.length > cap ? [] : squad;
  };

  const [homeAll, awayAll] = await Promise.all([
    loadSide(text(match.homeClubId), text(match.homeTeamId)),
    loadSide(text(match.awayClubId), text(match.awayTeamId)),
  ]);

  const home = assignDefaultRoles(cap ? homeAll.slice(0, cap) : homeAll, cfg.startersCount);
  const away = assignDefaultRoles(cap ? awayAll.slice(0, cap) : awayAll, cfg.startersCount);

  if (home.length === 0 && away.length === 0) return null;

  return { home, away, fixedRosterDerived: true };
}

/**
 * Loads the fixed-roster config for a match's tournament/season. Reads only the
 * JSONB columns; any read failure (missing column/table) degrades to disabled.
 */
export async function loadFixedRosterConfigForMatch(
  client: DbClient,
  tournamentId: string | null,
  seasonId: string | null,
): Promise<FixedRosterConfig> {
  const tid = text(tournamentId);
  const sid = text(seasonId);
  if (!tid && !sid) return { ...DEFAULT_FIXED_ROSTER_CONFIG };

  try {
    const [tournamentRes, seasonRes] = await Promise.all([
      tid
        ? client.from('tournaments').select('ruleset').eq('id', tid).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      sid
        ? client
            .from('tournament_seasons')
            .select('settings')
            .eq('id', sid)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

    const season = seasonRes?.error ? null : seasonRes?.data ?? null;
    const tournament = tournamentRes?.error ? null : tournamentRes?.data ?? null;
    return getFixedRosterConfig(
      season ? { settings: (season as any).settings } : null,
      tournament ? { ruleset: (tournament as any).ruleset } : null,
    );
  } catch (error) {
    console.error('[fixedRosterLineups] failed to load fixed-roster config:', error);
    return { ...DEFAULT_FIXED_ROSTER_CONFIG };
  }
}

/**
 * Resolves the `order_index` of the phase a match belongs to (directly via
 * `phase_id` or indirectly via its round). Returns null when unknown — callers
 * must treat "unknown phase order" as NOT locked-by-instance.
 */
export async function resolveMatchPhaseOrderIndex(
  client: DbClient,
  phaseId: string | null,
  roundId: string | null,
): Promise<number | null> {
  let resolvedPhaseId = text(phaseId);
  try {
    if (!resolvedPhaseId && text(roundId)) {
      const { data: round, error } = await client
        .from('tournament_rounds')
        .select('phase_id')
        .eq('id', text(roundId))
        .maybeSingle();
      if (error || !round) return null;
      resolvedPhaseId = text(round.phase_id);
    }
    if (!resolvedPhaseId) return null;

    const { data: phase, error } = await client
      .from('tournament_phases')
      .select('order_index')
      .eq('id', resolvedPhaseId)
      .maybeSingle();
    if (error || !phase) return null;
    return typeof phase.order_index === 'number' ? phase.order_index : null;
  } catch (error) {
    console.error('[fixedRosterLineups] failed to resolve phase order index:', error);
    return null;
  }
}
