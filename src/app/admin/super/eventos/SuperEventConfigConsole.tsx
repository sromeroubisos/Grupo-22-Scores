'use client';

import { useEffect, useMemo, useState } from 'react';
import { Download, Loader2, Plus, RefreshCw, Save, Trash2 } from 'lucide-react';
import {
    DEFAULT_RUGBY_TAXONOMY,
    RUGBY_PERFORMANCE_MODULES,
    type RugbyTaxonomyItem,
} from '@/lib/performance/rugbyStaff';
import styles from './SuperEventConfigConsole.module.css';

type ApiPayload = {
    ok?: boolean;
    data?: unknown;
    error?: unknown;
    warning?: string;
};

function cn(...parts: Array<string | false | null | undefined>) {
    return parts.filter(Boolean).join(' ');
}

function isTaxonomyItem(value: unknown): value is RugbyTaxonomyItem {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return false;
    }

    const candidate = value as Record<string, unknown>;
    return typeof candidate.moduleKey === 'string'
        && typeof candidate.eventKey === 'string'
        && typeof candidate.label === 'string';
}

function createId() {
    return typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `default-${Date.now()}`;
}

function escapeCsv(value: unknown) {
    const text = String(value ?? '');
    if (!/[",\n]/.test(text)) return text;
    return `"${text.replace(/"/g, '""')}"`;
}

export function SuperEventConfigConsole() {
    const matchModules = RUGBY_PERFORMANCE_MODULES.filter((module) => module.scope === 'match_global');
    const [items, setItems] = useState<RugbyTaxonomyItem[]>(DEFAULT_RUGBY_TAXONOMY);
    const [activeModuleKey, setActiveModuleKey] = useState(matchModules[0]?.key ?? 'kicks');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [warning, setWarning] = useState<string | null>(null);

    const activeModule = matchModules.find((module) => module.key === activeModuleKey) ?? matchModules[0];
    const visibleItems = useMemo(
        () => items.filter((item) => item.moduleKey === activeModuleKey),
        [activeModuleKey, items],
    );

    const enabledCount = items.filter((item) => item.enabled).length;
    const disabledCount = items.length - enabledCount;
    const fieldsCount = matchModules.reduce((sum, module) => sum + module.fields.length, 0);

    const loadData = async () => {
        setLoading(true);
        setError(null);

        try {
            const response = await fetch('/api/admin/super/performance-taxonomy', {
                cache: 'no-store',
                credentials: 'same-origin',
            });
            const payload = await response.json().catch(() => null) as ApiPayload | null;

            if (!response.ok || !payload?.ok) {
                throw new Error(typeof payload?.error === 'string' ? payload.error : 'No se pudo cargar la configuracion');
            }

            setItems(Array.isArray(payload.data) ? payload.data.filter(isTaxonomyItem) : DEFAULT_RUGBY_TAXONOMY);
            setWarning(payload.warning ?? null);
            setDirty(false);
        } catch (nextError) {
            setError(nextError instanceof Error ? nextError.message : 'No se pudo cargar la configuracion');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void loadData();
    }, []);

    const patchItem = (id: string, changes: Partial<RugbyTaxonomyItem>) => {
        setItems((current) => current.map((item) => item.id === id ? { ...item, ...changes } : item));
        setDirty(true);
    };

    const addItem = () => {
        const moduleKey = activeModule?.key ?? 'kicks';
        const next: RugbyTaxonomyItem = {
            id: createId(),
            moduleKey,
            eventKey: `${moduleKey}_${Date.now()}`,
            label: 'Nuevo evento',
            description: 'Configurar descripcion operativa del evento',
            enabled: true,
            config: {
                clubAdminAvailable: true,
                superAdminAvailable: true,
                fields: activeModule?.fields.map((field) => field.key) ?? [],
            },
        };

        setItems((current) => [next, ...current]);
        setDirty(true);
    };

    const removeItem = (id: string) => {
        setItems((current) => current.filter((item) => item.id !== id));
        setDirty(true);
    };

    const save = async () => {
        setSaving(true);
        setError(null);

        try {
            const response = await fetch('/api/admin/super/performance-taxonomy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ items }),
            });
            const payload = await response.json().catch(() => null) as ApiPayload | null;

            if (!response.ok || !payload?.ok) {
                throw new Error(typeof payload?.error === 'string' ? payload.error : 'No se pudo guardar la configuracion');
            }

            setItems(Array.isArray(payload.data) ? payload.data.filter(isTaxonomyItem) : items);
            setDirty(false);
        } catch (nextError) {
            setError(nextError instanceof Error ? nextError.message : 'No se pudo guardar la configuracion');
        } finally {
            setSaving(false);
        }
    };

    const exportCsv = () => {
        const rows = [
            ['modulo', 'evento', 'label', 'habilitado', 'descripcion'],
            ...items.map((item) => [
                item.moduleKey,
                item.eventKey,
                item.label,
                item.enabled ? 'si' : 'no',
                item.description,
            ]),
        ];
        const csv = rows.map((row) => row.map(escapeCsv).join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'g22-rugby-eventos-partido.csv';
        link.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className={styles.console}>
            <header className={styles.header}>
                <div>
                    <span className={styles.kicker}>Superadmin · Eventos globales de partido</span>
                    <h1 className={styles.title}>Taxonomia avanzada de rendimiento rugby</h1>
                    <p className={styles.subtitle}>
                        Configura los eventos estadisticos disponibles para partido: penales, causas,
                        patadas, scrum, line, tries, powerplay y estadisticas generales. Esta consola no abre
                        planificacion privada, jugadas internas ni gimnasio de ningun club.
                    </p>
                </div>
                <div className={styles.actions}>
                    <button type="button" className={styles.ghost} onClick={() => { void loadData(); }}>
                        <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
                        Sincronizar
                    </button>
                    <button type="button" className={styles.ghost} onClick={exportCsv}>
                        <Download className="w-4 h-4" />
                        Exportar CSV
                    </button>
                    <button type="button" className={styles.button} onClick={() => { void save(); }} disabled={!dirty || saving}>
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Guardar
                    </button>
                </div>
            </header>

            {(error || warning) ? (
                <div className={styles.notice}>{error || warning}</div>
            ) : null}

            <section className={styles.statsGrid}>
                <article className={styles.stat}>
                    <span>Modulos partido</span>
                    <strong>{matchModules.length}</strong>
                </article>
                <article className={styles.stat}>
                    <span>Eventos habilitados</span>
                    <strong>{enabledCount}</strong>
                </article>
                <article className={styles.stat}>
                    <span>Eventos pausados</span>
                    <strong>{disabledCount}</strong>
                </article>
                <article className={styles.stat}>
                    <span>Campos configurables</span>
                    <strong>{fieldsCount}</strong>
                </article>
            </section>

            <section className={styles.privateBlock}>
                <strong>Privacidad de clubes cerrada</strong>
                <p>
                    Superadmin configura solo el catalogo global de eventos de partido. La planificacion de entrenamientos,
                    jugadas propias, gimnasio, GPS manual y planillas internas quedan reservadas a club admin/staff por membership.
                </p>
            </section>

            <nav className={styles.tabs} aria-label="Modulos de eventos de partido">
                {matchModules.map((module) => (
                    <button
                        key={module.key}
                        type="button"
                        className={cn(styles.tab, activeModuleKey === module.key && styles.tabActive)}
                        onClick={() => setActiveModuleKey(module.key)}
                    >
                        {module.shortLabel}
                    </button>
                ))}
            </nav>

            <section className={styles.panel}>
                <div className={styles.panelHead}>
                    <div>
                        <span className={styles.label}>Configuracion global</span>
                        <h2>{activeModule?.label}</h2>
                    </div>
                    <button type="button" className={styles.ghost} onClick={addItem}>
                        <Plus className="w-4 h-4" />
                        Agregar evento
                    </button>
                </div>

                <div className={styles.tableWrap}>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>Habilitado</th>
                                <th>Clave</th>
                                <th>Nombre visible</th>
                                <th>Descripcion</th>
                                <th>Campos incluidos</th>
                                <th>Accion</th>
                            </tr>
                        </thead>
                        <tbody>
                            {visibleItems.map((item) => (
                                <tr key={item.id}>
                                    <td className={styles.checkboxCell}>
                                        <input
                                            type="checkbox"
                                            checked={item.enabled}
                                            onChange={(event) => patchItem(item.id, { enabled: event.target.checked })}
                                        />
                                    </td>
                                    <td>
                                        <input
                                            className={styles.input}
                                            value={item.eventKey}
                                            onChange={(event) => patchItem(item.id, { eventKey: event.target.value })}
                                        />
                                    </td>
                                    <td>
                                        <input
                                            className={styles.input}
                                            value={item.label}
                                            onChange={(event) => patchItem(item.id, { label: event.target.value })}
                                        />
                                    </td>
                                    <td>
                                        <textarea
                                            className={styles.textarea}
                                            value={item.description}
                                            onChange={(event) => patchItem(item.id, { description: event.target.value })}
                                        />
                                    </td>
                                    <td>
                                        <input
                                            className={styles.input}
                                            value={Array.isArray(item.config.fields) ? item.config.fields.join(', ') : activeModule?.fields.map((field) => field.key).join(', ')}
                                            onChange={(event) => patchItem(item.id, {
                                                config: {
                                                    ...item.config,
                                                    fields: event.target.value.split(',').map((field) => field.trim()).filter(Boolean),
                                                },
                                            })}
                                        />
                                    </td>
                                    <td>
                                        <button type="button" className={styles.iconButton} onClick={() => removeItem(item.id)} aria-label="Borrar evento">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    );
}
