'use client';

import { useCallback, useEffect, useState } from 'react';
import { BarChart3, Pencil, Plus, Trash2, ArrowUp, ArrowDown } from 'lucide-react';
import {
    type ChartConfig,
    type ChartConfigDraft,
    type PanelKey,
    createChartConfig,
    deleteChartConfig,
    fetchChartConfigs,
    reorderChartConfigs,
    updateChartConfig,
} from '@/lib/club-admin/chartConfigs';
import { ChartBuilderModal } from './ChartBuilderModal';
import { CustomChartRenderer } from './CustomChartRenderer';
import type { StatCatalogEntry } from './statCatalogs';

interface ChartConfigPanelProps<TData> {
    clubId: string;
    panelKey: PanelKey;
    catalog: StatCatalogEntry<TData>[];
    data: TData;
    homeLabel?: string;
    awayLabel?: string;
    /** Sección título mostrado encima de la lista. */
    sectionTitle?: string;
    /** Mensaje breve que se muestra cuando no hay configs. */
    emptyHint?: string;
}

export function ChartConfigPanel<TData>({
    clubId,
    panelKey,
    catalog,
    data,
    homeLabel,
    awayLabel,
    sectionTitle = 'Gráficos personalizados',
    emptyHint = 'Sumá gráficos a este panel eligiendo el tipo y las estadísticas que querés comparar.',
}: ChartConfigPanelProps<TData>) {
    const [configs, setConfigs] = useState<ChartConfig[]>([]);
    const [loading, setLoading] = useState(true);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState<ChartConfig | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);

    const reload = useCallback(async () => {
        if (!clubId) return;
        setLoading(true);
        try {
            const list = await fetchChartConfigs(clubId, panelKey);
            setConfigs(list);
            setErrorMsg(null);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'No se pudieron cargar los gráficos';
            setErrorMsg(message);
        } finally {
            setLoading(false);
        }
    }, [clubId, panelKey]);

    useEffect(() => {
        reload();
    }, [reload]);

    const openNew = () => {
        setEditing(null);
        setModalOpen(true);
    };

    const openEdit = (config: ChartConfig) => {
        setEditing(config);
        setModalOpen(true);
    };

    const handleSave = async (draft: ChartConfigDraft) => {
        if (editing) {
            await updateChartConfig(editing.id, clubId, draft);
        } else {
            await createChartConfig(clubId, panelKey, draft);
        }
        setModalOpen(false);
        setEditing(null);
        await reload();
    };

    const handleDelete = async (id: string) => {
        if (!confirm('¿Eliminar este gráfico?')) return;
        setBusyId(id);
        try {
            await deleteChartConfig(id, clubId);
            await reload();
        } catch (err) {
            const message = err instanceof Error ? err.message : 'No se pudo eliminar';
            setErrorMsg(message);
        } finally {
            setBusyId(null);
        }
    };

    const move = async (index: number, direction: -1 | 1) => {
        const target = index + direction;
        if (target < 0 || target >= configs.length) return;
        const next = [...configs];
        const [moved] = next.splice(index, 1);
        next.splice(target, 0, moved);
        setConfigs(next);
        try {
            await reorderChartConfigs(
                clubId,
                panelKey,
                next.map((c) => c.id)
            );
        } catch (err) {
            const message = err instanceof Error ? err.message : 'No se pudo reordenar';
            setErrorMsg(message);
            await reload();
        }
    };

    return (
        <section
            style={{
                marginTop: 24,
                padding: 18,
                borderRadius: 14,
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)',
            }}
        >
            <header
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 14,
                    gap: 12,
                    flexWrap: 'wrap',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <BarChart3 size={18} color="#60a5fa" />
                    <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#e2e8f0' }}>
                        {sectionTitle}
                    </h3>
                </div>
                <button
                    type="button"
                    onClick={openNew}
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '8px 14px',
                        borderRadius: 8,
                        border: 'none',
                        background: 'linear-gradient(90deg, #3b82f6, #2563eb)',
                        color: '#fff',
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                    }}
                >
                    <Plus size={14} /> Agregar gráfico
                </button>
            </header>

            {errorMsg && (
                <div
                    style={{
                        padding: '10px 12px',
                        marginBottom: 12,
                        borderRadius: 8,
                        background: 'rgba(239,68,68,0.12)',
                        border: '1px solid rgba(239,68,68,0.4)',
                        color: '#fca5a5',
                        fontSize: '0.8rem',
                    }}
                >
                    {errorMsg}
                </div>
            )}

            {loading ? (
                <div style={{ padding: 30, textAlign: 'center', fontSize: '0.85rem', color: 'rgba(226,232,240,0.6)' }}>
                    Cargando gráficos…
                </div>
            ) : configs.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', fontSize: '0.85rem', color: 'rgba(226,232,240,0.55)' }}>
                    {emptyHint}
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
                    {configs.map((config, index) => (
                        <article
                            key={config.id}
                            style={{
                                padding: 14,
                                borderRadius: 12,
                                background: 'rgba(15,23,42,0.6)',
                                border: '1px solid rgba(255,255,255,0.08)',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 12,
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                                <div style={{ minWidth: 0 }}>
                                    <div
                                        style={{
                                            fontSize: '0.85rem',
                                            fontWeight: 700,
                                            color: '#fff',
                                            whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                        }}
                                    >
                                        {config.title || defaultTitle(config)}
                                    </div>
                                    <div style={{ fontSize: '0.7rem', color: 'rgba(226,232,240,0.55)', marginTop: 2 }}>
                                        {config.statKeys.length} stat{config.statKeys.length === 1 ? '' : 's'} · {chartTypeLabel(config.chartType)}
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: 4 }}>
                                    <IconButton
                                        title="Subir"
                                        onClick={() => move(index, -1)}
                                        disabled={index === 0 || busyId === config.id}
                                    >
                                        <ArrowUp size={14} />
                                    </IconButton>
                                    <IconButton
                                        title="Bajar"
                                        onClick={() => move(index, 1)}
                                        disabled={index === configs.length - 1 || busyId === config.id}
                                    >
                                        <ArrowDown size={14} />
                                    </IconButton>
                                    <IconButton title="Editar" onClick={() => openEdit(config)} disabled={busyId === config.id}>
                                        <Pencil size={14} />
                                    </IconButton>
                                    <IconButton
                                        title="Eliminar"
                                        onClick={() => handleDelete(config.id)}
                                        disabled={busyId === config.id}
                                        accent="danger"
                                    >
                                        <Trash2 size={14} />
                                    </IconButton>
                                </div>
                            </div>
                            <div>
                                <CustomChartRenderer
                                    config={config}
                                    catalog={catalog}
                                    data={data}
                                    homeLabel={homeLabel}
                                    awayLabel={awayLabel}
                                />
                            </div>
                        </article>
                    ))}
                </div>
            )}

            <ChartBuilderModal
                open={modalOpen}
                onClose={() => {
                    setModalOpen(false);
                    setEditing(null);
                }}
                onSave={handleSave}
                catalog={catalog}
                initial={editing}
            />
        </section>
    );
}

function IconButton({
    children,
    onClick,
    title,
    disabled,
    accent,
}: {
    children: React.ReactNode;
    onClick: () => void;
    title: string;
    disabled?: boolean;
    accent?: 'danger';
}) {
    return (
        <button
            type="button"
            title={title}
            onClick={onClick}
            disabled={disabled}
            style={{
                width: 28,
                height: 28,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 6,
                border: '1px solid rgba(255,255,255,0.12)',
                background: 'rgba(255,255,255,0.04)',
                color: accent === 'danger' ? '#fca5a5' : '#cbd5e1',
                cursor: disabled ? 'not-allowed' : 'pointer',
                opacity: disabled ? 0.4 : 1,
                transition: 'all 0.15s ease',
            }}
        >
            {children}
        </button>
    );
}

function chartTypeLabel(type: ChartConfig['chartType']) {
    switch (type) {
        case 'comparison':
            return 'Barras';
        case 'grouped-bars':
            return 'Barras agrupadas';
        case 'radar':
            return 'Radar';
        case 'donut':
            return 'Donut';
    }
}

function defaultTitle(config: ChartConfig) {
    return `${chartTypeLabel(config.chartType)} (${config.statKeys.length})`;
}
