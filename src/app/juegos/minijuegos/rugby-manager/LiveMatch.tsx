'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Club, ID, Player, RugbyPosition } from '../../../../features/manager/types/index.ts';
import { POSITION_SHORT } from '../../../../features/manager/types/index.ts';
import type { MatchResult } from '../../../../features/manager/engine/types.ts';
import type { PenaltyDecision } from '../../../../features/manager/engine/expectedPoints.ts';
import { createLiveSim } from '../../../../features/manager/engine/liveRunner.ts';
import { Broadcast, Motion, attackDir, formationFor } from '../../../../features/manager/engine/live/index.ts';
import {
    buildPresence, designatedKicker, type EventActors, type SubLog,
} from '../../../../features/manager/engine/playerMatchStats.ts';
import type { LiveMatchSetup } from '../../../../features/manager/game/game.ts';
import Tablero, { type TeamLook } from './Tablero.tsx';
import MatchStats from './MatchStats.tsx';
import PenaltyPanel from './PenaltyPanel.tsx';
import { readableOn, shortPlayerName } from './Shared.tsx';
import styles from './manager.module.css';

type Speed = '1x' | '3x' | '8x' | '24x';

/** Segundos de partido por segundo real. A 1x las fichas se mueven a velocidad humana real;
 *  un partido entero dura casi lo que dura de verdad, así que 8x es el ritmo cómodo. */
const SPEED_SCALE: Record<Speed, number> = { '1x': 1, '3x': 3, '8x': 8, '24x': 24 };
const SPEEDS: Speed[] = ['1x', '3x', '8x', '24x'];
const MAX_SUBS = 8;
const FEED_SIZE = 14;

interface Props {
    setup: LiveMatchSetup;
    homeClub: Club | undefined;
    awayClub: Club | undefined;
    disabled: boolean;
    onConfirm: (result: MatchResult, mySubs: SubLog, eventActors: Array<EventActors | undefined>) => void;
    onLeave: () => void;
}

/** Distancia entre dos colores hex, de 0 a ~441. */
function colorDistance(a: string, b: string): number {
    const parse = (hex: string) => {
        const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
        if (!m) return null;
        const n = parseInt(m[1], 16);
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    };
    const x = parse(a);
    const y = parse(b);
    if (!x || !y) return 0;
    return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}

function look(name: string, color: string): TeamLook {
    const ink = readableOn(color);
    return { name, color, ink, stroke: ink === '#ffffff' ? 'rgba(255,255,255,0.9)' : 'rgba(17,24,39,0.9)' };
}

/** Las dos camisetas; si se parecen, el visitante usa su color alternativo o uno que contraste. */
function pairLooks(home: Club | undefined, away: Club | undefined): [TeamLook, TeamLook] {
    const homeColor = home?.primaryColor ?? '#1e40af';
    let awayColor = away?.primaryColor ?? '#ea580c';
    if (colorDistance(homeColor, awayColor) < 120) {
        const alt = away?.secondaryColor;
        if (alt && colorDistance(homeColor, alt) >= 120) awayColor = alt;
        else awayColor = readableOn(homeColor) === '#ffffff' ? '#f8fafc' : '#111827';
    }
    return [look(home?.name ?? 'Local', homeColor), look(away?.name ?? 'Visitante', awayColor)];
}

export default function LiveMatch({ setup, homeClub, awayClub, disabled, onConfirm, onLeave }: Props) {
    const [sim] = useState(() => createLiveSim(setup.homeTeam, setup.awayTeam, setup.simOptions, setup.mySide));
    const [broadcast] = useState(() => new Broadcast({ matchId: setup.matchId, home: setup.homeTeam, away: setup.awayTeam }));
    const [motion] = useState(
        () => new Motion(formationFor({ kind: 'kickoff', attacker: 'home', dir: 1, ball: { x: 50, y: 35 } }), 'home-10'),
    );
    /** Índice de la jugada que se está mostrando. */
    const [cursor, setCursor] = useState(-1);
    /** El partido se frenó en un penal a favor y la jugada que lo marcó ya terminó. */
    const [decisionReady, setDecisionReady] = useState(false);
    const [done, setDone] = useState(false);
    const [speed, setSpeed] = useState<Speed>('8x');
    const [paused, setPaused] = useState(false);
    const [mySubs, setMySubs] = useState<SubLog>([]);
    const [picking, setPicking] = useState<ID | null>(null);
    const [homeLook, awayLook] = useMemo(() => pairLooks(homeClub, awayClub), [homeClub, awayClub]);

    const allSubs = useMemo<SubLog>(() => [...mySubs, ...setup.opponentSubs], [mySubs, setup.opponentSubs]);
    const subsRef = useRef(allSubs);
    const cursorRef = useRef(cursor);
    useEffect(() => {
        subsRef.current = allSubs;
        cursorRef.current = cursor;
    }, [allSubs, cursor]);

    const events = sim.events();
    const plays = broadcast.plays;
    const current = cursor >= 0 ? plays[cursor] ?? null : null;
    const minute = current ? Math.min(80, Math.floor(current.minute)) : 0;
    const score = cursor >= 0 && events[cursor] ? events[cursor].scoreAfter : { home: 0, away: 0 };

    /** Pasa a la jugada que sigue: pide al motor un par de jugadas de ventaja (la patada
     *  necesita saber dónde cae la pelota) y arranca el movimiento. */
    const advancePlay = useCallback(() => {
        const at = cursorRef.current;
        sim.produce(at + 4);
        broadcast.extend(sim.events(), subsRef.current);
        const nextIndex = at + 1;
        const list = broadcast.plays;
        if (nextIndex < list.length) {
            motion.begin(list[nextIndex], list[nextIndex + 1], list[nextIndex - 1]);
            cursorRef.current = nextIndex;
            setCursor(nextIndex);
        } else if (sim.awaiting()) {
            setDecisionReady(true);
        } else if (sim.finished()) {
            setDone(true);
        }
    }, [sim, broadcast, motion]);

    const skipToEnd = () => {
        sim.skipToEnd();
        broadcast.extend(sim.events(), subsRef.current);
        const list = broadcast.plays;
        const last = list.length - 1;
        if (last >= 0) {
            motion.begin(list[last], undefined, list[last - 1]);
            motion.settle();
            cursorRef.current = last;
            setCursor(last);
        }
        setDecisionReady(false);
        setDone(true);
    };

    const decide = (decision: PenaltyDecision) => {
        sim.decide(decision);
        setDecisionReady(false);
        advancePlay();
    };

    // Quién está en cancha en cada camiseta, para nombrar a quien lleva la pelota.
    const presence = useMemo(
        () => ({
            home: buildPresence({ starters: setup.homeTeam.starters, bench: setup.homeTeam.bench }, allSubs, 'home'),
            away: buildPresence({ starters: setup.awayTeam.starters, bench: setup.awayTeam.bench }, allSubs, 'away'),
        }),
        [setup, allSubs],
    );
    const nameOf = useCallback(
        (key: string) => {
            const [side, position] = key.split('-');
            const at = plays[cursorRef.current]?.minute ?? 0;
            return presence[side as 'home' | 'away'].on(at).get(Number(position) as RugbyPosition)?.lastName ?? '';
        },
        [presence, plays],
    );

    // ── Cambios ──
    const myTeam = setup.mySide === 'home' ? setup.homeTeam : setup.awayTeam;
    const onField = useMemo(() => {
        const replaced = new Map(mySubs.map((s) => [s.off, s.on]));
        const bench = new Map(myTeam.bench.map((p) => [p.id, p]));
        return myTeam.starters.map((starter) => {
            let player: Player = starter;
            for (let guard = 0; guard < MAX_SUBS && replaced.has(player.id); guard++) {
                const next = bench.get(replaced.get(player.id)!);
                if (!next) break;
                player = next;
            }
            return player;
        });
    }, [myTeam, mySubs]);
    const benchLeft = useMemo(() => {
        const used = new Set(mySubs.map((s) => s.on));
        return myTeam.bench.filter((p) => !used.has(p.id));
    }, [myTeam, mySubs]);

    const canSub = !done && mySubs.length < MAX_SUBS && benchLeft.length > 0;
    const makeSub = (offId: ID, onId: ID) => {
        // Entra desde el minuto siguiente a la última jugada ya armada: lo que ya se contó no cambia de protagonista.
        const last = plays.length > 0 ? plays[plays.length - 1].minute : 0;
        setMySubs((previous) => [...previous, { side: setup.mySide, minute: Math.min(80, Math.floor(last) + 1), off: offId, on: onId }]);
        setPicking(null);
    };

    // ── Penal a favor ──
    const choices = decisionReady ? sim.awaiting() : null;
    const myName = setup.mySide === 'home' ? homeLook.name : awayLook.name;
    const myMargin = setup.mySide === 'home' ? score.home - score.away : score.away - score.home;
    const penaltyDistance = useMemo(() => {
        if (!current) return 40;
        const dir = attackDir(setup.mySide, current.half);
        return dir === 1 ? 100 - current.ball.x : current.ball.x;
    }, [current, setup.mySide]);
    const kicker = useMemo(() => {
        const slots = new Map<RugbyPosition, Player>();
        myTeam.starters.forEach((starter, i) => slots.set(starter.primaryPosition as RugbyPosition, onField[i]));
        const p = designatedKicker(slots);
        return p ? shortPlayerName(p) : null;
    }, [myTeam, onField]);

    const shown = cursor >= 0 ? plays.slice(0, cursor + 1) : [];
    const feed = shown.slice(Math.max(0, shown.length - FEED_SIZE)).reverse();
    const running = !paused && !decisionReady;

    return (
        <section aria-labelledby="live-title">
            <h2 id="live-title" className={styles.srOnly}>Partido en vivo: {homeLook.name} contra {awayLook.name}</h2>

            <div className={styles.arena}>
                <div className={styles.scoreboard}>
                    <span className={styles.scoreName}>{homeLook.name}</span>
                    <span className={styles.scoreBig} aria-live="off">
                        {score.home} – {score.away}
                    </span>
                    <span className={`${styles.scoreName} ${styles.scoreNameAway}`}>{awayLook.name}</span>
                    <span className={styles.clock}>
                        {done ? 'Final' : `${minute}' · ${minute > 40 ? '2.º tiempo' : '1.er tiempo'}`}
                    </span>
                </div>

                <Tablero
                    motion={motion}
                    play={current}
                    home={homeLook}
                    away={awayLook}
                    speed={SPEED_SCALE[speed]}
                    running={running}
                    nameOf={nameOf}
                    onPlayEnd={advancePlay}
                />

                {choices ? (
                    <PenaltyPanel
                        choices={choices}
                        clubName={myName}
                        minute={current?.minute ?? minute}
                        distance={penaltyDistance}
                        kicker={kicker}
                        margin={myMargin}
                        onDecide={decide}
                    />
                ) : (
                    <div className={styles.headline} aria-live="off">
                        <p className={styles.headlineMain}>{current ? current.headline : 'Los equipos salen a la cancha.'}</p>
                        {current && current.detail && current.detail !== current.headline && (
                            <p className={styles.headlineSub}>{current.detail}</p>
                        )}
                    </div>
                )}

                <div className={styles.liveControls}>
                    {!done && !choices && (
                        <button type="button" className={styles.btn} onClick={() => setPaused((p) => !p)}>
                            {paused ? 'Seguir' : 'Pausar'}
                        </button>
                    )}
                    {!done && (
                        <div className={styles.speedGroup} role="radiogroup" aria-label="Velocidad del partido">
                            {SPEEDS.map((s) => (
                                <button
                                    key={s}
                                    type="button"
                                    role="radio"
                                    aria-checked={speed === s}
                                    className={`${styles.btn} ${styles.speedBtn}`}
                                    onClick={() => setSpeed(s)}
                                >
                                    {s}
                                </button>
                            ))}
                        </div>
                    )}
                    {!done && (
                        <button type="button" className={styles.btn} onClick={skipToEnd}>
                            {choices ? 'Que decida el motor y saltar al final' : 'Saltar al final'}
                        </button>
                    )}
                    {done && (
                        <button
                            type="button"
                            className={`${styles.btn} ${styles.btnPrimary} ${styles.btnLarge}`}
                            disabled={disabled}
                            onClick={() => onConfirm(sim.result(), mySubs, broadcast.eventActors())}
                        >
                            Confirmar el resultado
                        </button>
                    )}
                    {!done && (
                        <button type="button" className={styles.btn} onClick={onLeave}>
                            Salir sin jugar
                        </button>
                    )}
                </div>
            </div>
            {!done && <p className={styles.hint}>Si salís ahora, el partido no cuenta y lo volvés a jugar entero.</p>}
            {done && <p className={styles.hint}>El resultado recién cuenta cuando lo confirmás.</p>}

            <div className={styles.grid2}>
                <section className={styles.card} aria-labelledby="feed-title">
                    <h3 id="feed-title" className={styles.sectionTitle}>Relato</h3>
                    {feed.length === 0 ? (
                        <p className={styles.muted}>Está por empezar.</p>
                    ) : (
                        <ol className={styles.feed} aria-live="off">
                            {feed.map((p) => {
                                const before = p.index > 0 ? events[p.index - 1]?.scoreAfter : undefined;
                                const after = events[p.index]?.scoreAfter;
                                const scored = !!before && !!after && (before.home !== after.home || before.away !== after.away);
                                return (
                                    <li key={p.index} className={scored ? styles.feedScore : undefined}>
                                        <span className={styles.feedMinute}>{Math.floor(p.minute)}&apos;</span>
                                        <span>{p.headline}</span>
                                    </li>
                                );
                            })}
                        </ol>
                    )}
                </section>

                <MatchStats
                    stats={current ? current.stats : {
                        possession: { home: 0, away: 0 }, territory: { home: 0, away: 0 }, tackles: { home: 0, away: 0 },
                        rucks: { home: 0, away: 0 }, scrums: { home: 0, away: 0 }, lineouts: { home: 0, away: 0 },
                        turnovers: { home: 0, away: 0 }, penalties: { home: 0, away: 0 }, tries: { home: 0, away: 0 },
                    }}
                    home={homeLook}
                    away={awayLook}
                />
            </div>

            <section className={styles.card} aria-labelledby="subs-title">
                <h3 id="subs-title" className={styles.sectionTitle}>Cambios ({mySubs.length}/{MAX_SUBS})</h3>
                {picking ? (
                    <>
                        <p className={styles.muted}>Elegí quién entra por {onField.find((p) => p.id === picking)?.lastName}.</p>
                        <ul className={styles.subList}>
                            {benchLeft.map((p) => (
                                <li key={p.id}>
                                    <button type="button" className={styles.btn} onClick={() => makeSub(picking, p.id)}>
                                        {POSITION_SHORT[p.primaryPosition]} · {shortPlayerName(p)}
                                    </button>
                                </li>
                            ))}
                        </ul>
                        <button type="button" className={styles.btn} onClick={() => setPicking(null)}>Cancelar</button>
                    </>
                ) : (
                    <ul className={styles.subList}>
                        {onField.map((p, i) => (
                            <li key={`${i}-${p.id}`} className={styles.subRow}>
                                <span>{POSITION_SHORT[myTeam.starters[i].primaryPosition]} · {shortPlayerName(p)}</span>
                                <button
                                    type="button"
                                    className={styles.btn}
                                    disabled={!canSub}
                                    aria-label={`Sustituir a ${p.firstName} ${p.lastName}`}
                                    onClick={() => setPicking(p.id)}
                                >
                                    Cambiar
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
                {!canSub && !done && mySubs.length >= MAX_SUBS && <p className={styles.hint}>Ya usaste los {MAX_SUBS} cambios.</p>}
            </section>
        </section>
    );
}
