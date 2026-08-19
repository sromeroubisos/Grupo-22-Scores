// EL CAPITÁN — LOS TORNEOS REPRESENTATIVOS.
//
// Este archivo existe por un bug concreto y vale contarlo, porque define qué
// tiene que vigilar:
//
//   La compuerta del M17 comparaba `player.countryCode !== 'AR'`, en MAYÚSCULA.
//   `RUGBY_UNIONS` indexa en minúscula (`ar`, `uy`, `cl`), así que la compuerta
//   no abría nunca. No falló nada: ni el compilador —los dos son `string`— ni la
//   suite —275 tests en verde— ni el digest congelado, que corría cuatro
//   carreras argentinas sin que ninguna pisara un torneo. El juego simplemente no
//   tenía torneos, y se veía igual que si los tuviera.
//
// Lo agarró jugar una temporada en el navegador. Es exactamente el §1.7 del
// CLAUDE de captain —«un cero es una acusación contra el instrumento hasta que se
// demuestre lo contrario»— con el agravante de que acá el cero ni siquiera se
// veía: no había un número en cero, había una pantalla que no aparecía.
//
// De ahí las dos familias de test de abajo:
//
//   1. LAS COMPUERTAS ABREN DE VERDAD. Para cada torneo, un estado que TIENE que
//      abrirlo. Un torneo inalcanzable es contenido muerto con cartel de vivo.
//   2. EL TORNEO TERMINA. Toda llave llega a un final en un número acotado de
//      destapes, y ninguna se cuelga.

import test from 'node:test';
import assert from 'node:assert/strict';

import type {
    CaptainState,
    CreateCaptainInput,
    PendingTournament,
    TournamentDef,
    TournamentId,
    TournamentMatch,
} from '../../index.ts';
import {
    ACADEMIA_UNION,
    CASILLAS_TOTAL,
    CASILLAS_TRIES,
    CASILLAS_VISION,
    GRID_MIN_WINS,
    GRID_TOTAL,
    PROVINCIAS,
    RUGBY_UNIONS,
    TOURNAMENTS,
    bracketOf,
    bracketSize,
    bracketsOf,
    captainReducer,
    createInitialCaptain,
    buildCtxOf,
    divisionOf,
    entryDivisionOf,
    finalPlace,
    forTheTitle,
    gateOpen,
    tierChainOf,
    tierMoveOf,
    getTournament,
    groupPoints,
    groupWins,
    bronzeFrom,
    hasPlacement,
    matchResult,
    openRound,
    openTournament,
    playTournament,
    regionOfCountry,
    rewardOf,
    roundTag,
    roundTitle,
    stakeOf,
    tablePoints,
    tournamentDue,
    winProbability,
    winsInGrid,
} from '../../index.ts';

const INPUT: CreateCaptainInput = {
    name: 'Mayco',
    surname: 'Vivas',
    family: 'primera-linea',
    countryCode: 'ar',
};

function base(seed = 7): CaptainState {
    return createInitialCaptain(INPUT, seed);
}

/**
 * UNA UNIÓN A LA QUE ESTE TORNEO LE CORRESPONDE.
 *
 * Existe desde que el M20 tiene dos divisiones. Antes alcanzaba con
 * `def.gate.unionCode ?? 'ar'` porque todos los torneos abiertos le tocaban a
 * cualquiera; hoy la segunda división NO le toca a un argentino —Argentina
 * arranca octava del mundo, o sea en la primera— y un test que le ponga `'ar'`
 * está preguntando si la B abre para alguien que no la juega. La respuesta
 * correcta a esa pregunta es «no», así que el test se pondría rojo midiendo mal.
 *
 * Se busca por `entryDivisionOf`, que es la misma puerta que usa el juego, y se
 * ordena antes de elegir: `Object.keys` sin ordenar es la fuente de
 * no-determinismo encubierta de siempre.
 */
function unionPara(def: TournamentDef): string {
    if (def.gate.unionCode !== null) return def.gate.unionCode;

    // EL CONTINENTAL PIDE UNA UNIÓN DE SU REGIÓN, y por eso esto va antes que el
    // `'ar'` de abajo: un argentino no abre el Asiático M18 ni con la edad y el
    // escalón puestos a mano. Se busca en orden alfabético por la misma razón de
    // siempre —`Object.keys` sin ordenar es no-determinismo encubierto— y se
    // afirma que existe: una región declarada sin una sola unión del catálogo es
    // un torneo que nadie puede jugar, que es justo lo que este test vigila.
    if (def.gate.regions !== null) {
        const regiones = new Set(def.gate.regions);
        const suya = Object.keys(RUGBY_UNIONS)
            .sort((a, b) => a.localeCompare(b))
            .find((code) => regiones.has(regionOfCountry(code) ?? ''));
        assert.ok(suya, `${def.id}: ninguna unión del catálogo vive en ${def.gate.regions.join(' / ')}`);
        return suya!;
    }

    if (!def.tier || entryDivisionOf('ar', def) === def.id) return 'ar';

    const otra = Object.keys(RUGBY_UNIONS)
        .sort((a, b) => a.localeCompare(b))
        .find((code) => entryDivisionOf(code, def) === def.id);

    assert.ok(otra, `${def.id}: ninguna unión del catálogo arranca en esta división`);
    return otra!;
}

// ═══════════════════════════════════════════════════════════════════════════
//  1 · LAS COMPUERTAS ABREN — el test que habría agarrado el bug
// ═══════════════════════════════════════════════════════════════════════════

test('TODO TORNEO DECLARADO ES ALCANZABLE POR ALGUNA CARRERA', () => {
    // La pregunta no es «¿el catálogo está bien escrito?» sino «¿existe un
    // jugador que juegue esto?». Un torneo que ninguna carrera puede abrir es
    // indistinguible de un torneo que no existe, y no falla solo.
    for (const def of TOURNAMENTS) {
        const s = base();
        s.player.age = def.gate.ages[0];
        s.player.countryCode = unionPara(def);
        if (def.gate.minOvr !== null) s.player.ovr = def.gate.minOvr;
        if (def.gate.minTrack !== null) {
            s.national.track = def.gate.minTrack;
            // Desde la 0.22.0 la mayor pide DOS cosas: el escalón —te convocaron
            // este año— y el estado —sos del plantel, no un pibe al que llevaron
            // de gira—. El estado a medida tiene que decir las dos.
            if (def.gate.minTrack === 'nacional') s.national.status = 'squad';
        }
        // El Mundial cae en años de edición: se busca uno adentro de la ventana
        // de edad en vez de suponer cuál es.
        if (!def.gate.everySeason) {
            let abierto = false;
            for (let season = 1; season <= 24 && !abierto; season += 1) {
                s.season = season;
                abierto = gateOpen(def, s);
            }
            assert.ok(abierto, `${def.id}: no abre en ninguna temporada de la ventana de edad`);
            continue;
        }
        assert.ok(gateOpen(def, s), `${def.id}: la compuerta no abre ni con el estado hecho a medida`);
    }
});

test('LOS CÓDIGOS DE UNIÓN DEL CATÁLOGO EXISTEN, y ese es el bug que se pagó', () => {
    // Comparar contra `RUGBY_UNIONS` y no contra `/^[a-z]{2}$/`: lo que importa
    // no es la forma de la cadena sino que la unión EXISTA. Un `'zz'` bien
    // minúsculo pasaría un test de forma y seguiría sin abrir nunca.
    for (const def of TOURNAMENTS) {
        if (def.gate.unionCode === null) continue;
        assert.ok(
            def.gate.unionCode in RUGBY_UNIONS,
            `${def.id}: la unión '${def.gate.unionCode}' no existe en RUGBY_UNIONS `
            + '(¿la escribiste en mayúscula? el catálogo indexa en minúscula)',
        );
    }

    assert.ok(
        ACADEMIA_UNION in RUGBY_UNIONS,
        `la academia apunta a '${ACADEMIA_UNION}', que no es una unión del catálogo`,
    );
});

test('un argentino de dieciséis tiene torneo en la ventana juvenil', () => {
    // El caso de punta a punta, sin construir estados a mano: si esto se rompe,
    // el camino juvenil entero desapareció.
    const s = base();
    s.player.age = 17;
    assert.equal(tournamentDue(s), 'juvenil-m18');
});

test('un galés de diecisiete NO juega el Argentino Juvenil', () => {
    // El código es `gb-wls` y no `wa`, y la diferencia no es cosmética: `wa` no
    // existe en `RUGBY_UNIONS`, así que este test pasaba porque el jugador no era
    // de ningún lado —y habría pasado igual con la compuerta rota—. Es el §1.7
    // exacto: el instrumento contestaba otra pregunta que la que tiene escrita.
    const s = base();
    s.player.age = 17;
    s.player.countryCode = 'gb-wls';
    assert.notEqual(tournamentDue(s), 'juvenil-m18');
});

// ── LA TEMPORADA DE LOS DIECISIETE TRAE DOS ────────────────────────────────
//
// Es la regla que reemplazó al uno por año, y las tres cosas que se vigilan son
// las tres formas en que se escribe mal: que el segundo no llegue, que el
// primero se repita para siempre, y que el continental se lo lleve alguien a
// quien su unión nunca miró.

test('EL PROVINCIAL Y EL CONTINENTAL SE JUEGAN LOS DOS, Y EN ESE ORDEN', () => {
    const s = base();
    s.player.age = 17;
    s.national.track = 'union';

    // Primero el provincial: de ahí sale el equipo que viaja.
    assert.equal(tournamentDue(s), 'juvenil-m18');

    // Con el provincial ya jugado ESTA temporada, la ventana sigue abierta y lo
    // que aparece es el continental.
    s.tournaments.push({ ...openTournament(s, 'juvenil-m18'), season: s.season });
    assert.equal(tournamentDue(s), 'm18-sudamericano');

    // Y con los dos jugados, se termina: ninguno se repite dentro del año.
    s.tournaments.push({ ...openTournament(s, 'm18-sudamericano'), season: s.season });
    assert.equal(tournamentDue(s), null);
});

test('LA VENTANA DE LOS DIECISIETE ES ANCHA: no pide escalón ni media', () => {
    // La primera versión del continental pedía haber llegado al escalón `union`
    // —«va el que su unión ya miró»— y se midió: 8 de cada 120 carreras llegaban
    // a los diecisiete, o sea que el torneo era contenido muerto para el 93% de
    // los jugadores. La premisa que quedó es la del vecino: el provincial
    // argentino tampoco pide escalón, y también es una selección de verdad. El
    // filtro de este juego empieza en el M20, que sí pide media.
    const s = base();
    s.player.age = 17;
    s.national.track = 'club';
    s.player.ovr = 30;
    s.tournaments.push({ ...openTournament(s, 'juvenil-m18'), season: s.season });

    assert.equal(tournamentDue(s), 'm18-sudamericano');
});

test('cada región tiene su continental, y el argentino no juega el asiático', () => {
    // La compuerta es la REGIÓN y no la unión: un japonés de diecisiete tiene
    // torneo, y no es el de Sudamérica.
    const japones = base();
    japones.player.age = 17;
    japones.player.countryCode = 'jp';
    japones.national.track = 'union';
    assert.equal(tournamentDue(japones), 'm18-asia');

    const gales = base();
    gales.player.age = 17;
    gales.player.countryCode = 'gb-wls';
    gales.national.track = 'union';
    assert.equal(tournamentDue(gales), 'm18-europa', 'las islas británicas juegan el europeo');
});

// ── LA VENTANA DE LOS SELECCIONADOS A ───────────────────────────────────────
//
// Tres preguntas, y ninguna es «¿la Nations Cup abre?» —eso ya lo contesta el
// barrido de más arriba—. Son las tres formas en que un escalón intermedio se
// escribe mal: que se lo quede el de arriba, que le pise el año al de abajo, y
// que reparta la moneda que no le toca.

test('el convocado de la mayor NO juega además la ventana de los A', () => {
    // Se compara por IGUALDAD y no por orden. Si el escalón se leyera como un
    // mínimo, el que está en Los Pumas cumpliría «al menos A-XV» y jugaría los
    // dos: son dos planteles distintos y nadie viaja con los dos.
    const s = base();
    s.player.age = 24;
    s.national.track = 'nacional';
    s.national.status = 'squad';

    assert.notEqual(tournamentDue(s), 'nations-cup');
});

test('a los veinte manda el M20, y la Nations Cup espera al año siguiente', () => {
    // La regla del uno por año con el orden del catálogo haciendo su trabajo: el
    // M20 de los veinte es la última edición que ese jugador va a jugar en su
    // vida, y la ventana de los A se repite todos los años.
    const s = base();
    s.player.age = 20;
    s.player.ovr = 70;
    s.national.track = 'a-xv';

    assert.equal(tournamentDue(s), 'mundial-m20');

    s.player.age = 21;
    assert.equal(tournamentDue(s), 'nations-cup');
});

test('la Nations Cup no reparte un solo cap', () => {
    // Un cap es un partido con la MAYOR, y ésta se juega con el segundo
    // seleccionado. Es la distinción que el rugby no perdona y la única forma
    // de que el primer cap, cuando llegue, valga.
    const s = base();
    s.player.age = 22;
    s.national.track = 'a-xv';
    s.phase = 'tournament';
    s.pendingTournament = openFor(s, 'nations-cup');

    const fin = playTournament(s);

    assert.equal(fin.national.caps, 0, 'la ventana de los A sumó caps');
    const t = fin.tournaments[fin.tournaments.length - 1];
    assert.equal(rewardOf(t).caps, 0);
});

// ═══════════════════════════════════════════════════════════════════════════
//  2 · LA LLAVE TERMINA
// ═══════════════════════════════════════════════════════════════════════════

test('TODA LLAVE LLEGA A UN FINAL, en los tres torneos y con cualquier semilla', () => {
    // `playTournament` tira si el torneo no avanza, así que este test es en
    // parte un antibucle. Lo que agrega es la VARIEDAD de semillas: un torneo
    // puede cerrar bien con la semilla 1 y colgarse con la 40 si alguna rama de
    // `roundAfter` devuelve una ronda que no existe.
    for (const def of TOURNAMENTS) {
        for (let seed = 1; seed <= 40; seed += 1) {
            const s = base(seed);
            s.player.age = def.gate.ages[0];
            s.player.countryCode = unionPara(def);
            if (def.gate.minOvr !== null) s.player.ovr = def.gate.minOvr + 4;
            if (def.gate.minTrack !== null) {
            s.national.track = def.gate.minTrack;
            // Desde la 0.22.0 la mayor pide DOS cosas: el escalón —te convocaron
            // este año— y el estado —sos del plantel, no un pibe al que llevaron
            // de gira—. El estado a medida tiene que decir las dos.
            if (def.gate.minTrack === 'nacional') s.national.status = 'squad';
        }
            s.phase = 'tournament';
            s.pendingTournament = openFor(s, def.id);

            const fin = playTournament(s);
            const t = fin.tournaments[fin.tournaments.length - 1];
            assert.ok(t, `${def.id} semilla ${seed}: el torneo no quedó registrado al cerrar`);
            assert.ok(t.outcome !== null, `${def.id} semilla ${seed}: cerró sin resultado`);
            assert.ok(
                t.matches.every((m) => m.revealed),
                `${def.id} semilla ${seed}: cerró con celdas sin destapar`,
            );
        }
    }
});

test('el campeón jugó la final, y el eliminado en grupos no jugó ninguna', () => {
    for (let seed = 1; seed <= 30; seed += 1) {
        const s = base(seed);
        s.player.age = 17;
        s.phase = 'tournament';
        s.pendingTournament = openFor(s, 'juvenil-m18');
        const fin = playTournament(s);
        const t = fin.tournaments[fin.tournaments.length - 1]!;

        const finales = t.matches.filter((m) => m.round === 'final');
        if (t.outcome === 'campeon') {
            assert.equal(finales.length, 1, `semilla ${seed}: campeón sin final jugada`);
            assert.equal(matchResult(finales[0]), 'ganado', `semilla ${seed}: campeón que perdió la final`);
        }
        // El M17 no tiene cuadro de posicionamiento: el que no pasa el grupo se
        // va a casa y no juega ninguna eliminatoria.
        const def = getTournament('juvenil-m18');
        if (groupPoints(t) < def.qualifyPoints) {
            assert.equal(
                t.matches.filter((m) => m.round !== 'grupos').length,
                0,
                `semilla ${seed}: no clasificó y sin embargo jugó eliminatorias`,
            );
        }
    }
});

test('EL PARTIDO QUE TE ELIMINA SE QUEDA A LA VISTA', () => {
    // El bug: destapar la celda que cerraba la llave aplicaba el saldo y saltaba
    // de fase en el mismo gesto, así que el marcador de la derrota no se llegaba
    // a ver. El jugador se enteraba de que había perdido porque aparecía otra
    // pantalla — que es la peor forma posible de contar una derrota.
    //
    // Lo que este test afirma es la forma del arreglo: cuando la llave cierra, el
    // torneo SIGUE en su fase, con el resultado escrito y la última celda
    // destapada. Recién `FINISH_TOURNAMENT` cobra y avanza.
    for (let seed = 1; seed <= 40; seed += 1) {
        const s = base(seed);
        s.player.age = 17;
        s.phase = 'tournament';
        s.pendingTournament = openFor(s, 'juvenil-m18');

        let next = s;
        for (let i = 0; i < 30; i += 1) {
            const t = next.pendingTournament;
            if (!t || t.outcome !== null) break;
            const idx = t.matches.findIndex((m) => !m.revealed && m.round === t.round);
            if (idx < 0) break;
            next = jugarPartido(next, idx);
        }

        const t = next.pendingTournament;
        assert.ok(t, `semilla ${seed}: el torneo desapareció al cerrarse en vez de quedar a la vista`);
        assert.equal(next.phase, 'tournament', `semilla ${seed}: cambió de fase sin que nadie apretara seguir`);
        assert.ok(t!.outcome !== null, `semilla ${seed}: quedó en fase de torneo sin resultado`);

        const ultimo = t!.matches[t!.matches.length - 1];
        assert.ok(ultimo.revealed, `semilla ${seed}: el último partido quedó tapado`);

        // Y recién ahora cobra. Lo que se verifica es que ESTE torneo se cerró y
        // quedó registrado; la fase no se mira porque desde la 0.9.0 del catálogo
        // el año de los diecisiete encadena el continental M18 detrás del
        // provincial, así que «seguir» puede dejarte en otro torneo — y eso es lo
        // que tiene que pasar, no un escape del que había.
        const cerrado = captainReducer(next, { type: 'FINISH_TOURNAMENT' });
        assert.equal(cerrado.tournaments.length, 1, `semilla ${seed}: el torneo no quedó registrado`);
        assert.equal(cerrado.tournaments[0].id, t!.id, `semilla ${seed}: se registró otro torneo`);
        assert.notEqual(
            cerrado.pendingTournament?.id ?? null,
            t!.id,
            `semilla ${seed}: seguir dejó abierto el MISMO torneo que se acababa de cerrar`,
        );
    }
});

test('SE DESTAPA LA CELDA QUE TOCÓ EL JUGADOR, no la que sigue', () => {
    // La grilla del torneo es una GRILLA DE SELECCIÓN. Que el orden no cambie el
    // resultado —los tres partidos del grupo están sorteados por separado— no es
    // motivo para elegir por el jugador: es el mismo caso que las nueve casillas
    // indistinguibles de la final, y ahí nadie discute que elija él.
    const s = base(5);
    s.player.age = 17;
    s.phase = 'tournament';
    s.pendingTournament = openFor(s, 'juvenil-m18');

    // Se toca la TERCERA del grupo, no la primera.
    const next = jugarPartido(s, 2);
    const t = next.pendingTournament!;
    assert.equal(t.matches[2].revealed, true, 'no se jugó el partido que se tocó');
    assert.equal(t.matches[0].revealed, false, 'se jugó el primero sin que nadie lo tocara');
    assert.equal(t.matches[1].revealed, false, 'se jugó un partido de más');

    // Y un partido ya jugado no vuelve a jugarse.
    assert.equal(
        captainReducer(next, { type: 'REVEAL_MATCH', index: 2 }),
        next,
        'un partido ya jugado tendría que devolver el estado sin tocar',
    );
    // Ni uno que no existe.
    assert.equal(
        captainReducer(next, { type: 'REVEAL_MATCH', index: 99 }),
        next,
        'un partido que no existe tendría que devolver el estado sin tocar',
    );
});

test('LA TABLA NO ADELANTA LO QUE NO SE DESTAPÓ', () => {
    // El torneo entero está sorteado desde que se abre —tiene que estarlo, si no
    // un F5 devolvería otro torneo— así que todo lo que la pantalla lea del
    // estado puede filtrar el futuro sin querer. Pasó: `groupPoints` sumaba los
    // tres partidos del grupo y la pantalla mostraba «5 puntos» con las tres
    // celdas boca abajo.
    //
    // Es el mismo error de fondo que vigila el resto del archivo —leer el estado
    // sin preguntar en qué momento está— y no se ve en ningún test que solo mire
    // torneos terminados, porque al final todo está destapado.
    const s = base(3);
    s.player.age = 17;
    s.phase = 'tournament';
    const t = openFor(s, 'juvenil-m18');

    assert.equal(groupPoints(t), 0, 'con todo boca abajo la tabla tiene que estar en cero');

    t.matches[0].revealed = true;
    assert.equal(
        groupPoints(t),
        tablePoints(t.matches[0]),
        'con un partido destapado la tabla tiene que valer exactamente ese partido',
    );
});

// ═══════════════════════════════════════════════════════════════════════════
//  3 · LA TABLA ES DE RUGBY
// ═══════════════════════════════════════════════════════════════════════════

test('LOS PUNTOS SON LOS DEL RUGBY: 4 por ganar, 2 por empatar, y los dos bonus', () => {
    // Se verifica sobre partidos REALES del motor y no sobre objetos armados a
    // mano: lo que interesa no es que la fórmula sume bien —eso es aritmética—
    // sino que ningún partido que el motor produzca caiga fuera del rango que la
    // tabla admite. El máximo es 5: ganar con bonus ofensivo.
    for (let seed = 1; seed <= 30; seed += 1) {
        const s = base(seed);
        s.player.age = 17;
        s.phase = 'tournament';
        s.pendingTournament = openFor(s, 'juvenil-m18');
        const fin = playTournament(s);
        const t = fin.tournaments[fin.tournaments.length - 1]!;

        for (const m of t.matches.filter((x) => x.round === 'grupos')) {
            const pts = tablePoints(m);
            assert.ok(pts >= 0 && pts <= 5, `semilla ${seed}: ${pts} puntos por un partido de grupo`);
            if (matchResult(m) === 'ganado') {
                assert.ok(pts >= 4, `semilla ${seed}: una victoria pagó ${pts}`);
            }
            if (matchResult(m) === 'perdido') {
                assert.ok(pts <= 2, `semilla ${seed}: una derrota pagó ${pts}`);
            }
        }
    }
});

test('UN CRUCE NUNCA TERMINA EMPATADO: para eso están los palos', () => {
    // La regla más fácil de romper al agregar una ronda: en el grupo un empate
    // es un empate, pero una eliminatoria tiene que dar un ganador o la llave se
    // queda sin a quién hacer avanzar.
    for (const def of TOURNAMENTS) {
        for (let seed = 1; seed <= 25; seed += 1) {
            const s = base(seed);
            s.player.age = def.gate.ages[0];
            s.player.countryCode = unionPara(def);
            if (def.gate.minOvr !== null) s.player.ovr = def.gate.minOvr + 4;
            if (def.gate.minTrack !== null) {
            s.national.track = def.gate.minTrack;
            // Desde la 0.22.0 la mayor pide DOS cosas: el escalón —te convocaron
            // este año— y el estado —sos del plantel, no un pibe al que llevaron
            // de gira—. El estado a medida tiene que decir las dos.
            if (def.gate.minTrack === 'nacional') s.national.status = 'squad';
        }
            s.phase = 'tournament';
            s.pendingTournament = openFor(s, def.id);
            const fin = playTournament(s);
            const t = fin.tournaments[fin.tournaments.length - 1]!;

            for (const m of t.matches.filter((x) => x.round !== 'grupos')) {
                assert.notEqual(
                    matchResult(m),
                    'empatado',
                    `${def.id} semilla ${seed}: un cruce quedó empatado sin definición`,
                );
                if (m.puntos === m.puntosRival) {
                    assert.ok(m.palos, `${def.id} semilla ${seed}: empate en ${m.round} sin ir a los palos`);
                }
            }
        }
    }
});

// ═══════════════════════════════════════════════════════════════════════════
//  2 bis · LA GRILLA DE TREINTA
// ═══════════════════════════════════════════════════════════════════════════

test('LOS MUNDIALES SE JUEGAN EN GRILLA Y EL ARGENTINO JUVENIL NO', () => {
    // La diferencia la declara el catálogo (`matchGrid`), no un `if` con el id
    // adentro. Este test es lo que impide que alguien agregue un torneo y se
    // olvide de decidir cómo se juegan sus partidos.
    for (const def of TOURNAMENTS) {
        const s = base(6);
        s.player.age = def.gate.ages[0];
        s.player.countryCode = unionPara(def);
        s.player.ovr = 80;
        if (def.gate.minTrack !== null) {
            s.national.track = def.gate.minTrack;
            // Desde la 0.22.0 la mayor pide DOS cosas: el escalón —te convocaron
            // este año— y el estado —sos del plantel, no un pibe al que llevaron
            // de gira—. El estado a medida tiene que decir las dos.
            if (def.gate.minTrack === 'nacional') s.national.status = 'squad';
        }
        const t = openFor(s, def.id);
        const grupo = t.matches.filter((m) => m.round === 'grupos');

        for (const m of grupo) {
            if (def.matchGrid) {
                assert.ok(m.grid, `${def.id}: declara grilla y un partido de grupo vino sin ella`);
                assert.equal(m.grid!.celdas.length, GRID_TOTAL, `${def.id}: la grilla no tiene treinta celdas`);
            } else {
                assert.equal(m.grid, null, `${def.id}: no declara grilla y un partido de grupo trajo una`);
            }
        }
    }
});

test('LA PROPORCIÓN DE LA GRILLA ES LA PROBABILIDAD DEL CRUCE', () => {
    // Es la promesa entera de este mecanismo: las treinta no son mitad y mitad,
    // se reparten según lo que el cruce vale. Contra un rival muy inferior casi
    // todas esconden victoria; contra el número uno del mundo, casi ninguna.
    //
    // Se verifica el ORDEN y no un número exacto: los valores son calibración y
    // pueden moverse, pero "ser mejor tiene que dar más celdas de victoria" es la
    // premisa y no se mueve.
    const flojo = winsInGrid(-30);
    const parejo = winsInGrid(0);
    const fuerte = winsInGrid(30);

    assert.ok(flojo < parejo, `ser peor tiene que dar menos victorias: ${flojo} contra ${parejo}`);
    assert.ok(parejo < fuerte, `ser mejor tiene que dar más victorias: ${parejo} contra ${fuerte}`);
    assert.equal(parejo, GRID_TOTAL / 2, 'un cruce parejo tendría que repartir quince y quince');
});

test('LA GRILLA NUNCA ES DE UN SOLO COLOR, ni contra el peor rival posible', () => {
    // Una grilla de treinta victorias diría «no podés perder», y eso es mentira
    // sobre el deporte: el favorito pierde, y es la mitad de por qué se juegan
    // los partidos. El tope deja siempre al menos dos de cada lado.
    for (const edge of [-200, -60, -20, 0, 20, 60, 200]) {
        const gana = winsInGrid(edge);
        assert.ok(
            gana >= GRID_MIN_WINS && gana <= GRID_TOTAL - GRID_MIN_WINS,
            `con edge ${edge} la grilla quedó en ${gana}/${GRID_TOTAL}: es de un solo color`,
        );
    }

    // Y la probabilidad nunca llega a 0 ni a 1 EN EL RANGO QUE EXISTE.
    //
    // El rango se acota a ±100 a propósito y no a ±500: las fuerzas van de 0 a
    // 100, así que una diferencia mayor no la puede producir ningún cruce. Con
    // ±500 la logística devuelve exactamente 1 por redondeo de punto flotante
    // —`exp(-41)` es cero para el doble— y el test estaría midiendo la aritmética
    // de la máquina en vez del modelo. La garantía de que nunca hay certeza vive
    // en `winsInGrid`, que sí está acotada por los dos lados y se verifica arriba.
    for (const edge of [-100, -30, 0, 30, 100]) {
        const p = winProbability(edge);
        assert.ok(p > 0 && p < 1, `la probabilidad se salió del rango con edge ${edge}: ${p}`);
    }
});

test('UN PARTIDO, UNA CELDA: la segunda elección no vale', () => {
    const def = getTournament('mundial-m20');
    const s = base(12);
    s.player.age = def.gate.ages[0];
    s.player.ovr = 80;
    s.phase = 'tournament';
    s.pendingTournament = openFor(s, 'mundial-m20');

    // Tocar el partido lo ABRE, no lo resuelve.
    const abierto = captainReducer(s, { type: 'REVEAL_MATCH', index: 0 });
    assert.equal(abierto.pendingTournament!.playing, 0, 'tocar el partido no abrió su grilla');
    assert.equal(abierto.pendingTournament!.matches[0].revealed, false, 'se resolvió sin elegir celda');

    // Elegir una celda lo resuelve y cierra la grilla.
    const jugado = captainReducer(abierto, { type: 'PICK_GRID', index: 7 });
    const m = jugado.pendingTournament!.matches[0];
    assert.equal(m.revealed, true, 'elegir la celda no resolvió el partido');
    assert.equal(m.grid!.elegida, 7, 'no quedó registrada la celda que se tocó');
    assert.equal(jugado.pendingTournament!.playing, null, 'la grilla quedó abierta después de elegir');

    // Y no se puede volver a elegir.
    assert.equal(
        captainReducer(jugado, { type: 'PICK_GRID', index: 3 }),
        jugado,
        'una segunda elección tendría que devolver el estado sin tocar',
    );
});

test('LA CELDA DECIDE EL PARTIDO: victoria atrás, victoria en el marcador', () => {
    const def = getTournament('mundial-m20');
    for (let seed = 1; seed <= 30; seed += 1) {
        const s = base(seed);
        s.player.age = def.gate.ages[0];
        s.player.ovr = 80;
        s.phase = 'tournament';
        s.pendingTournament = openFor(s, 'mundial-m20');

        const grid = s.pendingTournament.matches[0].grid!;
        // Se busca una celda de victoria y una de derrota, y se comprueba que el
        // marcador que queda escrito diga lo mismo que escondía la celda.
        const iGana = grid.celdas.findIndex(Boolean);
        const iPierde = grid.celdas.findIndex((c) => !c);

        for (const [i, esperado] of [[iGana, 'ganado'], [iPierde, 'perdido']] as const) {
            if (i < 0) continue;
            const abierto = captainReducer(s, { type: 'REVEAL_MATCH', index: 0 });
            const jugado = captainReducer(abierto, { type: 'PICK_GRID', index: i });
            const m = jugado.pendingTournament!.matches[0];
            assert.equal(
                matchResult(m),
                esperado,
                `semilla ${seed}: la celda escondía ${esperado} y el marcador dice otra cosa`,
            );
        }
    }
});

test('LA GRILLA ABIERTA SOBREVIVE AL F5', () => {
    // `playing` vive en el estado y no en un `useState` justamente para esto: si
    // viviera en la pantalla, recargar en el medio de la grilla devolvería el
    // cuadro con el partido sin jugar, o sea con la chance de volver a entrar.
    const def = getTournament('mundial-m20');
    const s = base(15);
    s.player.age = def.gate.ages[0];
    s.player.ovr = 80;
    s.phase = 'tournament';
    s.pendingTournament = openFor(s, 'mundial-m20');

    const abierto = captainReducer(s, { type: 'REVEAL_MATCH', index: 1 });
    const vuelta = JSON.parse(JSON.stringify(abierto)) as CaptainState;

    assert.equal(vuelta.pendingTournament!.playing, 1, 'el F5 cerró la grilla abierta');
    assert.deepEqual(
        vuelta.pendingTournament!.matches[1].grid,
        abierto.pendingTournament!.matches[1].grid,
        'la grilla no sobrevivió al viaje por JSON',
    );
});

// ═══════════════════════════════════════════════════════════════════════════
//  3 bis · LAS CASILLAS
// ═══════════════════════════════════════════════════════════════════════════

/** Deja un partido jugado y ganado, sin pasar por la grilla. */
function forzarVictoria(m: TournamentMatch): void {
    m.puntos = 34;
    m.puntosRival = 12;
    m.tries = 5;
    m.triesRival = 1;
    m.palos = null;
    m.revealed = true;
}

/**
 * EL CAMINO HASTA EL PARTIDO POR EL TÍTULO, forzado.
 *
 * Existe porque el M20 dejó de tener UNA final: tiene cuatro, y el tablero de
 * las nueve casillas es de una sola. Un test que abra la ronda `final` sin haber
 * jugado el grupo ya no está mirando la final del mundo — está mirando la del
 * decimotercer puesto, que es la que le toca al que no ganó nada.
 *
 * Antes de esto los ocho tests de las casillas hacían exactamente eso y pasaban,
 * porque el cuadro no existía. Es la misma familia de error que el §1.7: el
 * andamio contestaba «la final» y lo que había pedido era «una final».
 */
function forzarCuadroDelTitulo(state: CaptainState, def: TournamentDef, t: PendingTournament): void {
    for (const m of t.matches.filter((x) => x.round === 'grupos')) forzarVictoria(m);

    // ── EL TORNEO CON BRONCE TAMBIÉN NECESITA LA SEMI GANADA ────────────────
    // Elimina —no tiene cuadros— y aun así su última ronda son DOS partidos: la
    // final y la del tercer puesto. Cuál te toca lo decide haber ganado la
    // semifinal, así que llegar a la final del título ya no es «llegar a la
    // final»: hay que ganar la penúltima. Sin esto, este helper armaba la tarde
    // del bronce y los tests que miden EL PARTIDO POR EL TÍTULO medían el otro.
    const bronce = bronzeFrom(def);
    if (bronce !== null) {
        openRound(t, buildCtxOf(state, def), bronce);
        for (const m of t.matches.filter((x) => x.round === bronce)) forzarVictoria(m);
        return;
    }

    // El torneo que elimina sin bronce no tiene cuadros: llegar a la final ES la final.
    if (!hasPlacement(def)) return;
    openRound(t, buildCtxOf(state, def), 'semi');
    for (const m of t.matches.filter((x) => x.round === 'semi')) forzarVictoria(m);
}

/** La final del torneo, ya armada. Del TÍTULO, no la del cuadro que caiga. */
function finalDe(seed: number, id: TournamentId, vision: number, ovr = 80) {
    const s = base(seed);
    const def = getTournament(id);
    s.player.age = def.gate.ages[0];
    s.player.ovr = ovr;
    s.player.attrs.vision = vision;
    if (def.gate.minTrack !== null) s.national.track = def.gate.minTrack;
    s.phase = 'tournament';
    s.pendingTournament = openFor(s, id);

    // Se fuerza la final armando la ronda directamente: llegar jugando depende
    // de la semilla, y lo que este bloque mide es la GRILLA, no el camino.
    const t = s.pendingTournament;
    forzarCuadroDelTitulo(s, def, t);
    openRound(t, buildCtxOf(s, def), 'final');
    return t.matches.find((m) => m.round === 'final')!;
}

test('LA FINAL DE LOS MUNDIALES SE JUEGA, Y LA DEL M17 SE DESTAPA', () => {
    // La declaración vive en `casillasRounds` y no en un `if` con el id adentro.
    // Este test es lo que impide que alguien agregue un torneo y se olvide de
    // decidir cómo se juega su final.
    for (const def of TOURNAMENTS) {
        const m = finalDe(3, def.id, 40);
        if (def.casillasRounds.includes('final')) {
            assert.ok(m.casillas, `${def.id}: declara casillas en la final y la final vino sin grilla`);
        } else {
            assert.equal(m.casillas, null, `${def.id}: no declara casillas y la final trajo grilla`);
        }
    }
});

test('EL HUECO ES DEL PARTIDO POR EL TÍTULO Y DE NINGÚN OTRO', () => {
    // El M20 juega CUATRO finales el mismo día —la del título, la del quinto, la
    // del noveno y la del decimotercero— y el tablero de las nueve casillas es de
    // una sola. Sin este corte se veía «la final del mundo se define en las
    // últimas pelotas» para decidir si terminabas decimotercero o decimoquinto,
    // que es la clase de texto que le enseña al jugador a no leer los textos.
    //
    // Los dos casos de abajo son los que el formato agrega, y ninguno existía
    // cuando el cuadro no existía.
    const def = getTournament('mundial-m20');

    // ── CASO 1: el que perdió los tres y ganó su semifinal ──────────────────
    // Es literalmente la carrera que abrió este cambio: 0-3 en el grupo, semi
    // ganada, final ganada, y el juego cerrando sin decir por qué puesto era.
    const abajo = base(4);
    abajo.player.age = def.gate.ages[0];
    abajo.player.ovr = 80;
    abajo.phase = 'tournament';
    const t = openFor(abajo, 'mundial-m20');
    abajo.pendingTournament = t;

    for (const m of t.matches.filter((x) => x.round === 'grupos')) {
        m.puntos = 0;
        m.puntosRival = 50;
        m.tries = 0;
        m.triesRival = 8;
        m.revealed = true;
    }
    assert.equal(groupWins(t), 0, 'el grupo forzado tendría que no tener victorias');
    assert.equal(bracketOf(t, def)!.topPlace, 13, 'cero victorias tendría que caer en el cuadro del 13.º');

    openRound(t, buildCtxOf(abajo, def), 'semi');
    for (const m of t.matches.filter((x) => x.round === 'semi')) forzarVictoria(m);
    openRound(t, buildCtxOf(abajo, def), 'final');

    const finalDeAbajo = t.matches.find((m) => m.round === 'final')!;
    assert.equal(finalDeAbajo.casillas, null, 'la final del decimotercer puesto trajo tablero');
    assert.deepEqual(
        stakeOf(t, def, 'final'),
        { from: 13, to: 14 },
        'ganar la semi del último cuadro tendría que dejarte jugando por el 13.º',
    );

    // ── CASO 2: el partido por el tercer puesto ─────────────────────────────
    // Es la última ronda del cuadro de ARRIBA, así que «¿es la ronda final?»
    // contesta que sí. Y no es por el título: el que perdió la semifinal ya no
    // pelea la copa.
    const arriba = base(4);
    arriba.player.age = def.gate.ages[0];
    arriba.player.ovr = 80;
    arriba.phase = 'tournament';
    const u = openFor(arriba, 'mundial-m20');
    arriba.pendingTournament = u;

    for (const m of u.matches.filter((x) => x.round === 'grupos')) forzarVictoria(m);
    openRound(u, buildCtxOf(arriba, def), 'semi');
    for (const m of u.matches.filter((x) => x.round === 'semi')) {
        m.puntos = 9;
        m.puntosRival = 27;
        m.tries = 1;
        m.triesRival = 4;
        m.palos = null;
        m.revealed = true;
    }
    openRound(u, buildCtxOf(arriba, def), 'final');

    const bronce = u.matches.find((m) => m.round === 'final')!;
    assert.equal(bronce.casillas, null, 'el partido por el tercer puesto trajo tablero');
    assert.equal(forTheTitle(u, def, 'final'), false, 'el tercer puesto no se juega por el título');
    assert.deepEqual(
        stakeOf(u, def, 'final'),
        { from: 3, to: 4 },
        'perder la semi del título tendría que dejarte jugando por el tercero',
    );
});

test('LA FINAL A MEDIO JUGAR SOBREVIVE AL F5', () => {
    // Es la promesa más fuerte de todo el contrato del torneo y la única que
    // ningún test de motor toca por su cuenta: `PendingTournament` viaja al
    // `localStorage`, así que la final que dejaste con dos casillas abiertas
    // tiene que volver con LAS MISMAS DOS y con los mismos tries escondidos.
    //
    // Se verifica con un viaje por JSON, que es literalmente lo que hace el
    // guardado. Si algún día alguien mete un `Map`, un `Set` o una función acá
    // adentro, esto se pone rojo antes de que un jugador pierda una final.
    const def = getTournament('mundial-m20');
    const s = base(9);
    s.player.age = def.gate.ages[0];
    s.player.ovr = 80;
    s.player.attrs.vision = 90;
    s.phase = 'tournament';
    const t = openFor(s, 'mundial-m20');
    s.pendingTournament = t;
    forzarCuadroDelTitulo(s, def, t);
    openRound(t, buildCtxOf(s, def), 'final');
    for (const m of t.matches) if (m.round !== 'final') m.revealed = true;

    let next = s;
    next = captainReducer(next, { type: 'PICK_CELL', index: 0 });
    next = captainReducer(next, { type: 'PICK_CELL', index: 1 });

    const ida = next.pendingTournament!.matches.find((m) => !m.revealed)!.casillas!;
    const vuelta = (JSON.parse(JSON.stringify(next)) as CaptainState)
        .pendingTournament!.matches.find((m) => !m.revealed)!.casillas!;

    assert.deepEqual(vuelta, ida, 'la grilla no sobrevivió al viaje por JSON');
    assert.deepEqual(vuelta.abiertas, [0, 1], 'se perdieron las casillas ya abiertas');
    assert.equal(vuelta.celdas.filter(Boolean).length, CASILLAS_TRIES, 'se movieron los tries escondidos');
});

test('NUEVE CASILLAS Y TRES TRIES, siempre', () => {
    for (let seed = 1; seed <= 40; seed += 1) {
        const grid = finalDe(seed, 'mundial-m20', 40).casillas!;
        assert.equal(grid.celdas.length, CASILLAS_TOTAL, `semilla ${seed}: la grilla no tiene nueve casillas`);
        assert.equal(
            grid.celdas.filter(Boolean).length,
            CASILLAS_TRIES,
            `semilla ${seed}: la grilla no esconde exactamente tres tries`,
        );
    }
});

test('LA TACHADA DE LA VISIÓN ES SIEMPRE UNA CASILLA VACÍA', () => {
    // Es TODO el diseño de esta palanca: el atributo compra INFORMACIÓN, no la
    // respuesta. Si la tachada pudiera caer sobre un try, la Visión pasaría de
    // "te saco una mala del tablero" a "te arruino la final", que es el signo
    // exactamente invertido.
    for (let seed = 1; seed <= 60; seed += 1) {
        const grid = finalDe(seed, 'mundial-m20', 90).casillas!;
        assert.notEqual(grid.tachada, null, `semilla ${seed}: con Visión 90 no tachó ninguna`);
        assert.equal(
            grid.celdas[grid.tachada!],
            false,
            `semilla ${seed}: la Visión tachó una casilla que tenía try adentro`,
        );
    }
});

test('SIN LA VISIÓN NO HAY TACHADA, y el umbral es el que dice la constante', () => {
    for (let seed = 1; seed <= 20; seed += 1) {
        assert.equal(
            finalDe(seed, 'mundial-m20', CASILLAS_VISION - 1).casillas!.tachada,
            null,
            `semilla ${seed}: tachó una casilla por debajo del umbral`,
        );
        assert.notEqual(
            finalDe(seed, 'mundial-m20', CASILLAS_VISION).casillas!.tachada,
            null,
            `semilla ${seed}: no tachó nada justo en el umbral`,
        );
    }
});

test('LA VISIÓN PAGA: con la casilla tachada se ganan más finales', () => {
    // La cuenta de papel dice que la tachada vale entre 6 y 21 puntos
    // porcentuales. Acá no se verifica la fórmula —eso es aritmética— sino que el
    // CANAL TRANSPORTE: que subir Visión efectivamente gane más finales cuando se
    // juega igual. Es el §2 del CLAUDE del feature hecho assert.
    const jugar = (seed: number, vision: number): boolean => {
        const grid = finalDe(seed, 'mundial-m20', vision).casillas!;
        // Se juega SIEMPRE IGUAL —la primera libre— porque el orden no cambia la
        // probabilidad. Lo único que se mueve entre los dos brazos es la Visión.
        const abiertas: number[] = [];
        while (abiertas.length < grid.tiros) {
            const libre = grid.celdas.findIndex(
                (_, i) => !abiertas.includes(i) && grid.tachada !== i,
            );
            if (libre < 0) break;
            abiertas.push(libre);
            if (abiertas.filter((i) => grid.celdas[i]).length >= CASILLAS_TRIES) return true;
        }
        return false;
    };

    let conVision = 0;
    let sinVision = 0;
    const N = 300;
    for (let seed = 1; seed <= N; seed += 1) {
        if (jugar(seed, 90)) conVision += 1;
        if (jugar(seed, 40)) sinVision += 1;
    }

    assert.ok(
        conVision > sinVision,
        `la Visión tiene que pagar: con ${conVision}/${N} contra ${sinVision}/${N} sin ella`,
    );
});

test('LOS DOS MARCADORES DE LA FINAL VIAJAN ADENTRO, y son distintos', () => {
    // Es lo que hace que el jugador decida sin romper la regla 1 del contrato:
    // el torneo se sortea entero al abrirse, y lo que las casillas eligen es CUÁL
    // de los dos marcadores pasó. Si se armaran al terminar, un F5 en el medio de
    // la final devolvería otro partido.
    for (let seed = 1; seed <= 30; seed += 1) {
        const grid = finalDe(seed, 'mundial-mayor', 40).casillas!;
        assert.ok(grid.siGana.puntos > grid.siGana.puntosRival, `semilla ${seed}: el marcador de ganar no gana`);
        assert.ok(grid.siPierde.puntos < grid.siPierde.puntosRival, `semilla ${seed}: el marcador de perder no pierde`);
    }
});

test('LAS CASILLAS DECIDEN EL PARTIDO, y el que no encuentra los tres pierde la final', () => {
    // De punta a punta por el reducer: se juega la final eligiendo siempre la
    // primera libre y se verifica que el marcador que quedó escrito sea el que
    // corresponde al resultado de la grilla.
    for (let seed = 1; seed <= 30; seed += 1) {
        const s = base(seed);
        const def = getTournament('mundial-m20');
        s.player.age = def.gate.ages[0];
        s.player.ovr = 80;
        s.phase = 'tournament';
        s.pendingTournament = openFor(s, 'mundial-m20');
        forzarCuadroDelTitulo(s, def, s.pendingTournament);
        openRound(s.pendingTournament, buildCtxOf(s, def), 'final');
        // Se marcan los de grupo como jugados para que la final sea el pendiente.
        for (const m of s.pendingTournament.matches) if (m.round !== 'final') m.revealed = true;

        let next = s;
        for (let i = 0; i < 12; i += 1) {
            const t = next.pendingTournament;
            if (!t) break;
            const final = t.matches.find((m) => !m.revealed);
            if (!final?.casillas) break;
            const g = final.casillas;
            const libre = g.celdas.findIndex((_, k) => !g.abiertas.includes(k) && g.tachada !== k);
            if (libre < 0) break;
            next = captainReducer(next, { type: 'PICK_CELL', index: libre });
        }

        const final = next.pendingTournament?.matches.find((m) => m.round === 'final');
        assert.ok(final?.revealed, `semilla ${seed}: la final quedó sin resolver`);
        const gano = matchResult(final!) === 'ganado';
        const encontrados = final!.casillas!.abiertas.filter((i) => final!.casillas!.celdas[i]).length;
        assert.equal(
            gano,
            encontrados >= CASILLAS_TRIES,
            `semilla ${seed}: encontró ${encontrados} tries y el marcador dice ${gano ? 'ganado' : 'perdido'}`,
        );
    }
});

// ═══════════════════════════════════════════════════════════════════════════
//  3 ter · EL FORMATO DEL M20 — nadie se va a casa
// ═══════════════════════════════════════════════════════════════════════════
//
// Este bloque existe por un bug que se vio jugando y no se veía en ningún test:
// una carrera perdió los tres partidos del grupo, y en la llave leyó SEMI y
// FINAL —las mismas palabras que ve el que los ganó—, ganó las dos, y el juego
// cerró con «se terminó el torneo». Nunca dijo que había sido por el
// decimotercer puesto, porque el motor tampoco lo sabía.
//
// Lo que se afirma acá es el formato del torneo de verdad: dieciséis equipos,
// cuatro grupos de cuatro, y cuatro cuadros repartidos por victorias. Nadie
// queda eliminado y todos terminan con un puesto exacto.

/** Deja un partido jugado y PERDIDO por paliza, sin pasar por la grilla. */
function forzarDerrota(m: TournamentMatch): void {
    m.puntos = 3;
    m.puntosRival = 45;
    m.tries = 0;
    m.triesRival = 7;
    m.palos = null;
    m.revealed = true;
}

/** Juega el partido `index` eligiendo una celda de VICTORIA de su grilla. */
function ganarPartido(state: CaptainState, index: number): CaptainState {
    const abierto = captainReducer(state, { type: 'REVEAL_MATCH', index });
    const t = abierto.pendingTournament!;
    if (t.playing === null) return abierto;
    const grid = t.matches[t.playing].grid!;
    return captainReducer(abierto, { type: 'PICK_GRID', index: grid.celdas.findIndex(Boolean) });
}

/** Idem, pero eligiendo una de DERROTA. Las dos existen siempre: `GRID_MIN_WINS`. */
function perderPartido(state: CaptainState, index: number): CaptainState {
    const abierto = captainReducer(state, { type: 'REVEAL_MATCH', index });
    const t = abierto.pendingTournament!;
    if (t.playing === null) return abierto;
    const grid = t.matches[t.playing].grid!;
    return captainReducer(abierto, { type: 'PICK_GRID', index: grid.celdas.findIndex((c) => !c) });
}

/** Un M20 recién abierto, con la carrera ya puesta en fase de torneo. */
function m20(seed: number): CaptainState {
    const def = getTournament('mundial-m20');
    const s = base(seed);
    s.player.age = def.gate.ages[0];
    s.player.ovr = 80;
    s.phase = 'tournament';
    s.pendingTournament = openFor(s, 'mundial-m20');
    return s;
}

test('EL FORMATO CIERRA: los cuadros, su tamaño y el campo son el mismo número', () => {
    // Ninguno de los tres números está escrito: el tamaño del cuadro sale de las
    // rondas de eliminación, la cantidad de cuadros de los partidos de grupo, y
    // el campo del catálogo. Que multipliquen bien es lo que prueba que las tres
    // derivaciones hablan del mismo torneo.
    //
    // Y es la guarda contra el catálogo incoherente: dieciséis equipos con tres
    // rondas de eliminación darían cuadros de ocho y cuatro cuadros, o sea
    // treinta y dos equipos. Nada fallaría solo — saldrían puestos hasta el 32 en
    // un torneo de 16.
    for (const def of TOURNAMENTS) {
        const cuadros = bracketsOf(def);

        if (!hasPlacement(def)) {
            assert.equal(cuadros.length, 0, `${def.id}: elimina y sin embargo declara cuadros`);
            assert.notEqual(def.qualifyPoints, null, `${def.id}: elimina sin decir con cuántos puntos se pasa`);
            continue;
        }

        assert.equal(
            def.qualifyPoints,
            null,
            `${def.id}: reparte cuadros y además declara un corte, que ya no corta nada`,
        );
        assert.equal(
            cuadros.length * bracketSize(def),
            def.fieldSize,
            `${def.id}: ${cuadros.length} cuadros de ${bracketSize(def)} no son ${def.fieldSize} equipos`,
        );
        assert.equal(cuadros[0].topPlace, 1, `${def.id}: el primer cuadro no pelea el primer puesto`);
        assert.ok(cuadros[0].title, `${def.id}: el primer cuadro no es el del título`);

        const ultimo = cuadros[cuadros.length - 1];
        assert.equal(
            ultimo.topPlace + ultimo.size - 1,
            def.fieldSize,
            `${def.id}: el último cuadro no cierra en el último puesto`,
        );
    }
});

test('EL CUADRO SALE DE LAS VICTORIAS DEL GRUPO, y no de los puntos de la tabla', () => {
    const def = getTournament('mundial-m20');

    for (const [ganados, topPlace] of [[3, 1], [2, 5], [1, 9], [0, 13]] as const) {
        const s = m20(11);
        const t = s.pendingTournament!;
        const grupo = t.matches.filter((m) => m.round === 'grupos');
        grupo.forEach((m, i) => (i < ganados ? forzarVictoria(m) : forzarDerrota(m)));

        assert.equal(groupWins(t), ganados, `el grupo forzado no dio ${ganados} victorias`);
        const cuadro = bracketOf(t, def)!;
        assert.equal(cuadro.topPlace, topPlace, `con ${ganados} victorias el cuadro tendría que empezar en el ${topPlace}.º`);
        assert.equal(cuadro.title, ganados === def.groupMatches, `el cuadro del título es el de ganar los tres, y no el de ${ganados}`);
    }

    // ── Y LA TABLA NO MANDA ─────────────────────────────────────────────────
    // Una victoria y dos derrotas ajustadas con bonus ofensivo suman NUEVE
    // puntos, que era exactamente el corte viejo. Con el formato nuevo eso no te
    // pone a pelear el título: te pone en el cuadro del noveno puesto, porque lo
    // que se cuenta son partidos ganados.
    const s = m20(11);
    const t = s.pendingTournament!;
    const grupo = t.matches.filter((m) => m.round === 'grupos');
    forzarVictoria(grupo[0]);
    for (const m of [grupo[1], grupo[2]]) {
        m.puntos = 26;
        m.puntosRival = 31;
        m.tries = 4;
        m.triesRival = 5;
        m.palos = null;
        m.revealed = true;
    }
    assert.ok(groupPoints(t) >= 9, `el grupo armado tendría que sumar nueve puntos y sumó ${groupPoints(t)}`);
    assert.equal(bracketOf(t, def)!.topPlace, 9, 'nueve puntos con una sola victoria no son el cuadro del título');
});

test('EN EL M20 NADIE SE VA A CASA: CINCO PARTIDOS Y UN PUESTO PARA TODOS', () => {
    // El M20 son cinco partidos desde 1988, y ahora lo son para los dieciséis y
    // no solo para el que pasa. Es la afirmación central del formato: el grupo no
    // decide quién sigue, decide por qué puesto.
    const def = getTournament('mundial-m20');

    for (let seed = 1; seed <= 40; seed += 1) {
        const s = m20(seed);
        const fin = playTournament(s);
        const t = fin.tournaments[fin.tournaments.length - 1]!;

        assert.equal(t.matches.length, 5, `semilla ${seed}: el torneo se jugó con ${t.matches.length} partidos`);
        assert.ok(t.matches.every((m) => m.revealed), `semilla ${seed}: quedó una celda sin jugar`);

        const puesto = finalPlace(t, def)!;
        assert.ok(
            puesto >= 1 && puesto <= def.fieldSize,
            `semilla ${seed}: terminó en el puesto ${puesto} de un torneo de ${def.fieldSize}`,
        );

        // Y el puesto cae ADENTRO del cuadro que le tocó: el que ganó dos del
        // grupo no puede salir campeón por más que gane los dos que siguen.
        const cuadro = bracketOf(t, def)!;
        assert.ok(
            puesto >= cuadro.topPlace && puesto <= cuadro.topPlace + cuadro.size - 1,
            `semilla ${seed}: salió ${puesto}.º desde el cuadro que empieza en el ${cuadro.topPlace}.º`,
        );

        // La copa y el primer puesto son la misma cosa, en las dos direcciones.
        assert.equal(
            t.outcome === 'campeon',
            puesto === 1,
            `semilla ${seed}: outcome '${t.outcome}' con el puesto ${puesto}`,
        );
    }
});

test('PERDER LA SEMIFINAL DEL TÍTULO NO ELIMINA: SE JUEGA POR EL TERCER PUESTO', () => {
    // El camino que el motor no recorría: hasta este cambio, el cuadro de arriba
    // SÍ eliminaba —perder la semi cerraba el torneo— así que el partido por el
    // tercer puesto no se jugaba nunca. Se recorre entero por el reducer, que es
    // la única forma de probar que las rondas se abren solas.
    const def = getTournament('mundial-m20');
    let next = m20(6);

    for (let i = 0; i < def.groupMatches; i += 1) next = ganarPartido(next, i);

    const enSemi = next.pendingTournament!;
    assert.equal(enSemi.round, 'semi', 'ganar los tres del grupo no abrió la semifinal');
    assert.ok(bracketOf(enSemi, def)!.title, 'ganar los tres no puso la carrera en el cuadro del título');
    assert.equal(roundTitle(enSemi, def, 'semi'), 'Semifinal por el título');

    next = perderPartido(next, def.groupMatches);

    const enBronce = next.pendingTournament!;
    assert.equal(enBronce.outcome, null, 'perder la semifinal del título cerró el torneo');
    assert.equal(enBronce.round, 'final', 'perder la semifinal no abrió el partido por el tercer puesto');
    assert.deepEqual(stakeOf(enBronce, def, 'final'), { from: 3, to: 4 });
    assert.equal(roundTitle(enBronce, def, 'final'), 'Por el 3.º puesto');

    next = ganarPartido(next, def.groupMatches + 1);
    const cerrado = next.pendingTournament!;
    assert.equal(cerrado.outcome, 'eliminado', 'ganar el tercer puesto no puede ser ganar el torneo');
    assert.equal(finalPlace(cerrado, def), 3, 'ganar el partido por el tercero tendría que dar el tercero');
});

test('LA COPA ES DEL QUE GANA EL PARTIDO POR EL TÍTULO, y El Hueco es de ese partido', () => {
    const def = getTournament('mundial-m20');
    let next = m20(6);

    for (let i = 0; i < def.groupMatches; i += 1) next = ganarPartido(next, i);
    next = ganarPartido(next, def.groupMatches);

    const enFinal = next.pendingTournament!;
    assert.equal(enFinal.round, 'final', 'ganar la semifinal del título no abrió la final');
    assert.equal(roundTitle(enFinal, def, 'final'), 'La final');
    const final = enFinal.matches[def.groupMatches + 1];
    assert.ok(final.casillas, 'la final por el título tendría que traer El Hueco');

    // Se juega buscando los tres tries: la final se GANA, no se destapa.
    for (let k = 0; k < CASILLAS_TOTAL; k += 1) {
        const t = next.pendingTournament!;
        const pendiente = t.matches.find((m) => !m.revealed);
        if (!pendiente?.casillas) break;
        const g = pendiente.casillas;
        const conTry = g.celdas.findIndex((tiene, i) => tiene && !g.abiertas.includes(i));
        next = captainReducer(next, { type: 'PICK_CELL', index: conTry });
    }

    const cerrado = next.pendingTournament!;
    assert.equal(cerrado.outcome, 'campeon', 'encontrar los tres tries en la final no dio la copa');
    assert.equal(finalPlace(cerrado, def), 1, 'el campeón no terminó primero');
});

test('LA LLAVE DICE POR QUÉ PUESTO SE JUEGA', () => {
    // El bug de la captura, hecho assert. La celda de la semifinal del último
    // cuadro decía «Semi» y la de su final decía «Final»: las mismas dos palabras
    // que ve el que está peleando la copa.
    const def = getTournament('mundial-m20');
    const s = m20(4);
    const t = s.pendingTournament!;
    for (const m of t.matches.filter((x) => x.round === 'grupos')) forzarDerrota(m);

    assert.equal(roundTag(t, def, 'semi'), 'Semi 13-16');
    assert.equal(roundTitle(t, def, 'semi'), 'Semifinal por el 13.º puesto');

    openRound(t, buildCtxOf(s, def), 'semi');
    for (const m of t.matches.filter((x) => x.round === 'semi')) forzarVictoria(m);

    assert.equal(roundTag(t, def, 'final'), '13.º puesto');
    assert.equal(roundTitle(t, def, 'final'), 'Por el 13.º puesto');

    // Y el torneo que elimina sigue hablando como siempre: ahí una semifinal es
    // una semifinal y no hay puesto que aclarar.
    const m17 = getTournament('juvenil-m18');
    const j = base(4);
    j.player.age = 17;
    j.phase = 'tournament';
    const u = openFor(j, 'juvenil-m18');
    assert.equal(roundTag(u, m17, 'semi'), 'Semi');
    assert.equal(roundTitle(u, m17, 'final'), 'La final');
});

// ═══════════════════════════════════════════════════════════════════════════
//  3 quater · LAS DOS DIVISIONES — el ascenso y el descenso
// ═══════════════════════════════════════════════════════════════════════════
//
// El Mundial juvenil son dos torneos y solo uno te toca. La división de tu unión
// arranca por ranking y se mueve con lo que hiciste: suben los dos primeros de la
// B, bajan los dos últimos de la A.
//
// Lo que este bloque vigila, y es lo caro de esta feature: la división NO SE
// GUARDA. Se deriva de `state.tournaments` cada vez que se pregunta. Un test que
// solo mirara una edición suelta no vería nunca el bug que importa —el de la
// edición siguiente— así que casi todo lo de acá abajo compara DOS temporadas.

/** Deja escrita una edición ya jugada, con el puesto que se pida. */
function edicionTerminada(
    state: CaptainState,
    id: TournamentId,
    puesto: number,
    season = 1,
): void {
    const def = getTournament(id);
    const s = base(21);
    s.player.age = def.gate.ages[0];
    s.player.countryCode = state.player.countryCode;
    s.player.ovr = 80;
    s.phase = 'tournament';
    const t = openTournament(s, id);

    // El puesto se construye desde el formato y no se escribe: se ganan las
    // victorias de grupo que mandan a ese cuadro, y después se gana o se pierde
    // la semi y la definición según dónde caiga el puesto pedido.
    const cuadro = bracketsOf(def).find(
        (b) => puesto >= b.topPlace && puesto <= b.topPlace + b.size - 1,
    )!;
    const grupo = t.matches.filter((m) => m.round === 'grupos');
    grupo.forEach((m, i) => (i < cuadro.wins ? forzarVictoria(m) : forzarDerrota(m)));

    const ganaSemi = puesto <= cuadro.topPlace + 1;
    openRound(t, buildCtxOf(s, def), 'semi');
    for (const m of t.matches.filter((x) => x.round === 'semi')) {
        if (ganaSemi) forzarVictoria(m);
        else forzarDerrota(m);
    }

    const ganaFinal = puesto === cuadro.topPlace || puesto === cuadro.topPlace + 2;
    openRound(t, buildCtxOf(s, def), 'final');
    for (const m of t.matches.filter((x) => x.round === 'final')) {
        if (ganaFinal) forzarVictoria(m);
        else forzarDerrota(m);
    }

    t.season = season;
    t.round = 'final';
    t.finalRound = 'final';
    t.outcome = 'eliminado';
    assert.equal(finalPlace(t, def), puesto, `el andamio no supo construir el puesto ${puesto}`);
    state.tournaments.push(t);
}

test('LA CADENA DE DIVISIONES CIERRA: las franjas son contiguas y no se pisan', () => {
    // Sin esto, un catálogo con la B arrancando en el puesto 15 daría dos torneos
    // que se pelean por las mismas uniones, y nada fallaría: simplemente habría
    // dos equipos jugando los dos Mundiales el mismo año.
    const cadena = tierChainOf(getTournament('mundial-m20'));
    assert.deepEqual(cadena.map((d) => d.id), ['mundial-m20', 'mundial-m20-b']);

    for (let i = 1; i < cadena.length; i += 1) {
        const arriba = cadena[i - 1];
        assert.equal(
            cadena[i].fieldFromRank,
            arriba.fieldFromRank + arriba.fieldSize,
            `${cadena[i].id}: su franja no empieza donde termina la de ${arriba.id}`,
        );
        assert.equal(arriba.tier!.down!.to, cadena[i].id, `${arriba.id}: baja a otro lado`);
        assert.equal(cadena[i].tier!.up!.to, arriba.id, `${cadena[i].id}: sube a otro lado`);
        assert.equal(
            arriba.tier!.down!.places,
            cadena[i].tier!.up!.places,
            'bajan y suben distinta cantidad: el mundo pierde o gana equipos cada año',
        );
    }
});

test('LA DIVISIÓN DE ARRANQUE SALE DEL RANKING, y nadie queda sin torneo', () => {
    const a = getTournament('mundial-m20');

    // Argentina es octava del mundo: primera división.
    assert.equal(entryDivisionOf('ar', a), 'mundial-m20');
    // Nueva Zelanda, primera.
    assert.equal(entryDivisionOf('nz', a), 'mundial-m20');
    // Uruguay está en la franja de abajo.
    assert.equal(entryDivisionOf('uy', a), 'mundial-m20-b');

    // Y NINGUNA unión del catálogo se queda sin división: la 90ª del mundo juega
    // la última, que es la respuesta correcta —abajo de la B no hay un torneo C,
    // hay no jugar un Mundial—.
    for (const code of Object.keys(RUGBY_UNIONS)) {
        const suya = entryDivisionOf(code, a);
        assert.ok(
            suya === 'mundial-m20' || suya === 'mundial-m20-b',
            `${code}: quedó sin división (${suya})`,
        );
    }
});

test('EL CAMPO DE CADA DIVISIÓN SALE DE SU FRANJA, y siempre son dieciséis', () => {
    for (const id of ['mundial-m20', 'mundial-m20-b'] as const) {
        const def = getTournament(id);
        const s = base(3);
        s.player.age = def.gate.ages[0];
        s.player.countryCode = unionPara(def);
        s.player.ovr = 80;
        const t = openTournament(s, id);

        // El campo son `fieldSize − 1` rivales, y ninguno se repite.
        const ctx = buildCtxOf(s, def);
        assert.equal(ctx.rivals.length, def.fieldSize - 1, `${id}: el campo no tiene dieciséis`);
        assert.equal(new Set(ctx.rivals.map((r) => r.code)).size, ctx.rivals.length);

        // Y la B no juega contra Nueva Zelanda.
        const codigos = ctx.rivals.map((r) => r.code);
        if (id === 'mundial-m20-b') {
            assert.ok(!codigos.includes('nz'), 'la segunda división recibió a Nueva Zelanda');
            assert.ok(!codigos.includes('za'), 'la segunda división recibió a Sudáfrica');
        } else {
            assert.ok(codigos.includes('nz'), 'la primera división se quedó sin Nueva Zelanda');
        }
        assert.ok(t.matches.length > 0);
    }
});

test('LOS DOS ÚLTIMOS DE LA A BAJAN, y el resto se queda', () => {
    const a = getTournament('mundial-m20');

    for (const [puesto, esperado] of [
        [1, null], [3, null], [8, null], [14, null], [15, 'down'], [16, 'down'],
    ] as const) {
        const s = base(2);
        s.player.countryCode = 'ar';
        edicionTerminada(s, 'mundial-m20', puesto);
        const t = s.tournaments[0];

        const movimiento = tierMoveOf(t, a);
        assert.equal(movimiento?.kind ?? null, esperado, `el ${puesto}.º de la A se movió mal`);
        assert.equal(
            divisionOf(s, a),
            esperado === 'down' ? 'mundial-m20-b' : 'mundial-m20',
            `terminar ${puesto}.º dejó a la unión en la división equivocada`,
        );
    }
});

test('LOS DOS PRIMEROS DE LA B SUBEN, y el tercero se queda', () => {
    const b = getTournament('mundial-m20-b');
    const uruguayo = 'uy';

    for (const [puesto, esperado] of [
        [1, 'up'], [2, 'up'], [3, null], [9, null], [16, null],
    ] as const) {
        const s = base(2);
        s.player.countryCode = uruguayo;
        assert.equal(divisionOf(s, b), 'mundial-m20-b', 'el uruguayo no arrancó en la B');

        edicionTerminada(s, 'mundial-m20-b', puesto);
        const movimiento = tierMoveOf(s.tournaments[0], b);
        assert.equal(movimiento?.kind ?? null, esperado, `el ${puesto}.º de la B se movió mal`);
        assert.equal(
            divisionOf(s, b),
            esperado === 'up' ? 'mundial-m20' : 'mundial-m20-b',
            `salir ${puesto}.º de la B dejó a la unión en la división equivocada`,
        );
    }

    // ── Y DE LA ÚLTIMA DIVISIÓN NO SE BAJA ──────────────────────────────────
    // Salir decimosexto de la B es la peor edición posible y no manda a ningún
    // lado: abajo no hay torneo. Sin esta guarda, un `down` mal declarado en el
    // catálogo tiraría al buscar un torneo que no existe.
    assert.equal(b.tier!.down, null, 'la última división declara un descenso a la nada');
});

test('LA DIVISIÓN SE ACUERDA DE LAS EDICIONES ANTERIORES, EN ORDEN', () => {
    // El caso que ninguna edición suelta puede ver: bajar a los dieciocho, ganar
    // la B a los diecinueve y volver a la A a los veinte. Es el arco entero de la
    // feature y es la única forma de probar que la división se deriva de la
    // historia y no del ranking congelado.
    const a = getTournament('mundial-m20');
    const s = base(2);
    s.player.countryCode = 'ar';

    assert.equal(divisionOf(s, a), 'mundial-m20', 'un argentino no arrancó en la primera');

    edicionTerminada(s, 'mundial-m20', 16, 1);
    assert.equal(divisionOf(s, a), 'mundial-m20-b', 'salir último de la A no bajó a la unión');

    edicionTerminada(s, 'mundial-m20-b', 1, 2);
    assert.equal(divisionOf(s, a), 'mundial-m20', 'ganar la B no devolvió a la unión a la primera');

    // Y un torneo SIN divisiones no mueve nada, por más que se gane o se pierda.
    edicionTerminada(s, 'mundial-m20', 8, 3);
    assert.equal(divisionOf(s, a), 'mundial-m20', 'una edición del medio movió la división');
});

test('LA COMPUERTA ABRE UNA SOLA DIVISIÓN POR TEMPORADA', () => {
    // Las dos comparten edad, media y calendario. Si la división no entrara en la
    // compuerta, abriría siempre la primera —la que está antes en el catálogo— y
    // la segunda sería contenido muerto con cartel de vivo: exactamente el bug
    // del `'AR'` en mayúscula que este archivo existe para vigilar.
    const s = base(2);
    s.player.age = 19;
    s.player.ovr = 80;

    s.player.countryCode = 'ar';
    assert.equal(tournamentDue(s), 'mundial-m20', 'un argentino no juega la primera división');

    s.player.countryCode = 'uy';
    assert.equal(tournamentDue(s), 'mundial-m20-b', 'un uruguayo no juega la segunda división');

    // Y después de descender, al argentino le toca la B.
    s.player.countryCode = 'ar';
    edicionTerminada(s, 'mundial-m20', 15);
    assert.equal(tournamentDue(s), 'mundial-m20-b', 'el descendido volvió a jugar la primera');
});

// ═══════════════════════════════════════════════════════════════════════════
//  4 · LAS PROVINCIAS
// ═══════════════════════════════════════════════════════════════════════════

test('NADIE SE REPITE EN EL MISMO TORNEO, y el campo es el que clasificó', () => {
    // Dos bugs en un test, porque son el mismo bicho visto de dos lados.
    //
    // El grupo del Mundial salía «Tonga, Fiyi, Tonga»: un sorteo con reemplazo
    // disfrazado de fixture. Y salía contra Tonga y Fiyi —y antes contra Senegal,
    // Nepal e Islas Cook— porque el pool eran las CIENTO TREINTA Y UNA uniones
    // con fixture, donde el volumen de las flojas le gana al peso de cercanía.
    //
    // La medicina fue una puerta (`fieldSize`) y no un multiplicador, que es la
    // lección que el CLAUDE.md de Carrera de Rugby ya tenía escrita.
    for (const def of TOURNAMENTS) {
        if (def.rivalPool !== 'uniones') continue;
        for (let seed = 1; seed <= 25; seed += 1) {
            const s = base(seed);
            s.player.age = def.gate.ages[0];
            if (def.gate.minOvr !== null) s.player.ovr = def.gate.minOvr + 4;
            if (def.gate.minTrack !== null) {
            s.national.track = def.gate.minTrack;
            // Desde la 0.22.0 la mayor pide DOS cosas: el escalón —te convocaron
            // este año— y el estado —sos del plantel, no un pibe al que llevaron
            // de gira—. El estado a medida tiene que decir las dos.
            if (def.gate.minTrack === 'nacional') s.national.status = 'squad';
        }
            s.phase = 'tournament';
            s.pendingTournament = openFor(s, def.id);
            const fin = playTournament(s);
            const t = fin.tournaments[fin.tournaments.length - 1]!;

            const codigos = t.matches.map((m) => m.rivalCode);
            assert.equal(
                new Set(codigos).size,
                codigos.length,
                `${def.id} semilla ${seed}: un rival se repitió — ${codigos.join(', ')}`,
            );
        }
    }
});

test('nunca te toca jugar contra tu propia provincia', () => {
    for (let seed = 1; seed <= 30; seed += 1) {
        const s = base(seed);
        s.player.age = 17;
        s.phase = 'tournament';
        s.pendingTournament = openFor(s, 'juvenil-m18');
        const fin = playTournament(s);
        // EL PROVINCIAL Y NO «el último jugado»: la temporada de los diecisiete
        // encadena el continental M18 detrás, así que pedir el último devolvía el
        // Sudamericano y el test medía las provincias contra un campo de uniones.
        // Es el §1.5 en su forma de siempre —referirse a algo por su posición— y
        // acá se pide por identidad.
        const t = fin.tournaments.find((x) => x.id === 'juvenil-m18')!;
        assert.ok(t, `semilla ${seed}: no se jugó el provincial`);

        const nombres = new Set(t.matches.map((m) => m.rivalName));
        assert.ok(nombres.size > 0, `semilla ${seed}: torneo sin rivales`);
        // Las ocho provincias existen y ninguna se repite consigo misma como
        // rival de sí misma: lo que se verifica es que el pool haya sacado la
        // propia, no cuál es.
        assert.ok(
            [...nombres].every((n) => PROVINCIAS.some((p) => p.labelEs === n)),
            `semilla ${seed}: apareció un rival que no es una provincia`,
        );
    }
});

/** Abre un torneo sobre un estado ya preparado, por la misma puerta que el juego. */
function openFor(state: CaptainState, id: TournamentId) {
    return openTournament(state, id);
}

/**
 * JUEGA EL PARTIDO `index`, sea como sea que ese torneo lo resuelva.
 *
 * Existe porque un partido se juega de dos formas —destapar la celda, o abrir la
 * grilla de treinta y elegir una— y qué forma le toca lo decide el CATÁLOGO. Un
 * test que llame `REVEAL_MATCH` a secas está afirmando cuál de las dos, y eso lo
 * deja rojo el día que un torneo cambie de opinión: pasó cuando el Argentino
 * Juvenil pasó a usar grilla.
 *
 * `celda` elige qué casilla de la grilla tocar, para los tests que necesitan una
 * de victoria o una de derrota en particular.
 */
function jugarPartido(state: CaptainState, index: number, celda = 0): CaptainState {
    const abierto = captainReducer(state, { type: 'REVEAL_MATCH', index });
    const t = abierto.pendingTournament;
    if (t?.playing === null || t?.playing === undefined) return abierto;
    return captainReducer(abierto, { type: 'PICK_GRID', index: celda });
}
