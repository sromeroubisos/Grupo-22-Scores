'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { db } from '@/lib/mock-db';
import Link from 'next/link';

export default function SanctionManagementPage() {
    const { id } = useParams();
    const router = useRouter();
    const [incident, setIncident] = useState<any>(null);
    const [sanctionForm, setSanctionForm] = useState({
        summary: '',
        weeks: 1,
        startDate: new Date().toISOString().split('T')[0],
        endDate: '',
        status: 'active' as const
    });

    useEffect(() => {
        const found = db.disciplineIncidents.find(inc => inc.id === id);
        if (found) {
            setIncident(found);
            // Default end date + 1 week
            const end = new Date();
            end.setDate(end.getDate() + 7);
            setSanctionForm(prev => ({ ...prev, endDate: end.toISOString().split('T')[0] }));
        }
    }, [id]);

    const handleSancionar = () => {
        if (!incident) return;

        const newSanction = {
            id: `SANC-${Math.floor(1000 + Math.random() * 9000)}`,
            incidentId: incident.id,
            playerId: incident.playerId,
            playerName: incident.playerName,
            clubId: incident.clubId,
            clubName: incident.clubName,
            summary: sanctionForm.summary || `${sanctionForm.weeks} semana(s) de suspensión`,
            weeks: sanctionForm.weeks,
            startDate: sanctionForm.startDate,
            endDate: sanctionForm.endDate,
            status: 'active' as const
        };

        db.disciplineSanctions.push(newSanction);

        // Update incident status
        const incIdx = db.disciplineIncidents.findIndex(inc => inc.id === incident.id);
        if (incIdx >= 0) {
            db.disciplineIncidents[incIdx].status = 'resolved';
        }

        alert('Sanción aplicada correctamente');
        router.push('/admin?tab=disciplina');
    };

    const handleDesestimar = () => {
        const incIdx = db.disciplineIncidents.findIndex(inc => inc.id === incident.id);
        if (incIdx >= 0) {
            db.disciplineIncidents[incIdx].status = 'resolved';
        }
        alert('Expediente desestimado');
        router.push('/admin?tab=disciplina');
    };

    if (!incident) return <div style={{ padding: '40px', color: 'var(--color-text-primary)' }}>Cargando expediente...</div>;

    return (
        <div style={{ minHeight: '100vh', color: 'var(--color-text-primary)' }}>
            <style jsx>{`
                .management-container {
                    width: 100%;
                    max-width: none;
                    margin: 0;
                    padding: 40px 80px;
                }
                .back-link {
                    color: var(--color-accent);
                    text-decoration: none;
                    font-size: 0.9rem;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    margin-bottom: 24px;
                    font-weight: 600;
                    transition: opacity 0.2s;
                }
                .back-link:hover { opacity: 0.8; }
                
                .header-section {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    margin-bottom: 40px;
                }
                .status-badge {
                    padding: 8px 16px;
                    border-radius: 6px;
                    border: 1px solid currentColor;
                    font-size: 0.8rem;
                    font-weight: 700;
                }
                .status-badge.review {
                    background: rgba(234, 179, 8, 0.1);
                    color: var(--color-warning);
                }
                .status-badge.resolved {
                    background: rgba(34, 197, 94, 0.1);
                    color: var(--color-success);
                }

                .main-grid {
                    display: grid;
                    grid-template-columns: 1.5fr 1fr;
                    gap: 32px;
                }

                .panel-card {
                    background: var(--color-bg-secondary);
                    border: 1px solid var(--color-border);
                    border-radius: 12px;
                    padding: 32px;
                }

                .label {
                    font-size: 0.75rem;
                    color: var(--color-text-tertiary);
                    text-transform: uppercase;
                    letter-spacing: 1px;
                    font-weight: 600;
                }

                .value {
                    font-size: 1.1rem;
                    font-weight: 600;
                    margin-top: 4px;
                }

                .description-box {
                    background: var(--color-bg-tertiary);
                    padding: 20px;
                    border-radius: 8px;
                    margin-top: 8px;
                    line-height: 1.6;
                    font-size: 0.95rem;
                    border: 1px solid var(--color-border);
                    color: var(--color-text-secondary);
                }

                .input-field {
                    background: var(--color-bg-primary);
                    border: 1px solid var(--color-border);
                    color: var(--color-text-primary);
                    padding: 12px;
                    border-radius: 8px;
                    width: 100%;
                    margin-top: 8px;
                    font-family: inherit;
                }

                .action-panel {
                    border: 1px solid var(--color-accent);
                }

                .history-item {
                    display: flex;
                    gap: 12px;
                }
                .history-line {
                    width: 4px;
                    background: var(--color-accent);
                    border-radius: 2px;
                }
            `}</style>

            <div className="management-container">
                <Link href="/admin?tab=disciplina" className="back-link">
                    ← Volver al Panel de Disciplina
                </Link>

                <div className="header-section">
                    <div>
                        <div className="label">EXPEDIENTE DISCIPLINARIO</div>
                        <h1 style={{ fontSize: '2.5rem', fontWeight: 800, margin: 0, letterSpacing: '-1px' }}>{incident.id}</h1>
                    </div>
                    <div className={`status-badge ${incident.status === 'review' ? 'review' : 'resolved'}`}>
                        {incident.status === 'review' ? 'EN REVISIÓN' : incident.status.toUpperCase()}
                    </div>
                </div>

                <div className="main-grid">

                    {/* INCIDENT DETAILS */}
                    <div className="panel-card">
                        <h2 style={{ fontSize: '1.2rem', marginBottom: '24px', borderBottom: '1px solid var(--color-border)', paddingBottom: '16px' }}>Detalles del Incidente</h2>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '32px' }}>
                            <div>
                                <div className="label">Jugador</div>
                                <div className="value">{incident.playerName}</div>
                            </div>
                            <div>
                                <div className="label">Club</div>
                                <div className="value">{incident.clubName}</div>
                            </div>
                            <div>
                                <div className="label">Tipo de Incidente</div>
                                <div className="value" style={{ color: incident.severity === 'high' ? 'var(--color-error)' : 'inherit' }}>{incident.incidentType}</div>
                            </div>
                            <div>
                                <div className="label">Fecha del Suceso</div>
                                <div className="value">{incident.date}</div>
                            </div>
                        </div>

                        <div style={{ marginBottom: '32px' }}>
                            <div className="label">Informe / Descripción</div>
                            <div className="description-box">
                                {incident.description}
                            </div>
                        </div>

                        <div>
                            <div className="label">Evidencia / Anexos</div>
                            <div style={{ marginTop: '12px', color: 'var(--color-text-tertiary)', fontSize: '0.85rem', fontStyle: 'italic' }}>
                                No se han adjuntado archivos multimedia.
                            </div>
                        </div>
                    </div>

                    {/* ACTION PANEL */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                        <div className="panel-card action-panel">
                            <h2 style={{ fontSize: '1.1rem', marginBottom: '20px' }}>Resolución de Expediente</h2>

                            {incident.status !== 'resolved' ? (
                                <>
                                    <div style={{ marginBottom: '20px' }}>
                                        <div className="label">Resumen de Falle (Fallo)</div>
                                        <textarea
                                            className="input-field"
                                            style={{ minHeight: '100px', resize: 'vertical' }}
                                            placeholder="Describa la sanción o el motivo de la desestimación..."
                                            value={sanctionForm.summary}
                                            onChange={(e) => setSanctionForm({ ...sanctionForm, summary: e.target.value })}
                                        ></textarea>
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                                        <div>
                                            <label className="label">Semanas</label>
                                            <input
                                                type="number"
                                                className="input-field"
                                                value={sanctionForm.weeks}
                                                onChange={(e) => setSanctionForm({ ...sanctionForm, weeks: parseInt(e.target.value) })}
                                            />
                                        </div>
                                        <div>
                                            <label className="label">Inicio</label>
                                            <input
                                                type="date"
                                                className="input-field"
                                                value={sanctionForm.startDate}
                                                onChange={(e) => setSanctionForm({ ...sanctionForm, startDate: e.target.value })}
                                            />
                                        </div>
                                    </div>

                                    <div style={{ marginBottom: '32px' }}>
                                        <label className="label">Fin de Sanción</label>
                                        <input
                                            type="date"
                                            className="input-field"
                                            value={sanctionForm.endDate}
                                            onChange={(e) => setSanctionForm({ ...sanctionForm, endDate: e.target.value })}
                                        />
                                    </div>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                        <button className="btn btn-primary" onClick={handleSancionar}>APLICAR SANCIÓN</button>
                                        <button className="btn btn-secondary" onClick={handleDesestimar}>DESESTIMAR EXPEDIENTE</button>
                                    </div>
                                </>
                            ) : (
                                <div style={{ textAlign: 'center', padding: '20px' }}>
                                    <div style={{ fontSize: '3rem', marginBottom: '16px' }}>✅</div>
                                    <div style={{ fontWeight: 700, marginBottom: '8px' }}>EXPEDIENTE CERRADO</div>
                                    <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>Este caso ya ha sido resuelto y no admite modificaciones adicionales.</p>
                                </div>
                            )}
                        </div>

                        <div className="panel-card" style={{ opacity: 0.8 }}>
                            <div className="label" style={{ marginBottom: '12px' }}>HISTORIAL DE ACCIONES</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                <div className="history-item">
                                    <div className="history-line"></div>
                                    <div>
                                        <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>Expediente Creado</div>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--color-text-tertiary)' }}>Sistema Automático • {incident.date}</div>
                                    </div>
                                </div>
                                <div className="history-item">
                                    <div className="history-line" style={{ background: 'var(--color-warning)' }}></div>
                                    <div>
                                        <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>Asignado a Revisión</div>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--color-text-tertiary)' }}>Admin • Hace 2 días</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
