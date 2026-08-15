'use client';

import { useCallback, useEffect, useState } from 'react';
import type { CaptainState, MemoriaSetup, MinigameSetup, MomentOutcome } from '@/features/captain';
import { memoriaAciertos, memoriaGrade } from '@/features/captain';
import { MinigameShell } from './MinigameShell';
import styles from '../capitan.module.css';

/**
 * MEMORIA — acordarse.
 *
 * Se muestra el patrón símbolo por símbolo, desaparece, y hay que repetirlo. El
 * tiempo de exposición lo puso el margen: el que tiene la seña aprendida la lee
 * de un vistazo y el que recién llegó necesita que se la muestren.
 *
 * ── Por posición y no por presencia ──
 * Repetir los cuatro símbolos correctos en el orden equivocado es una seña
 * distinta, y en un line-out eso es la pelota del rival. La pantalla lo refleja:
 * los símbolos se van marcando en el orden en que se tocan y no se pueden
 * reordenar.
 */
export default function MemoriaScreen({
    state,
    onResolve,
}: {
    state: CaptainState;
    onResolve: (outcome: MomentOutcome) => void;
}) {
    const moment = state.pendingMoment!;
    const setup = moment.setup as MinigameSetup;
    const play = setup.play as MemoriaSetup;

    /** En qué símbolo del patrón va la muestra. Al pasarse, empieza a jugar. */
    const [mostrando, setMostrando] = useState(0);
    const [repetido, setRepetido] = useState<number[]>([]);

    const jugando = mostrando >= play.patron.length;
    const listo = repetido.length >= play.patron.length;

    useEffect(() => {
        if (jugando) return;
        const id = setTimeout(() => setMostrando((m) => m + 1), play.showMs);
        return () => clearTimeout(id);
    }, [mostrando, jugando, play.showMs]);

    const tocar = useCallback((i: number) => {
        if (!jugando || listo) return;
        setRepetido((prev) => [...prev, i]);
    }, [jugando, listo]);

    const grade = listo ? memoriaGrade(play, repetido) : null;
    const aciertos = listo ? memoriaAciertos(play.patron, repetido) : 0;

    useEffect(() => {
        if (!listo) return;
        const id = setTimeout(() => onResolve({ kind: setup.kind, play: { repetido } }), 1400);
        return () => clearTimeout(id);
    }, [listo, repetido, onResolve, setup.kind]);

    const veredicto = grade === 'clavado' ? 'Te acordaste de todo.'
        : grade === 'logrado' ? 'Casi entero.'
            : grade === 'tibio' ? 'Te quedaste con la mitad.' : 'Era otra la seña.';

    return (
        <MinigameShell moment={moment} setup={setup} grade={grade} veredicto={veredicto}>
            <p className={styles.mgEscena}>{play.escena}</p>

            {/* La muestra: un símbolo grande por vez, y después nada. */}
            <div className={styles.mgShow} aria-live="polite">
                {!jugando && (
                    <span className={styles.mgShowSymbol}>{play.simbolos[play.patron[mostrando]]}</span>
                )}
                {jugando && (
                    <span className={styles.mgShowSlots} aria-label="Lo que llevás repetido">
                        {play.patron.map((correcto, i) => (
                            <span
                                key={i}
                                className={`${styles.mgSlot} ${
                                    i < repetido.length
                                        ? repetido[i] === correcto ? styles.mgSlotOk : styles.mgSlotFail
                                        : ''
                                }`}
                            >
                                {i < repetido.length ? play.simbolos[repetido[i]] : '·'}
                            </span>
                        ))}
                    </span>
                )}
            </div>

            <div className={styles.mgSymbols} role="group" aria-label="Repetir la seña">
                {play.simbolos.map((s, i) => (
                    <button
                        key={i}
                        type="button"
                        className={styles.mgSymbol}
                        onClick={() => tocar(i)}
                        disabled={!jugando || listo}
                        aria-label={`Seña ${i + 1}`}
                    >
                        {s}
                    </button>
                ))}
            </div>

            <span className={styles.momentCta}>
                {!jugando ? 'Mirá la seña' : listo ? `${aciertos} de ${play.patron.length}` : 'Repetila'}
            </span>
        </MinigameShell>
    );
}
