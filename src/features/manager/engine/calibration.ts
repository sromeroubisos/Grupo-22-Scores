// Verificación de calibración del motor: corre N partidos y compara
// las medias observadas con los targets del documento de diseño.

import type { MatchTeam } from './types.ts'
import type { CompetitionRules } from '../types/index.ts'
import { simulateMatch } from './matchEngine.ts'
import { type CompetitionLevel, paramsForLevel } from './levels.ts'

export interface CalibrationRow {
  metric: string
  observed: number
  target: number
  low: number
  high: number
  inRange: boolean
}

interface Target {
  mean: number
  low: number
  high: number
  format: 'int' | 'pct' | 'float'
}

const TARGETS: Record<string, Target> = {
  'Tries / partido':           { mean: 8.0,  low: 6.5,  high: 9.5,  format: 'float' },
  'Scrums / partido':          { mean: 12,   low: 10,   high: 15,   format: 'int' },
  'Lineouts / partido':        { mean: 24,   low: 22,   high: 28,   format: 'int' },
  'Rucks / partido':           { mean: 178,  low: 150,  high: 200,  format: 'int' },
  'Tackles / partido':         { mean: 176,  low: 150,  high: 200,  format: 'int' },
  'Penales / partido':         { mean: 17,   low: 14,   high: 22,   format: 'int' },
  'Offloads / partido':        { mean: 22,   low: 16,   high: 28,   format: 'int' },
  'Line breaks / partido':     { mean: 4,    low: 3,    high: 6,    format: 'int' },
  'Conversion rate':           { mean: 0.75, low: 0.68, high: 0.82, format: 'pct' },
  'Penalty goal rate':         { mean: 0.76, low: 0.68, high: 0.84, format: 'pct' },
  'Own scrum success':         { mean: 0.93, low: 0.85, high: 0.98, format: 'pct' },
  'Own lineout success':       { mean: 0.88, low: 0.82, high: 0.94, format: 'pct' },
  'Ruck retention':            { mean: 0.94, low: 0.88, high: 0.97, format: 'pct' },
  // ============ Fase 2: granularidad ============
  'Mauls / partido':           { mean: 6,    low: 4,    high: 9,    format: 'int' },
  'Drives / maul':             { mean: 2.5,  low: 1.5,  high: 4.0,  format: 'float' },
  'Pick & go / partido':       { mean: 18,   low: 10,   high: 30,   format: 'int' },
  'Quick taps / partido':      { mean: 2,    low: 1,    high: 4,    format: 'int' },
  'Box-kick chase win rate':   { mean: 0.22, low: 0.12, high: 0.40, format: 'pct' }
}

/**
 * Corre N simulaciones home vs away y devuelve un informe de calibración.
 */
export function verifyCalibration(home: MatchTeam, away: MatchTeam, n: number = 50): CalibrationRow[] {
  let tries = 0, scrumsTot = 0, lineoutsTot = 0, rucksTot = 0, tacklesTot = 0
  let offloadsTot = 0, lineBreaksTot = 0
  let convAtt = 0, convMade = 0
  let penAtt = 0, penMade = 0
  let scrumWon = 0, scrumLost = 0
  let lineoutWon = 0, lineoutLost = 0
  let rucksWonAtt = 0, jackalSteals = 0
  let totalPenalEvents = 0
  // Fase 2
  let maulsTot = 0, maulDrivesTot = 0
  let pickAndGosTot = 0, quickTapsTot = 0
  let boxKickContests = 0, boxKickChaseWins = 0

  for (let i = 0; i < n; i++) {
    const r = simulateMatch(home, away, { seed: i })
    tries += r.tries.home + r.tries.away
    scrumsTot += r.scrums.home + r.scrums.away
    lineoutsTot += r.lineouts.home + r.lineouts.away
    rucksTot += r.rucks.home + r.rucks.away
    tacklesTot += r.tackles.home + r.tackles.away
    offloadsTot += r.offloads.home + r.offloads.away
    lineBreaksTot += r.lineBreaks.home + r.lineBreaks.away
    maulsTot += r.mauls.home + r.mauls.away
    maulDrivesTot += r.maulDrives.home + r.maulDrives.away
    pickAndGosTot += r.pickAndGos.home + r.pickAndGos.away
    quickTapsTot += r.quickTaps.home + r.quickTaps.away

    for (const ev of r.events) {
      const t: string = ev.type
      if (t === 'conversion') { convAtt++; convMade++ }
      else if (t === 'commentary' && /conversi[oó]n/i.test(ev.text)) { convAtt++ }
      else if (t === 'penalty_kick') { penAtt++; penMade++; totalPenalEvents++ }
      else if (t === 'penalty_kick_missed') { penAtt++; totalPenalEvents++ }
      else if (t === 'penalty_to_touch') { totalPenalEvents++ }
      else if (t === 'penalty_won') { totalPenalEvents++ }
      else if (t === 'scrum_won') scrumWon++
      else if (t === 'scrum_penalty') scrumLost++
      else if (t === 'lineout_won') lineoutWon++
      else if (t === 'lineout_lost') lineoutLost++
      else if (t === 'ruck_won' || t === 'ruck_slow_ball') rucksWonAtt++
      else if (t === 'jackal_steal') jackalSteals++
      else if (t === 'box_kick_chase_won') { boxKickContests++; boxKickChaseWins++ }
      else if (t === 'box_kick_chase_lost') { boxKickContests++ }
    }
  }

  const observed: Record<string, number> = {
    'Tries / partido':         tries / n,
    'Scrums / partido':        scrumsTot / n,
    'Lineouts / partido':      lineoutsTot / n,
    'Rucks / partido':         rucksTot / n,
    'Tackles / partido':       tacklesTot / n,
    'Penales / partido':       totalPenalEvents / n,
    'Offloads / partido':      offloadsTot / n,
    'Line breaks / partido':   lineBreaksTot / n,
    'Conversion rate':         convAtt > 0 ? convMade / convAtt : 0,
    'Penalty goal rate':       penAtt > 0 ? penMade / penAtt : 0,
    'Own scrum success':       (scrumWon + scrumLost) > 0 ? scrumWon / (scrumWon + scrumLost) : 0,
    'Own lineout success':     (lineoutWon + lineoutLost) > 0 ? lineoutWon / (lineoutWon + lineoutLost) : 0,
    'Ruck retention':          (rucksWonAtt + jackalSteals) > 0 ? rucksWonAtt / (rucksWonAtt + jackalSteals) : 0,
    'Mauls / partido':         maulsTot / n,
    'Drives / maul':           maulsTot > 0 ? maulDrivesTot / maulsTot : 0,
    'Pick & go / partido':     pickAndGosTot / n,
    'Quick taps / partido':    quickTapsTot / n,
    'Box-kick chase win rate': boxKickContests > 0 ? boxKickChaseWins / boxKickContests : 0
  }

  const rows: CalibrationRow[] = []
  for (const [metric, t] of Object.entries(TARGETS)) {
    const obs = observed[metric] ?? 0
    rows.push({
      metric,
      observed: obs,
      target: t.mean,
      low: t.low,
      high: t.high,
      inRange: obs >= t.low && obs <= t.high
    })
  }
  return rows
}

// ====================================================================
// Validación extendida: histograma de márgenes, varianza, BP, upsets.
// ====================================================================

export type MarginBin = '0-3' | '4-7' | '8-15' | '16-24' | '25+'

const MARGIN_BIN_ORDER: MarginBin[] = ['0-3', '4-7', '8-15', '16-24', '25+']

function binFor(margin: number): MarginBin {
  const m = Math.abs(margin)
  if (m <= 3) return '0-3'
  if (m <= 7) return '4-7'
  if (m <= 15) return '8-15'
  if (m <= 24) return '16-24'
  return '25+'
}

export interface CalibrationReport {
  /** Filas medias compatibles con la calibración previa. */
  rows: CalibrationRow[]
  /** Puntos totales medios por partido. */
  avgTotalPoints: number
  /** Distribución porcentual de márgenes absolutos. */
  marginHistogram: Record<MarginBin, number>
  /** Varianza muestral del total de puntos por partido. */
  varianceTotalPoints: number
  /** Varianza muestral del margen (con signo, home − away). */
  varianceMargin: number
  /** Frecuencia (0–1) de partidos donde el local ganó BP4 / losing≤7 / equivalentes. */
  bonusPointFrequency: { tryBonusHome: number; tryBonusAway: number; losingBonusHome: number; losingBonusAway: number }
  /** Tasa de empate. */
  tieRate: number
  /** Frecuencia de palizas (>=25 puntos de margen). */
  blowoutRate: number
  /** Tasa de upset: gana el equipo con menos Elo. NaN si no se pasa eloDiff. */
  upsetRate: number
  /** Nivel competitivo simulado. */
  level: CompetitionLevel
}

export interface VerifyOpts {
  level?: CompetitionLevel
  competitionRules?: CompetitionRules
  importance?: number
  /** Diferencia de Elo home − away. Si se pasa, calcula tasa de upsets. */
  eloDiff?: number
}

/**
 * Versión extendida que devuelve métricas más allá del acierto de ganador:
 * histograma de márgenes, varianzas, frecuencia de bonus points, tasas de
 * empate, paliza y upset. Las métricas medias originales se preservan
 * en `rows` para compatibilidad con la UI existente.
 */
export function verifyCalibrationReport(
  home: MatchTeam,
  away: MatchTeam,
  n: number = 50,
  opts: VerifyOpts = {}
): CalibrationReport {
  const baseRows = verifyCalibration(home, away, n)
  const level = opts.level ?? 'pro_domestic'
  const rules = opts.competitionRules
  const tryBonusOn = rules?.tryBonus ?? false
  const losingBonusOn = rules?.losingBonus ?? false

  const margins: number[] = []
  const totals: number[] = []
  const histCounts: Record<MarginBin, number> = { '0-3': 0, '4-7': 0, '8-15': 0, '16-24': 0, '25+': 0 }
  let ties = 0
  let blowouts = 0
  let bpTryHome = 0, bpTryAway = 0, bpLosHome = 0, bpLosAway = 0
  let upsets = 0
  let upsetEligible = 0

  for (let i = 0; i < n; i++) {
    const r = simulateMatch(home, away, {
      seed: i,
      importance: opts.importance,
      level,
      competitionRules: rules
    })
    const h = r.finalScore.home
    const a = r.finalScore.away
    const margin = h - a
    totals.push(h + a)
    margins.push(margin)
    histCounts[binFor(margin)] += 1
    if (margin === 0) ties += 1
    if (Math.abs(margin) >= 25) blowouts += 1
    if (tryBonusOn) {
      if (r.tries.home >= 4) bpTryHome += 1
      if (r.tries.away >= 4) bpTryAway += 1
    }
    if (losingBonusOn) {
      if (h < a && (a - h) <= 7) bpLosHome += 1
      if (a < h && (h - a) <= 7) bpLosAway += 1
    }
    if (opts.eloDiff != null && Math.abs(opts.eloDiff) >= 50) {
      upsetEligible += 1
      // Upset: gana quien tiene menor Elo. Si eloDiff > 0, home es favorito.
      if (opts.eloDiff > 0 && a > h) upsets += 1
      else if (opts.eloDiff < 0 && h > a) upsets += 1
    }
  }

  const meanTotal = totals.reduce((s, x) => s + x, 0) / Math.max(1, n)
  const meanMargin = margins.reduce((s, x) => s + x, 0) / Math.max(1, n)
  const varTotal = totals.reduce((s, x) => s + (x - meanTotal) ** 2, 0) / Math.max(1, n - 1)
  const varMargin = margins.reduce((s, x) => s + (x - meanMargin) ** 2, 0) / Math.max(1, n - 1)

  const histogram: Record<MarginBin, number> = { '0-3': 0, '4-7': 0, '8-15': 0, '16-24': 0, '25+': 0 }
  for (const bin of MARGIN_BIN_ORDER) histogram[bin] = (histCounts[bin] / Math.max(1, n)) * 100

  return {
    rows: baseRows,
    avgTotalPoints: meanTotal,
    marginHistogram: histogram,
    varianceTotalPoints: varTotal,
    varianceMargin: varMargin,
    bonusPointFrequency: {
      tryBonusHome: bpTryHome / Math.max(1, n),
      tryBonusAway: bpTryAway / Math.max(1, n),
      losingBonusHome: bpLosHome / Math.max(1, n),
      losingBonusAway: bpLosAway / Math.max(1, n)
    },
    tieRate: ties / Math.max(1, n),
    blowoutRate: blowouts / Math.max(1, n),
    upsetRate: upsetEligible > 0 ? upsets / upsetEligible : NaN,
    level
  }
}

/**
 * Compara el histograma observado con los targets del nivel. Devuelve true
 * si todos los bins están dentro de ±5 puntos porcentuales del target.
 */
export function marginsMatchLevelTarget(report: CalibrationReport, tolerance = 5): boolean {
  const targets = paramsForLevel(report.level).targetMarginBins
  let i = 0
  for (const bin of MARGIN_BIN_ORDER) {
    if (Math.abs(report.marginHistogram[bin] - targets[i]) > tolerance) return false
    i++
  }
  return true
}

/** Formatea una fila como string legible. */
export function formatCalibrationRow(row: CalibrationRow): string {
  const fmt = (v: number) =>
    Math.abs(v) >= 10 ? v.toFixed(1)
    : Math.abs(v) < 1 ? v.toFixed(3)
    : v.toFixed(2)
  const mark = row.inRange ? '✓' : '✗'
  return `${mark} ${row.metric.padEnd(24)} ${fmt(row.observed).padStart(7)}  (target ${fmt(row.target)}, range ${fmt(row.low)}-${fmt(row.high)})`
}
