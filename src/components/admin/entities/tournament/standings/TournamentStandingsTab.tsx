'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, CheckCircle2, Clock3, Layers3, XCircle } from 'lucide-react';
import { StandingsFiltersBar } from './StandingsFiltersBar';
import { StandingsSidebar } from './StandingsSidebar';
import { StandingsTable } from './StandingsTable';
import { ManageLabelsPanel } from './ManageLabelsPanel';
import styles from './TournamentStandingsTab.module.css';
import type { StandingsDataPayload, StandingsPhase, StandingsRow, TeamLabelAssignment, TournamentContextData, UiLabel } from './types';

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

export default function TournamentStandingsTab({ tournamentId }: { tournamentId: string }) {
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
  const [allLabels, setAllLabels] = useState<UiLabel[]>([]);
  const [assignments, setAssignments] = useState<TeamLabelAssignment[]>([]);
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
          const firstActive = contextData.phases.find((p: StandingsPhase) => p.is_active) || contextData.phases[0];
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
  }, [tournamentId]);

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

  const loadAssignments = useCallback(async (phaseId: string | null, groupId: string | null) => {
    if (!phaseId) return;
    try {
      const url = `/api/admin/team-labels?tournament_id=${tournamentId}&phase_id=${phaseId}${groupId ? `&group_id=${groupId}` : ''}`;
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

  // Load global labels once on mount
  useEffect(() => {
    fetch('/api/admin/labels?scope=standings')
      .then((r) => r.json())
      .then((json) => { if (json.ok) setAllLabels(json.data ?? []); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 900px)');
    const sync = () => setIsCompactMobile(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    if (selectedPhase && !loadingContext) {
      loadStandings();
    }
  }, [loadStandings, selectedPhase, loadingContext]);

  // Load assignments only when phase/group changes
  useEffect(() => {
    loadAssignments(selectedPhase, selectedGroup);
  }, [loadAssignments, selectedPhase, selectedGroup]);


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

  // Build a map: club_id → UiLabel[] for fast lookup in StandingsTable
  const labelsMap = useMemo<Record<string, UiLabel[]>>(() => {
    const map: Record<string, UiLabel[]> = {};
    for (const a of assignments) {
      if (!map[a.club_id]) map[a.club_id] = [];
      map[a.club_id].push(a.label);
    }
    return map;
  }, [assignments]);

  // assignment id lookup: labelId+clubId → assignment id (for unassign)
  const assignmentIdMap = useMemo<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const a of assignments) {
      map[`${a.label_id}__${a.club_id}`] = a.id;
    }
    return map;
  }, [assignments]);

  const handleAssignLabel = async (clubId: string, labelId: string) => {
    const res = await fetch('/api/admin/team-labels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        label_id: labelId,
        club_id: clubId,
        tournament_id: tournamentId,
        phase_id: selectedPhase,
        group_id: selectedGroup,
      }),
    });
    const json = await res.json();
    if (json.ok) {
      setAssignments((prev) => [...prev, json.data]);
    }
  };

  const handleUnassignLabel = async (clubId: string, labelId: string) => {
    const assignmentId = assignmentIdMap[`${labelId}__${clubId}`];
    if (!assignmentId) return;
    const res = await fetch(`/api/admin/team-labels/${assignmentId}`, { method: 'DELETE' });
    const json = await res.json();
    if (json.ok) {
      setAssignments((prev) => prev.filter((a) => a.id !== assignmentId));
    }
  };

  if (loadingContext) {
    return <div className={styles.loadingState}>Loading standings context...</div>;
  }

  if (!context?.phases || context.phases.length === 0) {
    return <div className={styles.emptyState}>No se encontraron fases para este torneo.</div>;
  }

  const activePhase = context.phases.find((phase: StandingsPhase) => phase.id === selectedPhase);
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
          <ManageLabelsPanel
            labels={allLabels}
            onClose={() => setShowLabelsPanel(false)}
            onCreated={(label) => setAllLabels((prev) => [...prev, label])}
            onUpdated={(label) => setAllLabels((prev) => prev.map((l) => (l.id === label.id ? label : l)))}
            onDeleted={(id) => {
              setAllLabels((prev) => prev.filter((l) => l.id !== id));
              setAssignments((prev) => prev.filter((a) => a.label_id !== id));
            }}
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
              onAssignLabel={handleAssignLabel}
              onUnassignLabel={handleUnassignLabel}
              assignmentIdMap={assignmentIdMap}
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
