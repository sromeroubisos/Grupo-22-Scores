'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { db } from '@/lib/mock-db';
import '@/app/admin/styles/admin-custom.css';

export default function TournamentInfoPage() {
    const params = useParams();
    const [tournament, setTournament] = useState<any>(null);
    const [alerts, setAlerts] = useState<any[]>([
        { id: 1, title: 'Cardenales RC', text: 'Hay 4 equipos sin plantilla mínima cargada para la Fecha 1.', type: 'critical' },
        { id: 2, title: 'Logística', text: 'Hay 2 partidos sin sede asignada en la Fecha 3.', type: 'critical' },
        { id: 3, title: 'Designaciones', text: '8 partidos pendientes de árbitro central.', type: 'critical' },
    ]);

    useEffect(() => {
        const found = db.tournaments.find(t => t.id === params.id || t.slug === params.id);
        setTournament(found || {
            name: 'Súper 10 — Regional A',
            season: 'Temporada 2026',
            status: 'Activo',
            format: 'Liga + Playoffs'
        });
    }, [params.id]);

    const resolveAlert = (id: number) => {
        setAlerts(prev => prev.filter(a => a.id !== id));
    };

    return (
        <div>
            {/* KPIs Grid */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                gap: '20px',
                marginBottom: '32px'
            }}>
                <div className="g22Block">
                    <div style={{ padding: '20px' }}>
                        <div style={{
                            fontSize: '11px',
                            color: 'rgba(255,255,255,.55)',
                            textTransform: 'uppercase',
                            letterSpacing: '.1em',
                            marginBottom: '10px',
                            fontWeight: 900
                        }}>
                            Partidos Cargados
                        </div>
                        <div style={{
                            fontSize: '32px',
                            fontWeight: 800,
                            fontFamily: 'ui-monospace, monospace',
                            color: 'rgba(255,255,255,.92)',
                            marginBottom: '6px'
                        }}>
                            124 / 150
                        </div>
                        <div style={{
                            fontSize: '13px',
                            color: '#22C55E',
                            fontWeight: 700
                        }}>
                            82% Completado
                        </div>
                    </div>
                </div>

                <div className="g22Block">
                    <div style={{ padding: '20px' }}>
                        <div style={{
                            fontSize: '11px',
                            color: 'rgba(255,255,255,.55)',
                            textTransform: 'uppercase',
                            letterSpacing: '.1em',
                            marginBottom: '10px',
                            fontWeight: 900
                        }}>
                            Estado del Fixture
                        </div>
                        <div style={{
                            fontSize: '28px',
                            fontWeight: 800,
                            color: '#22C55E',
                            marginBottom: '6px'
                        }}>
                            COMPLETO
                        </div>
                        <div style={{
                            fontSize: '13px',
                            color: 'rgba(255,255,255,.55)',
                            fontWeight: 600
                        }}>
                            Validado ayer 18:40
                        </div>
                    </div>
                </div>

                <div className="g22Block">
                    <div style={{ padding: '20px' }}>
                        <div style={{
                            fontSize: '11px',
                            color: 'rgba(255,255,255,.55)',
                            textTransform: 'uppercase',
                            letterSpacing: '.1em',
                            marginBottom: '10px',
                            fontWeight: 900
                        }}>
                            Competidores
                        </div>
                        <div style={{
                            fontSize: '32px',
                            fontWeight: 800,
                            fontFamily: 'ui-monospace, monospace',
                            color: 'rgba(255,255,255,.92)',
                            marginBottom: '6px'
                        }}>
                            10
                        </div>
                        <div style={{
                            fontSize: '13px',
                            color: '#22C55E',
                            fontWeight: 700
                        }}>
                            Todos registrados
                        </div>
                    </div>
                </div>

                <div className="g22Block">
                    <div style={{ padding: '20px' }}>
                        <div style={{
                            fontSize: '11px',
                            color: 'rgba(255,255,255,.55)',
                            textTransform: 'uppercase',
                            letterSpacing: '.1em',
                            marginBottom: '10px',
                            fontWeight: 900
                        }}>
                            Última Actualización
                        </div>
                        <div style={{
                            fontSize: '20px',
                            fontWeight: 800,
                            color: 'rgba(255,255,255,.92)',
                            marginBottom: '6px'
                        }}>
                            Hoy, 10:12 AM
                        </div>
                        <div style={{
                            fontSize: '13px',
                            color: 'rgba(255,255,255,.55)',
                            fontWeight: 600
                        }}>
                            Por: J. Rodríguez
                        </div>
                    </div>
                </div>
            </div>

            {/* Content Layout */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px' }}>
                {/* Main Column */}
                <div>
                    {/* Alerts */}
                    <div className="g22Block" style={{ marginBottom: '24px' }}>
                        <div className="g22BlockHeader">
                            <h3 className="g22Title" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                Alertas de Integridad
                                <span style={{
                                    padding: '4px 10px',
                                    borderRadius: '6px',
                                    fontSize: '11px',
                                    fontWeight: 900,
                                    background: 'rgba(239,68,68,.15)',
                                    border: '1px solid rgba(239,68,68,.25)',
                                    color: '#ef4444'
                                }}>
                                    {alerts.length} PENDIENTES
                                </span>
                            </h3>
                        </div>
                        <div style={{ padding: '0 18px 18px' }}>
                            {alerts.length === 0 ? (
                                <div style={{
                                    padding: '40px 20px',
                                    textAlign: 'center',
                                    color: 'rgba(255,255,255,.45)'
                                }}>
                                    No hay alertas pendientes. ¡Buen trabajo!
                                </div>
                            ) : (
                                alerts.map(alert => (
                                    <div key={alert.id} style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        padding: '16px',
                                        background: 'rgba(239,68,68,.05)',
                                        border: '1px solid rgba(239,68,68,.1)',
                                        borderRadius: '10px',
                                        marginBottom: '12px'
                                    }}>
                                        <div style={{ fontSize: '14px', color: '#ff8e8e' }}>
                                            <strong>{alert.title}:</strong> {alert.text}
                                        </div>
                                        <button
                                            onClick={() => resolveAlert(alert.id)}
                                            style={{
                                                fontSize: '11px',
                                                fontWeight: 700,
                                                padding: '6px 14px',
                                                background: '#ef4444',
                                                color: 'white',
                                                borderRadius: '6px',
                                                cursor: 'pointer',
                                                border: 'none'
                                            }}
                                        >
                                            RESOLVER
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Próximos Partidos */}
                    <div className="g22Block">
                        <div className="g22BlockHeader">
                            <h3 className="g22Title">Próximos Partidos</h3>
                        </div>
                        <div style={{ padding: '0 18px 18px', display: 'grid', gap: '12px' }}>
                            {[
                                { home: 'Tucumán Rugby', homeLogo: 'TR', away: 'Duendes RC', awayLogo: 'D', time: 'Sáb 15:30', venue: 'Sede Central' },
                                { home: 'Universitario', homeLogo: 'U', away: 'Los Tarcos', awayLogo: 'LT', time: 'Sáb 16:00', venue: 'La Caldera' }
                            ].map((match, idx) => (
                                <div key={idx} style={{
                                    display: 'grid',
                                    gridTemplateColumns: '1fr auto 1fr',
                                    alignItems: 'center',
                                    padding: '18px',
                                    background: 'rgba(255,255,255,.03)',
                                    border: '1px solid rgba(255,255,255,.06)',
                                    borderRadius: '10px'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        <div style={{
                                            width: '32px',
                                            height: '32px',
                                            background: 'rgba(255,255,255,.06)',
                                            borderRadius: '50%',
                                            display: 'grid',
                                            placeItems: 'center',
                                            border: '1px solid rgba(255,255,255,.08)',
                                            fontSize: '11px',
                                            fontWeight: 800
                                        }}>
                                            {match.homeLogo}
                                        </div>
                                        <span style={{ fontWeight: 600, fontSize: '14px' }}>{match.home}</span>
                                    </div>
                                    <div style={{ textAlign: 'center', padding: '0 24px' }}>
                                        <div style={{
                                            fontFamily: 'ui-monospace, monospace',
                                            fontSize: '16px',
                                            fontWeight: 700,
                                            marginBottom: '2px'
                                        }}>
                                            {match.time}
                                        </div>
                                        <div style={{ fontSize: '11px', color: 'rgba(255,255,255,.45)' }}>
                                            {match.venue}
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', justifyContent: 'flex-end' }}>
                                        <span style={{ fontWeight: 600, fontSize: '14px' }}>{match.away}</span>
                                        <div style={{
                                            width: '32px',
                                            height: '32px',
                                            background: 'rgba(255,255,255,.06)',
                                            borderRadius: '50%',
                                            display: 'grid',
                                            placeItems: 'center',
                                            border: '1px solid rgba(255,255,255,.08)',
                                            fontSize: '11px',
                                            fontWeight: 800
                                        }}>
                                            {match.awayLogo}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Sidebar */}
                <div>
                    {/* Acciones Rápidas */}
                    <div className="g22Block" style={{ marginBottom: '24px' }}>
                        <div className="g22BlockHeader">
                            <h3 className="g22Title" style={{ fontSize: '18px' }}>Acciones Rápidas</h3>
                        </div>
                        <div style={{ padding: '0 18px 18px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <button className="adminBtn" style={{ justifyContent: 'flex-start', width: '100%' }}>
                                + Añadir Ronda/Fecha
                            </button>
                            <button className="adminBtn" style={{ justifyContent: 'flex-start', width: '100%' }}>
                                + Añadir Partido
                            </button>
                            <button className="adminBtn" style={{ justifyContent: 'flex-start', width: '100%' }}>
                                📥 Importar Fixture
                            </button>
                            <button className="adminBtn adminBtn--primary" style={{ justifyContent: 'flex-start', width: '100%' }}>
                                📊 Ver Tabla en Vivo
                            </button>
                        </div>
                    </div>

                    {/* Auditoría */}
                    <div className="g22Block">
                        <div className="g22BlockHeader">
                            <h3 className="g22Title" style={{ fontSize: '16px', opacity: 0.7 }}>Auditoría Reciente</h3>
                        </div>
                        <div style={{ padding: '0 18px 18px', fontSize: '13px', color: 'rgba(255,255,255,.55)' }}>
                            <p style={{ marginBottom: '12px', lineHeight: 1.6 }}>
                                • <strong>M. Paz</strong> cambió sede partido #402<br />
                                <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: '11px' }}>hace 12 min</span>
                            </p>
                            <p style={{ marginBottom: 0, lineHeight: 1.6 }}>
                                • <strong>Sistema</strong> recalculó tabla G-A<br />
                                <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: '11px' }}>hace 1 hora</span>
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
