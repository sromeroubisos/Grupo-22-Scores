// El saneado de una partida guardada: lo que se repara, lo que se descarta y lo
// que se deja como está.

import assert from 'node:assert/strict';
import test from 'node:test';
import { COMPETITIONS } from '../data/competitions.ts';
import { ALL_EVENTS, getEvent } from '../data/events/index.ts';
import type { CoachState } from '../types/coach.ts';
import { beginDecisions, closeSeason, createCareer, playPlayoffMatch, playSeason } from './run-season.ts';
import { sanitizeCoach } from './sanitize.ts';
import { clubsIn, repairWorld, seedWorld } from './world.ts';

const CLUB = 'sb-los-tarcos';

function afterOneSeason(): CoachState {
    // Una temporada jugada sin decisiones: alcanza para tener tabla, historial y
    // un mundo que ya se movió una vez.
    const fresh = createCareer(2024, CLUB, 'estratega');
    let s = playSeason({ ...fresh, decisionsLeft: 0 });
    while (s.phase === 'playoff') s = playPlayoffMatch(s, 'plan');
    return closeSeason(s);
}

test('una partida sana sale idéntica: sanear no es tocar', () => {
    const state = afterOneSeason();
    const again = sanitizeCoach(JSON.parse(JSON.stringify(state)));
    assert.deepEqual(again, state, 'el saneado cambió una partida que no tenía nada que reparar');
});

test('sanear es idempotente', () => {
    const once = sanitizeCoach(afterOneSeason());
    assert.ok(once);
    assert.deepEqual(sanitizeCoach(once), once);
});

test('lo que no es una partida devuelve null y no explota', () => {
    for (const raw of [null, undefined, 42, 'hola', [], {}, { clubId: 'ARG_NO_EXISTE' }]) {
        assert.equal(sanitizeCoach(raw), null, `${JSON.stringify(raw)} pasó por partida`);
    }
});

test('un club que ya no está en el catálogo es la única pérdida total', () => {
    const state = afterOneSeason();
    assert.equal(sanitizeCoach({ ...state, clubId: 'ARG_CLUB_BORRADO' }), null);
});

test('el mundo se repara: clubes desconocidos afuera, torneos completos, el jugador adentro', () => {
    const state = afterOneSeason();
    const world = { ratings: { ...state.world.ratings }, divisions: { ...state.world.divisions } };

    // Simula un catálogo que cambió: un club que ya no existe metido en un torneo,
    // un torneo que desapareció, y tres clubes del torneo del jugador que se
    // borraron del guardado.
    world.ratings['ARG_FANTASMA'] = 30;
    world.divisions['ARG_FANTASMA'] = state.competitionId;
    const rivals = clubsIn(world, state.competitionId).filter((id) => id !== CLUB && id !== 'ARG_FANTASMA').slice(0, 3);
    for (const id of rivals) {
        delete world.divisions[id];
        delete world.ratings[id];
    }
    const otherComp = COMPETITIONS.find((c) => c.id !== state.competitionId)!;
    const someone = clubsIn(world, otherComp.id)[0];
    world.divisions[someone] = 'TORNEO_QUE_YA_NO_EXISTE';

    const repaired = repairWorld(world, CLUB);
    assert.equal(repaired.divisions['ARG_FANTASMA'], undefined, 'un club fantasma sigue en la pirámide');
    assert.equal(repaired.ratings['ARG_FANTASMA'], undefined);
    assert.equal(repaired.divisions[CLUB], state.competitionId, 'el club del jugador cambió de torneo sin motivo');
    for (const comp of COMPETITIONS) {
        const n = clubsIn(repaired, comp.id).length;
        assert.equal(n, comp.teams, `${comp.short} quedó con ${n} clubes y necesita ${comp.teams}`);
    }
    for (const id of rivals) {
        assert.ok(Number.isFinite(repaired.ratings[id]), `${id} se quedó sin rating al volver`);
    }
});

test('si el torneo del jugador desapareció, el club cae a un escalón real y el objetivo se vuelve a pedir', () => {
    const state = afterOneSeason();
    const broken: CoachState = {
        ...state,
        competitionId: 'TORNEO_QUE_YA_NO_EXISTE',
        world: {
            ratings: state.world.ratings,
            divisions: { ...state.world.divisions, [CLUB]: 'TORNEO_QUE_YA_NO_EXISTE' },
        },
    };
    const fixed = sanitizeCoach(broken);
    assert.ok(fixed);
    assert.ok(COMPETITIONS.some((c) => c.id === fixed.competitionId), 'el club quedó en un torneo inexistente');
    assert.equal(fixed.world.divisions[CLUB], fixed.competitionId);
    assert.equal(typeof fixed.objective.text, 'string');
    assert.equal(fixed.lastLeagueMovement, null, 'un movimiento de un torneo que ya no existe no se puede respetar');
});

test('los eventos que ya no existen se olvidan, y una tarjeta pendiente perdida se vuelve a sortear sin cobrarla', () => {
    const state = beginDecisions(createCareer(7, CLUB, 'estratega'));
    assert.equal(state.phase, 'decision');
    const left = state.decisionsLeft;

    const stale: CoachState = {
        ...state,
        pendingEventId: 'via-tarjeta-que-se-borro',
        seenEvents: { ...state.seenEvents, 'club-evento-viejo': 1, [ALL_EVENTS[0].id]: 1 },
    };
    const fixed = sanitizeCoach(stale);
    assert.ok(fixed);
    assert.equal(fixed.seenEvents['club-evento-viejo'], undefined, 'se guardó el cooldown de un evento que no existe');
    assert.equal(fixed.seenEvents[ALL_EVENTS[0].id], 1, 'se perdió el cooldown de un evento que sí existe');
    assert.equal(fixed.phase, 'decision');
    assert.ok(fixed.pendingEventId && getEvent(fixed.pendingEventId), 'no se sorteó una tarjeta nueva');
    assert.equal(fixed.decisionsLeft, left, 'se le cobró una decisión que no tomó');
});

test('un plantel roto se regenera con el rating del club y el RNG queda snapshoteado', () => {
    const state = afterOneSeason();
    const fixed = sanitizeCoach({ ...state, squad: [{ nada: true }, 'x'] });
    assert.ok(fixed);
    assert.equal(fixed.squad.length, 26);
    assert.notEqual(fixed.rngState, state.rngState, 'generar un plantel consume RNG y tiene que dejar rastro');
    assert.deepEqual(sanitizeCoach(fixed), fixed, 'la segunda carga volvió a generar el plantel');
});

test('los números fuera de rango se acotan y los NaN caen a un valor sano', () => {
    const state = afterOneSeason();
    const fixed = sanitizeCoach({
        ...state,
        pressure: 500,
        club: { cohesion: Number.NaN, finances: { ...state.club.finances, hinchada: -40 } },
    });
    assert.ok(fixed);
    assert.equal(fixed.pressure, 100);
    assert.equal(fixed.club.cohesion, 50);
    assert.equal(fixed.club.finances.hinchada, 0);
});

test('un mundo recién repartido ya está reparado', () => {
    const world = seedWorld();
    assert.deepEqual(repairWorld(world, null), world);
});

test('una división guardada con un club de más ("15° de 14") vuelve a su tamaño aunque el jugador esté adentro', () => {
    const world = seedWorld();
    const comp = 'ar-urba-primera-c';
    const members = clubsIn(world, comp);
    const me = members[10];
    // Un club de Segunda colado en Primera C, como dejaba el bug viejo.
    const intruder = clubsIn(world, 'ar-urba-segunda')[0];
    const broken = { ...world, divisions: { ...world.divisions, [intruder]: comp } };
    assert.equal(clubsIn(broken, comp).length, members.length + 1);
    const repaired = repairWorld(broken, me);
    assert.equal(clubsIn(repaired, comp).length, members.length, 'la división sigue con uno de más');
    assert.equal(repaired.divisions[me], comp, 'el club del jugador se cayó de su división');
    for (const c of COMPETITIONS) {
        assert.equal(clubsIn(repaired, c.id).length, c.teams, `${c.id} quedó con otro tamaño`);
    }
});
