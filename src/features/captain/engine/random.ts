// EL CAPITÁN — el azar.
//
// El PRNG se REUSA, no se copia. `career/engine/random.ts` es un mulberry32 con
// hash FNV-1a que no importa nada, no sabe qué es un club y ya está probado:
// copiarlo sería mantener dos veces el mismo generador y arriesgarse a que un
// día difieran en un `>>> 0`.
//
// Este archivo existe igual, y no es ceremonia: hace que TODO captain/ pida el
// azar por la misma ruta local. Si mañana el PRNG se muda a un lugar neutro,
// hay un solo archivo que tocar.
//
// ── Cómo se usa ──
// El rng es MUTABLE por clausura: no devuelve uno nuevo, mutás el objeto y leés
// `rng.state` cuando querés sellar. El patrón del reducer es siempre el mismo:
//
//     const rng = createRng(next.rngState);
//     ...operar...
//     next.rngState = rng.state;
//
// Y la regla que no se rompe (CLAUDE.md §1): si necesitás azar, pedí un `rng`
// por parámetro. Nunca lo tomes de un scope superior, nunca uses Math.random.

import type { Rng } from '../../career/engine/random.ts';

export { createRng, rngFromState, hashSeed } from '../../career/engine/random.ts';
export type { Rng } from '../../career/engine/random.ts';

/**
 * UNA NORMAL TRUNCADA DE VERDAD: se vuelve a tirar hasta caer adentro, en vez
 * de aplastar la cola contra el borde.
 *
 * `rng.normal(mean, sd, min, max)` RECORTA (`Math.max(min, value)`), y eso no es
 * una normal acotada: es una normal con una TORRE pegada al borde, de altura
 * igual a toda la masa de la cola. Con la campana del margen de crecimiento
 * —media 27, desvío 8, mínimo 18— la cola izquierda pesa ~13%, así que el
 * resultado MÁS PROBABLE del sorteo pasaba a ser exactamente el peor posible.
 * Medido con los valores viejos (media 14, mínimo 4) daba 11,9% de jugadores
 * clavados en el mínimo contra 2,5% en el valor siguiente.
 *
 * No es un detalle de calibración: es la diferencia entre "te puede tocar poco"
 * y "una de cada ocho partidas nace muerta". Un jugador con el margen mínimo
 * toca su techo a los 24 y le quedan once temporadas donde el número solo baja.
 *
 * ── Por qué acá y no en `career/engine/random.ts` ──
 * Porque cambiar `normal()` movería TODAS las carreras de Carrera de Rugby, que
 * es otro juego con otra calibración y otro digest congelado. El generador se
 * comparte; la forma de esta tirada es de El Capitán.
 *
 * ── Determinismo ──
 * Consume una cantidad VARIABLE de tiradas, y está bien: la misma semilla
 * recorre la misma secuencia de rechazos y devuelve el mismo número. Lo que no
 * se puede es llamarla condicionalmente según el estado — la regla de siempre.
 * El corte a `maxIntentos` existe para que un rango imposible no cuelgue el
 * hilo; cuando se agota, recorta, que es el peor caso viejo y no un cuelgue.
 */
export function truncatedNormal(
    rng: Rng,
    mean: number,
    sd: number,
    min: number,
    max: number,
    maxIntentos = 24,
): number {
    for (let i = 0; i < maxIntentos; i += 1) {
        const value = rng.normal(mean, sd);
        if (value >= min && value <= max) return value;
    }
    return Math.min(max, Math.max(min, rng.normal(mean, sd)));
}
