import { randomInt } from '../utils/entropy.ts'
// Bucle principal del motor de partido.
// API pública:
//   - simulateMatch(home, away, opts) -> MatchResult  (camino batch, idéntico a antes)
//   - MatchRunner (clase): tick() por fase, finished(), snapshot(), result()
//
// La clase MatchRunner es la nueva unidad reutilizable: monteCarlo y calibration
// siguen llamando a simulateMatch (que internamente construye un runner y lo agota),
// y el streaming runner de la UI envuelve esta misma maquinaria.

import type { MatchState, MatchTeam, MatchResult, Side, Score, Zone, PhaseType, MatchEvent } from './types.ts'
import type { CompetitionRules } from '../types/index.ts'
import { createRNG, type RNG } from './rng.ts'
import {
  resolveKickoff, resolveRestart,
  resolveScrum, resolveLineout,
  resolvePenalty, resolveConversion,
  resolveOpenPlay,
  penaltyChoices, type PenaltyChoices
} from './phases.ts'
import type { PenaltyDecision } from './expectedPoints.ts'
import { type CompetitionLevel, DEFAULT_LEVEL, paramsForLevel } from './levels.ts'

export interface SimulateOpts {
  /** Seed del partido. Si no se pasa, sale del flujo con semilla (utils/entropy.ts). */
  seed?: number
  /** Quién hace el saque inicial. Por defecto sorteo aleatorio. */
  kickOffBy?: Side
  /** Clima del partido (afecta kicking y handling). */
  weather?: 'clear' | 'rain' | 'wind'
  /** Perfil del árbitro. */
  referee?: 'permissive' | 'balanced' | 'strict'
  /** Importancia del partido (1.0 liga, 1.5 copa, 2.0 final). */
  importance?: number
  /** Nivel competitivo. Default 'pro_domestic' (multipliers neutros). */
  level?: CompetitionLevel
  /** Reglas de competición. Si se pasan, se aplican tácticas de fin (BP4/losing≤7). */
  competitionRules?: CompetitionRules
}

function initialState(
  kickOffBy: Side,
  weather: 'clear' | 'rain' | 'wind',
  referee: 'permissive' | 'balanced' | 'strict',
  importance: number,
  level: CompetitionLevel,
  competitionRules: CompetitionRules | undefined,
  formShock: { home: number; away: number }
): MatchState {
  return {
    minute: 0,
    half: 1,
    score: { home: 0, away: 0 },
    tries: { home: 0, away: 0 },
    conversions: { home: 0, away: 0 },
    penalties: { home: 0, away: 0 },
    drops: { home: 0, away: 0 },
    possession: kickOffBy,
    zone: 'midOwn',
    phase: 'kickoff',
    momentum: 0,
    events: [],
    ended: false,
    fatigue: { home: 0, away: 0 },
    weather,
    referee,
    importance,
    level,
    competitionRules,
    formShock,
    scrums:     { home: 0, away: 0 },
    lineouts:   { home: 0, away: 0 },
    rucks:      { home: 0, away: 0 },
    tackles:    { home: 0, away: 0 },
    turnovers:  { home: 0, away: 0 },
    offloads:   { home: 0, away: 0 },
    lineBreaks: { home: 0, away: 0 },
    mauls:      { home: 0, away: 0 },
    maulDrives: { home: 0, away: 0 },
    pickAndGos: { home: 0, away: 0 },
    quickTaps:  { home: 0, away: 0 },
    scrumResetCount: 0
  }
}

function dispatchPhase(state: MatchState, home: MatchTeam, away: MatchTeam, rng: RNG): void {
  switch (state.phase) {
    case 'kickoff':    return resolveKickoff(state, home, away, rng)
    case 'restart':    return resolveRestart(state, home, away, rng)
    case 'scrum':      return resolveScrum(state, home, away, rng)
    case 'lineout':    return resolveLineout(state, home, away, rng)
    case 'openPlay':   return resolveOpenPlay(state, home, away, rng)
    case 'penalty':    return resolvePenalty(state, home, away, rng)
    case 'conversion': return resolveConversion(state, home, away, rng)
  }
}

export interface MatchSnapshot {
  minute: number
  half: 1 | 2
  score: Score
  possession: Side
  zone: Zone
  phase: PhaseType
  /** Número de eventos generados hasta ahora. */
  eventCount: number
  ended: boolean
}

/**
 * Runner por fase. Cada `tick()` ejecuta una iteración de la máquina de estados
 * (sustituciones + dispatch de fase + cierres de mitad/final). Preserva el orden
 * exacto de consumo de RNG del bucle original para mantener determinismo.
 */
export class MatchRunner {
  private readonly home: MatchTeam
  private readonly away: MatchTeam
  private readonly rng: RNG
  private readonly kickOffBy: Side
  private readonly state: MatchState
  private readonly subbedAt: number[] = []
  private safety = 0

  constructor(home: MatchTeam, away: MatchTeam, opts: SimulateOpts = {}) {
    this.home = home
    this.away = away
    this.rng = createRNG(opts.seed ?? randomInt(0, 0x7fffffff))
    this.kickOffBy = opts.kickOffBy ?? (this.rng.chance(0.5) ? 'home' : 'away')
    const level = opts.level ?? DEFAULT_LEVEL
    // Shock de forma pre-partido: escala con varianceMult del nivel. Para
    // pro/intl (varMult ~1.05) es ~±2; para semipro (1.80) ~±18; para youth (1.50) ~±13.
    // Centrado en 0, simétrico, dos sorteos independientes (home y away pueden tener
    // formas opuestas — uno inspirado y otro apático, como en la realidad).
    const shockAmplitude = (paramsForLevel(level).varianceMult - 1) * 22
    const formShock = {
      home: (this.rng.next() - 0.5) * 2 * shockAmplitude,
      away: (this.rng.next() - 0.5) * 2 * shockAmplitude
    }
    this.state = initialState(
      this.kickOffBy,
      opts.weather ?? 'clear',
      opts.referee ?? 'balanced',
      opts.importance ?? 1.0,
      level,
      opts.competitionRules,
      formShock
    )
  }

  /** True si el partido ha terminado y no hay más fases que resolver. */
  finished(): boolean {
    return this.state.ended
  }

  /** Snapshot ligero del estado actual (sin mutar). */
  snapshot(): MatchSnapshot {
    return {
      minute: this.state.minute,
      half: this.state.half,
      score: { ...this.state.score },
      possession: this.state.possession,
      zone: this.state.zone,
      phase: this.state.phase,
      eventCount: this.state.events.length,
      ended: this.state.ended
    }
  }

  /** Eventos generados hasta ahora (referencia viva: no mutar). */
  events(): ReadonlyArray<MatchEvent> {
    return this.state.events
  }

  /** Si `side` tiene un penal a favor sin resolver, las opciones con sus números.
   *  Es el momento en que el entrenador puede decidir; null el resto del tiempo. */
  pendingPenalty(side: Side): PenaltyChoices | null {
    const s = this.state
    if (s.ended || s.phase !== 'penalty' || s.possession !== side) return null
    return penaltyChoices(s, this.home, this.away)
  }

  /** Impone la decisión para el penal pendiente. Se usa en el próximo `tick()`. */
  choosePenalty(decision: PenaltyDecision): void {
    this.state.penaltyOverride = decision
  }

  /**
   * Avanza una iteración. Ejecuta, en este orden:
   *   1) sustituciones programadas a min 55 y 65
   *   2) freno de seguridad si llevamos > 800 iteraciones
   *   3) dispatch de la fase actual (única fuente de consumo de RNG)
   *   4) cierre de primera mitad
   *   5) cierre de partido tras 80 min
   *
   * Si el runner ya está `finished()`, este método es no-op.
   */
  tick(): void {
    if (this.state.ended) return

    this.safety++

    // ============ 1. Sustituciones intra-partido a min 55 y 65 ============
    for (const subMin of [55, 65]) {
      if (this.state.minute >= subMin && this.state.half === 2 && !this.subbedAt.includes(subMin)) {
        this.subbedAt.push(subMin)
        for (const side of ['home', 'away'] as const) {
          if (this.state.fatigue[side] >= 50) {
            const team = side === 'home' ? this.home : this.away
            this.state.fatigue[side] = Math.max(0, this.state.fatigue[side] - 25)
            this.state.events.push({
              minute: this.state.minute, side, type: 'commentary',
              text: `${team.shortName} mete piernas frescas desde el banquillo.`,
              scoreAfter: { ...this.state.score },
              zone: this.state.zone,
              possession: this.state.possession,
              phase: this.state.phase
            })
          }
        }
      }
    }

    // ============ 2. Freno de seguridad ============
    if (this.safety > 800) {
      this.state.events.push({
        minute: this.state.minute,
        side: null, type: 'commentary',
        text: 'Tiempo agotado por límite de seguridad.',
        scoreAfter: { ...this.state.score },
        zone: this.state.zone,
        possession: this.state.possession,
        phase: this.state.phase
      })
      this.state.ended = true
      return
    }

    // ============ 3. Dispatch de fase (consume RNG) ============
    dispatchPhase(this.state, this.home, this.away, this.rng)

    // ============ 4. Final de la primera parte ============
    if (this.state.half === 1 && this.state.minute >= 40) {
      this.state.events.push({
        minute: this.state.minute,
        side: null, type: 'half_end',
        text: 'Final del primer tiempo.',
        scoreAfter: { ...this.state.score },
        zone: this.state.zone,
        possession: this.state.possession,
        phase: this.state.phase
      })
      this.state.half = 2
      this.state.phase = 'kickoff'
      this.state.possession = this.kickOffBy === 'home' ? 'away' : 'home'
      this.state.zone = 'midOwn'
      this.state.momentum = Math.round(this.state.momentum / 2)
      return
    }

    // ============ 5. Final del partido (tras 80 min) ============
    if (this.state.half === 2 && this.state.minute >= 80) {
      const calmPhases: PhaseType[] = ['kickoff', 'restart', 'lineout', 'scrum']
      if (calmPhases.includes(this.state.phase) || this.state.minute >= 82) {
        this.state.events.push({
          minute: this.state.minute, side: null, type: 'full_time',
          text: 'Suena el silbato. Final del partido.',
          scoreAfter: { ...this.state.score },
          zone: this.state.zone,
          possession: this.state.possession,
          phase: this.state.phase
        })
        this.state.ended = true
      }
    }
  }

  /** Construye el MatchResult final. Sólo válido tras `finished() === true`. */
  result(): MatchResult {
    return {
      homeTeam: this.home,
      awayTeam: this.away,
      finalScore: this.state.score,
      tries: this.state.tries,
      conversions: this.state.conversions,
      penalties: this.state.penalties,
      drops: this.state.drops,
      events: this.state.events,
      scrums: this.state.scrums,
      lineouts: this.state.lineouts,
      rucks: this.state.rucks,
      tackles: this.state.tackles,
      turnovers: this.state.turnovers,
      offloads: this.state.offloads,
      lineBreaks: this.state.lineBreaks,
      mauls: this.state.mauls,
      maulDrives: this.state.maulDrives,
      pickAndGos: this.state.pickAndGos,
      quickTaps: this.state.quickTaps
    }
  }
}

/**
 * Camino batch: corre el partido entero. Equivalente al bucle previo, con
 * orden de RNG idéntico, para preservar determinismo en monteCarlo y calibration.
 */
export function simulateMatch(
  home: MatchTeam,
  away: MatchTeam,
  opts: SimulateOpts = {}
): MatchResult {
  const runner = new MatchRunner(home, away, opts)
  while (!runner.finished()) runner.tick()
  return runner.result()
}
