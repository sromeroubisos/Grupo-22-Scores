'use client';

import React, { useEffect, useMemo, useState } from 'react';
import styles from './page.module.css';

type SubTab = 'teams' | 'players';
type SortDirection = 'asc' | 'desc';

type StatColumn = {
    id: string;
    label: string;
    title?: string;
    format?: 'number' | 'decimal' | 'percent';
};

type TeamRow = {
    team_id: number;
    team_name: string;
    stats: Record<string, number | string>;
    fetched_at: string;
};

type PlayerRow = {
    player_id: number;
    player_name: string;
    team_id: number | null;
    team_name: string | null;
    position: string | null;
    stats: Record<string, number | string>;
    fetched_at: string;
};

type Meta = {
    league_key: string;
    league_name: string;
    season_year: string;
    season_id: number;
    last_refreshed_at: string;
    last_status: string | null;
    last_error: string | null;
};

const TEAM_COLUMNS: StatColumn[] = [
    { id: 'goalsScored', label: 'GF', title: 'Goles a favor' },
    { id: 'goalsConceded', label: 'GC', title: 'Goles en contra' },
    { id: 'cleanSheets', label: 'VAL', title: 'Vallas invictas' },
    { id: 'shots', label: 'TIR', title: 'Tiros totales' },
    { id: 'shotsOnTarget', label: 'TIR-A', title: 'Tiros al arco' },
    { id: 'bigChancesCreated', label: 'OCAS', title: 'Ocasiones claras creadas' },
    { id: 'accuratePassesPercentage', label: 'PASE%', title: 'Precisión de pase', format: 'percent' },
    { id: 'averageBallPossession', label: 'POS%', title: 'Posesión promedio', format: 'percent' },
    { id: 'tackles', label: 'TACK', title: 'Tackles' },
    { id: 'interceptions', label: 'INT', title: 'Intercepciones' },
    { id: 'clearances', label: 'DESP', title: 'Despejes' },
    { id: 'yellowCards', label: 'TA', title: 'Tarjetas amarillas' },
    { id: 'redCards', label: 'TR', title: 'Tarjetas rojas' },
];

const PLAYER_COLUMNS: StatColumn[] = [
    { id: 'appearances', label: 'PJ', title: 'Partidos jugados' },
    { id: 'goals', label: 'G', title: 'Goles' },
    { id: 'assists', label: 'A', title: 'Asistencias' },
    { id: 'rating', label: 'RAT', title: 'Rating Sofascore', format: 'decimal' },
    { id: 'totalShots', label: 'TIR', title: 'Tiros totales' },
    { id: 'shotsOnTarget', label: 'TIR-A', title: 'Tiros al arco' },
    { id: 'keyPasses', label: 'PC', title: 'Pases clave' },
    { id: 'bigChancesCreated', label: 'OCAS', title: 'Ocasiones creadas' },
    { id: 'accuratePassesPercentage', label: 'PASE%', title: 'Precisión de pase', format: 'percent' },
    { id: 'tackles', label: 'TACK', title: 'Tackles' },
    { id: 'interceptions', label: 'INT', title: 'Intercepciones' },
    { id: 'minutesPlayed', label: 'MIN', title: 'Minutos jugados' },
];

function fmt(value: number | string | undefined, format?: StatColumn['format']): string {
    if (value === undefined || value === null || value === '') return '—';
    const num = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(num)) return String(value);
    if (format === 'percent') return `${num.toFixed(1)}%`;
    if (format === 'decimal') return num.toFixed(2);
    if (Number.isInteger(num)) return String(num);
    return num.toFixed(1);
}

function initials(name: string): string {
    return name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? '')
        .join('') || '·';
}

function formatRefreshed(iso: string): string {
    try {
        return new Date(iso).toLocaleString('es-AR', {
            timeZone: 'America/Argentina/Buenos_Aires',
            dateStyle: 'short',
            timeStyle: 'short',
        });
    } catch {
        return iso;
    }
}

interface Props {
    sofascoreLeague: string;
    seasonYear?: string;
}

export default function TournamentSofascoreStats({ sofascoreLeague, seasonYear }: Props) {
    const [subTab, setSubTab] = useState<SubTab>('teams');
    const [teamRows, setTeamRows] = useState<TeamRow[]>([]);
    const [playerRows, setPlayerRows] = useState<PlayerRow[]>([]);
    const [meta, setMeta] = useState<Meta | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [sortKey, setSortKey] = useState<string>('goalsScored');
    const [sortDir, setSortDir] = useState<SortDirection>('desc');

    const season = seasonYear || String(new Date().getUTCFullYear());

    useEffect(() => {
        setSortKey(subTab === 'teams' ? 'goalsScored' : 'goals');
        setSortDir('desc');
    }, [subTab]);

    useEffect(() => {
        let cancelled = false;
        async function load() {
            setLoading(true);
            setError(null);
            try {
                const params = new URLSearchParams({
                    kind: subTab === 'teams' ? 'team' : 'player',
                    league: sofascoreLeague,
                    season,
                });
                const res = await fetch(`/api/sofascore/stats?${params.toString()}`);
                if (!res.ok) {
                    const body = await res.json().catch(() => ({}));
                    throw new Error(body.error || `HTTP ${res.status}`);
                }
                const json = await res.json();
                if (cancelled) return;
                setMeta(json.meta ?? null);
                if (subTab === 'teams') {
                    setTeamRows(json.teams ?? []);
                } else {
                    setPlayerRows(json.players ?? []);
                }
            } catch (err) {
                if (cancelled) return;
                setError(err instanceof Error ? err.message : 'Error cargando stats');
            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        load();
        return () => {
            cancelled = true;
        };
    }, [subTab, sofascoreLeague, season]);

    const columns = subTab === 'teams' ? TEAM_COLUMNS : PLAYER_COLUMNS;
    const rows = subTab === 'teams' ? teamRows : playerRows;

    const sortedRows = useMemo(() => {
        const copy = [...rows];
        copy.sort((a, b) => {
            const av = (a as TeamRow).stats?.[sortKey];
            const bv = (b as TeamRow).stats?.[sortKey];
            const an = typeof av === 'number' ? av : Number(av);
            const bn = typeof bv === 'number' ? bv : Number(bv);
            const aNum = Number.isFinite(an) ? an : -Infinity;
            const bNum = Number.isFinite(bn) ? bn : -Infinity;
            return sortDir === 'desc' ? bNum - aNum : aNum - bNum;
        });
        return copy;
    }, [rows, sortKey, sortDir]);

    const onSort = (key: string) => {
        if (key === sortKey) {
            setSortDir(sortDir === 'desc' ? 'asc' : 'desc');
        } else {
            setSortKey(key);
            setSortDir('desc');
        }
    };

    // Grid template: sticky entity column + N stat columns.
    const gridTemplate = `minmax(200px, 1.6fr) repeat(${columns.length}, minmax(72px, 1fr))`;

    return (
        <div className={styles.section}>
            <div className={styles.statsHeaderBar}>
                <div className={styles.statsTitleBlock}>
                    <h2 className={styles.pageTitle}>Estadísticas</h2>
                    <p className={styles.statsSubtitle}>
                        Datos de Sofascore para <strong>{sofascoreLeague}</strong> — temporada {season}.
                        {meta?.last_refreshed_at && (
                            <> Última actualización: {formatRefreshed(meta.last_refreshed_at)}.</>
                        )}
                    </p>
                </div>
                <div className={styles.statsSubTabs}>
                    <button
                        type="button"
                        className={`${styles.statsSubTab} ${subTab === 'teams' ? styles.statsSubTabActive : ''}`}
                        onClick={() => setSubTab('teams')}
                    >
                        Equipos
                    </button>
                    <button
                        type="button"
                        className={`${styles.statsSubTab} ${subTab === 'players' ? styles.statsSubTabActive : ''}`}
                        onClick={() => setSubTab('players')}
                    >
                        Jugadores
                    </button>
                </div>
            </div>

            {loading && <p className={styles.emptyState}>Cargando estadísticas…</p>}

            {!loading && error && (
                <p className={styles.emptyState}>
                    No se pudieron cargar las estadísticas: {error}
                </p>
            )}

            {!loading && !error && sortedRows.length === 0 && (
                <p className={styles.emptyState}>
                    No hay estadísticas cargadas todavía para esta temporada.
                </p>
            )}

            {!loading && !error && sortedRows.length > 0 && (
                <div className={styles.statsTableWrap}>
                    <div
                        className={styles.statsTableHeaderRow}
                        style={{ gridTemplateColumns: gridTemplate }}
                    >
                        <div
                            className={`${styles.statsHeaderCell} ${styles.statsStickyHeaderCell}`}
                        >
                            <button
                                type="button"
                                className={styles.statsHeaderButton}
                                onClick={() => onSort(subTab === 'teams' ? 'team_name' : 'player_name')}
                            >
                                {subTab === 'teams' ? 'Equipo' : 'Jugador'}
                            </button>
                        </div>
                        {columns.map((col) => {
                            const active = col.id === sortKey;
                            return (
                                <div key={col.id} className={styles.statsHeaderCell} title={col.title}>
                                    <button
                                        type="button"
                                        className={`${styles.statsHeaderButton} ${active ? styles.statsHeaderButtonActive : ''}`}
                                        onClick={() => onSort(col.id)}
                                    >
                                        {col.label}
                                        {active && (
                                            <span className={styles.statsSortArrow}>
                                                {sortDir === 'desc' ? '▼' : '▲'}
                                            </span>
                                        )}
                                    </button>
                                </div>
                            );
                        })}
                    </div>

                    {sortedRows.map((row, idx) => {
                        const isTeam = subTab === 'teams';
                        const r = row as TeamRow & PlayerRow;
                        const name = isTeam ? r.team_name : r.player_name;
                        const secondary = isTeam ? null : r.team_name;
                        const id = isTeam ? r.team_id : r.player_id;
                        return (
                            <div
                                key={id}
                                className={styles.statsTableDataRow}
                                style={{ gridTemplateColumns: gridTemplate }}
                            >
                                <div className={`${styles.statsBodyCell} ${styles.statsStickyCell}`}>
                                    <div className={styles.statsEntityCell}>
                                        <span className={styles.statsRank}>{idx + 1}</span>
                                        <span className={styles.statsAvatar}>{initials(name)}</span>
                                        <span className={styles.statsEntityName}>
                                            {name}
                                            {secondary && (
                                                <span className={styles.statsEntitySecondary}>
                                                    {' · '}{secondary}
                                                </span>
                                            )}
                                        </span>
                                    </div>
                                </div>
                                {columns.map((col) => (
                                    <div key={col.id} className={styles.statsBodyCell}>
                                        {fmt(r.stats?.[col.id] as number | string | undefined, col.format)}
                                    </div>
                                ))}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
