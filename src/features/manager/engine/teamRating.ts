// Calcula los TeamRating a partir del XV titular.

import type { ID, Player, RugbyPosition, StarterMap, TechnicalAttrs, MentalAttrs, PhysicalAttrs } from '../types/index.ts'
import { isAvailable } from '../types/index.ts'
import { playersOfClub } from './indexes.ts'
import type { MatchTeam, TeamRating } from './types.ts'
import type { Club } from '../types/index.ts'

/** Selecciona el XV titular: mayor CA disponible y no lesionado, por posición 1-15. */
export function pickStartingXV(squad: Player[]): Player[] {
  const available = squad.filter(isAvailable)
  const starters: Player[] = []
  for (let pos = 1; pos <= 15; pos++) {
    const candidates = available
      .filter((p) => p.primaryPosition === pos)
      .sort((a, b) => b.currentAbility - a.currentAbility)
    if (candidates[0]) starters.push(candidates[0])
  }
  return starters
}

/** Selecciona un banquillo de hasta 8 jugadores disponibles que NO estén en
 *  el XV titular, intentando cubrir los roles típicos de un banco de rugby:
 *  3 forwards de primera línea (1/2/3), 1 lock (4/5), 1 third-row (6/7/8),
 *  1 scrum-half (9), 1 fly-half/centre (10/12/13), 1 back three (11/14/15). */
export function pickAutoBench(squad: Player[], starters: Player[]): Player[] {
  const starterIds = new Set(starters.map((p) => p.id))
  const available = squad.filter((p) => isAvailable(p) && !starterIds.has(p.id))

  const groups: Array<{ positions: RugbyPosition[] }> = [
    { positions: [1] },
    { positions: [2] },
    { positions: [3] },
    { positions: [4, 5] },
    { positions: [6, 7, 8] },
    { positions: [9] },
    { positions: [10, 12, 13] },
    { positions: [11, 14, 15] }
  ]
  const picked: Player[] = []
  const used = new Set<ID>()
  for (const g of groups) {
    const best = available
      .filter((p) => !used.has(p.id) && (
        g.positions.includes(p.primaryPosition as RugbyPosition) ||
        p.secondaryPositions.some((sp) => g.positions.includes(sp as RugbyPosition))
      ))
      .sort((a, b) => b.currentAbility - a.currentAbility)[0]
    if (best) {
      picked.push(best)
      used.add(best.id)
    }
  }
  return picked
}

/** Aplica un StarterMap (mapa posición → playerId) sobre el squad, devolviendo
 *  el XV en orden de posición. Los huecos se rellenan con `pickStartingXV` para
 *  los puestos no asignados. */
function applyStarterOverride(squad: Player[], starterIds: StarterMap): Player[] {
  const playerById = new Map(squad.map((p) => [p.id, p] as const))
  const auto = pickStartingXV(squad)
  const autoByPos = new Map(auto.map((p) => [p.primaryPosition as RugbyPosition, p] as const))
  const result: Player[] = []
  const used = new Set<ID>()
  for (let pos = 1 as RugbyPosition; pos <= 15; pos++) {
    const id = starterIds[pos]
    const chosen = id ? playerById.get(id) : undefined
    if (chosen && !used.has(chosen.id)) {
      result.push(chosen)
      used.add(chosen.id)
    } else {
      const fallback = autoByPos.get(pos)
      if (fallback && !used.has(fallback.id)) {
        result.push(fallback)
        used.add(fallback.id)
      }
    }
  }
  return result
}

type TKey = keyof TechnicalAttrs
type MKey = keyof MentalAttrs
type PKey = keyof PhysicalAttrs

function avgTech(players: Player[], keys: TKey[]): number {
  if (!players.length) return 50
  const sum = players.reduce((s, p) => s + keys.reduce((a, k) => a + p.attributes.technical[k], 0) / keys.length, 0)
  return (sum / players.length) * 5
}
function avgMental(players: Player[], keys: MKey[]): number {
  if (!players.length) return 50
  const sum = players.reduce((s, p) => s + keys.reduce((a, k) => a + p.attributes.mental[k], 0) / keys.length, 0)
  return (sum / players.length) * 5
}
function avgPhys(players: Player[], keys: PKey[]): number {
  if (!players.length) return 50
  const sum = players.reduce((s, p) => s + keys.reduce((a, k) => a + p.attributes.physical[k], 0) / keys.length, 0)
  return (sum / players.length) * 5
}

function isForward(p: Player): boolean { return p.primaryPosition >= 1 && p.primaryPosition <= 8 }
function isBack(p: Player): boolean { return p.primaryPosition >= 9 && p.primaryPosition <= 15 }
function inPositions(p: Player, positions: RugbyPosition[]): boolean {
  return positions.includes(p.primaryPosition as RugbyPosition)
}

/** Aplica la condición física como multiplicador suave (0.75-1.0). */
function conditionMultiplier(starters: Player[]): number {
  if (!starters.length) return 1
  const avg = starters.reduce((s, p) => s + p.condition, 0) / starters.length
  return 0.75 + (avg / 100) * 0.25
}

export function computeTeamRating(starters: Player[]): TeamRating {
  const forwards = starters.filter(isForward)
  const backs = starters.filter(isBack)
  const halfBacks = starters.filter((p) => inPositions(p, [9, 10]))
  const kickers = starters.filter((p) => inPositions(p, [10, 15]))
  const cond = conditionMultiplier(starters)

  const attack = (
    avgTech(starters, ['ballCarry', 'handling', 'passShort']) * 0.4 +
    avgTech(backs, ['passLong']) * 0.2 +
    avgMental(starters, ['decisions', 'vision']) * 0.4
  ) * cond
  const defense = (
    avgTech(starters, ['tackle']) * 0.5 +
    avgMental(starters, ['positioning', 'anticipation']) * 0.3 +
    avgMental(starters, ['workrate']) * 0.2
  ) * cond
  const setPiece = (
    avgTech(forwards, ['scrum', 'lineoutJump', 'maul']) * 0.7 +
    avgTech(starters.filter((p) => p.primaryPosition === 2), ['lineoutThrow']) * 0.3
  ) * cond
  const kicking = (
    avgTech(kickers, ['kickPosts', 'kickPunt', 'kickTactical']) * 0.7 +
    avgTech(halfBacks, ['kickTactical']) * 0.3
  ) * cond
  const power = avgPhys(forwards, ['strength', 'power']) * cond
  const pace = avgPhys(backs, ['pace', 'acceleration']) * cond
  const discipline = avgMental(starters, ['discipline', 'composure'])

  const overall = computeOverall({ attack, defense, setPiece, kicking, power, pace, discipline }, starters)

  return {
    overall,
    attack: clamp(attack, 1, 100),
    defense: clamp(defense, 1, 100),
    setPiece: clamp(setPiece, 1, 100),
    kicking: clamp(kicking, 1, 100),
    power: clamp(power, 1, 100),
    pace: clamp(pace, 1, 100),
    discipline: clamp(discipline, 1, 100)
  }
}

/**
 * Valoración global 1-99 de la plantilla titular (estilo FIFA).
 * Mezcla las sub-valoraciones del XV con un pequeño bonus para los
 * jugadores estrella (top-3 por habilidad), que tiran de los promedios
 * cuando una plantilla tiene cracks puntuales.
 */
function computeOverall(
  parts: { attack: number; defense: number; setPiece: number; kicking: number; power: number; pace: number; discipline: number },
  starters: Player[]
): number {
  if (!starters.length) return 1
  const weighted =
    parts.attack    * 0.22 +
    parts.defense   * 0.22 +
    parts.setPiece  * 0.16 +
    parts.kicking   * 0.10 +
    parts.power     * 0.10 +
    parts.pace      * 0.10 +
    parts.discipline * 0.10

  // Bonus por talento concentrado: los 3 mejores tiran del overall.
  const topThree = [...starters].sort((a, b) => b.currentAbility - a.currentAbility).slice(0, 3)
  const topCA = topThree.reduce((s, p) => s + p.currentAbility, 0) / Math.max(1, topThree.length)
  const starBonus = Math.max(0, (topCA - 130) / 70) * 6 // hasta +6 cuando hay estrellas (CA ~200)

  return clamp(Math.round(weighted + starBonus), 1, 99)
}

/**
 * Valoración 1-99 de un jugador individual. Mapea la Capacidad Actual (1-200)
 * a una escala 1-99 con curva ligera para que los extremos sean raros.
 */
export function computePlayerOverall(player: Player): number {
  const ca = Math.max(1, Math.min(200, player.currentAbility))
  // Mapeo no lineal: CA 100 -> ~58, CA 150 -> ~78, CA 180 -> ~88, CA 200 -> 99.
  const norm = ca / 200
  const curved = Math.pow(norm, 0.85)
  return clamp(Math.round(curved * 99), 1, 99)
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

/**
 * Ajuste de profundidad: penaliza ratings cuando falta un titular real en
 * puestos clave (1, 2, 9, 10, 15). Compara el CA del titular elegido con el
 * mejor del plantel ideal en esa posición (incluyendo lesionados). Si la
 * brecha supera 10 CA, aplica penalizaciones focalizadas — sin 10 baja más
 * el kicking, sin 2 baja más el setPiece, etc.
 *
 * Pensado para reflejar que en rugby una baja en un puesto clave pesa más
 * que en otros, especialmente en planteles menos profundos.
 */
export function depthAdjustment(squad: Player[], starters: Player[], base: TeamRating): TeamRating {
  const KEY_POSITIONS: RugbyPosition[] = [1, 2, 9, 10, 15]
  const DEFICIT_THRESHOLD = 10

  let attack = base.attack
  let defense = base.defense
  let setPiece = base.setPiece
  let kicking = base.kicking
  let power = base.power
  const pace = base.pace
  let discipline = base.discipline

  for (const pos of KEY_POSITIONS) {
    const idealBest = squad
      .filter((p) => p.primaryPosition === pos)
      .reduce((best, p) => p.currentAbility > best ? p.currentAbility : best, 0)
    const actual = starters.find((p) => p.primaryPosition === pos)?.currentAbility ?? 0
    const deficit = idealBest - actual
    if (deficit <= DEFICIT_THRESHOLD) continue

    switch (pos) {
      case 10:
        kicking -= 6; attack -= 3; discipline -= 1
        break
      case 9:
        attack -= 2; discipline -= 1
        break
      case 2:
        setPiece -= 4
        break
      case 1:
        setPiece -= 3; power -= 2
        break
      case 15:
        defense -= 2; kicking -= 2
        break
    }
  }

  const parts = {
    attack: clamp(attack, 1, 100),
    defense: clamp(defense, 1, 100),
    setPiece: clamp(setPiece, 1, 100),
    kicking: clamp(kicking, 1, 100),
    power: clamp(power, 1, 100),
    pace: clamp(pace, 1, 100),
    discipline: clamp(discipline, 1, 100)
  }
  return { ...parts, overall: computeOverall(parts, starters) }
}

/** Opciones para construir un MatchTeam con alineación elegida por el usuario.
 *  Si no se pasan, el motor usa el comportamiento por defecto: mejor disponible
 *  por posición + banquillo automático. */
export interface BuildMatchTeamOpts {
  starterIds?: StarterMap
  benchIds?: ID[]
}

/** Construye un MatchTeam a partir de un club + lista de jugadores que pertenecen al club.
 *  Acepta overrides opcionales de XV y banquillo elegidos por el usuario. */
export function buildMatchTeam(club: Club, allPlayers: Player[], opts: BuildMatchTeamOpts = {}): MatchTeam {
  const squad = playersOfClub(allPlayers, club.id)
  const starters = opts.starterIds
    ? applyStarterOverride(squad, opts.starterIds)
    : pickStartingXV(squad)
  let bench: Player[]
  if (opts.benchIds && opts.benchIds.length > 0) {
    const starterIds = new Set(starters.map((p) => p.id))
    const playerById = new Map(squad.map((p) => [p.id, p] as const))
    bench = opts.benchIds
      .map((id) => playerById.get(id))
      .filter((p): p is Player => !!p && !starterIds.has(p.id))
      .slice(0, 8)
  } else {
    bench = pickAutoBench(squad, starters)
  }
  const baseRating = computeTeamRating(starters)
  return {
    clubId: club.id,
    clubName: club.name,
    shortName: club.shortName,
    rating: depthAdjustment(squad, starters, baseRating),
    starters,
    bench
  }
}
