// Generador de fixtures para `sevens_circuit`: HSBC SVNS de 13 etapas.
// Por costo de simulación, en esta iteración se modela cada etapa como UN
// partido representativo "final de etapa" entre los dos mejores cabezas de
// serie. Esto preserva el calendario visible (13 fines de semana únicos) sin
// generar ~286 partidos extra por temporada.

import type { ID, Match, ISODate, BlockedRange } from '../types/index.ts'
import { newId } from '../utils/id.ts'
import { advancePastBlocked } from './fixtures.ts'

export interface SevensStage {
  /** Etiqueta: 'Dubai', 'Ciudad del Cabo', etc. */
  city: string
  /** Fecha del fin de semana de la etapa (sábado). */
  date: ISODate
}

export interface SevensCircuitOptions {
  /** 12 IDs de Country participantes. */
  nationIds: ID[]
  /** 13 etapas en fechas reales del calendario SVNS 2026-2027. */
  stages: SevensStage[]
  blockedRanges?: BlockedRange[]
}

/** Calendario SVNS 2026-2027 (extracto): 13 fines de semana únicos
 *  entre fin de noviembre 2026 y principio de junio 2027. */
export function defaultSVNSStages2026(): SevensStage[] {
  return [
    { city: 'Dubai',           date: '2026-11-28' },
    { city: 'Ciudad del Cabo', date: '2026-12-05' },
    { city: 'Singapur',        date: '2027-01-30' },
    { city: 'Perth',           date: '2027-02-06' },
    { city: 'Vancouver',       date: '2027-03-06' },
    { city: 'Nueva York',      date: '2027-03-13' },
    { city: 'Hong Kong',       date: '2027-04-03' },
    { city: 'Valladolid',      date: '2027-04-17' },
    { city: 'Bordeaux',        date: '2027-05-01' },
    { city: 'Madrid',          date: '2027-05-15' },
    { city: 'Los Angeles',     date: '2027-05-22' },
    { city: 'Cape Town Final', date: '2027-05-29' },
    { city: 'World Final',     date: '2027-06-05' }
  ]
}

export function generateSevensCircuitFixtures(
  competitionId: ID,
  seasonYear: number,
  opts: SevensCircuitOptions
): Match[] {
  if (opts.nationIds.length !== 12) {
    throw new Error(`sevens_circuit requiere 12 selecciones (got ${opts.nationIds.length})`)
  }
  const blockedRanges = opts.blockedRanges ?? []
  const matches: Match[] = []
  // Etapa N representa el "match final de etapa" entre los seeds 1 y 2 rotados,
  // de forma que distintas selecciones disputen distintas etapas.
  for (let i = 0; i < opts.stages.length; i++) {
    const stage = opts.stages[i]
    const home = opts.nationIds[i % opts.nationIds.length]
    const away = opts.nationIds[(i + 1) % opts.nationIds.length]
    if (home === away) continue
    matches.push({
      id: newId('mch'),
      competitionId,
      seasonYear,
      date: advancePastBlocked(stage.date, blockedRanges),
      round: i + 1,
      homeClubId: home,
      awayClubId: away,
      played: false
    })
  }
  return matches
}
