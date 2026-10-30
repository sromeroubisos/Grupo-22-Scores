// Predicción de partido por Monte Carlo: corre N simulaciones con seeds distintas
// y devuelve probabilidades W/D/L + estadísticas de margen.

import type { MatchTeam } from './types.ts'
import { simulateMatch } from './matchEngine.ts'

export interface MatchPrediction {
  /** Número de simulaciones. */
  n: number
  homeWinProb: number
  awayWinProb: number
  drawProb: number
  /** Margen medio (homeScore - awayScore). Positivo = local gana de media. */
  avgMargin: number
  /** Percentil 10 del margen (peor caso para el local). */
  p10margin: number
  /** Percentil 90 del margen. */
  p90margin: number
  avgHomeScore: number
  avgAwayScore: number
}

interface BatchOpts {
  /** Número de simulaciones (default 200). */
  n?: number
  /** Seed base; los seeds individuales son base + i. */
  seedBase?: number
}

/**
 * Corre N simulaciones rápidas de un partido y agrega resultados.
 * Cada simulación es independiente con seed determinista.
 */
export function simulateBatch(home: MatchTeam, away: MatchTeam, opts: BatchOpts = {}): MatchPrediction {
  const n = opts.n ?? 200
  const seedBase = opts.seedBase ?? 1

  let homeWins = 0
  let awayWins = 0
  let draws = 0
  let sumHome = 0
  let sumAway = 0
  const margins: number[] = []

  for (let i = 0; i < n; i++) {
    const r = simulateMatch(home, away, { seed: seedBase + i })
    const h = r.finalScore.home
    const a = r.finalScore.away
    sumHome += h
    sumAway += a
    margins.push(h - a)
    if (h > a) homeWins++
    else if (a > h) awayWins++
    else draws++
  }

  margins.sort((x, y) => x - y)
  const p10 = margins[Math.max(0, Math.floor(n * 0.10))]
  const p90 = margins[Math.min(n - 1, Math.floor(n * 0.90))]

  return {
    n,
    homeWinProb: homeWins / n,
    awayWinProb: awayWins / n,
    drawProb: draws / n,
    avgMargin: (sumHome - sumAway) / n,
    p10margin: p10,
    p90margin: p90,
    avgHomeScore: sumHome / n,
    avgAwayScore: sumAway / n
  }
}
