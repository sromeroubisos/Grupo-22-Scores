'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import type { LocalPlayerStatsRow } from '@/lib/localMatchData';
import {
  type PlayerMetricSortDirection,
  type PlayerStatsTableRow,
  formatPlayerMetricValue,
  getPlayerMetricMeta,
  parseNumericStat,
} from '@/lib/playerStats';

import styles from './page.module.css';

export type PlayerStatsTableData = {
  rows: PlayerStatsTableRow[];
  metricIds: string[];
  metricLabels: Record<string, string>;
};

function chooseDefaultPlayerMetrics(metricIds: string[]) {
  const preferred = [
    'points',
    'conversionRate',
    'minutes',
    'tries',
    'assists',
    'rating',
    'tackles',
    'conversionsMade',
    'yellowCards',
    'redCards',
    'events',
    'matchesPlayed',
  ];
  const selected: string[] = [];
  preferred.forEach((metricId) => {
    if (metricIds.includes(metricId) && !selected.includes(metricId) && selected.length < 3) {
      selected.push(metricId);
    }
  });
  metricIds.forEach((metricId) => {
    if (!selected.includes(metricId) && selected.length < 3) {
      selected.push(metricId);
    }
  });
  return selected;
}

function comparePlayerMetricValues(
  left: PlayerStatsTableRow,
  right: PlayerStatsTableRow,
  metricSorts: Array<{ metricId: string; direction: PlayerMetricSortDirection }>,
  primarySortIndex: number,
) {
  const prioritizedSorts = metricSorts.length === 0
    ? []
    : [
        metricSorts[Math.max(0, Math.min(primarySortIndex, metricSorts.length - 1))],
        ...metricSorts.filter((_, index) => index !== Math.max(0, Math.min(primarySortIndex, metricSorts.length - 1))),
      ];

  for (const metricSort of prioritizedSorts) {
    const { metricId, direction } = metricSort;
    const leftValue = parseNumericStat(left.metrics[metricId]) ?? Number.NEGATIVE_INFINITY;
    const rightValue = parseNumericStat(right.metrics[metricId]) ?? Number.NEGATIVE_INFINITY;
    if (rightValue !== leftValue) {
      return direction === 'asc' ? leftValue - rightValue : rightValue - leftValue;
    }
  }

  const leftRating = typeof left.rating === 'number' ? left.rating : Number.NEGATIVE_INFINITY;
  const rightRating = typeof right.rating === 'number' ? right.rating : Number.NEGATIVE_INFINITY;
  if (rightRating !== leftRating) return rightRating - leftRating;
  return left.name.localeCompare(right.name, 'es');
}

type Props = {
  tableData: PlayerStatsTableData;
  localPlayerRows: LocalPlayerStatsRow[];
  playerStats: any;
  homeName: string;
  awayName: string;
};

export default function PlayerStatsPanel({ tableData, localPlayerRows, playerStats, homeName, awayName }: Props) {
  const availableMetricIds = tableData.metricIds;

  const [selectedMetrics, setSelectedMetrics] = useState<string[]>(() => {
    if (availableMetricIds.length === 0) return [];
    const defaults = chooseDefaultPlayerMetrics(availableMetricIds);
    const next: string[] = [];
    defaults.forEach((id) => {
      if (!next.includes(id) && next.length < 3) next.push(id);
    });
    availableMetricIds.forEach((id) => {
      if (!next.includes(id) && next.length < 3) next.push(id);
    });
    return next.slice(0, Math.min(3, availableMetricIds.length));
  });

  const [metricOrders, setMetricOrders] = useState<PlayerMetricSortDirection[]>(['desc', 'desc', 'desc']);
  const [activeSortSlot, setActiveSortSlot] = useState(0);
  const [showConfig, setShowConfig] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTeam, setFilterTeam] = useState<'all' | 'home' | 'away'>('all');
  const [filterPosition, setFilterPosition] = useState('all');
  const [topN, setTopN] = useState<'all' | 5 | 10 | 20>('all');

  const displayedMetrics = selectedMetrics.length > 0 ? selectedMetrics : chooseDefaultPlayerMetrics(availableMetricIds);
  const displayedSorts = displayedMetrics.map((metricId, index) => ({
    metricId,
    direction: metricOrders[index] || 'desc',
  }));

  const sortedRows = useMemo(() => {
    if (tableData.rows.length === 0) return [];
    return [...tableData.rows].sort((a, b) => comparePlayerMetricValues(a, b, displayedSorts, activeSortSlot));
  }, [tableData.rows, displayedSorts, activeSortSlot]);

  const allPositions = useMemo(() => {
    const set = new Set<string>();
    sortedRows.forEach((p) => {
      if (p.position && p.position !== '—') set.add(p.position);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'es'));
  }, [sortedRows]);

  const filteredRows = useMemo(() => {
    let rows = [...sortedRows];
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      rows = rows.filter((p) => p.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(q));
    }
    if (filterTeam !== 'all') rows = rows.filter((p) => p.team === filterTeam);
    if (filterPosition !== 'all') rows = rows.filter((p) => p.position === filterPosition);
    if (topN !== 'all') rows = rows.slice(0, topN);
    return rows;
  }, [sortedRows, searchQuery, filterTeam, filterPosition, topN]);

  const activeMetricId = displayedMetrics[activeSortSlot] || displayedMetrics[0];
  const activeMetricMeta = activeMetricId
    ? getPlayerMetricMeta(activeMetricId, tableData.metricLabels[activeMetricId])
    : null;
  const activeDirection = displayedSorts[activeSortSlot]?.direction || 'desc';
  const topScorer = sortedRows[0];

  const metricMaxValues = useMemo(() => {
    const maxes: Record<string, number> = {};
    displayedMetrics.forEach((metricId) => {
      const values = filteredRows.map((r) => parseNumericStat(r.metrics[metricId]) ?? 0);
      maxes[metricId] = Math.max(...values, 0.0001);
    });
    return maxes;
  }, [filteredRows, displayedMetrics]);

  const handleMetricChange = (slotIndex: number, nextMetricId: string) => {
    setSelectedMetrics((current) => {
      const next = [...current];
      const duplicateIndex = next.findIndex((id, i) => id === nextMetricId && i !== slotIndex);
      if (duplicateIndex >= 0) {
        next[duplicateIndex] = next[slotIndex];
      }
      next[slotIndex] = nextMetricId;
      return next;
    });
  };

  const handleOrderChange = (slotIndex: number, direction: PlayerMetricSortDirection) => {
    setMetricOrders((current) => {
      const next = [...current];
      next[slotIndex] = direction;
      return next;
    });
  };

  const slotLabels = ['Métrica principal', 'Métrica secundaria', 'Métrica terciaria'];

  if (tableData.rows.length === 0) {
    if (localPlayerRows.length > 0) {
      return (
        <div className={styles.playersStatsView}>
          <div className={styles.panelTitle}>Estadísticas de Jugadores</div>
          <div style={{ display: 'grid', gap: '12px' }}>
            {localPlayerRows.map((player) => (
              <div key={player.key} className={styles.playerStatRow} style={{ padding: '14px 16px', display: 'grid', gridTemplateColumns: '1fr auto', gap: '12px', alignItems: 'center' }}>
                <div style={{ display: 'grid', gap: '4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <strong>
                      {player.playerId ? (
                        <Link href={`/players/${player.playerId}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                          {player.name}
                        </Link>
                      ) : (
                        player.name
                      )}
                    </strong>
                    {player.number != null && <span className={styles.playerNumber}>#{player.number}</span>}
                    {player.isCaptain && <span className={styles.positionBadge}>Cap.</span>}
                  </div>
                  <div style={{ fontSize: '12px', opacity: 0.72 }}>
                    {player.teamName}{player.position ? ` · ${player.position}` : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {typeof player.rating === 'number' && <span className={styles.playerRatingMeta}>Puntaje {player.rating.toFixed(1)}</span>}
                  <span className={styles.positionBadge}>Pts {player.points}</span>
                  <span className={styles.positionBadge}>Tries {player.tries}</span>
                  <span className={styles.positionBadge}>YC {player.yellowCards}</span>
                  <span className={styles.positionBadge}>RC {player.redCards}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (playerStats?.stat_groups && playerStats.stat_groups.length > 0) {
      return (
        <div className={styles.playersStatsView}>
          <div className={styles.panelTitle}>Estadísticas de Jugadores</div>
          {playerStats.stat_groups.map((group: any, i: number) => (
            group && group.stats && Array.isArray(group.stats) && (
              <div key={i} style={{ marginBottom: '24px' }}>
                <div style={{ fontSize: '12px', color: 'var(--accent)', textTransform: 'uppercase', marginBottom: '12px', fontWeight: '800' }}>{group.group_name}</div>
                <div className={styles.playerStatsGrid}>
                  {group.stats.map((s: any, j: number) => (
                    <div key={j} className={styles.playerStatRow}>
                      <div className={styles.playerStatHome}>
                        {s.home_team && (() => {
                          const homePlayerName = playerStats.players?.find((p: any) => p.player_id === s.home_team.player_id)?.player_name || 'Jugador';
                          return (
                            <>
                              <span className={styles.playerStatName}>
                                {s.home_team.player_id ? <Link href={`/players/${s.home_team.player_id}`} style={{ color: 'inherit', textDecoration: 'none' }}>{homePlayerName}</Link> : homePlayerName}
                              </span>
                              <span className={styles.playerStatVal}>{s.home_team.value}</span>
                            </>
                          );
                        })()}
                      </div>
                      <div className={styles.playerStatLabel}>{s.name}</div>
                      <div className={styles.playerStatAway}>
                        {s.away_team && (() => {
                          const awayPlayerName = playerStats.players?.find((p: any) => p.player_id === s.away_team.player_id)?.player_name || 'Jugador';
                          return (
                            <>
                              <span className={styles.playerStatVal}>{s.away_team.value}</span>
                              <span className={styles.playerStatName}>
                                {s.away_team.player_id ? <Link href={`/players/${s.away_team.player_id}`} style={{ color: 'inherit', textDecoration: 'none' }}>{awayPlayerName}</Link> : awayPlayerName}
                              </span>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          ))}
        </div>
      );
    }

    return (
      <div className={styles.playersStatsView}>
        <div className={styles.panelTitle}>Estadísticas de Jugadores</div>
        <div className={styles.emptyState}>
          <div style={{ fontSize: '40px', marginBottom: '16px', opacity: 0.3 }}>🏃‍♂️</div>
          <p className={styles.placeholderText} style={{ fontSize: '16px', fontWeight: '600' }}>Estadísticas de jugadores no registradas</p>
          <p style={{ fontSize: '13px', opacity: 0.5 }}>No se dispone de datos individuales para este encuentro.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.playersStatsView}>
      <div className={styles.panelTitle}>Estadísticas de Jugadores</div>
      <p className={styles.playerStatsSubtitle}>Compara y ordena jugadores por métricas clave</p>

      {/* Barra de acciones */}
      <div className={styles.playerStatsHeaderBar}>
        <div className={styles.playerStatsSearchWrap}>
          <input
            type="text"
            placeholder="Buscar jugador..."
            className={styles.playerStatsSearch}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className={styles.playerStatsHeaderActions}>
          <button
            type="button"
            className={`${styles.playerStatsConfigBtn} ${showConfig ? styles.playerStatsConfigBtnActive : ''}`}
            onClick={() => setShowConfig((v) => !v)}
          >
            {showConfig ? 'Cerrar personalización' : 'Personalizar tabla'}
          </button>
        </div>
      </div>

      {/* Panel de configuración */}
      {showConfig && (
        <div className={styles.playerMetricsToolbarCompact}>
          <div className={styles.playerMetricsToolbarHeader}>
            <span className={styles.playerMetricsEyebrow}>Configuración de tabla</span>
            <button
              type="button"
              className={styles.playerMetricsResetBtn}
              onClick={() => {
                setSelectedMetrics(chooseDefaultPlayerMetrics(availableMetricIds));
                setMetricOrders(['desc', 'desc', 'desc']);
                setActiveSortSlot(0);
                setSearchQuery('');
                setFilterTeam('all');
                setFilterPosition('all');
                setTopN('all');
              }}
            >
              Reset
            </button>
          </div>
          <div className={styles.playerMetricSelectorsCompact}>
            {displayedMetrics.map((metricId, index) => {
              const sortDirection = displayedSorts[index]?.direction || 'desc';
              const isActiveSort = activeSortSlot === index;
              return (
                <div key={`${metricId}-${index}`} className={styles.playerMetricSelectWrapCompact}>
                  <span className={styles.playerMetricSelectLabel}>{slotLabels[index] || `Columna ${index + 1}`}</span>
                  <div className={styles.playerMetricSelectRow}>
                    <select
                      className={styles.playerMetricSelect}
                      value={metricId}
                      onChange={(e) => handleMetricChange(index, e.target.value)}
                    >
                      {availableMetricIds.map((optionId) => {
                        const optionMeta = getPlayerMetricMeta(optionId, tableData.metricLabels[optionId]);
                        return (
                          <option key={optionId} value={optionId}>
                            {optionMeta.label}
                          </option>
                        );
                      })}
                    </select>
                    <button
                      type="button"
                      className={`${styles.playerMetricOrderToggle} ${sortDirection === 'asc' ? styles.playerMetricOrderToggleAsc : ''}`}
                      onClick={() => handleOrderChange(index, sortDirection === 'desc' ? 'asc' : 'desc')}
                      title={sortDirection === 'desc' ? 'Descendente' : 'Ascendente'}
                    >
                      {sortDirection === 'desc' ? '↓' : '↑'}
                    </button>
                  </div>
                  <label className={styles.playerMetricSortRadio}>
                    <input
                      type="radio"
                      name="primarySort"
                      checked={isActiveSort}
                      onChange={() => setActiveSortSlot(index)}
                    />
                    <span>{isActiveSort ? '● Orden principal' : '○ Orden principal'}</span>
                  </label>
                </div>
              );
            })}
          </div>
          <div className={styles.playerStatsQuickFilters}>
            <label className={styles.playerStatsFilter}>
              <span>Equipo</span>
              <select value={filterTeam} onChange={(e) => setFilterTeam(e.target.value as 'all' | 'home' | 'away')}>
                <option value="all">Todos</option>
                <option value="home">{homeName}</option>
                <option value="away">{awayName}</option>
              </select>
            </label>
            <label className={styles.playerStatsFilter}>
              <span>Posición</span>
              <select value={filterPosition} onChange={(e) => setFilterPosition(e.target.value)}>
                <option value="all">Todas</option>
                {allPositions.map((pos) => (
                  <option key={pos} value={pos}>
                    {pos}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.playerStatsFilter}>
              <span>Top N</span>
              <select value={topN} onChange={(e) => setTopN(e.target.value === 'all' ? 'all' : (Number(e.target.value) as 5 | 10 | 20))}>
                <option value="all">Todos</option>
                <option value="5">Top 5</option>
                <option value="10">Top 10</option>
                <option value="20">Top 20</option>
              </select>
            </label>
          </div>
        </div>
      )}

      {/* Resumen rápido */}
      <div className={styles.playerStatsSummaryBar}>
        <span className={styles.playerStatsSummaryItem}>
          <strong>{filteredRows.length}</strong> jugadores
        </span>
        {topScorer && (
          <span className={styles.playerStatsSummaryItem}>
            Máximo anotador: <strong>{topScorer.name}</strong> ({formatPlayerMetricValue('points', topScorer.metrics.points, 'Puntos')})
          </span>
        )}
        {activeMetricMeta && (
          <span className={`${styles.playerStatsSummaryItem} ${styles.playerStatsSummaryHighlight}`}>
            Ordenado por: <strong>{activeMetricMeta.label}</strong> ({activeDirection === 'desc' ? 'Descendente' : 'Ascendente'})
          </span>
        )}
        {filterTeam !== 'all' && (
          <span className={styles.playerStatsSummaryItem}>Equipo: {filterTeam === 'home' ? homeName : awayName}</span>
        )}
        {filterPosition !== 'all' && <span className={styles.playerStatsSummaryItem}>Posición: {filterPosition}</span>}
        {topN !== 'all' && <span className={styles.playerStatsSummaryItem}>Top {topN}</span>}
      </div>

      {/* Tabla desktop/tablet */}
      <div className={styles.playerStatsTableWrapEnhanced}>
        <table className={styles.playerStatsTableEnhanced}>
          <thead>
            <tr>
              <th className={styles.playerStatsColPlayer}>Jugador</th>
              <th className={styles.playerStatsColTeam}>Equipo</th>
              {displayedMetrics.map((metricId, metricIndex) => {
                const metricMeta = getPlayerMetricMeta(metricId, tableData.metricLabels[metricId]);
                const isActiveSort = activeSortSlot === metricIndex;
                return (
                  <th
                    key={metricId}
                    className={`${styles.playerStatsColMetric} ${isActiveSort ? styles.playerStatsColMetricActive : ''}`}
                  >
                    <button
                      type="button"
                      className={styles.playerStatsHeaderButtonEnhanced}
                      onClick={() => setActiveSortSlot(metricIndex)}
                    >
                      <span>{metricMeta.shortLabel}</span>
                      {isActiveSort && (
                        <span className={styles.playerStatsHeaderArrow}>
                          {activeDirection === 'desc' ? '↓' : '↑'}
                        </span>
                      )}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((player, rowIndex) => (
              <tr key={player.key} className={rowIndex % 2 === 1 ? styles.playerStatsRowZebra : undefined}>
                <td className={styles.playerStatsColPlayer}>
                  <div className={styles.playerStatsNameWrapEnhanced}>
                    <div className={styles.playerStatsPrimaryEnhanced}>
                      {player.playerId ? (
                        <Link href={`/players/${player.playerId}`} className={styles.playerStatsNameLink}>
                          {player.name}
                        </Link>
                      ) : (
                        <span>{player.name}</span>
                      )}
                      {player.isCaptain && <span className={styles.playerStatsBadgeCaptain}>C</span>}
                    </div>
                    <div className={styles.playerStatsSecondaryEnhanced}>
                      {player.position ? player.position : 'Sin posición'}
                      {player.number != null && ` · #${player.number}`}
                    </div>
                  </div>
                </td>
                <td className={styles.playerStatsColTeam}>
                  <span
                    className={`${styles.playerStatsTeamTagEnhanced} ${
                      player.team === 'home'
                        ? styles.teamTagHome
                        : player.team === 'away'
                        ? styles.teamTagAway
                        : ''
                    }`}
                  >
                    {player.teamName}
                  </span>
                </td>
                {displayedMetrics.map((metricId, metricIndex) => {
                  const value = formatPlayerMetricValue(metricId, player.metrics[metricId], tableData.metricLabels[metricId]);
                  const numericValue = parseNumericStat(player.metrics[metricId]) ?? 0;
                  const max = metricMaxValues[metricId] || 1;
                  const pct = max > 0 ? (numericValue / max) * 100 : 0;
                  const isActiveSort = activeSortSlot === metricIndex;
                  return (
                    <td
                      key={`${player.key}-${metricId}`}
                      className={`${styles.playerStatsColMetric} ${
                        isActiveSort ? styles.playerStatsCellMetricActive : ''
                      }`}
                    >
                      <div className={styles.metricValueWrap}>
                        <span className={styles.metricValue}>{value}</span>
                        {pct > 0 && (
                          <div className={styles.metricBarTrack}>
                            <div className={styles.metricBarFill} style={{ width: `${pct}%` }} />
                          </div>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Vista mobile: cards */}
      <div className={styles.playerStatsCardsMobile}>
        {filteredRows.map((player) => (
          <div key={player.key} className={styles.playerStatsCard}>
            <div className={styles.playerStatsCardHeader}>
              <div className={styles.playerStatsCardNameWrap}>
                <span className={styles.playerStatsCardName}>
                  {player.playerId ? (
                    <Link href={`/players/${player.playerId}`} className={styles.playerStatsNameLink}>
                      {player.name}
                    </Link>
                  ) : (
                    player.name
                  )}
                </span>
                {player.isCaptain && <span className={styles.playerStatsBadgeCaptain}>C</span>}
              </div>
              <div className={styles.playerStatsCardMeta}>
                {player.position ? player.position : 'Sin posición'}
                {player.number != null && ` · #${player.number}`}
              </div>
            </div>
            <div className={styles.playerStatsCardTeamWrap}>
              <span
                className={`${styles.playerStatsTeamTagEnhanced} ${
                  player.team === 'home'
                    ? styles.teamTagHome
                    : player.team === 'away'
                    ? styles.teamTagAway
                    : ''
                }`}
              >
                {player.teamName}
              </span>
            </div>
            <div className={styles.playerStatsCardMetrics}>
              {displayedMetrics.map((metricId, metricIndex) => {
                const metricMeta = getPlayerMetricMeta(metricId, tableData.metricLabels[metricId]);
                const value = formatPlayerMetricValue(metricId, player.metrics[metricId], tableData.metricLabels[metricId]);
                const numericValue = parseNumericStat(player.metrics[metricId]) ?? 0;
                const max = metricMaxValues[metricId] || 1;
                const pct = max > 0 ? (numericValue / max) * 100 : 0;
                const isActiveSort = activeSortSlot === metricIndex;
                return (
                  <div
                    key={`${player.key}-${metricId}`}
                    className={`${styles.playerStatsCardMetric} ${
                      isActiveSort ? styles.playerStatsCardMetricActive : ''
                    }`}
                  >
                    <div className={styles.cardMetricTop}>
                      <span className={styles.cardMetricLabel}>{metricMeta.shortLabel}</span>
                      {isActiveSort && (
                        <span className={styles.cardMetricArrow}>
                          {activeDirection === 'desc' ? '↓' : '↑'}
                        </span>
                      )}
                    </div>
                    <div className={styles.cardMetricValueWrap}>
                      <span className={styles.cardMetricValue}>{value}</span>
                      {pct > 0 && (
                        <div className={styles.metricBarTrack}>
                          <div className={styles.metricBarFill} style={{ width: `${pct}%` }} />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
