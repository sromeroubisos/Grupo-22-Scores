// Soporte para selecciones nacionales: cómo construir el XV titular de un país
// a partir de los jugadores con esa nacionalidad, género y categoría de edad.

import type { Player, Country, World, Gender, AgeCategory } from '../types/index.ts'
import { isAvailable } from '../types/index.ts'
import type { MatchTeam } from './types.ts'
import { computeTeamRating, depthAdjustment } from './teamRating.ts'
import { playersOfNation } from './indexes.ts'

/** Devuelve los jugadores elegibles para una selección.
 *  Si se pasa `gender`, filtra por género del jugador (default 'men' si el
 *  jugador no lo tiene). Si se pasa `ageCategory`, filtra por categoría
 *  (default 'senior'). Saves anteriores a v3 no tienen estos campos: la
 *  función trata `undefined` como 'men'/'senior' implícitos. */
export function eligiblePlayers(
  world: World,
  countryId: string,
  gender?: Gender,
  ageCategory?: AgeCategory
): Player[] {
  return playersOfNation(world.players, countryId).filter((p) => {
    if (gender !== undefined) {
      const playerGender = p.gender ?? 'men'
      if (playerGender !== gender) return false
    }
    if (ageCategory !== undefined) {
      const playerAge = p.ageCategory ?? 'senior'
      if (playerAge !== ageCategory) return false
    }
    return true
  })
}

/** Construye un XV titular para la selección: mejor CA por posición, sin lesionados. */
export function pickNationalXV(
  world: World,
  countryId: string,
  gender?: Gender,
  ageCategory?: AgeCategory
): Player[] {
  const candidates = eligiblePlayers(world, countryId, gender, ageCategory).filter(isAvailable)
  const starters: Player[] = []
  for (let pos = 1; pos <= 15; pos++) {
    const best = candidates
      .filter((p) => p.primaryPosition === pos)
      .sort((a, b) => b.currentAbility - a.currentAbility)[0]
    if (best) starters.push(best)
  }
  return starters
}

/** Construye un MatchTeam para una selección nacional. Los parámetros `gender`
 *  y `ageCategory` determinan qué plantilla (M/F, Senior/U20/...) se selecciona.
 *  Sevens reutiliza el XV titular como aproximación (el modelo de partido es
 *  el mismo motor); refinar a un VII puro queda para una iteración futura. */
export function buildNationalMatchTeam(
  country: Country,
  world: World,
  gender?: Gender,
  ageCategory?: AgeCategory
): MatchTeam {
  const squad = eligiblePlayers(world, country.id, gender, ageCategory)
  const starters = pickNationalXV(world, country.id, gender, ageCategory)
  const baseRating = computeTeamRating(starters)
  return {
    clubId: country.id,
    clubName: country.name,
    shortName: country.code,
    rating: depthAdjustment(squad, starters, baseRating),
    starters,
    bench: []
  }
}
