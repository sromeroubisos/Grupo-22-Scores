// Clubes profesionales.

import type { ID } from './common.ts'

export interface Stadium {
  name: string
  capacity: number
  city: string
}

export interface Finances {
  /** Tesorería disponible. */
  cash: number
  monthlyIncome: number
  monthlyExpenses: number
  /** Tope salarial (salary cap), null = sin tope. */
  salaryCap: number | null
  /** Presupuesto disponible para fichajes (salarios). */
  wageBudget: number
  /** Presupuesto disponible para traspasos. */
  transferBudget: number
}

export interface Club {
  id: ID
  name: string
  shortName: string
  foundedYear: number
  countryId: ID
  city: string
  stadium: Stadium
  primaryColor: string    // hex, ej '#1F4E79'
  secondaryColor: string
  /** Reputación 0-100. Afecta ingresos, fichajes y prensa. */
  reputation: number
  /** Elo del club. Init 1500. Se actualiza tras cada partido de liga/copa. */
  eloRating: number
  finances: Finances
  /** IDs de competiciones en las que participa. */
  competitionIds: ID[]
  /** Id del club en el catálogo de G22 (el mismo que usan los otros juegos). */
  catalogId?: string
  /** Ruta pública del escudo real (`/clubs/<id>.png`), o null si no hay archivo. */
  crest?: string | null
}
