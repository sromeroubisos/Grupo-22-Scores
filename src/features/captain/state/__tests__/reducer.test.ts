// El reducer: determinismo, pureza del estado y el ciclo de la temporada.
//
// Acá va lo que NO cambia cuando el motor cambia a propósito: que la misma
// semilla da la misma carrera, que el estado sobrevive a un viaje por JSON, y
// que repartir el Tiempo no consume azar. Nada de esto se actualiza nunca; si
// falla, se coló una fuente de entropía.
//
// El DIGEST CONGELADO —la foto del comportamiento, que sí se actualiza en cada
// cambio intencional— vive aparte, en `engine/__tests__/determinism.test.ts`.
// Están separados a propósito: mezclarlos hace que un cambio de balance haga
// fallar el mismo archivo que un bug de determinismo, y son dos diagnósticos
// opuestos.

import test from 'node:test';
import assert from 'node:assert/strict';

import type { CaptainState, CreateCaptainInput } from '../../types/captain.ts';
import type { MomentOutcome, TackleZone } from '../../types/moment.ts';
import type { AnclaSetup } from '../../engine/moment-defs/ancla.ts';
import type { CodigoSetup } from '../../engine/moment-defs/codigo.ts';
import type { CaptainAction } from '../captain-actions.ts';
import { TIME_SLOTS, TIME_TOKENS_PER_SEASON } from '../../types/currencies.ts';
import { MATCH_CAP_PER_SEASON } from '../../types/season.ts';
import { ALL_FAMILIES, getFamily } from '../../data/positions.ts';
import { getPendingEvent } from '../../engine/event-selector.ts';
import { trackIndex } from '../../engine/national-team.ts';
import { captainReducer, createInitialCaptain } from '../captain-reducer.ts';

const INPUT: CreateCaptainInput = {
    name: 'Bautista',
    surname: 'Uriarte',
    family: 'apertura',
    countryCode: 'ar',
};

function apply(state: CaptainState, actions: CaptainAction[]): CaptainState {
    return actions.reduce(captainReducer, state);
}

/** Repartir las seis fichas donde se diga y cerrar el reparto. */
function repartir(state: CaptainState, slot: (typeof TIME_SLOTS)[number] = 'entrenar'): CaptainState {
    const acciones: CaptainAction[] = [];
    for (let i = 0; i < TIME_TOKENS_PER_SEASON; i += 1) acciones.push({ type: 'SPEND_TIME', slot });
    acciones.push({ type: 'CONFIRM_TIME' });
    return apply(state, acciones);
}

/** Zonas del tackle, para que una carrera de prueba las recorra todas. */
const ZONAS: TackleZone[] = ['legal', 'piernas', 'alto', 'legal', 'tarde'];

/**
 * Manos del jackal, en milisegundos desde el destello.
 *
 * Las tres filas cubren las tres salidas del minijuego —robar, irse antes
 * (offside) y llegar tarde— porque una carrera de prueba que siempre acierte no
 * recorre el carril de la sanción.
 */
const REACCIONES: (number | null)[][] = [
    [170, 190, 200],
    [-80, 230, 900],
    [null, null, null],
];

/**
 * Resuelve los Momentos que aparezcan.
 *
 * Un tackle alto encadena el bunker, así que hay que insistir hasta salir de la
 * fase: el bucle de una sola vuelta dejaba la carrera trabada, que es
 * exactamente lo que pasó la primera vez que corrí esto.
 *
 * La mano tiene que ser DEL KIND que está pendiente: desde que hay Momentos por
 * puesto, mandarle un tackle a un jackal es una acción inválida y el reducer
 * devuelve el estado sin tocar — con lo cual el bucle giraría sin avanzar.
 */
function pasarMomentos(state: CaptainState, vuelta: number): CaptainState {
    let next = state;
    let guarda = 0;
    while (next.phase === 'moment' && guarda < 4) {
        next = captainReducer(next, { type: 'RESOLVE_MOMENT', outcome: manoRotativa(next, vuelta) });
        guarda += 1;
    }
    return next;
}

/**
 * Una mano distinta por vuelta, para que una carrera de prueba recorra todos los
 * desenlaces de cada Momento en vez de repetir el cómodo.
 */
function manoRotativa(state: CaptainState, vuelta: number): MomentOutcome {
    const pendiente = state.pendingMoment!;
    switch (pendiente.kind) {
        case 'bunker':
            return { kind: 'bunker' };
        case 'jackal':
            return { kind: 'jackal', reactions: REACCIONES[vuelta % REACCIONES.length] };
        case 'ancla':
            // De soltar enseguida a insistir hasta que se caiga.
            return { kind: 'ancla', pushes: vuelta % ((pendiente.setup as AnclaSetup).maxPushes + 1) };
        case 'codigo': {
            // La repite bien, o con un gesto cambiado, según la vuelta.
            const call = [...(pendiente.setup as CodigoSetup).call];
            if (vuelta % 3 !== 0) call[vuelta % call.length] = (call[vuelta % call.length] + 1) % 4;
            return { kind: 'codigo', call };
        }
        case 'palos':
            return { kind: 'palos', aim: PUNTERIAS[vuelta % PUNTERIAS.length] };
        default:
            return { kind: 'tackle', zone: ZONAS[vuelta % ZONAS.length], at: 0.5 };
    }
}

/** Punterías de Los Palos: al medio, muy afuera, y a los dos lados. */
const PUNTERIAS = [0, 0.85, -0.4, 0.35, -0.9];

/**
 * Una temporada completa: repartir, jugar la jugada si la hay, simular y —si
 * vino una decisión— elegir.
 *
 * `chooser` decide qué opción se toma. La primera nunca alcanza: hay eventos
 * donde la primera opción es siempre quedarse, y una carrera que siempre se
 * queda no prueba el mercado.
 */
function unaTemporada(
    state: CaptainState,
    chooser: (opciones: string[], seed: number) => string,
): CaptainState {
    const listo = pasarMomentos(repartir(state), state.history.length);
    let next = captainReducer(listo, { type: 'ADVANCE' });
    if (next.phase === 'event') {
        const event = getPendingEvent(next);
        assert.ok(event, 'la fase dice evento pero no hay tarjeta que dibujar');
        const elegida = chooser(event.options.map((o) => o.id), next.history.length);
        next = captainReducer(next, { type: 'CHOOSE', optionId: elegida });
    }
    return next;
}

/** Rota entre las opciones para que la carrera no sea siempre la misma decisión. */
const rotativo = (opciones: string[], seed: number): string => opciones[seed % opciones.length];

/** Una carrera entera, de punta a punta. */
function carreraCompleta(seed: number, input: CreateCaptainInput = INPUT): CaptainState {
    let state = createInitialCaptain(input, seed);
    let vueltas = 0;
    while (state.phase !== 'retired' && vueltas < 60) {
        state = unaTemporada(state, rotativo);
        vueltas += 1;
    }
    return state;
}

// ═══════════════════════════════════════════════════════════════════════════
//  Determinismo
// ═══════════════════════════════════════════════════════════════════════════

test('la misma semilla da el mismo jugador', () => {
    assert.deepEqual(createInitialCaptain(INPUT, 12345), createInitialCaptain(INPUT, 12345));
});

test('semillas distintas dan jugadores distintos', () => {
    const a = createInitialCaptain(INPUT, 1);
    const b = createInitialCaptain(INPUT, 999);
    assert.notDeepEqual(a.player.attrs, b.player.attrs);
});

test('la misma semilla y las mismas decisiones dan la misma carrera', () => {
    assert.deepEqual(carreraCompleta(777), carreraCompleta(777));
});

test('el dorsal se sortea aunque lo elija el jugador, y el stream no cambia', () => {
    // Es la disciplina del §1: el tiro se hace SIEMPRE, y recién después se
    // pisa con el elegido. Si solo se tirara cuando falta el dato, dos partidas
    // con la misma semilla divergirían según por dónde entró la llamada.
    const sorteado = createInitialCaptain({ ...INPUT, family: 'primera-linea' }, 42);
    const elegido = createInitialCaptain({ ...INPUT, family: 'primera-linea', number: 3 }, 42);

    assert.equal(elegido.player.number, 3);
    assert.equal(sorteado.rngState, elegido.rngState, 'elegir el dorsal no puede mover el stream');
    assert.deepEqual(sorteado.player.attrs, elegido.player.attrs);
    assert.equal(sorteado.player.clubId, elegido.player.clubId);
});

test('un dorsal que no es de la familia se ignora y queda el sorteado', () => {
    const state = createInitialCaptain({ ...INPUT, family: 'apertura', number: 7 }, 42);
    assert.equal(state.player.number, 10, 'el apertura lleva la 10 y nada más');
});

// ═══════════════════════════════════════════════════════════════════════════
//  El estado es JSON puro
// ═══════════════════════════════════════════════════════════════════════════

test('el estado sobrevive a un viaje por JSON sin perder nada', () => {
    // Atrapa Date, Map, Set, funciones y undefined: todo eso se cae o se
    // transforma al serializar, y el guardado en localStorage hace exactamente
    // este viaje en cada partida.
    const state = carreraCompleta(2024);
    assert.deepEqual(JSON.parse(JSON.stringify(state)), state);
});

test('serializar a mitad de carrera y seguir da lo mismo que no serializar', () => {
    // Es la prueba de la recarga: F5 a mitad de carrera tiene que retomar
    // idéntico (CLAUDE.md §8.3).
    let directa = createInitialCaptain(INPUT, 555);
    let conViaje = createInitialCaptain(INPUT, 555);

    for (let i = 0; i < 5; i += 1) {
        directa = unaTemporada(directa, rotativo);
        conViaje = unaTemporada(conViaje, rotativo);
        conViaje = JSON.parse(JSON.stringify(conViaje)) as CaptainState;
        if (directa.phase === 'retired') break;
    }

    assert.deepEqual(conViaje, directa);
});

// ═══════════════════════════════════════════════════════════════════════════
//  El estado inicial arranca donde tiene que arrancar
// ═══════════════════════════════════════════════════════════════════════════

test('la carrera empieza en un club de tu país, sin plata y sin golpes', () => {
    const state = createInitialCaptain(INPUT, 8);

    assert.equal(state.season, 1);
    assert.equal(state.stage, 'amateur');
    assert.equal(state.phase, 'offseason');
    assert.equal(state.signedProSeason, null);

    assert.equal(state.money, 0, 'el rugby de club no paga');
    assert.equal(state.fame, 0);
    assert.equal(state.damage.cabeza, 0);
    assert.equal(state.damage.hia, 0);
    assert.deepEqual(state.belonging.byClub, {});

    assert.equal(state.time.total, TIME_TOKENS_PER_SEASON);
    assert.equal(state.matches.cap, MATCH_CAP_PER_SEASON);

    assert.equal(state.player.age, 18);
    assert.equal(state.player.retired, false);
    assert.ok(state.player.potential > state.player.ovr, 'un pibe de 18 tiene por dónde crecer');

    // El club de origen es donde te hiciste, y arranca siendo el actual.
    assert.ok(state.player.clubId, 'un pibe argentino tiene club: el catálogo está lleno');
    assert.equal(state.homeClubId, state.player.clubId);

    // Y el otro tipo que juega en tu puesto ya existe.
    assert.ok(state.rival, 'la carrera arranca con archirrival');
    assert.ok(state.rival!.ovr > state.player.ovr, 'el rival arranca arriba: si no, no hay pelea');
});

test('las ocho familias arrancan una carrera válida', () => {
    for (const family of ALL_FAMILIES) {
        const state = createInitialCaptain({ ...INPUT, family }, 100);
        assert.ok(
            getFamily(family).numbers.includes(state.player.number),
            `${family} arrancó con un dorsal que no es suyo`,
        );
        assert.ok(state.player.ovr > 0 && state.player.ovr <= 99, `${family} arrancó con una media rara`);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
//  ⏳ Repartir el Tiempo no consume azar
// ═══════════════════════════════════════════════════════════════════════════

test('poner y sacar fichas no toca el rng', () => {
    // Si lo tocara, la carrera dependería de cuántas veces dudaste antes de
    // confirmar el reparto. Es la regla que más fácil se rompe sin querer.
    const base = createInitialCaptain(INPUT, 61);
    const manoseado = apply(base, [
        { type: 'SPEND_TIME', slot: 'entrenar' },
        { type: 'SPEND_TIME', slot: 'club' },
        { type: 'UNSPEND_TIME', slot: 'entrenar' },
        { type: 'SPEND_TIME', slot: 'familia' },
        { type: 'UNSPEND_TIME', slot: 'club' },
        { type: 'UNSPEND_TIME', slot: 'familia' },
    ]);

    assert.equal(manoseado.rngState, base.rngState);
    assert.deepEqual(manoseado.time, base.time, 'volver atrás todo tiene que dejar el reparto como estaba');
});

test('el reparto no se cierra hasta que estén las seis puestas', () => {
    let state = createInitialCaptain(INPUT, 4);
    state = captainReducer(state, { type: 'SPEND_TIME', slot: 'trabajar' });

    const temprano = captainReducer(state, { type: 'CONFIRM_TIME' });
    assert.equal(temprano.phase, 'offseason', 'con una sola ficha puesta no se juega la temporada');
    assert.equal(temprano, state, 'una acción que no aplica devuelve el mismo estado');

    // Cerrar el reparto deja la temporada lista para jugarse: o va derecho a
    // simular, o frena antes en la jugada decisiva.
    assert.ok(['season', 'moment'].includes(repartir(state, 'trabajar').phase));
});

test('sin cerrar el reparto no se juega la temporada', () => {
    const state = createInitialCaptain(INPUT, 4);
    assert.equal(captainReducer(state, { type: 'ADVANCE' }), state);
});

test('el reparto queda escrito en la trayectoria', () => {
    const listo = pasarMomentos(repartir(createInitialCaptain(INPUT, 31), 'club'), 0);
    const jugada = captainReducer(listo, { type: 'ADVANCE' });
    assert.equal(jugada.history.length, 1);
    assert.equal(jugada.history[0].time.club, TIME_TOKENS_PER_SEASON);
});

// ═══════════════════════════════════════════════════════════════════════════
//  El ciclo: se juega, después se decide
// ═══════════════════════════════════════════════════════════════════════════

test('la temporada se juega y recién después llega la decisión', () => {
    const jugada = captainReducer(pasarMomentos(repartir(createInitialCaptain(INPUT, 31)), 0), { type: 'ADVANCE' });

    // La fila de la temporada ya está escrita, se haya abierto una decisión o no.
    assert.equal(jugada.history.length, 1);
    assert.equal(jugada.history[0].season, 1);
    assert.equal(jugada.history[0].age, 18);

    if (jugada.phase === 'event') {
        assert.ok(getPendingEvent(jugada), 'fase de evento sin tarjeta');
        assert.equal(jugada.season, 1, 'la temporada no avanza hasta que se decide');
    } else {
        assert.equal(jugada.phase, 'offseason');
        assert.equal(jugada.season, 2);
    }
});

test('elegir cierra la temporada y abre la siguiente', () => {
    let state = pasarMomentos(repartir(createInitialCaptain(INPUT, 31)), 0);
    state = captainReducer(state, { type: 'ADVANCE' });
    if (state.phase !== 'event') return; // esa semilla no trajo decisión

    const event = getPendingEvent(state)!;
    const despues = captainReducer(state, { type: 'CHOOSE', optionId: event.options[0].id });

    assert.equal(despues.phase, 'offseason');
    assert.equal(despues.season, 2);
    assert.equal(despues.player.age, 19);
    assert.equal(despues.pendingEventId, null);
    assert.equal(despues.decisionLog.length, 1);
    assert.ok(despues.history[0].decisionText, 'el desenlace queda pegado a la temporada');
    // Y el presupuesto vuelve a estar entero.
    for (const slot of TIME_SLOTS) assert.equal(despues.time.spent[slot], 0);
});

test('una opción que no existe no rompe nada', () => {
    let state = pasarMomentos(repartir(createInitialCaptain(INPUT, 31)), 0);
    state = captainReducer(state, { type: 'ADVANCE' });
    if (state.phase !== 'event') return;
    assert.equal(captainReducer(state, { type: 'CHOOSE', optionId: 'no-existe' }), state);
});

// ═══════════════════════════════════════════════════════════════════════════
//  Las dos escaleras
// ═══════════════════════════════════════════════════════════════════════════

test('el techo del potencial no se pasa en ninguna temporada', () => {
    // Invariante medido: ni el crecimiento ni una decisión pueden dejar la
    // media por encima del potencial.
    for (const seed of [3, 91, 404, 1210]) {
        let state = createInitialCaptain(INPUT, seed);
        while (state.phase !== 'retired') {
            state = unaTemporada(state, rotativo);
            assert.ok(
                state.player.ovr <= state.player.potential,
                `semilla ${seed}: media ${state.player.ovr} por encima del potencial ${state.player.potential}`,
            );
        }
    }
});

test('los caps solo salen de la mayor', () => {
    for (const seed of [12, 88, 500]) {
        const final = carreraCompleta(seed);
        const capsSumados = final.history.reduce((acc, h) => acc + h.caps, 0);
        assert.equal(capsSumados, final.national.caps, `semilla ${seed}: la cuenta de caps no cierra`);
        for (const fila of final.history) {
            if (fila.caps > 0) {
                assert.equal(fila.track, 'La mayor', 'una temporada con caps que no es de la mayor');
            }
        }
    }
});

test('el mejor escalón alcanzado no baja nunca', () => {
    // Te pueden dejar afuera de la mayor a los 33 —y te dejan— pero haber
    // llegado no se pierde. La cabecera muestra el techo, no la foto de hoy.
    for (const seed of [313, 44, 1999]) {
        let state = createInitialCaptain(INPUT, seed);
        let mejor = trackIndex(state.national.bestTrack);
        while (state.phase !== 'retired') {
            state = unaTemporada(state, rotativo);
            const actual = trackIndex(state.national.bestTrack);
            assert.ok(actual >= mejor, `semilla ${seed}: el mejor escalón retrocedió`);
            assert.ok(
                actual >= trackIndex(state.national.track),
                'el escalón de hoy no puede estar por encima del mejor alcanzado',
            );
            mejor = actual;
        }
    }
});

test('la cabeza nunca baja a lo largo de una carrera entera', () => {
    let state = createInitialCaptain(INPUT, 606);
    let cabeza = 0;
    while (state.phase !== 'retired') {
        state = unaTemporada(state, rotativo);
        assert.ok(state.damage.cabeza >= cabeza, 'la cuenta de conmociones bajó, y eso no puede pasar');
        cabeza = state.damage.cabeza;
    }
});

test('en amateur la plata no se mueve', () => {
    let state = createInitialCaptain(INPUT, 71);
    while (state.phase !== 'retired' && state.stage === 'amateur') {
        state = unaTemporada(state, rotativo);
        if (state.stage === 'amateur') {
            assert.equal(state.money, 0, 'el rugby de club no paga, y el motor no puede olvidarlo');
        }
    }
});

// ═══════════════════════════════════════════════════════════════════════════
//  El final
// ═══════════════════════════════════════════════════════════════════════════

test('toda carrera termina dentro de la curva del puesto', () => {
    for (const family of ALL_FAMILIES) {
        const curva = getFamily(family).age;
        const final = carreraCompleta(2027, { ...INPUT, family });

        assert.equal(final.phase, 'retired', `${family} no se retiró nunca`);
        assert.equal(final.player.retired, true);
        // El cuerpo puede adelantar el tope blando hasta tres años; el duro no
        // se pasa nunca.
        assert.ok(
            final.player.age > curva.soft - 4 && final.player.age <= curva.hard,
            `${family} se retiró a los ${final.player.age}, fuera de su curva (${curva.soft}–${curva.hard})`,
        );
        assert.ok(final.history.length >= 5, `${family} se retiró con ${final.history.length} temporadas`);
    }
});

test('el wing se retira antes que el pilar', () => {
    // No es una curiosidad: es la diferencia de puesto que hace que elegir
    // dónde jugar sea la decisión más determinante del juego.
    //
    // Se mide sobre una MUESTRA y no sobre una semilla. Con una sola, el test
    // pasaba por casualidad: el desgaste del cuerpo puede adelantar el retiro
    // hasta tres años, así que un pilar roto se va antes que un wing entero sin
    // que eso rompa nada. Lo que no puede pasar es que en promedio se inviertan.
    const semillas = [90, 314, 777, 2048, 55];
    const edad = (family: 'wing-fullback' | 'primera-linea') =>
        semillas.reduce((acc, s) => acc + carreraCompleta(s, { ...INPUT, family }).player.age, 0) / semillas.length;

    const wing = edad('wing-fullback');
    const pilar = edad('primera-linea');
    assert.ok(
        wing < pilar - 1,
        `el wing tendría que irse bastante antes: wing ${wing.toFixed(1)}, pilar ${pilar.toFixed(1)}`,
    );
});

test('retirado no se mueve más', () => {
    const final = carreraCompleta(11);
    assert.equal(captainReducer(final, { type: 'ADVANCE' }), final);
    assert.equal(captainReducer(final, { type: 'SPEND_TIME', slot: 'club' }), final);
});

test('empezar de nuevo se puede incluso desde una carrera terminada', () => {
    const final = carreraCompleta(11);
    const nueva = captainReducer(final, { type: 'START', input: INPUT, seed: 5 });
    assert.deepEqual(nueva, createInitialCaptain(INPUT, 5));
});
