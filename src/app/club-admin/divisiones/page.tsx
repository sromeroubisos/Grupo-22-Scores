'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/lib/mock-db';
import { getActiveSports } from '@/lib/data/sports';
import SectionShell from '../components/SectionShell';
import SportFilter from '../components/SportFilter';
import { useDisciplinas } from '../components/DisciplinasContext';
import styles from '../page.module.css';

const mockDivisions = [
    { id: 1, name: 'Primera División', sport: 'rugby', category: 'Superior', teams: 1 },
    { id: 2, name: 'Intermedia', sport: 'rugby', category: 'Superior', teams: 1 },
    { id: 3, name: 'M19', sport: 'rugby', category: 'Juveniles', teams: 1 },
];

const steps = [
    { id: 'basics', label: 'Paso 1 — Datos básicos' },
    { id: 'config', label: 'Paso 2 — Configuración deportiva' },
    { id: 'infra', label: 'Paso 3 — Infraestructura' },
    { id: 'competitions', label: 'Paso 4 — Competencias' },
    { id: 'confirm', label: 'Paso 5 — Confirmación' },
];

const stepDescriptions: Record<string, string> = {
    basics: 'Completa identidad, club, deporte, rama, categoría, estado y temporada.',
    config: 'Define formato, reglamento, duración, posiciones y dorsales.',
    infra: 'Carga sede principal, alternativa y condiciones especiales.',
    competitions: 'Asocia torneos/ligas, rol y estado en la competencia.',
    confirm: 'Revisa el resumen y valida reglas del sistema antes de crear.',
};

const normalizeLabel = (value: string) => value
    .replace(/\u00c3\u00a1/g, '\u00e1')
    .replace(/\u00c3\u00a9/g, '\u00e9')
    .replace(/\u00c3\u00ad/g, '\u00ed')
    .replace(/\u00c3\u00b3/g, '\u00f3')
    .replace(/\u00c3\u00ba/g, '\u00fa')
    .replace(/\u00c3\u00b1/g, '\u00f1')
    .replace(/\u00c3\u0081/g, '\u00c1')
    .replace(/\u00c3\u0089/g, '\u00c9')
    .replace(/\u00c3\u008d/g, '\u00cd')
    .replace(/\u00c3\u0093/g, '\u00d3')
    .replace(/\u00c3\u009a/g, '\u00da')
    .replace(/\u00c3\u0091/g, '\u00d1')
    .replace(/\u00e2\u0080\u0094/g, '\u2014')
    .replace(/\u00e2\u0080\u00a2/g, '\u2022');

export default function ClubDivisionesPage() {
    const { user } = useAuth();
    const club = db.clubs.find((c) => c.id === user?.clubId);
    const { clubSports } = useDisciplinas();
    const [selectedSport, setSelectedSport] = useState('all');
    const [activeStep, setActiveStep] = useState('basics');
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const canManage = user?.role === 'admin_club' || user?.role === 'admin_general';

    const allSports = useMemo(() => getActiveSports(), []);
    const availableSports = useMemo(() => {
        const scoped = clubSports.length
            ? allSports.filter((sport) => clubSports.includes(sport.id))
            : allSports;
        return scoped.map((sport) => ({
            id: sport.id,
            label: normalizeLabel(sport.nameEs || sport.name),
        }));
    }, [allSports, clubSports]);

    const [form, setForm] = useState({
        name: '',
        slug: '',
        sport: availableSports[0]?.id || '',
        branch: '',
        category: '',
        status: 'Activa',
        season: '2026',
        format: '',
        regulation: '',
        duration: '',
        numbers: '',
        venueMain: '',
        venueAlt: '',
        competitions: '',
        compCategory: '',
        compStatus: '',
    });

    useEffect(() => {
        if (!availableSports.length) return;
        if (!availableSports.find((sport) => sport.id === form.sport)) {
            setForm((prev) => ({ ...prev, sport: availableSports[0].id }));
        }
    }, [availableSports, form.sport]);

    const handleChange = (field: keyof typeof form, value: string) => {
        setForm((prev) => ({ ...prev, [field]: value }));
    };

    const filteredDivisions = mockDivisions.filter((division) =>
        (selectedSport === 'all' || division.sport === selectedSport) &&
        (clubSports.length === 0 || clubSports.includes(division.sport))
    );

    const handleEdit = (division: any) => {
        setEditingId(division.id);
        setForm({
            name: division.name,
            slug: division.id,
            sport: division.sport,
            branch: 'Masculino',
            category: division.category,
            status: 'Activa',
            season: '2026',
            format: 'XV',
            regulation: '',
            duration: '80m',
            numbers: 'Oficial',
            venueMain: 'Sede Principal',
            venueAlt: '',
            competitions: 'Torneo Local',
            compCategory: 'Superior',
            compStatus: 'Inscrito',
        });
        setActiveStep('basics');
        setShowForm(true);
    };

    const resetForm = () => {
        setEditingId(null);
        setForm({
            name: '',
            slug: '',
            sport: availableSports[0]?.id || '',
            branch: '',
            category: '',
            status: 'Activa',
            season: '2026',
            format: '',
            regulation: '',
            duration: '',
            numbers: '',
            venueMain: '',
            venueAlt: '',
            competitions: '',
            compCategory: '',
            compStatus: '',
        });
        setShowForm(false);
    };

    const stepIndex = steps.findIndex((step) => step.id === activeStep);
    const goPrev = () => stepIndex > 0 && setActiveStep(steps[stepIndex - 1].id);
    const goNext = () => stepIndex < steps.length - 1 && setActiveStep(steps[stepIndex + 1].id);

    return (
        <SectionShell
            title="Divisiones / Equipos"
            subtitle="Configuración de las categorías y ramas oficiales del club."
            actions={
                <button
                    className={styles.btn}
                    type="button"
                    disabled={!canManage}
                    title={!canManage ? 'Sin permisos para crear divisiones' : undefined}
                    onClick={() => {
                        resetForm();
                        setShowForm(true);
                        setActiveStep('basics');
                    }}
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
                    </div>

                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>Nombre</th>
                                <th>Deporte</th>
                                <th>Categoría</th>
                                <th>Equipos</th>
                                <th>Estado</th>
                                <th>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredDivisions.map((division) => (
                                <tr key={division.id}>
                                    <td style={{ fontWeight: 600 }}>{division.name}</td>
                                    <td>
                                        <span className={`${styles.badge} ${styles.badgeNeutral}`}>
                                            {division.sport.toUpperCase()}
                                        </span>
                                    </td>
                                    <td>{division.category}</td>
                                    <td>{division.teams}</td>
                                    <td>
                                        <span className={`${styles.badge} ${styles.badgeSuccess}`}>Activa</span>
                                    </td>
                                    <td>
                                        <div className={styles.listItemActions}>
                                            <button
                                                className={styles.btnSmall}
                                                type="button"
                                                onClick={() => handleEdit(division)}
                                            >
                                                Ver Perfil / Editar
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    {filteredDivisions.length === 0 && (
                        <div className={styles.emptyPlaceholder}>
                            <p>No hay divisiones cargadas para los deportes seleccionados.</p>
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
                            <span style={{ color: '#22c55e' }}>✓</span> Disciplinas vinculadas
                        </div>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <span style={{ color: selectedSport !== 'all' ? '#22c55e' : '#555' }}>
                                {selectedSport !== 'all' ? '✓' : '○'} Deporte seleccionado
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {showForm && (
                <div
                    className={styles.modalOverlay}
                    role="dialog"
                    aria-modal="true"
                    onClick={() => setShowForm(false)}
                >
                    <div className={styles.modalCard} onClick={(event) => event.stopPropagation()}>
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
                                                <label className={styles.formLabel}>Nombre de la división</label>
                                                <input className={styles.formInput} value={form.name} onChange={(e) => handleChange('name', e.target.value)} />
                                                <span className={styles.helpText}>Ej: Primera, Reserva, M19, Femenino.</span>
                                            </div>
                                            <div className={styles.formGroup}>
                                                <label className={styles.formLabel}>Código / slug</label>
                                                <input className={styles.formInput} value={form.slug} onChange={(e) => handleChange('slug', e.target.value)} />
                                                <span className={styles.helpText}>Usá minúsculas sin espacios (primera, m19).</span>
                                            </div>
                                            <div className={styles.formGroup}>
                                                <label className={styles.formLabel}>Club</label>
                                                <input className={styles.formInput} value={club?.name || 'Club'} readOnly />
                                                <span className={styles.helpText}>Se asigna automáticamente al club actual.</span>
                                            </div>
                                            <div className={styles.formGroup}>
                                                <label className={styles.formLabel}>Deporte</label>
                                                <select className={styles.formInput} value={form.sport} onChange={(e) => handleChange('sport', e.target.value)}>
                                                    {availableSports.map((sport) => (
                                                        <option key={sport.id} value={sport.id}>{sport.label}</option>
                                                    ))}
                                                </select>
                                                <span className={styles.helpText}>Debe estar activo en Disciplinas.</span>
                                            </div>
                                            <div className={styles.formGroup}>
                                                <label className={styles.formLabel}>Rama</label>
                                                <select className={styles.formInput} value={form.branch} onChange={(e) => handleChange('branch', e.target.value)}>
                                                    <option value="">Seleccionar</option>
                                                    <option value="Masculino">Masculino</option>
                                                    <option value="Femenino">Femenino</option>
                                                    <option value="Mixto">Mixto</option>
                                                </select>
                                                <span className={styles.helpText}>Masculino, femenino o mixto.</span>
                                            </div>
                                            <div className={styles.formGroup}>
                                                <label className={styles.formLabel}>Categoría / Tipo</label>
                                                <input className={styles.formInput} value={form.category} onChange={(e) => handleChange('category', e.target.value)} />
                                                <span className={styles.helpText}>Mayor, juvenil, infantil, seven, reserva.</span>
                                            </div>
                                            <div className={styles.formGroup}>
                                                <label className={styles.formLabel}>Estado</label>
                                                <input className={styles.formInput} value={form.status} onChange={(e) => handleChange('status', e.target.value)} />
                                                <span className={styles.helpText}>Activa, inactiva o archivada.</span>
                                            </div>
                                            <div className={styles.formGroup}>
                                                <label className={styles.formLabel}>Temporada activa</label>
                                                <input className={styles.formInput} value={form.season} onChange={(e) => handleChange('season', e.target.value)} />
                                                <span className={styles.helpText}>Año de la temporada (ej: 2026).</span>
                                            </div>
                                        </div>
                                    )}

                                    {activeStep === 'config' && (
                                        <div className={styles.formGrid}>
                                            <div className={styles.formGroup}>
                                                <label className={styles.formLabel}>Formato de equipo</label>
                                                <input className={styles.formInput} value={form.format} onChange={(e) => handleChange('format', e.target.value)} />
                                            </div>
                                            <div className={styles.formGroup}>
                                                <label className={styles.formLabel}>Reglamento base</label>
                                                <input className={styles.formInput} value={form.regulation} onChange={(e) => handleChange('regulation', e.target.value)} />
                                            </div>
                                            <div className={styles.formGroup}>
                                                <label className={styles.formLabel}>Duración del partido</label>
                                                <input className={styles.formInput} value={form.duration} onChange={(e) => handleChange('duration', e.target.value)} />
                                            </div>
                                            <div className={styles.formGroup}>
                                                <label className={styles.formLabel}>Dorsales permitidos</label>
                                                <input className={styles.formInput} value={form.numbers} onChange={(e) => handleChange('numbers', e.target.value)} />
                                            </div>
                                        </div>
                                    )}

                                    {activeStep === 'infra' && (
                                        <div className={styles.formGrid}>
                                            <div className={styles.formGroup}>
                                                <label className={styles.formLabel}>Cancha principal</label>
                                                <input className={styles.formInput} value={form.venueMain} onChange={(e) => handleChange('venueMain', e.target.value)} />
                                            </div>
                                            <div className={styles.formGroup}>
                                                <label className={styles.formLabel}>Cancha alternativa</label>
                                                <input className={styles.formInput} value={form.venueAlt} onChange={(e) => handleChange('venueAlt', e.target.value)} />
                                            </div>
                                        </div>
                                    )}

                                    {activeStep === 'competitions' && (
                                        <div className={styles.formGrid}>
                                            <div className={styles.formGroup}>
                                                <label className={styles.formLabel}>Competencias asociadas</label>
                                                <input className={styles.formInput} value={form.competitions} onChange={(e) => handleChange('competitions', e.target.value)} />
                                            </div>
                                            <div className={styles.formGroup}>
                                                <label className={styles.formLabel}>Categoría en competencia</label>
                                                <input className={styles.formInput} value={form.compCategory} onChange={(e) => handleChange('compCategory', e.target.value)} />
                                            </div>
                                            <div className={styles.formGroup}>
                                                <label className={styles.formLabel}>Estado en competencia</label>
                                                <input className={styles.formInput} value={form.compStatus} onChange={(e) => handleChange('compStatus', e.target.value)} />
                                            </div>
                                        </div>
                                    )}

                                    {activeStep === 'confirm' && (
                                        <div className={styles.summaryGrid}>
                                            <div>
                                                <span className={styles.formLabel}>Resumen</span>
                                                <p className={styles.cardMeta}>
                                                    {form.name || 'Nombre de la división'} • {form.season || 'Temporada'}
                                                </p>
                                                <p className={styles.cardMeta}>
                                                    {form.branch || 'Rama'} • {form.category || 'Categoría'}
                                                </p>
                                            </div>
                                            <div>
                                                <span className={styles.formLabel}>Reglas del sistema</span>
                                                <div className={styles.checklist}>
                                                    <span>• No se permite una división sin temporada.</span>
                                                    <span>• No se permite una división sin deporte.</span>
                                                    <span>• No se recomienda cambiar reglamento a mitad de temporada.</span>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className={styles.stepActions} style={{ display: 'flex', justifyContent: 'space-between', marginTop: '24px' }}>
                                    <button
                                        className={`${styles.btn} ${styles.btnGhost}`}
                                        type="button"
                                        onClick={goPrev}
                                        disabled={stepIndex === 0}
                                    >
                                        Anterior
                                    </button>
                                    {stepIndex < steps.length - 1 ? (
                                        <button className={styles.btn} type="button" onClick={goNext}>
                                            Siguiente
                                        </button>
                                    ) : (
                                        <button className={styles.btn} type="button" onClick={resetForm}>
                                            {editingId ? 'Guardar Cambios y Cerrar' : 'Crear División'}
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
                                    <span className={styles.calloutTitle}>Mínimo viable (V1)</span>
                                    <div className={styles.checklist}>
                                        <span>• Nombre, club, deporte, rama, categoría.</span>
                                        <span>• Temporada activa y cancha principal.</span>
                                        <span>• Competencia asociada y formato.</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </SectionShell>
    );
}
