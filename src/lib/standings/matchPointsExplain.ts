/**
 * Traduce el puntaje de un partido al idioma del deporte.
 *
 * `calculateMatchPointsPreview` ya resuelve CUÁNTOS puntos le tocan a cada
 * equipo. Lo que falta para poder mostrarlo es el POR QUÉ: "ganó · 4" y
 * "7 tries · +1" en vez de dos campos numéricos llamados `base` y `bonus`.
 *
 * Es la única traducción entre el reglamento y lo que lee quien carga el
 * partido, así que una tarjeta no puede prometer una cosa y guardar otra: los
 * términos y los totales salen del mismo cálculo.
 *
 * El bonus ofensivo se cuenta con `countTeamOffensiveMetric`, que lee
 * `score.homeTries` / `score.awayTries` cuando no hay eventos cargados. Por eso
 * alcanza con que la carga rápida pida los tries: sin ese dato el bonus no se
 * puede calcular y hay que ponerlo a mano (que es lo que pasaba antes).
 */
import {
  offensiveBonusUnit,
  resolveOffensiveBonusOutcome,
  type OffensiveBonusOutcome,
} from '../bonusRuleMetrics.ts';
import {
  calculateMatchPointsPreview,
  type MatchPointsRules,
  type MatchPointsEvent,
} from './matchPointsCore.ts';
import type { PenaltyAwareMatchScore } from './matchPoints.ts';

export type ExplainableScore = PenaltyAwareMatchScore & {
  homeTries?: number | null;
  awayTries?: number | null;
};

export type PointsTermId = 'result' | 'offensive' | 'defensive';

export type PointsTerm = {
  id: PointsTermId;
  /** Texto listo para mostrar: "ganó · 4", "7 tries · +1", "perdió por 32 · sin bonus". */
  label: string;
  /** Si el término suma puntos. Los que no suman igual se muestran, apagados. */
  active: boolean;
};

export type TeamPointsExplain = {
  base: number;
  bonus: number;
  total: number;
  terms: PointsTerm[];
};

export type MatchPointsExplain = {
  home: TeamPointsExplain;
  away: TeamPointsExplain;
  resolvedByShootout: boolean;
};

const RESULT_VERB: Record<'W' | 'D' | 'L', string> = {
  W: 'ganó',
  D: 'empató',
  L: 'perdió',
};

function signed(points: number) {
  return points >= 0 ? `+${points}` : String(points);
}

/**
 * El término ofensivo dice lo que se contó, en el idioma de la regla.
 *
 * - Por cantidad: "7 tries · +1". El rival no entra en la cuenta, así que
 *   tampoco en la frase.
 * - Por diferencia: "7 tries a 3 · +1". Acá el rival ES la cuenta: sin él, un
 *   "4 tries · sin bonus" al lado de un 4-1 que sí lo cobró sería un misterio.
 *
 * La unidad sale de `offensiveBonusUnit` (tries, goles, puntos) y no del
 * `label` de la regla, que suele traer su nombre ("4+ Tries").
 */
function offensiveTerm(
  outcome: OffensiveBonusOutcome,
  rule: MatchPointsRules['offensive'],
): PointsTerm | null {
  if (!rule) return null;
  const unit = offensiveBonusUnit(rule);
  const counted = rule.mode === 'difference'
    ? `${outcome.own} ${unit} a ${outcome.opponent}`
    : `${outcome.own} ${unit}`;
  return {
    id: 'offensive',
    label: outcome.fires
      ? `${counted} · ${signed(rule.points)}`
      : `${counted} · sin bonus`,
    active: outcome.fires,
  };
}

function defensiveTerm(
  margin: number | null,
  fired: boolean,
  rule: MatchPointsRules['defensive'],
): PointsTerm | null {
  if (!rule) return null;
  // Sólo tiene sentido contarlo del lado del que perdió: al ganador no se le
  // ofrece un bonus por perder por poco.
  if (margin === null) return null;
  return {
    id: 'defensive',
    label: fired
      ? `perdió por ${margin} · ${signed(rule.points)}`
      : `perdió por ${margin} · sin bonus`,
    active: fired,
  };
}

export function explainMatchPoints(
  status: string,
  score: ExplainableScore | null | undefined,
  rules: MatchPointsRules,
  events?: MatchPointsEvent[] | null,
): MatchPointsExplain {
  const preview = calculateMatchPointsPreview(status, score, events ?? null, rules);
  const isFinal = status === 'final';

  const homeScore = Number(score?.home ?? 0);
  const awayScore = Number(score?.away ?? 0);
  const homeLostBy = awayScore > homeScore ? awayScore - homeScore : null;
  const awayLostBy = homeScore > awayScore ? homeScore - awayScore : null;

  const homeOffensive = resolveOffensiveBonusOutcome(score, events ?? null, 'home', rules.offensive);
  const awayOffensive = resolveOffensiveBonusOutcome(score, events ?? null, 'away', rules.offensive);

  function buildSide(side: 'home' | 'away'): TeamPointsExplain {
    const base = side === 'home' ? preview.homeBasePoints : preview.awayBasePoints;
    const bonus = side === 'home' ? preview.homeBonusPoints : preview.awayBonusPoints;
    const result = side === 'home' ? preview.homeResult : preview.awayResult;
    const terms: PointsTerm[] = [];

    if (isFinal) {
      const verb = preview.resolvedByShootout && result !== 'D'
        ? (result === 'W' ? 'ganó en penales' : 'perdió en penales')
        : RESULT_VERB[result];
      terms.push({ id: 'result', label: `${verb} · ${base}`, active: base > 0 });

      const offensive = offensiveTerm(
        side === 'home' ? homeOffensive : awayOffensive,
        rules.offensive,
      );
      if (offensive) terms.push(offensive);

      const defensive = defensiveTerm(
        side === 'home' ? homeLostBy : awayLostBy,
        side === 'home' ? preview.homeDefensiveBonus : preview.awayDefensiveBonus,
        rules.defensive,
      );
      if (defensive) terms.push(defensive);
    }

    return { base, bonus, total: base + bonus, terms };
  }

  return {
    home: buildSide('home'),
    away: buildSide('away'),
    resolvedByShootout: preview.resolvedByShootout,
  };
}
