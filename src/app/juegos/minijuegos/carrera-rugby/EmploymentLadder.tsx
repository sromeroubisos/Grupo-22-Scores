'use client';

import { useState } from 'react';
import type { CareerSeasonEntry, EmploymentStatus, Locale, SquadTrack } from '@/features/career';
import {
    BY_EMPLOYMENT, DEVELOPMENT_TRACK, EMPLOYMENT_LABELS, EMPLOYMENT_ORDER, employmentLabel,
    employmentRank, RUNG_SUMMARY_EN, STEP_COPY_EN,
} from '@/features/career';
import { useLocale } from './LocaleContext';
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

// Las CINCO DIMENSIONES viven en `i18n/ui.ts` (`t.dimensions`): son rótulos de
// pantalla, no datos del motor. Los números siguen saliendo de `BY_EMPLOYMENT`.

/** Qué significa cada escalón, en una línea. El inglés está en `i18n/catalog.ts`. */
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

function rungSummary(status: EmploymentStatus, locale: Locale): string {
    return locale === 'en' ? RUNG_SUMMARY_EN[status] : RUNG_SUMMARY[status];
}

function stepCopy(status: EmploymentStatus, locale: Locale): string | undefined {
    return locale === 'en' ? STEP_COPY_EN[status] : STEP_COPY[status];
}

interface Props {
    employment: EmploymentStatus;
    squadTrack: SquadTrack;
    /** Trayectoria congelada: de acá sale si el escalón se ganó ESTA temporada. */
    history: CareerSeasonEntry[];
    /**
     * Abre la comparación de una. Se usa cuando el escalafón ya está detrás de
     * un desplegable: pedir dos clics para ver lo mismo no protege nada.
     */
    defaultOpen?: boolean;
}

/**
 * ¿El jugador subió de escalón en la última temporada jugada?
 *
 * Exportada porque la cabecera marca el chip del vínculo con esto: el aviso
 * completo vive en este panel, que arranca cerrado, y sin la marca el ascenso
 * —que es EL momento de la ruta amateur— pasaría en silencio.
 */
export function justPromoted(history: CareerSeasonEntry[]): EmploymentStatus | null {
    if (history.length < 2) return null;
    const last = history[history.length - 1];
    const previous = history[history.length - 2];
    return employmentRank(last.employment) > employmentRank(previous.employment) ? last.employment : null;
}

/** Valor 0..1 → porcentaje entero. Es lo que ve el jugador, no el decimal crudo. */
const pct = (value: number) => Math.round(value * 100);

export default function EmploymentLadder({ employment, squadTrack, history, defaultOpen = false }: Props) {
    const { locale, t } = useLocale();
    const [open, setOpen] = useState(defaultOpen);

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
            {/* El h2 va oculto a la vista: los cuatro escalones con sus
                etiquetas ya dicen qué es esto, y el rótulo costaba 20 px de un
                banner que tiene que medir 150. El lector de pantalla lo
                necesita igual. */}
            <h2 id="escalafon-titulo" className={styles.srOnly}>{t.ladderTitle}</h2>

            {promotedTo && (
                <p className={styles.eltPromotion} role="status">
                    <span className={styles.eltPromotionTag}>{t.steppedUp}</span>
                    {t.youAreNow(employmentLabel(promotedTo, EMPLOYMENT_LABELS[promotedTo], locale))} {stepCopy(promotedTo, locale)}
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
                                <span className={styles.eltStepLabel}>
                                    {employmentLabel(status, EMPLOYMENT_LABELS[status], locale)}
                                </span>
                            </span>
                        );
                    })}
                </span>

                <span className={styles.eltToggle}>
                    {open ? t.hide : isTop ? t.seeWhatYouGained : t.seeWhatChanges}
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={open ? styles.chevronOpen : undefined}><path d="M6 9l6 6 6-6" /></svg>
                </span>
            </button>

            {/* La frase de resumen se fue AL PANEL. Estaba siempre visible
                debajo de la barra y era referencia pura: costaba ~30 px del
                banner para decir algo que no cambia entre temporadas. Ahora se
                lee cuando el jugador abre "Ver qué cambia al subir". */}
            <p className={`${styles.eltNow} ${open ? '' : styles.srOnly}`}>
                {rungSummary(employment, locale)}
                {inAcademy && <span className={styles.eltAcademy}>{t.inAcademyNote}</span>}
            </p>

            <div id="escalafon-panel" className={`${styles.eltPanel} ${open ? styles.eltPanelOpen : ''}`} hidden={!open}>
                <p className={styles.eltPanelHead}>
                    <span className={styles.eltPanelFrom}>{employmentLabel(from, EMPLOYMENT_LABELS[from], locale)}</span>
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14" /><path d="M13 6l6 6-6 6" /></svg>
                    <span className={styles.eltPanelTo}>{employmentLabel(to, EMPLOYMENT_LABELS[to], locale)}</span>
                </p>
                {stepCopy(to, locale) && <p className={styles.eltPanelCopy}>{stepCopy(to, locale)}</p>}

                <dl className={styles.eltRows}>
                    {t.dimensions.map(({ key, label, inverted, note }) => {
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
                        {t.academyFoot(pct(DEVELOPMENT_TRACK.trainingQuality), pct(DEVELOPMENT_TRACK.trainingLoad))}
                    </p>
                )}
            </div>
        </section>
    );
}
