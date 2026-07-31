// EL CAPITÁN — las decisiones de mercado. Prefijo `mer-`.
//
// Estas NO son datos estáticos: se arman en el momento con los clubes que te
// quieren, porque el texto tiene que decir el nombre del club y el sueldo. Es
// el mismo patrón que `career/engine/event-selector.ts`: la decoración de
// presentación se reconstruye en cada render y NO se persiste — en el estado
// viven las ofertas, y de ahí sale la tarjeta.

import type { CaptainEvent, CaptainOption } from '../../types/event.ts';
import type { CaptainState, ClubOffer } from '../../types/captain.ts';
import { getClub } from '../catalogs.ts';

export const MARKET_EVENT_ID = 'mer-oferta';
export const RETURN_EVENT_ID = 'mer-volver-a-casa';

function money(n: number): string {
    return `US$ ${n.toLocaleString('es-AR')}`;
}

function optionForOffer(offer: ClubOffer, index: number): CaptainOption {
    const club = getClub(offer.clubId);

    if (offer.kind === 'professional') {
        return {
            id: `firmar-${index}`,
            label: `Firmar con ${club.shortName}`,
            hint: `${money(offer.salary)} por año. Dejás de ser jugador de tu club.`,
            outcomes: [
                {
                    weight: 70,
                    effect: { takeOffer: true, fame: 6, playingTime: -1 },
                    resultText: `Firmaste con ${club.name}. El primer año te costó entrar, pero entraste.`,
                },
                {
                    weight: 30,
                    effect: { takeOffer: true, fame: 3, playingTime: -2, body: 8 },
                    resultText: `Firmaste con ${club.name} y el salto te quedó grande. Entrenaste todo el año con los que no juegan.`,
                },
            ],
        };
    }

    return {
        id: `pasar-${index}`,
        label: `Pasarte a ${club.shortName}`,
        hint: 'Un club más grande. La Pertenencia arranca de cero y en el tuyo lo van a sentir.',
        outcomes: [
            {
                weight: 65,
                effect: { takeOffer: true, playingTime: 1 },
                resultText: `Te fichaste en ${club.name}. Entraste al plantel de primera de entrada.`,
            },
            {
                weight: 35,
                effect: { takeOffer: true, playingTime: -1 },
                resultText: `Te fichaste en ${club.name} y arrancaste en Intermedia. Hay que ganárselo otra vez.`,
            },
        ],
    };
}

/**
 * La tarjeta de mercado de esta temporada, o `null` si no hay nada sobre la
 * mesa. Nunca devuelve una decisión de una sola opción: quedarse siempre es una
 * de las opciones, y siempre es la última.
 */
export function buildMarketEvent(state: CaptainState): CaptainEvent | null {
    if (state.offers.length === 0) return null;

    const hayProfesional = state.offers.some((o) => o.kind === 'professional');
    const club = state.player.clubId ? getClub(state.player.clubId) : null;

    const quedarse: CaptainOption = {
        id: 'quedarte',
        label: club ? `Quedarte en ${club.shortName}` : 'Quedarte donde estás',
        hint: hayProfesional
            ? 'Otro año amateur. La franquicia no llama dos veces, salvo que la rompas.'
            : 'Otro año con los tuyos. Suma Pertenencia y nada más.',
        outcomes: [
            { weight: 100, effect: { belonging: 3 }, resultText: club ? `Te quedaste en ${club.name}. En el buffet se enteraron de la oferta y de que la rechazaste.` : 'Te quedaste donde estabas.' },
        ],
    };

    return {
        id: MARKET_EVENT_ID,
        category: 'mercado',
        title: hayProfesional ? 'Te llaman de la franquicia' : 'Te quieren de otro club',
        text: hayProfesional
            ? 'Un año de contrato. Entrenás todos los días, viajás y te ven los seleccionadores. Si firmás, dejás de ser jugador de tu club: el reglamento no te deja jugar mientras dure el contrato.'
            : 'Un club más grande preguntó por vos. El pase es un trámite, pero la cara de los tuyos no.',
        weight: 100,
        repeatable: true,
        options: [...state.offers.map(optionForOffer), quedarse],
    };
}

/**
 * Volver al club de origen. Aparece cuando sos profesional y ya no sos el que
 * eras, o cuando el club te llama.
 *
 * Es reglamento real, no licencia poética: el régimen de pases de la URBA
 * exceptúa del cupo a los jugadores que regresan a su club de origen. El
 * sistema premia el retorno y el juego lo copia.
 */
export function buildReturnEvent(state: CaptainState): CaptainEvent | null {
    if (!state.homeClubId || state.player.clubId === state.homeClubId) return null;
    const home = getClub(state.homeClubId);

    return {
        id: RETURN_EVENT_ID,
        category: 'mercado',
        title: 'Te llaman de tu club',
        text: `En ${home.name} te preguntan si querés terminar donde empezaste. No hay contrato ni plata: hay una camiseta y un lugar en el vestuario de siempre.`,
        weight: 100,
        repeatable: true,
        options: [
            {
                id: 'volver',
                label: 'Volver',
                hint: 'Recuperás la Pertenencia que dejaste. Se termina la plata.',
                outcomes: [
                    { weight: 100, effect: { returnHome: true, fame: -2 }, resultText: `Volviste a ${home.name}. El primer sábado la cancha estaba llena y no era por el partido.` },
                ],
            },
            {
                id: 'todavia-no',
                label: 'Todavía no',
                hint: 'Seguís donde estás. El club va a volver a preguntar.',
                outcomes: [
                    { weight: 100, effect: {}, resultText: 'Dijiste que todavía te quedaba algo por hacer afuera.' },
                ],
            },
        ],
    };
}
