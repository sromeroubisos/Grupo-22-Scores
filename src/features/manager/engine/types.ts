// Tipos del motor de partido. Sin dependencias externas, sin React.
// El motor es código puro: recibe inputs, devuelve outputs.

import type { ID, Player, CompetitionRules } from '../types/index.ts'
import type { CompetitionLevel } from './levels.ts'
import type { PenaltyDecision } from './expectedPoints.ts'

export type Side = 'home' | 'away'

/** División del campo en 4 zonas (de propio en-goal a en-goal rival). */
export type Zone = 'own22' | 'midOwn' | 'midOpp' | 'opp22'

/** Tipo de fase actual. El motor resuelve una fase por iteración. */
export type PhaseType =
  | 'kickoff'      // saque inicial (de cada parte)
  | 'restart'      // saque tras anotación (22m drop o de medio campo)
  | 'scrum'        // melé
  | 'lineout'      // touch
  | 'openPlay'     // juego abierto / fase tras ruck
  | 'penalty'      // se ha pitado un penal a favor del equipo en posesión
  | 'conversion'   // tras ensayo

export type EventType =
  | 'kickoff'
  | 'try'
  | 'conversion'
  | 'penalty_kick'
  | 'penalty_kick_missed'
  | 'drop_goal'
  | 'drop_goal_missed'
  | 'penalty_to_touch'
  | 'penalty_won'
  | 'turnover'
  | 'lineout_won'
  | 'lineout_lost'
  | 'scrum_won'
  | 'scrum_penalty'
  | 'kick_to_touch'
  | 'box_kick'
  | 'maul_drive'
  | 'phase_play'
  | 'tackle_break'
  | 'half_end'
  | 'full_time'
  | 'commentary'
  | 'yellow_card'
  // Eventos de descomposición de open play (Fase 1 anterior)
  | 'tackle'
  | 'offload'
  | 'jackal_steal'
  | 'knock_on'
  | 'ruck_won'
  | 'ruck_slow_ball'
  | 'line_break'
  // ============ Fase 2: granularidad ============
  // Scrum sub-eventos
  | 'scrum_reset'           // colapso que se repite
  | 'scrum_collapse'        // 3er colapso → penal contra el equipo en el feed
  // Maul progresivo (sustituye al maul_drive único)
  | 'maul_form'             // empieza el maul tras lineout
  | 'maul_stall'            // parado >2s → penal a defensa
  | 'maul_collapse'         // se derrumba ilegalmente → free kick
  | 'maul_use_it'           // saca el balón → ruck/openPlay
  // Ruck multi-fase
  | 'ruck_form'             // se forma el ruck
  | 'ruck_pickgo'           // pick & go del 9
  | 'ruck_use_it_warn'      // árbitro avisa "use it!"
  // Kick variety
  | 'grubber'               // patada rasa por detrás
  | 'chip_kick'             // chip por encima de la línea
  | 'cross_kick'            // cruzado al ala
  | 'box_kick_chase_won'    // chase wins the contestable
  | 'box_kick_chase_lost'   // catcher safe
  | 'mark_called'           // mark en propio 22
  | 'quick_tap'             // penal a corto rápido (tap & go)
  | 'drop_goal_attempt'     // intento separado del resultado

export interface MatchEvent {
  minute: number
  side: Side | null    // null = neutral / sin equipo asociado
  type: EventType
  text: string         // narración en español
  scoreAfter: { home: number; away: number }
  /** Zona del campo en el momento del evento (vista del equipo en posesión). */
  zone: Zone
  /** Equipo en posesión cuando se generó el evento. */
  possession: Side
  /** Fase del juego al empujar el evento. */
  phase: PhaseType
}

export interface Score {
  home: number
  away: number
}

/** Estado completo del partido. Mutado por las funciones del motor. */
export interface MatchState {
  minute: number               // 0-80+
  half: 1 | 2
  score: Score
  tries: Score
  conversions: Score
  penalties: Score
  drops: Score
  possession: Side
  zone: Zone
  phase: PhaseType
  /** Momentum -100 (visitante muy lanzado) a +100 (local muy lanzado). */
  momentum: number
  /** Eventos generados, en orden cronológico. */
  events: MatchEvent[]
  ended: boolean
  /** Acumulador de fatiga por equipo (0-100). Sube con el tiempo y con la carga. */
  fatigue: { home: number; away: number }
  /** Condiciones meteorológicas. Afectan kicking y handling. */
  weather: 'clear' | 'rain' | 'wind'
  /** Perfil del árbitro. Cambia la frecuencia de penales en breakdown. */
  referee: 'permissive' | 'balanced' | 'strict'
  /** Importancia del partido (1.0 liga, 1.5 copa, 2.0 final). Afecta presión y Elo. */
  importance: number
  /** Nivel competitivo. Modula tasas de scoring, varianza y techo de pateo. */
  level: CompetitionLevel
  /** Reglas de competición. Si están presentes, se usan para tácticas de fin (BP4 / losing≤7). */
  competitionRules?: CompetitionRules
  /**
   * Shock de forma por equipo. Aleatorio por partido, escalado por `varianceMult`
   * del nivel. Se suma a attack y defense efectivos del equipo en cada fase.
   * Sin este término, dos equipos con ratings similares siempre producen marcadores
   * similares — no hay "día malo" ni "día inspirado". Críticamente, permite que
   * niveles semipro/youth tengan colas más pesadas (palizas) aunque la dispersión
   * estructural de los planteles sea baja.
   */
  formShock: { home: number; away: number }
  // ============ Contadores (para verifyCalibration) ============
  scrums: Score
  lineouts: Score
  rucks: Score
  tackles: Score
  turnovers: Score
  offloads: Score
  lineBreaks: Score
  // Fase 2: nuevos contadores
  mauls: Score              // formaciones de maul (incrementa en maul_form)
  maulDrives: Score         // empujes individuales (incrementa en maul_drive)
  pickAndGos: Score         // ruck_pickgo
  quickTaps: Score          // penal a corto
  /** Contador de reset de melé en la fase scrum en curso. Se reinicia tras éxito o penal. */
  scrumResetCount: number
  /** Decisión del entrenador para el próximo penal a favor. Se consume al resolverlo;
   *  sin ella, decide el motor por puntos esperados. */
  penaltyOverride?: PenaltyDecision
}

/** Calidad agregada de un equipo en distintos aspectos del juego (0-100). */
export interface TeamRating {
  /** Valoración global de la plantilla, escala 1-99 (estilo FIFA). */
  overall: number
  attack: number       // ataque general (carrera, pase, decisiones)
  defense: number      // defensa (placaje, posicionamiento)
  setPiece: number     // melé y touch
  kicking: number      // calidad de patada (palos y tácticas)
  power: number        // fuerza de delanteros
  pace: number         // velocidad de tres-cuartos
  discipline: number   // inverso a probabilidad de penaltis
}

/** Datos de un equipo necesarios para simular un partido. */
export interface MatchTeam {
  clubId: ID
  clubName: string
  shortName: string
  rating: TeamRating
  /** XV titular (en orden de posición 1 a 15). */
  starters: Player[]
  /** Banquillo (hasta 8). El motor no lo usa para simular, pero lo lleva el
   *  MatchTeam para que la UI pueda hacer sustituciones cosméticas y el
   *  atribuidor de stats sepa quién entra. */
  bench: Player[]
}

export interface MatchResult {
  homeTeam: MatchTeam
  awayTeam: MatchTeam
  finalScore: Score
  tries: Score
  conversions: Score
  penalties: Score
  drops: Score
  events: MatchEvent[]
  // ============ Contadores agregados ============
  scrums: Score
  lineouts: Score
  rucks: Score
  tackles: Score
  turnovers: Score
  offloads: Score
  lineBreaks: Score
  // Fase 2
  mauls: Score
  maulDrives: Score
  pickAndGos: Score
  quickTaps: Score
}
