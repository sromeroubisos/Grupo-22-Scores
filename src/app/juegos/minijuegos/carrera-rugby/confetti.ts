import { hashSeed, rngFromState } from '@/features/career';

/**
 * CONFETI DETERMINISTA.
 *
 * La regla de oro del proyecto no tiene excepción decorativa: nada de
 * `Math.random()`, tampoco acá. Las partículas se siembran con el mismo PRNG del
 * motor a partir de (semilla de la partida + temporada + tipo de festejo), así
 * que el mismo título se festeja igual hoy, mañana y del otro lado de un link
 * compartido.
 *
 * No hay librería: una partícula es posición, retardo, duración, giro y color.
 * Cinco números y un string no justifican una dependencia.
 */
export interface ConfettiPiece {
    /** % del ancho de la capa. */
    left: number;
    /** Retardo de entrada, en ms. Escalona la caída. */
    delay: number;
    /** Duración de la caída, en ms. */
    duration: number;
    /** Giro total, en grados. Con signo: caen para los dos lados. */
    spin: number;
    /** Desvío horizontal al caer, en % del ancho. */
    drift: number;
    /** Alto del papelito, en px. El ancho sale del CSS. */
    height: number;
    color: string;
}

/**
 * Paleta del festejo. El acento del club o de la unión entra como primer color
 * y el resto acompaña: un título se ve de los colores del que lo ganó.
 */
export function confettiFor(seed: number, key: string, accent: string, count = 42): ConfettiPiece[] {
    const rng = rngFromState(hashSeed(`${seed}:confetti:${key}`));
    const palette = [accent, accent, '#F2C14E', '#F2F2F2', '#4C86C6'];

    return Array.from({ length: count }, () => ({
        left: Math.round(rng.float(-4, 104) * 10) / 10,
        delay: Math.round(rng.float(0, 900)),
        duration: Math.round(rng.float(2200, 3800)),
        spin: Math.round(rng.float(-540, 540)),
        drift: Math.round(rng.float(-12, 12) * 10) / 10,
        height: Math.round(rng.float(7, 14)),
        color: palette[Math.floor(rng.float(0, palette.length - 0.001))],
    }));
}
