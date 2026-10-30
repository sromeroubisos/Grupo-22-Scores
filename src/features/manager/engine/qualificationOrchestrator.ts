// Orquestador del ciclo RWC 2027: cuando las competencias clasificatorias
// regionales terminan, MATERIALIZA en el world las competencias dependientes
// (play-off cruzado SAR-Pacífico y Final Qualification Tournament en Dubái).
//
// Sin esto, los slots `playoff_winner` y `fqt_position` del ciclo RWC 2027
// quedan pendientes para siempre porque sus inputs no existen aún en el
// world. Este módulo cierra el ciclo end-to-end.
//
// Diseño: hardcoded para RWC 2027 M ya que es el único ciclo que requiere
// playoff + FQT. Cuando WR publique RWC 2031 o WRWC 2029 con su propia
// estructura, se replicará el patrón (cada ciclo aporta su orquestador).

import type { ID, World, Competition, Match, QualificationCycle } from '../types/index.ts'
import { newId } from '../utils/id.ts'
import { computeStandings } from './standings.ts'
import { generateTwoLegPlayoff, generateRegionalPool } from './regionalFixtures.ts'

/** Selecciones que ya están clasificadas en el ciclo (incluye previous_rwc,
 *  competition_winner ya resuelto, fixed). Sirve para filtrar "elegibles". */
function qualifiedCountryIds(cycle: QualificationCycle): Set<ID> {
  return new Set(cycle.slots
    .filter((s) => s.assignedCountryId)
    .map((s) => s.assignedCountryId!))
}

function isCompetitionFinished(world: World, shortName: string): boolean {
  const comp = world.competitions.find((c) => c.shortName === shortName)
  if (!comp) return false
  const matches = world.matches.filter((m) => m.competitionId === comp.id)
  if (matches.length === 0) return false
  return matches.every((m) => m.played)
}

/** Devuelve el clubId en la posición `position` (1-indexed) de la competition
 *  con shortName, filtrando opcionalmente a no-clasificados-en-el-ciclo. */
function nthInStandings(
  world: World,
  shortName: string,
  position: number,
  cycle: QualificationCycle,
  excludeQualified = false
): ID | null {
  const comp = world.competitions.find((c) => c.shortName === shortName)
  if (!comp) return null
  const standings = computeStandings(comp.id, world)
  const qualified = qualifiedCountryIds(cycle)
  const filtered = excludeQualified
    ? standings.filter((s) => !qualified.has(s.clubId))
    : standings
  return filtered[position - 1]?.clubId ?? null
}

/** Crea la competición de play-off SAR-Pacífico (two_leg_playoff) si las
 *  competencias source (SAR_CH, PNC) están terminadas y la competición aún
 *  no existe. Devuelve world actualizado y cycle con playoff.competitionId. */
function materializeSARPacificPlayoff(world: World, cycle: QualificationCycle): {
  world: World; cycle: QualificationCycle
} {
  const playoff = cycle.playoffs.find((p) => p.id === 'sar_pac_playoff_rwc27')
  if (!playoff) return { world, cycle }
  if (playoff.competitionId) return { world, cycle }    // ya existe
  if (!isCompetitionFinished(world, 'SAR_CH')) return { world, cycle }
  if (!isCompetitionFinished(world, 'PNC')) return { world, cycle }

  const sarRunnerUp = nthInStandings(world, 'SAR_CH', 2, cycle, true)
  const pncFourthEligible = nthInStandings(world, 'PNC', 4, cycle, true)
  if (!sarRunnerUp || !pncFourthEligible) return { world, cycle }

  // Crear competition. Fecha: ~Octubre del año en que termina PNC (PNC suele
  // terminar en Sep). Usamos un anchor relativo al currentDate del world.
  const leg1Date = world.currentDate
  const comp: Competition = {
    id: newId('comp_pop'),
    name: 'Play-off Sudamérica vs Pacífico (RWC 2027)',
    shortName: 'POPLY_SP',
    countryId: null,
    format: 'two_leg_playoff',
    tier: 0,
    rules: {
      pointsForWin: 4, pointsForDraw: 2, pointsForLoss: 0,
      tryBonus: false, losingBonus: false,
      hasPlayoff: false, playoffTeams: 0,
      promotion: 0, relegation: 0
    },
    clubIds: [sarRunnerUp, pncFourthEligible],
    gender: 'men',
    ageCategory: 'senior',
    discipline: 'xv'
  }
  const fixtures = generateTwoLegPlayoff(comp.id, world.seasonYear, [sarRunnerUp, pncFourthEligible], {
    leg1Date
  })

  const updatedCycle: QualificationCycle = {
    ...cycle,
    playoffs: cycle.playoffs.map((p) => p.id === playoff.id
      ? { ...p, competitionId: comp.id }
      : p)
  }
  return {
    world: {
      ...world,
      competitions: [...world.competitions, comp],
      matches: [...world.matches, ...fixtures]
    },
    cycle: updatedCycle
  }
}

/** Tras los dos partidos del play-off, calcula agregado y asigna el ganador
 *  a `playoff.winnerCountryId` (y el perdedor a `loserCountryId`). */
function resolvePlayoffOutcome(world: World, cycle: QualificationCycle): QualificationCycle {
  let updated = cycle
  for (const playoff of cycle.playoffs) {
    if (playoff.winnerCountryId || !playoff.competitionId) continue
    const matches = world.matches.filter((m) => m.competitionId === playoff.competitionId)
    if (matches.length !== 2) continue
    if (matches.some((m) => !m.played || !m.result)) continue

    // Agregado: sumar tantos a favor por equipo a través de los 2 legs.
    const tally = new Map<ID, number>()
    for (const m of matches) {
      const r = m.result!
      tally.set(m.homeClubId, (tally.get(m.homeClubId) ?? 0) + r.homeScore)
      tally.set(m.awayClubId, (tally.get(m.awayClubId) ?? 0) + r.awayScore)
    }
    const [a, b] = matches[0].homeClubId === matches[1].awayClubId
      ? [matches[0].homeClubId, matches[0].awayClubId]
      : [matches[0].awayClubId, matches[0].homeClubId]
    const aTotal = tally.get(a) ?? 0
    const bTotal = tally.get(b) ?? 0
    const winner = aTotal === bTotal
      // Empate agregado: ganador por ensayos a favor; si persiste, primer
      // partido como tiebreaker. Para simplicidad usamos el home del leg 2
      // (regla "away goals" del rugby es discutible; usamos visitante en leg 2).
      ? (matches[1].result!.awayScore > matches[1].result!.homeScore ? matches[1].awayClubId : matches[1].homeClubId)
      : (aTotal > bTotal ? a : b)
    const loser = winner === a ? b : a
    updated = {
      ...updated,
      playoffs: updated.playoffs.map((p) => p.id === playoff.id
        ? { ...p, winnerCountryId: winner, loserCountryId: loser }
        : p)
    }
  }
  return updated
}

/** Crea el Final Qualification Tournament (FQT) en Dubái cuando todas las
 *  competencias proveedoras están terminadas. Inputs RWC 2027 M:
 *    - SAR_CH 3º (3er Sudamericano)
 *    - REC 5º (5to Rugby Europe Championship)
 *    - AFR_CUP 2º (subcampeón Africa Cup)
 *    - ASI_CH 2º (subcampeón Asia Championship)
 *  Más el perdedor del play-off SAR-Pacífico (que añade un 5º team — pero
 *  el FQT histórico es de 4 equipos en Dubái 2025, lo mantenemos así). */
function materializeFQT(world: World, cycle: QualificationCycle): {
  world: World; cycle: QualificationCycle
} {
  // Ya creado
  if (world.competitions.some((c) => c.shortName === 'FQT')) return { world, cycle }
  // Requiere TODAS las competencias source terminadas
  if (!isCompetitionFinished(world, 'SAR_CH')) return { world, cycle }
  if (!isCompetitionFinished(world, 'REC')) return { world, cycle }
  if (!isCompetitionFinished(world, 'AFR_CUP')) return { world, cycle }
  if (!isCompetitionFinished(world, 'ASI_CH')) return { world, cycle }

  const sar3 = nthInStandings(world, 'SAR_CH', 3, cycle, true)
  const rec5 = nthInStandings(world, 'REC', 5, cycle, true)
  const afr2 = nthInStandings(world, 'AFR_CUP', 2, cycle, true)
  const asi2 = nthInStandings(world, 'ASI_CH', 2, cycle, true)
  if (!sar3 || !rec5 || !afr2 || !asi2) return { world, cycle }

  const participants: ID[] = [sar3, rec5, afr2, asi2]
  const comp: Competition = {
    id: newId('comp_fqt'),
    name: 'Final Qualification Tournament (RWC 2027)',
    shortName: 'FQT',
    countryId: null,
    format: 'regional_pool',
    tier: 0,
    rules: {
      pointsForWin: 4, pointsForDraw: 2, pointsForLoss: 0,
      tryBonus: true, losingBonus: true,
      hasPlayoff: false, playoffTeams: 0,
      promotion: 0, relegation: 0
    },
    clubIds: participants,
    gender: 'men',
    ageCategory: 'senior',
    discipline: 'xv'
  }
  // FQT se juega en sede neutral en Dubái (noviembre). Anchor: currentDate + ~30d.
  const fixtures = generateRegionalPool(comp.id, world.seasonYear, participants, {
    firstMatchDate: world.currentDate,
    daysBetweenRounds: 7
  })

  return {
    world: {
      ...world,
      competitions: [...world.competitions, comp],
      matches: [...world.matches, ...fixtures]
    },
    cycle
  }
}

/** Punto de entrada principal: por cada ciclo del world, intenta materializar
 *  sus play-offs y FQT si los inputs están listos, y resuelve outcomes de
 *  play-offs ya jugados. Idempotente: si nada cambió, devuelve el world tal cual. */
export function orchestrateQualifications(world: World): World {
  if (!world.qualificationCycles || world.qualificationCycles.length === 0) return world
  let currentWorld = world
  const newCycles: QualificationCycle[] = []
  let anyChanged = false

  const cycles = currentWorld.qualificationCycles ?? []
  for (const cycle of cycles) {
    // Sólo orquestamos RWC 2027 M por ahora (las otras no tienen playoff/FQT).
    if (!(cycle.targetEvent === 'RWC' && cycle.edition === 2027 && cycle.gender === 'men')) {
      newCycles.push(cycle)
      continue
    }
    let currentCycle = cycle
    // 1. Crear play-off si inputs listos.
    const afterPlayoffCreate = materializeSARPacificPlayoff(currentWorld, currentCycle)
    if (afterPlayoffCreate.world !== currentWorld || afterPlayoffCreate.cycle !== currentCycle) {
      anyChanged = true
      currentWorld = afterPlayoffCreate.world
      currentCycle = afterPlayoffCreate.cycle
    }
    // 2. Resolver outcome del play-off si los dos legs están jugados.
    const cycleAfterPlayoff = resolvePlayoffOutcome(currentWorld, currentCycle)
    if (cycleAfterPlayoff !== currentCycle) {
      anyChanged = true
      currentCycle = cycleAfterPlayoff
    }
    // 3. Crear FQT si todos los inputs listos.
    const afterFQTCreate = materializeFQT(currentWorld, currentCycle)
    if (afterFQTCreate.world !== currentWorld) {
      anyChanged = true
      currentWorld = afterFQTCreate.world
      currentCycle = afterFQTCreate.cycle
    }
    newCycles.push(currentCycle)
  }

  if (!anyChanged) return world
  return { ...currentWorld, qualificationCycles: newCycles }
}
