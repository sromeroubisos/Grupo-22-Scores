import { random } from '../utils/entropy.ts'
// Operaciones a nivel de temporada.

import type { ID, ISODate, Match, World, RankingChange, WorldRankingState, Gender, CompetitionRules } from '../types/index.ts'
import { buildMatchTeam } from './teamRating.ts'
import { simulateMatch } from './matchEngine.ts'
import { applyWeeklyEffects, type WeeklyReport } from './weekly.ts'
import { applyMonthlyFinances } from './finances.ts'
import { maybeAdvanceTournament } from './tournament.ts'
import { buildNationalMatchTeam } from './national.ts'
import { distributeTries } from './playerStats.ts'
import { maybeGenerateLeaguePlayoffs, maybeAdvanceLeaguePlayoffs, isKnockoutMatch } from './playoffs.ts'
import { eloDelta, applyEloDelta } from './elo.ts'
import { blockedRangesForEuropean, isInternationalFormat } from './competitionSchedule.ts'
import { competitionLevel, DEFAULT_LEVEL, paramsForLevel } from './levels.ts'
import { applyToState } from './worldRugbyRanking.ts'
import { resolveAllCycles } from './qualificationPathfinder.ts'
import { orchestrateQualifications } from './qualificationOrchestrator.ts'
import type { MatchResult, MatchTeam } from './types.ts'
import type { MatchSub, PlayerMatchStats } from '../types/index.ts'
import { attributePlayerStats, autoSubsFor, type SubLog } from './playerMatchStats.ts'
import { addDays } from '../utils/date.ts'

/** Cap del historial de cambios de ranking que se mantiene en el world.
 *  Append-only, se trunca a las últimas N entradas para limitar el tamaño
 *  del save. */
const RANKING_HISTORY_CAP = 500

/** Formatos cuyos resultados alimentan el World Rugby Ranking oficial.
 *  Cubre tests de XV (international, international_split, regionales) y el
 *  mundial (world_cup, con coef doble). Sevens tiene ranking propio y NO
 *  entra aquí. */
function affectsWorldRugbyRanking(format: string): boolean {
  return format === 'international'
    || format === 'international_split'
    || format === 'world_cup'
    || format === 'regional_pool'
    || format === 'ko_bracket'
    || format === 'two_leg_playoff'
    || format === 'sudamericano_bracket'
}

let lastReport: WeeklyReport | null = null
export function getLastWeeklyReport(): WeeklyReport | null { return lastReport }

export function getCurrentRound(world: World, competitionId: ID): number {
  const matches = world.matches.filter((m) => m.competitionId === competitionId)
  if (matches.length === 0) return 0
  const unplayed = matches.filter((m) => !m.played)
  if (unplayed.length === 0) return Math.max(...matches.map((m) => m.round))
  return Math.min(...unplayed.map((m) => m.round))
}

export function totalRounds(world: World, competitionId: ID): number {
  const matches = world.matches.filter((m) => m.competitionId === competitionId)
  if (matches.length === 0) return 0
  return Math.max(...matches.map((m) => m.round))
}

/** Opciones deterministas (clima, importancia, nivel) derivadas de un fixture.
 *  Permite que la UI en vivo use exactamente los mismos parámetros que el
 *  auto-simulador, de forma que el marcador vivido coincida con el que se
 *  habría computado automáticamente. */
export interface FixtureSimOptions {
  seed: number
  weather: 'clear' | 'rain' | 'wind'
  referee: 'permissive' | 'balanced' | 'strict'
  importance: number
  level: ReturnType<typeof competitionLevel>
  competitionRules: CompetitionRules | undefined
}

export function fixtureSimOptions(world: World, m: Match): FixtureSimOptions {
  const competition = world.competitions.find((c) => c.id === m.competitionId)
  const dateHash = m.date.split('-').reduce((h, p) => h * 31 + Number(p || 0), 0)
  const weatherRoll = dateHash % 100
  const weather: 'clear' | 'rain' | 'wind' =
    weatherRoll < 70 ? 'clear' : weatherRoll < 88 ? 'rain' : 'wind'
  const importance =
    competition?.format === 'european' ? 1.4 :
    isKnockoutMatch(world, m) ? 1.6 :
    1.0
  const level = competition ? competitionLevel(competition.format, competition.tier) : DEFAULT_LEVEL
  return {
    seed: dateHash,
    weather,
    referee: 'balanced',
    importance,
    level,
    competitionRules: competition?.rules
  }
}

/** Construye los MatchTeam (home/away) para un fixture, ya sea de clubes o
 *  internacional. Devuelve null si faltan datos (saves corruptos). */
export function buildTeamsForMatch(world: World, m: Match): { home: MatchTeam; away: MatchTeam } | null {
  const competition = world.competitions.find((c) => c.id === m.competitionId)
  const isInternational = competition ? isInternationalFormat(competition.format) : false
  if (isInternational) {
    const homeCountry = world.countries.find((c) => c.id === m.homeClubId)
    const awayCountry = world.countries.find((c) => c.id === m.awayClubId)
    if (!homeCountry || !awayCountry) return null
    const compGender = competition?.gender ?? 'men'
    const compAge = competition?.ageCategory ?? 'senior'
    return {
      home: buildNationalMatchTeam(homeCountry, world, compGender, compAge),
      away: buildNationalMatchTeam(awayCountry, world, compGender, compAge)
    }
  }
  const homeClub = world.clubs.find((c) => c.id === m.homeClubId)
  const awayClub = world.clubs.find((c) => c.id === m.awayClubId)
  if (!homeClub || !awayClub) return null
  return {
    home: buildMatchTeam(homeClub, world.players),
    away: buildMatchTeam(awayClub, world.players)
  }
}

/** Construye el Match jugado a partir de un MatchResult precomputado (vivido o batch):
 *  - distribuye los ensayos entre el XV titular
 *  - resuelve desempate KO si terminó empatado (suma 3 + marca decidedBy)
 *  - atribuye stats por jugador y calcula ratings 0,0–9,9 respetando subs (si las hay)
 *  Es determinista en marcador/eventos respecto a la seed del MatchResult; la
 *  distribución de tryScorers y el resultado del shootout salen del flujo con semilla (utils/entropy.ts).
 *
 *  Si `subs` no se pasa, se generan subs automáticas para ambos lados (3–5 por
 *  equipo, min 50-75) para que los partidos auto-simulados también muestren
 *  rotación. En partidos vividos, se pasan las subs reales del usuario + auto
 *  para el rival. */
export function buildPlayedMatch(
  world: World,
  m: Match,
  r: MatchResult,
  homeTeam: MatchTeam,
  awayTeam: MatchTeam,
  livedSubs?: MatchSub[]
): Match {
  const rand = () => random()
  const homeTryScorers = distributeTries(homeTeam.starters, r.tries.home, rand)
  const awayTryScorers = distributeTries(awayTeam.starters, r.tries.away, rand)

  let decidedBy: 'normal' | 'extra_time' | 'shootout' = 'normal'
  let homeScore = r.finalScore.home
  let awayScore = r.finalScore.away
  if (homeScore === awayScore && isKnockoutMatch(world, m)) {
    const kickHome = homeTeam.rating.kicking + (homeTeam.rating.discipline * 0.3)
    const kickAway = awayTeam.rating.kicking + (awayTeam.rating.discipline * 0.3)
    const homeWins = random() * (kickHome + kickAway) < kickHome
    if (homeWins) homeScore += 3
    else awayScore += 3
    decidedBy = random() < 0.5 ? 'extra_time' : 'shootout'
  }

  // Subs: para los lados sin subs vividas se generan automáticas.
  const seedBase = m.date.split('-').reduce((h, p) => h * 31 + Number(p || 0), 0)
  const homeLived = livedSubs?.filter((s) => s.side === 'home') ?? null
  const awayLived = livedSubs?.filter((s) => s.side === 'away') ?? null
  const homeSubs: SubLog = homeLived ?? autoSubsFor('home', homeTeam, seedBase ^ 0x4f4d4548)
  const awaySubs: SubLog = awayLived ?? autoSubsFor('away', awayTeam, seedBase ^ 0x59415741)
  const allSubs = [...homeSubs, ...awaySubs]

  let playerStats: PlayerMatchStats[] = []
  try {
    playerStats = attributePlayerStats({
      matchId: m.id,
      homeStarters: homeTeam.starters,
      homeBench: homeTeam.bench,
      awayStarters: awayTeam.starters,
      awayBench: awayTeam.bench,
      subs: allSubs,
      homeTryScorers,
      awayTryScorers,
      result: { ...r, finalScore: { home: homeScore, away: awayScore } }
    })
  } catch {
    playerStats = []
  }

  return {
    ...m, played: true,
    result: {
      homeScore, awayScore,
      homeTries: r.tries.home, awayTries: r.tries.away,
      homeConversions: r.conversions.home, awayConversions: r.conversions.away,
      homePenalties: r.penalties.home, awayPenalties: r.penalties.away,
      homeDrops: r.drops.home, awayDrops: r.drops.away,
      homeStarterIds: homeTeam.starters.map((p) => p.id),
      awayStarterIds: awayTeam.starters.map((p) => p.id),
      homeTryScorers, awayTryScorers,
      decidedBy,
      subs: allSubs,
      playerStats
    }
  }
}

/** Aplica el pipeline post-resultado (Elo, World Rugby Ranking, weekly, finanzas,
 *  avance de torneos/playoffs) sobre uno o varios partidos ya jugados.
 *  Es la única ruta a través de la cual el estado del mundo evoluciona tras un
 *  partido — tanto el auto-simulador como la simulación en vivo la usan. */
function applyPlayedPipeline(world: World, updated: Map<ID, Match>, playedMatches: Match[], lastDate: ISODate): World {
  const newDate = lastDate > world.currentDate ? lastDate : world.currentDate

  // Calcular updates de Elo SOLO para partidos entre clubes (no internacionales).
  const eloUpdates = new Map<ID, number>()
  for (const m of playedMatches) {
    const competition = world.competitions.find((c) => c.id === m.competitionId)
    if (!competition || isInternationalFormat(competition.format)) continue
    const homeClub = world.clubs.find((c) => c.id === m.homeClubId)
    const awayClub = world.clubs.find((c) => c.id === m.awayClubId)
    if (!homeClub || !awayClub || !m.result) continue
    const homeElo = homeClub.eloRating ?? 1500
    const awayElo = awayClub.eloRating ?? 1500
    const knockout = isKnockoutMatch(world, m)
    const eloLevel = competitionLevel(competition.format, competition.tier)
    const delta = eloDelta({
      homeElo, awayElo,
      homeScore: m.result.homeScore,
      awayScore: m.result.awayScore,
      importance: competition.format === 'european' ? 1.4 : knockout ? 1.6 : 1.0,
      knockout,
      homeAdvantage: paramsForLevel(eloLevel).homeAdvantageElo
    })
    const newElos = applyEloDelta(homeElo, awayElo, delta)
    eloUpdates.set(homeClub.id, newElos.homeElo)
    eloUpdates.set(awayClub.id, newElos.awayElo)
  }

  // Aplicar el intercambio oficial de World Rugby Ranking para tests de XV.
  // Se ejecuta SOLO en partidos que cuentan como "full international" XV:
  //   - format ∈ {international, international_split, world_cup, regional_pool,
  //               ko_bracket, two_leg_playoff, sudamericano_bracket}
  //   - ageCategory === 'senior' (juveniles tienen ranking propio, no entran)
  //   - format !== 'sevens_circuit' (sevens también tiene ranking aparte)
  // El ranking se actualiza por género (men/women) según competition.gender.
  let menRanking: WorldRankingState | undefined = world.rankings?.men
  let womenRanking: WorldRankingState | undefined = world.rankings?.women
  const newRankingChanges: RankingChange[] = []
  for (const m of playedMatches) {
    const competition = world.competitions.find((c) => c.id === m.competitionId)
    if (!competition || !affectsWorldRugbyRanking(competition.format)) continue
    const ageCat = competition.ageCategory ?? 'senior'
    if (ageCat !== 'senior') continue       // U20/U19/U18 no alimentan el ranking senior
    const discipline = competition.discipline ?? 'xv'
    if (discipline !== 'xv') continue        // sevens tiene ranking propio
    const gender: Gender = competition.gender ?? 'men'
    const currentState = gender === 'men' ? menRanking : womenRanking
    if (!currentState) continue   // saves muy antiguos sin rankings: saltamos hasta migrar
    const isRWC = competition.format === 'world_cup'
    const applied = applyToState(currentState, m, { isRWC })
    if (!applied) continue
    if (gender === 'men') menRanking = applied.state
    else womenRanking = applied.state
    newRankingChanges.push(applied.change)
  }

  const rankingsChanged = newRankingChanges.length > 0
  const newRankings = rankingsChanged && menRanking && womenRanking
    ? { men: menRanking, women: womenRanking }
    : world.rankings
  const newHistory = rankingsChanged
    ? [...(world.rankingHistory ?? []), ...newRankingChanges].slice(-RANKING_HISTORY_CAP)
    : world.rankingHistory

  let nextWorld: World = {
    ...world, currentDate: newDate,
    matches: world.matches.map((m) => updated.get(m.id) ?? m),
    clubs: eloUpdates.size === 0
      ? world.clubs
      : world.clubs.map((c) => eloUpdates.has(c.id) ? { ...c, eloRating: eloUpdates.get(c.id)! } : c),
    rankings: newRankings,
    rankingHistory: newHistory
  }

  // Resolver ciclos mundialistas: cuando una competencia clasificatoria
  // (REC, Africa Cup, Sudamericano, PNC, WXV, etc.) termina, las plazas
  // correspondientes en los QualificationCycle se asignan automáticamente.
  // Las ligas de club y la Champions Cup no clasifican a nadie al Mundial: si solo se
  // jugaron de esas, recorrer todos los ciclos es trabajo perdido.
  const touchesQualification = playedMatches.some((m) => {
    const format = world.competitions.find((c) => c.id === m.competitionId)?.format
    return !format || (format !== 'league' && format !== 'cup' && format !== 'european')
  })
  if (touchesQualification) {
    const resolvedCycles = resolveAllCycles(nextWorld)
    if (resolvedCycles !== nextWorld.qualificationCycles) {
      nextWorld = { ...nextWorld, qualificationCycles: resolvedCycles }
    }
  }

  // Orquestar play-offs cruzados y FQT cuando los inputs estén listos.
  // Genera nuevas Competition y Match en el world; resuelve outcomes de
  // play-offs ya jugados. Pasamos resolveAllCycles otra vez para resolver
  // slots que dependían de playoff.winnerCountryId o de FQT recién creado.
  const afterOrchestration = touchesQualification ? orchestrateQualifications(nextWorld) : nextWorld
  if (afterOrchestration !== nextWorld) {
    nextWorld = afterOrchestration
    const reResolved = resolveAllCycles(nextWorld)
    if (reResolved !== nextWorld.qualificationCycles) {
      nextWorld = { ...nextWorld, qualificationCycles: reResolved }
    }
  }

  const clubPlayedMatches = playedMatches.filter((m) => {
    const competition = world.competitions.find((c) => c.id === m.competitionId)
    return competition ? !isInternationalFormat(competition.format) : true
  })
  const { world: weeklyWorld, report } = applyWeeklyEffects(nextWorld, clubPlayedMatches, newDate)
  lastReport = report
  let finalWorld = applyMonthlyFinances(weeklyWorld, world.currentDate, newDate)

  const europeanBlocked = finalWorld.calendar ? blockedRangesForEuropean(finalWorld.calendar) : []
  for (const c of finalWorld.competitions) {
    if (c.format === 'european') {
      finalWorld = maybeAdvanceTournament(finalWorld, c.id, europeanBlocked)
    } else if (c.format === 'league' && c.rules.hasPlayoff) {
      finalWorld = maybeGenerateLeaguePlayoffs(finalWorld, c.id)
      finalWorld = maybeAdvanceLeaguePlayoffs(finalWorld, c.id)
    }
  }
  return finalWorld
}

function simulateMatches(world: World, targets: Match[]): World {
  if (targets.length === 0) return world

  const updated = new Map<ID, Match>()
  const playedMatches: Match[] = []
  for (const m of targets) {
    const teams = buildTeamsForMatch(world, m)
    if (!teams) continue
    const opts = fixtureSimOptions(world, m)
    const r = simulateMatch(teams.home, teams.away, opts)
    const matchUpdated = buildPlayedMatch(world, m, r, teams.home, teams.away)
    updated.set(m.id, matchUpdated)
    playedMatches.push(matchUpdated)
  }

  const lastDate = [...targets].sort((a, b) => a.date.localeCompare(b.date)).slice(-1)[0]?.date ?? world.currentDate
  return applyPlayedPipeline(world, updated, playedMatches, lastDate)
}

/** Aplica el resultado de un partido simulado en vivo por el usuario.
 *  El llamador (UI) ya tiene un MatchResult precomputado por el streaming runner;
 *  esta función lo "oficializa": lo escribe en world.matches y corre el pipeline
 *  completo (Elo, ranking, weekly, finanzas, avance de torneos/playoffs).
 *  Si el match no existe o ya está jugado, devuelve el world sin cambios.
 *
 *  `livedSubs` permite pasar el log de sustituciones del usuario (lado propio);
 *  los demás lados (rival) reciben subs automáticas. Si se pasan playerStats
 *  precomputadas (raras veces necesario), se usan en vez de recalcular. */
export function commitLivedMatch(
  world: World,
  matchId: ID,
  result: MatchResult,
  livedSubs?: MatchSub[],
  livedPlayerStats?: PlayerMatchStats[]
): World {
  const m = world.matches.find((mm) => mm.id === matchId)
  if (!m || m.played) return world
  const teams = buildTeamsForMatch(world, m)
  if (!teams) return world
  // Reutiliza los MatchTeam del result para preservar los starters efectivos
  // que vivió el usuario (mismos jugadores que en la cancha).
  let matchUpdated = buildPlayedMatch(world, m, result, result.homeTeam, result.awayTeam, livedSubs)
  if (livedPlayerStats && matchUpdated.result) {
    matchUpdated = {
      ...matchUpdated,
      result: { ...matchUpdated.result, playerStats: livedPlayerStats }
    }
  }
  const updated = new Map<ID, Match>([[m.id, matchUpdated]])
  return applyPlayedPipeline(world, updated, [matchUpdated], m.date)
}

/** Simula un único partido pendiente del usuario respetando la alineación
 *  elegida (XV + banquillo). El resto de partidos del calendario quedan como
 *  estaban; el usuario decide cuándo simularlos vía Calendar/TopBar.
 *
 *  El lado que NO es del usuario usa `buildTeamsForMatch` (selección automática). */
export function simulateSingleMatchWithLineup(
  world: World,
  matchId: ID,
  userClubId: ID,
  lineup: { starterIds: Record<number, ID>; benchIds: ID[] }
): World {
  const m = world.matches.find((mm) => mm.id === matchId)
  if (!m || m.played) return world
  const competition = world.competitions.find((c) => c.id === m.competitionId)
  // Si el partido es internacional, no aplica selección de club: caer a auto.
  if (competition && isInternationalFormat(competition.format)) {
    return simulateMatches(world, [m])
  }
  const homeClub = world.clubs.find((c) => c.id === m.homeClubId)
  const awayClub = world.clubs.find((c) => c.id === m.awayClubId)
  if (!homeClub || !awayClub) return world

  const isUserHome = m.homeClubId === userClubId
  const opts = fixtureSimOptions(world, m)
  const homeTeam = isUserHome
    ? buildMatchTeam(homeClub, world.players, { starterIds: lineup.starterIds, benchIds: lineup.benchIds })
    : buildMatchTeam(homeClub, world.players)
  const awayTeam = !isUserHome
    ? buildMatchTeam(awayClub, world.players, { starterIds: lineup.starterIds, benchIds: lineup.benchIds })
    : buildMatchTeam(awayClub, world.players)
  const r = simulateMatch(homeTeam, awayTeam, opts)
  const matchUpdated = buildPlayedMatch(world, m, r, homeTeam, awayTeam)
  const updatedMap = new Map<ID, Match>([[m.id, matchUpdated]])
  return applyPlayedPipeline(world, updatedMap, [matchUpdated], m.date)
}

export function simulateRound(world: World, competitionId: ID, round: number): World {
  const targets = world.matches.filter(
    (m) => m.competitionId === competitionId && m.round === round && !m.played
  )
  return simulateMatches(world, targets)
}

/** Días que abarca una jornada: de viernes a domingo (los partidos caen en esos tres días). */
const MATCHDAY_WINDOW_DAYS = 2

export function simulateScheduledMatchesUntil(world: World, targetDate: ISODate): World {
  let nextWorld = world
  let guard = 0

  while (guard < 10000) {
    // El próximo partido pendiente (el más temprano; a igual fecha, la ronda menor).
    let nextMatch: Match | undefined
    for (const m of nextWorld.matches) {
      if (m.played || m.date > targetDate) continue
      if (!nextMatch || m.date < nextMatch.date || (m.date === nextMatch.date && m.round < nextMatch.round)) nextMatch = m
    }
    if (!nextMatch) break

    // Un fin de semana es UNA jornada: los partidos de viernes a domingo se juegan en la misma
    // pasada. El pipeline (efectos semanales sobre ~17.000 jugadores, ciclos mundialistas,
    // finanzas, playoffs) cuesta lo mismo con un partido que con cien, y los partidos de una
    // semana caen en 2 o 3 fechas distintas: pasarlo por cada fecha lo repetía 2 o 3 veces.
    const windowEnd = addDays(nextMatch.date, MATCHDAY_WINDOW_DAYS)
    const limit = windowEnd < targetDate ? windowEnd : targetDate
    const first = nextMatch.date
    const dueMatches = nextWorld.matches.filter((m) => !m.played && m.date >= first && m.date <= limit)
    const dueIds = new Set(dueMatches.map((m) => m.id))
    nextWorld = simulateMatches(nextWorld, dueMatches)

    if (!nextWorld.matches.some((m) => dueIds.has(m.id) && m.played)) break
    guard++
  }

  if (targetDate > nextWorld.currentDate) {
    const previousDate = nextWorld.currentDate
    nextWorld = applyMonthlyFinances({ ...nextWorld, currentDate: targetDate }, previousDate, targetDate)
  }

  return nextWorld
}

export function getNextMatch(world: World, clubId: ID): Match | null {
  const candidates = world.matches
    .filter((m) => !m.played && (m.homeClubId === clubId || m.awayClubId === clubId))
    .sort((a, b) => a.date.localeCompare(b.date))
  return candidates[0] ?? null
}

export function getLastMatch(world: World, clubId: ID): Match | null {
  const candidates = world.matches
    .filter((m) => m.played && (m.homeClubId === clubId || m.awayClubId === clubId))
    .sort((a, b) => b.date.localeCompare(a.date))
  return candidates[0] ?? null
}
