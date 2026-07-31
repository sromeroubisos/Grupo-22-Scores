'use client';

import { useState } from 'react';
import type { CreateCaptainInput, PositionFamilyId } from '@/features/captain';
import { ALL_FAMILIES, getFamily } from '@/features/captain';
import styles from './capitan.module.css';

/** Las uniones con las que arranca el juego. El resto llega después. */
const PAISES: { code: string; nombre: string }[] = [
    { code: 'ar', nombre: 'Argentina' },
    { code: 'uy', nombre: 'Uruguay' },
    { code: 'cl', nombre: 'Chile' },
    { code: 'fr', nombre: 'Francia' },
    { code: 'nz', nombre: 'Nueva Zelanda' },
    { code: 'za', nombre: 'Sudáfrica' },
    { code: 'ie', nombre: 'Irlanda' },
    { code: 'gb-eng', nombre: 'Inglaterra' },
];

export default function CreatePlayer({ onStart }: { onStart: (input: CreateCaptainInput) => void }) {
    const [name, setName] = useState('');
    const [surname, setSurname] = useState('');
    const [family, setFamily] = useState<PositionFamilyId | null>(null);
    const [countryCode, setCountryCode] = useState('ar');

    const listo = family !== null && name.trim().length > 0 && surname.trim().length > 0;

    return (
        <div className={styles.card}>
            <span className={styles.eyebrow}>Empezás en la M19</span>
            <h2 className={styles.cardTitle}>¿Quién sos?</h2>
            <p className={styles.cardText}>
                Tenés dieciocho y estás por subir a primera. El club te lo va a decir el sábado.
            </p>

            <div className={styles.field} style={{ marginTop: 20 }}>
                <label className={styles.fieldLabel} htmlFor="cap-nombre">Nombre y apellido</label>
                <div style={{ display: 'flex', gap: 8 }}>
                    <input
                        id="cap-nombre"
                        className={styles.input}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Bautista"
                        maxLength={20}
                    />
                    <input
                        className={styles.input}
                        value={surname}
                        onChange={(e) => setSurname(e.target.value)}
                        placeholder="Uriarte"
                        maxLength={20}
                        aria-label="Apellido"
                    />
                </div>
            </div>

            <div className={styles.field}>
                <span className={styles.fieldLabel} id="cap-pais">De dónde sos</span>
                <div className={styles.choices} role="radiogroup" aria-labelledby="cap-pais">
                    {PAISES.map((pais) => (
                        <button
                            key={pais.code}
                            type="button"
                            role="radio"
                            aria-checked={countryCode === pais.code}
                            className={`${styles.choice} ${countryCode === pais.code ? styles.choiceOn : ''}`}
                            onClick={() => setCountryCode(pais.code)}
                        >
                            <span className={styles.choiceName}>{pais.nombre}</span>
                        </button>
                    ))}
                </div>
            </div>

            <div className={styles.field}>
                <span className={styles.fieldLabel} id="cap-puesto">Tu puesto</span>
                <p className={styles.cardText} style={{ marginBottom: 10, fontSize: '0.85rem' }}>
                    Es la decisión más determinante del juego. Cada puesto tiene su propia gloria y su
                    propia edad de retiro.
                </p>
                <div className={styles.choices} role="radiogroup" aria-labelledby="cap-puesto">
                    {ALL_FAMILIES.map((id) => {
                        const def = getFamily(id);
                        return (
                            <button
                                key={id}
                                type="button"
                                role="radio"
                                aria-checked={family === id}
                                className={`${styles.choice} ${family === id ? styles.choiceOn : ''}`}
                                onClick={() => setFamily(id)}
                            >
                                <span className={styles.choiceName}>
                                    {def.labelEs} <span style={{ opacity: 0.55 }}>{def.numbers.join(' · ')}</span>
                                </span>
                                <span className={styles.choiceMeta}>
                                    {def.glory.primary.labelEs.toLowerCase()} · se retira a los {def.age.hard}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>

            <button
                type="button"
                className={styles.primary}
                disabled={!listo}
                onClick={() => {
                    if (!family) return;
                    onStart({ name: name.trim(), surname: surname.trim(), family, countryCode });
                }}
            >
                Empezar la carrera
            </button>
            {!listo && (
                <span className={styles.primaryHint}>
                    {name.trim() && surname.trim()
                        ? 'Elegí un puesto para empezar.'
                        : 'Poné tu nombre y elegí un puesto para empezar.'}
                </span>
            )}
        </div>
    );
}
