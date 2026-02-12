'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { db } from '@/lib/mock-db';

export default function UnionTournaments() {
    const params = useParams();
    const unionId = params?.id as string;
    const [filterStatus, setFilterStatus] = useState('all');
    const [tournaments, setTournaments] = useState<any[]>([]);

    useEffect(() => {
        if (!unionId) return;
        const unionTournaments = db.tournaments.filter(t => t.unionId === unionId);

        // Enrich with counts
        const enriched = unionTournaments.map(t => {
            const matchesCount = db.matches.filter(m => m.tournamentId === t.id).length;
            // distinct clubs in matches
            const clubIds = new Set<string>();
            db.matches.filter(m => m.tournamentId === t.id).forEach(m => {
                clubIds.add(m.homeClubId);
                clubIds.add(m.awayClubId);
            });

            return {
                ...t,
                matchesCount,
                teamsCount: clubIds.size
            };
        });

        setTournaments(enriched);
    }, [unionId]);

    const filteredTournaments = tournaments.filter(t => filterStatus === 'all' || t.status === filterStatus);

    return (
        <div style={{ paddingBottom: '40px' }}>
            {/* Header */}
            <div style={{ marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h1 style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '8px' }}>Torneos</h1>
                    <p style={{ color: 'var(--color-text-secondary)' }}>Gestiona los torneos oficiales y sus etapas.</p>
                </div>
                <Link href={`/admin/union/${unionId}/torneos/crear`}>
                    <button className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>+</span> Nuevo Torneo
                    </button>
                </Link>
            </div>

            {/* Filters */}
            <div className="card" style={{ padding: '16px 24px', marginBottom: '24px', display: 'flex', gap: '16px', alignItems: 'center' }}>
                <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>Filtrar por:</span>
                <select
                    style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--color-border)', fontSize: '0.875rem', background: 'var(--color-bg-primary)', color: 'var(--color-text-primary)' }}
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                >
                    <option value="all">Todos los estados</option>
                    <option value="published">Publicados</option>
                    <option value="draft">Borradores</option>
                </select>

                <select style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--color-border)', fontSize: '0.875rem', background: 'var(--color-bg-primary)', color: 'var(--color-text-primary)' }}>
                    <option value="2026">Temporada 2026</option>
                    <option value="2025">Temporada 2025</option>
                </select>
            </div>

            {/* Tournaments Table */}
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                        <tr style={{ background: 'var(--color-bg-secondary)', borderBottom: '1px solid var(--color-border)' }}>
                            <th style={{ padding: '16px 24px', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Nombre</th>
                            <th style={{ padding: '16px 24px', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Tipo</th>
                            <th style={{ padding: '16px 24px', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Estado</th>
                            <th style={{ padding: '16px 24px', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Equipos</th>
                            <th style={{ padding: '16px 24px', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Actividad</th>
                            <th style={{ padding: '16px 24px', textAlign: 'right' }}>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredTournaments.length > 0 ? filteredTournaments.map((t) => (
                            <tr key={t.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                <td style={{ padding: '16px 24px' }}>
                                    <div style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{t.name}</div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>{t.seasonId}</div>
                                </td>
                                <td style={{ padding: '16px 24px', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>{t.format || 'Standard'}</td>
                                <td style={{ padding: '16px 24px' }}>
                                    <span style={{
                                        fontSize: '0.75rem',
                                        padding: '4px 8px',
                                        borderRadius: '999px',
                                        fontWeight: 600,
                                        background: t.status === 'published' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(234, 179, 8, 0.2)',
                                        color: t.status === 'published' ? '#22c55e' : '#eab308'
                                    }}>
                                        {t.status === 'published' ? 'Publicado' : 'Borrador'}
                                    </span>
                                </td>
                                <td style={{ padding: '16px 24px', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>{t.teamsCount}</td>
                                <td style={{ padding: '16px 24px', fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                                    <div>{t.matchesCount} partidos</div>
                                </td>
                                <td style={{ padding: '16px 24px', textAlign: 'right' }}>
                                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                        <Link
                                            href={`/admin/torneo/${t.id}`}
                                            style={{
                                                fontSize: '0.875rem',
                                                padding: '6px 12px',
                                                borderRadius: '6px',
                                                background: 'var(--color-bg-tertiary)',
                                                color: 'var(--color-accent)',
                                                textDecoration: 'none',
                                                fontWeight: 600
                                            }}
                                        >
                                            Administrar
                                        </Link>
                                    </div>
                                </td>
                            </tr>
                        )) : (
                            <tr>
                                <td colSpan={6} style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                                    No se encontraron torneos.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
