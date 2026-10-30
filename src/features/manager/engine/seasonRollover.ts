import { random } from '../utils/entropy.ts'
// Transición de temporada: detecta fin, genera campeones, envejece plantilla,
// retira veteranos, mete cantera, regenera fixtures.

import type {
  ID, World, Player, Contract, Match, Attributes, RugbyPosition
} from '../types/index.ts'
import {
  defaultTactics, DEFAULT_TRAINING, generateExpectations,
  type Tactics, type TrainingSchedule, type BoardExpectations,
  fairSalaryForCA
} from '../types/index.ts'
import { newId } from '../utils/id.ts'
import { ageFromDOB, addDays } from '../utils/date.ts'
import { generateFixtures, normalizeMatchDatesForRest } from './fixtures.ts'
import { generateIntlSplitFixtures } from './intlSplitFixtures.ts'
import { generateSevensCircuitFixtures, defaultSVNSStages2026 } from './sevensCircuit.ts'
import { buildChampionsCup } from './tournament.ts'
import { computeStandings } from './standings.ts'
import { getPlayoffChampion } from './playoffs.ts'
import { ALL_LEAGUES } from '../data/leagues.ts'
import { buildSeasonCalendar, blockedRangesForLeague } from '../data/seasonCalendarBuilder.ts'
import {
  computeLeagueStartDate, competitionRunsIn,
  blockedRangesForEuropean, isInternationalFormat
} from './competitionSchedule.ts'
import {
  generateRegionalPool, generateKOBracket, generateSudamericanoBracket,
  generateTwoLegPlayoff
} from './regionalFixtures.ts'
import { ALL_REGIONAL_COMPETITIONS, resolveDateTemplate } from '../data/confederations/index.ts'

/** Pares declarativos de ligas conectadas para ascenso/descenso. Se referencian por
 *  `shortName` (estable) en lugar de IDs autogenerados que cambian entre temporadas. */
const PROMOTION_PAIRS: Array<{ topShortName: string; bottomShortName: string; slots: number }> = [
  { topShortName: 'GP',  bottomShortName: 'CHA', slots: 1 },
  { topShortName: 'T14', bottomShortName: 'PD2', slots: 1 }
]

export interface SeasonChampions {
  competitionId: ID
  competitionName: string
  championClubId: ID
  championClubName: string
}

/** True si todos los partidos league + cup + international están jugados.
 *  Las competiciones dormant (activeYears no incluye el seasonYear actual) se ignoran. */
export function isSeasonComplete(world: World): boolean {
  const unplayed = world.matches.filter((m) => !m.played)
  if (unplayed.length === 0) return true
  // Bloquean ligas + selecciones (incluidos los nuevos formatos regionales),
  // salvo dormancia.
  const blockingComps = world.competitions
    .filter((c) =>
      c.format === 'league'
      || c.format === 'international'
      || c.format === 'international_split'
      || c.format === 'regional_pool'
      || c.format === 'ko_bracket'
      || c.format === 'sudamericano_bracket'
      || c.format === 'two_leg_playoff')
    .filter((c) => competitionRunsIn(c, world.seasonYear))
  for (const comp of blockingComps) {
    const compUnplayed = world.matches.filter((m) => m.competitionId === comp.id && !m.played)
    if (compUnplayed.length > 0) return false
  }
  // CCup: si la final no está jugada y existe, bloquea
  const ccup = world.competitions.find((c) => c.format === 'european')
  if (ccup && competitionRunsIn(ccup, world.seasonYear)) {
    const finalMatches = world.matches.filter((m) => m.competitionId === ccup.id && m.round === 3)
    if (finalMatches.length === 0 || finalMatches.some((m) => !m.played)) return false
  }
  return true
}

/** Devuelve el campeón de cada liga + copa europea + six nations. */
export function getSeasonChampions(world: World): SeasonChampions[] {
  const champs: SeasonChampions[] = []
  for (const comp of world.competitions) {
    let championId: ID | null = null
    if (comp.format === 'league') {
      // Si hay playoff, el campeón es el ganador del playoff; si no, el primero de la tabla
      const playoffChamp = getPlayoffChampion(world, comp.id)
      const standings = computeStandings(comp.id, world)
      championId = playoffChamp ?? standings[0]?.clubId ?? null
    } else if (comp.format === 'international' || comp.format === 'international_split' || comp.format === 'sevens_circuit' || comp.format === 'regional_pool') {
      const standings = computeStandings(comp.id, world)
      championId = standings[0]?.clubId ?? null
    } else if (comp.format === 'european') {
      const final = world.matches.find((m) => m.competitionId === comp.id && m.round === 3 && m.played)
      if (final && final.result) {
        championId = final.result.homeScore >= final.result.awayScore ? final.homeClubId : final.awayClubId
      }
    }
    if (championId) {
      const club = world.clubs.find((c) => c.id === championId)
      const countryName = isInternationalFormat(comp.format)
        ? (world.countries.find((c) => c.id === championId)?.name ?? '?')
        : (club?.name ?? '?')
      champs.push({
        competitionId: comp.id,
        competitionName: comp.name,
        championClubId: championId,
        championClubName: countryName
      })
    }
  }
  return champs
}

// === Generación de cantera ===

function rgenAttrs(baseRange = 8): Attributes {
  const r = (lo = baseRange, hi = baseRange + 6) => lo + Math.floor(random() * (hi - lo + 1))
  return {
    technical: { tackle: r(), handling: r(), passShort: r(), passLong: r(), kickPosts: r(), kickTactical: r(), kickPunt: r(), ballCarry: r(), ruckSupport: r(), ruckClean: r(), jackal: r(), scrum: r(), lineoutJump: r(), lineoutThrow: r(), maul: r(), aerial: r() },
    mental: { decisions: r(), vision: r(), anticipation: r(), leadership: r(), discipline: r(), teamwork: r(), concentration: r(), determination: r(), composure: r(), workrate: r(), positioning: r(), initiative: r() },
    physical: { pace: r(), acceleration: r(), agility: r(), strength: r(), power: r(), stamina: r(), jumping: r(), balance: r(), recovery: r(), injuryProneness: 5 + Math.floor(random() * 7) },
    hidden: { ambition: r(), professionalism: r(), loyalty: r(), adaptability: r(), greed: r(), controversy: 5 + Math.floor(random() * 6) }
  }
}

function generateYouthIntake(clubId: ID, countryId: ID, season: number, repBoost: number): Player[] {
  const firstNames = ['Mateo', 'Diego', 'Hugo', 'Iker', 'Pau', 'Leo', 'Bruno', 'Adrián', 'Pol', 'Alex', 'Marc', 'Eric']
  const lastNames = ['García', 'López', 'Sánchez', 'Pérez', 'Romero', 'Ruiz', 'Torres', 'Martín', 'Vidal', 'Castro']
  const count = 3 + Math.floor(random() * 4) // 3-6 jóvenes
  const players: Player[] = []
  for (let i = 0; i < count; i++) {
    const pos = (1 + Math.floor(random() * 15)) as RugbyPosition
    const age = 17 + Math.floor(random() * 3) // 17-19
    const caBase = 60 + Math.round(repBoost * 0.3) // Más bajo que los profesionales
    const yr = season - age
    players.push({
      id: newId('plr'),
      firstName: firstNames[Math.floor(random() * firstNames.length)],
      lastName: lastNames[Math.floor(random() * lastNames.length)],
      dateOfBirth: `${yr}-06-15`,
      nationalityIds: [countryId],
      primaryPosition: pos, secondaryPositions: [],
      heightCm: 175 + Math.floor(random() * 25),
      weightKg: 85 + Math.floor(random() * 35),
      clubId, contractId: null,
      attributes: rgenAttrs(7 + Math.floor(repBoost / 15)),
      currentAbility: caBase + Math.floor(random() * 20),
      potentialAbility: caBase + 30 + Math.floor(random() * 80), // potencial alto
      morale: 75, condition: 95,
      reputation: 25 + Math.floor(random() * 20),
      injury: null
    })
  }
  return players
}

// === Función principal ===

export interface RolloverReport {
  newSeasonYear: number
  champions: SeasonChampions[]
  retiredCount: number
  youthIntakeCount: number
  contractsExpiredCount: number
}

export function advanceToNextSeason(world: World): { world: World; report: RolloverReport } {
  const champions = getSeasonChampions(world)
  const newYear = world.seasonYear + 1
  const newCalendar = buildSeasonCalendar(newYear)
  const newSeasonStart = newCalendar.seasonStart
  const europeanBlocked = blockedRangesForEuropean(newCalendar)

  // 1. Envejecer y retirar
  let retiredCount = 0
  const retainedPlayers: Player[] = []
  for (const p of world.players) {
    const age = ageFromDOB(p.dateOfBirth, newSeasonStart)
    // Probabilidad de retiro escala con la edad: 33+ = riesgo creciente
    const retireProb = age < 33 ? 0
      : age < 35 ? 0.10
      : age < 37 ? 0.35
      : age < 39 ? 0.70
      : 0.95
    if (random() < retireProb) {
      retiredCount++
      continue
    }
    // Actualizar atributos por edad: jóvenes ganan un poco extra, veteranos pierden velocidad
    let newCA = p.currentAbility
    const newAttrs: Attributes = JSON.parse(JSON.stringify(p.attributes))
    if (age < 25) {
      const boost = Math.floor(random() * 4) + 1
      newCA = Math.min(p.potentialAbility, p.currentAbility + boost)
    } else if (age >= 32) {
      // Veteranos pierden algo de velocidad/aceleración cada año
      newAttrs.physical.pace = Math.max(1, newAttrs.physical.pace - (random() < 0.5 ? 1 : 0))
      newAttrs.physical.acceleration = Math.max(1, newAttrs.physical.acceleration - (random() < 0.5 ? 1 : 0))
      newAttrs.physical.stamina = Math.max(1, newAttrs.physical.stamina - (random() < 0.3 ? 1 : 0))
      newCA = Math.max(50, p.currentAbility - 2)
    }
    retainedPlayers.push({
      ...p,
      attributes: newAttrs,
      currentAbility: newCA,
      morale: 70, condition: 100, injury: null
    })
  }

  // 2. Contratos expirados → jugador libre
  let contractsExpiredCount = 0
  const validContracts: Contract[] = []
  const playersAfterContracts = retainedPlayers.map((p) => {
    const c = world.contracts.find((ct) => ct.id === p.contractId)
    if (!c) return p
    const expired = c.endDate < newSeasonStart
    if (expired) {
      contractsExpiredCount++
      return { ...p, clubId: null, contractId: null }
    }
    validContracts.push(c)
    return p
  })

  // 3. Cantera: 3-6 jóvenes nuevos por club
  let youthIntakeCount = 0
  const youthPlayers: Player[] = []
  for (const club of world.clubs) {
    const youth = generateYouthIntake(club.id, club.countryId, newYear, club.reputation)
    youthPlayers.push(...youth)
    youthIntakeCount += youth.length
  }

  // Combinar todos los jugadores
  const allPlayers = [...playersAfterContracts, ...youthPlayers]

  // 3.5. Ascenso/descenso entre tiers conectados.
  // Aplicar ANTES de regenerar fixtures para que comp.clubIds esté actualizado.
  // El swap muta in-place las competiciones y los clubs.competitionIds.
  const updatedClubs = world.clubs.map((c) => ({ ...c, finances: { ...c.finances }, competitionIds: [...c.competitionIds] }))
  const updatedCompetitions = world.competitions.map((c) => ({ ...c, clubIds: [...c.clubIds] }))
  for (const pair of PROMOTION_PAIRS) {
    const topComp = updatedCompetitions.find((c) => c.shortName === pair.topShortName)
    const bottomComp = updatedCompetitions.find((c) => c.shortName === pair.bottomShortName)
    if (!topComp || !bottomComp) continue

    const topStandings = computeStandings(topComp.id, { ...world, competitions: updatedCompetitions })
    if (topStandings.length < pair.slots) continue
    const relegated = topStandings.slice(-pair.slots).map((s) => s.clubId)

    // Promovidos del bottom: si hay playoff, slot 1 = campeón; resto del top de tabla.
    const promoted: ID[] = []
    if (bottomComp.rules.hasPlayoff) {
      const playoffChamp = getPlayoffChampion({ ...world, competitions: updatedCompetitions }, bottomComp.id)
      if (playoffChamp) promoted.push(playoffChamp)
    }
    if (promoted.length < pair.slots) {
      const bottomStandings = computeStandings(bottomComp.id, { ...world, competitions: updatedCompetitions })
      for (const s of bottomStandings) {
        if (promoted.length >= pair.slots) break
        if (!promoted.includes(s.clubId)) promoted.push(s.clubId)
      }
    }
    if (promoted.length < pair.slots) continue

    const relegatedSet = new Set(relegated)
    const promotedSet = new Set(promoted)

    // Swap en clubIds de cada competición.
    topComp.clubIds = topComp.clubIds.filter((id) => !relegatedSet.has(id)).concat(promoted)
    bottomComp.clubIds = bottomComp.clubIds.filter((id) => !promotedSet.has(id)).concat(relegated)

    // Re-aplicar salary cap y mover competitionIds de cada club.
    const topLeague = ALL_LEAGUES.find((l) => l.shortName === pair.topShortName)
    const bottomLeague = ALL_LEAGUES.find((l) => l.shortName === pair.bottomShortName)
    for (const club of updatedClubs) {
      if (promotedSet.has(club.id)) {
        club.competitionIds = club.competitionIds.filter((id) => id !== bottomComp.id).concat(topComp.id)
        if (topLeague) club.finances.salaryCap = topLeague.salaryCap
      } else if (relegatedSet.has(club.id)) {
        club.competitionIds = club.competitionIds.filter((id) => id !== topComp.id).concat(bottomComp.id)
        if (bottomLeague) club.finances.salaryCap = bottomLeague.salaryCap
      }
    }
  }
  world = { ...world, clubs: updatedClubs, competitions: updatedCompetitions }

  // 3.6. Ascenso/descenso entre selecciones en pirámides regionales.
  //      A diferencia de las ligas, no hay club.competitionIds que actualizar:
  //      simplemente se swappean los Country.id entre comp.clubIds adyacentes.
  if (world.pyramids && world.pyramids.length > 0) {
    const pyramidsCompetitions = world.competitions.map((c) => ({ ...c, clubIds: [...c.clubIds] }))
    const moves = new Map<ID, { from: ID; to: ID }>()
    for (const pyramid of world.pyramids) {
      for (let i = 0; i < pyramid.levels.length - 1; i++) {
        const top = pyramid.levels[i]
        const bottom = pyramid.levels[i + 1]
        const topComp = pyramidsCompetitions.find((c) => c.shortName === top.competitionShortName)
        const bottomComp = pyramidsCompetitions.find((c) => c.shortName === bottom.competitionShortName)
        if (!topComp || !bottomComp) continue
        const slots = Math.min(top.relegationSlots, bottom.promotionSlots)
        if (slots <= 0) continue

        // Las tablas salen de la temporada que TERMINÓ (`world`), no de las listas ya movidas:
        // si no, el club que acaba de bajar de la división de arriba figura sin partidos,
        // último, y el par siguiente lo vuelve a descender.
        const topStandings = computeStandings(topComp.id, world)
        const bottomStandings = computeStandings(bottomComp.id, world)
        if (topStandings.length < slots || bottomStandings.length < slots) continue

        const relegated = topStandings.slice(-slots).map((s) => s.clubId)
        const promoted = bottomStandings.slice(0, slots).map((s) => s.clubId)
        const relegatedSet = new Set(relegated)
        const promotedSet = new Set(promoted)

        topComp.clubIds = topComp.clubIds.filter((id) => !relegatedSet.has(id)).concat(promoted)
        bottomComp.clubIds = bottomComp.clubIds.filter((id) => !promotedSet.has(id)).concat(relegated)
        for (const id of promoted) moves.set(id, { from: bottomComp.id, to: topComp.id })
        for (const id of relegated) moves.set(id, { from: topComp.id, to: bottomComp.id })
      }
    }
    // Las selecciones no tienen `competitionIds` que actualizar; los clubes sí.
    world = {
      ...world,
      competitions: pyramidsCompetitions,
      clubs: moves.size === 0 ? world.clubs : world.clubs.map((c) => {
        const m = moves.get(c.id)
        return m ? { ...c, competitionIds: [...c.competitionIds.filter((id) => id !== m.from), m.to] } : c
      })
    }
  }

  // 4. Regenerar fixtures para cada liga, usando el SeasonCalendar:
  //    norteñas empiezan en Sep del newYear, sureñas en Feb del newYear+1.
  //    Cada liga recibe los blockedRanges de release_window aplicables a su lado.
  const newMatches: Match[] = []
  for (const comp of world.competitions) {
    if (comp.format !== 'league') continue
    if (!competitionRunsIn(comp, newYear)) continue
    const leagueData = ALL_LEAGUES.find((l) => l.shortName === comp.shortName)
    if (!leagueData) continue
    const validClubIds = comp.clubIds.filter((id) => world.clubs.some((c) => c.id === id))
    const startDate = computeLeagueStartDate(leagueData, newYear, newCalendar)
    const blockedRanges = blockedRangesForLeague(newCalendar, leagueData.northOrSouth)
    const fixtures = generateFixtures(comp.id, validClubIds, newYear, {
      firstMatchDate: startDate,
      daysBetweenRounds: 7,
      blockedRanges
    })
    newMatches.push(...fixtures)
  }

  // 5. Regenerar Champions Cup con top 4 de cada Tier 1, respetando ventanas
  //    europeas (release windows del norte y Six Nations).
  const ccup = world.competitions.find((c) => c.format === 'european')
  let newCompetitions = world.competitions
  if (ccup && competitionRunsIn(ccup, newYear)) {
    const baseWorld = { ...world, matches: newMatches, players: allPlayers, seasonYear: newYear } as World
    const newCCup = buildChampionsCup(baseWorld, newYear, europeanBlocked)
    const newCcupId = newCCup.competition.id
    const updatedClubs = world.clubs.map((c) => ({
      ...c,
      competitionIds: c.competitionIds.filter((cid) => cid !== ccup.id)
    }))
    newCCup.competition.clubIds.forEach((cid) => {
      const club = updatedClubs.find((c) => c.id === cid)
      if (club) club.competitionIds.push(newCcupId)
    })
    newCompetitions = world.competitions.map((c) => c.id === ccup.id ? newCCup.competition : c)
    newMatches.push(...newCCup.matches)
    world = { ...world, clubs: updatedClubs }
  }

  // 6. Regenerar competiciones internacionales según su formato y activeYears.
  for (const comp of newCompetitions) {
    if (!competitionRunsIn(comp, newYear)) continue

    if (comp.format === 'international') {
      // Six Nations / Women's Six Nations / Rugby Championship (cuando toca).
      let firstDate: string
      if (comp.shortName === '6N') firstDate = `${newYear + 1}-02-06`
      else if (comp.shortName === 'W6N') firstDate = `${newYear + 1}-04-11`
      else if (comp.shortName === 'RC') firstDate = `${newYear}-08-15`
      else continue
      const allFix = generateFixtures(comp.id, comp.clubIds, newYear, {
        firstMatchDate: firstDate, daysBetweenRounds: 7
      })
      // 6N y W6N son round-robin simple (mitad de las jornadas dobles).
      if (comp.shortName === '6N' || comp.shortName === 'W6N') {
        const maxR = Math.max(...allFix.map((f) => f.round))
        const half = Math.floor(maxR / 2)
        newMatches.push(...allFix.filter((m) => m.round <= half))
      } else {
        newMatches.push(...allFix)
      }
    } else if (comp.format === 'international_split') {
      // NC, NCup, WXV. Detectamos pools por orden de clubIds (primeros 6 = A, últimos 6 = B).
      if (comp.clubIds.length !== 12) continue
      const poolA = comp.clubIds.slice(0, 6)
      const poolB = comp.clubIds.slice(6, 12)
      const isWXV = comp.shortName === 'WXV'
      const jul = isWXV ? `${newYear}-09-13` : `${newYear}-07-04`
      const nov = isWXV ? `${newYear}-10-04` : `${newYear}-11-07`
      newMatches.push(...generateIntlSplitFixtures(comp.id, newYear, {
        julyAnchor: jul, novemberAnchor: nov, poolA, poolB
      }))
    } else if (comp.format === 'sevens_circuit') {
      if (comp.clubIds.length !== 12) continue
      newMatches.push(...generateSevensCircuitFixtures(comp.id, newYear, {
        nationIds: comp.clubIds,
        stages: defaultSVNSStages2026()
      }))
    } else if (
      comp.format === 'regional_pool'
      || comp.format === 'ko_bracket'
      || comp.format === 'sudamericano_bracket'
      || comp.format === 'two_leg_playoff'
    ) {
      // Regional comps (Fase B): regenerar fixtures usando el catálogo por shortName.
      const def = ALL_REGIONAL_COMPETITIONS.find((c) => c.shortName === comp.shortName)
      if (!def) continue
      const firstMatchDate = resolveDateTemplate(def.firstMatchDateTemplate, newYear)
      if (comp.format === 'regional_pool') {
        newMatches.push(...generateRegionalPool(comp.id, newYear, comp.clubIds, {
          firstMatchDate, daysBetweenRounds: def.daysBetweenRounds ?? 7
        }))
      } else if (comp.format === 'ko_bracket') {
        const [s1, s2, s3, s4] = comp.clubIds
        if (s1 && s2 && s3 && s4) {
          newMatches.push(...generateKOBracket(comp.id, newYear, [s1, s2, s3, s4], {
            semisDate: firstMatchDate
          }))
        }
      } else if (comp.format === 'sudamericano_bracket') {
        const [s1, s2, s3, s4] = comp.clubIds
        if (s1 && s2 && s3 && s4) {
          newMatches.push(...generateSudamericanoBracket(comp.id, newYear, [s1, s2, s3, s4], {
            semisLeg1Date: firstMatchDate
          }))
        }
      } else if (comp.format === 'two_leg_playoff') {
        const [a, b] = comp.clubIds
        if (a && b) {
          newMatches.push(...generateTwoLegPlayoff(comp.id, newYear, [a, b], {
            leg1Date: firstMatchDate
          }))
        }
      }
    }
  }

  // 7. Resetear expectativas de directiva basadas en performance previa
  const newBoardExpectations: Record<ID, BoardExpectations> = {}
  for (const c of world.clubs) {
    const previous = world.boardExpectations[c.id]
    // Si la temporada anterior fue bien (confianza > 60), suben expectativas
    let bumpReputation = 0
    if (previous && previous.boardConfidence > 70) bumpReputation = 3
    else if (previous && previous.boardConfidence < 30) bumpReputation = -3
    newBoardExpectations[c.id] = generateExpectations(c.id, newYear, Math.max(0, Math.min(100, c.reputation + bumpReputation)))
  }

  // 8. Tactics y training se preservan (el usuario ya las tenía configuradas)
  // Solo regeneramos para clubes que no las tengan (si no — improbable)
  const newTactics: Record<ID, Tactics> = { ...world.tactics }
  const newTraining: Record<ID, TrainingSchedule> = { ...world.training }
  for (const c of world.clubs) {
    if (!newTactics[c.id]) newTactics[c.id] = defaultTactics()
    if (!newTraining[c.id]) newTraining[c.id] = { ...DEFAULT_TRAINING }
  }

  // 9. Contratos: para jóvenes nuevos generar contrato barato (3 años)
  const youthContracts: Contract[] = youthPlayers.map((p) => {
    const salary = fairSalaryForCA(p.currentAbility, ageFromDOB(p.dateOfBirth, newSeasonStart))
    return {
      id: newId('ctr'), personId: p.id, clubId: p.clubId!,
      salaryPerYear: salary,
      signingBonus: Math.round(salary * 0.05),
      appearanceFee: Math.round(salary / 250),
      tryBonus: Math.round(salary / 600),
      titleBonus: Math.round(salary * 0.15),
      startDate: newSeasonStart,
      endDate: addDays(newSeasonStart, 3 * 365),
      releaseClause: null, isCaptain: false,
      squadRole: 'academy'
    }
  })
  // Asignar el contractId a los jóvenes
  for (const c of youthContracts) {
    const p = allPlayers.find((pp) => pp.id === c.personId)
    if (p) p.contractId = c.id
  }

  const newWorld: World = {
    ...world,
    seasonYear: newYear,
    currentDate: newSeasonStart,
    competitions: newCompetitions,
    players: allPlayers,
    contracts: [...validContracts, ...youthContracts],
    matches: normalizeMatchDatesForRest(newMatches),
    calendar: newCalendar,
    tactics: newTactics,
    training: newTraining,
    boardExpectations: newBoardExpectations
  }

  return {
    world: newWorld,
    report: { newSeasonYear: newYear, champions, retiredCount, youthIntakeCount, contractsExpiredCount }
  }
}
