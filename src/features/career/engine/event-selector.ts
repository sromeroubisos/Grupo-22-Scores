import type { CareerState, ClubOffer } from '../types/career.ts';
import type { EventContext, EventRequirements, GameEvent } from '../types/event.ts';
import { ALL_EVENTS, getEvent, TRANSFER_EVENT_ID } from '../data/events/index.ts';
import { movementOptionCopy, movementResultText } from '../data/movement-copy.ts';
import { getClub, clubTier } from '../data/clubs.ts';
import { getPosition } from '../data/positions.ts';
import { economicModelOf, sportingBandOf } from '../data/competition-levels2026.ts';
import { canRepresent, targetUnion } from './eligibility.ts';
import { computeEffectiveOvr, computeOvr } from './scoring.ts';
import { generateOffers } from './club-offers.ts';
import { marketRung } from './market-routes.ts';
import { isProfessionalEmployment } from './contracts.ts';
import type { Rng } from './random.ts';

/** Contrato del mercado como FASE explícita (Fase 1.5). */
export const CAREER_MARKET_VERSION = '2026-27.1';

const SEASON_EVENT_PROB = 0.82; // no todas las temporadas traen decisión
// Temporadas de silencio del mercado tras un PASE (no tras rechazar una oferta):
// evita el cambio de club anual sin volver el mercado mudo.
const MARKET_COOLDOWN_SEASONS = 2;

export interface Selection {
    event: GameEvent;
    offers: ClubOffer[] | null; // presente solo en el mercado de pases
}

function makeContext(state: CareerState): EventContext {
    const p = state.player;
    return {
        state,
        ovr: computeOvr(p.attributes, p.position),
        group: getPosition(p.position).group,
    };
}

function eligible(event: GameEvent, ctx: EventContext): boolean {
    const p = ctx.state.player;
    if (event.positions && !event.positions.includes(p.position)) return false;
    if (event.origins && !event.origins.includes(p.origin)) return false;
    if (event.minAge !== undefined && p.age < event.minAge) return false;
    if (event.maxAge !== undefined && p.age > event.maxAge) return false;
    if (event.minOvr !== undefined && ctx.ovr < event.minOvr) return false;
    if (event.maxOvr !== undefined && ctx.ovr > event.maxOvr) return false;
    if (event.requiresFlags && !event.requiresFlags.every((f) => (p.flags[f] ?? 0) > 0)) return false;
    if (event.forbidsFlags && event.forbidsFlags.some((f) => (p.flags[f] ?? 0) > 0)) return false;
    if (!event.repeatable && p.usedEventIds.includes(event.id)) return false;
    // Cooldown: si apareció dentro de la ventana reciente, se descarta.
    if (event.repeatable && event.cooldown) {
        if (ctx.state.recentEventIds.slice(0, event.cooldown).includes(event.id)) return false;
    }
    if (event.requires && !meetsRequirements(event.requires, ctx)) return false;
    if (event.condition && !event.condition(ctx)) return false;
    return true;
}

/** ¿El entorno del jugador cumple los requisitos del evento? */
function meetsRequirements(req: EventRequirements, ctx: EventContext): boolean {
    const p = ctx.state.player;
    const club = getClub(p.club);
    const band = sportingBandOf(club);

    if (req.employment && !req.employment.includes(p.employment)) return false;
    if (req.squadTrack && !req.squadTrack.includes(p.squadTrack)) return false;
    if (req.economicModels && !req.economicModels.includes(economicModelOf(club))) return false;
    if (req.startRoutes && !req.startRoutes.includes(ctx.state.startRoute)) return false;
    if (req.minSportingBand !== undefined && band < req.minSportingBand) return false;
    if (req.maxSportingBand !== undefined && band > req.maxSportingBand) return false;
    if (req.minAge !== undefined && p.age < req.minAge) return false;
    if (req.maxAge !== undefined && p.age > req.maxAge) return false;

    if (req.requiresRecentPromotion) {
        // Subió de banda respecto de la temporada anterior.
        const last = ctx.state.history[ctx.state.history.length - 1];
        if (!last || band <= last.sportingBand) return false;
    }
    if (req.requiresRecentInjury) {
        if (!p.injuries.some((i) => i.season >= p.seasonsPlayed - 1)) return false;
    }
    if (req.requiresInternationalLoad && p.nationalTeam === null) return false;
    if (req.requiresEligibleUnion) {
        const union = targetUnion(p.eligibility);
        if (union === null || !canRepresent(p.eligibility, union)) return false;
    }
    return true;
}

// ---- Mercado de pases (evento dinámico) --------------------------------------

/**
 * Probabilidad de SURFEAR una decisión de mercado, dado que ya se evaluó y hay
 * ofertas. No es un dado plano: sube fuerte cuando hay una oportunidad real
 * (subir de banda, profesionalizarse, academia joven) o el jugador está incómodo
 * (suplente, moral baja), y baja para el titular feliz (estabilidad: no se lo
 * sacude todos los años). Calibrado para que, aceptando, la mediana sea 2-4
 * clubes con permanencia ≥ 2 temporadas, no un cambio anual.
 */
function surfaceMarketProbability(state: CareerState, offers: ClubOffer[]): number {
    const p = state.player;
    const current = getClub(p.club);
    const best = offers[0]; // ordenadas por prestigio desc
    const bestClub = getClub(best.club);

    let prob = 0.1;
    if (marketRung(bestClub) > marketRung(current)) prob += 0.4; // subir de banda
    if (best.movementKind === 'professional-contract' && !isProfessionalEmployment(p.employment)) prob += 0.25;
    if (best.movementKind === 'development-invite' && p.age <= 21) prob += 0.3;
    if (p.role === 'fringe') prob += 0.35; // necesita minutos
    else if (p.role === 'rotation') prob += 0.12;
    if (p.dynamics.morale < 45) prob += 0.15;
    if ((p.flags['ambicioso'] ?? 0) > 0) prob += 0.08;
    if ((p.flags['leal'] ?? 0) > 0) prob -= 0.12;
    return Math.min(0.85, Math.max(0.05, prob));
}

/** Reconstruye el evento de transferencia a partir de las ofertas guardadas. */
export function buildTransferEvent(state: CareerState, offers: ClubOffer[]): GameEvent {
    const p = state.player;
    const currentClub = getClub(p.club);
    const currentTier = clubTier(p.club);

    const roleLabel: Record<string, string> = { starter: 'titular', rotation: 'rotación', fringe: 'suplente' };

    const options = [
        {
            id: 'stay',
            ...movementOptionCopy('stay', currentClub.labelEs, roleLabel[p.role] ?? ''),
            outcomes: [
                { weight: 1, effect: { morale: 4, flags: { leal: 1 } }, resultText: `Rechazás las ofertas y seguís en ${currentClub.labelEs}.` },
            ],
        },
        // Máximo 2 ofertas (quedarte + 2 = 3 opciones), las de mayor prestigio.
        // El TEXTO sale de `movementKind`: un club amateur no "firma", hace un pase.
        ...offers.slice(0, 2).map((offer) => {
            const club = getClub(offer.club);
            const moraleDelta = (offer.role === 'starter' ? 5 : offer.role === 'rotation' ? 0 : -4) + (offer.tier < currentTier ? 3 : offer.tier > currentTier ? -1 : 0);
            const fameDelta = Math.round((offer.prestige - currentClub.prestige) * 0.15);
            const copy = movementOptionCopy(offer.movementKind, club.labelEs, roleLabel[offer.role]);
            return {
                id: `move-${offer.club}`,
                label: copy.label,
                hint: copy.hint,
                outcomes: [
                    { weight: 1, effect: { moveToOffer: offer, morale: moraleDelta, fame: Math.max(-6, fameDelta), form: -3 }, resultText: movementResultText(offer.movementKind, club.labelEs) },
                ],
            };
        }),
    ];

    return {
        id: TRANSFER_EVENT_ID,
        category: 'club',
        title: 'Mercado de pases',
        text: 'Se abre el mercado y hay clubes interesados en vos. ¿Qué hacés con tu futuro?',
        weight: 1,
        repeatable: true,
        options,
    };
}

// ---- Selección de evento -----------------------------------------------------

/**
 * Elige el evento de la temporada:
 *  1) mercado de pases (dinámico) según presión de transferencia;
 *  2) si no, un evento estático elegido por probabilidad ponderada.
 * Puede devolver null (temporada sin decisión).
 */
export function selectEvent(state: CareerState, rng: Rng): Selection | null {
    const p = state.player;

    // 1) MERCADO: se EVALÚA explícitamente TODAS las temporadas (fase, no evento
    //    raro). No siempre surge una decisión, pero el mercado siempre se mira.
    //    Cooldown ANCLADO EN UN PASE REAL: rechazar una oferta NO silencia el
    //    mercado (el jugador puede volver a ver ofertas al año siguiente); solo un
    //    cambio de club reciente lo frena, para no mudarlo todos los años.
    state.marketEvaluatedSeason = p.seasonsPlayed;
    const seasonsSinceMove = p.seasonsPlayed - state.lastMoveSeason;
    if (seasonsSinceMove >= MARKET_COOLDOWN_SEASONS) {
        const offers = generateOffers(p, computeEffectiveOvr(p), rng);
        if (offers.length > 0 && rng.chance(surfaceMarketProbability(state, offers))) {
            return { event: buildTransferEvent(state, offers), offers };
        }
    }

    // 2) Evento estático.
    if (!rng.chance(SEASON_EVENT_PROB)) return null;

    const ctx = makeContext(state);
    const pool = ALL_EVENTS.filter((e) => eligible(e, ctx));
    if (pool.length === 0) return null;

    const chosen = rng.weighted(pool, (e) => {
        // Penaliza lo visto recientemente para dar variedad.
        const seenPenalty = state.recentEventIds.includes(e.id) ? 0.35 : 1;
        return e.weight * seenPenalty;
    });

    return { event: chosen, offers: null };
}

/** Devuelve el evento pendiente (estático por id, o el mercado desde las ofertas). */
export function getPendingEvent(state: CareerState): GameEvent | null {
    if (!state.pendingEventId) return null;
    if (state.pendingEventId === TRANSFER_EVENT_ID) {
        return state.offers.length > 0 ? buildTransferEvent(state, state.offers) : null;
    }
    return getEvent(state.pendingEventId) ?? null;
}
