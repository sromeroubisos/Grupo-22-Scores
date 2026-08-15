'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { MinigameSetup, MomentOutcome, VentanaSetup, CaptainState } from '@/features/captain';
import { ventanaGrade } from '@/features/captain';
import { MinigameShell } from './MinigameShell';
import styles from '../capitan.module.css';

/**
 * VENTANA — tocar en el momento.
 *
 * Un cursor cruza la barra y hay una franja donde la jugada sale. La franja NO
 * está en el medio: se sorteó con la semilla, así que no se puede jugar de
 * memoria mirando siempre al centro.
 *
 * ── Determinismo ──
 * `performance.now()` acá está bien: esto es la pantalla. Lo que sale es una
 * entrada del jugador, que es lo que el motor guarda.
 */
export default function VentanaScreen({
    state,
    onResolve,
}: {
    state: CaptainState;
    onResolve: (outcome: MomentOutcome) => void;
}) {
    const moment = state.pendingMoment!;
    const setup = moment.setup as MinigameSetup;
    const play = setup.play as VentanaSetup;

    const [pos, setPos] = useState(0);
    const [frozen, setFrozen] = useState<number | null>(null);
    const raf = useRef<number | null>(null);
    const started = useRef<number | null>(null);
    const posRef = useRef(0);

    // El cursor va y viene. Si el jugador no frena, después de las vueltas que
    // declara el catálogo la jugada se resuelve igual: el partido no espera.
    // Se frena en `null` y no en la última posición, porque no tocar nunca no es
    // haber tocado en un lugar: es no haber jugado, y el motor lo cobra así.
    useEffect(() => {
        if (frozen !== null) return;

        const tick = (now: number) => {
            if (started.current === null) started.current = now;
            const t = (now - started.current) / play.sweepMs;
            if (t >= play.vueltas * 2) { setFrozen(-1); return; }
            const ciclo = t % 2;
            const p = ciclo <= 1 ? ciclo : 2 - ciclo;
            posRef.current = p;
            setPos(p);
            raf.current = requestAnimationFrame(tick);
        };

        raf.current = requestAnimationFrame(tick);
        return () => { if (raf.current !== null) cancelAnimationFrame(raf.current); };
    }, [frozen, play.sweepMs, play.vueltas]);

    const tocar = useCallback(() => {
        if (frozen !== null) return;
        setFrozen(posRef.current);
    }, [frozen]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); tocar(); }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [tocar]);

    // `-1` es la marca de "no tocó nunca": se traduce a `null`, que es lo que el
    // motor entiende. Es un centinela y no un `null` en el estado porque `null`
    // ya significa "todavía se está jugando".
    const at = frozen === null ? null : frozen < 0 ? null : frozen;
    const grade = frozen === null ? null : ventanaGrade(play, at);

    useEffect(() => {
        if (frozen === null) return;
        const id = setTimeout(() => onResolve({ kind: setup.kind, play: { at } }), 1400);
        return () => clearTimeout(id);
    }, [frozen, at, onResolve, setup.kind]);

    const pct = (n: number) => `${(n * 100).toFixed(2)}%`;
    const veredicto = grade === 'clavado' ? 'Clavada en el tiempo.'
        : grade === 'logrado' ? 'Salió bien.'
            : grade === 'tibio' ? 'Rozaste el tiempo.'
                : at === null ? 'Se te pasó.' : 'Fuera de tiempo.';

    return (
        <MinigameShell moment={moment} setup={setup} grade={grade} veredicto={veredicto}>
            <button
                type="button"
                className={styles.momentZone}
                onClick={tocar}
                disabled={frozen !== null}
                aria-label={`${setup.title}: tocar cuando el cursor entre en la zona`}
            >
                <span className={styles.mgBar}>
                    <span
                        className={styles.mgBand}
                        style={{ left: pct(play.centro - play.ancho / 2), width: pct(play.ancho) }}
                    />
                    <span
                        className={`${styles.needle} ${frozen !== null ? styles.needleStopped : ''}`}
                        style={{ left: pct(frozen !== null && at !== null ? at : pos) }}
                    />
                </span>

                <span className={styles.barLegend}>
                    <span>{play.bordes[0]}</span>
                    <span>{play.zona}</span>
                    <span>{play.bordes[1]}</span>
                </span>

                <span className={styles.momentCta}>{frozen === null ? 'Tocá cuando entre' : ' '}</span>
            </button>
        </MinigameShell>
    );
}
