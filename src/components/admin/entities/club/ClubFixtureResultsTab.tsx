'use client';

import Link from 'next/link';
import { useDeferredValue, useState, startTransition } from 'react';
import { Calendar, ChevronRight, ClipboardList, FileBarChart2, Filter, LayoutList, NotebookPen, ShieldAlert, Sparkles, Target, Users, X } from 'lucide-react';
import { getStoredActiveTeamId, persistActiveTeamId } from '@/lib/club-admin/activeTeamSelection';
import type { ClubDashboardMatch } from '@/lib/club-admin/dashboard-types';
import type { Division } from '@/lib/services/divisionService';

interface ClubFixtureResultsTabProps {
    clubId: string;
    clubName: string;
    divisions: Division[];
    upcomingMatches: ClubDashboardMatch[];
    recentMatches: ClubDashboardMatch[];
    pastMatches: ClubDashboardMatch[];
    loading?: boolean;
}

type MatchTimelineTab = 'upcoming' | 'played' | 'pending';
type MatchConditionFilter = 'all' | 'home' | 'away' | 'neutral';
type MatchOperationalFilter = 'all' | 'callup' | 'analysis' | 'stats' | 'load';

type MatchOperationalState = {
    callup: boolean;
    lineup: boolean;
    notes: boolean;
    stats: boolean;
    report: boolean;
    completed: number;
};

type MatchTimelineEntry = {
    match: ClubDashboardMatch;
    teamLabel: string;
    conditionLabel: string;
    statusLabel: string;
    originLabel: 'G22' | 'Interno' | 'Hybrid';
    operationalState: MatchOperationalState;
    lineupCount: number;
    statsCount: number;
    hasUrgentPending: boolean;
    isUpcoming: boolean;
    isPlayed: boolean;
};

type MatchKpiCard = {
    id: MatchOperationalFilter | 'next' | 'week';
    label: string;
    value: string;
    hint: string;
    tone?: 'default' | 'warning';
    onClick: () => void;
    active: boolean;
};

const TIMELINE_TABS: Array<{ id: MatchTimelineTab; label: string }> = [
    { id: 'upcoming', label: 'Próximos' },
    { id: 'played', label: 'Jugados' },
    { id: 'pending', label: 'Pendientes' },
];

function formatDateTime(value: string | null) {
    if (!value) {
        return {
            day: 'Fecha a confirmar',
            time: 'Hora a confirmar',
        };
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return {
            day: 'Fecha a confirmar',
            time: 'Hora a confirmar',
        };
    }

    return {
        day: new Intl.DateTimeFormat('es-AR', {
            weekday: 'short',
            day: '2-digit',
            month: '2-digit',
        }).format(date),
        time: new Intl.DateTimeFormat('es-AR', {
            hour: '2-digit',
            minute: '2-digit',
        }).format(date),
    };
}

function normalizeStatus(status: string) {
    const normalized = String(status || 'scheduled').toLowerCase();
    if (normalized === 'live' || normalized === 'in_play') return 'En juego';
    if (normalized === 'final' || normalized === 'finished' || normalized === 'ft') return 'Finalizado';
    if (normalized === 'suspended') return 'Suspendido';
    if (normalized === 'postponed') return 'Reprogramado';
    return 'Programado';
}

function statusTone(status: string) {
    const normalized = String(status || 'scheduled').toLowerCase();
    if (normalized === 'live' || normalized === 'in_play') return 'live';
    if (normalized === 'final' || normalized === 'finished' || normalized === 'ft') return 'played';
    if (normalized === 'suspended' || normalized === 'postponed') return 'alert';
    return 'scheduled';
}

function isFutureMatch(match: ClubDashboardMatch) {
    if (!match.dateTime) return false;
    const value = new Date(match.dateTime).getTime();
    return Number.isFinite(value) && value >= Date.now();
}

function isPlayedMatch(match: ClubDashboardMatch) {
    const normalized = String(match.status || '').toLowerCase();
    return normalized === 'final' || normalized === 'finished' || normalized === 'ft';
}

function getLineupCount(match: ClubDashboardMatch) {
    if (typeof match.lineupCount === 'number') return match.lineupCount;

    const lineups = match.lineups;
    if (!lineups || typeof lineups !== 'object') return 0;

    const source = lineups as { home?: unknown; away?: unknown };
    const homeCount = Array.isArray(source.home) ? source.home.length : 0;
    const awayCount = Array.isArray(source.away) ? source.away.length : 0;
    return Math.max(homeCount, awayCount);
}

function getStatsCount(match: ClubDashboardMatch) {
    if (typeof match.statsCount === 'number') return match.statsCount;

    const events = match.events;
    if (Array.isArray(events)) return events.length;
    if (!events || typeof events !== 'object') return 0;

    const values = Object.values(events as Record<string, unknown>);
    return values.reduce((acc, value) => acc + (Array.isArray(value) ? value.length : 0), 0);
}

function hasMeaningfulNotes(notes: string | null) {
    return Boolean(notes && notes.trim().length > 0);
}

function hasScore(match: ClubDashboardMatch) {
    return typeof match.score?.home === 'number' || typeof match.score?.away === 'number';
}

function inferOperationalState(match: ClubDashboardMatch): MatchOperationalState {
    const lineupCount = getLineupCount(match);
    const hasNotes = hasMeaningfulNotes(match.notes);
    const played = isPlayedMatch(match);
    const stats = played ? getStatsCount(match) > 0 || hasScore(match) : false;
    const report = played ? hasNotes : false;
    const state = {
        callup: lineupCount > 0,
        lineup: lineupCount > 0,
        notes: hasNotes,
        stats,
        report,
        completed: 0,
    };

    state.completed = [state.lineup, state.notes, state.stats, state.report].filter(Boolean).length;
    return state;
}

function inferOrigin(match: ClubDashboardMatch) {
    if (match.tournament?.id && match.notes) return 'Hybrid';
    if (match.tournament?.id) return 'G22';
    return 'Interno';
}

function inferTeamLabel(match: ClubDashboardMatch, selectedDivision: Division | null, clubName: string) {
    if (selectedDivision) return selectedDivision.name;
    return match.isHome
        ? (match.homeDivisionName || match.home.shortName || match.home.name || clubName)
        : (match.awayDivisionName || match.away.shortName || match.away.name || clubName);
}

function getDefaultDivision(divisions: Division[]) {
    return divisions.find((division) => division.featured) ?? divisions[0] ?? null;
}

function matchBelongsToDivision(match: ClubDashboardMatch, divisionId: string | null) {
    if (!divisionId) return true;
    return match.homeDivisionId === divisionId || match.awayDivisionId === divisionId;
}

function matchHasDivisionMetadata(match: ClubDashboardMatch) {
    return Boolean(match.homeDivisionId || match.awayDivisionId);
}

function buildTimelineEntry(
    match: ClubDashboardMatch,
    selectedDivision: Division | null,
    clubName: string
): MatchTimelineEntry {
    const operationalState = inferOperationalState(match);
    const played = isPlayedMatch(match);
    const upcoming = isFutureMatch(match);
    return {
        match,
        teamLabel: inferTeamLabel(match, selectedDivision, clubName),
        conditionLabel: match.isHome ? 'Local' : 'Visitante',
        statusLabel: normalizeStatus(match.status),
        originLabel: inferOrigin(match),
        operationalState,
        lineupCount: getLineupCount(match),
        statsCount: getStatsCount(match),
        hasUrgentPending: operationalState.completed < 4,
        isUpcoming: upcoming,
        isPlayed: played,
    };
}

function sortTimelineEntries(entries: MatchTimelineEntry[], tab: MatchTimelineTab) {
    return [...entries].sort((left, right) => {
        const leftTime = left.match.dateTime ? new Date(left.match.dateTime).getTime() : Number.MAX_SAFE_INTEGER;
        const rightTime = right.match.dateTime ? new Date(right.match.dateTime).getTime() : Number.MAX_SAFE_INTEGER;

        if (tab === 'played') {
            return rightTime - leftTime;
        }

        if (tab === 'pending') {
            if (left.isPlayed !== right.isPlayed) {
                return left.isPlayed ? -1 : 1;
            }
        }

        return leftTime - rightTime;
    });
}

function matchesThisWeek(match: ClubDashboardMatch) {
    if (!match.dateTime) return false;
    const date = new Date(match.dateTime).getTime();
    if (!Number.isFinite(date)) return false;
    const now = Date.now();
    const weekAhead = now + 7 * 24 * 60 * 60 * 1000;
    return date >= now && date <= weekAhead;
}

function matchMatchesOperationalFilter(entry: MatchTimelineEntry, filter: MatchOperationalFilter) {
    if (filter === 'all') return true;
    if (filter === 'callup') return !entry.operationalState.callup;
    if (filter === 'analysis') return entry.isPlayed && !entry.operationalState.report;
    if (filter === 'stats') return entry.isPlayed && !entry.operationalState.stats;
    if (filter === 'load') return entry.isPlayed && (!entry.operationalState.report || !entry.operationalState.stats);
    return true;
}

export function ClubFixtureResultsTab({
    clubId,
    clubName,
    divisions,
    upcomingMatches,
    recentMatches,
    pastMatches,
    loading,
}: ClubFixtureResultsTabProps) {
    const [activeTab, setActiveTab] = useState<MatchTimelineTab>('upcoming');
    const [filtersOpen, setFiltersOpen] = useState(false);
    const [createModalOpen, setCreateModalOpen] = useState(false);
    const [calendarOpen, setCalendarOpen] = useState(false);
    const [selectedDivisionId, setSelectedDivisionId] = useState<string>(() => getStoredActiveTeamId(clubId) ?? '');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [tournamentFilter, setTournamentFilter] = useState('all');
    const [rivalFilter, setRivalFilter] = useState('');
    const [conditionFilter, setConditionFilter] = useState<MatchConditionFilter>('all');
    const [statusFilter, setStatusFilter] = useState('all');
    const [operationalFilter, setOperationalFilter] = useState<MatchOperationalFilter>('all');

    // Create internal match form state
    const [createForm, setCreateForm] = useState({
        rival: '',
        date: '',
        time: '',
        venue: '',
        isHome: true,
        matchType: 'amistoso',
        tournamentId: '',
        divisionId: '',
        notes: '',
    });
    const [creating, setCreating] = useState(false);
    const deferredRivalFilter = useDeferredValue(rivalFilter);

    const selectedDivision = divisions.find((division) => division.id === selectedDivisionId) ?? getDefaultDivision(divisions);
    const allMatches = [...upcomingMatches, ...pastMatches].filter((match, index, source) => (
        source.findIndex((candidate) => candidate.id === match.id) === index
    ));
    const canFilterBySelectedDivision = Boolean(
        selectedDivision?.id
        && allMatches.some((match) => matchHasDivisionMetadata(match))
        && allMatches.some((match) => matchBelongsToDivision(match, selectedDivision.id))
    );
    const effectiveDivision = canFilterBySelectedDivision ? selectedDivision : null;
    const scopedMatches = canFilterBySelectedDivision
        ? allMatches.filter((match) => matchBelongsToDivision(match, selectedDivision?.id || null))
        : allMatches;
    const timelineEntries = scopedMatches.map((match) => buildTimelineEntry(match, effectiveDivision, clubName));
    const tournamentOptions = Array.from(new Set(
        timelineEntries
            .map((entry) => entry.match.tournament?.name?.trim())
            .filter((value): value is string => Boolean(value))
    )).sort((left, right) => left.localeCompare(right));

    const filteredEntries = timelineEntries.filter((entry) => {
        if (activeTab === 'upcoming' && !entry.isUpcoming) return false;
        if (activeTab === 'played' && !entry.isPlayed) return false;
        if (activeTab === 'pending' && entry.operationalState.completed === 5) return false;

        if (dateFrom && entry.match.dateTime) {
            const matchDate = new Date(entry.match.dateTime);
            const minDate = new Date(`${dateFrom}T00:00:00`);
            if (matchDate < minDate) return false;
        }

        if (dateTo && entry.match.dateTime) {
            const matchDate = new Date(entry.match.dateTime);
            const maxDate = new Date(`${dateTo}T23:59:59`);
            if (matchDate > maxDate) return false;
        }

        if (tournamentFilter !== 'all' && (entry.match.tournament?.name || '') !== tournamentFilter) return false;
        if (conditionFilter === 'home' && !entry.match.isHome) return false;
        if (conditionFilter === 'away' && entry.match.isHome) return false;
        if (statusFilter !== 'all' && normalizeStatus(entry.match.status) !== statusFilter) return false;
        if (!matchMatchesOperationalFilter(entry, operationalFilter)) return false;

        if (deferredRivalFilter.trim()) {
            const query = deferredRivalFilter.trim().toLowerCase();
            const rival = `${entry.match.opponentName} ${entry.match.opponentShortName || ''}`.toLowerCase();
            if (!rival.includes(query)) return false;
        }

        return true;
    });

    const sortedEntries = sortTimelineEntries(filteredEntries, activeTab);
    const nextMatch = timelineEntries
        .filter((entry) => entry.isUpcoming)
        .sort((left, right) => {
            const leftTime = left.match.dateTime ? new Date(left.match.dateTime).getTime() : Number.MAX_SAFE_INTEGER;
            const rightTime = right.match.dateTime ? new Date(right.match.dateTime).getTime() : Number.MAX_SAFE_INTEGER;
            return leftTime - rightTime;
        })[0] ?? null;

    const kpis: MatchKpiCard[] = [
        {
            id: 'next',
            label: 'Próximo partido',
            value: nextMatch ? formatDateTime(nextMatch.match.dateTime).day : 'Sin agenda',
            hint: nextMatch ? `${nextMatch.teamLabel} vs ${nextMatch.match.opponentShortName || nextMatch.match.opponentName}` : 'Aún no hay partido cargado',
            onClick: () => {
                startTransition(() => {
                    setActiveTab('upcoming');
                    setOperationalFilter('all');
                });
            },
            active: activeTab === 'upcoming' && operationalFilter === 'all',
        },
        {
            id: 'week',
            label: 'Partidos esta semana',
            value: String(timelineEntries.filter((entry) => matchesThisWeek(entry.match)).length).padStart(2, '0'),
            hint: 'Preparacion inmediata del staff',
            onClick: () => {
                const now = new Date();
                const weekAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
                startTransition(() => {
                    setActiveTab('upcoming');
                    setDateFrom(now.toISOString().slice(0, 10));
                    setDateTo(weekAhead.toISOString().slice(0, 10));
                    setOperationalFilter('all');
                    setFiltersOpen(true);
                });
            },
            active: Boolean(dateFrom || dateTo),
        },
        {
            id: 'callup',
            label: 'Alineaciones pendientes',
            value: String(timelineEntries.filter((entry) => !entry.operationalState.lineup && entry.isUpcoming).length).padStart(2, '0'),
            hint: 'Partidos por cerrar antes de competir',
            tone: 'warning',
            onClick: () => {
                startTransition(() => {
                    setActiveTab('pending');
                    setOperationalFilter('callup');
                });
            },
            active: activeTab === 'pending' && operationalFilter === 'callup',
        },
        {
            id: 'analysis',
            label: 'Partidos sin análisis',
            value: String(timelineEntries.filter((entry) => entry.isPlayed && !entry.operationalState.report).length).padStart(2, '0'),
            hint: 'Post partido todavía abierto',
            onClick: () => {
                startTransition(() => {
                    setActiveTab('pending');
                    setOperationalFilter('analysis');
                });
            },
            active: activeTab === 'pending' && operationalFilter === 'analysis',
        },
        {
            id: 'stats',
            label: 'Partidos sin stats',
            value: String(timelineEntries.filter((entry) => entry.isPlayed && !entry.operationalState.stats).length).padStart(2, '0'),
            hint: 'Métricas pendientes de cierre',
            onClick: () => {
                startTransition(() => {
                    setActiveTab('pending');
                    setOperationalFilter('stats');
                });
            },
            active: activeTab === 'pending' && operationalFilter === 'stats',
        },
        {
            id: 'load',
            label: 'Carga física pendiente',
            value: String(timelineEntries.filter((entry) => entry.isPlayed && (!entry.operationalState.stats || !entry.operationalState.report)).length).padStart(2, '0'),
            hint: 'Seguimiento post partido pendiente',
            onClick: () => {
                startTransition(() => {
                    setActiveTab('pending');
                    setOperationalFilter('load');
                });
            },
            active: activeTab === 'pending' && operationalFilter === 'load',
        },
    ];

    if (loading) {
        return (
            <div className="club-matches-shell">
                <div className="club-matches-empty">Cargando operación de partidos...</div>
            </div>
        );
    }

    return (
        <div className="club-matches-shell">
            <header className="club-matches-header">
                <div className="club-matches-header-copy">
                    <span className="club-matches-kicker">Módulo de competición</span>
                    <div className="club-matches-heading-row">
                        <div>
                            <h2>Partidos - {effectiveDivision?.name || clubName}</h2>
                            <p>Planificación, ejecución y análisis de los partidos del equipo</p>
                        </div>

                        {divisions.length > 1 ? (
                            <label className="club-matches-team-selector">
                                <span>Equipo activo</span>
                                <select
                                    value={selectedDivision?.id || ''}
                                    onChange={(event) => {
                                        const nextValue = event.target.value;
                                        setSelectedDivisionId(nextValue);
                                        persistActiveTeamId(clubId, nextValue || null);
                                    }}
                                >
                                    {divisions.map((division) => (
                                        <option key={division.id} value={division.id}>
                                            {division.name}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        ) : null}
                    </div>
                </div>

                <div className="club-matches-header-actions">
                    <button
                        type="button"
                        className="club-matches-btn club-matches-btn-ghost"
                        onClick={() => setCreateModalOpen(true)}
                    >
                        <Sparkles className="w-4 h-4" />
                        Crear partido interno
                    </button>
                    <button
                        type="button"
                        className="club-matches-btn club-matches-btn-ghost"
                        onClick={() => setCalendarOpen(true)}
                    >
                        <Calendar className="w-4 h-4" />
                        Ir al calendario
                    </button>
                    <button
                        type="button"
                        className="club-matches-btn club-matches-btn-primary"
                        onClick={() => setFiltersOpen((current) => !current)}
                    >
                        <Filter className="w-4 h-4" />
                        Filtros
                    </button>
                </div>
            </header>

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

            <section className={`club-matches-filters${filtersOpen ? ' open' : ''}`}>
                <div className="club-matches-filter-grid">
                    <label>
                        <span>Fecha desde</span>
                        <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
                    </label>
                    <label>
                        <span>Fecha hasta</span>
                        <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
                    </label>
                    <label>
                        <span>Torneo</span>
                        <select value={tournamentFilter} onChange={(event) => setTournamentFilter(event.target.value)}>
                            <option value="all">Todos</option>
                            {tournamentOptions.map((option) => (
                                <option key={option} value={option}>{option}</option>
                            ))}
                        </select>
                    </label>
                    <label>
                        <span>Rival</span>
                        <input
                            type="text"
                            placeholder="Buscar rival"
                            value={rivalFilter}
                            onChange={(event) => setRivalFilter(event.target.value)}
                        />
                    </label>
                    <label>
                        <span>Local / Visitante</span>
                        <select value={conditionFilter} onChange={(event) => setConditionFilter(event.target.value as MatchConditionFilter)}>
                            <option value="all">Todos</option>
                            <option value="home">Local</option>
                            <option value="away">Visitante</option>
                        </select>
                    </label>
                    <label>
                        <span>Estado del partido</span>
                        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                            <option value="all">Todos</option>
                            <option value="Programado">Programado</option>
                            <option value="En juego">En juego</option>
                            <option value="Finalizado">Finalizado</option>
                            <option value="Suspendido">Suspendido</option>
                            <option value="Reprogramado">Reprogramado</option>
                        </select>
                    </label>
                    <label>
                        <span>Estado operativo</span>
                        <select value={operationalFilter} onChange={(event) => setOperationalFilter(event.target.value as MatchOperationalFilter)}>
                            <option value="all">Todos</option>
                            <option value="callup">Convocatoria pendiente</option>
                            <option value="analysis">Sin análisis</option>
                            <option value="stats">Sin stats</option>
                            <option value="load">Carga física pendiente</option>
                        </select>
                    </label>
                </div>
            </section>

            <nav className="club-matches-tabs" aria-label="Segmentación de partidos">
                {TIMELINE_TABS.map((tab) => (
                    <button
                        key={tab.id}
                        type="button"
                        className={`club-matches-tab${activeTab === tab.id ? ' active' : ''}`}
                        onClick={() => setActiveTab(tab.id)}
                    >
                        {tab.label}
                    </button>
                ))}
            </nav>

            <main className="club-matches-timeline">
                {sortedEntries.length === 0 ? (
                    <div className="club-matches-empty">
                        No encontramos partidos para el equipo y filtros actuales.
                    </div>
                ) : null}

                {sortedEntries.map((entry) => {
                    const when = formatDateTime(entry.match.dateTime);
                    const tone = statusTone(entry.match.status);
                    const pendingReport = entry.isPlayed && !entry.operationalState.report;
                    const pendingStats = entry.isPlayed && !entry.operationalState.stats;

                    return (
                        <article
                            key={entry.match.id}
                            className={`club-match-card${entry.hasUrgentPending ? ' has-pending' : ''}`}
                            onClick={() => window.location.href = `/club-admin/matches/${entry.match.id}?club=${clubId}`}
                            style={{ cursor: 'pointer' }}
                        >
                            <div className="club-match-card-main">
                                <div className="club-match-card-header">
                                    <div className="club-match-card-date">
                                        <span>{when.day}</span>
                                        <strong>{when.time}</strong>
                                    </div>

                                    <div className="club-match-card-identity">
                                        <div className="club-match-card-title-wrap">
                                            <h3>
                                                {entry.teamLabel} vs{' '}
                                                <span className="club-match-opponent-name">
                                                    {entry.match.opponentShortName || entry.match.opponentName}
                                                </span>
                                            </h3>
                                            {entry.isPlayed && hasScore(entry.match) ? (
                                                <span className="club-match-card-score">
                                                    {entry.match.isHome
                                                        ? `${entry.match.score?.home} - ${entry.match.score?.away}`
                                                        : `${entry.match.score?.away} - ${entry.match.score?.home}`}
                                                </span>
                                            ) : null}
                                        </div>
                                        <div className="club-match-card-meta">
                                            <span className={`club-match-status tone-${tone}`}>{entry.statusLabel}</span>
                                            <span>{entry.match.tournament?.name || 'Partido interno'} - {entry.conditionLabel}</span>
                                            <span className="club-match-origin">{entry.originLabel}</span>
                                        </div>
                                    </div>
                                </div>

                                <section className="club-match-operational">
                                    <div className="club-match-operational-head">
                                        <div>
                                            <span className="club-match-operational-label">Estado operativo</span>
                                            <strong>Progreso {entry.operationalState.completed}/4</strong>
                                        </div>
                                        {entry.hasUrgentPending ? (
                                            <span className="club-match-operational-alert">Requiere acción</span>
                                        ) : (
                                            <span className="club-match-operational-ok">Operativo</span>
                                        )}
                                    </div>

                                    <div className="club-match-triage-grid">
                                        <button
                                            type="button"
                                            className={`club-match-triage-item${entry.operationalState.lineup ? ' complete' : ' pending'}`}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                window.location.href = `/club-admin/matches/${entry.match.id}?section=lineup&club=${clubId}`;
                                            }}
                                        >
                                            <i /> Alineación
                                        </button>
                                        <button
                                            type="button"
                                            className={`club-match-triage-item${entry.operationalState.notes ? ' complete' : ' pending'}`}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                window.location.href = `/club-admin/matches/${entry.match.id}?section=resumen&club=${clubId}`;
                                            }}
                                        >
                                            <i /> Notas prepartido
                                        </button>
                                        <button
                                            type="button"
                                            className={`club-match-triage-item${entry.operationalState.stats ? ' complete' : ' pending'}`}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                window.location.href = `/club-admin/matches/${entry.match.id}?section=stats&club=${clubId}`;
                                            }}
                                        >
                                            <i /> Estadísticas
                                        </button>
                                        <button
                                            type="button"
                                            className={`club-match-triage-item${entry.operationalState.report ? ' complete' : ' pending'}`}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                window.location.href = `/club-admin/matches/${entry.match.id}?section=postpartido&club=${clubId}`;
                                            }}
                                        >
                                            <i /> Reporte final
                                        </button>
                                    </div>

                                    <div className="club-match-indicators">
                                        <span><Users className="w-3.5 h-3.5" /> {entry.lineupCount} convocados</span>
                                        <span><LayoutList className="w-3.5 h-3.5" /> {entry.statsCount} registros de stats</span>
                                        {pendingStats ? <span><ShieldAlert className="w-3.5 h-3.5" /> stats incompletas</span> : null}
                                        {pendingReport ? <span><NotebookPen className="w-3.5 h-3.5" /> sin reporte final</span> : null}
                                    </div>
                                </section>
                            </div>

                            <div className="club-match-actions">
                                <Link
                                    href={`/club-admin/matches/${entry.match.id}?club=${clubId}`}
                                    className="club-match-action primary"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    Abrir ficha
                                    <ChevronRight className="w-4 h-4" />
                                </Link>
                                <Link
                                    href={`/club-admin/matches/${entry.match.id}?section=convocatoria&club=${clubId}`}
                                    className="club-match-action"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <ClipboardList className="w-4 h-4" />
                                    Convocatoria
                                </Link>
                                <Link
                                    href={`/club-admin/matches/${entry.match.id}?section=lineup&club=${clubId}`}
                                    className="club-match-action"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <Users className="w-4 h-4" />
                                    Alineación
                                </Link>
                                <Link
                                    href={`/club-admin/matches/${entry.match.id}?section=stats&club=${clubId}`}
                                    className="club-match-action"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <FileBarChart2 className="w-4 h-4" />
                                    Estadísticas
                                </Link>
                                <Link
                                    href={`/club-admin/matches/${entry.match.id}?section=resumen&club=${clubId}`}
                                    className="club-match-action"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <NotebookPen className="w-4 h-4" />
                                    Prepartido
                                </Link>
                                <Link
                                    href={`/club-admin/matches/${entry.match.id}?section=pizarron&club=${clubId}`}
                                    className="club-match-action"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <Target className="w-4 h-4" />
                                    Pizarrón
                                </Link>
                            </div>
                        </article>
                    );
                })}
            </main>

            {recentMatches.length > 0 ? (
                <footer className="club-matches-footer-note">
                    El estado operativo actual se infiere desde `matches` (`lineups`, `notes`, `events`, `score`) y queda listo para conectarse a `club_match_workspaces` cuando ese backend esté disponible.
                </footer>
            ) : null}

            {/* ── Create Internal Match Modal ── */}
            {createModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setCreateModalOpen(false)}>
                    <div className="bg-[#111118] border border-white/10 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between p-5 border-b border-white/10">
                            <h3 className="text-lg font-bold">Crear partido interno</h3>
                            <button onClick={() => setCreateModalOpen(false)} className="text-white/50 hover:text-white"><X className="w-5 h-5" /></button>
                        </div>
                        <div className="p-5 space-y-4">
                            <label className="block">
                                <span className="text-xs text-white/50 uppercase tracking-wider">Rival</span>
                                <input
                                    type="text"
                                    value={createForm.rival}
                                    onChange={(e) => setCreateForm({ ...createForm, rival: e.target.value })}
                                    placeholder="Nombre del rival"
                                    className="w-full mt-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#00ff88]/50"
                                />
                            </label>
                            <div className="grid grid-cols-2 gap-3">
                                <label className="block">
                                    <span className="text-xs text-white/50 uppercase tracking-wider">Fecha</span>
                                    <input
                                        type="date"
                                        value={createForm.date}
                                        onChange={(e) => setCreateForm({ ...createForm, date: e.target.value })}
                                        className="w-full mt-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#00ff88]/50"
                                    />
                                </label>
                                <label className="block">
                                    <span className="text-xs text-white/50 uppercase tracking-wider">Hora</span>
                                    <input
                                        type="time"
                                        value={createForm.time}
                                        onChange={(e) => setCreateForm({ ...createForm, time: e.target.value })}
                                        className="w-full mt-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#00ff88]/50"
                                    />
                                </label>
                            </div>
                            <label className="block">
                                <span className="text-xs text-white/50 uppercase tracking-wider">Sede / Cancha</span>
                                <input
                                    type="text"
                                    value={createForm.venue}
                                    onChange={(e) => setCreateForm({ ...createForm, venue: e.target.value })}
                                    placeholder="Nombre de la cancha"
                                    className="w-full mt-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#00ff88]/50"
                                />
                            </label>
                            <div className="grid grid-cols-2 gap-3">
                                <label className="block">
                                    <span className="text-xs text-white/50 uppercase tracking-wider">Condición</span>
                                    <select
                                        value={createForm.isHome ? 'home' : 'away'}
                                        onChange={(e) => setCreateForm({ ...createForm, isHome: e.target.value === 'home' })}
                                        className="w-full mt-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#00ff88]/50"
                                    >
                                        <option value="home">Local</option>
                                        <option value="away">Visitante</option>
                                    </select>
                                </label>
                                <label className="block">
                                    <span className="text-xs text-white/50 uppercase tracking-wider">Tipo</span>
                                    <select
                                        value={createForm.matchType}
                                        onChange={(e) => setCreateForm({ ...createForm, matchType: e.target.value })}
                                        className="w-full mt-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#00ff88]/50"
                                    >
                                        <option value="amistoso">Amistoso</option>
                                        <option value="entrenamiento">Entrenamiento</option>
                                        <option value="interno">Interno</option>
                                        <option value="otro">Otro</option>
                                    </select>
                                </label>
                            </div>
                            <label className="block">
                                <span className="text-xs text-white/50 uppercase tracking-wider">Equipo / División</span>
                                <select
                                    value={createForm.divisionId}
                                    onChange={(e) => setCreateForm({ ...createForm, divisionId: e.target.value })}
                                    className="w-full mt-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#00ff88]/50"
                                >
                                    <option value="">Seleccionar equipo...</option>
                                    {divisions.map((division) => (
                                        <option key={division.id} value={division.id}>{division.name}</option>
                                    ))}
                                </select>
                            </label>
                            <label className="block">
                                <span className="text-xs text-white/50 uppercase tracking-wider">Notas</span>
                                <textarea
                                    value={createForm.notes}
                                    onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })}
                                    rows={3}
                                    placeholder="Notas opcionales..."
                                    className="w-full mt-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#00ff88]/50 resize-none"
                                />
                            </label>
                        </div>
                        <div className="flex items-center gap-3 p-5 border-t border-white/10">
                            <button
                                onClick={() => setCreateModalOpen(false)}
                                className="flex-1 py-2.5 rounded-xl border border-white/10 text-sm font-medium hover:bg-white/5"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={async () => {
                                    if (!createForm.rival || !createForm.date || !createForm.time) {
                                        alert('Completá rival, fecha y hora');
                                        return;
                                    }
                                    setCreating(true);
                                    try {
                                        const response = await fetch('/api/club-admin/matches', {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({
                                                awayClubId: createForm.rival,
                                                date: createForm.date,
                                                time: createForm.time,
                                                venue: createForm.venue,
                                                isHome: createForm.isHome,
                                                matchType: createForm.matchType,
                                                divisionId: createForm.divisionId || null,
                                                notes: createForm.notes,
                                            }),
                                        });
                                        if (!response.ok) throw new Error('Error al crear');
                                        const data = await response.json();
                                        setCreateModalOpen(false);
                                        window.open(`/club-admin/matches/${data.id}`, '_blank');
                                        // Refresh list after short delay
                                        setTimeout(() => window.location.reload(), 500);
                                    } catch {
                                        alert('Error al crear el partido');
                                    } finally {
                                        setCreating(false);
                                    }
                                }}
                                disabled={creating}
                                className="flex-1 py-2.5 rounded-xl bg-[#00ff88] text-[#0a0a0f] text-sm font-bold hover:bg-[#00ff88]/90 disabled:opacity-50"
                            >
                                {creating ? 'Creando...' : 'Crear partido'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Calendar Modal ── */}
            {calendarOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setCalendarOpen(false)}>
                    <div className="bg-[#111118] border border-white/10 rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between p-5 border-b border-white/10">
                            <h3 className="text-lg font-bold">Calendario del club</h3>
                            <button onClick={() => setCalendarOpen(false)} className="text-white/50 hover:text-white"><X className="w-5 h-5" /></button>
                        </div>
                        <div className="p-5">
                            <div className="space-y-2">
                                {timelineEntries
                                    .filter((e) => e.isUpcoming)
                                    .sort((a, b) => new Date(a.match.dateTime || 0).getTime() - new Date(b.match.dateTime || 0).getTime())
                                    .map((entry) => {
                                        const w = formatDateTime(entry.match.dateTime);
                                        return (
                                            <div key={entry.match.id} className="flex items-center gap-4 p-3 bg-white/5 rounded-lg border border-white/5">
                                                <div className="text-center min-w-[60px]">
                                                    <div className="text-xs text-white/40 uppercase">{w.day.split(' ')[0]}</div>
                                                    <div className="text-lg font-bold">{w.day.split(' ')[1]}</div>
                                                </div>
                                                <div className="flex-1">
                                                    <div className="text-sm font-bold">{entry.teamLabel} vs {entry.match.opponentShortName || entry.match.opponentName}</div>
                                                    <div className="text-xs text-white/50">{w.time} · {entry.match.tournament?.name || 'Interno'} · {entry.conditionLabel}</div>
                                                </div>
                                                <Link
                                                    href={`/club-admin/matches/${entry.match.id}`}
                                                    target="_blank"
                                                    className="text-xs px-3 py-1.5 bg-white/10 rounded-lg hover:bg-white/20"
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    Ver
                                                </Link>
                                            </div>
                                        );
                                    })}
                                {timelineEntries.filter((e) => e.isUpcoming).length === 0 && (
                                    <div className="text-center text-white/40 py-8">No hay partidos próximos en el calendario</div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
