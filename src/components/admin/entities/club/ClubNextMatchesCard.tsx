'use client';

import { Calendar, Clock, MapPin, Play, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import TeamLogo from '@/components/TeamLogo';
import type { ClubDashboardMatch } from '@/lib/club-admin/dashboard-types';

interface ClubNextMatchesCardProps {
    categories: string[];
    matches: ClubDashboardMatch[];
    loading?: boolean;
}

export function ClubNextMatchesCard({ categories, matches, loading }: ClubNextMatchesCardProps) {
    if (loading) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '300px' }}>
                <Loader2 className="w-8 h-8 animate-spin text-accent" style={{ opacity: 0.2 }} />
                <p className="meta-label" style={{ marginTop: '1rem', opacity: 0.2 }}>Sincronizando cronograma...</p>
            </div>
        );
    }

    return (
        <>
            <div className="card-header">
                <div>
                    <div className="card-title">Eventos Proximos</div>
                    <div className="subinfo" style={{ marginTop: '0.25rem' }}>
                        {matches.length > 0 ? 'Sincronizacion en vivo con G22 API' : 'Sin eventos programados'}
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {categories.length > 0 ? (
                        <select className="btn" style={{ appearance: 'none', background: 'var(--surface)', border: '1px solid var(--border)' }}>
                            <option>Todos los planteles</option>
                            {categories.map((category) => <option key={category}>{category}</option>)}
                        </select>
                    ) : null}
                    <button className="btn btn-primary">Calendario full</button>
                </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {matches.map((match) => {
                    const date = match.dateTime ? new Date(match.dateTime) : null;
                    const day = date ? format(date, 'dd') : '--';
                    const month = date ? format(date, 'MMM', { locale: es }).toUpperCase() : '---';
                    const hour = date ? format(date, 'HH:mm') : '--:--';

                    return (
                        <div
                            key={match.id}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '1.5rem',
                                padding: '1rem',
                                background: 'var(--surface)',
                                border: '1px solid var(--border)',
                                borderRadius: '18px',
                                cursor: 'pointer',
                            }}
                        >
                            <div
                                style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexShrink: 0,
                                    width: '4rem',
                                    height: '4rem',
                                    background: 'var(--surface-elevated)',
                                    borderRadius: '14px',
                                    border: '1px solid var(--border)',
                                }}
                            >
                                <span className="mono" style={{ fontSize: '0.65rem', fontWeight: 900, color: 'var(--text-muted)', textTransform: 'uppercase', lineHeight: 1, marginBottom: '0.25rem' }}>{month}</span>
                                <span className="mono" style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--text)', lineHeight: 1, letterSpacing: '-0.05em' }}>{day}</span>
                            </div>

                            <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                                    <span style={{ padding: '0.125rem 0.375rem', background: 'rgba(59, 130, 246, 0.12)', border: '1px solid rgba(59, 130, 246, 0.16)', color: 'var(--accent)', fontSize: '0.55rem', fontWeight: 900, textTransform: 'uppercase', borderRadius: '999px' }}>
                                        Primera
                                    </span>
                                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                                        {match.tournament?.name || 'Competencia oficial'}
                                    </span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.625rem', minWidth: 0 }}>
                                        <TeamLogo
                                            name={match.home.name}
                                            shortName={match.home.shortName}
                                            teamId={match.home.id}
                                            logoUrl={match.home.logoUrl}
                                            size={30}
                                        />
                                        <span style={{ fontSize: '1.1rem', fontWeight: 900, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '-0.05em' }}>
                                            {match.home.shortName || match.home.name}
                                        </span>
                                    </span>
                                    <div style={{ height: '1px', width: '1rem', background: 'var(--border)' }} />
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.625rem', minWidth: 0 }}>
                                        <TeamLogo
                                            name={match.away.name}
                                            shortName={match.away.shortName}
                                            teamId={match.away.id}
                                            logoUrl={match.away.logoUrl}
                                            size={30}
                                        />
                                        <span style={{ fontSize: '1.1rem', fontWeight: 900, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '-0.05em' }}>
                                            {match.away.shortName || match.away.name}
                                        </span>
                                    </span>
                                </div>
                                <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', color: 'var(--text-muted)' }}>
                                        <Clock className="w-3.5 h-3.5" />
                                        <span className="mono" style={{ fontSize: '0.65rem', fontWeight: 500, letterSpacing: '-0.025em' }}>{hour} HS</span>
                                    </div>
                                    {match.venue ? (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', color: 'var(--text-muted)' }}>
                                            <MapPin className="w-3.5 h-3.5" />
                                            <span style={{ fontSize: '0.65rem', fontWeight: 500, letterSpacing: '-0.025em' }}>{match.venue}</span>
                                        </div>
                                    ) : null}
                                </div>
                            </div>

                            <button
                                style={{
                                    width: '2.75rem',
                                    height: '2.75rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    background: 'var(--surface-elevated)',
                                    border: '1px solid var(--border)',
                                    borderRadius: '14px',
                                    color: 'var(--text-muted)',
                                }}
                            >
                                <Play className="w-4 h-4 fill-current ml-0.5" />
                            </button>
                        </div>
                    );
                })}

                {matches.length === 0 && !loading ? (
                    <div style={{ padding: '4rem 0', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '2px dashed var(--border)', borderRadius: '18px', opacity: 0.3 }}>
                        <Calendar className="w-10 h-10 mb-4" />
                        <p style={{ fontSize: '0.65rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.2em' }}>Sin cronograma disponible</p>
                    </div>
                ) : null}
            </div>
        </>
    );
}
