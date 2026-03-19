import type { GroupLabel } from '@/types/phase-settings';

export type ResolvedTiebreaker = string | { key?: string; id?: string; label?: string };

export interface StandingsRules {
  points_for_win?: number;
  points_for_draw?: number;
  points_for_loss?: number;
  offensive_bonus_rule?: boolean | { tries?: number; threshold?: number } | null;
  defensive_bonus_rule?: boolean | { margin?: number } | null;
  editable?: boolean;
  editable_mode?: boolean;
  mode?: string;
  calculation_mode?: string;
  tiebreakers?: ResolvedTiebreaker[];
  adjustments?: Array<{ team_id?: string; club_id?: string; points_delta?: number }>;
  qualification_rules?: {
    promoted?: number;
    qualified?: number;
    zone?: number;
    repechaje?: number;
    relegated?: number;
    descenso?: number;
  } | null;
}

export interface StandingsGroup {
  id: string;
  name: string;
}

export interface StandingsPhase {
  id: string;
  name: string;
  phase_type?: string;
  is_active?: boolean;
  groups?: StandingsGroup[];
  settings?: {
    tableColumns?: Record<string, boolean>;
    groupLabels?: GroupLabel[];
  };
  resolvedRules?: StandingsRules | null;
}

export interface TournamentContextData {
  tournament?: {
    id?: string;
    name?: string;
    category?: string;
    status?: string;
    ruleset?: Record<string, unknown> | null;
  };
  phases: StandingsPhase[];
}

export interface StandingsMetrics {
  counted_matches?: number;
  pending_results?: number;
  manual_overrides?: number;
}

export interface StandingsTeam {
  id?: string;
  name?: string;
  logo?: string;
}

export interface StandingsRow {
  teamId?: string;
  teamName?: string;
  team?: StandingsTeam;
  position?: number;
  played?: number;
  won?: number;
  drawn?: number;
  lost?: number;
  points_for?: number;
  points_against?: number;
  difference?: number;
  bonus_offensive?: number;
  bonus_defensive?: number;
  adjustments?: number;
  total_points?: number;
  form?: string[];
  status?: string;
}

export interface StandingsDataPayload {
  metrics?: StandingsMetrics;
  rules?: StandingsRules | null;
  table?: StandingsRow[];
  last_calculated_at?: string | null;
}

export interface UiLabel {
  id: string;
  name: string;
  color: string;
  scope: string;
}

export interface TeamLabelAssignment {
  id: string;
  label_id: string;
  club_id: string;
  tournament_id: string | null;
  phase_id: string | null;
  group_id: string | null;
  label: UiLabel;
}

export interface AuditEntry {
  id?: string;
  created_at: string;
  action: string;
  changes?: {
    rows_calculated?: number;
    table_type?: string;
  };
}
