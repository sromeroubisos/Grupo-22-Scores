'use client';

import { useState } from 'react';
import { REPLY_TEXT, patienceWord, type Negotiation } from '../../../../features/coach/index.ts';
import styles from './entrenador.module.css';

/**
 * El minijuego 3, la negociación, como componente propio: lo usan la
 * compensación por un jugador, la renovación de un vínculo y la incorporación, y
 * lo va a usar la etapa 5 con los sponsors. Muestra la última cifra del rival,
 * las rondas con su reacción en palabras y la paciencia que le queda. La
 * reserva del rival NO llega a esta pantalla: el componente no la lee nunca.
 *
 * `format` escribe una cifra en la unidad de la negociación (pesos, o el
 * porcentaje del viático de la división donde no se habla en pesos).
 */
export default function NegotiationPanel({
    neg,
    format,
    onOffer,
    onAcceptCounter,
    onWalkAway,
}: {
    neg: Negotiation;
    format: (value: number) => string;
    onOffer: (value: number) => void;
    onAcceptCounter: () => void;
    onWalkAway: () => void;
}) {
    // La primera propuesta sugerida: del lado del club, un paso más allá de lo
    // que ofrece el rival. El jugador la mueve como quiera.
    const firstGuess = neg.side === 'venta' ? Math.round((neg.counter * 1.3) / neg.step) * neg.step : Math.round((neg.counter * 0.8) / neg.step) * neg.step;
    const [value, setValue] = useState<number>(firstGuess);
    const bump = neg.unit === 'pesos' ? neg.step * (neg.step >= 50_000 ? 2 : 10) : neg.step * 5;
    const inputId = `neg-${neg.subject.length}-${neg.anchor}`;
    const valid = Number.isFinite(value) && value > 0;

    return (
        <section className={styles.negotiation} aria-label={`Negociación: ${neg.subject}`}>
            <p className={styles.panelTitle}>Negociación · {neg.subject}</p>
            <p className={styles.objectiveNote}>
                {neg.side === 'venta'
                    ? 'Ellos pagan: pedí más de lo que ofrecen, pero sin pasarte. Si se cansan, se levantan y la venta se cae.'
                    : 'Ellos piden: ofrecé menos de lo que piden, pero sin pasarte. Si se cansan, se levantan y no hay acuerdo.'}
            </p>

            <div className={styles.negBoard}>
                <span className={styles.ledgerItem}>
                    <span className={styles.ledgerLabel}>Lo último de ellos</span>
                    <span className={styles.ledgerValue}>{format(neg.counter)}</span>
                    <span className={styles.ledgerHint}>{neg.side === 'venta' ? 'lo que ponen hoy' : 'lo que piden hoy'}</span>
                </span>
                <span className={styles.ledgerItem}>
                    <span className={styles.ledgerLabel}>Paciencia</span>
                    <span
                        className={styles.patienceDots}
                        role="img"
                        aria-label={`Les queda paciencia para ${neg.patience} de ${neg.maxPatience}`}
                    >
                        {Array.from({ length: neg.maxPatience }, (_, i) => (
                            <span key={i} className={`${styles.patienceDot} ${i < neg.patience ? styles.patienceDotOn : ''}`} />
                        ))}
                    </span>
                    <span className={styles.ledgerHint}>{patienceWord(neg)}</span>
                </span>
            </div>

            {neg.rounds.length > 0 && (
                <ol className={styles.negRounds} aria-label="Las rondas">
                    {neg.rounds.map((r, i) => (
                        <li key={i}>
                            <span className={styles.negOffer}>Propusiste {format(r.offer)}.</span>{' '}
                            <span className={styles.negReply}>{REPLY_TEXT[r.reply]}</span>
                            {r.counter !== null && <> Contestan {format(r.counter)}.</>}
                        </li>
                    ))}
                </ol>
            )}

            <div className={styles.negControls}>
                <label htmlFor={inputId} className={styles.negLabel}>
                    Tu propuesta
                </label>
                <div className={styles.negStepper}>
                    <button
                        type="button"
                        className={styles.ghost}
                        aria-label="Bajar la propuesta"
                        onClick={() => setValue((v) => Math.max(neg.step, v - bump))}
                    >
                        −
                    </button>
                    <input
                        id={inputId}
                        className={styles.negInput}
                        type="number"
                        inputMode="numeric"
                        min={neg.step}
                        step={neg.step}
                        value={Number.isFinite(value) ? value : ''}
                        onChange={(e) => setValue(Number(e.target.value))}
                    />
                    <button
                        type="button"
                        className={styles.ghost}
                        aria-label="Subir la propuesta"
                        onClick={() => setValue((v) => v + bump)}
                    >
                        +
                    </button>
                </div>
                <span className={styles.ledgerHint}>{valid ? format(value) : 'Poné una cifra para proponer.'}</span>
            </div>

            <div className={styles.marketActions}>
                <button type="button" className={styles.upgradeBuy} disabled={!valid} onClick={() => onOffer(value)}>
                    Proponer
                </button>
                <button type="button" className={styles.upgradeBuy} onClick={onAcceptCounter}>
                    Aceptar lo de ellos ({format(neg.counter)})
                </button>
                <button type="button" className={styles.ghost} onClick={onWalkAway}>
                    Levantarse de la mesa
                </button>
            </div>
            {!valid && <p className={styles.disabledNote}>Para proponer hace falta una cifra mayor que cero.</p>}
        </section>
    );
}
