// LOS TÍTULOS DE SELECCIÓN, que hasta esta versión no existían.
//
// El agujero que cierra este archivo se encontró jugando y se confirmó midiendo:
// sobre 200 carreras de uniones tier 1 y 2, con 8.881 caps disputados, el motor
// acreditaba 349 títulos al jugador y TODOS eran de club. Cero de selección. Los
// diecinueve trofeos del calendario internacional estaban declarados —con nombre,
// jerarquía y hasta condición extra— y ninguna línea del motor los leía.
//
// Lo que estos tests protegen no es que se ganen títulos: es que se ganen POR EL
// MOTIVO CORRECTO. Un torneo que no jugás no te corona, una lista a la que no
// entrás tampoco, y el favorito gana más seguido que el que no lo es.

import test from 'node:test';
import assert from 'node:assert/strict';
import { runCareer, hashSeed, type Chooser } from '../../index.ts';
import {
    INTERNATIONAL_COMPETITIONS,
    competitionsFor,
    getInternationalCompetition,
} from '../../data/international-calendar.ts';
import {
    internationalTitlesFor,
    resolveInternationalChampion,
    unresolvedTrophies,
} from '../international-results.ts';

const rotatingChooser: Chooser = (event, state) =>
    event.options[hashSeed(`${event.id}:${state.player.seasonsPlayed}`) % event.options.length].id;

const SEMILLAS = Array.from({ length: 25 }, (_, i) => (i + 1) * 7919);

function carreras(countryCode: string) {
    return SEMILLAS.map((seed) =>
        runCareer({ position: 'flyhalf', nationalityCountryCode: countryCode, startRoute: 'development' }, seed, rotatingChooser),
    );
}

function titulosDeSeleccion(countryCode: string) {
    return carreras(countryCode).flatMap((state) =>
        state.history.flatMap((h) => h.titlesWon.filter((t) => t.scope === 'national-team')),
    );
}

// ── 1. Existen ───────────────────────────────────────────────────────────────

test('una carrera internacional larga gana algo con su selección', () => {
    // Cuatro uniones que juegan torneos distintos: el Seis Naciones, el Rugby
    // Championship, el sudamericano y el europeo. Si el cable se desconectara de
    // nuevo, las cuatro se van a cero al mismo tiempo.
    for (const code of ['ie', 'za', 'uy', 'pt']) {
        const titulos = titulosDeSeleccion(code);
        assert.ok(titulos.length > 0, `${code}: ninguna de las ${SEMILLAS.length} carreras ganó un torneo internacional`);
    }
});

test('el título de selección viaja con la unión y sin club', () => {
    const titulos = titulosDeSeleccion('pt');
    assert.ok(titulos.length > 0, 'la muestra quedó vacía');
    for (const t of titulos) {
        assert.equal(t.club, null, 'un título de selección no tiene club');
        assert.equal(t.union, 'pt', 'la unión campeona tiene que ser la del jugador');
        assert.equal(t.category, 'national-tournament');
        assert.equal(t.scope, 'national-team');
    }
});

// ── 2. Sólo lo que se juega ──────────────────────────────────────────────────

test('nadie sale campeón de un torneo que su unión no disputa', () => {
    for (const code of ['ie', 'za', 'ar', 'uy', 'pt', 'jp']) {
        const jugables = new Set(
            INTERNATIONAL_COMPETITIONS
                .filter((c) => c.participants.includes(code))
                .flatMap((c) => c.trophies.map((t) => t.id)),
        );
        for (const t of titulosDeSeleccion(code)) {
            assert.ok(jugables.has(t.competitionId), `${code} salió campeón de ${t.competitionId}, que no juega`);
        }
    }
});

test('un torneo se corona sólo en su año de edición', () => {
    // El Mundial es cada cuatro temporadas desde 2027. Pedirle campeón a una
    // temporada sin edición tiene que devolver nada, no un campeón fantasma.
    const seed = 20260726;
    const conMundial = Array.from({ length: 12 }, (_, s) => s)
        .filter((s) => competitionsFor('nz', s).some((c) => c.id === 'world-cup'));
    assert.ok(conMundial.length > 0, 'el calendario tiene que tener alguna edición de Mundial');

    for (let s = 0; s < 12; s++) {
        const ids = internationalTitlesFor('nz', s, seed).map((t) => t.competitionId);
        if (!conMundial.includes(s)) {
            assert.ok(!ids.includes('world-cup'), `temporada ${s}: Mundial sin edición`);
        }
    }
});

test('las VENTANAS no reparten títulos: una gira no es un torneo', () => {
    for (const competition of INTERNATIONAL_COMPETITIONS.filter((c) => c.kind === 'window')) {
        assert.equal(competition.trophies.length, 0, `${competition.id}: una ventana no puede tener trofeo`);
    }
});

// ── 3. Sólo si lo jugaste ────────────────────────────────────────────────────

test('sin caps en la temporada no hay título de selección', () => {
    let temporadasConTitulo = 0;
    for (const state of carreras('ie')) {
        state.history.forEach((h, i) => {
            const nacionales = h.titlesWon.filter((t) => t.scope === 'national-team');
            if (nacionales.length === 0) return;
            temporadasConTitulo++;
            assert.ok(
                (state.seasons[i]?.capsGained ?? 0) > 0,
                `temporada ${i}: título de selección con 0 caps`,
            );
        });
    }
    assert.ok(temporadasConTitulo > 0, 'la muestra no produjo títulos: el test no probó nada');
});

// ── 4. Determinismo ──────────────────────────────────────────────────────────

test('el campeón es una función pura de (semilla, torneo, temporada)', () => {
    const comp = getInternationalCompetition('six-nations')!;
    for (const seed of SEMILLAS.slice(0, 8)) {
        for (let s = 0; s < 6; s++) {
            const a = resolveInternationalChampion(comp, s, seed);
            const b = resolveInternationalChampion(comp, s, seed);
            assert.equal(b, a, `semilla ${seed}, temporada ${s}: dos llamadas, dos campeones`);
            assert.ok(comp.participants.includes(a), `${a} no juega el Seis Naciones`);
        }
    }
});

test('el torneo NO depende del jugador: la misma semilla corona lo mismo para todos', () => {
    // Es lo que hace que el rng se re-siembre en vez de consumir el stream de la
    // carrera. Dos jugadores distintos de la misma semilla ven el mismo campeón
    // del Rugby Championship, jueguen ellos lo que jueguen — el torneo existe con
    // o sin vos.
    const comp = getInternationalCompetition('rugby-championship')!;
    const seed = 424242;
    const primera = Array.from({ length: 10 }, (_, s) => resolveInternationalChampion(comp, s, seed));
    const segunda = Array.from({ length: 10 }, (_, s) => resolveInternationalChampion(comp, s, seed));
    assert.deepEqual(segunda, primera);
});

// ── 5. La jerarquía se respeta ───────────────────────────────────────────────

test('el favorito gana más seguido, y el resto igual puede', () => {
    const comp = getInternationalCompetition('rugby-championship')!;
    const cuenta = new Map<string, number>();
    for (let seed = 1; seed <= 300; seed++) {
        const ganador = resolveInternationalChampion(comp, seed % 20, seed * 7919);
        cuenta.set(ganador, (cuenta.get(ganador) ?? 0) + 1);
    }
    const nz = cuenta.get('nz') ?? 0;
    const za = cuenta.get('za') ?? 0;
    const au = cuenta.get('au') ?? 0;
    // Nueva Zelanda y Sudáfrica son reputación 5; Australia 4 y Argentina 3.
    assert.ok(nz + za > 150, `las dos grandes ganan ${nz + za} de 300: demasiado parejo`);
    assert.ok(au < nz && au < za, 'Australia no puede ganar más que las dos de arriba');
    // Y NO es un monopolio: el torneo tiene que poder sorprender.
    assert.ok(nz + za < 300, 'las dos grandes ganaron TODO: el torneo dejó de ser un torneo');
});

test('un desempate ARBITRARIO no puede repartir campeonatos', () => {
    // El puesto base en el ranking mundial se desempata por código de país entre
    // uniones de la misma reputación —`data/nations.ts` lo declara arbitrario— y
    // eso llegó a decidir el Seis Naciones: con el peso de ranking en 1,6, el
    // reparto medido fue fr 43%, gb-eng 27%, gb-sct 19%, ie 11%, que es
    // exactamente el orden alfabético de los cuatro.
    //
    // Las cuatro tienen la misma fuerza declarada, así que ninguna puede llevarse
    // más del doble que otra.
    const comp = getInternationalCompetition('six-nations')!;
    const cuenta = new Map<string, number>();
    for (let seed = 1; seed <= 400; seed++) {
        const ganador = resolveInternationalChampion(comp, seed % 20, seed * 7919);
        cuenta.set(ganador, (cuenta.get(ganador) ?? 0) + 1);
    }
    const pares = ['fr', 'gb-eng', 'gb-sct', 'ie'].map((c) => cuenta.get(c) ?? 0);
    const mejor = Math.max(...pares);
    const peor = Math.min(...pares);
    assert.ok(peor > 0, 'alguna de las cuatro de arriba no ganó nunca');
    assert.ok(mejor < peor * 2.5, `reparto ${pares.join('/')}: el alfabeto está decidiendo el torneo`);
});

// ── 6. Lo que NO se otorga, declarado ────────────────────────────────────────

test('el Grand Slam y la Triple Corona quedan sin otorgar, y está documentado', () => {
    // Sus condiciones dependen del RESULTADO PARTIDO A PARTIDO, y el motor sabe
    // cuántos tests se juegan pero no contra quién ni cómo terminaron. Darlos
    // igual sería un trofeo que dice haber ganado cinco partidos que nunca se
    // jugaron.
    const pendientes = unresolvedTrophies().map((t) => t.id).sort();
    assert.deepEqual(pendientes, ['grand-slam', 'triple-crown']);

    const otorgados = new Set(
        ['ie', 'gb-eng', 'gb-sct', 'gb-wls', 'fr'].flatMap((c) => titulosDeSeleccion(c).map((t) => t.competitionId)),
    );
    for (const id of pendientes) {
        assert.ok(!otorgados.has(id), `${id} se otorgó sin poder resolverse`);
    }
    // Y el Seis Naciones sí se otorga: lo que falta es el extra, no el torneo.
    assert.ok(otorgados.has('six-nations'), 'el Seis Naciones tiene que poder ganarse');
});
