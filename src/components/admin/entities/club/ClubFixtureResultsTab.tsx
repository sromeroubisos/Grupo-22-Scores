'use client';

import { Calendar, Clock3, MapPin, Trophy } from 'lucide-react';
import { getMatchScoreDisplay } from '@/lib/matchUtils';
import type { ClubDashboardMatch } from '@/lib/club-admin/dashboard-types';

interface ClubFixtureResultsTabProps {
    upcomingMatches: ClubDashboardMatch[];
    recentMatches: ClubDashboardMatch[];
    loading?: boolean;
}

function formatDate(value: string | null) {
    if (!value) return 'Fecha a confirmar';

    return new Intl.DateTimeFormat('es-AR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    }).format(new Date(value));
}

function formatTime(value: string | null) {
    if (!value) return 'Hora a confirmar';

    return new Intl.DateTimeFormat('es-AR', {
        hour: '2-digit',
        minute: '2-digit',
    }).format(new Date(value));
}

function formatStatus(status: string) {
    const normalized = String(status || 'scheduled').toLowerCase();

    if (normalized === 'live' || normalized === 'in_play') return 'En vivo';
    if (normalized === 'final' || normalized === 'finished' || normalized === 'ft') return 'Finalizado';
    if (normalized === 'postponed') return 'Postergado';
    if (normalized === 'cancelled') return 'Cancelado';
    return 'Programado';
}

function renderMatchTable(matches: ClubDashboardMatch[], mode: 'fixture' | 'results') {
    if (matches.length === 0) {
        return (
            <div
                style={{
                    padding: '3rem 1.5rem',
                    border: '1px dashed var(--border)',
                    borderRadius: '16px',
                    textAlign: 'center',
                    color: 'var(--text-muted)',
                }}
            >
                {mode === 'fixture'
                    ? 'No hay partidos programados para este club.'
                    : 'No hay partidos finalizados registrados para este club.'}
            </div>
        );
    }

    return (
        <table className="data-table">
            <thead>
                <tr>
                    <th>Fecha</th>
                    <th>Hora</th>
                    <th>Torneo</th>
                    <th>Partido</th>
                    <th>Condición</th>
                    <th>{mode === 'fixture' ? 'Estado' : 'Resultado'}</th>
                </tr>
            </thead>
            <tbody>
                {matches.map((match) => (
                    <tr key={`${mode}-${match.id}`}>
                        <td className="mono">{formatDate(match.dateTime)}</td>
                        <td className="mono">{formatTime(match.dateTime)}</td>
                        <td>{match.tournament?.name || 'Partido del club'}</td>
                        <td>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                <strong>
                                    {match.home.shortName || match.home.name}
                                    {' vs '}
                                    {match.away.shortName || match.away.name}
                                </strong>
                                {match.venue && (
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', color: 'var(--text-muted)' }}>
                                        <MapPin className="w-3.5 h-3.5" />
                                        {match.venue}
                                    </span>
                                )}
                            </div>
                        </td>
                        <td>{match.isHome ? 'Local' : 'Visitante'}</td>
                        <td className="mono" style={{ fontWeight: 800 }}>
                            {mode === 'fixture'
                                ? formatStatus(match.status)
                                : getMatchScoreDisplay({ status: match.status, score: match.score })}
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

export function ClubFixtureResultsTab({
    upcomingMatches,
    recentMatches,
    loading,
}: ClubFixtureResultsTabProps) {
    if (loading) {
        return (
            <div style={{ display: 'grid', gap: '1.5rem' }}>
                <div className="card-header">
                    <div>
                        <div className="card-title">Fixture y resultados</div>
                        <div className="subinfo">Sincronizando partidos del club</div>
                    </div>
                </div>
                <div
                    style={{
                        minHeight: '220px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--text-muted)',
                    }}
                >
                    Cargando partidos...
                </div>
            </div>
        );
    }

    return (
        <div style={{ display: 'grid', gap: '1.5rem' }}>
            <div className="card-header">
                <div>
                    <div className="card-title">Fixture y resultados</div>
                    <div className="subinfo">Lectura directa desde el sistema central de torneos</div>
                </div>
            </div>

            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: '1rem',
                }}
            >
                <div
                    style={{
                        border: '1px solid var(--border)',
                        borderRadius: '16px',
                        padding: '1rem 1.25rem',
                        background: 'var(--surface)',
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                        <Calendar className="w-4 h-4 text-accent" />
                        <span className="mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>FIXTURE</span>
                    </div>
                    <div style={{ fontSize: '2rem', fontWeight: 900 }}>{upcomingMatches.length}</div>
                    <div className="subinfo">Partidos próximos visibles</div>
                </div>

                <div
                    style={{
                        border: '1px solid var(--border)',
                        borderRadius: '16px',
                        padding: '1rem 1.25rem',
                        background: 'var(--surface)',
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                        <Trophy className="w-4 h-4 text-accent" />
                        <span className="mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>RESULTADOS</span>
                    </div>
                    <div style={{ fontSize: '2rem', fontWeight: 900 }}>{recentMatches.length}</div>
                    <div className="subinfo">Partidos jugados recientes</div>
                </div>

                <div
                    style={{
                        border: '1px solid var(--border)',
                        borderRadius: '16px',
                        padding: '1rem 1.25rem',
                        background: 'var(--surface)',
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                        <Clock3 className="w-4 h-4 text-accent" />
                        <span className="mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>ESTADO</span>
                    </div>
                    <div style={{ fontSize: '1.15rem', fontWeight: 900 }}>
                        {upcomingMatches[0] ? formatStatus(upcomingMatches[0].status) : 'Sin agenda'}
                    </div>
                    <div className="subinfo">Próximo estado relevante del club</div>
                </div>
            </div>

            <section
                style={{
                    border: '1px solid var(--border)',
                    borderRadius: '20px',
                    padding: '1.25rem',
                    background: 'var(--surface)',
                }}
            >
                <div className="card-header" style={{ paddingBottom: '1rem', marginBottom: '1rem' }}>
                    <div>
                        <div className="card-title">Fixture</div>
                        <div className="subinfo">Próximos compromisos del club</div>
                    </div>
                </div>
                {renderMatchTable(upcomingMatches, 'fixture')}
            </section>

            <section
                style={{
                    border: '1px solid var(--border)',
                    borderRadius: '20px',
                    padding: '1.25rem',
                    background: 'var(--surface)',
                }}
            >
                <div className="card-header" style={{ paddingBottom: '1rem', marginBottom: '1rem' }}>
                    <div>
                        <div className="card-title">Resultados</div>
                        <div className="subinfo">Últimos partidos cerrados</div>
                    </div>
                </div>
                {renderMatchTable(recentMatches, 'results')}
            </section>
        </div>
    );
}
