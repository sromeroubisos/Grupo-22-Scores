// Índices de lectura sobre las listas grandes del mundo.
//
// El mundo trae ~17.000 jugadores, ~17.000 contratos y ~5.000 partidos, y el
// motor los recorría ENTEROS por cada club (431) y por cada partido: ~10 millones
// de comparaciones por fecha. Un índice por clave se arma UNA vez por lista y se
// reutiliza mientras la lista sea la misma. El mundo es inmutable: cualquier
// cambio genera una lista nueva, y la nueva se indexa de nuevo (WeakMap por
// identidad). El ORDEN de cada grupo es el de la lista original, así que los
// resultados son idénticos a los del `filter` que reemplazan.
import type { Contract, ID, Player } from '../types/index.ts'

function groupBy<T>(items: readonly T[], keys: (item: T) => readonly ID[]): Map<ID, T[]> {
  const index = new Map<ID, T[]>()
  for (const item of items) {
    for (const key of keys(item)) {
      const group = index.get(key)
      if (group) group.push(item)
      else index.set(key, [item])
    }
  }
  return index
}

const playersByClub = new WeakMap<readonly Player[], Map<ID, Player[]>>()
const playersByNation = new WeakMap<readonly Player[], Map<ID, Player[]>>()
const contractsByClub = new WeakMap<readonly Contract[], Map<ID, Contract[]>>()

/** Plantel de un club. Devuelve una copia: quien llama puede ordenarla sin romper el índice. */
export function playersOfClub(players: readonly Player[], clubId: ID): Player[] {
  let index = playersByClub.get(players)
  if (!index) {
    index = groupBy(players, (p) => (p.clubId ? [p.clubId] : []))
    playersByClub.set(players, index)
  }
  return [...(index.get(clubId) ?? [])]
}

/** Jugadores con esa nacionalidad (cualquiera de las suyas). Copia. */
export function playersOfNation(players: readonly Player[], countryId: ID): Player[] {
  let index = playersByNation.get(players)
  if (!index) {
    index = groupBy(players, (p) => p.nationalityIds)
    playersByNation.set(players, index)
  }
  return [...(index.get(countryId) ?? [])]
}

/** Contratos de un club. Copia. */
export function contractsOfClub(contracts: readonly Contract[], clubId: ID): Contract[] {
  let index = contractsByClub.get(contracts)
  if (!index) {
    index = groupBy(contracts, (c) => [c.clubId])
    contractsByClub.set(contracts, index)
  }
  return [...(index.get(clubId) ?? [])]
}
