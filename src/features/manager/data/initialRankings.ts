// Puntos iniciales del World Rugby Ranking en el arranque de partida.
//
// Valores aproximados a Mayo 2026 (ventana del documento de diseño). Son una
// foto fija razonable: el algoritmo de intercambio los moverá tras los primeros
// tests simulados. Países no listados reciben el default por tier (85/73/55).

/** Top selecciones masculinas. Aproximación basada en el ranking oficial
 *  publicado y en la posición histórica del equipo a inicios de 2026. */
export const INITIAL_MEN_RANKING: Record<string, number> = {
  // Tier 1 alto
  NZL: 92.40,
  IRL: 90.10,
  ZAF: 89.55,
  FRA: 88.30,
  ENG: 84.95,
  ARG: 82.66,
  // Tier 1 medio
  SCO: 81.20,
  WAL: 76.92,
  AUS: 80.55,
  ITA: 77.80,
  // Tier 1 / Tier 2 alto
  FIJ: 78.40,
  JPN: 76.10,
  GEO: 74.80,
  SAM: 73.90,
  TGA: 71.50,
  USA: 69.30,
  POR: 70.20,
  URU: 70.10,
  ROU: 67.50,
  ESP: 66.80,
  CHI: 65.70,
  CAN: 65.40,
  NAM: 64.10,
  HKG: 60.90,
  // Tier 2 / Tier 3
  KOR: 58.50,
  KEN: 58.10,
  BRA: 57.40,
  PAR: 56.20,
  COL: 55.90,
  RUS: 60.30
}

/** Top selecciones femeninas. Aproximación basada en la foto de WRWC 2025 y
 *  ranking publicado. World Rugby mantiene un ranking femenino separado. */
export const INITIAL_WOMEN_RANKING: Record<string, number> = {
  // Tier 1 alto
  ENG: 94.20,
  NZL: 89.50,
  FRA: 88.10,
  CAN: 86.40,
  AUS: 80.30,
  IRL: 80.10,
  USA: 78.50,
  ITA: 75.20,
  SCO: 74.80,
  WAL: 74.60,
  // Pacific/Asia
  JPN: 71.40,
  FIJ: 65.20,
  SAM: 60.10,
  // Tier 2
  ZAF: 70.80,
  ESP: 68.50,
  NLD: 64.30,
  // Sudamérica
  BRA: 55.80,
  COL: 52.20,
  ARG: 56.40,
  CHI: 51.60,
  // África / Asia / otros
  HKG: 58.40,
  KAZ: 57.10,
  KEN: 54.20,
  MAD: 52.80,
  TGA: 52.90
}

/** Fecha de referencia de estos ratings — Mayo 2026, alineada con el snapshot
 *  del documento de diseño. La migración v2→v3 los usa como punto de partida. */
export const INITIAL_RANKING_AS_OF: string = '2026-05-20'
