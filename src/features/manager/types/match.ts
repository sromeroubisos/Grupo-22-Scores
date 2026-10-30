// Partidos y resultados.

import type { ID, ISODate } from './common.ts'
import type { RugbyPosition } from './player.ts'

/** Estadísticas individuales de un jugador en un partido. Generadas por el
 *  atribuidor post-hoc (engine/playerMatchStats.ts) tras simular. Persistidas
 *  en el save para que el detalle del partido las muestre tras recargar. */
export interface PlayerMatchStats {
  playerId: ID
  side: 'home' | 'away'
  position: RugbyPosition
  minutesPlayed: number
  tries: number
  tryAssists: number
  tackles: number
  missedTackles: number
  carries: number
  metresGained: number
  lineBreaks: number
  offloads: number
  turnoversWon: number
  handlingErrors: number
  penaltiesConceded: number
  cards: { yellow: number; red: number }
  kicksFromHand: number
  kicksAtPosts: { attempted: number; made: number }
  /** 0.0-9.9 con 1 decimal. */
  rating: number
}

/** Una sustitución hecha durante el partido. */
export interface MatchSub {
  side: 'home' | 'away'
  minute: number
  off: ID
  on: ID
}

export interface MatchResult {
  homeScore: number
  awayScore: number
  homeTries: number
  awayTries: number
  homeConversions: number
  awayConversions: number
  homePenalties: number
  awayPenalties: number
  homeDrops: number
  awayDrops: number
  homeStarterIds?: ID[]
  awayStarterIds?: ID[]
  homeTryScorers?: ID[]
  awayTryScorers?: ID[]
  /** Cómo se decidió el partido. Sólo se rellena en eliminatorias que terminaron empate. */
  decidedBy?: 'normal' | 'extra_time' | 'shootout'
  /** Sustituciones registradas durante el partido (vacío en auto-simulación
   *  o en partidos jugados antes de la feature). */
  subs?: MatchSub[]
  /** Stats por jugador. Opcional para saves anteriores. */
  playerStats?: PlayerMatchStats[]
}

export interface Match {
  id: ID
  competitionId: ID
  seasonYear: number
  date: ISODate
  round: number
  homeClubId: ID
  awayClubId: ID
  played: boolean
  result?: MatchResult
}
