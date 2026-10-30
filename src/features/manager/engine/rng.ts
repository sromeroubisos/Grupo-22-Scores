// Generador de números aleatorios con semilla, para simulaciones reproducibles.
// Algoritmo: Mulberry32. La semilla es OBLIGATORIA: no hay fallback a
// Math.random(), porque eso rompe el determinismo sin avisar.

export interface RNG {
  /** Real en [0, 1). */
  next(): number
  /** Entero en [min, max] inclusive. */
  int(min: number, max: number): number
  /** True con probabilidad p (0-1). */
  chance(p: number): boolean
  /** Elige un elemento al azar. */
  pick<T>(arr: readonly T[]): T
  /** Estado interno (uint32). Con él se retoma el flujo exacto. */
  state(): number
}

/** `state` opcional: si se pasa, retoma el flujo desde ahí e ignora `seed`. */
export function createRNG(seed: number, state?: number): RNG {
  if (!Number.isFinite(seed)) {
    throw new Error(`createRNG: semilla inválida (${seed}). El motor no acepta azar sin semilla.`)
  }
  let s = (state ?? seed) >>> 0
  const next = (): number => {
    s = (s + 0x6D2B79F5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    next,
    int(min, max) { return min + Math.floor(next() * (max - min + 1)) },
    chance(p) { return next() < p },
    pick<T>(arr: readonly T[]): T { return arr[Math.floor(next() * arr.length)] },
    state() { return s }
  }
}

/** Función sigmoide. Útil para convertir diferencias de rating en probabilidades. */
export function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x))
}
