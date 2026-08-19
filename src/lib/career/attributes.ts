/**
 * Cálculo de OVR. Se distingue el OVR PERMANENTE (promedio ponderado de los
 * atributos por posición) del OVR EFECTIVO usado para simular la temporada, que
 * suma forma/moral y resta fatiga/lesión. Así una mala racha no destruye la
 * técnica real del jugador: sólo baja su rendimiento coyuntural.
 */

import type { Attributes, InjurySeverity, Player, Position } from './types.ts';
import { ATTRIBUTE_KEYS, POSITION_WEIGHTS } from './positions.ts';
import { clamp } from './random.ts';

export function computeOvr(attrs: Attributes, position: Position): number {
    const weights = POSITION_WEIGHTS[position];
    let sum = 0;
    for (const key of ATTRIBUTE_KEYS) {
        sum += attrs[key] * weights[key];
    }
    return Math.round(sum / 100);
}

function severityWeight(severity: InjurySeverity): number {
    if (severity === 'grave') return 5;
    if (severity === 'moderada') return 3;
    return 1;
}

/** Penalización por lesiones que todavía arrastran efecto (seasonsOut > 0). */
export function injuryPenalty(player: Player): number {
    return player.injuries.reduce(
        (acc, injury) => acc + (injury.seasonsOut > 0 ? severityWeight(injury.severity) : 0),
        0,
    );
}

/**
 * OVR efectivo = OVR + forma*0.04 + moral*0.03 - fatiga*0.05 - lesión.
 * Es el número que se usa para simular partidos y rating de la temporada.
 */
export function computeEffectiveOvr(player: Player): number {
    const base = computeOvr(player.attributes, player.position);
    const effective =
        base +
        player.form * 0.04 +
        player.morale * 0.03 -
        player.fatigue * 0.05 -
        injuryPenalty(player);
    return clamp(effective, 1, 99);
}

export function averageAttribute(attrs: Attributes): number {
    let sum = 0;
    for (const key of ATTRIBUTE_KEYS) sum += attrs[key];
    return sum / ATTRIBUTE_KEYS.length;
}

/** Aplica deltas a los atributos in-place, recortando a [1, 99]. */
export function applyAttributeDeltas(attrs: Attributes, deltas: Partial<Attributes>): void {
    for (const key of ATTRIBUTE_KEYS) {
        const delta = deltas[key];
        if (typeof delta === 'number' && delta !== 0) {
            attrs[key] = clamp(attrs[key] + delta, 1, 99);
        }
    }
}
