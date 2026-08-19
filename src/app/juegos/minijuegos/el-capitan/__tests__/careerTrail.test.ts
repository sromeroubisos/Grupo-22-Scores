// LA TRAYECTORIA SE CUENTA POR CAMISETAS, Y NINGUNA COPA SE PIERDE.
//
// Es un módulo de presentación, así que acá no hay bandas ni calibración —la
// disciplina del §1 del CLAUDE de captain es para el motor—. Lo que se prueba es
// el agrupado, y en particular los cuatro casos donde una versión ingenua falla:
//
//   · VOLVER AL CLUB NO ES EL MISMO PASO. Agrupar por id de club da una fila
//     «T1–T14» para alguien que estuvo siete años afuera.
//   · CADA COPA VA EN LA CAMISETA CON LA QUE SE GANÓ. Es el pedido entero de
//     esta pantalla: la vitrina suelta ya existía y no contaba nada.
//   · EL TÍTULO DE SELECCIÓN NO CUELGA DE NINGÚN CLUB. Es un `clubId: null` que
//     se cuela fácil y termina inventando una copa para el club de turno.
//   · UNA COPA DE UN CLUB QUE NO ESTÁ EN LA TRAYECTORIA NO SE TRAGA. Una
//     pantalla que se llama «la vitrina» no puede perder un título en silencio.
//
// Y desde que el paso se lleva TODO lo que pasó con esa camiseta, tres más:
//
//   · EL PREMIO ES DE LA CAMISETA CON LA QUE SE GANÓ, igual que la copa. Con dos
//     pasos por el mismo club, el año es lo único que los separa.
//   · LA PERTENENCIA DEL PASO ES LA DE SUS AÑOS. `belonging.byClub` guarda un
//     solo número por club y le pondría el mismo escalón a los dos pasos.
//   · UN PORCENTAJE NO SE SUMA. Es la regla que ya respeta el motor cuando lo
//     genera, y acá se rompe sola si uno acumula todo con el mismo `+=`.

import test from 'node:test';
import assert from 'node:assert/strict';

import type { CaptainSeasonEntry } from '../../../../../features/captain/types/season.ts';
import type {
    CaptainState,
    CreateCaptainInput,
    SquadTrack,
    Title,
} from '../../../../../features/captain/types/captain.ts';
import { createInitialCaptain } from '../../../../../features/captain/state/captain-reducer.ts';
import { representativeMatchesOf } from '../../../../../features/captain/engine/national-team.ts';
import { tournamentCompetitionId } from '../../../../../features/captain/types/tournament.ts';
import { groupAwards, groupTitles, trailOf } from '../careerTrail.ts';

const INPUT: CreateCaptainInput = {
    name: 'Bautista',
    surname: 'Uriarte',
    family: 'apertura',
    countryCode: 'ar',
};

function estado(): CaptainState {
    return createInitialCaptain(INPUT, 20260814);
}

/** El hooker es el único puesto con una métrica-gloria en porcentaje. */
function estadoHooker(): CaptainState {
    return createInitialCaptain({ ...INPUT, family: 'hooker' }, 20260814);
}

/**
 * Una temporada cerrada. Sólo importan el año, el club, los partidos y —desde
 * que el XV tiene bloque propio— el escalón representativo del año.
 */
function temporada(
    season: number,
    clubId: string | null,
    matchesPlayed = 20,
    trackId: SquadTrack = 'club',
): CaptainSeasonEntry {
    return {
        season,
        age: 17 + season,
        clubId,
        stage: 'amateur',
        ovr: 60,
        belonging: 30,
        fame: 10,
        money: 0,
        income: 0,
        matchesPlayed,
        glory: 0,
        glorySecondary: 0,
        caps: 0,
        trackId,
        share: 0.8,
        rating: 7,
        titles: [],
        awards: [],
        leaguePosition: 0,
        leagueTeams: 0,
        divisionMove: null,
        note: null,
        training: null,
        headDamage: 0,
        bodyDamage: 0,
        decisionText: null,
    };
}

function copaDeClub(season: number, competitionId: string, clubId: string): Title {
    return { season, competitionId, labelEs: `Copa ${competitionId}`, clubId, kind: 'club' };
}

test('los años seguidos en un club son UN paso', () => {
    const state = estado();
    state.history.push(temporada(1, 'a'), temporada(2, 'a'), temporada(3, 'a'));

    const { stints } = trailOf(state);

    assert.equal(stints.length, 1);
    assert.equal(stints[0].from, 1);
    assert.equal(stints[0].to, 3);
    assert.equal(stints[0].seasons, 3);
    assert.equal(stints[0].matches, 60);
});

test('volver al club de siempre es un paso nuevo y no el mismo estirado', () => {
    const state = estado();
    state.history.push(
        temporada(1, 'a'), temporada(2, 'a'),
        temporada(3, 'b'),
        temporada(4, 'a'),
    );

    const { stints } = trailOf(state);

    assert.deepEqual(
        stints.map((s) => [s.clubId, s.from, s.to]),
        [['a', 1, 2], ['b', 3, 3], ['a', 4, 4]],
    );
    // Y las dos filas del mismo club tienen que poder distinguirse.
    assert.notEqual(stints[0].key, stints[2].key);
});

test('cada copa cae en la camiseta con la que se ganó', () => {
    const state = estado();
    state.history.push(temporada(1, 'a'), temporada(2, 'a'), temporada(3, 'b'), temporada(4, 'b'));
    state.titles.push(
        copaDeClub(2, 'urba-primera', 'a'),
        copaDeClub(4, 'champions', 'b'),
    );

    const { stints } = trailOf(state);

    assert.deepEqual(stints.map((s) => s.titles.map((t) => t.competitionId)), [
        ['urba-primera'],
        ['champions'],
    ]);
});

test('el segundo paso por un club se lleva la copa de ESE año, no la del primero', () => {
    const state = estado();
    state.history.push(temporada(1, 'a'), temporada(2, 'b'), temporada(3, 'a'));
    state.titles.push(copaDeClub(3, 'nacional-de-clubes', 'a'));

    const { stints } = trailOf(state);

    assert.deepEqual(stints[0].titles, []);
    assert.equal(stints[2].titles.length, 1);
});

test('lo que ganaste con la selección no cuelga de ningún club', () => {
    const state = estado();
    state.history.push(temporada(1, 'a'), temporada(2, 'a'));
    state.national.caps = 24;
    state.titles.push({
        season: 2,
        competitionId: 'rugby-championship',
        labelEs: 'The Rugby Championship',
        clubId: null,
        kind: 'national',
    });

    const trail = trailOf(state);

    assert.deepEqual(trail.stints[0].titles, []);
    assert.equal(trail.national.caps, 24);
    assert.deepEqual(trail.national.titles.map((t) => t.label), ['The Rugby Championship']);
});

test('una copa de un club que la trayectoria no tiene se muestra igual', () => {
    const state = estado();
    state.history.push(temporada(1, 'a'));
    state.titles.push(copaDeClub(2, 'seven', 'z'));

    const { stints } = trailOf(state);

    const suelto = stints.find((s) => s.clubId === 'z');
    assert.ok(suelto, 'la copa del club ausente tiene que tener su propia fila');
    // Sin temporadas jugadas: la fila no puede afirmar un año que nadie jugó.
    assert.equal(suelto.seasons, 0);
    assert.equal(suelto.titles.length, 1);
});

test('la misma copa ganada dos veces es una línea con los dos años', () => {
    const state = estado();
    state.history.push(temporada(1, 'a'), temporada(2, 'a'), temporada(3, 'a'));
    state.titles.push(
        copaDeClub(1, 'urba-primera', 'a'),
        copaDeClub(3, 'urba-primera', 'a'),
        copaDeClub(2, 'nacional-de-clubes', 'a'),
    );

    const { stints } = trailOf(state);
    const trofeos = groupTitles(stints[0].titles);

    assert.equal(trofeos.length, 2);
    assert.deepEqual(trofeos[0], {
        competitionId: 'urba-primera',
        label: 'Copa urba-primera',
        seasons: [1, 3],
    });
});

test('cada premio cae en la camiseta con la que se ganó', () => {
    const state = estado();
    state.history.push(temporada(1, 'a'), temporada(2, 'a'), temporada(3, 'b'), temporada(4, 'b'));
    state.awards.push({ id: 'xv-ideal', season: 2 }, { id: 'mejor-del-mundo', season: 4 });

    const { stints } = trailOf(state);

    assert.deepEqual(stints.map((s) => s.awards.map((a) => a.id)), [
        ['xv-ideal'],
        ['mejor-del-mundo'],
    ]);
});

test('el segundo paso por un club se lleva el premio de ESE año, no el del primero', () => {
    const state = estado();
    state.history.push(temporada(1, 'a'), temporada(2, 'b'), temporada(3, 'a'));
    state.awards.push({ id: 'mejor-local', season: 3 });

    const { stints } = trailOf(state);

    assert.deepEqual(stints[0].awards, []);
    assert.equal(stints[2].awards.length, 1);
});

test('el mismo premio ganado dos veces es una línea con los dos años', () => {
    const state = estado();
    state.history.push(temporada(1, 'a'), temporada(2, 'a'), temporada(3, 'a'));
    state.awards.push(
        { id: 'mejor-del-mundo', season: 3 },
        { id: 'xv-ideal', season: 1 },
        { id: 'mejor-del-mundo', season: 2 },
    );

    const { stints } = trailOf(state);
    const premios = groupAwards(stints[0].awards);

    // Ordenados por año antes de agrupar: T2 llega antes que T3.
    assert.deepEqual(premios, [
        { id: 'xv-ideal', seasons: [1] },
        { id: 'mejor-del-mundo', seasons: [2, 3] },
    ]);
});

test('un premio de un año sin fila no se pierde: cae en el paso que estaba abierto', () => {
    const state = estado();
    state.history.push(temporada(1, 'a'), temporada(2, 'a'));
    state.awards.push({ id: 'xv-ideal', season: 5 });

    const { stints } = trailOf(state);

    assert.equal(stints[0].awards.length, 1);
});

test('la Pertenencia del paso es la más alta de SUS años, no la del club', () => {
    const state = estado();
    const t1 = { ...temporada(1, 'a'), belonging: 20 };
    const t2 = { ...temporada(2, 'a'), belonging: 62 };
    // Se fue, volvió, y arrancó de nuevo desde abajo.
    const t3 = { ...temporada(3, 'b'), belonging: 15 };
    const t4 = { ...temporada(4, 'a'), belonging: 40 };
    state.history.push(t1, t2, t3, t4);
    state.belonging.byClub = { a: 40, b: 15 };

    const { stints } = trailOf(state);

    assert.deepEqual(stints.map((s) => s.belonging), [62, 15, 40]);
});

test('el paso suma los partidos, se queda con la media más alta y promedia el puntaje', () => {
    const state = estado();
    state.history.push(
        { ...temporada(1, 'a', 18), ovr: 64, rating: 7.0, glory: 40 },
        { ...temporada(2, 'a', 22), ovr: 71, rating: 8.0, glory: 60 },
    );

    const { stints } = trailOf(state);

    assert.equal(stints[0].stats.matches, 40);
    assert.equal(stints[0].stats.bestOvr, 71);
    assert.equal(stints[0].stats.rating, 7.5);
    // El apertura cuenta puntos: eso sí se suma.
    assert.equal(stints[0].stats.glory, 100);
});

test('una métrica en porcentaje se promedia y no se suma', () => {
    const state = estadoHooker();
    state.history.push(
        { ...temporada(1, 'a'), glory: 86 },
        { ...temporada(2, 'a'), glory: 90 },
    );

    const { stints } = trailOf(state);

    assert.equal(stints[0].stats.glory, 88);
});

test('la temporada sin partidos no hunde el promedio de un porcentaje', () => {
    const state = estadoHooker();
    state.history.push(
        { ...temporada(1, 'a'), glory: 86 },
        // El año perdido entero por lesión: la ficha marca 0 porque no jugó.
        { ...temporada(2, 'a', 0), glory: 0, rating: 6 },
    );

    const { stints } = trailOf(state);

    assert.equal(stints[0].stats.glory, 86);
    assert.equal(stints[0].stats.rating, 7);
});

test('la carrera sin club resuelto no rompe la trayectoria', () => {
    const state = estado();
    state.history.push(temporada(1, null), temporada(2, null));

    const { stints } = trailOf(state);

    assert.equal(stints.length, 1);
    assert.equal(stints[0].clubId, null);
    assert.equal(stints[0].seasons, 2);
});

// ═══════════════════════════════════════════════════════════════════════════
//  EL SELECCIONADO A — la camiseta que existía y no se contaba en ningún lado
// ═══════════════════════════════════════════════════════════════════════════
//
// La trampa que estos casos vigilan no es el conteo: es la CONFUSIÓN. Los
// partidos con el XV no son caps, y las dos formas de arruinarlo son sumarlos
// ahí o colgar su copa del bloque de la mayor. Las dos se ven igual de bien en
// una revisión y las dos mienten sobre lo único que el rugby no perdona.

const COPA_XV = tournamentCompetitionId('nations-cup');

function copaDelXv(season: number): Title {
    return { season, competitionId: COPA_XV, labelEs: 'Nations Cup', clubId: null, kind: 'national' };
}

test('sin haber pisado el A-XV no hay bloque que dibujar', () => {
    const state = estado();
    state.history.push(temporada(1, 'a'), temporada(2, 'a'));

    assert.equal(trailOf(state).xv, null);
});

test('las temporadas en el A-XV se cuentan en partidos, no en caps', () => {
    const state = estado();
    state.history.push(
        temporada(1, 'a'),
        temporada(2, 'a', 20, 'a-xv'),
        temporada(3, 'a', 20, 'a-xv'),
        // La temporada en la mayor NO entra: es la otra camiseta.
        temporada(4, 'a', 20, 'nacional'),
    );
    state.national.caps = 9;

    const { xv, national } = trailOf(state);

    assert.ok(xv);
    assert.equal(xv.seasons, 2);
    assert.equal(xv.matches, 2 * representativeMatchesOf('a-xv'));
    // Los caps quedan donde estaban: el bloque del XV no los toca ni los suma.
    assert.equal(national.caps, 9);
});

test('el nombre del A-XV lo pone el país y no una tabla fija', () => {
    const arg = estado();
    arg.history.push(temporada(1, 'a', 20, 'a-xv'));
    assert.equal(trailOf(arg).xv?.label, 'Argentina XV');

    // La misma carrera con otra bandera se lee con el otro nombre. Es el caso
    // que el rótulo viejo —«Seleccionado A» para las ciento treinta y una
    // uniones— no podía distinguir.
    const nz = createInitialCaptain({ ...INPUT, countryCode: 'nz' }, 20260814);
    nz.history.push(temporada(1, 'a', 20, 'a-xv'));
    assert.equal(trailOf(nz).xv?.label, 'Nueva Zelanda XV');
});

test('la copa del A-XV cuelga de su camiseta y no de la mayor', () => {
    const state = estado();
    state.history.push(temporada(1, 'a', 20, 'a-xv'));
    state.titles.push(
        copaDelXv(1),
        { season: 2, competitionId: 'tour:mundial-mayor', labelEs: 'Mundial', clubId: null, kind: 'national' },
    );

    const { xv, national } = trailOf(state);

    assert.deepEqual(xv?.titles.map((t) => t.label), ['Nations Cup']);
    assert.deepEqual(national.titles.map((t) => t.label), ['Mundial']);
});

test('una copa del A-XV sin historial no se pierde, y no inventa temporadas', () => {
    // El borde real: la copa la escribe el reducer después de cerrar la fila del
    // año, así que puede llegar sin que el historial diga el escalón. Perder una
    // copa en la pantalla que se llama «la vitrina» es el peor error posible; el
    // otro error —afirmar temporadas que nadie jugó— también se descarta.
    const state = estado();
    state.titles.push(copaDelXv(1));

    const { xv } = trailOf(state);

    assert.ok(xv);
    assert.equal(xv.seasons, 0);
    assert.equal(xv.matches, 0);
    assert.equal(xv.titles.length, 1);
});
