// Países y federaciones.

import type { ID, Region } from './common.ts'
import type { ConfederationId } from './confederation.ts'

export interface Country {
  id: ID
  name: string
  code: string  // ISO-3, ej. 'ENG', 'FRA', 'ESP'
  region: Region
  /** Tier oficial de World Rugby (1 = élite, 4 = en desarrollo).
   *  Tier 4 se permite desde v3 para modelar correctamente pirámides bajas
   *  como Conference 2 europea o Sevens Trophy subregional. */
  tier: 1 | 2 | 3 | 4
  federationName: string
  /** Confederación a la que pertenece. Opcional para compatibilidad con saves
   *  anteriores a v3; la migración lo infiere de region+code. */
  confederationId?: ConfederationId
}
