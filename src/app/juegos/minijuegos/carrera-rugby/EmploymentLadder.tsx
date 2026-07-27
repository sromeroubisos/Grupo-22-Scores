'use client';

import { useState } from 'react';
import type { CareerSeasonEntry, EmploymentStatus, SquadTrack } from '@/features/career';
import { BY_EMPLOYMENT, DEVELOPMENT_TRACK, EMPLOYMENT_LABELS, EMPLOYMENT_ORDER, employmentRank } from '@/features/career';
import styles from './carrera.module.css';

/**
 * EL ESCALAFÓN DE EMPLEO, VISIBLE.
 *
 * El motor ya modelaba cuatro escalones (amateur → compensado → semipro →
 * profesional) y cada uno cambia de verdad el día a día: cuánto y qué tan bien
 * entrenás, con qué recuperación y qué cuerpo médico, y cuánto te pesa la vida
 * fuera del rugby. Hasta ahora el jugador solo veía un chip con una palabra.
 *
 * Los números salen de `BY_EMPLOYMENT` (engine/environment.ts): no se duplican
 * ni se inventan acá. Si el motor recalibra el escalafón, esta barra lo refleja
 * sola.
 */

/** Las cinco dimensiones, en lenguaje de jugador y no de planilla. */
const DIMENSIONS: {
    key: keyof typeof BY_EMPLOYMENT['amateur'];
    label: string;
    /** true = el número BAJA cuando mejora (la vida fuera del rugby pesa menos). */
    inverted?: boolean;
    note?: string;
}[] = [
    { key: 'trainingQuality', label: 'Calidad de entrenamiento' },
    { key: 'trainingLoad', label: 'Volumen de trabajo' },
    { key: 'recoverySupport', label: 'Recuperación' },
    { key: 'medicalSupport', label: 'Cuerpo médico' },
    { key: 'lifeLoad', label: 'Vida fuera del rugby', inverted: true, note: 'menos carga es mejor' },
];

/** Qué significa cada escalón, en una línea. */
const RUNG_SUMMARY: Record<EmploymentStatus, string> = {
    amateur: 'Trabajás o estudiás. Entrenás cuando el día te deja.',
    'amateur-compensated': 'El club te cubre los gastos. Seguís laburando, pero ya no ponés de tu bolsillo.',
    'semi-professional': 'Jornada partida: entrenás en serio, aunque el trabajo sigue ahí.',
    'full-time-professional': 'Dedicación completa, con toda la estructura detrás.',
};

/** Qué cambia al dar el paso. Dice el costo, no solo el beneficio. */
const STEP_COPY: Partial<Record<EmploymentStatus, string>> = {
    'amateur-compensated': 'El club empieza a cubrirte los gastos. Todavía no es un sueldo.',
    'semi-professional': 'Un vínculo parcial te libera horas. A cambio, el club te pide disponibilidad.',
    'full-time-professional': 'El rugby pasa a ser el trabajo. No hay red debajo.',
};

interface Props {
    employment: EmploymentStatus;
    squadTrack: SquadTrack;
    /** Trayectoria congelada: de acá sale si el escalón se ganó ESTA temporada. */
    history: CareerSeasonEntry[];
}

/** ¿El jugador subió de escalón en la última temporada jugada? */
function justPromoted(history: CareerSeasonEntry[]): EmploymentStatus | null {
    if (history.length < 2) return null;
    const last = history[history.length - 1];
    const previous = history[history.length - 2];
    return employmentRank(last.employment) > employmentRank(previous.employment) ? last.employment : null;
}

/** Valor 0..1 → porcentaje entero. Es lo que ve el jugador, no el decimal crudo. */
const pct = (value: number) => Math.round(value * 100);

export default function EmploymentLadder({ employment, squadTrack, history }: Props) {
    const [open, setOpen] = useState(false);

    const currentIndex = employmentRank(employment);
    const isTop = currentIndex === EMPLOYMENT_ORDER.length - 1;
    const promotedTo = justPromoted(history);
    const inAcademy = squadTrack === 'development';

    // El panel compara con el escalón SIGUIENTE. En el último no hay siguiente:
    // se muestra contra el anterior, como lo que ya se ganó.
    const compareIndex = isTop ? currentIndex - 1 : currentIndex + 1;
    const other = EMPLOYMENT_ORDER[compareIndex];
    const from = isTop ? other : employment;
    const to = isTop ? employment : other;

    return (
        <section
            className={styles.elt}
            // El key fuerza a repetir la animación cuando se gana un escalón
            // nuevo, sin timers ni estado extra.
            key={promotedTo ?? 'stable'}
            aria-labelledby="escalafon-titulo"
        >
            <h2 id="escalafon-titulo" className={styles.eltTitle}>Escalafón</h2>

            {promotedTo && (
                <p className={styles.eltPromotion} role="status">
                    <span className={styles.eltPromotionTag}>Subiste de escalón</span>
                    Ahora sos <strong>{EMPLOYMENT_LABELS[promotedTo]}</strong>. {STEP_COPY[promotedTo]}
                </p>
            )}

            <button
                type="button"
                className={styles.eltBar}
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                aria-controls="escalafon-panel"
            >
                <span className={styles.eltSteps}>
                    {EMPLOYMENT_ORDER.map((status, index) => {
                        const stateClass = index < currentIndex
                            ? styles.eltStepDone
                            : index === currentIndex ? styles.eltStepCurrent : styles.eltStepFuture;
                        return (
                            <span
                                key={status}
                                className={`${styles.eltStep} ${stateClass} ${promotedTo === status ? styles.eltStepNew : ''}`}
                            >
                                <span className={styles.eltStepDot} aria-hidden="true" />
                                <span className={styles.eltStepLabel}>{EMPLOYMENT_LABELS[status]}</span>
                            </span>
                        );
                    })}
                </span>

                <span className={styles.eltToggle}>
                    {open ? 'Ocultar' : isTop ? 'Ver qué ganaste' : 'Ver qué cambia al subir'}
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={open ? styles.chevronOpen : undefined}><path d="M6 9l6 6 6-6" /></svg>
                </span>
            </button>

            <p className={styles.eltNow}>
                {RUNG_SUMMARY[employment]}
                {inAcademy && (
                    <span className={styles.eltAcademy}>
                        Estás en la academia: entrenás como un profesional aunque tu vínculo todavía no lo sea.
                    </span>
                )}
            </p>

            <div id="escalafon-panel" className={`${styles.eltPanel} ${open ? styles.eltPanelOpen : ''}`} hidden={!open}>
                <p className={styles.eltPanelHead}>
                    <span className={styles.eltPanelFrom}>{EMPLOYMENT_LABELS[from]}</span>
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14" /><path d="M13 6l6 6-6 6" /></svg>
                    <span className={styles.eltPanelTo}>{EMPLOYMENT_LABELS[to]}</span>
                </p>
                {STEP_COPY[to] && <p className={styles.eltPanelCopy}>{STEP_COPY[to]}</p>}

                <dl className={styles.eltRows}>
                    {DIMENSIONS.map(({ key, label, inverted, note }) => {
                        const a = BY_EMPLOYMENT[from][key];
                        const b = BY_EMPLOYMENT[to][key];
                        // Barra siempre en clave "cuánto mejor es": la vida fuera
                        // del rugby se dibuja al revés porque menos carga es mejor.
                        const barA = inverted ? 1 - a : a;
                        const barB = inverted ? 1 - b : b;
                        const delta = pct(barB) - pct(barA);
                        return (
                            <div key={key} className={styles.eltRow}>
                                <dt className={styles.eltRowLabel}>
                                    {label}
                                    {note && <span className={styles.eltRowNote}>{note}</span>}
                                </dt>
                                <dd className={styles.eltRowValue}>
                                    <span className={styles.eltTrack} aria-hidden="true">
                                        <span className={styles.eltFillFrom} style={{ width: `${pct(barA)}%` }} />
                                        <span className={styles.eltFillTo} style={{ width: `${pct(barB)}%` }} />
                                    </span>
                                    <span className={`${styles.eltDelta} ${delta > 0 ? styles.eltDeltaUp : styles.eltDeltaDown} ${styles.num}`}>
                                        {delta > 0 ? '+' : ''}{delta}
                                    </span>
                                </dd>
                            </div>
                        );
                    })}
                </dl>

                {inAcademy && (
                    <p className={styles.eltPanelFoot}>
                        La academia ya te da {pct(DEVELOPMENT_TRACK.trainingQuality)} de calidad y{' '}
                        {pct(DEVELOPMENT_TRACK.trainingLoad)} de volumen, por encima de tu escalón.
                    </p>
                )}
            </div>
        </section>
    );
}
