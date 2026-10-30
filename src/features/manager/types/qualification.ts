// Ciclo mundialista declarativo.
//
// Cada Mundial (RWC, WRWC) tiene N plazas. Cada plaza (`QualificationSlot`) se
// asigna por una fuente declarativa: top-3 del Mundial anterior, top-N de una
// competencia regional, ganador de un play-off cruzado, o posición en el FQT.
//
// El motor (`qualificationPathfinder`) resuelve los slots a medida que las
// competiciones referenciadas terminan, sin que el usuario tenga que disparar
// nada. La pantalla Qualification muestra el estado en vivo.

import type { ID, ISODate } from './common.ts'
import type { Gender } from './gender.ts'

export type QualSlotSource =
  /** Plazas asignadas por posición final en una RWC/WRWC anterior. La lista
   *  hardcodeada de resultados vive en `src/data/rwc2023.ts` (y futuras). */
  | { kind: 'previous_rwc'; rwcEdition: number; minPosition: number; maxPosition: number }
  /** Plaza asignada al equipo que termina en `position` (1-indexed) de la
   *  competencia identificada por shortName. Se resuelve cuando la competencia
   *  está terminada. */
  | { kind: 'competition_winner'; competitionShortName: string; position: number }
  /** Plaza asignada al ganador de un play-off (otra Competition declarada en
   *  el mismo ciclo). */
  | { kind: 'playoff_winner'; playoffId: string }
  /** Plaza asignada por posición final en el Final Qualification Tournament. */
  | { kind: 'fqt_position'; position: number }
  /** Plaza ya asignada de forma fija (host, semifinalista WRWC, etc.). */
  | { kind: 'fixed'; countryCode: string }

export type QualificationOutcome = 'qualified' | 'pending'

export interface QualificationSlot {
  id: ID
  /** Etiqueta humana: "RWC 2023 1º Pool A", "Europa 1", "Pacífico 3", "FQT 1". */
  label: string
  source: QualSlotSource
  /** Country.id de la selección que ocupa el slot. null hasta que se resuelva. */
  assignedCountryId: ID | null
  outcome: QualificationOutcome
}

export interface QualificationPlayoff {
  id: string
  label: string
  /** Competencia (two_leg_playoff) que materializa el play-off. */
  competitionId?: ID
  winnerCountryId: ID | null
  loserCountryId: ID | null
}

export interface QualificationCycle {
  id: ID
  targetEvent: 'RWC' | 'WRWC'
  edition: number
  gender: Gender
  /** Total de plazas en el evento (24 para RWC 2027, 16 para WRWC 2025). */
  totalSlots: number
  slots: QualificationSlot[]
  /** Play-offs cruzados (Sudamérica-Pacífico, África-Asia, etc.). */
  playoffs: QualificationPlayoff[]
  /** Cuando se completa la clasificación, la fecha (currentDate del world). */
  completedAt: ISODate | null
}
