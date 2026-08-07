'use client';

import { type CSSProperties, type ReactNode, useMemo } from 'react';
import { normalizeStandingsRules } from './rules';
import { buildTeamLogoProxyUrl } from '@/lib/utils/logoUrl';
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

const TIEBREAKER_METRIC_TO_COLUMN: Record<string, ColumnId> = {
  pointsDiff: 'difference',
  pointsDifference: 'difference',
  points_difference: 'difference',
  points_diff: 'difference',
  pointsFor: 'points_for',
  scored: 'points_for',
  points_for: 'points_for',
  pointsAgainst: 'points_against',
  points_against: 'points_against',
  won: 'won',
  wins: 'won',
  lost: 'lost',
  losses: 'lost',
  drawn: 'drawn',
  draws: 'drawn',
  bonusOffensive: 'bonus_offensive',
  bonus_offensive: 'bonus_offensive',
  bonusDefensive: 'bonus_defensive',
  bonus_defensive: 'bonus_defensive',
  points: 'total_points',
  total_points: 'total_points',
};

type ActiveColumn = {
  id: ColumnId;
  label: string;
  headerClassName?: string;
  cellClassName?: string;
  render: (row: StandingsRow) => ReactNode;
};

type TiebreakerDescriptor = {
  key?: string;
  metric?: string;
  priority?: number;
  enabled?: boolean;
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

/**
 * El color de la etiqueta marca la LÍNEA DE CORTE, no pinta el renglón.
 *
 * Antes esto emitía además un fondo al 12% (y al 18% en hover) con el color de
 * la etiqueta. Con cuatro clasificados sobre ocho equipos, media tabla quedaba
 * teñida y el color perdía su trabajo: si todo está marcado, nada está marcado.
 * El filete de 3px del borde izquierdo —que sale del mismo `--standings-row-accent`—
 * ya dice quién clasifica, y el chip de la etiqueta sigue mostrando su color.
 *
 * Se emite sólo el acento: el fondo se resuelve por CSS con el hover neutro de
 * la tabla. Iba inline, así que no alcanzaba con una regla en la hoja — un
 * estilo inline le gana a cualquier selector.
 */
function createAccentVars(color: string | null | undefined): CSSProperties | undefined {
  if (!color) return undefined;

  return {
    '--standings-row-accent': color,
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
      /* En el teléfono, sin etiqueta, la ficha se queda sólo con el punto: el
         rótulo visible desaparece y el nombre accesible tiene que venir de
         acá. `title` alcanzaría como último recurso, pero no todos los
         lectores de pantalla lo anuncian. */
      aria-label={label ? `Cambiar etiqueta (actual: ${label.name})` : 'Asignar etiqueta'}
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

/**
 * El escudo del club, siempre por el proxy.
 *
 * Acá había un `<div>LOG</div>` de respaldo: tres letras en una caja cuando la
 * fila no traía logo. Es exactamente lo que el proyecto no hace —los equipos van
 * con su escudo real, nunca con iniciales— y encima el camino "bueno" servía el
 * `stats.team_logo` del JSONB, que suele ser un data URI en base64 de decenas de
 * kilobytes repetido en cada fila.
 *
 * `buildTeamLogoProxyUrl` resuelve por id de club contra el proxy, que tiene
 * caché y cache-busting; el `team_logo` guardado entra sólo como `fallback`, y
 * el propio helper lo descarta si es un base64 gigante. Cuando no hay id no hay
 * nada honesto que dibujar, así que se deja el hueco: el nombre del club está al
 * lado y el `alt` vacío evita que un lector de pantalla lo repita.
 */
function TeamCrest({ row }: { row: StandingsRow }) {
  const teamId = row.teamId || row.team?.id || null;
  const teamName = row.team?.name || row.teamName || null;
  const src = buildTeamLogoProxyUrl({
    key: teamId,
    name: teamName,
    fallback: row.team?.logo ?? null,
  });

  if (!src) {
    return <span className={styles.teamLogoFallback} aria-hidden="true" />;
  }

  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img src={src} alt="" loading="lazy" className={styles.teamLogo} />
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

export function StandingsTable({
  data,
  isLoading,
  phaseName,
  groupLabel,
  tableTypeLabel,
  tableColumns,
  rules,
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
  /*
    `compactMobile` se fue junto con las tarjetas de mobile: era su único
    consumidor. La tabla es la misma en todos los anchos —lo que cambia es qué
    columnas se anclan y cuánto se arrastra—, así que no necesita saber si está
    en un teléfono.
  */
  labelsMap?: Record<string, UiLabel[]>;
  allLabels?: UiLabel[];
  onCycleLabel?: (target: { position: string }) => Promise<void> | void;
  pendingLabelPosition?: string | null;
}) {
  /**
   * Va ARRIBA de los dos returns tempranos, no abajo. Estaba después del
   * `if (isLoading)` y del early return de tabla vacía, así que la cantidad de
   * hooks del componente cambiaba entre renders — que es precisamente lo que
   * denunciaba el `eslint-disable rules-of-hooks` que había acá. Silenciar la
   * regla no arreglaba nada: React empareja los hooks por orden de llamada.
   *
   * Mapa columnId → prioridad, para marcar en el encabezado qué columnas
   * desempatan y en qué orden.
   */
  const tiebreakerColumnMap = useMemo(() => {
    const map: Partial<Record<ColumnId, number>> = {};
    const tbs = rules?.tiebreakers ?? [];
    const sorted = [...tbs]
      .filter((tb) => typeof tb === 'string' || (tb as TiebreakerDescriptor).enabled !== false)
      .sort((a, b) => {
        const leftPriority = typeof a === 'string' ? 0 : ((a as TiebreakerDescriptor).priority ?? 0);
        const rightPriority = typeof b === 'string' ? 0 : ((b as TiebreakerDescriptor).priority ?? 0);
        return leftPriority - rightPriority;
      });
    sorted.forEach((tb, idx) => {
      const descriptor = typeof tb === 'string' ? null : (tb as TiebreakerDescriptor);
      const key = typeof tb === 'string' ? tb : (descriptor?.key || descriptor?.metric || '');
      const colId = TIEBREAKER_METRIC_TO_COLUMN[key];
      if (colId && !(colId in map)) map[colId] = idx + 1;
    });
    return map;
  }, [rules?.tiebreakers]);

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
                    <span className={styles.thLabel}>{column.label}</span>
                    {tiebreakerColumnMap[column.id] !== undefined && (
                      <span
                        className={styles.tiebreakerBadge}
                        title={`Criterio de desempate #${tiebreakerColumnMap[column.id]}`}
                      >
                        {tiebreakerColumnMap[column.id]}
                      </span>
                    )}
                  </th>
                ))}
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
                        <TeamCrest row={row} />
                        <div className={styles.teamNameBlock}>
                          <div className={styles.teamNameRow}>
                            <span className={styles.teamName}>{row.team?.name || row.teamName || '--'}</span>
                            {hasLabelControls ? (
                              <TeamLabelCycleButton
                                label={currentLabel}
                                isBusy={pendingLabelPosition === cycleTargetKey}
                                disabled={!cycleTargetKey || !!pendingLabelPosition}
                                onClick={cycleTargetKey ? () => onCycleLabel?.({ position: cycleTargetKey }) : undefined}
                              />
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/*
                      Acá había una tercera celda con un botón de tres puntos y
                      el título "Ver detalles" que NO tenía `onClick`: no hacía
                      nada, en ninguna fila, desde siempre. Un control que no
                      responde es peor que uno que no está — se sale a buscarlo
                      con el teclado y devuelve silencio. Vuelve cuando tenga un
                      desglose que valga la pena mostrar.
                    */}
                    {activeColumns.map((column) => (
                      <td key={`${rowKey}-${column.id}`} className={column.cellClassName || ''}>
                        {column.render(row)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
