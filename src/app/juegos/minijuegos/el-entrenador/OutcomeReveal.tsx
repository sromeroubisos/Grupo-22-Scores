import {
    formatMoney,
    revealTone,
    type ImpactChip,
    type PendingReveal,
} from '../../../../features/coach/index.ts';
import styles from './entrenador.module.css';

const TONE_CLASS = {
    good: styles.revealGood,
    bad: styles.revealBad,
    neutral: styles.revealNeutral,
} as const;

const TONE_TEXT = {
    good: 'Salió bien',
    bad: 'Salió caro',
    neutral: 'Así fue',
} as const;

const CHIP_CLASS = {
    good: styles.chipGood,
    bad: styles.chipBad,
    neutral: styles.chipNeutral,
} as const;

const CHIP_HINT: Record<ImpactChip['key'], string> = {
    plantel: 'fuerza del XV',
    caja: 'pesos en la caja',
    grupo: 'cohesión del vestuario',
    estructura: 'canchas, sede, gimnasio',
    hinchada: 'cuánto acompaña la gente',
    presion: 'sobre vos',
};

function chipValue(chip: ImpactChip): string {
    if (chip.unit === 'money') {
        return `${chip.delta > 0 ? '+' : ''}${formatMoney(chip.delta)}`;
    }
    const value = chip.delta > 0 ? `+${chip.delta}` : `${chip.delta}`;
    return chip.unit === 'pct' ? `${value}%` : value;
}

/**
 * El desenlace. Los chips salen de RESTAR estados, así que dicen lo que de
 * verdad pasó aunque el motor haya recortado el efecto por un techo.
 *
 * El "Continuar" es visualmente distinto de los botones de decisión: acá el
 * jugador no elige nada, solo lee lo que pasó.
 */
export default function OutcomeReveal({
    reveal,
    decisionsLeft,
    onContinue,
}: {
    reveal: PendingReveal;
    /** Las que quedan CONTANDO esta: al continuar se descuenta. */
    decisionsLeft: number;
    onContinue: () => void;
}) {
    const tone = revealTone(reveal.chips);
    const remaining = decisionsLeft - 1;

    return (
        <article className={`${styles.reveal} ${TONE_CLASS[tone]}`}>
            <div className={styles.eventHead}>
                <span className={styles.eventFamily}>{reveal.title}</span>
                <span className={`${styles.revealTone} ${CHIP_CLASS[tone]}`}>{TONE_TEXT[tone]}</span>
            </div>
            <p className={styles.revealText}>{reveal.text}</p>

            {reveal.chips.length > 0 ? (
                <div className={styles.chips}>
                    {reveal.chips.map((chip, i) => (
                        <span
                            key={chip.key}
                            className={`${styles.chip} ${styles.chipIn}`}
                            style={{ animationDelay: `${i * 90}ms` }}
                        >
                            <span className={`${styles.chipValue} ${CHIP_CLASS[chip.tone]}`}>{chipValue(chip)}</span>
                            <span className={styles.chipLabel}>{chip.label}</span>
                            <span className={styles.chipHint}>{CHIP_HINT[chip.key]}</span>
                        </span>
                    ))}
                </div>
            ) : (
                <p className={styles.objectiveNote}>No movió ningún número. A veces pasa.</p>
            )}

            <div className={styles.actionBar}>
                <button type="button" className={styles.continueBtn} onClick={onContinue}>
                    {remaining > 0
                        ? `Siguiente decisión (${remaining === 1 ? 'queda una' : `quedan ${remaining}`})`
                        : 'A la semana de entrenamiento'}
                </button>
            </div>
        </article>
    );
}
