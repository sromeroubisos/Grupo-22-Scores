// Manager profile: el personaje del usuario en la partida.

import type { ID, ISODate } from './common.ts'

export interface CareerStint {
  clubId: ID
  clubName: string  // cached para mostrar incluso si club cambia
  startDate: ISODate
  endDate: ISODate | null   // null = actualmente en este club
}

export interface Trophy {
  competitionId: ID
  competitionName: string
  seasonYear: number
  clubId: ID
  clubName: string
}

export interface Manager {
  name: string
  birthDate: ISODate
  nationality: string         // codigo de region/nacionalidad, e.g. 'ES' o 'ENG'
  dateAppointed: ISODate       // fecha de inicio de carrera
  careerHistory: CareerStint[]
  trophies: Trophy[]
}

export function newManager(name: string, age: number, nationality: string, today: ISODate): Manager {
  const yr = new Date(today).getFullYear() - age
  return {
    name,
    birthDate: `${yr}-06-15`,
    nationality,
    dateAppointed: today,
    careerHistory: [],
    trophies: []
  }
}
