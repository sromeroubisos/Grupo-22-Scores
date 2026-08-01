'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CaptainState, MomentOutcome, PalosSetup } from '@/features/captain';
import { palosGrade, palosLanding } from '@/features/captain';
import styles from './capitan.module.css';

/**
 * LOS PALOS — la patada que decide.
 *
 * Una barra de puntería que va y viene, los palos dibujados en el medio, y una
 * bandera arriba que dice para dónde sopla. La diferencia con la barra del
 * tackle es toda la gracia: allá se frena SOBRE el blanco, acá el blanco no está
 * donde se ve. El viento corre la pelota después de que salió, así que frenar en
 * el medio es errarle.
 *
 * ── Qué decide esta pantalla y qué no ──
 * El viento, la distancia, el ángulo y la tolerancia ya venían en el Setup y
 * viajaron al guardado. Acá se mide dónde frenó el jugador y se manda en crudo.
 * `palosLanding` y `palosGrade` son del motor: la pantalla los usa para DIBUJAR
 * lo que pasó, no para decidirlo.
 *
 * ── Determinismo ──
 * `performance.now()` acá está bien: esto es la pantalla. Lo que sale es una
 * entrada del jugador.
 */

/** Cuánto tarda la barra en cruzar. Más presión, más rápido. */
const SWEEP_BASE_MS = 1500;
const SWEEP_PRESSURE_MS = 560;

export default function PalosMoment({
    state,
    onResolve,
}: {
    state: CaptainState;
    onResolve: (outcome: MomentOutcome) => void;
}) {
    const moment = state.pendingMoment!;
    const setup = moment.setup as PalosSetup;

    const sweepMs = Math.round(SWEEP_BASE_MS - moment.pressure * SWEEP_PRESSURE_MS);

    /** Posición de la mira, de 0 a 1. El centro de los palos es 0,5. */
    const [pos, setPos] = useState(0.5);
    const [frozen, setFrozen] = useState<number | null>(null);
    const raf = useRef<number | null>(null);
    const started = useRef<number | null>(null);

    // La mira va y viene. Si el jugador no frena, en la tercera pasada patea
    // igual: el referee no espera para siempre.
    useEffect(() => {
        if (frozen !== null) return;

        const tick = (now: number) => {
            if (started.current === null) started.current = now;
            const t = (now - started.current) / sweepMs;
            if (t >= 3) { setFrozen(pos); return; }
            const ciclo = t % 2;
            setPos(ciclo <= 1 ? ciclo : 2 - ciclo);
            raf.current = requestAnimationFrame(tick);
        };

        raf.current = requestAnimationFrame(tick);
        return () => { if (raf.current !== null) cancelAnimationFrame(raf.current); };
    }, [frozen, sweepMs, pos]);

    const patear = useCallback(() => {
        if (frozen !== null) return;
        setFrozen(pos);
    }, [frozen, pos]);

    // De 0..1 a −1..1, que es como habla el motor.
    const aim = frozen === null ? 0 : frozen * 2 - 1;
    const landing = frozen === null ? 0 : palosLanding(aim, setup.wind);
    const grade = frozen === null ? null : palosGrade(landing, setup.tolerance);

    useEffect(() => {
        if (frozen === null) return;
        const id = setTimeout(() => onResolve({ kind: 'palos', aim }), 1500);
        return () => clearTimeout(id);
    }, [frozen, aim, onResolve]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); patear(); }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [patear]);

    const pct = (n: number) => `${(n * 100).toFixed(2)}%`;
    // La zona de palos, dibujada en coordenadas de la barra (0..1).
    const anchoPalos = setup.tolerance;
    const fuerza = Math.abs(setup.wind);
    const viento = fuerza < 0.15 ? 'sin viento'
        : fuerza < 0.5 ? 'viento liviano'
            : fuerza < 0.8 ? 'viento cruzado' : 'viento fuerte';

    const contexto = moment.scoreDelta === 0
        ? 'Están empatados.'
        : moment.scoreDelta > 0
            ? `Están ${moment.scoreDelta} arriba.`
            : `Están ${Math.abs(moment.scoreDelta)} abajo.`;

    return (
        <div className={styles.card}>
            <span className={styles.eyebrow}>Minuto {moment.minute} · el momento</span>
            <h2 className={styles.cardTitle}>Penal a {setup.distance} metros</h2>
            <p className={styles.cardText}>
                {contexto} Levantás el tee y la cancha se calla. Hay {viento} arriba de los palos:
                si apuntás al medio, la pelota no va a terminar en el medio.
            </p>

            <div className={styles.palosWind} aria-label={`Viento: ${viento}, hacia la ${setup.wind < 0 ? 'izquierda' : 'derecha'}`}>
                <span className={styles.palosWindLabel}>{viento}</span>
                <span
                    className={styles.palosFlag}
                    style={{ transform: `scaleX(${setup.wind < 0 ? -1 : 1})`, opacity: 0.35 + fuerza * 0.65 }}
                    aria-hidden="true"
                >
                    ➤
                </span>
            </div>

            <button
                type="button"
                className={styles.momentZone}
                onClick={patear}
                disabled={frozen !== null}
                aria-label="Patear a los palos"
            >
                <span className={styles.palosBar}>
                    {/* Los palos: dónde entra. Está dibujado en el medio porque es
                        donde está en la cancha — el viento no mueve los palos. */}
                    <span
                        className={styles.palosTarget}
                        style={{ left: pct(0.5 - anchoPalos / 2), width: pct(anchoPalos) }}
                    />
                    <span
                        className={`${styles.needle} ${frozen !== null ? styles.needleStopped : ''}`}
                        style={{ left: pct(frozen ?? pos) }}
                    />
                    {/* Dónde terminó de verdad, una vez que el viento hizo lo suyo. */}
                    {frozen !== null && (
                        <span
                            className={`${styles.palosBall} ${grade === 'adentro' ? styles.palosBallIn : styles.palosBallOut}`}
                            style={{ left: pct(Math.max(0, Math.min(1, (landing + 1) / 2))) }}
                        />
                    )}
                </span>

                <span className={styles.barLegend}>
                    <span>Izquierda</span>
                    <span>Palos</span>
                    <span>Derecha</span>
                </span>

                <span className={styles.momentCta}>
                    {frozen === null ? 'Tocá para patear' : ' '}
                </span>
            </button>

            {grade && (
                <p className={`${styles.momentVerdict} ${grade === 'adentro' ? styles.verdictGood : styles.verdictBad}`}>
                    {grade === 'adentro' && 'Adentro. La leíste bien.'}
                    {grade === 'palo' && 'Pegó en el palo y salió.'}
                    {grade === 'afuera' && 'El viento se la llevó.'}
                </p>
            )}
        </div>
    );
}
