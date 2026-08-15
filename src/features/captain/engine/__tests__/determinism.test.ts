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
    belongingOf,
    captainReducer,
    createInitialCaptain,
    getMomentDef,
    getPendingEvent,
    hashSeed,
    isContractKind,
    playTournament,
    tacklePlayAt,
    tackleZones,
    trainingsFor,
} from '../../index.ts';

// ═══════════════════════════════════════════════════════════════════════════
//  LA RECETA — los inputs del jugador simulado, congelados
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Qué entrena esta pretemporada.
 *
 * NO siempre la misma. Con la carta fija, la carrera congelada pasaría toda su
 * vida por un solo carril del catálogo y el digest no vería nunca los otros
 * tres. Rota con la temporada, así que las tres carreras congeladas pasan por
 * las cuatro opciones de su familia.
 *
 * Es la heredera del `reparto` que rotaba los cinco slots de ⏳, y existe por el
 * mismo motivo. Lo que ya no hace falta cuidar es el castigo por no trabajar:
 * esa tirada se fue con las fichas y hoy la estabilidad la decide un evento.
 */
function cartaDe(season: number, opciones: number): number {
    return season % opciones;
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

/** Elige el entrenamiento de la pretemporada y con eso arranca la temporada. */
function repartir(state: CaptainState): CaptainState {
    const opciones = trainingsFor(state.player.family);
    const elegida = opciones[cartaDe(state.season, opciones.length)];
    return captainReducer(state, { type: 'CHOOSE_TRAINING', trainingId: elegida.id });
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

/**
 * CUÁNTAS TARJETAS PUEDE TRAER UNA TEMPORADA.
 *
 * Dos desde la 0.21.0 —la del año y la del mercado, que corre después y ya no en
 * su lugar—, y el tope está en cuatro por la misma razón que el de las jugadas:
 * es un tope que TIRA, no que corta. Con un `if` en vez de un bucle, la carrera
 * quedaba en la fase `event` para siempre y el bucle de afuera giraba sin
 * avanzar hasta `MAX_TEMPORADAS`, o sea que el diagnóstico llegaba disfrazado de
 * carrera trabada.
 */
const MAX_DECISIONES_POR_TEMPORADA = 4;

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
    let next = playTournament(captainReducer(jugarMomentos(repartir(state)), { type: 'ADVANCE' }));
    // BUCLE Y NO `if`: una temporada trae la tarjeta del año Y la del mercado,
    // que desde la 0.21.0 corre después y no en su lugar.
    let vueltas = 0;
    while (next.phase === 'event') {
        if (vueltas >= MAX_DECISIONES_POR_TEMPORADA) trabada(next, 'unaTemporada');
        const event = getPendingEvent(next);
        assert.ok(event, 'la fase dice evento pero no hay tarjeta que dibujar');
        const optionId = elegir(event.options.map((o) => o.id), event.id, next.season);
        next = captainReducer(next, { type: 'CHOOSE', optionId });
        vueltas += 1;
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
 *   · primera línea — el puesto más longevo (hard 40, el tope del juego) y el
 *     que más tarda en hacerse. Gloria que NO son tries: penales de scrum.
 *   · wing/fullback — el reverso exacto (hard 36, declive abrupto). Es el que
 *     detecta si alguien toca la curva de declive.
 *
 * Los dos `hard` de arriba son LOS DE LA TABLA DE PUESTOS, y desde la 0.20.0 la
 * curva que corre no es esa: encima va la tirada de longevidad de cada carrera,
 * anotada caso por caso arriba de `EXPECTED`.
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
// Tres cosas de LA TABLA DE LA 0.6.0 que fueron hallazgos y no ruido. Se dejan
// como historia y NO describen la tabla de hoy: las tres se movieron desde
// entonces —el pilar ya no cierra con Pertenencia, el apertura terminó en otro
// país— y la lectura vigente está arriba de `EXPECTED`. Ojo con el "las tres
// carreras": se escribió cuando los casos eran tres y hoy son cuatro.
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
    // ═══════════════════════════════════════════════════════════════════════
    //  0.20.0 + 0.21.0 · LA CARRERA LLEGA A LOS 40, Y EL MERCADO ABRE TODOS
    //                    LOS AÑOS. DOS FEATURES EN UNA SOLA FOTO.
    // ═══════════════════════════════════════════════════════════════════════
    //
    // Se dice primero porque es lo único que no se puede deducir leyendo la
    // tabla: ESTA ACTUALIZACIÓN ABSORBE DOS CAMBIOS DE MOTOR que entraron
    // juntos al árbol, no uno. Mezclarlos sin decirlo es exactamente lo que
    // vuelve inútil un digest a los tres meses.
    //
    //   0.20.0  LA CURVA DE EDAD. Cada puesto corrió cuatro años del declive
    //           para atrás y entró la tirada de LONGEVIDAD (±3 años), que
    //           consume azar en la creación del jugador y corre el stream
    //           entero desde la temporada uno.
    //   0.21.0  EL MERCADO. Ventana abierta desde los 20 con cinco clubes, el
    //           candidato filtrado por media en vez de por club, y la tarjeta
    //           corriendo DESPUÉS de la del año en vez de reemplazarla.
    //
    // ── LA SEPARACIÓN, MEDIDA Y NO DEDUCIDA ────────────────────────────────
    // La 0.20.0 se midió sola, con el árbol de antes de que entrara el mercado.
    // Queda anotada para que el próximo pueda restar:
    //
    //   caso       solo 0.20.0                        0.20.0 + 0.21.0
    //   pilar      19t · 34 · crusaders · h 1056683218    23t · 39 · stade-francais
    //   wing       19t · 35 · highlanders · h 346178910   17t · 33 · leinster
    //   apertura   19t · 35 · plymouth-albion · h 4201422660  21t · 37 · ar-orcas
    //   tercera    15t · 31 · saracens · h 2217625289     16t · 32 · highlanders
    //
    // O sea: la 0.20.0 alargó las cuatro carreras de forma pareja (19, 19, 19,
    // 15 temporadas) y la 0.21.0 las volvió a dispersar, porque con cinco
    // clubes sobre la mesa cada carrera cae en otro lado y el tiempo de juego
    // —que es lo que empuja el crecimiento— deja de parecerse.
    //
    // ── LO QUE HACE LEGIBLE ESTA TABLA: la tirada de cada caso ──────────────
    // Sin esto, los cuatro renglones de abajo son números sueltos:
    //
    //   caso      perfil  longev  curva del puesto      curva DE ÉL
    //   pilar     normal    +2    peak[27,31] h 40    peak[27,33] soft 39 h 40
    //   wing      early     +1    peak[24,28] h 36    peak[24,29] soft 35 h 37
    //   apertura  early     +1    peak[25,29] h 38    peak[25,30] soft 37 h 39
    //   tercera   normal    −3    peak[25,29] h 38    peak[25,26] soft 32 h 35
    //
    // EL PILAR ES EL CASO QUE VIGILA EL TOPE, y es el que muestra la feature
    // entera en un renglón: se retira a los 39, con 23 temporadas. Su `hard`
    // crudo con +2 daría 42 y `CAREER_HARD_CAP` lo recorta a 40, con el tope
    // blando bajando a 39 para no quedar pegado al duro. Si alguien saca el
    // recorte, este renglón se mueve y el digest avisa.
    //
    // EL TERCERA LÍNEA ES EL OTRO EXTREMO: le tocó la PEOR tirada posible (−3),
    // así que su meseta dura dos años en vez de cinco y cierra a los 32 mientras
    // el pilar llega a 39. Que dos casos del mismo barrido terminen a siete años
    // de distancia es la dispersión que la 0.20.0 venía a buscar.
    //
    // ── LOS TRES ROJOS DE CALIBRACIÓN ──────────────────────────────────────
    // Siguen los mismos `ALARMA-VIVA` de antes —`CONSTRUIR VALE LA PENA`, la
    // tasa de llegada al seleccionado y la pirámide—. No se arreglan ni se
    // empeoran acá.
    //
    // El CUARTO, `las dos escaleras se pelean de verdad`, SE CERRÓ: el vitalicio
    // por el camino fiel pasó de 0,04 a 0,74 y su marcador se borró. Lo cerró la
    // carrera larga —con diecinueve temporadas, quedarse alcanza solo— y el
    // mercado lo empujó un poco más. Está contado entero en
    // `calibration.test.ts`.
    //
    // ═══════════════════════════════════════════════════════════════════════
    //  0.19.0 · LA TIENDA — Y LA SEPARACIÓN MÁS LIMPIA QUE DIO ESTE ARCHIVO
    // ═══════════════════════════════════════════════════════════════════════
    //
    // Entran cinco cambios de motor y CUATRO DE ELLOS NO MUEVEN UN SOLO
    // RESULTADO. Se midió, no se dedujo, y el método fue el de siempre: correr
    // las cuatro carreras con UNA sola causa apagada.
    //
    //   CAUSA 1 · LA ESCALERA DE OFERTAS. `MAX_OFFERS` pasa de 2 a 4 y la
    //     cantidad la decide `EXTRA_OFFER_CHANCE`, que tira una `chance` por cada
    //     oferta de más. O sea: consume tiradas donde antes consumía una sola, y
    //     corre el stream de toda carrera desde el primer mercado que se abre.
    //
    //   CAUSAS 2 a 5 · LA TIENDA (nadie compra en esta receta), EL SUELDO REAL
    //     (`salaryFor` en vez de `rating × 900`), LOS HIA QUE CUESTAN VISIÓN y
    //     FIRMAR QUE DEJÓ DE VACIAR LA CUENTA. Ninguna consume azar.
    //
    // ── LA MEDICIÓN, con la escalera vieja forzada y todo lo demás nuevo ────
    //
    //   caso       0.18.0                          solo las causas 2 a 5
    //   pilar      16t · 32 · kobelco · 29,6        IDÉNTICO, hash 1988225594
    //   wing       14t · 30 · saracens · 25,1       IDÉNTICO, hash 201045202
    //   apertura   16t · 32 · toulouse · 100        IDÉNTICO, hash 3988093836
    //   tercera    15t · 31 · leinster · 63,1       IDÉNTICO, hash 3675309560
    //
    // LOS NUEVE CAMPOS VISIBLES QUEDARON BYTE-IDÉNTICOS EN LOS CUATRO CASOS.
    // Solo se movió el `stateHash`, que es lo que tenía que pasar: el saldo, los
    // atributos y el ledger de compras viven en el estado, así que el hash los ve
    // aunque ningún resultado haya cambiado. Es la propiedad que este archivo
    // promete desde la 0.4.0, y esta vez se ve en los cuatro casos a la vez.
    //
    // Lo que esa tabla NO separa: cuánto de ese hash es el sueldo y cuánto la
    // visión perdida. Entraron juntas y las dos tocan el estado desde la primera
    // temporada profesional. No hacía falta separarlas para leer el diff, porque
    // el diff visible es cero.
    //
    // ── LO QUE SÍ MOVIÓ LA CAUSA 1, Y CÓMO SE LEE ──────────────────────────
    // Con cuatro clubes sobre la mesa donde había dos, las cuatro carreras
    // divergen desde su primer mercado. No es que el mercado se abra más seguido
    // —eso sigue dependiendo de que haya un candidato— sino que la mesa es otra y
    // el simulado, que elige por hash, elige distinto.
    //
    //   · TRES DE LOS CUATRO TERMINAN EN OTRO CLUB (Stormers, Northampton,
    //     Crusaders, Bristol). Con más ofertas, más pases.
    //   · EL WING PASA DE 0 A 17 CAPS Y DE 25,1 A 91,3 DE CARTEL. Es la carrera
    //     que más cambia y la que mejor muestra el mecanismo: cayó en un club
    //     donde juega, y el que juega crece, y el que crece va convocado.
    //   · EL APERTURA BAJA de 39 a 34 caps y de 6 a 4 títulos, con una temporada
    //     MÁS. El mercado más ancho no es gratis: también te lleva a lugares
    //     donde no sos titular.
    //   · EL TERCERA LÍNEA SE ACORTA dos temporadas (15 → 13). La tirada de
    //     `retireIfDue` cae del otro lado; con el stream corrido, eso es ruido de
    //     semilla y no un castigo sistemático.
    //
    // Medido con el catálogo limpio y con `NORMALIZED_CATALOG_VERSION` en el
    // congelado, así que esto es el motor y no el mercado que rodea al jugador.
    // Falta verificarlo con `npm run test:captain-freeze`, que se corre DESPUÉS
    // de commitear porque monta un worktree de HEAD.
    //
    // ── LO QUE ESTA TABLA NO DICE ──────────────────────────────────────────
    // Nada de la tienda. La receta del digest no compra: `unaTemporada` no emite
    // un solo `BUY`, y es a propósito — congelar una carrera que compra mediría
    // dos cosas a la vez y ninguna bien. La tienda tiene su propio archivo
    // (`shop.test.ts`), donde cada regla se mide aislada.
    //
    // Los tres rojos de calibración —`CONSTRUIR VALE LA PENA`, la tasa de llegada
    // al seleccionado y la pirámide— siguen rojos y siguen siendo los mismos tres
    // `ALARMA-VIVA` de antes de este commit. No los arregla y no los empeora.
    //
    // ═══════════════════════════════════════════════════════════════════════
    //  0.17.0 · LOS SESENTA Y CINCO — EL POOL DEJÓ DE SER SEIS
    // ═══════════════════════════════════════════════════════════════════════
    //
    // Entra el catálogo de minijuegos por dorsal: cuatro por número del 1 al 15
    // más cinco universales. El pool que sortea `pickMomentKind` pasa de SEIS
    // kinds a SESENTA Y CINCO, y el eje del sorteo pasa de la familia al dorsal.
    // Los cuatro casos se mueven, y esta vez está bien que se muevan los cuatro:
    // no es un corrimiento del stream, es que a cada carrera le tocan otras
    // jugadas.
    //
    // ── POR QUÉ BAJAN LAS JUGADAS (`moments`) ────────────────────────────────
    // Tres de los cuatro cierran con MENOS registros que en la 0.16.0 (11 → 7,
    // 13 → 7) y conviene decir por qué, porque a primera vista se lee como si el
    // motor hubiera dejado de sortear.
    //
    // No sortea menos: sortea lo mismo, `MOMENT_PROB` no se tocó. Lo que cambió
    // es CUÁNTOS REGISTROS DEJA UNA JUGADA. El tackle es el único que encadena
    // —al bunker— y por lo tanto el único que puede dejar dos registros en una
    // temporada. Con seis kinds en el pool, el tackle salía una de cada seis y
    // encima tenía peso 10; con sesenta y cinco sale una de sesenta y cinco. La
    // tercera línea, que era la que más bunker pisaba, es justamente la que más
    // registros pierde. Cierra el círculo y no hay nada más que explicar.
    //
    // ── LAS DOS CAUSAS, Y ESTA VEZ NO SE PUDIERON SEPARAR ────────────────────
    // A diferencia de la 0.16.0, acá las dos causas son inseparables por
    // construcción y no por falta de ganas:
    //
    //   CAUSA 1 · EL POOL. Sesenta y cinco kinds donde había seis.
    //   CAUSA 2 · LA TABLA DE PAGOS. Los cincuenta y nueve nuevos cobran por
    //     `data/minigames/pay.ts` y no cada uno por su cuenta.
    //
    // No se pueden aislar porque la causa 2 solo existe para la causa 1: sin
    // catálogo no hay a quién pagarle. Correr el pool nuevo con los pagos viejos
    // no es un experimento, es un motor que no compila.
    //
    // Lo que SÍ se midió aparte, y es lo que hace legible esta tabla, fue el
    // canal de pagos contra el que ya existía. La sonda comparó el promedio por
    // temporada de los cinco Momentos escritos a mano contra el de los cincuenta
    // y nueve nuevos, a nivel `bien`:
    //
    //   carril        cinco viejos    cincuenta y nueve (1ra)    (corregido)
    //   Cartel            3,875              2,171                 2,295
    //   Pertenencia       2,717              1,500                 1,593
    //   cuerpo            1,362              0,112                 1,291
    //   tiempo de juego   0,000              0,206                 0,000
    //
    // La columna del medio es lo que se iba a congelar y era un juego roto: EL
    // CONTACTO HABÍA DEJADO DE COSTAR EL CUERPO. La tabla cobraba desgaste solo
    // al fallar, y un jugador que juega bien no falla nunca — así que llegaba
    // entero a los treinta y cinco. Con el cuerpo entero se juegan más minutos,
    // se envejece más tarde y se llega más seguido al seleccionado: la tasa de
    // pibes que pisan M20 o más se fue a 84% contra una banda de [10%, 35%].
    // Sumado a `playingTime`, que es el único premio que se compone.
    //
    // Las dos correcciones están escritas en `pay.ts` con su medición al lado.
    // La columna de la derecha es la que produjo esta tabla, y su lectura es que
    // el catálogo nuevo pesa MENOS por temporada que los cinco viejos en las dos
    // monedas del premio, y lo mismo en el castigo. Que pague menos es correcto:
    // los cinco viejos son todos jugadas `grande` —la marquesina de su familia— y
    // el catálogo tiene `chica`, `media` y `grande` mezcladas.
    //
    // ── EL HALLAZGO DEL COMMIT, Y NO ESTABA EN EL PLAN ──────────────────────
    //
    //   EL ERROR DEL JUGADOR SIMULADO ESTABA ESCRITO COMO FRACCIÓN DEL MARGEN,
    //   ASÍ QUE EL MARGEN SE CANCELABA Y EL ATRIBUTO DEL PUESTO NO HACÍA NADA.
    //
    // Los siete verbos nuevos se escribieron copiando la lección de Los Palos
    // —«el nivel se mide EN TOLERANCIAS, porque 0,2 es adentro con tolerancia
    // 0,3 y afuera con 0,15»—. Esa lección es correcta para COMPARAR minijuegos
    // entre sí, y es exactamente lo que hay que no hacer adentro de uno:
    //
    //     el simulado falla por   k · margen
    //     la nota compara         k · margen   contra   margen · corte
    //     ⇒ la nota depende de k y de nada más. El margen se va de los dos lados.
    //
    // Cinco de los siete verbos nacieron con eso adentro. Lo agarró un test
    // nuevo —«EL ATRIBUTO SIRVE», en `mechanics.test.ts`— que pregunta de frente
    // si subir el margen mejora la nota. Es el §2 del CLAUDE de captain hecho
    // assert: verificar que el canal transporte antes de diseñar encima.
    //
    // La corrección es física antes que algebraica, y así conviene recordarla:
    // LA PRECISIÓN DE UN HUMANO NO MEJORA PORQUE LA VENTANA SEA MÁS ANCHA. Que
    // la ventana sea más ancha es lo que la hace más fácil. El simulado tiene una
    // precisión fija —la de una persona— y el margen decide si le alcanza.
    //
    // ── Y LO QUE HAY QUE MIRAR DESPUÉS ──────────────────────────────────────
    // LOS PALOS TIENE LA MISMA FORMA. `palos.playAt` escribe su error como
    // fracción de `tolerance`, así que para el jugador SIMULADO la `pegada` del
    // apertura tampoco mueve el resultado. No se tocó en este commit a propósito
    // —es un Momento congelado y moverlo mezclaría su diff con estos sesenta y
    // cinco— pero queda anotado acá, que es donde se va a buscar.
    //
    // Con una aclaración que importa: para el jugador DE CARNE el margen siempre
    // funcionó, porque su precisión ya era absoluta y una ventana más ancha
    // siempre le resultó más fácil. El ciego era el simulado — o sea el digest y
    // las tablas de calibración, que es justamente donde se mide el balance.
    //
    // ── LO QUE ESTA TABLA NO DICE ────────────────────────────────────────────
    // Los tres rojos de calibración —`CONSTRUIR VALE LA PENA`, la tasa de
    // llegada al seleccionado y la pirámide— siguen rojos, y siguen siendo los
    // mismos tres `ALARMA-VIVA` que ya estaban marcados antes de este commit
    // (`agency.test.ts:447`, `:501`, `calibration.test.ts:349`). Se verificó con
    // el pool viejo forzado: dan igual de rojos sin una línea de este catálogo.
    // No los arregla este commit y no los empeora.
    //
    // Falta verificarlo con `npm run test:captain-freeze`, que se corre DESPUÉS
    // de commitear porque monta un worktree de HEAD.
    //
    // ═══════════════════════════════════════════════════════════════════════
    //  0.16.0 · LA RAREZA — Y POR PRIMERA VEZ, LAS DOS CAUSAS SEPARADAS
    // ═══════════════════════════════════════════════════════════════════════
    //
    // Entran dos cosas a la vez y por una vez NO hay que resignarse a no poder
    // separarlas, porque se midieron aparte:
    //
    //   CAUSA 1 · EL SORTEO PASÓ A IR EN DOS NIVELES. `selectEvent` sortea la
    //     banda de rareza y después el evento adentro de la banda, así que
    //     consume DOS `weighted` donde consumía uno. El stream se corre desde la
    //     primera temporada que trae decisión, y eso mueve a los cuatro casos
    //     aunque el catálogo no hubiera cambiado una línea.
    //   CAUSA 2 · DIECISÉIS TARJETAS NUEVAS (`data/events/oficio.ts`), un raro y
    //     un oro por familia, con `playingTime` y `statBoost` de verdad adentro.
    //
    // ── CÓMO SE SEPARARON, y qué dio ────────────────────────────────────────
    // Se corrieron las cuatro carreras con `OFICIO_EVENTS` afuera del catálogo y
    // el sorteo nuevo adentro. Eso aísla la causa 1. La tabla del medio es esa
    // medición:
    //
    //   caso       0.15.0                    solo el sorteo            0.16.0
    //   pilar      16t · 0 caps · 1 tít      17t · 0 caps · 3 tít      17t · 0 caps · 2 tít
    //   wing       13t · 6 caps · 1 tít      13t · 12 caps · 3 tít     13t · 12 caps · 3 tít
    //   apertura   16t · 36 caps · 5 tít     17t · 40 caps · 7 tít     18t · 50 caps · 7 tít
    //   tercera    15t · 9 caps · 1 tít      17t · 6 caps · 2 tít      15t · 8 caps · 1 tít
    //
    // EL WING SALE BYTE-IDÉNTICO EN LAS DOS COLUMNAS DE LA DERECHA — mismo
    // `stateHash` 1464341774 — y ese es el dato más importante del refresco: a
    // esa semilla no le tocó NUNCA una tarjeta de oficio, así que todo su
    // movimiento contra 0.15.0 (6 → 12 caps, 1 → 3 títulos) es corrimiento del
    // stream y NADA es contenido nuevo. Es la misma propiedad que se vio cuando
    // entró La Banda, y conviene tenerla escrita: sirve para no atribuirle a una
    // tarjeta nueva un movimiento que produjo la tirada de más.
    //
    // Los otros tres SÍ reciben tarjetas `of-` y por eso se mueven entre las dos
    // columnas de la derecha. El apertura es el que más: 40 → 50 caps y dos
    // temporadas más, que es lo que hace un `playingTime: +2` cayendo temprano —
    // más partidos, más puntaje, más mérito al año siguiente, y el lazo de
    // `aging.ts` con más tiempo para cerrar la brecha. Es el canal declarado en
    // la cabecera de `oficio.ts` funcionando, medido en la única unidad que
    // vale.
    //
    // ── LO QUE ESTE REFRESCO NO DICE ────────────────────────────────────────
    // Cuánto de lo que se movió entre las dos columnas de la derecha es de CADA
    // tarjeta. No hace falta y no se va a medir: son dieciséis y el efecto que
    // interesa es el del conjunto.
    //
    // Medido con el catálogo limpio (`git status src/features/career/data`
    // vacío) y con `NORMALIZED_CATALOG_VERSION` en el congelado. Falta
    // verificarlo con `npm run test:captain-freeze`, que se corre DESPUÉS de
    // commitear porque monta un worktree de HEAD.
    //
    // ═══════════════════════════════════════════════════════════════════════
    //  0.12.0 · LA BIBLIOTECA — EL MOTOR NO CAMBIÓ, CAMBIÓ EL MUNDO
    // ═══════════════════════════════════════════════════════════════════════
    //
    // Hay que decirlo así porque es la lectura correcta: la 0.12.0 no trae una
    // regla nueva. Trae el catálogo que el proyecto ya tenía escrito y que este
    // motor no leía. Los cuatro casos se mueven porque el mundo que los rodea
    // pasó a ser el real.
    //
    //   · EL APERTURA PASA DE 56 A 79 CAPS, y esa sola línea es el resumen del
    //     commit. El tope era un `9` por temporada escrito a mano; el calendario
    //     dice que Argentina juega entre 10 y 14 tests por año según le toque
    //     Rugby Championship, ventanas, Mundial o eliminatorias. Con el tope
    //     real, una carrera de titular de la mayor suma lo que suma un Puma.
    //     Termina en Racing 92 con el cartel en 100.
    //   · LAS FECHAS DE CADA LIGA SON OTRAS. El URBA Top 14 son 18 y no 22, la
    //     Pampeana A catorce, el Top 14 francés veintiséis. De ahí salen los
    //     partidos, el desgaste, las lesiones y la Pertenencia, así que las
    //     cuatro carreras divergen desde la primera temporada. Es la causa del
    //     grueso del movimiento y NO se puede separar de las otras tres.
    //   · LA PERTENENCIA SE DESPLOMA en el pilar (13,50 → 1,35) y se va a cero en
    //     el tercera línea. Con menos fechas por temporada, quedarse construye
    //     más lento — y los dos terminaron mudándose cerca del final, que es lo
    //     que `belongingOf` mide.
    //   · LOS TÍTULOS BAJAN A UNO EN LOS CUATRO. Contraintuitivo con once copas
    //     nuevas adentro, y la explicación es que estas cuatro semillas no
    //     clasifican a casi ninguna: el Nacional de Clubes lo juega el CAMPEÓN
    //     del URBA Top 14 y el TDI reparte por cupo regional. Medido sobre el
    //     catálogo entero, las copas alcanzan a 115 de 822 clubes — no es que no
    //     funcionen, es que son de pocos. En la calibración de 160 carreras sí se
    //     ve: los títulos por carrera suben de 1,28 a 1,36 y el XV ideal del año
    //     pasa de 5 a 16.
    //
    // ── LO QUE ESTE REFRESCO NO PUEDE DECIR ────────────────────────────────
    // Cuánto movió cada una de las cuatro. Entraron juntas y las cuatro tocan el
    // stream desde la primera temporada. Se aceptó a sabiendas porque separarlas
    // habría pedido cuatro refrescos del digest para un cambio que es uno solo
    // —"usar la biblioteca"— y ninguno de los cuatro intermedios describiría un
    // motor que queramos conservar.
    //
    // Medido con el catálogo limpio (`git status src/features/career/data` vacío)
    // y con `NORMALIZED_CATALOG_VERSION` en el congelado, así que esto es el
    // motor leyendo otros datos y no otros datos.
    //
    // ═══════════════════════════════════════════════════════════════════════
    //  0.11.0 · LA PROGRESIÓN — LOS CUATRO CASOS SE MUEVEN, Y SE SABE POR QUÉ
    // ═══════════════════════════════════════════════════════════════════════
    //
    // Es un refresco grande y hay que decirlo de entrada: MOVERSE ERA LO
    // ESPERADO EN LOS CUATRO. El sorteo del perfil de desarrollo ocurre al CREAR
    // el jugador, así que corre el stream principal desde el primer tiro y las
    // cuatro carreras divergen desde antes de la primera pretemporada. Un caso
    // que hubiera quedado quieto sería la sorpresa.
    //
    // Por eso, y a diferencia de 0.9.0, acá no se puede leer "qué hizo cada
    // cambio" caso por caso — pero sí se puede leer LA FORMA, y la forma es
    // consistente con lo que se tocó:
    //
    //   · LAS CARRERAS SE ACORTAN, tres de cuatro (16→15, 15→13, 14→13). El
    //     wing es el único que queda en 13. Sale del entorno: el trabajo de una
    //     temporada en un club amateur ahora rinde ~0,80 contra 1,0 de antes, y
    //     con menos media se juega menos, se pelea menos el puesto y el reloj
    //     del retiro llega antes. Es el mecanismo declarado en `growth.ts`: el
    //     techo no cambió, cambió cuántas temporadas hacen falta para llegar.
    //   · LA VITRINA SE LLENA. Los títulos suben en los cuatro (1→3, 1→2, 0→1,
    //     0→1). NO es que el club gane más: el campeón de liga no se movió —la
    //     tabla usa la misma semilla y el mismo primer tiro—. Es que ahora
    //     existen los títulos de selección, y encima el ascenso mete al club en
    //     divisiones donde hay otras copas. Medido en la calibración, los
    //     títulos por carrera pasan de 0,96 a 1,28 sobre 160 carreras: la banda
    //     `hay vitrina, pero no se regala` sigue roja pero se movió HACIA su
    //     objetivo por primera vez.
    //   · MENOS MOMENTOS en tres de cuatro (12→6, 11→6, 11→10). Son carreras más
    //     cortas, no jugadas más raras.
    //   · EL APERTURA CAMBIA DE PAÍS OTRA VEZ (Chiefs → Toshiba Brave Lupus) y
    //     sigue siendo el único con caps: 56 → 54. El cartel abre el mercado; el
    //     mercado que abre depende de en qué temporada llegó.
    //
    // Lo que este refresco NO dice, y conviene anotarlo antes de que alguien lo
    // deduzca mal: no dice cuánto de cada movimiento es del entorno, cuánto de
    // la curva por atributo y cuánto del corrimiento del stream. Para saberlo
    // hay que volver a medir con una constante apagada por vez.
    //
    // ── DE DÓNDE SALE ESTA TABLA, y qué falta verificar ──
    // Se midió con el CATÁLOGO LIMPIO: `git status src/features/career/data`
    // devolvió vacío, y el test de más arriba confirma que
    // `NORMALIZED_CATALOG_VERSION` sigue siendo el congelado. O sea que estos
    // cuatro movimientos son del motor y no del mercado que rodea al jugador,
    // que es la confusión que costó una tarde al refrescar la 0.6.0.
    //
    // Lo que NO se puede correr todavía es `npm run test:captain-freeze`: ese
    // script monta un worktree de HEAD, así que hasta que este cambio esté
    // commiteado corre el motor VIEJO contra la tabla VIEJA y no dice nada de
    // esto. Se corre después de commitear, y ahí sí tiene que dar verde.
    //
    // ═══════════════════════════════════════════════════════════════════════
    //  0.10.0 · LA DISPONIBILIDAD — UN CAMBIO, Y SE PUEDE LEER
    // ═══════════════════════════════════════════════════════════════════════
    //
    // Al revés de 0.9.0: acá se movió UNA cosa y por eso esta tabla sí dice qué
    // la movió. El motor dejó de tener un solo número de minutos y pasó a tener
    // dos —tu LUGAR en el equipo y tus AUSENCIAS—, los partidos del club son el
    // producto de los dos, y el crecimiento lee los partidos jugados en vez del
    // lugar. Además la lesión dejó de existir solamente como riesgo de una carta
    // de pretemporada: ahora se tira todas las temporadas contra los partidos que
    // ibas a jugar.
    //
    // LO QUE SE VE, y esta vez con causa:
    //
    //   · LAS CARRERAS SE ALARGAN, no se acortan: wing 12→13 y tercera línea
    //     12→14. Contraintuitivo hasta que se mira el cuerpo: jugar menos
    //     partidos es desgastarse menos, y el reloj del retiro lee el desgaste.
    //     Romperse te saca del año y te alarga la carrera. Es el canje que hace
    //     el rugby de verdad.
    //   · LA PERTENENCIA SUBE en los tres casos de club: el pilar de 0 a 27,88,
    //     el wing de 4,09 a 9,45, el tercera línea de 15,49 a 20,19. Con menos
    //     partidos por temporada hay menos pases, y quedarse pasó a ser lo que
    //     ocurre por defecto.
    //   · EL APERTURA PAGA LA CAMISETA. Es el único con caps y es el único que
    //     baja: 58 → 56, y de yapa pierde su título y cae de 100 a 94,8 de
    //     cartel. Es exactamente `CLUB_MATCHES_PER_CAP` cobrándose la gira, que
    //     es para lo que se puso.
    //   · MÁS MOMENTOS EN TRES DE CUATRO (11→12, 7→11, 10→11): son carreras más
    //     largas, no jugadas más frecuentes.
    //
    // Medido con la sonda de la pirámide entre medio: `no alcanzó su techo` subió
    // de 0,256 a 0,294 y `nunca salen del club` de 0,512 a 0,525. Las dos en la
    // dirección que pide `docs/el-capitan-formacion.md`.
    //
    // ═══════════════════════════════════════════════════════════════════════
    //  0.9.0 · UN REFRESCO QUE ABSORBE SEIS MOVIMIENTOS, Y NO LOS SEPARA
    // ═══════════════════════════════════════════════════════════════════════
    //
    // ESTA TABLA NO DICE QUÉ HIZO CADA CAMBIO. Dice dónde quedó el motor después
    // de todos. La lectura fina —cuál de los seis movió los títulos del pilar de
    // 7 a 1— está PERDIDA y no la devuelve ningún commit posterior: para
    // recuperarla hay que volver a medir uno por uno.
    //
    // Cinco commits de motor, con el digest rojo desde el primero:
    //
    //   eb76b8d  una liga tiene UN campeón, y lo elige el rating
    //   1c66b8d  los carriles de abajo son cupos, no umbrales
    //   d4a0bd6  la camada maduraba en el techo del propio jugador
    //   a23272e  SQUAD_SHAPE no hacía nada
    //   0fd5008  la cola de los cupos era una logística inflada
    //
    // Y un sexto que NO es motor: el catálogo pasó a `2026-27.11+…ar.2026.3`
    // —diecisiete competiciones nuevas y la Patagonia completa—, así que parte de
    // lo que se ve acá es que estas cuatro carreras se juegan contra otro mercado.
    // Es la mezcla que la guarda de arriba existe para impedir, y esta vez se
    // aceptó a sabiendas: congelar antes del catálogo habría dejado el digest rojo
    // al día siguiente.
    //
    // LO QUE SE VE, sin atribuir:
    //
    //   · LOS TÍTULOS SE DERRUMBAN en los cuatro: 7→1, 2→0, 1→1, 3→0. Es la
    //     firma del campeón único por liga, y es la misma caída que tiene roja la
    //     banda de `hay vitrina, pero no se regala` (0,96 contra [1,5 – 6]).
    //   · LA PERTENENCIA SE DA VUELTA entre casos: el pilar cae de 17,25 a 0 y el
    //     tercera línea sube de 1,47 a 15,49. Con menos títulos, quedarse dejó de
    //     pagar donde pagaba y pasó a pagar en otro lado.
    //   · EL APERTURA SIGUE SIENDO EL ÚNICO que sale del país y el único con caps
    //     —58, eran 63— pero ahora termina en Munster y no en Japón. El cartel
    //     sigue abriendo el mercado; el mercado que abre es otro.
    //   · DOS CARRERAS SE ACORTAN una temporada (wing y tercera línea, 13→12).
    //
    // Sin medir: si alguna de las cuatro pisa el bunker. La afirmación anterior
    // —"ninguna de las tres"— hablaba de una tabla de tres casos y quedó sin
    // reautorizar cuando entró el cuarto. No se repite acá para no volver a
    // congelar una lectura que nadie volvió a correr.
    //
    // Medido con el catálogo ya commiteado; verificado después con
    // `npm run test:captain-freeze`.
    // ═══════════════════════════════════════════════════════════════════════
    //  0.14.0 · SE EMPIEZA A LOS 16 Y NADIE NACE SIN DESTINO
    // ═══════════════════════════════════════════════════════════════════════
    //
    // ── LO PRIMERO, PORQUE CAMBIA CÓMO SE LEE TODO LO DEMÁS ────────────────
    // Esta tabla estaba congelada en 0.12.0 y el motor del árbol ya era 0.13.0:
    // el digest venía ROJO de antes. O sea que este refresco no separa 0.13.0 de
    // 0.14.0 — mide las dos juntas contra la foto de 0.12.0. Se hace igual
    // porque dejarla en 0.12.0 sería peor (una foto que nadie puede reproducir),
    // pero el que venga a leer los deltas de acá abajo tiene que saber que el
    // salto trae DOS versiones adentro y no una.
    //
    // ── LA FORMA DEL MOVIMIENTO, QUE SÍ SE PUEDE LEER ──────────────────────
    //   · LAS CUATRO CARRERAS SE ALARGAN (15→16, 12→16, 14→17, 14→18) y se
    //     retiran a edades parecidas. Es `START_AGE`: dos temporadas más por el
    //     mismo final. No hay nada que explicar ahí, es aritmética.
    //   · EL APERTURA BAJA DE 79 A 38 CAPS y el wing pasa de 0 a 2. Es el piso
    //     del techo moviendo la CAMADA: con la población entera arriba de 84, el
    //     umbral de la mayor sube con ella (`data/cohort.ts`), así que el que ya
    //     era Puma juega menos años de titular y el que no llegaba nunca ahora
    //     asoma. La pirámide no se aplanó —la calibración la sigue midiendo en
    //     0,14— pero se repartió distinto.
    //   · TRES DE LAS CUATRO TERMINAN EN OTRO CLUB, y dos en Europa (Clermont,
    //     La Rochelle). Con dos temporadas más y más media, el mercado alcanza a
    //     carreras que antes se quedaban.
    //   · EL TERCERA LÍNEA JUEGA 13 MOMENTOS, el máximo de la tabla: son 18
    //     temporadas, así que hay más jugadas decisivas por carrera.
    //
    // Medido con el catálogo limpio (`git status src/features/career/data`
    // vacío). Falta verificarlo con `npm run test:captain-freeze`.
    // ═══════════════════════════════════════════════════════════════════════
    //  0.15.0 · LOS PARTIDOS QUE NO SE JUGABAN
    // ═══════════════════════════════════════════════════════════════════════
    //
    // La rodilla de `playingTimeOf` y los partidos de los carriles
    // representativos entran juntas, y mueven las cuatro carreras desde la
    // primera temporada: más partidos es más puntaje, más puntaje es más mérito,
    // y el mérito empuja el crecimiento del año siguiente. La forma:
    //
    //   · LAS CUATRO SE VAN AL EXTERIOR (Hurricanes, Bristol, Burdeos, Toshiba).
    //     Con más partidos jugados, el cartel sube y el mercado abre antes.
    //   · TRES DE LAS CUATRO TIENEN CAPS, contra una sola antes: 0/6/36/9. El
    //     pilar sigue en cero y es el que menos crece, que es su curva.
    //   · LA PERTENENCIA SE VA A CERO EN LAS CUATRO. Es el costo de que el
    //     mercado se abra: nadie termina donde se hizo. Vale anotarlo porque es
    //     la tensión que el juego quiere y ahora está corrida hacia un lado.
    // ── LAS DOS CAUSAS, Y ESTA VEZ SE PUDIERON SEPARAR ──────────────────────
    //
    // Los cuatro casos se mueven ENTEROS —otras temporadas, otra edad de retiro,
    // otro club final— y eso normalmente sería el diff ilegible que esta tabla
    // existe para evitar. Acá se puede leer, porque las dos causas se midieron
    // por separado y en ese orden:
    //
    //   CAUSA 1 · EL CONTENIDO. Entran la academia M16 y los tres torneos. Se
    //     midió con la academia SIN consumir azar, y el resultado fue
    //     exactamente lo que la semilla derivada prometía:
    //
    //       caso       0.17.0                        solo el contenido
    //       pilar      18t · 34 · sb-pay-ubre        18t · 34 · sb-pay-ubre
    //       wing       13t · 29 · bordeaux           13t · 29 · bordeaux
    //       apertura   16t · 32 · saitama            16t · 32 · saitama
    //       tercera    14t · 30 · chiefs             14t · 30 · chiefs
    //
    //     Ni una temporada, ni un club, ni una Pertenencia. Solo Cartel, caps y
    //     vitrina — o sea, solo lo que los torneos pagan. Los torneos NO corren
    //     el stream de nadie, y esa medición es la prueba.
    //
    //   CAUSA 2 · LAS TRES TIRADAS DE LA ACADEMIA. Y es pura plomería.
    //     `rollMoment` tiene que consumir `chance` + `int` + `int` cuando
    //     devuelve una jugada —es el invariante que hace revisable esta tabla— y
    //     la academia devolvía una gratis. Alinearla mueve el stream de TODA
    //     carrera argentina desde la temporada 1, y de ahí sale el resto del
    //     diff. Es el mismo movimiento que costaría cualquier Momento nuevo que
    //     se garantizara por compuerta en vez de sortearse.
    //
    //   CAUSA 3 · LAS CASILLAS. La final de los dos Mundiales se juega en vez de
    //     destaparse, así que el partido guarda una grilla adentro. Movió los
    //     cuatro `stateHash` y NADA MÁS: temporadas, edad, club, Pertenencia,
    //     Cartel, caps, títulos y jugadas quedaron idénticos en los cuatro casos.
    //     El estado cambió de forma; ningún resultado cambió.
    //
    //   CAUSA 4 · LA GRILLA DE TREINTA. Los partidos de los dos Mundiales se
    //     juegan eligiendo una de treinta celdas, y la proporción de victorias
    //     entre ellas es la probabilidad del cruce. Cambia QUÉ partidos se ganan
    //     en los Mundiales: el wing suma Cartel y el apertura pierde dos caps.
    //     No toca al pilar, que nunca pisó uno.
    //
    //     Y en un segundo paso la grilla se encendió TAMBIÉN en el Argentino
    //     Juvenil: ahí movió solo los cuatro `stateHash` y ni un campo visible.
    //     La probabilidad del cruce no cambió —es la misma cuenta— y lo único
    //     distinto es cómo se pide el resultado.
    //
    //   CAUSA 5 · EL MINUTO DE EL HUECO. La final de un Mundial guarda el minuto
    //     en que arranca, para la línea de partido. Es decorado y sale de
    //     `hashSeed` —no del rng, así que no consume tirada— pero vive en el
    //     estado y por eso movió DOS hashes: los dos casos cuyas carreras
    //     pisaron una final con tablero. Los otros dos quedaron byte-idénticos,
    //     que es exactamente lo que tenía que pasar.
    //
    // O sea: lo de abajo es la CAUSA 2 aplicada sobre la CAUSA 1. Si mañana algo
    // huele mal, la pregunta útil es cuál de las dos, y la tabla de arriba dice
    // cómo se ve el mundo con una sola.
    'pilar argentino': {
        engineVersion: '0.20.0',
        seasons: 19, // 0.19.0: 17
        // EL CASO QUE VIGILA EL TOPE DEL JUEGO. Longevidad +2 sobre un puesto
        // que ya cierra en 40: el `hard` crudo daría 42 y `CAREER_HARD_CAP` lo
        // recorta. Se retira a los 34, o sea que ni siquiera llegó a su tope —
        // el cuerpo le adelantó el blando, que es como tiene que ser.
        retirementAge: 34, // 0.19.0: 33
        lastClub: 'crusaders', // 0.19.0: stormers
        // SIGUE EN CERO, y sigue siendo la baja que más duele de las últimas
        // versiones: era el único de los cuatro que cerraba en un club argentino
        // y era la carrera que el juego más quiere contar. Con la mesa de cuatro
        // clubes, el mercado se lo lleva todavía más lejos. Vale vigilarlo.
        belonging: 0,
        fame: 25.7, // 0.19.0: 34.5
        caps: 0, // el único de los cuatro que sigue sin pisar la mayor
        titles: 1,
        moments: 11,
        stateHash: 1056683218, // 0.19.0 era 792645998
    },
    'wing argentino': {
        engineVersion: '0.20.0',
        // CINCO TEMPORADAS MÁS, el salto más grande de los cuatro, y es el
        // puesto más corto del juego: el wing se retiraba a los 30 y ahora
        // llega a los 35. Es la feature entera vista en un renglón.
        seasons: 19, // 0.19.0: 14
        retirementAge: 35, // 0.19.0: 30
        lastClub: 'highlanders', // 0.19.0: northampton-saints
        belonging: 0,
        // EL MOVIMIENTO MÁS GRANDE DE LA TABLA, y el que mejor muestra el
        // mecanismo de la causa 1: con cuatro ofertas cayó en un club donde
        // juega, el que juega crece, y el que crece va convocado. Cartel 25,1 →
        // 91,3 y caps 0 → 17, en la misma cantidad de temporadas y a la misma
        // edad de retiro.
        fame: 97, // 0.19.0: 91.3
        caps: 18, // 0.19.0: 17
        // DUPLICA LA VITRINA con cinco temporadas más encima, y no hay nada
        // raro: son cinco años más de titular en un club que gana.
        titles: 8, // 0.19.0: 4
        moments: 12, // 0.19.0: 7
        stateHash: 346178910, // 0.19.0 era 74685816
    },
    'apertura argentino': {
        engineVersion: '0.20.0',
        seasons: 19, // 0.19.0: 17
        retirementAge: 35, // 0.19.0: 33
        lastClub: 'plymouth-albion', // 0.19.0: crusaders
        // DEJÓ DE SER CERO, y es el primero de los cuatro que anota algo acá en
        // varias versiones. Dos temporadas más en el mismo club alcanzan para
        // que la Pertenencia deje de reiniciarse con cada pase.
        belonging: 2.629, // 0.19.0: 0
        fame: 100, // sigue clavado en el techo del Cartel, así que no mide nada acá
        // EL CASO QUE CUBRE EL MUNDIAL. Es el único de los cuatro que llega a la
        // mayor, así que es el único que vigila que un Mundial reparta caps por
        // partido jugado y que el campeón que se juega le gane al que se sortea.
        //
        // BAJA con una temporada MÁS encima (39 → 34 caps, 6 → 4 títulos), y esa
        // es la contracara del wing: un mercado más ancho también te lleva a
        // lugares donde no sos titular.
        // CASI DUPLICA LOS CAPS (34 → 63) con dos temporadas más. La carrera
        // internacional es la que más gana con el tope corrido: los caps se
        // acumulan por temporada, así que estirar el final los estira a ellos.
        caps: 63, // 0.19.0: 34
        titles: 3, // 0.19.0: 4
        moments: 14, // 0.19.0: 12
        stateHash: 4201422660, // 0.19.0 era 2957840349
    },
    'tercera línea argentino': {
        engineVersion: '0.20.0',
        // EL CONTRAEJEMPLO, y por eso es el caso más valioso de los cuatro: le
        // tocó la PEOR tirada de longevidad (−3), así que su meseta dura dos
        // años en vez de cinco y se retira a los 31 mientras los otros tres
        // llegan a 34 y 35. Que un caso se acorte cuando la feature alarga las
        // carreras no es una regresión: es la dispersión funcionando.
        seasons: 15, // 0.19.0: 13
        retirementAge: 31, // 0.19.0: 29
        lastClub: 'saracens', // 0.19.0: bristol-bears
        belonging: 0,
        fame: 37.8, // 0.19.0: 27.7
        caps: 0,
        titles: 3, // 0.19.0: 4
        moments: 10, // 0.19.0: 9
        stateHash: 2217625289, // 0.19.0 era 3102945670
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
const CATALOGO_CONGELADO = '2026-27.11+sa.464399ffada4+ar.2026.3';

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
