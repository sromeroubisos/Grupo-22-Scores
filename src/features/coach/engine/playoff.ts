// El playoff, jugado por el entrenador.
//
// La fase regular se simula entera; la definición no. Si el club entra a una
// llave —el playoff por el título o el reducido por el ascenso, según el formato
// de la división (`data/formats.ts`)—, cada partido frena y el entrenador elige
// CÓMO encararlo. Los cruces los arma `engine/bracket.ts`. Es la
// única decisión de cancha del juego, y por eso tiene que ser de rugby y tener
// costo: no hay opción mejor que otra, hay una que conviene según quién sos y
// contra quién jugás.
//
//   · El plan de la semana: line, maul y a los palos. Pesa lo que pesa tu
//     CONDUCCIÓN, el doble que en un partido normal.
//   · Salir a morder: la charla del vestuario. Activa la ARENGA aunque la
//     presión no apriete, y se lastima más gente.
//   · Cero penales: el ORDEN. No suma un punto de media: achica el azar. Si sos
//     el mejor te protege de la tarde rara; si sos el peor, te la saca.
//
// Las chances que se muestran salen de jugar el partido 400 veces con un RNG
// DERIVADO (semilla, temporada, instancia, opción): no tocan el azar de la
// carrera, así que mirarlas no cambia lo que va a pasar.

import type { CoachState, PlayoffApproachId } from '../types/coach.ts';
import { NEUTRAL_MODS, rollMatch, type MatchSide, type SidelineMods } from './match.ts';
import { createRng, hashSeed } from './random.ts';

export interface PlayoffApproach {
    id: PlayoffApproachId;
    label: string;
    /** Corto, y dice el costo. */
    hint: string;
}

export const PLAYOFF_APPROACHES: readonly PlayoffApproach[] = [
    {
        id: 'plan',
        label: 'El plan de la semana',
        hint: 'Line, maul y a los palos. Rinde lo que rinde tu conducción.',
    },
    {
        id: 'arenga',
        label: 'Salir a morder',
        hint: 'La charla del vestuario. Rinde con tu arenga, y se lastima más gente.',
    },
    {
        id: 'orden',
        label: 'Cero penales',
        hint: 'No regalar nada. Sirve si sos mejor; si sos peor, te saca la sorpresa.',
    },
];

/** Cuántos partidos se simulan para estimar la chance. */
const SAMPLES = 400;

/** Lo que cada forma de encarar el partido le hace a los modificadores del club. */
export function approachMods(mods: SidelineMods, id: PlayoffApproachId): SidelineMods {
    if (id === 'plan') {
        // La conducción ya cuenta en `sidelineEdge`; acá cuenta otra vez.
        return { ...mods, seasonRating: mods.seasonRating + (mods.conduccion - 5) * 0.8 };
    }
    if (id === 'arenga') {
        // La arenga solo pesa con presión alta (`sidelineEdge`): esta charla la
        // activa igual. El costo es físico.
        return { ...mods, pressure: Math.max(mods.pressure, 100), extraInjuryRisk: mods.extraInjuryRisk + 0.05 };
    }
    // Orden: más disciplina aprieta la campana del marcador.
    return { ...mods, disciplina: Math.min(10, mods.disciplina + 3) };
}

/**
 * Las chances de ganar el próximo partido con cada forma de encararlo, en
 * porcentaje entero. `mySide` es el club del jugador con sus modificadores de
 * siempre; se le aplica cada opción y se juega `SAMPLES` veces.
 */
export function playoffChances(
    state: CoachState,
    mySide: MatchSide,
): Record<PlayoffApproachId, number> {
    const p = state.playoff;
    const out = { plan: 0, arenga: 0, orden: 0 } as Record<PlayoffApproachId, number>;
    if (!p) return out;
    const rival = p.homeId === state.clubId ? p.awayId : p.homeId;
    const rivalSide: MatchSide = { clubId: rival, rating: p.ratings[rival] ?? 20, mods: NEUTRAL_MODS };

    for (const a of PLAYOFF_APPROACHES) {
        const rng = createRng(hashSeed(`playoff:${state.seed}:${state.season}:${p.kind ?? 'titulo'}:${p.stage}:${a.id}`));
        const me: MatchSide = { ...mySide, mods: approachMods(mySide.mods, a.id) };
        const iAmHome = p.homeId === state.clubId;
        let wins = 0;
        for (let i = 0; i < SAMPLES; i++) {
            const roll = rollMatch(rng, iAmHome ? me : rivalSide, iAmHome ? rivalSide : me, { neutral: p.neutral });
            // En eliminación el empate lo gana el local (el mejor ubicado).
            const homeWins = roll.homePf >= roll.awayPf;
            if (homeWins === iAmHome) wins++;
        }
        out[a.id] = Math.round((wins / SAMPLES) * 100);
    }
    return out;
}
