import type { SupabaseClient } from '@supabase/supabase-js';
export {
  DEFAULT_PLAYOFF_STAGE_NAMES,
  buildPlayoffStages,
  getDefaultPlayoffStageNames,
  getDefaultPlayoffStages,
  getExpectedPlayoffStageCount,
  getPlayoffMatchCounts,
  getPlayoffTeamsCount,
  isPlayoffPhaseType,
  normalizePlayoffStageNames,
  resolvePlayoffStagesForTeams,
  resolvePlayoffStageNamesForTeams,
  type PlayoffStageConfig,
} from '@/lib/utils/playoffStages';

import {
  buildPlayoffStages,
  getPlayoffMatchCounts,
} from '@/lib/utils/playoffStages';

async function roundHasMatches(supabase: SupabaseClient<any, any, any>, roundId: string) {
  const { count, error } = await supabase
    .from('matches')
    .select('id', { count: 'exact', head: true })
    .or(`round_uuid.eq.${roundId},round_id.eq.${roundId}`);

  if (error) {
    console.error('[playoffStages] Error checking round usage:', error);
    return true;
  }

  return (count ?? 0) > 0;
}

export async function syncPlayoffStagesToRounds(
  supabase: SupabaseClient<any, any, any>,
  phaseId: string,
  seasonId: string | null | undefined,
  stageNames: Array<string | { name: string; matchCount?: number }>,
) {
  const desiredStages = buildPlayoffStages(stageNames);

  const { data: existingRounds, error: roundsError } = await supabase
    .from('tournament_rounds')
    .select('id, name, order_index')
    .eq('phase_id', phaseId)
    .order('order_index', { ascending: true });

  if (roundsError) {
    console.error('[playoffStages] Error loading playoff rounds:', roundsError);
    return { ok: false, error: roundsError.message };
  }

  const existing = existingRounds || [];
  const byOrder = new Map<number, typeof existing[number]>();
  const byName = new Map<string, typeof existing[number]>();
  existing.forEach((round) => {
    byOrder.set(Number(round.order_index), round);
    byName.set(String(round.name || '').trim().toLowerCase(), round);
  });

  const usedIds = new Set<string>();

  for (const stage of desiredStages) {
    const nameKey = stage.name.toLowerCase();
    const existingRound = byOrder.get(stage.orderIndex) || byName.get(nameKey) || null;

    if (existingRound) {
      usedIds.add(existingRound.id);
      const { error: updateError } = await supabase
        .from('tournament_rounds')
        .update({
          name: stage.name,
          order_index: stage.orderIndex,
          ...(seasonId !== undefined ? { season_id: seasonId } : {}),
        })
        .eq('id', existingRound.id);

      if (updateError) {
        console.error('[playoffStages] Error updating playoff round:', updateError);
        return { ok: false, error: updateError.message };
      }
      continue;
    }

    const { data: insertedRound, error: insertError } = await supabase
      .from('tournament_rounds')
      .insert({
        phase_id: phaseId,
        season_id: seasonId ?? null,
        name: stage.name,
        order_index: stage.orderIndex,
      })
      .select('id')
      .single();

    if (insertError) {
      console.error('[playoffStages] Error creating playoff round:', insertError);
      return { ok: false, error: insertError.message };
    }

    if (insertedRound?.id) usedIds.add(insertedRound.id);
  }

  const extraRounds = existing.filter((round) => !usedIds.has(round.id));
  for (const round of extraRounds) {
    if (await roundHasMatches(supabase, round.id)) continue;

    const { error: deleteError } = await supabase
      .from('tournament_rounds')
      .delete()
      .eq('id', round.id);

    if (deleteError) {
      console.error('[playoffStages] Error deleting unused playoff round:', deleteError);
      return { ok: false, error: deleteError.message };
    }
  }

  return { ok: true, stages: desiredStages };
}

export async function ensurePlayoffBracketMatches(
  supabase: SupabaseClient<any, any, any>,
  params: {
    tournamentId: string;
    phaseId: string;
    seasonId?: string | null;
    teamsCount: number;
    stageMatchCounts?: number[];
  },
) {
  const { data: rounds, error: roundsError } = await supabase
    .from('tournament_rounds')
    .select('id, name, order_index')
    .eq('phase_id', params.phaseId)
    .order('order_index', { ascending: true });

  if (roundsError) {
    console.error('[playoffStages] Error loading rounds for bracket slots:', roundsError);
    return { ok: false, error: roundsError.message, inserted: 0 };
  }

  const playableRounds = rounds || [];
  if (params.teamsCount < 2 || playableRounds.length === 0) {
    return { ok: true, inserted: 0 };
  }

  const defaultMatchCounts = getPlayoffMatchCounts(params.teamsCount, playableRounds.length);
  const matchCounts = playableRounds.map((_, index) => {
    const configured = Number(params.stageMatchCounts?.[index]);
    if (Number.isFinite(configured) && configured > 0) return Math.floor(configured);
    return defaultMatchCounts[index] ?? 0;
  });
  let inserted = 0;

  for (const [index, round] of playableRounds.entries()) {
    const desiredCount = matchCounts[index] ?? 0;
    if (desiredCount <= 0) continue;

    const { data: existingMatches, error: matchesError } = await supabase
      .from('matches')
      .select('id, home_club_id, away_club_id')
      .eq('phase_id', params.phaseId)
      .or(`round_uuid.eq.${round.id},round_id.eq.${round.id}`);

    if (matchesError) {
      console.error('[playoffStages] Error loading bracket slots:', matchesError);
      return { ok: false, error: matchesError.message, inserted };
    }

    const matches = existingMatches || [];
    const assignedMatches = matches.filter((match) => match.home_club_id || match.away_club_id);
    const emptyMatches = matches.filter((match) => !match.home_club_id && !match.away_club_id);
    const targetCount = Math.max(desiredCount, assignedMatches.length);
    const removableCount = Math.max(0, matches.length - targetCount);

    if (removableCount > 0) {
      const removableIds = emptyMatches
        .slice(-removableCount)
        .map((match) => match.id)
        .filter(Boolean);

      if (removableIds.length > 0) {
        const { error: deleteExtraError } = await supabase
          .from('matches')
          .delete()
          .in('id', removableIds);

        if (deleteExtraError) {
          console.error('[playoffStages] Error deleting extra bracket slots:', deleteExtraError);
          return { ok: false, error: deleteExtraError.message, inserted };
        }
      }
    }

    const nextExistingCount = matches.length - Math.min(removableCount, emptyMatches.length);
    const missingCount = targetCount - nextExistingCount;
    if (missingCount <= 0) continue;

    const rows = Array.from({ length: missingCount }, (_, slotIndex) => ({
      tournament_id: params.tournamentId,
      season_id: params.seasonId ?? null,
      phase_id: params.phaseId,
      round_uuid: round.id,
      home_club_id: null,
      away_club_id: null,
      date_time: null,
      venue: null,
      status: 'scheduled',
      score: { home: 0, away: 0 },
      notes: `Playoff bracket slot ${slotIndex + 1}`,
      is_visible: false,
    }));

    const { error: insertError } = await supabase
      .from('matches')
      .insert(rows);

    if (insertError) {
      console.error('[playoffStages] Error creating bracket slots:', insertError);
      return { ok: false, error: insertError.message, inserted };
    }

    inserted += rows.length;
  }

  return { ok: true, inserted };
}
