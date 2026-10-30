// El mundo de la partida: agrupa todo el estado serializable.

import type { ID, ISODate } from './common.ts'
import type { Country } from './country.ts'
import type { Club } from './club.ts'
import type { Competition } from './competition.ts'
import type { Player } from './player.ts'
import type { Staff } from './staff.ts'
import type { Contract } from './contract.ts'
import type { Match } from './match.ts'
import type { SeasonCalendar } from './calendar.ts'
import type { Tactics, TrainingSchedule } from './tactics.ts'
import type { BoardExpectations } from './board.ts'
import type { WorldRankingState, RankingChange } from './ranking.ts'
import type { Confederation } from './confederation.ts'
import type { Pyramid } from './pyramid.ts'
import type { QualificationCycle } from './qualification.ts'

export interface WorldSettings {
  matchLength: number
  substitutionsAllowed: number
  hia: boolean
  pointsForTry: number
  pointsForConversion: number
  pointsForPenalty: number
  pointsForDrop: number
  yellowCardMinutes: number
  tryBonusEnabled: boolean
  salaryCapEnforced: boolean
  minProfessionalAge: number
  realisticInjuries: boolean
}

export const DEFAULT_SETTINGS: WorldSettings = {
  matchLength: 80,
  substitutionsAllowed: 8,
  hia: true,
  pointsForTry: 5,
  pointsForConversion: 2,
  pointsForPenalty: 3,
  pointsForDrop: 3,
  yellowCardMinutes: 10,
  tryBonusEnabled: true,
  salaryCapEnforced: true,
  minProfessionalAge: 17,
  realisticInjuries: true
}

/** Versión actual del schema persistido. Se incrementa cuando un cambio de
 *  motor altera la forma de los datos serializados (no eventos ephemeral).
 *  Saves anteriores se normalizan en `loadFromSave` con un default sensato. */
export const ENGINE_SCHEMA_VERSION = 4

/** Modo de simulación elegido al crear la partida.
 *  - simplified: 1 Tier1 + 1 Tier2 por confederación, ciclos mundialistas condensados.
 *  - detailed: pirámide regional completa, ascensos/descensos reales, ciclos mundialistas
 *    con play-offs cruzados y FQT como en la vida real. */
export type SimulationMode = 'simplified' | 'detailed'

export interface World {
  id: ID
  version: string
  /** Versión del schema del motor para este save. Permite migración hacia delante.
   *  Opcional para compatibilidad con saves anteriores a su introducción. */
  engineSchemaVersion?: number
  currentDate: ISODate
  seasonYear: number
  settings: WorldSettings
  countries: Country[]
  competitions: Competition[]
  clubs: Club[]
  players: Player[]
  staff: Staff[]
  contracts: Contract[]
  matches: Match[]
  /** Calendario maestro de la temporada en curso. Define ventanas internacionales,
   *  europeas, sevens y release windows que respetan los generadores de fixtures.
   *  Opcional para compatibilidad con saves anteriores a v2 (se sintetiza en migración). */
  calendar?: SeasonCalendar
  tactics: Record<ID, Tactics>
  training: Record<ID, TrainingSchedule>
  boardExpectations: Record<ID, BoardExpectations>
  /** Modo de simulación elegido al crear la partida. Opcional para compatibilidad
   *  con saves anteriores a v3. La migración asigna 'detailed' por defecto. */
  simulationMode?: SimulationMode
  /** Ranking oficial World Rugby para selecciones masculinas y femeninas.
   *  Se actualiza tras cada full international con la fórmula oficial de
   *  intercambio de puntos (ver [worldRugbyRanking.ts]).
   *  Opcional para compatibilidad con saves anteriores a v3; migración lo
   *  inicializa por tier. */
  rankings?: {
    men: WorldRankingState
    women: WorldRankingState
  }
  /** Historial de cambios del ranking. Append-only, se trunca a las últimas
   *  500 entradas para mantener el tamaño del save bajo control. */
  rankingHistory?: RankingChange[]
  /** Confederaciones regionales con sus miembros y competiciones.
   *  Opcional para compatibilidad con saves anteriores a v3; migración las
   *  reconstruye desde Country.confederationId. */
  confederations?: Confederation[]
  /** Pirámides regionales con ascenso/descenso declarativo entre niveles.
   *  Opcional; se siembra en createDemoWorld o en seeds futuros. */
  pyramids?: Pyramid[]
  /** Ciclos mundialistas activos (RWC 2027 M, WRWC 2025 F, WRWC 2029 F).
   *  Cada ciclo declara N plazas con su fuente; el pathfinder las resuelve
   *  a medida que las competencias clasificatorias terminan. */
  qualificationCycles?: QualificationCycle[]
}
