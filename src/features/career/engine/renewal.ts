import type { CareerState } from '../types/career.ts';
import type { Rng } from './random.ts';
import { getClub } from '../data/clubs.ts';
import { marketValue } from './club-offers.ts';
import { computeEffectiveOvr } from './scoring.ts';

/**
 * EL CLUB TAMBIÉN DECIDE.
 *
 * Hasta 1.16.0 el vínculo se renovaba solo: `renewContract` no tenía un camino
 * en el que el club dijera que no. El jugador podía pasar cinco temporadas de
 * suplente rindiendo por debajo de lo que el club exige y nadie se lo hacía
 * notar; el mercado era siempre una oportunidad, nunca una consecuencia.
 *
 * Ahora, si no rendís, te sueltan. La decisión que aparece NO tiene la opción de
 * quedarse — esa es toda la diferencia con el mercado normal, y es lo que la
 * hace pesar.
 *
 * Tres condiciones duras antes de cualquier tirada, para que no sea una lotería:
 *
 *   · al menos dos temporadas en la carrera (a nadie lo sueltan al llegar);
 *   · NO sos titular (si jugás, el club te quiere);
 *   · tu valor está claramente por debajo de lo que el club exige.
 *
 * Recién ahí se tira, y la probabilidad sube con la brecha, con ser suplente y
 * con venir de una temporada floja.
 */
export const NO_RENEWAL_EVENT_ID = 'club-no-renewal';

/** Brecha mínima entre lo que exige el club y lo que vale el jugador. */
const GAP_THRESHOLD = 3;

export function clubDeclinesRenewal(state: CareerState, rng: Rng): boolean {
    const p = state.player;
    if (p.seasonsPlayed < 2) return false;
    if (p.role === 'starter') return false;

    const club = getClub(p.club);
    const gap = club.rating - marketValue(p, computeEffectiveOvr(p));
    if (gap < GAP_THRESHOLD) return false;

    const last = state.seasons[state.seasons.length - 1];
    const poorSeason = last !== undefined && last.rating < 6.4;

    const chance = 0.24
        + (gap - GAP_THRESHOLD) * 0.045
        + (p.role === 'fringe' ? 0.18 : 0)
        + (poorSeason ? 0.14 : 0);

    return rng.chance(Math.min(0.7, chance));
}
