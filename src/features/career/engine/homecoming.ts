// LA VUELTA AL CLUB DONDE EMPEZASTE.
//
// Es el final de carrera más repetido del rugby: el que se fue a los veinte
// vuelve a colgar los botines donde debutó. El motor ya tenía un `homecoming` —el
// regreso del veterano a su PAÍS, en `club-offers.ts`— pero eso es otra cosa: es
// una oferta que puede aparecer, de cualquier club de tu país, y depende del
// sorteo del mercado. Ésta es la del CLUB DE ORIGEN y no depende de nada.
//
// POR QUÉ NO ES UNA OFERTA MÁS DEL MERCADO, que es la pregunta obvia: porque el
// mercado puede no abrirse (`surfaceMarketProbability`), porque el club de origen
// compite ahí contra doscientos clubes más, y porque un club amateur del ascenso
// no tiene motivo deportivo para ir a buscar a un tipo de 37. El motivo es
// sentimental, y un motivo sentimental no se sortea: la puerta está siempre.
//
// Se cuelga de CUALQUIER decisión, igual que "Retirarte ahora" y por el mismo
// mecanismo (`withRetirementOption`). Las dos aparecen en la misma ventana —de
// los 34 en adelante— y es deliberado: la elección que el juego pone sobre la
// mesa al final es "¿dónde termina esto?", y volver a casa es la otra respuesta.
//
// DETERMINÍSTICA Y SIN RNG. Se ejecuta al elegir el evento Y al releerlo después
// de una recarga (`getPendingEvent`), así que consumir azar acá desalinearía el
// stream de una partida retomada.

import type { CareerState, ClubOffer } from '../types/career.ts';
import type { EventOption, GameEvent } from '../types/event.ts';
import { clubLeague } from '../data/clubs.ts';
import { competitionLabelOf } from '../data/competition-levels2026.ts';
import { classifyMovement, movementBetween } from './market-routes.ts';
import { marketValue } from './club-offers.ts';
import { resolveContract } from './contracts.ts';
import { resolveClub } from './promotion.ts';
import { RETIREMENT_CHOICE_AGE } from './retirement.ts';
import { computeEffectiveOvr, computeOvr } from './scoring.ts';
import { playerRoleAt } from './squad-role.ts';

/** Prefijo del id de la opción. El club va adentro, como en `move-<clubId>`. */
export const HOMECOMING_PREFIX = 'homecoming-';

/** ¿Ese id de opción es la vuelta a casa? */
export function isHomecomingOption(optionId: string): boolean {
    return optionId.startsWith(HOMECOMING_PREFIX);
}

/** El club de la opción, leído del id. Sirve para traducir una decisión ya jugada. */
export function homecomingClubIdOf(optionId: string): string | null {
    return isHomecomingOption(optionId) ? optionId.slice(HOMECOMING_PREFIX.length) : null;
}

/**
 * EL CLUB DONDE EMPEZÓ TODO: el de la creación, sellado en `startClub`.
 *
 * El fallback a `history[0]` está por las partidas que se hayan armado sin el
 * campo (un test viejo, un estado a mano): la vuelta a casa no puede reventar por
 * un campo que falta, apunta al club de la primera temporada y sigue.
 */
export function firstClubIdOf(state: CareerState): string {
    return state.startClub ?? state.history[0]?.clubId ?? state.player.club;
}

/**
 * ¿Corresponde ofrecer la vuelta? Tres condiciones, todas necesarias:
 *
 *   · está en el tramo final (de los 34 en adelante, la misma ventana que el
 *     retiro: es la temporada en la que la pregunta tiene sentido);
 *   · no está YA en el club donde empezó (no se puede volver a donde estás);
 *   · jugó al menos una temporada, o si no "el club donde empezaste" sería el
 *     club donde estás parado sin haber jugado nada.
 */
export function homecomingIsAvailable(state: CareerState): boolean {
    if (state.player.age < RETIREMENT_CHOICE_AGE) return false;
    if (state.history.length === 0) return false;
    return firstClubIdOf(state) !== state.player.club;
}

/**
 * La oferta del club de origen, con la MISMA cuenta que cualquier otra: el rol
 * sale de `playerRoleAt` y el vínculo de `resolveContract`. Si la tarjeta
 * anunciara un rol calculado de otra forma, mentiría justo en el dato por el que
 * el jugador la elige.
 *
 * `wageIndex` es el prestigio del club, sin el ruido que `generateOffers` le
 * agrega con el rng: acá no se puede consumir azar (ver la cabecera).
 */
export function homecomingOffer(state: CareerState): ClubOffer | null {
    if (!homecomingIsAvailable(state)) return null;

    const p = state.player;
    // `resolveClub` y no `getClub`: el club pudo ascender o descender durante la
    // carrera, y se vuelve a la división que tiene HOY, no a la de 1994.
    const club = resolveClub(state, firstClubIdOf(state));
    const current = resolveClub(state, p.club);
    const effectiveOvr = computeEffectiveOvr(p);
    const role = playerRoleAt(effectiveOvr, club.rating);
    const contract = resolveContract({
        club,
        age: p.age,
        value: marketValue(p, effectiveOvr),
        potential: p.potential,
        ovr: computeOvr(p.attributes, p.position),
        role,
    });

    return {
        club: club.id,
        league: club.league,
        tier: clubLeague(club.id).tier,
        role,
        prestige: club.prestige,
        wageIndex: Math.round(Math.min(100, club.prestige)),
        via: 'homecoming',
        pathwayId: null,
        offeredEmployment: contract.employment,
        offeredTrack: contract.track,
        movementKind: classifyMovement(current, club, contract.employment, contract.track),
    };
}

/** La opción, para colgarla de la decisión que traiga la temporada. */
function homecomingOption(state: CareerState, offer: ClubOffer): EventOption {
    const club = resolveClub(state, offer.club);
    const current = resolveClub(state, state.player.club);
    return {
        id: `${HOMECOMING_PREFIX}${offer.club}`,
        label: `Volver a ${club.labelEs}`,
        // El hint dice el COSTO, no el beneficio (CLAUDE.md §4). Y el costo real
        // de volver es deportivo: casi siempre se baja de categoría.
        hint: 'El club donde empezaste te abre la puerta para cerrar ahí.',
        // El escudo, para que la tarjeta pese lo mismo que las ofertas del
        // mercado con las que comparte pantalla.
        crestClubId: offer.club,
        offer: {
            clubId: offer.club,
            clubName: club.labelEs,
            league: competitionLabelOf(club.competitionId),
            // La dirección se MIDE, no se presume: casi siempre es hacia abajo,
            // pero el club de origen pudo ascender tres divisiones mientras el
            // jugador andaba por Europa, y anunciar un descenso que no es sería
            // el mismo pecado que anunciar un rol falso.
            direction: movementBetween(current, club),
            reason: 'Donde empezaste',
            reasonKey: null,
            starterSeasons: 0,
            movementKind: offer.movementKind,
        },
        outcomes: [
            {
                weight: 1,
                // Volver a casa levanta el ánimo y no toca nada más: no es un
                // premio deportivo, y darle valoración sería pagarle al jugador
                // por una decisión sentimental.
                effect: { moveToOffer: offer, morale: 10, form: -2 },
                resultText: `Volvés a ${club.labelEs}, el club donde empezaste todo.`,
            },
        ],
    };
}

/**
 * Cuelga "Volver a <club>" de cualquier decisión del tramo final.
 *
 * Determinística y sin RNG, igual que `withRetirementOption`: se aplica lo mismo
 * al elegir el evento que al releerlo tras una recarga, así que `applyDecision`
 * siempre encuentra la opción con el mismo id.
 */
export function withHomecomingOption(event: GameEvent, state: CareerState): GameEvent {
    const offer = homecomingOffer(state);
    if (offer === null) return event;
    const id = `${HOMECOMING_PREFIX}${offer.club}`;
    if (event.options.some((o) => o.id === id)) return event;
    // Nunca dos veces el mismo club en la misma tarjeta: si el mercado ya trajo
    // una oferta del club de origen, ésa manda —viene con su rol y su vínculo
    // sorteados— y la vuelta no se agrega.
    if (event.options.some((o) => o.offer?.clubId === offer.club)) return event;

    const option = homecomingOption(state, offer);
    const options = [...event.options];

    // EN EL MERCADO, LA VUELTA OCUPA UNA RANURA; NO AGREGA UNA CUARTA.
    //
    // La tarjeta de mercado tiene tres opciones de club como mucho —quedarte más
    // dos ofertas— y ese techo es de lectura: con cuatro escudos la decisión deja
    // de mirarse y se escanea. Así que cuando la tarjeta ya está llena, la vuelta
    // reemplaza a la ÚLTIMA oferta, que es la de menor prestigio (`generateOffers`
    // las devuelve ordenadas). Es el intercambio correcto: el club donde
    // empezaste vale más para esta decisión que la peor oferta del mercado.
    const esOpcionDeClub = (id: string) => id === 'stay' || id.startsWith('move-');
    const deClub = options.filter((o) => esOpcionDeClub(o.id));
    const ultimaOferta = options.map((o, i) => ({ o, i })).filter((x) => x.o.id.startsWith('move-')).pop();
    if (deClub.length >= 3 && ultimaOferta) {
        options[ultimaOferta.i] = option;
        return { ...event, options };
    }

    return { ...event, options: [...options, option] };
}
