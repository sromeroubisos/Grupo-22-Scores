// Partido en vivo, con decisiones del entrenador.
//
// El `StreamingRunner` de runner.ts precalcula el partido entero y después lo
// revela: sirve para mirar, no para decidir. Este corre el MatchRunner a medida
// que pasa el reloj, así que en el momento en que el club del entrenador tiene un
// penal a favor el partido se frena y la decisión (palos, touch, rápido o melé)
// cambia de verdad lo que pasa después.
//
// Si el entrenador nunca decide —o salta al final—, el motor elige por puntos
// esperados, que es lo que hace `simulateMatch`: mismo marcador, mismo partido.

import type { MatchEvent, MatchResult, MatchTeam, Side } from './types.ts'
import { MatchRunner, type SimulateOpts } from './matchEngine.ts'
import type { PenaltyChoices } from './phases.ts'
import type { PenaltyDecision } from './expectedPoints.ts'

/** Tope de fases por avance: un salto de pestaña no tiene que congelar la página. */
const MAX_TICKS_PER_ADVANCE = 60

export interface LiveSim {
  /** Eventos que ya pasaron. Referencia viva: no mutar. */
  events(): ReadonlyArray<MatchEvent>
  /** Avanza el reloj. Devuelve cuántos eventos nuevos hubo. Con una decisión
   *  pendiente el reloj no corre. */
  advance(realDtSeconds: number, timeScale: number): number
  /** Produce eventos hasta tener al menos `count` (o hasta el final, o hasta un penal por decidir).
   *  Es el ritmo de la animación: la pantalla pide la jugada que viene cuando termina la actual. */
  produce(count: number): void
  /** El penal a favor del entrenador que espera su decisión, o null. */
  awaiting(): PenaltyChoices | null
  /** Resuelve el penal pendiente con la decisión del entrenador. */
  decide(decision: PenaltyDecision): void
  /** Termina el partido de golpe; lo pendiente lo decide el motor. */
  skipToEnd(): void
  finished(): boolean
  /** Minuto simulado actual. */
  minute(): number
  /** Solo válido con `finished() === true`. */
  result(): MatchResult
}

export function createLiveSim(
  home: MatchTeam,
  away: MatchTeam,
  opts: SimulateOpts,
  mySide: Side
): LiveSim {
  const runner = new MatchRunner(home, away, opts)
  let clock = 0
  let waiting: PenaltyChoices | null = null
  /** True entre la decisión (o el "que decida el motor") y el tick que la consume. */
  let released = false

  /** Un paso del motor. False si hay que frenar para que el entrenador decida. */
  const step = (): boolean => {
    if (!released) {
      const pending = runner.pendingPenalty(mySide)
      if (pending) {
        waiting = pending
        return false
      }
    }
    runner.tick()
    released = false
    return true
  }

  return {
    events: () => runner.events(),
    advance(realDtSeconds, timeScale) {
      if (waiting || runner.finished() || realDtSeconds <= 0 || timeScale <= 0) return 0
      const before = runner.events().length
      clock += realDtSeconds * timeScale
      for (let i = 0; i < MAX_TICKS_PER_ADVANCE && !runner.finished() && runner.snapshot().minute <= clock; i++) {
        if (!step()) break
      }
      return runner.events().length - before
    },
    produce(count) {
      for (let i = 0; i < 400 && runner.events().length < count && !runner.finished(); i++) {
        if (!step()) break
      }
    },
    awaiting: () => waiting,
    decide(decision) {
      if (!waiting) return
      runner.choosePenalty(decision)
      waiting = null
      released = true
    },
    skipToEnd() {
      waiting = null
      released = true
      while (!runner.finished()) {
        step()
        released = true
      }
      clock = Math.max(clock, runner.snapshot().minute)
    },
    finished: () => runner.finished(),
    minute: () => runner.snapshot().minute,
    result: () => runner.result()
  }
}
