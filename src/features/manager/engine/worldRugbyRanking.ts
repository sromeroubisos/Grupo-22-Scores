// Algoritmo oficial de intercambio de puntos del World Rugby Ranking.
//
// World Rugby usa un sistema suma-cero entre selecciones: lo que un equipo
// gana, el otro lo pierde. Cinco factores entran al cálculo:
//   1. Resultado (victoria / empate / derrota)
//   2. Margen (≤15 o ≥16)
//   3. Fuerza relativa (gap entre ratings con +3 al local)
//   4. Importancia (test regular vs Rugby World Cup → coeficientes x2)
//   5. Regla outsider: si favorito tiene >10pts ventaja y gana como predicho,
//      el intercambio es 0.
//
// Esta implementación es DETERMINISTA: la misma entrada siempre produce la
// misma salida, redondeada a 2 decimales. Cobertura via worldRugbyRanking.selftest.

import type { ID, ISODate } from '../types/index.ts'
import type {
  Match,
  RankingChange,
  RankingChangeFlavor,
  RankingEntry,
  WorldRankingState
} from '../types/index.ts'

/** Localía: el equipo local recibe +3 puntos al rating sólo a efectos del
 *  cálculo. NO se aplica si el partido es en sede neutral (Mundial, FQT). */
const HOME_ADVANTAGE = 3

/** Tabla de coeficientes y topes según el tipo de partido y bucket de margen.
 *  RWC duplica los coeficientes y topes respecto del test regular. */
interface CoefRow { coef: number; cap: number }
interface CoefTable {
  fav_win_close: CoefRow
  fav_win_big: CoefRow
  und_win_close: CoefRow
  und_win_big: CoefRow
  draw: CoefRow
}

const REGULAR_TABLE: CoefTable = {
  fav_win_close: { coef: 0.10, cap: 2 },
  fav_win_big:   { coef: 0.15, cap: 3 },
  und_win_close: { coef: 0.10, cap: 2 },
  und_win_big:   { coef: 0.15, cap: 3 },
  draw:          { coef: 0.10, cap: 1 }
}

const RWC_TABLE: CoefTable = {
  fav_win_close: { coef: 0.20, cap: 4 },
  fav_win_big:   { coef: 0.30, cap: 6 },
  und_win_close: { coef: 0.20, cap: 4 },
  und_win_big:   { coef: 0.30, cap: 6 },
  draw:          { coef: 0.20, cap: 2 }
}

export interface RankingMatchInput {
  homeCountryId: ID
  awayCountryId: ID
  homeScore: number
  awayScore: number
  /** Rating actual del local ANTES del partido. */
  homeBefore: number
  /** Rating actual del visitante ANTES del partido. */
  awayBefore: number
  /** True si es Copa del Mundo (o test con flag rwcWeighted): duplica intercambio. */
  isRWC: boolean
  /** True si el partido se juega en sede neutral (no aplica +3 al local). */
  isNeutral?: boolean
}

export interface RankingMatchOutput {
  homeAfter: number
  awayAfter: number
  /** Delta del local. La suma de deltas es 0 (suma cero estricta). */
  homeDelta: number
  awayDelta: number
  flavor: RankingChangeFlavor
}

/** Aplica el intercambio oficial de puntos a un partido entre selecciones.
 *  No muta nada; devuelve los nuevos ratings y deltas (redondeados a 2 dec.). */
export function applyTestResult(input: RankingMatchInput): RankingMatchOutput {
  const neutral = input.isNeutral === true
  const homeAdj = input.homeBefore + (neutral ? 0 : HOME_ADVANTAGE)
  const gapSigned = homeAdj - input.awayBefore   // >0 si home es favorito
  const gap = Math.abs(gapSigned)
  const margin = input.homeScore - input.awayScore
  const table = input.isRWC ? RWC_TABLE : REGULAR_TABLE

  // --- Empate ---
  if (margin === 0) {
    if (gap === 0) {
      // Sin favorito → nada que redistribuir.
      return finalize(input, 0, 'draw')
    }
    const flow = Math.min(gap * table.draw.coef, table.draw.cap)
    // En empate el favorito cede al underdog. homeDelta es negativo si home
    // era favorito, positivo si el visitante era favorito.
    const homeWasFav = gapSigned > 0
    const homeDelta = homeWasFav ? -flow : +flow
    return finalize(input, homeDelta, 'draw')
  }

  // --- Victoria definida ---
  const homeWon = margin > 0
  const homeWasFav = gapSigned > 0
  const isUpset = homeWon !== homeWasFav
  const absMargin = Math.abs(margin)
  const bucket: 'close' | 'big' = absMargin <= 15 ? 'close' : 'big'

  const row: CoefRow = isUpset
    ? (bucket === 'close' ? table.und_win_close : table.und_win_big)
    : (bucket === 'close' ? table.fav_win_close : table.fav_win_big)

  let raw: number
  if (isUpset) {
    raw = (10 + gap) * row.coef
  } else {
    raw = (10 - gap) * row.coef
  }
  let flow = Math.max(0, Math.min(raw, row.cap))

  // Regla outsider: si favorito gana como predicho con >10pts de ventaja,
  // el intercambio es 0. NO aplica en upsets.
  let flavor: RankingChangeFlavor
  if (!isUpset && gap > 10) {
    flow = 0
    flavor = 'outsider_zero'
  } else if (isUpset) {
    flavor = input.isRWC ? 'rwc_upset' : 'upset'
  } else {
    flavor = input.isRWC ? 'rwc_double' : 'routine'
  }

  // Ganador suma flow; perdedor pierde flow.
  const homeDelta = homeWon ? +flow : -flow
  return finalize(input, homeDelta, flavor)
}

function finalize(
  input: RankingMatchInput,
  homeDelta: number,
  flavor: RankingChangeFlavor
): RankingMatchOutput {
  const hd = round2(homeDelta)
  const homeAfter = round2(input.homeBefore + hd)
  const awayAfter = round2(input.awayBefore - hd)
  return {
    homeAfter,
    awayAfter,
    homeDelta: hd,
    awayDelta: round2(-hd),
    flavor
  }
}

function round2(x: number): number {
  return Math.round(x * 100) / 100
}

// =============================================================================
// Integración con WorldRankingState
// =============================================================================

/** Recalcula ranks (1 = más puntos) y normaliza previousPoints para mostrar
 *  deltas en UI. Determinista: empates se resuelven por countryId estable. */
export function rerank(entries: RankingEntry[]): RankingEntry[] {
  const sorted = [...entries].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points
    return a.countryId.localeCompare(b.countryId)
  })
  return sorted.map((e, i) => ({ ...e, rank: i + 1 }))
}

/** Default de seed para una selección sin entry previa: por tier de país.
 *  Tier 1 → 85, Tier 2 → 73, Tier 3/4 → 55. */
export function defaultRatingForTier(tier: 1 | 2 | 3 | 4 | undefined): number {
  if (tier === 1) return 85
  if (tier === 2) return 73
  return 55
}

function findOrSeedEntry(
  state: WorldRankingState,
  countryId: ID,
  fallbackRating: number
): RankingEntry {
  const existing = state.entries.find((e) => e.countryId === countryId)
  if (existing) return existing
  return {
    countryId,
    points: fallbackRating,
    previousPoints: fallbackRating,
    rank: state.entries.length + 1
  }
}

export interface ApplyToStateOptions {
  /** True si el partido se jugó en sede neutral. Por defecto false. */
  isNeutral?: boolean
  /** True si debe contar como Copa del Mundo aunque la competición no sea
   *  `world_cup` (p. ej. qualifiers oficiales con doble peso). Por defecto se
   *  determina por la competición del partido. */
  forceRWC?: boolean
  /** Fallback de rating si una selección aún no aparece en el ranking.
   *  Si no se pasa, se usa 55 (tier 3 default). */
  fallbackRating?: number
}

/** Aplica el resultado de un partido internacional al WorldRankingState.
 *  Devuelve el nuevo estado y el RankingChange para registrar en histórico. */
export function applyToState(
  state: WorldRankingState,
  match: Match,
  options: { isRWC: boolean } & ApplyToStateOptions
): { state: WorldRankingState; change: RankingChange } | null {
  if (!match.result || !match.played) return null

  const fallback = options.fallbackRating ?? 55
  const homeEntry = findOrSeedEntry(state, match.homeClubId, fallback)
  const awayEntry = findOrSeedEntry(state, match.awayClubId, fallback)

  const out = applyTestResult({
    homeCountryId: match.homeClubId,
    awayCountryId: match.awayClubId,
    homeScore: match.result.homeScore,
    awayScore: match.result.awayScore,
    homeBefore: homeEntry.points,
    awayBefore: awayEntry.points,
    isRWC: options.forceRWC ?? options.isRWC,
    isNeutral: options.isNeutral
  })

  // Actualizar entradas: insertar las nuevas si no existían, actualizar si sí.
  const ensureEntry = (id: ID, after: number, before: number): RankingEntry => ({
    countryId: id,
    points: after,
    previousPoints: before,
    rank: 0  // se asigna en rerank
  })

  let nextEntries = state.entries.map((e) => {
    if (e.countryId === match.homeClubId) {
      return ensureEntry(match.homeClubId, out.homeAfter, e.points)
    }
    if (e.countryId === match.awayClubId) {
      return ensureEntry(match.awayClubId, out.awayAfter, e.points)
    }
    return e
  })

  // Si la selección no estaba en el state, la añadimos.
  if (!state.entries.some((e) => e.countryId === match.homeClubId)) {
    nextEntries = [...nextEntries, ensureEntry(match.homeClubId, out.homeAfter, homeEntry.points)]
  }
  if (!state.entries.some((e) => e.countryId === match.awayClubId)) {
    nextEntries = [...nextEntries, ensureEntry(match.awayClubId, out.awayAfter, awayEntry.points)]
  }

  const newState: WorldRankingState = {
    gender: state.gender,
    asOfDate: match.date as ISODate,
    entries: rerank(nextEntries)
  }

  const change: RankingChange = {
    matchId: match.id,
    date: match.date,
    homeCountryId: match.homeClubId,
    awayCountryId: match.awayClubId,
    homeBefore: homeEntry.points,
    homeAfter: out.homeAfter,
    homeDelta: out.homeDelta,
    awayBefore: awayEntry.points,
    awayAfter: out.awayAfter,
    awayDelta: out.awayDelta,
    flavor: out.flavor,
    wasRWC: options.forceRWC ?? options.isRWC,
    wasNeutral: options.isNeutral === true
  }

  return { state: newState, change }
}

/** Construye un WorldRankingState inicial a partir de una lista de ratings
 *  hardcodeados (countryCode → points) y el catálogo de países del world.
 *  Países no listados reciben el default por tier. */
export function bootstrapRankingState(
  gender: 'men' | 'women',
  asOfDate: ISODate,
  countries: Array<{ id: ID; code: string; tier: 1 | 2 | 3 | 4 | undefined }>,
  initialPoints: Record<string, number>
): WorldRankingState {
  const entries: RankingEntry[] = countries.map((c) => {
    const points = initialPoints[c.code] ?? defaultRatingForTier(c.tier)
    return {
      countryId: c.id,
      points,
      previousPoints: points,
      rank: 0
    }
  })
  return {
    gender,
    asOfDate,
    entries: rerank(entries)
  }
}
