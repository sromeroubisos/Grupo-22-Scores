/**
 * Puente entre el reglamento crudo de una fase y el cálculo puro de puntos.
 *
 * La cuenta en sí vive en `matchPointsCore.ts`, que no depende de nada
 * pesado. Acá queda lo único que necesita el motor: `resolveMatchPointsRules`,
 * que traduce `settings` + `ruleset` con `StandingsEngine.resolveRules`.
 *
 * Todo lo del core se reexporta para que los importadores de siempre
 * (`matchCenterService`, `matchPointsSync`, `ClubMatchWorkspace`) no cambien.
 */
import { StandingsEngine } from '@/lib/services/standingsEngine';
import { normalizeMatchPointsRules, type MatchPointsRules } from './matchPointsCore';

export {
  DEFAULT_MATCH_POINTS_RULES,
  calculateMatchPointsPreview,
  normalizeMatchPointsRules,
} from './matchPointsCore';

export type {
  MatchPointsRules,
  MatchPointsEvent,
  MatchPointsPreview,
  ResolvedPointsRuleSource,
} from './matchPointsCore';

export function resolveMatchPointsRules(
  phaseSettings: Record<string, unknown> | null | undefined,
  tournamentRuleset: Record<string, unknown> | null | undefined,
): MatchPointsRules {
  return normalizeMatchPointsRules(StandingsEngine.resolveRules(phaseSettings, tournamentRuleset));
}
