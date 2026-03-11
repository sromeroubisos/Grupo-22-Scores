'use client';

import { useCallback, useEffect, useState } from 'react';
import { Activity, CheckCircle2, Clock3, Layers3, XCircle } from 'lucide-react';
import { StandingsFiltersBar } from './StandingsFiltersBar';
import { StandingsSidebar } from './StandingsSidebar';
import { StandingsTable } from './StandingsTable';
import styles from './TournamentStandingsTab.module.css';
import type { StandingsDataPayload, StandingsPhase, StandingsRow, TournamentContextData } from './types';

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

  const loadContext = useCallback(
    async (preservePhase = false) => {
      try {
        setLogicPanelError(null);
        const res = await fetch(`/api/admin/tournaments/${tournamentId}/standings/context`);
        const data = await res.json();

        if (data.ok) {
          setContext(data);
          if (data.phases?.length > 0 && (!preservePhase || !selectedPhase)) {
            const firstActive = data.phases.find((phase: StandingsPhase) => phase.is_active) || data.phases[0];
            setSelectedPhase(firstActive.id);
          }
        } else {
          setLogicPanelError('No se pudo cargar la logica.');
        }
      } catch (error) {
        console.error('Error loading standings context:', error);
        setLogicPanelError('No se pudo cargar la logica.');
      } finally {
        setLoadingContext(false);
      }
    },
    [tournamentId, selectedPhase],
  );

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
        setLogicPanelError('No se pudo cargar la logica.');
      }
    } catch (error) {
      console.error('Error loading standings data:', error);
      setLogicPanelError('No se pudo cargar la logica.');
    } finally {
      setLoadingStandings(false);
    }
  }, [selectedGroup, selectedPhase, selectedTableType, tournamentId]);

  useEffect(() => {
    loadContext();
  }, [loadContext]);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 900px)');
    const sync = () => setIsCompactMobile(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    if (selectedPhase) loadStandings();
  }, [loadStandings, selectedPhase]);

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
    await loadContext(true);
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
                  <span>{context.tournament?.name || 'Sin torneo'}</span>
                </div>
              </div>
              <div className={styles.metaCard}>
                <span className={styles.metaLabel}>Fase actual</span>
                <div className={styles.metaValue}>
                  <Activity size={14} />
                  <span>{activePhase?.name || 'Sin fase'}</span>
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
                value={metrics?.counted_matches ?? '--'}
                foot="Resultados finales procesados"
              />
              <MetricCard
                label="Pendientes"
                value={metrics?.pending_results ?? '--'}
                foot="Partidos aún fuera del cálculo"
              />
              <MetricCard
                label="Ajustes manuales"
                value={metrics?.manual_overrides ?? '--'}
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
