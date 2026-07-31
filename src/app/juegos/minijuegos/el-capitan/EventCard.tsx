'use client';

import type { CaptainEvent } from '@/features/captain';
import styles from './capitan.module.css';

/**
 * La tarjeta de decisión.
 *
 * Cada opción lista sus desenlaces con su porcentaje. Elegir a ciegas entre dos
 * frases no es decidir (CLAUDE.md §3.1), y el `hint` dice el costo y no solo el
 * beneficio.
 */
export default function EventCard({
    event,
    onChoose,
}: {
    event: CaptainEvent;
    onChoose: (optionId: string) => void;
}) {
    return (
        <div className={styles.card}>
            <span className={styles.eyebrow}>Pasan cosas</span>
            <h2 className={styles.cardTitle}>{event.title}</h2>
            <p className={styles.cardText}>{event.text}</p>

            <div className={styles.options}>
                {event.options.map((option) => (
                    <button
                        key={option.id}
                        type="button"
                        className={styles.option}
                        onClick={() => onChoose(option.id)}
                    >
                        <span className={styles.optionLabel}>{option.label}</span>
                        <span className={styles.optionHint}>{option.hint}</span>
                        {/* Con un solo desenlace no hay nada que mostrar: pasa
                            lo que dice y punto. */}
                        {option.outcomes.length > 1 && (
                            <span className={styles.odds}>
                                {option.outcomes.map((outcome, i) => (
                                    <span key={i} className={styles.odd}>{outcome.weight}%</span>
                                ))}
                            </span>
                        )}
                    </button>
                ))}
            </div>
        </div>
    );
}
