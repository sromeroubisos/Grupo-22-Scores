'use client';

import { useAuth } from '@/context/AuthContext';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { db } from '@/lib/mock-db';

export default function MyTournamentsPage() {
    const { user } = useAuth();
    const [tournaments, setTournaments] = useState<any[]>([]);

    useEffect(() => {
        if (!user) return;

        // Fetch user tournaments similar to Dashboard
        const memberships = db.memberships.filter(m => m.userId === user.id);
        const torneos: any[] = memberships
            .filter(m => m.scopeType === 'tournament')
            .map(m => {
                const tournament = db.tournaments.find(t => t.id === m.scopeId);
                return tournament ? { ...tournament, role: m.role } : null;
            })
            .filter(t => t !== null);

        // Inherited
        const unionMemberships = memberships.filter(m => m.scopeType === 'union' && m.role === 'admin');
        unionMemberships.forEach(um => {
            const unionTournaments = db.tournaments.filter(t => t.unionId === um.scopeId);
            unionTournaments.forEach(ut => {
                if (!torneos.find(t => t.id === ut.id)) {
                    torneos.push({ ...ut, role: 'UNION_ADMIN_INHERITED' });
                }
            });
        });

        setTournaments(torneos);
    }, [user]);

    return (
        <div style={{ padding: '32px' }}>
            <h1 style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '24px' }}>Mis Torneos</h1>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '24px' }}>
                {tournaments.map(t => (
                    <Link key={t.id} href={`/admin/torneo/${t.id}`} style={{ textDecoration: 'none' }}>
                        <div className="card" style={{ padding: '24px', height: '100%', transition: 'transform 0.2s', border: '1px solid var(--color-border)', borderRadius: '12px', background: 'white' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
                                <div style={{ width: '48px', height: '48px', background: 'var(--color-bg-tertiary)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '1.2rem', color: 'var(--color-accent)' }}>
                                    {t.name.substring(0, 2).toUpperCase()}
                                </div>
                                <div>
                                    <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--color-text-primary)', margin: 0 }}>{t.name}</h3>
                                    <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>{t.seasonId}</span>
                                </div>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span className={`badge ${t.status === 'published' ? 'success' : 'warning'}`} style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', background: t.status === 'published' ? '#dcfce7' : '#fef9c3', color: t.status === 'published' ? '#166534' : '#854d0e' }}>
                                    {t.status}
                                </span>
                                <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                                    Rol: {t.role}
                                </span>
                            </div>
                        </div>
                    </Link>
                ))}
            </div>
            {tournaments.length === 0 && (
                <p>No tienes torneos asignados.</p>
            )}
        </div>
    );
}
