import type { Player } from '../types/player.ts';
import type { SeasonStats } from '../types/season.ts';
import { computePoints } from '../types/season.ts';

/**
 * LO QUE UNA DECISIÓN LE DEJA A LA TEMPORADA QUE VIENE.
 *
 * Tres modificadores que antes no existían y que son la mitad de los cinco ejes
 * con los que el juego habla: el tiempo de juego, la suspensión y la planilla.
 * Viven acá y no dentro de `simulate-season.ts` para que se puedan probar solos
 * —son funciones puras de un número— y para que la temporada no crezca otras
 * cincuenta líneas de aritmética.
 *
 * Los tres se apagan al cerrar la temporada. Ninguno se acumula de un año al
 * siguiente: si "pedir una reunión con el técnico" te diera minutos para
 * siempre, la decisión dejaría de ser una decisión y pasaría a ser una compra.
 */

/** Cuánto mueve un escalón de tiempo de juego. Tres escalones ≈ ±36%. */
const STEP = 0.12;
/** Topes del factor. El piso no es 0: el que cae en desgracia juega menos, no deja de existir. */
const FACTOR_MIN = 0.55;
const FACTOR_MAX = 1.45;
/** Topes de la fracción de fechas. Nadie juega el 100% de un calendario. */
const SHARE_MIN = 0.03;
const SHARE_MAX = 0.95;
/** Tope de temporada que se puede perder por disciplina. */
const MAX_BAN_FRACTION = 0.5;

/**
 * Factor sobre la fracción de fechas, por los escalones acumulados de la
 * decisión. 0 escalones ⇒ 1, o sea el comportamiento de siempre, byte por byte.
 */
export function playingTimeFactor(steps: number): number {
    if (!steps) return 1;
    return Math.max(FACTOR_MIN, Math.min(FACTOR_MAX, 1 + steps * STEP));
}

/**
 * Aplica el factor a la banda del lugar en el plantel, con topes duros.
 *
 * Se mueven los DOS extremos de la banda y no sólo el techo: si sólo se moviera
 * el máximo, el rng podría devolver igual el mínimo de siempre y la decisión
 * quedaría en una promesa que a veces no pasa nada.
 */
export function adjustShare(band: readonly [number, number], factor: number): readonly [number, number] {
    if (factor === 1) return band;
    const clamp = (v: number) => Math.max(SHARE_MIN, Math.min(SHARE_MAX, v));
    const lo = clamp(band[0] * factor);
    const hi = clamp(band[1] * factor);
    return lo <= hi ? [lo, hi] : [hi, lo];
}

/** Partidos de suspensión que caen sobre esa temporada. */
export function bannedMatches(player: Player, season: number): number {
    let total = 0;
    for (const s of player.sanctions) {
        if (s.season === season) total += s.matches;
    }
    return total;
}

/**
 * Fracción de la temporada que se pierde por suspensión.
 *
 * Entra por el MISMO camino que una lesión (`seasonsOutFraction` →
 * `availability` en `statistics.ts`) en vez de restarle partidos al final. Si se
 * restaran después, la planilla quedaría con los tries de una temporada que no
 * se jugó entera: el jugador vería cuatro partidos y doce tackles.
 */
export function banFraction(banned: number, teamMatches: number): number {
    if (banned <= 0) return 0;
    return Math.min(MAX_BAN_FRACTION, banned / Math.max(1, teamMatches));
}

export interface StatBoost {
    tries: number;
    tackles: number;
}

export const NO_STAT_BOOST: StatBoost = { tries: 0, tackles: 0 };

/**
 * Suma a la planilla lo que dejó la decisión. Los puntos se RECALCULAN con la
 * tabla del deporte en vez de sumar cinco a mano: si mañana un try vale otra
 * cosa, este archivo no tiene que enterarse.
 *
 * Muta `stats` porque es el objeto de la temporada que se está cerrando, igual
 * que el resto de `simulate-season`.
 */
export function applyStatBoost(stats: SeasonStats, boost: StatBoost): void {
    if (boost.tries === 0 && boost.tackles === 0) return;
    stats.tries += boost.tries;
    stats.tackles += boost.tackles;
    stats.points = computePoints(stats);
}
