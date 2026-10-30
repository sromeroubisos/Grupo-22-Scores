// Cálculo de la tabla de clasificación a partir de los partidos jugados.
//
// Sistema de puntuación (configurable vía competition.rules):
//   Victoria: 4 / Empate: 2 / Derrota: 0
//   Bonus ofensivo: +1 si anotas 4+ ensayos
//   Bonus defensivo: +1 si pierdes por <= 7 puntos
//
// Desempate: puntos > diferencia de tantos > ensayos a favor > victorias.

import type { ID, World } from '../types/index.ts'

export interface StandingsRow {
  clubId: ID
  played: number
  wins: number
  draws: number
  losses: number
  pointsFor: number
  pointsAgainst: number
  pointsDiff: number
  triesFor: number
  triesAgainst: number
  bonusTry: number
  bonusLosing: number
  totalPoints: number
}

export function computeStandings(competitionId: ID, world: World): StandingsRow[] {
  const comp = world.competitions.find((c) => c.id === competitionId)
  if (!comp) return []

  const rows = new Map<ID, StandingsRow>()
  for (const clubId of comp.clubIds) {
    rows.set(clubId, {
      clubId,
      played: 0, wins: 0, draws: 0, losses: 0,
      pointsFor: 0, pointsAgainst: 0, pointsDiff: 0,
      triesFor: 0, triesAgainst: 0,
      bonusTry: 0, bonusLosing: 0,
      totalPoints: 0
    })
  }

  const matches = world.matches.filter(
    (m) => m.competitionId === competitionId && m.played && m.result
  )

  for (const m of matches) {
    const h = rows.get(m.homeClubId)
    const a = rows.get(m.awayClubId)
    if (!h || !a || !m.result) continue
    const r = m.result
    h.played++; a.played++
    h.pointsFor += r.homeScore; h.pointsAgainst += r.awayScore
    a.pointsFor += r.awayScore; a.pointsAgainst += r.homeScore
    h.triesFor += r.homeTries; h.triesAgainst += r.awayTries
    a.triesFor += r.awayTries; a.triesAgainst += r.homeTries

    if (r.homeScore > r.awayScore) {
      h.wins++; a.losses++
      h.totalPoints += comp.rules.pointsForWin
      a.totalPoints += comp.rules.pointsForLoss
      if (comp.rules.losingBonus && (r.homeScore - r.awayScore) <= 7) {
        a.bonusLosing++; a.totalPoints += 1
      }
    } else if (r.awayScore > r.homeScore) {
      a.wins++; h.losses++
      a.totalPoints += comp.rules.pointsForWin
      h.totalPoints += comp.rules.pointsForLoss
      if (comp.rules.losingBonus && (r.awayScore - r.homeScore) <= 7) {
        h.bonusLosing++; h.totalPoints += 1
      }
    } else {
      h.draws++; a.draws++
      h.totalPoints += comp.rules.pointsForDraw
      a.totalPoints += comp.rules.pointsForDraw
    }

    if (comp.rules.tryBonus) {
      if (r.homeTries >= 4) { h.bonusTry++; h.totalPoints += 1 }
      if (r.awayTries >= 4) { a.bonusTry++; a.totalPoints += 1 }
    }
  }

  for (const row of rows.values()) row.pointsDiff = row.pointsFor - row.pointsAgainst

  return [...rows.values()].sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints
    if (b.pointsDiff !== a.pointsDiff) return b.pointsDiff - a.pointsDiff
    if (b.triesFor !== a.triesFor) return b.triesFor - a.triesFor
    return b.wins - a.wins
  })
}

/** Devuelve la posición (1-indexed) del club en la tabla. -1 si no está. */
export function findPosition(standings: StandingsRow[], clubId: ID): number {
  const idx = standings.findIndex((s) => s.clubId === clubId)
  return idx >= 0 ? idx + 1 : -1
}
