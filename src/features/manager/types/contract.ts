// Contratos: relacionan a un jugador o staff con un club.

import type { ID, ISODate } from './common.ts'

export type SquadRole = 'star' | 'first_team' | 'rotation' | 'backup' | 'academy'

export const SQUAD_ROLE_NAMES: Record<SquadRole, string> = {
  star: 'Estrella del equipo',
  first_team: 'Titular',
  rotation: 'Rotación',
  backup: 'Suplente',
  academy: 'Academia'
}

export interface Contract {
  id: ID
  personId: ID
  clubId: ID
  /** Salario bruto anual en la moneda local del club. */
  salaryPerYear: number
  signingBonus: number
  appearanceFee: number
  tryBonus: number
  titleBonus: number
  startDate: ISODate
  endDate: ISODate
  /** Cláusula de salida, null si no hay. */
  releaseClause: number | null
  isCaptain: boolean
  squadRole: SquadRole
}

/** Devuelve la masa salarial mensual del club a partir de su lista de contratos. */
export function monthlyWageMass(contracts: Contract[]): number {
  return Math.round(contracts.reduce((sum, c) => sum + c.salaryPerYear, 0) / 12)
}

/** Devuelve true si el contrato está activo a una fecha dada. */
export function isContractActive(c: Contract, date: ISODate): boolean {
  return c.startDate <= date && c.endDate >= date
}

/** Estima el salario justo para un jugador según su CA, edad y rol. */
export function fairSalaryForCA(currentAbility: number, age: number): number {
  // CA 80 → ~30k€/año, CA 150 → ~150k€/año, CA 180 → ~250k€/año
  const base = Math.pow(currentAbility / 100, 2.2) * 60000
  const ageFactor = age < 23 ? 0.75 : age < 28 ? 1.0 : age < 32 ? 1.15 : 0.85
  return Math.round((base * ageFactor) / 1000) * 1000
}
