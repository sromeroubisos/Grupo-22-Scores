'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import styles from './page.module.css';
import { useAuth } from '@/context/AuthContext';
import { useSuperConsole } from './SuperConsoleContext';
import { superNavGroups } from './navigation';

type DashboardStats = {
    todayMatches: number;
    liveMatches: number;
    unlinkedTournaments: number;
    unlinkedClubs: number;
};

const EMPTY_DASHBOARD_STATS: DashboardStats = {
    todayMatches: 0,
    liveMatches: 0,
    unlinkedTournaments: 0,
    unlinkedClubs: 0,
};

function NavGlyph({ path }: { path: string }) {
    return (
        <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={path} />
        </svg>
    );
}

export default function AdminPage() {
    const { user } = useAuth();
    const { tournaments, unions, news, refresh } = useSuperConsole();
    const [isSyncing, setIsSyncing] = useState(false);
    const [dashboardStats, setDashboardStats] = useState<DashboardStats>(EMPTY_DASHBOARD_STATS);

    const loadDashboardStats = useCallback(async () => {
        try {
            const response = await fetch('/api/admin/super/dashboard-stats', {
                cache: 'no-store',
                credentials: 'include',
            });
            const payload = await response.json() as {
                data?: Partial<DashboardStats>;
                error?: string;
                details?: unknown;
            };

            if (!response.ok) {
                const detail = typeof payload?.details === 'string' ? payload.details : null;
                throw new Error(detail ? `${payload?.error || 'Failed to load dashboard stats'}: ${detail}` : (payload?.error || 'Failed to load dashboard stats'));
            }

            setDashboardStats({
                ...EMPTY_DASHBOARD_STATS,
                ...(payload.data || {}),
            });
        } catch (error) {
            console.error('[SuperDashboard] Failed to load stats:', error);
            setDashboardStats(EMPTY_DASHBOARD_STATS);
        }
    }, []);

    useEffect(() => {
        void loadDashboardStats();
    }, [loadDashboardStats]);

    const handleSync = async () => {
        setIsSyncing(true);
        refresh('tournaments');
        refresh('unions');
        refresh('news');
        await loadDashboardStats();
        setTimeout(() => setIsSyncing(false), 1000);
    };

    const latestNews = useMemo(() => {
        return news && news.length > 0 ? news[0] : null;
    }, [news]);

    const stats = useMemo(() => {
        return {
            matches: { value: dashboardStats.todayMatches, sub: `/ ${dashboardStats.liveMatches} en vivo` },
            conflicts: { value: dashboardStats.unlinkedTournaments + dashboardStats.unlinkedClubs, sub: 'Sin vinculación' },
            latency: { value: 'STABLE', sub: 'v3.0 Opt' }
        };
    }, [dashboardStats]);

    const catalogRows = useMemo(() => {
        return tournaments.slice(0, 10).map(t => {
            const union = unions.find(u => u.id === t.union_id);
            const isLinked = !!union;
            const source = t.external_id ? 'API / PROVIDER' : 'MANUAL';

            return {
                id: t.id,
                name: t.name,
                season: t.season_id,
                sport: t.sport ?? 'N/A',
                federation: isLinked ? (union?.name || 'VINCULADA') : 'SIN VINCULO',
                source,
                status: t.status === 'published' ? 'Activo' : (t.status === 'draft' ? 'Borrador' : 'Pendiente'),
                sync: t.updated_at ? new Date(t.updated_at).toLocaleTimeString() : '--',
                action: isLinked ? 'Config' : 'Vincular',
                highlight: !isLinked
            };
        });
    }, [tournaments, unions]);

    const conflictsMessage = useMemo(() => {
        const unlinkedCount = dashboardStats.unlinkedTournaments;
        if (unlinkedCount > 0) {
            return `${unlinkedCount} torneos requieren vinculación con una Unión territorial.`;
        }
        return 'Sincronización de catálogos completa.';
    }, [dashboardStats.unlinkedTournaments]);

    if (!user) return null;

    return (
        <div className={styles.tectonicPage}>
            <header className={styles.tectonicHeader}>
                <div className={styles.headerInfo}>
                    <p>Modulo de control</p>
                    <h1>Consola Superadmin</h1>
                </div>
                <div className={styles.statusSync}>
                    <div className={styles.statusPill}>
                        <span className={`${styles.statusIndicator} ${isSyncing ? styles.blink : ''}`}></span>
                        API: {isSyncing ? 'SYNCING...' : 'STABLE'}
                    </div>
                    <Link href="/admin/super/torneos/crear" className={`${styles.btn} ${styles.btnPrimary}`}>
                        + Nuevo torneo
                    </Link>
                </div>
            </header>

            <div className={styles.tectonicGrid}>
                <div className={`${styles.slab} ${styles.col4}`}>
                    <span className={styles.slabLabel}>Partidos hoy</span>
                    <div className={styles.statValue}>
                        {stats.matches.value}
                        <span className={styles.statSub}>{stats.matches.sub}</span>
                        {stats.matches.value > 0 && <span className={styles.liveIndicator} style={{ marginLeft: 10 }}></span>}
                    </div>
                </div>
                <div className={`${styles.slab} ${styles.col4}`}>
                    <span className={styles.slabLabel}>Conflictos de datos</span>
                    <div className={styles.statValue}>
                        {stats.conflicts.value}
                        <span className={styles.statSub}>{stats.conflicts.sub}</span>
                    </div>
                </div>
                <div className={`${styles.slab} ${styles.col4}`}>
                    <span className={styles.slabLabel}>Sync latency</span>
                    <div className={styles.statValue}>
                        {stats.latency.value}
                        <span className={styles.statSub}>{stats.latency.sub}</span>
                    </div>
                </div>
            </div>

            <div className={styles.tectonicGrid}>
                <div className={`${styles.slab} ${styles.col12}`}>
                    <div className={styles.slabHeader}>
                        <div>
                            <span className={styles.slabLabel}>Gestion de torneos y federaciones</span>
                            <h2 className={styles.slabTitle}>Catalogo maestro</h2>
                        </div>
                        <div className={styles.slabActions}>
                            <button className={styles.btn}>Filtrar</button>
                            <button
                                className={`${styles.btn} ${styles.btnPrimary}`}
                                onClick={handleSync}
                                disabled={isSyncing}
                            >
                                {isSyncing ? 'Sincronizando...' : 'Forzar sync general'}
                            </button>
                        </div>
                    </div>

                    <table className={styles.tectonicTable}>
                        <thead>
                            <tr>
                                <th>Torneo</th>
                                <th>Deporte</th>
                                <th>Federacion</th>
                                <th>Fuente</th>
                                <th>Estado</th>
                                <th>Ultima sync</th>
                                <th>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {catalogRows.map((row) => (
                                <tr key={row.id} className={row.highlight ? styles.rowHighlight : undefined}>
                                    <td>
                                        <strong>{row.name}</strong>
                                        <br />
                                        <span className={styles.rowMeta}>{row.season}</span>
                                    </td>
                                    <td>{row.sport}</td>
                                    <td>
                                        <span className={`${styles.badge} ${row.federation === 'SIN VINCULO' ? styles.badgeManual : styles.badgeApi}`}>
                                            {row.federation}
                                        </span>
                                    </td>
                                    <td>
                                        <span className={`${styles.badge} ${row.source.includes('API') ? styles.badgeApi : styles.badgeManual}`}>
                                            {row.source}
                                        </span>
                                    </td>
                                    <td>
                                        <span className={`${styles.statusDot} ${row.status === 'Activo' ? styles.statusOk : styles.statusError}`}></span>
                                        {row.status}
                                    </td>
                                    <td className={styles.mono}>{row.sync}</td>
                                    <td>
                                        <Link href={`/admin/entities/${row.id}/manage?type=tournament`} className={styles.btn}>
                                            {row.action}
                                        </Link>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    <div className={styles.conflictAlert}>
                        <span className={styles.alertIcon}>!</span>
                        <span className={styles.alertText}>{conflictsMessage}</span>
                        <Link href="/admin/super/clubes" className={styles.btn}>
                            Resolver
                        </Link>
                    </div>
                </div>
            </div>

            <div className={styles.tectonicGrid}>
                <div className={`${styles.slab} ${styles.col12}`}>
                    <div className={styles.slabHeader}>
                        <div>
                            <span className={styles.slabLabel}>Mapa de modulos</span>
                            <h2 className={styles.slabTitle}>Paneles disponibles</h2>
                        </div>
                    </div>

                    <div style={{ display: 'grid', gap: 24 }}>
                        {superNavGroups.map((group) => (
                            <section key={group.id} style={{ display: 'grid', gap: 14 }}>
                                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-strong)' }}>{group.label}</div>
                                    <div style={{ fontSize: 11, color: 'var(--basalt-400)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                                        {group.items.length} modulos
                                    </div>
                                </div>

                                <div className={styles.cardGrid} style={{ padding: 0 }}>
                                    {group.items.map((item) => (
                                        <Link
                                            key={item.id}
                                            href={item.href}
                                            className={styles.cardItem}
                                            style={{ minHeight: 0, padding: 18, textDecoration: 'none', color: 'inherit' }}
                                        >
                                            <div className={styles.cardHeader} style={{ marginBottom: 10 }}>
                                                <div className={styles.cardLogo} style={{ width: 36, height: 36 }}>
                                                    <NavGlyph path={item.iconPath} />
                                                </div>
                                                <div className={styles.cardContext}>
                                                    <div className={styles.cardTitle} style={{ marginBottom: 0 }}>
                                                        {item.label}
                                                    </div>
                                                    <div className={styles.contextLineSecondary}>{group.label}</div>
                                                </div>
                                            </div>

                                            <p style={{ margin: 0, color: 'var(--basalt-400)', fontSize: 12, lineHeight: 1.5 }}>
                                                {item.description}
                                            </p>

                                            <div className={styles.badgeRow} style={{ marginTop: 14, marginBottom: 0 }}>
                                                <span className={styles.badgePill}>Abrir panel</span>
                                            </div>
                                        </Link>
                                    ))}
                                </div>
                            </section>
                        ))}
                    </div>
                </div>
            </div>

            <div className={styles.tectonicGrid}>
                <div className={`${styles.slab} ${styles.col8}`}>
                    <div className={styles.slabHeader}>
                        <span className={styles.slabLabel}>News CMS</span>
                        {/* Go to news page */}
                        <Link href="/admin/super/noticias" className={styles.btn}>
                            Gestionar Noticias
                        </Link>
                    </div>
                    {latestNews ? (
                        <div className={styles.newsGrid}>
                            <div className={styles.newsCard}>
                                <div
                                    className={styles.newsPreview}
                                    style={{
                                        backgroundImage: latestNews.image_url ? `url(${latestNews.image_url})` : 'none',
                                        backgroundSize: 'cover',
                                        color: latestNews.image_url ? 'transparent' : 'inherit'
                                    }}
                                >
                                    {!latestNews.image_url && 'SIN IMAGEN'}
                                </div>
                                <h3 className={styles.newsTitle}>{latestNews.title}</h3>
                                <p className={styles.newsBody}>{latestNews.summary || latestNews.content?.slice(0, 100)}</p>
                            </div>
                            <div className={styles.newsSide}>
                                <span className={styles.slabLabel}>Scope de publicacion</span>
                                <span className={`${styles.badge} ${styles.badgeApi}`}>
                                    GLOBAL
                                </span>
                                <span className={`${styles.badge} ${latestNews.status === 'published' ? styles.badgeApi : styles.badgeManual}`}>
                                    {latestNews.status?.toUpperCase() || 'DRAFT'}
                                </span>
                                <div className={styles.rowMeta} style={{ marginTop: 10 }}>
                                    {latestNews.published_at ? new Date(latestNews.published_at).toLocaleDateString() : 'Sin fecha'}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-subtle)', fontSize: '0.9rem' }}>
                            No hay noticias recientes en el sistema.
                        </div>
                    )}
                </div>

                <div className={`${styles.slab} ${styles.col4}`}>
                    <span className={styles.slabLabel}>Control de acceso</span>
                    <div className={styles.rolesList}>
                        <div className={styles.roleRow}>
                            <div className={styles.roleAvatar} style={{ background: 'var(--surface-panel-alt)', color: 'var(--text-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px' }}>U</div>
                            <div>
                                <div className={styles.roleName}>{user.name}</div>
                                <div className={`${styles.roleTag} ${styles.roleTagCyan}`}>
                                    {user.role?.toUpperCase()}
                                </div>
                            </div>
                        </div>
                        <p style={{ fontSize: '11px', color: 'var(--text-subtle)', marginTop: '12px', lineHeight: '1.4' }}>
                            Tu sesión está autenticada con privilegios de administración global. Los cambios se registran en el audit log.
                        </p>
                        <button className={`${styles.btn}`} style={{ width: '100%', justifyContent: 'center', marginTop: '16px' }}>Cerrar sesión</button>
                    </div>
                </div>
            </div>
        </div>
    );
}
