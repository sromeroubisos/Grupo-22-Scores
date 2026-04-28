'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
    Activity,
    BarChart3,
    Calendar,
    CalendarClock,
    CheckCircle2,
    ChevronRight,
    ClipboardList,
    Clock,
    Copy,
    FileBarChart2,
    Filter,
    LayoutDashboard,
    MapPin,
    MoreHorizontal,
    NotebookPen,
    Plus,
    Save,
    Send,
    Shield,
    Target,
    Trash2,
    Users,
    X,
} from 'lucide-react';
import { ClubTrainingCreateModal } from '@/components/admin/entities/club/ClubTrainingCreateModal';
import type { ClubDashboardOverview } from '@/lib/club-admin/dashboard-types';
import type { ClubManageTabId } from '@/lib/club-admin/manageTabs';
import type { SavedPreset } from '@/lib/club-pizarra/types';
import { buildSavedPresetsKey, loadSavedPresets, saveSavedPresets } from '@/lib/club-pizarra/persistence';
import {
    type AttendanceState,
    type PlanBlock,
    type PlanBlockType,
    type TrainingEntry,
    type TrainingEvaluation,
    type TrainingStatus,
    type TrainingType,
} from '@/lib/club-admin/trainings';
import type { Division } from '@/lib/services/divisionService';
import type { PersonWithRole } from '@/lib/services/personService';

type TrainingSegment = 'upcoming' | 'today' | 'past';
type TrainingOperationalFilter = 'all' | 'no_plan' | 'no_attendance' | 'no_eval' | 'no_load';
type PlanTab = 'resumen' | 'plan' | 'convocados' | 'pizarra' | 'evaluacion' | 'stats';
type AttendanceFilter = 'all' | AttendanceState | 'sin_respuesta';

const SEGMENT_TABS: Array<{ id: TrainingSegment; label: string }> = [
    { id: 'upcoming', label: 'Próximos' },
    { id: 'today', label: 'Hoy' },
    { id: 'past', label: 'Pasados' },
];

const TYPE_META: Record<TrainingType, { label: string; className: string }> = {
    campo: { label: 'Campo', className: 'type-field' },
    gimnasio: { label: 'Gimnasio', className: 'type-gym' },
    video: { label: 'Video', className: 'type-video' },
    recuperacion: { label: 'Recuperación', className: 'type-recovery' },
};

const STATUS_META: Record<TrainingStatus, { label: string; tone: string }> = {
    planificado: { label: 'Planificado', tone: 'tone-scheduled' },
    en_curso: { label: 'En curso', tone: 'tone-live' },
    finalizado: { label: 'Finalizado', tone: 'tone-played' },
    sin_evaluar: { label: 'Sin evaluar', tone: 'tone-alert' },
};

const BLOCK_TYPE_LABELS: Record<PlanBlockType, string> = {
    warmup: 'Warm-up',
    tecnico: 'Bloque técnico',
    tactico: 'Bloque táctico',
    fisico: 'Bloque físico',
    cierre: 'Cierre',
};

const BLOCK_TYPE_COLORS: Record<PlanBlockType, string> = {
    warmup: '#a855f7',
    tecnico: '#3b82f6',
    tactico: '#22c55e',
    fisico: '#f59e0b',
    cierre: '#94a3b8',
};

const ATTENDANCE_META: Record<AttendanceState, { label: string; shortLabel: string }> = {
    confirmado: { label: 'Confirmado', shortLabel: 'OK' },
    dudoso: { label: 'Dudoso', shortLabel: 'Duda' },
    ausente: { label: 'Ausente', shortLabel: 'Out' },
};

const BLOCK_FOCUS_LABELS: Record<PlanBlockType, string> = {
    warmup: 'Activacion',
    tecnico: 'Tecnica',
    tactico: 'Tactica',
    fisico: 'Fisico',
    cierre: 'Recuperacion',
};

const INTENSITY_SCORES: Record<string, number> = {
    baja: 3,
    media: 5,
    'media-alta': 7,
    alta: 8,
    maxima: 10,
};

function getNormalizedIntensity(value?: string | null) {
    return (value || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

function getAverageIntensity(blocks: PlanBlock[]) {
    if (blocks.length === 0) {
        return { score: 0, label: 'Sin datos' };
    }

    const totalScore = blocks.reduce((sum, block) => {
        const key = getNormalizedIntensity(block.intensity);
        return sum + (INTENSITY_SCORES[key] ?? 5);
    }, 0);
    const average = totalScore / blocks.length;

    if (average >= 8.5) return { score: average, label: 'Muy alta' };
    if (average >= 7) return { score: average, label: 'Alta' };
    if (average >= 5) return { score: average, label: 'Media' };
    if (average > 0) return { score: average, label: 'Baja' };
    return { score: 0, label: 'Sin datos' };
}

function getInitials(name: string) {
    return name
        .split(' ')
        .map((chunk) => chunk.trim())
        .filter(Boolean)
        .slice(0, 2)
        .map((chunk) => chunk[0]?.toUpperCase() ?? '')
        .join('') || 'JR';
}

function toLocalDateInput(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function toLocalTimeInput(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
}

function buildDateTimeValue(dateValue: string, timeValue: string, fallback: string) {
    if (!dateValue || !timeValue) {
        return fallback;
    }

    const candidate = new Date(`${dateValue}T${timeValue}:00`);
    return Number.isNaN(candidate.getTime()) ? fallback : candidate.toISOString();
}

function getDivisionLabelForTraining(entry: TrainingEntry, divisions: Division[], clubName: string) {
    const match = divisions.find((division) => (
        division.id === entry.divisionId || division.management_id === entry.divisionId
    ));

    if (match?.name?.trim()) {
        return match.name.trim();
    }

    const playerDivision = entry.players?.find((player) => player.divisionName?.trim())?.divisionName?.trim();
    return playerDivision || clubName;
}

function getWorkspaceStatus(entry: TrainingEntry, blocks: PlanBlock[], hasObjective: boolean) {
    if (entry.status === 'finalizado' || entry.status === 'sin_evaluar') {
        return {
            label: 'Finalizado',
            toneClass: 'is-finalizado',
            helper: entry.status === 'sin_evaluar' ? 'Evaluacion pendiente' : 'Sesion cerrada',
        };
    }

    if (!hasObjective || blocks.length === 0) {
        return {
            label: 'Borrador',
            toneClass: 'is-borrador',
            helper: 'Todavia falta completar el plan',
        };
    }

    if (entry.status === 'en_curso') {
        return {
            label: 'Publicado',
            toneClass: 'is-publicado',
            helper: 'Listo para operar con staff y plantel',
        };
    }

    return {
        label: 'Planificado',
        toneClass: 'is-planificado',
        helper: 'Configuracion operativa lista para la semana',
    };
}

function formatDateTime(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return { day: 'Fecha a confirmar', time: '--:--', isoDate: '' };
    }
    return {
        day: new Intl.DateTimeFormat('es-AR', {
            weekday: 'short',
            day: '2-digit',
            month: 'short',
        }).format(date),
        time: new Intl.DateTimeFormat('es-AR', {
            hour: '2-digit',
            minute: '2-digit',
        }).format(date),
        isoDate: date.toISOString().slice(0, 10),
    };
}

function isToday(dateStr: string) {
    const d = new Date(dateStr);
    const now = new Date();
    return d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
}

function isPast(dateStr: string) {
    const d = new Date(dateStr);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return d < now && !isToday(dateStr);
}

function isFuture(dateStr: string) {
    const d = new Date(dateStr);
    const now = new Date();
    now.setHours(23, 59, 59, 999);
    return d > now;
}

function inferOperationalState(entry: TrainingEntry) {
    const hasPlan = (entry.plan?.blocks.length || 0) > 0;
    const hasAttendance = entry.attendance && Object.keys(entry.attendance).length > 0;
    const hasEval = !!entry.evaluation;
    const hasLoad = !!entry.evaluation && entry.evaluation.loadTotal > 0;
    const completed = [hasPlan, hasAttendance, hasEval, hasLoad].filter(Boolean).length;
    return { hasPlan, hasAttendance, hasEval, hasLoad, completed };
}

function isThisWeek(dateStr: string) {
    const d = new Date(dateStr).getTime();
    const now = Date.now();
    return d >= now && d <= now + 7 * 24 * 60 * 60 * 1000;
}

function sortTrainingsByDate(entries: TrainingEntry[]) {
    return [...entries].sort((left, right) => new Date(left.date).getTime() - new Date(right.date).getTime());
}

function matchesTrainingIdentity(
    left: Pick<TrainingEntry, 'id' | 'persistedId' | 'sourceKey'>,
    right: Pick<TrainingEntry, 'id' | 'persistedId' | 'sourceKey'>,
) {
    return (
        Boolean(left.persistedId && right.persistedId && left.persistedId === right.persistedId)
        || Boolean(left.sourceKey && right.sourceKey && left.sourceKey === right.sourceKey)
        || left.id === right.id
    );
}

function isTrainingEntryPayload(value: unknown): value is TrainingEntry {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return false;
    }

    const candidate = value as Record<string, unknown>;
    return (
        typeof candidate.id === 'string'
        && typeof candidate.title === 'string'
        && typeof candidate.date === 'string'
    );
}

function isHiddenTraining(training: TrainingEntry) {
    return training.sourceKind === 'hidden';
}

type PizarraWorkspacePayload = {
    ok?: boolean;
    data?: {
        savedPresets?: SavedPreset[];
    };
    error?: string;
};

interface ClubEntrenamientosTabProps {
    clubId: string;
    clubName: string;
    sport?: string | null;
    divisions: Division[];
    players: PersonWithRole[];
    staff: PersonWithRole[];
    dashboardData: ClubDashboardOverview;
    loading?: boolean;
    onTabChange?: (tabId: ClubManageTabId) => void;
}

export function ClubEntrenamientosTab({
    clubId,
    clubName,
    sport,
    divisions,
    players,
    staff,
    dashboardData,
    loading = false,
    onTabChange,
}: ClubEntrenamientosTabProps) {
    const [trainings, setTrainings] = useState<TrainingEntry[]>([]);
    const [activeSegment, setActiveSegment] = useState<TrainingSegment>('today');
    const [operationalFilter, setOperationalFilter] = useState<TrainingOperationalFilter>('all');
    const [filtersOpen, setFiltersOpen] = useState(false);
    const [createOpen, setCreateOpen] = useState(false);
    const [calendarOpen, setCalendarOpen] = useState(false);
    const [detailOpen, setDetailOpen] = useState<TrainingEntry | null>(null);
    const [detailTab, setDetailTab] = useState<PlanTab>('plan');
    const [persistLoading, setPersistLoading] = useState(false);
    const [persistError, setPersistError] = useState<string | null>(null);
    const [savingTrainingId, setSavingTrainingId] = useState<string | null>(null);
    const [deletingTrainingId, setDeletingTrainingId] = useState<string | null>(null);
    const connectedSummary = useMemo(() => {
        const fragments = [
            `${players.length} jugadores`,
            `${staff.length} integrantes de staff`,
        ];

        if (divisions.length > 0) {
            fragments.unshift(`${divisions.length} equipos vinculados`);
        }

        return fragments.join(' / ');
    }, [divisions.length, players.length, staff.length]);

    useEffect(() => {
        setTrainings([]);
        setDetailOpen(null);
        setPersistError(null);
    }, [clubId]);

    useEffect(() => {
        let cancelled = false;

        const loadPersistedTrainings = async () => {
            if (!clubId) {
                return;
            }

            setPersistLoading(true);
            setPersistError(null);

            try {
                const response = await fetch(`/api/club-admin/trainings?club=${encodeURIComponent(clubId)}`, {
                    cache: 'no-store',
                });
                const payload = await response.json().catch(() => null) as {
                    ok?: boolean;
                    data?: unknown;
                    error?: unknown;
                } | null;

                if (!response.ok || !payload?.ok) {
                    throw new Error(
                        typeof payload?.error === 'string'
                            ? payload.error
                            : 'No se pudieron cargar los entrenamientos guardados'
                    );
                }

                const persistedTrainings = Array.isArray(payload.data)
                    ? payload.data
                        .filter(isTrainingEntryPayload)
                        .filter((training) => !isHiddenTraining(training))
                    : [];

                if (cancelled) {
                    return;
                }

                setTrainings(sortTrainingsByDate(persistedTrainings));
                setDetailOpen((current) => {
                    if (!current) {
                        return current;
                    }

                    return persistedTrainings.find((training) => matchesTrainingIdentity(training, current)) ?? null;
                });
            } catch (error) {
                if (!cancelled) {
                    setPersistError(
                        error instanceof Error
                            ? error.message
                            : 'No se pudieron cargar los entrenamientos guardados'
                    );
                }
            } finally {
                if (!cancelled) {
                    setPersistLoading(false);
                }
            }
        };

        void loadPersistedTrainings();

        return () => {
            cancelled = true;
        };
    }, [clubId]);

    const applyPersistedTraining = (training: TrainingEntry) => {
        const nextVisibleTraining = isHiddenTraining(training) ? null : training;

        setTrainings((current) => (
            nextVisibleTraining
                ? sortTrainingsByDate([
                    ...current.filter((entry) => !matchesTrainingIdentity(entry, training)),
                    nextVisibleTraining,
                ])
                : current.filter((entry) => !matchesTrainingIdentity(entry, training))
        ));

        setDetailOpen((current) => (
            current && matchesTrainingIdentity(current, training)
                ? nextVisibleTraining
                : current
        ));
    };

    const persistTraining = async (training: TrainingEntry) => {
        setSavingTrainingId(training.id);
        setPersistError(null);

        try {
            const response = await fetch('/api/club-admin/trainings', {
                method: training.persistedId ? 'PUT' : 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    clubId,
                    training,
                }),
            });
            const payload = await response.json().catch(() => null) as {
                ok?: boolean;
                data?: unknown;
                error?: unknown;
            } | null;

            if (!response.ok || !payload?.ok || !isTrainingEntryPayload(payload.data)) {
                throw new Error(
                    typeof payload?.error === 'string'
                        ? payload.error
                        : 'No se pudo guardar el entrenamiento'
                );
            }

            applyPersistedTraining(payload.data);
            return payload.data;
        } catch (error) {
            const message = error instanceof Error ? error.message : 'No se pudo guardar el entrenamiento';
            setPersistError(message);
            alert(message);
            return null;
        } finally {
            setSavingTrainingId(null);
        }
    };

    const handleDeleteTraining = async (training: TrainingEntry) => {
        const label = training.title?.trim() || 'este entrenamiento';
        const intro = training.sourceKey
            ? `Vas a ocultar "${label}" de la agenda operativa.`
            : `Vas a borrar "${label}".`;

        if (!window.confirm(`${intro}\n\nEsta accion no se puede deshacer desde esta vista.`)) {
            return;
        }

        setDeletingTrainingId(training.id);
        setPersistError(null);

        try {
            const response = await fetch('/api/club-admin/trainings', {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    clubId,
                    training,
                }),
            });
            const payload = await response.json().catch(() => null) as {
                ok?: boolean;
                error?: unknown;
            } | null;

            if (!response.ok || !payload?.ok) {
                throw new Error(
                    typeof payload?.error === 'string'
                        ? payload.error
                        : 'No se pudo borrar el entrenamiento'
                );
            }

            setTrainings((current) => current.filter((entry) => !matchesTrainingIdentity(entry, training)));
            setDetailOpen((current) => (
                current && matchesTrainingIdentity(current, training)
                    ? null
                    : current
            ));
        } catch (error) {
            const message = error instanceof Error ? error.message : 'No se pudo borrar el entrenamiento';
            setPersistError(message);
            alert(message);
        } finally {
            setDeletingTrainingId(null);
        }
    };

    const filtered = useMemo(() => {
        return trainings.filter((t) => {
            if (activeSegment === 'upcoming' && !isFuture(t.date)) return false;
            if (activeSegment === 'today' && !isToday(t.date)) return false;
            if (activeSegment === 'past' && !isPast(t.date)) return false;

            const state = inferOperationalState(t);
            if (operationalFilter === 'no_plan' && state.hasPlan) return false;
            if (operationalFilter === 'no_attendance' && state.hasAttendance) return false;
            if (operationalFilter === 'no_eval' && state.hasEval) return false;
            if (operationalFilter === 'no_load' && state.hasLoad) return false;
            return true;
        }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }, [trainings, activeSegment, operationalFilter]);

    const nextTraining = trainings
        .filter((t) => isFuture(t.date) || isToday(t.date))
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0] ?? null;

    const kpis = useMemo(() => {
        const stateList = trainings.map(inferOperationalState);
        return [
            {
                id: 'next' as const,
                label: 'Próximo entrenamiento',
                value: nextTraining ? formatDateTime(nextTraining.date).day : 'Sin agenda',
                hint: nextTraining ? `${nextTraining.title} · ${nextTraining.type}` : 'Aún no hay entrenamiento cargado',
                tone: undefined as 'warning' | undefined,
                active: activeSegment === 'upcoming' && operationalFilter === 'all',
                onClick: () => { setActiveSegment('upcoming'); setOperationalFilter('all'); },
            },
            {
                id: 'week' as const,
                label: 'Esta semana',
                value: String(trainings.filter((t) => isThisWeek(t.date)).length).padStart(2, '0'),
                hint: 'Sesiones programadas en los próximos 7 días',
                tone: undefined as 'warning' | undefined,
                active: false,
                onClick: () => { setActiveSegment('upcoming'); setOperationalFilter('all'); },
            },
            {
                id: 'no_plan' as const,
                label: 'Sin plan cargado',
                value: String(stateList.filter((s, i) => !s.hasPlan && (isFuture(trainings[i].date) || isToday(trainings[i].date))).length).padStart(2, '0'),
                hint: 'Entrenamentos que necesitan planificación',
                tone: 'warning' as const,
                active: operationalFilter === 'no_plan',
                onClick: () => { setActiveSegment('upcoming'); setOperationalFilter('no_plan'); },
            },
            {
                id: 'no_eval' as const,
                label: 'Sin evaluación',
                value: String(trainings.filter((t) => isPast(t.date) && t.status === 'sin_evaluar').length).padStart(2, '0'),
                hint: 'Sesiones finalizadas sin cierre de evaluación',
                tone: 'warning' as const,
                active: operationalFilter === 'no_eval',
                onClick: () => { setActiveSegment('past'); setOperationalFilter('no_eval'); },
            },
            {
                id: 'load' as const,
                label: 'Carga acumulada',
                value: `${trainings.reduce((sum, t) => sum + (t.evaluation?.loadTotal || 0), 0)} RPE`,
                hint: 'Suma de cargas registradas en sesiones cerradas',
                tone: undefined as 'warning' | undefined,
                active: false,
                onClick: () => { setActiveSegment('past'); setOperationalFilter('all'); },
            },
            {
                id: 'attendance' as const,
                label: 'Asistencia promedio',
                value: (() => {
                    const withAttendance = trainings.filter((t) => t.attendance && Object.keys(t.attendance).length > 0);
                    if (withAttendance.length === 0) return '--';
                    const total = withAttendance.reduce((sum, t) => sum + Object.keys(t.attendance!).length, 0);
                    return `${Math.round(total / withAttendance.length)} jug.`;
                })(),
                hint: 'Promedio de jugadores con asistencia marcada',
                tone: undefined as 'warning' | undefined,
                active: false,
                onClick: () => { setActiveSegment('past'); setOperationalFilter('all'); },
            },
        ];
    }, [trainings, activeSegment, operationalFilter, nextTraining]);

    const handleCreate = async (newTraining: TrainingEntry) => {
        const saved = await persistTraining(newTraining);
        return Boolean(saved);
    };

    const handleSaveTrainingEntry = async (training: TrainingEntry) => {
        return persistTraining(training);
    };

    const handleDuplicateTraining = async (training: TrainingEntry) => {
        const duplicate: TrainingEntry = {
            ...training,
            id: `manual-${clubId}-${Date.now()}`,
            persistedId: null,
            sourceKey: null,
            sourceKind: 'manual',
            title: `${training.title} (copia)`,
            status: 'planificado',
        };
        const saved = await persistTraining(duplicate);
        if (saved) {
            setDetailOpen(saved);
            setDetailTab('resumen');
        }
        return saved;
    };

    const openDetail = (entry: TrainingEntry, tab: PlanTab = 'resumen') => {
        setDetailOpen(entry);
        setDetailTab(tab);
    };

    return (
        <div className="club-matches-shell">
            {/* Header */}
            <header className="club-matches-header">
                <div className="club-matches-header-copy">
                    <span className="club-matches-kicker">Módulo de entrenamiento</span>
                    <div className="club-matches-heading-row">
                        <div>
                            <h2>Entrenamientos</h2>
                            <p className="text-xs text-white/45 mt-2">
                                Agenda conectada a {connectedSummary} de {clubName}
                            </p>
                            {persistError ? (
                                <p className="text-xs text-amber-300 mt-2">
                                    {persistError}
                                </p>
                            ) : null}
                            {!persistError && persistLoading ? (
                                <p className="text-xs text-white/45 mt-2">
                                    Sincronizando entrenamientos guardados...
                                </p>
                            ) : null}
                            {!persistError && savingTrainingId ? (
                                <p className="text-xs text-white/45 mt-2">
                                    Guardando cambios del entrenamiento...
                                </p>
                            ) : null}
                            {!persistError && deletingTrainingId ? (
                                <p className="text-xs text-white/45 mt-2">
                                    Borrando entrenamiento...
                                </p>
                            ) : null}
                            <p>Planificación, ejecución y análisis de sesiones del equipo</p>
                        </div>
                    </div>
                </div>
                <div className="club-matches-header-actions">
                    <button type="button" className="club-matches-btn club-matches-btn-ghost" onClick={() => setCreateOpen(true)}>
                        <Plus className="w-4 h-4" />
                        Crear entrenamiento
                    </button>
                    <button type="button" className="club-matches-btn club-matches-btn-ghost" onClick={() => setCalendarOpen(true)}>
                        <Calendar className="w-4 h-4" />
                        Ver calendario
                    </button>
                    <button type="button" className="club-matches-btn club-matches-btn-ghost">
                        <ClipboardList className="w-4 h-4" />
                        Plantillas
                    </button>
                    <button type="button" className="club-matches-btn club-matches-btn-primary" onClick={() => setFiltersOpen((c) => !c)}>
                        <Filter className="w-4 h-4" />
                        Filtros
                    </button>
                </div>
            </header>

            {/* KPIs */}
            <section className="club-matches-kpi-grid">
                {kpis.map((kpi) => (
                    <button
                        key={kpi.id}
                        type="button"
                        className={`club-matches-kpi-card${kpi.active ? ' active' : ''}${kpi.tone === 'warning' ? ' warning' : ''}`}
                        onClick={kpi.onClick}
                    >
                        <span className="club-matches-kpi-label">{kpi.label}</span>
                        <strong className="club-matches-kpi-value">{kpi.value}</strong>
                        <span className="club-matches-kpi-hint">{kpi.hint}</span>
                    </button>
                ))}
            </section>

            {/* Filters */}
            <section className={`club-matches-filters${filtersOpen ? ' open' : ''}`}>
                <div className="club-matches-filter-grid">
                    <label>
                        <span>Estado operativo</span>
                        <select value={operationalFilter} onChange={(e) => setOperationalFilter(e.target.value as TrainingOperationalFilter)}>
                            <option value="all">Todos</option>
                            <option value="no_plan">Sin plan cargado</option>
                            <option value="no_attendance">Sin asistencia</option>
                            <option value="no_eval">Sin evaluación</option>
                            <option value="no_load">Sin carga registrada</option>
                        </select>
                    </label>
                </div>
            </section>

            {/* Tabs */}
            <nav className="club-matches-tabs" aria-label="Segmentación de entrenamientos">
                {[...SEGMENT_TABS].sort((left, right) => {
                    const segmentOrder: Record<TrainingSegment, number> = {
                        today: 0,
                        upcoming: 1,
                        past: 2,
                    };
                    return segmentOrder[left.id] - segmentOrder[right.id];
                }).map((tab) => (
                    <button
                        key={tab.id}
                        type="button"
                        className={`club-matches-tab${activeSegment === tab.id ? ' active' : ''}`}
                        onClick={() => setActiveSegment(tab.id)}
                    >
                        {tab.label}
                    </button>
                ))}
            </nav>

            {/* Timeline */}
            <main className="club-matches-timeline">
                {filtered.length === 0 ? (
                    <div className="club-matches-empty">
                        {(loading || persistLoading) && trainings.length === 0
                            ? 'Cargando entrenamientos del club...'
                            : persistError && trainings.length === 0
                                ? 'No se pudieron cargar los entrenamientos del club.'
                                : trainings.length === 0
                                ? 'No hay entrenamientos cargados.'
                                : 'No encontramos entrenamientos para los filtros actuales.'}
                    </div>
                ) : null}

                {filtered.map((entry) => {
                    const when = formatDateTime(entry.date);
                    const state = inferOperationalState(entry);
                    const statusMeta = STATUS_META[entry.status];
                    const typeMeta = TYPE_META[entry.type];
                    const needsAction = entry.status === 'sin_evaluar' || (entry.status === 'planificado' && !state.hasPlan);

                    return (
                        <article
                            key={entry.id}
                            className={`club-match-card${needsAction ? ' has-pending' : ''}`}
                        >
                            <div className="club-match-card-main">
                                <div className="club-match-card-header">
                                    <div className="club-match-card-date">
                                        <span>{when.day}</span>
                                        <strong>{when.time}</strong>
                                    </div>
                                    <div className="club-match-card-identity">
                                        <div className="club-match-card-title-wrap">
                                            <h3>{entry.title}</h3>
                                        </div>
                                        <div className="club-match-card-meta">
                                            <span className={`club-match-status ${statusMeta.tone}`}>{statusMeta.label}</span>
                                            <span className={`club-training-type-badge ${typeMeta.className}`}>{typeMeta.label}</span>
                                            <span className="club-match-origin">{entry.location}</span>
                                        </div>
                                        <div className="club-match-card-meta" style={{ marginTop: 4 }}>
                                            <span><Clock className="w-3.5 h-3.5" /> {entry.duration} min</span>
                                            <span><Target className="w-3.5 h-3.5" /> {entry.objective}</span>
                                            <span><Users className="w-3.5 h-3.5" /> {entry.convocados || '--'} convocados</span>
                                        </div>
                                    </div>
                                </div>

                                <section className="club-match-operational">
                                    <div className="club-match-operational-head">
                                        <div>
                                            <span className="club-match-operational-label">Estado operativo</span>
                                            <strong>Progreso {state.completed}/4</strong>
                                        </div>
                                        {needsAction ? (
                                            <span className="club-match-operational-alert">Requiere acción</span>
                                        ) : (
                                            <span className="club-match-operational-ok">Operativo</span>
                                        )}
                                    </div>

                                    <div className="club-training-status-dots">
                                        <div className="club-training-status-item">
                                            <div className={`club-training-status-dot ${state.hasPlan ? 'is-complete' : 'is-pending'}`} />
                                            <span>Plan</span>
                                        </div>
                                        <div className="club-training-status-item">
                                            <div className={`club-training-status-dot ${state.hasAttendance ? 'is-complete' : 'is-pending'}`} />
                                            <span>Asist</span>
                                        </div>
                                        <div className="club-training-status-item">
                                            <div className={`club-training-status-dot ${state.hasEval ? 'is-complete' : 'is-pending'}`} />
                                            <span>Eval</span>
                                        </div>
                                        <div className="club-training-status-item">
                                            <div className={`club-training-status-dot ${state.hasLoad ? 'is-complete' : 'is-pending'}`} />
                                            <span>Carga</span>
                                        </div>
                                    </div>

                                    <div className="club-match-indicators">
                                        <span><Users className="w-3.5 h-3.5" /> {entry.staff.join(', ') || 'Sin staff asignado'}</span>
                                        {entry.evaluation && (
                                            <span><Activity className="w-3.5 h-3.5" /> Carga: {entry.evaluation.loadTotal} RPE</span>
                                        )}
                                    </div>
                                </section>
                            </div>

                            <div className="club-match-actions">
                                <button
                                    type="button"
                                    className="club-match-action primary"
                                    onClick={() => openDetail(entry, 'plan')}
                                >
                                    {state.hasPlan ? 'Ver plan' : 'Cargar plan'}
                                    <ChevronRight className="w-4 h-4" />
                                </button>
                                <button type="button" className="club-match-action" onClick={() => openDetail(entry, 'convocados')}>
                                    <Users className="w-4 h-4" />
                                    Convocados
                                </button>
                                {entry.status !== 'finalizado' && (
                                    <button type="button" className="club-match-action" onClick={() => openDetail(entry, 'evaluacion')}>
                                        <NotebookPen className="w-4 h-4" />
                                        Evaluación
                                    </button>
                                )}
                                {entry.status === 'finalizado' && (
                                    <button type="button" className="club-match-action" onClick={() => openDetail(entry, 'stats')}>
                                        <BarChart3 className="w-4 h-4" />
                                        Stats
                                    </button>
                                )}
                                <button type="button" className="club-match-action" onClick={() => { /* export */ }}>
                                    <FileBarChart2 className="w-4 h-4" />
                                    Exportar
                                </button>
                                <button
                                    type="button"
                                    className="club-match-action danger"
                                    onClick={() => handleDeleteTraining(entry)}
                                    disabled={deletingTrainingId === entry.id}
                                >
                                    <Trash2 className="w-4 h-4" />
                                    {deletingTrainingId === entry.id ? 'Borrando...' : 'Borrar'}
                                </button>
                            </div>
                        </article>
                    );
                })}
            </main>

            <ClubTrainingCreateModal
                key={`${clubId}-${createOpen ? 'open' : 'closed'}`}
                open={createOpen}
                clubId={clubId}
                clubName={clubName}
                sport={sport}
                divisions={divisions}
                players={players}
                staff={staff}
                dashboardData={dashboardData}
                onClose={() => setCreateOpen(false)}
                onCreate={handleCreate}
            />

            {/* Calendar Modal */}
            {calendarOpen && (
                <div className="club-training-modal-overlay" onClick={() => setCalendarOpen(false)}>
                    <div className="club-training-modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
                        <div className="club-training-modal-header">
                            <h3>Calendario de entrenamientos</h3>
                            <button onClick={() => setCalendarOpen(false)} className="icon-btn"><X className="w-5 h-5" /></button>
                        </div>
                        <div className="club-training-modal-body">
                            <div className="space-y-2">
                                {trainings
                                    .filter((t) => isFuture(t.date) || isToday(t.date))
                                    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                                    .map((t) => {
                                        const w = formatDateTime(t.date);
                                        const tm = TYPE_META[t.type];
                                        return (
                                            <div key={t.id} className="flex items-center gap-4 p-3 bg-white/5 rounded-xl border border-white/5">
                                                <div className="text-center min-w-[70px]">
                                                    <div className="text-xs text-white/40 uppercase">{w.day.split(' ')[0]}</div>
                                                    <div className="text-lg font-bold">{w.day.split(' ')[1]}</div>
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-sm font-bold truncate">{t.title}</div>
                                                    <div className="text-xs text-white/50">{w.time} · <span className={`club-training-type-badge ${tm.className}`} style={{ fontSize: 9, padding: '1px 6px' }}>{tm.label}</span> · {t.location}</div>
                                                </div>
                                                <button className="text-xs px-3 py-1.5 bg-white/10 rounded-lg hover:bg-white/20" onClick={() => { setCalendarOpen(false); openDetail(t); }}>
                                                    Ver
                                                </button>
                                            </div>
                                        );
                                    })}
                                {trainings.filter((t) => isFuture(t.date) || isToday(t.date)).length === 0 && (
                                    <div className="text-center text-white/40 py-8">No hay entrenamientos próximos</div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Detail Modal */}
            {detailOpen && (
                <TrainingWorkspaceModal
                    key={detailOpen.persistedId || detailOpen.sourceKey || detailOpen.id}
                    entry={detailOpen}
                    clubId={clubId}
                    clubName={clubName}
                    sport={sport}
                    divisions={divisions}
                    initialTab={detailTab}
                    onClose={() => setDetailOpen(null)}
                    onSaveEntry={handleSaveTrainingEntry}
                    onDeleteTraining={handleDeleteTraining}
                    onDuplicateTraining={handleDuplicateTraining}
                    onTabChange={onTabChange}
                />
            )}
        </div>
    );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function TrainingDetailModal({
    entry,
    initialTab,
    onClose,
    onSavePlan,
    onSaveEval,
    onSaveAttendance,
}: {
    entry: TrainingEntry;
    initialTab: PlanTab;
    onClose: () => void;
    onSavePlan: (id: string, blocks: PlanBlock[]) => Promise<void>;
    onSaveEval: (id: string, evaluation: TrainingEvaluation) => Promise<void>;
    onSaveAttendance: (id: string, attendance: Record<string, AttendanceState>) => Promise<void>;
}) {
    const [tab, setTab] = useState<PlanTab>(initialTab);
    const [planBlocks, setPlanBlocks] = useState<PlanBlock[]>(entry.plan?.blocks || []);
    const [evalForm, setEvalForm] = useState<TrainingEvaluation>(entry.evaluation || {
        rpe: 5,
        durationReal: entry.duration,
        loadTotal: 0,
        notes: '',
        energy: 7,
        fatigue: 3,
        injuries: '',
    });
    const [attendance, setAttendance] = useState<Record<string, AttendanceState>>(entry.attendance || {});

    const tabs: Array<{ id: PlanTab; label: string; icon: ReactNode }> = [
        { id: 'plan', label: 'Plan', icon: <ClipboardList className="w-3.5 h-3.5" /> },
        { id: 'pizarra', label: 'Pizarra', icon: <Target className="w-3.5 h-3.5" /> },
        { id: 'convocados', label: 'Convocados', icon: <Users className="w-3.5 h-3.5" /> },
        { id: 'evaluacion', label: 'Evaluación', icon: <NotebookPen className="w-3.5 h-3.5" /> },
        { id: 'stats', label: 'Stats', icon: <BarChart3 className="w-3.5 h-3.5" /> },
    ];

    const addBlock = (type: PlanBlockType) => {
        const newBlock: PlanBlock = {
            id: `blk-${type}-${planBlocks.length + 1}`,
            type,
            title: '',
            duration: 15,
            notes: '',
        };
        setPlanBlocks((prev) => [...prev, newBlock]);
    };

    const updateBlock = (id: string, patch: Partial<PlanBlock>) => {
        setPlanBlocks((prev) => prev.map((b) => b.id === id ? { ...b, ...patch } : b));
    };

    const removeBlock = (id: string) => {
        setPlanBlocks((prev) => prev.filter((b) => b.id !== id));
    };

    const moveBlock = (id: string, direction: 'up' | 'down') => {
        setPlanBlocks((prev) => {
            const idx = prev.findIndex((b) => b.id === id);
            if (idx < 0) return prev;
            const newIdx = direction === 'up' ? idx - 1 : idx + 1;
            if (newIdx < 0 || newIdx >= prev.length) return prev;
            const next = [...prev];
            [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
            return next;
        });
    };

    const rosterPlayers = useMemo(
        () => entry.players ?? [],
        [entry.players]
    );
    const totalDuration = planBlocks.reduce((sum, b) => sum + (b.duration || 0), 0);

    return (
        <div className="club-training-modal-overlay" onClick={onClose}>
            <div className="club-training-modal" style={{ maxWidth: 720 }} onClick={(e) => e.stopPropagation()}>
                <div className="club-training-modal-header">
                    <div>
                        <h3>{entry.title}</h3>
                        <div className="text-xs text-white/50 mt-1">
                            {formatDateTime(entry.date).day} · {formatDateTime(entry.date).time} · {entry.location}
                        </div>
                    </div>
                    <button onClick={onClose} className="icon-btn"><X className="w-5 h-5" /></button>
                </div>

                <div className="club-training-detail-tabs">
                    {tabs.map((t) => (
                        <button
                            key={t.id}
                            type="button"
                            className={`club-training-detail-tab${tab === t.id ? ' active' : ''}`}
                            onClick={() => setTab(t.id)}
                        >
                            {t.icon}
                            {t.label}
                        </button>
                    ))}
                </div>

                <div className="club-training-modal-body" style={{ minHeight: 320 }}>
                    {tab === 'plan' && (
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <div className="text-xs text-white/50 uppercase tracking-wider font-bold">Bloques de trabajo · {totalDuration} min totales</div>
                                <button className="text-xs flex items-center gap-1 text-white/60 hover:text-white" onClick={() => { void onSavePlan(entry.id, planBlocks); }}>
                                    <Save className="w-3.5 h-3.5" /> Guardar plan
                                </button>
                            </div>
                            {planBlocks.map((block, idx) => (
                                <div key={block.id} className="club-training-plan-block" style={{ borderLeft: `4px solid ${BLOCK_TYPE_COLORS[block.type]}` }}>
                                    <div className="club-training-plan-block-header">
                                        <span>{BLOCK_TYPE_LABELS[block.type]}</span>
                                        <div className="flex items-center gap-2">
                                            <button className="text-white/40 hover:text-white" onClick={() => moveBlock(block.id, 'up')} disabled={idx === 0}>↑</button>
                                            <button className="text-white/40 hover:text-white" onClick={() => moveBlock(block.id, 'down')} disabled={idx === planBlocks.length - 1}>↓</button>
                                            <button className="text-white/40 hover:text-red-400" onClick={() => removeBlock(block.id)}>×</button>
                                        </div>
                                    </div>
                                    <input
                                        className="club-training-form-input"
                                        value={block.title}
                                        onChange={(e) => updateBlock(block.id, { title: e.target.value })}
                                        placeholder="Título del bloque"
                                        style={{ fontWeight: 700 }}
                                    />
                                    <div className="grid grid-cols-2 gap-3">
                                        <label>
                                            <span className="club-training-form-label">Duración (min)</span>
                                            <input
                                                type="number"
                                                className="club-training-form-input"
                                                value={block.duration}
                                                onChange={(e) => updateBlock(block.id, { duration: Number(e.target.value) })}
                                            />
                                        </label>
                                        {block.type === 'fisico' || block.type === 'tecnico' ? (
                                            <label>
                                                <span className="club-training-form-label">Intensidad</span>
                                                <select
                                                    className="club-training-form-select"
                                                    value={block.intensity || ''}
                                                    onChange={(e) => updateBlock(block.id, { intensity: e.target.value })}
                                                >
                                                    <option value="">Seleccionar...</option>
                                                    <option value="Baja">Baja</option>
                                                    <option value="Media">Media</option>
                                                    <option value="Media-Alta">Media-Alta</option>
                                                    <option value="Alta">Alta</option>
                                                    <option value="Máxima">Máxima</option>
                                                </select>
                                            </label>
                                        ) : null}
                                    </div>
                                    <textarea
                                        className="club-training-form-textarea"
                                        value={block.notes}
                                        onChange={(e) => updateBlock(block.id, { notes: e.target.value })}
                                        placeholder="Notas del bloque..."
                                        rows={2}
                                    />
                                    {block.type === 'tactico' && (
                                        <div className="club-training-plan-block-pizarra">
                                            <Target className="w-4 h-4 text-[#3b82f6]" />
                                            [ PIZARRA ASOCIADA: Puedes insertar jugadas y formaciones desde el módulo Pizarra ]
                                        </div>
                                    )}
                                </div>
                            ))}
                            {planBlocks.length === 0 && (
                                <div className="text-center text-white/40 py-6">No hay bloques cargados. Agregá el primero.</div>
                            )}
                            <div className="grid grid-cols-5 gap-2">
                                {(['warmup', 'tecnico', 'tactico', 'fisico', 'cierre'] as PlanBlockType[]).map((bt) => (
                                    <button key={bt} className="club-training-add-block" onClick={() => addBlock(bt)}>
                                        <Plus className="w-3.5 h-3.5" /> {BLOCK_TYPE_LABELS[bt]}
                                    </button>
                                ))}
                            </div>
                            <div className="flex gap-3 pt-2">
                                <button
                                    className="btn"
                                    style={{ flex: 1 }}
                                    onClick={() => alert('TODO técnico: guardado de plantillas aún no implementado.')}
                                >
                                    <Copy className="w-4 h-4" /> Guardar como plantilla
                                </button>
                                <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => { void onSavePlan(entry.id, planBlocks); }}>
                                    <Save className="w-4 h-4" /> Publicar plan
                                </button>
                            </div>
                        </div>
                    )}

                    {tab === 'pizarra' && (
                        <div className="space-y-4">
                            <div className="club-training-plan-block-pizarra" style={{ padding: '2rem', justifyContent: 'center' }}>
                                <Target className="w-6 h-6 text-[#3b82f6]" />
                                <span className="text-sm">Integración con módulo Pizarra próximamente</span>
                            </div>
                            <p className="text-sm text-white/50">
                                Acá podrás insertar jugadas, animaciones y formaciones guardadas directamente vinculadas a este entrenamiento.
                            </p>
                        </div>
                    )}

                    {tab === 'convocados' && (
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <div className="text-xs text-white/50 uppercase tracking-wider font-bold">
                                    {Object.keys(attendance).length} / {rosterPlayers.length} jugadores
                                </div>
                                <button
                                    className="text-xs flex items-center gap-1 text-white/60 hover:text-white"
                                    onClick={() => {
                                        const all: Record<string, AttendanceState> = {};
                                        rosterPlayers.forEach((p) => { all[p.id] = 'confirmado'; });
                                        setAttendance(all);
                                    }}
                                >
                                    <CheckCircle2 className="w-3.5 h-3.5" /> Confirmar todos
                                </button>
                            </div>
                            {rosterPlayers.map((p) => (
                                <div key={p.id} className="club-training-convocado-row">
                                    <div>
                                        <div className="club-training-convocado-name">{p.name}</div>
                                        <div className="club-training-convocado-pos">{p.pos}</div>
                                    </div>
                                    <div className="flex gap-2">
                                        {(['confirmado', 'ausente', 'dudoso'] as AttendanceState[]).map((st) => (
                                            <button
                                                key={st}
                                                className={`club-training-convocado-status${attendance[p.id] === st ? ` ${st}` : ''}`}
                                                style={attendance[p.id] !== st ? { opacity: 0.4, borderColor: 'transparent', background: 'transparent' } : {}}
                                                onClick={() => setAttendance((prev) => ({ ...prev, [p.id]: st }))}
                                            >
                                                {st}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ))}
                            {rosterPlayers.length === 0 && (
                                <div className="text-center text-white/40 py-6">
                                    No hay jugadores reales vinculados a este entrenamiento todavia.
                                </div>
                            )}
                            <button className="btn btn-primary w-full" onClick={() => { void onSaveAttendance(entry.id, attendance); }}>
                                <Save className="w-4 h-4" /> Guardar asistencia
                            </button>
                        </div>
                    )}

                    {tab === 'evaluacion' && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <label>
                                    <span className="club-training-form-label">RPE (1-10)</span>
                                    <input
                                        type="number"
                                        min={1}
                                        max={10}
                                        className="club-training-form-input"
                                        value={evalForm.rpe}
                                        onChange={(e) => setEvalForm({ ...evalForm, rpe: Number(e.target.value) })}
                                    />
                                </label>
                                <label>
                                    <span className="club-training-form-label">Duración real (min)</span>
                                    <input
                                        type="number"
                                        className="club-training-form-input"
                                        value={evalForm.durationReal}
                                        onChange={(e) => setEvalForm({ ...evalForm, durationReal: Number(e.target.value) })}
                                    />
                                </label>
                                <label>
                                    <span className="club-training-form-label">Carga total (RPE × min)</span>
                                    <input
                                        type="number"
                                        className="club-training-form-input"
                                        value={evalForm.loadTotal || evalForm.rpe * evalForm.durationReal}
                                        onChange={(e) => setEvalForm({ ...evalForm, loadTotal: Number(e.target.value) })}
                                    />
                                </label>
                                <label>
                                    <span className="club-training-form-label">Energía del grupo (1-10)</span>
                                    <input
                                        type="number"
                                        min={1}
                                        max={10}
                                        className="club-training-form-input"
                                        value={evalForm.energy}
                                        onChange={(e) => setEvalForm({ ...evalForm, energy: Number(e.target.value) })}
                                    />
                                </label>
                                <label>
                                    <span className="club-training-form-label">Fatiga (1-10)</span>
                                    <input
                                        type="number"
                                        min={1}
                                        max={10}
                                        className="club-training-form-input"
                                        value={evalForm.fatigue}
                                        onChange={(e) => setEvalForm({ ...evalForm, fatigue: Number(e.target.value) })}
                                    />
                                </label>
                                <label>
                                    <span className="club-training-form-label">Lesiones / Observaciones</span>
                                    <input
                                        className="club-training-form-input"
                                        value={evalForm.injuries}
                                        onChange={(e) => setEvalForm({ ...evalForm, injuries: e.target.value })}
                                        placeholder="Ninguna / Detalle..."
                                    />
                                </label>
                            </div>
                            <label>
                                <span className="club-training-form-label">Notas del staff</span>
                                <textarea
                                    className="club-training-form-textarea"
                                    value={evalForm.notes}
                                    onChange={(e) => setEvalForm({ ...evalForm, notes: e.target.value })}
                                    placeholder="Observaciones generales de la sesión..."
                                    rows={4}
                                />
                            </label>
                            <button className="btn btn-primary w-full" onClick={() => { void onSaveEval(entry.id, evalForm); }}>
                                <Save className="w-4 h-4" /> Guardar evaluación y cerrar sesión
                            </button>
                        </div>
                    )}

                    {tab === 'stats' && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-3 gap-3">
                                <div className="club-training-plan-block text-center">
                                    <div className="text-xs text-white/50 uppercase tracking-wider">Carga sesión</div>
                                    <div className="text-2xl font-bold mt-1">{entry.evaluation?.loadTotal || 0}</div>
                                    <div className="text-xs text-white/40">RPE total</div>
                                </div>
                                <div className="club-training-plan-block text-center">
                                    <div className="text-xs text-white/50 uppercase tracking-wider">Duración</div>
                                    <div className="text-2xl font-bold mt-1">{entry.evaluation?.durationReal || entry.duration}</div>
                                    <div className="text-xs text-white/40">minutos</div>
                                </div>
                                <div className="club-training-plan-block text-center">
                                    <div className="text-xs text-white/50 uppercase tracking-wider">RPE promedio</div>
                                    <div className="text-2xl font-bold mt-1">{entry.evaluation?.rpe || '-'}</div>
                                    <div className="text-xs text-white/40">percepción</div>
                                </div>
                            </div>
                            <div className="club-training-plan-block">
                                <div className="text-xs text-white/50 uppercase tracking-wider font-bold mb-2">Serie histórica</div>
                                <p className="text-sm text-white/55 leading-relaxed">
                                    TODO técnico: conectar una serie histórica real desde `club_trainings`
                                    antes de mostrar comparativas semanales de carga.
                                </p>
                            </div>
                            <div className="club-training-plan-block">
                                <div className="text-xs text-white/50 uppercase tracking-wider font-bold mb-2">Estado del equipo</div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <div className="text-xs text-white/40 mb-1">Energía</div>
                                        <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                                            <div className="h-full rounded-full bg-green-500" style={{ width: `${(entry.evaluation?.energy || 0) * 10}%` }} />
                                        </div>
                                    </div>
                                    <div>
                                        <div className="text-xs text-white/40 mb-1">Fatiga</div>
                                        <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                                            <div className="h-full rounded-full bg-amber-500" style={{ width: `${(entry.evaluation?.fatigue || 0) * 10}%` }} />
                                        </div>
                                    </div>
                                </div>
                                {entry.evaluation?.injuries && (
                                    <div className="mt-3 text-sm text-red-300">
                                        ⚠️ {entry.evaluation.injuries}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function TrainingWorkspaceModal({
    entry,
    clubId,
    clubName,
    sport,
    divisions,
    initialTab,
    onClose,
    onSaveEntry,
    onDeleteTraining,
    onDuplicateTraining,
    onTabChange,
}: {
    entry: TrainingEntry;
    clubId: string;
    clubName: string;
    sport?: string | null;
    divisions: Division[];
    initialTab: PlanTab;
    onClose: () => void;
    onSaveEntry: (training: TrainingEntry) => Promise<TrainingEntry | null>;
    onDeleteTraining: (training: TrainingEntry) => Promise<void>;
    onDuplicateTraining: (training: TrainingEntry) => Promise<TrainingEntry | null>;
    onTabChange?: (tabId: ClubManageTabId) => void;
}) {
    const [tab, setTab] = useState<PlanTab>(initialTab);
    const [saving, setSaving] = useState(false);
    const [actionsOpen, setActionsOpen] = useState(false);
    const [title, setTitle] = useState(entry.title);
    const titleInputRef = useRef<HTMLTextAreaElement | null>(null);
    const [scheduledDate, setScheduledDate] = useState(() => toLocalDateInput(entry.date));
    const [scheduledTime, setScheduledTime] = useState(() => toLocalTimeInput(entry.date));
    const [location, setLocation] = useState(entry.location);
    const [objective, setObjective] = useState(entry.objective);
    const [planBlocks, setPlanBlocks] = useState<PlanBlock[]>(entry.plan?.blocks || []);
    const [evalForm, setEvalForm] = useState<TrainingEvaluation>(entry.evaluation || {
        rpe: 5,
        durationReal: entry.duration,
        loadTotal: 0,
        notes: '',
        energy: 7,
        fatigue: 3,
        injuries: '',
    });
    const [attendance, setAttendance] = useState<Record<string, AttendanceState>>(entry.attendance || {});
    const [attendanceQuery, setAttendanceQuery] = useState('');
    const [attendanceFilter, setAttendanceFilter] = useState<AttendanceFilter>('all');
    const [pizarraPresets, setPizarraPresets] = useState<SavedPreset[]>([]);
    const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
    const [loadingPizarra, setLoadingPizarra] = useState(false);
    const [pizarraLoaded, setPizarraLoaded] = useState(false);
    const [pizarraError, setPizarraError] = useState<string | null>(null);
    const resolvedPizarraSport = useMemo(() => (sport?.trim() || 'rugby'), [sport]);
    const savedPresetsStorageKey = useMemo(
        () => buildSavedPresetsKey(clubId, resolvedPizarraSport),
        [clubId, resolvedPizarraSport]
    );

    useEffect(() => {
        setTab(initialTab);
    }, [initialTab]);

    useEffect(() => {
        if (!titleInputRef.current) return;
        titleInputRef.current.style.height = 'auto';
        titleInputRef.current.style.height = `${titleInputRef.current.scrollHeight}px`;
    }, [title]);

    useEffect(() => {
        if (!clubId) {
            return;
        }

        const cachedPresets = loadSavedPresets(savedPresetsStorageKey, resolvedPizarraSport);
        if (cachedPresets.length === 0) {
            return;
        }

        setPizarraPresets((current) => (current.length > 0 ? current : cachedPresets));
        setSelectedPresetId((current) => (
            current && cachedPresets.some((preset) => preset.id === current)
                ? current
                : cachedPresets[0]?.id ?? null
        ));
    }, [clubId, resolvedPizarraSport, savedPresetsStorageKey]);

    useEffect(() => {
        if (pizarraLoaded || loadingPizarra || !clubId) {
            return;
        }

        let cancelled = false;

        const loadPizarraPresets = async () => {
            setLoadingPizarra(true);
            setPizarraError(null);

            try {
                const response = await fetch(
                    `/api/club-admin/pizarra?club=${encodeURIComponent(clubId)}&sport=${encodeURIComponent(resolvedPizarraSport)}&view=presets`,
                    {
                        cache: 'no-store',
                    }
                );
                const payload = await response.json().catch(() => null) as PizarraWorkspacePayload | null;

                if (!response.ok || !payload?.ok) {
                    throw new Error(payload?.error || 'No se pudieron cargar las jugadas guardadas del club');
                }

                if (cancelled) {
                    return;
                }

                const presets = Array.isArray(payload.data?.savedPresets)
                    ? payload.data.savedPresets
                    : [];

                saveSavedPresets(savedPresetsStorageKey, presets);
                setPizarraPresets(presets);
                setSelectedPresetId((current) => (
                    current && presets.some((preset) => preset.id === current)
                        ? current
                        : presets[0]?.id ?? null
                ));
                setPizarraLoaded(true);
            } catch (error) {
                if (cancelled) {
                    return;
                }

                setPizarraError(
                    error instanceof Error
                        ? error.message
                        : 'No se pudieron cargar las jugadas guardadas del club'
                );
                setPizarraLoaded(true);
            } finally {
                if (!cancelled) {
                    setLoadingPizarra(false);
                }
            }
        };

        void loadPizarraPresets();

        return () => {
            cancelled = true;
        };
    }, [clubId, loadingPizarra, pizarraLoaded, resolvedPizarraSport, savedPresetsStorageKey]);

    useEffect(() => {
        setSelectedPresetId((current) => {
            if (pizarraPresets.length === 0) {
                return null;
            }

            return current && pizarraPresets.some((preset) => preset.id === current)
                ? current
                : pizarraPresets[0]?.id ?? null;
        });
    }, [pizarraPresets]);

    const tabs: Array<{ id: PlanTab; label: string; icon: ReactNode; hint: string }> = [
        { id: 'resumen', label: 'Resumen', icon: <LayoutDashboard className="w-4 h-4" />, hint: 'Panorama general' },
        { id: 'plan', label: 'Plan', icon: <ClipboardList className="w-4 h-4" />, hint: 'Bloques y ritmo' },
        { id: 'convocados', label: 'Convocados', icon: <Users className="w-4 h-4" />, hint: 'Asistencia y respuestas' },
        { id: 'pizarra', label: 'Pizarra', icon: <Target className="w-4 h-4" />, hint: 'Secuencias tacticas' },
        { id: 'evaluacion', label: 'Evaluacion', icon: <NotebookPen className="w-4 h-4" />, hint: 'Carga y cierre' },
        { id: 'stats', label: 'Stats', icon: <BarChart3 className="w-4 h-4" />, hint: 'Lectura rapida' },
    ];

    const addBlock = (type: PlanBlockType) => {
        const newBlock: PlanBlock = {
            id: `blk-${type}-${planBlocks.length + 1}`,
            type,
            title: '',
            duration: 15,
            notes: '',
        };
        setPlanBlocks((prev) => [...prev, newBlock]);
    };

    const updateBlock = (id: string, patch: Partial<PlanBlock>) => {
        setPlanBlocks((prev) => prev.map((block) => (
            block.id === id ? { ...block, ...patch } : block
        )));
    };

    const removeBlock = (id: string) => {
        setPlanBlocks((prev) => prev.filter((block) => block.id !== id));
    };

    const moveBlock = (id: string, direction: 'up' | 'down') => {
        setPlanBlocks((prev) => {
            const index = prev.findIndex((block) => block.id === id);
            if (index < 0) return prev;
            const targetIndex = direction === 'up' ? index - 1 : index + 1;
            if (targetIndex < 0 || targetIndex >= prev.length) return prev;
            const next = [...prev];
            [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
            return next;
        });
    };

    const rosterPlayers = useMemo(
        () => entry.players ?? [],
        [entry.players]
    );
    const scheduledDateTime = useMemo(
        () => buildDateTimeValue(scheduledDate, scheduledTime, entry.date),
        [entry.date, scheduledDate, scheduledTime]
    );
    const formattedSchedule = useMemo(
        () => formatDateTime(scheduledDateTime),
        [scheduledDateTime]
    );
    const divisionLabel = useMemo(
        () => getDivisionLabelForTraining(entry, divisions, clubName),
        [clubName, divisions, entry]
    );
    const totalDuration = useMemo(
        () => planBlocks.reduce((sum, block) => sum + (block.duration || 0), 0),
        [planBlocks]
    );
    const averageIntensity = useMemo(() => getAverageIntensity(planBlocks), [planBlocks]);
    const projectedLoad = useMemo(
        () => Math.round(totalDuration * averageIntensity.score),
        [averageIntensity.score, totalDuration]
    );
    const computedLoad = useMemo(
        () => Math.max(0, evalForm.rpe * evalForm.durationReal),
        [evalForm.durationReal, evalForm.rpe]
    );
    const normalizedAttendance = useMemo(
        () => Object.fromEntries(
            Object.entries(attendance).filter(([, value]) => Boolean(value))
        ) as Record<string, AttendanceState>,
        [attendance]
    );
    const attendanceSummary = useMemo(() => {
        return rosterPlayers.reduce((acc, player) => {
            const status = attendance[player.id];
            if (!status) {
                acc.sin_respuesta += 1;
                return acc;
            }
            acc[status] += 1;
            return acc;
        }, {
            confirmado: 0,
            dudoso: 0,
            ausente: 0,
            sin_respuesta: 0,
        });
    }, [attendance, rosterPlayers]);
    const visiblePlayers = useMemo(() => {
        const query = attendanceQuery.trim().toLowerCase();
        return rosterPlayers.filter((player) => {
            const status = attendance[player.id];
            if (attendanceFilter !== 'all') {
                if (attendanceFilter === 'sin_respuesta' && status) return false;
                if (attendanceFilter !== 'sin_respuesta' && status !== attendanceFilter) return false;
            }

            if (!query) return true;
            return player.name.toLowerCase().includes(query) || player.pos.toLowerCase().includes(query);
        });
    }, [attendance, attendanceFilter, attendanceQuery, rosterPlayers]);
    const biggestBlock = useMemo(
        () => [...planBlocks].sort((left, right) => right.duration - left.duration)[0] ?? null,
        [planBlocks]
    );
    const planDistribution = useMemo(() => (
        (Object.keys(BLOCK_TYPE_LABELS) as PlanBlockType[])
            .map((type) => ({
                type,
                label: BLOCK_TYPE_LABELS[type],
                minutes: planBlocks
                    .filter((block) => block.type === type)
                    .reduce((sum, block) => sum + block.duration, 0),
            }))
            .filter((item) => item.minutes > 0)
    ), [planBlocks]);
    const hasEvaluationData = Boolean(entry.evaluation)
        || evalForm.notes.trim().length > 0
        || evalForm.injuries.trim().length > 0
        || evalForm.rpe !== 5
        || evalForm.durationReal !== entry.duration
        || evalForm.energy !== 7
        || evalForm.fatigue !== 3;
    const workspaceStatus = useMemo(
        () => getWorkspaceStatus(entry, planBlocks, Boolean((objective || entry.objective).trim())),
        [entry, objective, planBlocks]
    );
    const pizarraHref = useMemo(
        () => `/club-admin?club=${encodeURIComponent(clubId)}&tab=pizarra`,
        [clubId]
    );
    const handlePizarraLinkClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
        if (!onTabChange) {
            return;
        }

        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
            return;
        }

        event.preventDefault();
        onTabChange('pizarra');
    };
    const tacticalBlocks = useMemo(
        () => planBlocks.filter((block) => block.type === 'tactico'),
        [planBlocks]
    );
    const selectedPreset = useMemo(
        () => pizarraPresets.find((preset) => preset.id === selectedPresetId) ?? pizarraPresets[0] ?? null,
        [pizarraPresets, selectedPresetId]
    );
    const planStateLabel = planBlocks.length === 0
        ? 'Sin plan'
        : planBlocks.some((block) => !block.title.trim() || block.duration <= 0)
            ? 'En construccion'
            : 'Listo';
    const totalPlayers = rosterPlayers.length || entry.convocados || 0;
    const attendanceRate = totalPlayers > 0
        ? Math.round((attendanceSummary.confirmado / totalPlayers) * 100)
        : 0;
    const durationDelta = (entry.evaluation?.durationReal || 0) - (totalDuration || entry.duration);
    const loadDelta = computedLoad - projectedLoad;
    const nextLogicalAction = !planBlocks.length
        ? 'Definir el plan'
        : attendanceSummary.sin_respuesta > 0
            ? 'Cerrar convocados'
            : !hasEvaluationData && (isPast(scheduledDateTime) || entry.status === 'sin_evaluar')
                ? 'Cargar evaluacion'
                : 'Publicar la sesion';
    const operationalAlerts = [
        !planBlocks.length ? 'Todavia no hay bloques cargados para la sesion.' : null,
        planBlocks.some((block) => block.duration <= 0) ? 'Hay bloques sin duracion valida.' : null,
        attendanceSummary.sin_respuesta > 0 ? `${attendanceSummary.sin_respuesta} jugadores siguen sin responder.` : null,
        (isPast(scheduledDateTime) || entry.status === 'sin_evaluar') && !hasEvaluationData ? 'La evaluacion post entrenamiento sigue pendiente.' : null,
        totalDuration > 0 && Math.abs(totalDuration - entry.duration) >= 10
            ? `El plan suma ${totalDuration} min y la sesion esta pautada en ${entry.duration} min.`
            : null,
    ].filter(Boolean) as string[];
    const summaryNotes = [
        biggestBlock
            ? `Bloque principal: ${biggestBlock.title || BLOCK_TYPE_LABELS[biggestBlock.type]}`
            : 'Todavia no definiste el bloque principal del dia.',
        attendanceSummary.confirmado > 0
            ? `${attendanceSummary.confirmado} confirmados sobre ${totalPlayers || 0}.`
            : 'No hay confirmaciones cargadas todavia.',
        hasEvaluationData
            ? 'La sesion ya tiene una evaluacion cargada.'
            : 'La evaluacion queda pendiente para el cierre.',
    ];

    const buildDraftTraining = (overrides: Partial<TrainingEntry> = {}) => {
        return {
            ...entry,
            title: title.trim() || entry.title,
            date: scheduledDateTime,
            location: location.trim() || entry.location,
            objective: objective.trim() || entry.objective,
            duration: totalDuration > 0 ? totalDuration : entry.duration,
            convocados: totalPlayers,
            plan: planBlocks.length > 0 ? { blocks: planBlocks } : undefined,
            attendance: Object.keys(normalizedAttendance).length > 0 ? normalizedAttendance : undefined,
            evaluation: hasEvaluationData ? { ...evalForm, loadTotal: computedLoad } : undefined,
            ...overrides,
        } satisfies TrainingEntry;
    };

    const runPersist = async (training: TrainingEntry) => {
        setSaving(true);
        const saved = await onSaveEntry(training);
        setSaving(false);
        return saved;
    };

    const handlePrimarySave = async () => {
        await runPersist(buildDraftTraining());
    };

    const handlePublish = async () => {
        const nextStatus: TrainingStatus = entry.status === 'finalizado'
            ? 'finalizado'
            : isToday(scheduledDateTime)
                ? 'en_curso'
                : 'planificado';

        await runPersist(buildDraftTraining({ status: nextStatus }));
    };

    const handleSaveEvaluationDraft = async () => {
        await runPersist(buildDraftTraining({
            status: entry.status === 'finalizado' ? 'finalizado' : 'sin_evaluar',
        }));
    };

    const handleFinishTraining = async () => {
        await runPersist(buildDraftTraining({ status: 'finalizado' }));
    };

    const handleDuplicate = async () => {
        setActionsOpen(false);
        setSaving(true);
        await onDuplicateTraining(buildDraftTraining({ status: 'planificado' }));
        setSaving(false);
    };

    const handleReschedule = async () => {
        const baseDate = new Date(scheduledDateTime);
        if (Number.isNaN(baseDate.getTime())) {
            return;
        }

        baseDate.setDate(baseDate.getDate() + 1);
        const nextDate = toLocalDateInput(baseDate.toISOString());
        const nextTime = toLocalTimeInput(baseDate.toISOString());
        setScheduledDate(nextDate);
        setScheduledTime(nextTime);
        setActionsOpen(false);
        await runPersist(buildDraftTraining({
            date: baseDate.toISOString(),
            status: 'planificado',
        }));
    };

    const handleArchiveOrDelete = async () => {
        setActionsOpen(false);
        await onDeleteTraining(entry);
    };

    const handleReloadPizarra = () => {
        setPizarraLoaded(false);
        setPizarraError(null);
    };

    return (
        <div className="club-training-modal-overlay" onClick={onClose}>
            <div className="club-training-modal club-training-workspace-modal" onClick={(event) => event.stopPropagation()}>
                <div className="club-training-workspace-header">
                    <div className="club-training-workspace-header-copy">
                        <span className="club-training-workspace-kicker">Centro operativo del entrenamiento</span>
                        <div className="club-training-workspace-header-row">
                            <div className="club-training-workspace-title-group">
                                <textarea
                                    ref={titleInputRef}
                                    className="club-training-workspace-title-input"
                                    value={title}
                                    onChange={(event) => setTitle(event.target.value)}
                                    onKeyDown={(event) => {
                                        if (event.key === 'Enter') {
                                            event.preventDefault();
                                        }
                                    }}
                                    placeholder="Nombre del entrenamiento"
                                    rows={1}
                                    aria-label="Nombre del entrenamiento"
                                />
                                <div className="club-training-workspace-status-row">
                                    <span className={`club-training-workspace-status-badge ${workspaceStatus.toneClass}`}>
                                        {workspaceStatus.label}
                                    </span>
                                    <span className="club-training-workspace-status-helper">{workspaceStatus.helper}</span>
                                </div>
                                <div className="club-training-workspace-meta">
                                    <span><Calendar className="w-3.5 h-3.5" /> {formattedSchedule.day}</span>
                                    <span><Clock className="w-3.5 h-3.5" /> {formattedSchedule.time}</span>
                                    <span><MapPin className="w-3.5 h-3.5" /> {location.trim() || entry.location}</span>
                                    <span><Shield className="w-3.5 h-3.5" /> {divisionLabel}</span>
                                    <span><Users className="w-3.5 h-3.5" /> {entry.staff.join(', ') || 'Staff por asignar'}</span>
                                </div>
                            </div>

                            <div className="club-training-workspace-header-actions">
                                <button type="button" className="btn" onClick={() => { void handlePrimarySave(); }} disabled={saving}>
                                    <Save className="w-4 h-4" />
                                    {saving ? 'Guardando...' : 'Guardar'}
                                </button>
                                <button type="button" className="btn btn-primary" onClick={() => { void handlePublish(); }} disabled={saving}>
                                    <Send className="w-4 h-4" />
                                    Publicar
                                </button>
                                <button type="button" className="btn" onClick={onClose}>
                                    Cerrar
                                </button>
                                <div className="club-training-workspace-menu">
                                    <button
                                        type="button"
                                        className="club-training-workspace-menu-trigger"
                                        onClick={() => setActionsOpen((current) => !current)}
                                        aria-label="Abrir acciones secundarias"
                                    >
                                        <MoreHorizontal className="w-4 h-4" />
                                    </button>
                                    {actionsOpen ? (
                                        <div className="club-training-workspace-menu-panel">
                                            <button type="button" onClick={() => { void handleDuplicate(); }}>
                                                <Copy className="w-4 h-4" />
                                                Duplicar
                                            </button>
                                            <button type="button" onClick={() => { void handleReschedule(); }}>
                                                <CalendarClock className="w-4 h-4" />
                                                Reprogramar +24h
                                            </button>
                                            <button type="button" onClick={() => { void handleArchiveOrDelete(); }}>
                                                <Trash2 className="w-4 h-4" />
                                                {entry.sourceKey ? 'Archivar' : 'Eliminar'}
                                            </button>
                                        </div>
                                    ) : null}
                                </div>
                                <button type="button" className="club-training-workspace-close" onClick={onClose} aria-label="Cerrar modal">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="club-training-workspace-body">
                    <aside className="club-training-workspace-rail" aria-label="Secciones del entrenamiento">
                        {tabs.map((item) => (
                            <button
                                key={item.id}
                                type="button"
                                className={`club-training-workspace-rail-item${tab === item.id ? ' active' : ''}`}
                                onClick={() => setTab(item.id)}
                            >
                                <span className="club-training-workspace-rail-icon">{item.icon}</span>
                                <span className="club-training-workspace-rail-copy">
                                    <strong>{item.label}</strong>
                                    <small>{item.hint}</small>
                                </span>
                            </button>
                        ))}
                    </aside>

                    <main className="club-training-workspace-main">
                        {tab === 'resumen' && (
                            <div className="club-training-workspace-pane">
                                <div className="club-training-workspace-section-head">
                                    <div>
                                        <span className="club-training-workspace-section-kicker">Resumen operativo</span>
                                        <h4>Entende la sesion antes de editarla</h4>
                                    </div>
                                    <div className="club-training-workspace-inline-stats">
                                        <article>
                                            <span>Plan</span>
                                            <strong>{planBlocks.length} bloques</strong>
                                        </article>
                                        <article>
                                            <span>Asistencia</span>
                                            <strong>{attendanceSummary.confirmado}/{totalPlayers || 0}</strong>
                                        </article>
                                        <article>
                                            <span>Carga</span>
                                            <strong>{projectedLoad || '--'}</strong>
                                        </article>
                                    </div>
                                </div>

                                <section className="club-training-workspace-summary-grid">
                                    <article className="club-training-workspace-card">
                                        <div className="club-training-workspace-card-head">
                                            <div>
                                                <span className="club-training-workspace-card-kicker">Ficha de sesion</span>
                                                <h5>Identidad y contexto</h5>
                                            </div>
                                        </div>
                                        <div className="club-training-workspace-form-grid">
                                            <label className="club-training-workspace-field">
                                                <span className="club-training-form-label">Titulo del entrenamiento</span>
                                                <input
                                                    className="club-training-form-input"
                                                    value={title}
                                                    onChange={(event) => setTitle(event.target.value)}
                                                    placeholder="Nombre de la sesion"
                                                />
                                            </label>
                                            <label className="club-training-workspace-field">
                                                <span className="club-training-form-label">Fecha</span>
                                                <input
                                                    type="date"
                                                    className="club-training-form-input"
                                                    value={scheduledDate}
                                                    onChange={(event) => setScheduledDate(event.target.value)}
                                                />
                                            </label>
                                            <label className="club-training-workspace-field">
                                                <span className="club-training-form-label">Hora</span>
                                                <input
                                                    type="time"
                                                    className="club-training-form-input"
                                                    value={scheduledTime}
                                                    onChange={(event) => setScheduledTime(event.target.value)}
                                                />
                                            </label>
                                            <label className="club-training-workspace-field">
                                                <span className="club-training-form-label">Lugar</span>
                                                <input
                                                    className="club-training-form-input"
                                                    value={location}
                                                    onChange={(event) => setLocation(event.target.value)}
                                                    placeholder="Cancha, gimnasio o sala"
                                                />
                                            </label>
                                        </div>
                                        <label className="club-training-workspace-field">
                                            <span className="club-training-form-label">Objetivo de la sesion</span>
                                            <textarea
                                                className="club-training-form-textarea"
                                                rows={4}
                                                value={objective}
                                                onChange={(event) => setObjective(event.target.value)}
                                                placeholder="Que tiene que quedar resuelto en esta sesion"
                                            />
                                        </label>
                                    </article>

                                    <article className="club-training-workspace-card">
                                        <div className="club-training-workspace-card-head">
                                            <div>
                                                <span className="club-training-workspace-card-kicker">Lectura rapida</span>
                                                <h5>Que pasa hoy en esta sesion</h5>
                                            </div>
                                        </div>
                                        <div className="club-training-workspace-summary-metrics">
                                            <article>
                                                <span>Bloque principal</span>
                                                <strong>{biggestBlock?.title || 'Por definir'}</strong>
                                            </article>
                                            <article>
                                                <span>Duracion total</span>
                                                <strong>{totalDuration || entry.duration} min</strong>
                                            </article>
                                            <article>
                                                <span>Intensidad esperada</span>
                                                <strong>{averageIntensity.label}</strong>
                                            </article>
                                            <article>
                                                <span>Asistencia confirmada</span>
                                                <strong>{attendanceSummary.confirmado}/{totalPlayers || 0}</strong>
                                            </article>
                                        </div>
                                        <div className="club-training-workspace-summary-notes">
                                            {summaryNotes.map((note) => (
                                                <div key={note} className="club-training-workspace-summary-note">
                                                    {note}
                                                </div>
                                            ))}
                                        </div>
                                        <div className="club-training-workspace-quick-actions">
                                            <button type="button" className="club-training-workspace-quick-btn" onClick={() => setTab('plan')}>
                                                Editar plan
                                            </button>
                                            <button type="button" className="club-training-workspace-quick-btn" onClick={() => setTab('evaluacion')}>
                                                Cargar evaluacion
                                            </button>
                                            <button type="button" className="club-training-workspace-quick-btn" onClick={() => setTab('pizarra')}>
                                                Abrir pizarra
                                            </button>
                                            <button type="button" className="club-training-workspace-quick-btn" onClick={() => setTab('convocados')}>
                                                Confirmar convocados
                                            </button>
                                        </div>
                                    </article>
                                </section>
                            </div>
                        )}

                        {tab === 'plan' && (
                            <div className="club-training-workspace-pane">
                                <div className="club-training-workspace-section-head">
                                    <div>
                                        <span className="club-training-workspace-section-kicker">Plan</span>
                                        <h4>Agenda y builder de bloques</h4>
                                    </div>
                                    <div className="club-training-workspace-inline-stats">
                                        <article>
                                            <span>Total</span>
                                            <strong>{totalDuration || 0} min</strong>
                                        </article>
                                        <article>
                                            <span>Intensidad</span>
                                            <strong>{averageIntensity.label}</strong>
                                        </article>
                                        <article>
                                            <span>Carga est.</span>
                                            <strong>{projectedLoad || 0}</strong>
                                        </article>
                                    </div>
                                </div>

                                {planBlocks.length === 0 && (
                                    <div className="club-training-workspace-empty">
                                        Empeza armando el plan con bloques reales. Cuando cargues el primero, la sesion ya se entiende como una sesion de trabajo.
                                    </div>
                                )}

                                <div className="club-training-workspace-plan-list">
                                    {planBlocks.map((block, index) => {
                                        const cumulativeMinutes = planBlocks
                                            .slice(0, index + 1)
                                            .reduce((sum, current) => sum + current.duration, 0);

                                        return (
                                            <article
                                                key={block.id}
                                                className="club-training-workspace-plan-card"
                                                style={{ '--block-accent': BLOCK_TYPE_COLORS[block.type] } as CSSProperties}
                                            >
                                                <div className="club-training-workspace-plan-rail">
                                                    <div className="club-training-workspace-plan-grip">
                                                        <span />
                                                        <span />
                                                        <span />
                                                    </div>
                                                    <strong>{block.duration || 0} min</strong>
                                                    <span>{cumulativeMinutes} acumulados</span>
                                                </div>

                                                <div className="club-training-workspace-plan-content">
                                                    <div className="club-training-workspace-plan-top">
                                                        <div className="club-training-workspace-plan-tags">
                                                            <span className="club-training-workspace-type-pill">{BLOCK_TYPE_LABELS[block.type]}</span>
                                                            <span className="club-training-workspace-focus-pill">{BLOCK_FOCUS_LABELS[block.type]}</span>
                                                            {block.intensity ? (
                                                                <span className="club-training-workspace-focus-pill subtle">{block.intensity}</span>
                                                            ) : null}
                                                        </div>
                                                        <div className="club-training-workspace-plan-actions">
                                                            <button type="button" onClick={() => moveBlock(block.id, 'up')} disabled={index === 0}>↑</button>
                                                            <button type="button" onClick={() => moveBlock(block.id, 'down')} disabled={index === planBlocks.length - 1}>↓</button>
                                                            <button type="button" className="danger" onClick={() => removeBlock(block.id)}>×</button>
                                                        </div>
                                                    </div>

                                                    <input
                                                        className="club-training-form-input"
                                                        value={block.title}
                                                        onChange={(event) => updateBlock(block.id, { title: event.target.value })}
                                                        placeholder="Nombre del bloque"
                                                    />

                                                    <div className="club-training-workspace-form-grid compact">
                                                        <label className="club-training-workspace-field">
                                                            <span className="club-training-form-label">Tipo</span>
                                                            <select
                                                                className="club-training-form-select"
                                                                value={block.type}
                                                                onChange={(event) => updateBlock(block.id, { type: event.target.value as PlanBlockType })}
                                                            >
                                                                {(Object.keys(BLOCK_TYPE_LABELS) as PlanBlockType[]).map((blockType) => (
                                                                    <option key={blockType} value={blockType}>
                                                                        {BLOCK_TYPE_LABELS[blockType]}
                                                                    </option>
                                                                ))}
                                                            </select>
                                                        </label>
                                                        <label className="club-training-workspace-field">
                                                            <span className="club-training-form-label">Duracion</span>
                                                            <input
                                                                type="number"
                                                                className="club-training-form-input"
                                                                value={block.duration}
                                                                onChange={(event) => updateBlock(block.id, { duration: Number(event.target.value) || 0 })}
                                                            />
                                                        </label>
                                                        <label className="club-training-workspace-field">
                                                            <span className="club-training-form-label">Intensidad</span>
                                                            <select
                                                                className="club-training-form-select"
                                                                value={block.intensity || ''}
                                                                onChange={(event) => updateBlock(block.id, { intensity: event.target.value })}
                                                            >
                                                                <option value="">Seleccionar...</option>
                                                                <option value="Baja">Baja</option>
                                                                <option value="Media">Media</option>
                                                                <option value="Media-Alta">Media-Alta</option>
                                                                <option value="Alta">Alta</option>
                                                                <option value="Maxima">Maxima</option>
                                                            </select>
                                                        </label>
                                                    </div>

                                                    <textarea
                                                        className="club-training-form-textarea"
                                                        rows={3}
                                                        value={block.notes}
                                                        onChange={(event) => updateBlock(block.id, { notes: event.target.value })}
                                                        placeholder="Objetivo, foco y consignas del bloque"
                                                    />
                                                </div>
                                            </article>
                                        );
                                    })}
                                </div>

                                <div className="club-training-workspace-plan-sticky">
                                    {(['warmup', 'tecnico', 'tactico', 'fisico', 'cierre'] as PlanBlockType[]).map((blockType) => (
                                        <button
                                            key={blockType}
                                            type="button"
                                            className="club-training-workspace-add-block"
                                            onClick={() => addBlock(blockType)}
                                        >
                                            <Plus className="w-4 h-4" />
                                            {BLOCK_TYPE_LABELS[blockType]}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {tab === 'convocados' && (
                            <div className="club-training-workspace-pane">
                                <div className="club-training-workspace-section-head">
                                    <div>
                                        <span className="club-training-workspace-section-kicker">Convocados</span>
                                        <h4>Interfaz de staff para disponibilidad real</h4>
                                    </div>
                                    <div className="club-training-workspace-action-row">
                                        <button type="button" className="club-training-workspace-quick-btn" onClick={() => {
                                            const next: Record<string, AttendanceState> = {};
                                            rosterPlayers.forEach((player) => {
                                                next[player.id] = 'confirmado';
                                            });
                                            setAttendance(next);
                                        }}>
                                            <CheckCircle2 className="w-4 h-4" />
                                            Confirmar todos
                                        </button>
                                        <button type="button" className="club-training-workspace-quick-btn" onClick={() => setAttendance({})}>
                                            Limpiar respuestas
                                        </button>
                                        <button type="button" className="club-training-workspace-quick-btn primary" onClick={() => { void handlePrimarySave(); }}>
                                            Guardar
                                        </button>
                                    </div>
                                </div>

                                <div className="club-training-workspace-toolbar">
                                    <input
                                        className="club-training-form-input"
                                        value={attendanceQuery}
                                        onChange={(event) => setAttendanceQuery(event.target.value)}
                                        placeholder="Buscar jugador o puesto"
                                    />
                                    <div className="club-training-workspace-filter-row">
                                        {[
                                            { id: 'all' as const, label: 'Todos' },
                                            { id: 'confirmado' as const, label: 'Confirmados' },
                                            { id: 'dudoso' as const, label: 'Dudosos' },
                                            { id: 'ausente' as const, label: 'Ausentes' },
                                            { id: 'sin_respuesta' as const, label: 'Sin respuesta' },
                                        ].map((filterOption) => (
                                            <button
                                                key={filterOption.id}
                                                type="button"
                                                className={`club-training-workspace-filter-pill${attendanceFilter === filterOption.id ? ' active' : ''}`}
                                                onClick={() => setAttendanceFilter(filterOption.id)}
                                            >
                                                {filterOption.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="club-training-workspace-inline-stats attendance">
                                    <article>
                                        <span>Confirmados</span>
                                        <strong>{attendanceSummary.confirmado}</strong>
                                    </article>
                                    <article>
                                        <span>Dudosos</span>
                                        <strong>{attendanceSummary.dudoso}</strong>
                                    </article>
                                    <article>
                                        <span>Ausentes</span>
                                        <strong>{attendanceSummary.ausente}</strong>
                                    </article>
                                    <article>
                                        <span>Sin respuesta</span>
                                        <strong>{attendanceSummary.sin_respuesta}</strong>
                                    </article>
                                </div>

                                <div className="club-training-workspace-attendance-list">
                                    {visiblePlayers.map((player) => {
                                        const currentStatus = attendance[player.id];
                                        return (
                                            <div key={player.id} className="club-training-workspace-player-row">
                                                <div className="club-training-workspace-player-meta">
                                                    <div className="club-training-workspace-avatar">{getInitials(player.name)}</div>
                                                    <div>
                                                        <strong>{player.name}</strong>
                                                        <span>{player.pos}</span>
                                                    </div>
                                                </div>

                                                <div className="club-training-workspace-player-status">
                                                    {(['confirmado', 'dudoso', 'ausente'] as AttendanceState[]).map((status) => (
                                                        <button
                                                            key={status}
                                                            type="button"
                                                            className={`club-training-workspace-status-choice${currentStatus === status ? ' active' : ''}`}
                                                            onClick={() => setAttendance((prev) => ({ ...prev, [player.id]: status }))}
                                                        >
                                                            {ATTENDANCE_META[status].shortLabel}
                                                        </button>
                                                    ))}
                                                    <button
                                                        type="button"
                                                        className={`club-training-workspace-status-choice ghost${!currentStatus ? ' active' : ''}`}
                                                        onClick={() => setAttendance((prev) => {
                                                            const next = { ...prev };
                                                            delete next[player.id];
                                                            return next;
                                                        })}
                                                    >
                                                        Sin resp.
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}

                                    {visiblePlayers.length === 0 && (
                                        <div className="club-training-workspace-empty">
                                            No hay jugadores para los filtros actuales.
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {tab === 'pizarra' && (
                            <div className="club-training-workspace-pane">
                                <div className="club-training-workspace-section-head">
                                    <div>
                                        <span className="club-training-workspace-section-kicker">Pizarra</span>
                                        <h4>Biblioteca tactica conectada al club</h4>
                                    </div>
                                </div>

                                <section className="club-training-workspace-pizarra-card">
                                    <div style={{ minWidth: 0 }}>
                                        {selectedPreset ? (
                                            <div
                                                className="club-training-workspace-card"
                                                style={{
                                                    minHeight: 220,
                                                    padding: '1rem',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    borderColor: 'rgba(59, 130, 246, 0.24)',
                                                    background: 'radial-gradient(circle at top, rgba(59, 130, 246, 0.18), transparent 58%), rgba(7, 17, 28, 0.92)',
                                                }}
                                            >
                                                <div style={{ display: 'grid', gap: '0.35rem', textAlign: 'center' }}>
                                                    <span className="club-training-workspace-card-kicker">Jugada seleccionada</span>
                                                    <h5 style={{ margin: 0, fontSize: '1rem', fontWeight: 800 }}>{selectedPreset.name}</h5>
                                                </div>
                                            </div>
                                        ) : (
                                            <div
                                                className="club-training-workspace-card"
                                                style={{
                                                    minHeight: 220,
                                                    padding: '1rem',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    textAlign: 'center',
                                                }}
                                            >
                                                <div style={{ display: 'grid', gap: '0.35rem' }}>
                                                    <span className="club-training-workspace-card-kicker">Pizarra del club</span>
                                                    <h5 style={{ margin: 0, fontSize: '1rem', fontWeight: 800 }}>
                                                        Jugadas guardadas listas para consultar
                                                    </h5>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    <div className="club-training-workspace-pizarra-copy">
                                        <span className="club-training-workspace-card-kicker">Pizarra del club</span>
                                        <h5>{selectedPreset ? selectedPreset.name : 'Jugadas guardadas listas para consultar'}</h5>
                                        <p>
                                            {selectedPreset
                                                ? 'Estas viendo una jugada real guardada en la pizarra privada del club. Puedes usarla como referencia para los bloques tacticos del entrenamiento.'
                                                : 'Desde aca ves la biblioteca de jugadas pre guardadas del club sin salir del panel de entrenamientos.'}
                                        </p>
                                        <div className="club-training-workspace-action-row">
                                            <Link
                                                href={pizarraHref}
                                                className="btn btn-primary"
                                                prefetch={false}
                                                onClick={handlePizarraLinkClick}
                                            >
                                                Abrir modulo Pizarra
                                                <ChevronRight className="w-4 h-4" />
                                            </Link>
                                            <button type="button" className="btn" onClick={() => setTab('plan')}>
                                                Volver al plan
                                            </button>
                                            {pizarraError ? (
                                                <button type="button" className="btn" onClick={handleReloadPizarra}>
                                                    Reintentar carga
                                                </button>
                                            ) : null}
                                        </div>
                                        <div className="club-training-workspace-preview-list">
                                            <span>{pizarraPresets.length} jugada{pizarraPresets.length === 1 ? '' : 's'} guardada{pizarraPresets.length === 1 ? '' : 's'}</span>
                                            <span>{tacticalBlocks.length} bloque{tacticalBlocks.length === 1 ? '' : 's'} tactico{tacticalBlocks.length === 1 ? '' : 's'} en el plan</span>
                                        </div>
                                    </div>
                                </section>

                                <section
                                    className="club-training-workspace-card"
                                    style={{ padding: '1.25rem', display: 'grid', gap: '1rem' }}
                                >
                                    <div className="club-training-workspace-card-head">
                                        <div>
                                            <span className="club-training-workspace-card-kicker">Biblioteca conectada</span>
                                            <h5>Jugadas pre guardadas del club</h5>
                                        </div>
                                        {selectedPreset ? (
                                            <strong className="club-training-workspace-big-metric">{pizarraPresets.length}</strong>
                                        ) : null}
                                    </div>

                                    {loadingPizarra && pizarraPresets.length > 0 ? (
                                        <p className="text-xs text-white/45">
                                            Actualizando biblioteca del club...
                                        </p>
                                    ) : null}

                                    {loadingPizarra && pizarraPresets.length === 0 ? (
                                        <div className="club-training-workspace-empty">
                                            Cargando jugadas guardadas del club...
                                        </div>
                                    ) : null}

                                    {!loadingPizarra && pizarraError && pizarraPresets.length === 0 ? (
                                        <div className="club-training-workspace-empty">
                                            {pizarraError}
                                        </div>
                                    ) : null}

                                    {!loadingPizarra && !pizarraError && pizarraPresets.length === 0 ? (
                                        <div className="club-training-workspace-empty">
                                            Todavia no hay jugadas guardadas en la pizarra del club. Puedes crear la primera desde el modulo principal.
                                        </div>
                                    ) : null}

                                    {pizarraPresets.length > 0 ? (
                                        <div
                                            style={{
                                                display: 'grid',
                                                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                                                gap: '0.75rem',
                                            }}
                                        >
                                            {pizarraPresets.map((preset) => {
                                                const isActive = preset.id === selectedPreset?.id;

                                                return (
                                                    <button
                                                        key={preset.id}
                                                        type="button"
                                                        className="club-training-workspace-card"
                                                        onClick={() => setSelectedPresetId(preset.id)}
                                                        style={{
                                                            padding: '0.8rem',
                                                            display: 'grid',
                                                            gap: '0.8rem',
                                                            textAlign: 'left',
                                                            cursor: 'pointer',
                                                            borderColor: isActive ? 'rgba(59, 130, 246, 0.34)' : 'rgba(255, 255, 255, 0.08)',
                                                            background: isActive
                                                                ? 'radial-gradient(circle at top, rgba(59, 130, 246, 0.14), transparent 62%), rgba(59, 130, 246, 0.08)'
                                                                : 'rgba(255, 255, 255, 0.02)',
                                                            boxShadow: isActive ? 'inset 0 0 0 1px rgba(59, 130, 246, 0.12)' : 'none',
                                                        }}
                                                    >
                                                        <strong style={{ fontSize: '0.92rem', lineHeight: 1.3 }}>{preset.name}</strong>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    ) : null}
                                </section>
                            </div>
                        )}

                        {tab === 'evaluacion' && (
                            <div className="club-training-workspace-pane">
                                <div className="club-training-workspace-section-head">
                                    <div>
                                        <span className="club-training-workspace-section-kicker">Evaluacion</span>
                                        <h4>Carga, estado del grupo e incidencias</h4>
                                    </div>
                                </div>

                                <div className="club-training-workspace-eval-grid">
                                    <article className="club-training-workspace-card">
                                        <div className="club-training-workspace-card-head">
                                            <div>
                                                <span className="club-training-workspace-card-kicker">1. Carga</span>
                                                <h5>Esfuerzo y duracion real</h5>
                                            </div>
                                            <strong className="club-training-workspace-big-metric">{computedLoad}</strong>
                                        </div>
                                        <div className="club-training-workspace-slider-group">
                                            <label className="club-training-workspace-field">
                                                <span className="club-training-form-label">RPE</span>
                                                <div className="club-training-workspace-slider-row">
                                                    <input
                                                        type="range"
                                                        min={1}
                                                        max={10}
                                                        value={evalForm.rpe}
                                                        onChange={(event) => setEvalForm((current) => ({
                                                            ...current,
                                                            rpe: Number(event.target.value),
                                                        }))}
                                                    />
                                                    <strong>{evalForm.rpe}/10</strong>
                                                </div>
                                            </label>
                                            <label className="club-training-workspace-field">
                                                <span className="club-training-form-label">Duracion real</span>
                                                <input
                                                    type="number"
                                                    className="club-training-form-input"
                                                    value={evalForm.durationReal}
                                                    onChange={(event) => setEvalForm((current) => ({
                                                        ...current,
                                                        durationReal: Number(event.target.value) || 0,
                                                    }))}
                                                />
                                            </label>
                                        </div>
                                        <div className="club-training-workspace-inline-stats">
                                            <article>
                                                <span>Carga total</span>
                                                <strong>{computedLoad}</strong>
                                            </article>
                                            <article>
                                                <span>Plan vs real</span>
                                                <strong>{durationDelta === 0 ? 'En linea' : `${durationDelta > 0 ? '+' : ''}${durationDelta} min`}</strong>
                                            </article>
                                        </div>
                                    </article>

                                    <article className="club-training-workspace-card">
                                        <div className="club-training-workspace-card-head">
                                            <div>
                                                <span className="club-training-workspace-card-kicker">2. Estado del grupo</span>
                                                <h5>Energia y fatiga</h5>
                                            </div>
                                        </div>
                                        <div className="club-training-workspace-slider-group">
                                            <label className="club-training-workspace-field">
                                                <span className="club-training-form-label">Energia</span>
                                                <div className="club-training-workspace-slider-row">
                                                    <input
                                                        type="range"
                                                        min={1}
                                                        max={10}
                                                        value={evalForm.energy}
                                                        onChange={(event) => setEvalForm((current) => ({
                                                            ...current,
                                                            energy: Number(event.target.value),
                                                        }))}
                                                    />
                                                    <strong>{evalForm.energy}/10</strong>
                                                </div>
                                            </label>
                                            <label className="club-training-workspace-field">
                                                <span className="club-training-form-label">Fatiga</span>
                                                <div className="club-training-workspace-slider-row">
                                                    <input
                                                        type="range"
                                                        min={1}
                                                        max={10}
                                                        value={evalForm.fatigue}
                                                        onChange={(event) => setEvalForm((current) => ({
                                                            ...current,
                                                            fatigue: Number(event.target.value),
                                                        }))}
                                                    />
                                                    <strong>{evalForm.fatigue}/10</strong>
                                                </div>
                                            </label>
                                        </div>
                                    </article>

                                    <article className="club-training-workspace-card">
                                        <div className="club-training-workspace-card-head">
                                            <div>
                                                <span className="club-training-workspace-card-kicker">3. Incidencias</span>
                                                <h5>Lesiones y observaciones medicas</h5>
                                            </div>
                                        </div>
                                        <label className="club-training-workspace-field">
                                            <span className="club-training-form-label">Incidencias</span>
                                            <input
                                                className="club-training-form-input"
                                                value={evalForm.injuries}
                                                onChange={(event) => setEvalForm((current) => ({
                                                    ...current,
                                                    injuries: event.target.value,
                                                }))}
                                                placeholder="Ninguna, molestias, carga reducida..."
                                            />
                                        </label>
                                    </article>

                                    <article className="club-training-workspace-card">
                                        <div className="club-training-workspace-card-head">
                                            <div>
                                                <span className="club-training-workspace-card-kicker">4. Nota del staff</span>
                                                <h5>Cierre cualitativo</h5>
                                            </div>
                                        </div>
                                        <textarea
                                            className="club-training-form-textarea"
                                            rows={5}
                                            value={evalForm.notes}
                                            onChange={(event) => setEvalForm((current) => ({
                                                ...current,
                                                notes: event.target.value,
                                            }))}
                                            placeholder="Lectura del entrenamiento, decisiones y hallazgos"
                                        />
                                    </article>
                                </div>

                                <div className="club-training-workspace-eval-actions">
                                    <button type="button" className="btn" onClick={() => { void handleSaveEvaluationDraft(); }}>
                                        <Save className="w-4 h-4" />
                                        Guardar evaluacion
                                    </button>
                                    <button type="button" className="btn btn-primary" onClick={() => { void handleFinishTraining(); }}>
                                        <CheckCircle2 className="w-4 h-4" />
                                        Marcar entrenamiento como finalizado
                                    </button>
                                </div>
                            </div>
                        )}

                        {tab === 'stats' && (
                            <div className="club-training-workspace-pane stats">
                                <div className="club-training-workspace-section-head">
                                    <div>
                                        <span className="club-training-workspace-section-kicker">Stats</span>
                                        <h4>Lectura rapida de la sesion</h4>
                                    </div>
                                </div>

                                <div className="club-training-workspace-stats-hero">
                                    <article>
                                        <span>Duracion</span>
                                        <strong>{entry.evaluation?.durationReal || totalDuration || entry.duration} min</strong>
                                        <small>Planificada vs real</small>
                                    </article>
                                    <article>
                                        <span>Carga</span>
                                        <strong>{entry.evaluation?.loadTotal || projectedLoad || 0}</strong>
                                        <small>Estimacion operativa</small>
                                    </article>
                                    <article>
                                        <span>RPE</span>
                                        <strong>{entry.evaluation?.rpe || evalForm.rpe}</strong>
                                        <small>Percepcion del esfuerzo</small>
                                    </article>
                                    <article>
                                        <span>Asistencia</span>
                                        <strong>{attendanceRate}%</strong>
                                        <small>Confirmados sobre el plantel</small>
                                    </article>
                                </div>

                                <div className="club-training-workspace-stats-grid">
                                    <article className="club-training-workspace-card">
                                        <div className="club-training-workspace-card-head">
                                            <div>
                                                <span className="club-training-workspace-card-kicker">Distribucion</span>
                                                <h5>Minutos por tipo de bloque</h5>
                                            </div>
                                        </div>
                                        <div className="club-training-workspace-bars">
                                            {planDistribution.length === 0 ? (
                                                <div className="club-training-workspace-empty">
                                                    Cuando definas el plan, aca aparece la composicion real de la sesion.
                                                </div>
                                            ) : planDistribution.map((item) => (
                                                <div key={item.type} className="club-training-workspace-bar-row">
                                                    <div className="club-training-workspace-bar-copy">
                                                        <span>{item.label}</span>
                                                        <strong>{item.minutes} min</strong>
                                                    </div>
                                                    <div className="club-training-workspace-bar-track">
                                                        <div
                                                            className="club-training-workspace-bar-fill"
                                                            style={{
                                                                width: `${Math.max((item.minutes / Math.max(totalDuration, 1)) * 100, 6)}%`,
                                                                background: BLOCK_TYPE_COLORS[item.type],
                                                            }}
                                                        />
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </article>

                                    <article className="club-training-workspace-card">
                                        <div className="club-training-workspace-card-head">
                                            <div>
                                                <span className="club-training-workspace-card-kicker">Comparativa</span>
                                                <h5>Plan vs cierre</h5>
                                            </div>
                                        </div>
                                        <div className="club-training-workspace-inline-stats compare">
                                            <article>
                                                <span>Delta carga</span>
                                                <strong>{loadDelta === 0 ? 'En linea' : `${loadDelta > 0 ? '+' : ''}${loadDelta}`}</strong>
                                            </article>
                                            <article>
                                                <span>Delta tiempo</span>
                                                <strong>{durationDelta === 0 ? 'En linea' : `${durationDelta > 0 ? '+' : ''}${durationDelta} min`}</strong>
                                            </article>
                                        </div>
                                        <div className="club-training-workspace-summary-notes">
                                            <div className="club-training-workspace-summary-note">
                                                {operationalAlerts[0] || 'La sesion no muestra alertas criticas en esta lectura rapida.'}
                                            </div>
                                            <div className="club-training-workspace-summary-note">
                                                {hasEvaluationData
                                                    ? 'La carga real ya puede compararse con el plan.'
                                                    : 'Todavia falta cerrar evaluacion para comparar plan vs realidad.'}
                                            </div>
                                        </div>
                                    </article>
                                </div>
                            </div>
                        )}
                    </main>

                    <aside className="club-training-workspace-context">
                        <div className="club-training-workspace-context-panel">
                            <div className="club-training-workspace-card-head">
                                <div>
                                    <span className="club-training-workspace-card-kicker">Resumen persistente</span>
                                    <h5>Que falta completar</h5>
                                </div>
                            </div>
                            <div className="club-training-workspace-context-metrics">
                                <article>
                                    <span>Duracion planificada</span>
                                    <strong>{totalDuration || entry.duration} min</strong>
                                </article>
                                <article>
                                    <span>Carga estimada</span>
                                    <strong>{projectedLoad || '--'}</strong>
                                </article>
                                <article>
                                    <span>Confirmados</span>
                                    <strong>{attendanceSummary.confirmado}/{totalPlayers || 0}</strong>
                                </article>
                                <article>
                                    <span>Estado del plan</span>
                                    <strong>{planStateLabel}</strong>
                                </article>
                            </div>

                            <div className="club-training-workspace-objective">
                                <span className="club-training-workspace-card-kicker">Objetivo</span>
                                <p>{objective.trim() || entry.objective || 'Todavia no cargaste el objetivo de la sesion.'}</p>
                            </div>

                            <div className="club-training-workspace-next-action">
                                <span>Proxima accion logica</span>
                                <strong>{nextLogicalAction}</strong>
                            </div>

                            <div className="club-training-workspace-alerts">
                                <div className="club-training-workspace-alerts-head">
                                    <Activity className="w-4 h-4" />
                                    <span>Alertas rapidas</span>
                                </div>
                                {operationalAlerts.length === 0 ? (
                                    <div className="club-training-workspace-alert ok">
                                        La sesion no tiene alertas operativas criticas.
                                    </div>
                                ) : operationalAlerts.map((alert) => (
                                    <div key={alert} className="club-training-workspace-alert">
                                        {alert}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </aside>
                </div>
            </div>
        </div>
    );
}
