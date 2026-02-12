'use client';

import { useState } from 'react';

export default function UnionAudit() {

    // Mock Audit Log
    const logs = [
        { id: 1, user: 'Juan Perez', action: 'CREATE', entity: 'Torneo', target: 'Top 12 Clausura', timestamp: '05/02/2026 10:30' },
        { id: 2, user: 'Pedro Lopez', action: 'UPDATE', entity: 'Partido', target: 'SIC vs CASI', timestamp: '05/02/2026 10:15' },
        { id: 3, user: 'Maria Garcia', action: 'LOGIN', entity: 'Sistema', target: '-', timestamp: '05/02/2026 09:45' },
        { id: 4, user: 'Juan Perez', action: 'PUBLISH', entity: 'Noticia', target: 'Inicio del Top 12', timestamp: '04/02/2026 18:20' },
        { id: 5, user: 'System', action: 'ARCHIVE', entity: 'Temporada', target: '2025', timestamp: '01/01/2026 00:00' },
    ];

    return (
        <div>
            <div style={{ marginBottom: '32px' }}>
                <h1 style={{ fontSize: '1.8rem', fontWeight: 700, color: '#111827', marginBottom: '8px' }}>Auditoría</h1>
                <p style={{ color: '#6b7280' }}>Registro de actividades y cambios en la unión.</p>
            </div>

            {/* Filters */}
            <div style={{ background: 'white', padding: '16px 24px', borderRadius: '12px', border: '1px solid #e5e7eb', marginBottom: '24px', display: 'flex', gap: '16px', alignItems: 'center' }}>
                <input type="text" placeholder="Buscar por usuario..." style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '0.875rem', width: '200px' }} />

                <select style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '0.875rem' }}>
                    <option value="all">Todas las entidades</option>
                    <option value="torneo">Torneos</option>
                    <option value="partido">Partidos</option>
                    <option value="club">Clubes</option>
                </select>

                <select style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '0.875rem' }}>
                    <option value="all">Cualquier acción</option>
                    <option value="create">Creación</option>
                    <option value="update">Edición</option>
                    <option value="delete">Borrado</option>
                </select>
            </div>

            {/* Feed */}
            <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                        <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                            <th style={{ padding: '16px 24px', fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>Usuario</th>
                            <th style={{ padding: '16px 24px', fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>Acción</th>
                            <th style={{ padding: '16px 24px', fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>Entidad</th>
                            <th style={{ padding: '16px 24px', fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>Objetivo</th>
                            <th style={{ padding: '16px 24px', fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>Fecha</th>
                        </tr>
                    </thead>
                    <tbody>
                        {logs.map((log) => (
                            <tr key={log.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                <td style={{ padding: '16px 24px' }}>
                                    <div style={{ fontWeight: 600, color: '#111827' }}>{log.user}</div>
                                </td>
                                <td style={{ padding: '16px 24px' }}>
                                    <span style={{
                                        fontSize: '0.75rem',
                                        padding: '4px 8px',
                                        borderRadius: '999px',
                                        fontWeight: 600,
                                        background: log.action === 'CREATE' ? '#dcfce7' : log.action === 'DELETE' ? '#fee2e2' : '#e0f2fe',
                                        color: log.action === 'CREATE' ? '#166534' : log.action === 'DELETE' ? '#991b1b' : '#075985'
                                    }}>
                                        {log.action}
                                    </span>
                                </td>
                                <td style={{ padding: '16px 24px', fontSize: '0.875rem', color: '#4b5563' }}>{log.entity}</td>
                                <td style={{ padding: '16px 24px', fontSize: '0.875rem', color: '#4b5563' }}>{log.target}</td>
                                <td style={{ padding: '16px 24px', fontSize: '0.875rem', color: '#6b7280' }}>{log.timestamp}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
