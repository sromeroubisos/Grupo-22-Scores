// Tabla de Expected Points por zona + decisor de opción de penal.
// La idea: en vez de reglas rígidas tipo "en opp22 con margen perdiendo, ir a touch",
// se compara el valor esperado de cada opción y se elige la mayor.

import type { Zone, Side } from './types.ts'
import { placeKickProb } from './placeKick.ts'

/**
 * EP de tener posesión en cada zona, atacando hacia la zona rival.
 * Calibrado para que coincida con literatura aplicada de rugby union profesional.
 */
const EP_BASE: Record<Zone, number> = {
  own22:  0.5,
  midOwn: 1.5,
  midOpp: 2.7,
  opp22:  4.8
}

/** EP firmado: positivo si el bando de referencia tiene posesión, negativo si la tiene el rival. */
export function expectedPoints(zone: Zone, possession: Side, ownSide: Side): number {
  const sign = possession === ownSide ? +1 : -1
  return sign * EP_BASE[zone]
}

export type TryBonusRule = 'four' | 'three_more' | 'none'

export interface PenaltyContext {
  zone: Zone
  attSide: Side
  kickerSkill: number
  weather: 'clear' | 'rain' | 'wind'
  trailingBig: boolean
  minutesLeft: number
  scoreDiff: number
  angleSeed: number
  /** Ensayos ya anotados por el bando que decide (default 0). */
  ownTries?: number
  /** Ensayos del rival (default 0). Necesario para reglas tipo REC (3 más que el rival). */
  oppTries?: number
  /** Regla de try-bonus de la competición. Default 'four' (BP4). */
  tryBonusRule?: TryBonusRule
  /** Si la competición premia el losing bonus (≤7). Default false. */
  losingBonusActive?: boolean
  /** Techo de skill efectivo del pateador. Default sin tope. */
  skillCap?: number
}

export type PenaltyDecision = 'palos' | 'touch' | 'tap' | 'scrum'

/**
 * Compara EP de las 4 opciones tras un penal y elige la mejor.
 * Modulado por estado de partido: si el atacante pierde por mucho y queda poco,
 * favorece palos para asegurar 3 puntos.
 */
export function decidePenaltyOption(ctx: PenaltyContext): {
  decision: PenaltyDecision
  scores: Record<PenaltyDecision, number>
} {
  // EP(palos) = P_make·3 + (1−P_make)·(−EP_midOwn)
  const pMake = placeKickProb({
    kickerSkill: ctx.kickerSkill, zone: ctx.zone, attSide: ctx.attSide,
    weather: ctx.weather, scoreDiff: ctx.scoreDiff, minutesLeft: ctx.minutesLeft,
    isConversion: false, angleSeed: ctx.angleSeed, skillCap: ctx.skillCap
  })
  const epMissPenalty = -EP_BASE['midOwn']
  const epPalos = pMake * 3 + (1 - pMake) * epMissPenalty

  // Factor de conversión "posesión → marcador": EP_BASE refleja la EP máxima
  // de la zona, pero sólo ~50% de las posesiones acaban en puntos dentro de la
  // jugada. Sin este factor touch/tap/scrum dominan siempre sobre palos y nunca
  // se patean penales — irreal en rugby moderno (~2-3 penalty kicks/partido).
  const CONTINUE_CONV = 0.50

  // EP(touch+lineout): según zona, asume avanzar 1 zona y ganar el lineout 88% de las veces.
  const lineoutWin = 0.88
  const epTouchRaw =
    ctx.zone === 'midOwn' ? EP_BASE['midOpp'] * lineoutWin
    : ctx.zone === 'midOpp' ? EP_BASE['opp22'] * 0.70 * lineoutWin
    : ctx.zone === 'opp22'  ? EP_BASE['opp22'] * 0.90 * lineoutWin  // touch a 5m
    : EP_BASE['midOwn'] * lineoutWin
  const epTouch = epTouchRaw * CONTINUE_CONV

  // EP(tap+go): mismo territorio pero con factor de conversión real.
  const epTap = EP_BASE[ctx.zone] * CONTINUE_CONV * 1.05

  // EP(scrum): leve bump sobre tap por presión sobre forwards rivales.
  const epScrum = EP_BASE[ctx.zone] * CONTINUE_CONV * 1.10

  // Boost a palos si el atacante pierde por mucho y queda poco.
  const epPalosBoost = (ctx.trailingBig && ctx.minutesLeft < 10) ? 1.5 : 0

  // Risk premium: 3 puntos asegurados pesan más que el valor esperado
  // marginal de seguir atacando (reduces incertidumbre). Se aplica cuando el
  // pateador es fiable (pMake ≥ 0.65), lo que en práctica ocurre desde opp22
  // y desde midOpp si el kicker es bueno. Sin esto, el EP comparativo siempre
  // favorece touch y los partidos sólo suman puntos vía ensayos (irreal).
  const riskPremium = pMake >= 0.80 ? 1.6 : pMake >= 0.65 ? 0.9 : 0

  // ============ Tácticas de fin de partido por formato ============
  // 1) Try-bonus chasing (BP4): si llevamos 3 ensayos, faltan <12 min y estamos
  //    en zona de ataque (midOpp/opp22), ir por touch para forzar el 4º try.
  const ownTries = ctx.ownTries ?? 0
  const oppTries = ctx.oppTries ?? 0
  const rule = ctx.tryBonusRule ?? 'four'
  const attackZone = ctx.zone === 'midOpp' || ctx.zone === 'opp22'
  let epTouchBonus = 0
  if (rule === 'four' && ownTries === 3 && ctx.minutesLeft < 12 && attackZone) {
    epTouchBonus += 1.2
  }
  // 2) Regla REC (three_more): empujar touch si estamos a 1 ensayo de cumplir +3 vs rival.
  if (rule === 'three_more' && (ownTries - oppTries) === 2 && ctx.minutesLeft < 20 && attackZone) {
    epTouchBonus += 1.2
  }
  // 3) Losing-bonus protection: si perdemos por 8–12 y queda poco, asegurar 3 a palos
  //    para entrar en rango de ≤7 (losing bonus).
  let epPalosLosingBonus = 0
  if (ctx.losingBonusActive && ctx.scoreDiff <= -8 && ctx.scoreDiff >= -12 && ctx.minutesLeft < 5) {
    epPalosLosingBonus += 1.0
  }

  const scores: Record<PenaltyDecision, number> = {
    palos: epPalos + epPalosBoost + epPalosLosingBonus + riskPremium,
    touch: epTouch + epTouchBonus,
    tap:   epTap,
    scrum: epScrum
  }

  const decision = (Object.entries(scores) as [PenaltyDecision, number][])
    .sort((a, b) => b[1] - a[1])[0][0]

  return { decision, scores }
}

/**
 * Decide si intentar un drop goal vs continuar la fase.
 * Solo válido en opp22 con margen apretado.
 */
export function shouldAttemptDropGoal(ctx: PenaltyContext): boolean {
  if (ctx.zone !== 'opp22') return false
  const pMake = placeKickProb({
    kickerSkill: ctx.kickerSkill, zone: ctx.zone, attSide: ctx.attSide,
    weather: ctx.weather, scoreDiff: ctx.scoreDiff, minutesLeft: ctx.minutesLeft,
    isConversion: false, angleSeed: ctx.angleSeed, skillCap: ctx.skillCap
  }) * 0.7 // los drops son más difíciles que penales
  const epDrop = pMake * 3 + (1 - pMake) * (-EP_BASE['midOwn'])
  const epContinue = EP_BASE['opp22'] * 0.35  // valor esperado de seguir fase
  // Si pierdes por ≤ 3 y quedan < 8 min, ser más agresivo.
  const lateClose = (ctx.scoreDiff < 0 && Math.abs(ctx.scoreDiff) <= 3 && ctx.minutesLeft < 8)
  // Si ganamos por 4–6 con <3 min y el rival tiene losing bonus al alcance, evitar el drop:
  // un intento fallido te deja en mal sitio territorial y abre puerta a respuesta del rival.
  const protectMargin = ctx.losingBonusActive && ctx.scoreDiff >= 4 && ctx.scoreDiff <= 6 && ctx.minutesLeft < 3
  if (protectMargin) return false
  return epDrop > epContinue || lateClose
}
