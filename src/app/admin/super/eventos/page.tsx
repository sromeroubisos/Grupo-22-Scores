'use client';

import React from 'react';
import styles from '../page.module.css';

export default function EventosPage() {
    return (
        <div className={styles.dashboard}>
            <header className={styles.header}>
                <h1 className={styles.title}>Gestión de Eventos</h1>
            </header>
            <div className={styles.statsGrid}>
                <div className={styles.statCard}>
                    <h2>En construcción</h2>
                    <p>Esta funcionalidad estará disponible próximamente.</p>
                </div>
            </div>
        </div>
    );
}
