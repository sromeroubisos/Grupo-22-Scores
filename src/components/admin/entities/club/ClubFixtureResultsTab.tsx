'use client';

import Link from 'next/link';
import { useDeferredValue, useState, startTransition, useCallback, useEffect, useMemo } from 'react';
import { Calendar, ChevronRight, ClipboardList, FileBarChart2, Filter, LayoutList, NotebookPen, ShieldAlert, Sparkles, Target, Users, X } from 'lucide-react';
import { ClubSeasonStatsPanel } from './ClubSeasonStatsPanel';
import { CreateInternalMatchModal } from './CreateInternalMatchModal';
import { getStoredActiveTeamId, persistActiveTeamId } from '@/lib/club-admin/activeTeamSelection';
import { resolveActiveSeason, persistActiveSeason } from '@/lib/club-admin/activeSeasonSelection';
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

type MatchTimelineTab = 'upcoming' | 'played' | 'pending' | 'stats';
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
    { id: 'stats', label: 'Estadísticas' },
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

function getStatsCount(match: ClubDashboardMatch): number {
    if (typeof match.statsCount === 'number') return match.statsCount;

    const events = match.events;
    if (Array.isArray(events)) return events.length;
    if (!events || typeof events !== 'object') return 0;

    const values = Object.values(events as Record<string, unknown>);
    return values.reduce<number>((acc, value) => acc + (Array.isArray(value) ? value.length : 0), 0);
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
    const state: MatchOperationalState = {
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
    const [selectedSeason, setSelectedSeason] = useState(() => resolveActiveSeason(clubId));


    const deferredRivalFilter = useDeferredValue(rivalFilter);

    const [displayLimit, setDisplayLimit] = useState(50);
    const [apiMatches, setApiMatches] = useState<ClubDashboardMatch[]>([]);
    const [apiCursor, setApiCursor] = useState<string | null>(null);
    const [apiHasMore, setApiHasMore] = useState(false);
    const [apiLoading, setApiLoading] = useState(false);

    const selectedDivision = useMemo(() => divisions.find((division) => division.id === selectedDivisionId) ?? getDefaultDivision(divisions), [divisions, selectedDivisionId]);

    const initialMatches = useMemo(() => {
        const combined = [...upcomingMatches, ...pastMatches];
        const map = new Map<string, ClubDashboardMatch>();
        combined.forEach((m) => { if (!map.has(m.id)) map.set(m.id, m); });
        return Array.from(map.values());
    }, [upcomingMatches, pastMatches]);

    const allMatches = useMemo(() => {
        const map = new Map<string, ClubDashboardMatch>();
        initialMatches.forEach((m) => map.set(m.id, m));
        apiMatches.forEach((m) => { if (!map.has(m.id)) map.set(m.id, m); });
        return Array.from(map.values());
    }, [initialMatches, apiMatches]);

    const canFilterBySelectedDivision = useMemo(() => Boolean(
        selectedDivision?.id
        && allMatches.some((match) => matchHasDivisionMetadata(match))
        && allMatches.some((match) => matchBelongsToDivision(match, selectedDivision.id))
    ), [selectedDivision, allMatches]);

    const effectiveDivision = canFilterBySelectedDivision ? selectedDivision : null;

    const scopedMatches = useMemo(() => canFilterBySelectedDivision
        ? allMatches.filter((match) => matchBelongsToDivision(match, selectedDivision?.id || null))
        : allMatches, [canFilterBySelectedDivision, allMatches, selectedDivision]);

    const timelineEntries = useMemo(() => scopedMatches.map((match) => buildTimelineEntry(match, effectiveDivision, clubName)), [scopedMatches, effectiveDivision, clubName]);

    const seasonFilteredEntries = useMemo(() => {
        if (!selectedSeason) return timelineEntries;
        return timelineEntries.filter((entry) => {
            if (!entry.match.dateTime) return true;
            return String(new Date(entry.match.dateTime).getFullYear()) === selectedSeason;
        });
    }, [timelineEntries, selectedSeason]);

    const tournamentOptions = useMemo(() => Array.from(new Set(
        timelineEntries
            .map((entry) => entry.match.tournament?.name?.trim())
            .filter((value): value is string => Boolean(value))
    )).sort((left, right) => left.localeCompare(right)), [timelineEntries]);

    const seasonOptions = useMemo(() => {
        const years = new Set<string>();
        allMatches.forEach((match) => {
            if (match.dateTime) {
                const year = String(new Date(match.dateTime).getFullYear());
                if (year && !Number.isNaN(Number(year))) years.add(year);
            }
        });
        const currentYear = String(new Date().getFullYear());
        years.add(currentYear);
        return Array.from(years).sort((left, right) => Number(right) - Number(left));
    }, [allMatches]);

    const filteredEntries = useMemo(() => timelineEntries.filter((entry) => {
        if (activeTab === 'upcoming' && !entry.isUpcoming) return false;
        if (activeTab === 'played' && !entry.isPlayed) return false;
        if (activeTab === 'pending' && entry.operationalState.completed === 5) return false;

        if (selectedSeason && entry.match.dateTime) {
            const matchYear = String(new Date(entry.match.dateTime).getFullYear());
            if (matchYear !== selectedSeason) return false;
        }

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
    }), [timelineEntries, activeTab, selectedSeason, dateFrom, dateTo, tournamentFilter, conditionFilter, statusFilter, operationalFilter, deferredRivalFilter]);

    const sortedEntries = useMemo(() => sortTimelineEntries(filteredEntries, activeTab), [filteredEntries, activeTab]);

    const nextMatch = useMemo(() => timelineEntries
        .filter((entry) => entry.isUpcoming)
        .sort((left, right) => {
            const leftTime = left.match.dateTime ? new Date(left.match.dateTime).getTime() : Number.MAX_SAFE_INTEGER;
            const rightTime = right.match.dateTime ? new Date(right.match.dateTime).getTime() : Number.MAX_SAFE_INTEGER;
            return leftTime - rightTime;
        })[0] ?? null, [timelineEntries]);

    const kpis: MatchKpiCard[] = useMemo(() => [
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
            value: String(seasonFilteredEntries.filter((entry) => !entry.operationalState.lineup && entry.isUpcoming).length).padStart(2, '0'),
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
            value: String(seasonFilteredEntries.filter((entry) => entry.isPlayed && !entry.operationalState.report).length).padStart(2, '0'),
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
            value: String(seasonFilteredEntries.filter((entry) => entry.isPlayed && !entry.operationalState.stats).length).padStart(2, '0'),
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
            value: String(seasonFilteredEntries.filter((entry) => entry.isPlayed && (!entry.operationalState.stats || !entry.operationalState.report)).length).padStart(2, '0'),
            hint: 'Seguimiento post partido pendiente',
            onClick: () => {
                startTransition(() => {
                    setActiveTab('pending');
                    setOperationalFilter('load');
                });
            },
            active: activeTab === 'pending' && operationalFilter === 'load',
        },
    ], [nextMatch, timelineEntries, seasonFilteredEntries, activeTab, operationalFilter, dateFrom, dateTo]);

    const visibleEntries = useMemo(() => sortedEntries.slice(0, displayLimit), [sortedEntries, displayLimit]);
    const hasMoreEntries = sortedEntries.length > displayLimit;

    useEffect(() => {
        setDisplayLimit(50);
        setApiMatches([]);
        setApiCursor(null);
        setApiHasMore(true);
    }, [activeTab]);

    useEffect(() => {
        persistActiveSeason(clubId, selectedSeason);
    }, [clubId, selectedSeason]);

    const handleLoadMoreApi = useCallback(async () => {
        if (apiLoading) return;
        setApiLoading(true);
        try {
            const status = activeTab === 'upcoming' ? 'upcoming' : activeTab === 'played' ? 'played' : 'all';
            const params = new URLSearchParams({
                club: clubId,
                status,
                limit: '25',
                direction: activeTab === 'upcoming' ? 'asc' : 'desc',
            });
            if (apiCursor) params.set('cursor', apiCursor);
            const res = await fetch(`/api/club-admin/matches-list?${params.toString()}`, { credentials: 'same-origin' });
            const json = await res.json();
            if (json.ok && json.data) {
                const fetched = json.data.matches as ClubDashboardMatch[];
                setApiMatches((prev) => [...prev, ...fetched]);
                setApiCursor(json.data.nextCursor);
                setApiHasMore(json.data.hasMore);
            }
        } catch (e) {
            console.error('Error loading more matches:', e);
        } finally {
            setApiLoading(false);
        }
    }, [apiLoading, activeTab, clubId, apiCursor]);



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
                    <label className="club-matches-season-selector" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}>
                        <span style={{ color: 'rgba(255,255,255,0.6)' }}>Periodo</span>
                        <select
                            value={selectedSeason}
                            onChange={(e) => setSelectedSeason(e.target.value)}
                            style={{
                                background: 'rgba(255,255,255,0.08)',
                                border: '1px solid rgba(255,255,255,0.12)',
                                borderRadius: '6px',
                                padding: '6px 10px',
                                color: '#fff',
                                fontSize: '0.85rem',
                            }}
                        >
                            {seasonOptions.map((s) => (
                                <option key={s} value={s}>{s}</option>
                            ))}
                        </select>
                    </label>
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
                {activeTab === 'stats' ? (
                    <ClubSeasonStatsPanel
                        clubId={clubId}
                        clubName={clubName}
                        season={selectedSeason}
                        availableSeasons={seasonOptions}
                        onSeasonChange={setSelectedSeason}
                    />
                ) : (
                    <>
                        {visibleEntries.length === 0 ? (
                            <div className="club-matches-empty">
                                No encontramos partidos para el equipo y filtros actuales.
                            </div>
                        ) : null}

                        {visibleEntries.map((entry) => {
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

                {hasMoreEntries && (
                    <div className="club-matches-load-more">
                        <button
                            type="button"
                            className="club-matches-btn club-matches-btn-ghost"
                            onClick={() => setDisplayLimit((prev) => prev + 50)}
                        >
                            Mostrar más partidos ({sortedEntries.length - displayLimit} restantes)
                        </button>
                    </div>
                )}

                {apiHasMore && (
                    <div className="club-matches-load-more">
                        <button
                            type="button"
                            className="club-matches-btn club-matches-btn-primary"
                            onClick={handleLoadMoreApi}
                            disabled={apiLoading}
                        >
                            {apiLoading ? 'Cargando desde base de datos...' : 'Cargar más partidos históricos'}
                        </button>
                    </div>
                )}
                    </>
                )}
            </main>

            {/* ── Create Internal Match Modal ── */}
            <CreateInternalMatchModal
                open={createModalOpen}
                clubId={clubId}
                divisions={divisions}
                onClose={() => setCreateModalOpen(false)}
            />

            {/* ── Calendar Modal ── */}
            {calendarOpen && (
                <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md" onClick={() => setCalendarOpen(false)}>
                    <div className="bg-[#111118] border border-white/10 rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
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
