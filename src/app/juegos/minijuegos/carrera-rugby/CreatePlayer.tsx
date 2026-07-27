'use client';

import type { Position } from '@/features/career';
import { ALL_POSITIONS, getPosition } from '@/features/career';
import CountryPicker from './CountryPicker';
import styles from './carrera.module.css';

interface Props {
    countryCode: string | null;
    position: Position | null;
    onCountry: (code: string) => void;
    onPosition: (value: Position) => void;
    onStart: () => void;
}

/**
 * El usuario elige SOLO dos cosas: nacionalidad y posición. Origen, edad, club
 * inicial, atributos, potencial y elegibilidad los resuelve el motor.
 */
export default function CreatePlayer({ countryCode, position, onCountry, onPosition, onStart }: Props) {
    const ready = countryCode !== null && position !== null;

    return (
        <>
            <div>
                <span className={styles.eyebrow}>Crear jugador</span>
                <h1 className={styles.title}>Elegí y arrancá</h1>
                <p className={styles.lead}>Tu bandera y tu posición. El resto lo resolvemos nosotros.</p>
            </div>

            <section className={styles.field} aria-labelledby="crear-nacionalidad">
                <h2 className={styles.label} id="crear-nacionalidad">Nacionalidad</h2>
                <CountryPicker value={countryCode} onChange={onCountry} />
            </section>

            <section className={styles.field} aria-labelledby="crear-posicion">
                <h2 className={styles.label} id="crear-posicion">Posición</h2>
                <div className={styles.posGrid} role="radiogroup" aria-labelledby="crear-posicion">
                    {ALL_POSITIONS.map((pos) => {
                        const def = getPosition(pos);
                        const selected = position === pos;
                        return (
                            <button
                                key={pos}
                                type="button"
                                role="radio"
                                aria-checked={selected}
                                className={`${styles.posChip} ${selected ? styles.posChipOn : ''}`}
                                onClick={() => onPosition(pos)}
                            >
                                <span className={styles.posChipNum}>{def.numbers.join('·')}</span>
                                <span className={styles.posChipName}>{def.labelEs}</span>
                            </button>
                        );
                    })}
                </div>
            </section>

            <div className={styles.btnRow}>
                <button type="button" className={styles.primaryBtn} onClick={onStart} disabled={!ready}>
                    Comenzar carrera
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
                </button>
            </div>
            {!ready && (
                <p className={styles.hintText} aria-live="polite">
                    Elegí {countryCode === null ? 'una nacionalidad' : ''}
                    {countryCode === null && position === null ? ' y ' : ''}
                    {position === null ? 'una posición' : ''} para empezar.
                </p>
            )}
        </>
    );
}
