'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/lib/mock-db';
import styles from './page.module.css';

export default function ClubAdminDashboardPage() {
    const { user } = useAuth();
    const club = db.clubs.find((c) => c.id === user?.clubId);
    const clubName = club?.name || 'Mi Club';
    const shortName = club?.shortName || 'CLUB';
    const router = useRouter();
    const [showQuickActions, setShowQuickActions] = useState(false);

    const handleExport = () => {
        const payload = {
            exportedAt: new Date().toISOString(),
            club: {
                id: club?.id,
                name: club?.name,
                shortName: club?.shortName,
                city: club?.city,
                primaryColor: club?.primaryColor,
            },
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `club-${shortName.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.json`;
        link.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className={styles.dashboard}>
            <header className={styles.headerTop}>
                <div className={styles.viewTitle}>
                    <h1>Panel Institucional</h1>
                    <p>{clubName} — Temporada 2026</p>
                </div>
                <div className={styles.userActions}>
                    <button className={`${styles.btn} ${styles.btnGhost}`} type="button" onClick={handleExport}>Exportar Datos</button>
                    <button className={styles.btn} type="button" onClick={() => setShowQuickActions(true)}>Accion Rapida</button>
                </div>
            </header>
            {showQuickActions && (
                <div className={styles.modalOverlay} onClick={() => setShowQuickActions(false)}>
                    <div className={styles.modalCard} onClick={(e) => e.stopPropagation()} style={{ maxWidth: '520px' }}>
                        <div className={styles.modalHeader}>
                            <div>
                                <h2 className={styles.cardTitle}>Accion rapida</h2>
                                <p className={styles.cardMeta}>Accesos directos a tareas frecuentes.</p>
                            </div>
                            <button className={styles.btnGhost} type="button" onClick={() => setShowQuickActions(false)}>Cerrar</button>
                        </div>
                        <div className={styles.sectionGrid} style={{ gridTemplateColumns: '1fr' }}>
                            <button className={styles.btn} type="button" onClick={() => router.push('/club-admin/fixture')}>
                                Crear partido / Fixture
                            </button>
                            <button className={styles.btn} type="button" onClick={() => router.push('/club-admin/comunicaciones')}>
                                Crear comunicado
                            </button>
                            <button className={styles.btn} type="button" onClick={() => router.push('/club-admin/documentos')}>
                                Subir documento
                            </button>
                            <button className={styles.btnGhost} type="button" onClick={() => router.push('/club-admin/planteles')}>
                                Gestionar planteles
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <section className={styles.kpiRow}>
                <div className={styles.kpiCard}>
                    <span className={styles.kpiLabel}>Jugadores Activos</span>
                    <span className={styles.kpiValue}>482</span>
                </div>
                <div className={styles.kpiCard}>
                    <span className={styles.kpiLabel}>Divisiones</span>
                    <span className={styles.kpiValue}>12</span>
                </div>
                <div className={styles.kpiCard}>
                    <span className={styles.kpiLabel}>% Datos Completos</span>
                    <span className={styles.kpiValue}>92%</span>
                </div>
                <div className={styles.kpiCard}>
                    <span className={styles.kpiLabel}>Staff Tecnico</span>
                    <span className={styles.kpiValue}>36</span>
                </div>
            </section>

            <div className={styles.dashboardGrid}>
                <section className={`${styles.glassCard} ${styles.span2}`}>
                    <div className={styles.sectionHeader}>
                        <h2>Proximos Partidos</h2>
                        <span className={`${styles.pill} ${styles.pillActive}`}>Proximos 7 dias</span>
                    </div>
                    {[
                        { date: 'SAB 15 FEB', home: shortName, away: 'CASI', division: 'Primera' },
                        { date: 'SAB 15 FEB', home: shortName, away: 'CASI', division: 'Reserva' },
                        { date: 'SAB 15 FEB', home: shortName, away: 'CASI', division: 'M19' },
                    ].map((match) => (
                        <div key={match.division} className={styles.matchItem}>
                            <span className={styles.matchDate}>{match.date}</span>
                            <div className={styles.matchTeams}>
                                <div className={styles.badgeMini} />
                                <span>{match.home}</span>
                                <span className={styles.matchVs}>VS</span>
                                <span>{match.away}</span>
                                <div className={`${styles.badgeMini} ${styles.badgeMiniAlt}`} />
                            </div>
                            <span className={`${styles.pill} ${styles.pillActive}`}>{match.division}</span>
                        </div>
                    ))}
                </section>

                <section className={styles.glassCard}>
                    <div className={styles.sectionHeader}><h2>Alertas de Gestion</h2></div>
                    <div className={styles.alertItem}>
                        <div className={styles.alertIcon}>!</div>
                        <div className={styles.alertContent}>
                            <p>12 Fichas Medicas Vencidas</p>
                            <span>Division M17 - Requiere accion</span>
                        </div>
                    </div>
                    <div className={styles.alertItem}>
                        <div className={styles.alertIcon}>!</div>
                        <div className={styles.alertContent}>
                            <p>Staff sin Rol Asignado</p>
                            <span>8 nuevos integrantes pendientes</span>
                        </div>
                    </div>
                    <div className={`${styles.alertItem} ${styles.alertItemLast}`}>
                        <div className={`${styles.alertIcon} ${styles.alertIconDanger}`}>!</div>
                        <div className={styles.alertContent}>
                            <p>Identidad Incompleta</p>
                            <span>Falta Logo Alternativo (SVG)</span>
                        </div>
                    </div>
                </section>
            </div>

            <div className={styles.dashboardGrid}>
                <section className={styles.glassCard}>
                    <div className={styles.sectionHeader}>
                        <h2>Comunicaciones</h2>
                        <Link href="/club-admin/comunicaciones" className={styles.btnSmall}>Ver todas</Link>
                    </div>
                    <div className={styles.alertItem}>
                        <div className={styles.alertIcon} style={{ background: 'rgba(var(--color-accent-rgb), 0.15)', color: 'var(--color-accent)' }}>📢</div>
                        <div className={styles.alertContent}>
                            <p>12 Posts Programados</p>
                            <span>Proyectado para la semana</span>
                        </div>
                    </div>
                    <div className={styles.activityList} style={{ marginTop: '12px' }}>
                        <div style={{ fontSize: '13px', opacity: 0.8 }}>Último boletín: <strong>Semana 6 - 2026</strong></div>
                    </div>
                </section>

                <section className={`${styles.glassCard} ${styles.span2}`}>
                    <div className={styles.sectionHeader}>
                        <h2>Sponsors Activos</h2>
                        <button className={`${styles.btn} ${styles.btnGhost}`} type="button" onClick={() => router.push('/club-admin/sponsors')}>Gestionar Assets</button>
                    </div>
                    <div className={styles.sponsorRow}>
                        {['Star+', 'Banco Galicia', 'Swiss Medical', 'Topper'].map((name) => (
                            <div key={name} className={styles.sponsorBox}>{name}</div>
                        ))}
                    </div>
                </section>
            </div>
        </div>
    );
}
