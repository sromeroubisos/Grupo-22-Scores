'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import {
    AlertCircle,
    BarChart3,
    Calendar,
    Check,
    ChevronDown,
    Link2,
    RefreshCw,
    Settings2,
    Trophy,
    X,
} from 'lucide-react';
import { Database } from '@/lib/database.types';
import { FixtureProvider, useFixture } from './FixtureContext';
import { CIRCUIT_GLOBAL_SENTINEL } from './standings/types';
import { isCircuitRuleset } from '@/lib/utils/tournamentFormat';
import './basalt.css';
import { useAnimatedDisclosure } from './useAnimatedDisclosure';

// Dynamic imports for sub-tabs to optimize bundle size and prevent background data fetching
const TournamentStandingsTab = dynamic(() => import('./standings/TournamentStandingsTab'), {
    loading: () => <TabLoading placeholder="Cargando posiciones..." />,
});

const TournamentStatsTab = dynamic(() => import('./TournamentStatsTab').then(mod => mod.TournamentStatsTab), {
    loading: () => <TabLoading placeholder="Cargando estadísticas..." />,
});

const FlashScoreSyncPanel = dynamic(() => import('./FlashScoreSyncPanel').then(mod => mod.FlashScoreSyncPanel), {
    loading: () => <TabLoading placeholder="Cargando sincronización..." />,
});

const TournamentOperationFixtureWorkspace = dynamic(() => import('./TournamentOperationFixtureWorkspace').then(mod => mod.TournamentOperationFixtureWorkspace), {
    loading: () => <TabLoading placeholder="Cargando fixture..." />,
});

// Reusable loading component for tabs
function TabLoading({ placeholder }: { placeholder: string }) {
    return (
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
            <RefreshCw className="animate-spin text-blue-500 opacity-20" size={32} />
            <p className="text-dim text-xs font-mono opacity-50">{placeholder}</p>
        </div>
    );
}

type TournamentRow = Database['public']['Tables']['tournaments']['Row'];

interface TournamentOperationTabProps {
    id: string;
    data: TournamentRow;
    initialSubtab?: string | null;
}

interface RawPhase {
    id: string;
    tournament_id: string;
    name: string;
    phase_type: string;
    order_index: number;
    is_active: boolean;
    settings?: Record<string, unknown>;
    created_at: string;
}

const OPERATION_SUB_TABS = [
    { id: 'fixture', label: 'Fixture', icon: Calendar, description: 'Cruces, fechas y partidos' },
    { id: 'tabla', label: 'Posiciones', icon: Trophy, description: 'Tabla, criterios y recalculo' },
    { id: 'estadisticas', label: 'Estadisticas', icon: BarChart3, description: 'Metricas e insights de rendimiento' },
    { id: 'sincronizacion', label: 'Sincronizacion', icon: Link2, description: 'Integraciones y sincronias externas' },
];

const OPERATION_SUB_TAB_IDS = new Set(OPERATION_SUB_TABS.map((tab) => tab.id));

function normalizeOperationSubTab(value: string | null | undefined) {
    return value && OPERATION_SUB_TAB_IDS.has(value) ? value : 'fixture';
}

export function TournamentOperationTab({ id, data, initialSubtab }: TournamentOperationTabProps) {
    const searchParams = useSearchParams();
    const currentSeasonId =
        searchParams.get('seasonId') ||
        searchParams.get('season_id') ||
        searchParams.get('season');
    const [phases, setPhases] = useState<RawPhase[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedPhaseId, setSelectedPhaseId] = useState<string | null>(null);

    const loadPhases = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            const query = new URLSearchParams();
            if (currentSeasonId) query.set('seasonId', currentSeasonId);
            const res = await fetch(`/api/tournaments/${id}/phases${query.size ? `?${query.toString()}` : ''}`, {
                cache: 'no-store',
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || `HTTP ${res.status}`);
            }

            const json = await res.json();
            const fetchedPhases: RawPhase[] = json.data || [];

            setPhases(fetchedPhases);
            setSelectedPhaseId((currentPhaseId) => {
                if (currentPhaseId && (
                    currentPhaseId === CIRCUIT_GLOBAL_SENTINEL ||
                    fetchedPhases.some((phase) => phase.id === currentPhaseId)
                )) {
                    return currentPhaseId;
                }
                const active = fetchedPhases.find((phase) => phase.is_active);
                return active?.id || fetchedPhases[0]?.id || null;
            });
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Error loading phases');
        } finally {
            setLoading(false);
        }
    }, [currentSeasonId, id]);

    useEffect(() => {
        loadPhases();
    }, [id, loadPhases]);

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
                <RefreshCw className="animate-spin text-blue-500" size={32} />
                <p className="text-dim text-sm font-mono">Cargando consola operativa...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="basalt-card flex flex-col items-center text-center p-12 gap-6">
                <div className="w-16 h-16 bg-red-500/10 border border-red-500/30 flex items-center justify-center rounded-xl">
                    <AlertCircle className="text-red-400" size={32} />
                </div>
                <div>
                    <h2 className="basalt-h1 mb-2">Error al cargar fases</h2>
                    <p className="text-dim max-w-md mx-auto text-sm">{error}</p>
                </div>
                <button className="basalt-btn basalt-btn-primary" onClick={loadPhases}>
                    <RefreshCw size={16} />
                    Reintentar
                </button>
            </div>
        );
    }

    if (phases.length === 0) {
        return <NoStructureMessage id={id} />;
    }

    return (
        <FixtureProvider tournamentId={id} initialFixture={null} seasonId={currentSeasonId}>
            <OperationContent
                id={id}
                data={data}
                phases={phases}
                selectedPhaseId={selectedPhaseId}
                onSelectPhase={setSelectedPhaseId}
                initialSubtab={initialSubtab}
            />
        </FixtureProvider>
    );
}

function GlobalOnlyPlaceholder({ label }: { label: string }) {
    return (
        <div className="basalt-card flex flex-col items-center text-center p-12 gap-4 opacity-60">
            <Trophy className="text-dim" size={28} />
            <p className="text-dim text-sm">
                <strong>{label}</strong> no está disponible en la vista de Tabla Global (Circuito).
                <br />
                Selecciona una fase específica para acceder a este módulo.
            </p>
        </div>
    );
}

function NoStructureMessage({ id }: { id: string }) {
    const router = useRouter();

    return (
        <div className="basalt-card basalt-hero flex flex-col items-center text-center p-12 gap-6">
            <div className="w-16 h-16 bg-surface-elevated border border-border-basalt flex items-center justify-center rounded-xl mb-2">
                <AlertCircle className="text-status-warning" size={32} />
            </div>
            <div>
                <h2 className="basalt-h1 mb-2">Sin estructura operativa</h2>
                <p className="text-dim max-w-md mx-auto">
                    Este torneo aun no tiene fases configuradas. Debes definir la estructura de fases antes de poder gestionar
                    el fixture o ver las posiciones.
                </p>
            </div>
            <button
                className="basalt-btn basalt-btn-primary"
                onClick={() => router.push(`/admin/entities/${id}/manage?type=tournament&tab=estructura`)}
            >
                <Settings2 size={16} />
                Configurar estructura
            </button>
        </div>
    );
}

interface OperationContentProps {
    id: string;
    data: TournamentRow;
    phases: RawPhase[];
    selectedPhaseId: string | null;
    onSelectPhase: (phaseId: string) => void;
    initialSubtab?: string | null;
}

function OperationContent({
    id,
    data,
    phases,
    selectedPhaseId,
    onSelectPhase,
    initialSubtab,
}: OperationContentProps) {
    const searchParams = useSearchParams();
    const { fixture, refreshFixture } = useFixture();
    const [mobilePhasePickerOpen, setMobilePhasePickerOpen] = useState(false);
    const [mobileSubtabPickerOpen, setMobileSubtabPickerOpen] = useState(false);
    const subtabSheet = useAnimatedDisclosure(mobileSubtabPickerOpen, 180);
    const phaseSheet = useAnimatedDisclosure(mobilePhasePickerOpen, 180);

    const currentSubTab = normalizeOperationSubTab(searchParams.get('subtab') || initialSubtab);
    const [optimisticSubTab, setOptimisticSubTab] = useState(currentSubTab);

    const buildSubTabUrl = useCallback((subTabId: string) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set('type', 'tournament');
        params.set('tab', 'operacion');
        params.set('subtab', subTabId);
        return `/admin/entities/${id}/manage?${params.toString()}`;
    }, [id, searchParams]);

    const replaceSubTabUrl = useCallback((subTabId: string) => {
        if (typeof window === 'undefined') return;
        const nextUrl = buildSubTabUrl(subTabId);
        const currentUrl = `${window.location.pathname}${window.location.search}`;

        if (currentUrl !== nextUrl) {
            window.history.replaceState(null, '', nextUrl);
        }
    }, [buildSubTabUrl]);

    useEffect(() => {
        setOptimisticSubTab(currentSubTab);
        replaceSubTabUrl(currentSubTab);
    }, [currentSubTab, replaceSubTabUrl]);

    useEffect(() => {
        if (!fixture) {
            refreshFixture();
        }
    }, [fixture, refreshFixture]);

    const isCircuit = useMemo(() => isCircuitRuleset(data.ruleset), [data.ruleset]);
    const isGlobalSelected = selectedPhaseId === CIRCUIT_GLOBAL_SENTINEL;

    const selectedPhase = useMemo(() => {
        return phases.find((phase) => phase.id === selectedPhaseId) || null;
    }, [phases, selectedPhaseId]);

    const activeSubTab = useMemo(
        () => OPERATION_SUB_TABS.find((tab) => tab.id === optimisticSubTab) || OPERATION_SUB_TABS[0],
        [optimisticSubTab],
    );

    const switchSubTab = useCallback((subTabId: string) => {
        if (subTabId === optimisticSubTab) return;
        setMobileSubtabPickerOpen(false);
        setOptimisticSubTab(subTabId);
        replaceSubTabUrl(subTabId);
    }, [optimisticSubTab, replaceSubTabUrl]);

    // When global circuit is selected, only the standings tab is meaningful
    useEffect(() => {
        if (isGlobalSelected && currentSubTab !== 'tabla') {
            switchSubTab('tabla');
        }
    }, [currentSubTab, isGlobalSelected, switchSubTab]);

    const selectPhaseAndClose = (phaseId: string) => {
        setMobilePhasePickerOpen(false);
        onSelectPhase(phaseId);
    };

    return (
        <div className="operation-console-shell flex flex-col gap-6 animate-in fade-in duration-500">
            <div className="basalt-card operation-context-card p-4 sm:p-6 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 border-l-4 border-l-accent-primary bg-gradient-to-r from-surface-basalt to-transparent">
                <div className="flex flex-col gap-2 min-w-0">
                    <span className="text-[10px] font-bold text-accent-primary uppercase tracking-widest">Contexto competitivo</span>
                    <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-lg sm:text-xl font-extrabold tracking-tight">OPERACION DE TORNEO</h2>
                        <span className="operation-context-id px-2 py-0.5 rounded bg-surface-elevated border border-border-basalt text-[10px] font-mono text-dim">
                            ID: {id.slice(0, 8)}
                        </span>
                    </div>
                    <p className="operation-context-copy text-sm text-dim">
                        Cambia de fase y submodulo sin perder el contexto operativo del torneo.
                    </p>
                </div>

                <div className="operation-context-desktop flex flex-col sm:flex-row items-stretch sm:items-end gap-3 w-full lg:w-auto">
                    <div className="flex flex-col gap-1 w-full sm:w-72">
                        <label className="text-[10px] font-semibold text-dim uppercase">Fase seleccionada</label>
                        <select
                            className="basalt-input"
                            value={selectedPhaseId || ''}
                            onChange={(event) => onSelectPhase(event.target.value)}
                        >
                            {isCircuit && (
                                <option value={CIRCUIT_GLOBAL_SENTINEL}>
                                    Tabla Global (Circuito)
                                </option>
                            )}
                            {phases.map((phase) => (
                                <option key={phase.id} value={phase.id}>
                                    {phase.name} ({phase.phase_type})
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="flex items-center gap-2 sm:self-end">
                        <div className="flex flex-col items-start sm:items-end">
                            <span className="text-[10px] font-semibold text-dim uppercase">Estado</span>
                            <span className={`basalt-badge ${isGlobalSelected ? 'badge-ok' : selectedPhase?.is_active ? 'badge-ok' : 'badge-warning'}`}>
                                {isGlobalSelected ? 'GLOBAL' : selectedPhase?.is_active ? 'ACTIVA' : 'PENDIENTE'}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="operation-mobile-pickers">
                <div className="operation-mobile-pickers-head">
                    <span className="basalt-tabs-mobile-label">Navegacion rapida</span>
                    <span className="operation-mobile-pickers-status">
                        {isGlobalSelected ? 'Tabla global' : selectedPhase?.is_active ? 'Fase activa' : 'Fase pendiente'}
                    </span>
                </div>

                <div className="operation-mobile-picker-grid">
                    <button
                        type="button"
                        className="operation-mobile-trigger"
                        onClick={() => setMobileSubtabPickerOpen(true)}
                        aria-haspopup="dialog"
                        aria-expanded={mobileSubtabPickerOpen}
                    >
                        <span className="operation-mobile-trigger-copy">
                            <span className="operation-mobile-trigger-label">Submodulo</span>
                            <span className="operation-mobile-trigger-value">{activeSubTab.label}</span>
                            <small>{activeSubTab.description}</small>
                        </span>
                        <ChevronDown size={16} className="operation-mobile-trigger-icon" />
                    </button>

                    <button
                        type="button"
                        className="operation-mobile-trigger"
                        onClick={() => setMobilePhasePickerOpen(true)}
                        aria-haspopup="dialog"
                        aria-expanded={mobilePhasePickerOpen}
                    >
                        <span className="operation-mobile-trigger-copy">
                            <span className="operation-mobile-trigger-label">Fase</span>
                            <span className="operation-mobile-trigger-value">
                                {isGlobalSelected ? 'Tabla Global' : selectedPhase?.name || 'Sin fase'}
                            </span>
                            <small>{isGlobalSelected ? 'circuito' : selectedPhase?.phase_type || 'manual'}</small>
                        </span>
                        <ChevronDown size={16} className="operation-mobile-trigger-icon" />
                    </button>
                </div>
            </div>

            <div className="operation-subtabs-bar">
                {OPERATION_SUB_TABS.map((tab) => {
                    const Icon = tab.icon;
                    const isActive = optimisticSubTab === tab.id;

                    return (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => switchSubTab(tab.id)}
                            className={`operation-subtab ${isActive ? 'active' : ''}`}
                            aria-current={currentSubTab === tab.id ? 'page' : undefined}
                        >
                            <Icon size={15} />
                            <span>{tab.label}</span>
                        </button>
                    );
                })}
            </div>

            <div className="min-h-[500px]">
                {optimisticSubTab === 'fixture' && (
                    isGlobalSelected ? (
                        <GlobalOnlyPlaceholder label="Fixture" />
                    ) : (
                        <TournamentOperationFixtureWorkspace
                            tournament={data}
                            selectedPhaseId={selectedPhaseId}
                            onSelectPhase={onSelectPhase}
                        />
                    )
                )}
                {optimisticSubTab === 'tabla' && (
                    <TournamentStandingsTab
                        tournamentId={id}
                        preferredPhaseId={selectedPhaseId}
                        onPhaseChange={onSelectPhase}
                    />
                )}
                {optimisticSubTab === 'estadisticas' && (
                    isGlobalSelected ? (
                        <GlobalOnlyPlaceholder label="Estadísticas" />
                    ) : (
                        <TournamentStatsTab id={id} data={data} phaseId={selectedPhaseId || undefined} />
                    )
                )}
                {optimisticSubTab === 'sincronizacion' && (
                    isGlobalSelected ? (
                        <GlobalOnlyPlaceholder label="Sincronización" />
                    ) : (
                        <FlashScoreSyncPanel
                            tournamentId={id}
                            data={data}
                            phaseId={selectedPhaseId}
                            phases={phases.map((phase) => ({ id: phase.id, name: phase.name }))}
                        />
                    )
                )}
            </div>

            {subtabSheet.shouldRender && (
                <>
                    <button
                        type="button"
                        className={`basalt-sheet-backdrop ${subtabSheet.isVisible ? 'is-open' : ''}`}
                        onClick={() => setMobileSubtabPickerOpen(false)}
                        aria-label="Cerrar selector de submodulo"
                    />
                    <div
                        className={`basalt-tabs-sheet operation-mobile-sheet ${subtabSheet.isVisible ? 'is-open' : ''}`}
                        role="dialog"
                        aria-modal="true"
                        aria-label="Seleccionar submodulo"
                    >
                        <div className="basalt-tabs-sheet-handle" />
                        <div className="basalt-tabs-sheet-header">
                            <div>
                                <span className="basalt-tabs-sheet-kicker">Operacion de torneo</span>
                                <strong className="basalt-tabs-sheet-title">Elegir submodulo</strong>
                            </div>
                            <button
                                type="button"
                                className="basalt-tabs-sheet-close"
                                onClick={() => setMobileSubtabPickerOpen(false)}
                                aria-label="Cerrar"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <div className="basalt-tabs-sheet-list">
                            {OPERATION_SUB_TABS.map((tab) => {
                                const Icon = tab.icon;
                                const isActive = optimisticSubTab === tab.id;

                                return (
                                    <button
                                        key={tab.id}
                                        type="button"
                                        className={`basalt-tabs-sheet-item ${isActive ? 'active' : ''}`}
                                        onClick={() => switchSubTab(tab.id)}
                                    >
                                        <span className="basalt-tabs-sheet-item-copy">
                                            <span className="basalt-tabs-sheet-item-glyph">
                                                <Icon size={16} />
                                            </span>
                                            <span className="basalt-tabs-sheet-item-text">
                                                <span>{tab.label}</span>
                                                <small>{tab.description}</small>
                                            </span>
                                        </span>
                                        {isActive ? <span className="basalt-tabs-sheet-badge">Actual</span> : null}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </>
            )}

            {phaseSheet.shouldRender && (
                <>
                    <button
                        type="button"
                        className={`basalt-sheet-backdrop ${phaseSheet.isVisible ? 'is-open' : ''}`}
                        onClick={() => setMobilePhasePickerOpen(false)}
                        aria-label="Cerrar selector de fase"
                    />
                    <div
                        className={`basalt-tabs-sheet operation-mobile-sheet ${phaseSheet.isVisible ? 'is-open' : ''}`}
                        role="dialog"
                        aria-modal="true"
                        aria-label="Seleccionar fase"
                    >
                        <div className="basalt-tabs-sheet-handle" />
                        <div className="basalt-tabs-sheet-header">
                            <div>
                                <span className="basalt-tabs-sheet-kicker">Operacion de torneo</span>
                                <strong className="basalt-tabs-sheet-title">Elegir fase</strong>
                            </div>
                            <button
                                type="button"
                                className="basalt-tabs-sheet-close"
                                onClick={() => setMobilePhasePickerOpen(false)}
                                aria-label="Cerrar"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <div className="basalt-tabs-sheet-list">
                            {isCircuit && (
                                <button
                                    type="button"
                                    className={`basalt-tabs-sheet-item ${isGlobalSelected ? 'active' : ''}`}
                                    onClick={() => selectPhaseAndClose(CIRCUIT_GLOBAL_SENTINEL)}
                                >
                                    <span className="basalt-tabs-sheet-item-copy">
                                        <span className="basalt-tabs-sheet-item-glyph">
                                            <Check size={16} className={isGlobalSelected ? '' : 'opacity-0'} />
                                        </span>
                                        <span className="basalt-tabs-sheet-item-text">
                                            <span>Tabla Global (Circuito)</span>
                                            <small>Posiciones acumuladas del circuito</small>
                                        </span>
                                    </span>
                                    {isGlobalSelected ? <span className="basalt-tabs-sheet-badge">Actual</span> : null}
                                </button>
                            )}
                            {phases.map((phase) => {
                                const isActive = selectedPhaseId === phase.id;

                                return (
                                    <button
                                        key={phase.id}
                                        type="button"
                                        className={`basalt-tabs-sheet-item ${isActive ? 'active' : ''}`}
                                        onClick={() => selectPhaseAndClose(phase.id)}
                                    >
                                        <span className="basalt-tabs-sheet-item-copy">
                                            <span className="basalt-tabs-sheet-item-glyph">
                                                <Check size={16} className={isActive ? '' : 'opacity-0'} />
                                            </span>
                                            <span className="basalt-tabs-sheet-item-text">
                                                <span>{phase.name}</span>
                                                <small>
                                                    {phase.phase_type} · {phase.is_active ? 'Activa' : 'Pendiente'}
                                                </small>
                                            </span>
                                        </span>
                                        {isActive ? <span className="basalt-tabs-sheet-badge">Actual</span> : null}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
