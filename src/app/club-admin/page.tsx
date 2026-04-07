'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getMatchScoreDisplay } from '@/lib/matchUtils';
import {
    EMPTY_CLUB_DASHBOARD_OVERVIEW,
    type ClubDashboardOverview,
} from '@/lib/club-admin/dashboard-types';
import { useManagedClubContext } from './components/ManagedClubContext';
import { useManagedClubData } from '@/hooks/useManagedClubData';
import styles from './page.module.css';

interface RouteResponse<T> {
    ok?: boolean;
    data?: T;
    error?: string;
}

function buildClubHref(href: string, clubId?: string | null) {
    if (!clubId) return href;
    return `${href}?club=${encodeURIComponent(clubId)}`;
}

function formatDateLabel(dateTime: string | null) {
    if (!dateTime) return 'Fecha a confirmar';

    return new Intl.DateTimeFormat('es-AR', {
        weekday: 'short',
        day: '2-digit',
        month: 'short',
    }).format(new Date(dateTime)).replace(/\./g, '').toUpperCase();
}

function formatTimeLabel(dateTime: string | null) {
    if (!dateTime) return 'Hora a confirmar';

    return new Intl.DateTimeFormat('es-AR', {
        hour: '2-digit',
        minute: '2-digit',
    }).format(new Date(dateTime));
}

function formatUpdatedLabel(dateTime: string | null) {
    if (!dateTime) return null;

    return new Intl.DateTimeFormat('es-AR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    }).format(new Date(dateTime));
}

function formatMatchStatus(status: string | null) {
    const normalized = String(status || 'scheduled').toLowerCase();

    if (normalized === 'live' || normalized === 'in_play') return 'En vivo';
    if (normalized === 'final' || normalized === 'finished' || normalized === 'ft') return 'Finalizado';
    if (normalized === 'postponed') return 'Postergado';
    if (normalized === 'cancelled') return 'Cancelado';
    return 'Programado';
}

function useClubDashboardOverview(clubId?: string | null) {
    const [data, setData] = useState<ClubDashboardOverview>(EMPTY_CLUB_DASHBOARD_OVERVIEW);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!clubId) {
            setData(EMPTY_CLUB_DASHBOARD_OVERVIEW);
            setError(null);
            setLoading(false);
            return;
        }

        const controller = new AbortController();
        let active = true;

        const load = async () => {
            setLoading(true);
            setError(null);

            try {
                const response = await fetch(`/api/club-admin/dashboard?club=${encodeURIComponent(clubId)}`, {
                    cache: 'no-store',
                    credentials: 'same-origin',
                    signal: controller.signal,
                });

                const payload = await response.json() as RouteResponse<ClubDashboardOverview>;

                if (!response.ok || !payload.data) {
                    throw new Error(payload.error || 'No se pudo cargar el dashboard del club');
                }

                if (active) {
                    setData(payload.data);
                }
            } catch (err) {
                if (!active || controller.signal.aborted) {
                    return;
                }

                setData(EMPTY_CLUB_DASHBOARD_OVERVIEW);
                setError(err instanceof Error ? err.message : 'No se pudo cargar el dashboard del club');
            } finally {
                if (active) {
                    setLoading(false);
                }
            }
        };

        void load();

        return () => {
            active = false;
            controller.abort();
        };
    }, [clubId]);

    return { data, loading, error };
}

export default function ClubAdminDashboardPage() {
    const { activeClubId } = useManagedClubContext();
    const { club, clubId, loading } = useManagedClubData(activeClubId);
    const {
        data: dashboard,
        loading: dashboardLoading,
        error: dashboardError,
    } = useClubDashboardOverview(activeClubId);
    const clubName = club?.core.name || 'Mi Club';
    const shortName = club?.core.short_name || club?.core.name?.slice(0, 4).toUpperCase() || 'CLUB';
    const [showQuickActions, setShowQuickActions] = useState(false);

    const handleExport = () => {
        if (!clubId || !club) {
            return;
        }

        const payload = {
            exportedAt: new Date().toISOString(),
            club,
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `club-${shortName.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.json`;
        link.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className={styles.dashboard}>
            <header className={styles.headerTop}>
                <div className={styles.viewTitle}>
                    <h1>Panel institucional</h1>
                    <p>{loading ? 'Cargando club...' : `${clubName} - Temporada ${new Date().getFullYear()}`}</p>
                </div>
                <div className={styles.userActions}>
                    <button
                        className={`${styles.btn} ${styles.btnGhost}`}
                        type="button"
                        onClick={handleExport}
                        disabled={!club}
                    >
                        Exportar datos
                    </button>
                    <button className={styles.btn} type="button" onClick={() => setShowQuickActions(true)}>
                        Acciones rapidas
                    </button>
                </div>
            </header>

            {!loading && !club && (
                <div className={styles.callout} style={{ marginBottom: '24px' }}>
                    <span className={styles.calloutTitle}>Club no disponible</span>
                    <p>No encontramos un club gestionable para este usuario en la fuente real de datos.</p>
                </div>
            )}

            {dashboardError && (
                <div className={styles.callout} style={{ marginBottom: '24px' }}>
                    <span className={styles.calloutTitle}>Dashboard parcial</span>
                    <p>{dashboardError}</p>
                </div>
            )}

            {showQuickActions && (
                <div className={styles.modalOverlay} onClick={() => setShowQuickActions(false)}>
                    <div className={styles.modalCard} onClick={(event) => event.stopPropagation()} style={{ maxWidth: '520px' }}>
                        <div className={styles.modalHeader}>
                            <div>
                                <h2 className={styles.cardTitle}>Acciones rapidas</h2>
                                <p className={styles.cardMeta}>Accesos directos a las tareas reales del club activo.</p>
                            </div>
                            <button className={styles.btnGhost} type="button" onClick={() => setShowQuickActions(false)}>
                                Cerrar
                            </button>
                        </div>
                        <div className={styles.sectionGrid} style={{ gridTemplateColumns: '1fr' }}>
                            <Link className={styles.btn} href={buildClubHref('/club-admin/identidad', clubId)}>
                                Editar identidad
                            </Link>
                            <Link className={styles.btn} href={buildClubHref('/club-admin/divisiones', clubId)}>
                                Gestionar equipos
                            </Link>
                            <Link className={styles.btnGhost} href={buildClubHref('/club-admin/planteles', clubId)}>
                                Gestionar planteles
                            </Link>
                            <Link className={styles.btnGhost} href={buildClubHref('/club-admin/staff', clubId)}>
                                Gestionar staff
                            </Link>
                        </div>
                    </div>
                </div>
            )}

            <section className={styles.kpiRow}>
                <div className={styles.kpiCard}>
                    <span className={styles.kpiLabel}>Proximos partidos</span>
                    <span className={styles.kpiValue}>{dashboardLoading ? '...' : dashboard.stats.upcomingMatches}</span>
                </div>
                <div className={styles.kpiCard}>
                    <span className={styles.kpiLabel}>Partidos jugados</span>
                    <span className={styles.kpiValue}>{dashboardLoading ? '...' : dashboard.stats.playedMatches}</span>
                </div>
                <div className={styles.kpiCard}>
                    <span className={styles.kpiLabel}>Torneos con tabla</span>
                    <span className={styles.kpiValue}>{dashboardLoading ? '...' : dashboard.stats.tournaments}</span>
                </div>
                <div className={styles.kpiCard}>
                    <span className={styles.kpiLabel}>Mejor puesto</span>
                    <span className={styles.kpiValue}>
                        {dashboardLoading ? '...' : dashboard.stats.bestPosition != null ? `#${dashboard.stats.bestPosition}` : '-'}
                    </span>
                </div>
            </section>

            <div className={styles.dashboardGrid}>
                <section className={`${styles.glassCard} ${styles.span2}`}>
                    <div className={styles.sectionHeader}>
                        <h2>Proximos partidos</h2>
                        <span className={`${styles.pill} ${styles.pillActive}`}>Sistema central</span>
                    </div>

                    {dashboardLoading ? (
                        <div className={styles.emptyPlaceholder}>
                            <span>...</span>
                            <p>Sincronizando agenda del club...</p>
                        </div>
                    ) : dashboard.upcomingMatches.length === 0 ? (
                        <div className={styles.emptyPlaceholder}>
                            <span>0</span>
                            <p>No hay partidos futuros cargados para este club.</p>
                        </div>
                    ) : (
                        dashboard.upcomingMatches.map((match) => (
                            <div key={match.id} className={styles.matchItem}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    <span className={styles.matchDate}>{formatDateLabel(match.dateTime)}</span>
                                    <span className={styles.cardMeta}>{formatTimeLabel(match.dateTime)} hs</span>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: 0 }}>
                                    <div className={styles.matchTeams} style={{ justifyContent: 'flex-start' }}>
                                        <span>{match.home.shortName || match.home.name}</span>
                                        <span className={styles.matchVs}>vs</span>
                                        <span>{match.away.shortName || match.away.name}</span>
                                    </div>
                                    <span className={styles.cardMeta}>
                                        {match.tournament?.name || 'Partido del club'}
                                        {match.venue ? ` · ${match.venue}` : ''}
                                    </span>
                                </div>

                                <span className={`${styles.pill} ${styles.pillActive}`}>{formatMatchStatus(match.status)}</span>
                            </div>
                        ))
                    )}
                </section>

                <section className={styles.glassCard}>
                    <div className={styles.sectionHeader}>
                        <h2>Puestos en torneos</h2>
                        <span className={`${styles.pill} ${styles.pillActive}`}>Tablas</span>
                    </div>

                    {dashboardLoading ? (
                        <div className={styles.emptyPlaceholder}>
                            <span>...</span>
                            <p>Cargando posiciones del club...</p>
                        </div>
                    ) : dashboard.standings.length === 0 ? (
                        <div className={styles.emptyPlaceholder}>
                            <span>#</span>
                            <p>Este club todavia no tiene posiciones publicadas en torneos.</p>
                        </div>
                    ) : (
                        dashboard.standings.map((standing) => (
                            <div key={standing.tournamentId} className={styles.listItem}>
                                <div className={styles.listItemInfo}>
                                    <span className={styles.listItemTitle}>{standing.tournamentName}</span>
                                    <span className={styles.listItemMeta}>
                                        PJ {standing.played} · PG {standing.won} · PE {standing.drawn} · PP {standing.lost}
                                    </span>
                                    {standing.updatedAt && (
                                        <span className={styles.listItemMeta}>
                                            Actualizado {formatUpdatedLabel(standing.updatedAt)}
                                        </span>
                                    )}
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
                                    <span className={`${styles.badge} ${styles.badgeInfo}`}>
                                        {standing.position ? `#${standing.position}` : 'Sin puesto'}
                                    </span>
                                    <span className={styles.mono}>PTS {standing.points}</span>
                                </div>
                            </div>
                        ))
                    )}
                </section>
            </div>

            <div className={styles.dashboardGrid}>
                <section className={`${styles.glassCard} ${styles.span2}`}>
                    <div className={styles.sectionHeader}>
                        <h2>Partidos jugados</h2>
                        <span className={`${styles.pill} ${styles.pillActive}`}>Recientes</span>
                    </div>

                    {dashboardLoading ? (
                        <div className={styles.emptyPlaceholder}>
                            <span>...</span>
                            <p>Cargando partidos finalizados...</p>
                        </div>
                    ) : dashboard.recentMatches.length === 0 ? (
                        <div className={styles.emptyPlaceholder}>
                            <span>0</span>
                            <p>No hay partidos finalizados registrados para este club.</p>
                        </div>
                    ) : (
                        <div className={styles.tableScroll}>
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        <th>Fecha</th>
                                        <th>Torneo</th>
                                        <th>Partido</th>
                                        <th>Condicion</th>
                                        <th>Resultado</th>
                                        <th>Estado</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {dashboard.recentMatches.map((match) => (
                                        <tr key={match.id}>
                                            <td className={styles.mono}>{formatDateLabel(match.dateTime)}</td>
                                            <td>{match.tournament?.name || 'Partido del club'}</td>
                                            <td>
                                                <strong>{match.home.shortName || match.home.name}</strong>
                                                {' vs '}
                                                <strong>{match.away.shortName || match.away.name}</strong>
                                            </td>
                                            <td>{match.isHome ? 'Local' : 'Visitante'}</td>
                                            <td className={styles.mono}>
                                                {getMatchScoreDisplay({
                                                    status: match.status,
                                                    score: match.score,
                                                })}
                                            </td>
                                            <td>{formatMatchStatus(match.status)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>

                <section className={styles.glassCard}>
                    <div className={styles.sectionHeader}>
                        <h2>Publicacion automatica</h2>
                    </div>
                    <div className={styles.callout} style={{ marginTop: 0 }}>
                        <span className={styles.calloutTitle}>Club activo</span>
                        <p>
                            Todo lo que cargues para <strong>{clubName}</strong> en identidad, equipos y planteles
                            alimenta su presencia publica en G22 Scores.
                        </p>
                    </div>
                    <div className={styles.checklist}>
                        <span>Identidad institucional y escudo del club</span>
                        <span>Equipos y planteles que despues se reflejan en la ficha publica</span>
                        <span>Partidos y posiciones tomados del sistema central de torneos</span>
                    </div>
                    <div className={styles.sectionActions}>
                        <Link className={styles.btn} href={buildClubHref('/club-admin/identidad', clubId)}>
                            Editar identidad
                        </Link>
                        <Link className={styles.btnGhost} href={buildClubHref('/club-admin/planteles', clubId)}>
                            Ver planteles
                        </Link>
                    </div>
                </section>
            </div>
        </div>
    );
}
