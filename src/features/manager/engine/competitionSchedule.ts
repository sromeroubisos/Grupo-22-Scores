// Helpers que coordinan competiciones con el SeasonCalendar.

import type { Competition, CompetitionFormat, SeasonCalendar, ISODate, BlockedRange } from '../types/index.ts'
import type { LeagueData } from '../data/leagues.ts'

/** True para formatos donde los equipos son selecciones (Country.id en clubIds),
 *  no clubes. Implica: no Elo de club, no efectos semanales sobre plantillas. */
export function isInternationalFormat(format: CompetitionFormat): boolean {
  return format === 'international'
    || format === 'international_split'
    || format === 'sevens_circuit'
    || format === 'world_cup'
    || format === 'regional_pool'
    || format === 'ko_bracket'
    || format === 'two_leg_playoff'
    || format === 'sudamericano_bracket'
}

/** Rangos bloqueados aplicables a competiciones europeas (Champions Cup):
 *  todas las release_window con scope 'global' o 'north'. */
export function blockedRangesForEuropean(calendar: SeasonCalendar): BlockedRange[] {
  return calendar.windows
    .filter((w) => w.kind === 'release_window')
    .filter((w) => w.scope === 'global' || w.scope === 'north')
    .map((w) => ({ start: w.start, end: w.end }))
}

/** True si la competición se disputa en este seasonYear.
 *  Si activeYears no está definido, se asume que la competición se juega siempre. */
export function competitionRunsIn(comp: Competition, seasonYear: number): boolean {
  if (!comp.activeYears) return true
  return comp.activeYears.includes(seasonYear)
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`
}

/** Fecha de inicio efectiva de una liga doméstica dentro de una temporada.
 *  Norteñas: arrancan en Sep del seasonYear.
 *  Sureñas: arrancan en Feb del (seasonYear + 1) porque la temporada Y va
 *  del 1-Jul-Y al 30-Jun-(Y+1) y el hemisferio sur juega en su otoño austral. */
export function computeLeagueStartDate(
  league: LeagueData,
  seasonYear: number,
  _calendar: SeasonCalendar
): ISODate {
  const month = pad(league.startMonth)
  const day = pad(league.startDay)
  const year = league.northOrSouth === 'south' ? seasonYear + 1 : seasonYear
  return `${year}-${month}-${day}`
}
