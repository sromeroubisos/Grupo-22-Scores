'use client';

import { useEffect, useRef, type CSSProperties } from 'react';
import type { ImpactChip, ImpactTone } from '@/features/career';
import { axisLabel, chipValueIn } from '@/features/career';
import { useLocale } from './LocaleContext';
import { prefersReducedMotion } from './useCountUp';
import styles from './carrera.module.css';

/**
 * EL REVELADO DE LA DECISIÓN.
 *
 * Hasta acá el jugador elegía y la temporada aparecía resuelta. El desenlace
 * —eso que el motor guardaba en `decisionLog[].text` desde la primera versión—
 * no se mostraba en ninguna parte: se elegía a ciegas y se cobraba a ciegas.
 *
 * Esto es el momento en el medio. Sale el dado, GIRAN LOS NÚMEROS y la tarjeta se
 * ilumina en verde si el desenlace fue bueno para el jugador o en rojo si no. Es
 * la única pantalla del juego donde el azar se ve: en todas las demás el azar ya
 * pasó y sólo quedan sus consecuencias.
 *
 * Los números giran de verdad —una cinta de dígitos que frena en el que salió— y
 * no cuentan hacia arriba como el OVR de la cabecera (`useCountUp`). Son dos
 * gestos distintos a propósito: el OVR CRECE, así que contar es lo que
 * corresponde; el desenlace SE SORTEA, y un contador no dice eso.
 *
 * Con `prefers-reduced-motion` el número aparece directo y el color se queda: la
 * información no está en el movimiento, está en el signo y en el tono.
 */
export interface OutcomeRollData {
    /** Clave estable de la decisión. Fuerza el remonte entre revelados. */
    key: string;
    /** La situación que se acaba de resolver. */
    title: string;
    /** La opción que eligió el jugador. */
    option: string;
    /** Probabilidad del desenlace que salió, en porcentaje entero. */
    chance: number;
    /** Narración del desenlace. Es el texto del motor, no uno nuevo. */
    text: string;
    chips: ImpactChip[];
    tone: ImpactTone;
}

/**
 * 2100 ms es el total, y es más que el pulso de temporada (900) porque acá hay
 * una frase que leer. Se puede saltear con un toque o con Escape: a veinte
 * decisiones por carrera, cualquier animación que no se pueda cortar deja de ser
 * información y pasa a ser un peaje.
 */
const ROLL_MS = 2100;
const ROLL_REDUCED_MS = 1100;

/** Dígitos de la cinta: 0-9 tres veces. La vuelta y media que se ve girar. */
const STRIP: readonly number[] = Array.from({ length: 30 }, (_, i) => i % 10);
/** Índice desde el que se cuenta el dígito final (dos vueltas completas). */
const LANDING_BASE = 20;

const TONE_CLASS: Readonly<Record<ImpactTone, string>> = {
    good: styles.rollGood,
    bad: styles.rollBad,
    neutral: styles.rollFlat,
};

export default function OutcomeRoll({ data, onDone }: { data: OutcomeRollData; onDone: () => void }) {
    const { locale, t } = useLocale();
    const timer = useRef<number>(0);

    useEffect(() => {
        const ms = prefersReducedMotion() ? ROLL_REDUCED_MS : ROLL_MS;
        timer.current = window.setTimeout(onDone, ms);
        return () => window.clearTimeout(timer.current);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data.key]);

    // Escape cierra, igual que cualquier capa que tape la pantalla.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onDone(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data.key]);

    return (
        <div className={styles.roll} onClick={onDone} role="presentation">
            {/* El lector de pantalla recibe el desenlace UNA vez y completo: es
                información nueva, no un adorno del resultado que viene después
                (a diferencia del pulso de temporada, que sí repite). */}
            <div className={`${styles.rollCard} ${TONE_CLASS[data.tone]}`} aria-live="polite">
                <p className={styles.rollEyebrow}>
                    {data.title}
                    {data.chance < 100 && (
                        <span className={styles.rollChance}>
                            <span className={styles.srOnly}>{t.outcomeChance}</span>
                            {data.chance}%
                        </span>
                    )}
                </p>
                <p className={styles.rollOption}>{data.option}</p>

                {/* Sin fichas no va ninguna línea de relleno: el desenlace que
                    no mueve valoración ni minutos igual tiene su relato, y "sin
                    cambios" arriba de "media hinchada te hace suyo" se
                    contradice con lo que el jugador está leyendo. */}
                {data.chips.length > 0 && (
                    <ul className={styles.rollChips}>
                        {data.chips.map((chip, i) => (
                            <li
                                key={`${chip.axis}-${chip.value}`}
                                className={`${styles.rollChip} ${styles[`chip_${chip.tone}`]}`}
                                style={{ animationDelay: `${180 + i * 90}ms` }}
                            >
                                <span className={styles.rollIcon} aria-hidden="true">{chip.icon}</span>
                                <span className={styles.rollAxis}>{axisLabel(chip.axis, chip.label, locale)}</span>
                                {chip.amount !== null
                                    ? <RollNumber amount={chip.amount} decimals={chip.decimals} delayMs={180 + i * 90} />
                                    : <span className={styles.rollValue}>{chipValueIn(chip.detail, chip.value, locale)}</span>}
                            </li>
                        ))}
                    </ul>
                )}

                <p className={styles.rollText}>{data.text}</p>
            </div>
        </div>
    );
}

/**
 * El número que gira. Cada dígito es una cinta que arranca en 0 y frena en el
 * suyo, con los dígitos escalonados de izquierda a derecha — como un contador
 * mecánico, que es de donde viene el gesto.
 *
 * El signo NO gira: que aparezca de una es lo que hace que se entienda desde el
 * primer frame si la noticia es buena o mala.
 */
function RollNumber({ amount, decimals, delayMs }: { amount: number; decimals: 0 | 1; delayMs: number }) {
    const { locale, t } = useLocale();
    const reduced = prefersReducedMotion();
    const sign = amount > 0 ? '+' : '−';
    // Coma decimal en español y punto en inglés: "1,5" y "1.5" no son la misma
    // cifra para quien lee, aunque acá la ⭐ vaya casi siempre en enteros.
    const raw = Math.abs(amount).toFixed(decimals);
    const text = locale === 'es' ? raw.replace('.', ',') : raw;

    return (
        <span className={styles.rollNumber}>
            <span className={styles.rollSign} aria-hidden="true">{sign}</span>
            <span className={styles.srOnly}>{sign === '+' ? t.plusSr : t.minusSr}{text}</span>
            {[...text].map((char, i) => {
                if (char < '0' || char > '9') {
                    return <span key={i} className={styles.rollSep} aria-hidden="true">{char}</span>;
                }
                if (reduced) {
                    return <span key={i} className={styles.rollDigitStill} aria-hidden="true">{char}</span>;
                }
                const landing = LANDING_BASE + Number(char);
                return (
                    <span key={i} className={styles.rollDigit} aria-hidden="true">
                        <span
                            className={styles.rollStrip}
                            style={{
                                '--to': `-${landing}em`,
                                animationDelay: `${delayMs + i * 70}ms`,
                            } as CSSProperties}
                        >
                            {STRIP.map((digit, j) => <span key={j}>{digit}</span>)}
                        </span>
                    </span>
                );
            })}
        </span>
    );
}
