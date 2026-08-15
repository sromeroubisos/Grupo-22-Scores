// EL CAPITÁN — cuánto jugás y qué producís.
//
// Dos preguntas separadas a propósito. Cuánto jugás depende de vos contra el
// plantel: un pibe de 60 en un club de 75 mira desde el banco. Qué producís
// depende de tu puesto: el mismo jugador, en el mismo partido, es cuatro tries
// si es wing y catorce line-outs si es segunda línea.
//
// Que la planilla salga del puesto y no del componente es la regla §5 del
// CLAUDE.md, y es la que hace que la vitrina del pilar no esté vacía.

import type { CaptainPlayer, SquadRole } from '../types/player.ts';
import type { Rng } from './random.ts';
import { getFamily, youthPlayingFactor } from '../data/positions.ts';

/** La media a la que las tasas de `perMatch` están calibradas. */
const REFERENCE_OVR = 70;

/**
 * CUÁNTO PRODUCE ESTA MEDIA CONTRA LA DE REFERENCIA.
 *
 * Se exporta porque tiene dos lectores y necesita un solo dueño (§1.9): la
 * planilla de la temporada la usa para centrar el sorteo, y la de la carrera
 * (`career-tally.ts`) para estimar lo que ningún puesto anota. Con el 1,4
 * escrito dos veces, retocarlo acá dejaría la cabecera contando una carrera que
 * el motor no jugó.
 */
export function ovrFactor(ovr: number): number {
    return (ovr / REFERENCE_OVR) ** 1.4;
}

/** Cuánto pesa el desgaste del cuerpo en la disponibilidad. */
const BODY_AVAILABILITY = 0.25;

/**
 * Los cuatro puntos de la curva de tiempo de juego. PARÁMETROS LIBRES: son
 * afirmaciones sobre cómo se reparte un plantel de rugby y se discuten como
 * tales. El porqué de la forma —y del bicho que la hizo cambiar— está en
 * `playingTimeOf`.
 */
const EDGE_MIN = -15;
const EDGE_MAX = 10;
const SHARE_FLOOR = 0.08;
const SHARE_AT_LEVEL = 0.78;
const SHARE_CEILING = 0.95;

/**
 * Los tres cortes de rol, de arriba hacia abajo. Son los mismos números que
 * usaba el `role` escrito a mano, con una diferencia que importa: `reserva` ES
 * el corte de abajo, y ahora hay algo que lo lee además del rótulo — la casa
 * propia promete que nunca caés ahí, y esa promesa tiene que apoyarse en el
 * MISMO número que decide el rótulo o las dos cosas se separan en el primer
 * ajuste (CLAUDE de captain §1.9).
 */
const SHARE_TITULAR = 0.72;
const SHARE_ROTACION = 0.45;
export const SHARE_RESERVA = 0.2;

export interface PlayingTime {
    /** Cuánto de la temporada del club jugaste, de 0 a 1. */
    share: number;
    /** El rol que te tocó, para contarlo en palabras. */
    role: SquadRole;
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
 *
 * `sinFondo` es la casa propia: el que resolvió el problema que no era de rugby
 * nunca cae al fondo del plantel. NO es un empujón —no te hace titular, no te
 * suma un solo minuto si ya jugabas— sino un PISO, y por eso entra al final y no
 * como un `bonus` más: lo que compra es que la peor temporada posible no sea la
 * de no jugar nunca.
 */
export function playingTimeOf(
    player: CaptainPlayer,
    clubRating: number,
    bodyDamage: number,
    bonus = 0,
    sinFondo = false,
): PlayingTime {
    const family = getFamily(player.family);
    const edge = player.ovr - clubRating;

    // ── LA CURVA TIENE UNA RODILLA EN EL CERO, Y AHÍ ESTABA EL BICHO ────────
    // Era una recta de −15 a +10 repartiendo 0,08 → 0,95, y esa recta afirmaba
    // algo falso: que estar AL NIVEL de tu club te daba el 60% de los partidos.
    // Medido contra el catálogo, un centro de 90 en el Stade Toulousain (rating
    // 95) jugaba 11 de 26 fechas de liga, y con una lesión encima terminaba la
    // temporada con SIETE partidos siendo el club primero de su torneo.
    //
    // Y la consecuencia no se quedaba en la planilla: menos partidos es menos
    // puntaje de temporada, y el puntaje es lo que reparte los premios y lo que
    // empuja el crecimiento del año siguiente (`engine/growth.ts`). Un jugador
    // de 90 sin premios ni convocatorias no era una decisión de diseño: era esta
    // recta.
    //
    // Los tres puntos de la curva nueva dicen lo que pasa en un plantel:
    //
    //   −15 → 0,08   no pertenecés a ese plantel y se nota
    //     0 → 0,78   estás al nivel: sos titular, con la rotación del rugby
    //                moderno adentro (nadie juga 26 fechas seguidas)
    //   +10 → 0,95   sos indiscutido y te bajan solo para descansarte
    //
    // Sigue siendo dura hacia abajo a propósito: el que llega a un club cinco
    // puntos por encima suyo se come el banco, que es exactamente la tensión que
    // el mercado tiene que tener.
    const e = Math.min(EDGE_MAX, Math.max(EDGE_MIN, edge));
    let share = e <= 0
        ? SHARE_FLOOR + ((e - EDGE_MIN) / -EDGE_MIN) * (SHARE_AT_LEVEL - SHARE_FLOOR)
        : SHARE_AT_LEVEL + (e / EDGE_MAX) * (SHARE_CEILING - SHARE_AT_LEVEL);

    // La juventud no se salta: antes del debut típico del puesto, el techo baja.
    // La curva vive en `data/positions.ts` porque la lee también la camada
    // (`data/cohort.ts`), y dos copias del mismo 0,22 se separan en el primer
    // ajuste sin que nada falle.
    share *= youthPlayingFactor(player.age, family.age.debut);

    // El cuerpo roto te saca de la cancha aunque seas el mejor.
    share *= 1 - Math.min(BODY_AVAILABILITY, bodyDamage / 400);

    share = Math.min(1, Math.max(0, share + bonus * 0.12));
    if (sinFondo) share = Math.max(share, SHARE_RESERVA);

    const role: SquadRole = share >= SHARE_TITULAR ? 'titular'
        : share >= SHARE_ROTACION ? 'rotacion'
            : share >= SHARE_RESERVA ? 'banco'
                : 'reserva';

    return { share: Math.round(share * 1000) / 1000, role };
}

export interface SeasonStatLine {
    primary: number;
    secondary: number;
    /**
     * LO QUE SE ESPERABA de la métrica principal, con esta media y estos
     * partidos. Es el centro alrededor del cual se muestreó `primary`.
     *
     * Se devuelve —en vez de recalcularse afuera— porque es la MISMA cuenta:
     * duplicarla en `season-rating.ts` sería una derivada congelada, y el día
     * que alguien tocara la tasa del puesto acá, el puntaje de la temporada
     * seguiría midiendo contra la vieja sin que nada fallara (CLAUDE de
     * captain §1.9).
     */
    expectedPrimary: number;
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
    const factor = ovrFactor(player.ovr);

    /** El centro de la distribución: lo que este jugador debería producir. */
    const expected = (metric: typeof primary | null): number => {
        if (!metric || matches <= 0) return 0;
        if (metric.unit === 'percent') {
            // Un porcentaje no se acumula. La media lo empuja hacia el techo del
            // puesto, y la banda es la real: la élite absoluta patea al 95,7%,
            // lo aceptable ronda 73–79 y abajo de 70 es crisis.
            return metric.perMatch * (0.82 + (player.ovr / REFERENCE_OVR) * 0.2);
        }
        return metric.perMatch * matches * factor * (1 + boost * 0.12);
    };

    const sample = (metric: typeof primary | null, centro: number): number => {
        if (!metric || matches <= 0) return 0;

        if (metric.unit === 'percent') {
            return Math.round(rng.normal(centro, 4, 45, 97) * 10) / 10;
        }

        // Desvío proporcional: una temporada de 40 tries no varía ±0,5.
        const muestra = rng.normal(centro, Math.max(0.6, centro * 0.22), 0);
        return metric.unit === 'metres' ? Math.round(muestra) : Math.round(muestra * 10) / 10;
    };

    const expectedPrimary = expected(primary);
    return {
        primary: sample(primary, expectedPrimary),
        secondary: sample(secondary, expected(secondary)),
        expectedPrimary,
    };
}
