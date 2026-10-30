// Directiva: expectativas que pone al manager al inicio de la temporada
// y evaluación al final.

import type { ID } from './common.ts'

export type LeagueExpectation =
  | 'win_title'
  | 'top_4'
  | 'playoff'
  | 'mid_table'
  | 'avoid_relegation'

export const EXPECTATION_LABELS: Record<LeagueExpectation, string> = {
  win_title: 'Ganar el título',
  top_4: 'Clasificar para semifinales (top 4)',
  playoff: 'Clasificar para el play-off (top 8)',
  mid_table: 'Posición tranquila a media tabla',
  avoid_relegation: 'Evitar el descenso'
}

/** Posición esperada (1-indexed) mínima para cumplir cada nivel, con 12 equipos. */
export const EXPECTATION_TARGET_POS: Record<LeagueExpectation, number> = {
  win_title: 1,
  top_4: 4,
  playoff: 8,
  mid_table: 10,
  avoid_relegation: 10
}

export interface BoardExpectations {
  clubId: ID
  seasonYear: number
  leagueExpectation: LeagueExpectation
  /** Beneficio mínimo deseado al final de temporada. Negativo = se acepta pérdida. */
  minProfit: number
  /** Confianza de la directiva 0-100. Cae si no cumples expectativas. */
  boardConfidence: number
}

/** Genera expectativas para un club según su reputación (0-100). */
export function generateExpectations(
  clubId: ID,
  seasonYear: number,
  reputation: number
): BoardExpectations {
  let leagueExpectation: LeagueExpectation
  if (reputation >= 70) leagueExpectation = 'win_title'
  else if (reputation >= 55) leagueExpectation = 'top_4'
  else if (reputation >= 45) leagueExpectation = 'playoff'
  else if (reputation >= 35) leagueExpectation = 'mid_table'
  else leagueExpectation = 'avoid_relegation'

  // Presupuesto: beneficio mínimo proporcional al tamaño
  const minProfit = reputation >= 60 ? 100_000 : reputation >= 45 ? 0 : -200_000

  return {
    clubId,
    seasonYear,
    leagueExpectation,
    minProfit,
    boardConfidence: 60 + Math.round((reputation - 40) * 0.4)
  }
}

export interface BoardEvaluation {
  metLeague: boolean
  metFinance: boolean
  newConfidence: number
  verdict: 'excellent' | 'good' | 'acceptable' | 'poor' | 'sacked'
  message: string
}

/** Evalúa el desempeño contra las expectativas al final de temporada. */
export function evaluateSeason(
  exp: BoardExpectations,
  finalPosition: number,
  yearProfit: number
): BoardEvaluation {
  const target = EXPECTATION_TARGET_POS[exp.leagueExpectation]
  const metLeague = finalPosition <= target
  const overachieved = finalPosition < target
  const metFinance = yearProfit >= exp.minProfit
  let newConfidence = exp.boardConfidence
  let verdict: BoardEvaluation['verdict']
  let message = ''
  if (overachieved && metFinance) {
    newConfidence = Math.min(100, newConfidence + 25)
    verdict = 'excellent'
    message = `Temporada brillante. Has superado las expectativas (objetivo: ${EXPECTATION_LABELS[exp.leagueExpectation].toLowerCase()}) y mantenido las cuentas saneadas.`
  } else if (metLeague && metFinance) {
    newConfidence = Math.min(100, newConfidence + 10)
    verdict = 'good'
    message = `Temporada cumplida. La directiva está satisfecha con tus resultados.`
  } else if (metLeague || metFinance) {
    newConfidence = newConfidence - 5
    verdict = 'acceptable'
    message = metLeague
      ? `Buen trabajo deportivo, pero las finanzas no han acompañado.`
      : `Las cuentas han funcionado pero el rendimiento deportivo se ha quedado corto.`
  } else if (newConfidence > 30) {
    newConfidence = newConfidence - 20
    verdict = 'poor'
    message = `Temporada decepcionante. La directiva avisa: el próximo año hay que mejorar.`
  } else {
    verdict = 'sacked'
    message = `La directiva ha tomado una decisión: cesado del cargo. Gracias por los servicios prestados.`
  }
  return { metLeague, metFinance, newConfidence: Math.max(0, newConfidence), verdict, message }
}
