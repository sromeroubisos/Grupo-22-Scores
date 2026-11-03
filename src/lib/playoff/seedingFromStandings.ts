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

export type PlayoffSeedingFormat = 'overall' | 'zone_rank';

export interface PlayoffSeedingConfig {
  sourcePhaseId: string;
  format: PlayoffSeedingFormat;
  /** Zone phase officially closed: stop auto-reseeding, freeze the bracket. */
  locked: boolean;
  /** Cuántos clasifican de CADA zona. `null` = no se recorta por zona. */
  perGroup: number | null;
  /**
   * Desde qué puesto de cada zona se toma (1 = el primero). Copa Plata con los
   * 3.º y 4.º es `fromPosition: 3, perGroup: 2`.
   */
  fromPosition: number;
  /**
   * El cuadro se llena recién cuando TODOS los partidos de las zonas están
   * terminados: hasta entonces muestra "1.º Zona A" en vez de cruces provisorios.
   */
  untilFinished: boolean;
}

/** Lee y sanea la clasificación que llega de un body o de `settings.playoffSeeding`. */
export function parsePlayoffSeedingInput(raw: unknown, locked = false): PlayoffSeedingConfig {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const perGroupRaw = Math.floor(Number(r.perGroup));
  const fromRaw = Math.floor(Number(r.fromPosition));
  return {
    sourcePhaseId: typeof r.sourcePhaseId === 'string' ? r.sourcePhaseId.trim() : '',
    format: r.format === 'zone_rank' ? 'zone_rank' : 'overall',
    locked,
    perGroup: Number.isFinite(perGroupRaw) && perGroupRaw >= 1 ? perGroupRaw : null,
    fromPosition: Number.isFinite(fromRaw) && fromRaw >= 1 ? fromRaw : 1,
    untilFinished: r.untilFinished === true,
  };
}

/** Todos los partidos de la fase de zonas terminados (los cancelados no cuentan). */
export async function zonePhaseFinished(supabase: Supa, phaseId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('matches')
    .select('status')
    .eq('phase_id', phaseId);
  if (error || !Array.isArray(data)) return false;
  const live = (data as Array<{ status: string | null }>).filter((m) => m.status !== 'cancelled');
  return live.length > 0 && live.every((m) => m.status === 'final');
}

/**
 * Qué dice cada casillero vacío del cuadro mientras no hay clasificados:
 * "1.º Zona A" en vez de "Sembrado #1". Sigue el mismo orden que el sembrado
 * `zone_rank` (todos los primeros por orden de zona, después los segundos…).
 */
export async function computeSeedLabels(supabase: Supa, cfg: PlayoffSeedingConfig | null): Promise<Map<number, string>> {
  const labels = new Map<number, string>();
  if (!cfg || cfg.format !== 'zone_rank' || !cfg.perGroup) return labels;
  const { data: groups } = await supabase
    .from('tournament_groups')
    .select('id, name, order_index')
    .eq('phase_id', cfg.sourcePhaseId);
  const ordered = ((groups ?? []) as Array<{ name: string; order_index: number | null }>)
    .slice()
    .sort((a, b) => Number(a.order_index ?? 999) - Number(b.order_index ?? 999) || String(a.name).localeCompare(String(b.name)));
  let seed = 1;
  for (let tier = 0; tier < cfg.perGroup; tier += 1) {
    for (const g of ordered) {
      labels.set(seed, `${cfg.fromPosition + tier}.º ${g.name}`);
      seed += 1;
    }
  }
  return labels;
}

export function readPlayoffSeedingConfig(settings: unknown): PlayoffSeedingConfig | null {
  if (!settings || typeof settings !== 'object') return null;
  const raw = (settings as Record<string, unknown>).playoffSeeding;
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const parsed = parsePlayoffSeedingInput(r, Boolean(r.locked));
  return parsed.sourcePhaseId ? parsed : null;
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
 * Deja sólo a N de cada zona, según su posición en la tabla, empezando por el
 * puesto `fromPosition` (1 = los primeros; 3 = desde el tercero).
 */
export function keepTopPerGroup<T extends { group_id: string | null; position: number | null; club_id: string | null }>(
  rows: T[],
  perGroup: number | null | undefined,
  fromPosition = 1,
): T[] {
  const skip = Math.max(0, Math.floor(fromPosition) - 1);
  if ((!perGroup || perGroup < 1) && skip === 0) return rows;
  const byGroup = new Map<string, T[]>();
  for (const r of rows) {
    const key = r.group_id ?? '__nogroup__';
    byGroup.set(key, [...(byGroup.get(key) ?? []), r]);
  }
  const kept = new Set<T>();
  for (const list of byGroup.values()) {
    [...list]
      .sort((a, b) => Number(a.position ?? 999) - Number(b.position ?? 999) || String(a.club_id).localeCompare(String(b.club_id)))
      .slice(skip, perGroup && perGroup >= 1 ? skip + perGroup : undefined)
      .forEach((r) => kept.add(r));
  }
  return rows.filter((r) => kept.has(r));
}

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
    /** Sólo pasan los N mejores de cada zona. */
    perGroup?: number | null;
    /** Desde qué puesto de cada zona (1 = desde el primero). */
    fromPosition?: number;
    /** Sin sembrar hasta que terminen todos los partidos de las zonas. */
    untilFinished?: boolean;
  },
): Promise<string[]> {
  const { tournamentId, sourcePhaseId, seasonId, format, perGroup, fromPosition, untilFinished } = params;

  if (untilFinished && !(await zonePhaseFinished(supabase, sourcePhaseId))) return [];

  let query = supabase
    .from('tournament_standings')
    .select('club_id, group_id, position, points, scored, conceded, stats')
    .eq('tournament_id', tournamentId)
    .eq('phase_id', sourcePhaseId);
  if (seasonId) query = query.eq('season_id', seasonId);

  const { data: standings, error } = await query;
  if (error || !Array.isArray(standings) || standings.length === 0) return [];

  let rows = (standings as StandingRow[]).filter((r) => r.club_id);
  rows = keepTopPerGroup(rows, perGroup, fromPosition ?? 1);

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
