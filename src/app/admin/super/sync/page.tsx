'use client';

import styles from '../page.module.css';

const providers = [
    { id: 'p1', name: 'Flashscore', status: 'OK', last: 'Hace 5 min' },
    { id: 'p2', name: 'Manual', status: 'OK', last: 'Hace 30 min' }
];

const entities = [
    { id: 'e1', name: 'Matches hoy', status: 'Error', changes: '12 cambios', last: 'Hace 12 min' },
    { id: 'e2', name: 'Standings UAR', status: 'Warning', changes: '2 cambios', last: 'Hace 45 min' },
    { id: 'e3', name: 'Equipos', status: 'OK', changes: 'Sin cambios', last: 'Hace 2 h' },
    { id: 'e4', name: 'Torneos', status: 'OK', changes: '1 cambio', last: 'Hace 4 h' }
];

const snapshots = [
    { id: 's1', name: 'Match tabs', note: 'Snapshots activos: 124', action: 'Ver detalle' },
    { id: 's2', name: 'Standings', note: 'Ultimo checksum: OK', action: 'Revisar' }
];

export default function SyncPage() {
    return (
        <>
            <header className={styles.header}>
                <div className={styles.headerLeft}>
                    <h1 className={styles.pageTitle}>Fuentes y sync</h1>
                    <p className={styles.pageSubtitle}>Estado del proveedor y refrescos</p>
                </div>
                <div className={styles.headerRight}>
                    <button className={styles.viewSiteBtn}>Forzar sync de hoy</button>
                </div>
            </header>

            <div className={styles.content}>
                <section className={styles.section}>
                    <div className={styles.sectionHeaderRow}>
                        <h2 className={styles.sectionTitle}>Proveedores</h2>
                    </div>
                    <div className={styles.grid}>
                        {providers.map((provider) => (
                            <div key={provider.id} className={styles.card}>
                                <div className={styles.cardHeader}>
                                    <h3 className={styles.cardTitle}>{provider.name}</h3>
                                    <span className={`${styles.pill} ${provider.status === 'OK' ? styles.pillSuccess : styles.pillDanger}`}>
                                        {provider.status}
                                    </span>
                                </div>
                                <div className={styles.activityList}>
                                    <div className={styles.activityItem}>
                                        <div className={styles.activityContent}>
                                            <span className={styles.activityMessage}>Ultimo ping</span>
                                            <span className={styles.activityMeta}>{provider.last}</span>
                                        </div>
                                        <span className={`${styles.pill} ${styles.pillNeutral}`}>Ver logs</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                <section className={styles.section}>
                    <div className={styles.sectionHeaderRow}>
                        <h2 className={styles.sectionTitle}>Entidades sincronizadas</h2>
                        <button className={styles.btn}>Actualizar ahora</button>
                    </div>
                    <div className={styles.card}>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>Entidad</th>
                                    <th>Estado</th>
                                    <th>Cambios</th>
                                    <th>Ultima ejecucion</th>
                                    <th>Accion</th>
                                </tr>
                            </thead>
                            <tbody>
                                {entities.map((entity) => (
                                    <tr key={entity.id} className={styles.tableRow}>
                                        <td>{entity.name}</td>
                                        <td>
                                            <span className={`${styles.pill} ${entity.status === 'OK' ? styles.pillSuccess : entity.status === 'Warning' ? styles.pillWarning : styles.pillDanger}`}>
                                                {entity.status}
                                            </span>
                                        </td>
                                        <td>{entity.changes}</td>
                                        <td>{entity.last}</td>
                                        <td>
                                            <span className={`${styles.pill} ${styles.pillNeutral}`}>Forzar</span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>

                <section className={styles.section}>
                    <div className={styles.sectionHeaderRow}>
                        <h2 className={styles.sectionTitle}>Snapshots y fallback</h2>
                    </div>
                    <div className={styles.card}>
                        <div className={styles.activityList}>
                            {snapshots.map((snapshot) => (
                                <div key={snapshot.id} className={styles.activityItem}>
                                    <div className={styles.activityContent}>
                                        <span className={styles.activityMessage}>{snapshot.name}</span>
                                        <span className={styles.activityMeta}>{snapshot.note}</span>
                                    </div>
                                    <span className={`${styles.pill} ${styles.pillInfo}`}>{snapshot.action}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>
            </div>
        </>
    );
}
