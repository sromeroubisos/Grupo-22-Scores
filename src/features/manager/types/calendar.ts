// Calendario maestro de temporada: define ventanas explícitas (ligas,
// internacionales, release windows) que los generadores de fixtures respetan.

import type { ID, ISODate } from './common.ts'

export type CalendarWindowKind =
  | 'club_league'         // ventana de juego de liga doméstica
  | 'european_cup'        // Champions Cup (Dic-May)
  | 'sevens_circuit'      // HSBC SVNS (Nov-Jun)
  | 'international_men'   // Six Nations, Nations Championship, RC, Nations Cup
  | 'international_women' // Women's Six Nations, WXV
  | 'release_window'      // Liberación de jugadores: clubes deben PAUSAR

export type CalendarWindowScope =
  | 'global'              // afecta a todas las confederaciones
  | 'north'               // URC, Premiership, Top 14, Pro D2, Championship, DH
  | 'south'               // SRP, MLR, SRA, Currie Cup, Japan League One
  | 'specific'            // sólo competiciones en competitionShortNames

export interface CalendarWindow {
  id: ID
  /** Etiqueta humana: 'July Internationals 2026', 'Six Nations 2027', etc. */
  label: string
  kind: CalendarWindowKind
  scope: CalendarWindowScope
  start: ISODate
  end: ISODate
  /** shortName(s) de Competition cubiertas por la ventana. */
  competitionShortNames?: string[]
}

export interface SeasonCalendar {
  /** Año de la temporada Y; cubre desde Y-08-01 hasta (Y+1)-07-31. */
  seasonYear: number
  seasonStart: ISODate
  seasonEnd: ISODate
  windows: CalendarWindow[]
  /** Competiciones que NO se disputan esta temporada (p.ej. ['RC'] en 2026).
   *  Derivado de Competition.activeYears; útil para UI y validación. */
  dormantCompetitionShortNames: string[]
}

/** Rango temporal cerrado [start, end] usado por generadores de fixtures
 *  para saltar ventanas prohibidas (release windows, internationals, etc.). */
export interface BlockedRange {
  start: ISODate
  end: ISODate
}
