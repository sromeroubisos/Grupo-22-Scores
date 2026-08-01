// LA PUERTA DE SALIDA HACIA LA PANTALLA.
//
// El motor habla español y no se entera de que existe otro idioma. Acá se
// traduce lo que va a dibujarse, y sólo eso: `localizeEvent` devuelve una COPIA
// del evento con los textos cambiados, así que lo que se resuelve y se guarda
// sigue siendo el evento original. Es lo que hace que una partida jugada en
// inglés y leída en español no muestre un historial mezclado, y que el
// `stateHash` del digest congelado no dependa del idioma del jugador.
//
// Y por eso mismo el HISTORIAL se traduce por ID y no por texto: `decisionLog`
// guarda `eventId + optionId + outcomeIndex` desde 1.29.0, que es exactamente lo
// que hace falta para reescribir en inglés una decisión que se tomó en español.

import type { CareerState, ClubOffer, MovementKind } from '../types/career.ts';
import type { EventOption, GameEvent, Outcome } from '../types/event.ts';
import { getClub } from '../data/clubs.ts';
import { clubTenure, type ClubTenure } from '../engine/club-tenure.ts';
import { NO_RENEWAL_EVENT_ID } from '../engine/renewal.ts';
import { TRANSFER_EVENT_ID } from '../data/events/index.ts';
import type { Locale } from './locale.ts';
import { ALL_EVENTS_EN, MARKET_EN, SHARED_OPTIONS_EN } from './events/index.ts';
import type { EventOptionTextEn } from './events/index.ts';
import {
    HOMECOMING_EN, MOVEMENT_OPTION_EN, MOVEMENT_RESULT_EN, OFFER_REASON_EN, ordinalEn,
    ROLE_LABELS_EN, SPELLED_EN, TENURE_TIER_LABELS_EN,
} from './catalog.ts';
import { homecomingClubIdOf, isHomecomingOption } from '../engine/homecoming.ts';

// ── El mercado, que el motor arma en tiempo real ─────────────────────────────

const MARKET_EVENT_IDS: readonly string[] = [TRANSFER_EVENT_ID, NO_RENEWAL_EVENT_ID];

export function isMarketEvent(eventId: string): boolean {
    return MARKET_EVENT_IDS.includes(eventId);
}

/** El hint de "seguir en el club", en inglés. Espeja `stayHint` del español. */
function stayHintEn(tenure: ClubTenure): string {
    const season = `Your ${ordinalEn(tenure.current)} season at the club.`;
    if (tenure.next === null) {
        return `${season} You are ${tenure.tier ? TENURE_TIER_LABELS_EN[tenure.tier.id].toLowerCase() : 'part of the furniture'} here now.`;
    }
    const away = SPELLED_EN[tenure.next.seasonsAway] ?? String(tenure.next.seasonsAway);
    return `${season} ${away} more to become a ${TENURE_TIER_LABELS_EN[tenure.next.tier.id].toLowerCase()}.`;
}

function offerReasonEn(option: EventOption): string | null {
    const offer = option.offer;
    if (!offer || offer.reasonKey === null) return null;
    if (offer.reasonKey === 'starterSeasons') return OFFER_REASON_EN.starterSeasons(offer.starterSeasons);
    return OFFER_REASON_EN[offer.reasonKey];
}

/**
 * Reescribe una opción del mercado desde sus datos: el club, la naturaleza del
 * pase y el lugar en el plantel. Nada sale del texto en español.
 */
function localizeMarketOption(option: EventOption, state: CareerState): EventOption {
    if (option.id === 'stay') {
        const club = getClub(state.player.club);
        return {
            ...option,
            label: MOVEMENT_OPTION_EN.stay.label(club.labelEs),
            hint: stayHintEn(clubTenure(state)),
            outcomes: option.outcomes.map((o): Outcome => ({ ...o, resultText: MARKET_EN.stayResult(club.labelEs) })),
        };
    }

    const offer = option.offer;
    if (!offer) return option;

    const kind: MovementKind = offer.movementKind;
    const role = state.offers.find((o: ClubOffer) => o.club === offer.clubId)?.role ?? null;
    const copy = MOVEMENT_OPTION_EN[kind];
    const roleSuffix = role === null ? '' : ` · ${ROLE_LABELS_EN[role]}`;

    return {
        ...option,
        label: copy.label(offer.clubName),
        hint: `${copy.hint}${roleSuffix}`,
        offer: { ...offer, reason: offerReasonEn(option) },
        outcomes: option.outcomes.map((o): Outcome => ({ ...o, resultText: MOVEMENT_RESULT_EN[kind](offer.clubName) })),
    };
}

/**
 * La vuelta al club de origen, en inglés. Se resuelve por SU CUENTA y no por la
 * tabla compartida porque lleva el nombre del club adentro; el club sale del
 * `offer` que la opción ya trae, no del texto en español.
 */
function localizeHomecomingOption(option: EventOption): EventOption {
    const club = option.offer?.clubName ?? '';
    return {
        ...option,
        label: HOMECOMING_EN.label(club),
        hint: HOMECOMING_EN.hint,
        offer: option.offer ? { ...option.offer, reason: HOMECOMING_EN.reason } : undefined,
        outcomes: option.outcomes.map((o): Outcome => ({ ...o, resultText: HOMECOMING_EN.result(club) })),
    };
}

function localizeMarketEvent(event: GameEvent, state: CareerState): GameEvent {
    const club = getClub(state.player.club);
    const head = event.id === NO_RENEWAL_EVENT_ID
        ? { title: MARKET_EN.noRenewal.title, text: MARKET_EN.noRenewal.text(club.labelEs) }
        : { title: MARKET_EN.transfer.title, text: MARKET_EN.transfer.text };

    return {
        ...event,
        ...head,
        options: event.options.map((option) => {
            // El retiro viaja con el mercado a partir de los 34: no es una opción
            // de mercado y su texto vive en la tabla compartida.
            const shared = SHARED_OPTIONS_EN[option.id];
            if (shared) return applyOptionText(option, shared);
            // La vuelta a casa viaja igual, y tampoco es una opción de mercado:
            // sin esta línea `localizeMarketOption` la trataría como una oferta y
            // le escribiría el texto de un pase cualquiera.
            if (isHomecomingOption(option.id)) return localizeHomecomingOption(option);
            return localizeMarketOption(option, state);
        }),
    };
}

// ── Eventos del catálogo ─────────────────────────────────────────────────────

function applyOptionText(option: EventOption, text: EventOptionTextEn): EventOption {
    return {
        ...option,
        label: text.label,
        // `hint` es opcional en los dos lados: si el evento no lo tiene, la
        // traducción tampoco se lo inventa.
        hint: option.hint === undefined ? undefined : (text.hint ?? option.hint),
        outcomes: option.outcomes.map((outcome, i): Outcome => ({
            ...outcome,
            resultText: text.outcomes[i] ?? outcome.resultText,
        })),
    };
}

/**
 * El evento, listo para dibujar en el idioma pedido.
 *
 * Con `es` devuelve el mismo objeto sin copiarlo: el idioma canónico no paga
 * nada por que exista el otro. Si falta una traducción, cae al español en vez de
 * romper — un evento nuevo sin traducir se ve raro, pero se puede jugar. El test
 * `i18n.test.ts` es el que se encarga de que eso no pase en producción.
 */
export function localizeEvent(event: GameEvent, state: CareerState, locale: Locale): GameEvent {
    if (locale === 'es') return event;
    if (isMarketEvent(event.id)) return localizeMarketEvent(event, state);

    const table = ALL_EVENTS_EN[event.id];
    if (!table) return event;

    return {
        ...event,
        title: table.title,
        text: table.text,
        options: event.options.map((option) => {
            if (isHomecomingOption(option.id)) return localizeHomecomingOption(option);
            const text = table.options[option.id] ?? SHARED_OPTIONS_EN[option.id];
            return text ? applyOptionText(option, text) : option;
        }),
    };
}

// ── El historial, que ya está guardado en español ────────────────────────────

/**
 * El desenlace de una decisión YA JUGADA, en el idioma pedido.
 *
 * Se busca por `eventId + optionId + outcomeIndex`, que es lo que `decisionLog`
 * guarda. El mercado se resuelve aparte porque su texto lleva el nombre de un
 * club: el id de la opción es `move-<clubId>`, así que el club se recupera del
 * catálogo sin necesidad de que la oferta siga viva.
 *
 * Si no se puede traducir, devuelve el español guardado. Es la regla de toda esta
 * capa: nunca una pantalla vacía por una traducción que falta.
 */
export function decisionTextIn(
    entry: { eventId: string; optionId: string; outcomeIndex: number; text: string },
    locale: Locale,
): string {
    if (locale === 'es') return entry.text;

    // La vuelta a casa puede haberse elegido desde CUALQUIER evento, así que se
    // resuelve antes de mirar de cuál. El club sale del id (`homecoming-<clubId>`),
    // que es lo mismo que hace el mercado con `move-<clubId>`.
    const homecomingClub = homecomingClubIdOf(entry.optionId);
    if (homecomingClub !== null) return HOMECOMING_EN.result(getClub(homecomingClub).labelEs);

    if (isMarketEvent(entry.eventId)) {
        if (entry.optionId === 'stay') return entry.text;
        const shared = SHARED_OPTIONS_EN[entry.optionId];
        if (shared) return shared.outcomes[entry.outcomeIndex] ?? entry.text;
        const clubId = entry.optionId.startsWith('move-') ? entry.optionId.slice('move-'.length) : null;
        if (clubId === null) return entry.text;
        // Sin la oferta viva no se sabe qué CLASE de pase fue, así que se usa la
        // frase genérica del pase: dice la verdad (te fuiste a ese club) sin
        // inventar un tipo de vínculo que no consta.
        return `You joined ${getClub(clubId).labelEs}.`;
    }

    const table = ALL_EVENTS_EN[entry.eventId];
    const option = table?.options[entry.optionId] ?? SHARED_OPTIONS_EN[entry.optionId];
    return option?.outcomes[entry.outcomeIndex] ?? entry.text;
}

/**
 * El texto de la decisión que abrió una temporada.
 *
 * `seasons[].decisionText` guarda la frase y `seasons[].eventId` el evento, pero
 * NO la opción ni el desenlace: eso vive en `decisionLog`, que se cruza por
 * `seasonIndex`. Sin ese cruce, la única frase que el jugador escribió con su
 * elección se quedaría en español para siempre.
 */
export function seasonDecisionTextIn(state: CareerState, seasonIndex: number, locale: Locale): string | null {
    const stored = state.seasons[seasonIndex]?.decisionText ?? null;
    if (stored === null || locale === 'es') return stored;

    const log = state.decisionLog.find((d) => d.seasonIndex === seasonIndex);
    if (!log) return stored;
    return decisionTextIn(log, locale);
}
