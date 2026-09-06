'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import type { LocalPlayerStatsRow } from '@/lib/localMatchData';
import {
  type PlayerMetricSortDirection,
  type PlayerStatsTableRow,
  chooseDefaultPlayerMetrics,
  comparePlayerMetricValues,
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

/** El valor de una metrica como numero, con el 0 explicito. */
function metricNumber(row: PlayerStatsTableRow, metricId: string) {
  return parseNumericStat(row.metrics[metricId]) ?? 0;
}

/**
 * El escalon de color de una chapa de metrica.
 *
 * El color se calcula contra el MAXIMO DE LA COLUMNA y no contra un umbral
 * absoluto, porque estas metricas no son puntajes: 3 tackles puede ser el techo
 * de un partido y el ultimo puesto de otro. Es la misma lectura que hacia la
 * micro-barra que habia antes, dibujada como chapa.
 *
 * Cuatro escalones y no un degrade continuo: cuarenta verdes apenas distintos
 * no son una escala, son ruido. Asi cada escalon es un color que se puede
 * nombrar y la tabla se lee de un vistazo.
 *
 * El valor sigue escrito en la chapa: el color refuerza, nunca es el unico
 * portador del dato.
 */
function metricBadgeTier(pct: number, value: number) {
  if (value <= 0) return 'metricBadgeZero';
  if (pct >= 100) return 'metricBadgeTop';
  if (pct >= 66) return 'metricBadgeHigh';
  if (pct >= 33) return 'metricBadgeMid';
  return 'metricBadgeLow';
}

/**
 * Un jugador "sin registro" tiene TODAS las metricas mostradas en cero.
 *
 * Se mide contra lo que se muestra y no contra la fila entera a proposito: si
 * la tabla esta ordenada por amarillas, el que no vio ninguna no aporta a esa
 * lectura aunque haya hecho tres goles, y su fila puede plegarse. Es la unica
 * forma de que 36 jugadores de los que anotaron cuatro no sean 36 filas
 * identicas.
 */
function hasAnyRecord(row: PlayerStatsTableRow, metricIds: string[]) {
  return metricIds.some((metricId) => metricNumber(row, metricId) !== 0);
}

/**
 * Puesto dentro del grupo, con los empates compartiendo numero (1, 2, 2, 4).
 * Numerar por indice mentiria: dos jugadores con un gol cada uno no son el
 * primero y el segundo goleador.
 */
function rankRows(rows: PlayerStatsTableRow[], metricId: string) {
  let previousValue: number | null = null;
  let previousRank = 0;

  return rows.map((row, index) => {
    const value = metricId ? metricNumber(row, metricId) : 0;
    const rank = previousValue !== null && value === previousValue ? previousRank : index + 1;
    previousValue = value;
    previousRank = rank;
    return { row, rank };
  });
}

type Props = {
  tableData: PlayerStatsTableData;
  localPlayerRows: LocalPlayerStatsRow[];
  playerStats: any;
  homeName: string;
  awayName: string;
  /** Lo que va pegado al titulo: hoy, el boton del puntaje de la gente. */
  titleAction?: React.ReactNode;
};

export default function PlayerStatsPanel({ tableData, localPlayerRows, playerStats, homeName, awayName, titleAction }: Props) {
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

  // Memoizadas porque abajo son dependencia de otros useMemo: construidas
  // inline cambiaban de identidad en cada render y ninguna memo pegaba.
  const displayedMetrics = useMemo(
    () => (selectedMetrics.length > 0 ? selectedMetrics : chooseDefaultPlayerMetrics(availableMetricIds)),
    [selectedMetrics, availableMetricIds],
  );

  const displayedSorts = useMemo(
    () => displayedMetrics.map((metricId, index) => ({
      metricId,
      direction: metricOrders[index] || 'desc',
    })),
    [displayedMetrics, metricOrders],
  );

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

  // La metrica que manda es la que ordena. No hay una metrica "de gol"
  // privilegiada: en hockey manda Goles, en rugby Puntos y en un torneo que
  // configure la suya manda esa, sin tocar una linea de este componente.
  const primaryMetricId = displayedMetrics[activeSortSlot] || displayedMetrics[0] || '';
  const secondaryMetricIds = displayedMetrics.filter((metricId) => metricId !== primaryMetricId);
  const primaryMetricMeta = primaryMetricId
    ? getPlayerMetricMeta(primaryMetricId, tableData.metricLabels[primaryMetricId])
    : null;
  const activeDirection = displayedSorts[activeSortSlot]?.direction || 'desc';

  const metricMaxValues = useMemo(() => {
    const maxes: Record<string, number> = {};
    displayedMetrics.forEach((metricId) => {
      const values = filteredRows.map((r) => metricNumber(r, metricId));
      maxes[metricId] = Math.max(...values, 0.0001);
    });
    return maxes;
  }, [filteredRows, displayedMetrics]);

  /**
   * Metricas cuyo maximo lo tiene UN solo jugador.
   *
   * La estrella marca al lider de la columna, y con empate no hay lider: en un
   * partido de rugby seis jugadores hacen un try cada uno, y seis estrellas no
   * senalan a nadie. Los seis conservan la chapa llena —son el maximo, y eso es
   * cierto—, pero la estrella se apaga.
   */
  const metricLeaderIsUnique = useMemo(() => {
    const unique: Record<string, boolean> = {};
    displayedMetrics.forEach((metricId) => {
      const max = metricMaxValues[metricId];
      const enElTope = filteredRows.filter((r) => metricNumber(r, metricId) === max).length;
      unique[metricId] = enElTope === 1;
    });
    return unique;
  }, [filteredRows, displayedMetrics, metricMaxValues]);

  /**
   * Agrupacion por equipo. Sale del lado del jugador (`home` / `away`), que es
   * dato de partido y no de deporte, asi que el mismo bloque sirve para una
   * final del Mundial de hockey y para una fecha de la URBA.
   */
  const playerGroups = useMemo(() => {
    const buckets = new Map<string, { name: string; side: 'home' | 'away' | null; rows: PlayerStatsTableRow[] }>();

    filteredRows.forEach((row) => {
      const groupId = row.team || 'neutral';
      if (!buckets.has(groupId)) {
        buckets.set(groupId, {
          name: row.teamName || (row.team === 'home' ? homeName : row.team === 'away' ? awayName : 'Sin equipo'),
          side: row.team,
          rows: [],
        });
      }
      buckets.get(groupId)!.rows.push(row);
    });

    return (['home', 'away', 'neutral'] as const)
      .filter((groupId) => buckets.has(groupId))
      .map((groupId) => {
        const bucket = buckets.get(groupId)!;
        const withRecord = bucket.rows.filter((row) => hasAnyRecord(row, displayedMetrics));
        const withoutRecord = bucket.rows.filter((row) => !hasAnyRecord(row, displayedMetrics));
        return {
          id: groupId,
          name: bucket.name,
          side: bucket.side,
          ranked: rankRows(withRecord, primaryMetricId),
          blank: withoutRecord,
          total: bucket.rows.length,
        };
      });
  }, [filteredRows, displayedMetrics, primaryMetricId, homeName, awayName]);

  /**
   * El puntero de la metrica activa. Solo existe si de verdad hay uno: con
   * orden ascendente el primero de la lista es el que MENOS tiene, y en un
   * partido sin goles nadie es el goleador. Antes esto estaba clavado a
   * `points` y en cualquier deporte sin puntos mostraba "(—)".
   */
  const leader = useMemo(() => {
    if (!primaryMetricId || activeDirection !== 'desc') return null;
    const candidate = filteredRows[0];
    if (!candidate) return null;
    if (metricNumber(candidate, primaryMetricId) <= 0) return null;
    return candidate;
  }, [filteredRows, primaryMetricId, activeDirection]);

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
          <div className={styles.panelTitle}>
            <span className={styles.playerStatsTitleGroup}>
              Estadísticas de Jugadores
              {titleAction}
            </span>
          </div>
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
          <div className={styles.panelTitle}>
            <span className={styles.playerStatsTitleGroup}>
              Estadísticas de Jugadores
              {titleAction}
            </span>
          </div>
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
        <div className={styles.panelTitle}>
          <span className={styles.playerStatsTitleGroup}>
            Estadísticas de Jugadores
            {titleAction}
          </span>
        </div>
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
      <div className={styles.panelTitle}>
        <span className={styles.playerStatsTitleGroup}>
          Estadísticas de Jugadores
          {titleAction}
        </span>
      </div>
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
            aria-expanded={showConfig}
            aria-label={showConfig ? 'Cerrar la personalización de la tabla' : 'Personalizar la tabla'}
          >
            <svg
              className={styles.playerStatsConfigIcon}
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M3 7h6M15 7h6M3 17h12M19 17h2" />
              <circle cx="12" cy="7" r="2.5" />
              <circle cx="16" cy="17" r="2.5" />
            </svg>
            <span className={styles.playerStatsConfigLabel}>
              {showConfig ? 'Cerrar personalización' : 'Personalizar tabla'}
            </span>
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
                      aria-label={slotLabels[index] || `Columna ${index + 1}`}
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
                      aria-label={sortDirection === 'desc' ? 'Ordenar de menor a mayor' : 'Ordenar de mayor a menor'}
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

      {/* Resumen: una linea de metadatos, no una caja */}
      <div className={styles.playerStatsSummaryBar}>
        <span className={styles.playerStatsSummaryItem}>
          <strong>{filteredRows.length}</strong> jugadores
        </span>
        {primaryMetricMeta && (
          <span className={`${styles.playerStatsSummaryItem} ${styles.playerStatsSummaryHighlight}`}>
            <strong>{primaryMetricMeta.label}</strong> {activeDirection === 'desc' ? '↓' : '↑'}
          </span>
        )}
        {leader && primaryMetricId && (
          <span className={styles.playerStatsSummaryItem}>
            Líder: <strong>{leader.name}</strong>{' '}
            ({formatPlayerMetricValue(primaryMetricId, leader.metrics[primaryMetricId], tableData.metricLabels[primaryMetricId])})
          </span>
        )}
        {filterTeam !== 'all' && (
          <span className={styles.playerStatsSummaryItem}>Equipo: {filterTeam === 'home' ? homeName : awayName}</span>
        )}
        {filterPosition !== 'all' && <span className={styles.playerStatsSummaryItem}>Posición: {filterPosition}</span>}
        {topN !== 'all' && <span className={styles.playerStatsSummaryItem}>Top {topN}</span>}
      </div>

      {filteredRows.length === 0 && (
        <div className={styles.playerStatsNoMatch}>
          <p className={styles.playerStatsNoMatchTitle}>Ningún jugador coincide con el filtro</p>
          <p className={styles.playerStatsNoMatchHint}>
            {searchQuery.trim() ? `No hay resultados para “${searchQuery.trim()}”.` : 'Probá quitando algún filtro.'}
          </p>
        </div>
      )}

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
                    aria-sort={isActiveSort ? (activeDirection === 'desc' ? 'descending' : 'ascending') : 'none'}
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
                  const numericValue = metricNumber(player, metricId);
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
                      <span
                        className={`${styles.metricBadge} ${styles[metricBadgeTier(pct, numericValue)]}`}
                      >
                        {value}
                        {pct >= 100 && numericValue > 0 && metricLeaderIsUnique[metricId] && (
                          <span className={styles.metricBadgeStar} aria-hidden="true">★</span>
                        )}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Vista mobile: lista densa agrupada por equipo */}
      <div className={styles.playerStatsList}>
        {playerGroups.map((group) => {
          const primaryMax = primaryMetricId ? metricMaxValues[primaryMetricId] || 1 : 1;

          return (
            <section key={group.id} className={styles.pGroup}>
              <header
                className={`${styles.pGroupHeader} ${
                  group.side === 'home'
                    ? styles.pGroupHeaderHome
                    : group.side === 'away'
                    ? styles.pGroupHeaderAway
                    : ''
                }`}
              >
                <span className={styles.pGroupName}>{group.name}</span>
                <span className={styles.pGroupCount}>{group.total}</span>
                {primaryMetricMeta && (
                  <span className={styles.pGroupMetric}>
                    {primaryMetricMeta.shortLabel}
                    <span aria-hidden="true"> {activeDirection === 'desc' ? '↓' : '↑'}</span>
                  </span>
                )}
              </header>

              {group.ranked.length > 0 && (
                <ol className={styles.pRows} aria-label={`Jugadores de ${group.name} con registro`}>
                  {group.ranked.map(({ row, rank }) => {
                    const primaryValue = primaryMetricId ? metricNumber(row, primaryMetricId) : 0;
                    const pct = primaryMax > 0 ? Math.min(100, (primaryValue / primaryMax) * 100) : 0;
                    const identity = (
                      <>
                        <span className={styles.pName}>
                          {row.name}
                          {row.isCaptain && <span className={styles.pCaptain} title="Capitán">C</span>}
                        </span>
                        <span className={styles.pMeta}>
                          {row.position ? row.position : 'Sin posición'}
                          {row.number != null && ` · #${row.number}`}
                        </span>
                      </>
                    );

                    return (
                      <li key={row.key} className={styles.pRow}>
                        {/* El puesto se ilumina solo si de verdad hay marca: el
                            que entro a la lista por una tarjeta y no por la
                            metrica que ordena no es el segundo goleador. */}
                        <span
                          className={`${styles.pRank} ${rank <= 3 && primaryValue > 0 ? styles.pRankTop : ''}`}
                          aria-hidden="true"
                        >
                          {rank}
                        </span>

                        {row.playerId ? (
                          <Link
                            href={`/players/${row.playerId}`}
                            className={styles.pIdentityLink}
                            aria-label={row.name}
                          >
                            {identity}
                          </Link>
                        ) : (
                          <span className={styles.pIdentity}>{identity}</span>
                        )}

                        <span className={styles.pChips}>
                          {secondaryMetricIds.map((metricId) => {
                            const value = metricNumber(row, metricId);
                            if (value === 0) return null;
                            const meta = getPlayerMetricMeta(metricId, tableData.metricLabels[metricId]);
                            const toneClass =
                              meta.tone === 'danger'
                                ? styles.pChipDanger
                                : meta.tone === 'caution'
                                ? styles.pChipCaution
                                : '';
                            return (
                              <span key={metricId} className={`${styles.pChip} ${toneClass}`}>
                                <span className={styles.pChipLabel}>{meta.shortLabel}</span>
                                {formatPlayerMetricValue(metricId, row.metrics[metricId], tableData.metricLabels[metricId])}
                              </span>
                            );
                          })}
                        </span>

                        <span className={styles.pPrimary}>
                          <span className={`${styles.pPrimaryValue} ${primaryValue > 0 ? styles.pPrimaryValueOn : ''}`}>
                            {primaryMetricId
                              ? formatPlayerMetricValue(primaryMetricId, row.metrics[primaryMetricId], tableData.metricLabels[primaryMetricId])
                              : '—'}
                          </span>
                          <span className={styles.pPrimaryTrack} aria-hidden="true">
                            <span className={styles.pPrimaryFill} style={{ width: `${pct}%` }} />
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ol>
              )}

              {group.blank.length > 0 && (
                <details className={styles.pBlank} open={group.ranked.length === 0}>
                  <summary className={styles.pBlankSummary}>
                    <svg
                      className={styles.pBlankChevron}
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                    {/* Sin nombrar una metrica: el corte es contra TODAS las
                        mostradas, asi que "sin registro en goles" mentiria
                        sobre el que tiene una amarilla y ningun gol. */}
                    <span>{group.blank.length} sin registro</span>
                  </summary>
                  <ul className={styles.pBlankRows} aria-label={`Jugadores de ${group.name} sin registro`}>
                    {group.blank.map((row) => (
                      <li key={row.key} className={styles.pBlankRow}>
                        {row.playerId ? (
                          <Link href={`/players/${row.playerId}`} className={styles.pBlankLink}>
                            {row.name}
                          </Link>
                        ) : (
                          <span className={styles.pBlankName}>{row.name}</span>
                        )}
                        <span className={styles.pBlankMeta}>
                          {row.position ? row.position : 'Sin posición'}
                          {row.number != null && ` · #${row.number}`}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
