'use client';

import { useState } from 'react';

export default function UnionSeasons() {

    // Mock Seasons
    const [seasons, setSeasons] = useState([
        { id: '2026', name: 'Temporada 2026', status: 'Activa', startDate: '01/01/2026', endDate: '31/12/2026' },
        { id: '2025', name: 'Temporada 2025', status: 'Archivada', startDate: '01/01/2025', endDate: '31/12/2025' },
    ]);

    return (
        <div>
            <div style={{ marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h1 style={{ fontSize: '1.8rem', fontWeight: 700, color: '#111827', marginBottom: '8px' }}>Temporadas</h1>
                    <p style={{ color: '#6b7280' }}>Gestiona los ciclos de competencia.</p>
                </div>
                <button className="btn" style={{
                    padding: '8px 16px',
                    borderRadius: '6px',
                    background: 'var(--color-accent)',
                    color: 'white',
                    fontSize: '0.875rem',
                    fontWeight: 500,
                    border: 'none',
                    cursor: 'pointer'
                }}>
                    + Nueva Temporada
                </button>
            </div>

            <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                        <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                            <th style={{ padding: '16px 24px', fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>Nombre</th>
                            <th style={{ padding: '16px 24px', fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>Inicio</th>
                            <th style={{ padding: '16px 24px', fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>Fin</th>
                            <th style={{ padding: '16px 24px', fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>Estado</th>
                            <th style={{ padding: '16px 24px', textAlign: 'right' }}>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {seasons.map((s) => (
                            <tr key={s.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                <td style={{ padding: '16px 24px' }}>
                                    <div style={{ fontWeight: 600, color: '#111827' }}>{s.name}</div>
                                </td>
                                <td style={{ padding: '16px 24px', fontSize: '0.875rem', color: '#4b5563' }}>{s.startDate}</td>
                                <td style={{ padding: '16px 24px', fontSize: '0.875rem', color: '#4b5563' }}>{s.endDate}</td>
                                <td style={{ padding: '16px 24px' }}>
                                    <span style={{
                                        fontSize: '0.75rem',
                                        padding: '4px 8px',
                                        borderRadius: '999px',
                                        fontWeight: 600,
                                        background: s.status === 'Activa' ? '#dcfce7' : '#f3f4f6',
                                        color: s.status === 'Activa' ? '#166534' : '#6b7280'
                                    }}>
                                        {s.status}
                                    </span>
                                </td>
                                <td style={{ padding: '16px 24px', textAlign: 'right' }}>
                                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                        {s.status !== 'Activa' && (
                                            <button style={{ color: 'var(--color-accent)', background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem' }}>Activar</button>
                                        )}
                                        <button style={{ color: '#6b7280', background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem' }}>Editar</button>
                                        <button disabled style={{ color: '#d1d5db', background: 'transparent', border: 'none', cursor: 'not-allowed', fontWeight: 600, fontSize: '0.875rem' }} title="Solo archivar">Borrar</button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
