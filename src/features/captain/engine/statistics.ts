// EL CAPITÁN — cuánto jugás y qué producís.
//
// Dos preguntas separadas a propósito. Cuánto jugás depende de vos contra el
// plantel: un pibe de 60 en un club de 75 mira desde el banco. Qué producís
// depende de tu puesto: el mismo jugador, en el mismo partido, es cuatro tries
// si es wing y catorce line-outs si es segunda línea.
//
// Que la planilla salga del puesto y no del componente es la regla §5 del
// CLAUDE.md, y es la que hace que la vitrina del pilar no esté vacía.

import type { CaptainPlayer } from '../types/player.ts';
import type { Rng } from './random.ts';
import { getFamily } from '../data/positions.ts';

/** La media a la que las tasas de `perMatch` están calibradas. */
const REFERENCE_OVR = 70;

/** Cuánto pesa el desgaste del cuerpo en la disponibilidad. */
const BODY_AVAILABILITY = 0.25;

export interface PlayingTime {
    /** Cuánto de la temporada del club jugaste, de 0 a 1. */
    share: number;
    /** El rol que te tocó, para contarlo en palabras. */
    role: 'titular' | 'rotacion' | 'banco' | 'reserva';
}

/**
 * Cuánto vas a jugar esta temporada.
 *
 * El eje es tu media contra la fuerza del club. Diez puntos por encima y sos
 * indiscutido; quince por debajo y no entrás. Después pesan la edad —a los 18
 * nadie es titular de primera, por bueno que sea— y el cuerpo.
 *
 * `bonus` son los escalones que dejó una decisión (`playingTime`): duran una
 * temporada y se apagan solos.
 */
export function playingTimeOf(
    player: CaptainPlayer,
    clubRating: number,
    bodyDamage: number,
    bonus = 0,
): PlayingTime {
    const family = getFamily(player.family);
    const edge = player.ovr - clubRating;

    // De -15 a +10 de diferencia, el share va de 0,08 a 0,95.
    let share = 0.08 + ((Math.min(10, Math.max(-15, edge)) + 15) / 25) * 0.87;

    // La juventud no se salta: antes del debut típico del puesto, el techo baja.
    if (player.age < family.age.debut) {
        const faltan = family.age.debut - player.age;
        share *= Math.max(0.25, 1 - faltan * 0.22);
    }

    // El cuerpo roto te saca de la cancha aunque seas el mejor.
    share *= 1 - Math.min(BODY_AVAILABILITY, bodyDamage / 400);

    share = Math.min(1, Math.max(0, share + bonus * 0.12));

    const role: PlayingTime['role'] = share >= 0.72 ? 'titular'
        : share >= 0.45 ? 'rotacion'
            : share >= 0.2 ? 'banco'
                : 'reserva';

    return { share: Math.round(share * 1000) / 1000, role };
}

export interface SeasonStatLine {
    primary: number;
    secondary: number;
}

/**
 * La planilla de la temporada.
 *
 * Escala la tasa del puesto por media efectiva y la muestrea con una normal,
 * para que dos temporadas idénticas en el papel no den el mismo número. Las
 * métricas en `percent` NO se suman: son un promedio de la temporada, así que
 * no dependen de cuántos partidos jugaste sino de lo bien que los jugaste.
 */
export function seasonStats(
    player: CaptainPlayer,
    matches: number,
    rng: Rng,
    boost = 0,
): SeasonStatLine {
    const { primary, secondary } = getFamily(player.family).glory;
    const factor = (player.ovr / REFERENCE_OVR) ** 1.4;

    const sample = (metric: typeof primary | null): number => {
        if (!metric) return 0;

        if (metric.unit === 'percent') {
            // Un porcentaje no se acumula. La media lo empuja hacia el techo del
            // puesto, y la banda es la real: la élite absoluta patea al 95,7%,
            // lo aceptable ronda 73–79 y abajo de 70 es crisis.
            if (matches <= 0) return 0;
            const centro = metric.perMatch * (0.82 + (player.ovr / REFERENCE_OVR) * 0.2);
            return Math.round(rng.normal(centro, 4, 45, 97) * 10) / 10;
        }

        if (matches <= 0) return 0;
        const esperado = metric.perMatch * matches * factor * (1 + boost * 0.12);
        // Desvío proporcional: una temporada de 40 tries no varía ±0,5.
        const muestra = rng.normal(esperado, Math.max(0.6, esperado * 0.22), 0);
        return metric.unit === 'metres' ? Math.round(muestra) : Math.round(muestra * 10) / 10;
    };

    return { primary: sample(primary), secondary: sample(secondary) };
}
