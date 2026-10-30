// Generador de fixtures con sistema round-robin doble (ida y vuelta).
// Algoritmo "circle method": se fija un equipo y se rotan los demás.

import type { ID, Match, ISODate, BlockedRange } from '../types/index.ts'
import { newId } from '../utils/id.ts'
import { addDays, daysBetween, parseISODate } from '../utils/date.ts'

interface Pair { home: ID; away: ID; round: number }

export const MIN_REST_DAYS = 5

export interface FixtureGenerationOptions {
  firstMatchDate: ISODate
  daysBetweenRounds?: number
  /** Rangos prohibidos: rondas que caerían dentro se desplazan al primer día
   *  posterior libre. Las release windows internacionales viven aquí. */
  blockedRanges?: BlockedRange[]
}

/** Si `date` cae en algún rango, devuelve el día siguiente al final del rango
 *  y reintenta (los rangos pueden encadenarse). */
export function advancePastBlocked(date: ISODate, ranges: BlockedRange[]): ISODate {
  if (ranges.length === 0) return date
  let current = date
  let movedInPass = true
  while (movedInPass) {
    movedInPass = false
    for (const r of ranges) {
      if (current >= r.start && current <= r.end) {
        current = addDays(r.end, 1)
        movedInPass = true
      }
    }
  }
  return current
}

function weekendSlotsFrom(iso: ISODate): ISODate[] {
  const day = parseISODate(iso).getDay()
  const offsetsByDay: Record<number, number[]> = {
    0: [0],
    1: [4, 5, 6],
    2: [3, 4, 5],
    3: [2, 3, 4],
    4: [1, 2, 3],
    5: [0, 1, 2],
    6: [0, 1]
  }
  return offsetsByDay[day].map((offset) => addDays(iso, offset))
}

export function weekendSlotForIndex(weekendStart: ISODate, index: number): ISODate {
  const slots = weekendSlotsFrom(weekendStart)
  return slots[index % slots.length]
}

function hasMinimumRest(lastMatchByTeam: Map<ID, ISODate>, teamId: ID, date: ISODate): boolean {
  const lastDate = lastMatchByTeam.get(teamId)
  return !lastDate || daysBetween(lastDate, date) >= MIN_REST_DAYS
}

function nextDateWithRest(
  preferredDate: ISODate,
  home: ID,
  away: ID,
  lastMatchByTeam: Map<ID, ISODate>,
  blockedRanges: BlockedRange[] = []
): ISODate {
  let date = advancePastBlocked(preferredDate, blockedRanges)
  while (
    !hasMinimumRest(lastMatchByTeam, home, date) ||
    !hasMinimumRest(lastMatchByTeam, away, date)
  ) {
    date = advancePastBlocked(addDays(date, 1), blockedRanges)
  }
  return date
}

function registerMatchDate(lastMatchByTeam: Map<ID, ISODate>, home: ID, away: ID, date: ISODate) {
  lastMatchByTeam.set(home, date)
  lastMatchByTeam.set(away, date)
}

/**
 * Genera todos los partidos de una liga round-robin doble.
 * - Si hay número impar de equipos, añade un "bye" virtual.
 * - Primera vuelta: cada equipo se enfrenta a todos los demás una vez.
 * - Segunda vuelta: misma pareja invertida (local <-> visitante).
 *
 * Acepta dos firmas:
 *  - Antigua (positional): generateFixtures(id, clubs, year, date, days?)
 *  - Nueva (options): generateFixtures(id, clubs, year, { firstMatchDate, daysBetweenRounds?, blockedRanges? })
 */
export function generateFixtures(
  competitionId: ID,
  clubIds: ID[],
  seasonYear: number,
  firstMatchDate: ISODate,
  daysBetweenRounds?: number
): Match[]
export function generateFixtures(
  competitionId: ID,
  clubIds: ID[],
  seasonYear: number,
  options: FixtureGenerationOptions
): Match[]
export function generateFixtures(
  competitionId: ID,
  clubIds: ID[],
  seasonYear: number,
  optionsOrDate: ISODate | FixtureGenerationOptions,
  daysBetweenRoundsArg: number = 7
): Match[] {
  const options: Required<FixtureGenerationOptions> = typeof optionsOrDate === 'string'
    ? { firstMatchDate: optionsOrDate, daysBetweenRounds: daysBetweenRoundsArg, blockedRanges: [] }
    : {
        firstMatchDate: optionsOrDate.firstMatchDate,
        daysBetweenRounds: optionsOrDate.daysBetweenRounds ?? 7,
        blockedRanges: optionsOrDate.blockedRanges ?? []
      }
  const { firstMatchDate, daysBetweenRounds, blockedRanges } = options

  if (clubIds.length < 2) return []
  const teams: (ID | null)[] = [...clubIds]
  if (teams.length % 2 !== 0) teams.push(null) // bye
  const n = teams.length
  const rounds = n - 1

  const firstHalf: Pair[] = []
  const positions = teams.map((_, i) => i)

  for (let r = 0; r < rounds; r++) {
    for (let i = 0; i < n / 2; i++) {
      const aIdx = positions[i]
      const bIdx = positions[n - 1 - i]
      const a = teams[aIdx]
      const b = teams[bIdx]
      if (a === null || b === null) continue
      const swap = (r + i) % 2 === 0
      firstHalf.push({
        home: swap ? a : b,
        away: swap ? b : a,
        round: r + 1
      })
    }
    // Rotación: fija positions[0], mueve el resto en círculo
    const last = positions.pop()!
    positions.splice(1, 0, last)
  }

  // Segunda vuelta: pareja invertida, rondas +rounds
  const secondHalf: Pair[] = firstHalf.map((m) => ({
    home: m.away,
    away: m.home,
    round: m.round + rounds
  }))

  const allPairs = [...firstHalf, ...secondHalf]
  const lastMatchByTeam = new Map<ID, ISODate>()
  const matches: Match[] = []

  for (let round = 1; round <= rounds * 2; round++) {
    const roundPairs = allPairs.filter((p) => p.round === round)
    const rawRoundStart = addDays(firstMatchDate, (round - 1) * daysBetweenRounds)
    const roundStart = advancePastBlocked(rawRoundStart, blockedRanges)

    for (let i = 0; i < roundPairs.length; i++) {
      const p = roundPairs[i]
      const preferredDate = advancePastBlocked(weekendSlotForIndex(roundStart, i), blockedRanges)
      const date = nextDateWithRest(preferredDate, p.home, p.away, lastMatchByTeam, blockedRanges)
      registerMatchDate(lastMatchByTeam, p.home, p.away, date)

      matches.push({
        id: newId('mch'),
        competitionId,
        seasonYear,
        date,
        round: p.round,
        homeClubId: p.home,
        awayClubId: p.away,
        played: false
      })
    }
  }

  return matches
}

export function normalizeMatchDatesForRest(
  matches: Match[],
  blockedRanges: BlockedRange[] = []
): Match[] {
  const lastMatchByTeam = new Map<ID, ISODate>()
  const updated = new Map<ID, Match>()

  const sorted = [...matches].sort((a, b) =>
    a.date.localeCompare(b.date) ||
    a.round - b.round ||
    a.id.localeCompare(b.id)
  )

  for (const match of sorted) {
    if (match.played) {
      registerMatchDate(lastMatchByTeam, match.homeClubId, match.awayClubId, match.date)
      updated.set(match.id, match)
      continue
    }

    const date = nextDateWithRest(
      match.date, match.homeClubId, match.awayClubId, lastMatchByTeam, blockedRanges
    )
    const nextMatch = date === match.date ? match : { ...match, date }
    registerMatchDate(lastMatchByTeam, match.homeClubId, match.awayClubId, date)
    updated.set(match.id, nextMatch)
  }

  return matches.map((match) => updated.get(match.id) ?? match)
}
