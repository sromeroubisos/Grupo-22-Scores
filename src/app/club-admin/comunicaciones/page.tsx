'use client';

import { useState, useMemo } from 'react';
import SectionShell from '../components/SectionShell';
import styles from '../page.module.css';

type CommTab = 'noticias' | 'boletines' | 'eventos' | 'archivo';

const MOCK_NEWS = [
    {
        id: 1,
        title: 'Convocatoria Final vs Newman',
        summary: 'Lista de jugadores citados para el encuentro del sábado.',
        scope: 'Primera División',
        audience: 'Comunidad Interna',
        status: 'Publicado',
        date: '10 Feb 2026',
        author: 'Prensa Rugby'
    },
    {
        id: 2,
        title: 'Nueva Sede para Entrenamientos Infantiles',
        summary: 'Debido a resembrado, las categorías M6 a M10 rotarán a sede Villa de Mayo.',
        scope: 'Club',
        audience: 'Público',
        status: 'Programado',
        date: '12 Feb 2026',
        author: 'Admin General'
    }
];

const MOCK_EVENTS = [
    { id: 101, name: 'Asamblea Anual Ordinaria', type: 'Asamblea', date: '20 Feb, 19:00', sport: 'Global', div: 'Socios', venue: 'Sede Central' },
    { id: 102, name: 'Clásico vs SIC', type: 'Partido', date: 'Mañana, 15:30', sport: 'Rugby', div: 'Primera', venue: 'Cancha 1' },
    { id: 103, name: 'Elecciones de Comisión Directiva', type: 'Elección', date: '15 Mar, 08:00', sport: 'Global', div: 'Todos', venue: 'Gimnasio' },
    { id: 104, name: 'Reunión de Padres M15', type: 'Reunión', date: 'Hoy, 20:30', sport: 'Rugby', div: 'M15', venue: 'Quincho' },
];

const MOCK_EDITORS = [
    { id: 1, name: 'Lucas Rossi', role: 'Prensa Rugby', status: 'Activo' },
    { id: 2, name: 'Marta Gomez', role: 'Comunicación Institucional', status: 'Activo' },
];

export default function ClubComunicacionesPage() {
    const [activeTab, setActiveTab] = useState<CommTab>('noticias');
    const [selectedContext, setSelectedContext] = useState('club');
    const [selectedSeason, setSelectedSeason] = useState('2026');
    const [news, setNews] = useState(MOCK_NEWS);
    const [editors, setEditors] = useState(MOCK_EDITORS);
    const [newsDraft, setNewsDraft] = useState({
        id: null as number | null,
        title: '',
        scope: 'Club (Global)',
        audience: 'Público General',
        summary: '',
    });

    // UI States
    const [showNewsForm, setShowNewsForm] = useState(false);
    const [showEditorsModal, setShowEditorsModal] = useState(false);
    const [newsletterStep, setNewsletterStep] = useState(1); // 1: Select, 2: Auto-gen, 3: Style
    const [eventFilterSport, setEventFilterSport] = useState('all');

    const filteredEvents = useMemo(() => {
        return MOCK_EVENTS.filter(e => eventFilterSport === 'all' || e.sport.toLowerCase() === eventFilterSport.toLowerCase());
    }, [eventFilterSport]);

    const autoGenerateNewsletter = () => {
        alert('Generando boletín automático basado en: Próximos partidos, Resultados de la fecha, Standings actuales y Noticias destacadas de la semana.');
        setNewsletterStep(2);
    };

    const openNewsDraft = (item?: typeof MOCK_NEWS[number]) => {
        if (item) {
            setNewsDraft({
                id: item.id,
                title: item.title,
                scope: item.scope,
                audience: item.audience,
                summary: item.summary,
            });
        } else {
            setNewsDraft({
                id: null,
                title: '',
                scope: 'Club (Global)',
                audience: 'Público General',
                summary: '',
            });
        }
        setShowNewsForm(true);
    };

    const handlePublishNews = () => {
        if (!newsDraft.title.trim()) {
            alert('Completá el título del comunicado.');
            return;
        }
        if (!newsDraft.summary.trim()) {
            alert('Completá el resumen del comunicado.');
            return;
        }
        const payload = {
            id: newsDraft.id ?? Date.now(),
            title: newsDraft.title.trim(),
            summary: newsDraft.summary.trim(),
            scope: newsDraft.scope,
            audience: newsDraft.audience,
            status: 'Publicado',
            date: new Date().toLocaleDateString(),
            author: 'Admin Club',
        };
        setNews((prev) => {
            if (newsDraft.id) {
                return prev.map((item) => (item.id === newsDraft.id ? payload : item));
            }
            return [payload, ...prev];
        });
        setShowNewsForm(false);
    };

    const handleRevokeEditor = (id: number) => {
        if (!confirm('¿Revocar acceso a este editor?')) return;
        setEditors((prev) => prev.filter((ed) => ed.id !== id));
    };

    const handleInviteEditor = () => {
        const name = prompt('Nombre del editor');
        if (!name) return;
        const role = prompt('Rol del editor', 'Prensa') || 'Prensa';
        setEditors((prev) => [...prev, { id: Date.now(), name, role, status: 'Activo' }]);
    };

    const handleNewsStats = (item: typeof MOCK_NEWS[number]) => {
        alert(`Estadísticas de "${item.title}":\n- Lecturas: 1,240\n- Compartidos: 86\n- Comentarios: 14`);
    };

    const handleEventNotify = (name: string) => {
        alert(`Notificación enviada para el evento: ${name}`);
    };

    return (
        <SectionShell
            title="Comunicaciones Institucionales"
            subtitle="Gestión de noticias, boletines y avisos oficiales del club."
            actions={
                <div style={{ display: 'flex', gap: '12px' }}>
                    <button className={styles.btnGhost} onClick={() => setShowEditorsModal(true)}>Gestionar Editores</button>
                    <button className={styles.btn} onClick={() => openNewsDraft()}>+ Crear Comunicado</button>
                </div>
            }
        >
            {/* Modals for News & Editors */}
            {showNewsForm && (
                <div className={styles.modalOverlay} onClick={() => setShowNewsForm(false)}>
                    <div className={styles.modalCard} onClick={e => e.stopPropagation()} style={{ maxWidth: '600px' }}>
                        <h2 className={styles.cardTitle}>Nuevo Comunicado / Noticia</h2>
                        <div className={styles.formGrid} style={{ marginTop: '20px' }}>
                            <div className={styles.formGroup} style={{ gridColumn: 'span 2' }}>
                                <label className={styles.formLabel}>Título de la noticia</label>
                                <input
                                    className={styles.formInput}
                                    placeholder="Ej: Convocatoria para el fin de semana"
                                    value={newsDraft.title}
                                    onChange={(e) => setNewsDraft((prev) => ({ ...prev, title: e.target.value }))}
                                />
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>Ámbito (Scope)</label>
                                <select
                                    className={styles.formInput}
                                    value={newsDraft.scope}
                                    onChange={(e) => setNewsDraft((prev) => ({ ...prev, scope: e.target.value }))}
                                >
                                    <option>Club (Global)</option>
                                    <option>Rugby</option>
                                    <option>Fútbol</option>
                                    <option>Hockey</option>
                                </select>
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>Audiencia</label>
                                <select
                                    className={styles.formInput}
                                    value={newsDraft.audience}
                                    onChange={(e) => setNewsDraft((prev) => ({ ...prev, audience: e.target.value }))}
                                >
                                    <option>Público General</option>
                                    <option>Solo Socios</option>
                                    <option>Comunidad Interna (Staff/Jugadores)</option>
                                </select>
                            </div>
                            <div className={styles.formGroup} style={{ gridColumn: 'span 2' }}>
                                <label className={styles.formLabel}>Cuerpo del mensaje / Resumen</label>
                                <textarea
                                    className={styles.formInput}
                                    style={{ minHeight: '100px', resize: 'vertical' }}
                                    placeholder="Escribe aquí el contenido principal..."
                                    value={newsDraft.summary}
                                    onChange={(e) => setNewsDraft((prev) => ({ ...prev, summary: e.target.value }))}
                                />
                            </div>
                        </div>
                        <div className={styles.modalFooter} style={{ marginTop: '24px' }}>
                            <button className={styles.btnGhost} onClick={() => setShowNewsForm(false)}>Cancelar</button>
                            <button className={styles.btn} onClick={handlePublishNews}>Publicar Ahora</button>
                        </div>
                    </div>
                </div>
            )}

            {showEditorsModal && (
                <div className={styles.modalOverlay} onClick={() => setShowEditorsModal(false)}>
                    <div className={styles.modalCard} onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
                        <h2 className={styles.cardTitle}>Gestión de Editores de Prensa</h2>
                        <p className={styles.cardMeta}>Define quiénes pueden publicar contenidos oficiales.</p>
                        <div style={{ marginTop: '20px' }}>
                            {editors.map(ed => (
                                <div key={ed.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: 'var(--club-panel-inner)', borderRadius: '12px', marginBottom: '8px', border: '1px solid var(--club-stroke-soft)' }}>
                                    <div>
                                        <p style={{ fontWeight: 600 }}>{ed.name}</p>
                                        <p style={{ fontSize: '12px', opacity: 0.7 }}>{ed.role}</p>
                                    </div>
                                    <button className={styles.btnSmall} style={{ color: '#ef4444' }} onClick={() => handleRevokeEditor(ed.id)}>Revocar</button>
                                </div>
                            ))}
                            <button className={styles.btnGhost} style={{ width: '100%', marginTop: '12px' }} onClick={handleInviteEditor}>+ Invitar nuevo editor</button>
                        </div>
                        <div className={styles.modalFooter} style={{ marginTop: '24px' }}>
                            <button className={styles.btn} onClick={() => setShowEditorsModal(false)}>Cerrar</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Top Stats & Context */}
            <div className={styles.kpiRow} style={{ marginBottom: '24px' }}>
                <div className={styles.glassCard} style={{ padding: '16px' }}>
                    <span className={styles.formLabel}>Contexto de Vista</span>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                        <select
                            className={styles.formInput}
                            style={{ padding: '6px 12px', fontSize: '13px' }}
                            value={selectedContext}
                            onChange={(e) => setSelectedContext(e.target.value)}
                        >
                            <option value="club">Club (Global)</option>
                            <option value="div1">Primera División</option>
                            <option value="div2">M19</option>
                        </select>
                        <select
                            className={styles.formInput}
                            style={{ padding: '6px 12px', fontSize: '13px', width: '100px' }}
                            value={selectedSeason}
                            onChange={(e) => setSelectedSeason(e.target.value)}
                        >
                            <option value="2026">2026</option>
                        </select>
                    </div>
                </div>
                <div className={styles.glassCard} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ textAlign: 'center' }}>
                        <p style={{ fontSize: '20px', fontWeight: 700, color: 'var(--color-accent)' }}>12</p>
                        <p style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--color-text-tertiary)' }}>Publicaciones</p>
                    </div>
                </div>
                <div className={styles.glassCard} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ textAlign: 'center' }}>
                        <p style={{ fontSize: '20px', fontWeight: 700, color: '#ffb800' }}>3</p>
                        <p style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--color-text-tertiary)' }}>Alcance Total</p>
                    </div>
                </div>
            </div>

            {/* Main Tabs */}
            <div className={styles.tabs}>
                <button className={`${styles.tab} ${activeTab === 'noticias' ? styles.tabActive : ''}`} onClick={() => setActiveTab('noticias')}>Noticias / Comunicados</button>
                <button className={`${styles.tab} ${activeTab === 'boletines' ? styles.tabActive : ''}`} onClick={() => setActiveTab('boletines')}>Boletines (Newsletter)</button>
                <button className={`${styles.tab} ${activeTab === 'eventos' ? styles.tabActive : ''}`} onClick={() => setActiveTab('eventos')}>Agenda de Eventos</button>
                <button className={`${styles.tab} ${activeTab === 'archivo' ? styles.tabActive : ''}`} onClick={() => setActiveTab('archivo')}>Historial</button>
            </div>

            {/* Tab 1: Noticias */}
            {activeTab === 'noticias' && (
                <div className={styles.sectionGrid} style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))' }}>
                    {news.map(item => (
                        <div key={item.id} className={styles.commCard}>
                            <div className={styles.commHeader}>
                                <div>
                                    <span className={styles.scopeChip}>{item.scope}</span>
                                    <h3 className={styles.commTitle} style={{ marginTop: '8px' }}>{item.title}</h3>
                                </div>
                                <span className={`${styles.badge} ${item.status === 'Publicado' ? styles.badgeSuccess : styles.badgeWarning}`}>{item.status}</span>
                            </div>
                            <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)', lineHeight: '1.5' }}>{item.summary}</p>
                            <div className={styles.commFooter}>
                                <div className={styles.commMeta}>
                                    <span>👤 {item.author}</span>
                                    <span>📅 {item.date}</span>
                                </div>
                                <span className={styles.audienceTag}>{item.audience}</span>
                            </div>
                            <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
                                <button className={styles.btnSmall} onClick={() => openNewsDraft(item)}>Editar</button>
                                <button className={styles.btnSmall} onClick={() => handleNewsStats(item)}>Estadísticas</button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Tab 2: Boletines */}
            {activeTab === 'boletines' && (
                <div className={styles.sectionGrid}>
                    <div className={styles.glassCard} style={{ gridColumn: 'span 2' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <h2 className={styles.cardTitle}>Boletrín Informativo Semanal</h2>
                                <p className={styles.cardMeta}>Personaliza y genera el resumen oficial del club.</p>
                            </div>
                            <button className={styles.btn} onClick={autoGenerateNewsletter}>
                                ✨ Generación Automática
                            </button>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: newsletterStep === 3 ? '1fr' : '300px 1fr', gap: '24px', marginTop: '24px' }}>
                            {newsletterStep < 3 && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                    <div>
                                        <p className={styles.formLabel}>Configuración Visual</p>
                                        <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                                            <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: 'var(--color-accent)', cursor: 'pointer', border: '2px solid white' }}></div>
                                            <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: '#1e3a8a', cursor: 'pointer' }}></div>
                                            <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: '#111827', cursor: 'pointer' }}></div>
                                        </div>
                                    </div>
                                    <div>
                                        <p className={styles.formLabel}>Secciones Incluidas</p>
                                        <label style={{ display: 'flex', gap: '8px', fontSize: '13px', marginTop: '8px' }}>
                                            <input type="checkbox" defaultChecked /> Próximos Partidos
                                        </label>
                                        <label style={{ display: 'flex', gap: '8px', fontSize: '13px', marginTop: '8px' }}>
                                            <input type="checkbox" defaultChecked /> Resultados de la Semana
                                        </label>
                                        <label style={{ display: 'flex', gap: '8px', fontSize: '13px', marginTop: '8px' }}>
                                            <input type="checkbox" /> Tabla de Posiciones
                                        </label>
                                        <label style={{ display: 'flex', gap: '8px', fontSize: '13px', marginTop: '8px' }}>
                                            <input type="checkbox" defaultChecked /> Sponsors Destacados
                                        </label>
                                    </div>
                                    <button className={styles.btnSmall} onClick={() => setNewsletterStep(3)}>Vista Previa Completa</button>
                                </div>
                            )}

                            <div style={{
                                minHeight: '400px',
                                background: newsletterStep === 2 ? 'var(--color-bg-secondary)' : 'rgba(0,0,0,0.2)',
                                borderRadius: '16px',
                                padding: '32px',
                                border: '1px solid var(--club-stroke)',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center'
                            }}>
                                {newsletterStep === 1 && (
                                    <div style={{ textAlign: 'center', opacity: 0.5, marginTop: '80px' }}>
                                        <p>Selecciona bloques o usa "Generación Automática" para comenzar.</p>
                                    </div>
                                )}
                                {newsletterStep >= 2 && (
                                    <div style={{ width: '100%', maxWidth: '500px', background: 'white', color: '#111', padding: '40px', borderRadius: '4px', boxShadow: '0 20px 40px rgba(0,0,0,0.4)' }}>
                                        <div style={{ textAlign: 'center', borderBottom: '2px solid #eee', paddingBottom: '20px' }}>
                                            <h1 style={{ fontSize: '24px', margin: 0 }}>G22 CLUB NEWS</h1>
                                            <p style={{ fontSize: '12px', color: '#666' }}>Resumen Semanal — {new Date().toLocaleDateString()}</p>
                                        </div>
                                        <div style={{ marginTop: '20px' }}>
                                            <h4 style={{ borderLeft: '4px solid var(--color-accent)', paddingLeft: '10px' }}>LO QUE SE VIENE</h4>
                                            <div style={{ fontSize: '14px', padding: '10px', background: '#f9f9f9', marginBottom: '10px' }}>
                                                <strong>Primera vs Newman</strong> — Sábado 15:30 (Local)
                                            </div>
                                            <div style={{ fontSize: '14px', padding: '10px', background: '#f9f9f9' }}>
                                                <strong>M19 vs CASI</strong> — Domingo 11:00 (Visitante)
                                            </div>
                                        </div>
                                        <div style={{ marginTop: '20px', textAlign: 'center' }}>
                                            <button
                                                style={{ background: 'var(--color-accent)', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '4px', fontWeight: 600 }}
                                                onClick={() => alert('Abriendo detalle completo del boletín.')}
                                            >
                                                Ver todos los detalles
                                            </button>
                                        </div>
                                    </div>
                                )}
                                {newsletterStep === 3 && (
                                    <button className={styles.btn} style={{ marginTop: '32px' }} onClick={() => { alert('Newsletter enviado a todos los socios activos.'); setNewsletterStep(1); }}>
                                        Enviar a 1,240 Suscriptores
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Tab 3: Eventos */}
            {activeTab === 'eventos' && (
                <div className={styles.glassCard}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                        <h2 className={styles.cardTitle}>Agenda Oficial de Eventos</h2>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <select className={styles.formInput} style={{ padding: '4px 12px' }} value={eventFilterSport} onChange={e => setEventFilterSport(e.target.value)}>
                                <option value="all">Todos los Deportes</option>
                                <option value="Global">Global Club</option>
                                <option value="Rugby">Rugby</option>
                                <option value="Fútbol">Fútbol</option>
                                <option value="Hockey">Hockey</option>
                            </select>
                        </div>
                    </div>

                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>Tipo</th>
                                <th>Evento / Denominación</th>
                                <th>Ámbito</th>
                                <th>Fecha / Hora</th>
                                <th>Ubicación</th>
                                <th>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredEvents.map(ev => (
                                <tr key={ev.id}>
                                    <td>
                                        <span className={styles.badge} style={{
                                            background: ev.type === 'Partido' ? 'rgba(59, 130, 246, 0.1)' :
                                                ev.type === 'Asamblea' ? 'rgba(168, 85, 247, 0.1)' :
                                                    ev.type === 'Elección' ? 'rgba(234, 179, 8, 0.1)' : 'rgba(255,255,255,0.05)',
                                            color: ev.type === 'Partido' ? '#3b82f6' :
                                                ev.type === 'Asamblea' ? '#a855f7' :
                                                    ev.type === 'Elección' ? '#eab308' : 'white'
                                        }}>
                                            {ev.type}
                                        </span>
                                    </td>
                                    <td style={{ fontWeight: 600 }}>{ev.name}</td>
                                    <td>
                                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                                            <span style={{ fontSize: '13px' }}>{ev.sport}</span>
                                            <span style={{ fontSize: '11px', opacity: 0.6 }}>{ev.div}</span>
                                        </div>
                                    </td>
                                    <td className={styles.mono}>{ev.date}</td>
                                    <td>{ev.venue}</td>
                                    <td>
                                        <button className={styles.btnSmall} onClick={() => handleEventNotify(ev.name)}>Notificar</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Tab 4: Archivo */}
            {activeTab === 'archivo' && (
                <div className={styles.glassCard}>
                    <div className={styles.emptyPlaceholder}>
                        <span style={{ fontSize: '48px' }}>📦</span>
                        <h3>Archivo Histórico de Comunicaciones</h3>
                        <p>Registro inmutable de toda la actividad de prensa del club.</p>
                        <button className={styles.btnGhost} style={{ marginTop: '16px' }} onClick={() => alert('Mostrando historico completo de comunicaciones.')}>Consultar histórico completo</button>
                    </div>
                </div>
            )}
        </SectionShell>
    );
}




