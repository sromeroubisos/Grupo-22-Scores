'use client';

import type { ElementType, ReactNode } from 'react';
import { useCallback, useEffect, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { AlertTriangle, Check, ChevronDown, GripVertical, History, ListOrdered, RefreshCw, ShieldCheck, Zap } from 'lucide-react';
import { formatCalculationMode, normalizeStandingsRules } from './rules';
import styles from './TournamentStandingsTab.module.css';
import type { AuditEntry, ResolvedTiebreaker, StandingsRules } from './types';

const TIEBREAKER_LABELS: Record<string, string> = {
  // snake_case (legacy)
  head_to_head_result: 'Head to Head',
  head_to_head: 'Head to Head',
  points_difference: 'Diferencia de puntos',
  points_diff: 'Diferencia de puntos',
  tries_scored: 'Tries anotados',
  tries_for: 'Tries a favor',
  fair_play_cards: 'Fair play',
  fair_play: 'Fair play',
  points_for: 'Puntos a favor',
  points_against: 'Puntos en contra',
  scored: 'Puntaje total',
  fewest_red_cards: 'Menor rojas',
  fewest_yellow_cards: 'Menor amarillas',
  random_draw: 'Sorteo',
  wins: 'Partidos ganados',
  losses: 'Partidos perdidos',
  draws: 'Empates',
  away_goals: 'Goles visitante',
  away_points: 'Puntos visitante',
  goal_difference: 'Diferencia de goles',
  goals_for: 'Goles a favor',
  bonus_offensive: 'Bonus ofensivo',
  bonus_defensive: 'Bonus defensivo',
  // camelCase (from TiebreakerMetricItem)
  headToHead: 'Head to Head',
  pointsDiff: 'Diferencia de puntos',
  pointsDifference: 'Diferencia de puntos',
  pointsFor: 'Puntos a favor',
  pointsAgainst: 'Puntos en contra',
  points: 'Puntos',
  won: 'Partidos ganados',
  lost: 'Partidos perdidos',
  drawn: 'Empates',
  bonusOffensive: 'Bonus ofensivo',
  bonusDefensive: 'Bonus defensivo',
  tries: 'Tries',
  conversions: 'Conversiones',
  penalties: 'Penales',
  dropGoals: 'Drop goals',
  tackles: 'Tackles',
  runs: 'Corridas',
};

function resolveKey(tiebreaker: ResolvedTiebreaker): string {
  if (typeof tiebreaker === 'string') return tiebreaker;
  return (tiebreaker as any)?.metric || tiebreaker?.key || tiebreaker?.id || '';
}

function resolveLabel(tiebreaker: ResolvedTiebreaker): string {
  if (!tiebreaker) return '—';
  if (typeof tiebreaker === 'object' && (tiebreaker as any)?.label) return (tiebreaker as any).label;
  const key = resolveKey(tiebreaker);
  return TIEBREAKER_LABELS[key] || key.replace(/_/g, ' ');
}

function buildItems(rules: StandingsRules | null | undefined): { id: string; key: string; label: string; enabled: boolean }[] {
  if (!rules?.tiebreakers || !Array.isArray(rules.tiebreakers)) return [];
  return rules.tiebreakers
    .filter((item): item is ResolvedTiebreaker => item != null)
    .sort((a, b) => ((a as any).priority ?? 0) - ((b as any).priority ?? 0))
    .map((item, index) => ({
      id: `tb-${index}-${resolveKey(item) || index}`,
      key: resolveKey(item),
      label: resolveLabel(item),
      enabled: typeof item === 'object' ? ((item as any).enabled !== false) : true,
    }));
}

function formatAuditTime(iso: string): string {
  const date = new Date(iso);
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'Hace un momento';
  if (mins < 60) return `Hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Hace ${hrs} h`;
  return date.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function actionAccent(action: string): string {
  if (action.includes('recalcul')) return '#00a365';
  if (action.includes('rule') || action.includes('update')) return '#34d399';
  if (action.includes('delete') || action.includes('remov')) return '#ef4444';
  if (action.includes('creat') || action.includes('add')) return '#10b981';
  return '#64748b';
}

function actionLabel(action: string): string {
  return action.replace(/_/g, ' ').toUpperCase();
}

function PanelSummary({
  icon: Icon,
  children,
}: {
  icon: ElementType;
  children: ReactNode;
}) {
  return (
    <summary className={styles.panelSummary}>
      <div className={styles.panelHeader}>
        <span className={styles.panelHeaderDot} />
        <Icon size={14} className={styles.panelHeaderIcon} />
        <span className={styles.panelTitle}>{children}</span>
      </div>
      <ChevronDown size={16} className={styles.panelSummaryChevron} />
    </summary>
  );
}

function TiebreakerItem({ id, index, label, enabled }: { id: string; index: number; label: string; enabled: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`${styles.tiebreakerItem} ${isDragging ? styles.tiebreakerDragging : ''} ${!enabled ? styles.tiebreakerDisabled : ''}`}
    >
      <button {...attributes} {...listeners} className={styles.dragHandle} title="Arrastrar para reordenar">
        <GripVertical size={13} />
      </button>
      <span className={styles.orderIndex}>{index + 1}.</span>
      <span className={styles.tiebreakerLabel}>{label || '—'}</span>
      {!enabled && <span className={styles.tiebreakerDisabledBadge}>off</span>}
    </div>
  );
}

interface StandingsSidebarProps {
  rules: StandingsRules | null;
  tournamentId: string;
  phaseId: string | null;
  onRecalculate: () => void;
  isRecalculating: boolean;
  lastCalculatedLabel: string;
  compactMobile?: boolean;
}

export function StandingsSidebar({
  rules,
  tournamentId,
  phaseId,
  onRecalculate,
  isRecalculating,
  lastCalculatedLabel,
  compactMobile = false,
}: StandingsSidebarProps) {
  const [items, setItems] = useState<{ id: string; key: string; label: string; enabled: boolean }[]>([]);
  const [savingOrder, setSavingOrder] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);

  useEffect(() => {
    setItems(buildItems(rules));
  }, [rules]);

  useEffect(() => {
    if (!tournamentId) return;
    fetch(`/api/admin/tournaments/${tournamentId}/standings/audit?limit=8`)
      .then((res) => res.json())
      .then((data) => {
        if (data.ok) setAuditEntries(data.entries || []);
      })
      .catch(() => {});
  }, [tournamentId]);

  useEffect(() => {
    if (!isRecalculating && tournamentId) {
      fetch(`/api/admin/tournaments/${tournamentId}/standings/audit?limit=8`)
        .then((res) => res.json())
        .then((data) => {
          if (data.ok) setAuditEntries(data.entries || []);
        })
        .catch(() => {});
    }
  }, [isRecalculating, tournamentId]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = items.findIndex((item) => item.id === active.id);
      const newIndex = items.findIndex((item) => item.id === over.id);
      const newItems = arrayMove(items, oldIndex, newIndex);
      setItems(newItems);

      if (!phaseId) return;

      setSavingOrder(true);
      setSaveStatus('idle');

      try {
        const res = await fetch(`/api/admin/tournaments/${tournamentId}/standings/rules`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phaseId,
            rules: {
              ...rules,
              tiebreakers: newItems.map((item) => item.key),
            },
          }),
        });

        setSaveStatus(res.ok ? 'saved' : 'error');
      } catch {
        setSaveStatus('error');
      } finally {
        setSavingOrder(false);
        setTimeout(() => setSaveStatus('idle'), 3000);
      }
    },
    [items, phaseId, tournamentId, rules],
  );

  const promoted = rules?.qualification_rules?.promoted ?? rules?.qualification_rules?.qualified ?? 0;
  const zone = rules?.qualification_rules?.zone ?? rules?.qualification_rules?.repechaje ?? 0;
  const relegated = rules?.qualification_rules?.relegated ?? rules?.qualification_rules?.descenso ?? 0;
  const normalizedRules = normalizeStandingsRules(rules);

  return (
    <div className={styles.stack}>
      <details className={`${styles.glassPanel} ${styles.panelDetails}`} open>
        <PanelSummary icon={Zap}>Modo de cálculo</PanelSummary>
        <div className={styles.panelBody}>
          <p className={styles.sideNote}>
            El sistema mantiene el cálculo vigente, pero esta vista expone el modo efectivo de la fase y el último
            recálculo persistido.
          </p>

          <div className={styles.rulesList}>
            <div className={styles.ruleRow}>
              <span className={styles.ruleLabel}>Modo</span>
              <span className={styles.ruleValue}>{formatCalculationMode(normalizedRules.calculationMode)}</span>
            </div>
            <div className={styles.ruleRow}>
              <span className={styles.ruleLabel}>Editable</span>
              <span className={styles.ruleValue}>{rules?.editable_mode || rules?.editable ? 'Sí' : 'No'}</span>
            </div>
            <div className={styles.ruleRow}>
              <span className={styles.ruleLabel}>Último cálculo</span>
              <span className={styles.ruleValue}>{lastCalculatedLabel}</span>
            </div>
          </div>

          <button type="button" onClick={onRecalculate} disabled={isRecalculating} className={styles.buttonPrimary}>
            <RefreshCw size={14} className={isRecalculating ? 'animate-spin' : ''} />
            {isRecalculating ? 'Recalculando...' : 'Forzar recálculo'}
          </button>
        </div>
      </details>

      <details className={`${styles.glassPanel} ${styles.panelDetails}`} open={!compactMobile}>
        <PanelSummary icon={ShieldCheck}>Criterios de fase</PanelSummary>
        <div className={styles.panelBody}>
          <div className={styles.rulesList}>
            <div className={styles.ruleRow}>
              <span className={styles.ruleLabel}>Clasificados</span>
              <span className={styles.ruleValue}>{promoted || '—'}</span>
            </div>
            <div className={styles.ruleRow}>
              <span className={styles.ruleLabel}>Zona intermedia</span>
              <span className={styles.ruleValue}>{zone || '—'}</span>
            </div>
            <div className={styles.ruleRow}>
              <span className={styles.ruleLabel}>Descenso</span>
              <span className={styles.ruleValue}>{relegated || '—'}</span>
            </div>
          </div>
        </div>
      </details>

      <details className={`${styles.glassPanel} ${styles.panelDetails}`} open={!compactMobile}>
        <PanelSummary icon={ListOrdered}>Prioridad de desempate</PanelSummary>
        <div className={styles.panelBody}>
          {items.length > 0 ? (
            <>
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
                  <div className={styles.tiebreakerList}>
                    {items.map((item, index) => (
                      <TiebreakerItem key={item.id} id={item.id} index={index} label={item.label} enabled={item.enabled} />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>

              <div className={styles.rowStatus}>
                <p className={styles.statusText}>Arrastra para reordenar prioridad</p>
                {saveStatus === 'saved' && (
                  <span className={`${styles.statusText} ${styles.statusTextSuccess}`}>
                    <Check size={10} /> Guardado
                  </span>
                )}
                {saveStatus === 'error' && (
                  <span className={`${styles.statusText} ${styles.statusTextError}`}>
                    <AlertTriangle size={10} /> Error
                  </span>
                )}
                {savingOrder && <span className={styles.statusText}>Guardando...</span>}
              </div>
            </>
          ) : (
            <div className={styles.emptyPanel}>
              <span className={styles.emptyPanelTitle}>Sin desempates definidos</span>
              <span className={styles.emptyPanelCopy}>Se aplicarán los criterios por defecto del torneo.</span>
            </div>
          )}
        </div>
      </details>

      <details className={`${styles.glassPanel} ${styles.panelDetails}`} open={!compactMobile}>
        <PanelSummary icon={History}>Auditoría</PanelSummary>
        <div className={styles.panelBody}>
          {auditEntries.length > 0 ? (
            <div className={styles.auditTimeline}>
              {auditEntries.map((entry, index) => {
                const accent = actionAccent(entry.action || '');
                return (
                  <div key={entry.id || index} className={styles.auditItem}>
                    <div className={styles.auditDot} style={{ background: accent, boxShadow: `0 0 8px ${accent}80` }} />
                    <div className={styles.auditHead}>
                      <span className={styles.auditAction} style={{ color: accent }}>
                        {actionLabel(entry.action || '')}
                      </span>
                      <span className={styles.auditTime}>{formatAuditTime(entry.created_at)}</span>
                    </div>
                    <p className={styles.auditSummary}>
                      {entry.changes?.rows_calculated != null
                        ? `${entry.changes.rows_calculated} filas · ${entry.changes.table_type || 'general'}`
                        : 'Operación registrada en la bitácora de standings.'}
                    </p>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className={styles.emptyPanel}>
              <span className={styles.emptyPanelTitle}>Sin entradas recientes</span>
              <span className={styles.emptyPanelCopy}>Las operaciones se registran aquí automáticamente.</span>
            </div>
          )}
        </div>
      </details>
    </div>
  );
}
