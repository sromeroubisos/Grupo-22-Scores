import type { GroupLabel } from '@/types/phase-settings';

export const CIRCUIT_GLOBAL_SENTINEL = '__circuit_global__';

export type ResolvedTiebreaker = string | { key?: string; id?: string; label?: string };

export interface StandingsRules {
  points_for_win?: number;
  points_for_draw?: number;
  points_for_loss?: number;
  /**
   * `mode` dice contra qué se mide el umbral: `count` (4+ tries anotados) o
   * `difference` (3+ tries más que el rival). Sin `mode` es `count`.
   */
  offensive_bonus_rule?: boolean | { tries?: number; threshold?: number; mode?: string; points?: number } | null;
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
  carry_over?: {
    enabled?: boolean;
    sourcePhaseId?: string | null;
    source_phase_id?: string | null;
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
    carryOver?: {
      enabled?: boolean;
      sourcePhaseId?: string | null;
    };
    carryOverPreviousPhase?: boolean;
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
  /**
   * Si la base ya tiene la columna `table_type` y por lo tanto se pueden
   * publicar las tablas de local y visitante. Lo decide el servidor —es la
   * misma señal que el 409 de /standings/recalculate— para que el botón se
   * habilite al correr la migración, sin redeploy.
   */
  supportsTableType?: boolean;
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
  carry_over?: {
    enabled?: boolean;
    source_phase_id?: string | null;
    source_phase_name?: string | null;
    rows?: number;
  };
  last_calculated_at?: string | null;
  /**
   * Si lo GUARDADO coincide con lo que se está mostrando. La tabla de la consola
   * se calcula en vivo por request; la publicada sólo se reescribe al
   * recalcular, así que pueden separarse sin que nada avise.
   */
  published_drift?: {
    state: 'sin_publicar' | 'al_dia' | 'desfasada';
    count: number;
    /** Los primeros clubes que difieren, ya armados para leer. */
    teams: string;
  };
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
  position?: number;
  club_id?: string | null;
  tournament_id: string | null;
  phase_id: string | null;
  group_id: string | null;
  label: UiLabel | null;
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
