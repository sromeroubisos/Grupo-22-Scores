import test from 'node:test';
import assert from 'node:assert/strict';

import { cruzarEstado, mapMatchStatus, estadoDesdeToken, resolverArranque } from './providerStatus.ts';

/* Los payloads de acá abajo NO están inventados: son los que devolvió
   `/api/matches/ALypVsfU` el 2026-08-20 — Canterbury 12 - 36 Northland, por la
   Bunnings NPC. Son el bug, tal como llegó. */

/** Lo que manda la FICHA del partido (`details`): dice la verdad. */
const FICHA = {
    stage: 'Finished',
    is_cancelled: false,
    is_postponed: false,
    is_started: true,
    is_in_progress: false,
    is_finished: true,
    live_time: null,
    live_minute: null,
    winner: 'away',
};

/** Lo que manda la LISTA DEL DÍA para el MISMO id: el marcador cargado y todos
 *  los flags en cero. Este es el sobre vacío que pisaba el estado bueno. */
const LISTA = {
    match_id: 'ALypVsfU',
    match_status: {
        stage: null,
        is_cancelled: false,
        is_postponed: false,
        is_started: false,
        is_in_progress: false,
        is_finished: false,
        live_time: null,
        live_minute: null,
        winner: null,
    },
    timestamp: 1787209800,          // 2026-08-20T07:10:00Z — el arranque REAL
    scores: { home: 12, away: 36 },
};

const RUGBY_UNION = 8;
const ARRANQUE_MS = LISTA.timestamp * 1000;
const DURANTE_EL_PARTIDO = ARRANQUE_MS + 50 * 60_000;
const DESPUES_DEL_PARTIDO = ARRANQUE_MS + 104 * 60_000;

test('la ficha del partido, sola, ya se leía bien', () => {
    // El estado bueno se calculaba correctamente. El bug no estaba acá.
    assert.equal(mapMatchStatus(FICHA), 'final');
});

test('el sobre vacío de la lista NO puede pisar el final de la ficha', () => {
    // ESTE es el bug. El guard viejo preguntaba si `match_status` existía; el
    // objeto siempre existe, así que la lista ganaba siempre y devolvía
    // 'scheduled'. Un partido terminado 12-36 se dibujaba «Programado».
    assert.equal(mapMatchStatus(LISTA.match_status), 'scheduled', 'la lista sigue sin decir nada');

    assert.equal(
        cruzarEstado({
            listMatchEvt: LISTA,
            fichaStatus: mapMatchStatus(FICHA),
            sportId: RUGBY_UNION,
            fichaTimestamp: 1787216056,
            fechaBase: '2026-08-20T08:54:16.000Z',
            ahoraMs: DESPUES_DEL_PARTIDO,
        }),
        'final',
    );
});

test('la lista SÍ pisa a la ficha cuando tiene algo para decir', () => {
    // No es que la lista pasó a ser ignorada: es la que llega fresca cuando un
    // partido arranca. Sólo perdió el derecho a pisar con un sobre vacío.
    const listaEnVivo = { ...LISTA, match_status: { ...LISTA.match_status, is_in_progress: true } };
    assert.equal(
        cruzarEstado({
            listMatchEvt: listaEnVivo,
            fichaStatus: 'scheduled',
            sportId: RUGBY_UNION,
            ahoraMs: DURANTE_EL_PARTIDO,
        }),
        'live',
    );
});

test('con los dos caminos callados, la red de tiempo cierra el partido', () => {
    // El peor caso: ni la ficha ni la lista dicen nada. Antes quedaba
    // «Programado» para siempre; el feed diario sí tenía red y la página no.
    const cruzado = cruzarEstado({
        listMatchEvt: LISTA,
        fichaStatus: 'scheduled',
        sportId: RUGBY_UNION,
        ahoraMs: DESPUES_DEL_PARTIDO,
    });
    assert.equal(cruzado, 'final');
});

test('la red no se adelanta: durante el partido sigue siendo lo que era', () => {
    // El caso de reset. A los 50 minutos el partido está jugándose.
    assert.equal(
        cruzarEstado({ listMatchEvt: LISTA, fichaStatus: 'scheduled', sportId: RUGBY_UNION, ahoraMs: DURANTE_EL_PARTIDO }),
        'scheduled',
    );
    assert.equal(
        cruzarEstado({ listMatchEvt: LISTA, fichaStatus: 'live', sportId: RUGBY_UNION, ahoraMs: DURANTE_EL_PARTIDO }),
        'live',
    );
});

test('un suspendido explícito no lo toca la red de tiempo', () => {
    // Si no, mediría el tiempo desde un partido que no se jugó y lo daría por
    // terminado — el error que manda a la gente a una cancha vacía.
    const postergado = { ...LISTA, match_status: { ...LISTA.match_status, is_postponed: true } };
    assert.equal(
        cruzarEstado({ listMatchEvt: postergado, fichaStatus: 'scheduled', sportId: RUGBY_UNION, ahoraMs: DESPUES_DEL_PARTIDO }),
        'postponed',
    );

    const cancelado = { ...LISTA, match_status: { ...LISTA.match_status, is_cancelled: true } };
    assert.equal(
        cruzarEstado({ listMatchEvt: cancelado, fichaStatus: 'scheduled', sportId: RUGBY_UNION, ahoraMs: DESPUES_DEL_PARTIDO }),
        'cancelled',
    );
});

test('el arranque sale de la LISTA, no de la ficha', () => {
    // En un partido terminado el timestamp de la ficha viene corrido hasta el
    // final: 1787216056 es 104 minutos después del arranque real. Anclar la red
    // ahí sería medir contra un número que se mueve.
    assert.equal(resolverArranque(LISTA, 1787216056, null), ARRANQUE_MS);
    assert.notEqual(resolverArranque(LISTA, 1787216056, null), 1787216056 * 1000);

    // Sin lista, se usa lo que haya — en ese orden.
    assert.equal(resolverArranque(null, 1787216056, null), 1787216056 * 1000);
    assert.equal(resolverArranque(null, null, '2026-08-20T07:10:00.000Z'), ARRANQUE_MS);
    assert.equal(resolverArranque(null, null, null), null);
});

test('`stage` se lee: era el campo que faltaba', () => {
    // La copia vieja de la página miraba `code` pero no `stage`, que es JUSTO
    // donde este proveedor escribe "Finished".
    assert.equal(mapMatchStatus({ stage: 'Finished' }), 'final');
    assert.equal(mapMatchStatus({ stage: '2nd Half' }), 'live');
    assert.equal(mapMatchStatus({ stage: 'Half Time' }), 'live', 'el descanso es tiempo de juego');
    assert.equal(mapMatchStatus({ stage: 'Postponed' }), 'postponed');
});

test('terminado le gana a empezado', () => {
    // `is_started` es true en TODO partido terminado. Leerlo antes que el
    // estado real deja el partido eternamente en vivo.
    assert.equal(mapMatchStatus({ is_started: true, stage: 'Finished' }), 'final');
    assert.equal(mapMatchStatus({ is_started: true, stage: null }), 'live');
});

test('un token vacío no es «no empezó»: es «no sé»', () => {
    // De esa distinción depende que la ficha pueda ganar el cruce.
    assert.equal(estadoDesdeToken(''), null);
    assert.equal(estadoDesdeToken(null), null);
    assert.equal(estadoDesdeToken('scheduled'), null);
    assert.equal(estadoDesdeToken('Finished'), 'final');
});
