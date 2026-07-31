'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { confettiFor } from './confetti';
import { prefersReducedMotion } from './useCountUp';
import styles from './carrera.module.css';

/**
 * LA CAPA DE FESTEJO.
 *
 * UNA sola capa parametrizada, no una por momento. Si para agregar el debut a
 * los 18 hubiera que tocarla, es que quedó acoplada a los títulos: lo único que
 * hace falta es sumar una entrada al mapa que la arma (ver `celebrations.ts`).
 *
 * Un título es una imagen, no un párrafo: escudo grande, nombre y año. Nada más.
 *
 * De la animación, lo que importa:
 *   · sólo `transform` y `opacity` — nada de `width`, `height` ni `box-shadow`,
 *     que sacan la animación del compositor y se nota;
 *   · entrada con `ease-out` marcado y salida más corta con `ease-in`;
 *   · la escala arranca en 0.92, no en 0: algo que crece desde cero se ve
 *     barato, algo que crece desde 0.92 se ve como que ya estaba y se acercó;
 *   · interrumpible — un toque la saca desde donde esté, sin esperar nada;
 *   · con `prefers-reduced-motion` se muestra igual, sin confeti y sin
 *     transformaciones. Se muestra, no se saltea.
 */
export interface Celebration {
    /** Identidad del momento. Agregar uno nuevo es agregar una entrada acá. */
    kind: 'title' | 'first-cap' | 'promotion' | 'debut' | 'award';
    /** Clave estable del festejo: siembra el confeti. */
    key: string;
    icon: ReactNode;
    /** Lo grande: el nombre del torneo, de la selección, del escalón. */
    headline: string;
    /** La bajada: año y club, o el detalle del momento. */
    sub: string;
    /** Rótulo chico de arriba. Dice QUÉ es esto. */
    eyebrow: string;
    /** Color del momento. Pinta el confeti y el borde. */
    accent: string;
}

const VISIBLE_MS = 3000;
/** Lo que suma cada renglón extra del resumen: una lista de cinco no se lee en tres segundos. */
const EXTRA_MS = 900;
const MAX_MS = 9000;
const EXIT_MS = 220;

/**
 * Encabezado del RESUMEN: la temporada que dejó más de una cosa para festejar.
 *
 * Va como prop y no se arma acá porque el texto es traducible y la edad sale de
 * la temporada: la capa dibuja, no sabe de idiomas ni de estado.
 */
export interface CelebrationRecap {
    eyebrow: string;
    sub: string;
}

export default function CelebrationLayer({
    queue,
    seed,
    recap,
    onDone,
}: {
    queue: Celebration[];
    seed: number;
    recap?: CelebrationRecap | null;
    onDone: () => void;
}) {
    /**
     * UNA TEMPORADA ES UNA PANTALLA.
     *
     * Antes la cola se recorría de a una: si en el mismo año salías campeón con
     * el club, campeón del mundo con tu país y entrabas al XV ideal, eran tres
     * pantallas seguidas de tres segundos, y las últimas se cerraban solas antes
     * de que nadie las leyera. Ahora, cuando hay más de un motivo, van todos
     * juntos en una sola tarjeta: la temporada se cuenta de una vez.
     *
     * Con un solo motivo no cambia nada: sigue siendo la tarjeta grande de
     * siempre, que es la que le da peso al momento.
     */
    const resumen = queue.length > 1 && recap != null;
    const [leaving, setLeaving] = useState(false);
    const timers = useRef<number[]>([]);
    const current = queue[0];

    const clear = () => {
        for (const t of timers.current) window.clearTimeout(t);
        timers.current = [];
    };

    // Cierra SIN esperar a que termine nada: el jugador toca y la capa se va
    // desde donde está.
    const advance = () => {
        clear();
        setLeaving(true);
        timers.current.push(window.setTimeout(() => {
            setLeaving(false);
            onDone();
        }, EXIT_MS));
    };

    useEffect(() => {
        clear();
        if (!current) return;
        const vida = Math.min(MAX_MS, VISIBLE_MS + Math.max(0, queue.length - 1) * EXTRA_MS);
        timers.current.push(window.setTimeout(advance, vida));
        return clear;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [current?.key, queue.length]);

    if (!current) return null;

    const quieto = prefersReducedMotion();
    const pieces = quieto ? [] : confettiFor(seed, current.key, current.accent);

    return (
        <div
            className={`${styles.celebration} ${leaving ? styles.celebrationLeaving : ''}`}
            style={{ ['--accent' as string]: current.accent }}
            role="status"
            aria-live="polite"
            // Un toque en cualquier lado la saca. Es un festejo, no un diálogo:
            // no tiene nada que confirmar ni nada que perder.
            onClick={advance}
        >
            <div className={styles.celebrationSheet} aria-hidden="true">
                {pieces.map((p, i) => (
                    <span
                        key={i}
                        className={styles.confetti}
                        style={{
                            left: `${p.left}%`,
                            height: `${p.height}px`,
                            background: p.color,
                            animationDelay: `${p.delay}ms`,
                            animationDuration: `${p.duration}ms`,
                            ['--spin' as string]: `${p.spin}deg`,
                            ['--drift' as string]: `${p.drift}%`,
                        }}
                    />
                ))}
            </div>

            {resumen ? (
                <div className={`${styles.celebrationCard} ${styles.celebrationCardRecap}`}>
                    <span className={styles.celebrationEyebrow}>{recap.eyebrow}</span>
                    <p className={styles.celebrationHeadline}>{recap.sub}</p>
                    <ul className={styles.celebrationList}>
                        {queue.map((c) => (
                            <li key={c.key} className={styles.celebrationRow} style={{ ['--accent' as string]: c.accent }}>
                                <span className={styles.celebrationRowIcon}>{c.icon}</span>
                                <span className={styles.celebrationRowText}>
                                    <span className={styles.celebrationRowEyebrow}>{c.eyebrow}</span>
                                    <span className={styles.celebrationRowHeadline}>{c.headline}</span>
                                    <span className={styles.celebrationRowSub}>{c.sub}</span>
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            ) : (
                <div className={styles.celebrationCard}>
                    <span className={styles.celebrationEyebrow}>{current.eyebrow}</span>
                    <span className={styles.celebrationIcon}>{current.icon}</span>
                    <p className={styles.celebrationHeadline}>{current.headline}</p>
                    <p className={styles.celebrationSub}>{current.sub}</p>
                </div>
            )}
        </div>
    );
}
