// Estadísticas por jugador. Las apariciones y los ensayos se derivan
// de los partidos (Match.result tiene homeStarterIds + homeTryScorers).

import type { World, ID, RugbyPosition, Player, Match } from '../types/index.ts'

export interface PlayerSeasonStats {
  playerId: string
  appearances: number
  tries: number
  ptsScored: number  // tries × 5 (futuras conversiones/penales sumarán)
}

/** Probabilidad relativa de anotar ensayo por posición. */
const TRY_WEIGHT_BY_POS: Record<RugbyPosition, number> = {
  1: 0.3, 2: 0.5, 3: 0.3, 4: 0.4, 5: 0.4,
  6: 0.6, 7: 0.7, 8: 1.0,
  9: 0.5, 10: 0.7,
  11: 1.6, 12: 1.0, 13: 1.2, 14: 1.6, 15: 1.0
}

/** Distribuye los ensayos entre los starters ponderando por posición. */
export function distributeTries(starters: Player[], tries: number, rng: () => number): ID[] {
  if (tries === 0 || starters.length === 0) return []
  const weights = starters.map((p) => TRY_WEIGHT_BY_POS[p.primaryPosition as RugbyPosition] ?? 0.5)
  const total = weights.reduce((a, b) => a + b, 0)
  const scorers: ID[] = []
  for (let i = 0; i < tries; i++) {
    let r = rng() * total
    for (let j = 0; j < starters.length; j++) {
      r -= weights[j]
      if (r <= 0) { scorers.push(starters[j].id); break }
    }
    if (scorers.length === i) scorers.push(starters[starters.length - 1].id)
  }
  return scorers
}

/** Agrega stats de un jugador en una temporada. */
export function getPlayerSeasonStats(world: World, seasonYear: number, playerId: ID): PlayerSeasonStats {
  let apps = 0, tries = 0
  for (const m of world.matches) {
    if (m.seasonYear !== seasonYear || !m.played || !m.result) continue
    const r = m.result
    if (r.homeStarterIds?.includes(playerId) || r.awayStarterIds?.includes(playerId)) apps++
    tries += r.homeTryScorers?.filter((id) => id === playerId).length ?? 0
    tries += r.awayTryScorers?.filter((id) => id === playerId).length ?? 0
  }
  return { playerId, appearances: apps, tries, ptsScored: tries * 5 }
}

/** Top N jugadores de la temporada por ensayos en una competición concreta (o todas). */
export function getTopScorers(
  world: World, seasonYear: number, competitionId: ID | null, n = 10
): PlayerSeasonStats[] {
  const counts = new Map<ID, { apps: number; tries: number }>()
  const matches = competitionId
    ? world.matches.filter((m) => m.competitionId === competitionId && m.seasonYear === seasonYear && m.played && m.result)
    : world.matches.filter((m) => m.seasonYear === seasonYear && m.played && m.result)
  for (const m of matches) {
    const r = m.result!
    const incr = (id: ID, kind: 'apps' | 'tries') => {
      const c = counts.get(id) ?? { apps: 0, tries: 0 }
      c[kind]++
      counts.set(id, c)
    }
    r.homeStarterIds?.forEach((id) => incr(id, 'apps'))
    r.awayStarterIds?.forEach((id) => incr(id, 'apps'))
    r.homeTryScorers?.forEach((id) => incr(id, 'tries'))
    r.awayTryScorers?.forEach((id) => incr(id, 'tries'))
  }
  const list: PlayerSeasonStats[] = []
  for (const [playerId, c] of counts) {
    if (c.tries > 0) list.push({ playerId, appearances: c.apps, tries: c.tries, ptsScored: c.tries * 5 })
  }
  return list.sort((a, b) => b.tries - a.tries || b.appearances - a.appearances).slice(0, n)
}

export function getTopAppearances(
  world: World, seasonYear: number, competitionId: ID | null, n = 10
): PlayerSeasonStats[] {
  const counts = new Map<ID, { apps: number; tries: number }>()
  const matches = competitionId
    ? world.matches.filter((m) => m.competitionId === competitionId && m.seasonYear === seasonYear && m.played && m.result)
    : world.matches.filter((m) => m.seasonYear === seasonYear && m.played && m.result)
  for (const m of matches) {
    const r = m.result!
    const incrApps = (id: ID) => {
      const c = counts.get(id) ?? { apps: 0, tries: 0 }
      c.apps++
      counts.set(id, c)
    }
    r.homeStarterIds?.forEach(incrApps)
    r.awayStarterIds?.forEach(incrApps)
    r.homeTryScorers?.forEach((id) => {
      const c = counts.get(id) ?? { apps: 0, tries: 0 }
      c.tries++
      counts.set(id, c)
    })
    r.awayTryScorers?.forEach((id) => {
      const c = counts.get(id) ?? { apps: 0, tries: 0 }
      c.tries++
      counts.set(id, c)
    })
  }
  const list: PlayerSeasonStats[] = []
  for (const [playerId, c] of counts) {
    list.push({ playerId, appearances: c.apps, tries: c.tries, ptsScored: c.tries * 5 })
  }
  return list.sort((a, b) => b.appearances - a.appearances).slice(0, n)
}
