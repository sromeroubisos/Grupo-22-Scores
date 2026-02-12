'use client';

import styles from '../page.module.css';

const duplicates = [
    { id: 'd1', entity: 'Club', detail: 'CASI / Club Atletico San Isidro', action: 'Revisar match' },
    { id: 'd2', entity: 'Equipo', detail: 'Hindou / Hindu', action: 'Unificar' }
];

const provisionalMatches = [
    { id: 'p1', detail: 'SIC vs Hindu', note: 'Sin match oficial', action: 'Vincular' },
    { id: 'p2', detail: 'CASI vs Newman', note: 'Fecha a confirmar', action: 'Editar' }
];

const auditLog = [
    { id: 'a1', entity: 'Torneo', action: 'Actualizar reglas', user: 'Superadmin', date: 'Hace 2 h' },
    { id: 'a2', entity: 'Club', action: 'Verificar club', user: 'Operador', date: 'Hace 5 h' },
    { id: 'a3', entity: 'Partido', action: 'Vincular oficial', user: 'Admin Torneo', date: 'Ayer' }
];

export default function ModeracionPage() {
    return (
        <>
            <header className={styles.header}>
                <div className={styles.headerLeft}>
                    <h1 className={styles.pageTitle}>Moderacion y auditoria</h1>
                    <p className={styles.pageSubtitle}>Conflictos, duplicados y trazabilidad</p>
                </div>
                <div className={styles.headerRight}>
                    <button className={styles.viewSiteBtn}>Exportar log</button>
                </div>
            </header>

            <div className={styles.content}>
                <section className={styles.section}>
                    <div className={styles.sectionHeaderRow}>
                        <h2 className={styles.sectionTitle}>Conflictos abiertos</h2>
                    </div>
                    <div className={styles.splitGrid}>
                        <div className={styles.card}>
                            <div className={styles.cardHeader}>
                                <h3 className={styles.cardTitle}>Duplicados sugeridos</h3>
                            </div>
                            <div className={styles.activityList}>
                                {duplicates.map((item) => (
                                    <div key={item.id} className={styles.activityItem}>
                                        <div className={styles.activityContent}>
                                            <span className={styles.activityMessage}>{item.entity}</span>
                                            <span className={styles.activityMeta}>{item.detail}</span>
                                        </div>
                                        <span className={`${styles.pill} ${styles.pillWarning}`}>{item.action}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className={styles.card}>
                            <div className={styles.cardHeader}>
                                <h3 className={styles.cardTitle}>Partidos provisorios</h3>
                            </div>
                            <div className={styles.activityList}>
                                {provisionalMatches.map((match) => (
                                    <div key={match.id} className={styles.activityItem}>
                                        <div className={styles.activityContent}>
                                            <span className={styles.activityMessage}>{match.detail}</span>
                                            <span className={styles.activityMeta}>{match.note}</span>
                                        </div>
                                        <span className={`${styles.pill} ${styles.pillInfo}`}>{match.action}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </section>

                <section className={styles.section}>
                    <div className={styles.sectionHeaderRow}>
                        <h2 className={styles.sectionTitle}>Log de auditoria</h2>
                    </div>
                    <div className={styles.card}>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>Entidad</th>
                                    <th>Accion</th>
                                    <th>Usuario</th>
                                    <th>Fecha</th>
                                </tr>
                            </thead>
                            <tbody>
                                {auditLog.map((item) => (
                                    <tr key={item.id} className={styles.tableRow}>
                                        <td>{item.entity}</td>
                                        <td>{item.action}</td>
                                        <td>{item.user}</td>
                                        <td>{item.date}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            </div>
        </>
    );
}
