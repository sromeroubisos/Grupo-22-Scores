import { getEvent, optionPreview, type EventFamily } from '../../../../features/coach/index.ts';
import styles from './entrenador.module.css';

const FAMILY_LABEL: Record<EventFamily, string> = {
    club: 'Dirigencia',
    plantel: 'Plantel',
    cantera: 'Cantera',
    lesiones: 'Parte médico',
    prensa: 'Prensa',
    viaje: 'Logística',
};

const FAMILY_CLASS: Record<EventFamily, string> = {
    club: styles.famClub,
    plantel: styles.famPlantel,
    cantera: styles.famCantera,
    lesiones: styles.famLesiones,
    prensa: styles.famPrensa,
    viaje: styles.famViaje,
};

/**
 * La tarjeta de decisión.
 *
 * LAS PROBABILIDADES SE MUESTRAN. Cada opción lista sus desenlaces con su
 * porcentaje, y además como barra: elegir a ciegas entre dos frases no es
 * decidir. Qué desenlace es cuál no se dice —eso es el revelado—, pero cuánto
 * azar hay en cada camino, sí.
 */
export default function EventCard({
    eventId,
    step,
    total,
    onChoose,
}: {
    eventId: string;
    step: number;
    total: number;
    onChoose: (optionId: string) => void;
}) {
    const event = getEvent(eventId);
    if (!event) return null;

    return (
        <article className={styles.eventCard}>
            <div className={styles.eventHead}>
                <span className={`${styles.eventFamily} ${FAMILY_CLASS[event.family]}`}>
                    {FAMILY_LABEL[event.family]}
                </span>
                <span className={styles.eventStep}>
                    {step} / {total}
                </span>
            </div>
            <h2 className={styles.eventTitle}>{event.title}</h2>
            <p className={styles.eventText}>{event.text}</p>

            <p className={styles.optionsLead}>Qué hacés</p>
            <div className={styles.options}>
                {event.options.map((option, idx) => {
                    const odds = optionPreview(event.id, option.id);
                    const gamble = odds.length > 1;
                    return (
                        <button
                            key={option.id}
                            type="button"
                            className={styles.option}
                            onClick={() => onChoose(option.id)}
                        >
                            <span className={styles.optionIndex}>{String.fromCharCode(65 + idx)}</span>
                            <span className={styles.optionBody}>
                                <span className={styles.optionLabel}>{option.label}</span>
                                <span className={styles.optionHint}>{option.hint}</span>
                                {/* Con un solo desenlace no hay nada que sortear: mostrar
                                    "100%" sugiere un azar que no existe. */}
                                {gamble ? (
                                    <span className={styles.odds}>
                                        <span className={styles.oddsBar} aria-hidden="true">
                                            {odds.map((pct, i) => (
                                                <span key={i} className={styles.oddsSeg} style={{ width: `${pct}%` }} />
                                            ))}
                                        </span>
                                        <span className={styles.oddsText}>
                                            {odds.length === 2 ? 'Dos desenlaces' : `${odds.length} desenlaces`}:{' '}
                                            {odds.map((pct) => `${pct}%`).join(' / ')}
                                        </span>
                                    </span>
                                ) : (
                                    <span className={styles.oddsText}>Sin azar: pasa lo que dice.</span>
                                )}
                            </span>
                        </button>
                    );
                })}
            </div>
        </article>
    );
}
