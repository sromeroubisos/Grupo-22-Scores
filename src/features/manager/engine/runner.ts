// Driver de simulación. Expone dos backends sobre el mismo motor:
//   - runBatch: corre el partido completo en una llamada (idéntico a simulateMatch).
//   - createStreamingRunner: precomputa determinísticamente y luego revela los
//     eventos al ritmo del reloj simulado, para consumo en rAF desde la UI.
//
// Convención de velocidad (Fase 1, consolidada con el usuario):
//   1x = 1 minuto simulado por cada segundo real
//   ⇒ partido completo (80 min) dura ~80 s en 1x, ~10 s en 8x.

import type { MatchEvent, MatchResult, MatchTeam } from './types.ts'
import { simulateMatch, type SimulateOpts } from './matchEngine.ts'

/**
 * Camino batch: alias semántico de simulateMatch. Mantenerlo aquí permite que
 * monteCarlo y calibration sigan usando simulateMatch sin cambios mientras la
 * UI consume el runner streaming.
 */
export function runBatch(home: MatchTeam, away: MatchTeam, opts: SimulateOpts = {}): MatchResult {
  return simulateMatch(home, away, opts)
}

export interface StreamingRunner {
  /** Resultado precomputado (events incluido). Inmutable durante el replay. */
  readonly result: MatchResult
  /** Avanza el reloj simulado en función del tiempo real y la velocidad.
   *  Devuelve los eventos que acaban de cruzar su minuto de aparición.
   *  @param realDtSeconds  delta de tiempo real desde el último advance
   *  @param timeScale      factor (1 = 1 min sim/s real, 8 = 8 min sim/s)
   */
  advance(realDtSeconds: number, timeScale: number): MatchEvent[]
  /** True cuando ya se han revelado todos los eventos del partido. */
  finished(): boolean
  /** Drena todos los eventos restantes de golpe y marca como terminado. */
  skipToEnd(): MatchEvent[]
  /** Vuelve al inicio para repetir el replay con los mismos eventos precomputados. */
  reset(): void
  /** Minuto simulado actual (float). */
  simulatedMinute(): number
  /** Índice del próximo evento aún sin revelar (== events.length si finalizó). */
  revealedCount(): number
}

/**
 * Crea un runner streaming sobre un MatchResult ya precomputado. La precomputación
 * es determinística con la misma seed, así que el replay puede reiniciarse y
 * cualquier monteCarlo paralelo verá exactamente los mismos números.
 */
export function createStreamingRunner(
  home: MatchTeam, away: MatchTeam, opts: SimulateOpts = {}
): StreamingRunner {
  const result = simulateMatch(home, away, opts)
  let simMinute = 0
  let idx = 0

  const advance = (realDtSeconds: number, timeScale: number): MatchEvent[] => {
    if (idx >= result.events.length) return []
    if (realDtSeconds <= 0 || timeScale <= 0) return []
    simMinute += realDtSeconds * timeScale
    const drained: MatchEvent[] = []
    while (idx < result.events.length && result.events[idx].minute <= simMinute) {
      drained.push(result.events[idx])
      idx++
    }
    return drained
  }

  return {
    result,
    advance,
    finished: () => idx >= result.events.length,
    skipToEnd: () => {
      const remaining = result.events.slice(idx)
      idx = result.events.length
      simMinute = result.events[result.events.length - 1]?.minute ?? 80
      return remaining
    },
    reset: () => { idx = 0; simMinute = 0 },
    simulatedMinute: () => simMinute,
    revealedCount: () => idx
  }
}
