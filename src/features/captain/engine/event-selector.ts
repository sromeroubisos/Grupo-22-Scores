// EL CAPITÁN — qué decisión te toca esta temporada.
//
// El selector no sabe nada de ningún evento en particular: evalúa `requires`,
// pesa y sortea. Si hace falta una precondición nueva, se extiende
// `EventRequirements` y su evaluador — nunca un `if` para un evento.
//
// ── El cooldown es una ventana, no un contador ──
// `recentEventIds` está en orden MÁS RECIENTE PRIMERO, y el cooldown mira los
// primeros N. Es más barato que llevar la temporada de cada evento y se comporta
// igual: lo que importa es "hace poco salió", no el número exacto.

import type { CaptainEvent } from '../types/event.ts';
import type { CaptainState } from '../types/captain.ts';
import type { Rng } from './random.ts';
import { ALL_EVENTS, buildMarketEvent, buildReturnEvent, getEvent, MARKET_EVENT_ID, RETURN_EVENT_ID } from '../data/events/index.ts';
import { getFamily } from '../data/positions.ts';
import { belongingOf } from './belonging.ts';
import { hasUnion } from '../data/catalogs.ts';

/** Probabilidad de que una temporada traiga decisión. No todas traen. */
export const SEASON_EVENT_PROB = 0.88;

/** Cuántas temporadas espera el mercado después de un pase de verdad. */
export const MARKET_COOLDOWN = 2;

/** Un evento ya visto pesa menos, aunque su cooldown haya vencido. */
const SEEN_PENALTY = 0.35;

/** Cuántos ids se recuerdan. Más que el cooldown más largo del catálogo. */
export const RECENT_MEMORY = 12;

function seasonsPlayed(state: CaptainState): number {
    return state.history.length;
}

/** ¿Este evento puede salir ahora? Gates duros, en cascada. */
export function eligible(event: CaptainEvent, state: CaptainState): boolean {
    const { player } = state;

    if (!event.repeatable && state.recentEventIds.includes(event.id)) return false;
    if (event.repeatable && event.cooldown) {
        if (state.recentEventIds.slice(0, event.cooldown).includes(event.id)) return false;
    }

    const req = event.requires;
    if (!req) return true;

    if (req.stage && !req.stage.includes(state.stage)) return false;
    if (req.tracks && !req.tracks.includes(state.national.track)) return false;
    if (req.minAge !== undefined && player.age < req.minAge) return false;
    if (req.maxAge !== undefined && player.age > req.maxAge) return false;
    if (req.minOvr !== undefined && player.ovr < req.minOvr) return false;
    if (req.maxOvr !== undefined && player.ovr > req.maxOvr) return false;
    if (req.families && !req.families.includes(player.family)) return false;
    if (req.group && getFamily(player.family).group !== req.group) return false;
    if (req.minSeasons !== undefined && seasonsPlayed(state) < req.minSeasons) return false;
    if (req.needsClub && !player.clubId) return false;
    if (req.needsUnion && !hasUnion(player.countryCode)) return false;
    if (req.awayFromHome && (!state.homeClubId || player.clubId === state.homeClubId)) return false;

    const pertenencia = belongingOf(state.belonging, player.clubId);
    if (req.minBelonging !== undefined && pertenencia < req.minBelonging) return false;
    if (req.maxBelonging !== undefined && pertenencia > req.maxBelonging) return false;

    return true;
}

/**
 * ¿Se ofrece el mercado esta temporada?
 *
 * Se evalúa SIEMPRE que haya ofertas, y con prioridad sobre el pool: una oferta
 * que aparece y se pierde sola porque salió otro evento es una decisión que el
 * jugador nunca supo que tuvo.
 */
function marketDue(state: CaptainState): boolean {
    if (state.offers.length === 0) return false;
    const desdeElPase = state.season - (state.player.flags['ultimo-pase'] ?? -99);
    return desdeElPase >= MARKET_COOLDOWN;
}

/**
 * ¿Vuelve a llamar el club de origen?
 *
 * Solo si te fuiste, y con más ganas cuanto más viejo seas: volver a los 34 es
 * la historia que el rugby cuenta mejor.
 */
function returnDue(state: CaptainState, rng: Rng): boolean {
    if (!state.homeClubId || state.player.clubId === state.homeClubId) return false;
    const curva = getFamily(state.player.family).age;
    if (state.player.age < curva.decline) return false;
    return rng.chance(0.4);
}

/**
 * Elige la decisión de la temporada. Devuelve el id, o `null` si esta temporada
 * no trae ninguna.
 *
 * El orden importa y es el mismo de Carrera de Rugby: mercado primero (porque
 * caduca), después el regreso a casa, después el pool.
 */
export function selectEvent(state: CaptainState, rng: Rng): string | null {
    if (marketDue(state)) return MARKET_EVENT_ID;
    if (returnDue(state, rng)) return RETURN_EVENT_ID;

    if (!rng.chance(SEASON_EVENT_PROB)) return null;

    const pool = ALL_EVENTS.filter((e) => eligible(e, state));
    if (pool.length === 0) return null;

    return rng.weighted(pool, (e) => e.weight * (state.recentEventIds.includes(e.id) ? SEEN_PENALTY : 1)).id;
}

/**
 * La tarjeta que la pantalla tiene que dibujar.
 *
 * Se reconstruye en cada render y NO se persiste: en el estado vive el id, y
 * los textos del mercado salen de las ofertas guardadas. Así una partida
 * cargada muestra exactamente la misma tarjeta.
 */
export function getPendingEvent(state: CaptainState): CaptainEvent | null {
    if (!state.pendingEventId) return null;
    if (state.pendingEventId === MARKET_EVENT_ID) return buildMarketEvent(state);
    if (state.pendingEventId === RETURN_EVENT_ID) return buildReturnEvent(state);
    return getEvent(state.pendingEventId);
}

/** Deja el id en la memoria reciente, más nuevo primero, y recorta. */
export function rememberEvent(state: CaptainState, id: string): void {
    state.recentEventIds = [id, ...state.recentEventIds.filter((x) => x !== id)].slice(0, RECENT_MEMORY);
}
