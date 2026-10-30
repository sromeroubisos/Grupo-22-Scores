// Resuelve un `QualificationCycle` a medida que las competencias regionales
// terminan. La lógica es declarativa: cada slot tiene una `source` y el
// pathfinder consulta las standings o las pre-tablas (RWC 2023, fixed) para
// llenar `assignedCountryId`.
//
// Se invoca desde `season.simulateMatches` tras cada batch; los slots ya
// resueltos se saltan, así que múltiples llamadas son cheap & idempotent.

import type { ID, World, QualificationCycle, QualificationSlot } from '../types/index.ts'
import { computeStandings } from './standings.ts'
import { RWC_2023_TOP_TWELVE } from '../data/rwc2023.ts'

/** True si la competición existe y todos sus partidos están jugados. */
function isCompetitionFinished(world: World, shortName: string): boolean {
  const comp = world.competitions.find((c) => c.shortName === shortName)
  if (!comp) return false
  const matches = world.matches.filter((m) => m.competitionId === comp.id)
  if (matches.length === 0) return false
  return matches.every((m) => m.played)
}

/** Country.id por código ISO-3. */
function findCountryIdByCode(world: World, code: string): ID | null {
  return world.countries.find((c) => c.code === code)?.id ?? null
}

/** True si una selección ya tiene plaza asegurada en el ciclo. */
function isAlreadyQualified(cycle: QualificationCycle, countryId: ID): boolean {
  return cycle.slots.some((s) => s.assignedCountryId === countryId)
}

/** Resuelve un slot único contra el estado del world.
 *  Devuelve el slot actualizado (mismo objeto si nada cambió). */
function resolveSlot(
  slot: QualificationSlot,
  cycle: QualificationCycle,
  world: World
): QualificationSlot {
  if (slot.assignedCountryId) return slot
  // Alias local para que TypeScript narrowee la unión discriminada.
  const src = slot.source

  if (src.kind === 'fixed') {
    const countryId = findCountryIdByCode(world, src.countryCode)
    if (!countryId) return slot
    return { ...slot, assignedCountryId: countryId, outcome: 'qualified' }
  }

  if (src.kind === 'previous_rwc') {
    // Sólo soportamos RWC 2023 por ahora; cuando WR publique 2027 se añade aquí.
    if (src.rwcEdition !== 2023) return slot
    // El label de los slots `previous_rwc` tiene formato
    // "RWC 2023 Pool {X} - {N}º ({CODE})". Extraemos el code para resolver.
    const match = /\(([A-Z]{3})\)$/.exec(slot.label)
    if (match) {
      const code = match[1]
      const id = findCountryIdByCode(world, code)
      if (id) return { ...slot, assignedCountryId: id, outcome: 'qualified' }
    }
    // Fallback: buscar la primera entrada con esa position.
    const entry = RWC_2023_TOP_TWELVE.find((e) => e.position === src.minPosition)
    if (entry) {
      const id = findCountryIdByCode(world, entry.countryCode)
      if (id) return { ...slot, assignedCountryId: id, outcome: 'qualified' }
    }
    return slot
  }

  if (src.kind === 'competition_winner') {
    const shortName = src.competitionShortName
    if (!isCompetitionFinished(world, shortName)) return slot
    const comp = world.competitions.find((c) => c.shortName === shortName)
    if (!comp) return slot
    const standings = computeStandings(comp.id, world)
    // Filtrar selecciones que ya están clasificadas en este ciclo: el
    // "Pacífico 3" debe saltar a FIJ/JPN si ya están dentro vía RWC 2023.
    const eligible = standings.filter((s) => !isAlreadyQualified(cycle, s.clubId))
    const target = eligible[src.position - 1]
    if (!target) return slot
    return { ...slot, assignedCountryId: target.clubId, outcome: 'qualified' }
  }

  if (src.kind === 'playoff_winner') {
    const pl = cycle.playoffs.find((p) => p.id === src.playoffId)
    if (!pl || !pl.winnerCountryId) return slot
    return { ...slot, assignedCountryId: pl.winnerCountryId, outcome: 'qualified' }
  }

  if (src.kind === 'fqt_position') {
    // FQT no se siembra en Fase D; queda pendiente hasta que exista una
    // competition de formato regional_pool con shortName 'FQT'.
    const fqt = world.competitions.find((c) => c.shortName === 'FQT')
    if (!fqt) return slot
    const matches = world.matches.filter((m) => m.competitionId === fqt.id)
    if (matches.length === 0 || matches.some((m) => !m.played)) return slot
    const standings = computeStandings(fqt.id, world)
    const target = standings[src.position - 1]
    if (!target) return slot
    return { ...slot, assignedCountryId: target.clubId, outcome: 'qualified' }
  }

  return slot
}

/** Recorre todos los slots del ciclo intentando resolverlos. Cheap si no hay
 *  cambios. Devuelve el ciclo con slots actualizados y completedAt si todos
 *  los slots quedaron resueltos. */
export function resolveSlots(cycle: QualificationCycle, world: World): QualificationCycle {
  const newSlots = cycle.slots.map((s) => resolveSlot(s, cycle, world))
  // Re-iterar UN ciclo más: porque resolver A puede liberar B (skip-already-
  // qualified en PNC tras resolver previous_rwc, por ejemplo).
  const intermediate: QualificationCycle = { ...cycle, slots: newSlots }
  const finalSlots = intermediate.slots.map((s) => resolveSlot(s, intermediate, world))
  const allResolved = finalSlots.every((s) => s.outcome === 'qualified')
  return {
    ...cycle,
    slots: finalSlots,
    completedAt: allResolved && !cycle.completedAt ? world.currentDate : cycle.completedAt
  }
}

/** True si el ciclo está completo (todos los slots resueltos). */
export function isCycleComplete(cycle: QualificationCycle): boolean {
  return cycle.slots.every((s) => s.outcome === 'qualified')
}

/** Aplica resolveSlots a todos los ciclos del world. Devuelve el nuevo array
 *  de ciclos (referencia distinta si algo cambió). */
export function resolveAllCycles(world: World): QualificationCycle[] | undefined {
  if (!world.qualificationCycles) return world.qualificationCycles
  let anyChanged = false
  const next = world.qualificationCycles.map((c) => {
    const resolved = resolveSlots(c, world)
    if (resolved !== c) anyChanged = true
    return resolved
  })
  return anyChanged ? next : world.qualificationCycles
}
