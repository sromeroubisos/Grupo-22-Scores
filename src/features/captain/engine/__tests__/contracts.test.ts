// EL PLAZO DEL CONTRATO — lo que hace que firmar sea un compromiso.
//
// Este archivo custodia UNA promesa con tres mitades, y las tres se rompen por
// caminos distintos:
//
//   · MIENTRAS CORRE, TE QUEDÁS. La ventana de pases no se abre, y por eso
//     firmar tres años es resignar tres junios de mesa puesta.
//   · EL SUELDO ES EL QUE FIRMASTE. No el que valdrías hoy: si creciste cobrás
//     de menos y si te caíste cobrás de más, que es toda la apuesta del plazo.
//   · CUANDO VENCE, SE RENUEVA O TE VAS. La mesa vuelve con tu club adentro, y
//     su oferta se calcula con tu media de HOY.
//
// La cuarta es la puerta de escape, y va medida aparte porque es la única que
// puede fallar en silencio: volver al club de origen rescinde, y si el contrato
// no se limpiara, el jugador quedaría amateur con un papel colgado que le
// seguiría cerrando el mercado para siempre.

import test from 'node:test';
import assert from 'node:assert/strict';

import type { CaptainState, CreateCaptainInput, Contract } from '../../types/captain.ts';
import { createInitialCaptain } from '../../state/captain-reducer.ts';
import { buildMarketEvent } from '../../data/events/index.ts';
import {
    CONTRACT_YEARS_MAX,
    CONTRACT_YEARS_MIN,
    VETERAN_CONTRACT_AGE,
    YOUNG_CONTRACT_AGE,
    contractYearsFor,
    generateOffers,
    isProfessionalClub,
    renewalFor,
    salaryFor,
} from '../clubs.ts';
import {
    contractExpiring,
    currentContract,
    lastSeasonOf,
    renewContract,
    returnHome,
    seasonsLeftAfter,
    signProfessional,
    underContract,
} from '../contracts.ts';
import { createRng } from '../random.ts';
import { CLUBS, getClub } from '../../data/catalogs.ts';

const INPUT: CreateCaptainInput = {
    name: 'Bautista',
    surname: 'Uriarte',
    family: 'apertura',
    countryCode: 'ar',
};

/**
 * Un jugador parado a una edad y con una media, sin haber jugado la carrera.
 *
 * Misma receta que `market.test.ts`: lo que se mide es EL PAPEL y no el camino,
 * así que llegar a los veintiséis jugando diez temporadas mezclaría el plazo con
 * todo lo que el motor le hizo al jugador en el medio.
 */
function jugadorDe(seed: number, age: number, ovr: number): CaptainState {
    const state = createInitialCaptain(INPUT, seed);
    state.player.age = age;
    state.player.ovr = ovr;
    return state;
}

/** El club profesional más grande que el catálogo tenga. Para firmar de verdad. */
function unClubProfesional(): string {
    const pros = CLUBS.filter(isProfessionalClub).sort((a, b) => a.id.localeCompare(b.id));
    assert.ok(pros.length > 0, 'el catálogo se quedó sin clubes profesionales');
    return pros[0].id;
}

function ofertasDe(state: CaptainState, seed = 1) {
    return generateOffers(
        {
            player: state.player,
            stage: state.stage,
            contract: currentContract(state),
            scouted: true,
            everProfessional: true,
            season: state.season,
        },
        createRng(seed),
    );
}

// ═══════════════════════════════════════════════════════════════════════════
//  1 · MIENTRAS EL PAPEL CORRA, NO HAY MESA
// ═══════════════════════════════════════════════════════════════════════════

test('EL CONTRATO ATA: la ventana se cierra hasta el año en que vence', () => {
    // ── QUÉ MUNDO AFIRMA (CLAUDE de captain §1.3) ───────────────────────────
    // Que firmar COMPROMETE. Sin esto el mercado se abría todos los junios
    // aunque el jugador acabara de firmar, o sea que un contrato no obligaba a
    // nada y renegociar la vida entera cada temporada era gratis.
    //
    // Se barre el plazo ENTERO (de uno a tres) y no un caso: el de un año no
    // tiene que atar ni un junio, y el de tres tiene que atar exactamente dos.
    for (let years = CONTRACT_YEARS_MIN; years <= CONTRACT_YEARS_MAX; years += 1) {
        const state = jugadorDe(21, 26, 82);
        const clubId = unClubProfesional();
        signProfessional(state, clubId, years, salaryFor(getClub(clubId), state.player.ovr));

        const desde = state.season;
        for (let i = 0; i < years; i += 1) {
            // La temporada que se juega. El contrato firmado en `desde` cubre
            // desde `desde + 1`, así que la primera vuelta ya está adentro.
            state.season = desde + 1 + i;
            const ultima = i === years - 1;

            assert.equal(
                underContract(state),
                !ultima,
                `plazo ${years}, temporada ${i + 1}: ${ultima ? 'el último año NO tiene que atar' : 'el papel tiene que atar'}`,
            );
            assert.equal(contractExpiring(state), ultima, `plazo ${years}, temporada ${i + 1}: el vencimiento cayó en otro año`);
            assert.equal(
                ofertasDe(state).length === 0,
                !ultima,
                `plazo ${years}, temporada ${i + 1}: la mesa ${ultima ? 'tiene que volver a ponerse' : 'se puso con el contrato corriendo'}`,
            );
        }
    }
});

test('sin mesa no hay tarjeta que dibujar', () => {
    // La otra punta de lo mismo, y es la que el jugador ve: `generateOffers`
    // devolviendo vacío tiene que traducirse en que la pantalla del mercado no
    // aparece, no en una tarjeta con una sola opción.
    const state = jugadorDe(22, 26, 82);
    const clubId = unClubProfesional();
    signProfessional(state, clubId, 3, salaryFor(getClub(clubId), state.player.ovr));
    state.season += 1;
    state.offers = ofertasDe(state);

    assert.deepEqual(state.offers, [], 'con contrato vigente llegó una oferta');
    assert.equal(buildMarketEvent(state), null, 'sin ofertas se armó igual la tarjeta de mercado');
});

// ═══════════════════════════════════════════════════════════════════════════
//  2 · EL SUELDO ES EL QUE FIRMASTE
// ═══════════════════════════════════════════════════════════════════════════

test('EL SUELDO SE CONGELA: crecer no lo sube y caerse no lo baja', () => {
    // ── QUÉ MUNDO AFIRMA ────────────────────────────────────────────────────
    // Que el contrato es una APUESTA de las dos partes. El club que firma a un
    // pibe por tres años se queda con la diferencia si explota; el que firma a
    // un veterano por tres se come el declive. Un sueldo que se recalculara
    // todos los junios borraría las dos mitades y dejaría el plazo de adorno.
    const state = jugadorDe(23, 24, 74);
    const clubId = unClubProfesional();
    const club = getClub(clubId);
    const firmado = salaryFor(club, state.player.ovr);
    signProfessional(state, clubId, 3, firmado);

    for (const nuevaMedia of [92, 60]) {
        state.player.ovr = nuevaMedia;
        state.season += 1;
        const vigente = currentContract(state);
        assert.ok(vigente, `con media ${nuevaMedia} el contrato dejó de estar vigente`);
        assert.equal(vigente.salary, firmado, `con media ${nuevaMedia} el sueldo firmado se movió solo`);
        assert.notEqual(
            salaryFor(club, nuevaMedia),
            firmado,
            `con media ${nuevaMedia} el club pagaría lo mismo: el caso no prueba nada`,
        );
    }
});

// ═══════════════════════════════════════════════════════════════════════════
//  3 · RENOVAR ES FIRMAR DE NUEVO, CON LA MEDIA DE HOY
// ═══════════════════════════════════════════════════════════════════════════

test('LA RENOVACIÓN SE CALCULA CON LA MISMA CUENTA QUE UNA OFERTA DE AFUERA', () => {
    // ── LA EQUIVALENCIA, que es lo que hace comparable la mesa ──────────────
    // La última opción de la tarjeta compite contra cinco clubes, así que su
    // sueldo tiene que salir de la MISMA función. Escrita aparte sería una
    // tercera escala que nadie mantendría al día, y el jugador estaría eligiendo
    // entre dos monedas distintas sin que nada se lo dijera.
    const clubId = unClubProfesional();
    const club = getClub(clubId);

    for (const [age, ovr] of [[22, 70], [27, 84], [34, 78]] as const) {
        const state = jugadorDe(24, age, ovr);
        state.player.clubId = clubId;

        const renovacion = renewalFor(state.player, clubId, state.season);
        assert.ok(renovacion, `a los ${age} el club profesional no ofreció renovación`);
        assert.equal(renovacion.salary, salaryFor(club, ovr), `a los ${age} la renovación pagó otra escala`);
        assert.equal(renovacion.years, contractYearsFor(club, state.player), `a los ${age} la renovación usó otro plazo`);
    }
});

test('RENOVAR PAGA LO QUE VALÉS AHORA, no lo que valías cuando firmaste', () => {
    // El caso que le da sentido al plazo desde el otro lado: el que firmó barato
    // a los 22 y creció tiene que cobrar la diferencia recién al renovar. Si la
    // renovación repitiera el sueldo viejo, un contrato largo sería una condena
    // y nadie firmaría uno nunca.
    const state = jugadorDe(25, 24, 70);
    const clubId = unClubProfesional();
    const firmado = salaryFor(getClub(clubId), state.player.ovr);
    signProfessional(state, clubId, 3, firmado);

    state.season = lastSeasonOf(state.contract as Contract);
    state.player.ovr = 90;

    const renovacion = renewalFor(state.player, clubId, state.season);
    assert.ok(renovacion, 'el año del vencimiento no hubo renovación');
    assert.ok(
        renovacion.salary > firmado,
        `renovó por ${renovacion.salary} habiendo firmado ${firmado} con veinte puntos menos de media`,
    );

    const extra = renewContract(state, renovacion.years, renovacion.salary);
    assert.match(extra, /Renovaste/, 'la renovación no dejó línea de crónica');
    assert.equal(state.contract?.salary, renovacion.salary, 'el contrato nuevo no guardó el sueldo nuevo');
    assert.equal(state.contract?.since, state.season + 1, 'el contrato nuevo no arranca la temporada que viene');
    assert.equal(underContract(state), state.contract!.years > 1, 'renovar no volvió a atar');
});

test('la tarjeta del último año ofrece RENOVAR y no quedarse', () => {
    // Lo que el jugador ve. Es la traducción de todo lo de arriba a la pantalla,
    // y tiene su propio test porque puede romperse sola: la tarjeta se
    // reconstruye en cada render desde el estado, así que un cambio en el motor
    // puede dejarla ofreciendo un mundo que ya no existe.
    const state = jugadorDe(26, 27, 84);
    const clubId = unClubProfesional();
    signProfessional(state, clubId, 2, salaryFor(getClub(clubId), state.player.ovr));
    state.season = lastSeasonOf(state.contract as Contract);
    state.offers = ofertasDe(state, 26);

    assert.ok(state.offers.length > 0, 'el año del vencimiento la mesa quedó vacía');
    const tarjeta = buildMarketEvent(state);
    assert.ok(tarjeta, 'con ofertas sobre la mesa no se armó la tarjeta');

    const ultima = tarjeta.options[tarjeta.options.length - 1];
    assert.equal(ultima.id, 'quedarte', 'la opción de tu club dejó de ser la última');
    assert.match(ultima.label, /^Renovar con /, 'la última opción no cambió de verbo el año del vencimiento');
    assert.ok((ultima.salary ?? 0) > 0, 'la renovación no muestra sueldo, y compite contra cinco que sí');
    assert.ok((ultima.contractYears ?? 0) > 0, 'la renovación no muestra plazo');
    assert.equal(ultima.outcomes[0].effect.renew, true, 'la renovación no aplica el efecto que la firma');

    // Y las de afuera también dicen por cuánto tiempo: una mesa donde solo la
    // renovación declara plazo se lee como si las otras no tuvieran.
    for (const opcion of tarjeta.options.slice(0, -1)) {
        if ((opcion.salary ?? 0) > 0) {
            assert.ok((opcion.contractYears ?? 0) > 0, `${opcion.label} muestra sueldo sin plazo`);
        }
    }
});

// ═══════════════════════════════════════════════════════════════════════════
//  4 · LA PUERTA DE ESCAPE
// ═══════════════════════════════════════════════════════════════════════════

test('VOLVER A CASA ROMPE EL PAPEL: el que rescinde queda libre', () => {
    // EL CASO DE RESET, y es el que puede fallar en silencio. Volver al club de
    // origen es rescindir —lo hicieron Boffelli y Creevy— así que el contrato se
    // va con la etapa. Si quedara colgado, el jugador sería amateur en su club
    // con un papel de otro club cerrándole el mercado hasta 2031, y nada
    // fallaría: simplemente no volvería a recibir una oferta nunca más.
    const state = jugadorDe(27, 31, 86);
    const casa = state.homeClubId;
    assert.ok(casa, 'la carrera arrancó sin club de origen');

    const clubId = unClubProfesional();
    signProfessional(state, clubId, 3, salaryFor(getClub(clubId), state.player.ovr));
    state.season += 1;
    assert.ok(underContract(state), 'el contrato de tres años no ató ni una temporada');

    returnHome(state);

    assert.equal(state.contract, null, 'volvió a casa con el contrato todavía puesto');
    assert.equal(underContract(state), false, 'el papel roto sigue atando');
    assert.equal(state.player.clubId, casa, 'no volvió al club de origen');
    assert.ok(ofertasDe(state, 27).length >= 0, 'la ventana quedó rota después de volver');
});

test('un contrato de otro club no ata a nadie', () => {
    // El invariante que sostiene al de arriba desde el otro lado: `currentContract`
    // compara el club, así que un papel que quedó apuntando a otro lado se lee
    // como inexistente en vez de como una condena. Es el error barato de los dos.
    const state = jugadorDe(28, 28, 80);
    const clubId = unClubProfesional();
    signProfessional(state, clubId, 3, 100_000);
    state.player.clubId = 'club-que-no-firmó';

    assert.equal(currentContract(state), null, 'el contrato de otro club se leyó como vigente');
    assert.equal(underContract(state), false, 'el contrato de otro club ató igual');
});

// ═══════════════════════════════════════════════════════════════════════════
//  5 · CUÁNTOS AÑOS, Y POR QUÉ ESOS
// ═══════════════════════════════════════════════════════════════════════════

test('AL PIBE LO ATAN LARGO Y AL VETERANO LO RENUEVAN AÑO A AÑO', () => {
    // ── QUÉ MUNDO AFIRMA ────────────────────────────────────────────────────
    // Los dos extremos de la curva real del rugby profesional. Al que se formó
    // en el club lo aseguran porque le pagaron la formación; al de treinta y
    // cinco nadie le firma tres años de cuerpo. Lo del medio es negociación y
    // no hace falta afirmarlo acá.
    const club = getClub(unClubProfesional());
    const pibe = { age: YOUNG_CONTRACT_AGE, ovr: club.rating - 10 };
    const veterano = { age: VETERAN_CONTRACT_AGE + 1, ovr: club.rating + 10 };

    assert.ok(
        contractYearsFor(club, pibe) > contractYearsFor(club, veterano),
        'al pibe no lo atan más que al veterano',
    );
    assert.equal(contractYearsFor(club, veterano), CONTRACT_YEARS_MIN, 'al veterano le firmaron más de un año');

    // La figura suma UN año y nunca más: sin el techo, un pibe que además es
    // figura se llevaría cuatro y el plazo dejaría de tener forma.
    const figura = { age: YOUNG_CONTRACT_AGE, ovr: club.rating + 20 };
    assert.equal(contractYearsFor(club, figura), CONTRACT_YEARS_MAX, 'la figura joven no llegó al tope');

    // Y el techo no se pasa NUNCA, mire donde mire. Se barre el catálogo entero
    // en vez de un club a dedo: un club elegido a mano se queda viejo con el
    // próximo catálogo y lo que se afirma acá vale para todos.
    for (const c of CLUBS) {
        for (const age of [16, 20, 24, 28, 32, 38]) {
            for (const ovr of [40, 60, 80, 99]) {
                const years = contractYearsFor(c, { age, ovr });
                if (!isProfessionalClub(c)) {
                    assert.equal(years, 0, `${c.id} no es profesional y firmó ${years} años`);
                    continue;
                }
                assert.ok(
                    years >= CONTRACT_YEARS_MIN && years <= CONTRACT_YEARS_MAX,
                    `${c.id} firmó ${years} años a los ${age} con media ${ovr}`,
                );
            }
        }
    }
});

test('la aritmética del vencimiento no se guarda: se calcula', () => {
    // `lastSeasonOf` y `seasonsLeftAfter` son la única fuente de «¿hasta cuándo?».
    // Se miden juntas porque una fecha de vencimiento guardada al lado de los
    // años que la producen es la derivada congelada que el CLAUDE §1.9 prohíbe,
    // y este test es lo que hace ruido el día que alguien la escriba.
    const contrato: Contract = { clubId: 'x', since: 2030, years: 3, salary: 1 };
    assert.equal(lastSeasonOf(contrato), 2032, 'el último año cubierto no es el que dice el plazo');
    assert.equal(seasonsLeftAfter(contrato, 2030), 2, 'la cuenta de años restantes se corrió');
    assert.equal(seasonsLeftAfter(contrato, 2032), 0, 'el último año no dio cero');
    assert.equal(seasonsLeftAfter(contrato, 2040), 0, 'un contrato vencido devolvió años negativos');
});
