'use client';

import styles from '../page.module.css';

const folders = [
    { id: 'f1', name: 'Favoritos internos', type: 'Mixtas', total: 24 },
    { id: 'f2', name: 'Monitorear', type: 'Torneos', total: 12 },
    { id: 'f3', name: 'En revision API', type: 'Clubes', total: 8 },
    { id: 'f4', name: 'Internacionales', type: 'Jugadores', total: 15 }
];

export default function CarpetasPage() {
    return (
        <div style={{ paddingBottom: '40px' }}>
            <div className={styles.consoleHeader}>
                <div>
                    <div className={styles.consoleTitle}>Carpetas</div>
                    <div className={styles.consoleSubtitle}>Organizacion personalizada</div>
                </div>
                <div className={styles.consoleActions}>
                    <button className={`${styles.cardAction} ${styles.cardActionPrimary}`}>+ Crear carpeta</button>
                </div>
            </div>

            <div className={styles.cardGrid}>
                {folders.map((folder) => (
                    <div key={folder.id} className={styles.cardItem}>
                        <div className={styles.cardHeader}>
                            <div className={styles.cardLogo}>📁</div>
                            <div>
                                <div className={styles.cardTitle}>{folder.name}</div>
                                <div className={styles.cardMeta}>{folder.type}</div>
                            </div>
                        </div>
                        <div className={styles.metricsGrid}>
                            <div className={styles.metricItem}>
                                <span className={styles.metricLabel}>Items</span>
                                <span className={styles.metricValue}>{folder.total}</span>
                            </div>
                            <div className={styles.metricItem}>
                                <span className={styles.metricLabel}>Ult. cambio</span>
                                <span className={styles.metricValue}>Hoy</span>
                            </div>
                            <div className={styles.metricItem}>
                                <span className={styles.metricLabel}>Estado</span>
                                <span className={styles.metricValue}>Activa</span>
                            </div>
                        </div>
                        <div className={styles.cardActions}>
                            <button className={styles.cardAction}>Abrir</button>
                            <button className={styles.cardAction}>Editar</button>
                            <button className={`${styles.cardAction} ${styles.cardActionPrimary}`}>Asignar</button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
