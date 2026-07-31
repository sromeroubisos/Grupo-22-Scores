'use client';

import type { CaptainState, TimeSlot } from '@/features/captain';
import { TIME_SLOTS, TIME_SLOT_DEFS, tokensLeft } from '@/features/captain';
import styles from './capitan.module.css';

/**
 * El reparto de las seis fichas: la decisión que se toma todas las temporadas.
 *
 * No hay respuesta obviamente correcta y esa es toda la idea. El botón de jugar
 * se habilita recién con las seis puestas, y mientras tanto dice qué falta
 * (CLAUDE.md §6).
 */
export default function TimeBudget({
    state,
    onSpend,
    onUnspend,
    onConfirm,
}: {
    state: CaptainState;
    onSpend: (slot: TimeSlot) => void;
    onUnspend: (slot: TimeSlot) => void;
    onConfirm: () => void;
}) {
    const quedan = tokensLeft(state.time);
    const listo = quedan === 0;

    return (
        <div className={styles.card}>
            <span className={styles.eyebrow}>Temporada {state.season} · {state.player.age} años</span>
            <h2 className={styles.cardTitle}>Repartí tu tiempo</h2>
            <p className={styles.cardText}>
                Seis fichas para todo el año. Lo que le des a una se lo sacás a otra.
            </p>

            <div className={styles.tokens} aria-hidden="true">
                {Array.from({ length: state.time.total }, (_, i) => (
                    <span
                        key={i}
                        className={`${styles.token} ${i < state.time.total - quedan ? styles.tokenUsed : ''}`}
                    />
                ))}
            </div>
            <p className={styles.srOnly}>
                {quedan === 0 ? 'Repartiste las seis fichas.' : `Te quedan ${quedan} de ${state.time.total} fichas.`}
            </p>

            <div className={styles.slots}>
                {TIME_SLOTS.map((slot) => {
                    const def = TIME_SLOT_DEFS[slot];
                    const puestas = state.time.spent[slot] ?? 0;
                    return (
                        <div
                            key={slot}
                            className={`${styles.slot} ${puestas > 0 ? styles.slotActive : ''}`}
                        >
                            <button
                                type="button"
                                className={styles.slotMinus}
                                onClick={() => onUnspend(slot)}
                                disabled={puestas === 0}
                                aria-label={`Sacar una ficha de ${def.labelEs}`}
                            >
                                −
                            </button>
                            <button
                                type="button"
                                className={styles.slotBody}
                                onClick={() => onSpend(slot)}
                                disabled={quedan === 0}
                                aria-label={`Poner una ficha en ${def.labelEs}`}
                            >
                                <span className={styles.slotName}>{def.labelEs}</span>
                                <span className={styles.slotHint}>{def.hint}</span>
                            </button>
                            <span className={`${styles.slotCount} ${puestas > 0 ? styles.slotCountFilled : ''}`}>
                                {puestas}
                            </span>
                        </div>
                    );
                })}
            </div>

            <div style={{ marginTop: 18 }}>
                <button type="button" className={styles.primary} onClick={onConfirm} disabled={!listo}>
                    Jugar la temporada
                </button>
                {!listo && (
                    <span className={styles.primaryHint}>
                        Te {quedan === 1 ? 'queda una ficha' : `quedan ${quedan} fichas`} sin repartir.
                    </span>
                )}
            </div>
        </div>
    );
}
