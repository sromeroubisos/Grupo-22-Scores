// Modelo de jugador de rugby.

import type { ID, ISODate, Ability } from './common.ts'
import type { Attributes } from './attributes.ts'
import type { Gender } from './gender.ts'
import type { AgeCategory } from './ageCategory.ts'

/** 15 posiciones numeradas, según convención internacional. */
export type RugbyPosition =
  | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8
  | 9 | 10 | 11 | 12 | 13 | 14 | 15

export const POSITION_NAMES: Record<RugbyPosition, string> = {
  1: 'Pilar izquierdo',
  2: 'Talonador',
  3: 'Pilar derecho',
  4: 'Segunda línea',
  5: 'Segunda línea',
  6: 'Tercera línea ala (blindside)',
  7: 'Tercera línea ala (openside)',
  8: 'Octavo',
  9: 'Medio melé',
  10: 'Apertura',
  11: 'Ala izquierda',
  12: 'Centro interno',
  13: 'Centro externo',
  14: 'Ala derecha',
  15: 'Zaguero'
}

export const POSITION_SHORT: Record<RugbyPosition, string> = {
  1: 'PI', 2: 'TA', 3: 'PD',
  4: 'SL', 5: 'SL',
  6: '6', 7: '7', 8: '8',
  9: 'MM', 10: 'AP',
  11: 'AI', 12: 'CI', 13: 'CE', 14: 'AD',
  15: 'ZA'
}

export type PositionGroup = 'front_row' | 'second_row' | 'back_row' | 'half_back' | 'centre' | 'back_three'

export const POSITION_GROUP: Record<RugbyPosition, PositionGroup> = {
  1: 'front_row', 2: 'front_row', 3: 'front_row',
  4: 'second_row', 5: 'second_row',
  6: 'back_row', 7: 'back_row', 8: 'back_row',
  9: 'half_back', 10: 'half_back',
  11: 'back_three', 14: 'back_three', 15: 'back_three',
  12: 'centre', 13: 'centre'
}

/** Tipos de lesión. */
export type InjuryType = 'muscle' | 'joint' | 'concussion' | 'fracture' | 'ligament' | 'bruise'

export const INJURY_TYPE_NAMES: Record<InjuryType, string> = {
  muscle: 'Muscular',
  joint: 'Articular',
  concussion: 'Conmoción cerebral',
  fracture: 'Fractura',
  ligament: 'Ligamentos',
  bruise: 'Contusión'
}

export interface Injury {
  type: InjuryType
  bodyPart: string             // 'isquio', 'rodilla', 'hombro', etc.
  weeksOut: number             // semanas restantes (se decrementa cada jornada)
  reportedDate: ISODate
}

export interface Player {
  id: ID
  firstName: string
  lastName: string
  dateOfBirth: ISODate
  nationalityIds: ID[]
  primaryPosition: RugbyPosition
  secondaryPositions: RugbyPosition[]
  heightCm: number
  weightKg: number
  clubId: ID | null
  contractId: ID | null
  attributes: Attributes
  currentAbility: Ability
  potentialAbility: Ability
  morale: number               // 0-100
  condition: number            // 0-100 (medio plazo)
  reputation: number
  /** Lesión activa, null si está sano. */
  injury: Injury | null
  /** Género. Opcional para compatibilidad con saves anteriores a v3;
   *  la migración v2→v3 asigna 'men' por defecto. */
  gender?: Gender
  /** Categoría de edad de la plantilla a la que pertenece. Default: 'senior'. */
  ageCategory?: AgeCategory
}

/** Devuelve true si el jugador está disponible para jugar. */
export function isAvailable(p: Player): boolean {
  return !p.injury || p.injury.weeksOut <= 0
}
