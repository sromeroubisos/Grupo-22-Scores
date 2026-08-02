'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { BandaMove, BandaSetup, CaptainState, MomentOutcome } from '@/features/captain';
import { bandaMoveAt, bandaSpaceCost } from '@/features/captain';
import styles from './capitan.module.css';

/**
 * LA BANDA — la corrida por la orilla.
 *
 * Vienen de a uno. Una barra dice cuánto falta para que te llegue el que tenés
 * enfrente, y abajo hay tres botones. El de arriba de todo —los metros que te
 * quedan hasta la cal— es el que convierte esto en una decisión y no en una
 * prueba de dedos: podés resolverlos a todos de lejos, pero no te va a alcanzar
 * la cancha.
 *
 * ── Qué decide esta pantalla y qué no ──
 * Nada, como todas. Los defensores, la cancha, las franjas de cada verbo y el
 * tirón muscular ya venían sorteados en el Setup y viajaron al guardado. Acá se
 * anota QUÉ hizo el jugador y A QUÉ DISTANCIA, en crudo, y se manda. La
 * clasificación es del motor.
 *
 * `bandaMoveAt` y `bandaSpaceCost` se importan del motor y no se reescriben acá:
 * la pantalla tiene que dibujar la misma cuenta que después va a resolver, o le
 * estaría mintiendo al jugador mientras decide.
 *
 * ── Determinismo ──
 * `requestAnimationFrame` acá está bien: esto es la pantalla. Lo que sale de
 * acá es una entrada del jugador, igual que apretar un botón.
 */

/** Cuánto se espera antes de cerrar, para que el desenlace se lea. */
const CIERRE_MS = 1500;

const VERBOS: Array<{ move: BandaMove; label: string; hint: string }> = [
    { move: 'amague', label: 'Amagar', hint: 'De lejos. Seguro, pero te abre y te come la cancha.' },
    { move: 'ritmo', label: 'Cambiar el ritmo', hint: 'A media distancia. El término medio.' },
    { move: 'atropellar', label: 'Atropellar', hint: 'Solo encima. No cuesta cancha, cuesta cuerpo.' },
];

type Fin = 'try' | 'tackle' | 'cal';

export default function BandaMoment({
    state,
    onResolve,
}: {
    state: CaptainState;
    onResolve: (outcome: MomentOutcome) => void;
}) {
    const moment = state.pendingMoment!;
    const setup = moment.setup as BandaSetup;

    /** Lo que el jugador hizo, en crudo. Es exactamente lo que se manda. */
    const [moves, setMoves] = useState<{ move: BandaMove; at: number }[]>([]);
    /** Cuántos quebró de verdad. No es `moves.length`: el último puede ser el fallido. */
    const [broken, setBroken] = useState(0);
    const [remaining, setRemaining] = useState(setup.space);
    const [fin, setFin] = useState<Fin | null>(null);

    /** Cuán cerca está el que viene, de 0 a 1. */
    const [at, setAt] = useState(0);
    const raf = useRef<number | null>(null);
    const arranque = useRef<number | null>(null);

    // El defensor se acerca. Si llega a 1 sin que hagas nada, te bajó: no hacer
    // nada ES una respuesta, y en el rugby es la más cara.
    useEffect(() => {
        if (fin !== null) return;
        arranque.current = null;

        const tick = (now: number) => {
            if (arranque.current === null) arranque.current = now;
            const t = (now - arranque.current) / setup.closeMs;
            if (t >= 1) { setAt(1); setFin('tackle'); return; }
            setAt(t);
            raf.current = requestAnimationFrame(tick);
        };

        raf.current = requestAnimationFrame(tick);
        return () => { if (raf.current !== null) cancelAnimationFrame(raf.current); };
    }, [fin, setup.closeMs, broken]);

    const jugar = useCallback((move: BandaMove) => {
        if (fin !== null) return;

        // Se anota SIEMPRE, salga bien o mal: la pantalla reporta lo que hizo.
        const jugada = { move, at };
        const siguientes = [...moves, jugada];
        setMoves(siguientes);

        if (bandaMoveAt(at, setup) !== move) { setFin('tackle'); return; }

        const quebrados = broken + 1;
        const queda = remaining - bandaSpaceCost(move);
        setBroken(quebrados);
        setRemaining(queda);
        setAt(0);

        if (queda < 0) { setFin('cal'); return; }
        if (quebrados >= setup.defenders) { setFin('try'); return; }
    }, [fin, at, moves, broken, remaining, setup]);

    useEffect(() => {
        if (fin === null) return;
        const id = setTimeout(() => onResolve({ kind: 'banda', moves }), CIERRE_MS);
        return () => clearTimeout(id);
    }, [fin, moves, onResolve]);

    const contexto = moment.scoreDelta === 0
        ? 'Están empatados.'
        : moment.scoreDelta > 0
            ? `Están ${moment.scoreDelta} arriba.`
            : `Están ${Math.abs(moment.scoreDelta)} abajo.`;

    const pct = (n: number) => `${(Math.max(0, Math.min(1, n)) * 100).toFixed(2)}%`;
    const faltan = setup.defenders - broken;

    return (
        <div className={styles.card}>
            <span className={styles.eyebrow}>Minuto {moment.minute} · el momento</span>
            <h2 className={styles.cardTitle}>La tenés y hay campo</h2>
            <p className={styles.cardText}>
                {contexto} Te queda la orilla y vienen {setup.defenders} a cerrarte, uno atrás del
                otro. Cada uno que quebrás te empuja un poco más afuera, y la cal no perdona: pisarla
                termina la jugada — aunque los metros que corriste queden.
            </p>

            {/* LA CANCHA QUE TE QUEDA. Va arriba de todo porque es el dato con el
                que se decide, no un marcador de lo que pasó. */}
            <div className={styles.bandaSpace}>
                <span className={styles.bandaSpaceLabel}>
                    {remaining > 0 ? `${remaining} metros hasta la cal` : 'Estás pisando la raya'}
                </span>
                <span className={styles.bandaSpaceTrack} aria-hidden="true">
                    <span
                        className={styles.bandaSpaceFill}
                        style={{ width: pct(remaining / setup.space) }}
                    />
                </span>
            </div>

            <div className={styles.bandaTally} aria-hidden="true">
                {Array.from({ length: setup.defenders }, (_, i) => (
                    <span
                        key={i}
                        className={`${styles.bandaMark} ${i < broken ? styles.bandaMarkBroken : ''}`}
                    />
                ))}
            </div>

            <p className={styles.anclaState} aria-live="polite">
                {fin === 'try' && 'Apoyaste en la bandera con la cal pegada al botín.'}
                {fin === 'tackle' && (broken === 0
                    ? 'Te leyó la intención y te bajó sin que llegaras a moverte.'
                    : `Te bajó el último. ${broken} ${broken === 1 ? 'quiebre' : 'quiebres'} y los metros son tuyos.`)}
                {fin === 'cal' && `Te quedaste sin cancha. Pisaste la cal después de romper a ${broken}.`}
                {fin === null && (broken === 0
                    ? `Te viene el primero de ${setup.defenders}.`
                    : `Rompiste a ${broken}. Te ${faltan === 1 ? 'queda uno' : `quedan ${faltan}`}.`)}
            </p>

            {fin === null && (
                <>
                    {/* El que viene. La barra llena es tenerlo encima. */}
                    <span className={styles.bandaCloser} aria-hidden="true">
                        <span className={styles.bandaCloserFill} style={{ width: pct(at) }} />
                        <span
                            className={styles.bandaCloserMark}
                            style={{ left: pct(setup.amagueEnd) }}
                        />
                        <span
                            className={styles.bandaCloserMark}
                            style={{ left: pct(setup.atropellarStart) }}
                        />
                    </span>
                    <span className={styles.barLegend}>
                        <span>Lejos</span>
                        <span>A media</span>
                        <span>Encima</span>
                    </span>

                    <div className={styles.bandaChoices}>
                        {VERBOS.map((v) => (
                            <button
                                key={v.move}
                                type="button"
                                className={styles.primary}
                                onClick={() => jugar(v.move)}
                            >
                                {v.label}
                                <span className={styles.bandaCost}>
                                    −{bandaSpaceCost(v.move)} m
                                </span>
                            </button>
                        ))}
                    </div>
                    <span className={styles.primaryHint}>
                        {VERBOS.find((v) => v.move === bandaMoveAt(at, setup))?.hint
                            ?? 'Ya lo tenés encima.'}
                    </span>
                </>
            )}

            {/* El cañón de cristal se avisa antes, no después: si el tirón
                apareciera sin anuncio, la velocidad parecería gratis. */}
            {state.player.attrs.velocidad > 85 && fin === null && (
                <p className={styles.momentWarn}>
                    Corrés más rápido de lo que el isquiotibial aguanta. Cada corrida es una ruleta.
                </p>
            )}
        </div>
    );
}
