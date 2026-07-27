import type { Attributes, Player, Position } from '../types/player.ts';
import { getPosition } from '../data/positions.ts';

const ATTR_KEYS: (keyof Attributes)[] = ['power', 'speed', 'technique', 'tackle', 'kick', 'vision', 'mental', 'stamina'];

/** OVR sin redondear. Útil para ajustar atributos a un OVR objetivo exacto. */
export function ovrExact(attributes: Attributes, position: Position): number {
    const weights = getPosition(position).weights;
    let sum = 0;
    for (const key of ATTR_KEYS) {
        sum += attributes[key] * weights[key];
    }
    return sum / 100;
}

/** OVR permanente = round(Σ atributo_i × peso_i / 100), ponderado por posición. */
export function computeOvr(attributes: Attributes, position: Position): number {
    return Math.round(ovrExact(attributes, position));
}

/** Penalización de OVR por lesiones activas (las que todavía "pesan"). */
export function injuryPenalty(player: Player): number {
    let penalty = 0;
    for (const injury of player.injuries) {
        // Solo las lesiones recientes penalizan (última temporada jugada).
        if (injury.season >= player.seasonsPlayed - 1) {
            penalty += injury.ovrImpact;
        }
    }
    return penalty;
}

/**
 * OVR efectivo (para simular la temporada, NO reemplaza al permanente):
 *   OVR + forma*0.04 + moral*0.03 - fatiga*0.05 - lesión
 * Así una mala racha no destruye la técnica del jugador de forma permanente.
 */
export function computeEffectiveOvr(player: Player): number {
    const ovr = computeOvr(player.attributes, player.position);
    const { form, morale, fatigue } = player.dynamics;
    const effective = ovr + form * 0.04 + morale * 0.03 - fatigue * 0.05 - injuryPenalty(player);
    return Math.max(1, Math.round(effective * 10) / 10);
}

export function clampAttr(value: number): number {
    return Math.max(1, Math.min(99, value));
}
