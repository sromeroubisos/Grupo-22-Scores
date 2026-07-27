import type { Player, PlayerRole } from '../types/player.ts';
import type { ClubOffer } from '../types/career.ts';
import type { ClubDef } from '../data/clubs.ts';
import { CLUBS, getClub, clubLeague } from '../data/clubs.ts';
import { computeOvr } from './scoring.ts';
import { resolveContract } from './contracts.ts';
import {
    MIGRATION_ROUTES, classifyMovement, homeCountryOf, marketRung, migrationRegionOf, movementBetween,
    pathwayTargets, pathwaysFrom, scorePathwayCandidate,
} from './market-routes.ts';
import type { Rng } from './random.ts';

/** Rol probable en un club según el OVR efectivo y el prestigio del club. */
export function roleAtClub(effectiveOvr: number, clubPrestige: number): PlayerRole {
    const startThreshold = clubPrestige * 0.55 + 22;
    const rotationThreshold = clubPrestige * 0.45 + 8;
    if (effectiveOvr >= startThreshold) return 'starter';
    if (effectiveOvr >= rotationThreshold) return 'rotation';
    return 'fringe';
}

/** Edad a partir de la cual el mercado empieza a mirar para atrás. */
export const VETERAN_AGE = 33;

/**
 * Cuánto puede sumar la PROMESA por encima del rendimiento actual. Acotado a
 * propósito: sin tope, un juvenil con techo alto valía tanto como un
 * profesional hecho y entraba directo a una franquicia. La proyección abre
 * puertas, no las reemplaza.
 */
export const MAX_UPSIDE_BONUS = 7;

/**
 * Valor de mercado del jugador, en la MISMA escala que `club.rating` (0..100).
 * Mezcla lo que rinde HOY con lo que promete: un pibe con techo alto vale algo
 * más que su OVR actual, y un veterano algo menos que el suyo.
 */
export function marketValue(player: Player, effectiveOvr: number): number {
    const ovr = computeOvr(player.attributes, player.position);
    const upside = Math.min(MAX_UPSIDE_BONUS, Math.max(0, player.potential - ovr) * 0.35);
    const youth = player.age <= 23 ? 1 : player.age <= 27 ? 0.5 : 0.15;
    const recentInjuries = player.injuries.filter((i) => i.season >= player.seasonsPlayed - 2);
    const injuryDrag = recentInjuries.reduce((sum, i) => sum + (i.severity === 'grave' ? 3 : i.severity === 'moderada' ? 1.2 : 0.4), 0);
    const agingDrag = Math.max(0, player.age - 31) * 1.6;
    const starterBonus = player.role === 'starter' ? 2 : player.role === 'rotation' ? 0.5 : -2;

    return effectiveOvr + upside * youth + player.dynamics.fame * 0.1 + starterBonus - injuryDrag - agingDrag;
}

/**
 * Salto EXCEPCIONAL (±2 escalones). Regla marcada y acotada: hay que venir de
 * una temporada sobresaliente, estar en edad de progresar y tener techo. Es la
 * única puerta para saltar más de un escalón.
 */
export function qualifiesForExceptionalJump(player: Player, effectiveOvr: number): boolean {
    const ovr = computeOvr(player.attributes, player.position);
    return (
        player.dynamics.form >= 78 &&
        player.role === 'starter' &&
        player.age <= 27 &&
        player.potential - ovr >= 8 &&
        effectiveOvr >= getClub(player.club).rating
    );
}

/**
 * REGLA MARCADA — regreso del veterano. A partir de los 33 el jugador puede
 * volver a un club de su país sin importar cuántos escalones baje: es el final
 * de carrera típico (de una liga europea al club de toda la vida). Solo hacia
 * abajo, y solo al país de su nacionalidad.
 */
export function isVeteranHomecoming(player: Player, club: ClubDef): boolean {
    if (player.age < VETERAN_AGE) return false;
    const home = homeCountryOf(player.nationality);
    if (home === null || club.countryCode !== home) return false;
    return marketRung(club) <= marketRung(getClub(player.club));
}

/** Escalones a los que el jugador puede acceder esta ventana de mercado. */
export function allowedRungs(player: Player, effectiveOvr: number): number[] {
    const current = marketRung(getClub(player.club));
    const veteran = player.age >= VETERAN_AGE;
    // El veterano ya no sube, pero su ventana hacia abajo se ensancha: a esa
    // edad se aceptan ligas bastante menores con tal de seguir jugando.
    const up = veteran ? 0 : qualifiesForExceptionalJump(player, effectiveOvr) ? 2 : 1;
    const down = veteran ? 3 : up;

    const rungs: number[] = [];
    for (let delta = -down; delta <= up; delta++) rungs.push(current + delta);
    return rungs.filter((r) => r >= 0);
}

// Cercanía del club a la ruta natural del jugador. Multiplica el peso: un
// argentino recibe más ofertas de Argentina y de sus destinos migratorios
// habituales que de una liga con la que no tiene ningún vínculo.
function proximityWeight(player: Player, club: ClubDef): number {
    const home = homeCountryOf(player.nationality);
    if (home && club.countryCode === home) return player.age >= VETERAN_AGE ? 4 : 2.2;

    const route = MIGRATION_ROUTES[migrationRegionOf(player.nationality)];
    const match = route.find((r) => r.countryCode === club.countryCode);
    if (match) return 1 + match.weight * 0.18;

    if (club.region === getClub(player.club).region) return 1.1;
    return 0.5;
}

/**
 * ¿El club se interesa por el jugador? Compara su valor con lo que el club
 * exige. `tolerance` la relaja: una vía profesional reconocida abre un poco la
 * puerta, pero NO la regala — sin nivel no hay oferta aunque exista la ruta.
 */
export function clubIsInterested(club: ClubDef, value: number, tolerance = 8): boolean {
    // Cuanto más rico el club, más exigente: puede elegir.
    const demand = club.rating + (club.marketBand - 3) * 1.5;
    return value >= demand - tolerance;
}

/** Por qué un club entró al pool. Sirve para auditar los saltos grandes. */
export type OfferOrigin = 'window' | 'pathway' | 'homecoming';

interface Candidate {
    club: ClubDef;
    via: OfferOrigin;
    pathwayId: string | null;
    weight: number;
}

/**
 * Genera hasta DOS ofertas de club (la UI muestra "quedarte" + estas dos).
 * El pool tiene tres puertas, y cada oferta declara por cuál entró:
 *   · `window`     — ventana habitual de ±1 escalón (±2 con excepción marcada);
 *   · `pathway`    — vía profesional normal entre sistemas (NPC → Super Rugby);
 *   · `homecoming` — regreso del veterano a su país.
 * Nunca incluye el club actual ni una copa: el pool son clubes de liga.
 * Determinístico: mismo (jugador, catálogo, estado de RNG) ⇒ mismas ofertas.
 */
export function generateOffers(player: Player, effectiveOvr: number, rng: Rng): ClubOffer[] {
    const current = getClub(player.club);
    const value = marketValue(player, effectiveOvr);
    const rungs = new Set(allowedRungs(player, effectiveOvr));
    const veteran = player.age >= VETERAN_AGE;

    const baseWeight = (club: ClubDef): number => {
        const direction = movementBetween(current, club);
        // Bajar de categoría solo es atractivo si el jugador ya no rinde arriba.
        const directionWeight = direction === 'up' ? 1.4 : direction === 'lateral' ? 1 : veteran ? 1.6 : 0.45;
        const ambition = 1 + Math.max(0, club.prestige - current.prestige) * 0.01;
        return Math.max(0.01, proximityWeight(player, club) * directionWeight * ambition * (1 + club.marketBand * 0.08));
    };

    const candidates = new Map<string, Candidate>();
    const add = (club: ClubDef, via: OfferOrigin, pathwayId: string | null, boost: number) => {
        if (club.id === current.id) return;
        if (candidates.has(club.id)) return;
        candidates.set(club.id, { club, via, pathwayId, weight: baseWeight(club) * boost });
    };

    // 1) Vías profesionales normales. Van primero: si un club es alcanzable por
    //    pathway, ese es el motivo real del pase, no la ventana.
    //    El interés se evalúa de forma RELATIVA a la liga de origen: una
    //    franquicia SRA detecta al destacado de su sistema doméstico sin exigir
    //    el valor absoluto de un titular de Dogos.
    const candidacy = pathwayCandidacy(player, current, effectiveOvr);
    const currentBand = marketRung(current);
    for (const pathway of pathwaysFrom(current)) {
        // Guardarraíl de pirámide: una vía profesional exige estar arriba en el
        // sistema de origen. Sin esto, un 4ª división amateur saltaba a la SRA.
        if (pathway.minSourceBand !== undefined && currentBand < pathway.minSourceBand) continue;
        for (const club of pathwayTargets(pathway)) {
            if (!pathwayAccepts(club, value, candidacy, pathway.demandTolerance)) continue;
            add(club, 'pathway', pathway.id, 1 + pathway.weight * 0.25);
        }
    }

    // 2) Ventana habitual de escalón.
    for (const club of CLUBS) {
        if (!rungs.has(marketRung(club))) continue;
        if (!clubIsInterested(club, value)) continue;
        add(club, 'window', null, 1);
    }

    // 3) Regreso del veterano.
    for (const club of CLUBS) {
        if (!isVeteranHomecoming(player, club)) continue;
        if (!clubIsInterested(club, value)) continue;
        add(club, 'homecoming', null, 1.5);
    }

    const pool = [...candidates.values()].sort((a, b) => a.club.id.localeCompare(b.club.id));
    if (pool.length === 0) return [];

    const chosen: Candidate[] = [];
    const remaining = [...pool];
    for (let i = 0; i < 2 && remaining.length > 0; i++) {
        const candidate = rng.weighted(remaining, (c) => c.weight);
        chosen.push(candidate);
        remaining.splice(remaining.indexOf(candidate), 1);
    }

    return chosen
        .map(({ club, via, pathwayId }) => {
            const role = roleAtClub(effectiveOvr, club.prestige);
            const contract = resolveContract({
                club, age: player.age, value, potential: player.potential,
                ovr: computeOvr(player.attributes, player.position), role,
            });
            return {
                club: club.id,
                league: club.league,
                tier: clubLeague(club.id).tier,
                role,
                prestige: club.prestige,
                wageIndex: Math.round(Math.min(100, club.prestige * rng.float(0.75, 1.1))),
                via,
                pathwayId,
                // El vínculo que ofrece ESE club, según su economía y lo que el
                // jugador vale. Un club amateur nunca ofrece full-time.
                offeredEmployment: contract.employment,
                offeredTrack: contract.track,
                // Naturaleza del movimiento (pase amateur, contrato pro, etc.):
                // decide el TEXTO. Un club amateur no "firma", hace un pase.
                movementKind: classifyMovement(current, club, contract.employment, contract.track),
            };
        })
        .sort((a, b) => b.prestige - a.prestige);
}

/** Puntaje de candidatura del jugador a una vía, RELATIVO a su liga de origen. */
function pathwayCandidacy(player: Player, current: ClubDef, effectiveOvr: number): number {
    const recentInjuries = player.injuries.filter((i) => i.season >= player.seasonsPlayed - 1);
    return scorePathwayCandidate({
        // Rinde por encima de su propio club (no del destino).
        relativeClubPerformance: effectiveOvr - current.rating,
        relativeCompetitionPerformance: marketRung(current),
        starterStatus: player.role === 'starter',
        form: player.dynamics.form,
        age: player.age,
        potential: player.potential,
        injuryAvailability: Math.max(0.2, 1 - recentInjuries.length * 0.25),
    });
}

/**
 * ¿La vía acepta al jugador? Combina el criterio absoluto (holgado por la
 * tolerancia) con la candidatura RELATIVA: un destacado de su sistema entra
 * aunque su valor absoluto no llegue al del destino. No garantiza la oferta:
 * sin rendimiento, forma o disponibilidad, no alcanza.
 */
function pathwayAccepts(club: ClubDef, value: number, candidacy: number, tolerance: number): boolean {
    if (clubIsInterested(club, value, tolerance)) return true;
    // Puerta relativa: un buen candidato de su liga entra aunque el valor
    // absoluto quede corto, pero solo hasta cierto punto por debajo del destino.
    return candidacy >= 1.2 && value >= club.rating - (tolerance + 14);
}

/** Aplica una oferta al jugador (cambio de club + liga + rol). */
export function moveToClub(player: Player, offer: ClubOffer): void {
    const club = getClub(offer.club);
    player.club = club.id;
    player.league = club.league;
    player.role = offer.role;
}
