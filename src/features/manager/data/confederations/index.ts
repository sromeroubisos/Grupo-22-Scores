// Catálogo regional consolidado: confederaciones, pirámides y competencias.
//
// Para Fase B sólo se cubren XV masculinos seniores: REC Championship/Trophy
// (Europa), Sudamericano (SAR), Africa Cup (AFR), Asia Championship + Div 1
// (ASI), RAN Tier 1/2 (RAN), Oceania Championship (OCE) y Pacific Nations Cup
// (global). El mirror femenino y los sevens/juveniles vienen en Fases C/E.

import type { ConfederationId } from '../../types/index.ts'
import {
  type RegionalCompetitionData,
  type PyramidData,
  DEFAULT_INTERNATIONAL_RULES,
  rulesWithPyramid
} from './types.ts'

export type { RegionalCompetitionData, PyramidData }

// =============================================================================
// PIRÁMIDES REGIONALES
// =============================================================================

export const ALL_PYRAMIDS: PyramidData[] = [
  {
    id: 'rec_men_xv',
    name: 'Rugby Europe Men XV',
    confederationId: 'rugby_europe',
    gender: 'men', ageCategory: 'senior',
    levels: [
      { competitionShortName: 'REC',     promotionSlots: 0, relegationSlots: 1 },
      { competitionShortName: 'REC_T',   promotionSlots: 1, relegationSlots: 1 },
      { competitionShortName: 'REC_C',   promotionSlots: 1, relegationSlots: 0 }
    ]
  },
  {
    id: 'ran_men_xv',
    name: 'Rugby Americas North Men XV',
    confederationId: 'rugby_americas_north',
    gender: 'men', ageCategory: 'senior',
    levels: [
      { competitionShortName: 'RAN_T1', promotionSlots: 0, relegationSlots: 1 },
      { competitionShortName: 'RAN_T2', promotionSlots: 1, relegationSlots: 0 }
    ]
  },
  {
    id: 'afr_men_xv',
    name: 'Rugby Africa Men XV',
    confederationId: 'rugby_africa',
    gender: 'men', ageCategory: 'senior',
    levels: [
      { competitionShortName: 'AFR_CUP', promotionSlots: 0, relegationSlots: 1 },
      { competitionShortName: 'AFR_DIV', promotionSlots: 1, relegationSlots: 0 }
    ]
  },
  {
    id: 'asi_men_xv',
    name: 'Asia Rugby Men XV',
    confederationId: 'asia_rugby',
    gender: 'men', ageCategory: 'senior',
    levels: [
      { competitionShortName: 'ASI_CH', promotionSlots: 0, relegationSlots: 1 },
      { competitionShortName: 'ASI_D1', promotionSlots: 1, relegationSlots: 0 }
    ]
  },
  // -------- Pirámides femeninas --------
  {
    id: 'rec_women_xv',
    name: 'Rugby Europe Women XV',
    confederationId: 'rugby_europe',
    gender: 'women', ageCategory: 'senior',
    levels: [
      { competitionShortName: 'W_REC',   promotionSlots: 0, relegationSlots: 1 },
      { competitionShortName: 'W_REC_T', promotionSlots: 1, relegationSlots: 0 }
    ]
  },
  {
    id: 'afr_women_xv',
    name: 'Rugby Africa Women XV',
    confederationId: 'rugby_africa',
    gender: 'women', ageCategory: 'senior',
    levels: [
      { competitionShortName: 'W_AFR_CUP', promotionSlots: 0, relegationSlots: 1 },
      { competitionShortName: 'W_AFR_DIV', promotionSlots: 1, relegationSlots: 0 }
    ]
  }
]

// =============================================================================
// COMPETENCIAS REGIONALES (XV M SENIOR — Fase B)
// =============================================================================

export const ALL_REGIONAL_COMPETITIONS: RegionalCompetitionData[] = [
  // -------- RUGBY EUROPE --------
  {
    shortName: 'REC',
    name: 'Rugby Europe Championship',
    confederationId: 'rugby_europe',
    format: 'regional_pool',
    gender: 'men', ageCategory: 'senior',
    tier: 0,
    pyramidId: 'rec_men_xv', pyramidLevel: 0,
    // 8 selecciones tier 2 europeas. Italia juega Six Nations así que no aparece.
    memberCountryCodes: ['GEO', 'POR', 'ROU', 'ESP', 'NED', 'BEL', 'GER', 'SUI'],
    rules: rulesWithPyramid(0, 1),
    firstMatchDateTemplate: '${year + 1}-02-07'
  },
  {
    shortName: 'REC_T',
    name: 'Rugby Europe Trophy',
    confederationId: 'rugby_europe',
    format: 'regional_pool',
    gender: 'men', ageCategory: 'senior',
    tier: 1,
    pyramidId: 'rec_men_xv', pyramidLevel: 1,
    memberCountryCodes: ['POL', 'CZE', 'CRO', 'UKR', 'SWE', 'ISR'],
    rules: rulesWithPyramid(1, 1),
    firstMatchDateTemplate: '${year + 1}-03-07'
  },
  {
    shortName: 'REC_C',
    name: 'Rugby Europe Conference',
    confederationId: 'rugby_europe',
    format: 'regional_pool',
    gender: 'men', ageCategory: 'senior',
    tier: 2,
    pyramidId: 'rec_men_xv', pyramidLevel: 2,
    memberCountryCodes: ['DEN', 'NOR', 'FIN', 'AUT', 'HUN', 'SRB'],
    rules: rulesWithPyramid(1, 0),
    firstMatchDateTemplate: '${year + 1}-04-04'
  },

  // -------- OCEANIA RUGBY --------
  {
    shortName: 'OCE_CH',
    name: 'Oceania Rugby Men Championship',
    confederationId: 'oceania_rugby',
    format: 'regional_pool',
    gender: 'men', ageCategory: 'senior',
    tier: 0,
    // Fuera de AUS/NZL (Tier 1) y FIJ/SAM/TGA (en Pacific Nations Cup).
    memberCountryCodes: ['COK', 'PNG', 'NIU', 'SOL'],
    rules: { ...DEFAULT_INTERNATIONAL_RULES },
    firstMatchDateTemplate: '${year}-09-19'
  },

  // -------- SUDAMÉRICA RUGBY --------
  {
    shortName: 'SAR_CH',
    name: 'Sudamericano',
    confederationId: 'sudamerica_rugby',
    format: 'sudamericano_bracket',
    gender: 'men', ageCategory: 'senior',
    tier: 0,
    // 4 selecciones tier 2/3 sin Argentina (en Rugby Championship). Seeds según
    // ranking SAR reciente: 1.URU 2.CHI 3.BRA 4.PAR.
    memberCountryCodes: ['URU', 'CHI', 'BRA', 'PAR'],
    rules: { ...DEFAULT_INTERNATIONAL_RULES, hasPlayoff: true, playoffTeams: 4 },
    firstMatchDateTemplate: '${year + 1}-05-09'
  },

  // -------- RUGBY AMERICAS NORTH --------
  {
    shortName: 'RAN_T1',
    name: 'RAN Men Tier 1',
    confederationId: 'rugby_americas_north',
    format: 'regional_pool',
    gender: 'men', ageCategory: 'senior',
    tier: 0,
    pyramidId: 'ran_men_xv', pyramidLevel: 0,
    // 8 selecciones del cuadro élite RAN (USA y CAN suben a PNC pero también
    // participan a nivel regional en años de qualifier).
    memberCountryCodes: ['CAN', 'JAM', 'MEX', 'TTO', 'BAR', 'GUY', 'BAH', 'BMU'],
    rules: rulesWithPyramid(0, 1),
    firstMatchDateTemplate: '${year + 1}-06-13'
  },
  {
    shortName: 'RAN_T2',
    name: 'RAN Men Tier 2',
    confederationId: 'rugby_americas_north',
    format: 'regional_pool',
    gender: 'men', ageCategory: 'senior',
    tier: 1,
    pyramidId: 'ran_men_xv', pyramidLevel: 1,
    memberCountryCodes: ['CAY', 'CUB', 'GRN', 'HAI', 'CRC', 'GUT'],
    rules: rulesWithPyramid(1, 0),
    firstMatchDateTemplate: '${year + 1}-07-04'
  },

  // -------- RUGBY AFRICA --------
  {
    shortName: 'AFR_CUP',
    name: 'Rugby Africa Cup',
    confederationId: 'rugby_africa',
    format: 'regional_pool',
    gender: 'men', ageCategory: 'senior',
    tier: 0,
    pyramidId: 'afr_men_xv', pyramidLevel: 0,
    memberCountryCodes: ['NAM', 'KEN', 'ZIM', 'UGA', 'ALG', 'MAR', 'TUN', 'SEN'],
    rules: rulesWithPyramid(0, 1),
    firstMatchDateTemplate: '${year + 1}-07-04'
  },
  {
    shortName: 'AFR_DIV',
    name: 'Rugby Africa Cup Division 1',
    confederationId: 'rugby_africa',
    format: 'ko_bracket',
    gender: 'men', ageCategory: 'senior',
    tier: 1,
    pyramidId: 'afr_men_xv', pyramidLevel: 1,
    memberCountryCodes: ['CIV', 'GHA', 'BWA', 'NGA'],
    rules: rulesWithPyramid(1, 0),
    firstMatchDateTemplate: '${year + 1}-06-13'
  },

  // -------- ASIA RUGBY --------
  {
    shortName: 'ASI_CH',
    name: 'Asia Rugby Championship',
    confederationId: 'asia_rugby',
    format: 'regional_pool',
    gender: 'men', ageCategory: 'senior',
    tier: 0,
    pyramidId: 'asi_men_xv', pyramidLevel: 0,
    // Japón juega PNC pero el Championship histórico incluye a JPN como
    // referencia regional; usamos 4 selecciones asiáticas top.
    memberCountryCodes: ['JPN', 'KOR', 'HKG', 'MAS'],
    rules: rulesWithPyramid(0, 1),
    firstMatchDateTemplate: '${year + 1}-05-09'
  },
  {
    shortName: 'ASI_D1',
    name: 'Asia Rugby Men Division 1',
    confederationId: 'asia_rugby',
    format: 'ko_bracket',
    gender: 'men', ageCategory: 'senior',
    tier: 1,
    pyramidId: 'asi_men_xv', pyramidLevel: 1,
    memberCountryCodes: ['SRI', 'SGP', 'PHI', 'UAE'],
    rules: rulesWithPyramid(1, 0),
    firstMatchDateTemplate: '${year + 1}-04-18'
  },

  // -------- GLOBAL (WORLD RUGBY) --------
  {
    shortName: 'PNC',
    name: 'Pacific Nations Cup',
    confederationId: null,
    format: 'regional_pool',
    gender: 'men', ageCategory: 'senior',
    tier: 0,
    // Mezcla Oceania (FIJ, SAM, TGA), RAN (CAN, USA) y Asia (JPN).
    memberCountryCodes: ['FIJ', 'SAM', 'TGA', 'JPN', 'CAN', 'USA'],
    rules: { ...DEFAULT_INTERNATIONAL_RULES },
    firstMatchDateTemplate: '${year}-08-22'
  },

  // =========================================================================
  // COMPETENCIAS FEMENINAS XV SENIOR (Fase C)
  // =========================================================================

  // -------- RUGBY EUROPE --------
  {
    shortName: 'W_REC',
    name: 'Rugby Europe Women Championship',
    confederationId: 'rugby_europe',
    format: 'regional_pool',
    gender: 'women', ageCategory: 'senior',
    tier: 0,
    pyramidId: 'rec_women_xv', pyramidLevel: 0,
    // ITA y las naciones del Six Nations femenino juegan W6N. REC W
    // Championship reúne a las siguientes naciones europeas.
    memberCountryCodes: ['ESP', 'NED', 'POR', 'SWE'],
    rules: rulesWithPyramid(0, 1),
    firstMatchDateTemplate: '${year + 1}-03-07'
  },
  {
    shortName: 'W_REC_T',
    name: 'Rugby Europe Women Trophy',
    confederationId: 'rugby_europe',
    format: 'regional_pool',
    gender: 'women', ageCategory: 'senior',
    tier: 1,
    pyramidId: 'rec_women_xv', pyramidLevel: 1,
    memberCountryCodes: ['BEL', 'GER', 'CZE', 'POL'],
    rules: rulesWithPyramid(1, 0),
    firstMatchDateTemplate: '${year + 1}-04-04'
  },

  // -------- OCEANIA RUGBY --------
  {
    shortName: 'W_OCE_CH',
    name: 'Oceania Rugby Women Championship',
    confederationId: 'oceania_rugby',
    format: 'regional_pool',
    gender: 'women', ageCategory: 'senior',
    tier: 0,
    memberCountryCodes: ['FIJ', 'SAM', 'TGA'],
    rules: { ...DEFAULT_INTERNATIONAL_RULES },
    firstMatchDateTemplate: '${year}-08-29'
  },

  // -------- SUDAMÉRICA RUGBY --------
  {
    shortName: 'W_SAR_T',
    name: 'Americas Rugby Trophy Women',
    confederationId: 'sudamerica_rugby',
    format: 'regional_pool',
    gender: 'women', ageCategory: 'senior',
    tier: 0,
    memberCountryCodes: ['BRA', 'COL', 'ARG', 'CHI'],
    rules: { ...DEFAULT_INTERNATIONAL_RULES },
    firstMatchDateTemplate: '${year + 1}-05-09'
  },

  // -------- RUGBY AMERICAS NORTH --------
  {
    shortName: 'W_RAN',
    name: 'RAN Women XV',
    confederationId: 'rugby_americas_north',
    format: 'regional_pool',
    gender: 'women', ageCategory: 'senior',
    tier: 0,
    memberCountryCodes: ['MEX', 'JAM', 'TTO'],
    rules: { ...DEFAULT_INTERNATIONAL_RULES },
    firstMatchDateTemplate: '${year + 1}-06-13'
  },

  // -------- RUGBY AFRICA --------
  {
    shortName: 'W_AFR_CUP',
    name: 'Rugby Africa Women Cup',
    confederationId: 'rugby_africa',
    format: 'regional_pool',
    gender: 'women', ageCategory: 'senior',
    tier: 0,
    pyramidId: 'afr_women_xv', pyramidLevel: 0,
    memberCountryCodes: ['MDG', 'KEN', 'UGA', 'TUN'],
    rules: rulesWithPyramid(0, 1),
    firstMatchDateTemplate: '${year + 1}-04-25'
  },
  {
    shortName: 'W_AFR_DIV',
    name: 'Rugby Africa Women Division One',
    confederationId: 'rugby_africa',
    format: 'regional_pool',
    gender: 'women', ageCategory: 'senior',
    tier: 1,
    pyramidId: 'afr_women_xv', pyramidLevel: 1,
    memberCountryCodes: ['ZAM', 'BWA', 'CMR', 'SEN'],
    rules: rulesWithPyramid(1, 0),
    firstMatchDateTemplate: '${year + 1}-05-09'
  },

  // -------- ASIA RUGBY --------
  {
    shortName: 'W_ASI_CH',
    name: 'Asia Rugby Women Championship',
    confederationId: 'asia_rugby',
    format: 'regional_pool',
    gender: 'women', ageCategory: 'senior',
    tier: 0,
    memberCountryCodes: ['JPN', 'KAZ', 'HKG'],
    rules: { ...DEFAULT_INTERNATIONAL_RULES },
    firstMatchDateTemplate: '${year + 1}-05-30'
  },

  // -------- GLOBAL (WORLD RUGBY) --------
  {
    shortName: 'P4',
    name: 'Pacific Four Series',
    confederationId: null,
    format: 'regional_pool',
    gender: 'women', ageCategory: 'senior',
    tier: 0,
    memberCountryCodes: ['AUS', 'CAN', 'NZL', 'USA'],
    rules: { ...DEFAULT_INTERNATIONAL_RULES },
    firstMatchDateTemplate: '${year + 1}-07-04'
  },

  // =========================================================================
  // SEVENS REGIONALES (Fase E) — pathway hacia HSBC SVNS Division 3 y Series
  // =========================================================================

  // -------- RUGBY EUROPE --------
  {
    shortName: 'REC_7M',
    name: 'Rugby Europe Sevens Championship (M)',
    confederationId: 'rugby_europe',
    format: 'regional_pool',
    gender: 'men', ageCategory: 'senior',
    tier: 0,
    memberCountryCodes: ['POR', 'IRL', 'GEO', 'ESP', 'GER', 'FRA', 'POL', 'ITA'],
    rules: { ...DEFAULT_INTERNATIONAL_RULES, tryBonus: false, losingBonus: false },
    firstMatchDateTemplate: '${year + 1}-06-13'
  },
  {
    shortName: 'REC_7W',
    name: 'Rugby Europe Sevens Championship (F)',
    confederationId: 'rugby_europe',
    format: 'regional_pool',
    gender: 'women', ageCategory: 'senior',
    tier: 0,
    memberCountryCodes: ['ESP', 'FRA', 'IRL', 'GBR', 'POR', 'POL', 'NED', 'ITA'],
    rules: { ...DEFAULT_INTERNATIONAL_RULES, tryBonus: false, losingBonus: false },
    firstMatchDateTemplate: '${year + 1}-06-20'
  },

  // -------- RUGBY AMERICAS NORTH --------
  {
    shortName: 'RAN_7M',
    name: 'RAN Sevens (M)',
    confederationId: 'rugby_americas_north',
    format: 'regional_pool',
    gender: 'men', ageCategory: 'senior',
    tier: 0,
    memberCountryCodes: ['USA', 'CAN', 'JAM', 'MEX', 'TTO', 'BAR'],
    rules: { ...DEFAULT_INTERNATIONAL_RULES, tryBonus: false, losingBonus: false },
    firstMatchDateTemplate: '${year}-11-07'
  },
  {
    shortName: 'RAN_7W',
    name: 'RAN Sevens (F)',
    confederationId: 'rugby_americas_north',
    format: 'regional_pool',
    gender: 'women', ageCategory: 'senior',
    tier: 0,
    memberCountryCodes: ['USA', 'CAN', 'JAM', 'MEX', 'TTO', 'BAR'],
    rules: { ...DEFAULT_INTERNATIONAL_RULES, tryBonus: false, losingBonus: false },
    firstMatchDateTemplate: '${year}-11-07'
  },

  // -------- SUDAMÉRICA RUGBY --------
  {
    shortName: 'SAR_7M',
    name: 'Sudamericano Sevens (M)',
    confederationId: 'sudamerica_rugby',
    format: 'regional_pool',
    gender: 'men', ageCategory: 'senior',
    tier: 0,
    memberCountryCodes: ['ARG', 'URU', 'CHI', 'BRA', 'PAR', 'COL'],
    rules: { ...DEFAULT_INTERNATIONAL_RULES, tryBonus: false, losingBonus: false },
    firstMatchDateTemplate: '${year + 1}-02-21'
  },
  {
    shortName: 'SAR_7W',
    name: 'Sudamericano Sevens (F)',
    confederationId: 'sudamerica_rugby',
    format: 'regional_pool',
    gender: 'women', ageCategory: 'senior',
    tier: 0,
    memberCountryCodes: ['BRA', 'ARG', 'COL', 'CHI', 'URU', 'PAR'],
    rules: { ...DEFAULT_INTERNATIONAL_RULES, tryBonus: false, losingBonus: false },
    firstMatchDateTemplate: '${year + 1}-02-21'
  },

  // -------- RUGBY AFRICA --------
  {
    shortName: 'AFR_7M',
    name: 'Rugby Africa Sevens (M)',
    confederationId: 'rugby_africa',
    format: 'regional_pool',
    gender: 'men', ageCategory: 'senior',
    tier: 0,
    memberCountryCodes: ['ZAF', 'KEN', 'NAM', 'UGA', 'ZIM', 'MAR'],
    rules: { ...DEFAULT_INTERNATIONAL_RULES, tryBonus: false, losingBonus: false },
    firstMatchDateTemplate: '${year + 1}-09-12'
  },
  {
    shortName: 'AFR_7W',
    name: 'Rugby Africa Sevens (F)',
    confederationId: 'rugby_africa',
    format: 'regional_pool',
    gender: 'women', ageCategory: 'senior',
    tier: 0,
    memberCountryCodes: ['ZAF', 'KEN', 'MDG', 'UGA', 'TUN', 'ZAM'],
    rules: { ...DEFAULT_INTERNATIONAL_RULES, tryBonus: false, losingBonus: false },
    firstMatchDateTemplate: '${year + 1}-09-12'
  },

  // -------- ASIA RUGBY --------
  {
    shortName: 'ASI_7M',
    name: 'Asia Rugby Sevens Series (M)',
    confederationId: 'asia_rugby',
    format: 'regional_pool',
    gender: 'men', ageCategory: 'senior',
    tier: 0,
    memberCountryCodes: ['JPN', 'HKG', 'KOR', 'SRI', 'MAS', 'CHN'],
    rules: { ...DEFAULT_INTERNATIONAL_RULES, tryBonus: false, losingBonus: false },
    firstMatchDateTemplate: '${year + 1}-10-10'
  },
  {
    shortName: 'ASI_7W',
    name: 'Asia Rugby Sevens Series (F)',
    confederationId: 'asia_rugby',
    format: 'regional_pool',
    gender: 'women', ageCategory: 'senior',
    tier: 0,
    memberCountryCodes: ['JPN', 'HKG', 'KAZ', 'CHN', 'KOR', 'THA'],
    rules: { ...DEFAULT_INTERNATIONAL_RULES, tryBonus: false, losingBonus: false },
    firstMatchDateTemplate: '${year + 1}-10-10'
  },

  // -------- OCEANIA RUGBY --------
  {
    shortName: 'OCE_7M',
    name: 'Oceania Sevens (M)',
    confederationId: 'oceania_rugby',
    format: 'regional_pool',
    gender: 'men', ageCategory: 'senior',
    tier: 0,
    memberCountryCodes: ['FIJ', 'NZL', 'AUS', 'SAM', 'TGA', 'PNG'],
    rules: { ...DEFAULT_INTERNATIONAL_RULES, tryBonus: false, losingBonus: false },
    firstMatchDateTemplate: '${year}-11-14'
  },
  {
    shortName: 'OCE_7W',
    name: 'Oceania Sevens (F)',
    confederationId: 'oceania_rugby',
    format: 'regional_pool',
    gender: 'women', ageCategory: 'senior',
    tier: 0,
    memberCountryCodes: ['NZL', 'AUS', 'FIJ', 'SAM', 'TGA', 'PNG'],
    rules: { ...DEFAULT_INTERNATIONAL_RULES, tryBonus: false, losingBonus: false },
    firstMatchDateTemplate: '${year}-11-14'
  },

  // =========================================================================
  // JUVENILES (Fase E)
  // =========================================================================

  // -------- WORLD U20 (GLOBAL) --------
  {
    shortName: 'WU20',
    name: 'World Rugby U20 Championship',
    confederationId: null,
    format: 'regional_pool',
    gender: 'men', ageCategory: 'u20',
    tier: 0,
    // 12 selecciones top U20: 6N + RC + Top 2 emergentes.
    memberCountryCodes: ['ENG', 'FRA', 'IRL', 'SCO', 'WAL', 'ITA', 'NZL', 'AUS', 'ZAF', 'ARG', 'FIJ', 'GEO'],
    rules: { ...DEFAULT_INTERNATIONAL_RULES },
    firstMatchDateTemplate: '${year + 1}-06-27'
  },

  // -------- RUGBY EUROPE U20 --------
  {
    shortName: 'REC_U20',
    name: 'Rugby Europe U20 Championship',
    confederationId: 'rugby_europe',
    format: 'regional_pool',
    gender: 'men', ageCategory: 'u20',
    tier: 1,
    memberCountryCodes: ['ESP', 'POR', 'ROU', 'NED', 'BEL', 'GER'],
    rules: { ...DEFAULT_INTERNATIONAL_RULES },
    firstMatchDateTemplate: '${year + 1}-04-04'
  },

  // -------- RUGBY AFRICA U20 (Barthés Trophy) --------
  {
    shortName: 'AFR_U20',
    name: 'Barthés Trophy U20',
    confederationId: 'rugby_africa',
    format: 'regional_pool',
    gender: 'men', ageCategory: 'u20',
    tier: 0,
    memberCountryCodes: ['ZAF', 'NAM', 'KEN', 'ZIM'],
    rules: { ...DEFAULT_INTERNATIONAL_RULES },
    firstMatchDateTemplate: '${year + 1}-04-25'
  },

  // -------- RUGBY AMERICAS NORTH U19 --------
  {
    shortName: 'RAN_U19',
    name: 'RAN U19 Men XVs',
    confederationId: 'rugby_americas_north',
    format: 'regional_pool',
    gender: 'men', ageCategory: 'u19',
    tier: 0,
    memberCountryCodes: ['USA', 'CAN', 'MEX', 'JAM', 'TTO'],
    rules: { ...DEFAULT_INTERNATIONAL_RULES },
    firstMatchDateTemplate: '${year + 1}-07-25'
  },

  // -------- SUDAMÉRICA RUGBY M18 --------
  {
    shortName: 'SAR_M18',
    name: 'Sudamericano M18',
    confederationId: 'sudamerica_rugby',
    format: 'regional_pool',
    gender: 'men', ageCategory: 'u18',
    tier: 0,
    memberCountryCodes: ['ARG', 'URU', 'CHI', 'BRA', 'PAR', 'COL'],
    rules: { ...DEFAULT_INTERNATIONAL_RULES },
    firstMatchDateTemplate: '${year + 1}-05-09'
  }
]

// =============================================================================
// NATIONS QUE NECESITAN POOL DE JUGADORES PARA SIMULAR LAS COMPETICIONES
// =============================================================================

/** Códigos ISO-3 de selecciones que requieren generador de pool propio para
 *  poder ser simuladas en las competiciones regionales de Fase B.
 *  Se computa como la unión de todos los memberCountryCodes de las
 *  competiciones, menos los que ya están en NATL_WITH_POOL del demoWorld. */
export const NATIONS_IN_REGIONAL_COMPETITIONS: string[] = Array.from(
  new Set(ALL_REGIONAL_COMPETITIONS.flatMap((c) => c.memberCountryCodes))
)

// =============================================================================
// HELPER: PARSEAR PLANTILLA DE FECHA
// =============================================================================

/** Sustituye `${year}` y `${year + 1}` en la plantilla por fechas reales. */
export function resolveDateTemplate(template: string, year: number): string {
  return template
    .replace(/\$\{year \+ 1\}/g, String(year + 1))
    .replace(/\$\{year\}/g, String(year))
}

// =============================================================================
// HELPER: SIMPLIFIED MODE FILTER
// =============================================================================

/** En modo 'simplified': sólo 1 Tier1 + 1 Tier2 por confederación.
 *  En 'detailed': todas las competencias. */
export function selectRegionalCompetitions(
  mode: 'simplified' | 'detailed'
): RegionalCompetitionData[] {
  if (mode === 'detailed') return ALL_REGIONAL_COMPETITIONS

  // simplified: mantiene PNC (global) y un Tier 0 + un Tier 1 por confederación
  // si están definidos. Sin Conference, sin Tier 2.
  const byConfed: Record<string, RegionalCompetitionData[]> = {}
  for (const c of ALL_REGIONAL_COMPETITIONS) {
    const key: string = c.confederationId ?? '_global'
    byConfed[key] = byConfed[key] ?? []
    byConfed[key].push(c)
  }
  const out: RegionalCompetitionData[] = []
  for (const key of Object.keys(byConfed)) {
    if (key === '_global') {
      out.push(...byConfed[key])
      continue
    }
    const tier0 = byConfed[key].find((c) => c.tier === 0)
    const tier1 = byConfed[key].find((c) => c.tier === 1)
    if (tier0) out.push(tier0)
    if (tier1) out.push(tier1)
  }
  return out
}

/** Pirámides aplicables al modo simulación elegido. Simplificado deja sólo
 *  pirámides cuyo tier 0 y tier 1 están ambos en el set. */
export function selectPyramids(
  mode: 'simplified' | 'detailed'
): PyramidData[] {
  if (mode === 'detailed') return ALL_PYRAMIDS
  // En simplified, las pirámides REC/RAN/AFR/ASI siguen aplicando pero sólo
  // entre los dos primeros niveles. Recortamos a max 2 levels.
  return ALL_PYRAMIDS.map((p) => ({ ...p, levels: p.levels.slice(0, 2) }))
}

export const REGIONAL_COMPETITIONS_BY_CONFEDERATION: Record<ConfederationId | '_global', RegionalCompetitionData[]> = (() => {
  const acc: Record<string, RegionalCompetitionData[]> = {}
  for (const c of ALL_REGIONAL_COMPETITIONS) {
    const key = c.confederationId ?? '_global'
    acc[key] = acc[key] ?? []
    acc[key].push(c)
  }
  return acc as Record<ConfederationId | '_global', RegionalCompetitionData[]>
})()
