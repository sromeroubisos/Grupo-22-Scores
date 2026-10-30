// Única fuente de azar "ambiente" del motor de Rugby Manager.
//
// El motor original llamaba Math.random() en 30 lugares (ids, nombres, lesiones,
// pases de temporada). Pasar un rng por parámetro por cada firma es el destino
// (Fase 1); mientras tanto todo el azar sale de UN flujo con semilla, y usarlo
// sin sembrar TIRA un error en vez de degradar a Math.random en silencio.
//
// Misma semilla + mismas llamadas en el mismo orden => misma partida.
// El estado del flujo cabe en un uint32 (`entropyState`) para poder guardarlo
// con la partida y retomar idéntico después de recargar.

import { createRNG, type RNG } from '../engine/rng.ts'

let stream: RNG | null = null

/** Siembra el flujo. Llamar una vez al crear la partida. */
export function seedEntropy(seed: number): void {
  stream = createRNG(seed)
}

/** Retoma el flujo desde un estado guardado (ver `entropyState`). */
export function restoreEntropy(state: number): void {
  stream = createRNG(0, state)
}

/** Estado actual del flujo, serializable (entero uint32). */
export function entropyState(): number {
  return entropy().state()
}

function entropy(): RNG {
  if (!stream) {
    throw new Error('entropy: flujo sin sembrar. Llamá seedEntropy(seed) o restoreEntropy(state) antes de simular.')
  }
  return stream
}

/** Real en [0, 1). Reemplazo directo de Math.random(). */
export function random(): number {
  return entropy().next()
}

/** Entero en [min, max] inclusive. */
export function randomInt(min: number, max: number): number {
  return entropy().int(min, max)
}

/** Elemento al azar de un arreglo no vacío. */
export function randomPick<T>(arr: readonly T[]): T {
  return entropy().pick(arr)
}
