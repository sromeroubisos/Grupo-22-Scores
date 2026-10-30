'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, Loader2, Plus } from 'lucide-react';
import {
    CATEGORY_LETTERS,
    CATEGORY_PRESETS,
    DEVELOPMENT_PRESETS,
    categoryOptionLevel,
    customCategories,
    findCategoryByLevel,
    presetCategoryName,
    presetLabel,
    type CategoryOption,
    type CategoryPreset,
} from '@/lib/clubs/categoryPresets';
import styles from './CategoryPicker.module.css';

export type CategoryCreate = (
    label: string,
    level: string | null,
    variant: string | null,
) => Promise<CategoryOption | null>;

interface CategoryPickerProps {
    /** Las fichas que ya existen: el club base y sus categorías. */
    options: CategoryOption[];
    /** Nombre del club base, para anticipar cómo se va a llamar lo que se cree. */
    baseName: string;
    /**
     * `select`: elegir UNA ficha (alta de partido). Tocar lo que no existe lo crea
     * y lo elige.
     * `manage`: ver y sumar categorías (pestaña Jugadores). No hay selección.
     */
    mode: 'select' | 'manage';
    selectedId?: string | null;
    onSelect?: (option: CategoryOption) => void;
    onCreate: CategoryCreate;
    /** Para lectores de pantalla: "Categoría de tu club", "Categoría del rival". */
    label: string;
}

const ALL = [...CATEGORY_PRESETS, ...DEVELOPMENT_PRESETS];

/**
 * El selector de categorías por toques.
 *
 * Arriba, las categorías comunes y las de desarrollo. Al tocar una se abre
 * debajo la fila de equipos de esa categoría: "Única" (sin letra) y de la A a
 * la H. Lo que ya existe se ve lleno; lo que falta, punteado y con "+": tocarlo
 * lo crea con el nombre completo ("Catamarca R.C. M16 B").
 */
export function CategoryPicker({
    options,
    baseName,
    mode,
    selectedId = null,
    onSelect,
    onCreate,
    label,
}: CategoryPickerProps) {
    const selected = useMemo(
        () => options.find((option) => option.id === selectedId) ?? null,
        [options, selectedId],
    );
    const [activeLevel, setActiveLevel] = useState<string | null>(
        () => (selected ? categoryOptionLevel(selected) : null),
    );
    const [busy, setBusy] = useState<string | null>(null);
    const [customOpen, setCustomOpen] = useState(false);
    const [customName, setCustomName] = useState('');

    // Si la selección cambia desde afuera (por ejemplo, el rival que se elige
    // solo para jugar M16 contra M16), la fila de letras la acompaña.
    useEffect(() => {
        if (!selected) return;
        const level = categoryOptionLevel(selected);
        if (level) setActiveLevel(level);
    }, [selected]);

    const activePreset = ALL.find((preset) => preset.level === activeLevel) ?? null;
    const customs = useMemo(() => customCategories(options), [options]);
    const isSelect = mode === 'select';

    const create = async (key: string, preset: CategoryPreset, variant: string) => {
        setBusy(key);
        try {
            const created = await onCreate(presetLabel(preset, variant), preset.level, variant || null);
            if (created && isSelect) onSelect?.(created);
        } finally {
            setBusy(null);
        }
    };

    const pickLevel = async (preset: CategoryPreset) => {
        setActiveLevel(preset.level);
        const existing = findCategoryByLevel(options, preset.level);
        if (existing) {
            if (isSelect) onSelect?.(existing);
            return;
        }
        await create(`level:${preset.level}`, preset, '');
    };

    const pickLetter = async (preset: CategoryPreset, variant: string) => {
        const existing = findCategoryByLevel(options, preset.level, variant);
        if (existing) {
            if (isSelect) onSelect?.(existing);
            return;
        }
        await create(`letter:${preset.level}:${variant}`, preset, variant);
    };

    const submitCustom = async () => {
        const name = customName.trim();
        if (!name) return;
        setBusy('custom');
        try {
            const created = await onCreate(name, null, null);
            if (created) {
                setCustomName('');
                setCustomOpen(false);
                if (isSelect) onSelect?.(created);
            }
        } finally {
            setBusy(null);
        }
    };

    const levelChip = (preset: CategoryPreset) => {
        const exists = Boolean(findCategoryByLevel(options, preset.level));
        const active = activeLevel === preset.level;
        const isBusy = busy === `level:${preset.level}`;
        return (
            <button
                key={preset.level}
                type="button"
                role={isSelect ? 'radio' : undefined}
                aria-checked={isSelect ? active : undefined}
                aria-pressed={isSelect ? undefined : active}
                className={[
                    styles.chip,
                    exists ? styles.chipOn : styles.chipNew,
                    active ? styles.chipActive : '',
                ].join(' ')}
                disabled={busy !== null}
                title={exists ? undefined : `Crear ${presetCategoryName(baseName, preset)}`}
                onClick={() => { void pickLevel(preset); }}
            >
                {isBusy
                    ? <Loader2 size={13} className="animate-spin" aria-hidden="true" />
                    // Al elegir, el punteado ya dice "no existe": el "+" en cada
                    // botón era ruido. Al administrar sí va, porque ahí es la acción.
                    : !exists && !isSelect ? <Plus size={13} aria-hidden="true" /> : null}
                {preset.label}
            </button>
        );
    };

    const letterChip = (preset: CategoryPreset, variant: string) => {
        const existing = findCategoryByLevel(options, preset.level, variant);
        const chosen = Boolean(isSelect && existing && existing.id === selectedId);
        const isBusy = busy === `letter:${preset.level}:${variant}`;
        return (
            <button
                key={variant || 'unica'}
                type="button"
                role={isSelect ? 'radio' : undefined}
                aria-checked={isSelect ? chosen : undefined}
                aria-label={existing
                    ? `${presetCategoryName(baseName, preset, variant)}${chosen ? ', elegida' : ''}`
                    : `Crear ${presetCategoryName(baseName, preset, variant)}`}
                className={[
                    styles.letter,
                    existing ? styles.chipOn : styles.chipNew,
                    chosen ? styles.chipActive : '',
                ].join(' ')}
                disabled={busy !== null || (!isSelect && Boolean(existing))}
                onClick={() => { void pickLetter(preset, variant); }}
            >
                {isBusy
                    ? <Loader2 size={12} className="animate-spin" aria-hidden="true" />
                    : !existing ? (isSelect ? null : <Plus size={12} aria-hidden="true" />)
                        : !isSelect ? <Check size={12} aria-hidden="true" /> : null}
                {variant || 'Única'}
            </button>
        );
    };

    return (
        <div className={styles.picker}>
            <div className={styles.group}>
                <span className={styles.groupLabel}>Categorías</span>
                <div className={styles.chips} role={isSelect ? 'radiogroup' : 'group'} aria-label={label}>
                    {CATEGORY_PRESETS.map(levelChip)}
                </div>
            </div>

            <div className={styles.group}>
                <span className={styles.groupLabel}>Desarrollo</span>
                <div
                    className={styles.chips}
                    role={isSelect ? 'radiogroup' : 'group'}
                    aria-label={`${label}: desarrollo`}
                >
                    {DEVELOPMENT_PRESETS.map(levelChip)}
                </div>
            </div>

            {customs.length > 0 && (
                <div className={styles.group}>
                    <span className={styles.groupLabel}>Otras</span>
                    <div className={styles.chips}>
                        {customs.map((option) => {
                            const chosen = isSelect && option.id === selectedId;
                            return (
                                <button
                                    key={option.id}
                                    type="button"
                                    className={[styles.chip, styles.chipOn, chosen ? styles.chipActive : ''].join(' ')}
                                    aria-pressed={isSelect ? chosen : undefined}
                                    disabled={!isSelect || busy !== null}
                                    onClick={() => {
                                        setActiveLevel(null);
                                        onSelect?.(option);
                                    }}
                                >
                                    {option.name.replace(baseName, '').trim() || option.name}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {activePreset && (
                <div className={styles.letters}>
                    <span className={styles.groupLabel}>Equipos de {activePreset.label}</span>
                    <div
                        className={`${styles.chips} ${styles.letterRow}`}
                        role={isSelect ? 'radiogroup' : 'group'}
                        aria-label={`Equipos de ${activePreset.label}`}
                    >
                        {letterChip(activePreset, '')}
                        {CATEGORY_LETTERS.map((letter) => letterChip(activePreset, letter))}
                    </div>
                </div>
            )}

            {isSelect && (
                <p className={styles.hint}>Las punteadas todavía no existen: se crean al tocarlas.</p>
            )}

            {customOpen ? (
                <div className={styles.custom}>
                    <input
                        className={styles.input}
                        placeholder="Nombre de la categoría, por ejemplo Damas"
                        aria-label="Nombre de otra categoría"
                        value={customName}
                        onChange={(event) => setCustomName(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                                event.preventDefault();
                                void submitCustom();
                            }
                        }}
                        autoFocus
                    />
                    <button
                        type="button"
                        className={styles.customCreate}
                        disabled={busy !== null || !customName.trim()}
                        onClick={() => { void submitCustom(); }}
                    >
                        {busy === 'custom' ? 'Creando…' : !customName.trim() ? 'Poné un nombre' : 'Crear'}
                    </button>
                    <button type="button" className={styles.linkButton} onClick={() => setCustomOpen(false)}>
                        Cancelar
                    </button>
                </div>
            ) : (
                <button type="button" className={styles.linkButton} onClick={() => setCustomOpen(true)}>
                    + Otra con nombre propio
                </button>
            )}
        </div>
    );
}
