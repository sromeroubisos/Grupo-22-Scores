// LAS DOS PUNTAS DE LA CARRERA: dónde empezás y a dónde volvés.
//
// Lo que estos tests cuidan no es "la feature anda", sino las cuatro cosas que
// son fáciles de romper sin darse cuenta:
//
//   1. elegir club NO corre el stream del RNG (si lo corriera, dos carreras con
//      la misma semilla dejarían de ser comparables y el digest mentiría);
//   2. el pool de elección es del PAÍS del jugador y no incluye franquicias
//      profesionales (el arranque en academia lo sortea el motor);
//   3. la vuelta a casa aparece SIEMPRE en el tramo final, no cuando el mercado
//      tiene ganas — que es justamente la diferencia con una oferta de mercado;
//   4. y es determinística: la tarjeta que ve la UI y la que resuelve el reducer
//      tienen que traer la misma opción con el mismo id, o una recarga a mitad de
//      temporada dejaría al jugador eligiendo algo que el motor no encuentra.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialCareer, careerReducer } from '../../state/career-reducer.ts';
import { getPendingEvent } from '../event-selector.ts';
import { startClubChoices, isStartClubChoice } from '../market-routes.ts';
import { firstClubIdOf, homecomingIsAvailable, homecomingOffer, isHomecomingOption, HOMECOMING_PREFIX } from '../homecoming.ts';
import { RETIREMENT_CHOICE_AGE } from '../retirement.ts';
import { getClub } from '../../data/clubs.ts';
import { economicModelOf } from '../../data/competition-levels2026.ts';
import { isArDivision } from '../../data/clubs2026/arSystem2026.ts';
import type { CareerState } from '../../types/career.ts';

// ── 1. El pool de clubes elegibles ───────────────────────────────────────────

test('los clubes elegibles son los AMATEUR del país, todos y sin franquicias', () => {
    const ar = startClubChoices('ar');
    assert.ok(ar.length > 200, `esperaba el sistema argentino entero, hay ${ar.length}`);
    for (const club of ar) {
        assert.equal(club.countryCode, 'ar', `${club.labelEs} no es argentino`);
        assert.equal(economicModelOf(club), 'amateur', `${club.labelEs} no es amateur`);
        assert.ok(isArDivision(club.competitionId), `${club.labelEs} no juega una división del canon`);
    }
    // Las franquicias profesionales NO son una opción de arranque: esa puerta la
    // abre el sorteo de rama, no la pantalla de creación.
    for (const id of ['dogos-xv', 'pampas', 'tarucas', 'capibaras-xv']) {
        assert.ok(!ar.some((c) => c.id === id), `${id} no puede ofrecerse como club de inicio`);
    }
});

test('se puede elegir de punta a punta de la pirámide, no sólo del sótano', () => {
    const ar = startClubChoices('ar');
    // Lo que hace que la elección sea una elección: el Top 14 y el último local
    // están los dos. Acotarlo a los escalones de entrada —que es lo que hace el
    // SORTEO— dejaría afuera a los clubes que alguien va a querer elegir.
    assert.ok(ar.some((c) => c.competitionId === 'ar-urba-top14'), 'falta el Top 14');
    assert.ok(ar.some((c) => c.competitionId === 'ar-urba-desarrollo'), 'falta Desarrollo');
    assert.ok(ar.some((c) => c.competitionId === 'ar-noa-andina'), 'falta la base del interior');
    // Y viene ordenada de más fuerte a más flojo: es el orden en que se lee una
    // pirámide, y de él sale el agrupado de la pantalla.
    for (let i = 1; i < ar.length; i++) {
        assert.ok(ar[i].rating <= ar[i - 1].rating, `${ar[i].labelEs} rompe el orden de fuerza`);
    }
});

test('un país sin escalera propia no ofrece elección, y lo dice con una lista vacía', () => {
    // Portugal: su único escalón es semiprofesional, así que no hay club amateur
    // donde arrancar. Es el caso que la pantalla explica en vez de mostrar vacío.
    assert.deepEqual(startClubChoices('pt'), []);
    assert.deepEqual(startClubChoices('cz'), [], 'un país sin liga modelada tampoco');
});

test('la lista es determinística: dos llamadas dan exactamente lo mismo', () => {
    assert.deepEqual(
        startClubChoices('ar').map((c) => c.id),
        startClubChoices('ar').map((c) => c.id),
    );
});

// ── 2. Elegir club al crear ──────────────────────────────────────────────────

const AR_INPUT = { position: 'flyhalf' as const, nationalityCountryCode: 'ar' };

test('el club elegido es el club donde arranca', () => {
    const elegido = startClubChoices('ar').find((c) => c.competitionId === 'ar-urba-top14')!;
    const state = createInitialCareer({ ...AR_INPUT, startClubId: elegido.id }, 12345);
    assert.equal(state.player.club, elegido.id, 'arranca donde eligió');
    assert.equal(state.player.league, elegido.league);
    // Y el vínculo sale del club, no de la rama sorteada: un club amateur no
    // sostiene un contrato pago.
    assert.equal(state.player.employment, 'amateur');
    assert.equal(state.player.squadTrack, 'senior');
});

test('ELEGIR CLUB NO CORRE EL STREAM DEL RNG', () => {
    // La prueba es con un id INVÁLIDO: el motor lo descarta y la carrera tiene
    // que quedar byte-idéntica a no haber mandado nada. Si `pickInitialClub` se
    // salteara cuando hay elección, este caso consumiría distinto y las dos
    // carreras divergirían.
    const sin = createInitialCareer(AR_INPUT, 777);
    const conBasura = createInitialCareer({ ...AR_INPUT, startClubId: 'no-existe-este-club' }, 777);
    assert.deepEqual(conBasura, sin, 'un id inválido no puede cambiar la carrera');

    // Y con un club VÁLIDO cambia el club, pero no el resto del sorteo del
    // jugador: el techo, el apodo y el perfil salen de las mismas tiradas.
    const elegido = startClubChoices('ar')[0];
    const con = createInitialCareer({ ...AR_INPUT, startClubId: elegido.id }, 777);
    assert.equal(con.player.potential, sin.player.potential, 'el techo es de la semilla, no del club');
    assert.equal(con.player.nickname, sin.player.nickname);
    assert.equal(con.player.developmentProfile, sin.player.developmentProfile);
    assert.equal(con.rngState, sin.rngState, 'el RNG queda en el mismo punto');
});

test('un club de otro país no se acepta: la elección se valida contra el país', () => {
    const frances = startClubChoices('fr')[0];
    assert.ok(!isStartClubChoice('ar', frances.id), 'un club francés no es opción para un argentino');
    const state = createInitialCareer({ ...AR_INPUT, startClubId: frances.id }, 999);
    assert.notEqual(state.player.club, frances.id);
    assert.deepEqual(state, createInitialCareer(AR_INPUT, 999), 'cae al sorteo, sin correr el stream');
});

// ── 3. Volver al club donde empezaste ────────────────────────────────────────

/**
 * Lleva la carrera hasta la edad pedida ACEPTANDO PASES.
 *
 * Elegir siempre la opción 0 no sirve acá: en el mercado la primera es
 * "quedarte", así que produce carreras de un solo club — y sin cambio de club no
 * hay a dónde volver, que es justo lo que se quiere medir. Se prefiere entonces
 * la primera oferta de pase (`move-`), que nunca es la vuelta a casa
 * (`homecoming-`) ni el retiro (`retire-now`).
 */
function playUntilAge(state: CareerState, age: number): CareerState {
    let current = state;
    let guard = 0;
    while (current.player.age < age && current.phase !== 'retired' && guard++ < 60) {
        const event = getPendingEvent(current);
        if (!event) {
            current = careerReducer(current, { type: 'ADVANCE' });
            continue;
        }
        const move = event.options.find((o) => o.id.startsWith('move-'));
        current = careerReducer(current, { type: 'CHOOSE', optionId: (move ?? event.options[0]).id });
    }
    return current;
}

test('antes del tramo final no hay vuelta a casa: es una decisión de cierre', () => {
    const state = createInitialCareer(AR_INPUT, 4242);
    assert.equal(state.player.age < RETIREMENT_CHOICE_AGE, true);
    assert.equal(homecomingIsAvailable(state), false);
    assert.equal(homecomingOffer(state), null);
});

test('en el tramo final, el club donde empezaste ofrece volver', () => {
    // Se buscan semillas hasta dar con una carrera que haya cambiado de club: la
    // vuelta no existe para el que nunca se fue, y eso es parte de la regla.
    let encontrado = 0;
    for (let seed = 1; seed <= 40 && encontrado < 3; seed++) {
        const state = playUntilAge(createInitialCareer(AR_INPUT, seed * 31), RETIREMENT_CHOICE_AGE);
        if (state.phase === 'retired' || state.player.age < RETIREMENT_CHOICE_AGE) continue;
        const primero = firstClubIdOf(state);
        if (primero === state.player.club) {
            assert.equal(homecomingIsAvailable(state), false, 'no se vuelve a donde ya estás');
            continue;
        }
        encontrado++;

        assert.equal(homecomingIsAvailable(state), true);
        const offer = homecomingOffer(state)!;
        assert.equal(offer.club, primero, 'la oferta es del club donde empezó');
        assert.equal(offer.via, 'homecoming');

        // Y está en la tarjeta, sea cual sea el evento de esa temporada.
        const event = getPendingEvent(state)!;
        const option = event.options.find((o) => isHomecomingOption(o.id));
        assert.ok(option, `la decisión de los ${state.player.age} no ofrece volver`);
        assert.equal(option!.id, `${HOMECOMING_PREFIX}${primero}`);
        assert.equal(option!.offer?.clubId, primero, 'la ficha muestra el club');

        // Elegirla mueve de verdad: la promesa de la tarjeta se cumple.
        const despues = careerReducer(state, { type: 'CHOOSE', optionId: option!.id });
        assert.equal(despues.player.club, primero, `volvió a ${getClub(primero).labelEs}`);
    }
    assert.ok(encontrado >= 1, 'ninguna de las 40 semillas llegó al tramo final habiendo cambiado de club');
});

test('EL CLUB DE ORIGEN ES EL DE LA CREACIÓN, aunque te muevan antes de jugar', () => {
    // El caso que rompía la primera versión: el mercado se evalúa ANTES de la
    // temporada 1, así que un pase en esa ventana dejaba `history[0]` apuntando a
    // otro club. Medido con esta semilla: se elige CASI, se juega la primera
    // temporada en otro club, y la vuelta tiene que seguir ofreciendo CASI.
    const casi = startClubChoices('ar').find((c) => c.labelEs === 'CASI')!;
    const inicial = createInitialCareer(
        { position: 'centre', nationalityCountryCode: 'ar', startClubId: casi.id },
        20260801,
    );
    assert.equal(inicial.startClub, casi.id, 'el club de creación se sella en el estado');

    const state = playUntilAge(inicial, RETIREMENT_CHOICE_AGE);
    assert.notEqual(state.history[0].clubId, casi.id, 'esta semilla mueve al jugador antes de la temporada 1');
    assert.equal(firstClubIdOf(state), casi.id, 'la vuelta apunta al club donde empezó, no al primero que jugó');
    assert.equal(homecomingOffer(state)?.club, casi.id);
});

test('la tarjeta es la MISMA al dibujarla y al resolverla (sobrevive a un F5)', () => {
    let medido = false;
    for (let seed = 1; seed <= 40; seed++) {
        const state = playUntilAge(createInitialCareer(AR_INPUT, seed * 31), RETIREMENT_CHOICE_AGE);
        if (state.phase !== 'event' || !homecomingIsAvailable(state)) continue;

        // Releer el estado (que es lo que hace la UI tras una recarga) no puede
        // consumir RNG ni cambiar las opciones.
        const antes = getPendingEvent(state)!;
        const revivido: CareerState = JSON.parse(JSON.stringify(state));
        const despues = getPendingEvent(revivido)!;
        assert.deepEqual(
            despues.options.map((o) => o.id),
            antes.options.map((o) => o.id),
            'la tarjeta cambió entre dos lecturas del mismo estado',
        );
        assert.equal(revivido.rngState, state.rngState, 'leer la tarjeta consumió azar');
        medido = true;
        break;
    }
    // Sin esto el test pasa sin haber medido nada: el `for` se agota en silencio
    // si ninguna semilla llega al tramo final con la vuelta disponible.
    assert.ok(medido, 'ninguna semilla llegó a una tarjeta con vuelta a casa');
});

test('nunca dos veces el mismo club en la misma tarjeta', () => {
    // Si el mercado ya trajo una oferta del club de origen, la vuelta no se
    // agrega: dos opciones con el mismo escudo se leen como un bug.
    for (let seed = 1; seed <= 60; seed++) {
        const state = playUntilAge(createInitialCareer(AR_INPUT, seed * 17), RETIREMENT_CHOICE_AGE);
        const event = getPendingEvent(state);
        if (!event) continue;
        const clubes = event.options.map((o) => o.offer?.clubId).filter((id): id is string => id !== undefined);
        assert.equal(new Set(clubes).size, clubes.length, `la tarjeta de la semilla ${seed} repite un club`);
    }
});
