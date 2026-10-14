// Lo que se trajo de El Interino: el ajuste del perfil, las ofertas de trabajo,
// las mejoras del club y la evaluación de la subcomisión en tres ejes.
//
// Cada pieza tiene su camino feliz, pero lo que más importa acá son los
// invariantes: las ofertas no tocan el RNG de la carrera, comprar no consume
// azar, una decisión no borra las mejoras, y el efecto que se promete en la
// pantalla es el que el motor aplica.

import assert from 'node:assert/strict';
import test from 'node:test';
import { getCompetition } from '../data/competitions.ts';
import { getEvent } from '../data/events/index.ts';
import { COACH_PROFILES, PROFILE_POINTS, TUNE_RANGE, tuneAttrs } from '../data/profiles.ts';
import { UPGRADES, UPGRADE_EFFECT, UPGRADE_MAX_LEVEL } from '../data/upgrades.ts';
import type { CoachState, SquadPlayer } from '../types/coach.ts';
import { applyEffect } from './apply-decision.ts';
import { BOARD_WEIGHTS, boardReview } from './board.ts';
import { seasonBudget } from './economy.ts';
import { FIRST_JOB_MIN_LEVEL, jobOffers, startingOffers } from './offers.ts';
import { createRng } from './random.ts';
import {
    acknowledgeReveal,
    beginDecisions,
    chooseOption,
    closeSeason,
    createCareer,
    nextTramo,
    closeMarketWindow,
    playPlayoffMatch,
    simulateTramo,
    takeNewClub,
} from './run-season.ts';
import { ageSquad } from './squad.ts';
import { buyUpgrade, upgradeBlock, upgradeCost, upgradeLevel } from './upgrades.ts';
import { PLAYOFF_APPROACHES, playoffChances } from './playoff.ts';
import { mySideOf, playSeason } from './run-season.ts';
import { seedWorld } from './world.ts';

const CLUB = 'sb-marabunta-r-c';

/** Toma las decisiones (siempre la primera opción) y juega la temporada. */
function playOne(state: CoachState): CoachState {
    let s = beginDecisions(state);
    for (let guard = 0; guard < 60 && s.phase !== 'season'; guard++) {
        if (s.phase === 'playoff') {
            s = playPlayoffMatch(s, 'plan');
        } else if (s.phase === 'training' || s.phase === 'keymatch') {
            s = simulateTramo(s);
        } else if (s.phase === 'tramo') {
            s = nextTramo(s);
        } else if (s.phase === 'market') {
            s = closeMarketWindow(s);
        } else if (s.phase === 'decision' && s.pendingEventId) {
            const first = getEvent(s.pendingEventId)?.options[0];
            assert.ok(first, `la tarjeta ${s.pendingEventId} no tiene opciones`);
            s = chooseOption(s, first.id);
        } else {
            s = acknowledgeReveal(s);
        }
    }
    assert.equal(s.phase, 'season', 'la temporada no se jugó');
    return s;
}

function withCaja(state: CoachState, caja: number): CoachState {
    return { ...state, club: { ...state.club, finances: { ...state.club.finances, caja } } };
}

/* ------------------------------------------------------------------ */
/* El ajuste del perfil                                                */
/* ------------------------------------------------------------------ */

test('el perfil tal cual es un ajuste legal', () => {
    for (const p of COACH_PROFILES) assert.deepEqual(tuneAttrs(p.id, p.attrs), p.attrs, p.id);
});

test('mover puntos entre ejes es legal; cambiar la suma o pasarse del rango, no', () => {
    const p = COACH_PROFILES.find((x) => x.id === 'estratega');
    assert.ok(p);
    const moved = { ...p.attrs, conduccion: p.attrs.conduccion + 2, gestion: p.attrs.gestion - 2 };
    assert.deepEqual(tuneAttrs(p.id, moved), moved);

    const tooFar = { ...p.attrs, formacion: p.attrs.formacion + TUNE_RANGE + 1, arenga: p.attrs.arenga - TUNE_RANGE - 1 };
    assert.equal(tuneAttrs(p.id, tooFar), null, 'se pasó del rango y se aceptó');

    const richer = { ...p.attrs, gestion: p.attrs.gestion + 1 };
    assert.equal(tuneAttrs(p.id, richer), null, `la suma dejó de ser ${PROFILE_POINTS} y se aceptó`);

    const outOfScale = { ...p.attrs, conduccion: 11, disciplina: p.attrs.disciplina - 3 };
    assert.equal(tuneAttrs(p.id, outOfScale), null);
    assert.equal(tuneAttrs(p.id, { ...p.attrs, arenga: 4.5, formacion: 5.5 }), null, 'medio punto no existe');
    assert.equal(tuneAttrs('nadie', p.attrs), null);
});

test('createCareer usa el ajuste legal y descarta el ilegal', () => {
    const p = COACH_PROFILES[0];
    const legal = { ...p.attrs, conduccion: p.attrs.conduccion - 1, formacion: p.attrs.formacion + 1 };
    assert.deepEqual(createCareer(5, CLUB, p.id, legal).coach.attrs, legal);
    const ilegal = { ...p.attrs, conduccion: 10, arenga: 10 };
    assert.deepEqual(createCareer(5, CLUB, p.id, ilegal).coach.attrs, p.attrs);
});

/* ------------------------------------------------------------------ */
/* Las ofertas                                                         */
/* ------------------------------------------------------------------ */

test('primer trabajo: tres ofertas distintas, del ascenso, una de cada tier', () => {
    const world = seedWorld();
    for (let seed = 1; seed <= 40; seed++) {
        const offers = startingOffers(seed, world);
        assert.equal(offers.length, 3, `semilla ${seed}`);
        assert.equal(new Set(offers.map((o) => o.clubId)).size, 3, `semilla ${seed}: club repetido`);
        assert.deepEqual(offers.map((o) => o.tier), ['C', 'B', 'A'], `semilla ${seed}`);
        for (const o of offers) {
            const level = getCompetition(o.competitionId)?.level ?? 0;
            assert.ok(level >= FIRST_JOB_MIN_LEVEL, `semilla ${seed}: ${o.clubId} juega en nivel ${level}`);
        }
    }
});

test('las ofertas son deterministas y no son siempre las mismas', () => {
    const world = seedWorld();
    assert.deepEqual(startingOffers(7, world), startingOffers(7, world));
    const firsts = new Set(Array.from({ length: 30 }, (_, i) => startingOffers(i + 1, world)[0].clubId));
    assert.ok(firsts.size > 5, `treinta semillas dieron solo ${firsts.size} clubes distintos`);
});

test('mirar ofertas no altera la carrera: no consumen el RNG', () => {
    const before = createCareer(99, CLUB, 'formador');
    const offers = jobOffers(before);
    startingOffers(99, before.world);
    assert.ok(offers.length > 0);
    assert.deepEqual(playOne(before), playOne(createCareer(99, CLUB, 'formador')));
});

test('después de un despido, el techo lo pone la reputación', () => {
    const base = createCareer(3, CLUB, 'estratega');
    const nobody = jobOffers({ ...base, coach: { ...base.coach, reputation: 10 } });
    assert.equal(nobody.length, 4);
    for (const o of nobody) {
        assert.ok((getCompetition(o.competitionId)?.level ?? 0) >= FIRST_JOB_MIN_LEVEL, `sin nombre te llamó ${o.competitionId}`);
        assert.notEqual(o.clubId, base.clubId, 'te ofrecieron el club que te echó');
    }
    const star = jobOffers({ ...base, coach: { ...base.coach, reputation: 85 } });
    assert.equal(getCompetition(star[0].competitionId)?.level, 2, 'con 85 de reputación nadie de arriba te llamó');
});

/* ------------------------------------------------------------------ */
/* Las mejoras del club                                                */
/* ------------------------------------------------------------------ */

test('cada nivel cuesta más que el anterior y el tope se respeta', () => {
    let s = withCaja(createCareer(1, CLUB, 'dirigente'), 1e12);
    for (const u of UPGRADES) {
        let last = 0;
        for (let lvl = 0; lvl < UPGRADE_MAX_LEVEL; lvl++) {
            const cost = upgradeCost(s, u.id);
            assert.ok(cost !== null && cost > last, `${u.id} nivel ${lvl + 1} no cuesta más que el anterior`);
            last = cost;
            s = buyUpgrade(s, u.id);
            assert.equal(upgradeLevel(s.club, u.id), lvl + 1);
        }
        assert.equal(upgradeCost(s, u.id), null);
        assert.equal(upgradeBlock(s, u.id), 'tope');
        assert.equal(buyUpgrade(s, u.id), s, 'al tope se compró igual');
    }
});

test('comprar descuenta la caja exacta, sin crédito y solo en la pretemporada', () => {
    const s = createCareer(2, CLUB, 'dirigente');
    const cost = upgradeCost(s, 'gimnasio');
    assert.ok(cost);
    const rich = withCaja(s, cost + 500);
    const bought = buyUpgrade(rich, 'gimnasio');
    assert.equal(bought.club.finances.caja, 500);
    assert.equal(bought.rngState, rich.rngState, 'comprar consumió azar');

    const poor = withCaja(s, cost - 1);
    assert.equal(upgradeBlock(poor, 'gimnasio'), 'caja');
    assert.equal(buyUpgrade(poor, 'gimnasio'), poor, 'se compró sin plata');

    const midSeason = { ...rich, phase: 'decision' as const };
    assert.equal(upgradeBlock(midSeason, 'gimnasio'), 'fase');
});

test('una decisión no borra las mejoras compradas', () => {
    // Es la regresión de un bug de verdad: `applyEffect` rearmaba el club desde
    // cero y cada tarjeta se llevaba el gimnasio.
    const s = buyUpgrade(withCaja(createCareer(4, CLUB, 'formador'), 1e10), 'kinesiologia');
    const after = applyEffect(createRng(1), s, { cohesion: 5, cajaPct: -0.1 });
    assert.deepEqual(after.club.upgrades, { kinesiologia: 1 });
    assert.deepEqual(playOne(s).club.upgrades, { kinesiologia: 1 });
});

test('al cambiar de club las mejoras se quedan en el club anterior', () => {
    const s = buyUpgrade(withCaja(createCareer(6, CLUB, 'formador'), 1e10), 'video');
    const other = jobOffers(s)[0].clubId;
    assert.deepEqual(takeNewClub(s, other).club.upgrades, {});
});

test('el micro propio abarata los viajes en la proporción que dice', () => {
    const s = createCareer(8, CLUB, 'dirigente');
    const args = { finances: s.club.finances, competitionId: s.competitionId, fechas: 18, partidosCopa: 3, bancoCorto: false, gestion: 5 };
    const sin = seasonBudget(args);
    const con = seasonBudget({ ...args, ahorroViajes: 3 * UPGRADE_EFFECT.micro });
    assert.ok(Math.abs(con.viajesCopa - sin.viajesCopa * 0.7) <= 1);
    assert.ok(Math.abs(con.viajesLiga - sin.viajesLiga * 0.7) <= 1);
    assert.equal(con.ingresos, sin.ingresos);
});

test('el gimnasio hace crecer más a los jóvenes y el entrenador del M19 sube pibes más hechos', () => {
    const s = createCareer(10, CLUB, 'formador');
    const young = s.squad.map((p) => ({ ...p, age: 20, potential: p.level + 15 }));
    const plain = ageSquad(createRng(5), young, 20, 5, 40, CLUB, 1);
    const gym = ageSquad(createRng(5), young, 20, 5, 40, CLUB, 1, { growth: 3 * UPGRADE_EFFECT.gimnasio });
    for (let i = 0; i < plain.length; i++) {
        assert.ok(gym[i].level >= plain[i].level, `${gym[i].name} creció menos con gimnasio`);
    }
    assert.ok(gym.some((p, i) => p.level > plain[i].level), 'el gimnasio no movió a nadie');

    // Todos con 36: a los 37 se retiran y suben todos del M19.
    const old: SquadPlayer[] = s.squad.map((p) => ({ ...p, age: 36 }));
    const academy = ageSquad(createRng(9), old, 20, 5, 40, CLUB, 1);
    const coached = ageSquad(createRng(9), old, 20, 5, 40, CLUB, 1, { academyBonus: 3 * UPGRADE_EFFECT.m19 });
    for (let i = 0; i < academy.length; i++) {
        assert.equal(coached[i].name, academy[i].name, 'la mejora cambió el sorteo');
        assert.ok(coached[i].level >= academy[i].level);
    }
});

test('kinesiología y video se notan en la temporada (sesenta temporadas medidas)', () => {
    let injuriesPlain = 0;
    let injuriesKine = 0;
    let pointsPlain = 0;
    let pointsVideo = 0;
    for (let seed = 1; seed <= 60; seed++) {
        const base = withCaja(createCareer(seed, CLUB, 'estratega'), 1e12);
        let kine = base;
        let video = base;
        for (let i = 0; i < UPGRADE_MAX_LEVEL; i++) {
            kine = buyUpgrade(kine, 'kinesiologia');
            video = buyUpgrade(video, 'video');
        }
        const a = playOne(base);
        const b = playOne(kine);
        const c = playOne(video);
        const hurt = (st: CoachState) => st.lastMatches.filter((m) => m.note?.includes('lesiona')).length;
        injuriesPlain += hurt(a);
        injuriesKine += hurt(b);
        pointsPlain += a.seasons[0].points;
        pointsVideo += c.seasons[0].points;
    }
    assert.ok(injuriesKine < injuriesPlain, `kinesiología: ${injuriesKine} lesiones contra ${injuriesPlain}`);
    assert.ok(pointsVideo > pointsPlain, `video: ${pointsVideo} puntos contra ${pointsPlain}`);
});

test('misma semilla, mismas decisiones, mismas compras: misma carrera', () => {
    const run = () => {
        let s = withCaja(createCareer(21, CLUB, 'motivador'), 1e10);
        s = buyUpgrade(s, 'micro');
        s = playOne(s);
        s = closeSeason(s);
        s = buyUpgrade(s, 'gimnasio');
        return playOne(s);
    };
    assert.deepEqual(run(), run());
});

/* ------------------------------------------------------------------ */
/* La subcomisión en tres ejes                                         */
/* ------------------------------------------------------------------ */

test('los pesos de la subcomisión suman 100', () => {
    assert.equal(BOARD_WEIGHTS.deportivo + BOARD_WEIGHTS.caja + BOARD_WEIGHTS.cantera, 100);
});

test('la nota sale de los tres ejes', () => {
    const squad = createCareer(1, CLUB, 'formador').squad;
    const objective = { kind: 'mitad' as const, position: 5, text: '' };
    const base = { objective, position: 3, champion: false, promoted: false, relegated: false, objectiveMet: true, resultado: 1, ingresos: 100, squad };

    const ok = boardReview(base);
    assert.equal(ok.deportivo, 100);
    assert.equal(ok.caja, 100);

    assert.equal(boardReview({ ...base, relegated: true, objectiveMet: false }).deportivo, 0);
    assert.equal(boardReview({ ...base, resultado: -25, ingresos: 100 }).caja, 0, 'perder un cuarto de lo que entra es cero');
    assert.equal(boardReview({ ...base, resultado: -10, ingresos: 100 }).caja, 60);
    assert.ok(
        boardReview({ ...base, position: 6, objectiveMet: false }).deportivo
            > boardReview({ ...base, position: 9, objectiveMet: false }).deportivo,
    );

    // Sin pibes en ningún lado, la cantera es cero; con dos titulares, cien.
    const veterans = squad.map((p) => ({ ...p, age: 28 }));
    assert.equal(boardReview({ ...base, squad: veterans }).cantera, 0);
    const kids = veterans.map((p) => (p.number === 1 || p.number === 9 ? { ...p, age: 19, level: 99 } : p));
    assert.equal(boardReview({ ...base, squad: kids }).cantera, 100);

    const r = boardReview(base);
    assert.equal(r.nota, Math.round((r.deportivo * 60 + r.caja * 25 + r.cantera * 15) / 100));
});

test('cada temporada jugada queda con su evaluación congelada', () => {
    const s = playOne(createCareer(12, CLUB, 'estratega'));
    const entry = s.seasons[0];
    assert.ok(entry.board, 'la temporada no trae la evaluación');
    for (const k of ['deportivo', 'caja', 'cantera', 'nota'] as const) {
        assert.ok(entry.board[k] >= 0 && entry.board[k] <= 100, `${k} fuera de rango: ${entry.board[k]}`);
    }
    assert.equal(entry.board.deportivo === 100, entry.objectiveMet || entry.champion || entry.movement === 'ascenso');
});

/* ------------------------------------------------------------------ */
/* El playoff, jugado por el entrenador                                */
/* ------------------------------------------------------------------ */

/** Una carrera que entra al playoff: el club más fuerte de su división. */
function intoPlayoff(): CoachState {
    for (let seed = 1; seed < 200; seed++) {
        const s = playSeason({ ...createCareer(seed, 'sb-club-newman', 'estratega'), decisionsLeft: 0 });
        if (s.phase === 'playoff') return s;
    }
    throw new Error('Newman no entró al playoff en 200 semillas');
}

test('la URBA se juega ida y vuelta: 26 partidos con 14 clubes', () => {
    const s = intoPlayoff();
    const row = s.lastTable.find((r) => r.clubId === s.clubId);
    assert.equal(row?.played, 26);
});

test('si el club entra al playoff, la temporada frena y la semifinal la juega el entrenador', () => {
    const s = intoPlayoff();
    assert.ok(s.playoff);
    assert.equal(s.playoff.stage, 'semis');
    assert.ok([s.playoff.homeId, s.playoff.awayId].includes(s.clubId));
    assert.equal(s.seasons.length, 0, 'la temporada se cerró antes del playoff');

    const after = playPlayoffMatch(s, 'plan');
    // Mientras la llave sigue, sus cruces viven en `playoff.played`; al cerrarla, en `lastKnockout`.
    const semis = [...after.lastKnockout, ...(after.playoff?.played ?? [])].filter((t) => t.stage === 'semis');
    assert.equal(semis.length, 2, 'se juegan las dos semifinales');
    if (after.phase === 'playoff') {
        assert.equal(after.playoff?.stage, 'final');
        const done = playPlayoffMatch(after, 'orden');
        assert.equal(done.phase, 'season');
        assert.ok(done.lastKnockout.some((t) => t.stage === 'final' && (t.homeId === s.clubId || t.awayId === s.clubId)));
    } else {
        assert.equal(after.phase, 'season', 'perdió la semi y la temporada no se cerró');
        assert.ok(after.lastKnockout.some((t) => t.stage === 'final'), 'la final se juega igual sin el club');
    }
});

test('las chances del playoff son por opción, y mirarlas no cambia el partido', () => {
    const s = intoPlayoff();
    const chances = playoffChances(s, mySideOf(s));
    for (const a of PLAYOFF_APPROACHES) {
        assert.ok(chances[a.id] >= 0 && chances[a.id] <= 100, `${a.id}: ${chances[a.id]}`);
    }
    assert.deepEqual(playPlayoffMatch(s, 'arenga'), playPlayoffMatch(s, 'arenga'));
    assert.equal(s.rngState, intoPlayoff().rngState, 'calcular las chances movió el RNG de la carrera');
});
