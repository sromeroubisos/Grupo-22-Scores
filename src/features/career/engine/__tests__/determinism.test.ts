// RED DE SEGURIDAD DEL MOTOR (Fase 0).
//
// Estos tests son lo que permite tocar el motor sin miedo en las fases
// siguientes. Hay tres garantías distintas y conviene no mezclarlas:
//
//   1. REPRODUCIBILIDAD — misma semilla + mismas decisiones ⇒ mismo estado.
//      NO se rompe cuando el motor cambia a propósito. Si este falla, se coló
//      una fuente de entropía.
//   2. ROUND-TRIP — serializar a JSON a mitad de carrera y seguir desde ahí da
//      exactamente lo mismo que no haber recargado nunca. Es la garantía real
//      detrás del "F5 y retoma idéntico".
//   3. DIGEST CONGELADO — una foto del comportamiento actual. SÍ se rompe
//      cuando el motor cambia. Cuando el cambio es intencional se actualiza la
//      tabla EXPECTED y se sube ENGINE_VERSION; cuando no lo es, acabás de
//      encontrar una regresión.

import test from 'node:test';
import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import { ENGINE_VERSION, runCareer, hashSeed, careerReducer, getPendingEvent, type Chooser } from '../../index.ts';
import type { CareerState } from '../../types/career.ts';
import type { CreatePlayerInput } from '../create-player.ts';

/**
 * Estrategia de decisión determinística que NO siempre elige la primera opción.
 * `firstOptionChooser` produce carreras sin ninguna transferencia (la opción 0
 * del mercado es "quedarte"), así que no sirve para auditar el motor completo.
 * Esta rota entre opciones de forma estable: mismo evento + misma temporada ⇒
 * misma elección, hoy y dentro de seis meses.
 */
const rotatingChooser: Chooser = (event, state) => {
    const idx = hashSeed(`${event.id}:${state.player.seasonsPlayed}`) % event.options.length;
    return event.options[idx].id;
};

interface Case {
    name: string;
    input: CreatePlayerInput;
    seed: number;
}

// Tres países distintos a propósito: uno del circuito rioplatense (escalera
// derivada del snapshot), uno con liga doméstica propia y piso profesional, y
// uno europeo. La RAMA se declara a propósito —una larga, una rápida, una larga—
// para que el digest cubra las dos y no dependa de qué sortee el motor: si la rama
// viniera del sorteo, cambiar `FAST_BRANCH_SHARE` movería los tres casos y el
// digest dejaría de aislar el cambio que se está midiendo.
const CASES: Case[] = [
    { name: 'apertura argentino', input: { position: 'flyhalf', nationalityCountryCode: 'ar', startRoute: 'development' }, seed: 20260726 },
    { name: 'pilar neozelandés', input: { position: 'prop', nationalityCountryCode: 'nz', startRoute: 'professional' }, seed: 424242 },
    { name: 'wing francés', input: { position: 'wing', nationalityCountryCode: 'fr', startRoute: 'development' }, seed: 7919 },
];

interface Digest {
    /**
     * LA VERSIÓN VA ADENTRO DEL DIGEST, no en un comentario arriba de la tabla.
     *
     * Se escribió mal dos veces seguidas: el encabezado decía 1.14.0 con valores
     * de 1.17.0, y después 1.20.0 con valores de 1.21.0. Es un dato que hay que
     * tipear a mano cada vez que se refresca otra cosa, o sea un error esperando
     * a pasar — y cuando un error aparece dos veces por el mismo camino, lo que
     * se arregla es el camino.
     *
     * Ahora la versión la PRODUCE el digest. Refrescar `EXPECTED` es copiar lo
     * que el test imprime, y lo que el test imprime ya trae la versión correcta:
     * no hay forma de refrescar los valores y dejar el número viejo.
     */
    engineVersion: string;
    seasons: number;
    retirementAge: number;
    peakOvr: number;
    caps: number;
    titles: number;
    clubs: number;
    firstClub: string | null;
    lastClub: string | null;
    employment: string;
    decisions: number;
    stateHash: number;
}

function digest(state: CareerState): Digest {
    const clubs = [...new Set(state.history.map((h) => h.clubId))];
    return {
        engineVersion: ENGINE_VERSION,
        seasons: state.history.length,
        retirementAge: state.player.age,
        peakOvr: state.history.reduce((max, h) => Math.max(max, h.ovr), 0),
        caps: state.player.caps,
        titles: state.player.titles,
        clubs: clubs.length,
        firstClub: state.history[0]?.clubId ?? null,
        lastClub: clubs[clubs.length - 1] ?? null,
        employment: state.player.employment,
        decisions: state.decisionLog.length,
        // Cubre TODO el estado, no solo los campos que se nos ocurrió listar.
        stateHash: hashSeed(JSON.stringify(state)),
    };
}

// La línea de base la declara CADA ENTRADA en su `engineVersion` — ver
// docs/career-engine.md §9. Acá no va ningún número escrito a mano.
//
// De 1.31.0 a 1.32.0 se movió TODO, y era inevitable: cambió lo que una decisión
// HACE. La ⭐ pasó a ser un entero de 1 a 4 que el motor aplica, varía por puesto,
// el desenlace bueno de una apuesta cobra prima, y los porcentajes se inclinan con
// la valoración del jugador. Cualquiera de esas cuatro sola ya movía las tres
// carreras; las cuatro juntas las reescriben.
//
// Y el PISO DEL TECHO (`POTENTIAL_FLOOR`) levanta la cola baja: los tres casos
// pican en 74, 76 y 72 contra 74, 77 y 59 de 1.31.0 — el wing francés, que cerraba
// en 59, es exactamente la carrera que el piso vino a sacar del sótano.
//
// Los tres cierran con 0 caps, igual que en 1.31.0: es el precio ya medido del
// mercado local (se juega más abajo y la convocatoria mira el nivel de la liga).
//
// Lo que hay que mirar cuando esto se mueva otra vez NO es el hash: es que el 90%
// de las carreras siga picando en 71 o más, que los trece invariantes de progresión
// sigan verdes y que la ⭐ siga variando por puesto (hay medición en el comentario
// de `STAR_BANDS`).
//
// De 1.30.0 a 1.31.0 se movió TODO, y era inevitable: cambió CÓMO SE SORTEA el
// mercado. Tres cosas, en orden de impacto:
//
//   · el sorteo es en DOS ETAPAS (primero el país, después el club), así que el
//     reparto dejó de depender de cuántos clubes tiene cada catálogo;
//   · se tapó el POZO de las escaleras: el peldaño siguiente del propio sistema
//     entra en la ventana aunque esté a tres o cinco escalones (había siete países
//     donde el sótano no tenía salida);
//   · el piso de ingreso de una competición (`minOvr` de la vía) ahora también lo
//     respeta la ventana.
//
// Lo que hay que mirar cuando esto se mueva otra vez NO es el hash. Son estas tres,
// que tienen test propio en `market-window.test.ts`: que ningún amateur reciba
// ofertas de otro país por ventana, que el reparto propio sea mayoría en las nueve
// nacionalidades medidas, y que el sótano de cada pirámide tenga salida.
//
// Los tres casos cierran con menos caps (0, 0, 0) que en 1.30.0, y eso es
// esperable: quedarse en el país propio significa jugar más abajo, y la
// convocatoria mira el nivel de la liga. Es el precio medido del reparto local — la
// contracara es que ya no hay neozelandeses de 18 debutando en Japón.
//
// De 1.29.0 a 1.30.0 el digest CUENTA EL ARREGLO, y conviene leerlo entero:
//
//   · pilar neozelandés — `firstClub` pasó de `kamaishi-seawaves` a `north-harbour`.
//     Debutaba en JAPÓN: un neozelandés de 18 en un club amateur aceptaba una
//     oferta japonesa que le llegaba por mercado abierto. Con la frontera cerrada
//     para el amateur se queda en el NPC, y desde ahí es otra carrera (18
//     temporadas, 4 títulos, 5 caps en vez de 34, cierra en Coventry).
//   · apertura argentino y wing francés — se movió SÓLO `stateHash`. Los otros once
//     campos, idénticos. Son el control: el primero arranca en Tarucas (franquicia
//     profesional, la frontera no lo toca) y el segundo en Richmond, y las ofertas
//     que reciben y rechazan viven en el estado, así que el hash se mueve sin que la
//     carrera cambie.
//
// Lo que hay que mirar cuando esto se mueva otra vez NO es el hash: es que ningún
// amateur tenga su primera temporada en otro continente, y que nadie quede sin
// mercado (hay tests de las dos cosas en `market-window.test.ts`).
//
// De `2026-27.7` a `2026-27.8` (sistema argentino de dos ramas) se movió UN SOLO
// CAMPO en los tres casos: `stateHash`. Los otros once —temporadas, edad de
// retiro, pico, caps, títulos, cantidad de clubes, primer y último club, empleo y
// decisiones— quedaron byte-idénticos.
//
// Y ese reparto es exactamente el esperado, no una casualidad afortunada. Ninguna
// de las tres carreras congeladas pasa por un club argentino: arrancan en Tarucas
// (franquicia SRA), Kamaishi y Richmond. Lo que cambió el catálogo es el POOL DE
// DESTINOS del mercado —224 clubes argentinos con divisiones y ratings nuevos, sin
// competición paraguas— así que las OFERTAS que las tres carreras reciben y
// rechazan son otras, y las ofertas viven en el estado. El camino recorrido es el
// mismo; la foto del estado, no.
//
// Si en un refresh futuro este cambio moviera además `firstClub` o `peakOvr`, eso
// NO sería catálogo: sería el motor, y habría que buscar qué se corrió.
//
// De 1.28.0 a 1.29.0 se movió TODO en los tres casos, y era inevitable por dos
// motivos que se suman: hay QUINCE DECISIONES NUEVAS en el pool (la familia de
// disciplina, el banco, el capitán lesionado, el verano con un ex Puma, la
// molestia del clásico…), así que el sorteo ponderado elige distinto desde la
// primera temporada; y los CLUBES ASCIENDEN Y DESCIENDEN, así que el campo de la
// liga, la banda y las copas pueden cambiar de un año al otro sin que el jugador
// se mueva de club.
//
// LO QUE SÍ SE MIDIÓ APARTE, y es la parte que había que probar: con la mecánica
// de los cinco ejes aplicada y ANTES de agregar el contenido, los tres casos
// movían SÓLO `engineVersion` y `stateHash` —los otros diez campos, idénticos—.
// O sea que `playingTime`, la suspensión y el premio de planilla no cambian una
// sola carrera mientras nadie los use, que es exactamente lo que se pedía de
// ellos: con cero escalones el factor es 1 exacto (hay test) y sin sanciones la
// disponibilidad no se toca.
//
// Tres cosas de esta tabla que son hallazgos y no ruido:
//
//   · el apertura cierra a los 34 y no a los 35. Es retiro ELEGIDO por el
//     `rotatingChooser`, que ahora tiene una decisión más entre la que elegir en
//     esa temporada. Sigue sin retirarse nadie por edad antes de los 39.
//   · el pilar neozelandés pasó de 22 a 34 caps, de 1 título a 3 y de compensado a
//     profesional, con un club menos. Es otra carrera entera (termina en Stormers
//     y no en Toulon), no un techo que se movió: el pico va de 84 a 85.
//   · el wing francés baja de 5 clubes a 3 y suma su primer título. Cambiar menos
//     de club es esperable con ascensos en el mapa: quedarse en un club que sube
//     puede ser mejor que aceptar una oferta lateral, y el chooser rotativo lo
//     capitaliza sin saberlo.
//
// De 1.21.0 a 1.22.0 se movió SÓLO el `stateHash` de los tres casos, y sólo
// porque el estado guarda `version`. Los otros diez campos están intactos en los
// tres, que es lo que había que comprobar: 1.22.0 absorbe parches que ya estaban
// aplicados y medidos en la línea de base de 1.21.0, así que el bump no podía
// mover comportamiento. Si alguno de esos diez se hubiera movido, habría querido
// decir que la intercalación de las dos sesiones dejó algo a medio aplicar.
//
// Línea de base anterior, motor 1.21.0 — el estado `trial`.
//
// Línea de base anterior, motor 1.20.0 — ver docs/career-engine.md §18.
//
// De 1.19.0 a 1.20.0 se movió UN SOLO caso de verdad, y es el que tenía que
// moverse: LOS CAPS SALEN DEL CALENDARIO INTERNACIONAL. Los otros dos son el
// control del cambio.
//
//   · pilar neozelandés — 64 → 65 caps. Nueva Zelanda juega 13 partidos por
//     temporada según el fixture (TRC 6 + Nations Championship 7 en los años
//     pares, TRC + ventana en los impares) contra los 11-13 que sorteaba la
//     tabla vieja. Un cap de diferencia en una temporada temprana mueve la fama,
//     con la fama se mueve el mercado y desde ahí la carrera es otra: termina en
//     Wellington y no en Suresnes, con 7 clubes y 4 títulos.
//   · apertura argentino y wing francés — se movió SÓLO `stateHash`, y sólo
//     porque el estado guarda `version`. Los otros diez campos están intactos:
//     ninguno de los dos llega a la selección, así que el calendario no tenía
//     nada que cambiarles. Son el control.
//
// Línea de base anterior, motor 1.17.0 — ver docs/career-engine.md §9.
//
// De 1.16.0 a 1.17.0 se movió TODO, y era el objetivo: el MERCADO pasó de
// aparecer en el 21% de las decisiones al 64%. Los tres casos cambian de club
// muchas más veces —el apertura pasó de 3 clubes a 8— y con cada pase se
// reordena la carrera entera. Lo que hay que mirar cuando esto se mueva otra vez
// NO es el hash: es que el reparto siga cerca de 65/35 (hay test) y que nadie
// se retire por edad antes de los 39.
//
// Línea de base anterior, motor 1.16.0 — ver docs/career-engine.md §9.
//
// De 1.15.0 a 1.16.0 se movió UN SOLO campo en los tres casos: `stateHash`, y
// sólo porque el estado creció (`player.nationalStats`) y guarda `version`. Los
// otros diez están intactos, y eso es exactamente lo que se buscaba: la planilla
// de selección sale de un rng RE-SEMBRADO (`semilla:nt-stats:temporada`), así
// que agregar una columna nueva no corrió el stream ni cambió una sola carrera.
//
// Línea de base anterior, motor 1.15.0 — ver docs/career-engine.md §9, §11, §12, §13, §15 y §16.
//
// De 1.14.0 a 1.15.0 se movió TODO, y era el objetivo: EL RETIRO PASÓ A SER UNA
// DECISIÓN. El `rotatingChooser` del test ahora tiene una opción más entre los
// 34 y los 38 —"Retirarte ahora"— y a veces la elige, así que dos de los tres
// casos cierran a los 34 por elección propia y no por un dado de la edad. El
// wing, que nunca la eligió, llegó a los 39: eso antes era imposible.
//
// Lo que hay que mirar cuando esta tabla se mueva de nuevo NO es el hash: es que
// nadie se retire por edad antes de los 39 y que nadie pase de los 39.
//
// Línea de base anterior, motor 1.14.0 — ver docs/career-engine.md §9, §11, §12, §13, §15 y §16.
//
// De 1.13.0 a 1.14.0 se movió UN SOLO campo en los tres casos: `stateHash`, y
// sólo porque el estado guarda `version`. La ranura del puesto de la tercera
// línea pasó de `turnovers` a `metres`, y ninguno de los tres casos es tercera
// línea (apertura, pilar, wing), así que el comportamiento no cambió en nada
// más. Los otros diez campos están intactos: eso es la prueba de que el cambio
// fue quirúrgico y no un daño colateral.
//
// De 1.12.0 a 1.13.0 se movió TODO, incluido el club inicial, y es esperable: el
// sorteo de techo agregó UNA tirada de rng por jugador (la lotería de talento) y
// esa tirada corre el stream para todo lo que viene después, empezando por la
// colocación en el primer club. No es que el club inicial dependa del techo: es
// que dejó de leer los mismos números.
//
// Lo que sí cambió por comportamiento es el nivel: el pilar neozelandés pasó de
// un pico de 78 a 87, con 85 caps y 6 títulos. Esa es la carrera excepcional que
// antes no podía existir, con `POTENTIAL_MAX` en 91.
//
// De 1.25.0 a 1.26.0 se movió TODO en los tres casos, y era inevitable: la rama de
// arranque ahora se SORTEA, y ese sorteo consume una tirada de rng antes que nada
// más. Todo lo que viene después lee números distintos, empezando por el origen y
// el primer club. Sumado a eso, los tres casos declaraban rutas que ya no existen
// en el mismo sentido y ahora arrancan los tres en un club amateur a los 18.
//
// Tres cosas para leer con cuidado en esta tabla, porque son hallazgos y no ruido:
//
//   · `firstClub` de los tres es un club `sb-*` (argentino) aunque las
//     nacionalidades sean ar, nz y fr. La CREACIÓN es correcta —el neozelandés
//     debuta en Buller y el francés en Luctonians, verificado— pero `history[0]`
//     es la primera temporada JUGADA, y con el chooser rotativo los tres aceptan un
//     pase en su primera decisión. El destino es argentino porque el pool de la
//     ventana son ~158 clubes `sa-ar` contra 12 de Heartland, y `proximityWeight`
//     los castiga con 0,5. Es el problema que `data/migration-corridors.ts` tiene
//     pendiente, no una regresión de esta versión.
//   · el apertura argentino pasó de un pico de 58 a 78 y el empleo de compensado a
//     semipro. Arrancaba a los 20 por la ruta amateur y ahora a los 18: son dos
//     temporadas más de crecimiento en la franja donde `youthDrive` vale más.
//   · el pilar neozelandés bajó de 90 a 81 y de 29 caps a 0. No es que el techo
//     baje: es otra carrera entera (otro origen, otro país de destino, ocho clubes
//     en vez de tres). El caso dejó de cubrir la ruta de selección de un tier 1, y
//     conviene cambiarle la semilla en la próxima pasada para recuperar cobertura.
//
// El detalle de por qué se movió cada versión anterior: §13 (1.11.0), §15 (1.12.0).
//
// De 1.11.0 a 1.12.0 el digest se movió DE VERDAD, y era el objetivo: el umbral
// de convocatoria dejó de ser un número global (63) y pasó a depender de la
// reputación de la unión y del vínculo del jugador. Eso cambia quién es
// convocado, y una convocatoria distinta corre el stream del RNG para el resto
// de la carrera — por eso también se mueven clubes, títulos y temporadas en los
// casos que tocan selección.
//
//   · apertura argentino — se movió SOLO `stateHash`, y sólo porque el estado
//     guarda `version`. Los otros diez campos están intactos: esa carrera no
//     llegaba a la selección antes ni llega ahora, así que no había nada que
//     cambiar. Es el control del cambio.
//   · pilar neozelandés — 77 → 64 caps. Nueva Zelanda es reputación 5: el
//     jugador ya no entra a los All Blacks en cuanto pasa 63, y la carrera se
//     reordena desde ahí.
//   · wing francés — 18 → 0 caps. Se retiró como `amateur-compensated` y
//     Francia también es reputación 5: un amateur no juega para Francia. Es
//     exactamente la regla nueva, no un daño colateral.
//
// De 1.10.0 a 1.11.0 se había movido un solo campo (`stateHash`) por el
// crecimiento del estado, y de 1.9.0 a 1.10.0 por el perfil de desarrollo. Los
// tests de autoconsistencia de arriba NO se tocaron nunca.
// De 1.27.0 a 1.28.0 se movió TODO en los tres, y era inevitable: el club inicial
// se elige AHORA ANTES que los atributos, porque el nivel a los 18 sale del club.
// Ese reordenamiento corre el stream del rng desde la primera tirada, así que las
// tres carreras leen números distintos de punta a punta.
//
// Tres cosas para leer con cuidado, porque son el cambio y no ruido:
//
//   · Los `firstClub` dejaron de ser todos `sb-*` argentinos. El apertura arranca
//     en Tarucas, el pilar en Kamaishi y el wing en Richmond: el club de arranque
//     ya no colapsa en el pool sudamericano, que era el problema anotado en la
//     línea de base anterior y que `data/migration-corridors.ts` tenía pendiente.
//   · Aparecieron los caps. El apertura suma 39 y el pilar 22, contra 20 y 0. No
//     es que la convocatoria se haya aflojado —la tabla de 1.27.0 no se tocó— sino
//     que estas tres carreras ahora llegan a niveles que antes no alcanzaban.
//   · El wing francés se quedó en 65 de pico y 4 clubes, sin caps. Es la carrera
//     que se queda abajo, y ahora existe: con la tolerancia de fichaje cerrada,
//     el que no da el nivel deja de subir de a un peldaño hasta la élite.
//
// Línea de base anterior, motor 1.27.0 — la tabla de debut bajó 6 puntos (§20).
const EXPECTED: Record<string, Digest> = {
    "apertura argentino": {
        engineVersion: '1.33.0',
        seasons: 17,
        retirementAge: 35,
        peakOvr: 93,
        caps: 162,
        titles: 6,
        clubs: 6,
        firstClub: 'redhurricanes-osaka',
        lastClub: 'petrarca',
        employment: 'semi-professional',
        decisions: 16,
        stateHash: 2525470483,
    },
    "pilar neozelandés": {
        engineVersion: '1.33.0',
        seasons: 20,
        retirementAge: 38,
        peakOvr: 68,
        caps: 0,
        titles: 0,
        clubs: 10,
        firstClub: 'manawatu',
        lastClub: 'perigueux',
        employment: 'semi-professional',
        decisions: 20,
        stateHash: 4142334828,
    },
    "wing francés": {
        engineVersion: '1.33.0',
        seasons: 21,
        retirementAge: 39,
        peakOvr: 82,
        caps: 11,
        titles: 1,
        clubs: 10,
        firstClub: 'carcassonne',
        lastClub: 'anglet',
        employment: 'amateur',
        decisions: 20,
        stateHash: 2970651146,
    },
};



// ── 1. AUTOCONSISTENCIA — estos tests NO se actualizan NUNCA ─────────────────
//
// No dependen de ningún valor esperado, así que sobreviven a cualquier cambio
// intencional del motor. Lo que atrapan es no-determinismo REAL: un Math.random
// que se escapó, una iteración sobre un Set sin ordenar, un Date. Si alguno de
// estos falla, no hay que actualizar nada: hay que arreglar el motor.

test('misma semilla + mismas decisiones ⇒ mismo digest', () => {
    for (const { name, input, seed } of CASES) {
        const a = digest(runCareer(input, seed, rotatingChooser));
        const b = digest(runCareer(input, seed, rotatingChooser));
        assert.deepEqual(b, a, `${name}: el digest cambió entre dos corridas de la misma semilla`);
    }
});

test('misma semilla + mismas decisiones ⇒ carrera idéntica', () => {
    for (const { name, input, seed } of CASES) {
        const a = runCareer(input, seed, rotatingChooser);
        const b = runCareer(input, seed, rotatingChooser);
        assert.deepEqual(b, a, `${name}: dos corridas de la misma semilla difieren`);
    }
});

test('la semilla importa: semillas distintas dan carreras distintas', () => {
    const { input, seed } = CASES[0];
    const a = runCareer(input, seed, rotatingChooser);
    const b = runCareer(input, seed + 1, rotatingChooser);
    assert.notEqual(
        hashSeed(JSON.stringify(b)),
        hashSeed(JSON.stringify(a)),
        'dos semillas distintas produjeron exactamente la misma carrera',
    );
});

test('el estado del RNG queda sellado al terminar', () => {
    for (const { name, input, seed } of CASES) {
        const state = runCareer(input, seed, rotatingChooser);
        assert.equal(state.seed, seed >>> 0, `${name}: la semilla original no se conserva`);
        assert.equal(typeof state.rngState, 'number');
        assert.ok(Number.isInteger(state.rngState) && state.rngState >= 0, `${name}: rngState no es un uint32`);
    }
});

// ── 2. Round-trip por JSON (la garantía real detrás del F5) ──────────────────

/** Corre una carrera paso a paso, opcionalmente pasando por JSON en cada paso. */
function playThrough(input: CreatePlayerInput, seed: number, throughJson: boolean): CareerState {
    let state = runCareerFirstStep(input, seed);
    let guard = 0;
    while (state.phase !== 'retired' && guard < 60) {
        guard++;
        if (throughJson) state = JSON.parse(JSON.stringify(state)) as CareerState;
        const event = getPendingEvent(state);
        state = event
            ? careerReducer(state, { type: 'CHOOSE', optionId: rotatingChooser(event, state) })
            : careerReducer(state, { type: 'ADVANCE' });
    }
    return state;
}

function runCareerFirstStep(input: CreatePlayerInput, seed: number): CareerState {
    // `runCareer` con maxSeasons 0 no expone el estado inicial, así que se
    // reconstruye con el reducer, que es el mismo camino que usa la UI.
    return careerReducer({} as CareerState, { type: 'START', input, seed });
}

test('serializar a JSON a mitad de carrera no cambia el resultado', () => {
    for (const { name, input, seed } of CASES) {
        const direct = playThrough(input, seed, false);
        const roundTripped = playThrough(input, seed, true);
        assert.deepEqual(roundTripped, direct, `${name}: la carrera cambió al pasar por JSON`);
    }
});

test('CareerState es JSON puro (sin Date, Map, Set ni funciones)', () => {
    for (const { name, input, seed } of CASES) {
        const state = runCareer(input, seed, rotatingChooser);
        // `ancestros` es una PILA, no un registro de todo lo visto: el motor
        // comparte referencias a propósito (una lesión vive a la vez en
        // `player.injuries` y en `seasons[i].injuries`). Eso es aliasing, no un
        // ciclo, y JSON lo maneja sin problema.
        const ancestros = new Set<unknown>();
        const walk = (value: unknown, path: string): void => {
            if (value === null || typeof value !== 'object') {
                assert.notEqual(typeof value, 'function', `${name}: función en ${path}`);
                assert.notEqual(typeof value, 'symbol', `${name}: symbol en ${path}`);
                assert.notEqual(typeof value, 'bigint', `${name}: bigint en ${path}`);
                assert.ok(!Object.is(value, -0), `${name}: -0 en ${path} (JSON lo colapsa a 0)`);
                return;
            }
            assert.ok(!ancestros.has(value), `${name}: referencia circular en ${path}`);
            ancestros.add(value);
            assert.ok(!(value instanceof Date), `${name}: Date en ${path}`);
            assert.ok(!(value instanceof Map), `${name}: Map en ${path}`);
            assert.ok(!(value instanceof Set), `${name}: Set en ${path}`);
            for (const [key, child] of Object.entries(value)) walk(child, `${path}.${key}`);
            ancestros.delete(value);
        };
        walk(state, 'state');
    }
});

// ── 3. Digest congelado — este SÍ se actualiza en cada cambio intencional ────

// Los tres casos se comparan ANTES de fallar, y el fallo los lista a todos.
//
// Con un `assert` adentro del bucle, el primer caso que no coincide corta la
// corrida y los siguientes no se evalúan nunca: el test decía "falla el pilar"
// cuando en realidad también estaba roto el wing, y eso cambia el diagnóstico
// —un caso movido es una regresión localizada; dos, un cambio de stream— que es
// justo lo que este test tiene que dar de entrada.
test('digest congelado: el comportamiento del motor no cambió sin querer', () => {
    const movidos = CASES
        .map(({ name, input, seed }) => ({ name, actual: digest(runCareer(input, seed, rotatingChooser)) }))
        .filter(({ name, actual }) => !isDeepStrictEqual(actual, EXPECTED[name]));

    assert.deepEqual(
        movidos.map((m) => m.name),
        [],
        `cambió el comportamiento del motor en ${movidos.length} de ${CASES.length} casos: ${movidos.map((m) => m.name).join(', ')}.\n`
        + 'Si el cambio es INTENCIONAL: actualizá EXPECTED con estos valores, '
        + 'subí ENGINE_VERSION y refrescá la tabla de docs/career-engine.md §9.\n'
        + movidos.map((m) => `\n${m.name}\n  obtenido: ${JSON.stringify(m.actual)}\n  esperado: ${JSON.stringify(EXPECTED[m.name])}`).join(''),
    );
});

test('una carrera completa termina retirada y con historia coherente', () => {
    for (const { name, input, seed } of CASES) {
        const state = runCareer(input, seed, rotatingChooser);
        assert.equal(state.phase, 'retired', `${name}: no llegó al retiro`);
        assert.ok(state.player.retired, `${name}: el jugador no quedó marcado como retirado`);
        assert.ok(state.player.retirementReason, `${name}: el retiro no tiene causa`);
        assert.equal(state.history.length, state.seasons.length, `${name}: history y seasons desalineados`);
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
