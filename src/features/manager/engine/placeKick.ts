// Probabilidad contextual de patada a palos.
// Reemplaza la lógica inline anterior de resolvePenalty/resolveConversion.

import type { Zone, Side } from './types.ts'
import { sigmoid } from './rng.ts'

/** Zona del campo donde se patea, distancia aproximada al palo (metros). */
const ZONE_DISTANCE: Record<Zone, number> = {
  own22: 70,
  midOwn: 50,
  midOpp: 35,
  opp22: 22
}

/** Ángulo aproximado en grados desde el centro del campo (0 = frente a palos). */
function angleFromCenter(rng_or_offset: number): number {
  // En este motor simplificado no llevamos coordenada lateral exacta;
  // muestreamos un sesgo aleatorio determinista a partir del valor pasado.
  // 0-25 grados típico, 25-40 desde banda.
  const r = Math.abs(Math.sin(rng_or_offset * 13.7)) // 0..1 determinista
  return r * 35 // 0..35 grados
}

interface PlaceKickContext {
  /** Habilidad del pateador 0-99. */
  kickerSkill: number
  /** Zona desde la que se patea. */
  zone: Zone
  /** Equipo atacante (para reflejar localía si hace falta). */
  attSide: Side
  /** 'clear' | 'rain' | 'wind' — afecta dificultad. */
  weather?: 'clear' | 'rain' | 'wind'
  /** Diferencia de marcador para el atacante (negativa = pierde). */
  scoreDiff: number
  /** Minutos que quedan en el partido. */
  minutesLeft: number
  /** Es conversión (siempre desde la línea de try) o penal (desde el sitio del foul). */
  isConversion: boolean
  /** Para muestreo determinista del ángulo. */
  angleSeed: number
  /** Fatiga del equipo 0-1 (opcional). */
  fatigue?: number
  /** Techo del skill efectivo (semipro/youth tienen kickers con menos consistencia). */
  skillCap?: number
}

/**
 * Probabilidad de acierto en patada a palos.
 * Fórmula del documento de diseño:
 *   z = 2.1 + 0.7·z(kicking) − 0.06·(d − 22) − 0.045·|angle| − 0.20·wind − 0.12·fatigue − 0.6·pressure
 * Producía baselines:
 *   - Conversión central 22m, skill 50 → ~0.89
 *   - Penal central 35m, skill 50    → ~0.79
 *   - Penal central 50m, skill 50    → ~0.60
 *   - Penal 50m + ángulo 20°         → ~0.38
 */
export function placeKickProb(ctx: PlaceKickContext): number {
  const distance = ctx.isConversion ? Math.max(20, ZONE_DISTANCE[ctx.zone] - 8) : ZONE_DISTANCE[ctx.zone]
  const angle = angleFromCenter(ctx.angleSeed)
  const windHead = ctx.weather === 'wind' ? 1 : 0
  const rainPenalty = ctx.weather === 'rain' ? 0.4 : 0
  const fatigue = ctx.fatigue ?? 0
  const pressureFactor = (ctx.scoreDiff < 0 && ctx.minutesLeft < 10) ? 1 : 0

  // Intercepto bajado de 2.1 → 1.35 para acercar conversion rate observada al
  // target de ~75% (con 2.1 daba ~92%; con 1.5 ~84%). El resto del modelo
  // (distancia, ángulo, viento, presión) se mantiene fiel al documento de diseño.
  const effectiveSkill = ctx.skillCap != null ? Math.min(ctx.kickerSkill, ctx.skillCap) : ctx.kickerSkill
  const z =
    1.35
    + 0.7   * ((effectiveSkill - 50) / 25)
    - 0.06  * Math.max(0, distance - 22)
    - 0.045 * angle
    - 0.20  * windHead
    - rainPenalty
    - 0.12  * fatigue
    - 0.6   * pressureFactor

  return sigmoid(z)
}
