/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  countTeamOffensiveMetric,
  resolveOffensiveBonusRule,
  type NormalizedOffensiveBonusRule,
} from '@/lib/bonusRuleMetrics';
import { calculateBasePointsFromScore } from '@/lib/standings/matchPoints';
import { fetchMatchCenterMatch, type MatchCenterEventInput } from '@/lib/services/matchCenterService';
import { StandingsEngine } from '@/lib/services/standingsEngine';

type SupabaseLike = {
  from: (table: string) => any;
};

type MatchScoreLike = {
  home?: number | null;
  away?: number | null;
};

type MatchEventLike = {
  type: string;
  team: 'home' | 'away' | null;
};

interface PointsRules {
  win: number;
  draw: number;
  loss: number;
  shootoutWin: number | null;
  shootoutLoss: number | null;
  offensive: NormalizedOffensiveBonusRule | null;
  defensive: {
    margin: number;
    points: number;
  } | null;
}

const DEFAULT_POINTS_RULES: PointsRules = {
  win: 4,
  draw: 2,
  loss: 0,
  shootoutWin: null,
  shootoutLoss: null,
  offensive: null,
  defensive: null,
};

function normalizePointsRules(rawRules: ReturnType<typeof StandingsEngine.resolveRules> | null | undefined): PointsRules {
  const offensiveRule = rawRules?.offensive_bonus_rule;
  const defensiveRule = rawRules?.defensive_bonus_rule;
  const offensive = resolveOffensiveBonusRule(offensiveRule);

  const defensive =
    defensiveRule === true
      ? { margin: 7, points: 1 }
      : defensiveRule && typeof defensiveRule === 'object'
        ? {
          margin: Number(defensiveRule.margin ?? 7),
          points: Number(defensiveRule.points ?? defensiveRule.value ?? 1),
        }
        : null;

  return {
    win: Number(rawRules?.points_for_win ?? DEFAULT_POINTS_RULES.win),
    draw: Number(rawRules?.points_for_draw ?? DEFAULT_POINTS_RULES.draw),
    loss: Number(rawRules?.points_for_loss ?? DEFAULT_POINTS_RULES.loss),
    shootoutWin: Number.isFinite(Number(rawRules?.points_for_shootout_win))
      ? Number(rawRules?.points_for_shootout_win)
      : DEFAULT_POINTS_RULES.shootoutWin,
    shootoutLoss: Number.isFinite(Number(rawRules?.points_for_shootout_loss))
      ? Number(rawRules?.points_for_shootout_loss)
      : DEFAULT_POINTS_RULES.shootoutLoss,
    offensive: offensive && Number.isFinite(offensive.threshold) && Number.isFinite(offensive.points)
      ? offensive
      : null,
    defensive: defensive && Number.isFinite(defensive.margin) && Number.isFinite(defensive.points)
      ? defensive
      : null,
  };
}

function normalizeScore(score: unknown) {
  const row = score && typeof score === 'object' ? score as MatchScoreLike : {};
  return {
    home: Math.max(0, Number(row.home) || 0),
    away: Math.max(0, Number(row.away) || 0),
  };
}

function normalizeEvents(events: MatchCenterEventInput[] | MatchEventLike[]) {
  return (Array.isArray(events) ? events : []).map((event) => ({
    type: String(event?.type || ''),
    team: event?.team === 'home' || event?.team === 'away' ? event.team : null,
  }));
}

function calculateAutocalculatedPoints(
  matchStatus: string,
  score: { home: number; away: number },
  events: MatchEventLike[],
  rules: PointsRules,
) {
  if (matchStatus !== 'final') {
    return {
      homeBasePoints: 0,
      awayBasePoints: 0,
      homeBonusPoints: 0,
      awayBonusPoints: 0,
      pointsAutocalculated: true,
      pointsOverrideReason: null,
    };
  }

  const basePoints = calculateBasePointsFromScore(score, rules);
  let homeBonus = 0;
  let awayBonus = 0;

  const homeOffensiveMetric = countTeamOffensiveMetric(score, events, 'home', rules.offensive);
  const awayOffensiveMetric = countTeamOffensiveMetric(score, events, 'away', rules.offensive);

  if (rules.offensive) {
    if (homeOffensiveMetric >= rules.offensive.threshold) homeBonus += rules.offensive.points;
    if (awayOffensiveMetric >= rules.offensive.threshold) awayBonus += rules.offensive.points;
  }

  if (rules.defensive) {
    if (score.home < score.away && (score.away - score.home) <= rules.defensive.margin) {
      homeBonus += rules.defensive.points;
    }
    if (score.away < score.home && (score.home - score.away) <= rules.defensive.margin) {
      awayBonus += rules.defensive.points;
    }
  }

  return {
    homeBasePoints: basePoints.home,
    awayBasePoints: basePoints.away,
    homeBonusPoints: homeBonus,
    awayBonusPoints: awayBonus,
    pointsAutocalculated: true,
    pointsOverrideReason: null,
  };
}

async function resolvePointsRules(client: SupabaseLike, match: { phase_id?: string | null; round_id?: string | null; tournament_id?: string | null }) {
  let phaseId = match.phase_id ?? null;

  if (!phaseId && match.round_id) {
    const { data: round } = await client
      .from('tournament_rounds')
      .select('phase_id')
      .eq('id', match.round_id)
      .single();
    phaseId = round?.phase_id ?? null;
  }

  let phaseSettings: Record<string, unknown> | null = null;
  let tournamentId = match.tournament_id ?? null;

  if (phaseId) {
    const { data: phase } = await client
      .from('tournament_phases')
      .select('settings, tournament_id')
      .eq('id', phaseId)
      .single();

    phaseSettings = (phase?.settings as Record<string, unknown> | null) ?? null;
    tournamentId = phase?.tournament_id ?? tournamentId;
  }

  let tournamentRuleset: Record<string, unknown> | null = null;
  if (tournamentId) {
    const { data: tournament } = await client
      .from('tournaments')
      .select('ruleset')
      .eq('id', tournamentId)
      .single();

    tournamentRuleset = (tournament?.ruleset as Record<string, unknown> | null) ?? null;
  }

  return normalizePointsRules(StandingsEngine.resolveRules(phaseSettings, tournamentRuleset));
}

export async function deriveClubAdminPointsPatch(
  client: SupabaseLike,
  matchId: string,
  payload: {
    status?: unknown;
    score?: unknown;
    events?: MatchCenterEventInput[];
  },
) {
  const { data: match, error } = await client
    .from('matches')
    .select('id, tournament_id, phase_id, round_id, status, score, points_autocalculated')
    .eq('id', matchId)
    .single();

  if (error || !match) {
    throw new Error('El partido que intentas actualizar no existe.');
  }

  if (match.points_autocalculated === false) {
    return null;
  }

  const nextStatus = typeof payload.status === 'string' ? payload.status : match.status;
  const nextScore = normalizeScore(payload.score ?? match.score);
  const nextEvents = Array.isArray(payload.events)
    ? normalizeEvents(payload.events)
    : normalizeEvents((await fetchMatchCenterMatch(client, matchId)).data?.events || []);
  const pointsRules = await resolvePointsRules(client, match);

  return calculateAutocalculatedPoints(nextStatus, nextScore, nextEvents, pointsRules);
}
