'use client';

import { useState } from 'react';

export default function UnionUsers() {

    // Mock Users
    const [users, setUsers] = useState([
        { id: 1, name: 'Juan Perez', email: 'juan@example.com', role: 'admin_torneo', scope: 'UAR Top 12', status: 'Activo' },
        { id: 2, name: 'Pedro Lopez', email: 'pedro@example.com', role: 'operador', scope: 'Copa de Plata', status: 'Activo' },
        { id: 3, name: 'Maria Garcia', email: 'maria@example.com', role: 'operador', scope: 'Seven Juvenil', status: 'Invitado' },
    ]);

    return (
        <div>
            <div style={{ marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h1 style={{ fontSize: '1.8rem', fontWeight: 700, color: '#111827', marginBottom: '8px' }}>Usuarios</h1>
                    <p style={{ color: '#6b7280' }}>Administra el acceso y roles de los colaboradores.</p>
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
                    Invitar Usuario
                </button>
            </div>

            <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                        <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                            <th style={{ padding: '16px 24px', fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>Usuario</th>
                            <th style={{ padding: '16px 24px', fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>Rol</th>
                            <th style={{ padding: '16px 24px', fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>Scope (Torneo)</th>
                            <th style={{ padding: '16px 24px', fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>Estado</th>
                            <th style={{ padding: '16px 24px', textAlign: 'right' }}>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {users.map((u) => (
                            <tr key={u.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                <td style={{ padding: '16px 24px' }}>
                                    <div style={{ fontWeight: 600, color: '#111827' }}>{u.name}</div>
                                    <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>{u.email}</div>
                                </td>
                                <td style={{ padding: '16px 24px', fontSize: '0.875rem', color: '#4b5563' }}>
                                    {u.role === 'admin_torneo' ? 'Admin Torneo' : 'Operador'}
                                </td>
                                <td style={{ padding: '16px 24px', fontSize: '0.875rem', color: '#4b5563' }}>{u.scope}</td>
                                <td style={{ padding: '16px 24px' }}>
                                    <span style={{
                                        fontSize: '0.75rem',
                                        padding: '4px 8px',
                                        borderRadius: '999px',
                                        fontWeight: 600,
                                        background: u.status === 'Activo' ? '#dcfce7' : '#fef9c3',
                                        color: u.status === 'Activo' ? '#166534' : '#854d0e'
                                    }}>
                                        {u.status}
                                    </span>
                                </td>
                                <td style={{ padding: '16px 24px', textAlign: 'right' }}>
                                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                        <button style={{ color: 'var(--color-accent)', background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem' }}>Editar</button>
                                        <button style={{ color: '#ef4444', background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem' }}>Revocar</button>
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
