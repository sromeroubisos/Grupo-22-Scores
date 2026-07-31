// Diferenciación de las ofertas de mercado.
//
// El bug que cierran estos tests: dos ofertas distintas se renderizaban como
// "Contrato profesional · titular" las dos, sin escudo, sin liga y sin motivo.
// El jugador elegía entre dos nombres a ciegas.

import test from 'node:test';
import assert from 'node:assert/strict';
import { careerReducer, getPendingEvent, offerReason, type OfferSignals } from '../../index.ts';
import type { CareerState } from '../../types/career.ts';
import type { GameEvent } from '../../types/event.ts';
import type { CreatePlayerInput } from '../create-player.ts';

const TRANSFER_EVENT_ID = 'club-transfer';

/**
 * Recorre carreras hasta juntar `n` mercados con al menos dos ofertas. Es la
 * única forma honesta de testear esto: las ofertas las genera el motor a partir
 * del estado real, no se pueden inventar a mano sin falsear el caso.
 */
function collectMarkets(n: number): GameEvent[] {
    const found: GameEvent[] = [];
    const positions = ['fullback', 'flyhalf', 'prop', 'wing'] as const;
    const routes = ['professional', 'development'] as const;

    for (let s = 0; s < 400 && found.length < n; s++) {
        const input: CreatePlayerInput = {
            position: positions[s % positions.length],
            nationalityCountryCode: 'ar',
            startRoute: routes[s % routes.length],
        };
        let state = careerReducer({} as CareerState, { type: 'START', input, seed: 6000 + s * 17 });
        let guard = 0;
        while (state.phase !== 'retired' && guard < 60) {
            guard++;
            const event = getPendingEvent(state);
            if (event && state.pendingEventId === TRANSFER_EVENT_ID && state.offers.length >= 2) {
                found.push(event);
                if (found.length >= n) break;
            }
            state = event
                ? careerReducer(state, { type: 'CHOOSE', optionId: event.options[0].id })
                : careerReducer(state, { type: 'ADVANCE' });
        }
    }
    return found;
}

const MARKETS = collectMarkets(25);

test('el escenario existe: hay mercados con dos ofertas para auditar', () => {
    assert.ok(MARKETS.length >= 10, `solo se encontraron ${MARKETS.length} mercados con 2+ ofertas`);
});

test('toda opción de pase trae la ficha del club', () => {
    for (const market of MARKETS) {
        const moves = market.options.filter((o) => o.id.startsWith('move-'));
        assert.ok(moves.length > 0, 'un mercado sin ninguna opción de pase');
        for (const opt of moves) {
            assert.ok(opt.offer, `${opt.id}: sin ficha de club`);
            assert.ok(opt.offer.clubId.length > 0, `${opt.id}: sin id de club`);
            assert.ok(opt.offer.clubName.length > 0, `${opt.id}: sin nombre de club`);
            assert.ok(opt.offer.league.length > 0, `${opt.id}: sin liga`);
            assert.ok(
                ['up', 'down', 'lateral'].includes(opt.offer.direction),
                `${opt.id}: dirección inválida (${opt.offer.direction})`,
            );
        }
    }
});

test('la opción de quedarse NO trae ficha de club, PERO sí trae escudo', () => {
    // Las dos mitades importan y dicen cosas distintas. Sin ficha, porque
    // quedarse no es un pase: no tiene liga de destino ni escalón. Con escudo,
    // porque enfrente hay dos tarjetas que sí lo tienen, y una tarjeta pelada se
    // lee como la opción menor antes de que el jugador lea una palabra.
    for (const market of MARKETS) {
        const stay = market.options.find((o) => o.id === 'stay');
        assert.ok(stay, 'el mercado siempre tiene que ofrecer quedarse');
        assert.equal(stay.offer, undefined, 'quedarse no es un pase, no lleva ficha');
        assert.ok(stay.crestClubId, 'quedarse lleva el escudo del club actual');

        for (const move of market.options.filter((o) => o.id.startsWith('move-'))) {
            assert.ok(move.offer, 'un pase siempre trae su ficha');
            assert.notEqual(
                move.offer.clubId, stay.crestClubId,
                'no se puede ofrecer un pase al club en el que ya está',
            );
        }
    }
});

test('dos ofertas del mismo mercado nunca se leen idénticas', () => {
    let audited = 0;
    for (const market of MARKETS) {
        const moves = market.options.filter((o) => o.id.startsWith('move-'));
        if (moves.length < 2) continue;
        audited++;
        // Firma de lo que el jugador ve de verdad en la tarjeta.
        const shown = moves.map((o) => [o.label, o.hint, o.offer?.league, o.offer?.direction].join('|'));
        assert.equal(
            new Set(shown).size,
            shown.length,
            `dos ofertas indistinguibles en pantalla:\n  ${shown.join('\n  ')}`,
        );
    }
    assert.ok(audited > 0, 'no se audió ningún mercado con dos pases');
});

test('el escudo que se pide es el del club de la oferta', () => {
    for (const market of MARKETS) {
        for (const opt of market.options.filter((o) => o.id.startsWith('move-'))) {
            // El id de la opción codifica el club: si se desincronizan, la
            // tarjeta muestra el escudo de un club y firma con otro.
            assert.equal(`move-${opt.offer?.clubId}`, opt.id, 'escudo desincronizado del club de la oferta');
        }
    }
});

// ── El motivo ────────────────────────────────────────────────────────────────

test('el motivo elige la señal más fuerte y devuelve una sola línea', () => {
    const none: OfferSignals = {
        outperformsClub: false, starterSeasons: 0, hot: false,
        homecoming: false, pathway: false, youngProspect: false,
    };
    assert.equal(offerReason(none), null, 'sin señales no se inventa un motivo');
    assert.equal(offerReason({ ...none, outperformsClub: true }), 'Venís rindiendo por encima de tu club');
    assert.equal(offerReason({ ...none, starterSeasons: 3 }), 'Sos titular hace 3 temporadas');
    assert.equal(offerReason({ ...none, homecoming: true }), 'Te quieren de vuelta en casa');
    assert.equal(offerReason({ ...none, youngProspect: true }), 'Les interesa tu proyección');
    // Rendir por encima del club gana sobre el resto.
    assert.equal(
        offerReason({ ...none, outperformsClub: true, starterSeasons: 5, homecoming: true }),
        'Venís rindiendo por encima de tu club',
    );
    // Una sola temporada de titular no es un argumento.
    assert.equal(offerReason({ ...none, starterSeasons: 1 }), null);
});

test('los motivos respetan la voz del juego', () => {
    const combos: OfferSignals[] = [
        { outperformsClub: true, starterSeasons: 0, hot: false, homecoming: false, pathway: false, youngProspect: false },
        { outperformsClub: false, starterSeasons: 4, hot: false, homecoming: false, pathway: false, youngProspect: false },
        { outperformsClub: false, starterSeasons: 0, hot: true, homecoming: false, pathway: false, youngProspect: false },
        { outperformsClub: false, starterSeasons: 0, hot: false, homecoming: true, pathway: false, youngProspect: false },
        { outperformsClub: false, starterSeasons: 0, hot: false, homecoming: false, pathway: true, youngProspect: false },
    ];
    for (const c of combos) {
        const reason = offerReason(c);
        assert.ok(reason, 'esta combinación tendría que dar un motivo');
        assert.ok(!reason.includes('!'), `sin signos de exclamación: ${reason}`);
        assert.ok(!reason.endsWith('.'), `frase corta sin punto final: ${reason}`);
        assert.ok(reason.length <= 45, `motivo demasiado largo para la tarjeta: ${reason}`);
    }
});

test('en una carrera real llega a mostrarse un motivo', () => {
    const conMotivo = MARKETS.flatMap((m) => m.options)
        .filter((o) => o.offer?.reason)
        .length;
    assert.ok(conMotivo > 0, 'ninguna oferta de la muestra explicó por qué llegó');
});
