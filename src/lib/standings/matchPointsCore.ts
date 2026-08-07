/**
 * Cálculo puro de los puntos de un partido: base, bonus ofensivo y bonus
 * defensivo, a partir del reglamento de la fase.
 *
 * Vive separado de `matchPointsPreview.ts` por una sola razón: aquel importa
 * `StandingsEngine` para resolver el reglamento crudo, y con él se arrastra
 * media aplicación (Supabase incluido). Acá no hay más dependencias que dos
 * módulos igual de puros, así que la cuenta se puede probar en un test de Node
 * sin levantar nada.
 *
 * `matchPointsPreview` reexporta todo esto, de modo que quien ya lo importaba
 * no se entera del cambio.
 */
import {
  countTeamOffensiveMetric,
  resolveOffensiveBonusRule,
  type NormalizedOffensiveBonusRule,
} from '../bonusRuleMetrics.ts';
import { calculateBasePointsFromScore, type MatchResultCode, type PenaltyAwareMatchScore } from './matchPoints.ts';

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

/**
 * La forma del reglamento ya resuelto. Se declara estructuralmente en vez de
 * tomarla de `StandingsEngine.resolveRules` para no importar el motor entero
 * por un tipo; los nombres de los campos son los que ese método devuelve.
 */
export type ResolvedPointsRuleSource = {
  points_for_win?: unknown;
  points_for_draw?: unknown;
  points_for_loss?: unknown;
  points_for_shootout_win?: unknown;
  points_for_shootout_loss?: unknown;
  offensive_bonus_rule?: unknown;
  defensive_bonus_rule?: unknown;
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
  rawRules: ResolvedPointsRuleSource | null | undefined,
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
