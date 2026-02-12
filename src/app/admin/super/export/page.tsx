'use client';

import React from 'react';
import styles from '../page.module.css';

export default function ExportPage() {
    return (
        <div className={styles.page}>
            <div className={styles.main} style={{ marginLeft: 0 }}>
                <div className={styles.header}>
                    <div className={styles.headerLeft}>
                        <h1 className={styles.pageTitle}>Exportar Recursos</h1>
                        <p className={styles.pageSubtitle}>Generar imágenes y reportes para redes sociales</p>
                    </div>
                </div>

                <div className={styles.content}>
                    <div className={styles.grid}>
                        {/* Option 1: Results */}
                        <div className={styles.card} style={{ cursor: 'pointer', transition: 'all 0.2s' }}>
                            <div style={{ height: '200px', background: '#1e293b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '3rem' }}>
                                📊
                            </div>
                            <div style={{ padding: '1.5rem' }}>
                                <h2 className={styles.cardTitle}>Resultados del Día</h2>
                                <p style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>Placa resumen con todos los resultados de la jornada.</p>
                                <button className={styles.btn} style={{ marginTop: '1rem', width: '100%', background: 'var(--color-bg-tertiary)' }}>Generar JPG</button>
                            </div>
                        </div>

                        {/* Option 2: Table */}
                        <div className={styles.card} style={{ cursor: 'pointer', transition: 'all 0.2s' }}>
                            <div style={{ height: '200px', background: '#1e293b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '3rem' }}>
                                🏆
                            </div>
                            <div style={{ padding: '1.5rem' }}>
                                <h2 className={styles.cardTitle}>Tabla de Posiciones</h2>
                                <p style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>Tabla actualizada con posiciones y puntos.</p>
                                <button className={styles.btn} style={{ marginTop: '1rem', width: '100%', background: 'var(--color-bg-tertiary)' }}>Generar JPG</button>
                            </div>
                        </div>

                        {/* Option 3: Fixture */}
                        <div className={styles.card} style={{ cursor: 'pointer', transition: 'all 0.2s' }}>
                            <div style={{ height: '200px', background: '#1e293b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '3rem' }}>
                                📅
                            </div>
                            <div style={{ padding: '1.5rem' }}>
                                <h2 className={styles.cardTitle}>Próxima Fecha</h2>
                                <p style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>Flyer promocional de los próximos partidos.</p>
                                <button className={styles.btn} style={{ marginTop: '1rem', width: '100%', background: 'var(--color-bg-tertiary)' }}>Generar JPG</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
