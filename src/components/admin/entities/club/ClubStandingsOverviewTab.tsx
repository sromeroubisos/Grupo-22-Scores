'use client';

import { Trophy } from 'lucide-react';
import type { ClubDashboardStanding } from '@/lib/club-admin/dashboard-types';

interface ClubStandingsOverviewTabProps {
    standings: ClubDashboardStanding[];
    loading?: boolean;
}

function formatUpdatedAt(value: string | null) {
    if (!value) return 'Sin fecha';

    return new Intl.DateTimeFormat('es-AR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    }).format(new Date(value));
}

export function ClubStandingsOverviewTab({
    standings,
    loading,
}: ClubStandingsOverviewTabProps) {
    if (loading) {
        return (
            <div style={{ minHeight: '220px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                Cargando posiciones...
            </div>
        );
    }

    return (
        <div style={{ display: 'grid', gap: '1.5rem' }}>
            <div className="card-header">
                <div>
                    <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Trophy className="w-4 h-4 text-accent" />
                        Torneos del club
                    </div>
                    <div className="subinfo">Posiciones reales del club en los torneos donde participa</div>
                </div>
            </div>

            {standings.length === 0 ? (
                <div
                    style={{
                        padding: '3rem 1.5rem',
                        border: '1px dashed var(--border)',
                        borderRadius: '16px',
                        textAlign: 'center',
                        color: 'var(--text-muted)',
                    }}
                >
                    No hay posiciones registradas para este club.
                </div>
            ) : (
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Torneo</th>
                            <th>#</th>
                            <th>PJ</th>
                            <th>PG</th>
                            <th>PE</th>
                            <th>PP</th>
                            <th>PTS</th>
                            <th>Dif.</th>
                            <th>Actualizado</th>
                        </tr>
                    </thead>
                    <tbody>
                        {standings.map((standing) => (
                            <tr key={`${standing.tournamentId}-${standing.phaseId || 'base'}-${standing.groupId || 'all'}`}>
                                <td>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                        <strong>{standing.tournamentName}</strong>
                                        <span style={{ color: 'var(--text-muted)' }}>
                                            {standing.groupId ? (standing.groupName || 'Grupo asignado') : 'Tabla general'}
                                        </span>
                                    </div>
                                </td>
                                <td className="mono" style={{ fontWeight: 900 }}>
                                    {standing.position != null ? `#${standing.position}` : '-'}
                                </td>
                                <td className="mono">{standing.played}</td>
                                <td className="mono">{standing.won}</td>
                                <td className="mono">{standing.drawn}</td>
                                <td className="mono">{standing.lost}</td>
                                <td className="mono" style={{ fontWeight: 900 }}>{standing.points}</td>
                                <td className="mono">{standing.goalDifference}</td>
                                <td className="mono">{formatUpdatedAt(standing.updatedAt)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    );
}
