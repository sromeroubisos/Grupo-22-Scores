// Capa de "valoraciones rugby" 0-99 derivadas de los atributos 1-20 existentes.
// No reemplaza Player.attributes — es una capa de presentación/scouting.
//
// Fórmula de generación de regen (para uso futuro, no invocada aquí):
//   z = (R - 50) / 15
//   A = clip(45 + b + 12·λ·z + δ + ε, 0, 99)
//   con b ∈ {+8, 0, -8} y λ ∈ {1.0, 0.7, 0.4} para tier P/S/T.

import type { Player, PositionGroup, RugbyPosition } from '../types/index.ts'
import { POSITION_GROUP } from '../types/index.ts'

// ============== TIPOS ==============

export interface RugbyAttrs {
  // 10 universales (0-99)
  decisions: number
  tackle: number
  breakdown: number
  pass: number
  handKick: number
  carry: number
  handling: number
  pace: number
  stamina: number
  discipline: number
  // 4 especialistas (0-99)
  scrum: number
  lineout: number
  placeKick: number
  aerial: number
}

export type RugbyAttrKey = keyof RugbyAttrs
export type Tier = 'P' | 'S' | 'T'

export interface UnitIndices {
  scrum: number
  lineout: number
  breakdown: number
  kicking: number
  backfield: number
  discipline: number
  /** true si faltan titulares al computar. */
  incomplete: boolean
}

// ============== ETIQUETAS ==============

export const RUGBY_ATTR_LABELS: Record<RugbyAttrKey, string> = {
  decisions: 'Decisiones',
  tackle: 'Placaje',
  breakdown: 'Breakdown',
  pass: 'Pase',
  handKick: 'Patada de mano',
  carry: 'Carry / Contacto',
  handling: 'Manejo',
  pace: 'Velocidad',
  stamina: 'Resistencia',
  discipline: 'Disciplina',
  scrum: 'Scrum',
  lineout: 'Touch',
  placeKick: 'Patada a palos',
  aerial: 'Juego aéreo'
}

export const RUGBY_ATTR_SHORT: Record<RugbyAttrKey, string> = {
  decisions: 'DEC',
  tackle: 'PLA',
  breakdown: 'BRK',
  pass: 'PAS',
  handKick: 'PAT',
  carry: 'CAR',
  handling: 'MAN',
  pace: 'VEL',
  stamina: 'RES',
  discipline: 'DIS',
  scrum: 'SCR',
  lineout: 'TCH',
  placeKick: 'PPL',
  aerial: 'AER'
}

export const CORE_ATTR_KEYS: RugbyAttrKey[] = [
  'decisions', 'tackle', 'breakdown', 'pass', 'handKick',
  'carry', 'handling', 'pace', 'stamina', 'discipline'
]

export const SPECIALIST_ATTR_KEYS: RugbyAttrKey[] = [
  'scrum', 'lineout', 'placeKick', 'aerial'
]

// ============== MATRIZ DE TIER P/S/T ==============

export const POSITION_TIER_MATRIX: Record<PositionGroup, Record<RugbyAttrKey, Tier>> = {
  front_row: {
    decisions: 'S', tackle: 'P', breakdown: 'P', pass: 'T', handKick: 'T',
    carry: 'P', handling: 'S', pace: 'T', stamina: 'S', discipline: 'P',
    scrum: 'P', lineout: 'S', placeKick: 'T', aerial: 'T'
  },
  second_row: {
    decisions: 'S', tackle: 'P', breakdown: 'P', pass: 'T', handKick: 'T',
    carry: 'P', handling: 'S', pace: 'T', stamina: 'S', discipline: 'S',
    scrum: 'S', lineout: 'P', placeKick: 'T', aerial: 'S'
  },
  back_row: {
    decisions: 'P', tackle: 'P', breakdown: 'P', pass: 'S', handKick: 'T',
    carry: 'P', handling: 'S', pace: 'S', stamina: 'P', discipline: 'S',
    scrum: 'S', lineout: 'S', placeKick: 'T', aerial: 'S'
  },
  half_back: {
    decisions: 'P', tackle: 'S', breakdown: 'S', pass: 'P', handKick: 'P',
    carry: 'S', handling: 'P', pace: 'S', stamina: 'P', discipline: 'S',
    scrum: 'T', lineout: 'T', placeKick: 'T', aerial: 'T'
  },
  centre: {
    decisions: 'P', tackle: 'S', breakdown: 'S', pass: 'P', handKick: 'P',
    carry: 'S', handling: 'P', pace: 'S', stamina: 'S', discipline: 'S',
    scrum: 'T', lineout: 'T', placeKick: 'S', aerial: 'S'
  },
  back_three: {
    decisions: 'S', tackle: 'S', breakdown: 'T', pass: 'S', handKick: 'S',
    carry: 'S', handling: 'P', pace: 'P', stamina: 'S', discipline: 'S',
    scrum: 'T', lineout: 'T', placeKick: 'S', aerial: 'P'
  }
}

export function tierFor(group: PositionGroup, attr: RugbyAttrKey): Tier {
  return POSITION_TIER_MATRIX[group][attr]
}

/** Devuelve los 10 atributos núcleo ordenados por tier (P → S → T) para esa posición. */
export function coreAttrsOrdered(group: PositionGroup): RugbyAttrKey[] {
  const tiers = POSITION_TIER_MATRIX[group]
  const score: Record<Tier, number> = { P: 0, S: 1, T: 2 }
  return [...CORE_ATTR_KEYS].sort((a, b) => score[tiers[a]] - score[tiers[b]])
}

/** Atributo "especialista" dominante para una posición (para la columna dinámica del Squad). */
export function dominantSpecialist(pos: RugbyPosition): RugbyAttrKey {
  const group = POSITION_GROUP[pos]
  if (group === 'front_row' || group === 'second_row' || group === 'back_row') return 'scrum'
  if (group === 'back_three') return 'pace'
  if (group === 'centre') return 'pass'
  // half_back: 9 → pase, 10 → patada de mano
  if (pos === 10) return 'handKick'
  return 'pass'
}

// ============== COMPOSITES 1-20 → 0-99 ==============

export function computeRugbyAttrs(player: Player): RugbyAttrs {
  const t = player.attributes.technical
  const m = player.attributes.mental
  const p = player.attributes.physical
  const pos = player.primaryPosition as RugbyPosition

  // 10 universales
  const decisions = c((m.decisions * 0.6 + m.vision * 0.4) * 5)
  const tackle = c((t.tackle * 0.7 + m.positioning * 0.3) * 5)
  const breakdown = c((t.ruckSupport * 0.35 + t.ruckClean * 0.35 + t.jackal * 0.3) * 5)
  const pass = c((t.passShort * 0.6 + t.passLong * 0.4) * 5)
  const handKick = c((t.kickTactical * 0.6 + t.kickPunt * 0.4) * 5)
  const carry = c((t.ballCarry * 0.5 + p.strength * 0.25 + p.power * 0.25) * 5)
  const handling = c((t.handling * 0.7 + p.balance * 0.3) * 5)
  const pace = c((p.pace * 0.5 + p.acceleration * 0.5) * 5)
  const stamina = c((p.stamina * 0.7 + p.recovery * 0.3) * 5)
  const discipline = c((m.discipline * 0.7 + m.composure * 0.3) * 5)

  // Especialistas
  const scrum = c((t.scrum * 0.6 + t.maul * 0.25 + p.strength * 0.15) * 5)
  const lineout = computeLineoutFor(pos, t, p)
  const placeKick = c((t.kickPosts * 0.8 + m.composure * 0.2) * 5)
  const aerial = c((t.aerial * 0.6 + p.jumping * 0.25 + m.positioning * 0.15) * 5)

  return {
    decisions, tackle, breakdown, pass, handKick, carry, handling, pace, stamina, discipline,
    scrum, lineout, placeKick, aerial
  }
}

function computeLineoutFor(
  pos: RugbyPosition,
  t: Player['attributes']['technical'],
  p: Player['attributes']['physical']
): number {
  if (pos === 2) {
    // Hooker: lanzador
    return c((t.lineoutThrow * 0.5 + p.jumping * 0.3 + t.lineoutJump * 0.2) * 5)
  }
  if (pos === 4 || pos === 5 || pos === 6 || pos === 7 || pos === 8) {
    // Locks y back row: saltadores
    return c((t.lineoutJump * 0.6 + p.jumping * 0.4) * 5)
  }
  // Resto: lineout no es su rol
  return c((t.lineoutJump * 0.3 + p.jumping * 0.3 + t.aerial * 0.4) * 5)
}

// ============== ÍNDICES DE UNIDAD ==============

/**
 * Calcula los 6 índices de unidad sobre el XV titular.
 * `starters` es un array sparse-friendly: puede tener huecos si falta un titular.
 * El XV debe estar indexado por posición 1-15 o pasarse como array de Player con primaryPosition fiable.
 */
export function computeUnitIndices(starters: Player[]): UnitIndices {
  const byPos = new Map<RugbyPosition, Player>()
  for (const p of starters) byPos.set(p.primaryPosition as RugbyPosition, p)

  // Detectar XV incompleto
  let incomplete = false
  for (let pos = 1; pos <= 15; pos++) {
    if (!byPos.has(pos as RugbyPosition)) { incomplete = true; break }
  }

  // Pre-calcular rugby attrs por posición presente
  const rugbyByPos = new Map<RugbyPosition, RugbyAttrs>()
  for (const [pos, player] of byPos) rugbyByPos.set(pos, computeRugbyAttrs(player))

  const valOf = (pos: RugbyPosition, key: RugbyAttrKey): number => {
    const r = rugbyByPos.get(pos)
    return r ? r[key] : 50
  }

  // Scrum: media de los 8 forwards (1-8)
  const forwards: RugbyPosition[] = [1, 2, 3, 4, 5, 6, 7, 8]
  const scrum = avg(forwards.map((pos) => valOf(pos, 'scrum')))

  // Lineout: 0.4 locks (4-5) + 0.3 hooker (2) + 0.3 back row (6-8)
  const locks: RugbyPosition[] = [4, 5]
  const backRow: RugbyPosition[] = [6, 7, 8]
  const lineout = c(
    0.4 * avg(locks.map((pos) => valOf(pos, 'lineout'))) +
    0.3 * valOf(2, 'lineout') +
    0.3 * avg(backRow.map((pos) => valOf(pos, 'lineout')))
  )

  // Breakdown: media XV
  const allPos: RugbyPosition[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]
  const breakdown = avg(allPos.map((pos) => valOf(pos, 'breakdown')))

  // Kicking: 0.5 max(handKick 9,10,15) + 0.5 max(placeKick 10,15)
  const handKickers: RugbyPosition[] = [9, 10, 15]
  const placeKickers: RugbyPosition[] = [10, 15]
  const kicking = c(
    0.5 * Math.max(...handKickers.map((pos) => valOf(pos, 'handKick'))) +
    0.5 * Math.max(...placeKickers.map((pos) => valOf(pos, 'placeKick')))
  )

  // Backfield: 0.6 media(aerial back three) + 0.4 media(tackle back three)
  const backThree: RugbyPosition[] = [11, 14, 15]
  const backfield = c(
    0.6 * avg(backThree.map((pos) => valOf(pos, 'aerial'))) +
    0.4 * avg(backThree.map((pos) => valOf(pos, 'tackle')))
  )

  // Disciplina: media XV
  const discipline = avg(allPos.map((pos) => valOf(pos, 'discipline')))

  return { scrum, lineout, breakdown, kicking, backfield, discipline, incomplete }
}

// ============== AUX ==============

function c(v: number): number {
  return Math.max(1, Math.min(99, Math.round(v)))
}

function avg(xs: number[]): number {
  if (!xs.length) return 0
  return c(xs.reduce((s, x) => s + x, 0) / xs.length)
}
