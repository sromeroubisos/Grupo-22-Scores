'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useDisciplinas } from '../../components/DisciplinasContext';
import SectionShell from '../../components/SectionShell';
import styles from '../../page.module.css';

type WizardStep = 1 | 2 | 3 | 4;

interface StaffData {
    firstName: string;
    lastName: string;
    dni: string;
    email: string;
    phone: string;
    sport: string;
    role: string;
    customRole: string;
    scope: 'Club' | 'Division';
    divisions: string[];
    season: string;
    status: 'Activo' | 'Inactivo' | 'Histórico';
    accessLevel: string;
    sendInvitation: boolean;
}

export default function CreateStaffPage() {
    const router = useRouter();
    const { clubSports } = useDisciplinas();
    const [step, setStep] = useState<WizardStep>(1);

    const [form, setForm] = useState<StaffData>({
        firstName: '',
        lastName: '',
        dni: '',
        email: '',
        phone: '',
        sport: 'rugby',
        role: 'Head Coach (HC)',
        customRole: '',
        scope: 'Division',
        divisions: [],
        season: '2026',
        status: 'Activo',
        accessLevel: 'Staff Técnico',
        sendInvitation: true,
    });

    const ROLES = [
        {
            group: 'Cuerpo tecnico',
            items: [
                'Manager',
                'Head Coach (HC)',
                'Entrenador asistente',
                'Coordinador ofensivo',
                'Coordinador defensivo',
                'Preparador Fisico',
                'Utilero',
                'Analista de video',
            ],
        },
    ];

    const PERMISSIONS = [
        { id: 'manager', label: 'Manager', desc: 'Gestión administrativa y logística de la división.' },
        { id: 'staff', label: 'Staff Técnico', desc: 'Gestión deportiva, plantel y entrenamientos.' },
    ];

    const MOCK_DIVISIONS = [
        { id: 'div1', name: 'Primera' },
        { id: 'div2', name: 'Intermedia' },
        { id: 'div3', name: 'M19' },
        { id: 'div4', name: 'M17' },
        { id: 'div5', name: 'M15' },
    ];

    const handleNext = () => setStep((prev) => Math.min(prev + 1, 4) as WizardStep);
    const handleBack = () => setStep((prev) => Math.max(prev - 1, 1) as WizardStep);

    const updateField = (field: keyof StaffData, value: any) => {
        setForm(prev => ({ ...prev, [field]: value }));
    };

    const toggleDivision = (id: string) => {
        const newDivs = form.divisions.includes(id)
            ? form.divisions.filter(d => d !== id)
            : [...form.divisions, id];
        updateField('divisions', newDivs);
    };

    return (
        <SectionShell
            title="Agregar cuerpo tecnico"
            subtitle="Registra un integrante del cuerpo tecnico de entrenadores."
            actions={
                <div style={{ display: 'flex', gap: '12px' }}>
                    <button className={`${styles.btnSmall} ${styles.btnGhost}`} onClick={() => router.back()}>Cancelar</button>
                    {step < 4 ? (
                        <button className={styles.btn} onClick={handleNext}>Siguiente Paso</button>
                    ) : (
                        <button className={styles.btn} onClick={() => router.push('/club-admin/staff')}>Confirmar y Crear</button>
                    )}
                </div>
            }
        >
            <div className={styles.steps} style={{ marginBottom: '40px' }}>
                {[1, 2, 3, 4].map((s) => (
                    <div
                        key={s}
                        className={`${styles.stepButton} ${step === s ? styles.stepButtonActive : ''}`}
                        onClick={() => s < step && setStep(s as WizardStep)}
                    >
                        <span className={styles.stepIndex}>{s}</span>
                        <span className={styles.stepLabel}>
                            {s === 1 && 'Identidad'}
                            {s === 2 && 'Asignación'}
                            {s === 3 && 'Permisos'}
                            {s === 4 && 'Confirmación'}
                        </span>
                    </div>
                ))}
            </div>

            <div className={styles.sectionGrid} style={{ gridTemplateColumns: '1fr' }}>
                {/* STEP 1: IDENTITY */}
                {step === 1 && (
                    <div className={styles.glassCard}>
                        <h2 className={styles.cardTitle}>PASO 1 — Identidad y Datos Básicos</h2>
                        <div className={styles.formGrid} style={{ marginTop: '24px' }}>
                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>Nombre</label>
                                <input
                                    className={styles.formInput}
                                    placeholder="Ej: Juan"
                                    value={form.firstName}
                                    onChange={e => updateField('firstName', e.target.value)}
                                />
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>Apellido</label>
                                <input
                                    className={styles.formInput}
                                    placeholder="Ej: Pérez"
                                    value={form.lastName}
                                    onChange={e => updateField('lastName', e.target.value)}
                                />
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>Deporte Principal</label>
                                <select
                                    className={styles.formInput}
                                    value={form.sport}
                                    onChange={e => updateField('sport', e.target.value)}
                                >
                                    {clubSports.map(s => (
                                        <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                                    ))}
                                </select>
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>Rol Principal</label>
                                <select
                                    className={styles.formInput}
                                    value={form.role}
                                    onChange={e => updateField('role', e.target.value)}
                                >
                                    {ROLES.map(g => (
                                        <optgroup key={g.group} label={g.group}>
                                            {g.items.map(r => <option key={r} value={r}>{r}</option>)}
                                        </optgroup>
                                    ))}
                                    <option value="Personalizado">Otro (cuerpo tecnico)</option>
                                </select>
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>DNI / ID Interno</label>
                                <input
                                    className={styles.formInput}
                                    placeholder="Sin puntos"
                                    value={form.dni}
                                    onChange={e => updateField('dni', e.target.value)}
                                />
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>Email Personal / Usuario</label>
                                <input
                                    className={styles.formInput}
                                    type="email"
                                    placeholder="staff@club.com"
                                    value={form.email}
                                    onChange={e => updateField('email', e.target.value)}
                                />
                            </div>
                        </div>
                    </div>
                )}

                {/* STEP 2: ASSIGNMENT */}
                {step === 2 && (
                    <div className={styles.glassCard}>
                        <h2 className={styles.cardTitle}>PASO 2 — Ámbito y Asignación</h2>
                        <div className={styles.formGrid} style={{ marginTop: '24px' }}>
                            <div className={styles.formGroup} style={{ gridColumn: 'span 2' }}>
                                <label className={styles.formLabel}>Ámbito de actuación en {form.sport.toUpperCase()}</label>
                                <div style={{ display: 'flex', gap: '16px', marginTop: '8px' }}>
                                    <label className={styles.uploadArea} style={{ flex: 1, padding: '16px', border: form.scope === 'Club' ? '2px solid var(--color-accent)' : '1px solid var(--club-stroke)' }}>
                                        <input type="radio" style={{ display: 'none' }} checked={form.scope === 'Club'} onChange={() => updateField('scope', 'Club')} />
                                        <h4 style={{ margin: 0 }}>Staff General</h4>
                                        <p style={{ fontSize: '11px', opacity: 0.7 }}>Para roles generales (manager, coordinadores).</p>
                                    </label>
                                    <label className={styles.uploadArea} style={{ flex: 1, padding: '16px', border: form.scope === 'Division' ? '2px solid var(--color-accent)' : '1px solid var(--club-stroke)' }}>
                                        <input type="radio" style={{ display: 'none' }} checked={form.scope === 'Division'} onChange={() => updateField('scope', 'Division')} />
                                        <h4 style={{ margin: 0 }}>Staff por División</h4>
                                        <p style={{ fontSize: '11px', opacity: 0.7 }}>Para entrenadores y staff por division.</p>
                                    </label>
                                </div>
                            </div>

                            {form.scope === 'Division' && (
                                <div className={styles.formGroup} style={{ gridColumn: 'span 2' }}>
                                    <label className={styles.formLabel} style={{ marginBottom: '12px', display: 'block' }}>Divisiones de {form.sport.toUpperCase()} asignadas</label>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                        {MOCK_DIVISIONS.map(d => (
                                            <div
                                                key={d.id}
                                                className={`${styles.scopeChip} ${form.divisions.includes(d.id) ? styles.badgeSuccess : ''}`}
                                                style={{ cursor: 'pointer', padding: '8px 12px', borderRadius: '8px', opacity: form.divisions.includes(d.id) ? 1 : 0.6 }}
                                                onClick={() => toggleDivision(d.id)}
                                            >
                                                {form.divisions.includes(d.id) && '✓ '} {d.name}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>Temporada</label>
                                <select className={styles.formInput} value={form.season} onChange={e => updateField('season', e.target.value)}>
                                    <option value="2026">2026</option>
                                    <option value="2027">2027</option>
                                </select>
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>Estado</label>
                                <select className={styles.formInput} value={form.status} onChange={e => updateField('status', e.target.value)}>
                                    <option value="Activo">Activo</option>
                                    <option value="Inactivo">Inactivo</option>
                                    <option value="Histórico">Histórico</option>
                                </select>
                            </div>
                        </div>
                    </div>
                )}

                {/* STEP 3: PERMISSIONS */}
                {step === 3 && (
                    <div className={styles.glassCard}>
                        <h2 className={styles.cardTitle}>PASO 3 — Permisos y Acceso a Plataforma</h2>
                        <p className={styles.cardMeta}>Define qué podrá hacer esta persona en su panel de equipo.</p>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '24px' }}>
                            {PERMISSIONS.map(p => (
                                <label
                                    key={p.id}
                                    className={styles.uploadArea}
                                    style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        padding: '16px 24px',
                                        textAlign: 'left',
                                        border: form.accessLevel === p.label ? '1px solid var(--color-accent)' : '1px solid var(--club-stroke-soft)',
                                        background: form.accessLevel === p.label ? 'rgba(var(--color-accent-rgb), 0.05)' : 'transparent'
                                    }}
                                >
                                    <div>
                                        <h4 style={{ margin: 0 }}>{p.label}</h4>
                                        <p style={{ fontSize: '12px', opacity: 0.7, margin: '4px 0 0' }}>{p.desc}</p>
                                    </div>
                                    <input
                                        type="radio"
                                        name="accessLevel"
                                        checked={form.accessLevel === p.label}
                                        onChange={() => updateField('accessLevel', p.label)}
                                    />
                                </label>
                            ))}
                        </div>

                        <div className={styles.callout} style={{ marginTop: '32px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <span className={styles.calloutTitle}>Habilitar plataforma de staff</span>
                                    <p style={{ fontSize: '13px', opacity: 0.8 }}>
                                        Se creará un acceso vinculado a <strong>{form.email || '(email no definido)'}</strong>.
                                        Podrá gestionar la asistencia y convocatorias de sus divisiones.
                                    </p>
                                </div>
                                <input
                                    type="checkbox"
                                    style={{ width: '20px', height: '20px' }}
                                    checked={form.sendInvitation}
                                    onChange={e => updateField('sendInvitation', e.target.checked)}
                                />
                            </div>
                        </div>
                    </div>
                )}

                {/* STEP 4: CONFIRMATION */}
                {step === 4 && (
                    <div className={styles.glassCard}>
                        <h2 className={styles.cardTitle}>PASO 4 — Confirmación Final</h2>

                        <div className={styles.summaryGrid} style={{ marginTop: '24px' }}>
                            <div style={{ gridColumn: 'span 2', display: 'flex', gap: '20px', alignItems: 'center', padding: '20px', background: 'var(--club-panel-inner)', borderRadius: '16px' }}>
                                <div className={styles.avatar} style={{ width: '64px', height: '64px', fontSize: '24px' }}>
                                    {form.firstName[0]}{form.lastName[0]}
                                </div>
                                <div>
                                    <h3 style={{ margin: 0 }}>{form.firstName} {form.lastName}</h3>
                                    <p style={{ opacity: 0.6 }}>
                                        {form.role === 'Personalizado' ? form.customRole : form.role} • {form.sport.toUpperCase()}
                                    </p>
                                    <p style={{ fontSize: '12px', opacity: 0.5 }}>
                                        {form.scope === 'Club' ? 'Staff Global' : `${form.divisions.length} Divisiones asignadas`}
                                    </p>
                                </div>
                            </div>

                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>Deporte</label>
                                <p style={{ fontWeight: 600 }}>{form.sport.charAt(0).toUpperCase() + form.sport.slice(1)}</p>
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>Usuario / Email</label>
                                <p style={{ fontWeight: 600 }}>{form.email || 'No cargado'}</p>
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>Nivel de Acceso</label>
                                <p style={{ fontWeight: 600, color: 'var(--color-accent)' }}>{form.accessLevel}</p>
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>Plataforma</label>
                                <p style={{ fontWeight: 600 }}>{form.sendInvitation ? '✓ Acceso Solicitado' : '✗ Sin Acceso'}</p>
                            </div>
                        </div>

                        <div className={styles.checklist} style={{ marginTop: '32px' }}>
                            <div style={{ display: 'flex', gap: '8px', color: (form.firstName && form.lastName && form.role) ? '#22c55e' : '#ef4444' }}>
                                {(form.firstName && form.lastName && form.role) ? '✓ Datos de identidad y rol completos.' : '⚠️ Faltan datos obligatorios.'}
                            </div>
                            <div style={{ display: 'flex', gap: '8px', color: (form.scope === 'Club' || form.divisions.length > 0) ? '#22c55e' : '#ef4444' }}>
                                {(form.scope === 'Club' || form.divisions.length > 0) ? `✓ Asignado a ${form.sport.toUpperCase()}.` : '⚠️ Debe estar asignado al menos a una división.'}
                            </div>
                            <div style={{ display: 'flex', gap: '8px', color: form.email ? '#22c55e' : '#ffb800' }}>
                                {form.email ? '✓ Email para plataforma de staff.' : '💡 Sin email no tendrá acceso al panel.'}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '40px' }}>
                <button
                    className={`${styles.btn} ${styles.btnGhost}`}
                    onClick={handleBack}
                    style={{ visibility: step === 1 ? 'hidden' : 'visible' }}
                >
                    Atrás
                </button>
                <div style={{ display: 'flex', gap: '12px' }}>
                    {step < 4 ? (
                        <button className={styles.btn} onClick={handleNext}>Continuar</button>
                    ) : (
                        <button className={styles.btn} onClick={() => router.push('/club-admin/staff')}>
                            Finalizar y Activar Personal
                        </button>
                    )}
                </div>
            </div>
        </SectionShell>
    );
}

