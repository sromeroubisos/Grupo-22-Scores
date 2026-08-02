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
// ── Qué se declara acá y qué se importa: la línea se movió, y por qué ──
// El chooser y el reparto de las seis fichas siguen declarados acá, por lo de
// siempre: si se importaran de `reducer.test.ts`, tocar un helper de aquel
// archivo movería esta tabla sin que nadie hubiera tocado el motor, y el digest
// dejaría de significar lo que dice que significa.
//
// LO QUE SÍ SE IMPORTA AHORA es cómo se JUEGA cada Momento (`def.playAt`), y no
// es una excepción a esa regla sino la misma regla bien aplicada. La cuestión
// nunca fue "acá contra allá" sino QUIÉN ES EL DUEÑO del dato: un helper de otro
// test no es dueño de nada, pero el Momento sí es dueño de su mecánica, viaja
// con la versión del motor y es lo que este archivo está probando.
//
// Y la versión declarada era, además, insostenible: la receta traía una posición
// de input CRUDA por Momento, escrita a mano, y una de ellas —la puntería de Los
// Palos, uniforme en [−1, 1]— resultó ser un pateador que apuntaba al azar. Le
// erró a ocho de nueve patadas y esta tabla lo congeló como si fuera el
// comportamiento del motor. Con el nivel declarado, el que agrega el Momento
// número doce no puede volver a hacerlo: `playAt` es obligatoria y el contrato
// verifica que jugar bien pague.

import test from 'node:test';
import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';

import type {
    CaptainState,
    CreateCaptainInput,
    MomentKind,
    PlayLevel,
} from '../../index.ts';
import {
    CAPTAIN_ENGINE_VERSION,
    NORMALIZED_CATALOG_VERSION,
    PLAY_LEVELS,
    TIME_TOKENS_PER_SEASON,
    belongingOf,
    captainReducer,
    createInitialCaptain,
    getMomentDef,
    getPendingEvent,
    hashSeed,
    isContractKind,
    tacklePlayAt,
    tackleZones,
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
 * Con qué nivel juega el Momento de esta temporada.
 *
 * UNO SOLO PARA TODOS LOS MOMENTOS, y ahí está la gracia: cada def traduce el
 * mismo nivel a lo suyo —apuntar a contraviento, repetir la seña, insistir en el
 * scrum— así que las tres carreras congeladas juegan al mismo nivel medio aunque
 * les toquen mecánicas distintas. Es lo que hace comparable la tabla entre
 * puestos: si el apertura cierra con menos Cartel que el pilar, ahora es porque
 * el motor los trata distinto y no porque a uno le tocó una receta peor escrita.
 *
 * Se cicla por temporada en vez de sortearse para que las carreras pasen por los
 * tres niveles. Y se indexa por (kind, temporada) porque `nextChain` prohíbe que
 * un Momento se encadene a sí mismo: dos del mismo kind en la misma temporada no
 * existen, así que la clave no puede colisionar.
 */
function nivelDe(kind: MomentKind, season: number): PlayLevel {
    return PLAY_LEVELS[hashSeed(`nivel:${kind}:${season}`) % PLAY_LEVELS.length];
}

/** Cómo se mueve adentro del nivel: de qué lado se va, qué gesto se equivoca. */
function variacionDe(kind: MomentKind, season: number): number {
    return (hashSeed(`variacion:${kind}:${season}`) % 1_000) / 1_000;
}

/**
 * El kind pre-contrato que no tiene mano escrita.
 *
 * Recibe `never`: si el tipo todavía contempla un caso sin escribir, esto no
 * compila. Es la medicina contra el `default` que le mandó una mano de tackle a
 * una corrida.
 */
function manoImposible(kind: never): never {
    throw new Error(`El Momento pre-contrato '${String(kind)}' no tiene mano en la receta del digest.`);
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
 *
 * TRES CARRILES Y NO UNO POR MOMENTO. Antes había una rama por kind y esa era la
 * grieta: agregar el Momento doce obligaba a escribir su rama acá, a mano, y una
 * rama escrita de apuro es exactamente lo que congeló a un pateador tirando al
 * azar. Ahora el que va por el contrato se juega solo, y este bucle no vuelve a
 * tocarse nunca más.
 */
/**
 * Los topes de estos bucles TIRAN, no cortan.
 *
 * Un tope que corta convierte el próximo bucle infinito en una carrera corta
 * SILENCIOSA: la tabla se mueve, el diagnóstico dice "cambió el motor" y nadie
 * mira el bucle. Colgarse noventa segundos es malo; mentir en silencio es peor.
 */
function trabada(state: CaptainState, donde: string): never {
    throw new Error(
        `${donde}: la carrera quedó trabada en la fase '${state.phase}' `
        + `(temporada ${state.season}, jugada pendiente: ${state.pendingMoment?.kind ?? 'ninguna'}).`,
    );
}

const MAX_TEMPORADAS = 60;
const MAX_JUGADAS_POR_TEMPORADA = 4;

function jugarMomentos(state: CaptainState): CaptainState {
    let next = state;
    let intento = 0;
    while (next.phase === 'moment' && next.pendingMoment) {
        if (intento >= MAX_JUGADAS_POR_TEMPORADA) trabada(next, 'jugarMomentos');
        const pendiente = next.pendingMoment;
        const nivel = nivelDe(pendiente.kind, next.season);
        const variacion = variacionDe(pendiente.kind, next.season);

        if (isContractKind(pendiente.kind)) {
            // El contrato: la mano la arma el Momento, que es el que sabe.
            const def = getMomentDef(pendiente.kind)!;
            const outcome = def.playAt(pendiente.setup!, nivel, variacion);
            next = captainReducer(next, { type: 'RESOLVE_MOMENT', outcome });
        } else {
            // Pre-contrato. El `default` es `never`: agregar uno sin escribir su
            // mano deja de compilar, en vez de mandarle la mano de otro.
            switch (pendiente.kind) {
                case 'tackle': {
                    const zones = tackleZones(next.player, next.damage.cuerpo, pendiente.pressure);
                    const { at, zone } = tacklePlayAt(zones, nivel, variacion);
                    next = captainReducer(next, { type: 'RESOLVE_MOMENT', outcome: { kind: 'tackle', zone, at } });
                    break;
                }
                case 'bunker':
                    // El bunker no se juega: el veredicto ya estaba decidido.
                    next = captainReducer(next, { type: 'RESOLVE_MOMENT', outcome: { kind: 'bunker' } });
                    break;
                default:
                    manoImposible(pendiente.kind);
            }
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
    while (state.phase !== 'retired') {
        if (guarda >= MAX_TEMPORADAS) trabada(state, `carrera con semilla ${seed}`);
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
 * Cuatro perfiles con curvas de edad incompatibles a propósito.
 *
 *   · primera línea — el puesto más longevo (hard 36) y el que más tarda en
 *     hacerse. Gloria que NO son tries: penales de scrum.
 *   · wing/fullback — el reverso exacto (hard 32, declive abrupto). Es el que
 *     detecta si alguien toca la curva de declive.
 *   · apertura — el pateador, y el único con `liderazgo` pesando 25. Es el caso
 *     que va a cubrir Los Palos cuando entren los Momentos por puesto.
 *   · tercera línea — EL CUARTO, y entró por una razón puntual: es el único que
 *     PISA EL BUNKER. Ver abajo.
 *
 * ── Por qué el cuarto, y por qué esta semilla ──
 * Hasta la 0.5.0 el digest tenía un agujero declarado: ninguna de las tres
 * carreras entraba nunca al bunker, así que `bunkerVerdict` y las dos ramas de
 * `resolveBunker` —la amarilla y la roja de veinte, que son cuatro carriles de
 * estado entre sanción, Cartel y banderas— podían cambiar sin que esta tabla se
 * enterara. La única puerta al bunker es la zona `alto` del tackle.
 *
 * Se buscó una semilla que la pisara, sin tocar las otras tres: los tres casos
 * viejos quedan comparables con todo lo anterior y el bunker gana termómetro
 * propio. La 8 de tercera línea salió mejor que lo pedido — pisa el bunker DOS
 * veces y saca los DOS veredictos, roja de veinte y amarilla — y encima cubre El
 * Jackal, que era la otra familia sin caso propio.
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
    {
        name: 'tercera línea argentino',
        input: { name: 'Ciro', surname: 'Bertranou', family: 'tercera-linea', countryCode: 'ar' },
        seed: 8,
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
// MOTOR 0.6.0. La cuarta foto, y la primera con cuatro casos.
//
// ═══════════════════════════════════════════════════════════════════════════
//  ESTA TABLA SE MIDE CONTRA EL CATÁLOGO COMMITEADO. LEER ANTES DE REFRESCAR.
// ═══════════════════════════════════════════════════════════════════════════
//
// El Capitán no tiene catálogo propio: `data/catalogs.ts` lee los clubes de
// `features/career/data/` —`clubs.ts`, `clubs2026/arSystem2026.ts`,
// `competition-levels2026.ts`—, que es el mismo árbol donde se trabaja Carrera
// de Rugby. Con ediciones SIN COMMITEAR ahí, estas cuatro carreras se mueven
// enteras y el movimiento NO ES DEL MOTOR: el jugador termina en otro club,
// gana otros títulos y se retira en otro año porque el mercado que lo rodea es
// otro.
//
// Pasó de verdad refrescando la 0.6.0: los cuatro casos se movieron, el commit
// iba a decir que los movió La Banda, y La Banda no había tocado a tres de
// ellos. Cómo se separó, y cómo se separa la próxima vez:
//
//   git worktree add --detach /tmp/limpio <commit>
//   cd /tmp/limpio && node --test src/features/captain/engine/__tests__/determinism.test.ts
//
// Un worktree no toca el árbol de trabajo de nadie y trae el catálogo tal como
// está commiteado. Si ahí pasa y en tu carpeta no, no busques el bug en el
// motor: son los datos de abajo, que están a mitad de camino.
//
// ── Qué se movió al entrar La Banda: SOLO EL WING ──
// De los tres casos viejos, el pilar y el apertura quedaron IDÉNTICOS en los
// nueve campos —temporadas, edad, club, Pertenencia, Cartel, caps, títulos,
// Momentos— y solo se les movió el `stateHash`, que adentro lleva la cadena de
// la versión. El wing se movió entero, y es el único que recibió un Momento
// propio.
//
// Es la primera vez que se ve cumplirse la propiedad que este archivo promete
// desde la 0.4.0: un Momento por puesto mueve SU caso y deja los otros quietos.
//
// El mecanismo, medido y no deducido: se corrieron las carreras del pilar y del
// apertura con `banda` adentro y afuera de `SELECTABLE_MOMENTS`, trazando cada
// temporada, y las dos salieron BYTE-IDÉNTICAS. O sea que a estas dos semillas
// ningún cruce les tocó el Momento nuevo. Lo que queda demostrado es lo que hay
// que demostrar —agregar un kind no corre la carrera del que no lo juega— y no
// más que eso: el día que un cruce sí caiga en un Momento nuevo, ESE caso se va
// a mover, y va a estar bien que se mueva.
//
// ── CAUSA 1: el pool de ajenos pasó de 1 a 4 ──
// Entraron El Ancla, El Código y Los Palos. Un perfil recibe Momentos ajenos por
// EL CRUCE (`CROSS_CHANCE`), así que el sorteo cambió para los tres casos y no
// solo para el apertura, que es el único que ganó un Momento propio. Por eso el
// wing —que sigue sin Momento de su familia— también se movió: su pool ajeno
// pasó de {jackal} a {jackal, ancla, codigo, palos}. Movimiento esperado y
// legible; el que NO se explicara así sería el sospechoso.
//
// ── CAUSA 2: la receta pasó a declarar NIVEL DE JUEGO ──
// Y esta es la que hay que leer con atención, porque hasta la 0.4.0 la tabla
// venía mintiendo. La receta le daba a cada Momento una posición de input cruda,
// y la de Los Palos era una puntería uniforme en [−1, 1]. Medido sobre la
// carrera congelada del apertura: nueve patadas, UNA adentro, dos al palo, seis
// erradas, con un desvío promedio contra la puntería perfecta de 0,643 y
// tolerancias de 0,19 a 0,31. O sea que le erraba por el triple del margen que
// tenía. La 0.4.0 lo había leído como "Los Palos le arruinó la carrera al
// apertura" —perdía dos temporadas y 23 puntos de Cartel— cuando lo que pasaba
// es que el simulado apuntaba al azar.
//
// El tackle tenía el mismo vicio y era peor, porque lo juegan los quince: la
// barra uniforme le daba al apertura 0,865 / 0,950 / 0,991, o sea `tarde` tres
// de tres.
//
// ── Lo que el arreglo movió, medido sobre 40 semillas por perfil ──
// Las carreras NO se acortaron: es lo primero que hubo que descartar, porque el
// apertura 99 se retira dos años antes que en la 0.4.0.
//
//     perfil           temporadas          retiro           Cartel
//     primera-linea    15,93 → 15,73    33,83 → 33,63    27,59 → 31,86
//     wing-fullback    12,73 → 12,85    30,73 → 30,85    12,48 → 16,40
//     apertura         15,03 → 15,00    33,03 → 33,00    18,11 → 25,46
//     tercera-linea    13,93 → 14,03    31,90 → 32,03    21,58 → 28,02
//     segunda-linea    14,80 → 14,85    32,78 → 32,78    23,01 → 26,05
//
// Duración y edad de retiro quedan planas en los cinco perfiles: la receta no
// acorta carreras. Que el apertura 99 pase de 15 temporadas a 13 es la tirada de
// `retireIfDue` cayendo del otro lado —entre el tope blando y el duro se tira una
// moneda por temporada, y la carrera diverge desde la primera jugada—, no un
// castigo sistemático. Con el promedio plano, es la semilla y no el motor.
//
// El Cartel sube en LOS CINCO, incluidos los tres perfiles que no recibieron
// ningún Momento nuevo. Eso dice que la receta vieja no era un problema de Los
// Palos: era un impuesto parejo que se cobraba en todos los puestos, y Los Palos
// solo lo hizo visible porque al apertura le tocaba pagarlo dos veces.
//
// ── Lo que sigue valiendo de la foto anterior ──
// El kind del Momento sale de `hash(semilla:temporada:momentPick)` y los márgenes
// de `hash(semilla:kind:temporada:idx)`, así que `rollMoment` sigue consumiendo
// `chance` + `int` + `int` del stream principal. Es lo que hace que un Momento
// nuevo mueva solo lo que cambió de verdad, en vez de mover todo.
//
// Cuando esto se mueva, lo que hay que mirar NO es el `stateHash` —se mueve
// siempre, porque cubre el estado entero— sino qué OTROS campos se movieron y en
// cuántos de los tres casos. Un solo caso movido es una regresión localizada;
// los tres, un cambio de stream del rng. Y si el movimiento no se puede explicar
// con una causa nombrada, NO SE CONGELA: la 0.4.0 se congeló con una explicación
// que solo describía la correlación ("le entró su Momento") y así estuvo tres
// commits diciendo que Los Palos rompía al apertura.
//
// Tres cosas de esta tabla que son hallazgos y no ruido:
//
//   · el pilar cierra con Pertenencia 24,28 y los otros dos con 0. No es un bug:
//     `belongingOf` mide el vínculo con el CLUB ACTUAL, y los otros dos se
//     mudaron cerca del final. El pilar es el único que se queda, que es lo que
//     la curva del puesto más longevo debería producir.
//   · el apertura es el único que sale del país (Moana Pasifika) y el único con
//     caps. Las dos cosas van juntas y esa es la regla: el cartel abre el
//     mercado. Cierra con 66,6 contra 13,6 y 14,8 de los otros dos.
//   · ninguna de las tres carreras pisa el bunker. La única puerta es la zona
//     `alto` del tackle y las dos manos `mal` que salieron cayeron del lado de
//     `tarde`. El carril está al alcance de la receta —la mitad de los `mal` van
//     arriba— pero HOY el digest no lo cubre: si alguien toca `bunkerVerdict`,
//     esta tabla no se entera. Es la razón principal para sumar un cuarto caso.
const EXPECTED: Record<string, Digest> = {
    'pilar argentino': {
        engineVersion: '0.6.0',
        seasons: 16,
        retirementAge: 34,
        lastClub: 'ar-sociedad-hebraica',
        belonging: 24.28,
        fame: 13.6,
        caps: 0,
        titles: 3,
        moments: 13,
        // Los nueve campos de arriba son IDÉNTICOS a la 0.5.0. Solo se movió el
        // hash, que adentro lleva la cadena de la versión.
        stateHash: 3959283877, // 0.5.0 era 3116498538
    },
    'wing argentino': {
        engineVersion: '0.6.0',
        // EL ÚNICO QUE SE MOVIÓ DE VERDAD, y es el que recibió La Banda.
        seasons: 12,
        retirementAge: 30,
        lastClub: 'sb-hindu-club',
        belonging: 21.043,
        fame: 14.5,
        caps: 0,
        titles: 3,
        moments: 10,
        stateHash: 1267169825, // 0.5.0 era 4185683751
    },
    'apertura argentino': {
        engineVersion: '0.6.0',
        seasons: 13,
        retirementAge: 31,
        lastClub: 'moana-pasifika',
        belonging: 0,
        fame: 66.6,
        caps: 13,
        titles: 3,
        moments: 12,
        // Idéntico a la 0.5.0 en los nueve, igual que el pilar.
        stateHash: 231311238, // 0.5.0 era 396654071
    },
    'tercera línea argentino': {
        engineVersion: '0.6.0',
        seasons: 13,
        retirementAge: 31,
        lastClub: 'sb-casi',
        belonging: 23.681,
        fame: 16.3,
        caps: 0,
        titles: 5,
        moments: 13,
        stateHash: 730581646, // primera foto de este caso
    },
};

// ═══════════════════════════════════════════════════════════════════════════
//  0 · EL CATÁLOGO, ANTES DE SIMULAR NADA
// ═══════════════════════════════════════════════════════════════════════════

/**
 * La versión del catálogo con la que se midió la tabla de abajo.
 *
 * `NORMALIZED_CATALOG_VERSION` es compuesta —catálogo de clubes + snapshot SA +
 * canon argentino— así que este único string cubre los tres. Es el mismo que
 * sella el guardado.
 */
const CATALOGO_CONGELADO = '2026-27.10+sa.464399ffada4+ar.2026.2';

const CATALOGO_AL_DIA = NORMALIZED_CATALOG_VERSION === CATALOGO_CONGELADO;

/**
 * SE PREGUNTA PRIMERO Y NO SE SIMULA NADA SI NO COINCIDE.
 *
 * El motivo es una tarde perdida. Al refrescar la 0.6.0 los cuatro casos se
 * movieron y el commit iba a decir que los movió un Momento nuevo; los había
 * movido el catálogo, que estaba editado sin commitear en el árbol de trabajo.
 * Distinguir una cosa de la otra costó montar un worktree limpio, porque EL ROJO
 * DEL CATÁLOGO Y EL ROJO DEL MOTOR ERAN EL MISMO ROJO: una tabla de números que
 * no coinciden.
 *
 * Ahora son dos rojos distintos. Si el catálogo se movió, este test falla con su
 * propio mensaje y el digest ni siquiera corre una carrera — porque no tendría
 * nada que decir del motor.
 *
 * Y sí sirve: el día del incidente el canon había pasado de `ar.2026.2` a
 * `ar.2026.3` y el catálogo de `2026-27.10` a `.11`, así que esta comparación
 * habría cortado en el primer segundo.
 *
 * Cuando el catálogo cambia a propósito, se refresca EXPECTED y se actualiza
 * esta constante EN EL MISMO COMMIT, que además no debería traer nada más.
 */
test('EL CATÁLOGO ES EL QUE SE CONGELÓ', () => {
    assert.equal(
        NORMALIZED_CATALOG_VERSION,
        CATALOGO_CONGELADO,
        `el catálogo cambió: ${CATALOGO_CONGELADO} → ${NORMALIZED_CATALOG_VERSION}. `
        + 'El motor NO se evaluó. Estas carreras se juegan contra el catálogo de clubes, '
        + 'así que con otro catálogo el jugador termina en otro club, gana otros títulos y '
        + 'se retira en otro año, sin que el motor haya cambiado una línea.\n'
        + 'Si el cambio del catálogo es intencional: refrescá EXPECTED y esta constante en '
        + 'un commit que no traiga nada más, para que el próximo movimiento del motor se '
        + 'siga pudiendo leer solo.',
    );
});

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
    // Con el catálogo movido no hay nada que medir del motor: se corta acá y no
    // se simula una sola temporada, para que el diagnóstico no sea una tabla de
    // números que no coinciden por un motivo que no es el motor.
    if (!CATALOGO_AL_DIA) {
        assert.fail(
            `el catálogo cambió (${CATALOGO_CONGELADO} → ${NORMALIZED_CATALOG_VERSION}): `
            + 'el motor no se evaluó. Mirá el test de más arriba.',
        );
    }

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
