// Las ofertas de trabajo.
//
// En El Interino nadie le da un club grande a un técnico sin experiencia: te
// llaman tres del ascenso y elegís. Acá es igual, y es lo que pasa en el rugby
// de club: el primer trabajo es en la categoría de abajo, y el Top 14 llama al
// que ya ganó algo.
//
// LAS OFERTAS NO SE GUARDAN Y NO CONSUMEN EL RNG DE LA CARRERA. Salen de un RNG
// derivado de la semilla (y de la temporada), así que recargar muestra las
// mismas, y mirarlas no cambia lo que va a pasar después. Si consumieran el RNG
// de la carrera, abrir la pantalla de ofertas alteraría el resto de la partida.

import { getCompetition } from '../data/competitions.ts';
import type { CoachState, Objective } from '../types/coach.ts';
import { objectiveFor } from './pressure.ts';
import { createRng, hashSeed, type Rng } from './random.ts';
import { clubsIn, selectableClubs, type WorldState } from './world.ts';

/**
 * Lo que es el club DENTRO de su torneo: A, de los de arriba; B, del medio; C,
 * de los de abajo. Es relativo, igual que en El Interino: un A del Pampeano C es
 * más chico que un C del Top 14.
 */
export type OfferTier = 'A' | 'B' | 'C';

export interface ClubOffer {
    clubId: string;
    competitionId: string;
    tier: OfferTier;
    /** Posición por fuerza dentro de su torneo, 1-based. */
    rank: number;
    teams: number;
    /** Lo que te van a pedir si firmás. */
    objective: Objective;
}

/** El nivel de torneo del primer trabajo: el ascenso (4) y el fondo (5). */
export const FIRST_JOB_MIN_LEVEL = 4;

export function tierOf(rank: number, teams: number): OfferTier {
    if (rank <= Math.ceil(teams / 3)) return 'A';
    if (rank <= Math.ceil((teams * 2) / 3)) return 'B';
    return 'C';
}

/** La oferta de un club, leída de la pirámide. `null` si el club no juega. */
export function offerFor(world: WorldState, clubId: string): ClubOffer | null {
    const competitionId = world.divisions[clubId];
    if (!competitionId) return null;
    const ids = clubsIn(world, competitionId);
    const rank = ids.indexOf(clubId) + 1;
    return {
        clubId,
        competitionId,
        tier: tierOf(rank, ids.length),
        rank,
        teams: ids.length,
        objective: objectiveFor(competitionId, Math.max(1, rank)),
    };
}

/**
 * Hasta qué nivel de torneo te llaman, según tu nombre en el ambiente. El nivel
 * crece hacia abajo: 2 es el Top 14, 5 el fondo de la pirámide.
 */
export function reachableLevel(reputation: number): number {
    if (reputation >= 70) return 2;
    if (reputation >= 45) return 3;
    return FIRST_JOB_MIN_LEVEL;
}

/** Las tres ofertas del primer trabajo: una de cada tier, del ascenso. */
export function startingOffers(seed: number, world: WorldState): ClubOffer[] {
    const rng = createRng(hashSeed(`ofertas:${seed}`));
    return pickOffers(rng, poolFrom(world, FIRST_JOB_MIN_LEVEL, null), [
        { tier: 'C' },
        { tier: 'B' },
        { tier: 'A' },
    ]);
}

/**
 * Las ofertas al cambiar de club (después de un despido). El techo lo pone la
 * reputación, y la primera es siempre del escalón más alto al que llegás: el
 * que hizo méritos tiene que ver que alguien de arriba lo llamó.
 */
export function jobOffers(state: CoachState): ClubOffer[] {
    const rng = createRng(hashSeed(`ofertas:${state.seed}:${state.season}`));
    const level = reachableLevel(state.coach.reputation);
    return pickOffers(rng, poolFrom(state.world, level, state.clubId), [
        { tier: 'A', level },
        { tier: 'C' },
        { tier: 'B' },
        { tier: 'A' },
    ]);
}

interface Candidate {
    offer: ClubOffer;
    level: number;
}

function poolFrom(world: WorldState, minLevel: number, exclude: string | null): Candidate[] {
    const out: Candidate[] = [];
    // `selectableClubs` ya viene ordenado por id: el orden es estable.
    for (const id of selectableClubs(world)) {
        if (id === exclude) continue;
        const offer = offerFor(world, id);
        const level = offer ? getCompetition(offer.competitionId)?.level : undefined;
        if (!offer || level === undefined || level < minLevel) continue;
        out.push({ offer, level });
    }
    return out;
}

/**
 * Una oferta por pedido. Prefiere torneos que todavía no salieron, para que no
 * sean todas del mismo campeonato; si el tier pedido no tiene candidatos, se
 * cae a cualquiera que quede. Nunca repite club.
 */
function pickOffers(
    rng: Rng,
    pool: readonly Candidate[],
    wants: readonly { tier: OfferTier; level?: number }[],
): ClubOffer[] {
    const chosen: ClubOffer[] = [];
    const usedClubs = new Set<string>();
    const usedComps = new Set<string>();

    for (const want of wants) {
        const free = pool.filter((c) => !usedClubs.has(c.offer.clubId));
        const fits = free.filter(
            (c) => c.offer.tier === want.tier && (want.level === undefined || c.level === want.level),
        );
        const fresh = fits.filter((c) => !usedComps.has(c.offer.competitionId));
        const from = fresh.length > 0 ? fresh : fits.length > 0 ? fits : free;
        if (from.length === 0) break;
        const pick = rng.pick(from).offer;
        chosen.push(pick);
        usedClubs.add(pick.clubId);
        usedComps.add(pick.competitionId);
    }
    return chosen;
}
