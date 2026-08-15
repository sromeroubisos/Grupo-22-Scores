'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CaptainState, MinigameSetup, MomentOutcome, PunteriaSetup } from '@/features/captain';
import { punteriaGrade, punteriaLanding } from '@/features/captain';
import { MinigameShell } from './MinigameShell';
import styles from '../capitan.module.css';

/**
 * PUNTERÍA — apuntar contra algo que no se ve.
 *
 * Una mira que va y viene, el blanco dibujado en el medio, y una señal arriba que
 * dice para dónde se va a correr la pelota. Apuntar al medio es errarle.
 *
 * ── Lo que esta pantalla NO dibuja ──
 * `punteriaPerfectAim`. Existe en el motor y es la respuesta del minijuego:
 * dibujarla sería resolvérselo al jugador. Hay un test que lo verifica, igual
 * que en Los Palos.
 *
 * La señal se muestra como una FLECHA con opacidad proporcional, nunca como un
 * número. Leerla es la mitad del juego.
 */
export default function PunteriaScreen({
    state,
    onResolve,
}: {
    state: CaptainState;
    onResolve: (outcome: MomentOutcome) => void;
}) {
    const moment = state.pendingMoment!;
    const setup = moment.setup as MinigameSetup;
    const play = setup.play as PunteriaSetup;

    const [pos, setPos] = useState(0.5);
    const [frozen, setFrozen] = useState<number | null>(null);
    const raf = useRef<number | null>(null);
    const started = useRef<number | null>(null);
    const posRef = useRef(0.5);

    useEffect(() => {
        if (frozen !== null) return;

        const tick = (now: number) => {
            if (started.current === null) started.current = now;
            const t = (now - started.current) / play.sweepMs;
            // A la tercera pasada sale igual: el referee no espera para siempre.
            if (t >= 3) { setFrozen(posRef.current); return; }
            const ciclo = t % 2;
            const p = ciclo <= 1 ? ciclo : 2 - ciclo;
            posRef.current = p;
            setPos(p);
            raf.current = requestAnimationFrame(tick);
        };

        raf.current = requestAnimationFrame(tick);
        return () => { if (raf.current !== null) cancelAnimationFrame(raf.current); };
    }, [frozen, play.sweepMs]);

    const soltar = useCallback(() => {
        if (frozen !== null) return;
        setFrozen(posRef.current);
    }, [frozen]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); soltar(); }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [soltar]);

    // De 0..1 a −1..1, que es como habla el motor.
    const aim = frozen === null ? 0 : frozen * 2 - 1;
    const landing = frozen === null ? 0 : punteriaLanding(aim, play.desvio);
    const grade = frozen === null ? null : punteriaGrade(play, aim);

    useEffect(() => {
        if (frozen === null) return;
        const id = setTimeout(() => onResolve({ kind: setup.kind, play: { aim } }), 1500);
        return () => clearTimeout(id);
    }, [frozen, aim, onResolve, setup.kind]);

    const pct = (n: number) => `${(n * 100).toFixed(2)}%`;
    const fuerza = Math.abs(play.desvio);
    const cuanto = fuerza < 0.12 ? 'casi no corre'
        : fuerza < 0.32 ? 'corre poco' : fuerza < 0.5 ? 'corre bastante' : 'corre mucho';

    const veredicto = grade === 'clavado' ? 'La pusiste justo.'
        : grade === 'logrado' ? 'Llegó donde tenía que llegar.'
            : grade === 'tibio' ? 'Se fue por poco.' : 'La leíste mal.';

    return (
        <MinigameShell moment={moment} setup={setup} grade={grade} veredicto={veredicto}>
            <div
                className={styles.mgSignal}
                aria-label={`${play.senal}: ${cuanto}, hacia la ${play.desvio < 0 ? 'izquierda' : 'derecha'}`}
            >
                <span className={styles.mgSignalLabel}>{play.senal} · {cuanto}</span>
                <span
                    className={styles.palosFlag}
                    style={{ transform: `scaleX(${play.desvio < 0 ? -1 : 1})`, opacity: 0.35 + fuerza * 0.65 }}
                    aria-hidden="true"
                >
                    ➤
                </span>
            </div>

            <button
                type="button"
                className={styles.momentZone}
                onClick={soltar}
                disabled={frozen !== null}
                aria-label={`${setup.title}: apuntar`}
            >
                <span className={styles.mgBar}>
                    {/* El blanco está dibujado en el medio porque en la cancha
                        está en el medio: lo que se mueve es la pelota, no el
                        blanco. */}
                    <span
                        className={styles.mgBand}
                        style={{ left: pct(0.5 - play.tolerancia / 2), width: pct(play.tolerancia) }}
                    />
                    <span
                        className={`${styles.needle} ${frozen !== null ? styles.needleStopped : ''}`}
                        style={{ left: pct(frozen ?? pos) }}
                    />
                    {frozen !== null && (
                        <span
                            className={`${styles.palosBall} ${grade === 'clavado' || grade === 'logrado' ? styles.palosBallIn : styles.palosBallOut}`}
                            style={{ left: pct(Math.max(0, Math.min(1, (landing + 1) / 2))) }}
                        />
                    )}
                </span>

                <span className={styles.barLegend}>
                    <span>{play.bordes[0]}</span>
                    <span>{play.zona}</span>
                    <span>{play.bordes[1]}</span>
                </span>

                <span className={styles.momentCta}>{frozen === null ? 'Tocá para soltar' : ' '}</span>
            </button>
        </MinigameShell>
    );
}
