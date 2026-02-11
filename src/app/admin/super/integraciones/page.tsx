'use client';

import React, { useState } from 'react';
import styles from '../page.module.css';

interface Integration {
    id: string;
    name: string;
    status: 'active' | 'inactive' | 'error';
    lastSync: string;
    type: 'api' | 'webhook';
}

const initialIntegrations: Integration[] = [
    { id: '1', name: 'DataSports API', status: 'active', lastSync: 'Hace 5 min', type: 'api' },
    { id: '2', name: 'Legacy Scraper', status: 'error', lastSync: 'Hace 2 horas', type: 'webhook' },
    { id: '3', name: 'Official Feed', status: 'inactive', lastSync: 'Nunca', type: 'api' },
];

export default function IntegrationsPage() {
    const [integrations, setIntegrations] = useState<Integration[]>(initialIntegrations);

    const toggleStatus = (id: string) => {
        setIntegrations(integrations.map(i => {
            if (i.id === id) {
                return {
                    ...i,
                    status: i.status === 'active' ? 'inactive' : 'active',
                    lastSync: i.status === 'active' ? i.lastSync : 'Ahora mismo'
                };
            }
            return i;
        }));
    };

    const handleSync = (id: string) => {
        alert(`Sincronizando ${id}...`);
        // Mock sync update
        setIntegrations(integrations.map(i => i.id === id ? { ...i, lastSync: 'Ahora mismo', status: 'active' } : i));
    };

    return (
        <div className={styles.page}>
            <div className={styles.main} style={{ marginLeft: 0 }}>
                <div className={styles.header}>
                    <div className={styles.headerLeft}>
                        <h1 className={styles.pageTitle}>Integraciones</h1>
                        <p className={styles.pageSubtitle}>Conexiones con proveedores de datos externos</p>
                    </div>
                </div>

                <div className={styles.content}>
                    <div className={styles.statsGrid}>
                        {integrations.map(integration => (
                            <div key={integration.id} className={styles.statCard} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '1rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                                    <div style={{ fontWeight: 'bold', fontSize: '1.2rem' }}>{integration.name}</div>
                                    <span style={{
                                        padding: '2px 8px',
                                        borderRadius: '12px',
                                        fontSize: '0.8rem',
                                        background: integration.status === 'active' ? '#d1fae5' : integration.status === 'error' ? '#fee2e2' : '#f3f4f6',
                                        color: integration.status === 'active' ? '#065f46' : integration.status === 'error' ? '#991b1b' : '#374151'
                                    }}>
                                        {integration.status.toUpperCase()}
                                    </span>
                                </div>

                                <div style={{ fontSize: '0.9rem', color: '#6b7280' }}>
                                    Tipo: {integration.type.toUpperCase()}<br />
                                    Última Sync: {integration.lastSync}
                                </div>

                                <div style={{ display: 'flex', gap: '0.5rem', marginTop: 'auto', width: '100%' }}>
                                    <button
                                        onClick={() => handleSync(integration.id)}
                                        className={styles.viewSiteBtn}
                                        style={{ flex: 1, justifyContent: 'center', fontSize: '0.8rem' }}
                                    >
                                        Forzar Sync
                                    </button>
                                    <button
                                        onClick={() => toggleStatus(integration.id)}
                                        className={styles.viewSiteBtn}
                                        style={{ flex: 1, justifyContent: 'center', fontSize: '0.8rem', background: 'transparent' }}
                                    >
                                        {integration.status === 'active' ? 'Desactivar' : 'Activar'}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
