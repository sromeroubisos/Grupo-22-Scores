'use client';

import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Download,
    FileSpreadsheet,
    Loader2,
    Plus,
    RefreshCw,
    Save,
    Trash2,
    Upload,
} from 'lucide-react';
import type { ClubDashboardOverview } from '@/lib/club-admin/dashboard-types';
import {
    CLUB_PRIVATE_MODULE_KEYS,
    MATCH_GLOBAL_MODULE_KEYS,
    RUGBY_PERFORMANCE_MODULES,
    calculateRugbyPerformanceInsights,
    createEmptyPerformanceRecord,
    getPerformanceModule,
    type RugbyFieldDefinition,
    type RugbyPerformanceContext,
    type RugbyPerformanceRecord,
} from '@/lib/performance/rugbyStaff';
import type { Division } from '@/lib/services/divisionService';
import type { PersonWithRole } from '@/lib/services/personService';
import styles from './ClubStaffPerformanceSuite.module.css';

interface ClubStaffPerformanceSuiteProps {
    clubId: string;
    clubName: string;
    divisions: Division[];
    players: PersonWithRole[];
    staff: PersonWithRole[];
    dashboardData: ClubDashboardOverview;
}

type ApiPayload = {
    ok?: boolean;
    data?: unknown;
    error?: unknown;
    warning?: string;
    permissions?: {
        matchAllowed?: boolean;
        privateAllowed?: boolean;
        matchModules?: string[];
        privateModules?: string[];
    };
};

type ScopeFilter = 'all' | 'match_global' | 'club_private';

const CONTEXT_LABELS: Record<RugbyPerformanceContext, string> = {
    match: 'Partido',
    training: 'Entrenamiento',
    gym: 'Gimnasio',
    review: 'Revision',
};

function cn(...parts: Array<string | false | null | undefined>) {
    return parts.filter(Boolean).join(' ');
}

function getPersonName(person: PersonWithRole) {
    return person.full_name?.trim()
        || `${person.first_name || ''} ${person.last_name || ''}`.trim()
        || 'Sin nombre';
}

function isRecordPayload(value: unknown): value is RugbyPerformanceRecord {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return false;
    }

    const candidate = value as Record<string, unknown>;
    return typeof candidate.id === 'string' && typeof candidate.moduleKey === 'string';
}

function escapeCsv(value: unknown) {
    const text = String(value ?? '');
    if (!/[",\n]/.test(text)) {
        return text;
    }

    return `"${text.replace(/"/g, '""')}"`;
}

function parseCsvLine(line: string) {
    const cells: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let index = 0; index < line.length; index += 1) {
        const char = line[index];
        const next = line[index + 1];

        if (char === '"' && inQuotes && next === '"') {
            current += '"';
            index += 1;
            continue;
        }

        if (char === '"') {
            inQuotes = !inQuotes;
            continue;
        }

        if (char === ',' && !inQuotes) {
            cells.push(current);
            current = '';
            continue;
        }

        current += char;
    }

    cells.push(current);
    return cells;
}

function normalizeHeader(value: string) {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
}

function formatPercent(value: number | null) {
    return typeof value === 'number' ? `${value}%` : '--';
}

function formatValue(value: string | number | boolean | null | undefined) {
    if (value == null || value === '') return '';
    return String(value);
}

function getFieldValue(record: RugbyPerformanceRecord, field: RugbyFieldDefinition) {
    if (field.key === 'date') {
        return record.eventDate || formatValue(record.payload.date);
    }

    return formatValue(record.payload[field.key]);
}

function getFieldClass(field: RugbyFieldDefinition) {
    return field.type === 'textarea' || field.key === 'notes' ? styles.notesInput : '';
}

async function fetchRecords(clubId: string) {
    const response = await fetch(`/api/club-admin/performance-records?club=${encodeURIComponent(clubId)}`, {
        cache: 'no-store',
        credentials: 'same-origin',
    });
    const payload = await response.json().catch(() => null) as ApiPayload | null;

    if (!response.ok || !payload?.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'No se pudieron cargar registros');
    }

    return {
        records: Array.isArray(payload.data) ? payload.data.filter(isRecordPayload) : [],
        warning: payload.warning ?? null,
        permissions: payload.permissions,
    };
}

export function ClubStaffPerformanceSuite({
    clubId,
    clubName,
    divisions,
    players,
    staff,
    dashboardData,
}: ClubStaffPerformanceSuiteProps) {
    const importInputRef = useRef<HTMLInputElement | null>(null);
    const [records, setRecords] = useState<RugbyPerformanceRecord[]>([]);
    const [activeModuleKey, setActiveModuleKey] = useState('kicks');
    const [scopeFilter, setScopeFilter] = useState<ScopeFilter>('all');
    const [contextFilter, setContextFilter] = useState<'all' | RugbyPerformanceContext>('all');
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [warning, setWarning] = useState<string | null>(null);
    const [privateAllowed, setPrivateAllowed] = useState(true);

    const playerOptions = useMemo(() => players.map((player) => ({
        id: player.id,
        name: getPersonName(player),
    })), [players]);

    const activeModule = getPerformanceModule(activeModuleKey);
    const visibleModules = useMemo(() => (
        privateAllowed
            ? RUGBY_PERFORMANCE_MODULES
            : RUGBY_PERFORMANCE_MODULES.filter((module) => module.scope === 'match_global')
    ), [privateAllowed]);

    const insights = useMemo(() => calculateRugbyPerformanceInsights(records), [records]);

    const loadData = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            const payload = await fetchRecords(clubId);
            setRecords(payload.records);
            setWarning(payload.warning);
            const nextPrivateAllowed = payload.permissions?.privateAllowed !== false;
            setPrivateAllowed(nextPrivateAllowed);
            setActiveModuleKey((current) => (
                !nextPrivateAllowed && getPerformanceModule(current).scope === 'club_private'
                    ? 'kicks'
                    : current
            ));
        } catch (nextError) {
            setRecords([]);
            setError(nextError instanceof Error ? nextError.message : 'No se pudieron cargar registros');
        } finally {
            setLoading(false);
            setDirty(false);
        }
    }, [clubId]);

    useEffect(() => {
        void loadData();
    }, [loadData]);

    const filteredRows = useMemo(() => {
        const normalizedSearch = search.trim().toLowerCase();

        return records
            .filter((record) => record.moduleKey === activeModuleKey)
            .filter((record) => scopeFilter === 'all' || record.scope === scopeFilter)
            .filter((record) => contextFilter === 'all' || record.context === contextFilter)
            .filter((record) => {
                if (!normalizedSearch) return true;
                const haystack = [
                    record.playerName,
                    record.eventDate,
                    record.context,
                    ...Object.values(record.payload).map((value) => String(value ?? '')),
                ].join(' ').toLowerCase();
                return haystack.includes(normalizedSearch);
            });
    }, [activeModuleKey, contextFilter, records, scopeFilter, search]);

    const patchRecord = (
        recordId: string,
        updater: (record: RugbyPerformanceRecord) => RugbyPerformanceRecord,
    ) => {
        setRecords((current) => current.map((record) => (
            record.id === recordId ? updater(record) : record
        )));
        setDirty(true);
    };

    const handleAddRow = () => {
        const firstPlayer = playerOptions[0] ?? null;
        const next = createEmptyPerformanceRecord(clubId, activeModuleKey, {
            playerId: firstPlayer?.id ?? null,
            playerName: firstPlayer?.name ?? null,
        });

        setRecords((current) => [next, ...current]);
        setDirty(true);
    };

    const handleFieldChange = (
        recordId: string,
        field: RugbyFieldDefinition,
        rawValue: string,
    ) => {
        patchRecord(recordId, (record) => {
            const value = field.type === 'number'
                ? (rawValue === '' ? '' : Number(rawValue))
                : rawValue;
            const payload = {
                ...record.payload,
                [field.key]: value,
            };

            if (field.key === 'date') {
                return {
                    ...record,
                    eventDate: rawValue,
                    payload,
                };
            }

            return {
                ...record,
                payload,
            };
        });
    };

    const handlePlayerChange = (recordId: string, playerId: string) => {
        const selected = playerOptions.find((player) => player.id === playerId) ?? null;
        patchRecord(recordId, (record) => ({
            ...record,
            playerId: selected?.id ?? null,
            playerName: selected?.name ?? playerId,
        }));
    };

    const handleContextChange = (recordId: string, context: RugbyPerformanceContext) => {
        patchRecord(recordId, (record) => ({
            ...record,
            context,
        }));
    };

    const handleSave = async () => {
        setSaving(true);
        setError(null);

        try {
            const response = await fetch('/api/club-admin/performance-records', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({
                    clubId,
                    records,
                }),
            });
            const payload = await response.json().catch(() => null) as ApiPayload | null;

            if (!response.ok || !payload?.ok) {
                throw new Error(typeof payload?.error === 'string' ? payload.error : 'No se pudieron guardar cambios');
            }

            const persisted = Array.isArray(payload.data) ? payload.data.filter(isRecordPayload) : [];
            const persistedIds = new Set(persisted.map((record) => record.id));
            setRecords((current) => [
                ...persisted,
                ...current.filter((record) => !persistedIds.has(record.id) && record.scope === 'club_private' && !privateAllowed),
            ]);
            setDirty(false);
        } catch (nextError) {
            setError(nextError instanceof Error ? nextError.message : 'No se pudieron guardar cambios');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (recordId: string) => {
        const previous = records;
        setRecords((current) => current.filter((record) => record.id !== recordId));
        setDirty(true);

        try {
            await fetch('/api/club-admin/performance-records', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ clubId, recordId }),
            });
        } catch {
            setRecords(previous);
        }
    };

    const handleExportCsv = () => {
        const columns = [
            { key: 'module', label: 'modulo' },
            { key: 'scope', label: 'scope' },
            { key: 'context', label: 'contexto' },
            { key: 'playerName', label: 'jugador' },
            { key: 'eventDate', label: 'fecha' },
            ...activeModule.fields.map((field) => ({ key: field.key, label: field.label })),
        ];
        const csv = [
            columns.map((column) => escapeCsv(column.label)).join(','),
            ...filteredRows.map((record) => columns.map((column) => {
                if (column.key === 'module') return escapeCsv(activeModule.label);
                if (column.key === 'scope') return escapeCsv(record.scope);
                if (column.key === 'context') return escapeCsv(record.context);
                if (column.key === 'playerName') return escapeCsv(record.playerName);
                if (column.key === 'eventDate') return escapeCsv(record.eventDate);
                return escapeCsv(record.payload[column.key]);
            }).join(',')),
        ].join('\n');

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `g22-${clubName}-${activeModule.key}.csv`.replace(/\s+/g, '-').toLowerCase();
        link.click();
        URL.revokeObjectURL(url);
    };

    const handleImportCsv = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;

        const text = await file.text();
        const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
        if (lines.length < 2) return;

        const headers = parseCsvLine(lines[0]).map(normalizeHeader);
        const fieldMap = new Map<string, RugbyFieldDefinition>();
        activeModule.fields.forEach((field) => {
            fieldMap.set(normalizeHeader(field.key), field);
            fieldMap.set(normalizeHeader(field.label), field);
        });

        const imported = lines.slice(1).map((line) => {
            const values = parseCsvLine(line);
            const next = createEmptyPerformanceRecord(clubId, activeModule.key);
            headers.forEach((header, index) => {
                const value = values[index] ?? '';
                if (header === 'jugador' || header === 'playername') {
                    next.playerName = value;
                    return;
                }

                if (header === 'contexto' || header === 'context') {
                    if (value === 'match' || value === 'training' || value === 'gym' || value === 'review') {
                        next.context = value;
                    }
                    return;
                }

                if (header === 'fecha' || header === 'eventdate') {
                    next.eventDate = value || next.eventDate;
                    next.payload.date = next.eventDate;
                    return;
                }

                const field = fieldMap.get(header);
                if (field) {
                    next.payload[field.key] = field.type === 'number' ? Number(value) || 0 : value;
                }
            });

            return next;
        });

        setRecords((current) => [...imported, ...current]);
        setDirty(true);
    };

    const dashboardCards = [
        {
            title: 'Dashboard tecnico',
            kpis: [
                ['Patadas', formatPercent(insights.kickEffectiveness)],
                ['Scrum', formatPercent(insights.scrumEffectiveness)],
                ['Line', formatPercent(insights.lineEffectiveness)],
                ['Pateador top', insights.topKicker ?? '--'],
            ],
        },
        {
            title: 'Dashboard fisico',
            kpis: [
                ['Registros privados', String(insights.privateRows)],
                ['Jugadores', String(players.length)],
                ['Staff', String(staff.length)],
                ['Equipos', String(divisions.length)],
            ],
        },
        {
            title: 'Dashboard partido',
            kpis: [
                ['Eventos', String(insights.matchRows)],
                ['Penales', String(insights.penalties)],
                ['Tries + / -', `${insights.triesFor}/${insights.triesAgainst}`],
                ['Powerplay', `${insights.powerplayDiff > 0 ? '+' : ''}${insights.powerplayDiff}`],
            ],
        },
        {
            title: 'Dashboard entrenamiento',
            kpis: [
                ['Partidos agenda', String(dashboardData.matches.length)],
                ['Proximos', String(dashboardData.upcomingMatches.length)],
                ['Alertas', String(insights.alerts.filter((alert) => alert.level !== 'ok').length)],
                ['Planillas', String(records.filter((record) => record.moduleKey === 'training_plan').length)],
            ],
        },
    ];

    return (
        <section className={styles.suite}>
            <div className={styles.hero}>
                <div className={styles.heroCopy}>
                    <span className={styles.kicker}>Staff de entrenamiento y rendimiento</span>
                    <h2>Partido, entrenamiento y gimnasio en una planilla operativa.</h2>
                    <p>
                        {clubName}: eventos globales de partido para superadmin y club admin; jugadas, planificacion,
                        gimnasio y GPS manual quedan como informacion privada del club.
                    </p>
                    <div className={styles.toolbar}>
                        <button type="button" className={styles.button} onClick={handleAddRow}>
                            <Plus className="w-4 h-4" />
                            Agregar fila
                        </button>
                        <button type="button" className={styles.ghostButton} onClick={() => { void handleSave(); }} disabled={!dirty || saving}>
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            Guardar cambios
                        </button>
                        <button type="button" className={styles.ghostButton} onClick={() => { void loadData(); }}>
                            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
                            Sincronizar
                        </button>
                    </div>
                </div>

                <div className={styles.scopeGrid}>
                    <article className={styles.scopeCard}>
                        <span className={styles.scopeMatch}>Global partido</span>
                        <strong>{MATCH_GLOBAL_MODULE_KEYS.length} modulos</strong>
                        <p>Superadmin y club admin: patadas, scrum, line, penales, tries y powerplay.</p>
                    </article>
                    <article className={styles.scopeCard}>
                        <span className={styles.scopePrivate}>Privado club</span>
                        <strong>{privateAllowed ? CLUB_PRIVATE_MODULE_KEYS.length : 0} modulos</strong>
                        <p>Solo club admin/staff con membership: jugadas internas, gym, GPS y planificacion.</p>
                    </article>
                </div>
            </div>

            {(error || warning) ? (
                <div className={styles.notice}>
                    <strong>{error ? 'Atencion' : 'Aviso de persistencia'}</strong>
                    <p>{error || warning}</p>
                </div>
            ) : null}

            <div className={styles.filters}>
                <label className={styles.field}>
                    <span>Modulo</span>
                    <select value={activeModuleKey} onChange={(event) => setActiveModuleKey(event.target.value)}>
                        {visibleModules.map((module) => (
                            <option key={module.key} value={module.key}>{module.label}</option>
                        ))}
                    </select>
                </label>
                <label className={styles.field}>
                    <span>Alcance</span>
                    <select value={scopeFilter} onChange={(event) => setScopeFilter(event.target.value as ScopeFilter)}>
                        <option value="all">Todos</option>
                        <option value="match_global">Eventos de partido</option>
                        {privateAllowed ? <option value="club_private">Privado club</option> : null}
                    </select>
                </label>
                <label className={styles.field}>
                    <span>Contexto</span>
                    <select value={contextFilter} onChange={(event) => setContextFilter(event.target.value as 'all' | RugbyPerformanceContext)}>
                        <option value="all">Todos</option>
                        {activeModule.contextOptions.map((context) => (
                            <option key={context} value={context}>{CONTEXT_LABELS[context]}</option>
                        ))}
                    </select>
                </label>
                <label className={styles.field}>
                    <span>Buscar</span>
                    <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Jugador, zona, causa, rival..." />
                </label>
            </div>

            <div className={styles.dashboardGrid}>
                {dashboardCards.map((card) => (
                    <article key={card.title} className={styles.panel}>
                        <span className={styles.panelKicker}>{card.title}</span>
                        <div className={styles.kpiGrid}>
                            {card.kpis.map(([label, value]) => (
                                <div key={label} className={styles.kpiCard}>
                                    <span>{label}</span>
                                    <strong>{value}</strong>
                                </div>
                            ))}
                        </div>
                    </article>
                ))}
            </div>

            <div className={styles.panel}>
                <div className={styles.sectionHead}>
                    <div>
                        <span className={styles.panelKicker}>Alertas para planificar entrenamientos</span>
                        <h3>Lo que el partido le pide al entrenamiento</h3>
                    </div>
                </div>
                <div className={styles.alertList}>
                    {insights.alerts.map((alert) => (
                        <article key={alert.id} className={styles.alertCard}>
                            <span className={cn(styles.alertStripe, alert.level === 'warning' && styles.alertWarning, alert.level === 'danger' && styles.alertDanger)} />
                            <div>
                                <strong>{alert.title}</strong>
                                <small>{alert.detail} Punto a trabajar: {alert.suggestedBlock}</small>
                            </div>
                        </article>
                    ))}
                </div>
            </div>

            <div className={styles.moduleTabs}>
                {visibleModules.map((module) => (
                    <button
                        key={module.key}
                        type="button"
                        className={cn(styles.moduleButton, activeModuleKey === module.key && styles.moduleActive)}
                        onClick={() => setActiveModuleKey(module.key)}
                    >
                        <strong>{module.shortLabel}</strong>
                        <small>{module.scope === 'match_global' ? 'Partido global' : 'Privado club'} · {records.filter((record) => record.moduleKey === module.key).length} filas</small>
                    </button>
                ))}
            </div>

            <div className={styles.spreadsheet}>
                <div className={styles.sectionHead}>
                    <div>
                        <span className={styles.panelKicker}>Vista spreadsheet / Excel</span>
                        <h3>{activeModule.label}</h3>
                        <p>{activeModule.description}</p>
                    </div>
                    <div className={styles.actions}>
                        <input
                            ref={importInputRef}
                            className={styles.hiddenInput}
                            type="file"
                            accept=".csv,text/csv"
                            onChange={(event) => { void handleImportCsv(event); }}
                        />
                        <button type="button" className={styles.ghostButton} onClick={() => importInputRef.current?.click()}>
                            <Upload className="w-4 h-4" />
                            Importar CSV
                        </button>
                        <button type="button" className={styles.ghostButton} onClick={handleExportCsv}>
                            <Download className="w-4 h-4" />
                            Exportar CSV
                        </button>
                    </div>
                </div>

                {loading ? (
                    <div className={styles.empty}>
                        <FileSpreadsheet className="inline-block w-4 h-4 mr-2" />
                        Cargando planilla...
                    </div>
                ) : filteredRows.length === 0 ? (
                    <div className={styles.empty}>No hay filas para este modulo. Agrega una fila o importa un CSV.</div>
                ) : (
                    <div className={styles.tableWrap}>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>Jugador</th>
                                    <th>Contexto</th>
                                    {activeModule.fields.map((field) => (
                                        <th key={field.key}>{field.label}</th>
                                    ))}
                                    <th>Accion</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredRows.map((record) => (
                                    <tr key={record.id}>
                                        <td>
                                            <select
                                                className={cn(styles.tableSelect, styles.playerInput)}
                                                value={record.playerId || record.playerName}
                                                onChange={(event) => handlePlayerChange(record.id, event.target.value)}
                                            >
                                                <option value="">Sin jugador</option>
                                                {record.playerName && !playerOptions.some((player) => player.name === record.playerName || player.id === record.playerId) ? (
                                                    <option value={record.playerName}>{record.playerName}</option>
                                                ) : null}
                                                {playerOptions.map((player) => (
                                                    <option key={player.id} value={player.id}>{player.name}</option>
                                                ))}
                                            </select>
                                        </td>
                                        <td>
                                            <select
                                                className={styles.tableSelect}
                                                value={record.context}
                                                onChange={(event) => handleContextChange(record.id, event.target.value as RugbyPerformanceContext)}
                                            >
                                                {activeModule.contextOptions.map((context) => (
                                                    <option key={context} value={context}>{CONTEXT_LABELS[context]}</option>
                                                ))}
                                            </select>
                                        </td>
                                        {activeModule.fields.map((field) => (
                                            <td key={field.key}>
                                                {field.type === 'select' ? (
                                                    <select
                                                        className={styles.tableSelect}
                                                        value={getFieldValue(record, field)}
                                                        onChange={(event) => handleFieldChange(record.id, field, event.target.value)}
                                                    >
                                                        {(field.options ?? []).map((option) => (
                                                            <option key={option} value={option}>{option}</option>
                                                        ))}
                                                    </select>
                                                ) : (
                                                    <input
                                                        className={cn(styles.tableInput, getFieldClass(field))}
                                                        type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
                                                        value={getFieldValue(record, field)}
                                                        onChange={(event) => handleFieldChange(record.id, field, event.target.value)}
                                                    />
                                                )}
                                            </td>
                                        ))}
                                        <td>
                                            <button type="button" className={styles.iconButton} onClick={() => { void handleDelete(record.id); }} aria-label="Borrar fila">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                <p className={styles.tableMeta}>
                    {filteredRows.length} filas visibles · {dirty ? 'cambios sin guardar' : 'sin cambios pendientes'}
                </p>
            </div>
        </section>
    );
}
