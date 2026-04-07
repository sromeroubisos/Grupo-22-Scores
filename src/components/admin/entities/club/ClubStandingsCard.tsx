'use client';

import { Trophy, Loader2 } from 'lucide-react';

interface StandingRow {
    pos: number;
    label: string;
    row_id: string;
    pj: number;
    pts: number;
}

interface ClubStandingsCardProps {
    clubId: string;
    tournamentName?: string;
    standings?: StandingRow[];
    loading?: boolean;
}

export function ClubStandingsCard({ tournamentName, standings, loading }: ClubStandingsCardProps) {
    const displayStandings = standings || [];
    const currentPos = displayStandings[0]?.pos || '-';

    if (loading) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '300px' }}>
                <Loader2 className="w-8 h-8 animate-spin text-accent" style={{ opacity: 0.2 }} />
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative', overflow: 'hidden' }}>
            <Trophy className="w-48 h-48" style={{ position: 'absolute', right: '-2.5rem', bottom: '-2.5rem', color: 'rgba(255,255,255,0.02)', pointerEvents: 'none' }} />

            <div className="card-header">
                <div>
                    <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Trophy className="w-4 h-4 text-accent" />
                        Tablas
                    </div>
                    <div className="subinfo" style={{ marginTop: '0.25rem' }}>Posiciones del club</div>
                </div>
                <div style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--accent)', letterSpacing: '-0.05em' }}>#{currentPos}</div>
            </div>

            <div style={{ flex: 1 }}>
                <table className="data-table">
                    <thead>
                        <tr>
                            <th style={{ width: '2rem' }}>#</th>
                            <th>Torneo</th>
                            <th style={{ textAlign: 'right' }}>PJ</th>
                            <th style={{ textAlign: 'right' }}>PTS</th>
                        </tr>
                    </thead>
                    <tbody>
                        {displayStandings.length === 0 ? (
                            <tr>
                                <td colSpan={4} style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--text-muted)' }}>
                                    No hay posiciones registradas
                                </td>
                            </tr>
                        ) : (
                            displayStandings.map((row) => (
                                <tr key={row.row_id} style={{ background: 'var(--surface-elevated)' }}>
                                    <td className="mono" style={{ color: 'var(--text-muted)' }}>{row.pos}</td>
                                    <td>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <div style={{ width: '0.25rem', height: '0.25rem', borderRadius: '50%', background: 'var(--accent)', boxShadow: '0 0 8px var(--accent-glow)' }} />
                                            <span style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '-0.025em', color: 'var(--text)' }}>
                                                {row.label}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="mono" style={{ textAlign: 'right', color: 'var(--text-dim)' }}>{row.pj}</td>
                                    <td className="mono" style={{ textAlign: 'right', fontWeight: 900, color: 'var(--text)' }}>{row.pts}</td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                <span style={{ fontSize: '0.65rem', fontWeight: 900, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.1em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '150px' }}>
                    {tournamentName || 'Resumen de posiciones'}
                </span>
                <button style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: '0.65rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', cursor: 'pointer' }}>
                    Ver posiciones →
                </button>
            </div>
        </div>
    );
}
