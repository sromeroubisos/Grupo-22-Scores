// EL AVISO ANUNCIA LO QUE ACABÁS DE GANAR, NO LA VITRINA ENTERA.
//
// Es un módulo de PRESENTACIÓN, así que acá no hay bandas ni calibración — la
// disciplina del §1 del CLAUDE de captain es para el motor. Lo que se prueba es
// la resta, y en particular los tres casos donde una versión ingenua falla:
//
//   · LA VITRINA VIEJA NO SE REPITE. Es la falla que se ve en pantalla y la que
//     arruina el juego: catorce títulos anunciados de nuevo en la temporada
//     quince, o peor, en cada F5.
//   · LA COPA QUE NO ESTÁ EN LA FILA DEL AÑO. El Mundial lo escribe el reducer
//     después de cerrar la temporada, así que es justo el trofeo que una
//     pantalla colgada de `entry.titles` no puede ver. Si se anuncia, la resta
//     está mirando donde tiene que mirar.
//   · EL TÍTULO DE SELECCIÓN NO TIENE CLUB. Ponerle uno sería mentir en la línea
//     que el jugador va a releer, y es un `null` que se cuela fácil.
//
// Y dos más desde que se anuncian los cien caps y la primera convocatoria:
//
//   · LOS CIEN CAPS SE CRUZAN, NO SE PISAN. Una gira suma varios caps de golpe:
//     con `=== 100` el aviso se pierde justo en la carrera que más lo merece.
//   · LA TEMPORADA DE UN CONTADOR NO ES `state.season`. El reducer ya abrió el
//     año siguiente cuando los dos estados se comparan, así que el aviso diría
//     una temporada que todavía no se jugó.

import test from 'node:test';
import assert from 'node:assert/strict';

import type { CaptainSeasonEntry } from '../../../../../features/captain/types/season.ts';
import type { CaptainState, CreateCaptainInput } from '../../../../../features/captain/types/captain.ts';
import type { Milestone, MilestoneId } from '../../../../../features/captain/types/achievements.ts';
import { createInitialCaptain } from '../../../../../features/captain/state/captain-reducer.ts';
import { newHonours } from '../honours.ts';

const INPUT: CreateCaptainInput = {
    name: 'Bautista',
    surname: 'Uriarte',
    family: 'apertura',
    countryCode: 'ar',
};

/** El nombre del club lo trae la pantalla; acá alcanza con que se note. */
const NOMBRE = (clubId: string) => `Club ${clubId}`;

function estado(): CaptainState {
    const base = createInitialCaptain(INPUT, 20260814);
    base.player.clubId = base.player.clubId ?? 'ar-club';
    return base;
}

/** Una copa de club, como la escribe `simulate-season`. */
function copaDeClub(season: number, competitionId: string, clubId: string) {
    return { season, competitionId, labelEs: `Copa ${competitionId}`, clubId, kind: 'club' as const };
}

/** Un hito, como lo escribe `detectMilestones`. El texto no lo lee el aviso. */
function hito(id: MilestoneId, season: number): Milestone {
    return { id, season, age: 17 + season, text: `Hito ${id}.` };
}

/**
 * Una fila del historial. De todo lo que guarda, el aviso solo le pregunta la
 * temporada — que es justo el dato que `state.season` ya no tiene cuando los dos
 * estados se comparan.
 */
function fila(season: number): CaptainSeasonEntry {
    return { season } as CaptainSeasonEntry;
}

test('la vitrina que ya estaba no se vuelve a anunciar', () => {
    const antes = estado();
    antes.titles.push(copaDeClub(3, 'urba-primera', 'ar-club'));
    antes.awards.push({ id: 'mejor-local', season: 3 });

    const despues = structuredClone(antes);
    despues.titles.push(copaDeClub(4, 'urba-top12', 'ar-club'));

    const avisos = newHonours(antes, despues, NOMBRE);

    assert.equal(avisos.length, 1);
    assert.equal(avisos[0].label, 'Copa urba-top12');
});

test('un paso que no ganó nada se queda callado', () => {
    const antes = estado();
    antes.titles.push(copaDeClub(3, 'urba-primera', 'ar-club'));

    // La temporada avanza y el jugador crece, pero la vitrina no se movió.
    const despues = structuredClone(antes);
    despues.season += 1;
    despues.player.ovr += 4;

    assert.deepEqual(newHonours(antes, despues, NOMBRE), []);
});

test('la copa que se ganó jugando el torneo también se anuncia', () => {
    // Es la que `FINISH_TOURNAMENT` escribe DESPUÉS de cerrar la fila del año:
    // sin club, con `kind: 'national'` y fuera de `entry.titles`.
    const antes = estado();
    const despues = structuredClone(antes);
    despues.titles.push({
        season: 6,
        competitionId: 'tour:mundial',
        labelEs: 'el Mundial',
        clubId: null,
        kind: 'national',
    });

    const avisos = newHonours(antes, despues, NOMBRE);

    assert.equal(avisos.length, 1);
    assert.equal(avisos[0].kind, 'national');
    assert.equal(avisos[0].label, 'el Mundial');
    assert.equal(avisos[0].eyebrow, 'Con tu selección');
    // Sin club: ni escudo ni nombre inventado.
    assert.equal(avisos[0].clubId, null);
    assert.equal(avisos[0].clubName, null);
    assert.equal(avisos[0].detail, 'Temporada 6');
});

test('la copa del club llega con su escudo y con su nombre', () => {
    const antes = estado();
    const despues = structuredClone(antes);
    despues.titles.push(copaDeClub(7, 'urba-top12', 'ar-sic'));

    const [aviso] = newHonours(antes, despues, NOMBRE);

    assert.equal(aviso.kind, 'club');
    assert.equal(aviso.eyebrow, 'Campeón');
    assert.equal(aviso.clubId, 'ar-sic');
    assert.equal(aviso.clubName, 'Club ar-sic');
    assert.equal(aviso.detail, 'Club ar-sic · Temporada 7');
});

test('los dos conjuntos llegan en orden: primero las copas, después los premios', () => {
    const antes = estado();
    const despues = structuredClone(antes);
    despues.titles.push(copaDeClub(9, 'urba-top12', 'ar-sic'));
    despues.awards.push({ id: 'mejor-del-mundo', season: 9 });
    despues.awards.push({ id: 'xv-ideal', season: 9 });

    const avisos = newHonours(antes, despues, NOMBRE);

    assert.deepEqual(avisos.map((a) => a.kind), ['club', 'award', 'award']);
    assert.deepEqual(
        avisos.map((a) => a.label),
        ['Copa urba-top12', 'Mejor jugador del mundo', 'XV ideal del año'],
    );
    assert.deepEqual(
        avisos.map((a) => a.eyebrow),
        ['Campeón', 'Premio individual', 'Premio individual'],
    );
});

test('la primera vez que tu unión te llama se anuncia', () => {
    const antes = estado();
    const despues = structuredClone(antes);
    despues.milestones.push(hito('primera-convocatoria', 6));

    const avisos = newHonours(antes, despues, NOMBRE);

    assert.equal(avisos.length, 1);
    assert.equal(avisos[0].kind, 'national');
    assert.equal(avisos[0].eyebrow, 'Con tu selección');
    assert.equal(avisos[0].label, 'Primera convocatoria');
    assert.equal(avisos[0].detail, 'Temporada 6');
    assert.equal(avisos[0].clubId, null);
});

test('los otros hitos no frenan la pantalla', () => {
    // El motor los registra igual y se leen en otro lado: el aviso es para lo
    // que pasa una vez en la vida, y si lo usa para todo deja de valer.
    const antes = estado();
    const despues = structuredClone(antes);
    despues.milestones.push(hito('debut-senior', 1), hito('primer-contrato', 4));

    assert.deepEqual(newHonours(antes, despues, NOMBRE), []);
});

test('los cien caps se anuncian aunque la gira los salte de golpe', () => {
    const antes = estado();
    antes.national.caps = 98;
    antes.history.push(fila(12));

    const despues = structuredClone(antes);
    // Tres caps de una gira: el 100 se cruza sin pisarse nunca.
    despues.national.caps = 101;
    despues.history.push(fila(13));
    // El reducer ya abrió el año siguiente cuando esto se compara.
    despues.season = 14;

    const avisos = newHonours(antes, despues, NOMBRE);

    assert.equal(avisos.length, 1);
    assert.equal(avisos[0].label, '100 caps');
    // La temporada es la que se jugó, no la que se abrió.
    assert.equal(avisos[0].detail, 'Temporada 13');
});

test('los cien caps se anuncian una sola vez en la carrera', () => {
    const antes = estado();
    antes.national.caps = 104;
    antes.history.push(fila(14));

    const despues = structuredClone(antes);
    despues.national.caps = 112;
    despues.history.push(fila(15));

    assert.deepEqual(newHonours(antes, despues, NOMBRE), []);
});

test('los conjuntos llegan en orden: las copas, la selección, y los premios', () => {
    const antes = estado();
    antes.national.caps = 97;
    const despues = structuredClone(antes);
    despues.titles.push(copaDeClub(13, 'urba-top12', 'ar-sic'));
    despues.milestones.push(hito('primera-convocatoria', 13));
    despues.national.caps = 100;
    despues.history.push(fila(13));
    despues.awards.push({ id: 'mejor-del-mundo', season: 13 });

    const avisos = newHonours(antes, despues, NOMBRE);

    assert.deepEqual(
        avisos.map((a) => a.label),
        ['Copa urba-top12', 'Primera convocatoria', '100 caps', 'Mejor jugador del mundo'],
    );
    assert.equal(new Set(avisos.map((a) => a.key)).size, avisos.length);
});

test('dos avisos de la misma temporada no comparten identidad', () => {
    // La `key` es lo que la pantalla usa para dibujar y para cerrar de a uno: si
    // dos se repiten, cerrar una copa cierra la otra.
    const antes = estado();
    const despues = structuredClone(antes);
    despues.titles.push(copaDeClub(11, 'urba-top12', 'ar-sic'));
    despues.titles.push(copaDeClub(11, 'nacional-de-clubes', 'ar-sic'));
    despues.awards.push({ id: 'mejor-del-mundo', season: 11 });
    despues.awards.push({ id: 'xv-ideal', season: 11 });

    const claves = newHonours(antes, despues, NOMBRE).map((a) => a.key);

    assert.equal(new Set(claves).size, claves.length);
});
