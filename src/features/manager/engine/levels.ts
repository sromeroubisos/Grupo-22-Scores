// Nivel competitivo y parámetros de simulación por nivel.
// Inferimos el nivel desde `CompetitionFormat + tier` sin tocar el esquema
// de Competition ni los datos de demoWorld/leagues. Los priors están
// calibrados con la evidencia empírica de:
//   - Six Nations 2025 (intl)
//   - Premiership 2024–25 (pro_domestic)
//   - Rugby Europe Championship 2025 (semi_pro)
//   - World Rugby U20 Championship 2025 (youth)

import type { CompetitionFormat } from '../types/index.ts'

export type CompetitionLevel = 'intl' | 'pro_domestic' | 'semi_pro' | 'youth'

export interface LevelParams {
  /** Puntos totales esperados por partido (target medio para validación). */
  expectedTotalPoints: number
  /** Multiplicador aplicado a probabilidades de break/try y tries en cadena. */
  tryRateMult: number
  /** Multiplicador de penales disciplinarios en breakdown. */
  penaltyRateMult: number
  /** Techo del skill efectivo del pateador antes de pasar a placeKickProb. */
  conversionSkillMax: number
  /** Amplificador de ruido en break_prob y ruck retention. */
  varianceMult: number
  /** Bump extra de continuación de cadena ofensiva cuando hay desnivel grande. */
  blowoutMassBoost: number
  /** Localía (puntos Elo). Default 60; expuesto para futura calibración por nivel. */
  homeAdvantageElo: number
  /** Distribución target de márgenes en % (bins 0–3 / 4–7 / 8–15 / 16–24 / 25+). */
  targetMarginBins: [number, number, number, number, number]
}

/**
 * Infiere el nivel competitivo de una competición desde su formato y tier.
 *
 * - Selecciones (international, international_split, world_cup) → 'intl'.
 * - European clubes (Champions Cup) → 'pro_domestic'.
 * - Liga doméstica tier 1 o copa → 'pro_domestic'.
 * - Liga doméstica tier ≥ 2 → 'semi_pro'.
 * - sevens_circuit no se simula con este motor; se devuelve 'pro_domestic' como neutro.
 * - 'youth' no se infiere automáticamente; el caller puede forzarlo si modela U20/cantera.
 */
export function competitionLevel(format: CompetitionFormat, tier: number): CompetitionLevel {
  if (format === 'international' || format === 'international_split' || format === 'world_cup') {
    return 'intl'
  }
  if (format === 'european') return 'pro_domestic'
  if (format === 'cup') return 'pro_domestic'
  if (format === 'league') {
    return tier >= 2 ? 'semi_pro' : 'pro_domestic'
  }
  return 'pro_domestic'
}

/**
 * Devuelve los priors de simulación para cada nivel. `pro_domestic` está
 * deliberadamente con multiplicadores neutros (1.0) y cap de skill infinito
 * para preservar el comportamiento previo del motor (determinismo bit-exacto
 * cuando no se pasa nivel explícito).
 */
export function paramsForLevel(level: CompetitionLevel): LevelParams {
  switch (level) {
    case 'intl':
      return {
        expectedTotalPoints: 55,
        tryRateMult: 1.85,
        penaltyRateMult: 1.15,
        conversionSkillMax: 100,
        varianceMult: 1.05,
        blowoutMassBoost: 0.02,
        homeAdvantageElo: 60,
        targetMarginBins: [13, 27, 27, 13, 20]
      }
    case 'pro_domestic':
      return {
        expectedTotalPoints: 56,
        tryRateMult: 1.95,
        penaltyRateMult: 1.10,
        conversionSkillMax: 100,
        varianceMult: 1.05,
        blowoutMassBoost: 0.02,
        homeAdvantageElo: 60,
        targetMarginBins: [17, 16, 23, 23, 21]
      }
    case 'semi_pro':
      return {
        expectedTotalPoints: 59,
        tryRateMult: 2.15,
        penaltyRateMult: 1.30,
        conversionSkillMax: 70,
        varianceMult: 3.40,
        blowoutMassBoost: 0.35,
        homeAdvantageElo: 60,
        targetMarginBins: [5, 0, 15, 20, 60]
      }
    case 'youth':
      return {
        expectedTotalPoints: 61,
        tryRateMult: 2.30,
        penaltyRateMult: 1.15,
        conversionSkillMax: 75,
        varianceMult: 1.80,
        blowoutMassBoost: 0.15,
        homeAdvantageElo: 60,
        targetMarginBins: [23, 7, 30, 10, 30]
      }
  }
}

/** Default neutro para callers que no especifican nivel. */
export const DEFAULT_LEVEL: CompetitionLevel = 'pro_domestic'
