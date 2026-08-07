'use client';

import { useEffect, useMemo, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import {
    AlertCircle,
    BarChart3,
    Calendar,
    ChevronDown,
    RefreshCw,
    Settings2,
    Trophy,
} from 'lucide-react';
import { Database } from '@/lib/database.types';
import { FixtureProvider, useFixture } from './FixtureContext';
import type { PhaseWithRounds } from '@/lib/types/fixture';
import { CIRCUIT_GLOBAL_SENTINEL } from './standings/types';
import { isCircuitRuleset } from '@/lib/utils/tournamentFormat';
import { buildPhaseFigures, computePhaseStats } from './phaseFigures';
import { PanelSkeleton } from './PanelSkeleton';
import { useStandingsUrlState } from './standings/useStandingsUrlState';
import './basalt.css';
import './operation-console.css';

// Dynamic imports for sub-tabs to optimize bundle size and prevent background data fetching
const TournamentStandingsTab = dynamic(() => import('./standings/TournamentStandingsTab'), {
    loading: () => <PanelSkeleton rows={6} />,
});

const TournamentStatsTab = dynamic(() => import('./TournamentStatsTab').then(mod => mod.TournamentStatsTab), {
    loading: () => <PanelSkeleton rows={5} />,
});

const TournamentOperationFixtureWorkspace = dynamic(() => import('./TournamentOperationFixtureWorkspace').then(mod => mod.TournamentOperationFixtureWorkspace), {
    loading: () => <PanelSkeleton rows={6} />,
});

type TournamentRow = Database['public']['Tables']['tournaments']['Row'];

interface TournamentOperationTabProps {
    id: string;
    data: TournamentRow;
    initialSubtab?: string | null;
}

const OPERATION_SUB_TABS = [
    { id: 'fixture', label: 'Fixture', icon: Calendar },
    { id: 'tabla', label: 'Posiciones', icon: Trophy },
    { id: 'estadisticas', label: 'Estadísticas', icon: BarChart3 },
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
    return (
        <FixtureProvider tournamentId={id} initialFixture={null} seasonId={currentSeasonId}>
            <OperationGate id={id} data={data} initialSubtab={initialSubtab} />
        </FixtureProvider>
    );
}

// /fixture es la fuente ÚNICA de phases en Operación (elimina el GET /phases redundante;
// /phases sigue vivo para Estructura, Participantes, etc.). Vive dentro del provider para
// leer el fixture y gatear la UI sin flash del empty-state.
function OperationGate({ id, data, initialSubtab }: TournamentOperationTabProps) {
    const { fixture, fixtureError, refreshFixture } = useFixture();

    /**
     * La fase vive en la URL y en ningún otro lado. Antes había dos fuentes de
     * verdad —este estado y el `selectedPhase` de Posiciones— unidas por un
     * efecto de diez líneas que podía discrepar; ahora Posiciones lee la misma
     * URL que escribe esta barra.
     */
    const { phaseId: urlPhaseId, setPhase } = useStandingsUrlState();

    // Auto-fetch UNA sola vez por mount. NO dependemos del timing de isLoadingFixture/
    // fixtureError: FixtureContext.refreshFixture retorna sin setear fixtureError en el
    // branch isAbortLikeError (FixtureContext.tsx:260-262), así que un gate basado en esos
    // flags podría re-disparar en loop. El ref "ya intenté" es loop-proof; el reintento
    // manual vive en el botón del estado de error.
    const autoFetchedRef = useRef(false);
    useEffect(() => {
        if (fixture) return;
        if (!autoFetchedRef.current) {
            autoFetchedRef.current = true;
            refreshFixture();
        }

        // Soltar el pestillo si el efecto se limpia antes de que llegue la
        // respuesta. Sin esto la pestaña quedaba PERMANENTEMENTE en el
        // esqueleto durante el desarrollo: StrictMode monta, desmonta y vuelve
        // a montar; el desmontaje hace que FixtureProvider aborte la petición
        // en vuelo, el branch de abort de refreshFixture retorna sin setear
        // fixtureError —así que no hay estado de error del que reintentar— y
        // el pestillo ya marcado impedía el segundo intento.
        //
        // Sigue siendo a prueba de loops: el efecto sólo se vuelve a ejecutar
        // si cambian `fixture` o `refreshFixture`, no cuando una petición
        // falla. Un fallo real deja `fixtureError` y su botón de reintento.
        return () => {
            if (!fixture) autoFetchedRef.current = false;
        };
    }, [fixture, refreshFixture]);

    const phases = useMemo<PhaseWithRounds[]>(() => fixture?.phases ?? [], [fixture?.phases]);

    /**
     * Preselección DERIVADA, no un efecto que escribe estado: se respeta lo que
     * diga la URL mientras sea una fase de este torneo (o el centinela del
     * circuito), y si no, se cae a la fase activa que ya resolvió el servidor.
     * Una fase de otro torneo pegada en la URL no rompe nada: se ignora.
     */
    const selectedPhaseId = useMemo<string | null>(() => {
        if (urlPhaseId === CIRCUIT_GLOBAL_SENTINEL) return urlPhaseId;
        if (urlPhaseId && phases.some((phase) => phase.id === urlPhaseId)) return urlPhaseId;
        return fixture?.currentPhaseId ?? phases[0]?.id ?? null;
    }, [urlPhaseId, phases, fixture?.currentPhaseId]);

    if (fixtureError) {
        return (
            <div className="operation-console-shell">
                <div className="op-stage">
                    <div className="op-panel">
                        <div className="op-empty">
                            <span className="op-empty-glyph" style={{ color: '#ef4444' }}>
                                <AlertCircle size={20} />
                            </span>
                            <h3>No se pudo cargar el fixture</h3>
                            <p>
                                La consola no pudo leer las fases del torneo. Nada se perdió: es sólo la
                                lectura, así que podés reintentar sin riesgo.
                            </p>
                            <div className="op-empty-actions">
                                <button className="basalt-btn basalt-btn-accent" onClick={() => refreshFixture()}>
                                    <RefreshCw size={14} />
                                    Reintentar
                                </button>
                            </div>
                            <p className="op-empty-detail">{fixtureError}</p>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Mientras /fixture está en vuelo (o antes de dispararse) fixture es null → esqueleto.
    // NoStructureMessage se evalúa DESPUÉS: sólo aparece con el fixture ya cargado y sin
    // fases, así que no flashea antes de que lleguen los datos.
    if (!fixture) {
        return (
            <div className="operation-console-shell">
                <div className="op-bar">
                    <span className="op-phase-select" aria-hidden="true">
                        <span className="op-phase-select-label">Fase</span>
                        <span className="op-skeleton" style={{ width: 78 }} />
                    </span>
                    <div className="op-bar-figures">
                        <span className="op-fig">
                            <span className="op-fig-key">Partidos</span>
                            <span className="op-skeleton" style={{ width: 34 }} />
                        </span>
                        <span className="op-fig">
                            <span className="op-fig-key">Equipos</span>
                            <span className="op-skeleton" style={{ width: 18 }} />
                        </span>
                    </div>
                </div>
                <div className="op-stage">
                    <PanelSkeleton rows={6} />
                </div>
            </div>
        );
    }

    if (phases.length === 0) {
        return <NoStructureMessage id={id} />;
    }

    return (
        <OperationContent
            id={id}
            data={data}
            phases={phases}
            selectedPhaseId={selectedPhaseId}
            onSelectPhase={setPhase}
            initialSubtab={initialSubtab}
        />
    );
}

function NoStructureMessage({ id }: { id: string }) {
    const router = useRouter();

    return (
        <div className="operation-console-shell">
            <div className="op-stage">
                <div className="op-panel">
                    <div className="op-empty">
                        <span className="op-empty-glyph">
                            <Settings2 size={20} />
                        </span>
                        <h3>Este torneo todavía no tiene fases</h3>
                        <p>
                            Operación trabaja sobre una fase: el fixture, la tabla y las estadísticas
                            cuelgan de ella. Definí al menos una en Estructura y volvé.
                        </p>
                        <div className="op-empty-actions">
                            <button
                                className="basalt-btn basalt-btn-accent"
                                onClick={() => router.push(`/admin/entities/${id}/manage?type=tournament&tab=estructura`)}
                            >
                                <Settings2 size={14} />
                                Ir a Estructura
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

interface OperationContentProps {
    id: string;
    data: TournamentRow;
    phases: PhaseWithRounds[];
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
    const currentSubTab = normalizeOperationSubTab(searchParams.get('subtab') || initialSubtab);

    const buildSubTabUrl = useCallback((subTabId: string) => {
        const params = new URLSearchParams(
            typeof window === 'undefined' ? searchParams.toString() : window.location.search,
        );
        params.set('type', 'tournament');
        params.set('tab', 'operacion');
        params.set('subtab', subTabId);
        return `/admin/entities/${id}/manage?${params.toString()}`;
    }, [id, searchParams]);

    /**
     * El subtab es una navegación, así que va con `pushState`: apretar Atrás
     * desde Estadísticas vuelve a Posiciones. Antes usaba `replaceState`, que
     * pisa la entrada actual del historial — por eso Atrás se saltaba la
     * pestaña entera y salía de Operación.
     *
     * `pushState` nativo y no `router.push` porque `router.push` sobre la misma
     * ruta re-renderiza los componentes de servidor de `page.tsx`, que en esta
     * pantalla es exactamente lo que satura el pool. La API nativa está
     * integrada con el App Router: `useSearchParams()` se entera y Atrás
     * dispara el `popstate` que el router ya maneja.
     */
    const navigateToSubTab = useCallback((subTabId: string, mode: 'push' | 'replace') => {
        if (typeof window === 'undefined') return;
        const nextUrl = buildSubTabUrl(subTabId);
        if (nextUrl === `${window.location.pathname}${window.location.search}`) return;

        if (mode === 'push') window.history.pushState(null, '', nextUrl);
        else window.history.replaceState(null, '', nextUrl);
    }, [buildSubTabUrl]);

    const isCircuit = useMemo(() => isCircuitRuleset(data.ruleset), [data.ruleset]);
    const isGlobalSelected = selectedPhaseId === CIRCUIT_GLOBAL_SENTINEL;

    const selectedPhase = useMemo(() => {
        return phases.find((phase) => phase.id === selectedPhaseId) || null;
    }, [phases, selectedPhaseId]);

    // Las cifras se DERIVAN del fixture en memoria: no hay contador guardado que
    // pueda desincronizarse con la realidad.
    const figures = useMemo(() => (isGlobalSelected ? [] : buildPhaseFigures(selectedPhase)), [isGlobalSelected, selectedPhase]);
    const stats = useMemo(() => computePhaseStats(selectedPhase), [selectedPhase]);

    const switchSubTab = useCallback((subTabId: string) => {
        if (subTabId === currentSubTab) return;
        navigateToSubTab(subTabId, 'push');
    }, [currentSubTab, navigateToSubTab]);

    // En Tabla Global sólo Posiciones tiene sentido. Este salto NO lo pidió
    // nadie, así que va con `replace`: no tiene que quedar en el historial ni
    // hacer que Atrás rebote entre dos pestañas.
    useEffect(() => {
        if (isGlobalSelected && currentSubTab !== 'tabla') {
            navigateToSubTab('tabla', 'replace');
        }
    }, [currentSubTab, isGlobalSelected, navigateToSubTab]);

    const phaseStateLabel = isGlobalSelected
        ? 'Circuito'
        : selectedPhase?.isActive
            ? 'Activa'
            : 'Pendiente';
    const phaseStateClass = isGlobalSelected
        ? ''
        : selectedPhase?.isActive
            ? 'badge-ok'
            : 'badge-draft';

    return (
        <div className="operation-console-shell animate-in fade-in duration-300">
            {/* Barra de operación: la fase, su estado y sus cifras vivas. Reemplaza a
                la tarjeta de contexto, que repetía el nombre del torneo (ya está en el
                header) y explicaba con una frase lo que el usuario estaba mirando. */}
            <div className="op-bar">
                <span className="op-phase-select">
                    <span className="op-phase-select-label">Fase</span>
                    <span>
                        {isGlobalSelected ? 'Tabla Global' : (selectedPhase?.name || 'Sin fase')}
                    </span>
                    <ChevronDown size={12} aria-hidden="true" />
                    <select
                        aria-label="Fase seleccionada"
                        value={selectedPhaseId || ''}
                        onChange={(event) => onSelectPhase(event.target.value)}
                    >
                        {isCircuit && (
                            <option value={CIRCUIT_GLOBAL_SENTINEL}>Tabla Global (Circuito)</option>
                        )}
                        {phases.map((phase) => (
                            <option key={phase.id} value={phase.id}>
                                {phase.name}
                            </option>
                        ))}
                    </select>
                </span>

                <span className={`basalt-badge ${phaseStateClass}`}>
                    <span className="basalt-badge-dot" />
                    {phaseStateLabel}
                </span>

                {figures.length > 0 && (
                    <div className="op-bar-figures">
                        {figures.map((figure) => (
                            <span
                                key={figure.key}
                                className={`op-fig ${figure.attention ? 'is-attention' : ''}`}
                            >
                                <span className="op-fig-key">{figure.label}</span>
                                <b>{figure.value}</b>
                            </span>
                        ))}
                    </div>
                )}
            </div>

            <div className="op-subrail" role="tablist" aria-label="Submódulos de operación">
                {OPERATION_SUB_TABS.map((tab) => {
                    const Icon = tab.icon;
                    const isActive = currentSubTab === tab.id;
                    // En Tabla Global sólo Posiciones tiene sentido: el resto se
                    // deshabilita de verdad, en vez de dejar entrar a un cartel.
                    const disabled = isGlobalSelected && tab.id !== 'tabla';
                    const count = tab.id === 'fixture' && !isGlobalSelected ? stats.totalMatches : null;

                    return (
                        <button
                            key={tab.id}
                            type="button"
                            role="tab"
                            onClick={() => switchSubTab(tab.id)}
                            className={`op-subtab ${isActive ? 'is-active' : ''}`}
                            aria-selected={isActive}
                            disabled={disabled}
                            title={disabled ? 'Elegí una fase para habilitarlo' : tab.label}
                        >
                            <Icon size={14} aria-hidden="true" />
                            <span>{tab.label}</span>
                            {count !== null && count > 0 && (
                                <span className="op-subtab-count">{count}</span>
                            )}
                        </button>
                    );
                })}
            </div>

            <div className="op-stage">
                {isGlobalSelected && (
                    <div className="op-note is-info">
                        <span className="op-note-icon"><Trophy size={12} /></span>
                        <span className="op-note-copy">
                            <strong>La Tabla Global suma todas las etapas del circuito</strong>
                            <span>
                                Fixture y Estadísticas trabajan sobre una etapa concreta:
                                elegila arriba para habilitarlas.
                            </span>
                        </span>
                    </div>
                )}

                {currentSubTab === 'fixture' && !isGlobalSelected && (
                    <TournamentOperationFixtureWorkspace
                        tournament={data}
                        selectedPhaseId={selectedPhaseId}
                        onSelectPhase={onSelectPhase}
                    />
                )}
                {currentSubTab === 'tabla' && (
                    <TournamentStandingsTab
                        tournamentId={id}
                        preferredPhaseId={selectedPhaseId}
                    />
                )}
                {currentSubTab === 'estadisticas' && !isGlobalSelected && (
                    <TournamentStatsTab id={id} data={data} phaseId={selectedPhaseId || undefined} />
                )}
            </div>
        </div>
    );
}
