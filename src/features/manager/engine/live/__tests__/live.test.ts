// El partido en vivo: el motor corre con el reloj, frena cuando el club del
// entrenador tiene un penal a favor, y la transmisión (lugar de la pelota,
// protagonistas, formaciones) sale de los eventos sin tocar el azar.
//
//   1. Sin decidir nada, el partido vivido es EL MISMO que el simulado de una.
//   2. Cada decisión del entrenador se cumple: palos patea a palos, touch va a touch.
//   3. Misma semilla y mismas decisiones ⇒ mismo partido.
//   4. La transmisión es coherente: 30 jugadores dentro de la cancha, el que
//      ataca cambia de lado en el segundo tiempo y las estadísticas acreditan a
//      quien el relato nombró.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    chooseClub, createGame, leagueChoices, prepareLiveMatch, type LiveMatchSetup,
} from '../../../game/game.ts';
import { simulateMatch } from '../../matchEngine.ts';
import { createLiveSim, type LiveSim } from '../../liveRunner.ts';
import { attributePlayerStats } from '../../playerMatchStats.ts';
import type { PenaltyDecision } from '../../expectedPoints.ts';
import { Broadcast, dotsFor } from '../broadcast.ts';

function setup(): LiveMatchSetup {
    const game = createGame(7);
    const top14 = leagueChoices(game.world).find((l) => l.competition.shortName === 'T14');
    assert.ok(top14, 'el mundo tiene que traer el Top 14');
    const started = chooseClub(game, top14.clubs[5].id, { name: 'Prueba', age: 40, nationality: 'ARG' });
    const prepared = prepareLiveMatch(started);
    assert.ok(prepared, 'hay un próximo partido');
    return prepared.setup;
}

const live = (s: LiveMatchSetup, side: 'home' | 'away' = s.mySide): LiveSim =>
    createLiveSim(s.homeTeam, s.awayTeam, s.simOptions, side);

/** Corre hasta el primer penal a favor del entrenador (o el final). */
function untilPenalty(sim: LiveSim): void {
    for (let guard = 0; guard < 5000 && !sim.finished() && !sim.awaiting(); guard++) sim.advance(1, 6);
}

/** Primer lado que llega a tener un penal a favor en este partido. */
function sideWithPenalty(s: LiveMatchSetup): 'home' | 'away' {
    for (const side of ['home', 'away'] as const) {
        const sim = live(s, side);
        untilPenalty(sim);
        if (sim.awaiting()) return side;
    }
    assert.fail('un partido de 80 minutos trae algún penal a favor');
}

function playOut(sim: LiveSim, decision?: PenaltyDecision): void {
    for (let guard = 0; guard < 20000 && !sim.finished(); guard++) {
        if (sim.awaiting() && decision) sim.decide(decision);
        sim.advance(1, 6);
        if (sim.awaiting() && !decision) sim.skipToEnd();
    }
}

describe('rugby-manager · partido en vivo con decisiones', () => {
    it('sin decidir nada da el mismo partido que el simulado de una', () => {
        const s = setup();
        const sim = live(s);
        sim.skipToEnd();
        const batch = simulateMatch(s.homeTeam, s.awayTeam, s.simOptions);
        assert.deepEqual(sim.result().finalScore, batch.finalScore);
        assert.equal(sim.events().length, batch.events.length);
    });

    it('avanzando con el reloj sin decidir da lo mismo que saltar al final', () => {
        const s = setup();
        const a = live(s);
        for (let guard = 0; guard < 20000 && !a.finished(); guard++) {
            a.advance(1 / 30, 8);
            if (a.awaiting()) a.skipToEnd();
        }
        const b = live(s);
        b.skipToEnd();
        assert.deepEqual(a.result().finalScore, b.result().finalScore);
        assert.equal(a.events().length, b.events().length);
    });

    it('con un penal a favor frena el reloj hasta que el entrenador decide', () => {
        const s = setup();
        const side = sideWithPenalty(s);
        const sim = live(s, side);
        untilPenalty(sim);
        const choices = sim.awaiting();
        assert.ok(choices, 'hay un penal pendiente');
        const before = sim.events().length;
        assert.equal(sim.advance(1, 60), 0, 'el reloj no corre con una decisión pendiente');
        assert.equal(sim.events().length, before);
        for (const d of ['palos', 'touch', 'tap', 'scrum'] as const) assert.ok(Number.isFinite(choices.scores[d]), d);
        assert.ok(choices.kickProb > 0 && choices.kickProb < 1);
    });

    it('cada decisión se cumple en la jugada que sigue', () => {
        const s = setup();
        const side = sideWithPenalty(s);
        const expected: Record<PenaltyDecision, (type: string, text: string) => boolean> = {
            palos: (t) => t === 'penalty_kick' || t === 'penalty_kick_missed',
            touch: (t) => t === 'penalty_to_touch',
            tap: (t) => t === 'quick_tap',
            scrum: (t, text) => t === 'commentary' && /mel/i.test(text),
        };
        for (const decision of Object.keys(expected) as PenaltyDecision[]) {
            const sim = live(s, side);
            untilPenalty(sim);
            const at = sim.events().length;
            sim.decide(decision);
            sim.advance(1, 6);
            const next = sim.events()[at];
            assert.ok(next, `${decision}: hay una jugada después de decidir`);
            assert.ok(expected[decision](next.type, next.text), `${decision}: pasó ${next.type} — ${next.text}`);
        }
    });

    it('misma semilla y mismas decisiones ⇒ mismo partido', () => {
        const s = setup();
        const side = sideWithPenalty(s);
        const run = (d: PenaltyDecision) => {
            const sim = live(s, side);
            playOut(sim, d);
            return JSON.stringify(sim.result().events);
        };
        assert.equal(run('touch'), run('touch'));
        assert.equal(run('palos'), run('palos'));
    });
});

describe('rugby-manager · transmisión del partido', () => {
    const s = setup();
    const result = simulateMatch(s.homeTeam, s.awayTeam, s.simOptions);
    const broadcast = new Broadcast({ matchId: s.matchId, home: s.homeTeam, away: s.awayTeam });
    broadcast.extend(result.events, s.opponentSubs);

    it('una jugada por evento, siempre las mismas', () => {
        assert.equal(broadcast.plays.length, result.events.length);
        const again = new Broadcast({ matchId: s.matchId, home: s.homeTeam, away: s.awayTeam });
        again.extend(result.events, s.opponentSubs);
        assert.equal(JSON.stringify(again.plays), JSON.stringify(broadcast.plays));
    });

    it('la transmisión es la misma entera que por tramos', () => {
        const parts = new Broadcast({ matchId: s.matchId, home: s.homeTeam, away: s.awayTeam });
        for (let n = 7; n < result.events.length + 7; n += 7) parts.extend(result.events.slice(0, n), s.opponentSubs);
        assert.equal(JSON.stringify(parts.plays), JSON.stringify(broadcast.plays));
    });

    it('la pelota y los 30 jugadores siempre están dentro de la cancha y del in-goal', () => {
        for (const play of broadcast.plays) {
            assert.ok(play.ball.x >= -10 && play.ball.x <= 110, `pelota x=${play.ball.x}`);
            assert.ok(play.ball.y >= 0 && play.ball.y <= 70, `pelota y=${play.ball.y}`);
            const dots = dotsFor(play);
            assert.equal(dots.length, 30, `${play.kind} (${play.type})`);
            assert.equal(new Set(dots.map((d) => d.key)).size, 30, `${play.kind}: camisetas repetidas`);
            for (const d of dots) {
                assert.ok(d.x >= -8 && d.x <= 108 && d.y >= 2 && d.y <= 68, `${play.kind}: ${d.key} en ${d.x},${d.y}`);
            }
        }
    });

    it('los equipos cambian de lado en el segundo tiempo', () => {
        const first = broadcast.plays.find((p) => p.half === 1 && p.attacker === 'home');
        const second = broadcast.plays.find((p) => p.half === 2 && p.attacker === 'home');
        assert.ok(first && second);
        assert.equal(first.dir, 1);
        assert.equal(second.dir, -1);
    });

    it('un ensayo termina en el in-goal del que ataca', () => {
        const tries = broadcast.plays.filter((p) => p.type === 'try');
        assert.ok(tries.length > 0);
        for (const t of tries) {
            assert.ok(t.dir === 1 ? t.ball.x > 100 : t.ball.x < 0, `ensayo en x=${t.ball.x}`);
            assert.ok(t.primary, 'el ensayo tiene autor');
        }
    });

    it('la touch se saca desde la línea de touch', () => {
        const lineouts = broadcast.plays.filter((p) => p.kind === 'lineout');
        assert.ok(lineouts.length > 0);
        for (const l of lineouts) assert.ok(l.ball.y <= 1 || l.ball.y >= 69, `touch en y=${l.ball.y}`);
    });

    it('el relato y la planilla no se contradicen: los ensayos son de quien se nombró', () => {
        const stats = attributePlayerStats({
            matchId: s.matchId,
            homeStarters: s.homeTeam.starters, homeBench: s.homeTeam.bench,
            awayStarters: s.awayTeam.starters, awayBench: s.awayTeam.bench,
            subs: s.opponentSubs,
            eventActors: broadcast.eventActors(),
            result,
        });
        const named = new Map<string, number>();
        for (const p of broadcast.plays) {
            if (p.type === 'try' && p.primary) named.set(p.primary.player.id, (named.get(p.primary.player.id) ?? 0) + 1);
        }
        for (const [id, tries] of named) {
            assert.equal(stats.find((x) => x.playerId === id)?.tries, tries, id);
        }
        const total = stats.reduce((n, x) => n + x.tries, 0);
        assert.equal(total, result.tries.home + result.tries.away);
    });

    it('un placaje se le acredita al equipo que placa, no al que es placado', () => {
        const tackle = broadcast.plays.find((p) => p.type === 'tackle' && p.primary);
        assert.ok(tackle?.primary);
        assert.notEqual(tackle.primary.side, tackle.attacker);
    });

    it('un knock-on es del que tenía la pelota', () => {
        const knock = broadcast.plays.find((p) => p.type === 'knock_on' && p.primary);
        if (!knock?.primary) return;
        assert.equal(knock.primary.side, knock.attacker);
    });

    it('las estadísticas corren: posesión que suma el partido y ensayos que coinciden', () => {
        const last = broadcast.plays[broadcast.plays.length - 1].stats;
        assert.ok(last.possession.home + last.possession.away > 60);
        assert.equal(last.tries.home, result.tries.home);
        assert.equal(last.tries.away, result.tries.away);
    });
});
