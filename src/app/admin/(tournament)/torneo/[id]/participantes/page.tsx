'use client';

import { useState } from 'react';
import '@/app/admin/styles/admin-custom.css';

export default function TournamentParticipants() {
    const [participants, setParticipants] = useState([
        { id: 1, name: 'SIC', sigla: 'SIC', city: 'San Isidro', logo: '🔵⚪' },
        { id: 2, name: 'CASI', sigla: 'CASI', city: 'San Isidro', logo: '⚪🔴' },
        { id: 3, name: 'Hindu', sigla: 'HIN', city: 'Don Torcuato', logo: '🐘' },
        { id: 4, name: 'Belgrano', sigla: 'BAC', city: 'CABA', logo: '⚪🤎' },
    ]);

    const [isAddModalOpen, setAddModalOpen] = useState(false);

    // Mock search results
    const availableClubs = [
        { id: 5, name: 'Alumni', sigla: 'ALU', city: 'Tortuguitas' },
        { id: 6, name: 'Newman', sigla: 'NEW', city: 'Benavidez' },
        { id: 7, name: 'CUBA', sigla: 'CUB', city: 'CABA' },
    ];

    return (
        <div style={{ padding: '0' }}>
            {/* Header de la página (NO sticky) */}
            <div className="pageHeader" style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: '16px',
                marginBottom: '24px'
            }}>
                <div>
                    <h1 style={{
                        fontSize: '28px',
                        fontWeight: 800,
                        color: 'rgba(255,255,255,.92)',
                        marginBottom: '6px',
                        letterSpacing: '-0.02em'
                    }}>
                        Participantes
                    </h1>
                    <p style={{
                        color: 'rgba(255,255,255,.55)',
                        fontSize: '14px',
                        margin: 0
                    }}>
                        Equipos inscritos en esta competencia
                    </p>
                </div>
                <button
                    className="adminBtn adminBtn--primary"
                    onClick={() => setAddModalOpen(true)}
                >
                    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 5v14M5 12h14"></path>
                    </svg>
                    Vincular Club
                </button>
            </div>

            {/* Tabla de participantes */}
            <div className="g22Block">
                <div style={{ overflowX: 'auto' }}>
                    <table style={{
                        width: '100%',
                        borderCollapse: 'collapse',
                        textAlign: 'left'
                    }}>
                        <thead>
                            <tr style={{
                                background: 'rgba(255,255,255,.04)',
                                borderBottom: '1px solid rgba(255,255,255,.08)'
                            }}>
                                <th style={{
                                    padding: '14px 18px',
                                    fontSize: '12px',
                                    fontWeight: 900,
                                    color: 'rgba(255,255,255,.55)',
                                    textTransform: 'uppercase',
                                    letterSpacing: '.1em'
                                }}>
                                    Equipo
                                </th>
                                <th style={{
                                    padding: '14px 18px',
                                    fontSize: '12px',
                                    fontWeight: 900,
                                    color: 'rgba(255,255,255,.55)',
                                    textTransform: 'uppercase',
                                    letterSpacing: '.1em'
                                }}>
                                    Ubicación
                                </th>
                                <th style={{
                                    padding: '14px 18px',
                                    fontSize: '12px',
                                    fontWeight: 900,
                                    color: 'rgba(255,255,255,.55)',
                                    textTransform: 'uppercase',
                                    letterSpacing: '.1em'
                                }}>
                                    Zona / Grupo
                                </th>
                                <th style={{
                                    padding: '14px 18px',
                                    textAlign: 'right',
                                    fontSize: '12px',
                                    fontWeight: 900,
                                    color: 'rgba(255,255,255,.55)',
                                    textTransform: 'uppercase',
                                    letterSpacing: '.1em'
                                }}>
                                    Acciones
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {participants.map((p) => (
                                <tr key={p.id} style={{
                                    borderBottom: '1px solid rgba(255,255,255,.06)',
                                    transition: 'background 0.2s ease'
                                }}>
                                    <td style={{ padding: '16px 18px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                                            <span style={{
                                                fontSize: '24px',
                                                width: '40px',
                                                height: '40px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                background: 'rgba(255,255,255,.05)',
                                                borderRadius: '10px',
                                                border: '1px solid rgba(255,255,255,.08)'
                                            }}>
                                                {p.logo}
                                            </span>
                                            <div>
                                                <div style={{
                                                    fontWeight: 700,
                                                    color: 'rgba(255,255,255,.92)',
                                                    fontSize: '14px'
                                                }}>
                                                    {p.name}
                                                </div>
                                                <div style={{
                                                    fontSize: '12px',
                                                    color: 'rgba(255,255,255,.45)',
                                                    fontWeight: 600,
                                                    marginTop: '2px'
                                                }}>
                                                    {p.sigla}
                                                </div>
                                            </div>
                                        </div>
                                    </td>
                                    <td style={{
                                        padding: '16px 18px',
                                        fontSize: '14px',
                                        color: 'rgba(255,255,255,.65)',
                                        fontWeight: 600
                                    }}>
                                        {p.city}
                                    </td>
                                    <td style={{ padding: '16px 18px' }}>
                                        <select style={{
                                            padding: '8px 12px',
                                            borderRadius: '8px',
                                            border: '1px solid rgba(255,255,255,.08)',
                                            fontSize: '13px',
                                            background: 'rgba(255,255,255,.03)',
                                            color: 'rgba(255,255,255,.85)',
                                            fontWeight: 600,
                                            cursor: 'pointer'
                                        }}>
                                            <option>Zona Única</option>
                                            <option>Zona A</option>
                                            <option>Zona B</option>
                                        </select>
                                    </td>
                                    <td style={{ padding: '16px 18px', textAlign: 'right' }}>
                                        <button className="adminBtn" style={{
                                            color: '#ef4444',
                                            borderColor: 'rgba(239,68,68,.2)',
                                            background: 'rgba(239,68,68,.08)'
                                        }}>
                                            Desvincular
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal */}
            {isAddModalOpen && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(0,0,0,0.75)',
                    backdropFilter: 'blur(8px)',
                    WebkitBackdropFilter: 'blur(8px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 9999,
                    padding: '20px'
                }}>
                    <div className="g22Block" style={{
                        width: '100%',
                        maxWidth: '540px',
                        margin: 0
                    }}>
                        <div style={{ padding: '24px' }}>
                            <h2 style={{
                                marginBottom: '18px',
                                color: 'rgba(255,255,255,.92)',
                                fontSize: '22px',
                                fontWeight: 800,
                                letterSpacing: '-0.01em'
                            }}>
                                Vincular Club
                            </h2>
                            <input
                                type="text"
                                placeholder="Buscar por nombre o ciudad..."
                                style={{
                                    width: '100%',
                                    padding: '12px 16px',
                                    borderRadius: '10px',
                                    border: '1px solid rgba(255,255,255,.08)',
                                    background: 'rgba(255,255,255,.03)',
                                    color: 'rgba(255,255,255,.92)',
                                    marginBottom: '20px',
                                    fontSize: '14px',
                                    fontWeight: 500
                                }}
                            />
                            <div style={{ maxHeight: '320px', overflowY: 'auto', marginBottom: '24px' }}>
                                {availableClubs.map(club => (
                                    <div key={club.id} style={{
                                        padding: '14px 16px',
                                        borderBottom: '1px solid rgba(255,255,255,.06)',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        background: 'rgba(255,255,255,.02)',
                                        borderRadius: '8px',
                                        marginBottom: '8px'
                                    }}>
                                        <div>
                                            <div style={{
                                                fontWeight: 700,
                                                color: 'rgba(255,255,255,.92)',
                                                fontSize: '14px'
                                            }}>
                                                {club.name}
                                            </div>
                                            <div style={{
                                                fontSize: '12px',
                                                color: 'rgba(255,255,255,.45)',
                                                marginTop: '2px'
                                            }}>
                                                {club.city}
                                            </div>
                                        </div>
                                        <button className="adminBtn adminBtn--primary" style={{
                                            padding: '0 14px',
                                            height: '32px',
                                            fontSize: '12px'
                                        }}>
                                            Agregar
                                        </button>
                                    </div>
                                ))}
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                                <button
                                    className="adminBtn"
                                    onClick={() => setAddModalOpen(false)}
                                >
                                    Cerrar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
