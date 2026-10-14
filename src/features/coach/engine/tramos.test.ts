// La temporada en tramos (etapa 2): determinismo, recarga en cada fase,
// estadísticas que cierran, lesionados afuera y el partido en dos tiempos.

import assert from 'node:assert/strict';
import test from 'node:test';
import { getEvent } from '../data/events/index.ts';
import { COACH_PROFILES } from '../data/profiles.ts';
import type {
    CoachState,
    HalfAdjustId,
    KeyPlanId,
    LineupPolicy,
    SquadPlayer,
    TrainingFocus,
    TrainingLoad,
    TrainingPlan,
} from '../types/coach.ts';
import { CARDS_PER_TRAMO } from './event-selector.ts';
import { matchday } from './lineup.ts';
import { HOME_ADV_PTS, NEUTRAL_MODS, rollFirstHalf, rollMatch, rollSecondHalf, type MatchSide } from './match.ts';
import { createRng, hashSeed, type Rng } from './random.ts';
import {
    acknowledgeReveal,
    beginDecisions,
    chooseOption,
    closeSeason,
    createCareer,
    nextTramo,
    closeMarketWindow,
    playKeyFirstHalf,
    playKeySecondHalf,
    playPlayoffMatch,
    simulateTramo,
    submitTraining,
} from './run-season.ts';
import { startingXV, teamRating } from './squad.ts';
import { TRAMOS, ownStarts, seasonFixture, squadTotals, totalRounds, tramoRange } from './tramos.ts';
import { DEFAULT_TRAINING, rivalWeakness, weekEffect } from './training.ts';
import { selectableClubs, seedWorld } from './world.ts';

const LOADS: TrainingLoad[] = ['alta', 'media', 'baja'];
const FOCUSES: TrainingFocus[] = ['scrum-line', 'defensa', 'ataque', 'fisico', 'recuperacion'];
const POLICIES: LineupPolicy[] = ['mejores', 'rotacion', 'cantera'];
const PLANS: KeyPlanId[] = ['cerrado', 'equilibrado', 'abierto'];
const ADJUSTS: HalfAdjustId[] = ['mantener', 'cerrar', 'arriesgar', 'rotar'];

/** Quien decide. Todas las elecciones salen de un RNG del JUGADOR, aparte del motor. */
interface Chooser {
    card(state: CoachState): string;
    training(state: CoachState): TrainingPlan;
    plan(state: CoachState): KeyPlanId;
    adjust(state: CoachState): HalfAdjustId;
}

function randomChooser(rng: Rng): Chooser {
    return {
        card: (s) => {
            const ev = getEvent(s.pendingEventId as string);
            assert.ok(ev, `tarjeta desconocida: ${s.pendingEventId}`);
            return ev.options[rng.int(0, ev.options.length - 1)].id;
        },
        training: () => ({
            days: Array.from({ length: 5 }, () => ({ load: rng.pick(LOADS), focus: rng.pick(FOCUSES) })),
            lineup: rng.pick(POLICIES),
        }),
        plan: () => rng.pick(PLANS),
        adjust: () => rng.pick(ADJUSTS),
    };
}

/**
 * Un jugador sin memoria: cada elección sale SOLO del estado (un hash de la
 * temporada, el tramo y la tarjeta). Así, cortar y retomar en cualquier punto
 * elige lo mismo que sin cortar.
 */
const stateChooser: Chooser = {
    card: (s) => {
        const ev = getEvent(s.pendingEventId as string);
        assert.ok(ev);
        return ev.options[hashSeed(`${s.season}:${s.pendingEventId}`) % ev.options.length].id;
    },
    training: (s) => {
        const h = hashSeed(`semana:${s.season}:${s.inSeason?.tramo}`);
        return {
            days: Array.from({ length: 5 }, (_, i) => ({ load: LOADS[(h >>> i) % 3], focus: FOCUSES[(h >>> (i + 3)) % 5] })),
            lineup: POLICIES[h % 3],
        };
    },
    plan: (s) => PLANS[hashSeed(`plan:${s.season}:${s.inSeason?.tramo}`) % 3],
    adjust: (s) => ADJUSTS[hashSeed(`ajuste:${s.season}:${s.inSeason?.tramo}`) % 4],
};

/** Un paso del bucle, decidido por `who`. */
function step(s: CoachState, who: Chooser): CoachState {
    switch (s.phase) {
        case 'decision':
            return chooseOption(s, who.card(s));
        case 'reveal':
            return acknowledgeReveal(s);
        case 'training':
            return submitTraining(s, who.training(s));
        case 'keymatch':
            return s.inSeason?.key?.firstHalf ? playKeySecondHalf(s, who.adjust(s)) : playKeyFirstHalf(s, who.plan(s));
        case 'tramo':
            return nextTramo(s);
        case 'market':
            return closeMarketWindow(s);
        case 'playoff':
            return playPlayoffMatch(s, 'plan');
        default:
            return s;
    }
}

/** Una temporada entera, paso a paso, desde la pretemporada hasta el cierre. */
function playYear(state: CoachState, who: Chooser, onStep?: (s: CoachState) => void): CoachState {
    let s = beginDecisions(state);
    for (let guard = 0; guard < 80 && s.phase !== 'season'; guard++) {
        onStep?.(s);
        const next = step(s, who);
        assert.notEqual(next, s, `el paso no avanzó en la fase ${s.phase}`);
        s = next;
    }
    assert.equal(s.phase, 'season', 'la temporada no llegó al cierre');
    return s;
}

function career(seed: number, clubId: string, seasons: number, who: Chooser, onSeason?: (s: CoachState) => void, onStep?: (s: CoachState) => void): CoachState {
    let s = createCareer(seed, clubId, 'estratega');
    for (let y = 0; y < seasons; y++) {
        s = playYear(s, who, onStep);
        onSeason?.(s);
        s = closeSeason(s);
        if (s.phase === 'fired') break;
    }
    return s;
}

/* ------------------------------------------------------------------ */
/* Reparto y tarjetas                                                  */
/* ------------------------------------------------------------------ */

test('los tramos cubren todas las fechas, seguidos y lo más parejos posible', () => {
    for (let total = 3; total <= 30; total++) {
        const sizes: number[] = [];
        let next = 1;
        for (let t = 0; t < TRAMOS; t++) {
            const { from, to } = tramoRange(total, t);
            assert.equal(from, next, `${total} fechas: el tramo ${t + 1} no arranca donde terminó el anterior`);
            sizes.push(to - from + 1);
            next = to + 1;
        }
        assert.equal(next - 1, total, `${total} fechas: los tramos no cubren todo`);
        assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1, `${total} fechas: ${sizes.join(' · ')}`);
    }
    assert.deepEqual([0, 1, 2].map((t) => tramoRange(26, t)), [{ from: 1, to: 9 }, { from: 10, to: 18 }, { from: 19, to: 26 }]);
});

test('las tarjetas salen por tramo (2 · 2 · 1), no las cinco juntas', () => {
    let s = beginDecisions(createCareer(31, 'sb-los-tarcos', 'estratega'));
    const perTramo = [0, 0, 0];
    for (let guard = 0; guard < 80 && s.phase !== 'season'; guard++) {
        if (s.phase === 'decision') perTramo[s.inSeason?.tramo ?? 0]++;
        s = step(s, stateChooser);
    }
    assert.deepEqual(perTramo, [...CARDS_PER_TRAMO]);
});

/* ------------------------------------------------------------------ */
/* Determinismo y recarga                                              */
/* ------------------------------------------------------------------ */

test('misma semilla y mismas decisiones (tarjetas, semana, plan y entretiempo): misma carrera', () => {
    const a = career(777, 'sb-los-tarcos', 4, randomChooser(createRng(9)));
    const b = career(777, 'sb-los-tarcos', 4, randomChooser(createRng(9)));
    assert.equal(JSON.stringify(a), JSON.stringify(b), 'dos carreras idénticas divergieron');
    const c = career(777, 'sb-los-tarcos', 4, randomChooser(createRng(10)));
    assert.notEqual(JSON.stringify(a), JSON.stringify(c), 'otras decisiones dieron la misma carrera');
});

test('otra semana de entrenamiento, otra temporada: la semana importa', () => {
    const base = beginDecisions(createCareer(4040, 'sb-los-tarcos', 'estratega'));
    let s = base;
    while (s.phase === 'decision' || s.phase === 'reveal') s = step(s, stateChooser);
    assert.equal(s.phase, 'training');
    const soft: TrainingPlan = { days: Array.from({ length: 5 }, () => ({ load: 'baja', focus: 'recuperacion' })), lineup: 'mejores' };
    const hard: TrainingPlan = { days: Array.from({ length: 5 }, () => ({ load: 'alta', focus: 'ataque' })), lineup: 'mejores' };
    const a = submitTraining(s, soft);
    const b = submitTraining(s, hard);
    assert.notDeepEqual(a.squad.map((p) => p.fatigue), b.squad.map((p) => p.fatigue), 'la carga no movió el cansancio');
    assert.ok(
        b.squad.reduce((t, p) => t + p.fatigue, 0) > a.squad.reduce((t, p) => t + p.fatigue, 0),
        'cinco días de carga alta cansan menos que cinco de recuperación',
    );
});

test('recargar en CADA fase de una temporada (JSON ida y vuelta) termina exactamente igual que sin cortar', () => {
    const start = createCareer(2468, 'sb-marabunta-r-c', 'estratega');
    // La temporada sin cortar, guardando el estado de cada paso.
    const steps: CoachState[] = [];
    const whole = playYear(start, stateChooser, (s) => steps.push(s));
    const phases = new Set(steps.map((s) => s.phase));
    for (const p of ['decision', 'reveal', 'training', 'keymatch', 'tramo']) assert.ok(phases.has(p), `la temporada no pasó por ${p}`);
    assert.ok(steps.some((s) => s.phase === 'keymatch' && s.inSeason?.key?.firstHalf), 'no hubo un entretiempo para cortar');

    for (const [i, cut] of steps.entries()) {
        let s = JSON.parse(JSON.stringify(cut)) as CoachState;
        for (let guard = 0; guard < 80 && s.phase !== 'season'; guard++) s = step(s, stateChooser);
        assert.equal(JSON.stringify(s), JSON.stringify(whole), `cortar en el paso ${i} (${cut.phase}) cambió el final`);
    }
});

/* ------------------------------------------------------------------ */
/* Estadísticas que cierran                                            */
/* ------------------------------------------------------------------ */

test('los tries y los puntos del club son la suma de los de sus jugadores, en cada tramo de doce temporadas', () => {
    const clubs = selectableClubs(seedWorld());
    let checked = 0;
    for (let c = 0; c < 6; c++) {
        const who = randomChooser(createRng(500 + c));
        const check = (s: CoachState) => {
            if (!s.inSeason || s.inSeason.round === 0 || s.inSeason.tramo >= TRAMOS) return;
            const row = s.inSeason.table.find((r) => r.clubId === s.clubId);
            assert.ok(row);
            const sum = squadTotals(s);
            assert.equal(sum.tries, row.tries, `temporada ${s.season}, fecha ${s.inSeason.round}: tries ${row.tries} en la tabla, ${sum.tries} de los jugadores`);
            assert.equal(sum.points, row.pf, `temporada ${s.season}, fecha ${s.inSeason.round}: ${row.pf} puntos en la tabla, ${sum.points} de los jugadores`);
            checked++;
        };
        career(60_000 + c, clubs[(c * 37) % clubs.length], 12, who, (s) => {
            const row = s.lastTable.find((r) => r.clubId === s.clubId);
            assert.ok(row);
            const sum = squadTotals(s);
            assert.equal(sum.tries, row.tries, `temporada ${s.season}: tries de la tabla ≠ suma de los jugadores`);
            assert.equal(sum.points, row.pf, `temporada ${s.season}: puntos de la tabla ≠ suma de los jugadores`);
            const apps = s.squad.reduce((t, p) => t + p.stats.starts, 0) + (s.inSeason?.gone ?? []).reduce((t, g) => t + g.stats.starts, 0);
            assert.ok(apps <= 15 * row.played, 'más titularidades que camisetas');
            checked++;
        }, check);
    }
    assert.ok(checked > 200, `se miraron solo ${checked} cortes`);
});

test('las estadísticas de la temporada pasan a la carrera al cerrar el año', () => {
    let s = playYear(createCareer(91, 'sb-los-tarcos', 'estratega'), stateChooser);
    const before = new Map(s.squad.map((p) => [p.id, p]));
    s = closeSeason(s);
    for (const p of s.squad) {
        const old = before.get(p.id);
        assert.equal(p.stats.apps, 0, 'la temporada nueva arrancó con partidos');
        assert.equal(p.fatigue, 0);
        assert.equal(p.injury, 0);
        if (old) assert.equal(p.career.tries, old.career.tries + old.stats.tries, `${p.name}: los tries no pasaron a la carrera`);
    }
});

/* ------------------------------------------------------------------ */
/* Lesionados                                                          */
/* ------------------------------------------------------------------ */

test('un lesionado no entra nunca a los 23 del día, ni de pateador', () => {
    const base = createCareer(5, 'sb-los-tarcos', 'estratega').squad;
    const rng = createRng(3);
    for (let i = 0; i < 400; i++) {
        const squad: SquadPlayer[] = base.map((p) => ({
            ...p,
            injury: rng.chance(0.25) ? rng.int(1, 4) : 0,
            fatigue: rng.int(0, 100),
        }));
        const md = matchday(squad, rng.pick(POLICIES), 'ar-urba-top14');
        const hurt = new Set(squad.filter((p) => p.injury > 0).map((p) => p.id));
        for (const s of md.xv) if (s.player) assert.ok(!hurt.has(s.player.id), `${s.player.name} juega lesionado`);
        for (const p of md.bench) assert.ok(!hurt.has(p.id), `${p.name} va al banco lesionado`);
        assert.ok(!md.kickerId || !hurt.has(md.kickerId), 'patea un lesionado');
        assert.equal(md.xv.length, 15);
        const numbers = md.squad.filter((p) => p.number <= 15).map((p) => p.number).sort((a, b) => a - b);
        assert.ok(numbers.every((n, k) => k === 0 || n !== numbers[k - 1]), 'dos con el mismo dorsal en el XV');
    }
});

test('en la temporada, nadie con fechas de lesión suma un partido', () => {
    for (let seed = 1; seed <= 20; seed++) {
        let s = beginDecisions(createCareer(seed, 'sb-marabunta-r-c', 'estratega'));
        while (s.phase === 'decision' || s.phase === 'reveal') s = step(s, stateChooser);
        assert.equal(s.phase, 'training');
        // Tres titulares afuera por todo el tramo.
        const out = startingXV(s.squad).slice(0, 3).map((p) => p.id);
        s = { ...s, squad: s.squad.map((p) => (out.includes(p.id) ? { ...p, injury: 99 } : p)) };
        const after = simulateTramo(s);
        assert.equal(after.phase, 'tramo');
        for (const id of out) {
            const p = after.squad.find((x) => x.id === id);
            assert.ok(p);
            assert.equal(p.stats.apps, 0, `${p.name} jugó con ${p.injury} fechas de lesión`);
        }
    }
});

test('con todo el plantel sano y descansado, la fecha es el XV de siempre y su fuerza es la de siempre', () => {
    const clubs = selectableClubs(seedWorld());
    for (let i = 0; i < 30; i++) {
        const squad = createCareer(100 + i, clubs[(i * 11) % clubs.length], 'estratega').squad;
        const md = matchday(squad, 'mejores', 'ar-urba-top14');
        assert.equal(md.rating, teamRating(squad));
        assert.deepEqual(
            md.xv.map((s) => s.player?.id).sort(),
            startingXV(squad).map((p) => p.id).sort(),
        );
    }
});

/* ------------------------------------------------------------------ */
/* El partido en dos tiempos                                           */
/* ------------------------------------------------------------------ */

const N = 20000;

function sample(mode: 'whole' | 'halves', seed: number, home: number, away: number, neutral: boolean) {
    const rng = createRng(seed);
    const side = (id: string, rating: number): MatchSide => ({ clubId: id, rating, mods: NEUTRAL_MODS });
    let homeWins = 0;
    let draws = 0;
    let total = 0;
    let margin = 0;
    for (let i = 0; i < N; i++) {
        const h = side('A', home);
        const a = side('B', away);
        const m = mode === 'whole'
            ? rollMatch(rng, h, a, { neutral })
            : rollSecondHalf(rng, h, a, rollFirstHalf(rng, h, a, { neutral }), { neutral });
        if (m.homePf > m.awayPf) homeWins++;
        if (m.homePf === m.awayPf) draws++;
        total += m.homePf + m.awayPf;
        margin += m.homePf - m.awayPf;
    }
    return { homeWinRate: homeWins / N, drawRate: draws / N, avgTotal: total / N, avgMargin: margin / N };
}

test('las dos mitades con plan neutro reproducen el partido entero (bandas de match-calibration.test.ts)', () => {
    const halves = sample('halves', 1, 25, 25, false);
    const whole = sample('whole', 1, 25, 25, false);
    // Las mismas bandas que el dado entero.
    assert.ok(halves.homeWinRate > 0.58 && halves.homeWinRate < 0.67, `local ${(halves.homeWinRate * 100).toFixed(1)}%`);
    assert.ok(halves.drawRate > 0.015 && halves.drawRate < 0.05, `empate ${(halves.drawRate * 100).toFixed(1)}%`);
    assert.ok(Math.abs(halves.avgMargin - HOME_ADV_PTS) < 1.2, `margen ${halves.avgMargin.toFixed(2)}`);
    assert.ok(halves.avgTotal > 44 && halves.avgTotal < 58, `total ${halves.avgTotal.toFixed(1)}`);
    // Y pegadas al partido entero.
    assert.ok(Math.abs(halves.homeWinRate - whole.homeWinRate) < 0.015, `local: ${halves.homeWinRate} contra ${whole.homeWinRate}`);
    assert.ok(Math.abs(halves.avgTotal - whole.avgTotal) < 1.5, `total: ${halves.avgTotal} contra ${whole.avgTotal}`);

    const strong = sample('halves', 6, 30, 20, true);
    assert.ok(strong.avgMargin > 17 && strong.avgMargin < 23, `10 de rating dieron ${strong.avgMargin.toFixed(1)} de margen`);
});

/* ------------------------------------------------------------------ */
/* La semana, el partido clave y el formativo                          */
/* ------------------------------------------------------------------ */

test('la debilidad del rival es un dato: sin azar, y solo el foco que la ataca suma en el partido clave', () => {
    assert.equal(rivalWeakness('sb-los-tarcos'), rivalWeakness('sb-los-tarcos'));
    for (const weakness of ['scrum-line', 'defensa', 'ataque'] as const) {
        const hit = weekEffect({ days: Array.from({ length: 5 }, () => ({ load: 'media', focus: weakness })), lineup: 'mejores' }, weakness);
        const miss = weekEffect({ days: Array.from({ length: 5 }, () => ({ load: 'media', focus: weakness })), lineup: 'mejores' }, weakness === 'ataque' ? 'defensa' : 'ataque');
        assert.ok(hit.keyBonus > 0 && miss.keyBonus === 0, `${weakness}: ${hit.keyBonus} contra ${miss.keyBonus}`);
        assert.equal(hit.bonus, miss.bonus, 'el bono de todo el tramo no depende del rival');
    }
    const rest = weekEffect({ days: Array.from({ length: 5 }, () => ({ load: 'baja', focus: 'recuperacion' })), lineup: 'rotacion' }, 'ataque');
    assert.ok(rest.fatigue < 0 && rest.bonus === 0, 'la recuperación no descansa o rinde');
});

test('"Simular el tramo" es la semana fija y el partido clave sin tocar nada', () => {
    let s = beginDecisions(createCareer(64, 'sb-los-tarcos', 'estratega'));
    while (s.phase === 'decision' || s.phase === 'reveal') s = step(s, stateChooser);
    const simulated = simulateTramo(s);
    let manual = submitTraining(s, DEFAULT_TRAINING);
    if (manual.phase === 'keymatch') manual = playKeySecondHalf(playKeyFirstHalf(manual, 'equilibrado'), 'mantener');
    assert.deepEqual(simulated, manual);
    // Con un plan fijo, simula con ése.
    const fixed: TrainingPlan = { days: Array.from({ length: 5 }, () => ({ load: 'alta', focus: 'defensa' })), lineup: 'cantera' };
    const withFixed = submitTraining(s, fixed, true);
    assert.deepEqual(withFixed.trainingDefault, fixed, 'el plan no quedó fijo');
    assert.equal(simulateTramo({ ...s, trainingDefault: fixed }).inSeason?.week?.plan.lineup, 'cantera');
});

test('el partido clave frena con el marcador del primer tiempo a la vista, y el entretiempo cambia el final', () => {
    let found = 0;
    let changed = 0;
    for (let seed = 1; seed <= 40 && found < 12; seed++) {
        let s = beginDecisions(createCareer(seed, 'sb-marabunta-r-c', 'estratega'));
        while (s.phase === 'decision' || s.phase === 'reveal') s = step(s, stateChooser);
        s = submitTraining(s, DEFAULT_TRAINING);
        if (s.phase !== 'keymatch') continue;
        found++;
        const key = s.inSeason?.key;
        assert.ok(key && !key.firstHalf);
        const roundBefore = s.inSeason?.round ?? 0;
        assert.equal(roundBefore, key.round - 1, 'las fechas anteriores al partido clave no se jugaron');
        const half = playKeyFirstHalf(s, 'cerrado');
        assert.equal(half.phase, 'keymatch');
        assert.ok(half.inSeason?.key?.firstHalf, 'no quedó el primer tiempo');
        assert.equal(half.inSeason?.round, roundBefore, 'el primer tiempo jugó fechas');
        const after = ADJUSTS.map((a) => playKeySecondHalf(half, a));
        for (const a of after) assert.equal(a.phase, 'tramo', 'el segundo tiempo no cerró el tramo');
        const finals = after.map((a) =>
            JSON.stringify(a.inSeason?.matches.find((m) => m.round === key.round && (m.homeId === s.clubId || m.awayId === s.clubId))),
        );
        if (new Set(finals).size > 1) changed++;
        // Rotar descansa a los titulares: el plantel termina el tramo menos cansado.
        const tired = (st: CoachState) => st.squad.reduce((t, p) => t + p.fatigue, 0);
        assert.ok(tired(after[3]) < tired(after[0]), 'rotar no le bajó el cansancio a nadie');
    }
    assert.ok(found >= 5, `solo ${found} semillas llegaron a un partido clave`);
    assert.ok(changed >= found / 2, `el entretiempo cambió el partido en ${changed} de ${found}`);
});

test('el formativo tiene palanca: con "pista a los pibes" fijo se cumple más que con los mejores', () => {
    const clubs = selectableClubs(seedWorld());
    const rate = (lineup: LineupPolicy) => {
        let met = 0;
        let total = 0;
        for (let c = 0; c < 40; c++) {
            const fixed: TrainingPlan = { ...DEFAULT_TRAINING, lineup };
            let s: CoachState = { ...createCareer(70_000 + c, clubs[(c * 13) % clubs.length], COACH_PROFILES[c % COACH_PROFILES.length].id), trainingDefault: fixed };
            for (let y = 0; y < 3; y++) {
                s = beginDecisions(s);
                for (let guard = 0; guard < 80 && s.phase !== 'season'; guard++) {
                    s = s.phase === 'training' || s.phase === 'keymatch' ? simulateTramo(s) : step(s, stateChooser);
                }
                // Desde la etapa 4 el formativo puede pedir subir del M19
                // (`formativeKind`): la palanca del XV es la de las titularidades,
                // así que se mide sobre esas.
                const f = s.seasons[s.seasons.length - 1].objectives?.find(
                    (o) => o.axis === 'formativo' && o.text.startsWith('Darle pista'),
                );
                if (f) {
                    total++;
                    if (f.met) met++;
                }
                assert.ok(ownStarts(s) >= 0);
                s = closeSeason(s);
                if (s.phase === 'fired') break;
            }
        }
        return met / total;
    };
    const best = rate('mejores');
    const kids = rate('cantera');
    assert.ok(kids > best + 0.2, `con los pibes ${Math.round(kids * 100)} %, con los mejores ${Math.round(best * 100)} %`);
    assert.ok(kids >= 0.85, `con los pibes fijos el formativo se cumple solo el ${Math.round(kids * 100)} %`);
});

test('el fixture del año se reparte entero en los tramos y el club juega todas sus fechas', () => {
    const s = playYear(createCareer(8, 'sb-los-tarcos', 'estratega'), stateChooser);
    const rounds = totalRounds(s.lastMatches.map((m) => ({ round: m.round, homeId: m.homeId, awayId: m.awayId })));
    assert.equal(s.inSeason?.round, rounds);
    assert.equal(rounds, totalRounds(seasonFixture(s)), 'quedaron fechas del fixture sin jugar');
    const row = s.lastTable.find((r) => r.clubId === s.clubId);
    assert.equal(row?.played, s.seasons[0].won + s.seasons[0].drawn + s.seasons[0].lost);
});
