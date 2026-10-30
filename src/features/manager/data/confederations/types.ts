// Tipos internos del catálogo regional. Distintos a `Competition` porque
// trabajan con código de país (ISO-3) en vez de Country.id. La conversión
// a Competition.id real se hace al sembrar en `createDemoWorld`.

import type {
  CompetitionFormat,
  CompetitionRules,
  ConfederationId,
  Gender,
  AgeCategory
} from '../../types/index.ts'

export interface RegionalCompetitionData {
  shortName: string
  name: string
  confederationId: ConfederationId | null
  format: CompetitionFormat
  gender: Gender
  ageCategory: AgeCategory
  /** Disciplina: 'xv' (default) o 'sevens'. */
  discipline?: 'xv' | 'sevens'
  /** Posición dentro de la pirámide regional (0 = Championship, 1 = Trophy, ...). */
  tier: number
  pyramidId?: string
  pyramidLevel?: number
  /** Códigos ISO-3 de las selecciones que disputan la competición en la
   *  temporada inicial. La pirámide rotará estos miembros temporada tras
   *  temporada según ascensos/descensos. */
  memberCountryCodes: string[]
  rules: CompetitionRules
  /** Fecha-ancla de la primera jornada en la temporada Y, plantilla con
   *  `${year}` o `${year + 1}` substituible. */
  firstMatchDateTemplate: string
  /** Días entre jornadas para round-robin (default 7). */
  daysBetweenRounds?: number
}

export interface PyramidData {
  id: string
  name: string
  confederationId: ConfederationId
  gender: Gender
  ageCategory: AgeCategory
  /** Niveles de élite (0) a base. Para cada par (i, i+1) declara cuántas
   *  selecciones suben/bajan. */
  levels: Array<{
    competitionShortName: string
    promotionSlots: number
    relegationSlots: number
  }>
}

/** Reglas estándar para competencias entre selecciones (round-robin o KO).
 *  4 pts victoria, 2 empate, 0 derrota, bonus por ensayos y bonus de
 *  derrota cerrada. Sin playoff (a menos que el formato lo defina). */
export const DEFAULT_INTERNATIONAL_RULES: CompetitionRules = {
  pointsForWin: 4,
  pointsForDraw: 2,
  pointsForLoss: 0,
  tryBonus: true,
  losingBonus: true,
  hasPlayoff: false,
  playoffTeams: 0,
  promotion: 0,
  relegation: 0
}

/** Helper para crear rules con promoción y descenso configurables. */
export function rulesWithPyramid(promotion: number, relegation: number): CompetitionRules {
  return { ...DEFAULT_INTERNATIONAL_RULES, promotion, relegation }
}
