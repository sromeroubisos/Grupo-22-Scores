'use client';

import { useCallback, useEffect, useState } from 'react';
import styles from './page.module.css';

/**
 * A qué categoría representa cada ficha del club.
 *
 * El panel de una familia mezcla Primera, Intermedia y juveniles en la misma
 * jornada. El orden que se lee es el del escalafón, no el del horario, y de acá
 * sale ese orden.
 *
 * El rango arranca INFERIDO del nombre —"M15", "Intermedia" y "Pre-Intermedia"
 * se leen solos—, así que la pantalla no es un trámite obligatorio: es para el
 * nombre que no se lee. Un club que a su Reserva le dice "Los Pumitas" la
 * acomoda acá, y hasta que alguien la toque la fila dice "del nombre" para que
 * se vea qué está adivinado y qué está confirmado.
 */

type Category = {
    id: string;
    name: string;
    isBase: boolean;
    level: string;
    levelLabel: string;
    variant: string;
    explicit: boolean;
};

type LevelOption = { key: string; label: string };

const VARIANTS = ['A', 'B', 'C', 'D', 'E'] as const;

export default function PanelCategories({ clubId, onClose }: { clubId: string; onClose: () => void }) {
    const [categories, setCategories] = useState<Category[]>([]);
    const [levels, setLevels] = useState<LevelOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [savingId, setSavingId] = useState<string | null>(null);
    // La base sin la migración: se puede mirar, no guardar. Vale decirlo arriba
    // y no recién cuando el guardado falla.
    const [persisted, setPersisted] = useState(true);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await fetch(`/api/clubs/${encodeURIComponent(clubId)}/categories`, { cache: 'no-store' });
            const payload = await response.json().catch(() => null);
            if (!response.ok || !payload?.ok) {
                setError(payload?.error || 'No se pudieron cargar las categorías');
                return;
            }
            setCategories(Array.isArray(payload.categories) ? payload.categories : []);
            setLevels(Array.isArray(payload.levels) ? payload.levels : []);
            setPersisted(payload.escalafonPersistido !== false);
        } catch {
            setError('No se pudieron cargar las categorías. Revisá la conexión.');
        } finally {
            setLoading(false);
        }
    }, [clubId]);

    useEffect(() => { void load(); }, [load]);

    const save = async (category: Category, level: string, variant: string) => {
        setSavingId(category.id);
        setError(null);

        // Optimista: el selector tiene que responder al toque. Si el guardado
        // falla se recarga la lista y vuelve a lo que hay en la base, así la
        // pantalla nunca miente sobre lo que quedó guardado.
        setCategories(current => current.map(row => (
            row.id === category.id
                ? { ...row, level, variant, explicit: Boolean(level), levelLabel: labelOf(levels, level) }
                : row
        )));

        try {
            const response = await fetch(`/api/clubs/${encodeURIComponent(clubId)}/categories`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ categoryId: category.id, level: level || null, variant: variant || null }),
            });
            const payload = await response.json().catch(() => null);
            if (!response.ok || !payload?.ok) {
                setError(payload?.error || 'No se pudo guardar');
                await load();
                return;
            }
            // Se relee para que "del nombre" / "elegido" refleje lo guardado y no
            // lo que supuso el optimismo de arriba.
            await load();
        } catch {
            setError('No se pudo guardar. Revisá la conexión.');
            await load();
        } finally {
            setSavingId(null);
        }
    };

    return (
        <div className={styles.panelForm}>
            <div className={styles.panelFormHead}>
                <h3 className={styles.panelFormTitle}>Categorías del club</h3>
                <button type="button" className={styles.linkButton} onClick={onClose}>Cerrar</button>
            </div>

            <p className={styles.panelFormHint}>
                El orden de la jornada sale de acá: Primera, Reserva, Pre Reserva y después
                los juveniles. El nombre lo elegís vos — si dice M15 o Intermedia se lee solo.
            </p>

            {!persisted ? (
                <p className={styles.panelFormError}>
                    La base todavía no tiene las columnas del escalafón: podés mirar el orden
                    pero no guardarlo. Falta correr la migración 20260824180000.
                </p>
            ) : null}

            {loading ? (
                <p className={styles.panelFormHint}>Cargando las categorías…</p>
            ) : categories.length === 0 ? (
                <p className={styles.panelFormHint}>Este club todavía no tiene categorías cargadas.</p>
            ) : (
                <ul className={styles.categoryLevelList}>
                    {categories.map(category => (
                        <li key={category.id} className={styles.categoryLevelRow}>
                            <div className={styles.categoryLevelName}>
                                <span>{category.name}</span>
                                <span className={styles.categoryLevelOrigin}>
                                    {savingId === category.id
                                        ? 'Guardando…'
                                        : category.explicit ? 'elegido' : 'del nombre'}
                                </span>
                            </div>

                            <select
                                className={styles.panelFormInput}
                                aria-label={`Rango de ${category.name}`}
                                value={category.level}
                                disabled={!persisted || savingId === category.id}
                                onChange={event => save(category, event.target.value, category.variant)}
                            >
                                <option value="">Del nombre</option>
                                {levels.map(level => (
                                    <option key={level.key} value={level.key}>{level.label}</option>
                                ))}
                            </select>

                            <select
                                className={styles.panelFormInput}
                                aria-label={`Letra de ${category.name}`}
                                value={category.variant}
                                disabled={!persisted || savingId === category.id}
                                onChange={event => save(category, category.level, event.target.value)}
                            >
                                <option value="">Sin letra</option>
                                {VARIANTS.map(letter => (
                                    <option key={letter} value={letter}>{letter}</option>
                                ))}
                            </select>
                        </li>
                    ))}
                </ul>
            )}

            {error ? <p className={styles.panelFormError}>{error}</p> : null}
        </div>
    );
}

function labelOf(levels: LevelOption[], key: string): string {
    return levels.find(level => level.key === key)?.label || '';
}
