import { random } from '../utils/entropy.ts'
// Efectos semanales: aplicar fatiga/recuperación, generar lesiones, progresar atributos.
// Se invocan desde season.ts tras simular una jornada.

import type { World, Player, ID, InjuryType, TrainingSchedule } from '../types/index.ts'
import type { Match } from '../types/index.ts'
import { ageFromDOB } from '../utils/date.ts'
import { playersOfClub } from './indexes.ts'

const INJURY_BODY_PARTS: Record<InjuryType, string[]> = {
  muscle: ['isquio', 'aductor', 'gemelo', 'cuádriceps'],
  joint: ['rodilla', 'hombro', 'tobillo', 'muñeca'],
  concussion: ['cabeza'],
  fracture: ['nariz', 'costilla', 'pómulo', 'dedo'],
  ligament: ['rodilla', 'tobillo', 'hombro'],
  bruise: ['muslo', 'costado', 'pecho']
}

const INJURY_WEIGHTS: Array<[InjuryType, number]> = [
  ['bruise', 0.35],
  ['muscle', 0.30],
  ['joint', 0.15],
  ['concussion', 0.10],
  ['ligament', 0.06],
  ['fracture', 0.04]
]

const INJURY_WEEKS: Record<InjuryType, [number, number]> = {
  bruise: [1, 2],
  muscle: [2, 5],
  joint: [2, 6],
  concussion: [2, 4],
  ligament: [8, 20],
  fracture: [4, 12]
}

function pickInjuryType(): InjuryType {
  const r = random()
  let acc = 0
  for (const [t, w] of INJURY_WEIGHTS) {
    acc += w
    if (r < acc) return t
  }
  return 'bruise'
}

export interface WeeklyEvent {
  type: 'injury' | 'progression'
  playerId: ID
  text: string
}

export interface WeeklyReport {
  events: WeeklyEvent[]
  injuriesThisRound: number
  progressionsThisRound: number
}

/**
 * Aplica los efectos de una jornada simulada sobre todos los jugadores.
 * - Los que jugaron pierden condición y arriesgan lesión.
 * - El resto recupera condición.
 * - Todos progresan en atributos según el plan de entrenamiento de su club.
 * - Las lesiones existentes decrementan weeksOut; si llegan a 0, se eliminan.
 *
 * Devuelve un World nuevo (inmutable) y un reporte de los eventos generados.
 */
export function applyWeeklyEffects(
  world: World,
  playedMatches: Match[],
  currentDate: string
): { world: World; report: WeeklyReport } {
  const playedClubIds = new Set<ID>()
  playedMatches.forEach((m) => {
    playedClubIds.add(m.homeClubId)
    playedClubIds.add(m.awayClubId)
  })

  // Determinar XV que jugó por club (mismo cálculo que el motor)
  const clubsToProcess = world.clubs.filter((c) => playedClubIds.has(c.id))
  const startersByClub = new Map<ID, Set<ID>>()
  for (const club of clubsToProcess) {
    const squad = playersOfClub(world.players, club.id).filter((p) => !p.injury || p.injury.weeksOut <= 0)
    const xv = new Set<ID>()
    for (let pos = 1; pos <= 15; pos++) {
      const cand = squad
        .filter((p) => p.primaryPosition === pos)
        .sort((a, b) => b.currentAbility - a.currentAbility)[0]
      if (cand) xv.add(cand.id)
    }
    startersByClub.set(club.id, xv)
  }

  const events: WeeklyEvent[] = []
  let injuriesCount = 0
  let progressionsCount = 0

  const newPlayers = world.players.map((p) => {
    // Copy-on-write: de 17.000 jugadores, casi todos descansan al 100 % y no cambian; copiarlos
    // a todos por cada jornada era la mitad del costo (y de la basura que recoge el GC).
    let player = p
    const own = () => { if (player === p) player = { ...p } }
    const playedInRound = p.clubId
      ? (startersByClub.get(p.clubId)?.has(p.id) ?? false)
      : false

    // 1. Condición: bajar si jugó, subir si descansó
    if (playedInRound) {
      const fatigueResistance = p.attributes.physical.stamina / 20
      const drop = Math.round(12 + (1 - fatigueResistance) * 10) // 12-22
      own()
      player.condition = Math.max(20, player.condition - drop)
    } else if (player.condition < 100) {
      own()
      player.condition = Math.min(100, player.condition + 15)
    }

    // 2. Lesiones: solo para los que jugaron
    if (playedInRound && (!player.injury || player.injury.weeksOut <= 0)) {
      const propensity = p.attributes.physical.injuryProneness / 20
      const baseRate = 0.05 // 5% de probabilidad base
      const rate = baseRate * (0.6 + propensity * 0.8) // entre 3% y 9%
      if (random() < rate) {
        const type = pickInjuryType()
        const partList = INJURY_BODY_PARTS[type]
        const bodyPart = partList[Math.floor(random() * partList.length)]
        const [minW, maxW] = INJURY_WEEKS[type]
        const weeksOut = minW + Math.floor(random() * (maxW - minW + 1))
        own()
        player.injury = { type, bodyPart, weeksOut, reportedDate: currentDate }
        const club = world.clubs.find((c) => c.id === p.clubId)
        events.push({
          type: 'injury', playerId: p.id,
          text: `${p.firstName} ${p.lastName} (${club?.shortName ?? '?'}): ${describeInjury(type, bodyPart, weeksOut)}`
        })
        injuriesCount++
      }
    }

    // 3. Recuperación de lesión activa
    if (player.injury && player.injury.weeksOut > 0) {
      own()
      player.injury = { ...player.injury!, weeksOut: player.injury!.weeksOut - 1 }
      if (player.injury.weeksOut <= 0) {
        events.push({
          type: 'progression', playerId: p.id,
          text: `${p.firstName} ${p.lastName}: recuperado de su lesión y disponible.`
        })
        player.injury = null
      }
    }

    // 4. Progresión semanal de atributos según plan de entrenamiento del club
    if (p.clubId && (!player.injury || player.injury.weeksOut <= 0)) {
      const training = world.training[p.clubId]
      if (training) {
        const prog = maybeProgressAttribute(player, ageFromDOB(p.dateOfBirth, currentDate), training)
        if (prog) {
          player = prog.player
          events.push({
            type: 'progression', playerId: p.id,
            text: `${p.firstName} ${p.lastName}: ${prog.attrLabel} +1`
          })
          progressionsCount++
        }
      }
    }

    return player
  })

  return {
    world: { ...world, players: newPlayers },
    report: { events, injuriesThisRound: injuriesCount, progressionsThisRound: progressionsCount }
  }
}

function describeInjury(type: InjuryType, bodyPart: string, weeks: number): string {
  const typeNames: Record<InjuryType, string> = {
    muscle: 'lesión muscular',
    joint: 'lesión articular',
    concussion: 'conmoción cerebral',
    fracture: 'fractura',
    ligament: 'lesión de ligamentos',
    bruise: 'contusión'
  }
  const semanas = weeks === 1 ? '1 semana' : `${weeks} semanas`
  return `${typeNames[type]} de ${bodyPart}, baja ${semanas}`
}

const TECH_ATTRS = [
  'tackle', 'handling', 'passShort', 'passLong', 'kickPosts', 'kickTactical',
  'kickPunt', 'ballCarry', 'ruckSupport', 'ruckClean', 'jackal', 'scrum',
  'lineoutJump', 'lineoutThrow', 'maul', 'aerial'
] as const
const MENTAL_ATTRS = [
  'decisions', 'vision', 'anticipation', 'discipline', 'teamwork',
  'concentration', 'determination', 'composure', 'workrate', 'positioning', 'initiative'
] as const
const PHYS_ATTRS = [
  'pace', 'acceleration', 'agility', 'strength', 'power', 'stamina',
  'jumping', 'balance', 'recovery'
] as const

const ATTR_LABELS: Record<string, string> = {
  tackle: 'Placaje', handling: 'Manos', passShort: 'Pase corto', passLong: 'Pase largo',
  kickPosts: 'Patada palos', kickTactical: 'Patada táctica', kickPunt: 'Despeje',
  ballCarry: 'Carrera', ruckSupport: 'Apoyo ruck', ruckClean: 'Limpieza ruck',
  jackal: 'Robo', scrum: 'Melé', lineoutJump: 'Salto touch', lineoutThrow: 'Lanz. touch',
  maul: 'Maul', aerial: 'Aéreo',
  decisions: 'Decisiones', vision: 'Visión', anticipation: 'Anticipación',
  discipline: 'Disciplina', teamwork: 'Trabajo equipo', concentration: 'Concentración',
  determination: 'Determinación', composure: 'Compostura', workrate: 'Trabajo sucio',
  positioning: 'Posicionamiento', initiative: 'Iniciativa',
  pace: 'Velocidad', acceleration: 'Aceleración', agility: 'Agilidad',
  strength: 'Fuerza', power: 'Potencia', stamina: 'Resistencia',
  jumping: 'Salto', balance: 'Equilibrio', recovery: 'Recuperación'
}

/**
 * Devuelve player nuevo con un atributo bumpeado +1, o null si no progresó esta semana.
 * Probabilidad depende de edad, profesionalismo, distancia al PA, y plan de entrenamiento.
 */
function maybeProgressAttribute(
  player: Player,
  age: number,
  training: TrainingSchedule
): { player: Player; attrLabel: string } | null {
  // Factor base por edad: pico de aprendizaje a los 18-22; decae después
  const ageFactor = age < 23 ? 1.0 : age < 28 ? 0.7 : age < 32 ? 0.4 : 0.15
  // Factor por proximidad al potencial: si ya estás cerca del PA, casi no creces
  const room = Math.max(0, (player.potentialAbility - player.currentAbility) / 100)
  // Factor por profesionalismo
  const prof = player.attributes.hidden.professionalism / 20

  const baseProb = 0.06 * ageFactor * (0.3 + room) * (0.5 + prof * 0.5)
  if (random() > baseProb) return null

  // Categorías ponderadas por plan de entrenamiento
  const total = training.physical + training.technical + training.tactical + training.recovery
  if (total === 0) return null
  const r = random() * total
  let bucket: 'technical' | 'mental' | 'physical'
  if (r < training.technical) bucket = 'technical'
  else if (r < training.technical + training.tactical) bucket = 'mental'
  else if (r < training.technical + training.tactical + training.physical) bucket = 'physical'
  else return null // categoría "recovery" no progresa atributos

  const pool =
    bucket === 'technical' ? TECH_ATTRS :
    bucket === 'mental' ? MENTAL_ATTRS :
    PHYS_ATTRS
  const attr = pool[Math.floor(random() * pool.length)]
  const subAttrs = player.attributes[bucket] as unknown as Record<string, number>
  const currentValue = subAttrs[attr]
  if (currentValue >= 20) return null

  const newSub = { ...subAttrs, [attr]: currentValue + 1 }
  const newAttrs = { ...player.attributes, [bucket]: newSub }
  const newCA = Math.min(player.potentialAbility, player.currentAbility + 1)
  return {
    player: { ...player, attributes: newAttrs, currentAbility: newCA },
    attrLabel: ATTR_LABELS[attr] ?? attr
  }
}
