// El M19 y la jornada de captación (etapa 4): determinismo, el techo oculto,
// el rango que lo contiene, la joya, el tope del plantel y formar contra comprar.

import assert from 'node:assert/strict';
import test from 'node:test';
import { getEvent } from '../data/events/index.ts';
import { COACH_PROFILES } from '../data/profiles.ts';
import type { AcademyPlayer, CoachState } from '../types/coach.ts';
import {
    ACADEMY_MAX,
    ACADEMY_MIN,
    MIN_WIDTH,
    closeAcademy,
    currentScouting,
    estimateOf,
    estimateWords,
    growKid,
    loanKid,
    observeBlock,
    observeCandidate,
    promoteBlock,
    promoteKid,
    releaseKid,
    scoutingDay,
    signScout,
    toggleReserve,
} from './academy.ts';
import { autoResolveAcademy, type AcademyPolicy } from './market-policy.ts';
import { measureObjective, seasonObjectives } from './objectives.ts';
import { createRng } from './random.ts';
import {
    acknowledgeReveal,
    beginDecisions,
    chooseOption,
    closeMarketWindow,
    closeSeason,
    createCareer,
    nextTramo,
    playPlayoffMatch,
    simulateTramo,
} from './run-season.ts';
import { teamRating } from './squad.ts';
import {
    SQUAD_MAX,
    SQUAD_MIN,
    denyRequest,
    expiringPlayers,
    letExpire,
    rejectPlayerOffer,
    releaseBlock,
    releasePlayer,
    renewAtAsk,
    rosterSize,
    signBlock,
    signCandidate,
} from './transfers.ts';
import { selectableClubs, seedWorld } from './world.ts';

const CLUBS = selectableClubs(seedWorld());

/** Juega la temporada desde la pretemporada con tarjetas al azar (RNG del jugador, no el del motor). */
function playYear(state: CoachState, player: ReturnType<typeof createRng>, window: (s: CoachState) => CoachState = (s) => s): CoachState {
    let s = beginDecisions(state);
    for (let guard = 0; guard < 80 && s.phase !== 'season'; guard++) {
        if (s.phase === 'decision') {
            const ev = getEvent(s.pendingEventId as string);
            assert.ok(ev);
            s = chooseOption(s, ev.options[player.int(0, ev.options.length - 1)].id);
        } else if (s.phase === 'reveal') s = acknowledgeReveal(s);
        else if (s.phase === 'playoff') s = playPlayoffMatch(s, 'plan');
        else if (s.phase === 'training' || s.phase === 'keymatch') s = simulateTramo(s);
        else if (s.phase === 'tramo') s = nextTramo(s);
        else if (s.phase === 'market') s = closeMarketWindow(window(s));
    }
    assert.equal(s.phase, 'season');
    return s;
}

/* ------------------------------------------------------------------ */
/* Determinismo                                                        */
/* ------------------------------------------------------------------ */

test('la captación y el desarrollo son deterministas y mirar no corre la carrera', () => {
    const a = createCareer(101, CLUBS[17], 'formador');
    const b = createCareer(101, CLUBS[17], 'formador');
    assert.deepEqual(a.academy, b.academy, 'la misma semilla dio otro M19');
    assert.deepEqual(scoutingDay(a), scoutingDay(a), 'leer dos veces la jornada dio distinto');

    // Observar, sumar, reservar y ceder no tocan el RNG de la carrera.
    const day = currentScouting(a);
    assert.ok(day);
    let s = observeCandidate(a, day.candidates[0].id);
    s = signScout(s, day.candidates[0].id);
    assert.equal(s.rngState, a.rngState);

    // Dos carreras enteras con las mismas decisiones son idénticas.
    const run = () => {
        let st = createCareer(202, CLUBS[40], 'formador');
        const kids = createRng(9);
        const player = createRng(10);
        for (let y = 0; y < 4; y++) {
            st = autoResolveAcademy(st, 'azar', kids);
            st = closeSeason(playYear(st, player));
            if (st.phase !== 'preseason') break;
        }
        return st;
    };
    assert.equal(JSON.stringify(run()), JSON.stringify(run()), 'la misma carrera dio otro resultado');

    // El crecimiento de un año es puro.
    const k = a.academy.players[0];
    assert.deepEqual(growKid(k, 1, 0.8), growKid(k, 1, 0.8));
    const closed1 = closeAcademy({ ...a, season: 2 }, 1);
    const closed2 = closeAcademy({ ...a, season: 2 }, 1);
    assert.deepEqual(closed1.academy, closed2.academy);
});

/* ------------------------------------------------------------------ */
/* El techo oculto y el rango                                          */
/* ------------------------------------------------------------------ */

test('el techo real nunca aparece en un texto del motor', () => {
    // Un pibe con un techo inconfundible: 77,7. Nada de lo que el motor escriba
    // sobre él puede decir 77 ni 78.
    const base = createCareer(303, CLUBS[5], 'formador');
    const marked = (k: AcademyPlayer, i: number): AcademyPlayer =>
        i < 4 ? { ...k, age: 18 + (i % 2), level: 41.2, ceiling: 77.7, estMin: 70.1, estMax: 80.3 } : k;
    let s: CoachState = { ...base, academy: { ...base.academy, players: base.academy.players.map(marked) } };
    const ids = s.academy.players.slice(0, 4).map((k) => k.id);
    s = releasePlayer(s, s.squad[s.squad.length - 1].id);
    s = promoteKid(s, ids[0]);
    s = loanKid(s, ids[1]);
    s = toggleReserve(s, ids[2]);
    s = releaseKid(s, ids[3]);
    const texts: string[] = [];
    // La captación: las pistas no llevan números.
    for (const c of currentScouting(s)?.candidates ?? []) {
        assert.ok(!/\d/.test(c.hint), `una pista lleva un número: "${c.hint}"`);
        texts.push(c.hint);
    }
    // El cierre: el reservado sube, el cedido vuelve, el de 20 sube o se va.
    const closed = closeAcademy({ ...s, season: s.season + 1 }, s.season);
    texts.push(...s.academy.log.map((e) => e.text), ...closed.academy.log.map((e) => e.text));
    // Los objetivos y su medición.
    for (const o of seasonObjectives(s)) {
        texts.push(o.text);
        texts.push(measureObjective(o, { clubId: s.clubId, deportivoMet: true, table: [], matches: [], squad: s.squad, resultado: 0, netDebt: 0, promoted: false, position: 1, teams: 10, estructura: 30, upgradeLevels: 0, season: s.season, promotions: 3 }).detail);
    }
    for (const t of texts) assert.ok(!/\b7[78]\b/.test(t), `un texto deja ver el techo: "${t}"`);
    // El rango, en palabras: nunca el techo.
    assert.equal(estimateWords({ estMin: 70.1, estMax: 80.3 }), 'Techo estimado entre 70 y 81');
});

test('el rango estimado contiene siempre al techo real y se angosta al observar y con los años', () => {
    let checked = 0;
    for (let c = 0; c < 40; c++) {
        let s = createCareer(400 + c, CLUBS[(c * 11) % CLUBS.length], COACH_PROFILES[c % COACH_PROFILES.length].id);
        const kids = createRng(500 + c);
        const player = createRng(600 + c);
        for (let y = 0; y < 5 && s.phase === 'preseason'; y++) {
            const day = currentScouting(s);
            assert.ok(day, 'la pretemporada no tiene jornada');
            for (const cand of day.candidates) {
                const before = currentScouting(s)?.candidates.find((x) => x.id === cand.id);
                assert.ok(before);
                if (observeBlock(s, cand.id)) continue;
                s = observeCandidate(s, cand.id);
                const after = currentScouting(s)?.candidates.find((x) => x.id === cand.id);
                assert.ok(after);
                const w0 = before.estMax - before.estMin;
                const w1 = after.estMax - after.estMin;
                assert.ok(w1 < w0 || w0 <= MIN_WIDTH, `observar no angostó el rango (${w0} → ${w1})`);
                assert.ok(after.estMin <= after.ceiling && after.ceiling <= after.estMax, 'observar dejó el techo afuera');
            }
            for (const cand of currentScouting(s)?.candidates ?? []) {
                assert.ok(cand.estMin <= cand.ceiling && cand.ceiling <= cand.estMax);
                checked++;
            }
            const widthBefore = new Map(s.academy.players.map((k) => [k.id, k.estMax - k.estMin]));
            s = autoResolveAcademy(s, 'azar', kids);
            s = closeSeason(playYear(s, player));
            for (const k of s.academy.players) {
                const { min, max } = estimateOf(k);
                assert.ok(k.estMin <= k.ceiling && k.ceiling <= k.estMax, `${k.name}: ${k.estMin}..${k.estMax}, techo ${k.ceiling}`);
                assert.ok(min <= k.ceiling && k.ceiling <= max, 'el rango que se muestra deja el techo afuera');
                assert.ok(k.level <= k.ceiling + 1e-9, `${k.name} pasó su techo`);
                const w0 = widthBefore.get(k.id);
                if (w0 !== undefined) assert.ok(k.estMax - k.estMin <= w0 + 0.2, `${k.name}: el rango se ensanchó con el año`);
                checked++;
            }
        }
    }
    assert.ok(checked > 1000, `solo se miraron ${checked} rangos`);
});

test('la joya aparece alrededor del 3 % de las jornadas', () => {
    // 400 carreras × 12 jornadas. El techo de la joya está al menos diez puntos
    // arriba del nivel base de primera; el de un candidato común, casi nunca.
    let days = 0;
    let gems = 0;
    let gemAboveBase = 0;
    for (let c = 0; c < 400; c++) {
        const s = createCareer(80_000 + c, CLUBS[c % CLUBS.length], 'estratega');
        for (let season = 1; season <= 12; season++) {
            const day = scoutingDay({ ...s, season });
            days++;
            const gem = day.candidates.filter((x) => x.gem);
            assert.ok(gem.length <= 1, 'dos joyas en una jornada');
            if (gem.length === 1) {
                gems++;
                const base = 20.6 + (s.world.ratings[s.clubId] ?? 20) * 0.92;
                if (gem[0].ceiling >= base + 10) gemAboveBase++;
            }
        }
    }
    const rate = gems / days;
    assert.ok(rate >= 0.02 && rate <= 0.045, `joyas en el ${(rate * 100).toFixed(2)} % de las jornadas (${gems} de ${days})`);
    assert.equal(gemAboveBase, gems, 'una joya sin techo de joya');
});

test('una joya no tiene garantía: con años malos se estanca lejos de su techo', () => {
    const k: AcademyPlayer = {
        id: 'x', name: 'Joya', group: 'centros', age: 16, level: 30, ceiling: 70, estMin: 60, estMax: 80,
        personality: 'conflictivo', plan: 'minutos', joined: 1, loanClubId: null, reserve: false, gem: true,
    };
    let bad = k;
    let good = k;
    for (let y = 0; y < 4; y++) {
        bad = growKid(bad, 0.7, 0.35);
        good = growKid({ ...good, personality: 'profesional', plan: 'equilibrado', loanClubId: 'otro' }, 1.3, 1.35);
    }
    assert.ok(bad.level < 45, `la joya estancada llegó a ${bad.level}`);
    assert.ok(good.level > bad.level + 15, `con años buenos ${good.level}, con malos ${bad.level}`);
});

/* ------------------------------------------------------------------ */
/* El plantel y el M19                                                 */
/* ------------------------------------------------------------------ */

test('promover respeta el tope de 26: con el plantel lleno no sube nadie, liberando a uno sí', () => {
    const s = createCareer(707, CLUBS[30], 'formador');
    assert.equal(rosterSize(s), SQUAD_MAX);
    const kid = s.academy.players.find((k) => k.age >= 18);
    assert.ok(kid);
    assert.ok(promoteBlock(s, kid.id)?.includes('completo'), 'con 26 dejó subir a un pibe');
    assert.equal(promoteKid(s, kid.id), s, 'con 26 el estado cambió igual');
    const young = s.academy.players.find((k) => k.age < 17);
    if (young) {
        const freed = releasePlayer(s, s.squad[0].id);
        assert.ok(promoteBlock(freed, young.id)?.includes('años'), 'un chico de 16 pudo subir');
    }
    const freed = releasePlayer(s, s.squad[0].id);
    const up = promoteKid(freed, kid.id);
    assert.equal(rosterSize(up), SQUAD_MAX);
    const p = up.squad.find((x) => x.name === kid.name);
    assert.ok(p && p.homegrown, 'el que sube no entra como formado en el club');
    assert.ok(!up.academy.players.some((k) => k.id === kid.id), 'sigue en el M19 después de subir');
    assert.equal(up.academy.log.at(-1)?.kind, 'promocion');
});

test('al cierre el plantel queda entre 23 y 26 y el M19 entre 8 y 12, con cualquier política', () => {
    for (const mode of ['azar', 'forma', 'compra'] as AcademyPolicy[]) {
        for (let c = 0; c < 25; c++) {
            let s = createCareer(900 + c, CLUBS[(c * 7) % CLUBS.length], COACH_PROFILES[c % COACH_PROFILES.length].id);
            const kids = createRng(1900 + c);
            const player = createRng(2900 + c);
            for (let y = 0; y < 8 && s.phase === 'preseason'; y++) {
                s = autoResolveAcademy(s, mode, mode === 'azar' ? kids : null);
                assert.ok(s.squad.length >= SQUAD_MIN && rosterSize(s) <= SQUAD_MAX, `${mode}: plantel de ${s.squad.length}`);
                s = closeSeason(playYear(s, player));
                if (s.phase !== 'preseason') break;
                assert.ok(s.squad.length >= SQUAD_MIN && rosterSize(s) <= SQUAD_MAX, `${mode}: plantel de ${s.squad.length} al cierre`);
                const n = s.academy.players.length;
                assert.ok(n >= ACADEMY_MIN && n <= ACADEMY_MAX, `${mode}: M19 de ${n}`);
                assert.ok(s.academy.players.every((k) => k.age <= 19), 'quedó un pibe de 20 en el M19');
            }
        }
    }
});

test('la regla de los 20: al cierre el que cumple 20 sube si hay lugar y, si no, se va', () => {
    const s0 = createCareer(1234, CLUBS[50], 'estratega');
    const nineteen = s0.academy.players.filter((k) => k.age === 19).map((k) => k.id);
    assert.ok(nineteen.length > 0);
    // Plantel lleno: se van.
    const full = closeAcademy({ ...s0, season: 2 }, 1);
    for (const id of nineteen) {
        assert.ok(!full.academy.players.some((k) => k.id === id));
        assert.ok(full.academy.log.some((e) => e.playerId === id && e.kind === 'se-va'), 'se fue sin aviso');
    }
    // Con lugar: suben.
    const room = { ...s0, season: 2, squad: s0.squad.slice(0, SQUAD_MIN) };
    const up = closeAcademy(room, 1);
    for (const id of nineteen) assert.ok(up.squad.some((p) => p.id.startsWith(id)), 'con lugar no subió');
});

/* ------------------------------------------------------------------ */
/* Formar contra comprar                                               */
/* ------------------------------------------------------------------ */

type Club = 'forma' | 'compra';

/**
 * La ventana de los dos clubes: los dos rechazan las ofertas, renuevan lo que
 * vence y no dejan ir a nadie. El que compra, además, firma a todo candidato
 * que mejore a su puesto (liberando al peor si el plantel está lleno). El que
 * forma no incorpora.
 */
function clubWindow(s0: CoachState, mode: Club): CoachState {
    let s = s0;
    if (!s.transfers.window) return s;
    for (const o of [...s.transfers.offers]) s = rejectPlayerOffer(s, o.id);
    for (const p of expiringPlayers(s)) {
        const r = renewAtAsk(s, p.id);
        s = r === s ? letExpire(s, p.id) : r;
    }
    for (const r of [...s.transfers.requests]) s = denyRequest(s, r.playerId, false);
    if (mode === 'compra') {
        for (const c of [...s.transfers.arrivals]) {
            if (rosterSize(s) >= SQUAD_MAX) {
                const worst = s.squad
                    .filter((p) => p.group === c.player.group && !releaseBlock(s, p.id))
                    .sort((a, b) => a.level - b.level || a.id.localeCompare(b.id))[0];
                if (!worst || worst.level >= c.player.level) continue;
                s = releasePlayer(s, worst.id);
            }
            if (!signBlock(s, c.id)) s = signCandidate(s, c.id);
        }
    }
    return s;
}

interface ClubRun {
    fired: number;
    xv: number;
    position: number;
    caja: number;
    survived: number;
}

function runClubs(mode: Club, careers: number): ClubRun {
    let fired = 0;
    let xv = 0;
    let pos = 0;
    let n = 0;
    let caja = 0;
    let survived = 0;
    for (let c = 0; c < careers; c++) {
        const player = createRng(1000 + c);
        let s = createCareer(50_000 + c, CLUBS[c % CLUBS.length], COACH_PROFILES[c % COACH_PROFILES.length].id);
        for (let y = 0; y < 12; y++) {
            s = autoResolveAcademy(clubWindow(s, mode), mode, null);
            s = playYear(s, player, (st) => clubWindow(st, mode));
            const e = s.seasons[s.seasons.length - 1];
            xv += teamRating(s.squad);
            pos += e.teams > 1 ? (e.position - 1) / (e.teams - 1) : 0.5;
            n++;
            s = closeSeason(s);
            if (s.phase === 'fired') {
                fired++;
                break;
            }
            assert.ok(s.squad.length >= SQUAD_MIN && rosterSize(s) <= SQUAD_MAX, `${mode}: plantel de ${s.squad.length}`);
            if (y === 11) {
                caja += s.club.finances.caja;
                survived++;
            }
        }
    }
    return { fired: fired / careers, xv: xv / n, position: pos / n, caja: caja / Math.max(1, survived), survived };
}

// MEDIDO el 2026-10-14 con 150 carreras × 12 temporadas (este test corre 100,
// mismas semillas), tarjetas al azar y sin mejoras:
//
//                       forma     compra
//   XV al cierre        25,3      26,6     (rating de equipo, media de los años)
//   posición media      0,244     0,226    (0 = primero, 1 = último)
//   títulos / temporada 38,6 %    41,5 %
//   despedidos          32,0 %    38,7 %
//   caja al año 12      48,5 M    37,9 M   (los que llegaron: 102 y 92 de 150)
//   formados en el club 23,0      13,2     (de 26)
//
// Comprar da un XV un punto mejor y algún título más; formar cumple el
// formativo, paga menos vínculos y aguanta más en el cargo. Ninguno domina en
// todo: es una elección. Las bandas de abajo son el doble de lo medido.
test('formar contra comprar es una elección real: los dos son viables y ninguno domina en todo', () => {
    const forma = runClubs('forma', 100);
    const compra = runClubs('compra', 100);
    for (const [name, r] of [['forma', forma], ['compra', compra]] as const) {
        assert.ok(r.fired <= 0.55, `${name}: despedido el ${(r.fired * 100).toFixed(0)} %`);
        assert.ok(r.survived > 0, `${name}: nadie llegó al año 12`);
    }
    assert.ok(Math.abs(forma.xv - compra.xv) <= 2.5, `el XV: forma ${forma.xv.toFixed(2)}, compra ${compra.xv.toFixed(2)}`);
    assert.ok(
        Math.abs(forma.position - compra.position) <= 0.08,
        `la posición: forma ${forma.position.toFixed(3)}, compra ${compra.position.toFixed(3)}`,
    );
    const better = (a: ClubRun, b: ClubRun) =>
        [a.xv > b.xv, a.position < b.position, a.fired < b.fired, a.caja > b.caja].filter(Boolean).length;
    assert.ok(better(forma, compra) < 4, 'formar domina en todo');
    assert.ok(better(compra, forma) < 4, 'comprar domina en todo');
});
