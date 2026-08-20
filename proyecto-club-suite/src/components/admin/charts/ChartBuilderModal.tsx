'use client';

import { useEffect, useMemo, useState } from 'react';
import {
    CHART_TYPE_HINTS,
    CHART_TYPE_LABELS,
    type ChartConfig,
    type ChartConfigDraft,
    type ChartType,
    validateChartDraft,
} from '@/lib/club-admin/chartConfigs';
import { groupCatalogByCategory, type StatCatalogEntry } from './statCatalogs';

interface ChartBuilderModalProps<TData> {
    open: boolean;
    onClose: () => void;
    onSave: (draft: ChartConfigDraft) => Promise<void>;
    catalog: StatCatalogEntry<TData>[];
    initial?: ChartConfig | null;
}

const CHART_TYPES: ChartType[] = ['comparison', 'grouped-bars', 'radar', 'donut'];

export function ChartBuilderModal<TData>({
    open,
    onClose,
    onSave,
    catalog,
    initial,
}: ChartBuilderModalProps<TData>) {
    const [chartType, setChartType] = useState<ChartType>(initial?.chartType ?? 'comparison');
    const [title, setTitle] = useState<string>(initial?.title ?? '');
    const [statKeys, setStatKeys] = useState<string[]>(initial?.statKeys ?? []);
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (open) {
            setChartType(initial?.chartType ?? 'comparison');
            setTitle(initial?.title ?? '');
            setStatKeys(initial?.statKeys ?? []);
            setError(null);
        }
    }, [open, initial]);

    const grouped = useMemo(() => groupCatalogByCategory(catalog), [catalog]);

    const draft: ChartConfigDraft = useMemo(
        () => ({ chartType, title: title.trim() || null, statKeys }),
        [chartType, title, statKeys]
    );

    const validation = useMemo(() => validateChartDraft(draft), [draft]);

    if (!open) return null;

    const toggleKey = (key: string) => {
        setStatKeys((current) => {
            if (current.includes(key)) {
                return current.filter((k) => k !== key);
            }
            // For single-stat chart types, replace the selection
            if (chartType === 'comparison' || chartType === 'donut') {
                return [key];
            }
            return [...current, key];
        });
    };

    const handleTypeChange = (next: ChartType) => {
        setChartType(next);
        // If switching to a single-stat chart, trim the selection
        if (next === 'comparison' || next === 'donut') {
            setStatKeys((current) => (current.length > 0 ? [current[0]] : []));
        }
    };

    const handleSave = async () => {
        const v = validateChartDraft(draft);
        if (v) {
            setError(v);
            return;
        }
        setError(null);
        setSaving(true);
        try {
            await onSave(draft);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'No se pudo guardar el gráfico';
            setError(message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div
            role="dialog"
            aria-modal="true"
            onClick={(e) => {
                if (e.target === e.currentTarget && !saving) onClose();
            }}
            style={{
                position: 'fixed',
                inset: 0,
                background: 'color-mix(in srgb, var(--ca-bg) 65%, transparent)',
                backdropFilter: 'blur(8px)',
                zIndex: 1000,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 20,
            }}
        >
            <div
                style={{
                    background: 'var(--ca-surface)',
                    border: '1px solid var(--ca-border)',
                    borderRadius: 16,
                    width: '100%',
                    maxWidth: 720,
                    maxHeight: '90vh',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    color: 'var(--ca-text)',
                }}
            >
                <header
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '16px 20px',
                        borderBottom: '1px solid var(--ca-border)',
                    }}
                >
                    <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>
                        {initial ? 'Editar gráfico' : 'Nuevo gráfico'}
                    </h3>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={saving}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--ca-text-secondary)',
                            cursor: saving ? 'not-allowed' : 'pointer',
                            fontSize: '1.2rem',
                        }}
                    >
                        ×
                    </button>
                </header>

                <div style={{ padding: 20, overflow: 'auto', display: 'grid', gap: 18 }}>
                    <section>
                        <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--ca-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
                            Tipo de gráfico
                        </label>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
                            {CHART_TYPES.map((type) => {
                                const active = chartType === type;
                                return (
                                    <button
                                        key={type}
                                        type="button"
                                        onClick={() => handleTypeChange(type)}
                                        style={{
                                            padding: '12px 14px',
                                            borderRadius: 10,
                                            border: `1px solid ${active ? 'var(--ca-accent)' : 'var(--ca-border)'}`,
                                            background: active ? 'color-mix(in srgb, var(--ca-accent) 18%, transparent)' : 'var(--ca-surface-hover)',
                                            color: active ? 'var(--ca-text)' : 'var(--ca-text-secondary)',
                                            cursor: 'pointer',
                                            textAlign: 'left',
                                            transition: 'all 0.15s ease',
                                        }}
                                    >
                                        <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>{CHART_TYPE_LABELS[type]}</div>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--ca-text-secondary)', marginTop: 4 }}>{CHART_TYPE_HINTS[type]}</div>
                                    </button>
                                );
                            })}
                        </div>
                    </section>

                    <section>
                        <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--ca-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
                            Título (opcional)
                        </label>
                        <input
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            maxLength={80}
                            placeholder="Ej: Comparativo de set piece"
                            style={{
                                width: '100%',
                                padding: '10px 12px',
                                background: 'var(--ca-surface-hover)',
                                border: '1px solid var(--ca-border)',
                                borderRadius: 8,
                                color: 'var(--ca-text)',
                                fontSize: '0.85rem',
                            }}
                        />
                    </section>

                    <section>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                            <label style={{ fontSize: '0.75rem', color: 'var(--ca-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                                Estadísticas
                            </label>
                            <span style={{ fontSize: '0.7rem', color: 'var(--ca-text-secondary)' }}>
                                {statKeys.length} elegida{statKeys.length === 1 ? '' : 's'}
                            </span>
                        </div>
                        <div style={{ display: 'grid', gap: 14 }}>
                            {grouped.map((group) => (
                                <div key={group.category}>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--ca-text-secondary)', marginBottom: 6, fontWeight: 600 }}>
                                        {group.category}
                                    </div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                        {group.entries.map((entry) => {
                                            const active = statKeys.includes(entry.key);
                                            return (
                                                <button
                                                    key={entry.key}
                                                    type="button"
                                                    onClick={() => toggleKey(entry.key)}
                                                    style={{
                                                        padding: '6px 12px',
                                                        borderRadius: 16,
                                                        border: `1px solid ${active ? 'var(--ca-success)' : 'var(--ca-border)'}`,
                                                        background: active ? 'color-mix(in srgb, var(--ca-success) 18%, transparent)' : 'var(--ca-surface-hover)',
                                                        color: active ? 'var(--ca-text)' : 'var(--ca-text-secondary)',
                                                        fontSize: '0.75rem',
                                                        cursor: 'pointer',
                                                        transition: 'all 0.15s ease',
                                                    }}
                                                >
                                                    {entry.label}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>

                    {(error || (validation && statKeys.length > 0)) && (
                        <div
                            style={{
                                padding: '10px 12px',
                                borderRadius: 8,
                                background: 'color-mix(in srgb, var(--ca-danger) 12%, transparent)',
                                border: '1px solid color-mix(in srgb, var(--ca-danger) 40%, transparent)',
                                color: 'var(--ca-danger)',
                                fontSize: '0.8rem',
                            }}
                        >
                            {error || validation}
                        </div>
                    )}
                </div>

                <footer
                    style={{
                        display: 'flex',
                        justifyContent: 'flex-end',
                        gap: 10,
                        padding: '14px 20px',
                        borderTop: '1px solid var(--ca-border)',
                    }}
                >
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={saving}
                        style={{
                            padding: '8px 16px',
                            borderRadius: 8,
                            border: '1px solid var(--ca-border)',
                            background: 'transparent',
                            color: 'var(--ca-text-secondary)',
                            fontSize: '0.85rem',
                            cursor: saving ? 'not-allowed' : 'pointer',
                        }}
                    >
                        Cancelar
                    </button>
                    <button
                        type="button"
                        onClick={handleSave}
                        disabled={saving || Boolean(validation)}
                        style={{
                            padding: '8px 18px',
                            borderRadius: 8,
                            border: 'none',
                            background: validation ? 'color-mix(in srgb, var(--ca-accent) 40%, transparent)' : 'linear-gradient(90deg, var(--ca-accent), var(--ca-accent-hover))',
                            color: 'var(--ca-text)',
                            fontSize: '0.85rem',
                            fontWeight: 700,
                            cursor: saving || validation ? 'not-allowed' : 'pointer',
                        }}
                    >
                        {saving ? 'Guardando…' : initial ? 'Guardar cambios' : 'Crear gráfico'}
                    </button>
                </footer>
            </div>
        </div>
    );
}
