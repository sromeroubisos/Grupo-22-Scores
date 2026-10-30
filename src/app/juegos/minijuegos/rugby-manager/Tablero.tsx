'use client';

import { useEffect, useRef } from 'react';
import type { Motion, Play } from '../../../../features/manager/engine/live/index.ts';
import styles from './manager.module.css';

/** Cómo se ve cada equipo en la cancha. */
export interface TeamLook {
    name: string;
    color: string;
    ink: string;
    stroke: string;
}

interface Props {
    /** El movimiento de las fichas: lo avanza este componente cuadro a cuadro. */
    motion: Motion;
    /** La jugada que se está mostrando (para el cartel y la descripción). */
    play: Play | null;
    home: TeamLook;
    away: TeamLook;
    /** Segundos de partido por segundo real. */
    speed: number;
    /** Si es false, las fichas quedan quietas (pausa o decisión pendiente). */
    running: boolean;
    /** Nombre de quien lleva la pelota, a partir de la camiseta ("home-10"). */
    nameOf: (key: string) => string;
    /** Se llama una vez cuando termina la jugada que se estaba mostrando. */
    onPlayEnd: () => void;
}

/** Metros a unidades del dibujo. La cancha va de 0 a 100 y el in-goal llega a -10 y 110. */
const U = 10;
const W = 70 * U;

const KIND_LABEL: Record<Play['kind'], string> = {
    kickoff: 'Saque',
    scrum: 'Melé',
    lineout: 'Touch',
    ruck: 'Juego abierto',
    maul: 'Maul',
    kick: 'Patada',
    goal: 'A los palos',
    try: 'Ensayo',
    penalty: 'Penal',
    idle: '',
};

function Pitch({ half, home, away }: { half: 1 | 2; home: TeamLook; away: TeamLook }) {
    // En el primer tiempo el local defiende el in-goal de la izquierda; en el segundo se cambia de lado.
    const left = half === 1 ? home : away;
    const right = half === 1 ? away : home;
    return (
        <g aria-hidden="true">
            <rect x={-10 * U} y={0} width={120 * U} height={W} fill="#14532d" />
            {Array.from({ length: 10 }).map((_, i) => (
                <rect key={i} x={i * 10 * U} y={0} width={10 * U} height={W} fill={i % 2 === 0 ? '#166534' : '#15803d'} />
            ))}
            <rect x={-10 * U} y={0} width={10 * U} height={W} fill="#0f3d22" />
            <rect x={100 * U} y={0} width={10 * U} height={W} fill="#0f3d22" />
            {/* Líneas: touch, pelota muerta, gol, 22, 10 y medio campo. */}
            <rect x={-10 * U} y={0} width={120 * U} height={W} fill="none" stroke="#fff" strokeOpacity={0.55} strokeWidth={3} />
            <rect x={0} y={0} width={100 * U} height={W} fill="none" stroke="#fff" strokeWidth={4} />
            {[22, 78].map((m) => (
                <line key={m} x1={m * U} y1={0} x2={m * U} y2={W} stroke="#fff" strokeWidth={3} />
            ))}
            {[40, 60].map((m) => (
                <line key={m} x1={m * U} y1={0} x2={m * U} y2={W} stroke="#fff" strokeWidth={2} strokeDasharray="22 28" strokeOpacity={0.7} />
            ))}
            <line x1={50 * U} y1={0} x2={50 * U} y2={W} stroke="#fff" strokeWidth={4} />
            {[5, 15, 55, 65].map((y) => (
                <line key={y} x1={0} y1={y * U} x2={100 * U} y2={y * U} stroke="#fff" strokeWidth={2} strokeDasharray="14 46" strokeOpacity={0.4} />
            ))}
            {/* Palos. */}
            {[0, 100].map((m) => (
                <g key={m} stroke="#fde047" strokeWidth={5} strokeLinecap="round">
                    <line x1={m * U} y1={320} x2={m * U} y2={380} />
                    <line x1={m * U - 12} y1={320} x2={m * U + 12} y2={320} />
                    <line x1={m * U - 12} y1={380} x2={m * U + 12} y2={380} />
                </g>
            ))}
            {/* Quién defiende cada in-goal. */}
            <text transform={`translate(${-5 * U} ${W / 2}) rotate(-90)`} textAnchor="middle" className={styles.inGoalName} fill={left.stroke}>
                {left.name.toUpperCase()}
            </text>
            <text transform={`translate(${105 * U} ${W / 2}) rotate(90)`} textAnchor="middle" className={styles.inGoalName} fill={right.stroke}>
                {right.name.toUpperCase()}
            </text>
        </g>
    );
}

export default function Tablero({ motion, play, home, away, speed, running, nameOf, onPlayEnd }: Props) {
    const bodyRefs = useRef(new Map<string, SVGGElement>());
    const ballRef = useRef<SVGGElement | null>(null);
    const shadowRef = useRef<SVGEllipseElement | null>(null);
    const ringRef = useRef<SVGCircleElement | null>(null);
    const labelRef = useRef<SVGTextElement | null>(null);
    const callbacks = useRef({ speed, running, nameOf, onPlayEnd });
    useEffect(() => {
        callbacks.current = { speed, running, nameOf, onPlayEnd };
    }, [speed, running, nameOf, onPlayEnd]);

    // El bucle de cuadros: avanza la física y mueve los elementos del dibujo directamente,
    // sin pasar por React, para que 31 fichas a 60 cuadros por segundo no cuesten un render.
    useEffect(() => {
        let frame = 0;
        let previous = performance.now();
        let notified = -1;
        let labelKey = '';
        const paint = () => {
            const { bodies, ball } = motion.snapshot();
            for (const b of bodies) {
                const g = bodyRefs.current.get(b.key);
                if (g) g.setAttribute('transform', `translate(${(b.x * U).toFixed(1)} ${(b.y * U).toFixed(1)}) scale(${(1 + b.z * 0.5).toFixed(2)})`);
            }
            const lift = ball.z * 46;
            ballRef.current?.setAttribute('transform', `translate(${(ball.x * U).toFixed(1)} ${(ball.y * U - lift).toFixed(1)}) scale(${(1 + ball.z * 0.9).toFixed(2)})`);
            if (shadowRef.current) {
                shadowRef.current.setAttribute('cx', (ball.x * U).toFixed(1));
                shadowRef.current.setAttribute('cy', (ball.y * U + 6).toFixed(1));
                shadowRef.current.setAttribute('opacity', (ball.holder ? 0 : 0.35 - ball.z * 0.15).toFixed(2));
            }
            const holder = ball.holder ? bodies.find((b) => b.key === ball.holder) : undefined;
            if (ringRef.current) {
                if (holder) {
                    ringRef.current.setAttribute('transform', `translate(${(holder.x * U).toFixed(1)} ${(holder.y * U).toFixed(1)})`);
                    ringRef.current.style.display = '';
                } else {
                    ringRef.current.style.display = 'none';
                }
            }
            if (labelRef.current) {
                if (holder) {
                    if (labelKey !== holder.key) {
                        labelKey = holder.key;
                        labelRef.current.textContent = callbacks.current.nameOf(holder.key);
                    }
                    labelRef.current.setAttribute('transform', `translate(${(holder.x * U).toFixed(1)} ${(holder.y * U - 34).toFixed(1)})`);
                    labelRef.current.style.display = '';
                } else {
                    labelKey = '';
                    labelRef.current.style.display = 'none';
                }
            }
        };
        const loop = (now: number) => {
            const dt = Math.min(0.1, (now - previous) / 1000);
            previous = now;
            const c = callbacks.current;
            if (c.running) motion.step(dt * c.speed);
            paint();
            if (c.running && motion.finished && notified !== motion.scriptId) {
                notified = motion.scriptId;
                c.onPlayEnd();
            }
            frame = window.requestAnimationFrame(loop);
        };
        paint();
        frame = window.requestAnimationFrame(loop);
        return () => window.cancelAnimationFrame(frame);
    }, [motion]);

    const half = play?.half ?? 1;
    const look = (side: 'home' | 'away') => (side === 'home' ? home : away);
    const initial = motion.snapshot();
    const label = play ? KIND_LABEL[play.kind] : '';
    const attackerLook = play ? look(play.attacker) : home;

    return (
        <div className={styles.tablero}>
            <div className={styles.tableroBar}>
                <span className={styles.tableroChip} style={{ background: attackerLook.color, color: attackerLook.ink }}>
                    {play ? `Ataca ${attackerLook.name} ${play.dir === 1 ? '→' : '←'}` : 'Saque inicial'}
                </span>
                {play && play.phase > 0 && <span className={styles.tableroChipSoft}>Fase {play.phase}</span>}
                {label && <span className={styles.tableroChipSoft}>{label}</span>}
            </div>
            <svg
                viewBox={`${-10 * U - 10} -24 ${120 * U + 20} ${W + 48}`}
                className={styles.tableroSvg}
                role="img"
                aria-label={play ? `Cancha: ${play.headline}` : 'Cancha, el partido está por empezar'}
                preserveAspectRatio="xMidYMid meet"
            >
                <Pitch half={half} home={home} away={away} />

                <ellipse ref={shadowRef} rx={9} ry={4} fill="#000" opacity={0} />
                <circle ref={ringRef} r={25} fill="none" stroke="#fde68a" strokeWidth={4} style={{ display: 'none' }} />

                {initial.bodies.map((b) => {
                    const l = look(b.side);
                    return (
                        <g
                            key={b.key}
                            ref={(el) => {
                                if (el) bodyRefs.current.set(b.key, el);
                                else bodyRefs.current.delete(b.key);
                            }}
                            transform={`translate(${b.x * U} ${b.y * U})`}
                        >
                            <circle r={14} fill={l.color} stroke={l.stroke} strokeWidth={3} />
                            <text className={styles.dotNum} fill={l.ink} textAnchor="middle" dy="0.35em">
                                {b.position}
                            </text>
                        </g>
                    );
                })}

                <g ref={ballRef} transform={`translate(${initial.ball.x * U} ${initial.ball.y * U})`}>
                    <ellipse rx={11} ry={7.5} fill="#fafaf9" stroke="#1c1917" strokeWidth={2.5} transform="rotate(-20)" />
                    <line x1={-5} y1={1.5} x2={5} y2={-1.5} stroke="#1c1917" strokeWidth={1.5} />
                </g>

                <text ref={labelRef} className={styles.focusName} textAnchor="middle" style={{ display: 'none' }} />
            </svg>
        </div>
    );
}
