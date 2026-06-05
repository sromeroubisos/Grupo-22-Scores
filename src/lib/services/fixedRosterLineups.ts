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

/**
 * Builds `{ home, away }` lineups from each team's fixed roster, or `null` when
 * the feature can't apply for this match (no season, no roster either side,
 * tables missing). Partial result is allowed: a side with no roster is `[]`.
 */
export async function deriveFixedRosterLineups(
  client: DbClient,
  match: MatchTeamContext,
  cfg: FixedRosterConfig,
): Promise<DerivedFixedRosterLineups | null> {
  const seasonId = text(match.seasonId);
  if (!seasonId) return null;

  const cap =
    typeof cfg.rosterSize === 'number' && cfg.rosterSize > 0 ? cfg.rosterSize : null;

  const [homeRoster, awayRoster] = await Promise.all([
    resolveSeasonRosterForTeam(
      client,
      seasonId,
      text(match.homeClubId),
      text(match.homeTeamId),
    ),
    resolveSeasonRosterForTeam(
      client,
      seasonId,
      text(match.awayClubId),
      text(match.awayTeamId),
    ),
  ]);

  if (!homeRoster && !awayRoster) return null;

  const [homeAll, awayAll] = await Promise.all([
    homeRoster ? loadRosterPlayers(client, homeRoster.id) : Promise.resolve([]),
    awayRoster ? loadRosterPlayers(client, awayRoster.id) : Promise.resolve([]),
  ]);

  const home = cap ? homeAll.slice(0, cap) : homeAll;
  const away = cap ? awayAll.slice(0, cap) : awayAll;

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
