// EL CAPITÁN — CUÁNTO RINDE UNA TEMPORADA DE TRABAJO.
//
// Este archivo contesta una sola pregunta: el trabajo de este año, ¿cuánto vale?
// No contesta cuánto crece el jugador —eso lo resuelve `aging.ts`, que además
// sabe cuánto le falta al techo y en qué tramo de la curva está—, sino por
// cuánto se multiplica ese trabajo.
//
// ── Por qué vive afuera de `aging.ts` ──
// Porque son seis afirmaciones sobre el mundo del rugby y cada una se discute
// sola: dónde entrenás, cuánta vida tenés fuera del club, la edad, la tirada del
// año, cómo te fue el año pasado y qué clase de jugador te tocó ser. Metidas
// adentro de la fórmula del envejecimiento quedaban seis multiplicaciones
// anónimas en una línea de setenta caracteres, y a los tres meses nadie sabría
// cuál mueve qué. Acá cada una tiene nombre, banda y motivo, y `GrowthFactors`
// las devuelve por separado para que un test pueda medir UNA sin correr las
// otras.
//
// ── LO QUE ESTO PUEDE Y LO QUE NO ──────────────────────────────────────────
// Hay que decirlo fuerte porque es la trampa que este proyecto ya pisó (CLAUDE
// de captain §1.6): `pull` es proporcional a la brecha, así que el lazo de
// `aging.ts` CONVERGE AL TECHO con solo darle temporadas. Un multiplicador que
// entre adentro de ese lazo no puede cambiar ADÓNDE llegás: cambia CUÁNDO.
//
// Y sin embargo no es decorativo, y el motivo es que las temporadas se acaban.
// Con el escalón de entorno completo —del club de barrio al Top 14— el trabajo
// de un año vale entre 0,80 y 1,24 antes de tocar el resto, así que el amateur
// necesita casi el doble de temporadas para cerrar la misma brecha. La carrera
// dura lo que dura: el que crece a 0,8 se retira sin haber llegado. ESA es la
// palanca, y es honesta — no promete un techo distinto, promete que el contexto
// decide si llegás a tiempo.
//
// El corolario para el que venga a calibrar: si querés que MÁS gente se quede
// corta de su techo, este archivo sirve. Si querés que el techo de alguien SEA
// otro, este archivo no es el lugar — eso es `player.built`, que cae afuera del
// recorte a propósito.

import type { CaptainStage } from '../types/player.ts';
import type { SquadTrack } from '../types/captain.ts';
import type { DevelopmentProfile } from './development-profile.ts';
import type { Rng } from './random.ts';
import { profileGrowthFactor } from './development-profile.ts';

/**
 * CALIDAD DEL ENTORNO por nivel de competición, de 0 a 1. PARÁMETRO LIBRE.
 *
 * Es una sola tabla y no dos —"calidad" y "carga"— a propósito: en el rugby real
 * las dos van juntas (el que entrena mejor entrena más horas) y separarlas daba
 * dos perillas para el mismo efecto, que es la forma más rápida de que nadie
 * sepa cuál movió el número.
 *
 * `development` está alto y no bajo, y no es un error: una academia entrena
 * mejor que un club semipro. Es exactamente para lo que existen.
 */
const ENVIRONMENT_QUALITY: Readonly<Record<string, number>> = {
    'elite-world': 1,
    'elite-pro': 0.9,
    'pro-second': 0.75,
    'pro-regional': 0.6,
    development: 0.62,
    semipro: 0.42,
    amateur: 0.28,
};

/** Sin nivel resoluble se asume club de barrio, que es lo más probable. */
const DEFAULT_QUALITY = ENVIRONMENT_QUALITY.amateur;

/**
 * La recta que traduce calidad en multiplicador.
 *
 * CENTRADA EN 0,5, que es dónde vive el jugador típico de este juego —entre el
 * semipro y la academia—. Con `0,75 + q × 0,50` el club de barrio queda en 0,89
 * y el Top 14 en 1,25, y la mitad de la escalera vale exactamente 1. Centrarla
 * en el profesional habría hecho que la carrera normal —que en El Capitán
 * termina en un club amateur, y eso es el rugby— corriera todo el tiempo con un
 * multiplicador menor a uno sin que nada lo compensara.
 */
const ENVIRONMENT_INTERCEPT = 0.75;
const ENVIRONMENT_SLOPE = 0.5;

/**
 * LA VIDA AFUERA. El amateur trabaja o estudia, y esas horas salen de algún
 * lado.
 *
 * Es chico —un 10%— y tiene que serlo: el escalón grande ya lo pone el entorno,
 * y dos castigos grandes sobre el mismo jugador amateur lo dejaban creciendo a
 * la mitad que el profesional, que no es lo que pasa. El profesional paga algo
 * igual: entrenar es su trabajo, pero la vida existe.
 */
const LIFE_LOAD: Readonly<Record<CaptainStage, number>> = {
    amateur: 0.9,
    professional: 0.99,
};

/**
 * EL EMPUJE JUVENIL. Un pibe sano y con techo crece de forma visible, no de a
 * medio punto por año.
 *
 * No se pisa con el `ritmo` de `aging.ts`, que corrige por lo CORTA que sea la
 * ventana del puesto: aquello es del puesto y esto es de la edad. Un pilar de 19
 * cobra los dos; un pilar de 28, ninguno.
 */
const YOUTH_DRIVE_UNDER_21 = 1.22;
const YOUTH_DRIVE_UNDER_24 = 1.1;

/**
 * LA TIRADA DEL AÑO. La mayoría cerca de 1, con irrupciones y mesetas.
 *
 * Es lo que hace que dos jugadores idénticos no tengan la misma curva y que uno
 * mismo no repita el mismo número catorce veces. Va recortada: sin recorte, la
 * cola de la normal produce una temporada que sube ocho puntos de media y eso no
 * se lee como una irrupción sino como un bug.
 */
const ROLL_SD = 0.22;
const ROLL_MIN = 0.6;
const ROLL_MAX = 1.5;

/**
 * EL MÉRITO. La temporada pasada empuja o frena la que viene.
 *
 * ── Qué mira, y sobre todo qué NO ──
 * NO mira cuántos partidos jugaste: eso ya entra en `aging.ts` por el
 * rendimiento, y contarlo dos veces sería premiar dos veces lo mismo. Mira el
 * PUNTAJE de la temporada —qué produjiste en la cancha contra lo que se
 * esperaba de vos— y en qué escalón representativo estuviste. Entrenar un año
 * con el seleccionado forma, y eso no está en ningún otro lado del motor.
 *
 * El eje es 6,6, que es la temporada correcta: por arriba empuja, por abajo
 * frena. La banda es angosta a propósito — el mérito tiene que inclinar la
 * carrera, no decidirla, o el que arranca bien no para nunca y el que arranca
 * mal no se levanta.
 */
const MERIT_PIVOT = 6.6;
const MERIT_PER_POINT = 0.09;
const MERIT_MIN = 0.85;
const MERIT_MAX = 1.32;

/** Lo que suma haber pasado el año adentro de una estructura representativa. */
const MERIT_TRACK_BONUS: Readonly<Record<SquadTrack, number>> = {
    club: 0,
    union: 0.02,
    academia: 0.04,
    m20: 0.04,
    'a-xv': 0.06,
    nacional: 0.06,
};

export interface GrowthFactors {
    /** Dónde entrenás. Del club de barrio al Top 14. */
    entorno: number;
    /** Lo que te saca el laburo o el estudio. */
    vida: number;
    /** El pibe crece más rápido. */
    juventud: number;
    /** La tirada del año: irrupciones y mesetas. */
    tirada: number;
    /** Cómo te fue el año pasado. */
    merito: number;
    /** Precoz, parejo o tardío. */
    perfil: number;
}

export interface GrowthInput {
    age: number;
    stage: CaptainStage;
    /** Nivel de competición del club, tal como lo declara el catálogo. */
    clubLevel: string | null;
    profile: DevelopmentProfile;
    /**
     * La temporada anterior, o `null` en la primera. El puntaje sale de
     * `season-rating.ts` y es la única entrada del mérito que no está ya contada
     * en otro lado del motor.
     */
    previous: { rating: number; track: SquadTrack } | null;
}

export interface GrowthScale {
    /** El producto de los seis. Es lo que multiplica el trabajo del año. */
    scale: number;
    factors: GrowthFactors;
}

function clamp(value: number, min: number, max: number): number {
    if (value < min) return min;
    if (value > max) return max;
    return value;
}

export function environmentFactor(clubLevel: string | null): number {
    const quality = (clubLevel && ENVIRONMENT_QUALITY[clubLevel]) ?? DEFAULT_QUALITY;
    return ENVIRONMENT_INTERCEPT + quality * ENVIRONMENT_SLOPE;
}

export function youthFactor(age: number): number {
    if (age <= 20) return YOUTH_DRIVE_UNDER_21;
    if (age <= 23) return YOUTH_DRIVE_UNDER_24;
    return 1;
}

export function meritFactor(previous: GrowthInput['previous']): number {
    // La primera temporada no tiene pasado, y no se le inventa uno: vale 1, que
    // es "ni empuja ni frena". Poner un valor distinto acá sería afirmar algo
    // sobre un año que no se jugó.
    if (!previous) return 1;
    const porPuntaje = 1 + (previous.rating - MERIT_PIVOT) * MERIT_PER_POINT;
    return clamp(porPuntaje + MERIT_TRACK_BONUS[previous.track], MERIT_MIN, MERIT_MAX);
}

/**
 * Cuánto rinde el trabajo de esta temporada.
 *
 * CONSUME EXACTAMENTE UNA TIRADA, siempre y en el mismo lugar. Si el sorteo
 * dependiera de la edad, del club o de si hay temporada anterior, el stream
 * dependería del camino y dos partidas con la misma semilla dejarían de ser
 * comparables. Es la misma regla que el ruido de `aging.ts` y que la tirada de
 * lesión de la pretemporada.
 */
export function seasonGrowthScale(input: GrowthInput, rng: Rng): GrowthScale {
    const tirada = rng.normal(1, ROLL_SD, ROLL_MIN, ROLL_MAX);

    const factors: GrowthFactors = {
        entorno: environmentFactor(input.clubLevel),
        vida: LIFE_LOAD[input.stage],
        juventud: youthFactor(input.age),
        tirada,
        merito: meritFactor(input.previous),
        perfil: profileGrowthFactor(input.profile, input.age),
    };

    const scale = factors.entorno
        * factors.vida
        * factors.juventud
        * factors.tirada
        * factors.merito
        * factors.perfil;

    return { scale, factors };
}
