'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import styles from './page.module.css';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/lib/mock-db';

export default function AdminPage() {
    const { user } = useAuth();
    // Force re-render for updates
    const [tick, setTick] = useState(0);

    const stats = useMemo(() => {
        const today = new Date().toISOString().split('T')[0];
        const todayMatches = db.matches.filter(m => m.dateTime.startsWith(today));
        const liveMatches = todayMatches.filter(m => m.status === 'live');

        // Simple conflict detection: Clubs with same name but different Source/IDs
        // For mock purposes, let's say conflicts are unlinked clubs that match external ones
        const potentialConflicts = db.clubs.filter(c => !c.unionId && db.externalClubs.some(ec => ec.name === c.name));

        return {
            matches: { value: todayMatches.length, sub: `/ ${liveMatches.length} live` },
            conflicts: { value: potentialConflicts.length, sub: 'Duplicados' },
            latency: { value: '42ms', sub: 'v4.2' }
        };
    }, [tick]);

    const catalogRows = useMemo(() => {
        return db.tournaments.map(t => {
            const union = db.unions.find(u => u.id === t.unionId);
            const isLinked = !!union;
            const source = t.slug.includes('api') ? 'API PROVIDER #1' : 'MANUAL / CLUB';
            const isSourceApi = source.includes('API');

            // Sync status mock - random for demo or static
            const lastSync = isSourceApi ? '14:02:11' : '--';

            return {
                id: t.id,
                name: t.name,
                season: t.category || t.seasonId, // Fallback to showcase something
                sport: t.sport === 'rugby' ? 'Rugby' : t.sport,
                federation: isLinked ? 'VINCULADA' : 'SIN VINCULO',
                source,
                status: t.status === 'published' ? 'Activo' : 'Pendiente',
                sync: lastSync,
                action: isLinked ? 'Config' : 'Vincular',
                highlight: !isLinked
            };
        });
    }, [tick]);

    const conflictsMessage = useMemo(() => {
        const clubConflicts = db.clubs.filter(c => !c.unionId).length; // Mock logic for "manual entities needing link"
        if (clubConflicts > 0) {
            return `${clubConflicts} clubes creados manualmente podrian coincidir con registros de API.`;
        }
        return 'No se detectaron conflictos de datos pendientes.';
    }, [tick]);

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
                        <span className={styles.statusIndicator}></span>
                        API: STABLE
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
                        {stats.matches.value > 0 && <span className={styles.liveIndicator}></span>}
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
                            <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => setTick(t => t + 1)}>
                                Forzar sync general
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
                                        <Link href={`/admin/super/torneos/${row.id}`} className={styles.btn}>
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
                <div className={`${styles.slab} ${styles.col8}`}>
                    <span className={styles.slabLabel}>News CMS</span>
                    <div className={styles.newsGrid}>
                        <div className={styles.newsCard}>
                            <div className={styles.newsPreview}>DRAFT_COVER.JPG</div>
                            <h3 className={styles.newsTitle}>Nueva reglamentacion Sub-21</h3>
                            <p className={styles.newsBody}>El consejo directivo ha definido nuevos parametros para el registro de jugadores y protocolo medico.</p>
                        </div>
                        <div className={styles.newsSide}>
                            <span className={styles.slabLabel}>Scope de publicacion</span>
                            <span className={`${styles.badge} ${styles.badgeManual}`}>Global</span>
                            <span className={`${styles.badge} ${styles.badgeManual}`}>Torneo XV</span>
                            <button className={`${styles.btn} ${styles.btnPrimary} ${styles.fullBtn}`} style={{ width: '100%', justifyContent: 'center' }}>Publicar</button>
                        </div>
                    </div>
                </div>

                <div className={`${styles.slab} ${styles.col4}`}>
                    <span className={styles.slabLabel}>Operadores y roles</span>
                    <div className={styles.rolesList}>
                        <div className={styles.roleRow}>
                            <div className={styles.roleAvatar} style={{ backgroundImage: `url(${db.users[1]?.avatarUrl})` }}></div>
                            <div>
                                <div className={styles.roleName}>{db.users[1]?.name || 'Operador'}</div>
                                <div className={`${styles.roleTag} ${styles.roleTagCyan}`}>
                                    OPERADOR_TORNEO
                                </div>
                            </div>
                        </div>
                        <div className={styles.roleRow}>
                            <div className={styles.roleAvatar} style={{ backgroundImage: `url(${db.users[2]?.avatarUrl})` }}></div>
                            <div>
                                <div className={styles.roleName}>{db.users[2]?.name || 'Delegado'}</div>
                                <div className={`${styles.roleTag} ${styles.roleTagMagma}`}>
                                    ADMIN_CLUB
                                </div>
                            </div>
                        </div>
                        <button className={`${styles.btn}`} style={{ width: '100%', justifyContent: 'center' }}>Gestionar permisos</button>
                    </div>
                </div>
            </div>
        </div>
    );
}
