// EL MERCADO ABIERTO — la ventana que se abre todos los años a partir de los 20.
//
// Lo que este archivo custodia no es un número: es una PROMESA que la pantalla
// le hace al jugador todas las temporadas. De los veinte en adelante, cuando
// termina el año hay cinco clubes sobre la mesa más el tuyo, ordenados por lo
// que pagan, y cada uno dice en qué lugar del plantel caerías.
//
// Las tres partes de esa promesa se rompen por caminos distintos —el filtro de
// candidatos, el orden, la traducción a rol— así que van medidas por separado.
//
// ── Y la cuarta, que no se ve en la tarjeta ──
// El mercado corre DESPUÉS de la decisión del año y no en su lugar. Es lo único
// de este archivo que no tiene síntoma visible: si se rompiera, el juego seguiría
// andando y el jugador de veinte años simplemente no volvería a ver una sola
// tarjeta del catálogo de eventos hasta el retiro.

import test from 'node:test';
import assert from 'node:assert/strict';

import type { CaptainState, CreateCaptainInput } from '../../types/captain.ts';
import { createInitialCaptain, captainReducer } from '../../state/captain-reducer.ts';
import { playTournament } from '../../state/captain-autoplay.ts';
import { getPendingEvent } from '../event-selector.ts';
import { MARKET_EVENT_ID, buildMarketEvent } from '../../data/events/index.ts';
import { trainingsFor } from '../../data/trainings.ts';
import { getMomentDef, isContractKind } from '../moment-defs/index.ts';
import { tacklePlayAt, tackleZones } from '../moments.ts';
import {
    HOMETOWN_MARKET_AGE,
    HOME_MARKET_SHARE,
    MARKET_OPEN_AGE,
    OPEN_MARKET_OFFERS,
    REGIONAL_MARKET_AGE,
    clubRatingOf,
    generateOffers,
    hasHomeProfessionalRugby,
    isProfessionalClub,
    salaryFor,
} from '../clubs.ts';
import { playingTimeOf } from '../statistics.ts';
import { FAREWELL_FLAG } from '../retirement.ts';
import { createRng } from '../random.ts';
import { CLUBS, affinityCountryOf, getClub, regionOfCountry } from '../../data/catalogs.ts';

const INPUT: CreateCaptainInput = {
    name: 'Bautista',
    surname: 'Uriarte',
    family: 'apertura',
    countryCode: 'ar',
};

/**
 * Un jugador parado a una edad y con una media, sin haber jugado la carrera.
 *
 * Se le empujan `age` y `ovr` a mano porque lo que se mide acá es el MERCADO y
 * no el camino: llegar a los veintidós jugando doce temporadas mezclaría el
 * filtro de candidatos con todo lo que el motor le hizo al jugador en el medio.
 */
function jugadorDe(seed: number, age: number, ovr: number): CaptainState {
    const state = createInitialCaptain(INPUT, seed);
    state.player.age = age;
    state.player.ovr = ovr;
    return state;
}

function ofertasDe(state: CaptainState, seed = 1): ReturnType<typeof generateOffers> {
    return generateOffers(
        // `contract: null` es el jugador LIBRE, que es el que este archivo mide:
        // el que está atado no tiene mesa y eso se mide en `contracts.test.ts`.
        {
            player: state.player,
            stage: state.stage,
            contract: null,
            scouted: false,
            everProfessional: false,
            season: state.season,
            // La marca de la despedida se lee del jugador, igual que en el motor:
            // así el test de más abajo la pone donde la pone la tarjeta y no en un
            // parámetro que solo existe en el test.
            farewell: state.player.flags[FAREWELL_FLAG] !== undefined,
        },
        createRng(seed),
    );
}

// ═══════════════════════════════════════════════════════════════════════════
//  1 · LA MESA SE PONE, Y SIEMPRE CON LA PUERTA DE CASA ABIERTA
// ═══════════════════════════════════════════════════════════════════════════

test('a partir de los 20 hay cinco clubes sobre la mesa, más el tuyo', () => {
    // Cinco semillas y cinco medias: la promesa es de TODAS las temporadas, así
    // que una sola tirada verde no dice nada. Las medias barren de un pibe que
    // todavía no le gana a su club hasta uno que ya lo superó, porque el que la
    // rompe nunca fue el problema — el problema era el que no.
    for (const [seed, ovr] of [[1, 42], [2, 50], [3, 58], [4, 66], [5, 74]] as const) {
        const state = jugadorDe(seed, MARKET_OPEN_AGE, ovr);
        state.offers = ofertasDe(state, seed);

        assert.equal(
            state.offers.length,
            OPEN_MARKET_OFFERS,
            `semilla ${seed} (media ${ovr}): la mesa abierta trajo ${state.offers.length} clubes y no ${OPEN_MARKET_OFFERS}`,
        );

        const tarjeta = buildMarketEvent(state);
        assert.ok(tarjeta, `semilla ${seed}: con ofertas sobre la mesa no se armó la tarjeta`);
        assert.equal(tarjeta.options.length, OPEN_MARKET_OFFERS + 1, 'faltó la opción de quedarte');
        assert.equal(
            tarjeta.options[tarjeta.options.length - 1].id,
            'quedarte',
            'quedarte en tu club tiene que ser SIEMPRE la última opción',
        );
    }
});

test('EL QUE VOLVIÓ A TERMINAR NO ESTÁ EN LA MESA DE NADIE', () => {
    // La tarjeta de la vuelta a casa pregunta si querés terminar donde
    // empezaste, y mientras el mercado siguiera abriéndose todos los junios esa
    // pregunta no significaba nada: volvías, y al año siguiente la pantalla te
    // ofrecía cinco clubes como si no hubiera pasado.
    //
    // Las dos mitades importan. La de arriba es el control: sin la marca la mesa
    // se pone, así que el `[]` de abajo mide la puerta y no una carrera sin
    // candidatos.
    const state = jugadorDe(11, 34, 74);
    assert.ok(ofertasDe(state, 11).length > 0, 'sin la marca no hay mesa: el test no mide nada');

    state.player.flags[FAREWELL_FLAG] = state.season;
    assert.deepEqual(ofertasDe(state, 11), [], 'el que volvió a despedirse recibió ofertas');
});

test('antes de los 20 la ventana está cerrada para el que no superó a su club', () => {
    // La contracara, y es la que sostiene el sentido de la de arriba: si el
    // mercado se abriera igual a los diecisiete, abrirlo a los veinte no sería
    // una regla sino una coincidencia. Un pibe por debajo del nivel de su club
    // no recibe llamados.
    const state = jugadorDe(7, MARKET_OPEN_AGE - 1, clubRatingOf(createInitialCaptain(INPUT, 7).player.clubId));
    assert.deepEqual(ofertasDe(state, 7), [], 'la ventana cerrada dejó pasar una oferta');
});

// ═══════════════════════════════════════════════════════════════════════════
//  2 · LAS MÁS CARAS ARRIBA
// ═══════════════════════════════════════════════════════════════════════════

test('la mesa llega ordenada por lo que paga, y el orden viaja en el estado', () => {
    // El orden tiene que estar en `offers[]` y no en la pantalla: el pase se
    // resuelve por el ÍNDICE de la opción (`firmar-3` es `offers[3]`), así que
    // una tarjeta que ordenara por su cuenta firmaría con otro club.
    for (const seed of [11, 12, 13, 14, 15]) {
        // Media alta y `scouted`, que es la combinación que abre el mercado
        // profesional: con todas las ofertas en cero el orden no se puede medir.
        // Y `everProfessional`, porque desde la puerta de casa el primer contrato
        // sale de tu país: sin eso, el argentino de 82 ve tres franquicias de la
        // SRA y nada más, y tres sueldos del mismo tramo no ordenan gran cosa.
        const state = jugadorDe(seed, 26, 82);
        const offers = generateOffers(
            {
                player: state.player,
                stage: state.stage,
                contract: null,
                scouted: true,
                everProfessional: true,
                season: state.season,
            },
            createRng(seed),
        );

        const sueldos = offers.map((o) => o.salary);
        assert.deepEqual(
            sueldos,
            [...sueldos].sort((a, b) => b - a),
            `semilla ${seed}: la mesa no vino de mayor a menor sueldo (${sueldos.join(', ')})`,
        );
    }
});

// ═══════════════════════════════════════════════════════════════════════════
//  2 bis · EL SUELDO ES DEL JUGADOR, NO DEL CLUB
// ═══════════════════════════════════════════════════════════════════════════

test('el mismo club le paga más al mejor jugador', () => {
    // ── QUÉ MUNDO AFIRMA (CLAUDE de captain §1.3) ───────────────────────────
    // Que lo que cobrás es una consecuencia de tu media y no una propiedad del
    // club que te llama. Hasta la 0.25.0 no lo era: `salaryFor` recibía SOLO el
    // club, así que el mismo contrato de Exeter valía 804.000 para un jugador de
    // 74 y 804.000 para uno de 92, y la tarjeta terminaba diciendo «tu lugar
    // ahí: Rotación» arriba de un sueldo de figura.
    //
    // Se mide sobre el catálogo ENTERO y no sobre un club elegido: un club a
    // dedo se queda viejo con el próximo catálogo, y lo que se afirma acá vale
    // para todos.
    const escalera = [62, 68, 74, 80, 86];
    for (const club of CLUBS.filter(isProfessionalClub)) {
        let previo = -1;
        for (const ovr of escalera) {
            const sueldo = salaryFor(club, ovr);
            assert.ok(
                sueldo > previo,
                `${club.name} (${club.level}, r=${club.rating}): con media ${ovr} paga ${sueldo}, `
                + `que no es más que los ${previo} de la media anterior`,
            );
            previo = sueldo;
        }
    }
});

test('la mesa de un jugador de media alta no es la misma que la de uno medio', () => {
    // ── QUÉ MUNDO AFIRMA ────────────────────────────────────────────────────
    // Que media carrera de diferencia se ve en la plata. El test de arriba mide
    // la FUNCIÓN; este mide lo que el jugador realmente ve en pantalla, que es
    // lo que se rompió: con el sueldo atado solo al club, el techo de la mesa se
    // movía de 763.000 a 900.000 entre una media de 74 y una de 92 —un 18% por
    // media carrera— porque el filtro de candidatos era lo único que cambiaba.
    //
    // El factor 2 no es la medición de hoy (que es más ancha): es el piso por
    // debajo del cual la mesa vuelve a ser la misma para todos.
    const techoDe = (ovr: number): number => {
        let max = 0;
        for (const seed of [11, 12, 13, 14, 15]) {
            const state = jugadorDe(seed, 26, ovr);
            const offers = generateOffers(
                {
                    player: state.player,
                    stage: state.stage,
                    contract: null,
                    scouted: true,
                    everProfessional: true,
                    season: state.season,
                },
                createRng(seed),
            );
            for (const o of offers) max = Math.max(max, o.salary);
        }
        return max;
    };

    const medio = techoDe(74);
    const figura = techoDe(92);
    assert.ok(
        figura >= medio * 2,
        `la mesa de una media de 92 llega a ${figura} y la de una de 74 a ${medio}: `
        + 'el sueldo volvió a decidirse en el club y no en el jugador',
    );
});

// ═══════════════════════════════════════════════════════════════════════════
//  3 · CADA OFERTA DICE TU LUGAR, Y NO SE LO INVENTA
// ═══════════════════════════════════════════════════════════════════════════

test('el lugar que promete cada oferta es el que va a repartir la temporada', () => {
    // La tarjeta NO puede tener su propia cuenta de tiempo de juego. Es la regla
    // §3.1 del CLAUDE.md raíz —una decisión no puede prometer una cosa y hacer
    // otra— y acá se verifica de frente: el rol de cada opción tiene que ser
    // exactamente lo que `playingTimeOf` devuelve para ese club.
    const state = jugadorDe(21, 24, 68);
    state.offers = ofertasDe(state, 21);
    const tarjeta = buildMarketEvent(state);
    assert.ok(tarjeta);

    for (const option of tarjeta.options) {
        assert.ok(option.squadRole, `la opción '${option.id}' no dice en qué lugar caerías`);
        assert.equal(
            option.squadRole,
            playingTimeOf(state.player, clubRatingOf(option.clubId ?? null), state.damage.cuerpo).role,
            `la opción '${option.id}' promete un lugar distinto del que reparte el motor`,
        );
    }
});

test('quedarte también dice tu lugar: es la sexta opción y no un renglón vacío', () => {
    // Sin esto, las cinco ofertas mostraban dónde caerías y la opción que la
    // mayoría elige no decía nada: el jugador comparaba cinco futuros contra un
    // presente que tenía que acordarse de memoria.
    const state = jugadorDe(33, 23, 61);
    state.offers = ofertasDe(state, 33);
    const tarjeta = buildMarketEvent(state);
    assert.ok(tarjeta);

    const quedarte = tarjeta.options.find((o) => o.id === 'quedarte');
    assert.ok(quedarte, 'no está la opción de quedarte');
    assert.equal(quedarte.clubId, state.player.clubId ?? undefined);
    assert.equal(
        quedarte.squadRole,
        playingTimeOf(state.player, clubRatingOf(state.player.clubId), state.damage.cuerpo).role,
    );
});

// ═══════════════════════════════════════════════════════════════════════════
//  4 · EL MERCADO NO SE COME LA TARJETA DEL AÑO
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Una carrera entera, resolviendo TODAS las tarjetas de cada temporada.
 *
 * Se queda siempre en su club —la última opción de la tarjeta de mercado es
 * `quedarte`— para que lo que se mida sea la frecuencia de las tarjetas y no lo
 * que un pase le hace a la carrera.
 */
function carreraQueSeQueda(seed: number): CaptainState {
    let s = createInitialCaptain(INPUT, seed);
    let vuelta = 0;

    while (s.phase !== 'retired' && vuelta < 60) {
        s = captainReducer(s, { type: 'CHOOSE_TRAINING', trainingId: trainingsFor(s.player.family)[0].id });

        let guarda = 0;
        while (s.phase === 'moment' && s.pendingMoment && guarda < 4) {
            const pendiente = s.pendingMoment;
            if (isContractKind(pendiente.kind)) {
                const def = getMomentDef(pendiente.kind)!;
                s = captainReducer(s, { type: 'RESOLVE_MOMENT', outcome: def.playAt(pendiente.setup!, 'bien', 0.5) });
            } else if (pendiente.kind === 'tackle') {
                const zones = tackleZones(s.player, s.damage.cuerpo, pendiente.pressure);
                const { at, zone } = tacklePlayAt(zones, 'bien', 0.5);
                s = captainReducer(s, { type: 'RESOLVE_MOMENT', outcome: { kind: 'tackle', zone, at } });
            } else {
                s = captainReducer(s, { type: 'RESOLVE_MOMENT', outcome: { kind: 'bunker' } });
            }
            guarda += 1;
        }

        s = playTournament(captainReducer(s, { type: 'ADVANCE' }));

        let decisiones = 0;
        while (s.phase === 'event' && decisiones < 4) {
            const evento = getPendingEvent(s)!;
            // En el mercado se queda; en cualquier otra tarjeta, la primera.
            const opcion = evento.id === MARKET_EVENT_ID
                ? evento.options[evento.options.length - 1]
                : evento.options[0];
            s = captainReducer(s, { type: 'CHOOSE', optionId: opcion.id });
            decisiones += 1;
        }
        vuelta += 1;
    }
    return s;
}

test('el catálogo de eventos sigue vivo después de los 20', () => {
    // ES EL TEST QUE NO TIENE SÍNTOMA. Con el mercado adentro del sorteo y con
    // prioridad —que es donde vivía— una ventana que se abre todos los años
    // dejaba al jugador de veinte sin una sola tarjeta del pool hasta el retiro,
    // o sea las tres cuartas partes de la carrera, y el juego seguía andando sin
    // que nada fallara.
    //
    // La banda es floja a propósito (§1.3): lo que se afirma no es una tasa sino
    // que EL CANAL EXISTE. Un motor donde el mercado vuelva a desplazar al pool
    // da cero y esto se pone rojo; uno donde el pool aparezca poco no.
    for (const seed of [101, 202, 303]) {
        const s = carreraQueSeQueda(seed);

        const temporadaDeLos20 = s.history.find((h) => h.age >= MARKET_OPEN_AGE)?.season;
        assert.ok(temporadaDeLos20, `semilla ${seed}: la carrera no llegó a los ${MARKET_OPEN_AGE}`);

        const despues = s.decisionLog.filter((d) => d.season >= temporadaDeLos20);
        const delPool = despues.filter((d) => d.eventId !== MARKET_EVENT_ID);
        const delMercado = despues.filter((d) => d.eventId === MARKET_EVENT_ID);

        assert.ok(
            delMercado.length > 0,
            `semilla ${seed}: después de los ${MARKET_OPEN_AGE} no se abrió el mercado ni una vez`,
        );
        assert.ok(
            delPool.length > 0,
            `semilla ${seed}: después de los ${MARKET_OPEN_AGE} el mercado se comió TODAS las tarjetas del pool`,
        );
    }
});

test('quedarse no cierra la ventana: la mesa vuelve a ponerse la temporada siguiente', () => {
    // El `MARKET_COOLDOWN` sobrevive para la ventana cerrada y NO para esta. Un
    // mercado que castiga con dos años de silencio al que se quedó convierte la
    // opción de quedarse en una trampa, y quedarse es lo que hace la enorme
    // mayoría de los jugadores de rugby.
    const s = carreraQueSeQueda(101);
    const temporadas = s.decisionLog
        .filter((d) => d.eventId === MARKET_EVENT_ID)
        .map((d) => d.season);

    const conMercado = new Set(temporadas);
    const seguidas = [...conMercado].some((t) => conMercado.has(t + 1));
    assert.ok(seguidas, 'el mercado nunca se abrió dos temporadas seguidas');
});

// ═══════════════════════════════════════════════════════════════════════════
//  5 · EL PRIMER CONTRATO ES DE TU CASA
// ═══════════════════════════════════════════════════════════════════════════
//
// Un argentino no debuta como profesional en la Championship inglesa: firma en
// los Dogos, en Pampas o en Tarucas. Un uruguayo en Peñarol, un chileno en
// Selknam, un brasileño en Cobras, un paraguayo en Yacaré — todos en Super Rugby
// Américas, que es el profesionalismo de Sudamérica. Un estadounidense en la MLR.
//
// Lo que esto vigila no es una tasa sino una PUERTA, así que se mide como puerta:
// no «casi todas las primeras ofertas son de casa» sino NINGUNA es de afuera.
//
// Y se pregunta por AFINIDAD y no por `countryCode`: las tres franquicias
// argentinas están cargadas como `multi` porque la SRA no es de un país, así que
// un test escrito contra el código del catálogo daría cero clubes de casa y
// pasaría afirmando lo contrario de lo que quiere afirmar (§1.7).

/** Las ofertas profesionales de un jugador parado a una edad y con una media. */
function contratosDe(
    countryCode: string,
    ovr: number,
    seed: number,
    everProfessional = false,
): ReturnType<typeof generateOffers> {
    const state = createInitialCaptain({ ...INPUT, countryCode }, seed);
    state.player.age = 24;
    state.player.ovr = ovr;
    return generateOffers(
        {
            player: state.player,
            stage: state.stage,
            // `scouted` PRENDIDO a propósito: es la credencial que abría el
            // mercado profesional del mundo entero, y la puerta de casa tiene que
            // ganarle. Con él apagado, este test pasaría por el motivo equivocado.
            scouted: true,
            everProfessional,
            season: state.season,
        },
        createRng(seed),
    ).filter((o) => o.kind === 'professional');
}

test('el primer contrato profesional sale de la liga profesional de tu país', () => {
    // Cinco países del cono sur y Estados Unidos, con la media barriendo desde el
    // piso de ingreso de la SRA hasta bastante arriba: la promesa vale para el que
    // recién llega y para el que ya la rompió, mientras no haya firmado.
    for (const countryCode of ['ar', 'uy', 'cl', 'br', 'py', 'us']) {
        let vistas = 0;

        for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
            for (const ovr of [58, 62, 66, 70, 74]) {
                for (const offer of contratosDe(countryCode, ovr, seed)) {
                    vistas += 1;
                    const club = getClub(offer.clubId);
                    assert.equal(
                        affinityCountryOf(club),
                        countryCode,
                        `${countryCode} (media ${ovr}, semilla ${seed}): el primer contrato lo ofrece `
                        + `${club.name}, que juega ${club.competitionId} y no es de su país`,
                    );
                    assert.ok(
                        offer.salary > 0,
                        `${club.name} ofrece un contrato profesional de sueldo cero`,
                    );
                }
            }
        }

        assert.ok(
            vistas > 0,
            `${countryCode}: ningún jugador recibió una sola oferta profesional de su país. `
            + 'La puerta no puede ser una pared: si no hay contrato en casa, no hay carrera.',
        );
    }
});

test('el mundo se abre con el primer contrato y no antes', () => {
    // La contracara, y es la que sostiene el sentido de la de arriba: si el
    // mercado del exterior no se abriera nunca, la regla de casa no sería una
    // puerta sino una jaula. Mismo jugador, misma media, misma semilla: lo único
    // que cambia es haber firmado alguna vez.
    const afuera = (offers: ReturnType<typeof generateOffers>): number =>
        offers.filter((o) => affinityCountryOf(getClub(o.clubId)) !== 'ar').length;

    let conContrato = 0;
    for (const seed of [11, 12, 13, 14, 15]) {
        assert.equal(afuera(contratosDe('ar', 70, seed)), 0, `semilla ${seed}: se coló una oferta de afuera`);
        conContrato += afuera(contratosDe('ar', 70, seed, true));
    }

    assert.ok(
        conContrato > 0,
        'después del primer contrato el exterior sigue cerrado: la puerta quedó trabada',
    );
});

// ═══════════════════════════════════════════════════════════════════════════
//  6 · LA VENTANA SE ABRE EN TRES TIEMPOS
// ═══════════════════════════════════════════════════════════════════════════
//
// ── QUÉ MUNDO AFIRMA (CLAUDE de captain §1.3) ──────────────────────────────
// Que a un pibe lo tiene el club que lo formó, y que irse es algo que pasa
// después. Hasta los dieciocho el mercado son los clubes no profesionales de su
// país; hasta los veintiuno el mundo se abre pero tres de cada cuatro llamados
// siguen siendo de su país o de su región; recién de ahí en adelante el mercado
// es el del rugby profesional y punto.
//
// Lo que había antes no era una calibración floja: era la AUSENCIA de la regla.
// Medido sobre veinte países, ocho medias y doce semillas: a los dieciséis, el
// 23,6% de las ofertas venían de otro país y el 19,1% de otro continente, y con
// el pibe en el M20 —o sea `scouted`, que abre el catálogo entero— la cuenta se
// iba a 89,2% de afuera. Un chico de dieciséis con un llamado de Sudáfrica.
//
// Las tres se miden como se escribieron: las dos primeras son PUERTAS y se
// miden como puertas (ninguna oferta las cruza), la tercera es un CUPO y se mide
// como cupo (la proporción, sobre muchas mesas y país por país).

/** Los países que se barren: los treinta del catálogo pesan y no dicen más. */
const PAISES_SONDA = [
    'ar', 'uy', 'cl', 'br', 'py', 'us', 'fr', 'gb-eng', 'gb-wls', 'ie',
    'it', 'es', 'ge', 'za', 'nz', 'au', 'fj', 'jp', 'ro', 'pt',
] as const;

/** La mesa de un jugador parado a una edad y con una media, en su país. */
function mesaDe(
    countryCode: string,
    age: number,
    ovr: number,
    seed: number,
    scouted: boolean,
): ReturnType<typeof generateOffers> {
    const state = createInitialCaptain({ ...INPUT, countryCode }, seed);
    state.player.age = age;
    state.player.ovr = ovr;
    return generateOffers(
        { player: state.player, stage: state.stage, contract: null, scouted, everProfessional: false, season: state.season },
        createRng(seed),
    );
}

/** ¿La oferta es de tu país o de tu región? Se pregunta por AFINIDAD (§5). */
function esDeCasa(clubId: string, countryCode: string): boolean {
    const afinidad = affinityCountryOf(getClub(clubId));
    if (afinidad === countryCode) return true;
    const propia = regionOfCountry(countryCode);
    return propia !== null && regionOfCountry(afinidad) === propia;
}

test('hasta los 18 el mercado es el club de al lado, y el M20 no lo abre', () => {
    // Se mide como PUERTA y no como tasa: no «casi todas las ofertas del pibe son
    // de su país» sino NINGUNA es de afuera y NINGUNA es profesional.
    //
    // Y con `scouted` prendido en la mitad del barrido a propósito: era la
    // credencial que abría el catálogo entero, así que si esta puerta no le
    // ganara, el test pasaría por el motivo equivocado (§1.7). El pibe del M20 es
    // justamente el que más ofertas de afuera recibía.
    let vistas = 0;

    for (const countryCode of PAISES_SONDA) {
        for (const age of [16, HOMETOWN_MARKET_AGE - 1]) {
            for (const scouted of [false, true]) {
                for (const seed of [1, 2, 3, 4, 5, 6]) {
                    for (const ovr of [40, 50, 60, 70, 80]) {
                        for (const offer of mesaDe(countryCode, age, ovr, seed, scouted)) {
                            vistas += 1;
                            const club = getClub(offer.clubId);
                            assert.equal(
                                club.countryCode,
                                countryCode,
                                `${countryCode} (${age} años, media ${ovr}, scouted=${scouted}): lo llamó `
                                + `${club.name}, que es de ${club.countryCode}`,
                            );
                            assert.equal(
                                isProfessionalClub(club),
                                false,
                                `${countryCode} (${age} años, media ${ovr}): ${club.name} le ofrece un `
                                + `contrato profesional (${club.level}) antes de los ${HOMETOWN_MARKET_AGE}`,
                            );
                        }
                    }
                }
            }
        }
    }

    assert.ok(
        vistas > 0,
        'ningún pibe recibió una sola oferta: la puerta se volvió una pared y el mercado juvenil no existe',
    );
});

test('la puerta de los 18 se abre: el juvenil también se puede ir de su club', () => {
    // La contracara, y es la que sostiene el sentido de la de arriba. Si el
    // mercado del pibe fuera siempre el mismo club, la puerta no sería una puerta
    // sino el final del juego. Mismo jugador, misma media, misma semilla: lo
    // único que cambia es un año de edad.
    let cruzaron = 0;
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
        for (const ovr of [56, 64, 72]) {
            cruzaron += mesaDe('ar', HOMETOWN_MARKET_AGE, ovr, seed, true)
                .filter((o) => getClub(o.clubId).countryCode !== 'ar').length;
        }
    }
    assert.ok(
        cruzaron > 0,
        `a los ${HOMETOWN_MARKET_AGE} el mercado sigue sin cruzar la frontera: la puerta quedó trabada`,
    );
});

test('hasta los 21, tres de cada cuatro ofertas son de tu país o de tu región', () => {
    // Se mide como CUPO: la proporción sobre muchas mesas, PAÍS POR PAÍS y no en
    // el total. En el total, los veinte países se tapan entre ellos —Francia e
    // Inglaterra tienen catálogo de sobra y arrastran la cuenta hacia arriba— y
    // el uruguayo, el fiyiano y el irlandés, que son los que se quedan sin
    // candidatos de su región, quedarían escondidos adentro del promedio.
    //
    // La banda no es la medición de hoy (que da entre 77% y 96%): es el 75% que
    // la regla promete, y se lee igual el día que el catálogo cambie.
    for (const countryCode of PAISES_SONDA) {
        let total = 0;
        let deCasa = 0;

        for (const age of [HOMETOWN_MARKET_AGE, 19, MARKET_OPEN_AGE, REGIONAL_MARKET_AGE]) {
            for (const scouted of [false, true]) {
                for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
                    for (const ovr of [46, 52, 58, 64, 70, 76, 82]) {
                        for (const offer of mesaDe(countryCode, age, ovr, seed, scouted)) {
                            total += 1;
                            if (esDeCasa(offer.clubId, countryCode)) deCasa += 1;
                        }
                    }
                }
            }
        }

        assert.ok(total > 0, `${countryCode}: ningún juvenil recibió una oferta en todo el barrido`);
        const share = deCasa / total;
        assert.ok(
            share >= HOME_MARKET_SHARE,
            `${countryCode}: solo el ${(share * 100).toFixed(1)}% de las ofertas hasta los `
            + `${REGIONAL_MARKET_AGE} son de su país o su región (${deCasa} de ${total}), `
            + `y la regla promete ${HOME_MARKET_SHARE * 100}%`,
        );
    }
});

test('el cupo se levanta con la edad: a los 22 el mercado es el del mundo', () => {
    // La contracara del cupo, y la que lo convierte en un ANCLA y no en una
    // jaula. Si el mercado se quedara anclado a la región para siempre, un
    // jugador de veintiocho no podría firmar en Europa y la mitad del juego
    // dejaría de existir.
    const afuera = (age: number): number => {
        let n = 0;
        for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
            for (const ovr of [64, 72, 80]) {
                n += mesaDe('ar', age, ovr, seed, true).filter((o) => !esDeCasa(o.clubId, 'ar')).length;
            }
        }
        return n;
    };

    assert.ok(
        afuera(REGIONAL_MARKET_AGE + 1) > afuera(REGIONAL_MARKET_AGE),
        `a los ${REGIONAL_MARKET_AGE + 1} el mercado no se abrió más que a los ${REGIONAL_MARKET_AGE}: `
        + 'el cupo dejó de ser un ancla y pasó a ser una jaula',
    );
});

test('al que nació donde no hay profesionalismo la puerta se le abre sola', () => {
    // España no tiene un solo club profesional en el catálogo: la División de
    // Honor es semiprofesional. Encerrar a un español en el profesionalismo que su
    // país no tiene sería condenarlo a no firmar nunca, así que la condición de la
    // puerta es que EXISTA un contrato en casa.
    assert.equal(
        hasHomeProfessionalRugby('es'),
        false,
        'si España pasa a tener clubes profesionales en el catálogo, este test mide otra cosa',
    );

    const ofertas = [21, 22, 23, 24, 25].flatMap((seed) => contratosDe('es', 70, seed));
    assert.ok(
        ofertas.length > 0,
        'un español de 70 no recibió una sola oferta profesional: la puerta lo dejó encerrado',
    );
});
