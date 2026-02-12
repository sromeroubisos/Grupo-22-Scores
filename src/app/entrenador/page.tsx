'use client';

import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import styles from './page.module.css';

type NavItem = {
    id: string;
    label: string;
    icon: ReactNode;
};

type NavSection = {
    label: string;
    items: NavItem[];
};

type TrainingSession = {
    id: string;
    dateLabel: string;
    type: string;
    title: string;
    duration: string;
    badge: string;
    headline: string;
    objectives: string[];
    materials: string[];
    blocks: { label: string; duration: string; highlight?: boolean }[];
};

const navSections: NavSection[] = [
    {
        label: 'Operación',
        items: [
            {
                id: 'resumen',
                label: 'Resumen',
                icon: (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                    </svg>
                )
            },
            {
                id: 'calendario',
                label: 'Calendario',
                icon: (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                        <line x1="16" y1="2" x2="16" y2="6" />
                        <line x1="8" y1="2" x2="8" y2="6" />
                        <line x1="3" y1="10" x2="21" y2="10" />
                    </svg>
                )
            }
        ]
    },
    {
        label: 'Deportivo',
        items: [
            {
                id: 'entrenamientos',
                label: 'Entrenamientos',
                icon: (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                    </svg>
                )
            },
            {
                id: 'gym',
                label: 'Planes Gimnasio',
                icon: (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M6 18h12M12 2v20M2 12h20" />
                    </svg>
                )
            },
            {
                id: 'plantel',
                label: 'Plantel',
                icon: (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                )
            },
            {
                id: 'convocatorias',
                label: 'Convocatorias',
                icon: (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                        <polyline points="16 11 18 13 22 9" />
                    </svg>
                )
            }
        ]
    },
    {
        label: 'Staff',
        items: [
            {
                id: 'reportes',
                label: 'Reportes',
                icon: (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
                        <path d="M22 12A10 10 0 0 0 12 2v10z" />
                    </svg>
                )
            },
            {
                id: 'comunicacion',
                label: 'Comunicación',
                icon: (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                )
            }
        ]
    }
];

const trainingSessions: TrainingSession[] = [
    {
        id: 'tuesday',
        dateLabel: 'Martes 12 Oct',
        type: 'Táctico',
        title: 'Estructura de Salida 22m',
        duration: '90 min',
        badge: 'Sesión Táctica',
        headline: 'Ataque - Estructura 1-3-3-1',
        objectives: ['Velocidad de reposicionamiento', 'Limpieza de ruck (menos de 3 seg)', 'Lectura de 3er hombre'],
        materials: ['20 Conos', '10 Pelotas', 'Escudos', 'Cámara Video'],
        blocks: [
            { label: 'Warm-up + Movilidad', duration: "15'" },
            { label: 'Drill: Reposicionamiento 3 pasadores', duration: "25'" },
            { label: 'Bloque Táctico: Fase de obtención', duration: "30'", highlight: true }
        ]
    },
    {
        id: 'thursday',
        dateLabel: 'Jueves 14 Oct',
        type: 'Técnico',
        title: 'Destrezas Individuales',
        duration: '75 min',
        badge: 'Sesión Técnica',
        headline: 'Destrezas - Mano Hábil y Timing',
        objectives: ['Dominio del pase corto', 'Recepción bajo presión', 'Timing en apoyos internos'],
        materials: ['15 Conos', '8 Pelotas', 'Bandas elásticas'],
        blocks: [
            { label: 'Warm-up + Activación', duration: "10'" },
            { label: 'Drills de pase en movimiento', duration: "20'" },
            { label: 'Juego reducido 6v6', duration: "25'", highlight: true }
        ]
    }
];

const gymPlans = [
    {
        id: 'potencia',
        badge: 'Potencia',
        title: 'In-Season Maintenance',
        description: 'Optimizado para mantener cargas máximas durante la competencia.',
        length: '4 Semanas'
    },
    {
        id: 'hipertrofia',
        badge: 'Hipertrofia',
        title: 'Off-Season Bulking',
        description: 'Enfoque en volumen para primeras líneas y forwards.',
        length: '8 Semanas'
    },
    {
        id: 'rehab',
        badge: 'Rehab',
        title: 'ACL Recovery Phase 1',
        description: 'Protocolo inicial post-quirúrgico y movilidad.',
        length: '6 Semanas'
    }
];

const channels = ['General M19', 'Staff Técnico', 'Forwards', 'Backs', 'Unidad de Recuperación'];

export default function EntrenadorPanelPage() {
    const [activeTab, setActiveTab] = useState('resumen');
    const [activeTrainingId, setActiveTrainingId] = useState(trainingSessions[0].id);
    const [activeChannel, setActiveChannel] = useState(channels[0]);

    const activeTraining = useMemo(
        () => trainingSessions.find((session) => session.id === activeTrainingId) || trainingSessions[0],
        [activeTrainingId]
    );

    return (
        <div className={styles.app}>
            <header className={`${styles.header} ${styles.glass}`}>
                <div className={styles.headerLeft}>
                    <div className={styles.brand}>
                        FLASH<span className={styles.brandAccent}>UI</span>
                    </div>
                    <div className={styles.selectorGroup}>
                        <button className={`${styles.selectorItem} ${styles.selectorItemActive}`} type="button">R.C. Lions</button>
                        <button className={styles.selectorItem} type="button">M19</button>
                        <button className={styles.selectorItem} type="button">Temporada 2024</button>
                    </div>
                    <div className={styles.statusBadge}>
                        <span className={styles.statusDot} />
                        Temporada Activa
                    </div>
                </div>
                <div className={styles.headerRight}>
                    <button className={`${styles.btn} ${styles.btnOutline} ${styles.mono}`} type="button">Exportar Lista</button>
                    <button className={styles.btn} type="button">+ Nueva Convocatoria</button>
                </div>
            </header>

            <aside className={`${styles.sidebar} ${styles.glass} ${styles.scrollArea}`}>
                {navSections.map((section) => (
                    <div key={section.label}>
                        <p className={styles.navGroupLabel}>{section.label}</p>
                        {section.items.map((item) => (
                            <button
                                key={item.id}
                                type="button"
                                className={`${styles.navItem} ${activeTab === item.id ? styles.navItemActive : ''}`}
                                onClick={() => setActiveTab(item.id)}
                                aria-current={activeTab === item.id ? 'page' : undefined}
                            >
                                {item.icon}
                                {item.label}
                            </button>
                        ))}
                    </div>
                ))}
            </aside>

            <main className={`${styles.main} ${styles.scrollArea}`}>
                <section className={`${styles.section} ${activeTab === 'resumen' ? styles.sectionActive : ''}`}>
                    <h2 className={styles.sectionHeading}>Dashboard</h2>
                    <div className={styles.summaryGrid}>
                        <div className={`${styles.card} ${styles.nextMatchCard}`}>
                            <div>
                                <div className={styles.matchMeta}>
                                    <span className={`${styles.badgeTag} ${styles.badgeAccent} ${styles.mono}`}>Próximo Partido · Oficial</span>
                                    <span className={`${styles.mono} ${styles.mutedText}`}>Sábado 15 de Octubre · 15:30</span>
                                </div>
                                <div className={styles.matchTeams}>
                                    <div className={styles.teamStack}>
                                        <div className={styles.teamLogo} />
                                        <div className={styles.mono}>R.C. Lions</div>
                                    </div>
                                    <div className={styles.mutedText} style={{ fontSize: '2rem', fontWeight: 200, opacity: 0.3 }}>VS</div>
                                    <div className={styles.teamStack}>
                                        <div className={styles.teamLogo} />
                                        <div className={styles.mono}>Old Eagles</div>
                                    </div>
                                </div>
                            </div>
                            <div className={styles.matchActions}>
                                <button className={`${styles.btn} ${styles.btnOutline}`} type="button">Ver Detalle</button>
                                <button className={styles.btn} type="button">Crear Convocatoria</button>
                            </div>
                        </div>

                        <div className={`${styles.card} ${styles.cardGlass}`}>
                            <h4 className={`${styles.cardTitle} ${styles.mono} ${styles.mutedText}`}>Alertas Críticas</h4>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                <div className={`${styles.alertItem} ${styles.alertDanger}`}>
                                    <p style={{ fontSize: '0.85rem', fontWeight: 600 }}>3 Lesionados nuevos</p>
                                    <p className={styles.mutedText} style={{ fontSize: '0.75rem' }}>M. Rossi, L. Paz, J. Doe</p>
                                </div>
                                <div className={`${styles.alertItem} ${styles.alertWarning}`}>
                                    <p style={{ fontSize: '0.85rem', fontWeight: 600 }}>Posiciones sin cubrir</p>
                                    <p className={styles.mutedText} style={{ fontSize: '0.75rem' }}>Falta Segunda Línea suplente</p>
                                </div>
                            </div>
                        </div>

                        <div className={styles.card} style={{ gridColumn: '1 / 2' }}>
                            <h4 className={`${styles.cardTitle} ${styles.mono} ${styles.mutedText}`}>Semana del Staff</h4>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <div className={styles.weekRow}>
                                    <span className={styles.mono}>MAR 12</span>
                                    <span>Entrenamiento Técnico (19:00)</span>
                                    <span className={styles.badgeTag}>Confirmado</span>
                                </div>
                                <div className={styles.weekRow}>
                                    <span className={styles.mono}>JUE 14</span>
                                    <span>Entrenamiento Táctico + Video (19:00)</span>
                                    <span className={styles.badgeTag}>Borrador</span>
                                </div>
                            </div>
                        </div>

                        <div className={`${styles.card} ${styles.cardGlass}`}>
                            <h4 className={`${styles.cardTitle} ${styles.mono} ${styles.mutedText}`}>Pendientes</h4>
                            <ul className={styles.tasksList}>
                                <li><input type="checkbox" /> Plan gym semanal</li>
                                <li><input type="checkbox" defaultChecked /> Carga RPE Martes</li>
                                <li><input type="checkbox" /> Reporte Pre-Match</li>
                            </ul>
                        </div>
                    </div>
                </section>

                <section className={`${styles.section} ${activeTab === 'entrenamientos' ? styles.sectionActive : ''}`}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '32px', flexWrap: 'wrap', gap: '16px' }}>
                        <h2 className={styles.sectionHeading}>Planificación Deportiva</h2>
                        <div className={styles.sectionSubActions}>
                            <button className={`${styles.btn} ${styles.btnOutline} ${styles.mono}`} type="button">Duplicar Anterior</button>
                            <button className={styles.btn} type="button">+ Nueva Sesión</button>
                        </div>
                    </div>

                    <div className={styles.splitView}>
                        <div className={`${styles.splitLeft} ${styles.scrollArea}`}>
                            <div className={styles.navGroupLabel}>Semana 42 - In-Season</div>
                            {trainingSessions.map((session) => (
                                <button
                                    key={session.id}
                                    type="button"
                                    className={`${styles.trainingItem} ${activeTrainingId === session.id ? styles.trainingItemActive : ''}`}
                                    onClick={() => setActiveTrainingId(session.id)}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                        <span className={styles.mono} style={activeTrainingId === session.id ? { color: 'var(--color-accent)' } : undefined}>{session.dateLabel}</span>
                                        <span className={styles.chip}>{session.type}</span>
                                    </div>
                                    <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{session.title}</div>
                                    <div className={styles.mutedText} style={{ fontSize: '0.8rem', marginTop: '4px' }}>Duración: {session.duration}</div>
                                </button>
                            ))}
                        </div>
                        <div className={`${styles.splitRight} ${styles.scrollArea}`}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px', flexWrap: 'wrap', gap: '16px' }}>
                                <div>
                                    <span className={`${styles.badgeTag} ${styles.mono}`} style={{ marginBottom: '12px', display: 'inline-block' }}>{activeTraining.badge}</span>
                                    <h3 style={{ fontSize: '1.8rem' }}>{activeTraining.headline}</h3>
                                </div>
                                <button className={`${styles.btn} ${styles.btnOutline}`} type="button">Publicar al Grupo</button>
                            </div>

                            <div className={styles.detailGrid}>
                                <div>
                                    <h5 className={`${styles.mono} ${styles.mutedText}`} style={{ marginBottom: '12px' }}>Objetivos</h5>
                                    <ul style={{ fontSize: '0.9rem', lineHeight: 1.6, paddingLeft: '20px' }}>
                                        {activeTraining.objectives.map((item) => (
                                            <li key={item}>{item}</li>
                                        ))}
                                    </ul>
                                </div>
                                <div>
                                    <h5 className={`${styles.mono} ${styles.mutedText}`} style={{ marginBottom: '12px' }}>Material Necesario</h5>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                        {activeTraining.materials.map((item) => (
                                            <span key={item} className={styles.chip}>{item}</span>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div style={{ marginTop: '40px' }}>
                                <h5 className={`${styles.mono} ${styles.mutedText}`} style={{ marginBottom: '20px' }}>Bloques de la Sesión</h5>
                                <div className={styles.blockList}>
                                    {activeTraining.blocks.map((block) => (
                                        <div key={block.label} className={`${styles.blockRow} ${block.highlight ? styles.blockRowHighlight : ''}`}>
                                            <span>{block.label}</span>
                                            <span className={styles.mono}>{block.duration}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                <section className={`${styles.section} ${activeTab === 'gym' ? styles.sectionActive : ''}`}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '32px', flexWrap: 'wrap', gap: '16px' }}>
                        <h2 className={styles.sectionHeading}>Biblioteca de Fuerza</h2>
                        <button className={styles.btn} type="button">+ Crear Nuevo Plan</button>
                    </div>
                    <div className={styles.planGrid}>
                        {gymPlans.map((plan) => (
                            <div key={plan.id} className={`${styles.card} ${styles.cardGlass} ${styles.planCard}`}>
                                <span className={`${styles.badgeTag} ${styles.mono}`}>{plan.badge}</span>
                                <div>
                                    <h3 style={{ margin: '16px 0 8px 0' }}>{plan.title}</h3>
                                    <p className={styles.mutedText} style={{ fontSize: '0.85rem' }}>{plan.description}</p>
                                </div>
                                <div className={styles.planFooter}>
                                    <span className={`${styles.mono} ${styles.mutedText}`}>{plan.length}</span>
                                    <button className={`${styles.btn} ${styles.btnOutline}`} type="button" style={{ padding: '6px 12px', fontSize: '0.75rem' }}>Asignar</button>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                <section className={`${styles.section} ${activeTab === 'comunicacion' ? styles.sectionActive : ''}`}>
                    <h2 className={styles.sectionHeading}>Grupo de Comunicación</h2>
                    <div className={styles.splitView}>
                        <div className={`${styles.splitLeft} ${styles.scrollArea}`} style={{ padding: 0 }}>
                            <div style={{ padding: '20px', borderBottom: '1px solid var(--color-glass-border)', background: 'var(--color-bg-tertiary)' }}>
                                <div style={{ fontWeight: 700 }}>Canales de División</div>
                            </div>
                            {channels.map((channel) => (
                                <button
                                    key={channel}
                                    type="button"
                                    className={`${styles.navItem} ${activeChannel === channel ? styles.navItemActive : ''}`}
                                    style={{ margin: '10px' }}
                                    onClick={() => setActiveChannel(channel)}
                                >
                                    {channel}
                                </button>
                            ))}
                        </div>
                        <div className={`${styles.splitRight} ${styles.scrollArea}`} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                            <div>
                                <div className={styles.commBubble}>
                                    <span className={`${styles.mono}`} style={{ fontSize: '0.7rem', color: 'var(--color-accent)' }}>COACH (TÉ) · 10:45 AM</span>
                                    <p style={{ marginTop: '4px', fontSize: '0.9rem' }}>Chicos, se publicó el plan de entrenamiento para mañana. Recuerden traer botines de tapones altos por la lluvia.</p>
                                    <div style={{ marginTop: '10px', background: 'rgba(0,0,0,0.3)', padding: '8px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <svg width="16" height="16" fill="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16l4-2 4 2V4h2v16l4-2 4 2V4a2 2 0 0 0-2-2z" /></svg>
                                        <span className={styles.mono} style={{ fontSize: '0.75rem' }}>Plan_Semana_42.pdf</span>
                                    </div>
                                </div>
                                <div className={`${styles.commBubble} ${styles.commBubbleMuted}`}>
                                    <span className={styles.mono} style={{ fontSize: '0.7rem' }}>M. ROSSI · 11:02 AM</span>
                                    <p style={{ marginTop: '4px', fontSize: '0.9rem' }}>Recibido Coach. ¿El video lo vemos antes?</p>
                                </div>
                            </div>
                            <div className={styles.commInput}>
                                <input type="text" placeholder={`Escribe un aviso operativo en ${activeChannel}...`} className={styles.commInputField} />
                                <button className={`${styles.btn} ${styles.btnOutline}`} type="button" style={{ padding: '6px 12px', fontSize: '0.75rem' }}>Plantillas</button>
                                <button className={styles.btn} type="button" style={{ padding: '6px 16px', fontSize: '0.75rem' }}>Enviar</button>
                            </div>
                        </div>
                    </div>
                </section>

                <section className={`${styles.section} ${activeTab === 'calendario' ? styles.sectionActive : ''}`}>
                    <h2 className={styles.sectionHeading}>Calendario Semanal</h2>
                    <div className={`${styles.card} ${styles.cardGlass} ${styles.sectionPlaceholder}`}>[ Vista de Agenda Semanal Kinetic ]</div>
                </section>

                <section className={`${styles.section} ${activeTab === 'plantel' ? styles.sectionActive : ''}`}>
                    <h2 className={styles.sectionHeading}>Disponibilidad de Plantel</h2>
                    <div className={`${styles.card} ${styles.cardGlass} ${styles.sectionPlaceholder}`}>[ Listado Operativo de Jugadores ]</div>
                </section>

                <section className={`${styles.section} ${activeTab === 'convocatorias' ? styles.sectionActive : ''}`}>
                    <h2 className={styles.sectionHeading}>Constructor de Convocatorias</h2>
                    <div className={`${styles.card} ${styles.cardGlass} ${styles.sectionPlaceholder}`}>[ Drag & Drop Field Layout ]</div>
                </section>

                <section className={`${styles.section} ${activeTab === 'reportes' ? styles.sectionActive : ''}`}>
                    <h2 className={styles.sectionHeading}>Centro de Reportes</h2>
                    <div className={`${styles.card} ${styles.cardGlass} ${styles.sectionPlaceholder}`}>[ Analytics & Staff Logs ]</div>
                </section>
            </main>
        </div>
    );
}
