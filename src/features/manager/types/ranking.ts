// Estado del World Rugby Ranking y su historial.
// World Rugby usa un sistema de intercambio de puntos suma cero entre
// selecciones. Se modela aparte del Elo de clubes ([elo.ts]) porque la
// escala (60-95) y la dinámica (sin drift) son distintas.

import type { ID, ISODate } from './common.ts'
import type { Gender } from './gender.ts'

/** Etiqueta narrativa que se muestra al usuario sin exponer la fórmula.
 *  - routine: favorito gana como esperado en test regular.
 *  - upset: underdog gana en test regular.
 *  - rwc_double: favorito gana en RWC (impacto doble).
 *  - rwc_upset: underdog gana en RWC (batacazo de impacto doble).
 *  - outsider_zero: favorito >10pts por encima vence con lógica → sin intercambio.
 *  - draw: empate con redistribución al underdog. */
export type RankingChangeFlavor =
  | 'routine'
  | 'upset'
  | 'rwc_double'
  | 'rwc_upset'
  | 'outsider_zero'
  | 'draw'

export const RANKING_CHANGE_FLAVOR_LABELS: Record<RankingChangeFlavor, string> = {
  routine: 'Victoria rutinaria',
  upset: 'Batacazo',
  rwc_double: 'Mundial: impacto doble',
  rwc_upset: 'Batacazo mundial: impacto doble',
  outsider_zero: 'Sin movimiento — favorito esperado',
  draw: 'Empate redistribuye puntos'
}

export interface RankingEntry {
  countryId: ID
  /** Puntos World Rugby actuales (típicamente 60-95). */
  points: number
  /** Puntos antes del último cambio, para mostrar deltas en UI. */
  previousPoints: number
  /** Posición global en el ranking (1 = top). */
  rank: number
}

export interface WorldRankingState {
  gender: Gender
  asOfDate: ISODate
  entries: RankingEntry[]
}

export interface RankingChange {
  matchId: ID
  date: ISODate
  homeCountryId: ID
  awayCountryId: ID
  homeBefore: number
  homeAfter: number
  /** Delta del local (positivo = subió). El delta del visitante es -homeDelta. */
  homeDelta: number
  awayBefore: number
  awayAfter: number
  awayDelta: number
  flavor: RankingChangeFlavor
  /** True si el cambio se calculó con la tabla de Copa del Mundo (coeficientes x2). */
  wasRWC: boolean
  /** True si el partido se jugó en sede neutral (no aplica +3 al local). */
  wasNeutral: boolean
}
