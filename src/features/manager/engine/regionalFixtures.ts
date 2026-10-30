// Generadores de fixtures para competencias regionales entre selecciones.
//
// World Rugby alberga formatos muy diversos en sus competencias continentales:
//  - Africa Cup / Asia Championship / REC Championship: round-robin único entre
//    4-8 selecciones (regional_pool).
//  - Asia Division 1 / Africa Repechage: knockout de 4 con semis + final en
//    misma sede (ko_bracket).
//  - Sudamericano: semis ida-vuelta + final ida-vuelta entre Uruguay, Chile,
//    Brasil, Paraguay (sudamericano_bracket).
//  - Brasil-Colombia playoff WRWC: dos partidos ida-vuelta (two_leg_playoff).
//
// Estos generadores producen Match[] usando Country.id como homeClubId/awayClubId
// (convención del codebase para formatos internacionales).

import type { ID, ISODate, Match, BlockedRange } from '../types/index.ts'
import { newId } from '../utils/id.ts'
import { addDays } from '../utils/date.ts'
import { advancePastBlocked, weekendSlotForIndex } from './fixtures.ts'

export interface RegionalPoolOptions {
  firstMatchDate: ISODate
  /** Días entre jornadas (default 7). */
  daysBetweenRounds?: number
  blockedRanges?: BlockedRange[]
}

/** Round-robin único: cada selección juega contra cada otra UNA vez.
 *  N selecciones → N-1 jornadas, N*(N-1)/2 partidos en total. */
export function generateRegionalPool(
  competitionId: ID,
  seasonYear: number,
  countryIds: ID[],
  options: RegionalPoolOptions
): Match[] {
  const daysBetweenRounds = options.daysBetweenRounds ?? 7
  const blockedRanges = options.blockedRanges ?? []

  if (countryIds.length < 2) return []
  const teams: (ID | null)[] = [...countryIds]
  if (teams.length % 2 !== 0) teams.push(null) // bye virtual

  const n = teams.length
  const rounds = n - 1
  const positions = teams.map((_, i) => i)
  const matches: Match[] = []

  for (let r = 0; r < rounds; r++) {
    const rawRoundStart = addDays(options.firstMatchDate, r * daysBetweenRounds)
    const roundStart = advancePastBlocked(rawRoundStart, blockedRanges)
    let slot = 0
    for (let i = 0; i < n / 2; i++) {
      const aIdx = positions[i]
      const bIdx = positions[n - 1 - i]
      const a = teams[aIdx]
      const b = teams[bIdx]
      if (a === null || b === null) continue
      const swap = (r + i) % 2 === 0
      const home = swap ? a : b
      const away = swap ? b : a
      const date = advancePastBlocked(weekendSlotForIndex(roundStart, slot), blockedRanges)
      matches.push({
        id: newId('mch'),
        competitionId,
        seasonYear,
        date,
        round: r + 1,
        homeClubId: home,
        awayClubId: away,
        played: false
      })
      slot++
    }
    // Rotación circle method: fija positions[0], mueve el resto.
    const last = positions.pop()!
    positions.splice(1, 0, last)
  }

  return matches
}

export interface KOBracketOptions {
  /** Fecha de las semifinales (4 → 2). */
  semisDate: ISODate
  /** Fecha de la final (2 → 1). Default: semisDate + 7 días. */
  finalDate?: ISODate
  blockedRanges?: BlockedRange[]
}

/** Bracket de 4 con semis + final. Seeds ordenadas: [s1, s2, s3, s4].
 *  Semis: s1 vs s4 (round 1), s2 vs s3 (round 1). Final: winners (round 2). */
export function generateKOBracket(
  competitionId: ID,
  seasonYear: number,
  seeds: [ID, ID, ID, ID],
  options: KOBracketOptions
): Match[] {
  const blockedRanges = options.blockedRanges ?? []
  const semisDate = advancePastBlocked(options.semisDate, blockedRanges)
  const finalDate = advancePastBlocked(
    options.finalDate ?? addDays(options.semisDate, 7),
    blockedRanges
  )
  const [s1, s2, s3, s4] = seeds

  // Semifinales (la seed más alta juega en casa).
  const semi1: Match = {
    id: newId('mch'), competitionId, seasonYear,
    date: semisDate, round: 1,
    homeClubId: s1, awayClubId: s4, played: false
  }
  const semi2: Match = {
    id: newId('mch'), competitionId, seasonYear,
    date: semisDate, round: 1,
    homeClubId: s2, awayClubId: s3, played: false
  }
  // Final: los huecos los rellena `tournament.advanceFinal` cuando ambas
  // semis terminan. Aquí dejamos placeholders en homeClubId=s1, awayClubId=s2
  // que se sustituyen al avanzar. Para simplicidad de Fase B, marcamos el
  // partido como pendiente y dejaremos que el motor lo simule cuando llegue
  // la fecha; el resolver de bracket se completa en Fase D.
  const final: Match = {
    id: newId('mch'), competitionId, seasonYear,
    date: finalDate, round: 2,
    homeClubId: s1, awayClubId: s2, played: false
  }

  return [semi1, semi2, final]
}

export interface SudamericanoBracketOptions {
  /** Fecha de la jornada ida de semifinales. */
  semisLeg1Date: ISODate
  /** Fecha de la jornada vuelta (default +7 días). */
  semisLeg2Date?: ISODate
  /** Fecha de la final ida (default semisLeg2 + 21 días). */
  finalLeg1Date?: ISODate
  /** Fecha de la final vuelta (default finalLeg1 + 7 días). */
  finalLeg2Date?: ISODate
  blockedRanges?: BlockedRange[]
}

/** Sudamericano: semis ida-vuelta + final ida-vuelta entre 4 selecciones
 *  seedadas [s1, s2, s3, s4]. Total: 6 partidos. */
export function generateSudamericanoBracket(
  competitionId: ID,
  seasonYear: number,
  seeds: [ID, ID, ID, ID],
  options: SudamericanoBracketOptions
): Match[] {
  const blocked = options.blockedRanges ?? []
  const semisLeg1 = advancePastBlocked(options.semisLeg1Date, blocked)
  const semisLeg2 = advancePastBlocked(options.semisLeg2Date ?? addDays(options.semisLeg1Date, 7), blocked)
  const finalLeg1 = advancePastBlocked(options.finalLeg1Date ?? addDays(semisLeg2, 21), blocked)
  const finalLeg2 = advancePastBlocked(options.finalLeg2Date ?? addDays(finalLeg1, 7), blocked)
  const [s1, s2, s3, s4] = seeds

  // Round 1: semifinal ida (s4 visita a s1, s3 visita a s2).
  const sf1Leg1: Match = {
    id: newId('mch'), competitionId, seasonYear,
    date: semisLeg1, round: 1,
    homeClubId: s4, awayClubId: s1, played: false
  }
  const sf2Leg1: Match = {
    id: newId('mch'), competitionId, seasonYear,
    date: semisLeg1, round: 1,
    homeClubId: s3, awayClubId: s2, played: false
  }
  // Round 2: semifinal vuelta (s1 recibe en casa).
  const sf1Leg2: Match = {
    id: newId('mch'), competitionId, seasonYear,
    date: semisLeg2, round: 2,
    homeClubId: s1, awayClubId: s4, played: false
  }
  const sf2Leg2: Match = {
    id: newId('mch'), competitionId, seasonYear,
    date: semisLeg2, round: 2,
    homeClubId: s2, awayClubId: s3, played: false
  }
  // Round 3 y 4: final ida y vuelta. Los placeholders (s2, s1) se reemplazan
  // cuando se resuelvan las semis en Fase D.
  const fLeg1: Match = {
    id: newId('mch'), competitionId, seasonYear,
    date: finalLeg1, round: 3,
    homeClubId: s2, awayClubId: s1, played: false
  }
  const fLeg2: Match = {
    id: newId('mch'), competitionId, seasonYear,
    date: finalLeg2, round: 4,
    homeClubId: s1, awayClubId: s2, played: false
  }

  return [sf1Leg1, sf2Leg1, sf1Leg2, sf2Leg2, fLeg1, fLeg2]
}

export interface TwoLegPlayoffOptions {
  leg1Date: ISODate
  leg2Date?: ISODate          // default leg1+7
  blockedRanges?: BlockedRange[]
}

/** Playoff a doble partido entre dos selecciones. Pensado para Brasil-Colombia
 *  WRWC y para los play-offs cruzados de RWC qualifiers. */
export function generateTwoLegPlayoff(
  competitionId: ID,
  seasonYear: number,
  countries: [ID, ID],
  options: TwoLegPlayoffOptions
): Match[] {
  const blocked = options.blockedRanges ?? []
  const leg1 = advancePastBlocked(options.leg1Date, blocked)
  const leg2 = advancePastBlocked(options.leg2Date ?? addDays(options.leg1Date, 7), blocked)
  const [a, b] = countries

  return [
    {
      id: newId('mch'), competitionId, seasonYear,
      date: leg1, round: 1,
      homeClubId: a, awayClubId: b, played: false
    },
    {
      id: newId('mch'), competitionId, seasonYear,
      date: leg2, round: 2,
      homeClubId: b, awayClubId: a, played: false
    }
  ]
}
