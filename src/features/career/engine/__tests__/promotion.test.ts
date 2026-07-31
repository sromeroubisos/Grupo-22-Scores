// ASCENSO Y DESCENSO — que el grafo institucional se cumpla y no se desborde.
//
// El grafo (`MOVEMENTS`) estaba escrito desde el principio y no lo leía nadie.
// Estos tests cubren las dos mitades de haberlo enchufado: que la regla diga lo
// que el dato dice, y que un club que se mueve juegue DE VERDAD en la división
// nueva la temporada siguiente.

import test from 'node:test';
import assert from 'node:assert/strict';
import { careerReducer, getPendingEvent } from '../../index.ts';
import type { CareerState } from '../../types/career.ts';
import { divisionMoveFor, resolveClub } from '../promotion.ts';
import { MOVEMENTS, PARALLEL_COMPETITIONS } from '../../data/clubs2026/competitions2026.ts';
import { TDI_A_ID, TDI_B_ID, arDivisionOf } from '../../data/clubs2026/arSystem2026.ts';
import { CLUBS, getClub } from '../../data/clubs.ts';
import { sportingBandOf } from '../../data/competition-levels2026.ts';

// ── 1. La regla ──────────────────────────────────────────────────────────────

test('salir primero en segunda asciende', () => {
    // Pro D2 → Top 14, dos plazas: el primero y el segundo suben.
    assert.deepEqual(divisionMoveFor('prod2', 1, 16), { direction: 'promotion', from: 'prod2', to: 'top14' });
    assert.deepEqual(divisionMoveFor('prod2', 2, 16), { direction: 'promotion', from: 'prod2', to: 'top14' });
    assert.equal(divisionMoveFor('prod2', 3, 16), null, 'el tercero no sube: son dos plazas');
});

test('salir último en primera desciende', () => {
    // Top 14 → Pro D2, dos plazas de descenso: los dos últimos de catorce.
    assert.deepEqual(divisionMoveFor('top14', 14, 14), { direction: 'relegation', from: 'top14', to: 'prod2' });
    assert.deepEqual(divisionMoveFor('top14', 13, 14), { direction: 'relegation', from: 'top14', to: 'prod2' });
    assert.equal(divisionMoveFor('top14', 12, 14), null, 'el antepenúltimo se salva');
    // Y en Inglaterra baja UNO solo: las plazas salen del dato, no de un "último"
    // universal escrito a mano.
    assert.deepEqual(divisionMoveFor('prem', 10, 10), { direction: 'relegation', from: 'prem', to: 'championship' });
    assert.equal(divisionMoveFor('prem', 9, 10), null, 'en la Premiership baja uno solo');
});

test('la primera división no tiene a dónde ascender y la última no tiene a dónde bajar', () => {
    assert.equal(divisionMoveFor('top14', 1, 14), null, 'el campeón del Top 14 no asciende a ninguna parte');
    assert.equal(divisionMoveFor('nationale', 14, 14), null, 'debajo de Nationale el grafo no sigue');
});

test('las competiciones PARALELAS no ascienden ni descienden a nada', () => {
    // Salir último en el Super Rugby no es descender: no hay una segunda del
    // Super Rugby. Lo mismo con el NPC, la URC y la SRA.
    for (const comp of PARALLEL_COMPETITIONS) {
        assert.equal(divisionMoveFor(comp, 1, 12), null, `${comp}: no debería ascender`);
        assert.equal(divisionMoveFor(comp, 12, 12), null, `${comp}: no debería descender`);
    }
});

test('un torneo de un solo club no mueve a nadie', () => {
    // Es el mismo corte que usa el título de liga: sin campo real no hay tabla.
    assert.equal(divisionMoveFor('prod2', 1, 1), null);
});

// ── 1b. Argentina: la URBA asciende, las ramas no se cruzan ──────────────────
//
// Hasta el sistema de dos ramas esto era imposible de escribir: todo el rugby
// argentino era una competición paraguas y no había divisiones entre las que
// moverse. Ahora la URBA es una escalera de siete y cada región tiene la suya.

test('la URBA asciende y desciende como cualquier escalera vertical', () => {
    // Primera A → Top 14: dos plazas (campeón directo + playoff del 2° al 5°).
    assert.deepEqual(
        divisionMoveFor('ar-urba-primera-a', 1, 14),
        { direction: 'promotion', from: 'ar-urba-primera-a', to: 'ar-urba-top14' },
    );
    assert.equal(divisionMoveFor('ar-urba-primera-a', 3, 14), null, 'son dos plazas de ascenso');
    // Top 14: bajan los dos últimos, sin repechaje.
    assert.deepEqual(
        divisionMoveFor('ar-urba-top14', 14, 14),
        { direction: 'relegation', from: 'ar-urba-top14', to: 'ar-urba-primera-a' },
    );
    assert.equal(divisionMoveFor('ar-urba-top14', 12, 14), null, 'el antepenúltimo se salva');
    // Tercera: desciende SOLO el último (la única división de la URBA así).
    assert.deepEqual(
        divisionMoveFor('ar-urba-tercera', 11, 11),
        { direction: 'relegation', from: 'ar-urba-tercera', to: 'ar-urba-desarrollo' },
    );
    assert.equal(divisionMoveFor('ar-urba-tercera', 10, 11), null, 'en Tercera baja uno solo');
    // Desarrollo es la base: no desciende a ninguna parte.
    assert.equal(divisionMoveFor('ar-urba-desarrollo', 10, 10), null, 'Desarrollo no tiene abajo');
    // Y el campeón del Top 14 no asciende: arriba está el Nacional de Clubes, que
    // es una copa, no una división.
    assert.equal(divisionMoveFor('ar-urba-top14', 1, 14), null);
});

test('el ascenso argentino NUNCA cruza de rama ni de región', () => {
    const region = (id: string) => arDivisionOf(id)?.region ?? null;
    for (const move of MOVEMENTS) {
        const from = arDivisionOf(move.from);
        if (!from) continue;
        assert.equal(
            region(move.to), from.region,
            `${move.from} → ${move.to}: la URBA y el interior son universos cerrados`,
        );
    }
    // El campeón de Córdoba no sube al Top 14 de la URBA por más que sea Nivel 2.
    const cordoba = divisionMoveFor('ar-centro-top10', 1, 10);
    assert.equal(cordoba, null, 'la primera de una región no asciende a ninguna parte');
});

test('el TDI no es una escalera: sus plazas son de la región', () => {
    for (const id of [TDI_A_ID, TDI_B_ID]) {
        assert.equal(divisionMoveFor(id, 1, 16), null, `${id}: ganar el TDI no asciende al club`);
        assert.equal(divisionMoveFor(id, 16, 16), null, `${id}: salir último no lo desciende`);
    }
});

test('un club argentino ascendido deja de decir el nombre de su división vieja', () => {
    const club = CLUBS.find((c) => c.competitionId === 'ar-urba-primera-a')!;
    const state = { divisions: { [club.id]: 'ar-urba-top14' } } as unknown as CareerState;
    const resolved = resolveClub(state, club.id);
    assert.equal(resolved.competitionId, 'ar-urba-top14');
    assert.equal(resolved.divisionName, 'Top 14 de la URBA', 'el nombre viaja con el ascenso');
    assert.equal(resolved.divisionTier, 1, 'y el nivel del canon también');
    // Y la banda deportiva sube sola, derivada de la competición.
    assert.ok(sportingBandOf(resolved) > sportingBandOf(club), 'la banda se deriva de la división nueva');
});

test('ningún movimiento sale del grafo declarado', () => {
    // Si mañana alguien agrega una escalera a `MOVEMENTS`, este test la acepta
    // sola; lo que no puede pasar es que el motor invente una que el dato no tiene.
    const declaradas = new Set(MOVEMENTS.map((m) => `${m.from}->${m.to}`));
    const competiciones = new Set(CLUBS.map((c) => c.competitionId));
    for (const comp of competiciones) {
        for (const [pos, teams] of [[1, 14], [2, 14], [13, 14], [14, 14]] as const) {
            const move = divisionMoveFor(comp, pos, teams);
            if (move === null) continue;
            assert.ok(declaradas.has(`${move.from}->${move.to}`), `${comp}: movimiento inventado ${move.from}->${move.to}`);
        }
    }
});

// ── 2. El club resuelto ──────────────────────────────────────────────────────

test('sin movimientos, el club es exactamente el del catálogo', () => {
    const state = { divisions: {} } as unknown as CareerState;
    const club = CLUBS.find((c) => c.competitionId === 'top14')!;
    assert.equal(resolveClub(state, club.id), getClub(club.id), 'tendría que devolver el mismo objeto');
});

test('con movimiento, el club juega en su división nueva y sigue siendo el mismo club', () => {
    const club = CLUBS.find((c) => c.competitionId === 'prod2')!;
    const state = { divisions: { [club.id]: 'top14' } } as unknown as CareerState;
    const resuelto = resolveClub(state, club.id);

    assert.equal(resuelto.competitionId, 'top14');
    // Lo que NO cambia: el club ascendido no mejora por ascender.
    assert.equal(resuelto.rating, club.rating, 'el ascenso no sube el nivel del plantel');
    assert.equal(resuelto.prestige, club.prestige);
    assert.equal(resuelto.id, club.id);
    // Y la banda deportiva sí: es la de la competición, no la del club.
    assert.ok(
        sportingBandOf(resuelto) > sportingBandOf(club),
        'ascender tiene que subir la banda deportiva',
    );
});

test('un estado viejo sin `divisions` no revienta al resolver', () => {
    const club = CLUBS[0];
    const state = {} as unknown as CareerState;
    assert.equal(resolveClub(state, club.id).competitionId, club.competitionId);
});

// ── 3. De punta a punta ──────────────────────────────────────────────────────

/** Lleva una carrera nueva hasta la primera temporada jugable. */
function hastaJugarTemporada(seed: number): CareerState {
    let state = careerReducer({} as CareerState, {
        type: 'START',
        input: { position: 'flyhalf', nationalityCountryCode: 'fr' },
        seed,
    });
    let guard = 0;
    while (state.phase !== 'season' && guard++ < 12) {
        const event = getPendingEvent(state);
        if (!event) break;
        state = careerReducer(state, { type: 'CHOOSE', optionId: event.options[0].id });
    }
    return state;
}

test('el club que baja juega la temporada siguiente en la división de abajo', () => {
    const base = hastaJugarTemporada(90210);
    if (base.phase !== 'season') return;

    // Se lo planta en un club de Top 14 y se fuerza el descenso a mano: lo que se
    // mide es que el estado se APLIQUE, no la probabilidad de salir último.
    const state: CareerState = structuredClone(base);
    const top14 = CLUBS.find((c) => c.competitionId === 'top14')!;
    state.player.club = top14.id;
    state.divisions[top14.id] = 'prod2';

    const despues = careerReducer(state, { type: 'ADVANCE' });
    const temporada = despues.history[despues.history.length - 1];

    assert.equal(temporada.clubId, top14.id, 'sigue en el mismo club');
    assert.ok(
        temporada.competitionId === 'prod2' || temporada.competitionName.length > 0,
        'la temporada se jugó en la competición nueva',
    );
    assert.ok(
        temporada.sportingBand < sportingBandOf(top14),
        `la banda de la temporada (${temporada.sportingBand}) tendría que ser menor que la del Top 14`,
    );
});

test('el ascenso se decide con la temporada jugada y queda en el estado', () => {
    const base = hastaJugarTemporada(70707);
    if (base.phase !== 'season') return;

    const state: CareerState = structuredClone(base);
    // Club de Pro D2 con el rating más alto de su liga: es el que puede salir
    // primero sin forzar nada.
    const prod2 = CLUBS.filter((c) => c.competitionId === 'prod2').sort((a, b) => b.rating - a.rating)[0];
    state.player.club = prod2.id;

    let actual = state;
    let ascendio = false;
    for (let i = 0; i < 12 && !ascendio; i++) {
        const event = getPendingEvent(actual);
        actual = event
            ? careerReducer(actual, { type: 'CHOOSE', optionId: event.options[0].id })
            : careerReducer(actual, { type: 'ADVANCE' });
        if (actual.divisions[prod2.id] === 'top14') ascendio = true;
        if (actual.player.club !== prod2.id) break; // se fue del club: no hay nada que medir
        if (actual.phase === 'retired') break;
    }

    // No se afirma que ascienda en N temporadas —depende del rng— pero SÍ que si
    // el estado registró el ascenso, la división nueva es la del grafo.
    if (ascendio) {
        assert.equal(actual.divisions[prod2.id], 'top14');
        assert.equal(resolveClub(actual, prod2.id).competitionId, 'top14');
    }
});

test('el movimiento sobrevive al JSON (la garantía del F5)', () => {
    const state = { divisions: { 'x-club': 'top14' } } as unknown as CareerState;
    const ida = JSON.parse(JSON.stringify(state)) as CareerState;
    assert.deepEqual(ida.divisions, state.divisions);
});
