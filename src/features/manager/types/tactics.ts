// Táctica de un club: XV titular, filosofía y capitán.
// Está pensado como "estable" entre partidos: cambia cuando el usuario lo decide.

import type { ID } from './common.ts'
import type { RugbyPosition } from './player.ts'

/** Mapa posición → jugador titular en esa posición. */
export type StarterMap = Partial<Record<RugbyPosition, ID>>

/** Filosofía táctica del equipo. Cada eje va de -3 a +3. */
export interface TacticsPhilosophy {
  /** -3 lento / posesional ↔ +3 rápido / alto ritmo */
  tempo: number
  /** -3 patear / territorial ↔ +3 correr / balón en mano */
  territory: number
  /** -3 estrecho por dentro ↔ +3 abrir y usar alas */
  width: number
  /** -3 forwards conservadores ↔ +3 forwards corredores */
  forwards: number
  /** -3 defensa drift (reactiva) ↔ +3 defensa rush (presionante) */
  defense: number
}

export interface Tactics {
  starters: StarterMap
  captainId: ID | null
  philosophy: TacticsPhilosophy
}

export const DEFAULT_PHILOSOPHY: TacticsPhilosophy = {
  tempo: 0,
  territory: 0,
  width: 0,
  forwards: 0,
  defense: 0
}

export function defaultTactics(): Tactics {
  return {
    starters: {},
    captainId: null,
    philosophy: { ...DEFAULT_PHILOSOPHY }
  }
}

/** Etiquetas humanas para los ejes de filosofía. */
export const PHILOSOPHY_LABELS: Record<keyof TacticsPhilosophy, { left: string; right: string; title: string }> = {
  tempo: { title: 'Tempo', left: 'Lento', right: 'Rápido' },
  territory: { title: 'Territorio', left: 'Patear', right: 'Correr' },
  width: { title: 'Anchura', left: 'Estrecho', right: 'Ancho' },
  forwards: { title: 'Forwards', left: 'Conservadores', right: 'Corredores' },
  defense: { title: 'Defensa', left: 'Drift', right: 'Rush' }
}

// === Entrenamientos ===

/** Distribución de carga semanal de entrenamiento (suma ≈ 100). */
export interface TrainingSchedule {
  physical: number
  technical: number
  tactical: number
  recovery: number
}

export const DEFAULT_TRAINING: TrainingSchedule = {
  physical: 30,
  technical: 30,
  tactical: 25,
  recovery: 15
}
