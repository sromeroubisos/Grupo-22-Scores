// PRNG determinístico y serializable. El estado es un uint32 que se puede
// snapshotear (CareerState.rngState) y restaurar para reproducir una carrera
// exacta. NO se usa Math.random ni Date en el motor: todo sale de la semilla.

export interface Rng {
    /** Estado interno actual (uint32). Guardalo para reanudar de forma exacta. */
    readonly state: number;
    /** Flotante en [0, 1). */
    next(): number;
    /** Entero en [min, max] inclusive. */
    int(min: number, max: number): number;
    /** Flotante en [min, max). */
    float(min: number, max: number): number;
    /** true con probabilidad p (0..1). */
    chance(p: number): boolean;
    /** Elemento aleatorio de un array (uniforme). */
    pick<T>(items: readonly T[]): T;
    /** Elemento aleatorio ponderado por weightFn. */
    weighted<T>(items: readonly T[], weightFn: (item: T) => number): T;
    /** Muestra de una normal(mean, sd), recortada a [min, max] si se pasan. */
    normal(mean: number, sd: number, min?: number, max?: number): number;
}

export function createRng(seed: number): Rng {
    let s = seed >>> 0;

    function next(): number {
        s = (s + 0x6d2b79f5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    const rng: Rng = {
        get state() {
            return s;
        },
        next,
        int(min: number, max: number) {
            if (max < min) [min, max] = [max, min];
            return min + Math.floor(next() * (max - min + 1));
        },
        float(min: number, max: number) {
            return min + next() * (max - min);
        },
        chance(p: number) {
            return next() < p;
        },
        pick<T>(items: readonly T[]) {
            return items[Math.floor(next() * items.length)];
        },
        weighted<T>(items: readonly T[], weightFn: (item: T) => number) {
            let total = 0;
            const weights = items.map((it) => {
                const w = Math.max(0, weightFn(it));
                total += w;
                return w;
            });
            if (total <= 0) return items[Math.floor(next() * items.length)];
            let r = next() * total;
            for (let i = 0; i < items.length; i++) {
                r -= weights[i];
                if (r < 0) return items[i];
            }
            return items[items.length - 1];
        },
        normal(mean: number, sd: number, min?: number, max?: number) {
            // Box-Muller.
            let u = 0;
            let v = 0;
            while (u === 0) u = next();
            while (v === 0) v = next();
            const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
            let value = mean + z * sd;
            if (min !== undefined) value = Math.max(min, value);
            if (max !== undefined) value = Math.min(max, value);
            return value;
        },
    };

    return rng;
}

/** Restaura un RNG a un estado previamente guardado. */
export function rngFromState(state: number): Rng {
    return createRng(state >>> 0);
}

/** Convierte un string en una semilla uint32 estable (FNV-1a). */
export function hashSeed(input: string): number {
    let h = 0x811c9dc5;
    for (let i = 0; i < input.length; i++) {
        h ^= input.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
}
