// Los ejes de una decisión: la ÚNICA traducción entre lo que el motor le hace al
// estado y lo que el jugador lee.
//
// LA REGLA: los chips se calculan RESTANDO ESTADOS, nunca leyendo el efecto
// declarado. Si el motor recortó algo por un techo —la cohesión no pasa de 100,
// la estructura no baja de 0, el club no puede gastar una caja que no tiene—, la
// ficha dice lo que de verdad pasó. Una tarjeta escrita en el idioma del motor
// habla el idioma del jugador sin que haya que tocarla, y no puede prometer una
// cosa y hacer otra.

import type { CoachState, ImpactChip } from '../types/coach.ts';
import { teamRating } from './squad.ts';

/** Cuánto tiene que moverse un eje para que valga la pena mostrarlo. */
const EPSILON = 0.05;
/** En pesos: menos de esto es ruido de redondeo, no una consecuencia. */
const MONEY_EPSILON = 50_000;

/**
 * El orden en que se leen. Primero lo que cambia el equipo, después lo que
 * cambia el club, y la presión al final porque es consecuencia de las otras.
 */
const ORDER: ImpactChip['key'][] = ['plantel', 'caja', 'grupo', 'estructura', 'hinchada', 'presion'];

const LABELS: Record<ImpactChip['key'], string> = {
    plantel: 'Plantel',
    caja: 'Caja',
    grupo: 'Grupo',
    estructura: 'Estructura',
    hinchada: 'Gente',
    presion: 'Presión',
};

/**
 * Los chips de una decisión ya resuelta. `before` y `after` son el estado
 * completo antes y después de aplicar el desenlace.
 */
export function decisionImpact(before: CoachState, after: CoachState): ImpactChip[] {
    // El plantel se mide en puntos de rating de equipo, que es la moneda con la
    // que se juegan los partidos: junta el nivel de los jugadores Y lo que la
    // decisión le dejó a la temporada.
    const plantel =
        teamRating(after.squad)
        + after.seasonMods.rating
        - (teamRating(before.squad) + before.seasonMods.rating);

    const chips: ImpactChip[] = [
        chip('plantel', plantel, 'pts', plantel >= 0),
        chip(
            'caja',
            after.club.finances.caja - before.club.finances.caja,
            'money',
            after.club.finances.caja >= before.club.finances.caja,
        ),
        chip('grupo', after.club.cohesion - before.club.cohesion, 'pts', after.club.cohesion >= before.club.cohesion),
        chip(
            'estructura',
            after.club.finances.estructura - before.club.finances.estructura,
            'pts',
            after.club.finances.estructura >= before.club.finances.estructura,
        ),
        chip(
            'hinchada',
            after.club.finances.hinchada - before.club.finances.hinchada,
            'pts',
            after.club.finances.hinchada >= before.club.finances.hinchada,
        ),
        // La presión al revés que todo lo demás: que suba es malo para el jugador.
        chip('presion', after.pressure - before.pressure, 'pts', after.pressure <= before.pressure),
    ];

    return chips
        .filter((c) =>
            c.unit === 'money' ? Math.abs(c.delta) >= MONEY_EPSILON : Math.abs(c.delta) >= EPSILON,
        )
        .sort((a, b) => ORDER.indexOf(a.key) - ORDER.indexOf(b.key));
}

function chip(
    key: ImpactChip['key'],
    delta: number,
    unit: ImpactChip['unit'],
    good: boolean,
): ImpactChip {
    return {
        key,
        label: LABELS[key],
        delta: unit === 'money' ? Math.round(delta) : Math.round(delta * 10) / 10,
        unit,
        tone: Math.abs(delta) < EPSILON ? 'neutral' : good ? 'good' : 'bad',
    };
}

/**
 * El color con el que se revela un desenlace: se calcula con el modelo COMPLETO,
 * no solo con los chips a la vista. Una decisión que descomprime la presión y
 * vacía la caja se ilumina según el balance de las dos, aunque en pantalla se
 * lea una sola.
 */
export function revealTone(chips: readonly ImpactChip[]): 'good' | 'bad' | 'neutral' {
    if (chips.length === 0) return 'neutral';
    const score = chips.reduce((s, c) => s + (c.tone === 'good' ? 1 : c.tone === 'bad' ? -1 : 0), 0);
    return score > 0 ? 'good' : score < 0 ? 'bad' : 'neutral';
}
