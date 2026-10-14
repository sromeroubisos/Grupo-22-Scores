// Los entrenadores de los otros clubes.
//
// No son personas reales: son nombres del padrón (`data/names.ts`), con el mismo
// criterio que los planteles. Lo que importa de ellos es lo que mueve el mercado:
// la reputación (la misma escala 0..100 que la del jugador) y desde cuándo están
// en el club.
//
// Se generan con un RNG DERIVADO de una clave (el club y el año), nunca con el de
// la carrera: así el reparto inicial es determinista sin consumir azar, y un
// entrenador nuevo no corre la secuencia de la temporada.

import { COACH_FIRST_NAMES, SURNAMES } from '../data/names.ts';
import type { BenchCoach } from '../types/coach.ts';
import { createRng, hashSeed } from './random.ts';

/**
 * La reputación típica de un entrenador según el escalón del torneo (2 = Top 14,
 * 5 = la base). Es también lo que un club de ese escalón le pide a un candidato:
 * ver `engine/market.ts`.
 */
export function repForLevel(level: number): number {
    if (level <= 2) return 60;
    if (level === 3) return 42;
    if (level === 4) return 25;
    return 10;
}

/** Un entrenador que asume en `year`. Determinista por clave. */
export function npcCoach(key: string, level: number, year: number): BenchCoach {
    const rng = createRng(hashSeed(`dt:${key}`));
    return {
        name: `${rng.pick(COACH_FIRST_NAMES)} ${rng.pick(SURNAMES)}`,
        rep: Math.round(rng.normal(repForLevel(level), 8, 0, 95)),
        since: year,
    };
}

/** El banco inicial de un club: alguien que ya está hace algunos años. */
export function initialBench(clubId: string, level: number, year: number): BenchCoach {
    const coach = npcCoach(`${clubId}:inicio`, level, year);
    const tenure = createRng(hashSeed(`dt-antiguedad:${clubId}`)).int(0, 5);
    return { ...coach, since: year - tenure };
}
