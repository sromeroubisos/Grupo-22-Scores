import { random, seedEntropy } from '../utils/entropy.ts'
// Genera el mundo demo: ligas mundiales + Champions Cup + Six Nations + Rugby Championship.

import type { Attributes, Club, Competition, Country, Match, Player, RugbyPosition, World, SimulationMode } from '../types/index.ts'
import {
  DEFAULT_SETTINGS, defaultTactics, DEFAULT_TRAINING,
  fairSalaryForCA, generateExpectations,
  ENGINE_SCHEMA_VERSION,
  type Tactics, type TrainingSchedule, type ID, type Contract, type SquadRole,
  type BoardExpectations
} from '../types/index.ts'
import { newId } from '../utils/id.ts'
import { generateFixtures, normalizeMatchDatesForRest } from '../engine/fixtures.ts'
import { generateIntlSplitFixtures } from '../engine/intlSplitFixtures.ts'
import { generateSevensCircuitFixtures, defaultSVNSStages2026 } from '../engine/sevensCircuit.ts'
import { buildChampionsCup } from '../engine/tournament.ts'
import { ageFromDOB, addDays } from '../utils/date.ts'
import { randomFullName, randomNationalName, type CountryCode, type NatlCountryCode } from './names.ts'
import type { AnyCountryCode } from './leagues.ts'
import { ALL_LEAGUES, type LeagueData } from './leagues.ts'
import { ARGENTINA_PYRAMIDS } from './argentina.ts'
import { catalogIdForName, colorsFor, crestPathForName } from './crests.ts'
import { WORLD_RUGBY_NATIONS } from './countries.ts'
import { buildSeasonCalendar, blockedRangesForLeague } from './seasonCalendarBuilder.ts'
import { computeLeagueStartDate, blockedRangesForEuropean } from '../engine/competitionSchedule.ts'
import { bootstrapRankingState } from '../engine/worldRugbyRanking.ts'
import { INITIAL_MEN_RANKING, INITIAL_WOMEN_RANKING, INITIAL_RANKING_AS_OF } from './initialRankings.ts'
import {
  selectRegionalCompetitions, selectPyramids, resolveDateTemplate,
  type RegionalCompetitionData, type PyramidData
} from './confederations/index.ts'
import {
  generateRegionalPool, generateKOBracket, generateSudamericanoBracket,
  generateTwoLegPlayoff
} from '../engine/regionalFixtures.ts'
import { confederationIdFromUnion } from '../types/index.ts'
import type { Confederation, Pyramid, QualificationCycle } from '../types/index.ts'
import { buildAllQualificationCycles } from './rwcQualifications.ts'
import { resolveSlots } from '../engine/qualificationPathfinder.ts'

/** Año de arranque del mundo. Reemplaza new Date().getFullYear(): la fecha del reloj no puede entrar al motor. */
const WORLD_START_YEAR = 2026

const randInt = (min: number, max: number): number =>
  min + Math.floor(random() * (max - min + 1))

function makeAttributes(reputationBoost = 0): Attributes {
  const lo = 8 + Math.floor(reputationBoost / 10)
  const hi = 16 + Math.floor(reputationBoost / 8)
  const r = () => randInt(lo, Math.min(20, hi))
  return {
    technical: {
      tackle: r(), handling: r(), passShort: r(), passLong: r(),
      kickPosts: r(), kickTactical: r(), kickPunt: r(), ballCarry: r(),
      ruckSupport: r(), ruckClean: r(), jackal: r(), scrum: r(),
      lineoutJump: r(), lineoutThrow: r(), maul: r(), aerial: r()
    },
    mental: {
      decisions: r(), vision: r(), anticipation: r(), leadership: r(),
      discipline: r(), teamwork: r(), concentration: r(), determination: r(),
      composure: r(), workrate: r(), positioning: r(), initiative: r()
    },
    physical: {
      pace: r(), acceleration: r(), agility: r(), strength: r(),
      power: r(), stamina: r(), jumping: r(), balance: r(), recovery: r(),
      injuryProneness: randInt(5, 12)
    },
    hidden: {
      ambition: r(), professionalism: r(), loyalty: r(),
      adaptability: r(), greed: r(), controversy: randInt(5, 10)
    }
  }
}

function heightByPos(p: RugbyPosition): number {
  const map: Record<RugbyPosition, number> = {
    1: 183, 2: 180, 3: 184, 4: 200, 5: 198, 6: 192, 7: 187, 8: 193,
    9: 178, 10: 184, 11: 184, 12: 188, 13: 186, 14: 184, 15: 186
  }
  return map[p] + randInt(-3, 3)
}
function weightByPos(p: RugbyPosition): number {
  const map: Record<RugbyPosition, number> = {
    1: 120, 2: 105, 3: 122, 4: 120, 5: 118, 6: 110, 7: 102, 8: 112,
    9: 85, 10: 90, 11: 95, 12: 100, 13: 96, 14: 92, 15: 94
  }
  return map[p] + randInt(-4, 4)
}

// Conjunto de códigos válidos en randomNationalName (con pool específico).
const NATL_CODES = new Set<string>([
  'IRL','SCO','WAL','ITA','ZAF','NZL','AUS','ARG','JPN','USA',
  'FIJ','SAM','TGA','GEO','ROU','URU','CHI','GEN'
])
const CORE_CODES = new Set<string>(['ESP','FRA','ENG'])

function randomAnyName(code: AnyCountryCode | string): { firstName: string; lastName: string } {
  if (CORE_CODES.has(code as string)) return randomFullName(code as CountryCode)
  if (NATL_CODES.has(code as string)) return randomNationalName(code as NatlCountryCode)
  // Fallback genérico para cualquier otra nación sin pool propio
  return randomNationalName('GEN')
}

function makePlayer(clubId: string, countryId: string, countryCode: AnyCountryCode | string, position: RugbyPosition, age: number, repBoost: number): Player {
  const { firstName, lastName } = randomAnyName(countryCode)
  const yr = WORLD_START_YEAR - age
  const caBase = 70 + Math.round(repBoost * 0.7)
  return {
    id: newId('plr'), firstName, lastName,
    dateOfBirth: `${yr}-06-15`,
    nationalityIds: [countryId],
    primaryPosition: position, secondaryPositions: [],
    heightCm: heightByPos(position), weightKg: weightByPos(position),
    clubId, contractId: null,
    attributes: makeAttributes(repBoost),
    currentAbility: randInt(caBase - 10, caBase + 40),
    potentialAbility: randInt(caBase + 10, Math.min(200, caBase + 80)),
    morale: 70, condition: 95,
    reputation: randInt(Math.max(20, repBoost - 20), Math.min(95, repBoost + 10)),
    injury: null
  }
}

function makeClubSquad(clubId: string, countryId: string, countryCode: AnyCountryCode | string, repBoost: number): Player[] {
  const squad: Player[] = []
  for (let pos = 1; pos <= 15; pos++) {
    squad.push(makePlayer(clubId, countryId, countryCode, pos as RugbyPosition, randInt(20, 32), repBoost))
    squad.push(makePlayer(clubId, countryId, countryCode, pos as RugbyPosition, randInt(19, 30), repBoost))
  }
  return squad
}

interface LeagueBuild {
  country: Country
  competition: Competition
  clubs: Club[]
  players: Player[]
  contracts: Contract[]
  tactics: Record<ID, Tactics>
  training: Record<ID, TrainingSchedule>
  boardExpectations: Record<ID, BoardExpectations>
  matches: ReturnType<typeof generateFixtures>
}

function buildLeague(
  league: LeagueData,
  year: number,
  startDate: string,
  blockedRanges: { start: string; end: string }[] = [],
  sharedCountries: Map<string, Country> = new Map()
): LeagueBuild {
  // Las ligas de un mismo país (Argentina tiene 28) comparten UN solo Country,
  // con el tier de World Rugby de la nación y no el de la división.
  const reused = league.sharedCountry ? sharedCountries.get(league.countryCode) : undefined
  const nation = league.sharedCountry ? WORLD_RUGBY_NATIONS.find((n) => n.code === league.countryCode) : undefined
  const country: Country = reused ?? {
    id: newId('ctry'), name: nation?.name ?? league.countryName, code: league.countryCode,
    region: league.region, tier: nation?.tier ?? league.tier,
    federationName: nation?.federationName ?? league.federationName
  }
  if (league.sharedCountry && !reused) sharedCountries.set(league.countryCode, country)
  const budgetMultiplier = league.tier === 1 ? 6 : 1
  const clubs: Club[] = league.clubs.map((c) => ({
    id: newId('clb'), name: c.name, shortName: c.shortName,
    foundedYear: randInt(1900, 1980),
    countryId: country.id, city: c.city,
    stadium: { name: `Estadio de ${c.city}`, capacity: Math.round(2000 + (c.baseReputation / 100) * 30000), city: c.city },
    primaryColor: c.primaryColor ?? colorsFor(c.name).primary,
    secondaryColor: c.secondaryColor ?? colorsFor(c.name).secondary,
    catalogId: c.catalogId ?? catalogIdForName(c.name),
    crest: c.crest !== undefined ? c.crest : crestPathForName(c.name),
    reputation: c.baseReputation,
    // Elo inicial calibrado por reputación: 1300 (rep 0) → 1700 (rep 100).
    eloRating: Math.round(1300 + (c.baseReputation / 100) * 400),
    finances: {
      cash: Math.round((300_000 + c.baseReputation * 20_000) * budgetMultiplier),
      monthlyIncome: Math.round((60_000 + c.baseReputation * 2000) * budgetMultiplier),
      monthlyExpenses: Math.round((50_000 + c.baseReputation * 1500) * budgetMultiplier),
      salaryCap: league.salaryCap,
      wageBudget: Math.round((500_000 + c.baseReputation * 5000) * budgetMultiplier),
      transferBudget: Math.round((50_000 + c.baseReputation * 5000) * budgetMultiplier)
    },
    competitionIds: []
  }))
  const players: Player[] = clubs.flatMap((club, idx) =>
    makeClubSquad(club.id, country.id, league.countryCode, league.clubs[idx].baseReputation)
  )
  const competition: Competition = {
    id: newId('comp'), name: league.name, shortName: league.shortName,
    countryId: country.id, format: 'league', tier: league.tier,
    rules: {
      pointsForWin: 4, pointsForDraw: 2, pointsForLoss: 0,
      tryBonus: true, losingBonus: true,
      hasPlayoff: league.hasPlayoff ?? true,
      playoffTeams: league.playoffTeams ?? (league.clubs.length >= 12 ? 8 : 4),
      promotion: league.promotion ?? 0,
      relegation: league.relegation ?? 0
    },
    clubIds: clubs.map((c) => c.id),
    gender: 'men',
    ageCategory: 'senior'
  }
  clubs.forEach((c) => c.competitionIds.push(competition.id))
  const matches = generateFixtures(competition.id, clubs.map((c) => c.id), year, {
    firstMatchDate: startDate,
    daysBetweenRounds: 7,
    blockedRanges
  })

  const contracts: Contract[] = []
  const contractStart = '2026-07-01'
  for (const p of players) {
    const age = ageFromDOB(p.dateOfBirth, contractStart)
    const lengthYears = 1 + Math.floor(random() * 3)
    const endDate = addDays(contractStart, lengthYears * 365)
    const salary = fairSalaryForCA(p.currentAbility, age)
    let role: SquadRole = 'rotation'
    if (p.currentAbility >= 140) role = 'star'
    else if (p.currentAbility >= 115) role = 'first_team'
    else if (p.currentAbility < 80) role = 'backup'
    const contract: Contract = {
      id: newId('ctr'), personId: p.id, clubId: p.clubId!,
      salaryPerYear: salary,
      signingBonus: Math.round(salary * 0.1),
      appearanceFee: Math.round(salary / 200),
      tryBonus: Math.round(salary / 500),
      titleBonus: Math.round(salary * 0.2),
      startDate: contractStart, endDate,
      releaseClause: random() < 0.3 ? Math.round(salary * lengthYears * 1.5) : null,
      isCaptain: false, squadRole: role
    }
    contracts.push(contract)
    p.contractId = contract.id
  }

  const tactics: Record<ID, Tactics> = {}
  const training: Record<ID, TrainingSchedule> = {}
  for (const c of clubs) {
    const squad = players.filter((p) => p.clubId === c.id)
    const t = defaultTactics()
    for (let pos = 1; pos <= 15; pos++) {
      const best = squad.filter((p) => p.primaryPosition === pos).sort((a, b) => b.currentAbility - a.currentAbility)[0]
      if (best) t.starters[pos as RugbyPosition] = best.id
    }
    const xvIds = Object.values(t.starters)
    const xv = squad.filter((p) => xvIds.includes(p.id))
    const cap = xv.sort((a, b) => b.attributes.mental.leadership - a.attributes.mental.leadership)[0]
    t.captainId = cap?.id ?? null
    if (cap) {
      const capContract = contracts.find((ct) => ct.personId === cap.id)
      if (capContract) capContract.isCaptain = true
    }
    tactics[c.id] = t
    training[c.id] = { ...DEFAULT_TRAINING }
  }

  const boardExpectations: Record<ID, BoardExpectations> = {}
  for (const c of clubs) {
    boardExpectations[c.id] = generateExpectations(c.id, year, c.reputation)
  }
  return { country, competition, clubs, players, contracts, tactics, training, boardExpectations, matches }
}

export interface CreateDemoWorldOptions {
  /** Semilla del mundo. Obligatoria: toda la generación (nombres, atributos,
   *  contratos, ids) sale de un flujo sembrado con ella. */
  seed: number
  /** Modo de simulación. 'detailed' (default) habilita la pirámide regional
   *  completa cuando esté disponible; 'simplified' colapsa a 1 Tier1 + 1 Tier2
   *  por confederación. */
  simulationMode?: SimulationMode
}

export function createDemoWorld(options: CreateDemoWorldOptions): World {
  seedEntropy(options.seed)
  const simulationMode: SimulationMode = options.simulationMode ?? 'detailed'
  const year = 2026
  const calendar = buildSeasonCalendar(year)
  const sharedCountries = new Map<string, Country>()
  const builds: LeagueBuild[] = ALL_LEAGUES.map((l) => {
    const startDate = computeLeagueStartDate(l, year, calendar)
    const blockedRanges = blockedRangesForLeague(calendar, l.northOrSouth)
    return buildLeague(l, year, startDate, blockedRanges, sharedCountries)
  })

  // 1. Crear el catálogo completo de naciones World Rugby
  // Cada nación World Rugby tiene su propia entrada Country.
  // Si la nación ya existe a través de una liga, la reutilizamos.
  const builtCountries = [...new Map(builds.map((b) => [b.country.id, b.country])).values()]
  const builtCodes = new Set(builtCountries.map((c) => c.code))
  const extraCountries: Country[] = []
  for (const n of WORLD_RUGBY_NATIONS) {
    if (builtCodes.has(n.code)) continue
    extraCountries.push({
      id: newId('ctry'),
      name: n.name, code: n.code,
      region: n.region, tier: n.tier,
      federationName: n.federationName
    })
  }

  const countriesRaw = [...builtCountries, ...extraCountries]
  // Asignar confederationId a TODOS los países usando el catálogo WORLD_RUGBY_NATIONS.
  // Los países que vienen de buildLeague no traen confederationId; los `extra`
  // tampoco. El mapping union→ConfederationId es 1:1.
  const countries = countriesRaw.map((co) => {
    if (co.confederationId) return co
    const cat = WORLD_RUGBY_NATIONS.find((n) => n.code === co.code)
    if (cat) return { ...co, confederationId: confederationIdFromUnion(cat.union) }
    return co
  })

  // 2. Jugadores libres para las naciones internacionales clave (con pool de nombres propio)
  // Generamos pools de FA por nación para alimentar Six Nations, Rugby Championship y futuras competiciones.
  const NATL_WITH_POOL: Array<{ code: NatlCountryCode; minRep: number }> = [
    { code: 'IRL', minRep: 65 }, { code: 'SCO', minRep: 60 }, { code: 'WAL', minRep: 60 },
    { code: 'ITA', minRep: 55 }, { code: 'ZAF', minRep: 70 },
    { code: 'NZL', minRep: 80 }, { code: 'AUS', minRep: 70 }, { code: 'ARG', minRep: 65 },
    { code: 'JPN', minRep: 55 }, { code: 'USA', minRep: 45 },
    { code: 'FIJ', minRep: 55 }, { code: 'SAM', minRep: 50 }, { code: 'TGA', minRep: 48 },
    { code: 'GEO', minRep: 50 }, { code: 'ROU', minRep: 42 },
    { code: 'URU', minRep: 50 }, { code: 'CHI', minRep: 45 }
  ]
  const extraPlayers: Player[] = []
  const generatedPoolCodes = new Set<string>()
  for (const nat of NATL_WITH_POOL) {
    const country = countries.find((c) => c.code === nat.code)
    if (!country) continue
    generatedPoolCodes.add(nat.code)
    // 30 jugadores por nación: 2 por puesto
    for (let pos = 1; pos <= 15; pos++) {
      for (let copy = 0; copy < 2; copy++) {
        const age = randInt(20, 32)
        const { firstName, lastName } = randomNationalName(nat.code)
        const yr = WORLD_START_YEAR - age
        extraPlayers.push({
          id: newId('plr'), firstName, lastName,
          dateOfBirth: `${yr}-06-15`,
          nationalityIds: [country.id],
          primaryPosition: pos as RugbyPosition, secondaryPositions: [],
          heightCm: heightByPos(pos as RugbyPosition),
          weightKg: weightByPos(pos as RugbyPosition),
          clubId: null, contractId: null,
          attributes: makeAttributes(nat.minRep + 10),
          currentAbility: randInt(nat.minRep + 40, nat.minRep + 90),
          potentialAbility: randInt(nat.minRep + 60, Math.min(200, nat.minRep + 110)),
          morale: 70, condition: 95,
          reputation: randInt(Math.max(20, nat.minRep - 10), Math.min(95, nat.minRep + 20)),
          injury: null,
          gender: 'men', ageCategory: 'senior'
        })
      }
    }
  }

  // 2b. Pools de selección para naciones que participan en competencias
  //     regionales (Fase B) y aún no tienen jugadores. Se generan con
  //     repBoost derivado del tier (1=70, 2=55, 3=42, 4=32) para que las
  //     simulaciones produzcan resultados creíbles.
  const REGIONAL_COMPS = selectRegionalCompetitions(simulationMode)
  const repBoostByTier: Record<1 | 2 | 3 | 4, number> = { 1: 70, 2: 55, 3: 42, 4: 32 }
  // Separar códigos por género de la competición a la que pertenecen.
  const menRegionalCodes = new Set<string>(
    REGIONAL_COMPS.filter((c) => c.gender === 'men').flatMap((c) => c.memberCountryCodes)
  )
  for (const code of menRegionalCodes) {
    if (generatedPoolCodes.has(code)) continue                       // ya cubierto por NATL_WITH_POOL
    if (builtCodes.has(code)) continue                               // ya cubierto por su liga doméstica (ENG/FRA/ESP)
    const country = countries.find((c) => c.code === code)
    if (!country) continue
    const minRep = repBoostByTier[country.tier] ?? 40
    for (let pos = 1; pos <= 15; pos++) {
      for (let copy = 0; copy < 2; copy++) {
        const age = randInt(20, 32)
        const { firstName, lastName } = randomAnyName(code)
        const yr = WORLD_START_YEAR - age
        extraPlayers.push({
          id: newId('plr'), firstName, lastName,
          dateOfBirth: `${yr}-06-15`,
          nationalityIds: [country.id],
          primaryPosition: pos as RugbyPosition, secondaryPositions: [],
          heightCm: heightByPos(pos as RugbyPosition),
          weightKg: weightByPos(pos as RugbyPosition),
          clubId: null, contractId: null,
          attributes: makeAttributes(minRep + 5),
          currentAbility: randInt(minRep + 30, minRep + 70),
          potentialAbility: randInt(minRep + 50, Math.min(200, minRep + 90)),
          morale: 70, condition: 95,
          reputation: randInt(Math.max(20, minRep - 10), Math.min(85, minRep + 15)),
          injury: null,
          gender: 'men', ageCategory: 'senior'
        })
      }
    }
    generatedPoolCodes.add(code)
  }

  // 2c. Pools FEMENINOS (Fase C). Incluye naciones de:
  //     - Six Nations femenino (W6N): ENG, FRA, IRL, SCO, WAL, ITA
  //     - WXV: añade NZL, AUS, ZAF, CAN, USA, JPN
  //     - Competencias regionales femeninas del catálogo REGIONAL_COMPS.
  //     Pesos de talla/peso usan los mismos por posición que en masculino
  //     (aproximación) pero CA y atributos calibrados con minRep por tier.
  const womenCoreCodes = new Set<string>([
    // W6N hardcoded en demoWorld.
    'ENG', 'FRA', 'IRL', 'SCO', 'WAL', 'ITA',
    // WXV pools A y B hardcoded.
    'NZL', 'AUS', 'ZAF', 'CAN', 'USA', 'JPN'
  ])
  const womenRegionalCodes = new Set<string>(
    REGIONAL_COMPS.filter((c) => c.gender === 'women').flatMap((c) => c.memberCountryCodes)
  )
  const allWomenCodes = new Set<string>([...womenCoreCodes, ...womenRegionalCodes])
  const generatedWomenPoolCodes = new Set<string>()
  for (const code of allWomenCodes) {
    const country = countries.find((c) => c.code === code)
    if (!country) continue
    const minRep = repBoostByTier[country.tier] ?? 40
    for (let pos = 1; pos <= 15; pos++) {
      for (let copy = 0; copy < 2; copy++) {
        const age = randInt(20, 32)
        const { firstName, lastName } = randomAnyName(code)
        const yr = WORLD_START_YEAR - age
        extraPlayers.push({
          id: newId('plr'), firstName, lastName,
          dateOfBirth: `${yr}-06-15`,
          nationalityIds: [country.id],
          primaryPosition: pos as RugbyPosition, secondaryPositions: [],
          heightCm: Math.max(160, heightByPos(pos as RugbyPosition) - 13),  // mujeres ~13cm más bajas en promedio
          weightKg: Math.max(60, weightByPos(pos as RugbyPosition) - 25),    // y ~25kg más livianas
          clubId: null, contractId: null,
          attributes: makeAttributes(minRep + 5),
          currentAbility: randInt(minRep + 25, minRep + 65),
          potentialAbility: randInt(minRep + 45, Math.min(200, minRep + 85)),
          morale: 70, condition: 95,
          reputation: randInt(Math.max(20, minRep - 10), Math.min(85, minRep + 15)),
          injury: null,
          gender: 'women', ageCategory: 'senior'
        })
      }
    }
    generatedWomenPoolCodes.add(code)
  }

  // 2d. Pools JUVENILES (Fase E). Para cada competición con ageCategory != senior,
  //     genera 15 jugadores (1 por posición) por país miembro. Edad/CA ajustados
  //     por la categoría (U20: 18-20 años; U19: 18-19; U18: 16-18).
  //     Los chicos están en clubId:null (FA hasta ser ofrecidos en cantera).
  type JuvenileAge = 'u20' | 'u19' | 'u18'
  const ageRanges: Record<JuvenileAge, { min: number; max: number; caBoost: number; potBoost: number }> = {
    u20: { min: 18, max: 20, caBoost: -25, potBoost: 5 },
    u19: { min: 18, max: 19, caBoost: -32, potBoost: 0 },
    u18: { min: 16, max: 18, caBoost: -40, potBoost: -5 }
  }
  const juvenileCompsByAge = new Map<JuvenileAge, Set<string>>([
    ['u20', new Set()],
    ['u19', new Set()],
    ['u18', new Set()]
  ])
  for (const rc of REGIONAL_COMPS) {
    if (rc.ageCategory === 'senior') continue
    const set = juvenileCompsByAge.get(rc.ageCategory as JuvenileAge)
    if (!set) continue
    rc.memberCountryCodes.forEach((c) => set.add(c))
  }
  for (const [ageCat, codeSet] of juvenileCompsByAge) {
    const range = ageRanges[ageCat]
    for (const code of codeSet) {
      const country = countries.find((c) => c.code === code)
      if (!country) continue
      const minRep = repBoostByTier[country.tier] ?? 40
      for (let pos = 1; pos <= 15; pos++) {
        const age = randInt(range.min, range.max)
        const { firstName, lastName } = randomAnyName(code)
        const yr = WORLD_START_YEAR - age
        extraPlayers.push({
          id: newId('plr'), firstName, lastName,
          dateOfBirth: `${yr}-06-15`,
          nationalityIds: [country.id],
          primaryPosition: pos as RugbyPosition, secondaryPositions: [],
          heightCm: heightByPos(pos as RugbyPosition) - randInt(0, 3),
          weightKg: weightByPos(pos as RugbyPosition) - randInt(2, 8),
          clubId: null, contractId: null,
          attributes: makeAttributes(minRep + range.caBoost / 2),
          currentAbility: Math.max(40, randInt(minRep + range.caBoost, minRep + range.caBoost + 25)),
          potentialAbility: Math.min(200, randInt(minRep + 35 + range.potBoost, minRep + 95 + range.potBoost)),
          morale: 75, condition: 95,
          reputation: randInt(20, Math.max(25, minRep - 15)),
          injury: null,
          gender: 'men', ageCategory: ageCat
        })
      }
    }
  }

  const baseCompetitions = builds.map((b) => b.competition)
  let clubs = builds.flatMap((b) => b.clubs)
  let players = [...builds.flatMap((b) => b.players), ...extraPlayers]
  const contracts = builds.flatMap((b) => b.contracts)
  const baseMatches = builds.flatMap((b) => b.matches)

  // 3. Reasignar países de los clubes multi-país según countryOverride
  const multiCountryLeagues = ALL_LEAGUES.filter((l) => l.multiCountry)
  for (const ml of multiCountryLeagues) {
    const comp = baseCompetitions.find((co) => co.shortName === ml.shortName)
    if (!comp) continue
    for (const data of ml.clubs) {
      if (!data.countryOverride) continue
      const club = clubs.find((cl) => cl.competitionIds.includes(comp.id) && cl.shortName === data.shortName)
      if (!club) continue
      const targetCountry = countries.find((co) => co.code === data.countryOverride)
      if (!targetCountry) continue
      club.countryId = targetCountry.id
      const code = data.countryOverride
      players = players.map((p) => {
        if (p.clubId !== club.id) return p
        const { firstName, lastName } = randomAnyName(code)
        return { ...p, firstName, lastName, nationalityIds: [targetCountry.id] }
      })
    }
  }

  // 4. Champions Cup (clubes europeos top): QF Dic, SF Mar/Abr, Final May.
  //    Pasa los release_window europeos para que SF/Final no caigan en
  //    Six Nations ni en la ventana de noviembre.
  const partialWorld = { competitions: baseCompetitions, clubs, matches: baseMatches, seasonYear: year } as unknown as World
  const ccup = buildChampionsCup(partialWorld, year, blockedRangesForEuropean(calendar))
  ccup.competition.gender = 'men'
  ccup.competition.ageCategory = 'senior'
  ccup.competition.clubIds.forEach((cid) => {
    const c = clubs.find((cl) => cl.id === cid)
    if (c) c.competitionIds.push(ccup.competition.id)
  })

  // 5. Six Nations (Inglaterra, Francia, Irlanda, Escocia, Gales, Italia)
  const sixNationsCountries: Country[] = (['ENG', 'FRA', 'IRL', 'SCO', 'WAL', 'ITA'] as const)
    .map((code) => countries.find((c) => c.code === code))
    .filter((c): c is Country => Boolean(c))
  const sixNations: Competition = {
    id: newId('comp_6n'),
    name: 'Six Nations', shortName: '6N',
    countryId: null, format: 'international', tier: 1,
    rules: {
      pointsForWin: 4, pointsForDraw: 2, pointsForLoss: 0,
      tryBonus: true, losingBonus: true,
      hasPlayoff: false, playoffTeams: 0,
      promotion: 0, relegation: 0
    },
    clubIds: sixNationsCountries.map((c) => c.id),
    gender: 'men',
    ageCategory: 'senior'
  }
  const sixNFix = generateFixtures(sixNations.id, sixNations.clubIds, year, `${year + 1}-02-06`, 7)
  const sixNMax = Math.max(...sixNFix.map((f) => f.round))
  const sixNHalf = Math.floor(sixNMax / 2)
  const sixNationsMatches = sixNFix.filter((m) => m.round <= sixNHalf)

  // 6. The Rugby Championship (Nueva Zelanda, Australia, Sudáfrica, Argentina).
  //    Ciclo SANZAAR: solo se disputa en 2027, 2028 y 2029.
  //    En 2026 la competición existe pero no genera fixtures (dormant).
  const rcCountries: Country[] = (['NZL', 'AUS', 'ZAF', 'ARG'] as const)
    .map((code) => countries.find((c) => c.code === code))
    .filter((c): c is Country => Boolean(c))
  let rugbyChampionship: Competition | null = null
  let rugbyChampionshipMatches: ReturnType<typeof generateFixtures> = []
  if (rcCountries.length === 4) {
    rugbyChampionship = {
      id: newId('comp_rc'),
      name: 'The Rugby Championship', shortName: 'RC',
      countryId: null, format: 'international', tier: 1,
      rules: {
        pointsForWin: 4, pointsForDraw: 2, pointsForLoss: 0,
        tryBonus: true, losingBonus: true,
        hasPlayoff: false, playoffTeams: 0,
        promotion: 0, relegation: 0
      },
      clubIds: rcCountries.map((c) => c.id),
      activeYears: [2027, 2028, 2029],
      gender: 'men',
      ageCategory: 'senior'
    }
    // En 2026 no se generan partidos: RC está dormant según ciclo SANZAAR.
    if (rugbyChampionship.activeYears!.includes(year)) {
      rugbyChampionshipMatches = generateFixtures(
        rugbyChampionship.id, rugbyChampionship.clubIds, year,
        { firstMatchDate: `${year}-08-15`, daysBetweenRounds: 7 }
      )
    }
  }

  // 7. World Rugby Nations Championship: 12 selecciones top, 2 pools de 6.
  //    Jul (rondas 1-3) + Nov (rondas 4-6). Finals Weekend Londres (no pre-generadas).
  const ncPoolACodes = ['ENG', 'FRA', 'IRL', 'SCO', 'WAL', 'ITA'] as const
  const ncPoolBCodes = ['NZL', 'AUS', 'ZAF', 'ARG', 'FIJ', 'JPN'] as const
  const ncPoolA = ncPoolACodes
    .map((code) => countries.find((c) => c.code === code))
    .filter((c): c is Country => Boolean(c))
  const ncPoolB = ncPoolBCodes
    .map((code) => countries.find((c) => c.code === code))
    .filter((c): c is Country => Boolean(c))
  let nationsChampionship: Competition | null = null
  let nationsChampionshipMatches: ReturnType<typeof generateIntlSplitFixtures> = []
  if (ncPoolA.length === 6 && ncPoolB.length === 6) {
    nationsChampionship = {
      id: newId('comp_nc'),
      name: 'World Rugby Nations Championship', shortName: 'NC',
      countryId: null, format: 'international_split', tier: 1,
      rules: {
        pointsForWin: 4, pointsForDraw: 2, pointsForLoss: 0,
        tryBonus: true, losingBonus: true,
        hasPlayoff: false, playoffTeams: 0,
        promotion: 0, relegation: 0
      },
      clubIds: [...ncPoolA, ...ncPoolB].map((c) => c.id),
      gender: 'men',
      ageCategory: 'senior'
    }
    nationsChampionshipMatches = generateIntlSplitFixtures(nationsChampionship.id, year, {
      julyAnchor: `${year}-07-04`,
      novemberAnchor: `${year}-11-07`,
      poolA: ncPoolA.map((c) => c.id),
      poolB: ncPoolB.map((c) => c.id)
    })
  }

  // 8. World Rugby Nations Cup (tier 2): 12 selecciones, mismo formato.
  const ncupPoolACodes = ['POR', 'GEO', 'ROU', 'ESP', 'USA', 'CAN'] as const
  const ncupPoolBCodes = ['URU', 'CHI', 'SAM', 'TGA', 'NAM', 'HKG'] as const
  const ncupPoolA = ncupPoolACodes
    .map((code) => countries.find((c) => c.code === code))
    .filter((c): c is Country => Boolean(c))
  const ncupPoolB = ncupPoolBCodes
    .map((code) => countries.find((c) => c.code === code))
    .filter((c): c is Country => Boolean(c))
  let nationsCup: Competition | null = null
  let nationsCupMatches: ReturnType<typeof generateIntlSplitFixtures> = []
  if (ncupPoolA.length === 6 && ncupPoolB.length === 6) {
    nationsCup = {
      id: newId('comp_ncup'),
      name: 'World Rugby Nations Cup', shortName: 'NCup',
      countryId: null, format: 'international_split', tier: 2,
      rules: {
        pointsForWin: 4, pointsForDraw: 2, pointsForLoss: 0,
        tryBonus: true, losingBonus: true,
        hasPlayoff: false, playoffTeams: 0,
        promotion: 0, relegation: 0
      },
      clubIds: [...ncupPoolA, ...ncupPoolB].map((c) => c.id),
      gender: 'men',
      ageCategory: 'senior'
    }
    nationsCupMatches = generateIntlSplitFixtures(nationsCup.id, year, {
      julyAnchor: `${year}-07-04`,
      novemberAnchor: `${year}-11-07`,
      poolA: ncupPoolA.map((c) => c.id),
      poolB: ncupPoolB.map((c) => c.id)
    })
  }

  // 9. Women's Six Nations (Abr-May del año siguiente)
  const womensSixNations: Competition = {
    id: newId('comp_w6n'),
    name: "Women's Six Nations", shortName: 'W6N',
    countryId: null, format: 'international', tier: 1,
    rules: {
      pointsForWin: 4, pointsForDraw: 2, pointsForLoss: 0,
      tryBonus: true, losingBonus: true,
      hasPlayoff: false, playoffTeams: 0,
      promotion: 0, relegation: 0
    },
    clubIds: sixNationsCountries.map((c) => c.id),
    gender: 'women',
    ageCategory: 'senior'
  }
  // Single round-robin: 5 rondas, una jornada por sábado.
  const w6nFix = generateFixtures(womensSixNations.id, womensSixNations.clubIds, year,
    { firstMatchDate: `${year + 1}-04-11`, daysBetweenRounds: 7 })
  const w6nMax = Math.max(...w6nFix.map((f) => f.round))
  const w6nHalf = Math.floor(w6nMax / 2)
  const womensSixNationsMatches = w6nFix.filter((m) => m.round <= w6nHalf)

  // 10. WXV Global Series (Sep-Oct): 12 selecciones top, formato similar a NC pero
  //     ventana única en septiembre-octubre. Usamos international_split como aproximación
  //     reutilizando el generador con anclas Sep/Oct.
  const wxvPoolACodes = ['ENG', 'FRA', 'IRL', 'NZL', 'AUS', 'ZAF'] as const
  const wxvPoolBCodes = ['CAN', 'USA', 'ITA', 'WAL', 'SCO', 'JPN'] as const
  const wxvPoolA = wxvPoolACodes
    .map((code) => countries.find((c) => c.code === code))
    .filter((c): c is Country => Boolean(c))
  const wxvPoolB = wxvPoolBCodes
    .map((code) => countries.find((c) => c.code === code))
    .filter((c): c is Country => Boolean(c))
  let wxv: Competition | null = null
  let wxvMatches: ReturnType<typeof generateIntlSplitFixtures> = []
  if (wxvPoolA.length === 6 && wxvPoolB.length === 6) {
    wxv = {
      id: newId('comp_wxv'),
      name: 'WXV Global Series', shortName: 'WXV',
      countryId: null, format: 'international_split', tier: 1,
      rules: {
        pointsForWin: 4, pointsForDraw: 2, pointsForLoss: 0,
        tryBonus: true, losingBonus: true,
        hasPlayoff: false, playoffTeams: 0,
        promotion: 0, relegation: 0
      },
      clubIds: [...wxvPoolA, ...wxvPoolB].map((c) => c.id),
      gender: 'women',
      ageCategory: 'senior'
    }
    // Sep-Oct: ambas mitades caen en otoño para simplificar. julyAnchor->Sep, novemberAnchor->Oct.
    wxvMatches = generateIntlSplitFixtures(wxv.id, year, {
      julyAnchor: `${year}-09-13`,
      novemberAnchor: `${year}-10-04`,
      poolA: wxvPoolA.map((c) => c.id),
      poolB: wxvPoolB.map((c) => c.id)
    })
  }

  // 11. HSBC SVNS Sevens (M y F): 13 etapas entre Nov y Jun.
  //     Modelo agregado: 1 partido representativo por etapa. Mejora futura: KO completo.
  const svnsCommonCodes = ['NZL', 'AUS', 'FIJ', 'ZAF', 'ARG', 'FRA', 'ENG', 'IRL', 'USA', 'ESP', 'JPN', 'URU'] as const
  const svnsNations = svnsCommonCodes
    .map((code) => countries.find((c) => c.code === code))
    .filter((c): c is Country => Boolean(c))
  let svnsMen: Competition | null = null
  let svnsWomen: Competition | null = null
  let svnsMenMatches: ReturnType<typeof generateSevensCircuitFixtures> = []
  let svnsWomenMatches: ReturnType<typeof generateSevensCircuitFixtures> = []
  if (svnsNations.length === 12) {
    svnsMen = {
      id: newId('comp_svnm'),
      name: 'HSBC SVNS Men', shortName: 'SVNSM',
      countryId: null, format: 'sevens_circuit', tier: 1,
      rules: {
        pointsForWin: 4, pointsForDraw: 2, pointsForLoss: 0,
        tryBonus: false, losingBonus: false,
        hasPlayoff: false, playoffTeams: 0,
        promotion: 0, relegation: 0
      },
      clubIds: svnsNations.map((c) => c.id),
      gender: 'men',
      ageCategory: 'senior',
      discipline: 'sevens'
    }
    svnsMenMatches = generateSevensCircuitFixtures(svnsMen.id, year, {
      nationIds: svnsNations.map((c) => c.id),
      stages: defaultSVNSStages2026()
    })
    svnsWomen = {
      id: newId('comp_svnw'),
      name: 'HSBC SVNS Women', shortName: 'SVNSW',
      countryId: null, format: 'sevens_circuit', tier: 1,
      rules: {
        pointsForWin: 4, pointsForDraw: 2, pointsForLoss: 0,
        tryBonus: false, losingBonus: false,
        hasPlayoff: false, playoffTeams: 0,
        promotion: 0, relegation: 0
      },
      clubIds: svnsNations.map((c) => c.id),
      gender: 'women',
      ageCategory: 'senior',
      discipline: 'sevens'
    }
    svnsWomenMatches = generateSevensCircuitFixtures(svnsWomen.id, year, {
      nationIds: svnsNations.map((c) => c.id),
      stages: defaultSVNSStages2026()
    })
  }

  // 12. Competencias regionales (XV M senior - Fase B): REC, Sudamericano,
  //     Africa Cup, Asia Champ, RAN T1/T2, Oceania Champ, Pacific Nations Cup, etc.
  const regionalCompetitions: Competition[] = []
  const regionalMatches: Match[] = []
  for (const rc of REGIONAL_COMPS) {
    const memberCountries = rc.memberCountryCodes
      .map((code) => countries.find((c) => c.code === code))
      .filter((c): c is Country => Boolean(c))
    if (memberCountries.length < 2) continue
    // Si la definición no marca discipline, lo inferimos del shortName:
    // patrón _7 (REC_7M, RAN_7W, SAR_7M, etc.) o 'SVNS' en el name → sevens.
    const inferredDiscipline: 'xv' | 'sevens' = rc.discipline ?? (
      /_7[MW]?$/.test(rc.shortName) || /sevens/i.test(rc.name) ? 'sevens' : 'xv'
    )
    const comp: Competition = {
      id: newId('comp_reg'),
      name: rc.name,
      shortName: rc.shortName,
      countryId: null,
      format: rc.format,
      tier: rc.tier,
      rules: { ...rc.rules },
      clubIds: memberCountries.map((c) => c.id),
      gender: rc.gender,
      ageCategory: rc.ageCategory,
      discipline: inferredDiscipline,
      confederationId: rc.confederationId ?? undefined,
      pyramidId: rc.pyramidId,
      pyramidLevel: rc.pyramidLevel
    }
    const firstMatchDate = resolveDateTemplate(rc.firstMatchDateTemplate, year)
    let fixtures: Match[] = []
    if (rc.format === 'regional_pool') {
      fixtures = generateRegionalPool(comp.id, year, comp.clubIds, {
        firstMatchDate, daysBetweenRounds: rc.daysBetweenRounds ?? 7
      })
    } else if (rc.format === 'ko_bracket') {
      const [s1, s2, s3, s4] = comp.clubIds
      if (s1 && s2 && s3 && s4) {
        fixtures = generateKOBracket(comp.id, year, [s1, s2, s3, s4], {
          semisDate: firstMatchDate
        })
      }
    } else if (rc.format === 'sudamericano_bracket') {
      const [s1, s2, s3, s4] = comp.clubIds
      if (s1 && s2 && s3 && s4) {
        fixtures = generateSudamericanoBracket(comp.id, year, [s1, s2, s3, s4], {
          semisLeg1Date: firstMatchDate
        })
      }
    } else if (rc.format === 'two_leg_playoff') {
      const [a, b] = comp.clubIds
      if (a && b) {
        fixtures = generateTwoLegPlayoff(comp.id, year, [a, b], {
          leg1Date: firstMatchDate
        })
      }
    }
    regionalCompetitions.push(comp)
    regionalMatches.push(...fixtures)
  }

  // 13. Confederaciones: derivadas de countries.confederationId.
  const confederations: Confederation[] = (
    ['rugby_europe', 'oceania_rugby', 'sudamerica_rugby', 'rugby_americas_north', 'rugby_africa', 'asia_rugby'] as const
  ).map((cid) => {
    const members = countries.filter((c) => c.confederationId === cid)
    const comps = regionalCompetitions.filter((c) => c.confederationId === cid)
    const region = members[0]?.region ?? 'europe'
    return {
      id: cid,
      name: cid === 'rugby_europe' ? 'Rugby Europe'
        : cid === 'oceania_rugby' ? 'Oceania Rugby'
        : cid === 'sudamerica_rugby' ? 'Sudamérica Rugby'
        : cid === 'rugby_americas_north' ? 'Rugby Americas North'
        : cid === 'rugby_africa' ? 'Rugby Africa'
        : 'Asia Rugby',
      region,
      memberCountryIds: members.map((c) => c.id),
      competitionIds: comps.map((c) => c.id)
    }
  })

  // 14. Pirámides: resolver shortName → competition.id usando regionalCompetitions.
  const PYRAMID_DEFS = selectPyramids(simulationMode)
  const pyramids: Pyramid[] = PYRAMID_DEFS
    .map((pd: PyramidData) => ({
      id: pd.id,
      name: pd.name,
      confederationId: pd.confederationId,
      gender: pd.gender,
      ageCategory: pd.ageCategory,
      levels: pd.levels
        .filter((lv) => regionalCompetitions.some((c) => c.shortName === lv.competitionShortName))
        .map((lv) => ({
          competitionShortName: lv.competitionShortName,
          promotionSlots: lv.promotionSlots,
          relegationSlots: lv.relegationSlots
        }))
    }))
    .filter((p) => p.levels.length >= 2)   // pirámide útil sólo con ≥2 niveles
  // Ascensos y descensos del sistema argentino y de Chile (sus divisiones son competiciones del mundo).
  pyramids.push(...ARGENTINA_PYRAMIDS)

  const competitions = [...baseCompetitions, ccup.competition, sixNations]
  if (rugbyChampionship) competitions.push(rugbyChampionship)
  if (nationsChampionship) competitions.push(nationsChampionship)
  if (nationsCup) competitions.push(nationsCup)
  competitions.push(womensSixNations)
  if (wxv) competitions.push(wxv)
  if (svnsMen) competitions.push(svnsMen)
  if (svnsWomen) competitions.push(svnsWomen)
  competitions.push(...regionalCompetitions)

  const matches = normalizeMatchDatesForRest([
    ...baseMatches,
    ...ccup.matches,
    ...sixNationsMatches,
    ...rugbyChampionshipMatches,
    ...nationsChampionshipMatches,
    ...nationsCupMatches,
    ...womensSixNationsMatches,
    ...wxvMatches,
    ...svnsMenMatches,
    ...svnsWomenMatches,
    ...regionalMatches
  ])

  const tactics: Record<ID, Tactics> = Object.assign({}, ...builds.map((b) => b.tactics))
  const training: Record<ID, TrainingSchedule> = Object.assign({}, ...builds.map((b) => b.training))
  const boardExpectations: Record<ID, BoardExpectations> = Object.assign({}, ...builds.map((b) => b.boardExpectations))

  // Marcar todos los jugadores demo como masculinos seniors. Cuando se introduzcan
  // plantillas femeninas en Fase C, este pase se especializará por club/competición.
  const playersTagged: Player[] = players.map((p) =>
    p.gender ? p : { ...p, gender: 'men', ageCategory: 'senior' }
  )

  // Bootstrap del World Rugby Ranking M/F con la foto inicial Mayo 2026.
  // Países no listados reciben el default por tier (Tier 1=85, 2=73, 3=55).
  const rankingCountries = countries.map((c) => ({ id: c.id, code: c.code, tier: c.tier }))
  const rankings = {
    men: bootstrapRankingState('men', INITIAL_RANKING_AS_OF, rankingCountries, INITIAL_MEN_RANKING),
    women: bootstrapRankingState('women', INITIAL_RANKING_AS_OF, rankingCountries, INITIAL_WOMEN_RANKING)
  }

  // 15. Ciclos mundialistas (Fase D): RWC 2027 M, WRWC 2025 F, WRWC 2029 F.
  //     Se construyen con slots declarativos y se resuelven contra el world
  //     inicial para llenar las plazas asignadas inmediatamente (previous_rwc
  //     y fixed) sin esperar a la primera ventana de simulación.
  const initialCycles = buildAllQualificationCycles()
  const partialForCycles = {
    countries, competitions, matches, currentDate: '2026-07-01',
    qualificationCycles: initialCycles
  } as unknown as World
  const qualificationCycles: QualificationCycle[] = initialCycles
    .map((c) => resolveSlots(c, partialForCycles))

  return {
    id: newId('wld'), version: '1.1.0',
    engineSchemaVersion: ENGINE_SCHEMA_VERSION,
    currentDate: '2026-07-01', seasonYear: year,
    settings: DEFAULT_SETTINGS,
    countries, competitions,
    clubs, players: playersTagged,
    staff: [],
    contracts, matches,
    calendar,
    tactics, training,
    boardExpectations,
    simulationMode,
    rankings,
    rankingHistory: [],
    confederations,
    pyramids,
    qualificationCycles
  }
}
