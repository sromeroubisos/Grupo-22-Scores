// Cuerpo técnico y otros roles no jugadores.

import type { ID, AttrScore } from './common.ts'

export type StaffRole =
  | 'head_coach'
  | 'assistant_coach'
  | 'defence_coach'
  | 'attack_coach'
  | 'forwards_coach'
  | 'backs_coach'
  | 'kicking_coach'
  | 'set_piece_coach'
  | 'fitness_coach'
  | 'physio'
  | 'doctor'
  | 'analyst'
  | 'scout'
  | 'academy_director'

export const STAFF_ROLE_NAMES: Record<StaffRole, string> = {
  head_coach: 'Entrenador principal',
  assistant_coach: 'Entrenador asistente',
  defence_coach: 'Entrenador de defensa',
  attack_coach: 'Entrenador de ataque',
  forwards_coach: 'Entrenador de delanteros',
  backs_coach: 'Entrenador de tres-cuartos',
  kicking_coach: 'Entrenador de patadas',
  set_piece_coach: 'Entrenador de set pieces',
  fitness_coach: 'Preparador físico',
  physio: 'Fisioterapeuta',
  doctor: 'Médico',
  analyst: 'Analista',
  scout: 'Ojeador',
  academy_director: 'Director de academia'
}

export interface StaffAttrs {
  coaching: AttrScore
  manManagement: AttrScore
  judgingAbility: AttrScore
  judgingPotential: AttrScore
  workingWithYouth: AttrScore
  attackCoaching: AttrScore
  defenceCoaching: AttrScore
  fitnessCoaching: AttrScore
  setPieceCoaching: AttrScore
}

export interface Staff {
  id: ID
  firstName: string
  lastName: string
  role: StaffRole
  clubId: ID | null
  contractId: ID | null
  attributes: StaffAttrs
  reputation: number
}
