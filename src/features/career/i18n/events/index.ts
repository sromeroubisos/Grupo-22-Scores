import type { EventOptionTextEn, EventTableEn } from './types.ts';
import { CLUB_EVENTS_EN } from './club.ts';
import { INJURY_EVENTS_EN } from './injuries.ts';
import { NATIONAL_TEAM_EVENTS_EN } from './national-team.ts';
import { PERSONAL_EVENTS_EN } from './personal.ts';
import { TACTICAL_EVENTS_EN } from './tactical.ts';
import { MEDIA_EVENTS_EN } from './media.ts';
import { MILESTONE_EVENTS_EN } from './milestones.ts';
import { ENVIRONMENT_EVENTS_EN, VETERAN_EVENTS_EN } from './environment.ts';
import { DISCIPLINE_EVENTS_EN } from './discipline.ts';

export type { EventTextEn, EventOptionTextEn, EventTableEn } from './types.ts';

/**
 * El catálogo entero, en el mismo orden en que `data/events/index.ts` arma
 * `ALL_EVENTS`. El orden no cambia nada acá —se busca por id— pero mantenerlo
 * hace que las dos listas se lean en paralelo cuando alguien agrega una familia.
 */
export const ALL_EVENTS_EN: EventTableEn = {
    ...CLUB_EVENTS_EN,
    ...INJURY_EVENTS_EN,
    ...NATIONAL_TEAM_EVENTS_EN,
    ...PERSONAL_EVENTS_EN,
    ...TACTICAL_EVENTS_EN,
    ...MEDIA_EVENTS_EN,
    ...MILESTONE_EVENTS_EN,
    ...ENVIRONMENT_EVENTS_EN,
    ...VETERAN_EVENTS_EN,
    ...DISCIPLINE_EVENTS_EN,
};

/**
 * OPCIONES QUE NO SON DE NINGÚN EVENTO.
 *
 * `withRetirementOption` le cuelga "Retirarte ahora" a CUALQUIER decisión que
 * aparezca entre los 34 y los 38 (`engine/retirement.ts`), así que su texto no
 * puede vivir en la tabla de un evento: aparece en el mercado, en una tarjeta de
 * prensa y en la decisión del veterano, siempre con el mismo id.
 */
export const SHARED_OPTIONS_EN: Readonly<Record<string, EventOptionTextEn>> = {
    'retire-now': {
        label: 'Retire now',
        hint: 'You finish at the top. You keep what you have.',
        outcomes: ['You announce your retirement with the season over and the squad on its feet.'],
    },
};

/**
 * EL MERCADO, que el motor arma en tiempo real.
 *
 * `club-transfer` y `club-no-renewal` no están en el catálogo de datos: los
 * construye `buildTransferEvent` con las ofertas de ESTA temporada, interpolando
 * nombres de club. Por eso su texto se arma acá con funciones y no con frases
 * fijas — y por eso los nombres de club NO se traducen: un club se llama igual en
 * los dos idiomas.
 */
export const MARKET_EN = {
    transfer: {
        title: 'Transfer window',
        text: 'The window opens and there are clubs interested in you. What do you do with your future?',
    },
    noRenewal: {
        title: 'The club is not renewing you',
        text: (club: string) => `${club} are not renewing your deal. You have to find somewhere to keep playing.`,
    },
    stayResult: (club: string) => `You turn the offers down and stay at ${club}.`,
    /** Rótulo de la ficha de una opción de mercado, sobre el escudo. */
    signFor: 'Sign for',
    stayAt: 'Stay at',
} as const;
