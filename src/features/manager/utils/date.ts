import type { ISODate } from '../types/index.ts'

export function parseISODate(iso: ISODate): Date {
  const [year, month, day] = iso.split('-').map(Number)
  return new Date(year, month - 1, day)
}

export function toISODate(date: Date): ISODate {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Suma dias a una fecha ISO. Devuelve nueva ISODate. */
export function addDays(iso: ISODate, days: number): ISODate {
  const d = parseISODate(iso)
  d.setDate(d.getDate() + days)
  return toISODate(d)
}

export function daysBetween(from: ISODate, to: ISODate): number {
  const start = parseISODate(from).getTime()
  const end = parseISODate(to).getTime()
  return Math.round((end - start) / 86400000)
}

/** Edad cumplida hoy (o en `today` si se pasa) a partir de una fecha de nacimiento ISO. */
export function ageFromDOB(dob: ISODate, today: ISODate): number {
  // Aritmética sobre la cadena ISO (AAAA-MM-DD): se llama por cada jugador en cada fecha
  // (17.000 × 50 fechas), y crear dos Date por llamada era el 24 % del tiempo de simulación.
  let age = Number(today.slice(0, 4)) - Number(dob.slice(0, 4))
  const m = Number(today.slice(5, 7)) - Number(dob.slice(5, 7))
  if (m < 0 || (m === 0 && Number(today.slice(8, 10)) < Number(dob.slice(8, 10)))) age--
  return age
}

/** Formatea una ISODate como '15 ago 2026'. */
export function formatDateES(iso: ISODate): string {
  const d = parseISODate(iso)
  const months = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`
}

export function monthKey(iso: ISODate): string {
  return iso.slice(0, 7)
}

export function daysInMonth(key: string): ISODate[] {
  const [year, month] = key.split('-').map(Number)
  const count = new Date(year, month, 0).getDate()
  return Array.from({ length: count }, (_, i) =>
    `${year}-${String(month).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`
  )
}

export function formatMonthES(key: string): string {
  const [year, month] = key.split('-').map(Number)
  const months = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
  return `${months[month - 1]} ${year}`
}

export function formatWeekdayES(iso: ISODate): string {
  const d = parseISODate(iso)
  const days = ['dom','lun','mar','mie','jue','vie','sab']
  return days[d.getDay()]
}
