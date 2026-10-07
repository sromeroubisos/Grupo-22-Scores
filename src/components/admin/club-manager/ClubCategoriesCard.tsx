'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, ExternalLink, Loader2, Trash2, Users } from 'lucide-react';
import { CategoryPicker } from '@/components/clubs/CategoryPicker';
import { buildClubManageHref, type ClubConsoleMode } from '@/lib/clubAdminRoutes';
import { resolveCategoryLevel } from '@/lib/clubs/categoryLevel';
import {
    DEVELOPMENT_PRESETS,
    categoryOptionLevel,
    type CategoryOption,
} from '@/lib/clubs/categoryPresets';
import { requestCategory } from '@/lib/clubs/requestCategory';

interface ClubCategoriesCardProps {
    clubId: string;
    clubName: string;
    navigationMode?: ClubConsoleMode;
    notify: (text: string, kind?: 'ok' | 'error') => void;
}

type CategoryRow = CategoryOption & { levelLabel?: string | null };

const DEVELOPMENT_LEVELS = new Set(DEVELOPMENT_PRESETS.map((preset) => preset.level));

/** El renglón chico de cada categoría. M1 y M2 no son "Menores de 1": son desarrollo. */
function subtitleOf(category: CategoryRow): string {
    if (category.isBase) return 'Primera, club principal';
    const level = categoryOptionLevel(category);
    if (level && DEVELOPMENT_LEVELS.has(level)) return 'Desarrollo';
    if (!level) return 'Categoría';
    return category.levelLabel || 'Categoría';
}

/**
 * Las categorías del club: Primera, Intermedia, juveniles, desarrollo, y los
 * equipos de cada una (A, B, C...).
 *
 * Cada categoría es un CLUB derivado ("Catamarca R.C. M16 B") colgado del base
 * por `club_derivatives`, igual que las que crea el alta de partido. Es lo que
 * eligen los torneos y los partidos, así que la que se crea acá aparece después
 * al cargar un partido. Antes esta tarjeta escribía en `club_divisions`, una
 * tabla sin uso y con RLS cerrada: el alta no llegaba a ningún lado.
 */
export function ClubCategoriesCard({ clubId, clubName, navigationMode = 'admin', notify }: ClubCategoriesCardProps) {
    const [categories, setCategories] = useState<CategoryRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [confirmId, setConfirmId] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoadError(null);
        try {
            const response = await fetch(`/api/clubs/${encodeURIComponent(clubId)}/categories`, { cache: 'no-store' });
            const payload = await response.json().catch(() => null);
            if (!response.ok || !payload?.ok) throw new Error(payload?.error || 'No se pudieron cargar las categorías.');
            const rows = Array.isArray(payload.categories) ? payload.categories : [];
            setCategories(rows.map((row: { id: string; name: string; isBase: boolean; levelLabel?: string | null }) => ({
                id: row.id,
                name: row.name,
                isBase: Boolean(row.isBase),
                levelLabel: row.levelLabel ?? null,
            })));
        } catch (caught) {
            setLoadError(caught instanceof Error ? caught.message : 'No se pudieron cargar las categorías.');
        } finally {
            setLoading(false);
        }
    }, [clubId]);

    useEffect(() => { void load(); }, [load]);

    const base = categories.find((category) => category.isBase) ?? null;
    const baseName = base?.name || clubName;

    // El orden del escalafón: Primera, Intermedia, juveniles de mayor a menor,
    // desarrollo, y dentro de cada una por letra. Así la lista se lee como el club.
    const ordered = useMemo(() => [...categories].sort((left, right) => {
        if (left.isBase !== right.isBase) return left.isBase ? -1 : 1;
        const a = resolveCategoryLevel({ name: left.name });
        const b = resolveCategoryLevel({ name: right.name });
        return a.rank - b.rank || a.variant.localeCompare(b.variant) || left.name.localeCompare(right.name, 'es');
    }), [categories]);

    const create = async (label: string, level: string | null, variant: string | null) => {
        const result = await requestCategory({ clubId, baseClubId: base?.id ?? clubId, label, level, variant });
        if (!result.ok || !result.option) {
            notify(result.error || 'No se pudo crear la categoría.', 'error');
            return null;
        }
        notify(result.existed ? `Ya existía: ${result.option.name}` : `Categoría creada: ${result.option.name}`);
        await load();
        return result.option;
    };

    // Solo se borra una categoría vacía: el servidor revisa partidos, torneos y
    // plantel, y si tiene algo contesta qué tiene.
    const remove = async (category: CategoryRow) => {
        setDeletingId(category.id);
        try {
            const params = new URLSearchParams({ categoryId: category.id });
            const response = await fetch(
                `/api/clubs/${encodeURIComponent(clubId)}/categories?${params.toString()}`,
                { method: 'DELETE' },
            );
            const payload = await response.json().catch(() => null);
            if (!response.ok || !payload?.ok) throw new Error(payload?.error || 'No se pudo borrar la categoría.');
            notify(`Categoría borrada: ${category.name}`);
            await load();
        } catch (caught) {
            notify(caught instanceof Error ? caught.message : 'No se pudo borrar la categoría.', 'error');
        } finally {
            setDeletingId(null);
            setConfirmId(null);
        }
    };

    return (
        <section className="cm-card">
            <div className="cm-card-head">
                <div>
                    <h2>Categorías</h2>
                    <p>
                        Tocá una categoría para crearla y ver sus equipos (A, B, C). Cada una queda con su
                        nombre completo y aparece al cargar un partido.
                    </p>
                </div>
            </div>

            {loading ? (
                <div className="cm-loading">Leyendo las categorías...</div>
            ) : loadError ? (
                <div className="cm-alert">{loadError}</div>
            ) : (
                <>
                    <CategoryPicker
                        mode="manage"
                        label="Categorías del club"
                        options={categories}
                        baseName={baseName}
                        onCreate={create}
                    />

                    <div className="cm-list" style={{ marginTop: 18 }}>
                        {ordered.map((category) => (
                            <div key={category.id} className="cm-row">
                                <span className="cm-avatar" aria-hidden="true"><Users size={15} /></span>
                                <div className="cm-row-main">
                                    <div className="cm-row-title">
                                        {category.isBase || category.id === clubId ? category.name : (
                                            <Link
                                                href={buildClubManageHref(category.id, 'inicio', navigationMode)}
                                                className="cm-row-link"
                                            >
                                                {category.name}
                                                <ChevronRight size={14} aria-hidden="true" />
                                            </Link>
                                        )}
                                    </div>
                                    <div className="cm-row-sub">{subtitleOf(category)}</div>
                                </div>
                                <div className="cm-row-actions">
                                    {confirmId === category.id ? (
                                        <>
                                            <span className="cm-hint">¿Borrarla?</span>
                                            <button
                                                type="button"
                                                className="cm-btn cm-btn-sm cm-btn-danger"
                                                onClick={() => { void remove(category); }}
                                                disabled={deletingId === category.id}
                                            >
                                                {deletingId === category.id
                                                    ? <Loader2 size={13} className="animate-spin" aria-hidden="true" />
                                                    : null}
                                                Sí, borrar
                                            </button>
                                            <button
                                                type="button"
                                                className="cm-btn cm-btn-sm"
                                                onClick={() => setConfirmId(null)}
                                                disabled={deletingId === category.id}
                                            >
                                                No
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            <Link
                                                href={`/clubs/${encodeURIComponent(category.id)}`}
                                                prefetch={false}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="cm-btn cm-btn-sm"
                                                aria-label={`Ver la ficha de ${category.name}`}
                                            >
                                                <ExternalLink size={13} aria-hidden="true" />
                                                Ficha
                                            </Link>
                                            {!category.isBase && category.id !== clubId && (
                                                <button
                                                    type="button"
                                                    className="cm-btn cm-btn-icon cm-btn-danger"
                                                    onClick={() => setConfirmId(category.id)}
                                                    aria-label={`Borrar la categoría ${category.name}`}
                                                    title="Borrar categoría"
                                                >
                                                    <Trash2 size={14} aria-hidden="true" />
                                                </button>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            )}
        </section>
    );
}
