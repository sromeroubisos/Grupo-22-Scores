import {
  StandingsEngine,
  type StandingsCarryOverRow,
} from '@/lib/services/standingsEngine';
import { FINAL_STANDINGS_STATUSES } from '@/lib/standings/matchScope';
import { applyStandingsTableType, supportsStandingsTableTypeColumn } from '@/lib/standings/tableTypeSupport';
import { queryMatchesWithOptionalEvents } from '@/lib/utils/queryMatchesWithOptionalEvents';

type SupabaseLike = any;

type PhaseLike = {
  id: string;
  name?: string | null;
  phase_type?: string | null;
  order_index?: number | null;
  settings?: any;
  season_id?: string | null;
};

type CarryOverConfig = {
  enabled: boolean;
  sourcePhaseId: string | null;
};

export type StandingsCarryOverResolution = {
  enabled: boolean;
  sourcePhaseId: string | null;
  sourcePhaseName: string | null;
  rows: StandingsCarryOverRow[];
};

function toNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeId(value: unknown): string | null {
  const normalized = String(value ?? '').trim();
  return normalized.length > 0 ? normalized : null;
}

export function readPhaseCarryOverConfig(settings: any): CarryOverConfig {
  const carryOver = settings?.carryOver ?? settings?.carry_over ?? settings?.statisticsCarryOver ?? null;
  const enabled = Boolean(
    carryOver?.enabled ??
    carryOver?.fromPreviousPhase ??
    settings?.carryOverPreviousPhase ??
    settings?.carry_over_previous_phase ??
    false,
  );

  return {
    enabled,
    sourcePhaseId: normalizeId(
      carryOver?.sourcePhaseId ??
      carryOver?.source_phase_id ??
      carryOver?.fromPhaseId ??
      null,
    ),
  };
}

async function listTournamentPhases(
  supabase: SupabaseLike,
  tournamentId: string,
  seasonId?: string | null,
): Promise<PhaseLike[]> {
  let query = supabase
    .from('tournament_phases')
    .select('id, name, phase_type, order_index, settings, season_id')
    .eq('tournament_id', tournamentId)
    .order('order_index', { ascending: true });

  if (seasonId) {
    query = query.eq('season_id', seasonId);
  }

  const { data, error } = await query;
  if (error) {
    console.error('[standingsCarryOver] Error fetching phases', error);
    return [];
  }

  return Array.isArray(data) ? data : [];
}

async function resolveSourcePhase(
  supabase: SupabaseLike,
  tournamentId: string,
  currentPhase: PhaseLike,
  config: CarryOverConfig,
  seasonId?: string | null,
): Promise<PhaseLike | null> {
  const phases = await listTournamentPhases(supabase, tournamentId, seasonId);
  if (phases.length === 0) return null;

  if (config.sourcePhaseId) {
    const explicit = phases.find((phase) => phase.id === config.sourcePhaseId) ?? null;
    return explicit?.id === currentPhase.id ? null : explicit;
  }

  const currentIndex = phases.findIndex((phase) => phase.id === currentPhase.id);
  if (currentIndex <= 0) return null;

  return phases[currentIndex - 1] ?? null;
}

function mergeCarryOverRows(rows: StandingsCarryOverRow[]): StandingsCarryOverRow[] {
  const byTeam = new Map<string, StandingsCarryOverRow>();

  rows.forEach((row) => {
    const teamId = normalizeId(row.teamId ?? row.team?.id ?? row.participantId);
    if (!teamId) return;

    const previous = byTeam.get(teamId);
    if (!previous) {
      byTeam.set(teamId, { ...row, teamId });
      return;
    }

    const previousForm = Array.isArray(previous.form)
      ? previous.form
      : typeof previous.form === 'string'
        ? previous.form.split('')
        : [];
    const nextForm = Array.isArray(row.form)
      ? row.form
      : typeof row.form === 'string'
        ? row.form.split('')
        : [];

    byTeam.set(teamId, {
      ...previous,
      team: previous.team ?? row.team ?? null,
      played: toNumber(previous.played) + toNumber(row.played),
      won: toNumber(previous.won) + toNumber(row.won),
      drawn: toNumber(previous.drawn) + toNumber(row.drawn),
      lost: toNumber(previous.lost) + toNumber(row.lost),
      points_for: toNumber(previous.points_for) + toNumber(row.points_for),
      points_against: toNumber(previous.points_against) + toNumber(row.points_against),
      tries_for: toNumber(previous.tries_for) + toNumber(row.tries_for),
      tries_against: toNumber(previous.tries_against) + toNumber(row.tries_against),
      base_points: toNumber(previous.base_points) + toNumber(row.base_points),
      bonus_offensive: toNumber(previous.bonus_offensive) + toNumber(row.bonus_offensive),
      bonus_defensive: toNumber(previous.bonus_defensive) + toNumber(row.bonus_defensive),
      adjustments: toNumber(previous.adjustments) + toNumber(row.adjustments),
      total_points: toNumber(previous.total_points) + toNumber(row.total_points),
      form: [...previousForm, ...nextForm].slice(-5),
    });
  });

  return Array.from(byTeam.values());
}

async function loadPersistedRows(
  supabase: SupabaseLike,
  tournamentId: string,
  sourcePhase: PhaseLike,
  seasonId?: string | null,
  tableType: string = 'general',
): Promise<StandingsCarryOverRow[]> {
  let query = supabase
    .from('tournament_standings')
    .select('club_id, played, won, drawn, lost, points, scored, conceded, bonus_points, form, stats')
    .eq('tournament_id', tournamentId)
    .eq('phase_id', sourcePhase.id);

  if (seasonId) {
    query = query.eq('season_id', seasonId);
  }

  /**
   * Sin este filtro, con las tres perspectivas publicadas cada club aparece
   * tres veces y `mergeCarryOverRows` las SUMA por teamId: los puntos
   * arrastrados de la fase anterior se triplicarían en silencio. Es el lector
   * más peligroso de todos porque el resultado no se ve raro, sólo está mal.
   */
  query = applyStandingsTableType(
    query,
    await supportsStandingsTableTypeColumn(),
    tableType,
  );

  const { data, error } = await query;
  if (error) {
    console.error('[standingsCarryOver] Error fetching persisted source rows', error);
    return [];
  }

  if (!Array.isArray(data) || data.length === 0) return [];

  return mergeCarryOverRows(data.map((row: any): StandingsCarryOverRow => {
    const bonusOffensive = toNumber(row.stats?.bonus_offensive ?? row.stats?.try_bonus ?? row.bonus_points);
    const bonusDefensive = toNumber(row.stats?.bonus_defensive ?? row.stats?.losing_bonus ?? 0);
    const adjustments = toNumber(row.stats?.adjustments ?? 0);
    const totalPoints = toNumber(row.points);

    return {
      participantId: row.club_id,
      teamId: row.club_id,
      team: {
        id: row.club_id,
        name: row.stats?.team_name ?? 'Equipo',
        logo: row.stats?.team_logo ?? null,
      },
      played: toNumber(row.played),
      won: toNumber(row.won),
      drawn: toNumber(row.drawn),
      lost: toNumber(row.lost),
      points_for: toNumber(row.scored),
      points_against: toNumber(row.conceded),
      tries_for: toNumber(row.stats?.tries_for),
      tries_against: toNumber(row.stats?.tries_against),
      base_points: toNumber(row.stats?.base_points ?? totalPoints - bonusOffensive - bonusDefensive - adjustments),
      bonus_offensive: bonusOffensive,
      bonus_defensive: bonusDefensive,
      adjustments,
      total_points: totalPoints,
      form: typeof row.form === 'string' ? row.form.split('') : [],
      sourcePhaseId: sourcePhase.id,
      sourcePhaseName: sourcePhase.name ?? null,
    };
  }));
}

async function calculateSourceRows(
  supabase: SupabaseLike,
  tournamentId: string,
  sourcePhase: PhaseLike,
  tournamentRuleset: any,
  seasonId: string | null | undefined,
  tableType: string,
  visitedPhaseIds: Set<string>,
): Promise<StandingsCarryOverRow[]> {
  let participantsQuery = supabase
    .from('tournament_participants')
    .select('id, club_id, name, group_id, status, clubs(name, logo_url)')
    .eq('tournament_id', tournamentId)
    .not('status', 'in', '("withdrawn","disqualified")');

  if (seasonId) {
    participantsQuery = participantsQuery.eq('season_id', seasonId);
  }

  const buildMatchesQuery = (includeEvents: boolean) => {
    let query = supabase
      .from('matches')
      .select(includeEvents
        ? 'id, home_club_id, away_club_id, score, events, status, date_time, phase_id, group_id, home_base_points, away_base_points, home_bonus_points, away_bonus_points, points_autocalculated, points_override_reason'
        : 'id, home_club_id, away_club_id, score, status, date_time, phase_id, group_id, home_base_points, away_base_points, home_bonus_points, away_bonus_points, points_autocalculated, points_override_reason')
      .eq('tournament_id', tournamentId)
      .eq('phase_id', sourcePhase.id)
      .in('status', [...FINAL_STANDINGS_STATUSES]);

    if (seasonId) {
      query = query.eq('season_id', seasonId);
    }

    return query;
  };

  const [participantsResult, matchesResult, nestedCarryOver] = await Promise.all([
    participantsQuery,
    queryMatchesWithOptionalEvents(
      () => buildMatchesQuery(true),
      () => buildMatchesQuery(false),
    ),
    resolveStandingsCarryOverRows({
      supabase,
      tournamentId,
      currentPhase: sourcePhase,
      tournamentRuleset,
      seasonId,
      tableType,
      visitedPhaseIds,
    }),
  ]);

  if (participantsResult.error || matchesResult.error) {
    console.error('[standingsCarryOver] Error calculating source rows', {
      participantsError: participantsResult.error,
      matchesError: matchesResult.error,
    });
    return [];
  }

  const sourceRules = StandingsEngine.resolveRules(sourcePhase.settings, tournamentRuleset);
  const table = StandingsEngine.generateTable(
    participantsResult.data || [],
    matchesResult.data || [],
    sourceRules,
    tableType,
    { carryOverRows: nestedCarryOver.rows },
  );

  return table.map((row: any): StandingsCarryOverRow => ({
    participantId: row.participantId,
    teamId: row.teamId,
    team: row.team,
    played: row.played,
    won: row.won,
    drawn: row.drawn,
    lost: row.lost,
    points_for: row.points_for,
    points_against: row.points_against,
    tries_for: row.tries_for,
    tries_against: row.tries_against,
    base_points: row.base_points,
    bonus_offensive: row.bonus_offensive,
    bonus_defensive: row.bonus_defensive,
    adjustments: row.adjustments,
    total_points: row.total_points,
    form: row.form,
    sourcePhaseId: sourcePhase.id,
    sourcePhaseName: sourcePhase.name ?? null,
  }));
}

export async function resolveStandingsCarryOverRows({
  supabase,
  tournamentId,
  currentPhase,
  tournamentRuleset,
  seasonId,
  tableType = 'general',
  visitedPhaseIds = new Set<string>(),
}: {
  supabase: SupabaseLike;
  tournamentId: string;
  currentPhase: PhaseLike | null;
  tournamentRuleset?: any;
  seasonId?: string | null;
  tableType?: string;
  visitedPhaseIds?: Set<string>;
}): Promise<StandingsCarryOverResolution> {
  const config = readPhaseCarryOverConfig(currentPhase?.settings);
  if (!currentPhase?.id || !config.enabled) {
    return { enabled: false, sourcePhaseId: null, sourcePhaseName: null, rows: [] };
  }

  if (visitedPhaseIds.has(currentPhase.id)) {
    return { enabled: true, sourcePhaseId: null, sourcePhaseName: null, rows: [] };
  }
  visitedPhaseIds.add(currentPhase.id);

  const sourcePhase = await resolveSourcePhase(
    supabase,
    tournamentId,
    currentPhase,
    config,
    seasonId,
  );

  if (!sourcePhase) {
    return { enabled: true, sourcePhaseId: null, sourcePhaseName: null, rows: [] };
  }

  const persistedRows = await loadPersistedRows(supabase, tournamentId, sourcePhase, seasonId, tableType);
  const rows = persistedRows.length > 0
    ? persistedRows
    : await calculateSourceRows(
      supabase,
      tournamentId,
      sourcePhase,
      tournamentRuleset,
      seasonId,
      tableType,
      visitedPhaseIds,
    );

  return {
    enabled: true,
    sourcePhaseId: sourcePhase.id,
    sourcePhaseName: sourcePhase.name ?? null,
    rows,
  };
}

export async function findCarryOverDependentPhases({
  supabase,
  tournamentId,
  sourcePhaseId,
  seasonId,
}: {
  supabase: SupabaseLike;
  tournamentId: string;
  sourcePhaseId: string;
  seasonId?: string | null;
}): Promise<PhaseLike[]> {
  const phases = await listTournamentPhases(supabase, tournamentId, seasonId);
  const sourceIndex = phases.findIndex((phase) => phase.id === sourcePhaseId);
  if (sourceIndex < 0) return [];

  return phases.filter((phase, index) => {
    if (phase.id === sourcePhaseId) return false;

    const config = readPhaseCarryOverConfig(phase.settings);
    if (!config.enabled) return false;

    if (config.sourcePhaseId) {
      return config.sourcePhaseId === sourcePhaseId;
    }

    return index > 0 && phases[index - 1]?.id === sourcePhaseId;
  });
}
