'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { db } from '@/lib/mock-db';

export default function UnionClubs() {
    const params = useParams();
    const unionId = params?.id as string;
    const [clubs, setClubs] = useState<any[]>([]);

    useEffect(() => {
        if (!unionId) return;
        const unionClubs = db.clubs.filter(c => c.unionId === unionId);

        // Enrich with counts (e.g. participation in tournaments)
        // For now, we mock the participation count or calculate it if possible
        const enriched = unionClubs.map(c => {
            // Count unique tournaments this club has matches in
            const tournaments = new Set<string>();
            db.matches.filter(m => m.homeClubId === c.id || m.awayClubId === c.id).forEach(m => {
                tournaments.add(m.tournamentId);
            });

            return {
                ...c,
                tournaments: tournaments.size,
                status: 'Activo' // Mock status as it's not in DB
            };
        });

        setClubs(enriched);
    }, [unionId]);

    return (
        <div>
            <div style={{ marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h1 style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '8px' }}>Clubes</h1>
                    <p style={{ color: 'var(--color-text-secondary)' }}>Listado de entidades vinculadas a esta unión.</p>
                </div>
                <button className="btn btn-primary">+ Nuevo Club</button>
            </div>

            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                        <tr style={{ background: 'var(--color-bg-secondary)', borderBottom: '1px solid var(--color-border)' }}>
                            <th style={{ padding: '16px 24px', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Nombre Oficial</th>
                            <th style={{ padding: '16px 24px', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Sigla</th>
                            <th style={{ padding: '16px 24px', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Ubicación</th>
                            <th style={{ padding: '16px 24px', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Torneos</th>
                            <th style={{ padding: '16px 24px', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Estado</th>
                            <th style={{ padding: '16px 24px', textAlign: 'right' }}>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {clubs.length > 0 ? clubs.map((c) => (
                            <tr key={c.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                <td style={{ padding: '16px 24px' }}>
                                    <div style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{c.name}</div>
                                </td>
                                <td style={{ padding: '16px 24px', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>{c.shortName}</td>
                                <td style={{ padding: '16px 24px', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>{c.city}</td>
                                <td style={{ padding: '16px 24px', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>{c.tournaments}</td>
                                <td style={{ padding: '16px 24px' }}>
                                    <span style={{
                                        fontSize: '0.75rem',
                                        padding: '4px 8px',
                                        borderRadius: '999px',
                                        fontWeight: 600,
                                        background: 'rgba(34, 197, 94, 0.2)',
                                        color: '#22c55e'
                                    }}>
                                        {c.status}
                                    </span>
                                </td>
                                <td style={{ padding: '16px 24px', textAlign: 'right' }}>
                                    <button style={{ color: 'var(--color-accent)', border: 'none', background: 'transparent', cursor: 'pointer', fontWeight: 600 }}>Editar</button>
                                </td>
                            </tr>
                        )) : (
                            <tr>
                                <td colSpan={6} style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                                    No se encontraron clubes.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
