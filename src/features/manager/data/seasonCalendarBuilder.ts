// Builder del calendario maestro por seasonYear.
// Convención: la temporada Y va del 1-Jul-Y al 30-Jun-(Y+1), alineada con el
// ciclo internacional real (Nations Championship Jul+Nov, Six Nations Feb-Mar,
// ligas norteñas Sep-Jun, sureñas Feb-Jun).

import type { SeasonCalendar, CalendarWindow, ISODate } from '../types/index.ts'
import { newId } from '../utils/id.ts'

function seasonStartOf(year: number): ISODate { return `${year}-07-01` }
function seasonEndOf(year: number): ISODate { return `${year + 1}-06-30` }

function w(
  label: string,
  kind: CalendarWindow['kind'],
  scope: CalendarWindow['scope'],
  start: ISODate,
  end: ISODate,
  competitionShortNames?: string[]
): CalendarWindow {
  return { id: newId('cwin'), label, kind, scope, start, end, competitionShortNames }
}

/** Construye el calendario maestro para una temporada concreta.
 *  Refleja el calendario real 2026+: Nations Championship Jul+Nov, RC solo
 *  en 2027/2028/2029, ligas norteñas pausan en release windows, etc. */
export function buildSeasonCalendar(seasonYear: number): SeasonCalendar {
  const Y = seasonYear
  const N = Y + 1
  const windows: CalendarWindow[] = []

  // 1. Release windows masculinas: ligas norteñas pausan, sureñas suelen estar
  //    fuera de temporada por estacionalidad.
  windows.push(
    w(`July Internationals ${Y}`, 'release_window', 'north',
      `${Y}-07-01`, `${Y}-08-02`,
      ['NC', 'NCup', 'RC']),
    w(`November Internationals ${Y}`, 'release_window', 'north',
      `${Y}-11-06`, `${Y}-11-29`,
      ['NC', 'NCup']),
    w(`Six Nations ${N}`, 'release_window', 'north',
      `${N}-02-05`, `${N}-03-14`,
      ['6N'])
  )

  // 2. Ventanas internacionales masculinas
  windows.push(
    w(`Nations Championship ${Y} - Julio`, 'international_men', 'global',
      `${Y}-07-04`, `${Y}-07-18`, ['NC']),
    w(`Nations Championship ${Y} - Noviembre`, 'international_men', 'global',
      `${Y}-11-06`, `${Y}-11-29`, ['NC']),
    w(`Nations Cup ${Y} - Julio`, 'international_men', 'global',
      `${Y}-07-04`, `${Y}-07-18`, ['NCup']),
    w(`Nations Cup ${Y} - Noviembre`, 'international_men', 'global',
      `${Y}-11-06`, `${Y}-11-21`, ['NCup']),
    w(`Six Nations ${N}`, 'international_men', 'global',
      `${N}-02-06`, `${N}-03-13`, ['6N'])
  )
  // Rugby Championship solo en 2027/2028/2029 (ciclo SANZAAR 2026-2030)
  if (Y === 2027 || Y === 2028 || Y === 2029) {
    windows.push(
      w(`Rugby Championship ${Y}`, 'international_men', 'south',
        `${Y}-08-15`, `${Y}-09-26`, ['RC'])
    )
  }

  // 3. Ventanas internacionales femeninas
  windows.push(
    w(`WXV Global Series ${Y}`, 'international_women', 'global',
      `${Y}-09-13`, `${Y}-10-31`, ['WXV']),
    w(`Women's Six Nations ${N}`, 'international_women', 'global',
      `${N}-04-10`, `${N}-05-17`, ['W6N'])
  )

  // 4. Ventanas de clubes
  // Norteñas (URC, Premiership, Top 14, Pro D2, Championship, DH): Sep-Jun
  windows.push(
    w(`Club Season North ${Y}/${N}`, 'club_league', 'north',
      `${Y}-09-05`, `${N}-06-20`)
  )
  // Sureñas (Super Rugby Pacific, MLR): Feb-Jun
  windows.push(
    w(`Club Season South ${N}`, 'club_league', 'south',
      `${N}-02-13`, `${N}-06-30`)
  )

  // 5. Champions Cup: ventana europea Dic-May, intercalada con ligas
  windows.push(
    w(`Champions Cup ${Y}/${N}`, 'european_cup', 'specific',
      `${Y}-12-12`, `${N}-05-30`, ['CCup'])
  )

  // 6. HSBC SVNS: 13 etapas entre Nov y Jun
  windows.push(
    w(`HSBC SVNS ${Y}/${N}`, 'sevens_circuit', 'global',
      `${Y}-11-29`, `${N}-06-07`, ['SVNSM', 'SVNSW'])
  )

  // 7. Dormancia: RC NO se disputa en 2026
  const dormantCompetitionShortNames: string[] =
    Y === 2026 ? ['RC'] : []

  return {
    seasonYear: Y,
    seasonStart: seasonStartOf(Y),
    seasonEnd: seasonEndOf(Y),
    windows,
    dormantCompetitionShortNames
  }
}

/** Extrae los BlockedRange aplicables a una competición concreta.
 *  Una liga del norte recibe los rangos kind=release_window con scope global|north;
 *  una del sur, scope global|south. */
export function blockedRangesForLeague(
  calendar: SeasonCalendar,
  side: 'north' | 'south'
): { start: ISODate; end: ISODate }[] {
  return calendar.windows
    .filter((w) => w.kind === 'release_window')
    .filter((w) => w.scope === 'global' || w.scope === side)
    .map((w) => ({ start: w.start, end: w.end }))
}
