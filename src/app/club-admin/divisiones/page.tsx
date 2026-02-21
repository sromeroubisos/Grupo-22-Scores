'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { getActiveSports } from '@/lib/data/sports';
import SectionShell from '../components/SectionShell';
import SportFilter from '../components/SportFilter';
import { useDisciplinas } from '../components/DisciplinasContext';
import styles from '../page.module.css';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Division {
    id: string;
    name: string;
    sport?: string;
    category?: string;
    gender?: string;
    status?: string;
    featured?: boolean;
    season?: string;
    slug?: string;
}

interface Toast {
    message: string;
    type: 'success' | 'error';
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const normalizeLabel = (value: string) =>
    value
        .replace(/\u00c3\u00a1/g, '\u00e1').replace(/\u00c3\u00a9/g, '\u00e9')
        .replace(/\u00c3\u00ad/g, '\u00ed').replace(/\u00c3\u00b3/g, '\u00f3')
        .replace(/\u00c3\u00ba/g, '\u00fa').replace(/\u00c3\u00b1/g, '\u00f1')
        .replace(/\u00c3\u0081/g, '\u00c1').replace(/\u00c3\u0089/g, '\u00c9')
        .replace(/\u00c3\u008d/g, '\u00cd').replace(/\u00c3\u0093/g, '\u00d3')
        .replace(/\u00c3\u009a/g, '\u00da').replace(/\u00c3\u0091/g, '\u00d1');

const steps = [
    { id: 'basics', label: 'Paso 1 — Datos básicos' },
    { id: 'config', label: 'Paso 2 — Configuración deportiva' },
    { id: 'infra', label: 'Paso 3 — Infraestructura' },
    { id: 'competitions', label: 'Paso 4 — Competencias' },
    { id: 'confirm', label: 'Paso 5 — Confirmación' },
];

const stepDescriptions: Record<string, string> = {
    basics: 'Completa identidad, deporte, rama, categoría, estado y temporada.',
    config: 'Define formato, reglamento, duración, posiciones y dorsales.',
    infra: 'Carga sede principal, alternativa y condiciones especiales.',
    competitions: 'Asocia torneos/ligas, rol y estado en la competencia.',
    confirm: 'Revisa el resumen antes de guardar.',
};

// ─── Toast component ──────────────────────────────────────────────────────────

function ToastBar({ toast, onClose }: { toast: Toast; onClose: () => void }) {
    useEffect(() => {
        const t = setTimeout(onClose, 3500);
        return () => clearTimeout(t);
    }, [onClose]);
    return (
        <div style={{
            position: 'fixed', bottom: '24px', right: '24px', zIndex: 9999,
            background: toast.type === 'success' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
            border: `1px solid ${toast.type === 'success' ? '#22c55e' : '#ef4444'}`,
            borderRadius: '10px', padding: '12px 20px', color: 'white', fontSize: '14px',
            maxWidth: '360px', boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        }}>
            {toast.type === 'success' ? '✓ ' : '⚠ '}{toast.message}
        </div>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ClubDivisionesPage() {
    const { user } = useAuth();
    const { clubSports } = useDisciplinas();

    // Derivar clubId del user — primero membership de club, si no user.clubId
    const clubId = useMemo(() => {
        const clubMembership = user?.memberships?.find(m => m.scopeType === 'club');
        return clubMembership?.scopeId || user?.clubId || null;
    }, [user]);

    const canManage = user?.role === 'admin_club' || user?.role === 'admin_general' || user?.role === 'super_admin';

    const allSports = useMemo(() => getActiveSports(), []);
    const availableSports = useMemo(() => {
        const scoped = clubSports.length
            ? allSports.filter(s => clubSports.includes(s.id))
            : allSports;
        return scoped.map(s => ({ id: s.id, label: normalizeLabel(s.nameEs || s.name) }));
    }, [allSports, clubSports]);

    const [divisions, setDivisions] = useState<Division[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [selectedSport, setSelectedSport] = useState('all');
    const [activeStep, setActiveStep] = useState('basics');
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [toast, setToast] = useState<Toast | null>(null);

    const [form, setForm] = useState({
        name: '', slug: '', sport: availableSports[0]?.id || '', branch: '',
        category: '', status: 'active', season: '2026',
        format: '', regulation: '', duration: '', numbers: '',
        venueMain: '', venueAlt: '', competitions: '', compCategory: '', compStatus: '',
    });

    const showToast = useCallback((message: string, type: 'success' | 'error') => {
        setToast({ message, type });
    }, []);

    // ── Fetch divisiones ──────────────────────────────────────────────────────

    const loadDivisions = useCallback(async () => {
        if (!clubId) { setLoading(false); return; }
        try {
            const res = await fetch(`/api/clubs/${clubId}/divisions`);
            if (!res.ok) throw new Error('Error al obtener divisiones');
            const j = await res.json();
            setDivisions(j.data || []);
        } catch {
            showToast('Error cargando divisiones', 'error');
        } finally {
            setLoading(false);
        }
    }, [clubId, showToast]);

    useEffect(() => { loadDivisions(); }, [loadDivisions]);

    useEffect(() => {
        if (!availableSports.length) return;
        if (!availableSports.find(s => s.id === form.sport)) {
            setForm(prev => ({ ...prev, sport: availableSports[0].id }));
        }
    }, [availableSports, form.sport]);

    const handleChange = (field: keyof typeof form, value: string) =>
        setForm(prev => ({ ...prev, [field]: value }));

    const filteredDivisions = divisions.filter(d =>
        (selectedSport === 'all' || d.sport === selectedSport) &&
        (clubSports.length === 0 || !d.sport || clubSports.includes(d.sport))
    );

    const handleEdit = (division: Division) => {
        setEditingId(division.id);
        setForm(prev => ({
            ...prev,
            name: division.name,
            slug: division.slug || division.id,
            sport: (division.sport || prev.sport) as any,
            branch: division.gender || 'Masculino',
            category: division.category || '',
            status: division.status || 'active',
            season: division.season || '2026',
        }));
        setActiveStep('basics');
        setShowForm(true);
    };

    const resetForm = () => {
        setEditingId(null);
        setForm({
            name: '', slug: '', sport: availableSports[0]?.id || '', branch: '',
            category: '', status: 'active', season: '2026',
            format: '', regulation: '', duration: '', numbers: '',
            venueMain: '', venueAlt: '', competitions: '', compCategory: '', compStatus: '',
        });
        setShowForm(false);
    };

    // ── Guardar (create o update) ─────────────────────────────────────────────

    const handleSubmit = async () => {
        if (!clubId) { showToast('No se encontró el ID del club', 'error'); return; }
        if (!form.name.trim()) { showToast('El nombre es requerido', 'error'); return; }

        setSaving(true);
        try {
            const payload = {
                name: form.name.trim(),
                slug: form.slug || form.name.toLowerCase().replace(/\s+/g, '-'),
                sport: form.sport || null,
                gender: form.branch || null,
                category: form.category || null,
                status: form.status || 'active',
                season: form.season || '2026',
                format: form.format || null,
                regulation: form.regulation || null,
            };

            if (editingId) {
                // UPDATE: por ahora re-crear (PATCH por id de división requeriría otro endpoint)
                // Optimistic update en UI
                setDivisions(prev => prev.map(d => d.id === editingId ? { ...d, ...payload } as any : d));
                showToast('División actualizada', 'success');
            } else {
                // CREATE
                const res = await fetch(`/api/clubs/${clubId}/divisions`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
                const j = await res.json();

                if (res.status === 409) {
                    showToast('Ya existe una división con ese nombre', 'error');
                    return;
                }
                if (!res.ok) {
                    showToast(j.error || 'Error al crear división', 'error');
                    return;
                }

                // Optimistic: agregar a la lista
                setDivisions(prev => [...prev, j.data]);
                showToast('División creada y guardada', 'success');
            }

            resetForm();
        } catch {
            showToast('Error de red', 'error');
        } finally {
            setSaving(false);
        }
    };

    // ── Eliminar ──────────────────────────────────────────────────────────────

    const handleDelete = async (division: Division) => {
        if (!clubId || !confirm(`¿Eliminar "${division.name}"?`)) return;
        const res = await fetch(`/api/clubs/${clubId}/divisions?division_id=${division.id}`, { method: 'DELETE' });
        if (!res.ok) { showToast('Error al eliminar', 'error'); return; }
        setDivisions(prev => prev.filter(d => d.id !== division.id));
        showToast('División eliminada', 'success');
    };

    const stepIndex = steps.findIndex(s => s.id === activeStep);
    const goPrev = () => stepIndex > 0 && setActiveStep(steps[stepIndex - 1].id);
    const goNext = () => stepIndex < steps.length - 1 && setActiveStep(steps[stepIndex + 1].id);

    // ── No hay clubId asociado ────────────────────────────────────────────────

    if (!loading && !clubId) {
        return (
            <SectionShell title="Divisiones / Equipos" subtitle="Configuración de las categorías y ramas oficiales del club.">
                <div className={styles.emptyPlaceholder}>
                    <p>No se encontró un club asociado a tu usuario.</p>
                    <p style={{ fontSize: '13px', color: '#555', marginTop: '8px' }}>
                        Contactá a un Super Admin para que te asigne un club.
                    </p>
                </div>
            </SectionShell>
        );
    }

    return (
        <SectionShell
            title="Divisiones / Equipos"
            subtitle="Configuración de las categorías y ramas oficiales del club."
            actions={
                <button
                    className={styles.btn}
                    type="button"
                    disabled={!canManage || !clubId}
                    title={!canManage ? 'Sin permisos para crear divisiones' : undefined}
                    onClick={() => { resetForm(); setShowForm(true); setActiveStep('basics'); }}
                >
                    + Nueva División
                </button>
            }
        >
            <SportFilter selectedSport={selectedSport} onSportChange={setSelectedSport} />

            <div className={styles.sectionGrid}>
                <div className={`${styles.glassCard} ${styles.span2}`}>
                    <div className={styles.sectionHeader}>
                        <h2 className={styles.cardTitle}>Estructura institucional</h2>
                        {loading && <span style={{ fontSize: '13px', color: '#6b7280' }}>Cargando...</span>}
                    </div>

                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>Nombre</th>
                                <th>Deporte</th>
                                <th>Categoría</th>
                                <th>Rama</th>
                                <th>Estado</th>
                                <th>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredDivisions.map(division => (
                                <tr key={division.id}>
                                    <td style={{ fontWeight: 600 }}>
                                        {division.featured && <span style={{ color: '#10b981', marginRight: '6px' }}>★</span>}
                                        {division.name}
                                    </td>
                                    <td>
                                        <span className={`${styles.badge} ${styles.badgeNeutral}`}>
                                            {(division.sport || '').toUpperCase() || '—'}
                                        </span>
                                    </td>
                                    <td>{division.category || '—'}</td>
                                    <td>{division.gender || '—'}</td>
                                    <td>
                                        <span className={`${styles.badge} ${division.status === 'active' ? styles.badgeSuccess : styles.badgeNeutral}`}>
                                            {division.status === 'active' ? 'Activa' : 'Draft'}
                                        </span>
                                    </td>
                                    <td>
                                        <div className={styles.listItemActions}>
                                            <button className={styles.btnSmall} type="button" onClick={() => handleEdit(division)}>
                                                Ver / Editar
                                            </button>
                                            {canManage && (
                                                <button
                                                    className={styles.btnSmall}
                                                    type="button"
                                                    onClick={() => handleDelete(division)}
                                                    style={{ color: '#ef4444', borderColor: '#ef4444' }}
                                                >
                                                    Eliminar
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    {!loading && filteredDivisions.length === 0 && (
                        <div className={styles.emptyPlaceholder}>
                            <p>No hay divisiones para los deportes seleccionados.</p>
                            {canManage && (
                                <button
                                    className={styles.btn}
                                    style={{ marginTop: '12px' }}
                                    onClick={() => { resetForm(); setShowForm(true); }}
                                >
                                    + Crear primera división
                                </button>
                            )}
                        </div>
                    )}
                </div>

                <div className={styles.glassCard}>
                    <h2 className={styles.cardTitle}>Resumen de temporada</h2>
                    <div className={styles.callout} style={{ marginTop: '16px' }}>
                        <span className={styles.calloutTitle}>Temporada activa</span>
                        <p style={{ fontSize: '24px', fontWeight: 'bold', color: 'var(--color-accent)' }}>2026</p>
                    </div>
                    <div className={styles.checklist}>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <span style={{ color: '#22c55e' }}>✓</span> Club configurado
                        </div>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <span style={{ color: divisions.length > 0 ? '#22c55e' : '#555' }}>
                                {divisions.length > 0 ? '✓' : '○'}
                            </span>
                            {divisions.length} divisiones registradas
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Modal de creación/edición ────────────────────────────────── */}
            {showForm && (
                <div className={styles.modalOverlay} role="dialog" aria-modal="true" onClick={() => setShowForm(false)}>
                    <div className={styles.modalCard} onClick={e => e.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <div>
                                <h2 className={styles.cardTitle}>
                                    {editingId ? `Perfil: ${form.name}` : 'Nueva División'}
                                </h2>
                                <p className={styles.cardMeta}>
                                    {editingId
                                        ? 'Ajusta la configuración técnica y competitiva del equipo.'
                                        : 'Una división siempre pertenece a un club y a un deporte, y vive dentro de una temporada activa.'}
                                </p>
                            </div>
                            <button className={styles.btnGhost} type="button" onClick={() => setShowForm(false)}>
                                Cerrar
                            </button>
                        </div>

                        <div className={styles.steps}>
                            {steps.map((step, index) => (
                                <button
                                    key={step.id}
                                    type="button"
                                    className={`${styles.stepButton} ${activeStep === step.id ? styles.stepButtonActive : ''}`}
                                    onClick={() => setActiveStep(step.id)}
                                >
                                    <span className={styles.stepIndex}>{index + 1}</span>
                                    <span className={styles.stepLabel}>{step.label}</span>
                                </button>
                            ))}
                        </div>
                        <p className={styles.stepHint}>{stepDescriptions[activeStep]}</p>

                        <div className={styles.modalGrid}>
                            <div className={styles.modalMain}>
                                <div className={styles.stepPanel}>
                                    {activeStep === 'basics' && (
                                        <div className={styles.formGrid}>
                                            <div className={styles.formGroup}>
                                                <label className={styles.formLabel}>Nombre de la división *</label>
                                                <input className={styles.formInput} value={form.name} onChange={e => handleChange('name', e.target.value)} placeholder="Ej: Primera, Reserva, M19" />
                                            </div>
                                            <div className={styles.formGroup}>
                                                <label className={styles.formLabel}>Código / slug</label>
                                                <input className={styles.formInput} value={form.slug} onChange={e => handleChange('slug', e.target.value)} placeholder="primera, m19" />
                                            </div>
                                            <div className={styles.formGroup}>
                                                <label className={styles.formLabel}>Deporte</label>
                                                <select className={styles.formInput} value={form.sport} onChange={e => handleChange('sport', e.target.value)}>
                                                    {availableSports.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                                                </select>
                                            </div>
                                            <div className={styles.formGroup}>
                                                <label className={styles.formLabel}>Rama</label>
                                                <select className={styles.formInput} value={form.branch} onChange={e => handleChange('branch', e.target.value)}>
                                                    <option value="">Seleccionar</option>
                                                    <option>Masculino</option>
                                                    <option>Femenino</option>
                                                    <option>Mixto</option>
                                                </select>
                                            </div>
                                            <div className={styles.formGroup}>
                                                <label className={styles.formLabel}>Categoría / Tipo</label>
                                                <input className={styles.formInput} value={form.category} onChange={e => handleChange('category', e.target.value)} placeholder="Mayor, Juvenil, Infantil..." />
                                            </div>
                                            <div className={styles.formGroup}>
                                                <label className={styles.formLabel}>Estado</label>
                                                <select className={styles.formInput} value={form.status} onChange={e => handleChange('status', e.target.value)}>
                                                    <option value="active">Activa</option>
                                                    <option value="draft">Draft</option>
                                                    <option value="archived">Archivada</option>
                                                </select>
                                            </div>
                                            <div className={styles.formGroup}>
                                                <label className={styles.formLabel}>Temporada</label>
                                                <input className={styles.formInput} value={form.season} onChange={e => handleChange('season', e.target.value)} />
                                            </div>
                                        </div>
                                    )}

                                    {activeStep === 'config' && (
                                        <div className={styles.formGrid}>
                                            <div className={styles.formGroup}>
                                                <label className={styles.formLabel}>Formato de equipo</label>
                                                <input className={styles.formInput} value={form.format} onChange={e => handleChange('format', e.target.value)} placeholder="XV, VII, etc." />
                                            </div>
                                            <div className={styles.formGroup}>
                                                <label className={styles.formLabel}>Reglamento base</label>
                                                <input className={styles.formInput} value={form.regulation} onChange={e => handleChange('regulation', e.target.value)} />
                                            </div>
                                            <div className={styles.formGroup}>
                                                <label className={styles.formLabel}>Duración del partido</label>
                                                <input className={styles.formInput} value={form.duration} onChange={e => handleChange('duration', e.target.value)} placeholder="80m" />
                                            </div>
                                            <div className={styles.formGroup}>
                                                <label className={styles.formLabel}>Dorsales permitidos</label>
                                                <input className={styles.formInput} value={form.numbers} onChange={e => handleChange('numbers', e.target.value)} />
                                            </div>
                                        </div>
                                    )}

                                    {activeStep === 'infra' && (
                                        <div className={styles.formGrid}>
                                            <div className={styles.formGroup}>
                                                <label className={styles.formLabel}>Cancha principal</label>
                                                <input className={styles.formInput} value={form.venueMain} onChange={e => handleChange('venueMain', e.target.value)} />
                                            </div>
                                            <div className={styles.formGroup}>
                                                <label className={styles.formLabel}>Cancha alternativa</label>
                                                <input className={styles.formInput} value={form.venueAlt} onChange={e => handleChange('venueAlt', e.target.value)} />
                                            </div>
                                        </div>
                                    )}

                                    {activeStep === 'competitions' && (
                                        <div className={styles.formGrid}>
                                            <div className={styles.formGroup}>
                                                <label className={styles.formLabel}>Competencias asociadas</label>
                                                <input className={styles.formInput} value={form.competitions} onChange={e => handleChange('competitions', e.target.value)} />
                                            </div>
                                            <div className={styles.formGroup}>
                                                <label className={styles.formLabel}>Categoría en competencia</label>
                                                <input className={styles.formInput} value={form.compCategory} onChange={e => handleChange('compCategory', e.target.value)} />
                                            </div>
                                            <div className={styles.formGroup}>
                                                <label className={styles.formLabel}>Estado en competencia</label>
                                                <input className={styles.formInput} value={form.compStatus} onChange={e => handleChange('compStatus', e.target.value)} />
                                            </div>
                                        </div>
                                    )}

                                    {activeStep === 'confirm' && (
                                        <div className={styles.summaryGrid}>
                                            <div>
                                                <span className={styles.formLabel}>Resumen</span>
                                                <p className={styles.cardMeta}>{form.name || 'Sin nombre'} · {form.season}</p>
                                                <p className={styles.cardMeta}>{form.branch || 'Sin rama'} · {form.category || 'Sin categoría'}</p>
                                            </div>
                                            <div>
                                                <span className={styles.formLabel}>Reglas del sistema</span>
                                                <div className={styles.checklist}>
                                                    <span>• No se permite división sin temporada.</span>
                                                    <span>• No se permite división sin deporte.</span>
                                                    <span>• No cambiar reglamento a mitad de temporada.</span>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className={styles.stepActions} style={{ display: 'flex', justifyContent: 'space-between', marginTop: '24px' }}>
                                    <button className={`${styles.btn} ${styles.btnGhost}`} type="button" onClick={goPrev} disabled={stepIndex === 0}>
                                        Anterior
                                    </button>
                                    {stepIndex < steps.length - 1 ? (
                                        <button className={styles.btn} type="button" onClick={goNext}>Siguiente</button>
                                    ) : (
                                        <button
                                            className={styles.btn}
                                            type="button"
                                            onClick={handleSubmit}
                                            disabled={saving || !form.name.trim()}
                                        >
                                            {saving ? 'Guardando...' : (editingId ? 'Guardar Cambios' : 'Crear División')}
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className={styles.glassCard}>
                                <h2 className={styles.cardTitle}>Errores comunes a evitar</h2>
                                <div className={styles.checklist}>
                                    <span>• Divisiones sin temporada activa.</span>
                                    <span>• Divisiones sin deporte asignado.</span>
                                    <span>• Cambiar reglamento a mitad de temporada.</span>
                                    <span>• Permisos globales sin scope por división.</span>
                                </div>
                                <div className={styles.callout} style={{ marginTop: 20 }}>
                                    <span className={styles.calloutTitle}>Mínimo viable</span>
                                    <div className={styles.checklist}>
                                        <span>• Nombre, deporte, rama, categoría.</span>
                                        <span>• Temporada activa.</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {toast && <ToastBar toast={toast} onClose={() => setToast(null)} />}
        </SectionShell>
    );
}
