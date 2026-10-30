// Resolvedores de fase. Cada uno toma el estado actual y devuelve el siguiente,
// generando uno o más MatchEvent en el proceso.
//
// Convención: las funciones MUTAN el estado pasado y empujan eventos al array.
// Las zonas son SIEMPRE desde el punto de vista del equipo en posesión:
//   own22 (0-22m propio) | midOwn (22-50m propio) | midOpp (50m-22m rival) | opp22 (22m-en-goal rival)

import type { MatchState, MatchTeam, Side, Zone, EventType, TeamRating } from './types.ts'
import type { RNG } from './rng.ts'
import { sigmoid } from './rng.ts'
import * as N from './narrator.ts'
import { placeKickProb } from './placeKick.ts'
import { decidePenaltyOption, shouldAttemptDropGoal, type PenaltyDecision } from './expectedPoints.ts'
import { paramsForLevel, type LevelParams } from './levels.ts'

function levelParams(state: MatchState): LevelParams {
  return paramsForLevel(state.level)
}

/** Diferencia de rating (att vs def) por encima de la cual aplicamos `blowoutMassBoost`. */
const BLOWOUT_DIFF_THRESHOLD = 6

const ZONES: Zone[] = ['own22', 'midOwn', 'midOpp', 'opp22']
const ZONE_INDEX: Record<Zone, number> = { own22: 0, midOwn: 1, midOpp: 2, opp22: 3 }

function other(side: Side): Side { return side === 'home' ? 'away' : 'home' }
function mirror(zone: Zone): Zone { return ZONES[3 - ZONE_INDEX[zone]] }
function advance(zone: Zone, steps: number): Zone {
  const idx = Math.max(0, Math.min(3, ZONE_INDEX[zone] + steps))
  return ZONES[idx]
}

function pushEvent(state: MatchState, type: EventType, side: Side | null, text: string): void {
  state.events.push({
    minute: state.minute,
    side,
    type,
    text,
    scoreAfter: { ...state.score },
    zone: state.zone,
    possession: state.possession,
    phase: state.phase
  })
  // Incrementar contadores agregados según tipo
  const s: Side = side ?? state.possession
  if (type === 'scrum_won' || type === 'scrum_penalty') state.scrums[s] += 1
  else if (type === 'lineout_won' || type === 'lineout_lost') state.lineouts[s] += 1
  else if (type === 'ruck_won' || type === 'ruck_slow_ball' || type === 'ruck_form') state.rucks[s] += 1
  else if (type === 'tackle') state.tackles[s] += 1
  else if (type === 'turnover' || type === 'jackal_steal') state.turnovers[s] += 1
  else if (type === 'offload') state.offloads[s] += 1
  else if (type === 'line_break') state.lineBreaks[s] += 1
  // Fase 2: nuevos contadores
  else if (type === 'maul_form') state.mauls[s] += 1
  else if (type === 'maul_drive') state.maulDrives[s] += 1
  else if (type === 'ruck_pickgo') state.pickAndGos[s] += 1
  else if (type === 'quick_tap') state.quickTaps[s] += 1
}
function tickClock(state: MatchState, mins: number): void {
  state.minute += mins
  // Acumulación de fatiga: ambos equipos suben ~0.6 puntos por minuto + extra si tienen posesión.
  const baseTick = mins * 0.6
  state.fatigue.home += baseTick + (state.possession === 'home' ? mins * 0.3 : 0)
  state.fatigue.away += baseTick + (state.possession === 'away' ? mins * 0.3 : 0)
  if (state.fatigue.home > 100) state.fatigue.home = 100
  if (state.fatigue.away > 100) state.fatigue.away = 100
}

/** Devuelve un multiplicador 0.8-1.0 según fatiga del equipo. */
function fatigueMult(state: MatchState, side: Side): number {
  const f = side === 'home' ? state.fatigue.home : state.fatigue.away
  return 1 - (f / 100) * 0.2
}

function ctxFor(state: MatchState, home: MatchTeam, away: MatchTeam, rng: RNG) {
  const attSide = state.possession
  const attTeam = attSide === 'home' ? home : away
  const defTeam = attSide === 'home' ? away : home
  return { rng, attTeam, defTeam, attSide }
}
function attDef(state: MatchState, home: MatchTeam, away: MatchTeam): { attSide: Side; att: TeamRating; def: TeamRating } {
  const attSide = state.possession
  const baseAtt = attSide === 'home' ? home.rating : away.rating
  const baseDef = attSide === 'home' ? away.rating : home.rating
  // Aplica el shock de forma al ataque y defensa efectivos. El shock es por partido
  // (constante a lo largo del juego) y se sortea en matchEngine.ts. Permite
  // que un mismo emparejamiento produzca partidos muy distintos según el "día".
  const shockAtt = state.formShock[attSide]
  const shockDef = state.formShock[other(attSide)]
  const att: TeamRating = { ...baseAtt, attack: baseAtt.attack + shockAtt, defense: baseAtt.defense + shockAtt }
  const def: TeamRating = { ...baseDef, attack: baseDef.attack + shockDef, defense: baseDef.defense + shockDef }
  return { attSide, att, def }
}

function withMomentum(rating: number, momentum: number, side: Side, state?: MatchState): number {
  const sign = side === 'home' ? 1 : -1
  const mult = state ? fatigueMult(state, side) : 1
  return (rating + (momentum / 12) * sign) * mult
}

/**
 * Rating efectivo del equipo en este partido = base + shock de forma.
 * El shock está pre-calculado al inicio del partido (matchEngine.ts) y refleja
 * "día bueno/malo" — alguien con buen rating puede jugar por debajo y viceversa.
 * Crítico para reproducir colas pesadas en semipro/youth.
 */
function withFormShock(state: MatchState, base: number, side: Side): number {
  return base + state.formShock[side]
}

function metersToZoneSteps(meters: number, rng: RNG): number {
  if (meters >= 22) return 2
  if (meters >= 12) return 1
  if (meters >= 6) return rng.chance(0.55) ? 1 : 0
  if (meters >= 2) return rng.chance(0.20) ? 1 : 0
  return 0
}

// ============== KICKOFF / RESTART ==============

/** Probabilidad de que el equipo que recibe el saque (el que acaba de anotar) se quede
 *  con la pelota. El resto de las veces la gana el que patea en la disputa aérea. */
const RESTART_RETAIN = 0.4

export function resolveKickoff(state: MatchState, home: MatchTeam, away: MatchTeam, rng: RNG): void {
  const ctx = ctxFor(state, home, away, rng)
  pushEvent(state, 'kickoff', state.possession, N.narrateKickoff(ctx))
  state.possession = other(state.possession)
  state.zone = 'midOwn'
  state.phase = 'openPlay'
  tickClock(state, 1)
}
export function resolveRestart(state: MatchState, home: MatchTeam, away: MatchTeam, rng: RNG): void {
  // Tras anotar saca el que concedió y recibe el que anotó. En este punto `possession`
  // es quien anotó; se la damos al rival para que sea él quien patee, y el saque la
  // devuelve a quien anotó (resolveKickoff la pasa siempre al que recibe).
  const kicker = other(state.possession)
  state.possession = kicker
  resolveKickoff(state, home, away, rng)
  // El saque se disputa en el aire: el que recibe no siempre se queda con la pelota.
  if (!rng.chance(RESTART_RETAIN)) {
    state.possession = kicker
    pushEvent(state, 'commentary', kicker,
      `${(kicker === 'home' ? home : away).shortName} gana el saque en el aire y se queda con la pelota.`)
  }
}

// ============== SET PIECES ==============

export function resolveScrum(state: MatchState, home: MatchTeam, away: MatchTeam, rng: RNG): void {
  const ctx = ctxFor(state, home, away, rng)
  const { att, def, attSide } = attDef(state, home, away)
  const attP = withMomentum(att.setPiece * 0.5 + att.power * 0.5, state.momentum, attSide, state)
  const defP = withMomentum(def.setPiece * 0.5 + def.power * 0.5, state.momentum, other(attSide), state)
  // Recalibración doc: base 0.65, ancho 0.20 (rango 0.65-0.85), sanción ~27% por melé.
  const cleanProb = sigmoid((attP - defP) / 10) * 0.20 + 0.65
  if (rng.chance(cleanProb)) {
    pushEvent(state, 'scrum_won', attSide, N.narrateScrum(ctx, true))
    state.phase = 'openPlay'
    state.momentum += 2 * (attSide === 'home' ? 1 : -1)
    state.scrumResetCount = 0
  } else if (rng.chance(0.85)) {
    // 85% de las melés no limpias terminan en penal; 60% va a favor del feed.
    const penaltyForAttackers = rng.chance(0.60)
    if (penaltyForAttackers) {
      pushEvent(state, 'scrum_penalty', attSide, N.narrateScrum(ctx, true))
      state.phase = 'penalty'
      state.momentum += 3 * (attSide === 'home' ? 1 : -1)
    } else {
      pushEvent(state, 'scrum_penalty', other(attSide), N.narrateScrum(ctx, false))
      state.possession = other(attSide)
      state.zone = mirror(state.zone)
      state.phase = 'penalty'
      state.momentum -= 4 * (attSide === 'home' ? 1 : -1)
    }
    state.scrumResetCount = 0
  } else {
    // Colapso. Si es el 3er reset → penal automático contra el equipo en el feed.
    state.scrumResetCount += 1
    if (state.scrumResetCount >= 3) {
      pushEvent(state, 'scrum_collapse', other(attSide), N.narrateScrumCollapse(ctx))
      state.possession = other(attSide)
      state.zone = mirror(state.zone)
      state.phase = 'penalty'
      state.momentum -= 5 * (attSide === 'home' ? 1 : -1)
      state.scrumResetCount = 0
    } else {
      pushEvent(state, 'scrum_reset', null, N.narrateScrumReset(ctx, state.scrumResetCount))
      state.phase = 'scrum'
    }
  }
  tickClock(state, 1)
}

export function resolveLineout(state: MatchState, home: MatchTeam, away: MatchTeam, rng: RNG): void {
  const ctx = ctxFor(state, home, away, rng)
  const { att, def, attSide } = attDef(state, home, away)
  const attP = withMomentum(att.setPiece, state.momentum, attSide, state)
  const defP = withMomentum(def.setPiece * 0.85, state.momentum, other(attSide), state)
  // Recalibración doc: base 0.78, ancho 0.20 (rango 0.78-0.98, baseline ~0.88).
  const cleanProb = sigmoid((attP - defP) / 14) * 0.20 + 0.78
  if (rng.chance(cleanProb)) {
    pushEvent(state, 'lineout_won', attSide, N.narrateLineout(ctx, true))
    // Maul progresivo: en opp22, ~55%; cerca del medio, 15-20% (catch & drive corto)
    const maulPropensity = state.zone === 'opp22' ? 0.55
      : state.zone === 'midOpp' ? 0.18
      : 0.05
    if (rng.chance(maulPropensity)) {
      if (runMaulProgression(state, ctx, att, def, attSide, rng)) return
    }
    state.phase = 'openPlay'
    state.momentum += 1 * (attSide === 'home' ? 1 : -1)
  } else {
    pushEvent(state, 'lineout_lost', other(attSide), N.narrateLineout(ctx, false))
    state.possession = other(attSide)
    state.zone = mirror(state.zone)
    state.phase = 'openPlay'
    state.momentum -= 3 * (attSide === 'home' ? 1 : -1)
  }
  tickClock(state, 1)
}

// ============== PENALTY ==============

/** Lo que el entrenador ve al tener un penal a favor: puntos esperados de cada opción
 *  y la probabilidad real de acertar los palos. Misma cuenta que usa el motor. */
export interface PenaltyChoices {
  /** Lo que haría el motor solo. */
  auto: PenaltyDecision
  /** Puntos esperados por opción. */
  scores: Record<PenaltyDecision, number>
  /** Probabilidad de acertar a palos desde donde está la marca. */
  kickProb: number
}

export function penaltyChoices(state: MatchState, home: MatchTeam, away: MatchTeam): PenaltyChoices {
  const { att, attSide } = attDef(state, home, away)
  const minutesLeft = (state.half === 1 ? 40 : 80) - state.minute
  const scoreDiff = (attSide === 'home' ? state.score.home - state.score.away : state.score.away - state.score.home)
  const epParams = levelParams(state)
  const rules = state.competitionRules
  const angleSeed = state.minute + (attSide === 'home' ? 0.1 : 0.6)
  const { decision, scores } = decidePenaltyOption({
    zone: state.zone,
    attSide,
    kickerSkill: att.kicking,
    weather: state.weather,
    trailingBig: scoreDiff <= -8,
    minutesLeft,
    scoreDiff,
    angleSeed,
    ownTries: state.tries[attSide],
    oppTries: state.tries[other(attSide)],
    tryBonusRule: rules?.tryBonus ? 'four' : 'none',
    losingBonusActive: !!rules?.losingBonus,
    skillCap: epParams.conversionSkillMax
  })
  const kickProb = placeKickProb({
    kickerSkill: att.kicking, zone: state.zone, attSide, weather: state.weather,
    scoreDiff, minutesLeft, isConversion: false, angleSeed, skillCap: epParams.conversionSkillMax
  })
  return { auto: decision, scores, kickProb }
}

export function resolvePenalty(state: MatchState, home: MatchTeam, away: MatchTeam, rng: RNG): void {
  const ctx = ctxFor(state, home, away, rng)
  const { att, attSide } = attDef(state, home, away)
  const minutesLeft = (state.half === 1 ? 40 : 80) - state.minute
  const scoreDiff = (attSide === 'home' ? state.score.home - state.score.away : state.score.away - state.score.home)

  // Decisión por Expected Points: palos / touch / tap / scrum. El entrenador puede
  // imponer la suya (penaltyOverride); sin ella el flujo del azar es el de siempre.
  const decision = state.penaltyOverride ?? penaltyChoices(state, home, away).auto
  state.penaltyOverride = undefined

  if (decision === 'touch') {
    const meters = rng.int(30, 55)
    // El penal a touch avanza 1-2 zonas según donde se pateó.
    if (state.zone !== 'opp22') state.zone = advance(state.zone, 2)
    state.phase = 'lineout'
    pushEvent(state, 'penalty_to_touch', attSide, N.narratePenaltyToTouch(ctx))
    pushEvent(state, 'kick_to_touch', attSide, N.narrateKickToTouch(ctx, meters))
    tickClock(state, 1)
    return
  }
  if (decision === 'tap') {
    pushEvent(state, 'quick_tap', attSide, N.narrateQuickTap(ctx))
    state.phase = 'openPlay'
    state.momentum += 3 * (attSide === 'home' ? 1 : -1)
    tickClock(state, 1)
    return
  }
  if (decision === 'scrum') {
    pushEvent(state, 'commentary', attSide, 'Eligen melé desde el penal.')
    state.phase = 'scrum'
    tickClock(state, 1)
    return
  }
  // 'palos':
  const penaltyKickParams = levelParams(state)
  const prob = placeKickProb({
    kickerSkill: att.kicking,
    zone: state.zone,
    attSide,
    weather: state.weather,
    scoreDiff,
    minutesLeft,
    isConversion: false,
    angleSeed: state.minute + (attSide === 'home' ? 0.1 : 0.6),
    skillCap: penaltyKickParams.conversionSkillMax
  })
  const made = rng.chance(prob)
  if (made) {
    state.score[attSide] += 3
    state.penalties[attSide] += 1
    pushEvent(state, 'penalty_kick', attSide, N.narratePenaltyKick(ctx, true))
    state.phase = 'restart'
    state.possession = attSide
    state.momentum += 5 * (attSide === 'home' ? 1 : -1)
  } else {
    pushEvent(state, 'penalty_kick_missed', attSide, N.narratePenaltyKick(ctx, false))
    state.possession = other(attSide)
    state.zone = 'midOwn'
    state.phase = 'openPlay'
    state.momentum -= 3 * (attSide === 'home' ? 1 : -1)
  }
  tickClock(state, 2)
}

// ============== CONVERSION ==============

export function resolveConversion(state: MatchState, home: MatchTeam, away: MatchTeam, rng: RNG): void {
  const ctx = ctxFor(state, home, away, rng)
  const { att, attSide } = attDef(state, home, away)
  const minutesLeft = (state.half === 1 ? 40 : 80) - state.minute
  const scoreDiff = (attSide === 'home' ? state.score.home - state.score.away : state.score.away - state.score.home)
  const convParams = levelParams(state)
  const prob = placeKickProb({
    kickerSkill: att.kicking,
    zone: state.zone,
    attSide,
    weather: state.weather,
    scoreDiff,
    minutesLeft,
    isConversion: true,
    angleSeed: state.minute + (attSide === 'home' ? 0.35 : 0.85),
    skillCap: convParams.conversionSkillMax
  })
  const made = rng.chance(prob)
  if (made) {
    state.score[attSide] += 2
    state.conversions[attSide] += 1
    pushEvent(state, 'conversion', attSide, N.narrateConversion(ctx, true))
  } else {
    pushEvent(state, 'commentary', attSide, N.narrateConversion(ctx, false))
  }
  state.phase = 'restart'
  tickClock(state, 1)
}

// ============== OPEN PLAY ==============

export function resolveOpenPlay(state: MatchState, home: MatchTeam, away: MatchTeam, rng: RNG): void {
  const ctx = ctxFor(state, home, away, rng)
  const { att, def, attSide } = attDef(state, home, away)
  const minutesLeft = (state.half === 1 ? 40 : 80) - state.minute
  const params = levelParams(state)

  // ============ 0. Penal disciplinario (offside / no soltar / blocking) ============
  // Antes del flujo normal, hay una probabilidad de penal disciplinario escalada
  // por (1 - discipline/100) del bando que comete la falta y por penaltyRateMult.
  // Esto sube la frecuencia total de penales por partido a niveles realistas
  // (~12-15 eventos vs ~5 antes) y, junto con riskPremium, produce 1-2 palos/partido.
  // El defensor comete más penales (presión sobre el portador) que el atacante.
  const defDisciplineGap = Math.max(0, 1 - def.discipline / 100)
  const attDisciplineGap = Math.max(0, 1 - att.discipline / 100)
  // Bump extra en opp22: defensa cede más penales bajo presión cerca de su línea.
  const opp22Pressure = state.zone === 'opp22' ? 2.4 : 1.0
  const pDefPenalty = 0.22 * defDisciplineGap * params.penaltyRateMult * opp22Pressure
  const pAttPenalty = 0.10 * attDisciplineGap * params.penaltyRateMult
  const disciplineRoll = rng.next()
  if (disciplineRoll < pDefPenalty) {
    // Defensa comete penal → atacante mantiene posesión + phase=penalty.
    pushEvent(state, 'penalty_won', attSide,
      N.narratePenaltyWon(ctx))
    state.phase = 'penalty'
    state.momentum += 2 * (attSide === 'home' ? 1 : -1)
    tickClock(state, 0.5)
    return
  }
  if (disciplineRoll < pDefPenalty + pAttPenalty) {
    // Atacante comete penal → defensa pasa a ser atacante con phase=penalty.
    pushEvent(state, 'penalty_won', other(attSide),
      N.narratePenaltyWon({ ...ctx, attTeam: ctx.defTeam, defTeam: ctx.attTeam, attSide: other(attSide) }))
    state.possession = other(attSide)
    state.zone = mirror(state.zone)
    state.phase = 'penalty'
    state.momentum -= 3 * (attSide === 'home' ? 1 : -1)
    tickClock(state, 0.5)
    return
  }

  if (state.zone === 'own22' && rng.chance(0.85)) {
    // Subido a 0.85: en propio 22 casi siempre patean a touch en rugby moderno.
    // Ayuda a alcanzar el target de ~24 lineouts/partido.
    const meters = rng.int(35, 55)
    state.possession = other(attSide)
    state.zone = 'midOwn'
    state.phase = 'lineout'
    pushEvent(state, 'kick_to_touch', attSide, N.narrateKickToTouch(ctx, meters))
    tickClock(state, 1)
    return
  }
  if (state.zone === 'midOwn' && rng.chance(0.20)) {
    const meters = rng.int(25, 40)
    pushEvent(state, 'box_kick', attSide, N.narrateBoxKick(ctx, meters))
    // Contest aéreo: pace media de chasers atacantes vs receivers defensores.
    //   prob de recuperar el contest ~0.22 baseline (RWC 2019), modulado por pace y aerial.
    const chasePaceAdv = (att.pace - def.pace) / 25  // ~ -2..+2
    const kickerSkillAdv = (att.kicking - 50) / 30
    const recoverProb = Math.max(0.10, Math.min(0.55, 0.22 + chasePaceAdv * 0.08 + kickerSkillAdv * 0.06))
    if (rng.chance(recoverProb)) {
      pushEvent(state, 'box_kick_chase_won', attSide, N.narrateBoxKickChase(ctx, true))
      state.zone = 'midOpp'
    } else {
      pushEvent(state, 'box_kick_chase_lost', other(attSide),
        N.narrateBoxKickChase({ ...ctx, attTeam: ctx.defTeam, defTeam: ctx.attTeam, attSide: other(attSide) }, false))
      state.possession = other(attSide)
      state.zone = 'midOwn'
    }
    state.phase = 'openPlay'
    tickClock(state, 1)
    return
  }
  // Drop goal: decisión por Expected Points
  const scoreDiffOpen = (attSide === 'home' ? state.score.home - state.score.away : state.score.away - state.score.home)
  const trailingBigOpen = scoreDiffOpen <= -8
  if (state.zone === 'opp22' && rng.chance(0.04)) {
    const dropRules = state.competitionRules
    const wantDrop = shouldAttemptDropGoal({
      zone: state.zone, attSide,
      kickerSkill: att.kicking,
      weather: state.weather,
      trailingBig: trailingBigOpen,
      minutesLeft,
      scoreDiff: scoreDiffOpen,
      angleSeed: state.minute + 0.3,
      losingBonusActive: !!dropRules?.losingBonus,
      skillCap: params.conversionSkillMax
    })
    if (wantDrop) {
      const baseP = sigmoid((att.kicking - 35) / 18)
      pushEvent(state, 'drop_goal_attempt', attSide, N.narrateDropGoalAttempt(ctx))
      if (rng.chance(baseP * 0.5 + 0.15)) {
        state.score[attSide] += 3
        state.drops[attSide] += 1
        pushEvent(state, 'drop_goal', attSide, N.narrateDropGoal(ctx, true))
        state.phase = 'restart'
        state.momentum += 6 * (attSide === 'home' ? 1 : -1)
      } else {
        pushEvent(state, 'drop_goal_missed', attSide, N.narrateDropGoal(ctx, false))
        state.possession = other(attSide)
        state.zone = 'midOwn'
        state.phase = 'openPlay'
      }
      tickClock(state, 1)
      return
    }
  }

  const attPower = withMomentum(att.attack, state.momentum, attSide, state)
  const defPower = withMomentum(def.defense, state.momentum, other(attSide), state)
  // breakProb base + ruido extra cuando varianceMult > 1 (semipro/youth).
  const breakNoise = (params.varianceMult - 1) * 0.04 * (rng.next() - 0.5)
  const breakProb = Math.max(0, Math.min(1, sigmoid((attPower - defPower) / 14) + breakNoise))

  // ============ 1. Line break + try directo en opp22 ============
  if (state.zone === 'opp22') {
    if (rng.chance(breakProb * 0.45 * params.tryRateMult)) { scoreTry(state, attSide, ctx); return }
  }
  // Line break en cualquier zona: ~10% × breakProb
  if (rng.chance(breakProb * 0.10 * params.tryRateMult)) {
    pushEvent(state, 'line_break', attSide, N.narrateLineBreak(ctx))
    const steps = metersToZoneSteps(rng.int(20, 35), rng)
    if (steps > 0) state.zone = advance(state.zone, steps)
    state.momentum += 6 * (attSide === 'home' ? 1 : -1)
    if (state.zone === 'opp22' && rng.chance(breakProb * 0.60 * params.tryRateMult)) { scoreTry(state, attSide, ctx); return }
    tickClock(state, 0.5)
    // Tras line_break sin try, continúa con cadena: la defensa se reorganiza pero el ataque sigue
    if (runRuckChain(state, ctx, att, def, attSide, true, rng)) return
    state.phase = 'openPlay'
    return
  }

  // ============ 1.5. Kick variety (grubber/chip/cross) en midOpp ============
  // Backs con buena patada táctica eligen estos cuando la línea defensiva está plana.
  // Probabilidad baja porque son jugadas específicas; modulada por kicking del equipo.
  if ((state.zone === 'midOpp' || state.zone === 'opp22') && rng.chance(0.05 + (att.kicking - 50) / 400)) {
    const kickType = rng.next()
    if (kickType < 0.40) {
      const recovered = rng.chance(0.40)
      pushEvent(state, 'grubber', attSide, N.narrateGrubber(ctx, recovered))
      if (recovered) {
        state.zone = 'opp22'
      } else {
        if (rng.chance(0.55)) {
          state.possession = other(attSide)
          state.zone = mirror(state.zone)
        }
      }
      state.phase = 'openPlay'
      tickClock(state, 0.6)
      return
    }
    if (kickType < 0.70) {
      const recovered = rng.chance(0.35)
      pushEvent(state, 'chip_kick', attSide, N.narrateChipKick(ctx, recovered))
      if (recovered) {
        state.zone = 'opp22'
      } else {
        state.possession = other(attSide)
        state.zone = mirror(state.zone)
      }
      state.phase = 'openPlay'
      tickClock(state, 0.6)
      return
    }
    const recovered = rng.chance(0.45)
    pushEvent(state, 'cross_kick', attSide, N.narrateCrossKick(ctx, recovered))
    if (recovered) {
      state.zone = state.zone === 'midOpp' ? 'opp22' : state.zone
    } else {
      state.possession = other(attSide)
      state.zone = mirror(state.zone)
    }
    state.phase = 'openPlay'
    tickClock(state, 0.6)
    return
  }

  // ============ 2. Tackle (siempre ocurre en fase) ============
  // P(tackle exitoso) baseline ~0.88 (intercepto 2.0 del documento)
  const tackleSuccessLogit = 2.0 + 0.55 * (def.defense - att.attack) / 25 - 0.20 * (state.fatigue[other(attSide)] / 100)
  const tackleSuccess = rng.chance(sigmoid(tackleSuccessLogit))

  if (!tackleSuccess) {
    // Tackle fallido → tackle_break con gain notable
    const gain = rng.int(8, 22)
    pushEvent(state, 'tackle_break', attSide, N.narrateOpenPlayGain(ctx, gain))
    const steps = metersToZoneSteps(gain, rng)
    if (steps > 0) state.zone = advance(state.zone, steps)
    state.momentum += 4 * (attSide === 'home' ? 1 : -1)
    if (Math.abs(state.momentum) > 60) state.momentum = Math.sign(state.momentum) * 60
    tickClock(state, 0.6)
    // Tras la ruptura, la posesión continúa: encadenar más fases
    if (runRuckChain(state, ctx, att, def, attSide, true, rng)) return
    state.phase = 'openPlay'
    return
  }

  pushEvent(state, 'tackle', other(attSide), N.narrateTackle(ctx))
  // Gain modesto en tackle exitoso
  const gain = rng.int(0, 8)
  const steps = metersToZoneSteps(gain, rng)
  if (steps > 0) state.zone = advance(state.zone, steps)

  // ============ 3. Offload tras tackle (baseline 0.14) ============
  // Modulación: si el portador es back outside (att.pace alto) +; si tackle es dominante −.
  const offloadBaseLogit = Math.log(0.14 / (1 - 0.14))
  const carrierBackBonus = (att.pace - 50) / 25 * 0.35
  const offloadLogit = offloadBaseLogit + carrierBackBonus
  if (rng.chance(sigmoid(offloadLogit))) {
    pushEvent(state, 'offload', attSide, N.narrateOffload(ctx))
    // El offload continúa la fase: la posesión sigue, encadenar más fases
    const extraGain = rng.int(3, 12)
    const extraSteps = metersToZoneSteps(extraGain, rng)
    if (extraSteps > 0) state.zone = advance(state.zone, extraSteps)
    tickClock(state, 0.4)
    if (runRuckChain(state, ctx, att, def, attSide, true, rng)) return
    state.phase = 'openPlay'
    return
  }

  // ============ 4. Knock-on bajo presión ============
  // Subido a 0.07 baseline para que aparezcan más scrums (target ~12/partido).
  const knockOnProb = state.weather === 'rain' ? 0.105 : 0.07
  if (rng.chance(knockOnProb)) {
    pushEvent(state, 'knock_on', other(attSide), N.narrateKnockOn(ctx, state.weather === 'rain'))
    state.possession = other(attSide)
    state.zone = mirror(state.zone)
    state.phase = 'scrum'
    state.momentum -= 2 * (attSide === 'home' ? 1 : -1)
    tickClock(state, 1)
    return
  }

  // ============ 5. Ruck (baseline retención 94%) ============
  // Idem cadena: penaltyRateMult>1 baja retención → más eventos para palos.
  const ruckDisciplinePenalty = (params.penaltyRateMult - 1) * 0.40
  const ruckLogitBase = Math.log(0.94 / 0.06) // ≈ 2.75
  const ruckLogit = ruckLogitBase
    + 0.45 * (att.attack - def.defense) / 25
    - 0.20 * (state.fatigue[attSide] / 100)
    - ruckDisciplinePenalty
  const ruckSuccess = rng.chance(sigmoid(ruckLogit))

  if (!ruckSuccess) {
    // Penaltí/jackal split: en niveles con peor disciplina, más penales.
    const penShare = Math.max(0.20, Math.min(0.70, 0.40 * params.penaltyRateMult))
    if (rng.chance(1 - penShare)) {
      pushEvent(state, 'jackal_steal', other(attSide), N.narrateJackal(ctx))
      state.possession = other(attSide)
      state.zone = mirror(state.zone)
      state.phase = 'openPlay'
      state.momentum -= 4 * (attSide === 'home' ? 1 : -1)
      tickClock(state, 1)
      return
    } else {
      // Penal por holding on / not releasing
      pushEvent(state, 'penalty_won', other(attSide),
        N.narratePenaltyWon({ ...ctx, attTeam: ctx.defTeam, defTeam: ctx.attTeam, attSide: other(attSide) }))
      state.possession = other(attSide)
      state.zone = mirror(state.zone)
      state.phase = 'penalty'
      state.momentum -= 5 * (attSide === 'home' ? 1 : -1)
      tickClock(state, 1)
      return
    }
  }

  // ============ 6. Sanción disciplinaria del defensor en breakdown ============
  const attDiscipline = att.discipline / 100
  const defDiscipline = def.discipline / 100
  const refMult = state.referee === 'strict' ? 1.4 : state.referee === 'permissive' ? 0.65 : 1.0
  // Reducido a 0.04 (vs 0.07 antes) porque ya hay penales en ruck perdido.
  if (rng.chance(0.04 * (1.4 - defDiscipline) * refMult)) {
    pushEvent(state, 'penalty_won', attSide,
      N.narratePenaltyWon(ctx))
    state.phase = 'penalty'
    state.momentum += 4 * (attSide === 'home' ? 1 : -1)
    tickClock(state, 1)
    return
  }

  // ============ 7. Ruck won — clasificar fast/slow ball ============
  const fastBall = rng.chance(0.65 + (att.pace - 50) / 100)
  if (fastBall) {
    pushEvent(state, 'ruck_won', attSide, N.narrateRuck(ctx, true))
  } else {
    pushEvent(state, 'ruck_slow_ball', attSide, N.narrateRuck(ctx, false))
  }

  // ============ 8. Phase chain: hasta 5 rucks adicionales encadenados ============
  // El primer phase_play va siempre; los siguientes son probabilísticos.
  const extraGain = fastBall ? rng.int(3, 12) : rng.int(1, 6)
  pushEvent(state, 'phase_play', attSide, N.narrateOpenPlayGain(ctx, extraGain))
  const extraSteps2 = metersToZoneSteps(extraGain, rng)
  if (extraSteps2 > 0) state.zone = advance(state.zone, extraSteps2)
  if (Math.abs(state.momentum) > 60) state.momentum = Math.sign(state.momentum) * 60
  void attDiscipline
  tickClock(state, 1)

  // Cadena de rucks: cada paso decide si continúa, y emite tackle + ruck + phase_play.
  if (runRuckChain(state, ctx, att, def, attSide, fastBall, rng)) {
    // El chain ya transicionó state.phase (penalty/scrum/openPlay/conversion). Salimos.
    return
  }
  state.phase = 'openPlay'
}

/**
 * Cadena multi-fase tras un ruck ganado. Emite tackle + ruck + phase_play en bucle
 * con probabilidad decreciente de continuar. Devuelve `true` si la cadena terminó
 * con una transición de fase (turnover, knock_on, penal, try) — el caller debe salir.
 * Devuelve `false` si terminó "naturalmente" (el caller mantiene state.phase = openPlay).
 */
function runRuckChain(
  state: MatchState,
  ctx: ReturnType<typeof ctxFor>,
  att: TeamRating,
  def: TeamRating,
  attSide: Side,
  prevFastBall: boolean,
  rng: RNG
): boolean {
  let lastFastBall = prevFastBall
  // Cadena de hasta 12 fases con prob de continuar constante (0.95).
  // Refleja posesiones reales donde un equipo encadena 5-10 rucks; los hazards
  // (knock_on, ruck perdido, tackle_break) acaban la cadena por sí mismos.
  for (let step = 1; step <= 12; step++) {
    if (!rng.chance(0.95)) return false

    // ---- Penal disciplinario en la fase (offside/no-release defensor en opp22) ----
    // Misma idea que en resolveOpenPlay pero por cada fase de la cadena: en zonas
    // de presión (opp22 especialmente), la defensa cede penales bajo carga.
    // Sin esto, las cadenas largas en opp22 sólo producen tries o turnovers — irreal.
    const chainParams = levelParams(state)
    const defDiscGap = Math.max(0, 1 - def.discipline / 100)
    const chainOpp22Pressure = state.zone === 'opp22' ? 2.5 : 1.0
    const pChainDefPenalty = 0.045 * defDiscGap * chainParams.penaltyRateMult * chainOpp22Pressure
    if (rng.chance(pChainDefPenalty)) {
      pushEvent(state, 'penalty_won', attSide, N.narratePenaltyWon(ctx))
      state.phase = 'penalty'
      state.momentum += 2 * (attSide === 'home' ? 1 : -1)
      tickClock(state, 0.3)
      return true
    }

    // ---- Tackle en la nueva fase (siempre ocurre) ----
    // Logit +2.5 → success ~92%, tackle_break ~8% (vs 12% antes) para alargar cadenas.
    const chainTackleLogit = 2.5
      + 0.55 * (def.defense - att.attack) / 25
      - 0.20 * (state.fatigue[other(attSide)] / 100)
    if (!rng.chance(sigmoid(chainTackleLogit))) {
      // Tackle roto → tackle_break y termina cadena
      const gain = rng.int(6, 16)
      pushEvent(state, 'tackle_break', attSide, N.narrateOpenPlayGain(ctx, gain))
      const steps = metersToZoneSteps(gain, rng)
      if (steps > 0) state.zone = advance(state.zone, steps)
      state.momentum += 3 * (attSide === 'home' ? 1 : -1)
      tickClock(state, 0.3)
      return false  // continúa en openPlay
    }
    pushEvent(state, 'tackle', other(attSide), N.narrateTackle(ctx))

    // ---- Knock-on bajo presión (muy bajo en cadena para preservar densidad) ----
    const chainKnockOnProb = state.weather === 'rain' ? 0.012 : 0.005
    if (rng.chance(chainKnockOnProb)) {
      pushEvent(state, 'knock_on', other(attSide), N.narrateKnockOn(ctx, state.weather === 'rain'))
      state.possession = other(attSide)
      state.zone = mirror(state.zone)
      state.phase = 'scrum'
      state.momentum -= 2 * (attSide === 'home' ? 1 : -1)
      tickClock(state, 0.4)
      return true
    }

    // ---- Pick & go: 9 atacando el ruck cerca de los palos ----
    const pickGoProb = state.zone === 'opp22' ? 0.22 : 0.10
    if (rng.chance(pickGoProb)) {
      pushEvent(state, 'ruck_pickgo', attSide, N.narrateRuckPickGo(ctx))
      const pickGain = rng.int(1, 4)
      const pickSteps = metersToZoneSteps(pickGain, rng)
      if (pickSteps > 0) state.zone = advance(state.zone, pickSteps)
      tickClock(state, 0.25)
      continue
    }

    // ---- Ruck retention (decae ligeramente con la cadena) ----
    // En niveles con peor disciplina (penaltyRateMult>1) reducimos retención
    // → más turnovers → más eventos de penalty para llegar a 2-3 palos/partido.
    const chainParamsRuck = levelParams(state)
    const disciplinePenalty = (chainParamsRuck.penaltyRateMult - 1) * 0.40
    const chainRuckLogit = Math.log(0.94 / 0.06)
      + 0.45 * (att.attack - def.defense) / 25
      - 0.20 * (state.fatigue[attSide] / 100)
      - 0.04 * step
      - disciplinePenalty
    if (!rng.chance(sigmoid(chainRuckLogit))) {
      // Turnover: jackal vs penal. La proporción de penales aumenta en niveles
      // con peor disciplina (semipro/youth) vía penaltyRateMult.
      const penShareParams = levelParams(state)
      const penShare = Math.max(0.20, Math.min(0.70, 0.40 * penShareParams.penaltyRateMult))
      const jackalShare = 1 - penShare
      if (rng.chance(jackalShare)) {
        pushEvent(state, 'jackal_steal', other(attSide), N.narrateJackal(ctx))
        state.possession = other(attSide)
        state.zone = mirror(state.zone)
        state.phase = 'openPlay'
        state.momentum -= 4 * (attSide === 'home' ? 1 : -1)
      } else {
        pushEvent(state, 'penalty_won', other(attSide),
          N.narratePenaltyWon({ ...ctx, attTeam: ctx.defTeam, defTeam: ctx.attTeam, attSide: other(attSide) }))
        state.possession = other(attSide)
        state.zone = mirror(state.zone)
        state.phase = 'penalty'
        state.momentum -= 5 * (attSide === 'home' ? 1 : -1)
      }
      tickClock(state, 0.35)
      return true
    }

    // ---- Ruck ganado: fast vs slow ball decae por fase ----
    const baseFastBallProb = lastFastBall ? 0.55 : 0.40
    const phaseFastBall = rng.chance(Math.max(0.20, baseFastBallProb - step * 0.05))
    lastFastBall = phaseFastBall
    if (phaseFastBall) {
      pushEvent(state, 'ruck_won', attSide, N.narrateRuck(ctx, true))
    } else {
      pushEvent(state, 'ruck_slow_ball', attSide, N.narrateRuck(ctx, false))
      if (step >= 3 && rng.chance(0.25)) {
        pushEvent(state, 'ruck_use_it_warn', null, N.narrateRuckUseItWarn())
      }
    }

    // ---- Phase play con avance residual ----
    const phaseGain = phaseFastBall ? rng.int(2, 9) : rng.int(0, 5)
    pushEvent(state, 'phase_play', attSide, N.narrateOpenPlayGain(ctx, phaseGain))
    const phaseSteps = metersToZoneSteps(phaseGain, rng)
    if (phaseSteps > 0) state.zone = advance(state.zone, phaseSteps)

    // ---- Try probable en opp22 tras varias fases ----
    const chainDiff = att.attack - def.defense
    const chainBlowoutBoost = chainDiff > BLOWOUT_DIFF_THRESHOLD ? chainParams.blowoutMassBoost : 0
    const chainTryProb = (0.025 + 0.008 * step) * chainParams.tryRateMult + chainBlowoutBoost
    if (state.zone === 'opp22' && step >= 3 && rng.chance(chainTryProb)) {
      scoreTry(state, attSide, ctx)
      return true
    }

    tickClock(state, 0.18)
  }
  return false
}

/**
 * Maul progresivo: hasta 6 drives encadenados. Cada uno puede:
 *  - avanzar (continúa el maul)
 *  - estancarse (maul_stall) → penal a defensa
 *  - hundirse (maul_collapse) → free kick a defensa
 *  - sacarse (maul_use_it) → continúa como ruck/openPlay
 *  - llegar al in-goal → try
 * Devuelve `true` si terminó con transición fuerte (penal/try/conversión) y el
 * caller debe salir; `false` si terminó "naturalmente" (caller sigue openPlay).
 */
function runMaulProgression(
  state: MatchState,
  ctx: ReturnType<typeof ctxFor>,
  att: TeamRating,
  def: TeamRating,
  attSide: Side,
  rng: RNG
): boolean {
  pushEvent(state, 'maul_form', attSide, N.narrateMaulForm(ctx))
  let totalMeters = 0
  const sign = attSide === 'home' ? 1 : -1
  const driveAdvantage = (att.power - def.defense) / 25  // -2..+2 aprox

  for (let drive = 1; drive <= 6; drive++) {
    // Cada drive: outcome ponderado por fortaleza relativa.
    //   continue: ~65% (modulado por power) — sigue empujando
    //   stall:    ~12% (sube si pierde fuerza)
    //   collapse: ~6%
    //   use_it:   ~12% (sube si zona ya no es opp22 o llevamos varios drives)
    //   ... try via meters si llega al in-goal
    // continueProb base 0.78 (era 0.65): apunta a ~2.5 drives/maul como target.
    const continueProb = Math.max(0.40, 0.78 + driveAdvantage * 0.06 - drive * 0.04)
    const stallProb    = Math.max(0.04, 0.10 - driveAdvantage * 0.03 + drive * 0.02)
    const collapseProb = 0.05
    const useItProb    = Math.min(0.45, 0.08 + drive * 0.04 + (state.zone !== 'opp22' ? 0.08 : 0))
    const total = continueProb + stallProb + collapseProb + useItProb
    const roll = rng.next() * total
    let acc = 0
    let outcome: 'continue' | 'stall' | 'collapse' | 'use_it'
    if ((acc += continueProb) > roll) outcome = 'continue'
    else if ((acc += stallProb) > roll) outcome = 'stall'
    else if ((acc += collapseProb) > roll) outcome = 'collapse'
    else outcome = 'use_it'

    if (outcome === 'continue') {
      const meters = rng.int(2, 6)
      totalMeters += meters
      pushEvent(state, 'maul_drive', attSide, N.narrateMaulDrive(ctx, meters))
      const steps = metersToZoneSteps(meters, rng)
      if (steps > 0) state.zone = advance(state.zone, steps)
      // Si acumulamos suficiente avance en opp22, prob. de try crece con drives
      const maulParams = levelParams(state)
      if (state.zone === 'opp22' && totalMeters >= 8 && rng.chance((0.25 + drive * 0.06) * maulParams.tryRateMult)) {
        scoreTry(state, attSide, ctx)
        return true
      }
      tickClock(state, 0.4)
      continue
    }
    if (outcome === 'stall') {
      pushEvent(state, 'maul_stall', other(attSide), N.narrateMaulStall(ctx))
      state.possession = other(attSide)
      state.zone = mirror(state.zone)
      state.phase = 'penalty'
      state.momentum -= 3 * sign
      tickClock(state, 0.5)
      return true
    }
    if (outcome === 'collapse') {
      pushEvent(state, 'maul_collapse', other(attSide), N.narrateMaulCollapse(ctx))
      state.possession = other(attSide)
      state.zone = mirror(state.zone)
      state.phase = 'scrum'  // free kick → scrum por defecto (simplificación)
      state.momentum -= 2 * sign
      tickClock(state, 0.4)
      return true
    }
    // use_it
    pushEvent(state, 'maul_use_it', attSide, N.narrateMaulUseIt(ctx))
    tickClock(state, 0.3)
    return false  // continúa en openPlay con la posesión
  }
  // 6 drives sin transición fuerte → forzar use_it
  pushEvent(state, 'maul_use_it', attSide, N.narrateMaulUseIt(ctx))
  tickClock(state, 0.3)
  return false
}

function scoreTry(state: MatchState, attSide: Side, ctx: ReturnType<typeof ctxFor>): void {
  state.score[attSide] += 5
  state.tries[attSide] += 1
  pushEvent(state, 'try', attSide, N.narrateTry(ctx))
  state.phase = 'conversion'
  state.momentum += 12 * (attSide === 'home' ? 1 : -1)
  if (Math.abs(state.momentum) > 50) state.momentum = Math.sign(state.momentum) * 50
  tickClock(state, 1)
}
