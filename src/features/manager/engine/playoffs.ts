// Playoffs de liga: tras temporada regular, top N por clasificación juegan KO.
// Se conservan en la misma Competition con rounds incrementales.

import type { ID, World, Match, Competition } from '../types/index.ts'
import { newId } from '../utils/id.ts'
import { addDays } from '../utils/date.ts'
import { computeStandings } from './standings.ts'
import { normalizeMatchDatesForRest, weekendSlotForIndex } from './fixtures.ts'

/** Número de jornadas de la fase regular para una liga de N equipos (ida y vuelta). */
function regularRoundsCountFor(teams: number): number {
  return (teams % 2 === 0 ? teams - 1 : teams) * 2
}

/** True si el partido pertenece a una ronda eliminatoria (KO) — sea playoff de liga
 *  o competición europea/copa donde todas las rondas son KO. */
export function isKnockoutMatch(world: World, match: Match): boolean {
  const comp = world.competitions.find((c) => c.id === match.competitionId)
  if (!comp) return false
  if (comp.format === 'european' || comp.format === 'cup') return true
  if (comp.format === 'league' && comp.rules.hasPlayoff) {
    return match.round > regularRoundsCountFor(comp.clubIds.length)
  }
  return false
}

/** Devuelve true si la temporada regular acaba de terminar (todas las jornadas regulares jugadas,
 *  pero todavía no se han generado los partidos del playoff). */
function isRegularSeasonComplete(world: World, competitionId: ID): boolean {
  const comp = world.competitions.find((c) => c.id === competitionId)
  if (!comp || comp.format !== 'league' || !comp.rules.hasPlayoff) return false
  const regularRoundsCount = regularRoundsCountFor(comp.clubIds.length)
  const matches = world.matches.filter((m) => m.competitionId === competitionId)
  const regularMatches = matches.filter((m) => m.round <= regularRoundsCount)
  const allRegularPlayed = regularMatches.length > 0 && regularMatches.every((m) => m.played)
  const playoffAlreadyGenerated = matches.some((m) => m.round > regularRoundsCount)
  return allRegularPlayed && !playoffAlreadyGenerated
}

/** Genera los partidos de la primera ronda del playoff.
 *  - top 4: SF (1v4, 2v3) — los 4 qualifiers se cruzan.
 *  - top 6: barrages (3v6 y 4v5) — los seeds 1 y 2 tienen bye y entran en SF.
 *  - top 8: QF (1v8, 2v7, 3v6, 4v5) — los 8 qualifiers se cruzan. */
export function maybeGenerateLeaguePlayoffs(world: World, competitionId: ID): World {
  if (!isRegularSeasonComplete(world, competitionId)) return world
  const comp = world.competitions.find((c) => c.id === competitionId)!
  const teams = comp.clubIds.length
  const regularRoundsCount = regularRoundsCountFor(teams)
  const playoffTeams = comp.rules.playoffTeams
  const standings = computeStandings(competitionId, world)
  const qualifiers = standings.slice(0, playoffTeams).map((s) => s.clubId)
  if (qualifiers.length < 2) return world

  const lastRegularDate = world.matches
    .filter((m) => m.competitionId === competitionId)
    .map((m) => m.date)
    .sort()
    .slice(-1)[0] ?? world.currentDate
  const playoffDate = addDays(lastRegularDate, 14)

  // Emparejar por seed según formato.
  const pairings: Array<[ID, ID]> = []
  if (playoffTeams === 6) {
    // Top 6 con byes: 1-2 saltan a SF, 3v6 y 4v5 disputan los barrages.
    // Orden importante: barrage A (3v6) antes que B (4v5) para que al ordenar
    // por id en maybeAdvanceLeaguePlayoffs el primero sea siempre el 3v6.
    pairings.push([qualifiers[2], qualifiers[5]])  // 3v6
    pairings.push([qualifiers[3], qualifiers[4]])  // 4v5
  } else {
    // Top 4 (SF) y top 8 (QF): cruce simétrico por seed.
    for (let i = 0; i < qualifiers.length / 2; i++) {
      pairings.push([qualifiers[i], qualifiers[qualifiers.length - 1 - i]])
    }
  }
  const firstStageRound = regularRoundsCount + 1
  const newMatches: Match[] = pairings.map(([home, away], index) => ({
    id: newId('mch'),
    competitionId,
    seasonYear: world.seasonYear,
    date: weekendSlotForIndex(playoffDate, index),
    round: firstStageRound,
    homeClubId: home,
    awayClubId: away,
    played: false
  }))
  return { ...world, matches: normalizeMatchDatesForRest([...world.matches, ...newMatches]) }
}

/** Tras simular una ronda de playoff, si todos los partidos de esa fase están jugados,
 *  generar la siguiente fase con los ganadores. Gestiona también el caso especial top-6:
 *  tras los barrages, las SF se generan reasignando los seeds 1 y 2 (que tenían bye). */
export function maybeAdvanceLeaguePlayoffs(world: World, competitionId: ID): World {
  const comp = world.competitions.find((c) => c.id === competitionId)
  if (!comp || comp.format !== 'league' || !comp.rules.hasPlayoff) return world
  const regularRoundsCount = regularRoundsCountFor(comp.clubIds.length)
  const playoffMatches = world.matches.filter((m) => m.competitionId === competitionId && m.round > regularRoundsCount)
  if (playoffMatches.length === 0) return world

  const maxStage = Math.max(...playoffMatches.map((m) => m.round))
  const currentStage = playoffMatches.filter((m) => m.round === maxStage)
  if (!currentStage.every((m) => m.played)) return world

  // Solo si hay 2+ partidos: generar siguiente fase
  if (currentStage.length < 2) return world

  // Caso especial top-6: tras los 2 barrages, generar SF con seeds 1 y 2 (con bye)
  // enfrentándose a los ganadores. SF1 = seed1 vs ganador(4v5), SF2 = seed2 vs ganador(3v6).
  const firstStageRound = regularRoundsCount + 1
  if (comp.rules.playoffTeams === 6 && maxStage === firstStageRound && currentStage.length === 2) {
    return advanceTop6BarragesToSF(world, comp, currentStage, regularRoundsCount)
  }

  // Ganadores ordenados por id para emparejamiento estable
  const sorted = [...currentStage].sort((a, b) => a.id.localeCompare(b.id))
  const winners: ID[] = sorted.map((m) => {
    if (!m.result) return m.homeClubId
    return m.result.homeScore >= m.result.awayScore ? m.homeClubId : m.awayClubId
  })

  const lastDate = sorted.slice(-1)[0].date
  const nextDate = addDays(lastDate, 7)
  const nextRound = maxStage + 1
  const newMatches: Match[] = []
  for (let i = 0; i < winners.length; i += 2) {
    if (i + 1 >= winners.length) break
    newMatches.push({
      id: newId('mch'),
      competitionId,
      seasonYear: world.seasonYear,
      date: weekendSlotForIndex(nextDate, i / 2),
      round: nextRound,
      homeClubId: winners[i],
      awayClubId: winners[i + 1],
      played: false
    })
  }
  return { ...world, matches: normalizeMatchDatesForRest([...world.matches, ...newMatches]) }
}

/** Genera las 2 SF de un playoff top-6 a partir de los barrages 3v6 / 4v5.
 *  Los seeds 1 y 2 se recomputan desde la tabla regular (que es inmutable a esta altura). */
function advanceTop6BarragesToSF(world: World, comp: Competition, barrages: Match[], regularRoundsCount: number): World {
  const standings = computeStandings(comp.id, world)
  const seed1 = standings[0]?.clubId
  const seed2 = standings[1]?.clubId
  if (!seed1 || !seed2) return world

  // El primer barrage creado fue 3v6 (id lexicográfico menor), el segundo 4v5.
  const sorted = [...barrages].sort((a, b) => a.id.localeCompare(b.id))
  const barrage36 = sorted[0]
  const barrage45 = sorted[1]
  const winnerOf = (m: Match): ID => {
    if (!m.result) return m.homeClubId
    return m.result.homeScore >= m.result.awayScore ? m.homeClubId : m.awayClubId
  }
  const winner36 = winnerOf(barrage36)
  const winner45 = winnerOf(barrage45)

  const lastDate = sorted.slice(-1)[0].date
  const sfDate = addDays(lastDate, 7)
  const sfRound = regularRoundsCount + 2
  const newMatches: Match[] = [
    {
      id: newId('mch'),
      competitionId: comp.id,
      seasonYear: world.seasonYear,
      date: weekendSlotForIndex(sfDate, 0),
      round: sfRound,
      homeClubId: seed1,
      awayClubId: winner45,
      played: false
    },
    {
      id: newId('mch'),
      competitionId: comp.id,
      seasonYear: world.seasonYear,
      date: weekendSlotForIndex(sfDate, 1),
      round: sfRound,
      homeClubId: seed2,
      awayClubId: winner36,
      played: false
    }
  ]
  return { ...world, matches: normalizeMatchDatesForRest([...world.matches, ...newMatches]) }
}

/** Devuelve el campeón del playoff (ganador de la final), o null si aún no se jugó. */
export function getPlayoffChampion(world: World, competitionId: ID): ID | null {
  const comp = world.competitions.find((c) => c.id === competitionId)
  if (!comp || comp.format !== 'league' || !comp.rules.hasPlayoff) return null
  const regularRoundsCount = regularRoundsCountFor(comp.clubIds.length)
  const playoffMatches = world.matches.filter((m) => m.competitionId === competitionId && m.round > regularRoundsCount)
  if (playoffMatches.length === 0) return null
  const maxStage = Math.max(...playoffMatches.map((m) => m.round))
  const finalStage = playoffMatches.filter((m) => m.round === maxStage)
  // La final es 1 partido
  if (finalStage.length !== 1 || !finalStage[0].played || !finalStage[0].result) return null
  const m = finalStage[0]
  return m.result!.homeScore >= m.result!.awayScore ? m.homeClubId : m.awayClubId
}

/** Nombre de cada fase de playoff según el formato y la posición relativa
 *  (stageOffset = 0 para la primera fase, 1 para la siguiente, etc.).
 *  - top 4: [Semifinales, Final]
 *  - top 6: [Barrages, Semifinales, Final]
 *  - top 8: [Cuartos, Semifinales, Final] */
export function getPlayoffStageName(playoffTeams: number, stageOffset: number): string {
  let names: string[]
  if (playoffTeams === 6) names = ['Barrages', 'Semifinales', 'Final']
  else if (playoffTeams === 8) names = ['Cuartos', 'Semifinales', 'Final']
  else names = ['Semifinales', 'Final']
  return names[stageOffset] ?? `Ronda ${stageOffset + 1}`
}

