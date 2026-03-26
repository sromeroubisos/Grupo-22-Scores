'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, CheckCircle2, Clock3, Layers3, XCircle } from 'lucide-react';
import { StandingsFiltersBar } from './StandingsFiltersBar';
import { StandingsSidebar } from './StandingsSidebar';
import { StandingsTable } from './StandingsTable';
import { PhaseLabelsPanel } from './PhaseLabelsPanel';
import styles from './TournamentStandingsTab.module.css';
import type { StandingsDataPayload, StandingsPhase, StandingsRow, TeamLabelAssignment, TournamentContextData, UiLabel } from './types';

function getAssignmentKey(assignment: TeamLabelAssignment): string | null {
  if (typeof assignment.position === 'number') return String(assignment.position);
  return null;
}

function filterVisibleAssignments(
  items: TeamLabelAssignment[],
  shareAcrossPhaseGroups: boolean,
  selectedGroupId: string | null,
) {
  if (shareAcrossPhaseGroups) {
    return items.filter((assignment) => !assignment.group_id);
  }

  if (selectedGroupId) {
    return items.filter((assignment) => (assignment.group_id ?? null) === selectedGroupId);
  }

  return items.filter((assignment) => !assignment.group_id);
}

function formatRelativeTime(iso: string | null): string {
  if (!iso) return 'Nunca calculada';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'Hace un momento';
  if (mins < 60) return `Hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Hace ${hrs} h`;
  return new Date(iso).toLocaleDateString('es-AR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const TABLE_VIEWS = [
  { id: 'general', label: 'General' },
  { id: 'home', label: 'Local' },
  { id: 'away', label: 'Visitante' },
];

function MetricCard({ label, value, foot }: { label: string; value: number | string; foot: string }) {
  const display = value === '--' || value == null ? '--' : String(value).padStart(2, '0');

  return (
    <div className={`${styles.glassPanel} ${styles.metricCard}`}>
      <span className={styles.metricLabel}>{label}</span>
      <span className={styles.metricValue}>{display}</span>
      <span className={styles.metricFoot}>{foot}</span>
    </div>
  );
}

export default function TournamentStandingsTab({
  tournamentId,
  preferredPhaseId = null,
  onPhaseChange,
}: {
  tournamentId: string;
  preferredPhaseId?: string | null;
  onPhaseChange?: (phaseId: string) => void;
}) {
  const [context, setContext] = useState<TournamentContextData | null>(null);
  const [loadingContext, setLoadingContext] = useState(true);
  const [isCompactMobile, setIsCompactMobile] = useState(false);
  const [selectedPhase, setSelectedPhase] = useState<string | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [selectedTableType, setSelectedTableType] = useState<string>('general');
  const [standingsData, setStandingsData] = useState<StandingsDataPayload | null>(null);
  const [loadingStandings, setLoadingStandings] = useState(false);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [recalcFeedback, setRecalcFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [logicPanelError, setLogicPanelError] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<TeamLabelAssignment[]>([]);
  const [pendingLabelPosition, setPendingLabelPosition] = useState<string | null>(null);
  const [showLabelsPanel, setShowLabelsPanel] = useState(false);

  const loadContextAndLite = useCallback(async () => {
    setLoadingContext(true);
    setLogicPanelError(null);

    try {
      const contextRes = await fetch(`/api/admin/tournaments/${tournamentId}/standings/context`);
      const contextData = await contextRes.json();

      if (contextData.ok) {
        setContext(contextData);
        if (contextData.phases?.length > 0) {
          const currentPhase = selectedPhase
            ? contextData.phases.find((phase: StandingsPhase) => phase.id === selectedPhase)
            : null;
          const preferredPhase = preferredPhaseId
            ? contextData.phases.find((phase: StandingsPhase) => phase.id === preferredPhaseId)
            : null;
          const firstActive =
            preferredPhase ||
            currentPhase ||
            contextData.phases.find((p: StandingsPhase) => p.is_active) ||
            contextData.phases[0];
          setSelectedPhase(firstActive.id);
        }
      } else {
        setLogicPanelError('No se pudo cargar el contexto.');
      }
    } catch (error) {
      console.error('Error loading initial data:', error);
      setLogicPanelError('Error de red al cargar datos.');
    } finally {
      setLoadingContext(false);
    }
  }, [preferredPhaseId, selectedPhase, tournamentId]);

  const loadStandings = useCallback(async () => {
    if (!selectedPhase) return;

    setLoadingStandings(true);
    try {
      const query = new URLSearchParams({ phaseId: selectedPhase, tableType: selectedTableType });
      if (selectedGroup) query.append('groupId', selectedGroup);

      const res = await fetch(`/api/admin/tournaments/${tournamentId}/standings?${query}`);
      const data = await res.json();
      if (data.ok) {
        setStandingsData(data);
      } else {
        setLogicPanelError('No se pudo cargar la tabla real-time.');
      }
    } catch (error) {
      console.error('Error loading standings data:', error);
      setLogicPanelError('Error de red al cargar la tabla.');
    } finally {
      setLoadingStandings(false);
    }
  }, [selectedGroup, selectedPhase, selectedTableType, tournamentId]);

  const loadAssignments = useCallback(async (phaseId: string | null) => {
    if (!phaseId) return;
    try {
      const url = `/api/admin/team-labels?tournament_id=${tournamentId}&phase_id=${phaseId}`;
      const res = await fetch(url);
      const json = await res.json();
      if (json.ok) setAssignments(json.data ?? []);
    } catch {
      // non-blocking
    }
  }, [tournamentId]);

  useEffect(() => {
    loadContextAndLite();
  }, [loadContextAndLite]);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 900px)');
    const sync = () => setIsCompactMobile(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  const activePhase = useMemo(
    () => context?.phases.find((phase: StandingsPhase) => phase.id === selectedPhase) || null,
    [context?.phases, selectedPhase],
  );

  useEffect(() => {
    if (!preferredPhaseId || !context?.phases?.length) return;
    if (!context.phases.some((phase: StandingsPhase) => phase.id === preferredPhaseId)) return;
    if (selectedPhase === preferredPhaseId) return;
    setSelectedPhase(preferredPhaseId);
  }, [context?.phases, preferredPhaseId, selectedPhase]);

  useEffect(() => {
    if (!activePhase) return;

    const phaseGroups = activePhase.groups || [];
    if (phaseGroups.length === 0) {
      setSelectedGroup(null);
      return;
    }

    setSelectedGroup((current) => {
      if (current && phaseGroups.some((group) => group.id === current)) {
        return current;
      }
      return phaseGroups[0].id;
    });
  }, [selectedPhase, activePhase]);

  const phaseRequiresGroup = (activePhase?.groups?.length || 0) > 0;
  const canLoadGroupScopedData = !!selectedPhase && !loadingContext && (!phaseRequiresGroup || !!selectedGroup);

  useEffect(() => {
    if (phaseRequiresGroup && !selectedGroup) {
      setStandingsData(null);
    }
  }, [phaseRequiresGroup, selectedGroup]);

  useEffect(() => {
    if (canLoadGroupScopedData) {
      loadStandings();
    }
  }, [canLoadGroupScopedData, loadStandings]);

  useEffect(() => {
    if (canLoadGroupScopedData) {
      loadAssignments(selectedPhase);
      return;
    }
    setAssignments([]);
  }, [canLoadGroupScopedData, loadAssignments, selectedPhase]);

  const allLabels = useMemo<UiLabel[]>(() => {
    const phaseLabels = activePhase?.settings?.groupLabels || [];
    return phaseLabels
      .filter((label) => !!label.id && !!label.name)
      .map((label) => ({
        id: label.id as string,
        name: label.name,
        color: label.color,
        scope: 'standings',
      }));
  }, [activePhase?.settings?.groupLabels]);

  const shareAcrossPhaseGroups = phaseRequiresGroup;
  const visibleAssignments = useMemo(
    () => filterVisibleAssignments(assignments, shareAcrossPhaseGroups, selectedGroup),
    [assignments, selectedGroup, shareAcrossPhaseGroups],
  );


  const handleRecalculate = async () => {
    if (!selectedPhase) return;

    setIsRecalculating(true);
    setRecalcFeedback(null);

    try {
      const res = await fetch(`/api/admin/tournaments/${tournamentId}/standings/recalculate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phaseId: selectedPhase,
          groupId: selectedGroup,
          tableType: selectedTableType,
        }),
      });
      const result = await res.json();

      if (!res.ok) throw new Error(result.error || 'Error desconocido');

      await loadStandings();

      setRecalcFeedback({
        type: 'success',
        message: `${result.rows_calculated ?? 0} filas calculadas correctamente.`,
      });
    } catch (error: unknown) {
      setRecalcFeedback({
        type: 'error',
        message: error instanceof Error ? error.message : 'Error al recalcular.',
      });
    } finally {
      setIsRecalculating(false);
      setTimeout(() => setRecalcFeedback(null), 5000);
    }
  };

  // Build a map: position → UiLabel[] for fast lookup in StandingsTable
  const labelsMap = useMemo<Record<string, UiLabel[]>>(() => {
    const map: Record<string, UiLabel[]> = {};
    const allowedLabelIds = new Set(allLabels.map((label) => label.id));
    const labelOrder = new Map(allLabels.map((label, index) => [label.id, index]));
    for (const a of visibleAssignments) {
      if (!a.label || !allowedLabelIds.has(a.label.id)) continue;
      const key = getAssignmentKey(a);
      if (!key) continue;
      if (!map[key]) map[key] = [];
      map[key].push(a.label);
    }
    Object.values(map).forEach((labels) => {
      labels.sort(
        (a, b) =>
          (labelOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
          (labelOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER),
      );
    });
    return map;
  }, [allLabels, visibleAssignments]);

  const handleCycleLabel = useCallback(async ({
    position,
  }: {
    position: string;
  }) => {
    if (!selectedPhase || allLabels.length === 0 || pendingLabelPosition) return;
    if (phaseRequiresGroup && !selectedGroup) return;

    const normalizedPosition = Number(position);
    if (!Number.isInteger(normalizedPosition)) return;

    const labelOrder = new Map(allLabels.map((label, index) => [label.id, index]));
    const displayAssignments = visibleAssignments
      .filter((assignment) => assignment.position === normalizedPosition && labelOrder.has(assignment.label_id))
      .sort(
        (a, b) =>
          (labelOrder.get(a.label_id) ?? Number.MAX_SAFE_INTEGER) -
          (labelOrder.get(b.label_id) ?? Number.MAX_SAFE_INTEGER),
      );
    const assignmentsToRemove = assignments.filter((assignment) => {
      if (assignment.position !== normalizedPosition || !labelOrder.has(assignment.label_id)) return false;
      if (shareAcrossPhaseGroups) return true;
      return (assignment.group_id ?? null) === (selectedGroup ?? null);
    });

    const currentLabelId = displayAssignments[0]?.label_id ?? null;
    const currentIndex = currentLabelId ? allLabels.findIndex((label) => label.id === currentLabelId) + 1 : 0;
    const nextIndex = (currentIndex + 1) % (allLabels.length + 1);
    const nextLabel = nextIndex === 0 ? null : allLabels[nextIndex - 1];

    setPendingLabelPosition(position);
    setRecalcFeedback(null);

    try {
      for (const assignment of assignmentsToRemove) {
        const deleteRes = await fetch(`/api/admin/team-labels/${assignment.id}`, { method: 'DELETE' });
        const deleteJson = await deleteRes.json();
        if (!deleteRes.ok || !deleteJson.ok) {
          throw new Error(deleteJson.error || 'No se pudo limpiar la etiqueta anterior.');
        }
      }

      let nextAssignment: TeamLabelAssignment | null = null;

      if (nextLabel) {
        const createRes = await fetch('/api/admin/team-labels', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            label_id: nextLabel.id,
            position: normalizedPosition,
            tournament_id: tournamentId,
            phase_id: selectedPhase,
            group_id: null,
          }),
        });
        const createJson = await createRes.json();
        if (!createRes.ok || !createJson.ok) {
          throw new Error(createJson.error || 'No se pudo asignar la nueva etiqueta.');
        }
        nextAssignment = createJson.data;
      }

      const removableIds = new Set(assignmentsToRemove.map((assignment) => assignment.id));
      setAssignments((prev) => {
        const base = prev.filter((assignment) => !removableIds.has(assignment.id));
        return nextAssignment ? [...base, nextAssignment] : base;
      });
    } catch (error: unknown) {
      setRecalcFeedback({
        type: 'error',
        message: error instanceof Error ? error.message : 'No se pudo actualizar la etiqueta.',
      });
      setTimeout(() => setRecalcFeedback(null), 4000);
    } finally {
      setPendingLabelPosition(null);
    }
  }, [
    allLabels,
    assignments,
    pendingLabelPosition,
    phaseRequiresGroup,
    selectedGroup,
    selectedPhase,
    shareAcrossPhaseGroups,
    tournamentId,
    visibleAssignments,
  ]);

  if (loadingContext) {
    return <div className={styles.loadingState}>Loading standings context...</div>;
  }

  if (!context?.phases || context.phases.length === 0) {
    return <div className={styles.emptyState}>No se encontraron fases para este torneo.</div>;
  }

  const activeGroups = activePhase?.groups || [];
  const metrics = standingsData?.metrics;
  const resolvedRules = standingsData?.rules ?? activePhase?.resolvedRules ?? null;
  const lastCalcAt: string | null = standingsData?.last_calculated_at ?? null;
  const tableData: StandingsRow[] = standingsData?.table || [];
  const phaseTableColumns = activePhase?.settings?.tableColumns ?? null;
  const hasZeroPlayed = tableData.length > 0 && tableData.every((row) => row.played === 0);
  const groupLabel = selectedGroup
    ? activeGroups.find((group) => group.id === selectedGroup)?.name
    : 'Todos los grupos';
  const tableViewLabel = TABLE_VIEWS.find((tab) => tab.id === selectedTableType)?.label ?? selectedTableType;
  const tournamentStatus = context.tournament?.status || 'draft';
  const hasOwnPhaseSettings = !!activePhase?.settings;

  const handleLogicUpdated = async () => {
    await loadContextAndLite();
    await loadStandings();
  };

  return (
    <div className={styles.page}>
      <div aria-hidden className={`${styles.pageGlow} ${styles.pageGlowLeft}`} />
      <div aria-hidden className={`${styles.pageGlow} ${styles.pageGlowRight}`} />

      <div className={styles.pageInner}>
        <header className={`${styles.glassPanel} ${styles.header}`}>
          <div className={styles.headerTop}>
            <div className={styles.headerMain}>
              <span className={styles.eyebrow}>
                <span className={styles.eyebrowDot} />
                Flash Standings Workspace
              </span>
              <h1 className={styles.title}>Gestion de tabla de posiciones</h1>
              <p className={styles.subtitle}>
                {isCompactMobile
                  ? 'Mobile-first: fase, puntos y recálculo arriba; reglas y detalle quedan colapsados.'
                  : 'Consola visual de standings para la fase activa del torneo. Mantiene el cálculo y los filtros existentes, pero concentra contexto, métricas y reglas en un layout premium de tres columnas.'}
              </p>
            </div>

              <div className={styles.headerMeta}>
                <div className={styles.metaCard}>
                  <span className={styles.metaLabel}>Torneo</span>
                  <div className={styles.metaValue}>
                    <Layers3 size={14} />
                    {loadingContext ? <div className={`${styles.skeleton} ${styles.metaSkeleton}`} /> : <span>{context?.tournament?.name || 'Sin torneo'}</span>}
                  </div>
                </div>
                <div className={styles.metaCard}>
                  <span className={styles.metaLabel}>Fase actual</span>
                  <div className={styles.metaValue}>
                    <Activity size={14} />
                    {loadingContext ? <div className={`${styles.skeleton} ${styles.metaSkeleton}`} /> : <span>{activePhase?.name || 'Sin fase'}</span>}
                  </div>
                </div>
              <div className={styles.metaCard}>
                <span className={styles.metaLabel}>Estado</span>
                <div className={styles.metaValue}>
                  <span className={activePhase?.is_active ? styles.statusActive : styles.statusInactive}>
                    {activePhase?.is_active ? 'Activa' : tournamentStatus}
                  </span>
                  <span className={styles.metaMono}>{tableViewLabel}</span>
                </div>
              </div>
            </div>
          </div>

          <div className={styles.localTabs}>
            <div className={styles.localTabsGroup}>
              {TABLE_VIEWS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={`${styles.localTab} ${selectedTableType === tab.id ? styles.localTabActive : ''}`}
                  onClick={() => setSelectedTableType(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
              <button
                type="button"
                className={`${styles.localTab} ${showLabelsPanel ? styles.localTabActive : ''}`}
                onClick={() => setShowLabelsPanel((v) => !v)}
                title="Gestionar etiquetas"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4, display: 'inline' }}>
                  <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/>
                  <line x1="7" y1="7" x2="7.01" y2="7"/>
                </svg>
                Etiquetas
                {allLabels.length > 0 && (
                  <span className={styles.labelCountBadge}>{allLabels.length}</span>
                )}
              </button>
            </div>

            <div className={styles.localContext}>
              <span className={styles.contextPill}>
                Fase
                <span className={styles.contextStrong}>{activePhase?.phase_type || 'manual'}</span>
              </span>
              <span className={styles.contextPill}>
                Grupo
                <span className={styles.contextStrong}>{groupLabel || 'Todos'}</span>
              </span>
              <span className={styles.contextPill}>
                Reglas
                <span className={styles.contextStrong}>{resolvedRules?.tiebreakers?.length ?? 0} desempates</span>
              </span>
            </div>
          </div>
        </header>

        {showLabelsPanel && (
          <PhaseLabelsPanel
            labels={allLabels}
            phaseName={activePhase?.name || 'Fase activa'}
            onClose={() => setShowLabelsPanel(false)}
          />
        )}

        {recalcFeedback && (
          <div
            className={`${styles.feedbackBanner} ${
              recalcFeedback.type === 'success' ? styles.feedbackSuccess : styles.feedbackError
            }`}
          >
            {recalcFeedback.type === 'success' ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
            {recalcFeedback.message}
          </div>
        )}

        <div className={styles.workspace}>
          <aside className={styles.leftRail}>
            <StandingsFiltersBar
              tournamentId={tournamentId}
              phases={context.phases}
              groups={activeGroups}
              selectedPhase={selectedPhase}
              selectedGroup={selectedGroup}
              selectedTableType={selectedTableType}
              onPhaseChange={(value) => {
                setSelectedPhase(value);
                setSelectedGroup(null);
                onPhaseChange?.(value);
              }}
              onGroupChange={setSelectedGroup}
              onTableTypeChange={setSelectedTableType}
              rules={resolvedRules}
              phaseName={activePhase?.name || 'Sin fase'}
              hasOwnPhaseSettings={hasOwnPhaseSettings}
              errorMessage={logicPanelError}
              onRulesUpdated={handleLogicUpdated}
              compactMobile={isCompactMobile}
            />
          </aside>

          <section className={styles.centerRail}>
            <div className={styles.metricsBar}>
              <MetricCard
                label="Partidos contados"
                value={loadingStandings ? '--' : (metrics?.counted_matches ?? '--')}
                foot="Resultados finales procesados"
              />
              <MetricCard
                label="Pendientes"
                value={loadingStandings ? '--' : (metrics?.pending_results ?? '--')}
                foot="Partidos aún fuera del cálculo"
              />
              <MetricCard
                label="Ajustes manuales"
                value={loadingStandings ? '--' : (metrics?.manual_overrides ?? '--')}
                foot="Overrides aplicados a esta fase"
              />
            </div>

            <div className={styles.metricsMeta}>
              <Clock3 size={12} />
              <span>
                Ultima actualizacion
                {' · '}
                {formatRelativeTime(lastCalcAt)}
              </span>
            </div>

            {hasZeroPlayed && !loadingStandings && (
              <div className={styles.warningBanner}>
                <span>!</span>
                <span className={styles.warningCopy}>
                  No hay partidos finales computables para esta fase. La tabla muestra los equipos disponibles, pero
                  todavia no expone estadisticas consolidadas.
                </span>
              </div>
            )}

            <StandingsTable
              data={tableData}
              isLoading={loadingStandings}
              phaseName={activePhase?.name || 'Fase sin nombre'}
              groupLabel={groupLabel || 'Todos los grupos'}
              tableTypeLabel={tableViewLabel}
              tableColumns={phaseTableColumns}
              rules={resolvedRules}
              compactMobile={isCompactMobile}
              labelsMap={labelsMap}
              allLabels={allLabels}
              onCycleLabel={handleCycleLabel}
              pendingLabelPosition={pendingLabelPosition}
            />
          </section>

          <aside className={styles.rightRail}>
            <StandingsSidebar
              rules={resolvedRules}
              tournamentId={tournamentId}
              phaseId={selectedPhase}
              onRecalculate={handleRecalculate}
              isRecalculating={isRecalculating}
              lastCalculatedLabel={lastCalcAt ? formatRelativeTime(lastCalcAt) : 'Pendiente de calculo persistido'}
              compactMobile={isCompactMobile}
            />
          </aside>
        </div>
      </div>
    </div>
  );
}
