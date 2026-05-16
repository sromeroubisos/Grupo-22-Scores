/**
 * Automatic playoff advancement.
 *
 * Called whenever a match is updated. If the match is a source in the
 * bracket graph (tournament_match_advancement_rules), its winner / loser
 * is pushed into the destination matches' slots. When both slots of a
 * destination fill up it becomes a real, visible fixture.
 *
 * Editing a confirmed result is supported: if the outcome changed (or the
 * match is no longer final), every match that depended on it is reset to
 * a placeholder and the change cascades down the branch.
 *
 * Safe to call for any match — if there are no rules (or the migration
 * isn't applied yet) it is a no-op, so normal match editing never breaks.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { isMissingTableError } from '@/lib/utils/supabaseSchema';

type Supa = SupabaseClient<any, any, any>;

const ADVANCEMENT_TABLE = 'tournament_match_advancement_rules';

interface MatchRow {
  id: string;
  status: string | null;
  score: any;
  home_club_id: string | null;
  away_club_id: string | null;
}

interface RuleRow {
  source_match_id: string;
  outcome: 'winner' | 'loser';
  target_match_id: string;
  target_slot: 'home' | 'away';
}

export interface AdvancementResult {
  ok: boolean;
  changed: number;
  warnings: string[];
  error?: string;
}

interface Outcome {
  resolved: boolean;
  winnerClubId: string | null;
  loserClubId: string | null;
}

/** Decide winner/loser of a match from its status, score and clubs. */
function decideOutcome(match: MatchRow): Outcome {
  const unresolved: Outcome = { resolved: false, winnerClubId: null, loserClubId: null };
  if (match.status !== 'final') return unresolved;

  const home = match.home_club_id;
  const away = match.away_club_id;

  // Walkover / bye: only one side present.
  if (home && !away) return { resolved: true, winnerClubId: home, loserClubId: null };
  if (away && !home) return { resolved: true, winnerClubId: away, loserClubId: null };
  if (!home || !away) return unresolved;

  const score = match.score || {};
  const override = String(score.winner ?? '').toLowerCase(); // explicit DQ/walkover

  if (override === 'home') return { resolved: true, winnerClubId: home, loserClubId: away };
  if (override === 'away') return { resolved: true, winnerClubId: away, loserClubId: home };

  const sh = Number(score.home ?? 0);
  const sa = Number(score.away ?? 0);
  if (sh > sa) return { resolved: true, winnerClubId: home, loserClubId: away };
  if (sa > sh) return { resolved: true, winnerClubId: away, loserClubId: home };

  // Regular-time draw -> penalties / shootout tiebreak.
  const pens = score.penalties || score.shootout || score.po || null;
  if (pens && typeof pens === 'object') {
    const ph = Number(pens.home ?? 0);
    const pa = Number(pens.away ?? 0);
    if (ph > pa) return { resolved: true, winnerClubId: home, loserClubId: away };
    if (pa > ph) return { resolved: true, winnerClubId: away, loserClubId: home };
  }

  // Knockout tie with no tiebreak -> cannot advance anyone yet.
  return unresolved;
}

function matchHasPlayedResult(match: MatchRow): boolean {
  const score = match.score || {};
  return (
    match.status === 'final' ||
    match.status === 'live' ||
    Number(score.home ?? 0) > 0 ||
    Number(score.away ?? 0) > 0
  );
}

async function loadMatch(supabase: Supa, id: string): Promise<MatchRow | null> {
  const { data } = await supabase
    .from('matches')
    .select('id, status, score, home_club_id, away_club_id')
    .eq('id', id)
    .maybeSingle();
  return (data as MatchRow) ?? null;
}

/**
 * Resolve advancement for `matchId`. Recurses down the branch when an
 * already-played downstream match must be reset.
 */
export async function resolveMatchAdvancement(
  supabase: Supa,
  matchId: string,
  ctx: { visited?: Set<string>; warnings?: string[]; changed?: { n: number } } = {},
): Promise<AdvancementResult> {
  const visited = ctx.visited ?? new Set<string>();
  const warnings = ctx.warnings ?? [];
  const changed = ctx.changed ?? { n: 0 };

  if (visited.has(matchId)) {
    return { ok: true, changed: changed.n, warnings };
  }
  visited.add(matchId);

  // Rules where this match is the source.
  const { data: rules, error: rulesError } = await supabase
    .from(ADVANCEMENT_TABLE)
    .select('source_match_id, outcome, target_match_id, target_slot')
    .eq('source_match_id', matchId);

  if (rulesError) {
    // Migration not applied yet (or table absent): treat as no-op so the
    // surrounding match update keeps working.
    if (isMissingTableError(rulesError, ADVANCEMENT_TABLE)) {
      return { ok: true, changed: changed.n, warnings };
    }
    return { ok: false, changed: changed.n, warnings, error: rulesError.message };
  }

  if (!rules || rules.length === 0) {
    return { ok: true, changed: changed.n, warnings };
  }

  const source = await loadMatch(supabase, matchId);
  if (!source) {
    return { ok: false, changed: changed.n, warnings, error: 'Partido de origen no encontrado.' };
  }

  const outcome = decideOutcome(source);

  if (source.status === 'final' && !outcome.resolved) {
    warnings.push(
      `El partido ${matchId} terminó empatado sin desempate (penales/tries). ` +
        'No se puede determinar quién avanza hasta que se cargue el desempate.',
    );
  }

  for (const rule of rules as RuleRow[]) {
    const desiredClub = !outcome.resolved
      ? null
      : rule.outcome === 'winner'
        ? outcome.winnerClubId
        : outcome.loserClubId;

    const target = await loadMatch(supabase, rule.target_match_id);
    if (!target) continue;

    const slotColumn = rule.target_slot === 'home' ? 'home_club_id' : 'away_club_id';
    const currentClub = rule.target_slot === 'home' ? target.home_club_id : target.away_club_id;

    if (currentClub === desiredClub) {
      // Slot already correct. Still make sure visibility/status are sane.
      await reconcileTargetReadiness(supabase, target);
      continue;
    }

    // The slot changes. If the target already had a played result, the
    // bracket below it is now invalid: reset it and cascade.
    const targetHadResult = matchHasPlayedResult(target);

    const updatePayload: Record<string, unknown> = { [slotColumn]: desiredClub };

    const nextHome = rule.target_slot === 'home' ? desiredClub : target.home_club_id;
    const nextAway = rule.target_slot === 'away' ? desiredClub : target.away_club_id;
    const bothResolved = Boolean(nextHome) && Boolean(nextAway);

    if (targetHadResult) {
      updatePayload.status = 'scheduled';
      updatePayload.score = { home: 0, away: 0 };
    }
    updatePayload.is_visible = bothResolved;

    const { error: updateError } = await supabase
      .from('matches')
      .update(updatePayload)
      .eq('id', target.id);
    if (updateError) {
      return { ok: false, changed: changed.n, warnings, error: updateError.message };
    }
    changed.n += 1;

    // If we invalidated a target that had propagated further, recurse so
    // its own downstream gets reset too.
    if (targetHadResult) {
      await resolveMatchAdvancement(supabase, target.id, { visited, warnings, changed });
    }
  }

  return { ok: true, changed: changed.n, warnings };
}

/**
 * Ensure a target match's visibility matches whether both slots are filled.
 * (Does not touch status/score — used on the no-change path.)
 */
async function reconcileTargetReadiness(supabase: Supa, target: MatchRow): Promise<void> {
  const bothResolved = Boolean(target.home_club_id) && Boolean(target.away_club_id);
  const { data: current } = await supabase
    .from('matches')
    .select('is_visible')
    .eq('id', target.id)
    .maybeSingle();
  if (current && current.is_visible !== bothResolved && target.status !== 'final') {
    await supabase.from('matches').update({ is_visible: bothResolved }).eq('id', target.id);
  }
}
