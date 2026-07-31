'use client';

import type { CaptainSeasonEntry } from '@/features/captain';
import { clubLabel, getFamily } from '@/features/captain';
import type { PositionFamilyId } from '@/features/captain';
import styles from './capitan.module.css';

/**
 * El resultado de la temporada.
 *
 * Es una TARJETA DE RESULTADO y no una decisión: el jugador no elige nada, así
 * que el botón dice "Continuar" y se ve distinto de los botones de decisión
 * (CLAUDE.md §3).
 *
 * La métrica-gloria del puesto va con el mismo peso visual que los partidos:
 * los penales de scrum de un pilar valen lo que los tries de un wing.
 */
export default function SeasonResult({
    entry,
    family,
    ovrDelta,
    onContinue,
}: {
    entry: CaptainSeasonEntry;
    family: PositionFamilyId;
    ovrDelta: number;
    onContinue: () => void;
}) {
    const glory = getFamily(family).glory;
    const unidad = glory.primary.unit === 'percent' ? '%' : '';

    return (
        <div className={styles.card}>
            <span className={styles.eyebrow}>Temporada {entry.season} · {clubLabel(entry.clubId)}</span>
            <h2 className={styles.cardTitle}>Se terminó el año</h2>

            <div className={styles.grid}>
                <div className={styles.cell}>
                    <span className={styles.cellLabel}>Partidos</span>
                    <span className={styles.cellValue}>{entry.matchesPlayed}</span>
                </div>
                <div className={styles.cell}>
                    <span className={styles.cellLabel}>{glory.primary.labelEs}</span>
                    <span className={styles.cellValue}>{entry.glory}{unidad}</span>
                </div>
                {glory.secondary && (
                    <div className={styles.cell}>
                        <span className={styles.cellLabel}>{glory.secondary.labelEs}</span>
                        <span className={styles.cellValue}>
                            {entry.glorySecondary}{glory.secondary.unit === 'percent' ? '%' : ''}
                        </span>
                    </div>
                )}
                <div className={styles.cell}>
                    <span className={styles.cellLabel}>Media</span>
                    <span className={`${styles.cellValue} ${ovrDelta > 0 ? styles.cellUp : ovrDelta < 0 ? styles.cellDown : ''}`}>
                        {entry.ovr}{ovrDelta !== 0 ? ` (${ovrDelta > 0 ? '+' : ''}${ovrDelta})` : ''}
                    </span>
                </div>
                {entry.caps > 0 && (
                    <div className={styles.cell}>
                        <span className={styles.cellLabel}>Caps</span>
                        <span className={`${styles.cellValue} ${styles.cellUp}`}>+{entry.caps}</span>
                    </div>
                )}
            </div>

            {entry.titles.length > 0 && (
                <p className={styles.note}>
                    Ganaron {entry.titles.join(' y ')}.
                </p>
            )}

            {entry.note && <p className={styles.note}>{entry.note}</p>}

            {entry.decisionText && <p className={styles.note}>{entry.decisionText}</p>}

            <div style={{ marginTop: 18 }}>
                <button type="button" className={styles.ghost} onClick={onContinue}>
                    Continuar
                </button>
            </div>
        </div>
    );
}
