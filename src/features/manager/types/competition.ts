// Competiciones: ligas, copas, europeas e internacionales.

import type { ID } from './common.ts'
import type { Gender } from './gender.ts'
import type { AgeCategory } from './ageCategory.ts'
import type { ConfederationId } from './confederation.ts'

export type CompetitionFormat =
  | 'league'              // liga regular
  | 'cup'                 // copa nacional
  | 'european'            // competiciones continentales (Champions Cup, Challenge)
  | 'international'       // selecciones round-robin (Six Nations, Rugby Championship)
  | 'international_split' // dos ventanas + Finals Weekend (Nations Championship, Nations Cup)
  | 'sevens_circuit'      // circuito de etapas (HSBC SVNS)
  | 'world_cup'           // Mundial
  | 'regional_pool'       // selecciones round-robin 4-8 eq (Africa Cup, Asia Champ, REC Champ)
  | 'ko_bracket'          // selecciones knockout (Asia Div1, Africa Repechage)
  | 'two_leg_playoff'     // ida y vuelta entre selecciones (Brasil-Colombia, REC qualifier)
  | 'sudamericano_bracket'// semis ida-vuelta + final ida-vuelta (Sudamericano)

export interface CompetitionRules {
  pointsForWin: number
  pointsForDraw: number
  pointsForLoss: number
  /** Bonus por anotar 4+ ensayos. */
  tryBonus: boolean
  /** Bonus por perder por menos de 7 puntos. */
  losingBonus: boolean
  hasPlayoff: boolean
  /** Equipos que entran en el play-off (0 = sin play-off). */
  playoffTeams: number
  /** Equipos que ascienden a la siguiente división. */
  promotion: number
  /** Equipos que descienden. */
  relegation: number
}

export interface Competition {
  id: ID
  name: string
  shortName: string
  /** null = competición internacional o continental, sin país único. */
  countryId: ID | null
  format: CompetitionFormat
  /** Tier dentro del país (1 = máxima, 2 = segunda, etc.). */
  tier: number
  rules: CompetitionRules
  clubIds: ID[]
  /** Si está definido, la competición SOLO se disputa estos seasonYear
   *  (genera fixtures, cuenta en isSeasonComplete). undefined = siempre. */
  activeYears?: number[]
  /** Género del torneo. Opcional para compatibilidad con saves anteriores a v3;
   *  la migración v2→v3 lo infiere por shortName. Default lógico: 'men'. */
  gender?: Gender
  /** Categoría de edad. Opcional por compatibilidad. Default: 'senior'. */
  ageCategory?: AgeCategory
  /** Disciplina: 'xv' (rugby 15 jugadores, default) o 'sevens' (rugby 7).
   *  World Rugby mantiene rankings separados para cada disciplina; los tests
   *  XV no afectan al ranking sevens y viceversa. */
  discipline?: 'xv' | 'sevens'
  /** Confederación a la que pertenece. Undefined = competición global
   *  (RWC, WRWC, WXV, Pacific Nations Cup, SVNS, Champions Cup). */
  confederationId?: ConfederationId
  /** Si la competición forma parte de una pirámide regional con ascenso/descenso,
   *  el id de esa pirámide. La pirámide define la cadena Championship→Trophy→… */
  pyramidId?: ID
  /** Nivel dentro de la pirámide (0 = élite, 1 = Trophy, etc.). */
  pyramidLevel?: number
}
