'use client';

import Link from 'next/link';
import styles from './page.module.css';
import { useAuth } from '@/context/AuthContext';

const topStats = [
    { id: 'today', label: 'Partidos hoy', value: '24', sub: '/ 12 live' },
    { id: 'conflicts', label: 'Conflictos de datos', value: '08', sub: 'Duplicados' },
    { id: 'latency', label: 'Sync latency', value: '42ms', sub: 'v4.2' }
];

const catalogRows = [
    {
        id: 't1',
        name: 'Superliga XV 2024',
        season: 'Temporada Regular',
        sport: 'Rugby',
        federation: 'Vinculada',
        source: 'API PROVIDER #1',
        status: 'Activo',
        sync: '14:02:11',
        action: 'Config'
    },
    {
        id: 't2',
        name: 'Copa Regional Provisoria',
        season: 'Falta fixture oficial',
        sport: 'Rugby',
        federation: 'Sin vinculo',
        source: 'MANUAL / CLUB',
        status: 'Pendiente',
        sync: '--',
        action: 'Vincular',
        highlight: true
    },
    {
        id: 't3',
        name: 'Torneo Apertura 7s',
        season: 'Finalizado',
        sport: 'Rugby 7',
        federation: 'Vinculada',
        source: 'API PROVIDER #1',
        status: 'Archivado',
        sync: '2d ago',
        action: 'Ver'
    }
];

const conflicts = [
    '3 clubes creados manualmente podrian coincidir con registros de API (Provider #1).',
    '2 torneos sin federacion vinculada requieren revision.'
];

const newsPreview = {
    title: 'Nueva reglamentacion Sub-21',
    body: 'El consejo directivo ha definido nuevos parametros para el registro de jugadores y protocolo medico.'
};

const rolesPreview = [
    { id: 'r1', name: 'Carlos Prensa', role: 'PRENSA_CLUB (CASI)', tone: 'cyan' },
    { id: 'r2', name: 'Admin Regional', role: 'ADMIN_TORNEO', tone: 'magma' }
];

export default function AdminPage() {
    const { user } = useAuth();

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
                    <Link href="/admin/super/torneos" className={`${styles.btn} ${styles.btnPrimary}`}>
                        + Nuevo torneo
                    </Link>
                </div>
            </header>

            <div className={styles.tectonicGrid}>
                {topStats.map((stat) => (
                    <div key={stat.id} className={`${styles.slab} ${styles.col4}`}>
                        <span className={styles.slabLabel}>{stat.label}</span>
                        <div className={styles.statValue}>
                            {stat.value}
                            <span className={styles.statSub}>{stat.sub}</span>
                            {stat.id === 'today' && <span className={styles.liveIndicator}></span>}
                        </div>
                    </div>
                ))}
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
                            <button className={`${styles.btn} ${styles.btnPrimary}`}>Forzar sync general</button>
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
                                        <span className={`${styles.badge} ${styles.badgeManual}`}>{row.federation}</span>
                                    </td>
                                    <td>
                                        <span className={`${styles.badge} ${row.source.includes('API') ? styles.badgeApi : styles.badgeManual}`}>
                                            {row.source}
                                        </span>
                                    </td>
                                    <td>
                                        <span className={styles.statusDot}></span>
                                        {row.status}
                                    </td>
                                    <td className={styles.mono}>{row.sync}</td>
                                    <td>
                                        <button className={styles.btn}>{row.action}</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    <div className={styles.conflictAlert}>
                        <span className={styles.alertIcon}>!</span>
                        <span className={styles.alertText}>{conflicts[0]}</span>
                        <button className={styles.btn}>Resolver match</button>
                    </div>
                </div>
            </div>

            <div className={styles.tectonicGrid}>
                <div className={`${styles.slab} ${styles.col8}`}>
                    <span className={styles.slabLabel}>News CMS</span>
                    <div className={styles.newsGrid}>
                        <div className={styles.newsCard}>
                            <div className={styles.newsPreview}>DRAFT_COVER.JPG</div>
                            <h3 className={styles.newsTitle}>{newsPreview.title}</h3>
                            <p className={styles.newsBody}>{newsPreview.body}</p>
                        </div>
                        <div className={styles.newsSide}>
                            <span className={styles.slabLabel}>Scope de publicacion</span>
                            <span className={`${styles.badge} ${styles.badgeManual}`}>Global</span>
                            <span className={`${styles.badge} ${styles.badgeManual}`}>Torneo XV</span>
                            <button className={`${styles.btn} ${styles.btnPrimary} ${styles.fullBtn}`}>Publicar</button>
                        </div>
                    </div>
                </div>

                <div className={`${styles.slab} ${styles.col4}`}>
                    <span className={styles.slabLabel}>Operadores y roles</span>
                    <div className={styles.rolesList}>
                        {rolesPreview.map((item) => (
                            <div key={item.id} className={styles.roleRow}>
                                <div className={styles.roleAvatar}></div>
                                <div>
                                    <div className={styles.roleName}>{item.name}</div>
                                    <div className={`${styles.roleTag} ${item.tone === 'cyan' ? styles.roleTagCyan : styles.roleTagMagma}`}>
                                        {item.role}
                                    </div>
                                </div>
                            </div>
                        ))}
                        <button className={`${styles.btn} ${styles.fullBtn}`}>Gestionar permisos</button>
                    </div>
                </div>
            </div>
        </div>
    );
}
