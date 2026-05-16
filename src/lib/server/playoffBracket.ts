/**
 * Playoff bracket persistence.
 *
 * Turns an abstract `BracketTemplate` (see lib/playoff/templates.ts) into
 * real rows: cups -> tournament_groups, rounds -> tournament_rounds (cup
 * aware via group_id), matches -> matches (with bracket_match_code +
 * placeholder labels), and the winner/loser edges ->
 * tournament_match_advancement_rules.
 *
 * Generation is idempotent: it always clears the phase's previous bracket
 * first (guarded so it refuses to wipe loaded results unless `force`).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { isMissingColumnError, isMissingTableError } from '@/lib/utils/supabaseSchema';
import {
  buildBracketTemplate,
  resolveCupName,
  type BracketTemplate,
  type PlayoffBuilderConfig,
  type SlotSource,
  type TemplateMatch,
} from '@/lib/playoff/templates';
import {
  computeBracketSchedule,
  normalizeScheduleConfig,
  type BracketScheduleConfig,
  type ScheduleRoundInput,
} from '@/lib/playoff/scheduling';

type Supa = SupabaseClient<any, any, any>;

export interface PlayoffBracketResult {
  ok: boolean;
  error?: string;
  code?: 'has_results' | 'missing_migration' | 'no_participants' | 'template_error' | 'db_error';
  matchesCreated?: number;
  rulesCreated?: number;
}

const ADVANCEMENT_TABLE = 'tournament_match_advancement_rules';

function missingMigration(error: unknown): boolean {
  const e = error as { message?: string; details?: string; code?: string } | null;
  return (
    isMissingTableError(e, ADVANCEMENT_TABLE) ||
    isMissingColumnError(e, 'bracket_match_code') ||
    isMissingColumnError(e, 'participant_source') ||
    isMissingColumnError(e, 'group_id')
  );
}

/** Builds a stable, human label for each match code (used in placeholders). */
function buildCodeLabelMap(
  template: BracketTemplate,
  cupNames?: Record<string, string>,
): Map<string, string> {
  const roundByKey = new Map(template.rounds.map((r) => [r.key, r]));
  const countByRoundKey = new Map<string, number>();
  for (const m of template.matches) {
    countByRoundKey.set(m.roundKey, (countByRoundKey.get(m.roundKey) ?? 0) + 1);
  }

  const map = new Map<string, string>();
  for (const m of template.matches) {
    const round = roundByKey.get(m.roundKey);
    const stage = round?.stageName ?? m.roundKey;
    const cupLabel = m.cupKey ? resolveCupName(template, m.cupKey, cupNames) : '';
    const total = countByRoundKey.get(m.roundKey) ?? 1;
    const numberSuffix = total > 1 ? ` ${m.orderInRound}` : '';
    const label = cupLabel
      ? `${stage} · ${cupLabel}${numberSuffix}`
      : `${stage}${numberSuffix}`;
    map.set(m.code, label);
  }
  return map;
}

function slotLabel(
  source: SlotSource,
  codeLabels: Map<string, string>,
  seededClubResolved: boolean,
): string | null {
  if (source.type === 'seed') {
    return seededClubResolved ? null : `Sembrado #${source.ref}`;
  }
  const ref = String(source.ref);
  const base = codeLabels.get(ref) ?? ref;
  return source.type === 'winner' ? `Ganador ${base}` : `Perdedor ${base}`;
}

/**
 * Ordered club ids by seed (index 0 => seed #1). Reads phase-scoped
 * participants first, falling back to tournament-wide participants.
 */
async function loadSeededClubIds(
  supabase: Supa,
  params: { tournamentId: string; phaseId: string; seasonId?: string | null },
): Promise<string[]> {
  // Phase-scoped roster (preferred): has its own seed column.
  let phaseQuery = supabase
    .from('tournament_phase_participants')
    .select('seed, participant_id, status, tournament_participants:participant_id(club_id)')
    .eq('tournament_id', params.tournamentId)
    .eq('phase_id', params.phaseId)
    .not('status', 'in', '("withdrawn","disqualified","archived")');
  if (params.seasonId) phaseQuery = phaseQuery.eq('season_id', params.seasonId);

  const { data: phaseRows, error: phaseError } = await phaseQuery;

  if (!phaseError && Array.isArray(phaseRows) && phaseRows.length > 0) {
    return orderBySeed(
      phaseRows.map((r: any) => ({
        seed: r.seed,
        clubId: Array.isArray(r.tournament_participants)
          ? r.tournament_participants[0]?.club_id
          : r.tournament_participants?.club_id,
      })),
    );
  }

  // Fallback: tournament participants.
  let baseQuery = supabase
    .from('tournament_participants')
    .select('seed, club_id, status, created_at')
    .eq('tournament_id', params.tournamentId)
    .not('status', 'in', '("withdrawn","disqualified")');
  if (params.seasonId) baseQuery = baseQuery.eq('season_id', params.seasonId);

  const { data: baseRows } = await baseQuery;
  return orderBySeed(
    (baseRows ?? []).map((r: any) => ({ seed: r.seed, clubId: r.club_id })),
  );
}

function orderBySeed(rows: Array<{ seed: number | null; clubId: string | null | undefined }>): string[] {
  const withClub = rows.filter((r) => r.clubId) as Array<{ seed: number | null; clubId: string }>;
  withClub.sort((a, b) => {
    const sa = a.seed == null ? Number.POSITIVE_INFINITY : a.seed;
    const sb = b.seed == null ? Number.POSITIVE_INFINITY : b.seed;
    return sa - sb;
  });
  return withClub.map((r) => r.clubId);
}

/** Non-mutating Fisher-Yates shuffle (used for random crossings). */
function shuffle<T>(input: T[]): T[] {
  const arr = [...input];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Delete the phase's previously generated bracket.
 * Refuses (code: 'has_results') if any bracket match carries a result,
 * unless `force` is set.
 */
export async function clearPlayoffBracket(
  supabase: Supa,
  params: { phaseId: string; force?: boolean },
): Promise<PlayoffBracketResult> {
  const { phaseId, force } = params;

  const { data: bracketMatches, error: matchesError } = await supabase
    .from('matches')
    .select('id, status, score, bracket_match_code')
    .eq('phase_id', phaseId)
    .not('bracket_match_code', 'is', null);

  if (matchesError) {
    if (missingMigration(matchesError)) {
      return { ok: false, code: 'missing_migration', error: 'Falta aplicar la migración del constructor de playoff.' };
    }
    return { ok: false, code: 'db_error', error: matchesError.message };
  }

  const matches = bracketMatches ?? [];
  if (!force) {
    const hasResults = matches.some((m: any) => {
      const score = m.score || {};
      const played = m.status === 'final' || m.status === 'live'
        || Number(score.home) > 0 || Number(score.away) > 0;
      return played;
    });
    if (hasResults) {
      return {
        ok: false,
        code: 'has_results',
        error: 'El bracket ya tiene resultados cargados. Regenerar borrará todo el cuadro y sus resultados.',
      };
    }
  }

  // Rules -> matches -> rounds -> cups (group_id cascades clean up extras).
  await supabase.from(ADVANCEMENT_TABLE).delete().eq('phase_id', phaseId);

  const matchIds = matches.map((m: any) => m.id);
  if (matchIds.length > 0) {
    const { error: delMatchesError } = await supabase.from('matches').delete().in('id', matchIds);
    if (delMatchesError) return { ok: false, code: 'db_error', error: delMatchesError.message };
  }

  await supabase.from('tournament_rounds').delete().eq('phase_id', phaseId);
  await supabase.from('tournament_groups').delete().eq('phase_id', phaseId);

  return { ok: true };
}

/**
 * Generate a full multi-cup bracket for a playoff phase from a template.
 * Always clears the previous bracket first (guarded unless `force`).
 */
export async function generatePlayoffBracket(
  supabase: Supa,
  params: {
    tournamentId: string;
    phaseId: string;
    seasonId?: string | null;
    config: PlayoffBuilderConfig;
    schedule?: BracketScheduleConfig;
    force?: boolean;
  },
): Promise<PlayoffBracketResult> {
  const { tournamentId, phaseId, seasonId, config, force } = params;
  const scheduleConfig = normalizeScheduleConfig(params.schedule ?? { mode: 'manual' });

  // 1. Build the abstract spec.
  let template: BracketTemplate;
  try {
    template = buildBracketTemplate(config);
  } catch (err: any) {
    return { ok: false, code: 'template_error', error: err?.message || 'Plantilla inválida.' };
  }

  // 2. Clear any previous bracket (guarded).
  const cleared = await clearPlayoffBracket(supabase, { phaseId, force });
  if (!cleared.ok) return cleared;

  // 3. Resolve seeded clubs (best effort — bracket still generates without).
  //    'seed'   -> club with seed #1 vs seed #N, #2 vs #N-1, …
  //    'random' -> a fresh random draw (each generate reshuffles).
  const seededClubIds = await loadSeededClubIds(supabase, { tournamentId, phaseId, seasonId });
  const orderedClubIds =
    config.seedMode === 'random' ? shuffle(seededClubIds) : seededClubIds;
  const seedToClub = new Map<number, string>();
  orderedClubIds.forEach((clubId, idx) => seedToClub.set(idx + 1, clubId));

  const codeLabels = buildCodeLabelMap(template, config.cupNames);

  // 4. Create cups (tournament_groups), mapping cupKey -> groupId.
  const cupKeyToGroupId = new Map<string, string>();
  for (const cup of template.cups) {
    const name = resolveCupName(template, cup.key, config.cupNames);
    const { data: groupRow, error: groupError } = await supabase
      .from('tournament_groups')
      .insert({ phase_id: phaseId, name, order_index: cup.orderIndex })
      .select('id')
      .single();
    if (groupError || !groupRow) {
      return { ok: false, code: 'db_error', error: groupError?.message || 'No se pudieron crear las copas.' };
    }
    cupKeyToGroupId.set(cup.key, groupRow.id);
  }

  // 5. Create rounds (tournament_rounds), mapping roundKey -> roundId.
  const roundKeyToId = new Map<string, string>();
  for (const round of template.rounds) {
    const cupName = round.cupKey ? resolveCupName(template, round.cupKey, config.cupNames) : '';
    const roundName = cupName ? `${round.stageName} · ${cupName}` : round.stageName;
    const insertRow: Record<string, unknown> = {
      phase_id: phaseId,
      name: roundName,
      order_index: round.orderIndex,
      group_id: round.cupKey ? cupKeyToGroupId.get(round.cupKey) ?? null : null,
    };
    if (seasonId) insertRow.season_id = seasonId;

    const { data: roundRow, error: roundError } = await supabase
      .from('tournament_rounds')
      .insert(insertRow)
      .select('id')
      .single();
    if (roundError || !roundRow) {
      if (missingMigration(roundError)) {
        return {
          ok: false,
          code: 'missing_migration',
          error: 'Falta aplicar la migración del constructor de playoff (tournament_rounds.group_id).',
        };
      }
      return { ok: false, code: 'db_error', error: roundError?.message || 'No se pudieron crear las rondas.' };
    }
    roundKeyToId.set(round.key, roundRow.id);
  }

  // 6. Create matches. Insert one round at a time so PostgREST returns ids
  //    we can map back by bracket_match_code deterministically.
  const placeholderDateTime = new Date().toISOString();
  const codeToMatchId = new Map<string, string>();

  const matchesByRound = new Map<string, TemplateMatch[]>();
  for (const m of template.matches) {
    const list = matchesByRound.get(m.roundKey) ?? [];
    list.push(m);
    matchesByRound.set(m.roundKey, list);
  }

  let matchesCreated = 0;
  for (const round of template.rounds) {
    const roundId = roundKeyToId.get(round.key);
    const groupId = round.cupKey ? cupKeyToGroupId.get(round.cupKey) ?? null : null;
    const roundMatches = (matchesByRound.get(round.key) ?? []).sort(
      (a, b) => a.orderInRound - b.orderInRound,
    );

    const rows = roundMatches.map((m) => {
      const homeClub = m.home.type === 'seed' ? seedToClub.get(Number(m.home.ref)) ?? null : null;
      const awayClub = m.away.type === 'seed' ? seedToClub.get(Number(m.away.ref)) ?? null : null;
      const homeLabel = slotLabel(m.home, codeLabels, Boolean(homeClub));
      const awayLabel = slotLabel(m.away, codeLabels, Boolean(awayClub));
      const bothResolved = Boolean(homeClub) && Boolean(awayClub);

      return {
        tournament_id: tournamentId,
        season_id: seasonId ?? null,
        phase_id: phaseId,
        round_uuid: roundId,
        group_id: groupId,
        home_club_id: homeClub,
        away_club_id: awayClub,
        date_time: placeholderDateTime,
        venue: null,
        status: 'scheduled',
        score: { home: 0, away: 0 },
        bracket_match_code: m.code,
        home_source_label: homeLabel,
        away_source_label: awayLabel,
        participant_source: { home: m.home, away: m.away },
        // Visible only once it is a real, playable fixture.
        is_visible: bothResolved,
        notes: `Playoff · ${m.code}`,
      };
    });

    const { data: inserted, error: insertError } = await supabase
      .from('matches')
      .insert(rows)
      .select('id, bracket_match_code');
    if (insertError || !inserted) {
      if (missingMigration(insertError)) {
        return {
          ok: false,
          code: 'missing_migration',
          error: 'Falta aplicar la migración del constructor de playoff (columnas de matches).',
        };
      }
      return { ok: false, code: 'db_error', error: insertError?.message || 'No se pudieron crear los partidos.' };
    }
    for (const row of inserted) {
      if (row.bracket_match_code) codeToMatchId.set(row.bracket_match_code, row.id);
    }
    matchesCreated += inserted.length;
  }

  // 7. Create advancement rules from winner/loser slot sources.
  type RuleRow = {
    phase_id: string;
    source_match_id: string;
    outcome: 'winner' | 'loser';
    target_match_id: string;
    target_slot: 'home' | 'away';
    target_group_id: string | null;
  };
  const ruleRows: RuleRow[] = [];
  for (const m of template.matches) {
    const targetMatchId = codeToMatchId.get(m.code);
    if (!targetMatchId) continue;
    const targetGroupId = m.cupKey ? cupKeyToGroupId.get(m.cupKey) ?? null : null;

    (['home', 'away'] as const).forEach((slot) => {
      const src = slot === 'home' ? m.home : m.away;
      if (src.type !== 'winner' && src.type !== 'loser') return;
      const sourceMatchId = codeToMatchId.get(String(src.ref));
      if (!sourceMatchId) return;
      ruleRows.push({
        phase_id: phaseId,
        source_match_id: sourceMatchId,
        outcome: src.type,
        target_match_id: targetMatchId,
        target_slot: slot,
        target_group_id: targetGroupId,
      });
    });
  }

  let rulesCreated = 0;
  if (ruleRows.length > 0) {
    const { error: rulesError } = await supabase.from(ADVANCEMENT_TABLE).insert(ruleRows);
    if (rulesError) {
      if (missingMigration(rulesError)) {
        return {
          ok: false,
          code: 'missing_migration',
          error: 'Falta aplicar la migración del constructor de playoff (tabla de reglas de avance).',
        };
      }
      return { ok: false, code: 'db_error', error: rulesError.message };
    }
    rulesCreated = ruleRows.length;
  }

  // 7.5 Auto-scheduling: in 'auto' mode every match gets a date/venue now;
  //     in 'manual' mode slots stay pending for the admin.
  const scheduleRounds: ScheduleRoundInput[] = template.rounds
    .slice()
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map((round) => ({
      id: round.key,
      orderIndex: round.orderIndex,
      matches: template.matches
        .filter((m) => m.roundKey === round.key)
        .sort((a, b) => a.orderInRound - b.orderInRound)
        .map((m) => ({ id: codeToMatchId.get(m.code) || '' }))
        .filter((m) => m.id),
    }));
  await applyBracketSchedule(supabase, scheduleRounds, scheduleConfig);

  // 8. Persist the builder config on the phase so the UI/engine know this
  //    phase is builder-managed.
  const { data: phaseRow } = await supabase
    .from('tournament_phases')
    .select('settings')
    .eq('id', phaseId)
    .maybeSingle();
  const nextSettings = {
    ...(phaseRow?.settings && typeof phaseRow.settings === 'object' ? phaseRow.settings : {}),
    bracketBuilder: {
      templateId: config.templateId,
      teamCount: template.teamCount || config.teamCount,
      cupNames: config.cupNames ?? {},
      thirdPlace: config.thirdPlace ?? true,
      seedMode: config.seedMode ?? 'seed',
      ...(config.templateId === 'custom' && config.customSpec
        ? { customSpec: config.customSpec }
        : {}),
      generatedAt: new Date().toISOString(),
    },
    bracketSchedule: scheduleConfig,
  };
  await supabase.from('tournament_phases').update({ settings: nextSettings }).eq('id', phaseId);

  return { ok: true, matchesCreated, rulesCreated };
}

// ─── scheduling ─────────────────────────────────────────────────────────

/** Update one match's schedule, degrading if the new columns are absent. */
async function patchMatchSchedule(
  supabase: Supa,
  matchId: string,
  patch: { date_time?: string; venue?: string | null; auto_scheduled?: boolean; scheduling_status?: string },
): Promise<void> {
  const { error } = await supabase.from('matches').update(patch).eq('id', matchId);
  if (!error) return;
  if (
    isMissingColumnError(error, 'auto_scheduled') ||
    isMissingColumnError(error, 'scheduling_status')
  ) {
    const fallback: Record<string, unknown> = {};
    if (patch.date_time !== undefined) fallback.date_time = patch.date_time;
    if (patch.venue !== undefined) fallback.venue = patch.venue;
    if (Object.keys(fallback).length > 0) {
      await supabase.from('matches').update(fallback).eq('id', matchId);
    }
  }
}

/**
 * Apply a schedule config to the given rounds. In 'auto' mode every match
 * (except skipped ones) gets a date/venue; in 'manual' mode matches are
 * left pending.
 */
export async function applyBracketSchedule(
  supabase: Supa,
  rounds: ScheduleRoundInput[],
  config: BracketScheduleConfig,
  opts: { skipMatchIds?: Set<string> } = {},
): Promise<{ scheduled: number }> {
  const skip = opts.skipMatchIds ?? new Set<string>();

  if (config.mode !== 'auto') {
    const allIds = rounds.flatMap((r) => r.matches.map((m) => m.id)).filter((id) => !skip.has(id));
    if (allIds.length > 0) {
      const { error } = await supabase
        .from('matches')
        .update({ scheduling_status: 'pending', auto_scheduled: false })
        .in('id', allIds);
      // Missing columns => nothing to track; safe to ignore.
      void error;
    }
    return { scheduled: 0 };
  }

  const scheduled = computeBracketSchedule(rounds, config);
  let count = 0;
  for (const s of scheduled) {
    if (skip.has(s.matchId)) continue;
    await patchMatchSchedule(supabase, s.matchId, {
      date_time: s.dateTime,
      venue: s.venue,
      auto_scheduled: true,
      scheduling_status: 'auto',
    });
    count += 1;
  }
  return { scheduled: count };
}

/** Trailing integer of a bracket code (ORO-QF-3 -> 3) for stable ordering. */
function codeOrder(code: string | null): number {
  if (!code) return 0;
  const m = code.match(/(\d+)\s*$/);
  return m ? Number(m[1]) : 0;
}

/**
 * Recompute the schedule for an existing bracket. Manual / locked matches
 * (and already-played ones) are preserved unless `force` is set.
 */
export async function reschedulePlayoffBracket(
  supabase: Supa,
  params: { phaseId: string; config: BracketScheduleConfig; force?: boolean },
): Promise<PlayoffBracketResult & { scheduled?: number }> {
  const { phaseId, force } = params;
  const config = normalizeScheduleConfig(params.config);

  const { data: matchRows, error: matchesError } = await supabase
    .from('matches')
    .select('id, bracket_match_code, round_uuid, status, scheduling_status')
    .eq('phase_id', phaseId)
    .not('bracket_match_code', 'is', null);

  if (matchesError) {
    if (missingMigration(matchesError)) {
      return { ok: false, code: 'missing_migration', error: 'Falta aplicar la migración del constructor de playoff.' };
    }
    return { ok: false, code: 'db_error', error: matchesError.message };
  }
  if (!matchRows || matchRows.length === 0) {
    return { ok: false, code: 'db_error', error: 'No hay cuadro generado para reprogramar.' };
  }

  const { data: roundRows } = await supabase
    .from('tournament_rounds')
    .select('id, order_index')
    .eq('phase_id', phaseId);
  const roundOrder = new Map((roundRows ?? []).map((r: any) => [r.id, r.order_index ?? 0]));

  const byRound = new Map<string, Array<{ id: string; code: string | null }>>();
  const skip = new Set<string>();
  for (const m of matchRows as any[]) {
    const rid = m.round_uuid ?? 'none';
    const list = byRound.get(rid) ?? [];
    list.push({ id: m.id, code: m.bracket_match_code ?? null });
    byRound.set(rid, list);
    const status = String(m.scheduling_status ?? '');
    if (!force && (status === 'manual' || status === 'locked' || m.status === 'final')) {
      skip.add(m.id);
    }
  }

  const rounds: ScheduleRoundInput[] = Array.from(byRound.entries())
    .map(([rid, list]) => ({
      id: rid,
      orderIndex: Number(roundOrder.get(rid) ?? 0),
      matches: list.sort((a, b) => codeOrder(a.code) - codeOrder(b.code)).map((m) => ({ id: m.id })),
    }))
    .sort((a, b) => a.orderIndex - b.orderIndex);

  const { scheduled } = await applyBracketSchedule(supabase, rounds, config, { skipMatchIds: skip });

  // Persist the latest schedule config.
  const { data: phaseRow } = await supabase
    .from('tournament_phases')
    .select('settings')
    .eq('id', phaseId)
    .maybeSingle();
  const nextSettings = {
    ...(phaseRow?.settings && typeof phaseRow.settings === 'object' ? phaseRow.settings : {}),
    bracketSchedule: config,
  };
  await supabase.from('tournament_phases').update({ settings: nextSettings }).eq('id', phaseId);

  return { ok: true, scheduled };
}

// ─── read model for the bracket board ───────────────────────────────────

export interface BracketBoardMatch {
  id: string;
  code: string | null;
  status: string;
  scoreHome: number;
  scoreAway: number;
  dateTime: string | null;
  homeClubId: string | null;
  awayClubId: string | null;
  homeName: string;
  awayName: string;
  homeLogo: string | null;
  awayLogo: string | null;
  winnerClubId: string | null;
}

export interface BracketBoardRound {
  roundId: string;
  name: string;
  orderIndex: number;
  matches: BracketBoardMatch[];
}

export interface BracketBoardCup {
  groupId: string | null;
  name: string;
  orderIndex: number;
  rounds: BracketBoardRound[];
}

export interface BracketBoard {
  hasBracket: boolean;
  cups: BracketBoardCup[];
}

/** Assemble the grouped (cup -> round -> match) view for rendering. */
export async function loadPlayoffBracket(
  supabase: Supa,
  phaseId: string,
): Promise<BracketBoard> {
  const { data: matches, error } = await supabase
    .from('matches')
    .select(
      'id, bracket_match_code, status, score, date_time, group_id, round_uuid, ' +
        'home_club_id, away_club_id, home_source_label, away_source_label, ' +
        'home:clubs!matches_home_club_id_fkey(name, logo_url), ' +
        'away:clubs!matches_away_club_id_fkey(name, logo_url)',
    )
    .eq('phase_id', phaseId)
    .not('bracket_match_code', 'is', null);

  if (error || !matches || matches.length === 0) {
    return { hasBracket: false, cups: [] };
  }

  const [{ data: groups }, { data: rounds }] = await Promise.all([
    supabase.from('tournament_groups').select('id, name, order_index').eq('phase_id', phaseId),
    supabase
      .from('tournament_rounds')
      .select('id, name, order_index, group_id')
      .eq('phase_id', phaseId),
  ]);

  const roundById = new Map((rounds ?? []).map((r: any) => [r.id, r]));
  const cupById = new Map((groups ?? []).map((g: any) => [g.id, g]));

  const rel = (v: any) => (Array.isArray(v) ? v[0] : v) ?? null;

  const cupBuckets = new Map<string, BracketBoardCup>();
  const ensureCup = (groupId: string | null): BracketBoardCup => {
    const key = groupId ?? '__qualifier__';
    let cup = cupBuckets.get(key);
    if (!cup) {
      const g = groupId ? cupById.get(groupId) : null;
      cup = {
        groupId: groupId,
        name: g?.name ?? 'Clasificación',
        orderIndex: g?.order_index ?? -1,
        rounds: [],
      };
      cupBuckets.set(key, cup);
    }
    return cup;
  };

  const roundBuckets = new Map<string, BracketBoardRound>();
  for (const m of matches as any[]) {
    const round = m.round_uuid ? roundById.get(m.round_uuid) : null;
    const cup = ensureCup(m.group_id ?? null);

    const roundKey = `${cup.groupId ?? 'q'}::${m.round_uuid ?? 'none'}`;
    let roundBucket = roundBuckets.get(roundKey);
    if (!roundBucket) {
      roundBucket = {
        roundId: m.round_uuid ?? roundKey,
        name: round?.name ?? 'Ronda',
        orderIndex: round?.order_index ?? 0,
        matches: [],
      };
      roundBuckets.set(roundKey, roundBucket);
      cup.rounds.push(roundBucket);
    }

    const home = rel(m.home);
    const away = rel(m.away);
    const score = m.score || {};
    const scoreHome = Number(score.home ?? 0);
    const scoreAway = Number(score.away ?? 0);
    let winnerClubId: string | null = null;
    if (m.status === 'final' && m.home_club_id && m.away_club_id) {
      if (scoreHome > scoreAway) winnerClubId = m.home_club_id;
      else if (scoreAway > scoreHome) winnerClubId = m.away_club_id;
    }

    roundBucket.matches.push({
      id: m.id,
      code: m.bracket_match_code ?? null,
      status: m.status,
      scoreHome,
      scoreAway,
      dateTime: m.date_time ?? null,
      homeClubId: m.home_club_id ?? null,
      awayClubId: m.away_club_id ?? null,
      homeName: home?.name || m.home_source_label || 'A definir',
      awayName: away?.name || m.away_source_label || 'A definir',
      homeLogo: home?.logo_url ?? null,
      awayLogo: away?.logo_url ?? null,
      winnerClubId,
    });
  }

  const cups = Array.from(cupBuckets.values()).sort((a, b) => a.orderIndex - b.orderIndex);
  for (const cup of cups) {
    cup.rounds.sort((a, b) => a.orderIndex - b.orderIndex);
  }

  return { hasBracket: true, cups };
}
