// Tipos comunes usados en todo el dominio.

export type ID = string

export interface Named {
  id: ID
  name: string
}

/** Fecha en formato ISO 'YYYY-MM-DD'. Más manejable que Date para serializar. */
export type ISODate = string

export type Region =
  | 'europe'
  | 'oceania'
  | 'south_america'
  | 'north_america'
  | 'africa'
  | 'asia'

/** Escala 1-20 para atributos de jugador. */
export type AttrScore = number

/** Capacidad Actual / Potencial: escala 1-200. */
export type Ability = number
