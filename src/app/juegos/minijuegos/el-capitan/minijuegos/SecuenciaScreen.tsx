'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CaptainState, MinigameSetup, MomentOutcome, SecuenciaSetup } from '@/features/captain';
import { secuenciaAciertos, secuenciaGrade } from '@/features/captain';
import { MinigameShell } from './MinigameShell';
import styles from '../capitan.module.css';

/**
 * SECUENCIA — hacer los pasos en orden.
 *
 * Los pasos caen a intervalos fijos y cada uno tiene su ventana. Un paso que se
 * pasa no se recupera: la coreografía sigue sin vos, que es como se rompen los
 * line-outs de verdad.
 *
 * ── Qué se manda al motor ──
 * EL DESVÍO EN MILISEGUNDOS de cada paso, con signo, y `null` para el que no se
 * tocó. En crudo: si la pantalla mandara "acerté tres de cuatro", la
 * clasificación viviría en React y el motor no podría reproducir la jugada.
 */
export default function SecuenciaScreen({
    state,
    onResolve,
}: {
    state: CaptainState;
    onResolve: (outcome: MomentOutcome) => void;
}) {
    const moment = state.pendingMoment!;
    const setup = moment.setup as MinigameSetup;
    const play = setup.play as SecuenciaSetup;

    const [paso, setPaso] = useState(0);
    const [desvios, setDesvios] = useState<(number | null)[]>([]);
    const inicio = useRef<number | null>(null);
    const tocado = useRef(false);

    // El reloj de la coreografía arranca en un efecto y no en el render:
    // `performance.now()` es impura y devolvería un cero distinto cada vez que
    // React vuelva a renderizar, con lo cual el desvío de cada paso —que es toda
    // la mano que se le manda al motor— se mediría contra un origen que se mueve.
    useEffect(() => {
        if (inicio.current === null) inicio.current = performance.now();
    }, []);

    const listo = paso >= play.pasos.length;

    // Cada paso vive `pasoMs`. Al cerrarse, si nadie tocó, entra `null`.
    useEffect(() => {
        if (listo) return;
        tocado.current = false;
        const id = setTimeout(() => {
            setDesvios((prev) => (prev.length > paso ? prev : [...prev, null]));
            setPaso((p) => p + 1);
        }, play.pasoMs);
        return () => clearTimeout(id);
    }, [paso, listo, play.pasoMs]);

    const tocar = useCallback(() => {
        if (listo || tocado.current) return;
        tocado.current = true;
        const ahora = performance.now();
        // El momento ideal de cada paso es el CENTRO de su intervalo. El desvío
        // es cuánto te corriste de ahí, con signo: negativo es adelantarse.
        const ideal = (inicio.current ?? ahora) + play.pasoMs * paso + play.pasoMs / 2;
        setDesvios((prev) => [...prev, Math.round(ahora - ideal)]);
        setPaso((p) => p + 1);
    }, [listo, paso, play.pasoMs]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); tocar(); }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [tocar]);

    const grade = listo ? secuenciaGrade(play, desvios) : null;
    const aciertos = listo ? secuenciaAciertos(play, desvios) : 0;

    useEffect(() => {
        if (!listo) return;
        const id = setTimeout(() => onResolve({ kind: setup.kind, play: { desvios } }), 1400);
        return () => clearTimeout(id);
    }, [listo, desvios, onResolve, setup.kind]);

    const salio = (i: number) => {
        const d = desvios[i];
        return d !== null && d !== undefined && Math.abs(d) <= play.ventanaMs;
    };

    const veredicto = grade === 'clavado' ? 'Los cuatro tiempos, clavados.'
        : grade === 'logrado' ? 'Salió.'
            : grade === 'tibio' ? 'Se rompió a la mitad.' : 'No salió.';

    return (
        <MinigameShell moment={moment} setup={setup} grade={grade} veredicto={veredicto}>
            <div className={styles.mgSteps} aria-label={`Pasos: ${play.pasos.join(', ')}`}>
                {play.pasos.map((nombre, i) => (
                    <span
                        key={i}
                        className={`${styles.mgStep} ${i === paso ? styles.mgStepNow : ''} ${
                            i < desvios.length ? (salio(i) ? styles.mgStepOk : styles.mgStepFail) : ''
                        }`}
                    >
                        {nombre}
                    </span>
                ))}
            </div>

            <button
                type="button"
                className={styles.momentZone}
                onClick={tocar}
                disabled={listo}
                aria-label={`${setup.title}: tocar en cada paso`}
            >
                <span className={styles.mgStepBig}>
                    {listo ? `${aciertos} de ${play.pasos.length}` : play.pasos[paso]}
                </span>
                <span className={styles.momentCta}>{listo ? ' ' : 'Tocá en el tiempo de cada paso'}</span>
            </button>
        </MinigameShell>
    );
}
