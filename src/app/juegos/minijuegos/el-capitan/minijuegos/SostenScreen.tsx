'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CaptainState, MinigameSetup, MomentOutcome, SostenSetup } from '@/features/captain';
import { sostenGrade, sostenTrack } from '@/features/captain';
import { MinigameShell } from './MinigameShell';
import styles from '../capitan.module.css';

/**
 * SOSTÉN — no soltar.
 *
 * El rival empuja tic a tic y vos corregís. La nota es cuánto tiempo estuviste
 * adentro de la banda, no cómo terminaste: aguantar ocho de diez es el scrum que
 * se movió pero no se cayó, y se ve mientras pasa.
 *
 * ── La aguja la dibuja el MOTOR ──
 * `sostenTrack` es la misma física que va a puntuar `resolve`. La pantalla no
 * simula nada por su cuenta: pide la posición después de cada tic y la dibuja.
 * Si la calculara acá, el día que se calibre el empuje habría dos físicas y una
 * de las dos estaría mintiendo.
 */
export default function SostenScreen({
    state,
    onResolve,
}: {
    state: CaptainState;
    onResolve: (outcome: MomentOutcome) => void;
}) {
    const moment = state.pendingMoment!;
    const setup = moment.setup as MinigameSetup;
    const play = setup.play as SostenSetup;

    /** Lo que el jugador tiene apretado AHORA. Se lee al cerrar cada tic. */
    const intencion = useRef(0);
    const [correcciones, setCorrecciones] = useState<number[]>([]);
    const [tic, setTic] = useState(0);
    const listo = tic >= play.empujes.length;

    useEffect(() => {
        if (listo) return;
        const id = setTimeout(() => {
            setCorrecciones((prev) => [...prev, intencion.current]);
            setTic((t) => t + 1);
        }, play.ticMs);
        return () => clearTimeout(id);
    }, [tic, listo, play.ticMs]);

    const empujar = useCallback((sentido: number) => {
        intencion.current = sentido;
    }, []);

    useEffect(() => {
        const down = (e: KeyboardEvent) => {
            if (e.code === 'ArrowLeft') { e.preventDefault(); intencion.current = -1; }
            if (e.code === 'ArrowRight') { e.preventDefault(); intencion.current = 1; }
        };
        const up = (e: KeyboardEvent) => {
            if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') intencion.current = 0;
        };
        window.addEventListener('keydown', down);
        window.addEventListener('keyup', up);
        return () => {
            window.removeEventListener('keydown', down);
            window.removeEventListener('keyup', up);
        };
    }, []);

    const track = sostenTrack(play, correcciones);
    const v = track.length > 0 ? track[track.length - 1] : 0;
    const grade = listo ? sostenGrade(play, correcciones) : null;
    const dentro = track.filter((x) => Math.abs(x) <= play.banda).length;

    useEffect(() => {
        if (!listo) return;
        const id = setTimeout(() => onResolve({ kind: setup.kind, play: { correcciones } }), 1400);
        return () => clearTimeout(id);
    }, [listo, correcciones, onResolve, setup.kind]);

    // De −1..1 a 0..1, que es como se dibuja.
    const pos = (v + 1) / 2;
    const bandaAncho = play.banda;
    const veredicto = grade === 'clavado' ? 'No te movieron.'
        : grade === 'logrado' ? 'Aguantaste.'
            : grade === 'tibio' ? 'Te fueron ganando.' : 'Te dieron vuelta.';

    return (
        <MinigameShell moment={moment} setup={setup} grade={grade} veredicto={veredicto}>
            <div className={styles.mgHold}>
                <span className={styles.mgBar}>
                    <span
                        className={styles.mgBand}
                        style={{ left: `${(0.5 - bandaAncho / 2) * 100}%`, width: `${bandaAncho * 100}%` }}
                    />
                    <span
                        className={`${styles.needle} ${Math.abs(v) <= play.banda ? styles.needleIn : styles.needleOut}`}
                        style={{ left: `${Math.max(0, Math.min(1, pos)) * 100}%` }}
                    />
                </span>

                <span className={styles.barLegend}>
                    <span>{play.bordes[0]}</span>
                    <span>{play.zona}</span>
                    <span>{play.bordes[1]}</span>
                </span>

                {/* Los tics ya jugados, uno por cuadradito: el jugador ve cuánto
                    aguantó mientras aguanta, que es de lo que se trata. */}
                <span className={styles.mgTicks} aria-hidden="true">
                    {play.empujes.map((_, i) => (
                        <span
                            key={i}
                            className={`${styles.mgTick} ${
                                i < track.length
                                    ? Math.abs(track[i]) <= play.banda ? styles.mgTickIn : styles.mgTickOut
                                    : ''
                            }`}
                        />
                    ))}
                </span>

                <div className={styles.mgPad}>
                    <button
                        type="button"
                        className={styles.mgPadBtn}
                        onPointerDown={() => empujar(-1)}
                        onPointerUp={() => empujar(0)}
                        onPointerLeave={() => empujar(0)}
                        disabled={listo}
                        aria-label={`Corregir hacia ${play.bordes[0]}`}
                    >
                        ◄
                    </button>
                    <button
                        type="button"
                        className={styles.mgPadBtn}
                        onPointerDown={() => empujar(1)}
                        onPointerUp={() => empujar(0)}
                        onPointerLeave={() => empujar(0)}
                        disabled={listo}
                        aria-label={`Corregir hacia ${play.bordes[1]}`}
                    >
                        ►
                    </button>
                </div>

                <span className={styles.momentCta}>
                    {listo ? `${dentro} de ${play.empujes.length} aguantados` : 'Mantené apretado para corregir'}
                </span>
            </div>
        </MinigameShell>
    );
}
