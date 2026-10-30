// Resultados oficiales de Rugby World Cup 2023 (Francia).
//
// Las 12 selecciones que terminaron entre las 3 primeras de cada pool de la
// fase de grupos automáticamente se clasifican para RWC 2027 (Australia).
// El resto debe pasar por su clasificatorio regional.
//
// La estructura `pool: 'A'|'B'|'C'|'D'` + `position: 1|2|3` permite generar
// 12 QualificationSlot{kind: 'previous_rwc'} con resolución determinista por
// pool+position.

export interface RWC2023Standing {
  countryCode: string
  pool: 'A' | 'B' | 'C' | 'D'
  position: 1 | 2 | 3
}

/** Top 3 de cada pool de Francia 2023. Las 12 selecciones aseguran su plaza
 *  para Australia 2027 sin necesidad de pasar por qualifier. */
export const RWC_2023_TOP_TWELVE: RWC2023Standing[] = [
  // Pool A: France, NZ, Italy clasificados; Uruguay y Namibia eliminados.
  { countryCode: 'FRA', pool: 'A', position: 1 },
  { countryCode: 'NZL', pool: 'A', position: 2 },
  { countryCode: 'ITA', pool: 'A', position: 3 },
  // Pool B: Ireland, South Africa, Scotland clasificados; Tonga, Romania eliminados.
  { countryCode: 'IRL', pool: 'B', position: 1 },
  { countryCode: 'ZAF', pool: 'B', position: 2 },
  { countryCode: 'SCO', pool: 'B', position: 3 },
  // Pool C: Wales, Fiji, Australia clasificados; Georgia, Portugal eliminados.
  { countryCode: 'WAL', pool: 'C', position: 1 },
  { countryCode: 'FIJ', pool: 'C', position: 2 },
  { countryCode: 'AUS', pool: 'C', position: 3 },
  // Pool D: England, Argentina, Japan clasificados; Samoa, Chile eliminados.
  { countryCode: 'ENG', pool: 'D', position: 1 },
  { countryCode: 'ARG', pool: 'D', position: 2 },
  { countryCode: 'JPN', pool: 'D', position: 3 }
]

/** Resultado del WRWC 2021 (Nueva Zelanda, jugado en Oct-Nov 2022). El
 *  ranking final asegura plazas a Inglaterra (host 2025) + las 3 semifinalistas. */
export interface WRWC2021Standing {
  countryCode: string
  finalPosition: number
}

export const WRWC_2021_TOP_FOUR: WRWC2021Standing[] = [
  { countryCode: 'NZL', finalPosition: 1 },   // campeón → no necesita qualifier
  { countryCode: 'ENG', finalPosition: 2 },   // host de WRWC 2025
  { countryCode: 'FRA', finalPosition: 3 },
  { countryCode: 'CAN', finalPosition: 4 }
]
