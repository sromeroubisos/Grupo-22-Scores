'use client';

import { useState } from 'react';
import SectionShell from '../components/SectionShell';
import styles from '../page.module.css';

const initialIntegrations = [
    { id: 'csv', name: 'Importacion CSV', description: 'Carga masiva de jugadores, staff y resultados desde archivos CSV.', icon: '\uD83D\uDCC4', enabled: true, status: 'Ultima carga: 2026-02-05' },
    { id: 'gcal', name: 'Google Calendar', description: 'Sincroniza partidos y eventos del club con Google Calendar.', icon: '\uD83D\uDCC5', enabled: true, status: 'Sincronizado hace 2 hs' },
    { id: 'email', name: 'Email / SMTP', description: 'Envio de notificaciones y boletines por email.', icon: '\uD83D\uDCE7', enabled: true, status: 'Configurado (Sendgrid)' },
    { id: 'whatsapp', name: 'WhatsApp Business', description: 'Notificaciones de convocatoria y resultados por WhatsApp.', icon: '\uD83D\uDCAC', enabled: false, status: 'No configurado' },
    { id: 'webhook', name: 'Webhooks', description: 'Envia eventos del club a sistemas externos en tiempo real.', icon: '\uD83D\uDD17', enabled: false, status: 'Sin endpoints' },
    { id: 'api', name: 'API Publica', description: 'Endpoints para consultar fixture, resultados y planteles.', icon: '\uD83C\uDF10', enabled: true, status: 'v2.1 · 4 endpoints activos' },
    { id: 'storage', name: 'Almacenamiento Cloud', description: 'Respaldo automatico de documentos y assets en la nube.', icon: '\u2601\uFE0F', enabled: true, status: '2.4 GB usados de 10 GB' },
    { id: 'analytics', name: 'Analytics', description: 'Metricas de visitas al perfil publico del club.', icon: '\uD83D\uDCCA', enabled: false, status: 'No configurado' },
];

export default function ClubIntegracionesPage() {
    const [integrations, setIntegrations] = useState(initialIntegrations);
    const [showConnect, setShowConnect] = useState(false);

    const toggleIntegration = (id: string) => {
        setIntegrations((prev) => prev.map((i) => (i.id === id ? { ...i, enabled: !i.enabled } : i)));
    };

    const enabledCount = integrations.filter((i) => i.enabled).length;
    const disabledIntegrations = integrations.filter((i) => !i.enabled);

    const handleConnect = (id: string) => {
        setIntegrations((prev) => prev.map((i) => (i.id === id ? { ...i, enabled: true, status: 'Conectado recientemente' } : i)));
    };

    return (
        <SectionShell
            title="Integraciones"
            subtitle={`${enabledCount} de ${integrations.length} integraciones activas.`}
            actions={<button className={`${styles.btn} ${styles.btnGhost}`} type="button" onClick={() => setShowConnect(true)}>Conectar servicio</button>}
        >
            {showConnect && (
                <div className={styles.modalOverlay} onClick={() => setShowConnect(false)}>
                    <div className={styles.modalCard} onClick={(e) => e.stopPropagation()} style={{ maxWidth: '560px' }}>
                        <div className={styles.modalHeader}>
                            <div>
                                <h2 className={styles.cardTitle}>Conectar servicio</h2>
                                <p className={styles.cardMeta}>Activé integraciones inactivas del club.</p>
                            </div>
                            <button className={styles.btnGhost} type="button" onClick={() => setShowConnect(false)}>Cerrar</button>
                        </div>
                        {disabledIntegrations.length === 0 ? (
                            <div className={styles.emptyPlaceholder}>
                                <p>No hay servicios pendientes para conectar.</p>
                            </div>
                        ) : (
                            <div style={{ display: 'grid', gap: '12px' }}>
                                {disabledIntegrations.map((integration) => (
                                    <div key={integration.id} className={styles.integrationCard}>
                                        <div className={styles.integrationIcon}>{integration.icon}</div>
                                        <div className={styles.integrationInfo}>
                                            <div className={styles.integrationName}>{integration.name}</div>
                                            <div className={styles.integrationDesc}>{integration.description}</div>
                                        </div>
                                        <button className={styles.btnSmall} type="button" onClick={() => handleConnect(integration.id)}>
                                            Conectar
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
            <div className={styles.sectionGrid}>
                {integrations.map((integration) => (
                    <div key={integration.id} className={styles.integrationCard}>
                        <div className={styles.integrationIcon}>{integration.icon}</div>
                        <div className={styles.integrationInfo}>
                            <div className={styles.integrationName}>{integration.name}</div>
                            <div className={styles.integrationDesc}>{integration.description}</div>
                            <div style={{ marginTop: 6 }}>
                                <span className={`${styles.badge} ${integration.enabled ? styles.badgeSuccess : styles.badgeNeutral}`}>
                                    {integration.enabled ? 'Activo' : 'Inactivo'}
                                </span>
                                <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--color-text-tertiary)' }}>{integration.status}</span>
                            </div>
                        </div>
                        <button
                            className={`${styles.toggle} ${integration.enabled ? styles.toggleOn : ''}`}
                            onClick={() => toggleIntegration(integration.id)}
                            type="button"
                            aria-label={`Toggle ${integration.name}`}
                        />
                    </div>
                ))}
            </div>
        </SectionShell>
    );
}

