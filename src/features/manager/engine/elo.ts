// Elo / Bradley-Terry para clubes. Init 1500 (ajustado por reputación en demoWorld).
// K-factor 32 normal; +60 "puntos virtuales" al local antes del partido (≈ 3 puntos World Rugby).
// Multiplicador por margen de victoria, como en el sistema oficial de World Rugby.

const K_BASE = 32
const K_KNOCKOUT = 40
const HOME_ADVANTAGE_ELO = 60

/** Probabilidad esperada de victoria de A frente a B, dado un sesgo de localía. */
export function expectedScore(eloA: number, eloB: number, homeAdv: number = 0): number {
  return 1 / (1 + Math.pow(10, (eloB - eloA - homeAdv) / 400))
}

/** Multiplicador por margen final (similar a la fórmula oficial de World Rugby). */
export function marginMultiplier(margin: number): number {
  const m = Math.abs(margin)
  if (m <= 7) return 1.0
  if (m <= 15) return 1.5
  return 1.75
}

interface UpdateInput {
  homeElo: number
  awayElo: number
  homeScore: number
  awayScore: number
  /** Multiplicador de importancia del torneo (1.0 liga, 1.5 copa, 2.0 final). */
  importance?: number
  knockout?: boolean
  /** Ventaja de localía en puntos Elo. Default 60. */
  homeAdvantage?: number
}

/** Calcula el delta de Elo para ambos equipos. */
export function eloDelta(input: UpdateInput): { homeDelta: number; awayDelta: number } {
  const { homeElo, awayElo, homeScore, awayScore, importance = 1.0, knockout = false, homeAdvantage = HOME_ADVANTAGE_ELO } = input
  const K = (knockout ? K_KNOCKOUT : K_BASE) * importance

  const actualHome = homeScore > awayScore ? 1 : homeScore < awayScore ? 0 : 0.5
  const actualAway = 1 - actualHome
  const expHome = expectedScore(homeElo, awayElo, homeAdvantage)
  const expAway = 1 - expHome
  const mult = marginMultiplier(homeScore - awayScore)

  return {
    homeDelta: Math.round(K * mult * (actualHome - expHome)),
    awayDelta: Math.round(K * mult * (actualAway - expAway))
  }
}

/** Aplica el delta a un par de clubes (devuelve nuevos Elo). */
export function applyEloDelta(homeElo: number, awayElo: number, delta: { homeDelta: number; awayDelta: number }): {
  homeElo: number; awayElo: number
} {
  return {
    homeElo: Math.max(800, homeElo + delta.homeDelta),
    awayElo: Math.max(800, awayElo + delta.awayDelta)
  }
}

export const ELO_HOME_ADVANTAGE = HOME_ADVANTAGE_ELO
