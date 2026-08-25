import {
  DEFAULT_OFFENSIVE_BONUS_THRESHOLD,
  normalizeOffensiveBonusMode,
  type OffensiveBonusMode,
} from '@/lib/bonusRuleMetrics';
import type { StandingsRules } from './types';

export type NormalizedCalculationMode = 'automatic' | 'manual' | 'hybrid' | 'undefined';

export interface NormalizedStandingsRules {
  hasConfig: boolean;
  points: {
    win: number | null;
    draw: number | null;
    loss: number | null;
  };
  bonusOffensive: {
    active: boolean;
    threshold: number | null;
    /** Contra qué se mide el umbral: tries anotados o tries de diferencia. */
    mode: OffensiveBonusMode;
  };
  bonusDefensive: {
    active: boolean;
    margin: number | null;
  };
  calculationMode: NormalizedCalculationMode;
  hasTiebreakers: boolean;
  hasAdjustments: boolean;
  isEditable: boolean;
}

function isRuleObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object';
}

function getFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function normalizeCalculationMode(rules?: StandingsRules | null): NormalizedCalculationMode {
  const rawMode = rules?.calculation_mode ?? rules?.mode;

  if (!rawMode) return 'undefined';
  if (rawMode === 'fully_manual' || rawMode === 'manual') return 'manual';
  if (rawMode === 'assisted_manual' || rawMode === 'hybrid') return 'hybrid';
  if (rawMode === 'automatic') return 'automatic';
  return 'undefined';
}

export function normalizeStandingsRules(rules?: StandingsRules | null): NormalizedStandingsRules {
  const offensiveRule = rules?.offensive_bonus_rule ?? null;
  const defensiveRule = rules?.defensive_bonus_rule ?? null;
  const offensiveObject = isRuleObject(offensiveRule) ? offensiveRule : null;
  const defensiveObject = isRuleObject(defensiveRule) ? defensiveRule : null;
  const offensiveMode = normalizeOffensiveBonusMode(offensiveObject?.mode) ?? 'count';
  const offensiveThreshold = offensiveRule
    ? (getFiniteNumber(offensiveObject?.tries)
      ?? getFiniteNumber(offensiveObject?.threshold)
      ?? DEFAULT_OFFENSIVE_BONUS_THRESHOLD[offensiveMode])
    : null;
  const defensiveMargin = defensiveRule ? (getFiniteNumber(defensiveObject?.margin) ?? 7) : null;

  return {
    hasConfig: !!rules,
    points: {
      win: getFiniteNumber(rules?.points_for_win),
      draw: getFiniteNumber(rules?.points_for_draw),
      loss: getFiniteNumber(rules?.points_for_loss),
    },
    bonusOffensive: {
      active: !!offensiveRule,
      threshold: offensiveThreshold,
      mode: offensiveMode,
    },
    bonusDefensive: {
      active: !!defensiveRule,
      margin: defensiveMargin,
    },
    calculationMode: normalizeCalculationMode(rules),
    hasTiebreakers: Array.isArray(rules?.tiebreakers) && rules.tiebreakers.length > 0,
    hasAdjustments:
      !!(rules?.editable_mode || rules?.editable) ||
      (Array.isArray(rules?.adjustments) && rules.adjustments.length > 0),
    isEditable: !!(rules?.editable_mode || rules?.editable),
  };
}

export function formatCalculationMode(mode: NormalizedCalculationMode): string {
  return mode === 'undefined' ? 'No definido' : mode;
}
