// Generador de fixtures para formato `international_split`:
// 12 selecciones en 2 pools de 6, cada A vs cada B una vez.
// Jul: rondas 1-3 (Pool A visita, Pool B hostea).
// Nov: rondas 4-6 (Pool B visita, Pool A hostea).
// Finals Weekend (rondas 100+) se genera dinámicamente al cierre del grupo.

import type { ID, Match, ISODate } from '../types/index.ts'
import { newId } from '../utils/id.ts'
import { addDays } from '../utils/date.ts'
import { advancePastBlocked, weekendSlotForIndex } from './fixtures.ts'
import type { BlockedRange } from '../types/index.ts'

export interface IntlSplitFixtureOptions {
  /** Primer fin de semana de la ventana de julio. */
  julyAnchor: ISODate
  /** Primer fin de semana de la ventana de noviembre. */
  novemberAnchor: ISODate
  /** 6 IDs (típicamente Country) en Pool A. */
  poolA: ID[]
  /** 6 IDs (típicamente Country) en Pool B. */
  poolB: ID[]
  /** Días entre rondas dentro de cada ventana (default 7). */
  daysBetweenRounds?: number
  blockedRanges?: BlockedRange[]
}

/**
 * Cross-pool round-robin: cada equipo A juega cada equipo B exactamente una vez
 * a lo largo de 6 rondas (3 en julio + 3 en noviembre). Localía rotada por ventana.
 */
export function generateIntlSplitFixtures(
  competitionId: ID,
  seasonYear: number,
  opts: IntlSplitFixtureOptions
): Match[] {
  if (opts.poolA.length !== 6 || opts.poolB.length !== 6) {
    throw new Error(`international_split requiere pools de 6 (got ${opts.poolA.length} / ${opts.poolB.length})`)
  }
  const daysBetweenRounds = opts.daysBetweenRounds ?? 7
  const blockedRanges = opts.blockedRanges ?? []
  const matches: Match[] = []

  for (let round = 1; round <= 6; round++) {
    const inJuly = round <= 3
    const indexInWindow = inJuly ? round - 1 : round - 4
    const windowAnchor = inJuly ? opts.julyAnchor : opts.novemberAnchor
    const roundStart = advancePastBlocked(
      addDays(windowAnchor, indexInWindow * daysBetweenRounds),
      blockedRanges
    )

    // Pairing del round: A[i] vs B[(i + round - 1) % 6]
    // Permite que cada A juegue cada B exactamente una vez en 6 rondas.
    const offset = round - 1
    for (let i = 0; i < 6; i++) {
      const a = opts.poolA[i]
      const b = opts.poolB[(i + offset) % 6]
      const date = advancePastBlocked(weekendSlotForIndex(roundStart, i), blockedRanges)
      // Jul: Pool A visita a Pool B (sur recibe en su invierno austral).
      // Nov: Pool A recibe en casa.
      const home = inJuly ? b : a
      const away = inJuly ? a : b
      matches.push({
        id: newId('mch'),
        competitionId,
        seasonYear,
        date,
        round,
        homeClubId: home,
        awayClubId: away,
        played: false
      })
    }
  }

  return matches
}
