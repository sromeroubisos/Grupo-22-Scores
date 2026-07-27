// PERFIL DE DESARROLLO — la forma de la carrera, no su altura.
//
// Hasta 1.9.0 todas las carreras tenían la misma curva: los `PEAKS` de aging.ts
// son fijos por grupo, así que todos los wings picaban en velocidad a los 25
// exactamente y la única diferencia entre dos partidas era el techo sorteado.
//
// El perfil NO toca el techo (eso es `potential`): toca CUÁNDO se llega. Un
// `early` madura rápido y se estabiliza joven; un `late` arranca lento y sigue
// creciendo pasados los 30.
//
// Deliberadamente NO se copia el modelo del juego de fútbol, donde el perfil
// `early` empieza a decaer a los 26. Para rugby es agresivo: un jugador de 26
// está en plenitud en cualquier puesto. Acá `early` significa "llega antes",
// no "se cae antes": no se le adelanta el pico ni un año, se le acelera el
// crecimiento hasta los 23 y se le frena después.
//
// Un resultado que vale anotar: en los BACKS los perfiles `early` y `normal`
// terminan pareciéndose (a los 22 los separa un punto). No es un defecto de
// calibración sino del deporte — un back ya pica joven por su propio puesto, así
// que "madurar temprano" le agrega poco. El perfil se nota mucho más en los
// forwards, cuya carrera se extiende sobre un rango de edad más ancho, y en el
// contraste contra `late` en cualquier puesto.

import type { Position, PositionGroup } from '../types/player.ts';
import { getPosition } from '../data/positions.ts';
import type { Rng } from './random.ts';

export type DevelopmentProfile = 'early' | 'normal' | 'late';

export const DEVELOPMENT_PROFILES: readonly DevelopmentProfile[] = ['early', 'normal', 'late'];

/**
 * Desplazamiento de la edad de pico, en años.
 *
 * `early` NO adelanta el pico. Se probó con −1 y el resultado fue que el early
 * se quedaba a 3 puntos de su techo mientras el late llegaba a 1: con la ventana
 * de crecimiento recortada no le alcanzaba el tiempo para cerrar la brecha, que
 * es exactamente el bug que se arregló en 1.9.0, reaparecido por perfil. Lo que
 * define al `early` es que crece rápido DE JOVEN (ver `profileGrowthFactor`), no
 * que se rompa antes — y adelantarle el declive lo convertía en un castigo.
 *
 * `late` suma 2 (no 3): con 3 llegaba más arriba que los otros dos perfiles y
 * dejaba de ser una forma distinta de carrera para ser la mejor.
 */
const PEAK_SHIFT: Readonly<Record<DevelopmentProfile, number>> = {
    early: 0,
    normal: 0,
    late: 2,
};

export function peakShiftOf(profile: DevelopmentProfile): number {
    return PEAK_SHIFT[profile];
}

/**
 * Cuánto rinde el desarrollo a cada edad. Es lo que de verdad distingue los tres
 * perfiles: el `early` explota de pibe, el `late` recién arranca cuando el otro
 * ya se estabilizó. Los factores se compensan a lo largo de la carrera para que
 * ningún perfil sea estrictamente mejor — cambian el CUÁNDO, no el CUÁNTO.
 */
export function profileGrowthFactor(profile: DevelopmentProfile, age: number): number {
    if (profile === 'early') {
        if (age <= 23) return 1.30;
        if (age <= 26) return 0.92;
        return 0.7;
    }
    if (profile === 'late') {
        if (age <= 22) return 0.72;
        if (age <= 26) return 1.05;
        return 1.45;
    }
    return 1;
}

/**
 * Reparto por GRUPO DE PUESTO. No es parejo a propósito: los backs viven de la
 * velocidad, que pica joven, y los forwards de la fuerza y la técnica de scrum,
 * que maduran cerca de los 30. Elegir pilar o wing cambia la forma esperable de
 * la carrera, no solo la edad del pico.
 *
 * Pesos, no porcentajes exactos: los resuelve `rng.weighted`.
 */
const DISTRIBUTION: Readonly<Record<PositionGroup, Readonly<Record<DevelopmentProfile, number>>>> = {
    back: { early: 35, normal: 50, late: 15 },
    forward: { early: 15, normal: 50, late: 35 },
};

export function profileDistribution(group: PositionGroup): Readonly<Record<DevelopmentProfile, number>> {
    return DISTRIBUTION[group];
}

/** Sortea el perfil del jugador según su puesto. Determinístico: pide el rng. */
export function rollDevelopmentProfile(position: Position, rng: Rng): DevelopmentProfile {
    const weights = DISTRIBUTION[getPosition(position).group];
    // `DEVELOPMENT_PROFILES` es un array literal ordenado: no se itera un objeto
    // para elegir, que sería una fuente de no-determinismo encubierta.
    return rng.weighted([...DEVELOPMENT_PROFILES], (p) => weights[p]);
}

/**
 * Frase de REVELADO para la pantalla de retiro. El perfil está oculto toda la
 * partida —como el potencial— y recién al final se nombra: convierte un número
 * escondido en un descubrimiento, y le da respaldo al arquetipo
 * "El que llegó tarde", que hasta ahora se sostenía solo en la edad del primer
 * contrato.
 */
export function profileRevealText(profile: DevelopmentProfile): string {
    switch (profile) {
        case 'early':
            return 'Maduró temprano: ya de pibe rendía como un veterano.';
        case 'late':
            return 'Maduró tarde: siguió creciendo pasados los 30.';
        case 'normal':
        default:
            return 'Creció parejo, temporada tras temporada.';
    }
}
