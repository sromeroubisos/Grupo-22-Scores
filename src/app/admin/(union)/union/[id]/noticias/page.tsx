'use client';

import { useState } from 'react';

export default function UnionNews() {

    // Mock News
    const [news, setNews] = useState([
        { id: 1, title: 'Inicio del Top 12', tag: 'Torneo', status: 'Publicado', date: '01/03/2026' },
        { id: 2, title: 'Nuevas reglas de scrum', tag: 'Reglamento', status: 'Borrador', date: '28/02/2026' },
        { id: 3, title: 'Convocatoria M19', tag: 'Selección', status: 'Publicado', date: '20/02/2026' },
    ]);

    return (
        <div>
            <div style={{ marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h1 style={{ fontSize: '1.8rem', fontWeight: 700, color: '#111827', marginBottom: '8px' }}>Noticias</h1>
                    <p style={{ color: '#6b7280' }}>Novedades destacadas para la app pública (Máx 5).</p>
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
                    + Nueva Noticia
                </button>
            </div>

            <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                        <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                            <th style={{ padding: '16px 24px', fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>Título</th>
                            <th style={{ padding: '16px 24px', fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>Tag</th>
                            <th style={{ padding: '16px 24px', fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>Fecha</th>
                            <th style={{ padding: '16px 24px', fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>Estado</th>
                            <th style={{ padding: '16px 24px', textAlign: 'right' }}>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {news.map((n) => (
                            <tr key={n.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                <td style={{ padding: '16px 24px' }}>
                                    <div style={{ fontWeight: 600, color: '#111827' }}>{n.title}</div>
                                </td>
                                <td style={{ padding: '16px 24px', fontSize: '0.875rem', color: '#4b5563' }}>
                                    <span style={{ background: '#f3f4f6', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem' }}>{n.tag}</span>
                                </td>
                                <td style={{ padding: '16px 24px', fontSize: '0.875rem', color: '#4b5563' }}>{n.date}</td>
                                <td style={{ padding: '16px 24px' }}>
                                    <span style={{
                                        fontSize: '0.75rem',
                                        padding: '4px 8px',
                                        borderRadius: '999px',
                                        fontWeight: 600,
                                        background: n.status === 'Publicado' ? '#dcfce7' : '#f3f4f6',
                                        color: n.status === 'Publicado' ? '#166534' : '#6b7280'
                                    }}>
                                        {n.status}
                                    </span>
                                </td>
                                <td style={{ padding: '16px 24px', textAlign: 'right' }}>
                                    <button style={{ color: 'var(--color-accent)', background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem', marginRight: '12px' }}>Editar</button>
                                    <button style={{ color: '#ef4444', background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem' }}>Eliminar</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
