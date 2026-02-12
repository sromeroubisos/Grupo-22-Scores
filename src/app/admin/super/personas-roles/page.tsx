'use client';

import styles from '../page.module.css';

const pendingRequests = [
    { id: 'r1', name: 'Juan Perez', role: 'Prensa Club', scope: 'SIC', requested: 'Hace 3 h' },
    { id: 'r2', name: 'Maria Lopez', role: 'Admin Torneo', scope: 'UAR Top 12', requested: 'Hace 1 d' },
    { id: 'r3', name: 'Sofia Gomez', role: 'Operador', scope: 'Global', requested: 'Hace 2 d' }
];

const assignments = [
    { id: 'a1', name: 'Lucia Torres', role: 'Admin Club', scope: 'Belgrano', status: 'Activo' },
    { id: 'a2', name: 'Pedro Ruiz', role: 'Admin Federacion', scope: 'UAR', status: 'Activo' },
    { id: 'a3', name: 'Camila Vega', role: 'Prensa Torneo', scope: 'URBA', status: 'Activo' }
];

export default function PersonasRolesPage() {
    return (
        <>
            <header className={styles.header}>
                <div className={styles.headerLeft}>
                    <h1 className={styles.pageTitle}>Personas y roles</h1>
                    <p className={styles.pageSubtitle}>Asignacion de permisos y scopes</p>
                </div>
                <div className={styles.headerRight}>
                    <button className={styles.viewSiteBtn}>Crear persona</button>
                </div>
            </header>

            <div className={styles.content}>
                <section className={styles.section}>
                    <div className={styles.sectionHeaderRow}>
                        <h2 className={styles.sectionTitle}>Solicitudes pendientes</h2>
                        <span className={`${styles.pill} ${styles.pillWarning}`}>{pendingRequests.length} pendientes</span>
                    </div>
                    <div className={styles.card}>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>Persona</th>
                                    <th>Rol</th>
                                    <th>Scope</th>
                                    <th>Solicitud</th>
                                    <th>Accion</th>
                                </tr>
                            </thead>
                            <tbody>
                                {pendingRequests.map((request) => (
                                    <tr key={request.id} className={styles.tableRow}>
                                        <td>{request.name}</td>
                                        <td>{request.role}</td>
                                        <td>{request.scope}</td>
                                        <td>{request.requested}</td>
                                        <td>
                                            <div className={styles.toolbar}>
                                                <span className={`${styles.pill} ${styles.pillSuccess}`}>Aprobar</span>
                                                <span className={`${styles.pill} ${styles.pillDanger}`}>Rechazar</span>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>

                <section className={styles.section}>
                    <div className={styles.sectionHeaderRow}>
                        <h2 className={styles.sectionTitle}>Asignaciones activas</h2>
                        <button className={styles.btn}>Exportar roles</button>
                    </div>
                    <div className={styles.card}>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>Persona</th>
                                    <th>Rol</th>
                                    <th>Scope</th>
                                    <th>Estado</th>
                                </tr>
                            </thead>
                            <tbody>
                                {assignments.map((assignment) => (
                                    <tr key={assignment.id} className={styles.tableRow}>
                                        <td>{assignment.name}</td>
                                        <td>{assignment.role}</td>
                                        <td>{assignment.scope}</td>
                                        <td>
                                            <span className={`${styles.pill} ${styles.pillSuccess}`}>{assignment.status}</span>
                                        </td>
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
