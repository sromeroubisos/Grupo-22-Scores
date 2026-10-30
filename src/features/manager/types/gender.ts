// Género de competición/plantel. Usado por Competition, Player, WorldRankingState
// para separar circuitos masculino y femenino, que en World Rugby tienen
// rankings y calendarios independientes.

export type Gender = 'men' | 'women'

export const GENDER_LABELS: Record<Gender, string> = {
  men: 'Masculino',
  women: 'Femenino'
}
