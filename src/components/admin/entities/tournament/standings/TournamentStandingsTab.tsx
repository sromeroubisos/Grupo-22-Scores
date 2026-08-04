'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock3, Tag, XCircle } from 'lucide-react';
import '../operation-console.css';
import { StandingsFiltersBar } from './StandingsFiltersBar';
import { StandingsSidebar } from './StandingsSidebar';
import { StandingsTable } from './StandingsTable';
import { PhaseLabelsPanel } from './PhaseLabelsPanel';
import { ManageLabelsPanel } from './ManageLabelsPanel';
import styles from './TournamentStandingsTab.module.css';
import type { StandingsDataPayload, StandingsPhase, StandingsRow, TeamLabelAssignment, TournamentContextData, UiLabel } from './types';
import { CIRCUIT_GLOBAL_SENTINEL } from './types';

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

/**
 * `onPhaseChange` se retiró con el selector de fase duplicado: el flujo de la
 * fase es de una sola dirección — la barra de operación la elige y baja por
 * `preferredPhaseId`. Cuando Posiciones también podía cambiarla, la fase
 * viajaba en los dos sentidos y podían discrepar.
 */
export default function TournamentStandingsTab({
  tournamentId,
  preferredPhaseId = null,
}: {
  tournamentId: string;
  preferredPhaseId?: string | null;
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
  const isGlobalCircuitMode = preferredPhaseId === CIRCUIT_GLOBAL_SENTINEL;
  const [globalCircuitLabels, setGlobalCircuitLabels] = useState<UiLabel[]>([]);

  const loadContextAndLite = useCallback(async () => {
    setLoadingContext(true);
    setLogicPanelError(null);

    try {
      const contextRes = await fetch(`/api/admin/tournaments/${tournamentId}/standings/context`);
      const contextData = await contextRes.json();

      if (contextData.ok) {
        setContext(contextData);
        if (preferredPhaseId === CIRCUIT_GLOBAL_SENTINEL) {
          setSelectedPhase(CIRCUIT_GLOBAL_SENTINEL);
        } else if (contextData.phases?.length > 0) {
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
      const phaseParam = phaseId === CIRCUIT_GLOBAL_SENTINEL ? 'null' : phaseId;
      const url = `/api/admin/team-labels?tournament_id=${tournamentId}&phase_id=${phaseParam}`;
      const res = await fetch(url);
      const json = await res.json();
      if (json.ok) setAssignments(json.data ?? []);
    } catch {
      // non-blocking
    }
  }, [tournamentId]);

  const loadGlobalLabels = useCallback(async () => {
    if (!isGlobalCircuitMode) return;
    try {
      const res = await fetch(`/api/admin/tournaments/${tournamentId}/circuit-labels`);
      const json = await res.json();
      if (json.ok) {
        setGlobalCircuitLabels(
          (json.data ?? []).map((l: { id: string; name: string; color: string }) => ({
            id: l.id,
            name: l.name,
            color: l.color,
            scope: 'standings',
          })),
        );
      }
    } catch {
      // non-blocking
    }
  }, [isGlobalCircuitMode, tournamentId]);

  const persistGlobalLabels = useCallback(async (labels: UiLabel[]) => {
    try {
      await fetch(`/api/admin/tournaments/${tournamentId}/circuit-labels`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ labels }),
      });
    } catch {
      // non-blocking
    }
  }, [tournamentId]);

  useEffect(() => {
    loadContextAndLite();
  }, [loadContextAndLite]);

  useEffect(() => {
    loadGlobalLabels();
  }, [loadGlobalLabels]);

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
    if (!preferredPhaseId) return;
    if (preferredPhaseId === CIRCUIT_GLOBAL_SENTINEL) {
      if (selectedPhase !== CIRCUIT_GLOBAL_SENTINEL) setSelectedPhase(CIRCUIT_GLOBAL_SENTINEL);
      return;
    }
    if (!context?.phases?.length) return;
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

  const phaseSupportsGroups = activePhase?.phase_type === 'group_stage';
  const phaseRequiresGroup = phaseSupportsGroups && (activePhase?.groups?.length || 0) > 0;
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
    if (isGlobalCircuitMode) {
      return globalCircuitLabels.filter((label) => !!label.id && !!label.name);
    }
    const phaseLabels = activePhase?.settings?.groupLabels || [];
    return phaseLabels
      .filter((label) => !!label.id && !!label.name)
      .map((label) => ({
        id: label.id as string,
        name: label.name,
        color: label.color,
        scope: 'standings',
      }));
  }, [isGlobalCircuitMode, globalCircuitLabels, activePhase?.settings?.groupLabels]);

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
    if (!isGlobalCircuitMode && phaseRequiresGroup && !selectedGroup) return;

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
            phase_id: isGlobalCircuitMode ? null : selectedPhase,
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
    isGlobalCircuitMode,
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

  if (!isGlobalCircuitMode && (!context?.phases || context.phases.length === 0)) {
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
    : phaseRequiresGroup
      ? 'Todos los grupos'
      : 'Tabla unica';
  const tableViewLabel = TABLE_VIEWS.find((tab) => tab.id === selectedTableType)?.label ?? selectedTableType;
  const hasOwnPhaseSettings = !!activePhase?.settings;

  const handleLogicUpdated = async () => {
    await loadContextAndLite();
    await loadStandings();
  };

  return (
    <div className={styles.page}>
      <div className={styles.pageInner}>
        {/* Cabecera de panel, no de página.
            Acá vivían un <h1> propio ("Gestion de tabla de posiciones"), un
            rótulo en inglés ("Flash Standings Workspace") y un párrafo que
            describía su propio layout — todo dentro de un panel esmerilado con
            dos halos de fondo, un sistema visual que no existe en ninguna otra
            parte de la consola. El nombre del torneo y la fase ya los dice la
            barra de operación; lo único que faltaba era elegir la vista. */}
        <header className="op-panel">
          <div className="op-panel-head">
            <span className="op-panel-title">Tabla</span>

            <div className="op-panel-actions">
              {TABLE_VIEWS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={`basalt-btn ${selectedTableType === tab.id ? 'basalt-btn-accent' : ''}`}
                  aria-pressed={selectedTableType === tab.id}
                  onClick={() => setSelectedTableType(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
              <button
                type="button"
                className={`basalt-btn ${showLabelsPanel ? 'basalt-btn-accent' : ''}`}
                aria-pressed={showLabelsPanel}
                onClick={() => setShowLabelsPanel((v) => !v)}
              >
                <Tag size={13} aria-hidden="true" />
                Etiquetas
                {allLabels.length > 0 ? ` · ${allLabels.length}` : ''}
              </button>
            </div>

            <div className="op-panel-meta">
              <span>{groupLabel || 'Todos los grupos'}</span>
              <span className="is-accent">
                {resolvedRules?.tiebreakers?.length ?? 0} desempates
              </span>
            </div>
          </div>
        </header>

        {showLabelsPanel && (
          isGlobalCircuitMode ? (
            <ManageLabelsPanel
              labels={allLabels}
              onClose={() => setShowLabelsPanel(false)}
              onCreated={(label) => {
                const updated = [...globalCircuitLabels, label];
                setGlobalCircuitLabels(updated);
                persistGlobalLabels(updated);
              }}
              onUpdated={(label) => {
                const updated = globalCircuitLabels.map((l) => l.id === label.id ? label : l);
                setGlobalCircuitLabels(updated);
                persistGlobalLabels(updated);
              }}
              onDeleted={(id) => {
                const updated = globalCircuitLabels.filter((l) => l.id !== id);
                setGlobalCircuitLabels(updated);
                persistGlobalLabels(updated);
              }}
            />
          ) : (
            <PhaseLabelsPanel
              labels={allLabels}
              phaseName={activePhase?.name || 'Fase activa'}
              onClose={() => setShowLabelsPanel(false)}
            />
          )
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
              groups={isGlobalCircuitMode ? [] : activeGroups}
              selectedPhase={isGlobalCircuitMode ? null : selectedPhase}
              selectedGroup={isGlobalCircuitMode ? null : selectedGroup}
              selectedTableType={selectedTableType}
              onGroupChange={setSelectedGroup}
              onTableTypeChange={setSelectedTableType}
              rules={resolvedRules}
              phaseName={isGlobalCircuitMode ? 'Tabla Global (Circuito)' : (activePhase?.name || 'Sin fase')}
              hasOwnPhaseSettings={isGlobalCircuitMode ? false : hasOwnPhaseSettings}
              errorMessage={logicPanelError}
              onRulesUpdated={handleLogicUpdated}
              compactMobile={isCompactMobile}
              phaseSupportsGroups={phaseSupportsGroups}
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
              phaseName={isGlobalCircuitMode ? 'Tabla Global (Circuito)' : (activePhase?.name || 'Fase sin nombre')}
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
              phaseId={isGlobalCircuitMode ? null : selectedPhase}
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
