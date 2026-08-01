'use client';

import { useCallback, useEffect, useState } from 'react';
import type { CaptainState, CodigoSetup, MomentOutcome } from '@/features/captain';
import { CODIGO_SYMBOLS } from '@/features/captain';
import styles from './capitan.module.css';

/**
 * EL CÓDIGO — la seña del line-out.
 *
 * Se muestra la seña, se tapa, y hay que repetirla. Es memoria y nada más, que
 * es exactamente lo que es un line-out: siete tipos que tienen que haber
 * entendido lo mismo en los dos segundos que la pelota tarda en salir de las
 * manos del hooker.
 *
 * ── Qué decide esta pantalla y qué no ──
 * La seña ya venía sorteada en el Setup y viajó al guardado, igual que el tiempo
 * que se muestra. Acá se dibuja y se junta lo que el jugador tocó, en orden. La
 * comparación la hace el motor: si la hiciera la pantalla, el motor no podría
 * reproducir la jugada sin el navegador.
 */

/** Los cuatro gestos. Son señas de line-out, no colores. */
const GESTOS = ['Uno', 'Dos', 'Cortita', 'Fondo'];

/** Cuánto queda encendido cada gesto al mostrar la seña. */
const BEAT_MS = 520;

type Fase = 'mostrando' | 'repitiendo' | 'listo';

export default function CodigoMoment({
    state,
    onResolve,
}: {
    state: CaptainState;
    onResolve: (outcome: MomentOutcome) => void;
}) {
    const moment = state.pendingMoment!;
    const setup = moment.setup as CodigoSetup;

    const [fase, setFase] = useState<Fase>('mostrando');
    /** Cuál de los gestos de la seña se está mostrando. -1 es ninguno. */
    const [destacado, setDestacado] = useState(-1);
    const [repetida, setRepetida] = useState<number[]>([]);

    // Se muestra la seña gesto por gesto y después se tapa. El tiempo total sale
    // del Setup: un hooker con buen lanzamiento la ve más tiempo.
    useEffect(() => {
        if (fase !== 'mostrando') return;

        const porGesto = Math.max(220, Math.min(BEAT_MS, setup.showMs / setup.call.length));
        const timers: ReturnType<typeof setTimeout>[] = [];

        setup.call.forEach((gesto, i) => {
            timers.push(setTimeout(() => setDestacado(gesto), i * porGesto));
            timers.push(setTimeout(() => setDestacado(-1), i * porGesto + porGesto * 0.65));
        });
        timers.push(setTimeout(() => setFase('repitiendo'), setup.call.length * porGesto + 260));

        return () => timers.forEach(clearTimeout);
    }, [fase, setup.call, setup.showMs]);

    const tocar = useCallback((gesto: number) => {
        if (fase !== 'repitiendo') return;
        const siguiente = [...repetida, gesto];
        setRepetida(siguiente);
        if (siguiente.length >= setup.call.length) {
            setFase('listo');
            setTimeout(() => onResolve({ kind: 'codigo', call: siguiente }), 1100);
        }
    }, [fase, repetida, setup.call.length, onResolve]);

    // Las teclas 1 a 4 también cantan la seña: un minijuego de cuatro botones no
    // puede quedar fuera del alcance de quien navega con teclado.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const n = Number(e.key);
            if (Number.isInteger(n) && n >= 1 && n <= CODIGO_SYMBOLS) { e.preventDefault(); tocar(n - 1); }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [tocar]);

    const contexto = moment.scoreDelta === 0
        ? 'Están empatados.'
        : moment.scoreDelta > 0
            ? `Están ${moment.scoreDelta} arriba.`
            : `Están ${Math.abs(moment.scoreDelta)} abajo.`;

    return (
        <div className={styles.card}>
            <span className={styles.eyebrow}>Minuto {moment.minute} · el momento</span>
            <h2 className={styles.cardTitle}>Line-out en los cinco</h2>
            <p className={styles.cardText}>
                {contexto} Line-out a favor pegado a la línea y el maul armado atrás. Mirá la seña y
                repetila: si el salto sale a destiempo, la pelota es de ellos.
            </p>

            <div className={styles.codigoProgress} aria-hidden="true">
                {setup.call.map((_, i) => (
                    <span
                        key={i}
                        className={`${styles.codigoPip} ${i < repetida.length ? styles.codigoPipDone : ''}`}
                    />
                ))}
            </div>

            <div className={styles.codigoGrid} role="group" aria-label="Repetir la seña del line-out">
                {GESTOS.slice(0, CODIGO_SYMBOLS).map((nombre, gesto) => (
                    <button
                        key={gesto}
                        type="button"
                        className={`${styles.codigoKey} ${destacado === gesto ? styles.codigoKeyOn : ''}`}
                        onClick={() => tocar(gesto)}
                        disabled={fase !== 'repitiendo'}
                        aria-label={`Seña ${nombre}, tecla ${gesto + 1}`}
                    >
                        <span className={styles.codigoKeyNum}>{gesto + 1}</span>
                        <span className={styles.codigoKeyName}>{nombre}</span>
                    </button>
                ))}
            </div>

            <p className={styles.momentCta} aria-live="polite">
                {fase === 'mostrando' && 'Mirala'}
                {fase === 'repitiendo' && 'Cantala'}
                {fase === 'listo' && 'Va la pelota'}
            </p>
        </div>
    );
}
