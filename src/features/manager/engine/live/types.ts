// Tipos de la transmisión: lo que la pantalla del partido lee de cada jugada.
// Todo se DERIVA de los eventos del motor; nada de esto toca el azar del partido.

import type { Player, RugbyPosition } from '../../types/index.ts'
import type { EventType, Side } from '../types.ts'
import type { EventActors } from '../playerMatchStats.ts'

/** Punto del campo en metros. x: 0 a 100 entre las dos líneas de gol (el in-goal
 *  llega hasta -10 y 110). y: 0 a 70 de touch a touch. */
export interface Pt { x: number; y: number }

export type PlayKind =
  | 'kickoff'
  | 'scrum'
  | 'lineout'
  | 'ruck'
  | 'maul'
  | 'kick'
  | 'goal'
  | 'try'
  | 'penalty'
  | 'idle'

/** Un jugador en el campo: la camiseta es el número de su puesto. */
export interface Dot {
  key: string
  side: Side
  position: RugbyPosition
  x: number
  y: number
}

export interface PlayActor {
  player: Player
  side: Side
  /** Número de camiseta con el que estaba en cancha. */
  position: RugbyPosition
}

export interface SideCounts { home: number; away: number }

/** Lo que muestra el tablero de estadísticas, acumulado hasta esa jugada. */
export interface BroadcastStats {
  /** Minutos con la pelota. */
  possession: SideCounts
  /** Minutos con la pelota en campo rival. */
  territory: SideCounts
  tackles: SideCounts
  rucks: SideCounts
  scrums: SideCounts
  lineouts: SideCounts
  turnovers: SideCounts
  penalties: SideCounts
  tries: SideCounts
}

export interface Play {
  index: number
  minute: number
  half: 1 | 2
  /** Quién tenía la pelota. */
  attacker: Side
  /** Hacia dónde ataca: +1 hacia x=100, -1 hacia x=0 (se invierte en el 2.º tiempo). */
  dir: 1 | -1
  type: EventType
  kind: PlayKind
  ball: Pt
  /** Fases seguidas que lleva esta posesión. */
  phase: number
  /** Titular con nombres: "Ensayo de Pérez (14)". */
  headline: string
  /** Frase del motor, sin tocar. */
  detail: string
  /** Protagonistas elegidos; son los mismos a los que se les acreditan las estadísticas. */
  actors: EventActors
  primary?: PlayActor
  stats: BroadcastStats
}

/** Un jugador en movimiento: posición y velocidad reales, en metros y metros por segundo. */
export interface MotionBody {
  key: string
  side: Side
  position: RugbyPosition
  x: number
  y: number
  vx: number
  vy: number
  /** Altura, de 0 a 1: el saltador de la touch sube y baja. */
  z: number
}

export interface MotionBall {
  x: number
  y: number
  /** Altura, de 0 a 1: una patada sube y baja. */
  z: number
  /** Quién la lleva en las manos; null si va en el aire o está en el suelo. */
  holder: string | null
}
