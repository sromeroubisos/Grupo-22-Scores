import type { Player } from '../types/player.ts';
import type { Rng } from './random.ts';
import { canRepresent, captureFor, targetUnion } from './eligibility.ts';

export interface NationalTeamResult {
    calledUp: boolean;
    capsGained: number;
    debut: boolean; // primera convocatoria de la carrera
}

function clamp01(v: number): number {
    return Math.max(0, Math.min(1, v));
}

// Piso de nivel test-match, en la MISMA escala que el rating de club: 63 está
// entre un club pro de segunda línea y uno de élite. Calibrado contra el OVR
// inicial 34-46 y los picos reales del motor (59-78 según posición); si sube el
// techo del jugador, esto sube con él.
const TEST_MATCH_LEVEL = 63;

/**
 * La selección corre EN PARALELO al club. Ser convocado depende del OVR
 * efectivo (nivel test-match), la fama y la edad. Un jugador ya establecido
 * mantiene su lugar con más facilidad que uno que pelea por entrar.
 */
export function evaluateNationalTeam(player: Player, effectiveOvr: number, rng: Rng): NationalTeamResult {
    const isRegular = player.nationalTeam !== null;
    const ageOk = player.age >= 19 && player.age <= 35;

    // Unión a la que se aspira. Sale del estado de elegibilidad, NO de
    // `player.nationality`: una nacionalidad sin unión modelada no genera
    // selección, y una captura previa manda sobre la nacionalidad.
    const union = targetUnion(player.eligibility);
    if (union === null || !canRepresent(player.eligibility, union)) {
        return { calledUp: false, capsGained: 0, debut: false };
    }

    // Umbral de nivel para pelear un lugar en la selección.
    if (!isRegular && (!ageOk || effectiveOvr < TEST_MATCH_LEVEL)) {
        return { calledUp: false, capsGained: 0, debut: false };
    }

    const callChance = clamp01((effectiveOvr - (TEST_MATCH_LEVEL - 2)) / 20 + player.dynamics.fame * 0.003);
    const calledUp = isRegular ? rng.chance(Math.max(0.45, callChance * 0.9)) : rng.chance(callChance);
    if (!calledUp) return { calledUp: false, capsGained: 0, debut: false };

    const debut = !isRegular;
    if (debut) {
        // Debut internacional: la unión lo CAPTURA (Reg. 8.2).
        captureFor(player.eligibility, union);
        player.nationalTeam = union;
        player.dynamics.fame = Math.min(100, player.dynamics.fame + 8);
    }

    const capBase = 2 + Math.round((effectiveOvr - (TEST_MATCH_LEVEL - 2)) / 6);
    const caps = Math.max(1, Math.round(rng.normal(capBase, 1.5, 0)));
    player.caps += caps;

    return { calledUp: true, capsGained: caps, debut };
}
