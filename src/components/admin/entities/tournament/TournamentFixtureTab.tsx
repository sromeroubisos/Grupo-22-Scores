'use client';

import React, { useDeferredValue, useEffect, useMemo, useState, useRef } from 'react';
import ProtectedLink from '@/components/ProtectedLink';
import {
    AlertCircle,
    AlertTriangle,
    Calendar,
    CheckCircle2,
    ChevronDown,
    ChevronRight,
    CircleDashed,
    Clock,
    Download,
    Edit2,
    Eye,
    FileCheck,
    Grid,
    List,
    MapPin,
    MoreVertical,
    Plus,
    RefreshCw,
    Search,
    Settings,
    ShieldAlert,
    ShieldCheck,
    Trash2,
    Trophy,
    X,
    XCircle,
    Zap,
} from 'lucide-react';
import type { Database } from '@/lib/database.types';
import type { MatchStatus, MatchWithClubs, PhaseWithRounds, RoundWithMatches } from '@/lib/types/fixture';
import { APP_TIMEZONE, formatDateInTimeZone } from '@/lib/timezone';
import { FixtureProvider, useFixture } from './FixtureContext';
import { FixtureMatchEditor } from './FixtureMatchEditor';
import MatchCenterClient, { MatchRow } from '@/app/admin/super/partidos/[id]/MatchCenterClient';
import './fixture-management.css';
import { useAnimatedDisclosure } from './useAnimatedDisclosure';
import { FixtureImportWizard as SmartFixtureImportWizard } from './FixtureImportWizard';

type TournamentRow = Database['public']['Tables']['tournaments']['Row'];

type FixtureDiagnosticItem = {
    type: 'error' | 'warning';
    message: string;
    context?: string | null;
};

type FixtureDiagnosticsResult = {
    isValid: boolean;
    diagnostics: FixtureDiagnosticItem[];
} | null;

const STATUS_LABELS: Record<MatchStatus, string> = {
    scheduled: 'Programado',
    live: 'En vivo',
    final: 'Finalizado',
    postponed: 'Reprogramado',
    suspended: 'Suspendido',
    cancelled: 'Cancelado',
};

const VIEW_OPTIONS = [
    { id: 'rounds', label: 'Fechas', icon: Grid },
    { id: 'calendar', label: 'Calendario', icon: Calendar },
    { id: 'list', label: 'Lista tecnica', icon: List },
    { id: 'groups', label: 'Grupos', icon: Trophy },
] as const;

function formatShortDate(value: string | null | undefined) {
    const formatted = formatDateInTimeZone(value, 'es-AR', { day: '2-digit', month: 'short' }, APP_TIMEZONE);
    return formatted ? formatted.replace('.', '').toUpperCase() : 'Sin fecha';
}

function formatLongDate(value: string | null | undefined) {
    return formatDateInTimeZone(value, 'es-AR', {
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    }, APP_TIMEZONE) || 'Sin fecha definida';
}

function formatShortTime(value: string | null | undefined) {
    return formatDateInTimeZone(value, 'es-AR', { hour: '2-digit', minute: '2-digit', hour12: false }, APP_TIMEZONE) || '--:--';
}

function formatRoundRange(round: RoundWithMatches) {
    if (!round.startDate && !round.endDate) return 'Ventana sin programacion';
    if (round.startDate && round.endDate) return `${formatLongDate(round.startDate)} - ${formatLongDate(round.endDate)}`;
    return formatLongDate(round.startDate || round.endDate);
}

function getPhaseTypeLabel(phaseType: string | null | undefined) {
    switch (phaseType) {
        case 'group_stage':
            return 'Fase de grupos';
        case 'knockout':
            return 'Eliminacion';
        case 'playoff':
            return 'Playoff';
        default:
            return 'Liga';
    }
}

function getStatusTone(status: string) {
    if (status === 'live') return 'fixture-status-live';
    if (status === 'final') return 'fixture-status-finished';
    if (status === 'scheduled') return 'fixture-status-scheduled';
    return 'fixture-status-draft';
}

function getRoundTone(round: RoundWithMatches) {
    if (round.isCompleted) return 'fixture-pill-success';
    if (round.matchCount === 0) return 'fixture-pill-draft';
    return 'fixture-pill-info';
}

function getRoundStateLabel(round: RoundWithMatches) {
    if (round.isCompleted) return 'Completa';
    if (round.matchCount === 0) return 'Vacia';
    return 'Activa';
}

function getMatchHeadline(match: MatchWithClubs) {
    const homeScore = match.score?.home ?? 0;
    const awayScore = match.score?.away ?? 0;

    if (match.status === 'live') return `LIVE -- ${homeScore}-${awayScore}`;
    if (match.status === 'final') return `FINAL -- ${homeScore}-${awayScore}`;
    if (match.status === 'scheduled') return `${formatShortDate(match.dateTime)} -- ${formatShortTime(match.dateTime)}`;
    if (match.status === 'postponed') return 'REPROGRAMADO';
    if (match.status === 'suspended') return 'SUSPENDIDO';
    if (match.status === 'cancelled') return 'CANCELADO';
    return 'POR DEFINIR';
}

function buildMatchSearchBlob(match: MatchWithClubs, roundName: string) {
    return [
        roundName,
        match.homeClub?.name,
        match.homeClub?.shortName,
        match.homeClub?.shortName || '',
        match.awayClub?.shortName || '',
        match.venue || '',
        match.notes || '',
    ].filter(Boolean).join(' ').toLowerCase();
}

function buildExportFileName(name: string | null | undefined) {
    const base = (name || 'fixture')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return `${base || 'fixture'}-${new Date().toISOString().slice(0, 10)}.json`;
}

function buildAdminMatchHref(matchId: string) {
    return `/admin/super/partidos/${encodeURIComponent(matchId)}`;
}


export function TournamentFixtureTab({
    id,
    data,
    phaseId,
    isSubTab = false
}: {
    id: string;
    data: TournamentRow;
    phaseId?: string;
    isSubTab?: boolean;
}) {
    if (isSubTab) {
        return <FixtureManagementCenter tournamentId={id} tournamentData={data} initialPhaseId={phaseId} />;
    }

    return (
        <FixtureProvider tournamentId={id} initialFixture={null}>
            <FixtureManagementCenter tournamentId={id} tournamentData={data} initialPhaseId={phaseId} />
        </FixtureProvider>
    );
}

function FixtureManagementCenter({
    tournamentId,
    tournamentData,
    initialPhaseId,
}: {
    tournamentId: string;
    tournamentData: TournamentRow;
    initialPhaseId?: string;
}) {
    const {
        fixture,
        viewMode,
        setViewMode,
        refreshFixture,
        selectedPhaseId,
        selectPhase,
        setFilterStatus,
        filterStatus,
        validateFixture,
        editorOpen,
        closeEditor,
        openEditor,
        resetRound,
        deleteMatch,
    } = useFixture();

    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [roundFilter, setRoundFilter] = useState('all');
    const [showWizard, setShowWizard] = useState(false);
    const [showDiagnostics, setShowDiagnostics] = useState(false);
    const [diagnostics, setDiagnostics] = useState<FixtureDiagnosticsResult>(null);
    const [isValidating, setIsValidating] = useState(false);
    const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
    const [showMobileAdvancedControls, setShowMobileAdvancedControls] = useState(false);
    const [managingMatchId, setManagingMatchId] = useState<string | null>(null);
    const deferredSearch = useDeferredValue(searchQuery);

    const handleDeleteMatch = async (matchId: string) => {
        if (!window.confirm("¿Estás seguro de que deseas eliminar este partido? Esta acción no se puede deshacer.")) {
            return;
        }

        try {
            await deleteMatch(matchId);
            window.alert("Partido eliminado exitosamente");
            await refreshFixture();
        } catch (error) {
            console.error(error);
            window.alert("Error al eliminar el partido");
        }
    };

    const initialLoadDone = useRef(false);

    useEffect(() => {
        const load = async () => {
            if (initialLoadDone.current) return;
            setLoading(true);
            await refreshFixture();
            if (initialPhaseId) {
                selectPhase(initialPhaseId);
            }
            setLoading(false);
            initialLoadDone.current = true;
        };

        load();
    }, [refreshFixture, initialPhaseId, selectPhase]);

    const selectedPhase = useMemo<PhaseWithRounds | null>(() => {
        if (!fixture) return null;
        return fixture.phases.find((phase) => phase.id === selectedPhaseId) || fixture.phases[0] || null;
    }, [fixture, selectedPhaseId]);

    const globalMetrics = useMemo(() => {
        if (!fixture) {
            return {
                totalMatches: 0,
                totalRounds: 0,
                scheduledMatches: 0,
                completedMatches: 0,
                pendingMatches: 0,
                readyMatches: 0,
                roundsWithoutMatches: 0,
                missingVenue: 0,
                missingAssignments: 0,
            };
        }

        let totalMatches = 0;
        let totalRounds = 0;
        let scheduledMatches = 0;
        let completedMatches = 0;
        let readyMatches = 0;
        let roundsWithoutMatches = 0;
        let missingVenue = 0;
        let missingAssignments = 0;

        fixture.phases.forEach((phase) => {
            totalRounds += phase.rounds.length;
            phase.rounds.forEach((round) => {
                if (round.matches.length === 0) roundsWithoutMatches += 1;

                totalMatches += round.matchCount;
                round.matches.forEach((match) => {
                    if (match.status === 'scheduled' || match.status === 'live') scheduledMatches += 1;
                    if (match.status === 'final') completedMatches += 1;
                    if (match.homeClubId && match.awayClubId && match.dateTime && match.venue) readyMatches += 1;
                    if (!match.venue) missingVenue += 1;
                    if (!match.homeClubId || !match.awayClubId) missingAssignments += 1;
                });
            });
        });

        return {
            totalMatches,
            totalRounds,
            scheduledMatches,
            completedMatches,
            pendingMatches: totalMatches - completedMatches,
            readyMatches,
            roundsWithoutMatches,
            missingVenue,
            missingAssignments,
        };
    }, [fixture]);

    const visibleRounds = useMemo(() => {
        if (!selectedPhase) return [];

        const normalizedQuery = deferredSearch.trim().toLowerCase();
        const hasFilters = normalizedQuery.length > 0 || filterStatus !== 'all' || roundFilter !== 'all';

        const rounds = selectedPhase.rounds
            .filter((round) => roundFilter === 'all' || round.id === roundFilter)
            .map((round) => ({
                ...round,
                matches: round.matches.filter((match) => {
                    const statusMatches = filterStatus === 'all' || match.status === filterStatus;
                    const searchMatches =
                        normalizedQuery.length === 0 ||
                        buildMatchSearchBlob(match, round.name).includes(normalizedQuery);
                    return statusMatches && searchMatches;
                }),
            }));

        if (!hasFilters) return rounds;
        return rounds.filter((round) => roundFilter !== 'all' || round.matches.length > 0);
    }, [selectedPhase, deferredSearch, filterStatus, roundFilter]);

    const visibleMatches = useMemo(
        () =>
            visibleRounds.flatMap((round) =>
                round.matches.map((match) => ({
                    ...match,
                    roundName: round.name,
                }))
            ),
        [visibleRounds]
    );

    const progressPercent = globalMetrics.totalMatches
        ? Math.round((globalMetrics.readyMatches / globalMetrics.totalMatches) * 100)
        : 0;
    const activeFilterCount =
        (roundFilter !== 'all' ? 1 : 0) +
        (filterStatus !== 'all' ? 1 : 0) +
        (searchQuery.trim() ? 1 : 0);

    const validationItems = useMemo(() => {
        if (diagnostics?.diagnostics) {
            return diagnostics.diagnostics.slice(0, 5).map((item: FixtureDiagnosticItem, index: number) => ({
                id: `api-${index}`,
                severity: (item.type === 'error' ? 'critical' : 'warning') as 'critical' | 'warning',
                title: item.message || 'Observacion detectada',
                description: item.context || 'Revisa la configuracion de fases y jornadas.',
            }));
        }

        const items: Array<{
            id: string;
            severity: 'critical' | 'warning' | 'success';
            title: string;
            description: string;
        }> = [];

        if (!fixture || fixture.phases.length === 0) {
            items.push({
                id: 'no-structure',
                severity: 'warning',
                title: 'Sin fixture cargado',
                description: 'Podés crear partidos manualmente o generar un fixture automático.',
            });
        }

        if (globalMetrics.roundsWithoutMatches > 0) {
            items.push({
                id: 'empty-rounds',
                severity: 'warning',
                title: `${globalMetrics.roundsWithoutMatches} jornadas vacias`,
                description: 'Hay bloques sin partidos asignados dentro del calendario.',
            });
        }

        if (globalMetrics.missingVenue > 0) {
            items.push({
                id: 'missing-venue',
                severity: 'warning',
                title: `${globalMetrics.missingVenue} partidos sin sede`,
                description: 'Completa cancha o estadio para evitar huecos en la operacion.',
            });
        }

        if (globalMetrics.missingAssignments > 0) {
            items.push({
                id: 'missing-clubs',
                severity: 'critical',
                title: `${globalMetrics.missingAssignments} cruces incompletos`,
                description: 'Faltan equipos asignados en uno o mas partidos.',
            });
        }

        if (items.length === 0) {
            items.push({
                id: 'clear',
                severity: 'success',
                title: 'Estructura estable',
                description: 'No se detectan conflictos operativos visibles en la configuracion.',
            });
        }

        return items;
    }, [diagnostics, fixture, globalMetrics]);

    const handleValidate = async () => {
        setIsValidating(true);
        const result = (await validateFixture()) as FixtureDiagnosticsResult;
        setDiagnostics(result);
        setShowDiagnostics(true);
        setIsValidating(false);
    };

    const handleExportFixture = () => {
        const payload = selectedPhase
            ? {
                tournamentId,
                tournament: fixture?.tournamentName || tournamentData.name,
                season: fixture?.tournamentSeason || tournamentData.season_id || null,
                phase: selectedPhase,
            }
            : fixture;

        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = buildExportFileName(`${fixture?.tournamentName || tournamentData.name}-fixture`);
        anchor.click();
        URL.revokeObjectURL(url);
    };

    const hasFixtureStructure = Boolean(fixture && fixture.phases.length > 0);
    const currentViewLabel = VIEW_OPTIONS.find((option) => option.id === viewMode)?.label || 'Fechas';
    const breadcrumbSeason = fixture?.tournamentSeason || tournamentData.season_id || 'Temporada';

    if (loading && !fixture) {
        return (
            <div className="fixture-loading-shell">
                <RefreshCw className="spin" size={28} />
            </div>
        );
    }

    if (managingMatchId) {
        const matchData = fixture?.phases.flatMap(p => p.rounds).flatMap(r => r.matches).find(m => m.id === managingMatchId);
        if (matchData) {
            const matchRow: MatchRow = {
                id: matchData.id,
                tournament_id: matchData.tournamentId,
                phase_id: matchData.phaseId,
                round_id: matchData.roundId,
                date_time: matchData.dateTime,
                venue: matchData.venue,
                home_club_id: matchData.homeClubId,
                away_club_id: matchData.awayClubId,
                status: matchData.status,
                score: matchData.score,
                clock: (matchData as unknown as { clock?: Record<string, unknown> }).clock || {},
                events: matchData.events || null,
                lineups: matchData.lineups || null,
                stream_url: matchData.streamUrl,
                replay_url: matchData.replayUrl,
                created_at: matchData.createdAt,
                updated_at: matchData.updatedAt,
                homeClub: matchData.homeClub ? { id: matchData.homeClub.id, name: matchData.homeClub.name, short_name: matchData.homeClub.shortName, logo_url: matchData.homeClub.logo, primary_color: null } : null,
                awayClub: matchData.awayClub ? { id: matchData.awayClub.id, name: matchData.awayClub.name, short_name: matchData.awayClub.shortName, logo_url: matchData.awayClub.logo, primary_color: null } : null,
                tournament: tournamentData ? { id: tournamentData.id, name: tournamentData.name, sport_id: (tournamentData as TournamentRow & { sport_id?: string | null }).sport_id ?? null } : null,
                // Points
                home_base_points: matchData.homeBasePoints ?? null,
                away_base_points: matchData.awayBasePoints ?? null,
                home_bonus_points: matchData.homeBonusPoints ?? 0,
                away_bonus_points: matchData.awayBonusPoints ?? 0,
                points_autocalculated: matchData.pointsAutocalculated ?? true,
                points_override_reason: matchData.pointsOverrideReason ?? null,
            };
            return (
                <div className="fixture-management-center" style={{ padding: 0 }}>
                    <MatchCenterClient
                        initialMatch={matchRow}
                        matchId={managingMatchId}
                        onClose={() => {
                            setManagingMatchId(null);
                            refreshFixture();
                        }}
                    />
                </div>
            );
        }
    }

    return (
        <div className="fixture-management-center">
            <header className="fixture-header-zone fixture-glass">
                <div className="fixture-header-context">
                    <div className="fixture-breadcrumb">TORNEOS / {breadcrumbSeason} / MANAGE / FIXTURE</div>
                    <div className="fixture-title-stack">
                        <div>
                            <h1>{fixture?.tournamentName || tournamentData.name || 'Fixture Control'}</h1>
                            <p>Consola operativa para fases, jornadas y carga masiva de partidos.</p>
                        </div>
                        <span className="fixture-phase-badge">
                            {selectedPhase ? `${getPhaseTypeLabel(selectedPhase.phaseType)} · ${selectedPhase.name}` : 'Sin fase activa'}
                        </span>
                    </div>
                </div>

                <div className="fixture-metrics-strip">
                    <MetricCard label="Fechas" value={globalMetrics.totalRounds} tone="neutral" />
                    <MetricCard label="Partidos" value={globalMetrics.totalMatches} tone="neutral" />
                    <MetricCard label="Programados" value={globalMetrics.scheduledMatches} tone="info" />
                    <MetricCard label="Finalizados" value={globalMetrics.completedMatches} tone="success" />
                </div>

                <div className="fixture-header-actions">
                    <button className="fixture-btn fixture-btn-secondary" onClick={handleValidate} disabled={isValidating}>
                        {isValidating ? <RefreshCw className="spin" size={16} /> : <ShieldAlert size={16} />}
                        <span>{isValidating ? 'Validando...' : 'Validar'}</span>
                    </button>
                    <button className="fixture-btn fixture-btn-secondary" onClick={() => refreshFixture()}>
                        <RefreshCw size={16} />
                        <span>Actualizar</span>
                    </button>
                    <button className="fixture-btn fixture-btn-secondary" onClick={handleExportFixture} type="button">
                        <Download size={16} />
                        <span>Exportar</span>
                    </button>
                    <button className="fixture-btn fixture-btn-primary" onClick={() => setShowWizard(true)}>
                        <Zap size={16} />
                        <span>Generar fixture</span>
                    </button>
                    <button className="fixture-btn fixture-btn-accent" onClick={() => openEditor()}>
                        <Plus size={16} />
                        <span>Nuevo partido</span>
                    </button>
                    <button
                        className="fixture-btn fixture-btn-secondary mobile-only-flex"
                        onClick={() => setMobileSidebarOpen(!mobileSidebarOpen)}
                    >
                        <List size={16} />
                        <span>Estado</span>
                    </button>
                </div>
            </header>

            <div className="fixture-control-bar fixture-glass">
                <div className="fixture-filter-card">
                    <span className="fixture-filter-label">Fase</span>
                    <select
                        className="fixture-select"
                        value={selectedPhaseId || selectedPhase?.id || ''}
                        onChange={(event) => {
                            setRoundFilter('all');
                            selectPhase(event.target.value);
                        }}
                    >
                        {fixture?.phases.map((phase) => (
                            <option key={phase.id} value={phase.id}>
                                {phase.name}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="fixture-search-card">
                    <span className="fixture-filter-label">Buscar</span>
                    <label className="fixture-search-input">
                        <Search size={16} />
                        <input
                            type="text"
                            placeholder="Equipo, sede o arbitro"
                            value={searchQuery}
                            onChange={(event) => setSearchQuery(event.target.value)}
                        />
                    </label>
                </div>

                <button
                    type="button"
                    className={`fixture-mobile-filters-toggle ${showMobileAdvancedControls ? 'is-open' : ''}`}
                    onClick={() => setShowMobileAdvancedControls((current) => !current)}
                    aria-expanded={showMobileAdvancedControls}
                >
                    <span>
                        MÃ¡s filtros
                        <small>
                            {activeFilterCount > 0 ? `${activeFilterCount} activos` : 'Vista compacta'}
                        </small>
                    </span>
                    <ChevronDown size={16} />
                </button>

                <div className={`fixture-advanced-controls ${showMobileAdvancedControls ? 'is-open' : ''}`}>
                    <div className="fixture-filter-card">
                        <span className="fixture-filter-label">Jornada</span>
                        <select
                            className="fixture-select"
                            value={roundFilter}
                            onChange={(event) => setRoundFilter(event.target.value)}
                        >
                            <option value="all">Todas</option>
                            {selectedPhase?.rounds.map((round) => (
                                <option key={round.id} value={round.id}>
                                    {round.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="fixture-filter-card">
                        <span className="fixture-filter-label">Estado</span>
                        <select
                            className="fixture-select"
                            value={filterStatus}
                            onChange={(event) => setFilterStatus(event.target.value as MatchStatus | 'all')}
                        >
                            <option value="all">Todos</option>
                            <option value="scheduled">Programado</option>
                            <option value="live">En vivo</option>
                            <option value="final">Finalizado</option>
                            <option value="postponed">Reprogramado</option>
                            <option value="suspended">Suspendido</option>
                            <option value="cancelled">Cancelado</option>
                        </select>
                    </div>

                    <div className="fixture-view-switcher">
                        {VIEW_OPTIONS.map((option) => {
                            const Icon = option.icon;
                            return (
                                <button
                                    key={option.id}
                                    className={`fixture-view-btn ${viewMode === option.id ? 'active' : ''}`}
                                    onClick={() => setViewMode(option.id)}
                                >
                                    <Icon size={15} />
                                    <span>{option.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>


            <div className="fixture-main-grid">
                <div className="fixture-viewport-stack">
                    {showWizard && (
                        <FixtureWizard
                            onClose={() => setShowWizard(false)}
                            onComplete={() => {
                                setShowWizard(false);
                                refreshFixture();
                            }}
                        />
                    )}

                    {showDiagnostics && (
                        <DiagnosticsPanel
                            data={diagnostics}
                            onClose={() => setShowDiagnostics(false)}
                            onRefresh={handleValidate}
                        />
                    )}

                    <section className="fixture-viewport fixture-glass">
                        <div className="fixture-viewport-header">
                            <div>
                                <span className="fixture-kicker">Viewport</span>
                                <h2>{currentViewLabel}</h2>
                                <p>
                                    {hasFixtureStructure
                                        ? `${visibleMatches.length} partidos visibles en ${visibleRounds.length} bloques operativos.`
                                        : 'Genera estructura para comenzar la programacion del torneo.'}
                                </p>
                            </div>

                            <div className="fixture-viewport-meta">
                                <span className="fixture-pill fixture-pill-info">
                                    {selectedPhase ? selectedPhase.name : 'Sin fase'}
                                </span>
                                <span className="fixture-pill fixture-pill-draft">
                                    {roundFilter === 'all' ? 'Todas las jornadas' : 'Jornada filtrada'}
                                </span>
                            </div>
                        </div>

                        {editorOpen ? (
                            <FixtureMatchEditor
                                onClose={closeEditor}
                                initialPhaseId={initialPhaseId}
                                tournamentId={tournamentId}
                            />
                        ) : !hasFixtureStructure && !loading ? (
                            <EmptyFixtureState
                                onGenerate={() => setShowWizard(true)}
                                onCreateMatch={() => openEditor()}
                            />
                        ) : (
                            <>
                                {viewMode === 'rounds' && (
                                    <RoundsGridView
                                        rounds={visibleRounds}
                                        onResetRound={resetRound}
                                        onEditMatch={openEditor}
                                        onDeleteMatch={handleDeleteMatch}
                                        onManageMatch={setManagingMatchId}
                                    />
                                )}
                                {viewMode === 'calendar' && (
                                    <CalendarTimelineView matches={visibleMatches} onEditMatch={openEditor} />
                                )}
                                {viewMode === 'list' && (
                                    <TechnicalTableView matches={visibleMatches} onEditMatch={openEditor} onDeleteMatch={handleDeleteMatch} onManageMatch={setManagingMatchId} />
                                )}
                                {viewMode === 'groups' && (
                                    <GroupsDeckView phase={selectedPhase} matches={visibleMatches} onEditMatch={openEditor} />
                                )}
                            </>
                        )}
                    </section>
                </div>

                <div className={`fixture-sidebar-mobile-wrapper ${mobileSidebarOpen ? 'mobile-open' : ''}`}>
                    {mobileSidebarOpen && (
                        <div className="fixture-mobile-backdrop" onClick={() => setMobileSidebarOpen(false)} />
                    )}
                    <FixtureOperationalSidebar
                        fixtureName={fixture?.tournamentName || tournamentData.name || 'Fixture'}
                        progressPercent={progressPercent}
                        metrics={globalMetrics}
                        selectedPhase={selectedPhase}
                        rounds={selectedPhase?.rounds || []}
                        roundFilter={roundFilter}
                        onRoundFilterChange={setRoundFilter}
                        validationItems={validationItems}
                        diagnosticsReady={Boolean(diagnostics)}
                        onValidate={handleValidate}
                        onRefresh={() => refreshFixture()}
                        onExport={handleExportFixture}
                        isMobile={mobileSidebarOpen}
                        onCloseMobile={() => setMobileSidebarOpen(false)}
                    />
                </div>
            </div>
        </div>
    );
}

function MetricCard({
    label,
    value,
    tone,
}: {
    label: string;
    value: number;
    tone: 'neutral' | 'info' | 'success';
}) {
    return (
        <div className={`fixture-metric-card fixture-metric-${tone}`}>
            <span className="fixture-metric-value">{value}</span>
            <span className="fixture-metric-label">{label}</span>
        </div>
    );
}

function useCompactMobileBreakpoint(query = '(max-width: 767px)') {
    const [isCompactMobile, setIsCompactMobile] = useState(false);

    useEffect(() => {
        const media = window.matchMedia(query);
        const sync = () => setIsCompactMobile(media.matches);
        sync();
        media.addEventListener('change', sync);
        return () => media.removeEventListener('change', sync);
    }, [query]);

    return isCompactMobile;
}

function FixtureOverflowMenu({
    isOpen,
    onClose,
    onEdit,
    onDelete,
    editHref,
}: {
    isOpen: boolean;
    onClose: () => void;
    onEdit: () => void;
    onDelete: () => void;
    editHref?: string;
}) {
    const { shouldRender, isVisible } = useAnimatedDisclosure(isOpen, 180);

    if (!shouldRender) return null;

    return (
        <>
            <div className={`fixture-floating-backdrop ${isVisible ? 'is-open' : ''}`} onClick={onClose} />
            <div
                className={`fixture-action-menu ${isVisible ? 'is-open' : ''}`}
                onClick={(event) => event.stopPropagation()}
                role="menu"
                aria-label="Acciones del partido"
            >
                <div className="fixture-action-menu-head">
                    <span className="fixture-action-menu-kicker">Acciones</span>
                    <strong>Gestion rapida</strong>
                </div>
                {editHref ? (
                    <ProtectedLink href={editHref} className="fixture-action-item" onClick={onClose}>
                        <Edit2 size={14} />
                        <span>Editar partido</span>
                    </ProtectedLink>
                ) : (
                    <button type="button" className="fixture-action-item" onClick={() => { onEdit(); onClose(); }}>
                        <Edit2 size={14} />
                        <span>Editar partido</span>
                    </button>
                )}
                <div className="fixture-action-divider" />
                <button type="button" className="fixture-action-item danger" onClick={() => { onDelete(); onClose(); }}>
                    <Trash2 size={14} />
                    <span>Eliminar partido</span>
                </button>
            </div>
        </>
    );
}

function RoundsGridView({
    rounds,
    onResetRound,
    onEditMatch,
    onDeleteMatch,
    onManageMatch,
}: {
    rounds: RoundWithMatches[];
    onResetRound: (roundId: string) => Promise<boolean>;
    onEditMatch: (match?: MatchWithClubs) => void;
    onDeleteMatch: (matchId: string) => void;
    onManageMatch: (matchId: string) => void;
}) {
    const isCompactMobile = useCompactMobileBreakpoint();
    const [collapsedRoundIds, setCollapsedRoundIds] = useState<Set<string>>(() => new Set(rounds.map((round) => round.id)));

    const toggleRound = (roundId: string) => {
        if (!isCompactMobile) return;
        setCollapsedRoundIds((current) => {
            const next = new Set(current);
            if (next.has(roundId)) next.delete(roundId);
            else next.add(roundId);
            return next;
        });
    };

    if (rounds.length === 0) {
        return (
            <div className="fixture-view-empty">
                <CircleDashed size={30} />
                <div>
                    <h3>No hay partidos para los filtros aplicados</h3>
                    <p>Ajusta el estado, la busqueda o selecciona otra jornada para volver a poblar el viewport.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="fixture-rounds-container">
            {rounds.map((round, index) => {
                const isExpanded = !isCompactMobile || !collapsedRoundIds.has(round.id);

                return (
                <section key={round.id} className={`fixture-round-section ${isExpanded ? 'is-expanded' : 'is-collapsed'}`}>
                    <button type="button" className="fixture-round-summary" onClick={() => toggleRound(round.id)} aria-expanded={isExpanded}>
                        <header className="fixture-round-header">
                        <div className="fixture-round-title">
                            <span className="fixture-round-index">
                                {String(index + 1).padStart(2, '0')} / {round.orderIndex}
                            </span>
                            <div>
                                <h3>{round.name}</h3>
                                <p>{formatRoundRange(round)}</p>
                            </div>
                        </div>

                        <div className="fixture-round-meta">
                            <span className="fixture-round-count">{round.matches.length} partidos</span>
                            <span className={`fixture-pill ${getRoundTone(round)}`}>{getRoundStateLabel(round)}</span>
                            <button
                                className="fixture-icon-btn"
                                title="Resetear jornada"
                                onClick={async (event) => {
                                    event.stopPropagation();
                                    if (window.confirm('Borrar todos los partidos de esta jornada?')) {
                                        await onResetRound(round.id);
                                    }
                                }}
                            >
                                <RefreshCw size={15} />
                            </button>
                            <span className={`fixture-round-chevron ${isExpanded ? 'is-expanded' : ''}`}>
                                <ChevronDown size={16} />
                            </span>
                        </div>
                        </header>
                    </button>

                    <div className={`fixture-round-details ${isExpanded ? 'is-expanded' : ''}`}>
                        <div className="fixture-matches-grid">
                        {round.matches.length > 0 ? (
                            round.matches.map((match) => (
                                <MatchCard key={match.id} match={match} roundName={round.name} onEdit={onEditMatch} onDelete={onDeleteMatch} onManage={onManageMatch} />
                            ))
                        ) : (
                            <div className="fixture-round-empty-card">
                                <AlertCircle size={28} />
                                <h4>Sin partidos asignados</h4>
                                <p>Esta jornada existe pero todavia no tiene cruces cargados.</p>
                            </div>
                        )}
                        </div>
                    </div>
                </section>
            )})}
        </div>
    );
}

function MatchCard({
    match,
    roundName,
    onEdit,
    onDelete,
    onManage,
}: {
    match: MatchWithClubs;
    roundName: string;
    onEdit: (match?: MatchWithClubs) => void;
    onDelete: (matchId: string) => void;
    onManage: (matchId: string) => void;
}) {
    const scoreVisible = match.status === 'live' || match.status === 'final';
    const [showMenu, setShowMenu] = useState(false);
    const hasExtraMeta = Boolean(match.pitch || match.referee);
    const adminMatchHref = buildAdminMatchHref(match.id);

    return (
        <article className={`fixture-match-card fixture-glass ${getStatusTone(match.status)}`}>
            <div className="fixture-match-top">
                <div>
                    <span className="fixture-match-headline">{getMatchHeadline(match)}</span>
                    <span className="fixture-match-subline">{roundName}</span>
                </div>
                <span className={`fixture-pill ${getStatusTone(match.status)}`}>{STATUS_LABELS[match.status]}</span>
            </div>

            <div className="fixture-match-teams">
                <TeamBlock side="Local" team={match.homeClub} fallback="Local" />

                <div className="fixture-match-center">
                    <span className="fixture-match-center-label">{scoreVisible ? 'Score' : 'Versus'}</span>
                    <strong>{scoreVisible ? `${match.score?.home ?? 0}-${match.score?.away ?? 0}` : 'VS'}</strong>
                </div>

                <TeamBlock side="Visitante" team={match.awayClub} fallback="Visitante" />
            </div>

            <div className="fixture-match-footer">
                <div className="fixture-match-meta">
                    <span>
                        <Clock size={14} />
                        {formatLongDate(match.dateTime)} · {formatShortTime(match.dateTime)}
                    </span>
                    <span>
                        <MapPin size={14} />
                        {match.venue || 'Sede por definir'}
                    </span>
                    {hasExtraMeta && (
                        <details className="fixture-meta-disclosure">
                            <summary className="fixture-meta-disclosure-trigger">Mas detalle operativo</summary>
                            <div className="fixture-meta-disclosure-body">
                                {match.pitch && (
                                    <span>
                                        <Grid size={13} /> {match.pitch}
                                    </span>
                                )}
                                {match.referee && (
                                    <span>
                                        <ShieldCheck size={13} /> {match.referee}
                                    </span>
                                )}
                            </div>
                        </details>
                    )}
                </div>

                <div className="fixture-match-actions">
                    <button className="fixture-mini-btn" onClick={() => onManage(match.id)}>
                        <Settings size={14} />
                        <span>Gestionar</span>
                    </button>
                    <button className="fixture-icon-btn" title="Ver detalles" onClick={() => window.open(`/matches/${match.id}`, '_blank')}>
                        <Eye size={14} />
                    </button>

                    <div className="fixture-action-anchor">
                        <button className="fixture-icon-btn" title="Mas opciones" onClick={() => setShowMenu((prev) => !prev)}>
                            <MoreVertical size={14} />
                        </button>
                        <FixtureOverflowMenu
                            isOpen={showMenu}
                            onClose={() => setShowMenu(false)}
                            onEdit={() => onEdit(match)}
                            onDelete={() => onDelete(match.id)}
                            editHref={adminMatchHref}
                        />
                    </div>
                </div>
            </div>
        </article>
    );
}

function TeamBlock({
    side,
    team,
    fallback,
}: {
    side: string;
    team: MatchWithClubs['homeClub'];
    fallback: string;
}) {
    return (
        <div className="fixture-team-block">
            <span className="fixture-team-side">{side}</span>
            <div className="fixture-team-logo">
                {team?.logo ? (
                    <img src={team.logo} alt={team.name} className="fixture-team-logo-image" />
                ) : (
                    <ShieldCheck size={24} />
                )}
            </div>
            <span className="fixture-team-name">{team?.shortName || team?.name || fallback}</span>
        </div>
    );
}

function CalendarTimelineView({
    matches,
    onEditMatch,
}: {
    matches: Array<MatchWithClubs & { roundName: string }>;
    onEditMatch: (match?: MatchWithClubs) => void;
}) {
    const orderedMatches = [...matches].sort(
        (left, right) => new Date(left.dateTime).getTime() - new Date(right.dateTime).getTime()
    );

    const dayGroups = orderedMatches.reduce<Record<string, Array<MatchWithClubs & { roundName: string }>>>((acc, match) => {
        const key = formatLongDate(match.dateTime);
        acc[key] = acc[key] || [];
        acc[key].push(match);
        return acc;
    }, {});

    const orderedDays = Object.keys(dayGroups);

    if (matches.length === 0) {
        return (
            <div className="fixture-view-empty">
                <Calendar size={30} />
                <div>
                    <h3>No hay partidos para renderizar en calendario</h3>
                    <p>La linea de tiempo se activara cuando existan cruces visibles en la fase seleccionada.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="fixture-calendar-shell">
            {orderedDays.map((day) => (
                <section key={day} className="fixture-calendar-group">
                    <header>
                        <span className="fixture-kicker">Day block</span>
                        <h3>{day}</h3>
                    </header>
                    <div className="fixture-calendar-list">
                        {dayGroups[day].map((match) => (
                            <button
                                key={match.id}
                                className={`fixture-calendar-item ${getStatusTone(match.status)}`}
                                onClick={() => onEditMatch(match)}
                            >
                                <div className="fixture-calendar-time">{formatShortTime(match.dateTime)}</div>
                                <div className="fixture-calendar-body">
                                    <strong>
                                        {match.homeClub?.shortName || match.homeClub?.name || 'Local'} vs{' '}
                                        {match.awayClub?.shortName || match.awayClub?.name || 'Visitante'}
                                    </strong>
                                    <span>{match.roundName}</span>
                                </div>
                                <div className="fixture-calendar-status">
                                    <span className={`fixture-pill ${getStatusTone(match.status)}`}>
                                        {STATUS_LABELS[match.status]}
                                    </span>
                                </div>
                            </button>
                        ))}
                    </div>
                </section>
            ))}
        </div>
    );
}

function TechnicalTableView({
    matches,
    onEditMatch,
    onDeleteMatch,
    onManageMatch,
}: {
    matches: Array<MatchWithClubs & { roundName: string }>;
    onEditMatch: (match?: MatchWithClubs) => void;
    onDeleteMatch: (matchId: string) => void;
    onManageMatch: (matchId: string) => void;
}) {
    const isCompactMobile = useCompactMobileBreakpoint();
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);

    // Close menu when clicked outside
    useEffect(() => {
        const handleClick = () => setOpenMenuId(null);
        if (openMenuId) {
            window.addEventListener('click', handleClick);
        }
        return () => window.removeEventListener('click', handleClick);
    }, [openMenuId]);

    if (matches.length === 0) {
        return (
            <div className="fixture-view-empty">
                <List size={30} />
                <div>
                    <h3>La lista tecnica esta vacia</h3>
                    <p>No hay partidos disponibles para la combinacion actual de filtros.</p>
                </div>
            </div>
        );
    }

    const orderedMatches = [...matches].sort(
        (left, right) => new Date(left.dateTime).getTime() - new Date(right.dateTime).getTime()
    );

    if (isCompactMobile) {
        return (
            <div className="fixture-list-cards">
                {orderedMatches.map((match) => {
                    const hasExtraMeta = Boolean(match.pitch || match.referee);

                    return (
                        <article key={match.id} className={`fixture-list-card fixture-glass ${getStatusTone(match.status)}`}>
                            <div className="fixture-list-card-top">
                                <div>
                                    <span className="fixture-kicker">{match.roundName}</span>
                                    <h3>
                                        {match.homeClub?.shortName || match.homeClub?.name || 'Local'} vs{' '}
                                        {match.awayClub?.shortName || match.awayClub?.name || 'Visitante'}
                                    </h3>
                                </div>
                                <span className={`fixture-pill ${getStatusTone(match.status)}`}>{STATUS_LABELS[match.status]}</span>
                            </div>

                            <div className="fixture-list-card-grid">
                                <div className="fixture-list-card-stat">
                                    <span>Dia</span>
                                    <strong>{formatShortDate(match.dateTime)}</strong>
                                </div>
                                <div className="fixture-list-card-stat">
                                    <span>Hora</span>
                                    <strong>{formatShortTime(match.dateTime)}</strong>
                                </div>
                                <div className="fixture-list-card-stat">
                                    <span>Sede</span>
                                    <strong>{match.venue || 'Por definir'}</strong>
                                </div>
                                <div className="fixture-list-card-stat">
                                    <span>Vista</span>
                                    <strong>Compacta</strong>
                                </div>
                            </div>

                            {hasExtraMeta && (
                                <details className="fixture-meta-disclosure">
                                    <summary className="fixture-meta-disclosure-trigger">Abrir detalle tecnico</summary>
                                    <div className="fixture-meta-disclosure-body">
                                        {match.pitch && (
                                            <span>
                                                <Grid size={13} /> {match.pitch}
                                            </span>
                                        )}
                                        {match.referee && (
                                            <span>
                                                <ShieldCheck size={13} /> {match.referee}
                                            </span>
                                        )}
                                    </div>
                                </details>
                            )}

                            <div className="fixture-list-card-actions">
                                <button className="fixture-mini-btn" onClick={() => onManageMatch(match.id)}>
                                    <Settings size={14} />
                                    <span>Gestionar</span>
                                </button>
                                <button className="fixture-icon-btn" title="Ver detalles" onClick={() => window.open(`/matches/${match.id}`, '_blank')}>
                                    <Eye size={14} />
                                </button>
                                <div className="fixture-action-anchor">
                                    <button
                                        className="fixture-icon-btn"
                                        title="Mas opciones"
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            setOpenMenuId(openMenuId === match.id ? null : match.id);
                                        }}
                                    >
                                        <MoreVertical size={14} />
                                    </button>
                                    <FixtureOverflowMenu
                                        isOpen={openMenuId === match.id}
                                        onClose={() => setOpenMenuId(null)}
                                        onEdit={() => onEditMatch(match)}
                                        onDelete={() => onDeleteMatch(match.id)}
                                        editHref={buildAdminMatchHref(match.id)}
                                    />
                                </div>
                            </div>
                        </article>
                    );
                })}
            </div>
        );
    }

    return (
        <div className="fixture-table-shell">
            <table className="fixture-technical-table">
                <thead>
                    <tr>
                        <th>Fecha</th>
                        <th>Dia / hora</th>
                        <th>Local</th>
                        <th>Visitante</th>
                        <th>Sede</th>
                        <th>Estado</th>
                        <th>Acciones</th>
                    </tr>
                </thead>
                <tbody>
                    {orderedMatches.map((match) => (
                        <tr key={match.id} className="fixture-table-row">
                            <td>{match.roundName}</td>
                            <td>
                                {formatLongDate(match.dateTime)}
                                <span className="fixture-table-minor">{formatShortTime(match.dateTime)}</span>
                            </td>
                            <td>{match.homeClub?.name || 'Local'}</td>
                            <td>{match.awayClub?.name || 'Visitante'}</td>
                            <td>{match.venue || 'Por definir'}</td>
                            <td>
                                <span className={`fixture-pill ${getStatusTone(match.status)}`}>
                                    {STATUS_LABELS[match.status]}
                                </span>
                            </td>
                            <td>
                                <div className="fixture-table-actions">
                                    <button className="fixture-icon-btn" onClick={() => onManageMatch(match.id)} title="Gestionar partido">
                                        <Settings size={14} />
                                    </button>
                                    <button className="fixture-icon-btn" title="Ver detalles" onClick={() => window.open(`/matches/${match.id}`, '_blank')}>
                                        <Eye size={14} />
                                    </button>
                                    <div className="fixture-action-anchor">
                                        <button
                                            className="fixture-icon-btn"
                                            title="Más opciones"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setOpenMenuId(openMenuId === match.id ? null : match.id);
                                            }}
                                        >
                                            <MoreVertical size={14} />
                                        </button>

                                        <FixtureOverflowMenu
                                            isOpen={openMenuId === match.id}
                                            onClose={() => setOpenMenuId(null)}
                                            onEdit={() => onEditMatch(match)}
                                            onDelete={() => onDeleteMatch(match.id)}
                                            editHref={buildAdminMatchHref(match.id)}
                                        />
                                    </div>
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function GroupsDeckView({
    phase,
    matches,
    onEditMatch,
}: {
    phase: PhaseWithRounds | null;
    matches: Array<MatchWithClubs & { roundName: string }>;
    onEditMatch: (match?: MatchWithClubs) => void;
}) {
    if (!phase || phase.phaseType !== 'group_stage') {
        return (
            <div className="fixture-view-empty">
                <Trophy size={30} />
                <div>
                    <h3>La fase actual no usa grupos configurados</h3>
                    <p>Usa esta vista cuando la estructura competitiva este organizada por grupos.</p>
                </div>
            </div>
        );
    }

    const grouped = matches.reduce<Record<string, Array<MatchWithClubs & { roundName: string }>>>((acc, match) => {
        const key = match.groupId || 'sin-grupo';
        acc[key] = acc[key] || [];
        acc[key].push(match);
        return acc;
    }, {});

    const groupKeys = Object.keys(grouped);

    if (groupKeys.length === 0) {
        return (
            <div className="fixture-view-empty">
                <Trophy size={30} />
                <div>
                    <h3>No hay cruces cargados por grupo</h3>
                    <p>Los partidos apareceran aqui cuando la fase tenga calendario activo.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="fixture-groups-grid">
            {groupKeys.map((groupKey, index) => (
                <section key={groupKey} className="fixture-group-card">
                    <header className="fixture-group-header">
                        <div>
                            <span className="fixture-kicker">Group {index + 1}</span>
                            <h3>{groupKey === 'sin-grupo' ? 'Sin grupo asignado' : `Grupo ${groupKey.slice(0, 8)}`}</h3>
                        </div>
                        <span className="fixture-pill fixture-pill-info">{grouped[groupKey].length} partidos</span>
                    </header>
                    <div className="fixture-group-list">
                        {grouped[groupKey].map((match) => (
                            <button key={match.id} className="fixture-group-row" onClick={() => onEditMatch(match)}>
                                <strong>
                                    {match.homeClub?.shortName || match.homeClub?.name || 'Local'} vs{' '}
                                    {match.awayClub?.shortName || match.awayClub?.name || 'Visitante'}
                                </strong>
                                <span>{match.roundName}</span>
                                <span>{formatShortDate(match.dateTime)}</span>
                            </button>
                        ))}
                    </div>
                </section>
            ))}
        </div>
    );
}

function EmptyFixtureState({
    onGenerate,
    onCreateMatch,
}: {
    onGenerate: () => void;
    onCreateMatch: () => void;
}) {
    return (
        <div className="fixture-empty-hero">
            <div className="fixture-empty-orb">
                <Zap size={34} />
            </div>
            <span className="fixture-kicker">Fixture bootstrap</span>
            <h3>No hay fixture generado</h3>
            <p>
                Para comenzar, utiliza el generador automatico o anade partidos manualmente a las fases configuradas.
            </p>
            <div className="fixture-empty-actions">
                <button className="fixture-btn fixture-btn-primary" onClick={onGenerate}>
                    <Zap size={16} />
                    <span>Generar Fixture Automatico</span>
                </button>
                <button className="fixture-btn fixture-btn-secondary" onClick={onCreateMatch}>
                    <Plus size={16} />
                    <span>Crear Partido Manualmente</span>
                </button>
            </div>
        </div>
    );
}

function FixtureOperationalSidebar({
    fixtureName,
    progressPercent,
    metrics,
    selectedPhase,
    rounds,
    roundFilter,
    onRoundFilterChange,
    validationItems,
    diagnosticsReady,
    onValidate,
    onRefresh,
    onExport,
    isMobile,
    onCloseMobile,
}: {
    fixtureName: string;
    progressPercent: number;
    metrics: {
        totalMatches: number;
        totalRounds: number;
        pendingMatches: number;
        readyMatches: number;
        roundsWithoutMatches: number;
    };
    selectedPhase: PhaseWithRounds | null;
    rounds: RoundWithMatches[];
    roundFilter: string;
    onRoundFilterChange: (value: string) => void;
    validationItems: Array<{
        id: string;
        severity: 'critical' | 'warning' | 'success';
        title: string;
        description: string;
    }>;
    diagnosticsReady: boolean;
    onValidate: () => void;
    onRefresh: () => void;
    onExport: () => void;
    isMobile?: boolean;
    onCloseMobile?: () => void;
}) {
    return (
        <aside className={`fixture-sidebar ${isMobile ? 'mobile-open' : ''}`}>
            {isMobile && (
                <div className="mobile-sidebar-header">
                    <h3>Estado del Fixture</h3>
                    <button className="fixture-icon-btn" onClick={onCloseMobile}>
                        <X size={18} />
                    </button>
                </div>
            )}
            <section className="fixture-sidebar-block fixture-glass">
                <header className="fixture-sidebar-header">
                    <span className="fixture-kicker">State summary</span>
                    <h3>{fixtureName}</h3>
                </header>

                <div className="fixture-progress-panel">
                    <div className="fixture-progress-head">
                        <span>Progreso del fixture</span>
                        <strong>{progressPercent}%</strong>
                    </div>
                    <div className="fixture-progress-bar">
                        <div className="fixture-progress-fill" style={{ width: `${progressPercent}%` }} />
                    </div>
                    <div className="fixture-progress-grid">
                        <div>
                            <span>Listos</span>
                            <strong>{metrics.readyMatches}</strong>
                        </div>
                        <div>
                            <span>Pendientes</span>
                            <strong>{metrics.pendingMatches}</strong>
                        </div>
                        <div>
                            <span>Jornadas</span>
                            <strong>{metrics.totalRounds}</strong>
                        </div>
                        <div>
                            <span>Vacias</span>
                            <strong>{metrics.roundsWithoutMatches}</strong>
                        </div>
                    </div>
                </div>

                <div className="fixture-sidebar-rounds">
                    <div className="fixture-sidebar-subhead">
                        <span>Fase activa</span>
                        <strong>{selectedPhase?.name || 'Sin fase'}</strong>
                    </div>
                    <div className="fixture-round-chip-list">
                        <button
                            className={`fixture-round-chip ${roundFilter === 'all' ? 'active' : ''}`}
                            onClick={() => onRoundFilterChange('all')}
                        >
                            Todas
                        </button>
                        {rounds.slice(0, 8).map((round) => (
                            <button
                                key={round.id}
                                className={`fixture-round-chip ${roundFilter === round.id ? 'active' : ''}`}
                                onClick={() => onRoundFilterChange(round.id)}
                            >
                                {round.name}
                            </button>
                        ))}
                    </div>
                </div>
            </section>

            <section className="fixture-sidebar-block fixture-glass">
                <header className="fixture-sidebar-header">
                    <span className="fixture-kicker">Validaciones</span>
                    <h3>{diagnosticsReady ? 'Revision activa' : 'Chequeo estructural'}</h3>
                </header>

                <div className="fixture-validation-list">
                    {validationItems.map((item) => (
                        <div key={item.id} className={`fixture-validation-item severity-${item.severity}`}>
                            <div className="fixture-validation-icon">
                                {item.severity === 'critical' ? (
                                    <XCircle size={16} />
                                ) : item.severity === 'warning' ? (
                                    <AlertTriangle size={16} />
                                ) : (
                                    <CheckCircle2 size={16} />
                                )}
                            </div>
                            <div className="fixture-validation-copy">
                                <strong>{item.title}</strong>
                                <p>{item.description}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            <section className="fixture-sidebar-block fixture-glass">
                <header className="fixture-sidebar-header">
                    <span className="fixture-kicker">Acciones</span>
                    <h3>Soporte operativo</h3>
                </header>

                <div className="fixture-sidebar-actions">
                    <button className="fixture-sidebar-action" onClick={onValidate}>
                        <ShieldAlert size={16} />
                        <span>Abrir validacion completa</span>
                        <ChevronRight size={16} />
                    </button>
                    <button className="fixture-sidebar-action" onClick={onExport}>
                        <Download size={16} />
                        <span>Exportar planilla JSON</span>
                        <ChevronRight size={16} />
                    </button>
                    <button className="fixture-sidebar-action" onClick={onRefresh}>
                        <RefreshCw size={16} />
                        <span>Refrescar fixture</span>
                        <ChevronRight size={16} />
                    </button>
                </div>
            </section>
        </aside>
    );
}

const DiagnosticsPanel = ({
    data,
    onClose,
    onRefresh,
}: {
    data: FixtureDiagnosticsResult;
    onClose: () => void;
    onRefresh: () => void;
}) => {
    if (!data) return null;

    return (
        <section className="fixture-panel-shell fixture-glass">
            <div className="fixture-panel-header">
                <div>
                    <span className="fixture-kicker">Diagnostics</span>
                    <h3>Diagnostico del fixture</h3>
                </div>
                <div className="fixture-panel-actions">
                    <button className="fixture-icon-btn" onClick={onRefresh} title="Revalidar">
                        <RefreshCw size={15} />
                    </button>
                    <button className="fixture-icon-btn" onClick={onClose} title="Cerrar">
                        <X size={15} />
                    </button>
                </div>
            </div>

            <div className={`fixture-diagnostics-banner ${data.isValid ? 'is-valid' : 'has-issues'}`}>
                {data.isValid ? <ShieldCheck size={18} /> : <AlertCircle size={18} />}
                <span>
                    {data.isValid
                        ? 'Estructura correcta: no se detectaron errores.'
                        : `Se detectaron ${data.diagnostics.length} observaciones para revisar.`}
                </span>
            </div>

            <div className="fixture-diagnostics-list">
                {data.diagnostics.length === 0 ? (
                    <div className="fixture-diagnostics-empty">
                        Todo parece estar en orden. El fixture no tiene conflictos estructurales obvios.
                    </div>
                ) : (
                    data.diagnostics.map((item: FixtureDiagnosticItem, index: number) => (
                        <div key={`${item.message}-${index}`} className={`fixture-diagnostics-row ${item.type === 'error' ? 'critical' : 'warning'}`}>
                            <div className="fixture-validation-icon">
                                {item.type === 'error' ? <XCircle size={16} /> : <AlertTriangle size={16} />}
                            </div>
                            <div className="fixture-validation-copy">
                                <strong>{item.message}</strong>
                                <p>{item.context || 'Sin contexto adicional.'}</p>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </section>
    );
};

const FixtureWizard = ({ onClose, onComplete }: { onClose: () => void; onComplete: () => void }) => {
    const { generateFixture, generateMatches, selectedPhaseId, fixture } = useFixture();
    const [step, setStep] = useState(0); // 0 for strategy selection
    const [strategy, setStrategy] = useState<'rounds' | 'berger' | 'import'>('rounds');
    const [isGenerating, setIsGenerating] = useState(false);

    // Rounds config
    const [config, setConfig] = useState({
        numRounds: 14,
        namePattern: 'Jornada {n}',
    });

    // Berger config
    const [bergerConfig, setBergerConfig] = useState({
        teamIds: [] as string[],
        startDate: new Date().toISOString().split('T')[0],
        matchTime: '16:00',
        venue: '',
        roundsCount: 1,
        homeAndAway: false,
    });

    const phase = useMemo(
        () => fixture?.phases.find((item) => item.id === selectedPhaseId),
        [fixture, selectedPhaseId]
    );

    const handleGenerate = async () => {
        if (!selectedPhaseId) return;
        setIsGenerating(true);

        let success = false;
        try {
            if (strategy === 'rounds') {
                success = await generateFixture(config);
            } else if (strategy === 'berger') {
                const result = await generateMatches({
                    phaseId: selectedPhaseId || '',
                    clubIds: bergerConfig.teamIds,
                    startDate: bergerConfig.startDate,
                    matchTime: bergerConfig.matchTime,
                    venue: bergerConfig.venue,
                    roundsCount: bergerConfig.roundsCount,
                    homeAndAway: bergerConfig.homeAndAway
                });
                success = !!result;
            }
        } catch (error) {
            console.error("Generation error:", error);
            success = false;
        }

        setIsGenerating(false);
        if (success) {
            onComplete();
        } else {
            alert("Hubo un error al procesar la solicitud. Revisa la consola para mas detalles.");
        }
    };

    return (
        <section className="fixture-panel-shell fixture-glass">
            {strategy === 'import' && step === 1 ? (
                <SmartFixtureImportWizard
                    phaseId={selectedPhaseId || ''}
                    onBack={() => setStep(0)}
                    onComplete={onComplete}
                />
            ) : null}

            {!(strategy === 'import' && step === 1) ? (
            <>
            <div className="fixture-wizard-progress">
                <div className="fixture-wizard-progress-fill" style={{ width: `${(step / 2) * 100}%` }} />
            </div>

            {step === 0 && (
                <div className="fixture-wizard-step">
                    <div className="fixture-panel-header">
                        <div>
                            <span className="fixture-kicker">Method selection</span>
                            <h3>Metodo de generacion</h3>
                            <p className="fixture-panel-copy">Elige como deseas poblar los partidos de esta fase.</p>
                        </div>
                    </div>

                    <div className="fixture-strategy-grid">
                        <button
                            className={`strategy-card ${strategy === 'rounds' ? 'active' : ''}`}
                            onClick={() => setStrategy('rounds')}
                        >
                            <Grid size={24} />
                            <strong>Estructura base</strong>
                            <span>Crea solo las jornadas vacias para programacion manual.</span>
                        </button>
                        <button
                            className={`strategy-card ${strategy === 'berger' ? 'active' : ''}`}
                            onClick={() => setStrategy('berger')}
                        >
                            <Zap size={24} />
                            <strong>Generacion (Berger)</strong>
                            <span>Algoritmo matematico para cruces Round Robin.</span>
                        </button>
                        <button
                            className={`strategy-card ${strategy === 'import' ? 'active' : ''}`}
                            onClick={() => setStrategy('import')}
                        >
                            <Download size={24} />
                            <strong>Importar archivo</strong>
                            <span>Carga fixture desde Excel, CSV o PDF externo.</span>
                        </button>
                    </div>

                    <div className="fixture-panel-footer">
                        <button className="btn-secondary" onClick={onClose}>
                            Cancelar
                        </button>
                        <button className="btn-primary" onClick={() => setStep(1)}>
                            <span>Continuar</span>
                            <ChevronRight size={16} />
                        </button>
                    </div>
                </div>
            )}

            {step === 1 && strategy === 'berger' && (
                <div className="fixture-wizard-step">
                    <div className="fixture-panel-header">
                        <div>
                            <span className="fixture-kicker">Selection</span>
                            <h3>Seleccion de equipos</h3>
                            <p className="fixture-panel-copy">Marca los clubes que participaran en esta generacion.</p>
                        </div>
                        <div className="fixture-panel-actions">
                            <button
                                className="fixture-link-btn"
                                onClick={() => setBergerConfig({
                                    ...bergerConfig,
                                    teamIds: fixture?.participants.map(p => p.clubId).filter(Boolean) as string[] || []
                                })}
                            >
                                Seleccionar todos
                            </button>
                        </div>
                    </div>

                    <div className="fixture-team-explorer">
                        {fixture?.participants.map((p) => (
                            <label key={p.id} className="fixture-team-checkbox">
                                <input
                                    type="checkbox"
                                    checked={bergerConfig.teamIds.includes(p.clubId || '')}
                                    onChange={(e) => {
                                        if (e.target.checked) {
                                            setBergerConfig({ ...bergerConfig, teamIds: [...bergerConfig.teamIds, p.clubId || ''] });
                                        } else {
                                            setBergerConfig({ ...bergerConfig, teamIds: bergerConfig.teamIds.filter(id => id !== p.clubId) });
                                        }
                                    }}
                                />
                                <div className="team-item-info">
                                    <strong>{p.name}</strong>
                                    <span>{p.shortCode || 'No code'}</span>
                                </div>
                            </label>
                        ))}
                    </div>

                    <div className="fixture-panel-footer">
                        <button className="btn-secondary" onClick={() => setStep(0)}>
                            Volver
                        </button>
                        <button
                            className="btn-primary"
                            onClick={() => setStep(2)}
                            disabled={bergerConfig.teamIds.length < 2}
                        >
                            <span>Configuracion</span>
                            <ChevronRight size={16} />
                        </button>
                    </div>
                </div>
            )}

            {step === 2 && strategy === 'berger' && (
                <div className="fixture-wizard-step">
                    <div className="fixture-panel-header">
                        <div>
                            <span className="fixture-kicker">Configuration</span>
                            <h3>Parametros de los encuentros</h3>
                            <p className="fixture-panel-copy">Define las bases de tiempo y espacio para los partidos.</p>
                        </div>
                    </div>

                    <div className="fixture-wizard-grid">
                        <div className="editor-field">
                            <label>Fecha de inicio</label>
                            <input
                                type="date"
                                className="glass-input"
                                value={bergerConfig.startDate}
                                onChange={(e) => setBergerConfig({ ...bergerConfig, startDate: e.target.value })}
                            />
                        </div>
                        <div className="editor-field">
                            <label>Hora por defecto</label>
                            <input
                                type="time"
                                className="glass-input"
                                value={bergerConfig.matchTime}
                                onChange={(e) => setBergerConfig({ ...bergerConfig, matchTime: e.target.value })}
                            />
                        </div>
                        <div className="editor-field">
                            <label>Sede principal</label>
                            <input
                                type="text"
                                className="glass-input"
                                value={bergerConfig.venue}
                                onChange={(e) => setBergerConfig({ ...bergerConfig, venue: e.target.value })}
                                placeholder="Ej: Club House"
                            />
                        </div>
                        <div className="editor-field">
                            <label>Repeticiones (Ida/Vuelta)</label>
                            <div className="toggle-field">
                                <input
                                    type="checkbox"
                                    checked={bergerConfig.homeAndAway}
                                    onChange={(e) => setBergerConfig({ ...bergerConfig, homeAndAway: e.target.checked })}
                                />
                                <span>Incluir partidos de vuelta</span>
                            </div>
                        </div>
                    </div>

                    <div className="fixture-panel-footer">
                        <button className="btn-secondary" onClick={() => setStep(1)}>
                            Volver
                        </button>
                        <button className="btn-primary" onClick={() => setStep(3)}>
                            <span>Siguiente</span>
                            <ChevronRight size={16} />
                        </button>
                    </div>
                </div>
            )}

            {step === 3 && strategy === 'berger' && (
                <div className="fixture-wizard-step">
                    <div className="fixture-panel-header">
                        <div>
                            <span className="fixture-kicker">Review</span>
                            <h3>Confirmar generacion Berger</h3>
                            <p className="fixture-panel-copy">Revisa la proyeccion antes de escribir en la base.</p>
                        </div>
                    </div>

                    <div className="fixture-confirm-grid">
                        <div>
                            <span>Equipos seleccionados</span>
                            <strong>{bergerConfig.teamIds.length}</strong>
                        </div>
                        <div>
                            <span>Fecha de inicio</span>
                            <strong>{formatLongDate(bergerConfig.startDate)}</strong>
                        </div>
                        <div>
                            <span>Modalidad</span>
                            <strong>{bergerConfig.homeAndAway ? 'Ida y Vuelta' : 'Solo Ida'}</strong>
                        </div>
                        <div>
                            <span>Sede</span>
                            <strong>{bergerConfig.venue || 'Por definir'}</strong>
                        </div>
                    </div>

                    <div className="fixture-warning-callout">
                        <AlertTriangle size={18} />
                        <p>
                            Esta accion generara todos los cruces del round-robin. Si ya existen partidos en esta fase, podrian duplicarse o entrar en conflicto.
                        </p>
                    </div>

                    <div className="fixture-panel-footer">
                        <button className="btn-secondary" onClick={() => setStep(2)}>
                            Volver
                        </button>
                        <button className="btn-primary" onClick={handleGenerate} disabled={isGenerating}>
                            {isGenerating ? <RefreshCw className="spin" size={16} /> : <Zap size={16} />}
                            <span>{isGenerating ? 'Calculando cruces...' : 'Generar cruces ahora'}</span>
                        </button>
                    </div>
                </div>
            )}

            {step === 1 && strategy === 'import' && (
                <div className="fixture-wizard-step">
                    <div className="fixture-panel-header">
                        <div>
                            <span className="fixture-kicker">Upload</span>
                            <h3>Importar fixture inteligente</h3>
                            <p className="fixture-panel-copy">El archivo pasa por detección, normalización, validación y confirmación antes de crear partidos.</p>
                        </div>
                    </div>

                    <div className="fixture-warning-callout">
                        <AlertTriangle size={18} />
                        <p>
                            Este modo ya no inserta partidos directo al subir una planilla. Continuá al asistente para revisar cada fila.
                        </p>
                    </div>

                    <div className="fixture-panel-footer">
                        <button className="btn-secondary" onClick={() => setStep(0)}>
                            Volver
                        </button>
                        <button className="btn-primary" onClick={() => setStep(1)}>
                            <span>Abrir asistente</span>
                            <ChevronRight size={16} />
                        </button>
                    </div>
                </div>
            )}

            {step === 1 && strategy === 'rounds' && (
                <div className="fixture-wizard-step">
                    <div className="fixture-panel-header">
                        <div>
                            <span className="fixture-kicker">Generator</span>
                            <h3>Generador de estructura</h3>
                            <p className="fixture-panel-copy">Configura la base de jornadas para la fase seleccionada.</p>
                        </div>
                    </div>

                    <div className="fixture-wizard-grid">
                        <div className="editor-field">
                            <label>Numero de jornadas</label>
                            <input
                                type="number"
                                className="glass-input"
                                value={config.numRounds}
                                onChange={(event) => setConfig({ ...config, numRounds: Math.max(1, Number(event.target.value) || 1) })}
                                min="1"
                                max="50"
                            />
                        </div>

                        <div className="editor-field">
                            <label>Patron de nombres</label>
                            <input
                                type="text"
                                className="glass-input"
                                value={config.namePattern}
                                onChange={(event) => setConfig({ ...config, namePattern: event.target.value })}
                                placeholder="Ej: Jornada {n}"
                            />
                        </div>
                    </div>

                    <div className="fixture-panel-footer">
                        <button className="btn-secondary" onClick={() => setStep(0)}>
                            Volver
                        </button>
                        <button className="btn-primary" onClick={() => setStep(2)}>
                            <span>Siguiente</span>
                            <ChevronRight size={16} />
                        </button>
                    </div>
                </div>
            )}

            {step === 2 && strategy === 'rounds' && (
                <div className="fixture-wizard-step">
                    <div className="fixture-panel-header">
                        <div>
                            <span className="fixture-kicker">Confirm</span>
                            <h3>Confirmar jornadas</h3>
                            <p className="fixture-panel-copy">Revisa los parametros antes de crear las jornadas.</p>
                        </div>
                    </div>

                    <div className="fixture-confirm-grid">
                        <div>
                            <span>Fase objetivo</span>
                            <strong>{phase?.name || 'Fase no seleccionada'}</strong>
                        </div>
                        <div>
                            <span>Jornadas</span>
                            <strong>{config.numRounds}</strong>
                        </div>
                        <div>
                            <span>Primer nombre</span>
                            <strong>{config.namePattern.replace('{n}', '1')}</strong>
                        </div>
                    </div>

                    <div className="fixture-warning-callout">
                        <AlertTriangle size={18} />
                        <p>
                            Esta accion creara jornadas vacias. Luego podras añadir partidos manualmente.
                        </p>
                    </div>

                    <div className="fixture-panel-footer">
                        <button className="btn-secondary" onClick={() => setStep(1)}>
                            Volver
                        </button>
                        <button className="btn-primary" onClick={handleGenerate} disabled={isGenerating || !selectedPhaseId}>
                            {isGenerating ? <RefreshCw className="spin" size={16} /> : <FileCheck size={16} />}
                            <span>{isGenerating ? 'Generando...' : 'Generar jornadas'}</span>
                        </button>
                    </div>
                </div>
            )}
            </>
            ) : null}
        </section>
    );
};
