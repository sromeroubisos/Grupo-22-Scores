/**
 * PRNG determinístico (mulberry32) + utilidades de muestreo.
 *
 * Determinístico: misma semilla => misma secuencia. Esencial para que las
 * partidas por consola y los tests sean reproducibles, y para poder revalidar
 * un run en el servidor a partir de (semilla + decisiones + versión del motor).
 */

import type { Rng } from './types.ts';

const UINT32 = 4294967296;

export function makeRng(seed: number): Rng {
    let a = seed >>> 0;

    function nextUint(): number {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return (t ^ (t >>> 14)) >>> 0;
    }

    const rng: Rng = {
        next() {
            return nextUint() / UINT32;
        },
        range(min, max) {
            return min + (max - min) * rng.next();
        },
        int(min, max) {
            return Math.floor(rng.range(min, max + 1));
        },
        chance(p) {
            return rng.next() < p;
        },
        pick(arr) {
            return arr[Math.floor(rng.next() * arr.length)];
        },
        weightedPick(items, weightOf) {
            const weights = items.map(weightOf);
            const total = weights.reduce((sum, w) => sum + Math.max(0, w), 0);
            if (total <= 0) {
                return items[Math.floor(rng.next() * items.length)];
            }
            let r = rng.next() * total;
            for (let i = 0; i < items.length; i += 1) {
                r -= Math.max(0, weights[i]);
                if (r <= 0) return items[i];
            }
            return items[items.length - 1];
        },
        gaussian(mean, sd) {
            // Box-Muller
            let u = 0;
            let v = 0;
            while (u === 0) u = rng.next();
            while (v === 0) v = rng.next();
            const n = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
            return mean + n * sd;
        },
        snapshot() {
            return a >>> 0;
        },
    };

    return rng;
}

/** Recorta un número al rango [min, max]. */
export function clamp(value: number, min: number, max: number): number {
    if (value < min) return min;
    if (value > max) return max;
    return value;
}
