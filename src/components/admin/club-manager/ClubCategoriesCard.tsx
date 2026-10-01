'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Loader2, Plus, Users } from 'lucide-react';
import { buildClubManageHref, type ClubConsoleMode } from '@/lib/clubAdminRoutes';
import {
    CATEGORY_PRESETS,
    findCategoryByLevel,
    presetCategoryName,
    type CategoryOption,
    type CategoryPreset,
} from '@/lib/clubs/categoryPresets';

interface ClubCategoriesCardProps {
    clubId: string;
    clubName: string;
    navigationMode?: ClubConsoleMode;
    notify: (text: string, kind?: 'ok' | 'error') => void;
}

type CategoryRow = CategoryOption & { levelLabel?: string | null };

/**
 * Las categorías del club: Primera, Intermedia, juveniles.
 *
 * Cada categoría es un CLUB derivado ("Catamarca R.C. M16") colgado del base por
 * `club_derivatives`, igual que las que crea el alta de partido del panel. Es lo
 * que eligen los torneos y los partidos, así que la que se crea acá aparece
 * después al cargar un partido. Antes esta tarjeta escribía en `club_divisions`,
 * una tabla sin uso y con RLS cerrada: el alta no llegaba a ningún lado.
 */
export function ClubCategoriesCard({ clubId, clubName, navigationMode = 'admin', notify }: ClubCategoriesCardProps) {
    const [categories, setCategories] = useState<CategoryRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [busyLevel, setBusyLevel] = useState<string | null>(null);
    const [customName, setCustomName] = useState('');
    const [creatingCustom, setCreatingCustom] = useState(false);

    const load = useCallback(async () => {
        setLoadError(null);
        try {
            const response = await fetch(`/api/clubs/${encodeURIComponent(clubId)}/categories`, { cache: 'no-store' });
            const payload = await response.json().catch(() => null);
            if (!response.ok || !payload?.ok) throw new Error(payload?.error || 'No se pudieron cargar las categorías.');
            setCategories(Array.isArray(payload.categories) ? payload.categories : []);
        } catch (caught) {
            setLoadError(caught instanceof Error ? caught.message : 'No se pudieron cargar las categorías.');
        } finally {
            setLoading(false);
        }
    }, [clubId]);

    useEffect(() => { void load(); }, [load]);

    const base = categories.find((category) => category.isBase) ?? null;
    const baseName = base?.name || clubName;

    /**
     * Alta de una categoría. Un 409 con parecidas no se trata como error: si el
     * club ya tenía "M16" con otro nombre, esa ES la que se pidió.
     */
    const create = async (label: string, level: string | null): Promise<boolean> => {
        const response = await fetch(`/api/clubs/${encodeURIComponent(clubId)}/categories`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ baseClubId: base?.id ?? clubId, label, level }),
        });
        const payload = await response.json().catch(() => null);

        if (response.status === 409 && Array.isArray(payload?.similar) && payload.similar.length > 0) {
            notify(`Ya existía: ${payload.similar[0].name}`);
            return true;
        }
        if (!response.ok || !payload?.ok) {
            notify(payload?.error || 'No se pudo crear la categoría.', 'error');
            return false;
        }
        notify(`Categoría creada: ${payload.category?.name ?? label}`);
        await load();
        return true;
    };

    const pickPreset = async (preset: CategoryPreset) => {
        if (findCategoryByLevel(categories, preset.level)) return;
        setBusyLevel(preset.level);
        try {
            await create(preset.label, preset.level);
        } catch {
            notify('No se pudo crear la categoría. Revisá la conexión.', 'error');
        } finally {
            setBusyLevel(null);
        }
    };

    const createCustom = async () => {
        const label = customName.trim();
        if (!label) return;
        setCreatingCustom(true);
        try {
            if (await create(label, null)) setCustomName('');
        } catch {
            notify('No se pudo crear la categoría. Revisá la conexión.', 'error');
        } finally {
            setCreatingCustom(false);
        }
    };

    return (
        <section className="cm-card">
            <div className="cm-card-head">
                <div>
                    <h2>Categorías</h2>
                    <p>
                        Tocá las que tiene el club. Cada una queda con su nombre completo (por
                        ejemplo <strong>{presetCategoryName(baseName, CATEGORY_PRESETS[6])}</strong>) y
                        aparece al cargar un partido.
                    </p>
                </div>
            </div>

            <div className="cm-cat-chips" role="group" aria-label="Categorías por edad">
                {CATEGORY_PRESETS.map((preset) => {
                    const existing = findCategoryByLevel(categories, preset.level);
                    const busy = busyLevel === preset.level;
                    return (
                        <button
                            key={preset.level}
                            type="button"
                            className={`cm-cat-chip${existing ? ' is-on' : ''}`}
                            aria-pressed={Boolean(existing)}
                            disabled={loading || busyLevel !== null || Boolean(existing)}
                            title={existing ? existing.name : `Crear ${presetCategoryName(baseName, preset)}`}
                            onClick={() => { void pickPreset(preset); }}
                        >
                            {busy
                                ? <Loader2 size={13} className="animate-spin" aria-hidden="true" />
                                : existing ? null : <Plus size={13} aria-hidden="true" />}
                            {preset.label}
                        </button>
                    );
                })}
            </div>

            <div className="cm-search" style={{ margin: '14px 0 16px' }}>
                <input
                    className="cm-input"
                    placeholder="Otra con nombre propio: Damas, M22, Intermedia B"
                    value={customName}
                    onChange={(event) => setCustomName(event.target.value)}
                    aria-label="Nombre de otra categoría"
                />
                <button
                    type="button"
                    className="cm-btn"
                    onClick={createCustom}
                    disabled={creatingCustom || !customName.trim()}
                    title={!customName.trim() ? 'Escribí el nombre de la categoría para crearla.' : undefined}
                >
                    {creatingCustom
                        ? <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                        : <Plus size={14} aria-hidden="true" />}
                    Crear
                </button>
            </div>

            {loading ? (
                <div className="cm-loading">Leyendo las categorías...</div>
            ) : loadError ? (
                <div className="cm-alert">{loadError}</div>
            ) : (
                <div className="cm-list">
                    {categories.map((category) => (
                        <div key={category.id} className="cm-row">
                            <span className="cm-avatar" aria-hidden="true"><Users size={15} /></span>
                            <div className="cm-row-main">
                                <div className="cm-row-title">
                                    {category.isBase || category.id === clubId ? category.name : (
                                        <Link
                                            href={buildClubManageHref(category.id, 'general', navigationMode)}
                                            className="cm-row-link"
                                        >
                                            {category.name}
                                            <ChevronRight size={14} aria-hidden="true" />
                                        </Link>
                                    )}
                                </div>
                                <div className="cm-row-sub">
                                    {category.isBase ? 'Primera · club principal' : (category.levelLabel || 'Categoría')}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
}
