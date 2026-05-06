/**
 * Phase Settings Types
 * Integrated with high-fidelity JSON structure for advanced tournament management
 */

export interface TiebreakerMetricItem {
  metric: string;
  enabled: boolean;
  order: 'asc' | 'desc';
  priority: number;
}

export interface TiebreakerBehavior {
  appliesTo: 'standings_sorting_only' | string;
  evaluationTime: 'after_all_matches_in_scope_processed' | string;
  scope: {
    tableScope: 'phase_group_or_pool' | string;
    headToHeadScope: 'only_between_tied_teams_in_that_tableScope' | string;
  };
  algorithm: {
    stepByStep: string[];
    finalFallback: {
      mode: 'stable' | string;
      rule: 'keep_previous_order_or_use_team_id_ascending' | string;
      reason: string;
    };
  };
  metricDefinitions?: Record<string, any>;
}

export interface PlayerStatsConfig {
  assignTeamStatsToPlayersWhoPlayed: boolean;
  assignOnlyToStarters: boolean;
  behavior: {
    whenToAttribute: 'on_match_finalized' | string;
    eligibility: {
      mode: 'played_or_starter' | string;
      playedFlagField: string;
      starterFlagField: string;
      rules: Array<{
        if: Record<string, any>;
        then: Record<string, any>;
      }>;
    };
    attribution: {
      teamStatsToPlayers: string[];
      howToApply: string;
    };
  };
}

export interface MatchFormatConfig {
  type: 'single_match' | 'series' | string;
  label: string;
  behavior: {
    single_match: {
      seriesLength: number;
      winnerDetermination: string;
    };
    series: {
      seriesLength: number | null;
      aggregateMethod: string;
      tieResolution: string;
    };
  };
}

export interface PhasePointsSystem {
  win: number;
  draw: number;
  loss: number;
  shootout?: {
    win: number;
    loss: number;
  } | null;
  extraTimeAlternativeSystem: boolean;
  allowBonusPoints?: boolean;
  conditionalRules?: any[];
  behavior: {
    whenToCalculate: string;
    input: {
      requires: string[];
      statusRequired: string;
    };
    output: {
      writesTo: string[];
    };
    basePointsLogic: Array<{
      if: Record<string, boolean>;
      then: Record<string, any>;
    }>;
    extraTimeLogic?: {
      enabledWhen: { extraTimeAlternativeSystem: boolean };
      requires: string[];
      howToApply: string;
      win?: number;
      draw?: number;
      loss?: number;
    };
    shootoutLogic?: {
      enabledWhen: { regularTimeDraw: boolean };
      requires: string[];
      howToApply: string;
      win: number;
      loss: number;
    } | null;
    idempotency: {
      key: string;
      rule: string;
    };
  };
}

export interface GroupLabel {
  id?: string;
  name: string;
  colorMode: 'auto' | 'manual';
  color: string;
  autoColorIndex?: number;
}

export interface PhaseCarryOverConfig {
  enabled: boolean;
  source: 'previous_phase';
  sourcePhaseId?: string | null;
  mode: 'table_totals';
  include: {
    standings: boolean;
    points: boolean;
    scores: boolean;
    form: boolean;
  };
}

export interface PlayoffStageConfig {
  id?: string;
  name: string;
  orderIndex: number;
  matchCount?: number;
}

export interface PhaseSettings {
  // Core Legacy Fields (kept for compatibility)
  teamsCount?: number;
  advanceCount?: number;
  legs?: 1 | 2;
  tableColumns?: Record<string, boolean>;
  groupLabels?: GroupLabel[];
  playoffStages?: PlayoffStageConfig[];

  // High-Fidelity Structure
  groupTags?: string[];
  playerStats?: PlayerStatsConfig;
  matchFormat?: MatchFormatConfig;
  pointsSystem?: PhasePointsSystem;
  tiebreakers?: TiebreakerMetricItem[];
  tiebreakerBehavior?: TiebreakerBehavior;
  carryOver?: PhaseCarryOverConfig;

  // Legacy UI fields
  statsAssignment?: 'played' | 'starters';
  carryOverPreviousPhase?: boolean;
  playoff_stage_names?: string[];
  playoffStageMatchCounts?: number[];
  playoff_match_counts?: number[];
}

export interface CircuitRuleset {
  enabled?: boolean;
  stages?: unknown[];
  globalLabels?: GroupLabel[];
  [key: string]: unknown;
}

/**
 * Migration helper to convert new TiebreakerMetricItem format back to legacy Record if needed
 */
export function tiebreakersToLegacy(items: any[]): Record<string, boolean> {
  const legacy: Record<string, boolean> = {};
  items.forEach(item => {
    legacy[item.metric || item.key] = item.enabled;
  });
  return legacy;
}

/**
 * Migration helper if needed in future
 */
export function migrateToNewStructure(old: any): PhaseSettings {
  // Implementation for migration if needed
  return old;
}
