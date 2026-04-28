import {
  countTeamOffensiveMetric,
  resolveOffensiveBonusRule,
  type NormalizedOffensiveBonusRule,
} from '@/lib/bonusRuleMetrics';
import { calculateBasePointsFromScore, type MatchResultCode, type PenaltyAwareMatchScore } from './matchPoints';
import { StandingsEngine } from '@/lib/services/standingsEngine';

export type MatchPointsRules = {
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
};

export type MatchPointsEvent = {
  type?: unknown;
  team?: unknown;
};

export type MatchPointsPreview = {
  homeBasePoints: number;
  awayBasePoints: number;
  homeBonusPoints: number;
  awayBonusPoints: number;
  homeResult: MatchResultCode;
  awayResult: MatchResultCode;
  homeOffensiveBonus: boolean;
  awayOffensiveBonus: boolean;
  homeDefensiveBonus: boolean;
  awayDefensiveBonus: boolean;
  resolvedByShootout: boolean;
};

export const DEFAULT_MATCH_POINTS_RULES: MatchPointsRules = {
  win: 4,
  draw: 2,
  loss: 0,
  shootoutWin: null,
  shootoutLoss: null,
  offensive: null,
  defensive: null,
};

function finiteNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function optionalFiniteNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeDefensiveBonusRule(rawRule: unknown): MatchPointsRules['defensive'] {
  if (rawRule === true) {
    return { margin: 7, points: 1 };
  }

  if (!rawRule || typeof rawRule !== 'object') {
    return null;
  }

  const source = rawRule as Record<string, unknown>;
  const margin = finiteNumber(source.margin, 7);
  const points = finiteNumber(source.points ?? source.value, 1);
  return Number.isFinite(margin) && Number.isFinite(points) ? { margin, points } : null;
}

export function normalizeMatchPointsRules(
  rawRules: ReturnType<typeof StandingsEngine.resolveRules> | null | undefined,
): MatchPointsRules {
  const offensive = resolveOffensiveBonusRule(rawRules?.offensive_bonus_rule);
  const defensive = normalizeDefensiveBonusRule(rawRules?.defensive_bonus_rule);

  return {
    win: finiteNumber(rawRules?.points_for_win, DEFAULT_MATCH_POINTS_RULES.win),
    draw: finiteNumber(rawRules?.points_for_draw, DEFAULT_MATCH_POINTS_RULES.draw),
    loss: finiteNumber(rawRules?.points_for_loss, DEFAULT_MATCH_POINTS_RULES.loss),
    shootoutWin: optionalFiniteNumber(rawRules?.points_for_shootout_win),
    shootoutLoss: optionalFiniteNumber(rawRules?.points_for_shootout_loss),
    offensive: offensive && Number.isFinite(offensive.threshold) && Number.isFinite(offensive.points)
      ? offensive
      : null,
    defensive: defensive && Number.isFinite(defensive.margin) && Number.isFinite(defensive.points)
      ? defensive
      : null,
  };
}

export function resolveMatchPointsRules(
  phaseSettings: Record<string, unknown> | null | undefined,
  tournamentRuleset: Record<string, unknown> | null | undefined,
): MatchPointsRules {
  return normalizeMatchPointsRules(StandingsEngine.resolveRules(phaseSettings, tournamentRuleset));
}

export function calculateMatchPointsPreview(
  status: string,
  score: PenaltyAwareMatchScore | null | undefined,
  events: MatchPointsEvent[] | null | undefined,
  rules: MatchPointsRules = DEFAULT_MATCH_POINTS_RULES,
): MatchPointsPreview {
  const basePoints = calculateBasePointsFromScore(score, rules);
  const isFinal = status === 'final';
  let homeBonusPoints = 0;
  let awayBonusPoints = 0;
  let homeOffensiveBonus = false;
  let awayOffensiveBonus = false;
  let homeDefensiveBonus = false;
  let awayDefensiveBonus = false;
  const homeScore = finiteNumber(score?.home, 0);
  const awayScore = finiteNumber(score?.away, 0);

  if (isFinal && rules.offensive) {
    const homeOffensiveMetric = countTeamOffensiveMetric(score, events, 'home', rules.offensive);
    const awayOffensiveMetric = countTeamOffensiveMetric(score, events, 'away', rules.offensive);
    homeOffensiveBonus = homeOffensiveMetric >= rules.offensive.threshold;
    awayOffensiveBonus = awayOffensiveMetric >= rules.offensive.threshold;
    if (homeOffensiveBonus) homeBonusPoints += rules.offensive.points;
    if (awayOffensiveBonus) awayBonusPoints += rules.offensive.points;
  }

  if (isFinal && rules.defensive) {
    if (homeScore < awayScore && (awayScore - homeScore) <= rules.defensive.margin) {
      homeDefensiveBonus = true;
      homeBonusPoints += rules.defensive.points;
    }
    if (awayScore < homeScore && (homeScore - awayScore) <= rules.defensive.margin) {
      awayDefensiveBonus = true;
      awayBonusPoints += rules.defensive.points;
    }
  }

  return {
    homeBasePoints: isFinal ? basePoints.home : 0,
    awayBasePoints: isFinal ? basePoints.away : 0,
    homeBonusPoints,
    awayBonusPoints,
    homeResult: basePoints.homeResult,
    awayResult: basePoints.awayResult,
    homeOffensiveBonus,
    awayOffensiveBonus,
    homeDefensiveBonus,
    awayDefensiveBonus,
    resolvedByShootout: basePoints.resolvedByShootout,
  };
}
