// EL CAPITÁN — la red de seguridad del motor.
//
// Hay dos garantías distintas acá y conviene no mezclarlas, porque se leen al
// revés cuando fallan:
//
//   1. AUTOCONSISTENCIA — misma semilla + mismos inputs ⇒ mismo estado. NO se
//      rompe cuando el motor cambia a propósito. Si esto falla, se coló una
//      fuente de entropía y hay que arreglar el motor, no el test.
//   2. DIGEST CONGELADO — una foto del comportamiento de HOY. SÍ se rompe
//      cuando el motor cambia. Cuando el cambio es intencional se actualiza
//      EXPECTED y se sube CAPTAIN_ENGINE_VERSION, en un commit aparte del que
//      trae la feature; cuando no lo es, acabás de encontrar una regresión.
//
// El archivo se escribió ANTES de los Momentos por puesto, a propósito: es la
// línea de base contra la cual se va a leer qué movieron.
//
// ── Por qué la receta se declara acá y no se importa ──
// El chooser, la posición donde frena la barra del tackle y el reparto de las
// seis fichas SON PARTE DE LO CONGELADO: son los inputs del jugador simulado. Si
// se importaran de `reducer.test.ts`, tocar un helper de aquel archivo movería
// esta tabla sin que nadie hubiera tocado el motor, y el digest dejaría de
// significar lo que dice que significa.

import test from 'node:test';
import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';

import type {
    AnclaSetup,
    CaptainState,
    CodigoSetup,
    CreateCaptainInput,
    TackleZone,
} from '../../index.ts';
import {
    CAPTAIN_ENGINE_VERSION,
    TIME_TOKENS_PER_SEASON,
    belongingOf,
    captainReducer,
    createInitialCaptain,
    getPendingEvent,
    hashSeed,
    tackleZones,
    zoneAt,
} from '../../index.ts';

// ═══════════════════════════════════════════════════════════════════════════
//  LA RECETA — los inputs del jugador simulado, congelados
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Dónde van las seis fichas.
 *
 * NO todas al mismo slot. Seis en `entrenar` produce una carrera que nunca
 * trabaja, y §10 de `simulate-season` castiga eso con una tirada de rng propia:
 * el digest quedaría dominado por ese castigo en vez de por el motor. Este
 * reparto toca cinco de los cinco slots y rota con la temporada, así que las
 * carreras congeladas pasan por todos los carriles.
 */
function reparto(season: number): string[] {
    const orden = ['entrenar', 'club', 'trabajar', 'gimnasio', 'familia'];
    const fichas: string[] = [];
    for (let i = 0; i < TIME_TOKENS_PER_SEASON; i += 1) {
        fichas.push(orden[(season + i) % orden.length]);
    }
    return fichas;
}

/**
 * Qué opción elige.
 *
 * Se indexa por `event.id` y no por posición en el pool: así reordenar el
 * catálogo de eventos no mueve el digest, pero cambiar las opciones de un evento
 * sí. Es la distinción que se quiere.
 */
function elegir(optionIds: string[], eventId: string, season: number): string {
    return optionIds[hashSeed(`${eventId}:${season}`) % optionIds.length];
}

/**
 * Dónde frena la barra del tackle, de 0 a 1.
 *
 * Es la MISMA entrada que produce la pantalla: una posición, no una zona. La
 * zona se deriva con `zoneAt` sobre los márgenes reales del jugador, igual que
 * en `TackleMoment.tsx`. Por eso el digest también cubre `tackleZones`: si
 * alguien ensancha la zona legal, estas carreras cambian y el test lo dice.
 */
function frenaEn(season: number, intento: number): number {
    return (hashSeed(`tackle:${season}:${intento}`) % 10_000) / 10_000;
}

/**
 * Cuánto tarda en tocar en cada ronda del jackal, en ms desde el destello.
 *
 * Igual que `frenaEn`: es la MISMA entrada que produce la pantalla —un tiempo de
 * reacción, no un veredicto— y el motor la clasifica contra las ventanas del
 * Setup. El rango va de −200 a 800 para que la receta pase por las tres salidas
 * (offside, robo y llegar tarde) y no solo por la cómoda.
 *
 * Ninguno de los tres casos congelados es tercera línea, así que HOY esto no
 * mueve un solo valor de la tabla. Está igual, y no es ceremonia: sin esta
 * rama, el día que alguien agregue un caso de tercera línea al digest la receta
 * quedaría trabada en la fase de Momento y el diagnóstico sería incomprensible.
 */
function reaccionaEn(season: number, ronda: number): number {
    return (hashSeed(`jackal:${season}:${ronda}`) % 1_000) - 200;
}

/**
 * Cuántas veces insiste en el scrum, de 0 a `maxPushes`.
 *
 * El Ancla no tiene "mano perfecta" —el punto de quiebre está oculto— así que la
 * receta apuesta distinto cada temporada y pasa por las cuatro decisiones.
 */
function insisteEn(season: number, maxPushes: number): number {
    return hashSeed(`ancla:${season}`) % (maxPushes + 1);
}

/**
 * Cómo repite la seña del line-out.
 *
 * Copia la seña real y le corrompe UN gesto, elegido por la temporada. Cuando el
 * índice cae fuera de la seña, la repite entera bien. Así la receta pasa por los
 * tres desenlaces —limpio, sucio y perdido— en vez de fallar siempre, que es lo
 * que daría una seña sorteada al azar (una entre 256 de acertar).
 */
function repiteLaSena(call: readonly number[], season: number): number[] {
    const repetida = [...call];
    const donde = hashSeed(`codigo:${season}`) % (call.length + 2);
    if (donde < call.length) repetida[donde] = (repetida[donde] + 1) % 4;
    return repetida;
}

/**
 * Dónde apunta en Los Palos, de −1 a 1.
 *
 * NO usa `palosPerfectAim`: la receta tiene que poder errarle. Un pateador que
 * compensa el viento exacto todas las veces congelaría una carrera que nadie
 * juega.
 */
function apuntaEn(season: number): number {
    return ((hashSeed(`palos:${season}`) % 2_000) - 1_000) / 1_000;
}

// ═══════════════════════════════════════════════════════════════════════════
//  Correr una carrera entera con la receta
// ═══════════════════════════════════════════════════════════════════════════

/** Reparte las seis fichas de la temporada y cierra el reparto. */
function repartir(state: CaptainState): CaptainState {
    let next = state;
    for (const slot of reparto(next.season)) {
        next = captainReducer(next, { type: 'SPEND_TIME', slot: slot as never });
    }
    return captainReducer(next, { type: 'CONFIRM_TIME' });
}

/**
 * Juega los Momentos hasta salir de la fase.
 *
 * Un tackle alto encadena el bunker, así que una sola vuelta no alcanza: deja la
 * carrera trabada en `moment` y el bucle de afuera gira sin avanzar.
 */
function jugarMomentos(state: CaptainState): CaptainState {
    let next = state;
    let intento = 0;
    while (next.phase === 'moment' && next.pendingMoment && intento < 4) {
        const pendiente = next.pendingMoment;
        if (pendiente.kind === 'bunker') {
            next = captainReducer(next, { type: 'RESOLVE_MOMENT', outcome: { kind: 'bunker' } });
        } else if (pendiente.kind === 'jackal') {
            const reactions = [0, 1, 2].map((ronda) => reaccionaEn(next.season, ronda));
            next = captainReducer(next, { type: 'RESOLVE_MOMENT', outcome: { kind: 'jackal', reactions } });
        } else if (pendiente.kind === 'ancla') {
            const setup = pendiente.setup as AnclaSetup;
            next = captainReducer(next, {
                type: 'RESOLVE_MOMENT',
                outcome: { kind: 'ancla', pushes: insisteEn(next.season, setup.maxPushes) },
            });
        } else if (pendiente.kind === 'codigo') {
            const setup = pendiente.setup as CodigoSetup;
            next = captainReducer(next, {
                type: 'RESOLVE_MOMENT',
                outcome: { kind: 'codigo', call: repiteLaSena(setup.call, next.season) },
            });
        } else if (pendiente.kind === 'palos') {
            next = captainReducer(next, {
                type: 'RESOLVE_MOMENT',
                outcome: { kind: 'palos', aim: apuntaEn(next.season) },
            });
        } else {
            const at = frenaEn(next.season, intento);
            const zone: TackleZone = zoneAt(
                at,
                tackleZones(next.player, next.damage.cuerpo, pendiente.pressure),
            );
            next = captainReducer(next, { type: 'RESOLVE_MOMENT', outcome: { kind: 'tackle', zone, at } });
        }
        intento += 1;
    }
    return next;
}

/** Una temporada: repartir, jugar la jugada si la hay, simular, y decidir. */
function unaTemporada(state: CaptainState): CaptainState {
    let next = captainReducer(jugarMomentos(repartir(state)), { type: 'ADVANCE' });
    if (next.phase === 'event') {
        const event = getPendingEvent(next);
        assert.ok(event, 'la fase dice evento pero no hay tarjeta que dibujar');
        const optionId = elegir(event.options.map((o) => o.id), event.id, next.season);
        next = captainReducer(next, { type: 'CHOOSE', optionId });
    }
    return next;
}

function carreraCompleta(input: CreateCaptainInput, seed: number): CaptainState {
    let state = createInitialCaptain(input, seed);
    let guarda = 0;
    while (state.phase !== 'retired' && guarda < 60) {
        state = unaTemporada(state);
        guarda += 1;
    }
    return state;
}

// ═══════════════════════════════════════════════════════════════════════════
//  Los tres casos
// ═══════════════════════════════════════════════════════════════════════════

interface Case {
    name: string;
    input: CreateCaptainInput;
    seed: number;
}

/**
 * Tres perfiles con curvas de edad incompatibles a propósito.
 *
 *   · primera línea — el puesto más longevo (hard 36) y el que más tarda en
 *     hacerse. Gloria que NO son tries: penales de scrum.
 *   · wing/fullback — el reverso exacto (hard 32, declive abrupto). Es el que
 *     detecta si alguien toca la curva de declive.
 *   · apertura — el pateador, y el único con `liderazgo` pesando 25. Es el caso
 *     que va a cubrir Los Palos cuando entren los Momentos por puesto.
 *
 * ── Las semillas NO son arbitrarias: se eligieron por COBERTURA ──
 * Las tres primeras que probé cerraban las tres con 0 caps, así que el digest no
 * cubría la escalera representativa —media mitad del juego, y justo donde los
 * Momentos por puesto van a pegar—. Un barrido de 30 semillas por perfil (90
 * carreras) encontró que con esta receta llegar a la mayor es RARO: 2/30 en
 * pilar, 1/30 en wing y 1/30 en apertura, y la única que lo logra en los tres es
 * la 99.
 *
 * Por eso el reparto es deliberado:
 *   · pilar 20260731  — la escalera de CLUB (pertenencia ~51, tres títulos)
 *   · wing 424242     — la carrera corta y el declive abrupto (13 temporadas)
 *   · apertura 99     — la escalera REPRESENTATIVA (llega a `nacional`)
 *
 * Ese 4% de carreras que llegan a la selección es un dato de calibración que
 * conviene mirar aparte —parece bajo— pero NO es lo que este archivo arregla:
 * acá solo se congela lo que el motor hace hoy. Si alguna vez se toca la
 * convocatoria, este digest es exactamente lo que va a avisar.
 */
const CASES: Case[] = [
    {
        name: 'pilar argentino',
        input: { name: 'Bautista', surname: 'Uriarte', family: 'primera-linea', countryCode: 'ar' },
        seed: 20260731,
    },
    {
        name: 'wing argentino',
        input: { name: 'Ramiro', surname: 'Alcorta', family: 'wing-fullback', countryCode: 'ar' },
        seed: 424242,
    },
    {
        name: 'apertura argentino',
        input: { name: 'Ignacio', surname: 'Bengochea', family: 'apertura', countryCode: 'ar' },
        seed: 99,
    },
];

/**
 * Lo que se congela.
 *
 * La VERSIÓN VA ADENTRO del digest y no en un comentario arriba de la tabla. En
 * Carrera de Rugby se tipeó mal dos veces seguidas —encabezado 1.14.0 con
 * valores de 1.17.0— porque era un dato a mano que había que acordarse de
 * actualizar. Acá la produce el propio digest: refrescar EXPECTED es copiar lo
 * que el test imprime, y lo que imprime ya trae la versión correcta.
 */
interface Digest {
    engineVersion: string;
    seasons: number;
    retirementAge: number;
    lastClub: string | null;
    belonging: number;
    fame: number;
    caps: number;
    titles: number;
    moments: number;
    /** Cubre TODO el estado, no solo los campos que se nos ocurrió listar. */
    stateHash: number;
}

function digest(state: CaptainState): Digest {
    return {
        engineVersion: CAPTAIN_ENGINE_VERSION,
        seasons: state.history.length,
        retirementAge: state.player.age,
        lastClub: state.player.clubId,
        belonging: belongingOf(state.belonging, state.player.clubId),
        fame: state.fame,
        caps: state.national.caps,
        titles: state.titles.length,
        moments: state.moments.length,
        stateHash: hashSeed(JSON.stringify(state)),
    };
}

// ── La tabla ─────────────────────────────────────────────────────────────────
//
// MOTOR 0.4.0. La segunda foto, y la primera vez que se puede leer un
// movimiento en vez de tener que confiar.
//
// ── Qué se movió al entrar los Momentos por puesto: SOLO LA VERSIÓN ──
// De los diez campos del digest, ocho quedaron IDÉNTICOS en los tres casos:
// temporadas, edad de retiro, último club, Pertenencia, Cartel, caps, títulos y
// Momentos jugados. Se movieron `engineVersion` —de 0.3.0 a 0.4.0— y con él el
// `stateHash`, que cubre el estado entero y adentro lleva `state.version`.
//
// Y no es una inferencia: se corrió la tabla con la versión pineada de vuelta en
// 0.3.0 y los tres casos dieron BYTE-IDÉNTICOS a la línea de base anterior. O
// sea que el motor no cambió de comportamiento en una sola carrera; lo único que
// cambió es la cadena de la versión.
//
// Que se pueda afirmar eso es el punto entero de las semillas derivadas. El kind
// del Momento sale de `hash(semilla:temporada:momentPick)` y los márgenes de
// `hash(semilla:kind:temporada:idx)`, así que `rollMoment` sigue consumiendo
// `chance` + `int` + `int` del stream principal igual que antes. Si la elección
// hubiera salido del stream de la carrera, los diez campos se habrían movido en
// los tres casos y este comentario tendría que decir "confiá".
//
// Ninguno de los tres perfiles es tercera línea, que es la única familia a la
// que hoy le toca El Jackal. El día que se agregue un caso de tercera línea, ESE
// caso se va a mover solo y los otros dos van a quedar quietos — que es
// exactamente la propiedad que hace revisable este archivo.
//
// Cuando esto se mueva, lo que hay que mirar NO es el `stateHash` —se mueve
// siempre, porque cubre el estado entero— sino qué OTROS campos se movieron y en
// cuántos de los tres casos. Un solo caso movido es una regresión localizada;
// los tres, un cambio de stream del rng.
// Tres cosas de esta tabla que son hallazgos y no ruido, y que conviene tener a
// mano cuando se mueva:
//
//   · el pilar cierra con Pertenencia 50,94 y los otros dos con 0. No es un bug:
//     `belongingOf` mide el vínculo con el CLUB ACTUAL, y los otros dos se
//     mudaron cerca del final. El pilar es el único que se queda, que es
//     exactamente lo que la curva del puesto más longevo debería producir.
//   · el apertura es el único que sale del país (Clermont) y el único con caps.
//     Las dos cosas van juntas y esa es la regla: el cartel abre el mercado.
//     Cierra con fama 63,9 contra 7,9 y 8,1 de los otros dos.
//   · los tres suman 3 títulos. Con doce, nueve y ocho Momentos jugados
//     respectivamente — el `moments` del digest es lo que va a moverse primero
//     cuando entren los Momentos por puesto, y por eso está en la tabla.
const EXPECTED: Record<string, Digest> = {
    'pilar argentino': {
        engineVersion: '0.4.0',
        seasons: 17,
        retirementAge: 35,
        lastClub: 'sb-club-newman',
        belonging: 50.94,
        fame: 7.9,
        caps: 0,
        titles: 3,
        moments: 12,
        stateHash: 2447863682, // 0.3.0 era 3990923497 — se movió solo por la versión
    },
    'wing argentino': {
        engineVersion: '0.4.0',
        seasons: 13,
        retirementAge: 31,
        lastClub: 'ar-jockey-club-villa-maria',
        belonging: 0,
        fame: 8.1,
        caps: 0,
        titles: 3,
        moments: 9,
        stateHash: 3720333449, // 0.3.0 era 301923702
    },
    'apertura argentino': {
        engineVersion: '0.4.0',
        seasons: 15,
        retirementAge: 33,
        lastClub: 'asm-clermont',
        belonging: 0,
        fame: 63.9,
        caps: 14,
        titles: 3,
        moments: 8,
        stateHash: 2468468574, // 0.3.0 era 612484219
    },
};

// ═══════════════════════════════════════════════════════════════════════════
//  1 · AUTOCONSISTENCIA — estos tests NO se actualizan NUNCA
// ═══════════════════════════════════════════════════════════════════════════

test('misma semilla + mismos inputs ⇒ mismo digest', () => {
    for (const { name, input, seed } of CASES) {
        const a = digest(carreraCompleta(input, seed));
        const b = digest(carreraCompleta(input, seed));
        assert.deepEqual(b, a, `${name}: el digest cambió entre dos corridas de la misma semilla`);
    }
});

test('la semilla importa: semillas distintas dan carreras distintas', () => {
    const { input, seed } = CASES[0];
    const a = carreraCompleta(input, seed);
    const b = carreraCompleta(input, seed + 1);
    assert.notEqual(
        hashSeed(JSON.stringify(b)),
        hashSeed(JSON.stringify(a)),
        'dos semillas distintas produjeron exactamente la misma carrera',
    );
});

// ═══════════════════════════════════════════════════════════════════════════
//  2 · DIGEST CONGELADO — este SÍ se actualiza en cada cambio intencional
// ═══════════════════════════════════════════════════════════════════════════

// Los tres casos se comparan ANTES de fallar, y el fallo los lista a todos. Con
// un `assert` adentro del bucle, el primer caso que no coincide corta la corrida
// y los siguientes no se evalúan nunca — y eso cambia el diagnóstico, que es
// justo lo que este test tiene que dar de entrada.
test('digest congelado: el comportamiento del motor no cambió sin querer', () => {
    const movidos = CASES
        .map(({ name, input, seed }) => ({ name, actual: digest(carreraCompleta(input, seed)) }))
        .filter(({ name, actual }) => !isDeepStrictEqual(actual, EXPECTED[name]));

    assert.deepEqual(
        movidos.map((m) => m.name),
        [],
        `cambió el comportamiento del motor en ${movidos.length} de ${CASES.length} casos: `
        + `${movidos.map((m) => m.name).join(', ')}.\n`
        + 'Si el cambio es INTENCIONAL: actualizá EXPECTED con estos valores y subí '
        + 'CAPTAIN_ENGINE_VERSION, en un commit aparte del que trae la feature.\n'
        + movidos
            .map((m) => `\n${m.name}\n  obtenido: ${JSON.stringify(m.actual)}\n  esperado: ${JSON.stringify(EXPECTED[m.name])}`)
            .join(''),
    );
});

test('una carrera completa termina retirada y con historia coherente', () => {
    for (const { name, input, seed } of CASES) {
        const state = carreraCompleta(input, seed);
        assert.equal(state.phase, 'retired', `${name}: no llegó al retiro`);
        assert.ok(state.player.retired, `${name}: el jugador no quedó marcado como retirado`);
        assert.ok(state.history.length > 0, `${name}: carrera sin temporadas`);
        // La trayectoria avanza de a una temporada y un año, sin huecos.
        state.history.forEach((entry, i) => {
            assert.equal(entry.season, i + 1, `${name}: hueco en la trayectoria en la posición ${i}`);
            if (i > 0) {
                assert.equal(entry.age, state.history[i - 1].age + 1, `${name}: salto de edad en la posición ${i}`);
            }
        });
    }
});
