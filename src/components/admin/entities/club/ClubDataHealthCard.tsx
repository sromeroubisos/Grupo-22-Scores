'use client';

import { Activity, ShieldCheck, AlertTriangle, XCircle, ArrowRight } from 'lucide-react';

interface ClubDataHealthCardProps {
    diagnostics: {
        hasName: boolean;
        hasSlug: boolean;
        hasCountry: boolean;
        hasLogo: boolean;
        hasUnion: boolean;
    };
}

export function ClubDataHealthCard({ diagnostics }: ClubDataHealthCardProps) {
    const issues = [
        { key: 'hasName', label: 'Identidad Crítica', severity: 'error' },
        { key: 'hasLogo', label: 'Logo Institucional', severity: 'warning' },
        { key: 'hasUnion', label: 'ID Oficial Unión', severity: 'error' },
        { key: 'hasCountry', label: 'Geo-Localización', severity: 'warning' },
    ].filter(issue => !diagnostics[issue.key as keyof typeof diagnostics]);

    const isHealthy = issues.length === 0;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
            {isHealthy ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '1.5rem 0' }}>
                    <div style={{ width: '5rem', height: '5rem', borderRadius: '50%', background: 'rgba(0,163,101,0.05)', border: '1px solid rgba(0,163,101,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '2rem', boxShadow: '0 0 50px rgba(0,163,101,0.1)', position: 'relative' }}>
                        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,163,101,0.1)', borderRadius: '50%', opacity: 0.2 }} className="animate-ping" />
                        <ShieldCheck className="w-10 h-10" style={{ color: 'var(--success)' }} />
                    </div>

                    <span style={{ fontSize: '0.65rem', fontWeight: 900, textTransform: 'uppercase', color: 'var(--success)', letterSpacing: '0.3em', marginBottom: '0.5rem' }}>Estado de Datos</span>
                    <h2 style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--success)', letterSpacing: '-0.05em', marginBottom: '0.75rem', lineHeight: 1 }}>ÓPTIMO</h2>
                    <p style={{ fontSize: '0.875rem', color: 'var(--text-dim)', maxWidth: '200px', lineHeight: 1.6 }}>Toda la información crítica está validada y lista para producción.</p>
                </div>
            ) : (
                <div style={{ width: '100%' }}>
                    <div className="card-header" style={{ borderBottom: 'none', paddingBottom: 0, marginBottom: '2.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <div style={{ padding: '0.625rem', background: 'rgba(217, 119, 6, 0.1)', borderRadius: '0.75rem' }}>
                                <Activity className="w-5 h-5 text-accent" />
                            </div>
                            <h3 className="card-title">Salud de Datos</h3>
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        {issues.map((issue) => (
                            <div
                                key={issue.key}
                                style={{
                                    padding: '1rem',
                                    borderRadius: '0.75rem',
                                    background: 'var(--surface-elevated)',
                                    border: `1px solid ${issue.severity === 'error' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(245, 158, 11, 0.1)'}`,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    cursor: 'pointer'
                                }}
                                className="group transition-all"
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                    {issue.severity === 'error' ? (
                                        <XCircle className="w-4 h-4 text-red-500" />
                                    ) : (
                                        <AlertTriangle className="w-4 h-4 text-amber-500" />
                                    )}
                                    <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--text)' }}>{issue.label}</span>
                                </div>
                                <ArrowRight className="w-4 h-4 transition-all transform -translate-x-1 group-hover:translate-x-0" style={{ color: 'var(--text-muted)' }} />
                            </div>
                        ))}
                    </div>

                    <div style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border)' }}>
                        <p style={{ fontSize: '0.6875rem', color: 'var(--text-dim)', textAlign: 'center', fontStyle: 'italic' }}>Resolvé estas inconsistencias para activar la sincronización pública.</p>
                    </div>
                </div>
            )}
        </div>
    );
}
