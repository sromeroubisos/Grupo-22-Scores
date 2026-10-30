// Confederaciones regionales de World Rugby.
//
// World Rugby articula seis confederaciones que agrupan a las federaciones
// nacionales y organizan competiciones continentales propias. Cada
// confederación tiene su propia pirámide (Championship/Trophy/Conference) y
// ventana de calendario, distinta a las de las otras.

import type { ID } from './common.ts'
import type { Region } from './common.ts'

/** ID estable de cada confederación. Coincide con el campo `union` del catálogo
 *  `WORLD_RUGBY_NATIONS` pero en snake_case para uso programático. */
export type ConfederationId =
  | 'rugby_europe'
  | 'oceania_rugby'
  | 'sudamerica_rugby'
  | 'rugby_americas_north'
  | 'rugby_africa'
  | 'asia_rugby'

export const CONFEDERATION_NAMES: Record<ConfederationId, string> = {
  rugby_europe: 'Rugby Europe',
  oceania_rugby: 'Oceania Rugby',
  sudamerica_rugby: 'Sudamérica Rugby',
  rugby_americas_north: 'Rugby Americas North',
  rugby_africa: 'Rugby Africa',
  asia_rugby: 'Asia Rugby'
}

export interface Confederation {
  id: ConfederationId
  name: string
  /** Región principal asociada. Algunas confederaciones tienen miembros
   *  fuera de su región principal (p.ej. KAZ en Asia Rugby aunque está en
   *  el límite, o GUY en RAN aunque sea sudamericana). */
  region: Region
  /** Country.id de todas las naciones miembro. */
  memberCountryIds: ID[]
  /** Competition.id de todas las competencias de la confederación
   *  (XV M, XV F, sevens, juveniles). Pacific Nations Cup y WXV son
   *  globales y NO pertenecen a una confederación individual. */
  competitionIds: ID[]
}

/** Mapeo desde el campo `union` del catálogo de naciones al ConfederationId. */
export function confederationIdFromUnion(
  union: 'Rugby Europe' | 'Oceania Rugby' | 'Sudamérica Rugby' | 'Rugby Americas North' | 'Rugby Africa' | 'Asia Rugby'
): ConfederationId {
  switch (union) {
    case 'Rugby Europe': return 'rugby_europe'
    case 'Oceania Rugby': return 'oceania_rugby'
    case 'Sudamérica Rugby': return 'sudamerica_rugby'
    case 'Rugby Americas North': return 'rugby_americas_north'
    case 'Rugby Africa': return 'rugby_africa'
    case 'Asia Rugby': return 'asia_rugby'
  }
}
