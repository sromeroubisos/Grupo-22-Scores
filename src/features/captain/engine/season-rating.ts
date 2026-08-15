// EL CAPITÁN — EL PUNTAJE DE LA TEMPORADA.
//
// Un número de 5,0 a 9,9 que contesta una sola pregunta: **¿cómo te fue este
// año, para lo que se esperaba de vos?**
//
// ── Por qué hacía falta, si ya había una planilla ──
// La planilla dice CUÁNTO produjiste y no sirve para comparar: catorce line-outs
// de una segunda línea y cuatro tries de un wing son dos unidades distintas, y
// las dos crecen con los partidos jugados. Sin un número común no hay forma de
// preguntar "¿esta temporada fue buena?", y sin esa pregunta no hay premios
// individuales ni mérito que empuje el crecimiento del año que viene.
//
// ── Es RELATIVO, y por eso el pilar de la Tercera puede sacar 8,2 ──
// El eje es la producción ESPERADA para tu media en tu puesto (`statistics.ts`),
// no un absoluto. Un 8,2 quiere decir "rendiste bastante más de lo que tu nivel
// prometía", no "sos bueno". Eso es lo que hace que el premio de la temporada
// local sea alcanzable desde abajo — que es todo el punto de que exista.
//
// ── DERIVADO, y por eso no lo declara nadie a mano ──
// Sale de cosas que la temporada ya calculó. Se guarda en la fila de la
// trayectoria porque es el número que el jugador vio ese año, igual que la
// media; la fuente de verdad es esta función.

import type { SquadTrack } from '../types/captain.ts';

/** Piso y techo. El 10 no existe: siempre se pudo hacer una más. */
export const RATING_MIN = 5;
export const RATING_MAX = 9.9;

/**
 * LA TEMPORADA CORRECTA. Ni buena ni mala: la que se esperaba.
 *
 * Es el mismo eje que usa el mérito en `growth.ts`, y no está repetido: aquel lo
 * importa de acá. Un número que se pueda calcular desde otro no se escribe dos
 * veces (CLAUDE de captain §1.9).
 */
export const RATING_PIVOT = 6.6;

/**
 * Cuánto vale desviarse de la producción esperada.
 *
 * Con 2,4, producir un 30% más que lo esperado da 7,3 —el corte del premio
 * local— y un 30% menos da 5,9. La banda que la planilla produce de verdad es
 * más angosta que eso, así que un 9 pide una temporada rara y no una tirada
 * afortunada.
 */
const PRODUCTION_WEIGHT = 2.4;

/** Lo que aporta ser titular contra mirar desde el banco. */
const SHARE_WEIGHT = 0.8;

/** Lo que aporta cada cap, con tope: la selección suma, no define. */
const PER_CAP = 0.05;
const CAPS_MAX = 0.4;

/** Salir campeón fue parte de tu año. */
const PER_TITLE = 0.35;

export interface SeasonRatingInput {
    /** La métrica-gloria del puesto, tal como salió. */
    glory: number;
    /** Lo que se esperaba de esa métrica con tu media y tus partidos. */
    expectedGlory: number;
    /** Qué parte de la temporada del club jugaste, de 0 a 1. */
    share: number;
    matchesPlayed: number;
    caps: number;
    titles: number;
}

/**
 * El puntaje de la temporada. Puro: mismo input ⇒ misma salida, sin azar.
 *
 * Una temporada sin un solo partido vale el piso. No es un castigo: es que no
 * hay temporada que puntuar, y devolver 6,6 —"correcta"— haría que un año
 * entero en la enfermería empujara el crecimiento del siguiente como si se
 * hubiera jugado.
 */
export function seasonRating(input: SeasonRatingInput): number {
    if (input.matchesPlayed <= 0) return RATING_MIN;

    const ratio = input.expectedGlory > 0 ? input.glory / input.expectedGlory : 1;
    let rating = RATING_PIVOT + (ratio - 1) * PRODUCTION_WEIGHT;
    rating += (input.share - 0.5) * SHARE_WEIGHT;
    rating += Math.min(CAPS_MAX, input.caps * PER_CAP);
    rating += input.titles * PER_TITLE;

    return Math.round(Math.min(RATING_MAX, Math.max(RATING_MIN, rating)) * 10) / 10;
}

/**
 * Lo que el mérito del año que viene necesita saber de este. Se arma acá para
 * que `growth.ts` no tenga que conocer la forma de una fila de trayectoria.
 */
export function meritInputOf(rating: number, track: SquadTrack): { rating: number; track: SquadTrack } {
    return { rating, track };
}
