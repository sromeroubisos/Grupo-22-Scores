'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import SectionShell from '../../components/SectionShell';
import { useDisciplinas } from '../../components/DisciplinasContext';
import styles from '../../page.module.css';

type WizardStep = 1 | 2 | 3 | 4 | 5 | 6;
type LoadingMethod = 'selection' | 'manual' | 'import' | 'self' | 'legacy';

interface PlayerEntry {
    id?: string;
    firstName: string;
    lastName: string;
    birthDate: string;
    position: string;
    dorsal?: string;
    status: 'Active' | 'Inactive';
}

const MOCK_TRANSFER_PLAYERS: PlayerEntry[] = [
    { id: 'T-101', firstName: 'Joaquin', lastName: 'Diaz', birthDate: '2005-04-18', position: 'Centro', status: 'Active' },
    { id: 'T-102', firstName: 'Matias', lastName: 'Lopez', birthDate: '2004-09-02', position: 'Wing', status: 'Active' },
    { id: 'T-103', firstName: 'Santiago', lastName: 'Perez', birthDate: '2006-01-11', position: 'Apertura', status: 'Active' },
];

export default function CreatePlantelPage() {
    const router = useRouter();
    const { clubSports } = useDisciplinas();
    const [step, setStep] = useState<WizardStep>(1);

    // Form State
    const [formData, setFormData] = useState({
        clubId: 'CUBA',
        divisionId: '',
        season: '2026',
        sportId: '',
        branch: 'Masculino',
        status: 'En preparación',
        format: 'XV',
        maxPlayers: 50,
        jerseyRequired: true,
        ageMin: '',
        ageMax: '',
        players: [] as PlayerEntry[],
        roles: {
            captainId: '',
            viceCaptainId: '',
        },
        staff: {
            headCoach: '',
            manager: '',
            pf: '',
        }
    });

    // State for Step 3 sub-views
    const [loadingMethod, setLoadingMethod] = useState('selection' as LoadingMethod);
    const [registrationCode, setRegistrationCode] = useState('');
    const [transferResults, setTransferResults] = useState<PlayerEntry[]>([]);

    const generateCode = () => {
        const code = Math.random().toString(36).substring(2, 8).toUpperCase();
        setRegistrationCode(code);
    };

    const handleSearchPlayers = () => {
        setTransferResults(MOCK_TRANSFER_PLAYERS);
    };

    const addTransferPlayer = (player: PlayerEntry) => {
        setFormData((prev) => {
            if (prev.players.some((p) => p.id === player.id)) return prev;
            return { ...prev, players: [...prev.players, player] };
        });
    };

    const DIVISIONS = [
        { id: 'div1', name: 'Primera', sport: 'rugby', branch: 'Masculino' },
        { id: 'div2', name: 'Intermedia', sport: 'rugby', branch: 'Masculino' },
        { id: 'div3', name: 'M19', sport: 'rugby', branch: 'Masculino' },
        { id: 'div4', name: 'M17', sport: 'rugby', branch: 'Masculino' },
        { id: 'div5', name: 'Primera Femenina', sport: 'football', branch: 'Femenino' },
    ];

    const availableDivisions = useMemo(() => {
        return DIVISIONS.filter(d => clubSports.includes(d.sport));
    }, [clubSports]);

    const handleNext = () => setStep((prev) => Math.min(prev + 1, 6) as WizardStep);
    const handleBack = () => setStep((prev) => Math.max(prev - 1, 1) as WizardStep);

    const updateField = (field: string, value: any) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const addManualPlayer = () => {
        const newPlayer: PlayerEntry = { firstName: '', lastName: '', birthDate: '', position: '', status: 'Active' };
        setFormData(prev => ({ ...prev, players: [...prev.players, newPlayer] }));
    };

    return (
        <SectionShell
            title="Crear Nuevo Plantel"
            subtitle="Configuración paso a paso del roster oficial por temporada."
            actions={
                <div className={styles.sectionActions}>
                    <button className={styles.btnGhost} onClick={() => router.back()}>Cancelar</button>
                    {step < 6 ? (
                        <button className={styles.btn} onClick={handleNext}>Siguiente Paso</button>
                    ) : (
                        <button className={styles.btn} onClick={() => router.push('/club-admin/planteles')}>Confirmar y Crear</button>
                    )}
                </div>
            }
        >
            {/* Wizard Progress Tracker */}
            <div className={styles.steps} style={{ marginBottom: '40px' }}>
                {[1, 2, 3, 4, 5, 6].map((s) => (
                    <div
                        key={s}
                        className={`${styles.stepButton} ${step === s ? styles.stepButtonActive : ''}`}
                        onClick={() => s < step && setStep(s as WizardStep)}
                    >
                        <span className={styles.stepIndex}>{s}</span>
                        <span className={styles.stepLabel}>
                            {s === 1 && 'Contexto'}
                            {s === 2 && 'Config'}
                            {s === 3 && 'Jugadores'}
                            {s === 4 && 'Roles'}
                            {s === 5 && 'Staff'}
                            {s === 6 && 'Resumen'}
                        </span>
                    </div>
                ))}
            </div>

            <div className={styles.sectionGrid} style={{ gridTemplateColumns: '1fr' }}>
                {/* STEP 1: CONTEXT */}
                {step === 1 && (
                    <div className={styles.glassCard}>
                        <h2 className={styles.cardTitle}>PASO 1 — Contexto del plantel</h2>
                        <p className={styles.cardMeta} style={{ marginBottom: '24px' }}>Define dónde vive el plantel en el sistema.</p>

                        <div className={styles.formGrid}>
                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>Club</label>
                                <input className={styles.formInput} value="C.U.B.A." readOnly disabled />
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>Temporada</label>
                                <select
                                    className={styles.formInput}
                                    value={formData.season}
                                    onChange={(e) => updateField('season', e.target.value)}
                                >
                                    <option value="2026">2026</option>
                                    <option value="2027">2027</option>
                                </select>
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>División / Categoría</label>
                                <select
                                    className={styles.formInput}
                                    value={formData.divisionId}
                                    onChange={(e) => {
                                        const div = DIVISIONS.find(d => d.id === e.target.value);
                                        setFormData(prev => ({
                                            ...prev,
                                            divisionId: e.target.value,
                                            sportId: div?.sport || '',
                                            branch: div?.branch || 'Masculino'
                                        }));
                                    }}
                                >
                                    <option value="">Seleccione una división...</option>
                                    {availableDivisions.map(d => (
                                        <option key={d.id} value={d.id}>{d.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>Deporte / Rama</label>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <span className={`${styles.badge} ${styles.badgeNeutral}`}>{formData.sportId.toUpperCase() || '---'}</span>
                                    <span className={`${styles.badge} ${styles.badgeNeutral}`}>{formData.branch}</span>
                                </div>
                            </div>
                        </div>

                        <div className={styles.callout} style={{ marginTop: '32px' }}>
                            <span className={styles.calloutTitle}>Validación Crítica</span>
                            <p style={{ fontSize: '13px' }}>
                                El sistema solo permite un plantel activo por división y temporada para evitar duplicidad de estadísticas.
                            </p>
                        </div>
                    </div>
                )}

                {/* STEP 2: CONFIGURATION */}
                {step === 2 && (
                    <div className={styles.glassCard}>
                        <h2 className={styles.cardTitle}>PASO 2 — Configuración y Reglas</h2>
                        <div className={styles.formGrid} style={{ marginTop: '24px' }}>
                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>Estado Inicial</label>
                                <select
                                    className={styles.formInput}
                                    value={formData.status}
                                    onChange={(e) => updateField('status', e.target.value)}
                                >
                                    <option value="En preparación">En preparación (Editable, no auditable)</option>
                                    <option value="Activo">Activo (Computa para partidos)</option>
                                    <option value="Cerrado">Cerrado (Solo lectura)</option>
                                </select>
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>Formato Competencia</label>
                                <select
                                    className={styles.formInput}
                                    value={formData.format}
                                    onChange={(e) => updateField('format', e.target.value)}
                                >
                                    <option value="XV">Rugby XV</option>
                                    <option value="X">Rugby X</option>
                                    <option value="VII">Rugby VII</option>
                                    <option value="XI">Fútbol XI</option>
                                </select>
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>Máximo de Jugadores</label>
                                <input
                                    type="number"
                                    className={styles.formInput}
                                    value={formData.maxPlayers}
                                    onChange={(e) => updateField('maxPlayers', parseInt(e.target.value))}
                                />
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>Dorsales</label>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', height: '100%' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                        <input
                                            type="checkbox"
                                            checked={formData.jerseyRequired}
                                            onChange={(e) => updateField('jerseyRequired', e.target.checked)}
                                        />
                                        <span>Dorsales obligatorios</span>
                                    </label>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* STEP 3: PLAYERS */}
                {step === 3 && (
                    <div className={styles.glassCard}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                            <h2 className={styles.cardTitle}>PASO 3 — Carga de Jugadores</h2>
                            {loadingMethod !== 'selection' && (
                                <button className={styles.btnSmall} onClick={() => setLoadingMethod('selection')}>
                                    ← Cambiar Método
                                </button>
                            )}
                        </div>

                        {loadingMethod === 'selection' && (
                            <div className={styles.summaryGrid} style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                                <div className={styles.uploadArea} style={{ padding: '24px' }} onClick={() => setLoadingMethod('import')}>
                                    <span style={{ fontSize: '24px' }}>📥</span>
                                    <h4 style={{ margin: '12px 0 4px' }}>Importar CSV / Excel</h4>
                                    <p style={{ fontSize: '11px', opacity: 0.7 }}>Carga masiva para V1</p>
                                </div>
                                <div className={styles.uploadArea} style={{ padding: '24px' }} onClick={() => {
                                    setLoadingMethod('manual');
                                    if (formData.players.length === 0) addManualPlayer();
                                }}>
                                    <span style={{ fontSize: '24px' }}>✍️</span>
                                    <h4 style={{ margin: '12px 0 4px' }}>Carga Manual</h4>
                                    <p style={{ fontSize: '11px', opacity: 0.7 }}>Cerrar fichas una por una</p>
                                </div>
                                <div className={styles.uploadArea} style={{ padding: '24px' }} onClick={() => {
                                    setLoadingMethod('self');
                                    if (!registrationCode) generateCode();
                                }}>
                                    <span style={{ fontSize: '24px' }}>🔑</span>
                                    <h4 style={{ margin: '12px 0 4px' }}>Autoinscripción</h4>
                                    <p style={{ fontSize: '11px', opacity: 0.7 }}>Código para registro de jugadores</p>
                                </div>
                                <div className={styles.uploadArea} style={{ padding: '24px' }} onClick={() => setLoadingMethod('legacy')}>
                                    <span style={{ fontSize: '24px' }}>📅</span>
                                    <h4 style={{ margin: '12px 0 4px' }}>Importar Histórico</h4>
                                    <p style={{ fontSize: '11px', opacity: 0.7 }}>Desde otra temporada / categoría</p>
                                </div>
                            </div>
                        )}

                        {loadingMethod === 'self' && (
                            <div className={styles.callout} style={{ textAlign: 'center', padding: '40px' }}>
                                <span className={styles.calloutTitle}>Canal de Autoinscripción Activo</span>
                                <p style={{ margin: '16px 0', opacity: 0.8 }}>Compartí este código con los jugadores para que se registren solos en esta división:</p>
                                <div style={{
                                    background: 'var(--color-bg-primary)',
                                    padding: '20px',
                                    borderRadius: '12px',
                                    fontSize: '32px',
                                    fontWeight: 800,
                                    letterSpacing: '4px',
                                    color: 'var(--color-accent)',
                                    border: '1px solid var(--club-stroke)',
                                    display: 'inline-block'
                                }}>
                                    {registrationCode}
                                </div>
                                <div style={{ marginTop: '24px' }}>
                                    <button className={styles.btnSmall} onClick={generateCode}>Regenerar código</button>
                                </div>
                            </div>
                        )}

                        {loadingMethod === 'legacy' && (
                            <div className={styles.formGrid}>
                                <div className={styles.formGroup} style={{ gridColumn: 'span 2' }}>
                                    <label className={styles.formLabel}>Buscar en Temporadas Anteriores</label>
                                    <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                                        <select className={styles.formInput}>
                                            <option>Temporada 2025</option>
                                            <option>Temporada 2024</option>
                                        </select>
                                        <select className={styles.formInput}>
                                            <option>M17 (Cat. anterior)</option>
                                            <option>M19 (Misma cat.)</option>
                                        </select>
                                        <button className={styles.btn} onClick={handleSearchPlayers}>Buscar Jugadores</button>
                                    </div>
                                </div>
                                <div style={{ gridColumn: 'span 2', padding: '20px', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid var(--club-stroke-soft)' }}>
                                    {transferResults.length === 0 ? (
                                        <p style={{ fontSize: '13px', opacity: 0.6, textAlign: 'center' }}>Selecciona el origen para ver los jugadores disponibles.</p>
                                    ) : (
                                        <div style={{ display: 'grid', gap: '10px' }}>
                                            {transferResults.map((player) => (
                                                <div key={player.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderRadius: '10px', background: 'var(--club-panel-inner)', border: '1px solid var(--club-stroke-soft)' }}>
                                                    <div>
                                                        <div style={{ fontWeight: 600 }}>{player.lastName}, {player.firstName}</div>
                                                        <div style={{ fontSize: '11px', opacity: 0.7 }}>{player.position} • {player.birthDate}</div>
                                                    </div>
                                                    <button className={styles.btnSmall} onClick={() => addTransferPlayer(player)}>Agregar</button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {(loadingMethod === 'manual' || (loadingMethod === 'selection' && formData.players.length > 0)) && (
                            <div style={{ marginTop: '32px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <h3 className={styles.formLabel}>Jugadores a Vincular ({formData.players.length})</h3>
                                    <button className={styles.btnSmall} onClick={addManualPlayer}>+ Agregar Fila</button>
                                </div>
                                <table className={styles.table} style={{ marginTop: '12px' }}>
                                    <thead>
                                        <tr>
                                            <th>Apellido</th>
                                            <th>Nombre</th>
                                            <th>Posición</th>
                                            <th>Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {formData.players.map((p, idx) => (
                                            <tr key={idx}>
                                                <td><input className={styles.formInput} style={{ padding: '6px' }} placeholder="Apellido" value={p.lastName} onChange={e => {
                                                    const newPlayers = [...formData.players];
                                                    newPlayers[idx].lastName = e.target.value;
                                                    updateField('players', newPlayers);
                                                }} /></td>
                                                <td><input className={styles.formInput} style={{ padding: '6px' }} placeholder="Nombre" value={p.firstName} onChange={e => {
                                                    const newPlayers = [...formData.players];
                                                    newPlayers[idx].firstName = e.target.value;
                                                    updateField('players', newPlayers);
                                                }} /></td>
                                                <td><input className={styles.formInput} style={{ padding: '6px' }} placeholder="Posición" value={p.position} onChange={e => {
                                                    const newPlayers = [...formData.players];
                                                    newPlayers[idx].position = e.target.value;
                                                    updateField('players', newPlayers);
                                                }} /></td>
                                                <td>
                                                    <button
                                                        className={styles.btnSmall}
                                                        onClick={() => {
                                                            const newPlayers = formData.players.filter((_, i) => i !== idx);
                                                            updateField('players', newPlayers);
                                                        }}
                                                    >Quitar</button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}

                {/* STEP 4: ROLES */}
                {step === 4 && (
                    <div className={styles.glassCard}>
                        <h2 className={styles.cardTitle}>PASO 4 — Liderazgo y Roles</h2>
                        <div className={styles.formGrid} style={{ marginTop: '24px' }}>
                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>Capitán</label>
                                <select
                                    className={styles.formInput}
                                    value={formData.roles.captainId}
                                    onChange={(e) => updateField('roles', { ...formData.roles, captainId: e.target.value })}
                                >
                                    <option value="">Seleccione capitán...</option>
                                    {formData.players.map((p, i) => (
                                        <option key={i} value={i}>{p.lastName || '---'}, {p.firstName || '---'}</option>
                                    ))}
                                </select>
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>Subcapitán</label>
                                <select
                                    className={styles.formInput}
                                    value={formData.roles.viceCaptainId}
                                    onChange={(e) => updateField('roles', { ...formData.roles, viceCaptainId: e.target.value })}
                                >
                                    <option value="">Seleccione subcapitán...</option>
                                    {formData.players.map((p, i) => (
                                        <option key={i} value={i}>{p.lastName || '---'}, {p.firstName || '---'}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </div>
                )}

                {/* STEP 5: STAFF */}
                {step === 5 && (
                    <div className={styles.glassCard}>
                        <h2 className={styles.cardTitle}>PASO 5 — Staff del Plantel</h2>
                        <div className={styles.formGrid} style={{ marginTop: '24px' }}>
                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>Head Coach</label>
                                <input
                                    className={styles.formInput}
                                    placeholder="Nombre completo"
                                    value={formData.staff.headCoach}
                                    onChange={(e) => updateField('staff', { ...formData.staff, headCoach: e.target.value })}
                                />
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>Manager</label>
                                <input
                                    className={styles.formInput}
                                    placeholder="Nombre completo"
                                    value={formData.staff.manager}
                                    onChange={(e) => updateField('staff', { ...formData.staff, manager: e.target.value })}
                                />
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>P.F. / Médico</label>
                                <input
                                    className={styles.formInput}
                                    placeholder="Nombre completo"
                                    value={formData.staff.pf}
                                    onChange={(e) => updateField('staff', { ...formData.staff, pf: e.target.value })}
                                />
                            </div>
                        </div>
                    </div>
                )}

                {/* STEP 6: SUMMARY */}
                {step === 6 && (
                    <div className={styles.glassCard}>
                        <h2 className={styles.cardTitle}>PASO 6 — Resumen y Confirmación</h2>

                        <div className={styles.callout} style={{ marginTop: '24px', borderLeft: '4px solid var(--color-accent)' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }}>
                                <div>
                                    <span className={styles.calloutTitle}>División y Temporada</span>
                                    <p style={{ fontSize: '18px', fontWeight: 600 }}>{DIVISIONS.find(d => d.id === formData.divisionId)?.name || 'Sin nombre'} — {formData.season}</p>
                                    <p style={{ color: 'var(--color-text-secondary)' }}>Deporte: {formData.sportId.toUpperCase()}</p>
                                </div>
                                <div>
                                    <span className={styles.calloutTitle}>Jugadores y Staff</span>
                                    <p style={{ fontSize: '18px', fontWeight: 600 }}>{formData.players.length} Jugadores Vinculados</p>
                                    <p style={{ color: 'var(--color-text-secondary)' }}>Estado Inicial: {formData.status}</p>
                                </div>
                            </div>
                        </div>

                        <div className={styles.sectionHeader} style={{ marginTop: '32px' }}>
                            <h3 className={styles.cardTitle}>Advertencias de Auditoría</h3>
                        </div>

                        <div className={styles.checklist}>
                            <div style={{ display: 'flex', gap: '8px', color: formData.players.length > 0 ? '#22c55e' : '#ef4444' }}>
                                {formData.players.length > 0 ? '✓ El plantel tiene jugadores cargados.' : '⚠️ No se pueden crear planteles vacíos.'}
                            </div>
                            <div style={{ display: 'flex', gap: '8px', color: formData.roles.captainId ? '#22c55e' : '#ffb800' }}>
                                {formData.roles.captainId ? '✓ Capitán asignado.' : '💡 Falta asignar líder del equipo (Opcional).'}
                            </div>
                            <div style={{ display: 'flex', gap: '8px', color: formData.staff.headCoach ? '#22c55e' : '#22c55e' }}>
                                ✓ Estado inicial: {formData.status}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Navigation Buttons footer */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '40px' }}>
                <button
                    className={styles.btnGhost}
                    onClick={handleBack}
                    style={{ visibility: step === 1 ? 'hidden' : 'visible' }}
                >
                    Atrás
                </button>
                <div style={{ display: 'flex', gap: '12px' }}>
                    {step < 6 ? (
                        <button className={styles.btn} onClick={handleNext}>Continuar</button>
                    ) : (
                        <button className={styles.btn} onClick={() => router.push('/club-admin/planteles')}>
                            Finalizar y Activar
                        </button>
                    )}
                </div>
            </div>
        </SectionShell>
    );
}
