// Champions Cup: 8 equipos, formato eliminatorio puro.
// QF (round 1) → SF (round 2) → Final (round 3).
// Sólo QF se pre-genera al inicio. Las siguientes rondas se crean
// automáticamente cuando se completa la anterior.

import type { ID, World, Match, Competition, BlockedRange } from '../types/index.ts'
import { newId } from '../utils/id.ts'
import { addDays } from '../utils/date.ts'
import { advancePastBlocked, normalizeMatchDatesForRest, weekendSlotForIndex } from './fixtures.ts'

export const STAGE_NAMES: Record<number, string> = {
  1: 'Cuartos de final',
  2: 'Semifinales',
  3: 'Final'
}

/**
 * Selecciona 8 equipos qualifiers: top 4 reputación de cada Tier-1
 * (Top 14 + Premiership) si los hay, completa con tier 2.
 */
function pickQualifiers(world: World): string[] {
  const tier1Comps = world.competitions.filter((c) => c.tier === 1)
  const qualifiers: string[] = []
  for (const comp of tier1Comps) {
    const clubsInLeague = comp.clubIds
      .map((id) => world.clubs.find((cl) => cl.id === id)!)
      .filter(Boolean)
      .sort((a, b) => b.reputation - a.reputation)
      .slice(0, 4)
    qualifiers.push(...clubsInLeague.map((cl) => cl.id))
  }
  // Si no hay suficientes, completar desde tier 2 ordenado por reputación
  if (qualifiers.length < 8) {
    const tier2 = world.competitions.filter((c) => c.tier === 2)
    for (const comp of tier2) {
      const clubsInLeague = comp.clubIds
        .map((id) => world.clubs.find((cl) => cl.id === id)!)
        .filter((cl) => cl && !qualifiers.includes(cl.id))
        .sort((a, b) => b.reputation - a.reputation)
      for (const cl of clubsInLeague) {
        if (qualifiers.length >= 8) break
        qualifiers.push(cl.id)
      }
    }
  }
  return qualifiers.slice(0, 8)
}

export function buildChampionsCup(
  world: World,
  seasonYear: number,
  blockedRanges: BlockedRange[] = []
): { competition: Competition; matches: Match[] } {
  const competition: Competition = {
    id: newId('comp'),
    name: 'Investec Champions Cup',
    shortName: 'CCup',
    countryId: null,
    format: 'european',
    tier: 1,
    rules: {
      pointsForWin: 0, pointsForDraw: 0, pointsForLoss: 0,
      tryBonus: false, losingBonus: false,
      hasPlayoff: false, playoffTeams: 0,
      promotion: 0, relegation: 0
    },
    clubIds: pickQualifiers(world)
  }
  if (competition.clubIds.length !== 8) {
    return { competition, matches: [] }
  }
  // Emparejamiento por seed: 1v8, 2v7, 3v6, 4v5
  const seeds = [...competition.clubIds].sort((a, b) => {
    const ra = world.clubs.find((c) => c.id === a)!.reputation
    const rb = world.clubs.find((c) => c.id === b)!.reputation
    return rb - ra
  })
  const pairings: Array<[string, string]> = [
    [seeds[0], seeds[7]],
    [seeds[1], seeds[6]],
    [seeds[2], seeds[5]],
    [seeds[3], seeds[4]]
  ]
  // QF en la segunda semana de diciembre (calendario europeo real).
  const qfDate = advancePastBlocked(`${seasonYear}-12-12`, blockedRanges)
  const matches: Match[] = pairings.map(([h, a], index) => ({
    id: newId('mch'),
    competitionId: competition.id,
    seasonYear,
    date: advancePastBlocked(weekendSlotForIndex(qfDate, index), blockedRanges),
    round: 1, // QF
    homeClubId: h,
    awayClubId: a,
    played: false
  }))
  return { competition, matches }
}

/**
 * Si todos los partidos de la última fase de una competición european están jugados,
 * genera los partidos de la siguiente fase con los ganadores.
 *
 * Si se pasa `blockedRanges`, los partidos de la nueva fase se desplazan más
 * allá de cualquier ventana internacional para evitar choques (Six Nations, etc.).
 */
export function maybeAdvanceTournament(
  world: World,
  competitionId: ID,
  blockedRanges: BlockedRange[] = []
): World {
  const comp = world.competitions.find((c) => c.id === competitionId)
  if (!comp || comp.format !== 'european') return world

  const compMatches = world.matches.filter((m) => m.competitionId === competitionId)
  if (compMatches.length === 0) return world

  const maxStage = Math.max(...compMatches.map((m) => m.round))
  if (maxStage >= 3) return world // Ya está la final

  const currentStageMatches = compMatches
    .filter((m) => m.round === maxStage)
    .sort((a, b) => a.id.localeCompare(b.id))
  if (!currentStageMatches.every((m) => m.played)) return world

  const winners: ID[] = currentStageMatches.map((m) => {
    if (!m.result) return m.homeClubId
    return m.result.homeScore >= m.result.awayScore ? m.homeClubId : m.awayClubId
  })
  if (winners.length < 2) return world

  const nextStage = maxStage + 1
  const lastDate = [...currentStageMatches].sort((a, b) => a.date.localeCompare(b.date)).slice(-1)[0].date
  // Tiempo entre rondas: QF→SF ~3 meses (acaba en Abr), SF→Final ~6 semanas (May).
  const daysGap = nextStage === 2 ? 90 : 42
  const newDate = advancePastBlocked(addDays(lastDate, daysGap), blockedRanges)
  const newMatches: Match[] = []
  for (let i = 0; i < winners.length; i += 2) {
    newMatches.push({
      id: newId('mch'),
      competitionId,
      seasonYear: comp.clubIds.length > 0
        ? Number((world.matches.find((m) => m.competitionId === competitionId)?.seasonYear) ?? world.seasonYear)
        : world.seasonYear,
      date: advancePastBlocked(weekendSlotForIndex(newDate, i / 2), blockedRanges),
      round: nextStage,
      homeClubId: winners[i],
      awayClubId: winners[i + 1],
      played: false
    })
  }
  // Las ventanas internacionales (`blockedRanges`) valen para los partidos NUEVOS de la fase.
  // Aplicarlas a todo el calendario empujaba a la fecha de fin de la ventana a más de mil
  // partidos pendientes de otras competiciones, incluido el próximo partido del club del
  // entrenador. Se normaliza todo para respetar el descanso, pero solo se conserva lo nuevo.
  const normalized = normalizeMatchDatesForRest([...world.matches, ...newMatches], blockedRanges)
  return { ...world, matches: [...world.matches, ...normalized.slice(world.matches.length)] }
}
