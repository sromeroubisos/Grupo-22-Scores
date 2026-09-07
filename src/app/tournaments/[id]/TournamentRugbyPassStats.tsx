'use client';

import React, { useEffect, useMemo, useState } from 'react';
import styles from './page.module.css';

/**
 * La pestana Estadisticas de un torneo de RugbyPass.
 *
 * Hasta que existio esta pantalla, `/tournaments/rp-comp-203?tab=stats` abria
 * vacia: `TournamentPublicStats` arma sus tablas con los EVENTOS de cada
 * partido, y los partidos de este proveedor llegan de `external_match_cache`
 * sin eventos. El dato existe, pero del lado de RugbyPass y por competicion, no
 * por partido — asi que se pide aparte, cuando la pestana se abre.
 *
 * Dos bloques, porque el proveedor publica dos cosas distintas:
 *
 *   · Los LIDERES de cada rubro. Los de clubes valen para cualquier temporada;
 *     los de jugadores, solo para la que corre — el proveedor ignora el
 *     parametro en ese bloque, asi que el conector no los emite para las demas
 *     y aca se dice por que en vez de dibujar el podio de otro ano.
 *   · La TABLA de clubes con la veintena de rubros, que RugbyPass recien llena
 *     cuando la temporada lleva varias fechas. Que falte al arranque no es una
 *     falla: quedan los lideres, y el selector deja mirar la temporada pasada.
 *
 * De jugadores no hay tabla y no se puede inventar: RugbyPass no publica un
 * ranking completo por competicion, solo el podio de cada rubro.
 */

interface LeaderRow {
    position: number;
    name: string;
    team: string;
    logo: string;
    photo: string;
    value: number | string;
}

interface LeaderBoard {
    key: string;
    title: string;
    rows: LeaderRow[];
}

interface StatColumn {
    key: string;
    label: string;
    short: string;
    group: string;
}

interface TeamRow {
    oid: string;
    name: string;
    logo: string;
    color: string;
    stats: Record<string, number | string>;
}

interface SeasonOption {
    id: number;
    label: string;
}

interface Payload {
    seasons: SeasonOption[];
    season: SeasonOption | null;
    /** La temporada que RugbyPass abre por su cuenta. */
    defaultSeason: string;
    teamLeaders: LeaderBoard[];
    playerLeaders: LeaderBoard[];
    teamColumns: StatColumn[];
    teamRows: TeamRow[];
}

interface Props {
    /** El oid de la competicion: 203 para el Top 14. */
    competitionId: number;
    /** La temporada que muestra el resto de la pantalla (`2026-27`). */
    season?: string | null;
    tournamentName?: string;
}

/** `"88%"` y `1.4` ordenan por su numero; lo que no tiene, va al fondo. */
function aNumero(valor: number | string | undefined): number {
    if (typeof valor === 'number') return Number.isFinite(valor) ? valor : -Infinity;
    const n = Number(String(valor ?? '').replace(/[^0-9.-]/g, ''));
    return Number.isFinite(n) ? n : -Infinity;
}

function formatValor(valor: number | string | undefined): string {
    if (valor === undefined || valor === null || valor === '') return '—';
    if (typeof valor === 'number') return valor.toLocaleString('es-AR');
    return String(valor);
}

function Leaders({ boards, kind }: { boards: LeaderBoard[]; kind: 'teams' | 'players' }) {
    if (boards.length === 0) return null;
    return (
        <section className={styles.topStatsSection} aria-label="Lo más destacado">
            <h3 className={styles.topStatsHeading}>Lo más destacado</h3>
            <div className={styles.topStatsGrid}>
                {boards.map((board) => (
                    <article key={board.key} className={styles.topStatsCard}>
                        <div className={styles.topStatsCardHead}>
                            <span className={styles.topStatsCardTitle}>{board.title}</span>
                        </div>
                        <ol className={styles.topStatsList}>
                            {board.rows.map((row, idx) => (
                                <li key={`${row.name}-${row.position}`} className={styles.topStatsItem}>
                                    <span className={styles.topStatsRank}>{idx + 1}</span>
                                    {row.logo ? (
                                        /* El nombre va al lado, asi que el escudo es decorativo. */
                                        <img
                                            src={row.logo}
                                            alt=""
                                            width={22}
                                            height={22}
                                            loading="lazy"
                                            className={styles.topStatsCrest}
                                        />
                                    ) : (
                                        <span className={styles.topStatsCrest} aria-hidden="true" />
                                    )}
                                    <span className={styles.topStatsIdentity}>
                                        <span className={styles.topStatsName}>{row.name}</span>
                                        {kind === 'players' && row.team && (
                                            <span className={styles.topStatsTeam}>{row.team}</span>
                                        )}
                                    </span>
                                    <span
                                        className={`${styles.topStatsValue} ${idx === 0 ? styles.topStatsValueLead : ''}`}
                                    >
                                        {formatValor(row.value)}
                                    </span>
                                </li>
                            ))}
                        </ol>
                    </article>
                ))}
            </div>
        </section>
    );
}

export default function TournamentRugbyPassStats({ competitionId, season, tournamentName }: Props) {
    const [subTab, setSubTab] = useState<'teams' | 'players'>('teams');
    const [data, setData] = useState<Payload | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    /* Una competicion que RugbyPass no cubre no es una falla: "Internationals"
       es un cajon de test matches y su pagina de estadisticas ni existe. Se
       distingue del error para no rotular de rojo algo que simplemente no hay. */
    const [sinCobertura, setSinCobertura] = useState(false);
    const [sortKey, setSortKey] = useState<string>('');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
    /** La que eligio el usuario acá; vacía significa "la del torneo". */
    const [seasonPick, setSeasonPick] = useState<string>('');

    const seasonPedida = seasonPick || String(season ?? '');

    useEffect(() => {
        let cancelado = false;
        setLoading(true);
        setError(null);
        setSinCobertura(false);

        const params = new URLSearchParams({ competition: String(competitionId) });
        if (seasonPedida) params.set('season', seasonPedida);

        fetch(`/api/rugbypass/stats?${params.toString()}`, { cache: 'no-store' })
            .then(async (res) => {
                const cuerpo = await res.json().catch(() => ({}));
                if (res.status === 404) return null;
                if (!res.ok) throw new Error(cuerpo?.error || `HTTP ${res.status}`);
                return cuerpo as Payload;
            })
            .then((payload) => {
                if (cancelado) return;
                if (!payload) {
                    setSinCobertura(true);
                    setData(null);
                    return;
                }
                setData(payload);
                setSortKey(payload.teamColumns[0]?.key ?? '');
                setSortDir('desc');
            })
            .catch((err) => {
                if (cancelado) return;
                setData(null);
                setError(err instanceof Error ? err.message : 'Error cargando estadísticas');
            })
            .finally(() => {
                if (!cancelado) setLoading(false);
            });

        return () => {
            cancelado = true;
        };
    }, [competitionId, seasonPedida]);

    const columnas = data?.teamColumns ?? [];
    const filas = useMemo(() => {
        const copia = [...(data?.teamRows ?? [])];
        if (!sortKey) return copia;
        copia.sort((a, b) => {
            const av = aNumero(a.stats?.[sortKey]);
            const bv = aNumero(b.stats?.[sortKey]);
            return sortDir === 'desc' ? bv - av : av - bv;
        });
        return copia;
    }, [data, sortKey, sortDir]);

    const ordenarPor = (key: string) => {
        if (key === sortKey) {
            setSortDir(sortDir === 'desc' ? 'asc' : 'desc');
            return;
        }
        setSortKey(key);
        setSortDir('desc');
    };

    const leaders = subTab === 'teams' ? (data?.teamLeaders ?? []) : (data?.playerLeaders ?? []);
    const hayTabla = subTab === 'teams' && columnas.length > 0 && filas.length > 0;
    const gridTemplate = `minmax(200px, 1.6fr) repeat(${columnas.length}, minmax(76px, 1fr))`;

    return (
        <div className={styles.section}>
            <div className={styles.statsHeaderBar}>
                <div className={styles.statsTitleBlock}>
                    <h2 className={styles.pageTitle}>Estadísticas</h2>
                    <p className={styles.statsSubtitle}>
                        Lo que publica RugbyPass{tournamentName ? <> de <strong>{tournamentName}</strong></> : null}
                        {data?.season?.label ? <> — temporada {data.season.label}.</> : '.'}
                    </p>
                </div>
                <div className={styles.statsSubTabs}>
                    <button
                        type="button"
                        className={`${styles.statsSubTab} ${subTab === 'teams' ? styles.statsSubTabActive : ''}`}
                        onClick={() => setSubTab('teams')}
                    >
                        Clubes
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

            {(data?.seasons.length ?? 0) > 1 && (
                <div className={styles.statsFilterBar}>
                    <select
                        className={styles.statsSelect}
                        aria-label="Temporada de las estadísticas"
                        /* La elegida manda sobre la que contesto el servidor:
                           atarlo solo a la respuesta hacia que el desplegable
                           volviera al valor viejo mientras la nueva viajaba, y
                           se leia como que el clic no habia entrado. */
                        value={seasonPick || data?.season?.label || ''}
                        onChange={(e) => setSeasonPick(e.target.value)}
                    >
                        {data!.seasons.map((s) => (
                            <option key={s.id} value={s.label}>Temporada {s.label}</option>
                        ))}
                    </select>
                </div>
            )}

            {loading && <p className={styles.emptyState}>Cargando estadísticas…</p>}

            {!loading && error && (
                <p className={styles.emptyState}>No se pudieron cargar las estadísticas: {error}</p>
            )}

            {!loading && sinCobertura && (
                <p className={styles.emptyState}>
                    RugbyPass no publica estadísticas de este torneo.
                </p>
            )}

            {!loading && !error && !sinCobertura && leaders.length === 0 && !hayTabla && (
                <p className={styles.emptyState}>
                    RugbyPass todavía no publica estadísticas de esta temporada.
                </p>
            )}

            {!loading && !error && !sinCobertura && <Leaders boards={leaders} kind={subTab} />}

            {!loading && !error && !sinCobertura && subTab === 'teams' && !hayTabla && leaders.length > 0 && (
                <p className={styles.providerNotice}>
                    La planilla completa por club aparece cuando la temporada lleva varias fechas
                    jugadas. Mientras tanto, el selector deja mirar las anteriores.
                </p>
            )}

            {/* El podio de jugadores solo es cierto en la temporada en curso: el
                proveedor ignora el parametro en ese bloque y siempre contesta la
                de hoy. Decirlo es mejor que dibujar el podio equivocado. */}
            {!loading && !error && !sinCobertura && subTab === 'players' && data && (
                <p className={styles.providerNotice}>
                    {data.season && data.season.label !== data.defaultSeason
                        ? `RugbyPass no publica los mejores de temporadas cerradas: su podio de jugadores devuelve siempre el de la temporada en curso (${data.defaultSeason}). La planilla jugador por jugador está en la ficha de cada partido.`
                        : 'RugbyPass publica el podio de cada rubro, no el plantel completo: la planilla jugador por jugador está en la ficha de cada partido.'}
                </p>
            )}

            {hayTabla && (
                <div className={styles.statsTableWrap}>
                    <div className={styles.statsTableHeaderRow} style={{ gridTemplateColumns: gridTemplate }}>
                        <div className={`${styles.statsHeaderCell} ${styles.statsStickyHeaderCell}`}>
                            <span className={styles.statsHeaderButton}>Club</span>
                        </div>
                        {columnas.map((col) => {
                            const activa = col.key === sortKey;
                            return (
                                <div key={col.key} className={styles.statsHeaderCell} title={`${col.label} · ${col.group}`}>
                                    <button
                                        type="button"
                                        className={`${styles.statsHeaderButton} ${activa ? styles.statsHeaderButtonActive : ''}`}
                                        onClick={() => ordenarPor(col.key)}
                                    >
                                        {col.short}
                                        {activa && (
                                            <span className={styles.statsSortArrow}>
                                                {sortDir === 'desc' ? '▼' : '▲'}
                                            </span>
                                        )}
                                    </button>
                                </div>
                            );
                        })}
                    </div>

                    {filas.map((fila, idx) => (
                        <div
                            key={fila.oid}
                            className={styles.statsTableDataRow}
                            style={{ gridTemplateColumns: gridTemplate }}
                        >
                            <div className={`${styles.statsBodyCell} ${styles.statsStickyCell}`}>
                                <div className={styles.statsEntityCell}>
                                    <span className={styles.statsRank}>{idx + 1}</span>
                                    {fila.logo && (
                                        <img
                                            src={fila.logo}
                                            alt=""
                                            width={22}
                                            height={22}
                                            loading="lazy"
                                            className={styles.teamLogoSmall}
                                        />
                                    )}
                                    <span className={styles.statsEntityName}>{fila.name}</span>
                                </div>
                            </div>
                            {columnas.map((col) => (
                                <div key={col.key} className={styles.statsBodyCell}>
                                    {formatValor(fila.stats?.[col.key])}
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
