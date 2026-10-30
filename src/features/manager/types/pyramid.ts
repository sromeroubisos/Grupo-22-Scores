// Pirámides regionales con ascenso/descenso declarativo.
//
// El `CompetitionRules.promotion` actual sólo dice "cuántos suben"; una
// Pyramid enlaza los niveles (Championship, Trophy, Conference, ...) y
// declara cuántos suben/bajan entre cada par adyacente. El seasonRollover
// itera las pirámides y mueve las selecciones (Country.id) entre las
// competition.clubIds correspondientes.

import type { ID } from './common.ts'
import type { ConfederationId } from './confederation.ts'
import type { Gender } from './gender.ts'
import type { AgeCategory } from './ageCategory.ts'

export interface PyramidLevel {
  /** shortName de la Competition asociada (resuelto a Competition.id al cargar). */
  competitionShortName: string
  /** Cuántas selecciones del nivel `i` ascienden al nivel `i-1` al final
   *  de la temporada. 0 = no asciende nadie. */
  promotionSlots: number
  /** Cuántas selecciones del nivel `i` descienden al nivel `i+1`. */
  relegationSlots: number
}

export interface Pyramid {
  id: ID
  name: string
  confederationId: ConfederationId
  gender: Gender
  ageCategory: AgeCategory
  /** Niveles ordenados de élite (índice 0) a base. Promoción del nivel `i`
   *  va al `i-1`; descenso del `i` va al `i+1`. */
  levels: PyramidLevel[]
}
