// El movimiento de las fichas: tiene que ser el de un jugador de rugby.
//
//   1. Nadie corre más rápido que su puesto, ni acelera como un cohete, ni se teletransporta.
//   2. De parado a velocidad punta se tarda casi dos segundos, y frenar también cuesta.
//   3. Los guiones se cumplen: el 9 llega al ruck, el saltador sube en la touch, el
//      que anota llega al in-goal, la melé se junta y empuja, la pelota pasa de mano en mano.
//   4. Misma secuencia de jugadas ⇒ mismo movimiento.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    chooseClub, createGame, leagueChoices, prepareLiveMatch, type LiveMatchSetup,
} from '../../../game/game.ts';
import { simulateMatch } from '../../matchEngine.ts';
import { Broadcast } from '../broadcast.ts';
import { formationFor } from '../formations.ts';
import { Motion, STEP, VMAX } from '../motion.ts';
import type { Play } from '../types.ts';

function setup(): LiveMatchSetup {
    const game = createGame(7);
    const top14 = leagueChoices(game.world).find((l) => l.competition.shortName === 'T14');
    assert.ok(top14);
    const started = chooseClub(game, top14.clubs[5].id, { name: 'Prueba', age: 40, nationality: 'ARG' });
    const prepared = prepareLiveMatch(started);
    assert.ok(prepared);
    return prepared.setup;
}

const s = setup();
const result = simulateMatch(s.homeTeam, s.awayTeam, s.simOptions);
const broadcast = new Broadcast({ matchId: s.matchId, home: s.homeTeam, away: s.awayTeam });
broadcast.extend(result.events, s.opponentSubs);
const plays: Play[] = broadcast.plays;

const newMotion = () => new Motion(formationFor({ kind: 'kickoff', attacker: 'home', dir: 1, ball: { x: 50, y: 35 } }), 'home-10');

interface Run {
    maxSpeed: number;
    maxAccel: number;
    maxStep: number;
    maxBall: number;
    outOfBounds: string[];
    unfinished: number[];
    ballJumps: string[];
}

/** Juega todo el partido, mirando cada paso de la física. */
function playMatch(limit = plays.length): { motion: Motion; run: Run } {
    const motion = newMotion();
    const run: Run = { maxSpeed: 0, maxAccel: 0, maxStep: 0, maxBall: 0, outOfBounds: [], unfinished: [], ballJumps: [] };
    const last = motion.snapshot().bodies.map((b) => ({ x: b.x, y: b.y, vx: b.vx, vy: b.vy }));
    let lastBall = { x: motion.snapshot().ball.x, y: motion.snapshot().ball.y };
    for (let i = 0; i < Math.min(limit, plays.length); i++) {
        motion.begin(plays[i], plays[i + 1], plays[i - 1]);
        let guard = 0;
        while (!motion.finished && guard++ < 4000) {
            motion.step(STEP);
            const { bodies, ball } = motion.snapshot();
            bodies.forEach((b, k) => {
                const speed = Math.hypot(b.vx, b.vy);
                run.maxSpeed = Math.max(run.maxSpeed, speed / VMAX[b.position]);
                run.maxAccel = Math.max(run.maxAccel, Math.hypot(b.vx - last[k].vx, b.vy - last[k].vy) / STEP);
                run.maxStep = Math.max(run.maxStep, Math.hypot(b.x - last[k].x, b.y - last[k].y) / (VMAX[b.position] * STEP));
                if (b.x < -14 || b.x > 114 || b.y < -3 || b.y > 73) run.outOfBounds.push(`${i}:${b.key}@${b.x.toFixed(1)},${b.y.toFixed(1)}`);
                last[k] = { x: b.x, y: b.y, vx: b.vx, vy: b.vy };
            });
            const ballSpeed = Math.hypot(ball.x - lastBall.x, ball.y - lastBall.y) / STEP;
            if (ballSpeed > 45) run.ballJumps.push(`${i}:${plays[i].type}@${motion.progress.elapsed.toFixed(2)}s ${ballSpeed.toFixed(0)}m/s`);
            run.maxBall = Math.max(run.maxBall, ballSpeed);
            lastBall = { x: ball.x, y: ball.y };
        }
        if (!motion.finished) run.unfinished.push(i);
    }
    return { motion, run };
}

describe('rugby-manager · locomoción de las fichas', () => {
    it('de parado a velocidad punta se tarda casi dos segundos', () => {
        const mm = new Motion([{ key: 'home-11', side: 'home', position: 11, x: 10, y: 35 }], null);
        const body = mm.snapshot().bodies[0];
        // Un ala corre 80 metros: se mide el tiempo hasta el 90% de su velocidad máxima.
        (mm as unknown as { script: unknown }).script = {
            duration: 30, paths: new Map([['home-11', [{ t: 0, x: 90, y: 35, speed: 1 }]]]), cues: [], jumps: [], separate: false,
        };
        let t = 0;
        let reached = -1;
        while (t < 12) {
            mm.step(STEP);
            t += STEP;
            if (reached < 0 && Math.hypot(body.vx, body.vy) >= 0.9 * VMAX[11]) reached = t;
        }
        assert.ok(reached > 1.4 && reached < 3.2, `llegó al 90% a los ${reached.toFixed(2)} s`);
    });

    it('nadie supera la velocidad de su puesto ni se teletransporta, en todo el partido', () => {
        const { run } = playMatch();
        assert.ok(run.maxSpeed <= 1.0001, `velocidad máxima relativa ${run.maxSpeed.toFixed(3)}`);
        assert.ok(run.maxStep <= 1.0001, `paso máximo relativo ${run.maxStep.toFixed(3)}`);
        assert.ok(run.maxAccel < 14, `aceleración máxima ${run.maxAccel.toFixed(1)} m/s²`);
        assert.ok(run.maxBall < 45, `la pelota llegó a ${run.maxBall.toFixed(1)} m/s: ${run.ballJumps.slice(0, 6).join(' | ')}`);
        assert.deepEqual(run.outOfBounds.slice(0, 5), []);
        assert.deepEqual(run.unfinished, []);
    });

    it('los jugadores sí corren fuerte: hay carreras a más del 85% de la velocidad punta', () => {
        const { run } = playMatch(80);
        assert.ok(run.maxSpeed > 0.85, `solo llegaron al ${run.maxSpeed.toFixed(2)}`);
    });

    it('es determinista: la misma secuencia da exactamente el mismo movimiento', () => {
        const a = playMatch(60).motion.snapshot();
        const b = playMatch(60).motion.snapshot();
        assert.equal(JSON.stringify(a), JSON.stringify(b));
    });
});

describe('rugby-manager · coreografía de las jugadas', () => {
    const at = (type: Play['type'], nth = 0) => plays.filter((p) => p.type === type)[nth];

    function playUntil(index: number): Motion {
        const motion = newMotion();
        for (let i = 0; i <= index; i++) {
            motion.begin(plays[i], plays[i + 1], plays[i - 1]);
            for (let g = 0; g < 4000 && !motion.finished; g++) motion.step(STEP);
        }
        return motion;
    }

    it('en un ruck, el 9 queda al pie de la pelota y tiene que haberla tomado', () => {
        const ruck = plays.find((p, i) => p.type === 'ruck_won' && i > 5)!;
        const motion = playUntil(ruck.index);
        const { bodies, ball } = motion.snapshot();
        const nine = bodies.find((b) => b.side === ruck.attacker && b.position === 9)!;
        assert.ok(Math.hypot(nine.x - ruck.ball.x, nine.y - ruck.ball.y) < 5, 'el 9 está cerca del ruck');
        assert.equal(ball.holder, nine.key);
    });

    it('en una melé ganada los dos packs se juntan y la pelota la tiene el 9', () => {
        const scrum = at('scrum_won', 0);
        if (!scrum) return;
        const motion = playUntil(scrum.index);
        const { bodies, ball } = motion.snapshot();
        const pack = bodies.filter((b) => b.position <= 8);
        const near = pack.filter((b) => Math.hypot(b.x - scrum.ball.x, b.y - scrum.ball.y) < 9).length;
        assert.ok(near >= 14, `${near} de 16 delanteros en la melé`);
        assert.equal(ball.holder, `${scrum.attacker}-9`);
    });

    it('en la touch el saltador sube y la pelota sale a manos del 9', () => {
        const lineout = at('lineout_won', 0);
        if (!lineout) return;
        const motion = newMotion();
        for (let i = 0; i <= lineout.index; i++) {
            motion.begin(plays[i], plays[i + 1], plays[i - 1]);
            let top = 0;
            for (let g = 0; g < 4000 && !motion.finished; g++) {
                motion.step(STEP);
                if (i === lineout.index) top = Math.max(top, ...motion.snapshot().bodies.map((b) => b.z));
            }
            if (i === lineout.index) {
                assert.ok(top > 0.9, `el saltador llegó a ${top.toFixed(2)}`);
                assert.equal(motion.snapshot().ball.holder, `${lineout.attacker}-9`);
            }
        }
    });

    it('el que anota llega al in-goal con la pelota', () => {
        const t = at('try', 0);
        assert.ok(t?.primary);
        const motion = playUntil(t.index);
        const scorer = motion.snapshot().bodies.find((b) => b.key === `${t.primary!.side}-${t.primary!.position}`)!;
        const inGoal = t.dir === 1 ? scorer.x > 98 : scorer.x < 2;
        assert.ok(inGoal, `el autor quedó en x=${scorer.x.toFixed(1)}`);
    });

    it('la pelota pasa por varias manos antes de llegar al que corre', () => {
        const phase = plays.find((p, i) => p.type === 'phase_play' && i > 6)!;
        const motion = newMotion();
        const holders = new Set<string>();
        for (let i = 0; i <= phase.index; i++) {
            motion.begin(plays[i], plays[i + 1], plays[i - 1]);
            for (let g = 0; g < 4000 && !motion.finished; g++) {
                motion.step(STEP);
                const h = motion.snapshot().ball.holder;
                if (i === phase.index && h) holders.add(h);
            }
        }
        assert.ok(holders.size >= 2, `la pelota pasó por ${holders.size} jugadores`);
    });
});
