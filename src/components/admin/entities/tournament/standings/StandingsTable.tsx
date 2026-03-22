'use client';

import { type CSSProperties, type ReactNode } from 'react';
import { normalizeStandingsRules } from './rules';
import styles from './TournamentStandingsTab.module.css';
import type { StandingsRow, StandingsRules, UiLabel } from './types';

type ColumnId =
  | 'played'
  | 'won'
  | 'drawn'
  | 'lost'
  | 'points_for'
  | 'points_against'
  | 'difference'
  | 'bonus_offensive'
  | 'bonus_defensive'
  | 'adjustments'
  | 'total_points'
  | 'form'
  | 'status';

type ActiveColumn = {
  id: ColumnId;
  label: string;
  headerClassName?: string;
  cellClassName?: string;
  render: (row: StandingsRow) => ReactNode;
};

function hasEnabledColumn(
  tableColumns: Record<string, boolean> | null | undefined,
  key: string,
  fallback = true,
) {
  if (!tableColumns) return fallback;
  if (typeof tableColumns[key] === 'boolean') return tableColumns[key];
  return fallback;
}

function hasAnyAdjustments(
  data: StandingsRow[],
  normalizedRules: ReturnType<typeof normalizeStandingsRules>,
) {
  const rowsHaveAdjustments = data.some((row) => (row.adjustments ?? 0) !== 0);
  return rowsHaveAdjustments || normalizedRules.hasAdjustments || normalizedRules.isEditable;
}

function FormPill({ result }: { result: string }) {
  const r = result.toUpperCase();
  const map: Record<string, string> = {
    W: styles.formWin,
    D: styles.formDraw,
    L: styles.formLoss,
  };

  return <span className={`${styles.formPill} ${map[r] || ''}`}>{r}</span>;
}

function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  let toneClass = styles.statusBadgeNeutral;

  if (normalized.includes('clasificado') || normalized.includes('ascenso')) {
    toneClass = styles.statusBadgeSuccess;
  } else if (normalized.includes('zona') || normalized.includes('play')) {
    toneClass = styles.statusBadgeInfo;
  } else if (normalized.includes('riesgo') || normalized.includes('peligro')) {
    toneClass = styles.statusBadgeWarning;
  } else if (normalized.includes('descenso') || normalized.includes('eliminado')) {
    toneClass = styles.statusBadgeDanger;
  }

  return <span className={`${styles.statusBadge} ${toneClass}`}>{status}</span>;
}

function NumericValue({ value }: { value: number }) {
  if (value > 0) return <span className={styles.numericPositive}>+{value}</span>;
  if (value < 0) return <span className={styles.numericNegative}>{value}</span>;
  return <span className={styles.numericNeutral}>0</span>;
}

function hexToRgba(color: string, alpha: number) {
  const normalized = color.trim();
  const hex = normalized.startsWith('#') ? normalized.slice(1) : normalized;

  if (/^[0-9a-f]{3}$/i.test(hex)) {
    const [r, g, b] = hex.split('').map((char) => parseInt(char + char, 16));
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  if (/^[0-9a-f]{6}$/i.test(hex)) {
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  const rgbMatch = normalized.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/i);
  if (rgbMatch) {
    return `rgba(${rgbMatch[1]}, ${rgbMatch[2]}, ${rgbMatch[3]}, ${alpha})`;
  }

  return normalized;
}

function createAccentVars(color: string | null | undefined): CSSProperties | undefined {
  if (!color) return undefined;

  return {
    '--standings-row-accent': color,
    '--standings-row-bg': hexToRgba(color, 0.12),
    '--standings-row-bg-strong': hexToRgba(color, 0.18),
  } as CSSProperties;
}

function getPrimaryLabel(labels: UiLabel[] | undefined): UiLabel | null {
  return labels?.[0] ?? null;
}

function getLabelLookupKeyForRow(row: StandingsRow): string | null {
  if (typeof row.position === 'number') return String(row.position);
  return null;
}

function getCycleTargetKeyForRow(row: StandingsRow): string | null {
  return typeof row.position === 'number' ? String(row.position) : null;
}

function TeamLabelCycleButton({
  label,
  isBusy,
  disabled,
  onClick,
}: {
  label: UiLabel | null;
  isBusy: boolean;
  disabled: boolean;
  onClick?: () => void;
}) {
  const style = label
    ? ({
        '--team-label-accent': label.color,
        '--team-label-bg': hexToRgba(label.color, 0.16),
      } as CSSProperties)
    : undefined;

  return (
    <button
      type="button"
      className={`${styles.teamLabelTrigger} ${!label ? styles.teamLabelTriggerEmpty : ''}`}
      style={style}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClick?.();
      }}
      disabled={disabled}
      title={label ? `Cambiar etiqueta (${label.name})` : 'Asignar etiqueta'}
    >
      <span className={styles.teamLabelTriggerIcon} aria-hidden="true">
        {isBusy ? (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={styles.spinnerIcon}>
            <path d="M12 2a10 10 0 0110 10" />
          </svg>
        ) : (
          <span className={styles.teamLabelTriggerDot} />
        )}
      </span>
      <span className={styles.teamLabelTriggerText}>{label?.name ?? 'Base'}</span>
    </button>
  );
}

function getActiveColumns({
  data,
  tableColumns,
  rules,
}: {
  data: StandingsRow[];
  tableColumns?: Record<string, boolean> | null;
  rules?: StandingsRules | null;
}): ActiveColumn[] {
  const normalizedRules = normalizeStandingsRules(rules);
  const showStatus = hasEnabledColumn(tableColumns, 'classification', false) || data.some((row) => !!row.status);
  const showForm = data.some((row) => Array.isArray(row.form) && row.form.length > 0);
  const showBonusOffensive = normalizedRules.bonusOffensive.active;
  const showBonusDefensive = normalizedRules.bonusDefensive.active;
  const showAdjustments = hasAnyAdjustments(data, normalizedRules);

  const columns: ActiveColumn[] = [];

  if (hasEnabledColumn(tableColumns, 'played')) {
    columns.push({
      id: 'played',
      label: 'PJ',
      cellClassName: styles.cellMono,
      render: (row) => row.played ?? '--',
    });
  }
  if (hasEnabledColumn(tableColumns, 'won')) {
    columns.push({
      id: 'won',
      label: 'PG',
      cellClassName: styles.cellMono,
      render: (row) => row.won ?? '--',
    });
  }
  if (hasEnabledColumn(tableColumns, 'drawn')) {
    columns.push({
      id: 'drawn',
      label: 'PE',
      cellClassName: styles.cellMono,
      render: (row) => row.drawn ?? '--',
    });
  }
  if (hasEnabledColumn(tableColumns, 'lost')) {
    columns.push({
      id: 'lost',
      label: 'PP',
      cellClassName: styles.cellMono,
      render: (row) => row.lost ?? '--',
    });
  }
  if (hasEnabledColumn(tableColumns, 'pointsFor')) {
    columns.push({
      id: 'points_for',
      label: 'PF',
      cellClassName: styles.cellMono,
      render: (row) => row.points_for ?? '--',
    });
  }
  if (hasEnabledColumn(tableColumns, 'pointsAgainst')) {
    columns.push({
      id: 'points_against',
      label: 'PC',
      cellClassName: styles.cellMono,
      render: (row) => row.points_against ?? '--',
    });
  }
  if (hasEnabledColumn(tableColumns, 'pointsDiff')) {
    columns.push({
      id: 'difference',
      label: 'DIF',
      cellClassName: styles.cellMono,
      render: (row) => <NumericValue value={row.difference ?? 0} />,
    });
  }
  if (showBonusOffensive) {
    columns.push({
      id: 'bonus_offensive',
      label: 'BO',
      cellClassName: styles.cellMono,
      render: (row) => row.bonus_offensive ? row.bonus_offensive : <span className={styles.emptyInline}>--</span>,
    });
  }
  if (showBonusDefensive) {
    columns.push({
      id: 'bonus_defensive',
      label: 'BD',
      cellClassName: styles.cellMono,
      render: (row) => row.bonus_defensive ? row.bonus_defensive : <span className={styles.emptyInline}>--</span>,
    });
  }
  if (showAdjustments) {
    columns.push({
      id: 'adjustments',
      label: 'ADJ',
      cellClassName: styles.cellMono,
      render: (row) => (row.adjustments ?? 0) !== 0 ? row.adjustments : <span className={styles.emptyInline}>--</span>,
    });
  }
  if (hasEnabledColumn(tableColumns, 'points')) {
    columns.push({
      id: 'total_points',
      label: 'PTS',
      headerClassName: styles.pointsHeader,
      cellClassName: styles.pointsCell,
      render: (row) => row.total_points ?? '--',
    });
  }
  if (showForm) {
    columns.push({
      id: 'form',
      label: 'Forma',
      render: (row) => (
        <div className={styles.formGroup}>
          {row.form && row.form.length > 0 ? (
            row.form.map((result, index) => <FormPill key={`${row.teamId}-${index}`} result={result} />)
          ) : (
            <span className={styles.emptyInline}>--</span>
          )}
        </div>
      ),
    });
  }
  if (showStatus) {
    columns.push({
      id: 'status',
      label: 'Estado',
      render: (row) => (row.status ? <StatusBadge status={row.status} /> : <span className={styles.emptyInline}>--</span>),
    });
  }

  return columns;
}

function MobileStandingsCards({
  data,
  activeColumns,
  compactMobile,
  labelsMap,
  allLabels,
  onCycleLabel,
  pendingLabelPosition,
}: {
  data: StandingsRow[];
  activeColumns: ActiveColumn[];
  compactMobile?: boolean;
  labelsMap?: Record<string, UiLabel[]>;
  allLabels?: UiLabel[];
  onCycleLabel?: (position: string) => Promise<void> | void;
  pendingLabelPosition?: string | null;
}) {
  const hasForm = activeColumns.some((column) => column.id === 'form');
  const hasLabelControls = !!allLabels?.length && !!onCycleLabel;

  return (
    <div className={styles.mobileCards}>
      {data.map((row, index) => {
        const key = row.teamId || row.team?.id || row.teamName || String(index);
        const labelLookupKey = getLabelLookupKeyForRow(row);
        const cycleTargetKey = getCycleTargetKeyForRow(row);
        const currentLabel = getPrimaryLabel(labelLookupKey ? labelsMap?.[labelLookupKey] : undefined);
        const accentStyle = createAccentVars(currentLabel?.color);
        return (
          <details
            key={key}
            className={`${styles.glassPanel} ${styles.mobileCard} ${accentStyle ? styles.mobileCardTinted : ''}`}
            style={accentStyle}
          >
            <summary className={styles.mobileCardSummary}>
              <div className={styles.mobileCardTop}>
                <div className={styles.mobileRank}>{row.position ?? index + 1}</div>
                <div className={styles.mobileTeamBlock}>
                  <div className={styles.teamIdentity}>
                    {row.team?.logo ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={row.team.logo} alt={row.team.name} className={styles.teamLogo} />
                    ) : (
                      <div className={styles.teamLogoFallback}>LOG</div>
                    )}
                    <div className={styles.mobileTeamText}>
                      <div className={styles.teamNameRow}>
                        <span className={styles.teamName}>{row.team?.name || row.teamName || '--'}</span>
                        {hasLabelControls ? (
                          <TeamLabelCycleButton
                            label={currentLabel}
                            isBusy={pendingLabelPosition === cycleTargetKey}
                            disabled={!cycleTargetKey || !!pendingLabelPosition}
                            onClick={cycleTargetKey ? () => onCycleLabel?.(cycleTargetKey) : undefined}
                          />
                        ) : null}
                      </div>
                      {row.status ? <StatusBadge status={row.status} /> : null}
                    </div>
                  </div>
                </div>
              </div>

              <div className={styles.mobileCompactStats}>
                <div className={styles.mobileCompactStat}>
                  <span className={styles.mobileCompactLabel}>PJ</span>
                  <strong>{row.played ?? '--'}</strong>
                </div>
                <div className={styles.mobileCompactStat}>
                  <span className={styles.mobileCompactLabel}>PTS</span>
                  <strong>{row.total_points ?? '--'}</strong>
                </div>
                {!compactMobile && (
                  <div className={styles.mobileCompactStat}>
                    <span className={styles.mobileCompactLabel}>DIF</span>
                    <strong><NumericValue value={row.difference ?? 0} /></strong>
                  </div>
                )}
                <span className={styles.mobileExpandHint}>Detalle</span>
              </div>
            </summary>

            <div className={styles.mobileDetails}>
              {!compactMobile && (
                <div className={styles.mobileSummaryGrid}>
                  <div className={styles.mobileStat}>
                    <span className={styles.mobileStatLabel}>DIF</span>
                    <span className={styles.mobileStatValue}>
                      <NumericValue value={row.difference ?? 0} />
                    </span>
                  </div>
                </div>
              )}

              {hasForm && row.form && row.form.length > 0 && (
                <div className={styles.mobileFormRow}>
                  {row.form.map((result, resultIndex) => (
                    <FormPill key={`${key}-form-${resultIndex}`} result={result} />
                  ))}
                </div>
              )}

              <div className={styles.mobileDetailsGrid}>
                <div className={styles.mobileStat}>
                  <span className={styles.mobileStatLabel}>PG</span>
                  <span className={styles.mobileStatValue}>{row.won ?? '--'}</span>
                </div>
                <div className={styles.mobileStat}>
                  <span className={styles.mobileStatLabel}>PE</span>
                  <span className={styles.mobileStatValue}>{row.drawn ?? '--'}</span>
                </div>
                <div className={styles.mobileStat}>
                  <span className={styles.mobileStatLabel}>PP</span>
                  <span className={styles.mobileStatValue}>{row.lost ?? '--'}</span>
                </div>
                {activeColumns
                  .filter((column) => !['played', 'won', 'drawn', 'lost', 'difference', 'total_points', 'status', 'form'].includes(column.id))
                  .map((column) => (
                    <div key={`${key}-${column.id}`} className={styles.mobileStat}>
                      <span className={styles.mobileStatLabel}>{column.label}</span>
                      <span className={styles.mobileStatValue}>{column.render(row)}</span>
                    </div>
                  ))}
              </div>
            </div>
          </details>
        );
      })}
    </div>
  );
}

export function StandingsTable({
  data,
  isLoading,
  phaseName,
  groupLabel,
  tableTypeLabel,
  tableColumns,
  rules,
  compactMobile = false,
  labelsMap,
  allLabels,
  onCycleLabel,
  pendingLabelPosition,
}: {
  data: StandingsRow[];
  isLoading: boolean;
  phaseName: string;
  groupLabel: string;
  tableTypeLabel: string;
  tableColumns?: Record<string, boolean> | null;
  rules?: StandingsRules | null;
  compactMobile?: boolean;
  labelsMap?: Record<string, UiLabel[]>;
  allLabels?: UiLabel[];
  onCycleLabel?: (position: string) => Promise<void> | void;
  pendingLabelPosition?: string | null;
}) {
  if (isLoading) {
    return (
      <section className={`${styles.glassPanel} ${styles.tableShell}`}>
        <div className={styles.tableHeader}>
          <div className={styles.skeleton} style={{ height: '24px', width: '200px', marginBottom: '8px' }} />
          <div className={styles.skeleton} style={{ height: '16px', width: '300px' }} />
        </div>
        <div className={styles.tableViewport}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th style={{ width: '50px' }}>&nbsp;</th>
                <th>&nbsp;</th>
                <th colSpan={8}>&nbsp;</th>
              </tr>
            </thead>
            <tbody>
              {[...Array(8)].map((_, i) => (
                <tr key={i} className={styles.row}>
                  <td><div className={styles.skeleton} style={{ height: '20px', width: '20px', margin: '0 auto' }} /></td>
                  <td><div className={styles.skeleton} style={{ height: '20px', width: '150px' }} /></td>
                  {[...Array(6)].map((_, j) => (
                    <td key={j}><div className={styles.skeleton} style={{ height: '20px', width: '30px', margin: '0 auto' }} /></td>
                  ))}
                  <td><div className={styles.skeleton} style={{ height: '20px', width: '40px', margin: '0 auto' }} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    );
  }


  if (!data || data.length === 0) {
    return <div className={styles.emptyState}>No hay participantes o partidos para la combinacion seleccionada.</div>;
  }

  const activeColumns = getActiveColumns({ data, tableColumns, rules });
  const tableMinWidth = 240 + 64 + activeColumns.length * 86;
  const hasLabelControls = !!allLabels?.length && !!onCycleLabel;

  return (
    <section className={`${styles.glassPanel} ${styles.tableShell}`}>
      <div className={styles.tableHeader}>
        <div>
          <h2 className={styles.tableTitle}>Tabla de posiciones de fase</h2>
          <p className={styles.tableSubtitle}>
            Vista operativa de {phaseName}. La tabla mantiene el calculo original y presenta solo las columnas activas
            para esta fase.
          </p>
        </div>

        <div className={styles.tableMeta}>
          <span className={styles.tableMetaPill}>{tableTypeLabel}</span>
          <span className={styles.tableMetaPill}>{groupLabel}</span>
          <span className={styles.tableMetaPill}>{activeColumns.length} columnas</span>
        </div>
      </div>

      <div className={styles.tableViewport}>
        <div className={styles.tableScroll} role="region" aria-label="Tabla de posiciones" tabIndex={0}>
          <table className={styles.table} style={{ minWidth: `${tableMinWidth}px` }}>
            <thead>
              <tr>
                <th className={`${styles.thCenter} ${styles.stickyPosHeader}`} style={{ zIndex: 40 }}>
                  Pos
                </th>
                <th className={`${styles.thLeft} ${styles.stickyTeamHeader}`} style={{ zIndex: 40 }}>
                  Equipo
                </th>
                {activeColumns.map((column) => (
                  <th
                    key={column.id}
                    className={`${styles.thCenter} ${column.headerClassName || ''}`}
                    style={{ zIndex: 30 }}
                  >
                    {column.label}
                  </th>
                ))}
                <th className={styles.thRight} style={{ zIndex: 30 }}>
                  {' '}
                </th>
              </tr>
            </thead>

            <tbody>
              {data.map((row, index) => {
                const rowKey = row.teamId || row.team?.id || row.teamName || String(index);
                const labelLookupKey = getLabelLookupKeyForRow(row);
                const cycleTargetKey = getCycleTargetKeyForRow(row);
                const currentLabel = getPrimaryLabel(labelLookupKey ? labelsMap?.[labelLookupKey] : undefined);
                const accentStyle = createAccentVars(currentLabel?.color);
                return (
                  <tr
                    key={rowKey}
                    className={`${styles.row} ${accentStyle ? styles.rowTinted : ''}`}
                    style={accentStyle}
                  >
                    <td className={`${styles.stickyPos} ${styles.cellMono} ${accentStyle ? styles.stickyCellTinted : ''}`} style={{ zIndex: 20 }}>
                      {row.position ?? index + 1}
                    </td>

                    <td className={`${styles.stickyTeam} ${accentStyle ? styles.stickyCellTinted : ''}`} style={{ zIndex: 20 }}>
                      <div className={styles.teamIdentity}>
                        {row.team?.logo ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img src={row.team.logo} alt={row.team.name} className={styles.teamLogo} />
                        ) : (
                          <div className={styles.teamLogoFallback}>LOG</div>
                        )}
                        <div className={styles.teamNameBlock}>
                          <div className={styles.teamNameRow}>
                            <span className={styles.teamName}>{row.team?.name || row.teamName || '--'}</span>
                            {hasLabelControls ? (
                              <TeamLabelCycleButton
                                label={currentLabel}
                                isBusy={pendingLabelPosition === cycleTargetKey}
                                disabled={!cycleTargetKey || !!pendingLabelPosition}
                                onClick={cycleTargetKey ? () => onCycleLabel?.(cycleTargetKey) : undefined}
                              />
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </td>

                    {activeColumns.map((column) => (
                      <td key={`${rowKey}-${column.id}`} className={column.cellClassName || ''}>
                        {column.render(row)}
                      </td>
                    ))}

                    <td className={styles.actionCell} style={{ position: 'relative' }}>
                      <button type="button" className={styles.iconButton} title="Ver detalles">
                        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="1" />
                          <circle cx="19" cy="12" r="1" />
                          <circle cx="5" cy="12" r="1" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <MobileStandingsCards
        data={data}
        activeColumns={activeColumns}
        compactMobile={compactMobile}
        labelsMap={labelsMap}
        allLabels={allLabels}
        onCycleLabel={onCycleLabel}
        pendingLabelPosition={pendingLabelPosition}
      />
    </section>
  );
}
