// La carrera completa: determinismo, catálogo y una partida de punta a punta.
//
// El determinismo es LA regla que no se rompe. Una misma semilla más una misma
// secuencia de decisiones tiene que producir exactamente la misma carrera, hoy y
// dentro de seis meses.

import assert from 'node:assert/strict';
import test from 'node:test';
import { CLUBS } from '../data/clubs.ts';
import { COMPETITIONS, TDI_TEAMS, fechasOf, getCompetition } from '../data/competitions.ts';
import { formatFor, promotionSlotsOf, relegationSlotsOf } from '../data/formats.ts';
import { getEvent } from '../data/events/index.ts';
import { COACH_PROFILES, PROFILE_POINTS } from '../data/profiles.ts';
import type { CoachState, TableRow } from '../types/coach.ts';
import { applyEffect } from './apply-decision.ts';
import { createRng } from './random.ts';
import {
    acknowledgeReveal,
    beginDecisions,
    chooseOption,
    closeSeason,
    createCareer,
    FIRST_YEAR,
    nextTramo,
    closeMarketWindow,
    playPlayoffMatch,
    simulateTramo,
} from './run-season.ts';
import { reviewSeason } from './pressure.ts';
import { buildFixture, sortTable } from './season.ts';
import { teamRating } from './squad.ts';
import { clubsIn, seedWorld } from './world.ts';

/* ------------------------------------------------------------------ */
/* Catálogo                                                            */
/* ------------------------------------------------------------------ */

test('las plazas del TDI suman exactamente su tamaño', () => {
    // Si no dieran, el torneo saldría a la cancha con equipos de menos.
    const total = COMPETITIONS.reduce((s, c) => s + c.tdiSlots, 0);
    assert.equal(total, TDI_TEAMS, `las plazas suman ${total} y el TDI tiene ${TDI_TEAMS} lugares`);
});

test('el grafo de ascensos y descensos es coherente en las dos direcciones', () => {
    for (const comp of COMPETITIONS) {
        if (comp.promotesTo) {
            const up = getCompetition(comp.promotesTo);
            assert.ok(up, `${comp.id} asciende a ${comp.promotesTo}, que no existe`);
            assert.equal(up?.relegatesTo, comp.id, `${up?.id} debería descender a ${comp.id}`);
        }
        if (comp.relegatesTo) {
            const down = getCompetition(comp.relegatesTo);
            assert.ok(down, `${comp.id} desciende a ${comp.relegatesTo}, que no existe`);
            assert.equal(down?.promotesTo, comp.id, `${down?.id} debería ascender a ${comp.id}`);
        }
    }
});

test('nadie asciende a un lugar donde no baja nadie', () => {
    for (const comp of COMPETITIONS) {
        const slots = promotionSlotsOf(formatFor(comp.id, FIRST_YEAR));
        if (slots > 0) {
            const up = comp.promotesTo ? getCompetition(comp.promotesTo) : null;
            assert.ok(up, `${comp.id} tiene plazas de ascenso pero no asciende a ningún lado`);
            assert.equal(
                relegationSlotsOf(formatFor(up?.id ?? '', FIRST_YEAR)),
                slots,
                `${comp.id} sube ${slots} a ${up?.id}, que no devuelve los mismos: la división crecería o se achicaría sola`,
            );
        }
    }
});

test('el reparto llena todos los torneos y es determinista', () => {
    const a = seedWorld();
    const b = seedWorld();
    assert.deepEqual(a, b, 'dos repartos del mismo catálogo dieron distinto');

    for (const comp of COMPETITIONS) {
        const teams = clubsIn(a, comp.id).length;
        assert.equal(teams, comp.teams, `${comp.short} salió con ${teams} clubes y necesita ${comp.teams}`);
    }
    assert.equal(CLUBS.length, 264, 'el catálogo cambió de tamaño: subí CLUB_CATALOG_VERSION');
});

test('un club juega un solo torneo', () => {
    const world = seedWorld();
    const counts = new Map<string, number>();
    for (const comp of COMPETITIONS) {
        for (const id of clubsIn(world, comp.id)) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    for (const [id, n] of counts) assert.equal(n, 1, `${id} figura en ${n} torneos`);
});

test('los perfiles de entrenador reparten los mismos puntos', () => {
    for (const p of COACH_PROFILES) {
        const total = Object.values(p.attrs).reduce((s, x) => s + x, 0);
        assert.equal(total, PROFILE_POINTS, `${p.id} suma ${total} y debería sumar ${PROFILE_POINTS}`);
    }
});

/* ------------------------------------------------------------------ */
/* Fixture y tabla                                                     */
/* ------------------------------------------------------------------ */

test('el fixture hace que todos jueguen contra todos, ida y vuelta', () => {
    const teams = ['a', 'b', 'c', 'd', 'e', 'f'];
    const fixture = buildFixture(teams, 2);
    assert.equal(fixture.length, ((teams.length * (teams.length - 1)) / 2) * 2);

    const played = new Map<string, number>();
    for (const fx of fixture) {
        const key = [fx.homeId, fx.awayId].sort().join('|');
        played.set(key, (played.get(key) ?? 0) + 1);
        assert.notEqual(fx.homeId, fx.awayId, 'un club jugando contra sí mismo');
    }
    for (const [key, n] of played) assert.equal(n, 2, `${key} se jugó ${n} veces`);
});

test('con equipos impares uno descansa cada fecha y nadie juega dos veces', () => {
    const teams = ['a', 'b', 'c', 'd', 'e'];
    const fixture = buildFixture(teams, 1);
    assert.equal(fixture.length, (teams.length * (teams.length - 1)) / 2);
    const byRound = new Map<number, string[]>();
    for (const fx of fixture) {
        const list = byRound.get(fx.round) ?? [];
        list.push(fx.homeId, fx.awayId);
        byRound.set(fx.round, list);
    }
    for (const [round, list] of byRound) {
        assert.equal(new Set(list).size, list.length, `en la fecha ${round} alguien juega dos veces`);
    }
});

test('la tabla desempata por diferencia, después por puntos a favor, y al final por id', () => {
    const row = (clubId: string, points: number, pf: number, pc: number): TableRow => ({
        clubId,
        played: 10,
        won: 0,
        drawn: 0,
        lost: 0,
        pf,
        pc,
        tries: 0,
        bonusOf: 0,
        bonusDef: 0,
        points,
    });
    const sorted = sortTable([
        row('zzz', 40, 300, 200),
        row('aaa', 40, 300, 200),
        row('bbb', 40, 250, 100),
        row('ccc', 41, 100, 400),
    ]);
    assert.deepEqual(
        sorted.map((r) => r.clubId),
        ['ccc', 'bbb', 'aaa', 'zzz'],
        'el orden no respeta puntos → diferencia → a favor → id',
    );
});

/* ------------------------------------------------------------------ */
/* Determinismo                                                        */
/* ------------------------------------------------------------------ */

/**
 * Juega N temporadas eligiendo siempre la opción `optionPick`-ésima. Devuelve el
 * estado final: si el motor es determinista, dos corridas iguales dan lo mismo.
 */
function playCareer(seed: number, clubId: string, seasons: number, optionPick: number): CoachState {
    let state = createCareer(seed, clubId, 'estratega');
    for (let s = 0; s < seasons; s++) {
        state = beginDecisions(state);
        // Un tope defensivo: si el bucle no avanzara, el test falla en vez de colgarse.
        for (let guard = 0; guard < 80 && state.phase !== 'season'; guard++) {
            if (state.phase === 'decision') {
                const event = getEvent(state.pendingEventId as string);
                const option = event?.options[Math.min(optionPick, (event?.options.length ?? 1) - 1)];
                state = chooseOption(state, option?.id ?? '');
            } else if (state.phase === 'reveal') {
                state = acknowledgeReveal(state);
            } else if (state.phase === 'playoff') {
                state = playPlayoffMatch(state, 'plan');
            } else if (state.phase === 'training' || state.phase === 'keymatch') {
                state = simulateTramo(state);
            } else if (state.phase === 'tramo') {
                state = nextTramo(state);
            } else if (state.phase === 'market') {
                state = closeMarketWindow(state);
            } else {
                break;
            }
        }
        assert.equal(state.phase, 'season', `la temporada ${s + 1} no llegó a jugarse`);
        state = closeSeason(state);
        if (state.phase === 'fired') break;
    }
    return state;
}

test('misma semilla y mismas decisiones: misma carrera', () => {
    const a = playCareer(12345, 'sb-los-tarcos', 6, 0);
    const b = playCareer(12345, 'sb-los-tarcos', 6, 0);
    assert.equal(JSON.stringify(a), JSON.stringify(b), 'dos carreras idénticas divergieron');
});

test('otra decisión, otra carrera: las elecciones importan', () => {
    const a = playCareer(12345, 'sb-los-tarcos', 6, 0);
    const b = playCareer(12345, 'sb-los-tarcos', 6, 1);
    assert.notEqual(JSON.stringify(a), JSON.stringify(b), 'elegir distinto dio el mismo resultado');
});

test('otra semilla, otra carrera', () => {
    const a = playCareer(1, 'sb-los-tarcos', 4, 0);
    const b = playCareer(2, 'sb-los-tarcos', 4, 0);
    assert.notEqual(JSON.stringify(a), JSON.stringify(b));
});

test('el estado es JSON puro: se puede guardar y volver a leer idéntico', () => {
    const state = playCareer(777, 'sb-marabunta-r-c', 3, 0);
    const roundTrip = JSON.parse(JSON.stringify(state)) as CoachState;
    assert.deepEqual(roundTrip, state, 'el estado no sobrevive un viaje por JSON');
});

/* ------------------------------------------------------------------ */
/* Una carrera larga no se rompe                                       */
/* ------------------------------------------------------------------ */

test('veinte temporadas seguidas: nada se va a NaN ni se sale de rango', () => {
    const state = playCareer(4242, 'sb-neuquen-r-c', 20, 0);

    assert.ok(state.seasons.length > 0, 'no se jugó ninguna temporada');
    for (const s of state.seasons) {
        assert.ok(Number.isFinite(s.caja), `caja no finita en la temporada ${s.season}`);
        assert.ok(s.position >= 1 && s.position <= s.teams, `posición ${s.position} en un torneo de ${s.teams}`);
        assert.ok(s.pf >= 0 && s.pc >= 0, 'puntos negativos en la planilla');
        assert.ok(s.pressure >= 0 && s.pressure <= 100, `presión fuera de rango: ${s.pressure}`);
        assert.equal(s.won + s.drawn + s.lost, fechasOf(s.competitionId, s.year), 'no jugó todas las fechas');
    }

    assert.ok(state.club.cohesion >= 0 && state.club.cohesion <= 100);
    assert.ok(state.club.finances.estructura >= 0 && state.club.finances.estructura <= 100);
    assert.ok(state.club.finances.hinchada >= 0 && state.club.finances.hinchada <= 100);
    assert.ok(state.coach.reputation >= 0 && state.coach.reputation <= 100);
    for (const p of state.squad) {
        assert.ok(Number.isFinite(p.level), `${p.name} tiene nivel no finito`);
        assert.ok(p.level <= p.potential + 0.05, `${p.name} pasó su techo: ${p.level} > ${p.potential}`);
        assert.ok(p.age >= 18 && p.age <= 40, `${p.name} tiene ${p.age} años`);
    }
});

test('la presión nunca se apaga del todo: siempre queda algo que perder', () => {
    // Se descubrió jugando: sin piso, a la segunda temporada cumplida la presión
    // tocaba cero y se quedaba ahí para siempre. El entrenador se volvía
    // ininechable y el eje central del juego dejaba de existir.
    const objective = { kind: 'campeon' as const, position: 1, text: 'Salir campeón.' };
    const glorioso = {
        objective,
        position: 1,
        champion: true,
        promoted: false,
        relegated: false,
        tdi: 'campeon' as const,
        nacional: true,
        caja: 90_000_000,
        ingresos: 90_000_000,
    };

    let pressure = 30;
    for (let i = 0; i < 12; i++) pressure = reviewSeason(pressure, glorioso).pressure;
    assert.ok(pressure >= 20, `doce temporadas gloriosas dejaron la presión en ${pressure}: el club ya no exige nada`);

    // Y desde el piso, un año malo tiene que volver a doler.
    const malo = { ...glorioso, position: 9, champion: false, tdi: null, nacional: false };
    assert.ok(
        reviewSeason(pressure, malo).pressure > pressure + 10,
        'una temporada mala no movió la presión desde el piso',
    );
});

test('"salir campeón" es ganar el título, no puntear la tabla', () => {
    const objective = { kind: 'campeon' as const, position: 1, text: 'Salir campeón.' };
    const base = {
        objective,
        position: 1,
        promoted: false,
        relegated: false,
        tdi: null,
        nacional: false,
        caja: 20_000_000,
        ingresos: 60_000_000,
    };
    assert.equal(reviewSeason(40, { ...base, champion: true }).objectiveMet, true);
    assert.equal(
        reviewSeason(40, { ...base, champion: false }).objectiveMet,
        false,
        'terminar primero y perder la final no es salir campeón',
    );
});

test('un efecto que toca al plantel MUEVE el plantel', () => {
    // La tarjeta del refuerzo del club vecino decía "el equipo mejora" y el chip
    // de Plantel no aparecía: `target: 'peor'` levantaba al número 26, que no
    // entra al XV, y `teamRating` —que mide los ocho mejores forwards y los siete
    // mejores backs— ni se enteraba. El efecto se declaraba, se aplicaba y no
    // cambiaba nada. Es justo lo que los chips por diferencia existen para
    // delatar, así que el invariante queda medido.
    const state = createCareer(31337, 'sb-jockey-club-salta', 'estratega');
    const rng = createRng(1);

    for (const target of ['mejor', 'peor', 'joven', 'primera-linea'] as const) {
        const before = teamRating(state.squad);
        const after = teamRating(applyEffect(rng, state, { jugador: { delta: 6, target } }).squad);
        assert.ok(
            after > before,
            `un +6 a "${target}" no movió el plantel (${before.toFixed(2)} → ${after.toFixed(2)})`,
        );
    }
});

test('el plantel se renueva solo: nadie juega hasta los cincuenta', () => {
    const state = playCareer(99, 'sb-tucuman-rugby-club', 15, 0);
    const oldest = Math.max(...state.squad.map((p) => p.age));
    assert.ok(oldest <= 38, `hay alguien de ${oldest} años todavía en el plantel`);
    assert.equal(state.squad.length, 26, 'el plantel cambió de tamaño');
});
