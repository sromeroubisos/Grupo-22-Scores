'use client';

import React from 'react';
import styles from '../page.module.css';

export default function ConfiguracionPage() {
    return (
        <div className={styles.page}>
            <div className={styles.main} style={{ marginLeft: 0 }}>
                <div className={styles.header}>
                    <div className={styles.headerLeft}>
                        <h1 className={styles.pageTitle}>Configuración del Torneo</h1>
                        <p className={styles.pageSubtitle}>Ajustes generales</p>
                    </div>
                    <div className={styles.headerRight}>
                        <button className={styles.viewSiteBtn} style={{ background: 'var(--color-accent)', color: 'white' }}>Guardar</button>
                    </div>
                </div>

                <div className={styles.content}>
                    <div className={styles.card}>
                        <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                            <div className={styles.section}>
                                <h2 className={styles.sectionTitle}>Información Básica</h2>
                                <div className={styles.grid}>
                                    <div>
                                        <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem' }}>Nombre del Organizador</label>
                                        <input type="text" defaultValue="URBA" style={{ width: '100%', padding: '10px', background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)', borderRadius: '6px', color: 'white' }} />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem' }}>Email de Contacto</label>
                                        <input type="email" defaultValue="admin@urba.org.ar" style={{ width: '100%', padding: '10px', background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)', borderRadius: '6px', color: 'white' }} />
                                    </div>
                                </div>
                            </div>

                            <div className={styles.section}>
                                <h2 className={styles.sectionTitle}>Permisos</h2>
                                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                    <input type="checkbox" defaultChecked id="allow_operators" />
                                    <label htmlFor="allow_operators">Permitir a operadores crear partidos nuevos</label>
                                </div>
                                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                    <input type="checkbox" id="auto_publish" />
                                    <label htmlFor="auto_publish">Publicar resultados automáticamente al finalizar</label>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
