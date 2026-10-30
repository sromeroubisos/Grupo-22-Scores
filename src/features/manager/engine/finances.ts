// Ciclo mensual de finanzas: paga salarios, suma ingresos, aplica taquilla.
// Se invoca desde season.ts cuando la fecha cruza un cambio de mes.

import type { World, ID, ISODate } from '../types/index.ts'
import { monthlyWageMass } from '../types/index.ts'
import { contractsOfClub } from './indexes.ts'

export interface MonthlyMovement {
  clubId: ID
  income: number
  expense: number
  newCash: number
}

export interface MonthlyReport {
  month: string  // 'YYYY-MM'
  movements: MonthlyMovement[]
}

let lastMonthlyReport: MonthlyReport | null = null
export function getLastMonthlyReport(): MonthlyReport | null { return lastMonthlyReport }

/**
 * Aplica el cierre mensual: cobra ingresos fijos + taquilla de partidos en casa
 * del mes, paga salarios y gastos operativos. Devuelve un World nuevo.
 */
export function applyMonthlyFinances(world: World, dateBefore: ISODate, dateAfter: ISODate): World {
  // Detectar cambios de mes entre las dos fechas
  const monthsCrossed = monthsBetween(dateBefore, dateAfter)
  if (monthsCrossed.length === 0) return world

  const movements: MonthlyMovement[] = []
  let newClubs = world.clubs

  // Partidos de local jugados por club y mes: una pasada, no una por club.
  const homePlayed = new Map<string, number>()
  for (const m of world.matches) {
    if (!m.played) continue
    const key = `${m.homeClubId}|${m.date.slice(0, 7)}`
    homePlayed.set(key, (homePlayed.get(key) ?? 0) + 1)
  }

  for (const month of monthsCrossed) {
    const updatedClubs = newClubs.map((club) => {
      // Salarios: masa salarial mensual de los contratos del club
      const clubContracts = contractsOfClub(world.contracts, club.id)
      const wages = monthlyWageMass(clubContracts)

      // Taquilla: ingresos por partidos en casa jugados ese mes
      const homeMatchesThisMonth = homePlayed.get(`${club.id}|${month}`) ?? 0
      const ticketRevenuePerMatch = Math.round(club.stadium.capacity * 0.7 * 18) // 70% asistencia, 18€ medio
      const matchRevenue = homeMatchesThisMonth * ticketRevenuePerMatch

      // Otros ingresos/gastos
      const income = club.finances.monthlyIncome + matchRevenue
      const expense = club.finances.monthlyExpenses + wages
      const delta = income - expense
      const newCash = club.finances.cash + delta

      movements.push({ clubId: club.id, income, expense, newCash })

      return {
        ...club,
        finances: { ...club.finances, cash: newCash }
      }
    })
    newClubs = updatedClubs
  }

  lastMonthlyReport = {
    month: monthsCrossed[monthsCrossed.length - 1],
    movements
  }

  return { ...world, clubs: newClubs }
}

/** Devuelve la lista de meses (formato YYYY-MM) cuyo último día cae en [from, to]. */
function monthsBetween(from: ISODate, to: ISODate): string[] {
  const out: string[] = []
  const f = new Date(from)
  const t = new Date(to)
  // Iterar mes a mes desde el mes siguiente a "from" hasta "to" inclusive
  let cur = new Date(f.getFullYear(), f.getMonth(), 1)
  cur.setMonth(cur.getMonth() + 1) // primer día del mes siguiente
  while (cur <= t) {
    const mm = String(cur.getMonth() + 1).padStart(2, '0')
    out.push(`${cur.getFullYear()}-${mm}`)
    cur.setMonth(cur.getMonth() + 1)
  }
  return out
}
