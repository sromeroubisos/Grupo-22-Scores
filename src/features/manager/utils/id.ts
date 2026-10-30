import { random } from './entropy.ts'

/**
 * Genera un ID corto, único dentro de una partida. Sale del flujo con semilla
 * (utils/entropy.ts): la misma partida produce siempre los mismos ids. Ya no
 * mezcla Date.now(), que era la otra fuente de no-determinismo.
 */
export function newId(prefix = 'id'): string {
  const rnd = random().toString(36).slice(2, 10)
  const salt = random().toString(36).slice(2, 6)
  return `${prefix}_${rnd}${salt}`
}
