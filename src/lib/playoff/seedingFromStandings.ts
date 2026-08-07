/**
 * Playoff seeding derived from the group-stage (zonas) standings.
 *
 * Reuses the existing `seed` slot mechanism: instead of seeding the bracket
 * from a manual `tournament_participants.seed` column, the ordered list of
 * clubs (seed #1 .. #N) is computed from a source group-stage phase's
 * persisted `tournament_standings` rows according to a configurable format.
 * No new `participant_source` type, no schema change.
 *
 *  - 'overall'   : a single combined table across all zones (rank 1..N by
 *                  points/diff). Covers "clasificados del puesto 1 al 8
 *                  según tabla general".
 *  - 'zone_rank' : all 1.º (by zone order), then all 2.º, … Combined with the
 *                  bracket's standard pairing (1 vs N, 2 vs N-1, …) this yields
 *                  "1.º Zona A vs 2.º Zona B / mejor 1.º vs peor 2.º".
 */
import type { SupabaseClient } from '@supabase/supabase-js';

type Supa = SupabaseClient<any, any, any>;

import { applyStandingsTableType, supportsStandingsTableTypeColumn } from '@/lib/standings/tableTypeSupport';

export type PlayoffSeedingFormat = 'overall' | 'zone_rank';

export interface PlayoffSeedingConfig {
  sourcePhaseId: string;
  format: PlayoffSeedingFormat;
  /** Zone phase officially closed: stop auto-reseeding, freeze the bracket. */
  locked: boolean;
}

export function readPlayoffSeedingConfig(settings: unknown): PlayoffSeedingConfig | null {
  if (!settings || typeof settings !== 'object') return null;
  const raw = (settings as Record<string, unknown>).playoffSeeding;
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const sourcePhaseId = typeof r.sourcePhaseId === 'string' ? r.sourcePhaseId.trim() : '';
  if (!sourcePhaseId) return null;
  const format: PlayoffSeedingFormat = r.format === 'zone_rank' ? 'zone_rank' : 'overall';
  return { sourcePhaseId, format, locked: Boolean(r.locked) };
}

type StandingRow = {
  club_id: string | null;
  group_id: string | null;
  position: number | null;
  points: number | null;
  scored: number | null;
  conceded: number | null;
  stats: { difference?: number | null } | null;
};

/**
 * Ordered club ids (index 0 = seed #1) from a source phase's standings.
 * Returns [] when the source phase has no persisted standings yet (caller
 * then falls back to the manual-seed path).
 */
export async function computeSeedOrderFromStandings(
  supabase: Supa,
  params: {
    tournamentId: string;
    sourcePhaseId: string;
    seasonId?: string | null;
    format: PlayoffSeedingFormat;
  },
): Promise<string[]> {
  const { tournamentId, sourcePhaseId, seasonId, format } = params;

  let query = supabase
    .from('tournament_standings')
    .select('club_id, group_id, position, points, scored, conceded, stats')
    .eq('tournament_id', tournamentId)
    .eq('phase_id', sourcePhaseId);
  if (seasonId) query = query.eq('season_id', seasonId);

  // El sembrado se hace SIEMPRE con la tabla general: la de local y la de
  // visitante son una lectura del rendimiento, no el orden competitivo. Sin
  // filtrar, cada club entraría tres veces con tres posiciones distintas y los
  // cruces saldrían mezclados.
  query = applyStandingsTableType(query, await supportsStandingsTableTypeColumn());

  const { data: standings, error } = await query;
  if (error || !Array.isArray(standings) || standings.length === 0) return [];

  const rows = (standings as StandingRow[]).filter((r) => r.club_id);

  const diffOf = (r: StandingRow): number =>
    typeof r.stats?.difference === 'number'
      ? r.stats.difference
      : Number(r.scored ?? 0) - Number(r.conceded ?? 0);

  // Strongest-first comparator within the same position tier / overall.
  const byStrength = (a: StandingRow, b: StandingRow): number =>
    Number(b.points ?? 0) - Number(a.points ?? 0) ||
    diffOf(b) - diffOf(a) ||
    Number(b.scored ?? 0) - Number(a.scored ?? 0);

  if (format === 'overall') {
    return rows
      .slice()
      .sort(
        (a, b) =>
          Number(a.position ?? 999) - Number(b.position ?? 999) || byStrength(a, b),
      )
      .map((r) => r.club_id as string);
  }

  // zone_rank: group order minor, position tier major.
  const groupIds = Array.from(
    new Set(rows.map((r) => r.group_id ?? '__nogroup__')),
  );
  const { data: groups } = await supabase
    .from('tournament_groups')
    .select('id, order_index')
    .eq('phase_id', sourcePhaseId);
  const groupOrder = new Map<string, number>(
    (groups ?? []).map((g: any) => [String(g.id), Number(g.order_index ?? 0)]),
  );
  const orderedGroupIds = groupIds.sort(
    (a, b) => (groupOrder.get(a) ?? 999) - (groupOrder.get(b) ?? 999),
  );

  const byGroup = new Map<string, StandingRow[]>();
  for (const r of rows) {
    const key = r.group_id ?? '__nogroup__';
    const list = byGroup.get(key) ?? [];
    list.push(r);
    byGroup.set(key, list);
  }
  for (const list of byGroup.values()) {
    list.sort(
      (a, b) =>
        Number(a.position ?? 999) - Number(b.position ?? 999) || byStrength(a, b),
    );
  }

  const maxLen = Math.max(0, ...Array.from(byGroup.values()).map((l) => l.length));
  const ordered: string[] = [];
  for (let tier = 0; tier < maxLen; tier += 1) {
    for (const gid of orderedGroupIds) {
      const row = byGroup.get(gid)?.[tier];
      if (row?.club_id) ordered.push(row.club_id);
    }
  }
  return ordered;
}
