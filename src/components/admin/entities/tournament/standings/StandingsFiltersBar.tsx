'use client';

import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Filter, Scale, Settings2, X } from 'lucide-react';
import {
  formatCalculationMode,
  normalizeCalculationMode,
  normalizeStandingsRules,
} from './rules';
import { useDialog } from '../useDialog';
import {
  DEFAULT_OFFENSIVE_BONUS_THRESHOLD,
  describeOffensiveBonusRule,
  type OffensiveBonusMode,
} from '@/lib/bonusRuleMetrics';
import styles from './TournamentStandingsTab.module.css';
import type { StandingsGroup, StandingsPhase, StandingsRules } from './types';

/** El título del modal es su nombre accesible; el id los une. */
const LOGIC_MODAL_TITLE_ID = 'standings-logic-modal-title';

interface StandingsFiltersBarProps {
  tournamentId: string;
  // `phases` y `onPhaseChange` se retiraron junto con el selector de fase
  // duplicado: la fase se elige UNA vez, en la barra de operación, y baja por
  // prop. `selectedPhase` se conserva porque el panel de reglas la necesita
  // para saber sobre qué fase guarda.
  groups: StandingsGroup[];
  selectedPhase: string | null;
  selectedGroup: string | null;
  selectedTableType: string;
  onGroupChange: (id: string | null) => void;
  onTableTypeChange: (type: string) => void;
  rules?: StandingsRules | null;
  phaseName: string;
  hasOwnPhaseSettings: boolean;
  errorMessage?: string | null;
  onRulesUpdated: () => Promise<void> | void;
  compactMobile?: boolean;
  phaseSupportsGroups?: boolean;
}

type LogicFormState = {
  points_for_win: number;
  points_for_draw: number;
  points_for_loss: number;
  offensive_bonus_rule: boolean;
  offensive_bonus_threshold: number;
  /** Contra qué se mide el umbral: tries anotados (4+) o de diferencia (3+). */
  offensive_bonus_mode: OffensiveBonusMode;
  defensive_bonus_rule: boolean;
  defensive_bonus_margin: number;
  calculation_mode: 'automatic' | 'manual' | 'hybrid';
  editable_mode: boolean;
};

function PanelSummary({
  icon,
  children,
}: {
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <summary className={styles.panelSummary}>
      <div className={styles.panelHeader}>
        <span className={styles.panelHeaderDot} />
        <span className={styles.panelHeaderIcon}>{icon}</span>
        <span className={styles.panelTitle}>{children}</span>
      </div>
      <ChevronDown size={16} className={styles.panelSummaryChevron} />
    </summary>
  );
}

function SelectField({
  label,
  value,
  onChange,
  children,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <div className={styles.field}>
      <label className={styles.fieldLabel}>{label}</label>
      <div className={styles.selectShell}>
        <select
          className={styles.selectControl}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
        >
          {children}
        </select>
        <ChevronDown size={15} className={styles.selectChevron} />
      </div>
    </div>
  );
}

function createInitialLogicForm(rules?: StandingsRules | null): LogicFormState {
  const normalized = normalizeStandingsRules(rules);

  return {
    points_for_win: normalized.points.win ?? 0,
    points_for_draw: normalized.points.draw ?? 0,
    points_for_loss: normalized.points.loss ?? 0,
    offensive_bonus_rule: normalized.bonusOffensive.active,
    offensive_bonus_threshold:
      normalized.bonusOffensive.threshold ?? DEFAULT_OFFENSIVE_BONUS_THRESHOLD[normalized.bonusOffensive.mode],
    offensive_bonus_mode: normalized.bonusOffensive.mode,
    defensive_bonus_rule: normalized.bonusDefensive.active,
    defensive_bonus_margin: normalized.bonusDefensive.margin ?? 7,
    calculation_mode:
      normalized.calculationMode === 'undefined' ? 'automatic' : normalized.calculationMode,
    editable_mode: normalized.isEditable,
  };
}

function formatPointsValue(value: number | undefined) {
  if (typeof value !== 'number') return '—';
  return value > 0 ? `+${value} pts` : `${value} pts`;
}

function formatBonusRule(kind: 'offensive' | 'defensive', rules?: StandingsRules | null) {
  const normalized = normalizeStandingsRules(rules);

  if (kind === 'offensive') {
    if (!normalized.bonusOffensive.active) return { label: 'Inactivo', tone: 'inactive' as const };
    const mode = normalized.bonusOffensive.mode;
    const threshold = normalized.bonusOffensive.threshold ?? DEFAULT_OFFENSIVE_BONUS_THRESHOLD[mode];
    return {
      // "+1 por 4+ tries" o "+1 por 3+ tries de diferencia": la misma frase que
      // usan el creador y el Match Center, así que no puede decir otra cosa.
      label: `+1 por ${describeOffensiveBonusRule({ metric: 'event_count', eventType: 'try', label: 'tries', threshold, mode })}`,
      tone: 'active' as const,
    };
  }

  if (!normalized.bonusDefensive.active) return { label: 'Inactivo', tone: 'inactive' as const };
  const margin = normalized.bonusDefensive.margin ?? 7;
  return {
    label: `+1 por derrota por ${margin} o menos`,
    tone: 'active' as const,
  };
}

function normalizeMode(rules?: StandingsRules | null) {
  return normalizeCalculationMode(rules);
}

function buildDynamicHelperText(rules?: StandingsRules | null) {
  const normalized = normalizeStandingsRules(rules);

  if (!normalized.hasConfig) {
    return 'Sin configuración de cálculo definida para esta fase.';
  }

  const mode = normalized.calculationMode;
  const hasOffensive = normalized.bonusOffensive.active;
  const hasDefensive = normalized.bonusDefensive.active;
  const hasTiebreakers = normalized.hasTiebreakers;
  const hasAdjustments = normalized.hasAdjustments;

  if (mode === 'hybrid') {
    return 'La tabla combina resultados automáticos con ajustes manuales permitidos en esta fase.';
  }

  if (mode === 'manual') {
    return 'La tabla depende de cargas manuales o sobrescrituras configuradas para esta fase.';
  }

  if (hasOffensive || hasDefensive || hasTiebreakers) {
    return `La tabla toma su lógica desde la configuración efectiva de esta fase y aplica${
      hasOffensive ? ' bonus ofensivo' : ''
    }${hasOffensive && hasDefensive ? ',' : ''}${hasDefensive ? ' bonus defensivo' : ''}${
      hasTiebreakers ? ' y criterios de desempate activos' : ''
    }.`;
  }

  if (hasAdjustments) {
    return 'La tabla usa cálculo automático con reglas base y admite ajustes manuales permitidos en esta fase.';
  }

  return 'La tabla usa cálculo automático con reglas base de puntos y sin bonus activos.';
}

function RuleItem({
  label,
  value,
  tone = 'active',
}: {
  label: string;
  value: string;
  tone?: 'active' | 'inactive' | 'warning';
}) {
  const toneClass =
    tone === 'active'
      ? styles.ruleValueActive
      : tone === 'warning'
        ? styles.ruleValueWarning
        : styles.ruleValueInactive;

  return (
    <div className={styles.ruleRow}>
      <span className={styles.ruleLabel}>{label}</span>
      <span className={`${styles.ruleValue} ${toneClass}`}>{value}</span>
    </div>
  );
}

export function StandingsFiltersBar({
  tournamentId,
  groups,
  selectedPhase,
  selectedGroup,
  selectedTableType,
  onGroupChange,
  onTableTypeChange,
  rules,
  phaseName,
  hasOwnPhaseSettings,
  errorMessage,
  onRulesUpdated,
  compactMobile = false,
  phaseSupportsGroups = false,
}: StandingsFiltersBarProps) {
  const [isLogicEditorOpen, setIsLogicEditorOpen] = useState(false);

  /**
   * El editor de lógica es el único de los tres modales con un formulario
   * adentro, así que era el que peor se portaba sin trampa de foco: dos Tab y ya
   * estabas escribiendo en la tabla de atrás sin verlo. Se cierra con Escape,
   * salvo mientras guarda —interrumpir un guardado a mitad de camino deja al
   * operador sin saber si se aplicó.
   */
  const { ref: logicDialogRef, dialogProps: logicDialogProps } = useDialog<HTMLDivElement>({
    open: isLogicEditorOpen,
    onClose: () => {
      if (!isSavingLogic) setIsLogicEditorOpen(false);
    },
    labelledBy: LOGIC_MODAL_TITLE_ID,
  });
  const [isSavingLogic, setIsSavingLogic] = useState(false);
  const [logicSaveError, setLogicSaveError] = useState<string | null>(null);
  const [logicForm, setLogicForm] = useState<LogicFormState>(() => createInitialLogicForm(rules));

  useEffect(() => {
    setLogicForm(createInitialLogicForm(rules));
    setLogicSaveError(null);
  }, [rules, selectedPhase]);

  const offensiveRule = formatBonusRule('offensive', rules);
  const defensiveRule = formatBonusRule('defensive', rules);
  const normalizedRules = useMemo(() => normalizeStandingsRules(rules), [rules]);
  const dynamicHelperText = useMemo(() => buildDynamicHelperText(rules), [rules]);
  const currentMode = normalizeMode(rules);
  const canEdit = !!selectedPhase;

  const handleSaveLogic = async () => {
    if (!selectedPhase) return;

    setIsSavingLogic(true);
    setLogicSaveError(null);

    const nextRules: StandingsRules = {
      ...(rules ?? {}),
      points_for_win: logicForm.points_for_win,
      points_for_draw: logicForm.points_for_draw,
      points_for_loss: logicForm.points_for_loss,
      offensive_bonus_rule: logicForm.offensive_bonus_rule
        ? { mode: logicForm.offensive_bonus_mode, tries: logicForm.offensive_bonus_threshold }
        : null,
      defensive_bonus_rule: logicForm.defensive_bonus_rule
        ? { margin: logicForm.defensive_bonus_margin }
        : null,
      calculation_mode:
        logicForm.calculation_mode === 'hybrid'
          ? 'assisted_manual'
          : logicForm.calculation_mode === 'manual'
            ? 'fully_manual'
            : 'automatic',
      editable_mode: logicForm.editable_mode,
    };

    try {
      const response = await fetch(`/api/admin/tournaments/${tournamentId}/standings/rules`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phaseId: selectedPhase,
          rules: nextRules,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || 'No se pudo guardar la lógica.');
      }

      await onRulesUpdated();
      setIsLogicEditorOpen(false);
    } catch (error) {
      setLogicSaveError(error instanceof Error ? error.message : 'No se pudo guardar la lógica.');
    } finally {
      setIsSavingLogic(false);
    }
  };

  return (
    <>
      <div className={styles.stack}>
        {/* En el teléfono este panel queda debajo de la tabla y, sin grupos
            que elegir, es un solo select deshabilitado que dice «Tabla unica»:
            150px de pantalla para no ofrecer ninguna decisión. Se abre solo
            cuando la fase TIENE zonas, que es cuando hay algo que elegir. */}
        <details
          className={`${styles.glassPanel} ${styles.panelDetails}`}
          open={!compactMobile || (phaseSupportsGroups && groups.length > 0)}
        >
          <PanelSummary icon={<Filter size={14} />}>Filtros y vista</PanelSummary>
          <div className={styles.panelBody}>
            <div className={styles.stack}>
              {/* La fase se elige UNA vez, en la barra de operación, y baja por
                  prop. Acá había un segundo selector: podías dejar la barra
                  diciendo "Fase Regular" mientras la tabla calculaba los
                  playoffs, sin que nada avisara de la discrepancia. */}
              <SelectField
                label="Grupo o zona"
                value={phaseSupportsGroups ? (selectedGroup || '') : ''}
                onChange={(value) => onGroupChange(value || null)}
                disabled={!selectedPhase || !phaseSupportsGroups || groups.length === 0}
              >
                <option value="">
                  {phaseSupportsGroups
                    ? (groups.length > 0 ? 'Todos los grupos' : 'Sin grupos configurados')
                    : 'Tabla unica'}
                </option>
                {phaseSupportsGroups && groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </SelectField>

              {/* En el teléfono este campo se apaga: escribe el mismo estado
                  que los botones General · Local · Visitante de la cabecera
                  del panel, que quedan a la vista en la misma pantalla. */}
              <div className={styles.perspectiveField}>
                <SelectField label="Perspectiva" value={selectedTableType} onChange={onTableTypeChange}>
                  <option value="general">Tabla general</option>
                  <option value="home">Tabla local</option>
                  <option value="away">Tabla visitante</option>
                </SelectField>
              </div>
            </div>
          </div>
        </details>

        <details className={`${styles.glassPanel} ${styles.panelDetails}`} open={!compactMobile}>
          <PanelSummary icon={<Scale size={14} />}>Reglas de cálculo</PanelSummary>
          <div className={styles.panelBody}>
            {errorMessage ? (
              <div className={styles.logicStateBox}>
                <span className={styles.logicStateTitle}>No se pudo cargar la lógica</span>
                <span className={styles.logicStateMessage}>{errorMessage}</span>
              </div>
            ) : !rules ? (
              <div className={styles.logicStateBox}>
                <span className={styles.logicStateTitle}>Sin lógica definida</span>
                <span className={styles.logicStateMessage}>Esta fase todavía no tiene una configuración de cálculo cargada.</span>
              </div>
            ) : (
              <>
                <div className={styles.rulesList}>
                  <RuleItem label="Victoria" value={formatPointsValue(normalizedRules.points.win ?? undefined)} />
                  <RuleItem
                    label="Empate"
                    value={formatPointsValue(normalizedRules.points.draw ?? undefined)}
                    tone={normalizedRules.points.draw ? 'active' : 'inactive'}
                  />
                  <RuleItem
                    label="Derrota"
                    value={formatPointsValue(normalizedRules.points.loss ?? undefined)}
                    tone={normalizedRules.points.loss ? 'active' : 'inactive'}
                  />
                  <RuleItem label="Bonus ofensivo" value={offensiveRule.label} tone={offensiveRule.tone} />
                  <RuleItem label="Bonus defensivo" value={defensiveRule.label} tone={defensiveRule.tone} />
                  <RuleItem
                    label="Modo"
                    value={formatCalculationMode(currentMode)}
                    tone={
                      currentMode === 'automatic'
                        ? 'active'
                        : currentMode === 'hybrid'
                          ? 'warning'
                          : currentMode === 'manual'
                            ? 'inactive'
                            : 'warning'
                    }
                  />
                </div>

                <div className={styles.logicMetaBlock}>
                  <span className={styles.logicMetaLabel}>
                    {hasOwnPhaseSettings ? 'Configuración propia de fase' : 'Configuración heredada o resuelta'}
                  </span>
                  <p className={styles.sideNote}>{dynamicHelperText}</p>
                </div>
              </>
            )}

            <button
              type="button"
              className={styles.buttonSecondary}
              disabled={!canEdit}
              onClick={() => setIsLogicEditorOpen(true)}
            >
              <Settings2 size={14} />
              Configurar lógica
            </button>
          </div>
        </details>
      </div>

      {isLogicEditorOpen && (
        <div className={styles.logicModalOverlay} role="presentation" onClick={() => !isSavingLogic && setIsLogicEditorOpen(false)}>
          <div
            ref={logicDialogRef}
            className={`${styles.glassPanel} ${styles.logicModal}`}
            {...logicDialogProps}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.logicModalHeader}>
              <div>
                <span className={styles.logicModalEyebrow}>Fase actual</span>
                <h3 className={styles.logicModalTitle} id={LOGIC_MODAL_TITLE_ID}>{phaseName}</h3>
              </div>
              <button
                type="button"
                className={styles.logicModalClose}
                onClick={() => setIsLogicEditorOpen(false)}
                disabled={isSavingLogic}
                aria-label="Cerrar el editor de lógica"
              >
                <X size={16} />
              </button>
            </div>

            <div className={styles.logicModalBody}>
              <div className={styles.logicGrid}>
                <label className={styles.logicField}>
                  <span className={styles.fieldLabel}>Victoria</span>
                  <input
                    className={styles.logicInput}
                    type="number"
                    value={logicForm.points_for_win}
                    onChange={(event) =>
                      setLogicForm((current) => ({ ...current, points_for_win: Number(event.target.value) }))
                    }
                  />
                </label>

                <label className={styles.logicField}>
                  <span className={styles.fieldLabel}>Empate</span>
                  <input
                    className={styles.logicInput}
                    type="number"
                    value={logicForm.points_for_draw}
                    onChange={(event) =>
                      setLogicForm((current) => ({ ...current, points_for_draw: Number(event.target.value) }))
                    }
                  />
                </label>

                <label className={styles.logicField}>
                  <span className={styles.fieldLabel}>Derrota</span>
                  <input
                    className={styles.logicInput}
                    type="number"
                    value={logicForm.points_for_loss}
                    onChange={(event) =>
                      setLogicForm((current) => ({ ...current, points_for_loss: Number(event.target.value) }))
                    }
                  />
                </label>

                <label className={styles.logicField}>
                  <span className={styles.fieldLabel}>Modo</span>
                  <select
                    className={styles.logicInput}
                    value={logicForm.calculation_mode}
                    onChange={(event) =>
                      setLogicForm((current) => ({
                        ...current,
                        calculation_mode: event.target.value as LogicFormState['calculation_mode'],
                      }))
                    }
                  >
                    <option value="automatic">automatic</option>
                    <option value="manual">manual</option>
                    <option value="hybrid">hybrid</option>
                  </select>
                </label>
              </div>

              <div className={styles.logicToggleCard}>
                <label className={styles.logicToggle}>
                  <input
                    type="checkbox"
                    checked={logicForm.offensive_bonus_rule}
                    onChange={(event) =>
                      setLogicForm((current) => ({ ...current, offensive_bonus_rule: event.target.checked }))
                    }
                  />
                  <span>Bonus ofensivo</span>
                </label>
                {/* Dos reglamentos vivos en rugby: 4+ tries anotados, o 3+ tries
                    más que el rival (3-0, 4-1, 5-2). Cambiar el modo trae el
                    umbral de fábrica del modo; después se puede ajustar. */}
                <select
                  className={styles.logicInput}
                  aria-label="Cómo se mide el bonus ofensivo"
                  value={logicForm.offensive_bonus_mode}
                  disabled={!logicForm.offensive_bonus_rule}
                  onChange={(event) => {
                    const mode = event.target.value === 'difference' ? 'difference' : 'count';
                    setLogicForm((current) => ({
                      ...current,
                      offensive_bonus_mode: mode,
                      offensive_bonus_threshold: DEFAULT_OFFENSIVE_BONUS_THRESHOLD[mode],
                    }));
                  }}
                >
                  <option value="count">tries anotados</option>
                  <option value="difference">tries de diferencia</option>
                </select>
                <input
                  className={styles.logicInput}
                  type="number"
                  min={1}
                  aria-label={
                    logicForm.offensive_bonus_mode === 'difference'
                      ? 'Tries de diferencia para el bonus ofensivo'
                      : 'Tries anotados para el bonus ofensivo'
                  }
                  value={logicForm.offensive_bonus_threshold}
                  disabled={!logicForm.offensive_bonus_rule}
                  onChange={(event) =>
                    setLogicForm((current) => ({
                      ...current,
                      offensive_bonus_threshold: Number(event.target.value) || 1,
                    }))
                  }
                />
              </div>

              <div className={styles.logicToggleCard}>
                <label className={styles.logicToggle}>
                  <input
                    type="checkbox"
                    checked={logicForm.defensive_bonus_rule}
                    onChange={(event) =>
                      setLogicForm((current) => ({ ...current, defensive_bonus_rule: event.target.checked }))
                    }
                  />
                  <span>Bonus defensivo</span>
                </label>
                <input
                  className={styles.logicInput}
                  type="number"
                  min={1}
                  value={logicForm.defensive_bonus_margin}
                  disabled={!logicForm.defensive_bonus_rule}
                  onChange={(event) =>
                    setLogicForm((current) => ({
                      ...current,
                      defensive_bonus_margin: Number(event.target.value) || 1,
                    }))
                  }
                />
              </div>

              <label className={styles.logicToggle}>
                <input
                  type="checkbox"
                  checked={logicForm.editable_mode}
                  onChange={(event) =>
                    setLogicForm((current) => ({ ...current, editable_mode: event.target.checked }))
                  }
                />
                <span>Permitir ajustes manuales en esta fase</span>
              </label>

              {logicSaveError && (
                <div className={styles.logicStateBox}>
                  <span className={styles.logicStateTitle}>No se pudo guardar la lógica</span>
                  <span className={styles.logicStateMessage}>{logicSaveError}</span>
                </div>
              )}
            </div>

            <div className={styles.logicModalActions}>
              <button type="button" className={styles.buttonSecondary} onClick={() => setIsLogicEditorOpen(false)} disabled={isSavingLogic}>
                Cancelar
              </button>
              <button type="button" className={styles.buttonPrimary} onClick={handleSaveLogic} disabled={isSavingLogic || !selectedPhase}>
                {isSavingLogic ? 'Guardando...' : 'Guardar lógica'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
