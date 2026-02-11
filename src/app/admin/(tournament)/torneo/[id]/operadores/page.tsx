'use client';

import { useState } from 'react';

export default function TournamentOperators() {
    const [operators, setOperators] = useState([
        { id: 1, name: 'Roberto Garcia', email: 'rgarcia@gmail.com', role: 'admin_torneo' },
        { id: 2, name: 'Maria Lopez', email: 'mlopez@club.com', role: 'operador' },
    ]);

    return (
        <div style={{ maxWidth: '800px' }}>
            <div style={{ marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827', marginBottom: '8px' }}>Operadores del Torneo</h1>
                    <p style={{ color: '#6b7280' }}>Usuarios autorizados para cargar resultados en esta competencia.</p>
                </div>
                <button className="btn btn-primary">+ Asignar Operador</button>
            </div>

            <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                        <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                            <th style={{ padding: '16px 24px', fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>Usuario</th>
                            <th style={{ padding: '16px 24px', fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>Rol en Torneo</th>
                            <th style={{ padding: '16px 24px', textAlign: 'right' }}>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {operators.map((o) => (
                            <tr key={o.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                <td style={{ padding: '16px 24px' }}>
                                    <div style={{ fontWeight: 600, color: '#111827' }}>{o.name}</div>
                                    <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>{o.email}</div>
                                </td>
                                <td style={{ padding: '16px 24px' }}>
                                    <span style={{
                                        fontSize: '0.75rem',
                                        padding: '4px 8px',
                                        borderRadius: '999px',
                                        fontWeight: 600,
                                        background: o.role === 'admin_torneo' ? '#dbeafe' : '#f3f4f6',
                                        color: o.role === 'admin_torneo' ? '#1e40af' : '#374151'
                                    }}>
                                        {o.role === 'admin_torneo' ? 'Administrador' : 'Cargador de Datos'}
                                    </span>
                                </td>
                                <td style={{ padding: '16px 24px', textAlign: 'right' }}>
                                    <button style={{ color: '#ef4444', border: 'none', background: 'transparent', cursor: 'pointer', fontWeight: 600 }}>Quitar</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div style={{ marginTop: '24px', padding: '16px', borderRadius: '8px', background: '#f3f4f6', fontSize: '0.8125rem', color: '#6b7280' }}>
                💡 Los operadores solo pueden modificar resultados de los partidos, mientras que los administradores de torneo pueden editar el fixture y participantes.
            </div>
        </div>
    );
}
