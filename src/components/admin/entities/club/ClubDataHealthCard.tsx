'use client';

import { Activity, AlertTriangle, ArrowRight, ShieldAlert, ShieldCheck, XCircle } from 'lucide-react';
import type { ClubDashboardHealth } from '@/lib/club-admin/dashboard-types';

interface ClubDataHealthCardProps {
    health: ClubDashboardHealth;
}

function getStatusCopy(status: ClubDashboardHealth['status']) {
    if (status === 'error') {
        return {
            label: 'Requiere atencion',
            color: 'var(--danger)',
            glow: 'rgba(239, 68, 68, 0.12)',
            Icon: ShieldAlert,
        };
    }

    if (status === 'warning') {
        return {
            label: 'Con alertas',
            color: 'var(--warning)',
            glow: 'rgba(245, 158, 11, 0.12)',
            Icon: Activity,
        };
    }

    return {
        label: 'Operativo',
        color: 'var(--success)',
        glow: 'rgba(0, 163, 101, 0.12)',
        Icon: ShieldCheck,
    };
}

export function ClubDataHealthCard({ health }: ClubDataHealthCardProps) {
    const statusCopy = getStatusCopy(health.status);
    const topIssues = health.issues.slice(0, 4);
    const isHealthy = topIssues.length === 0;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative', overflow: 'hidden' }}>
            <div className="card-header" style={{ borderBottom: 'none', paddingBottom: 0, marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div
                        style={{
                            padding: '0.625rem',
                            background: statusCopy.glow,
                            borderRadius: '0.75rem',
                        }}
                    >
                        <statusCopy.Icon className="w-5 h-5" style={{ color: statusCopy.color }} />
                    </div>
                    <div>
                        <h3 className="card-title">Salud de datos</h3>
                        <p style={{ marginTop: '0.25rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            Snapshot real de la base del club
                        </p>
                    </div>
                </div>
            </div>

            <div style={{ display: 'grid', gap: '1rem', flex: 1 }}>
                <div
                    style={{
                        padding: '1rem 1.1rem',
                        borderRadius: '1rem',
                        background: 'var(--surface-elevated)',
                        border: '1px solid var(--border)',
                    }}
                >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
                        <div>
                            <span
                                style={{
                                    display: 'inline-block',
                                    fontSize: '0.65rem',
                                    fontWeight: 900,
                                    letterSpacing: '0.2em',
                                    textTransform: 'uppercase',
                                    color: statusCopy.color,
                                    marginBottom: '0.4rem',
                                }}
                            >
                                {statusCopy.label}
                            </span>
                            <div style={{ fontSize: '2rem', fontWeight: 900, letterSpacing: '-0.05em', lineHeight: 1 }}>
                                {health.completeness}%
                            </div>
                            <p style={{ marginTop: '0.45rem', fontSize: '0.78rem', color: 'var(--text-dim)' }}>
                                completitud detectada en identidad, perfil y modulos vinculados.
                            </p>
                        </div>

                        <div
                            style={{
                                minWidth: '4.5rem',
                                height: '4.5rem',
                                borderRadius: '999px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                background: statusCopy.glow,
                                border: `1px solid ${statusCopy.glow}`,
                            }}
                        >
                            <span style={{ fontSize: '1rem', fontWeight: 900, color: statusCopy.color }}>
                                {topIssues.length}
                            </span>
                        </div>
                    </div>
                </div>

                {isHealthy ? (
                    <div
                        style={{
                            flex: 1,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            textAlign: 'center',
                            padding: '1.25rem',
                            borderRadius: '1rem',
                            border: '1px solid rgba(0, 163, 101, 0.16)',
                            background: 'rgba(0, 163, 101, 0.05)',
                        }}
                    >
                        <div>
                            <ShieldCheck className="w-8 h-8" style={{ color: 'var(--success)', margin: '0 auto 0.75rem' }} />
                            <strong style={{ display: 'block', fontSize: '0.95rem' }}>Base operativa lista</strong>
                            <p style={{ marginTop: '0.4rem', fontSize: '0.78rem', color: 'var(--text-dim)' }}>
                                El club no muestra alertas activas en los paneles conectados.
                            </p>
                        </div>
                    </div>
                ) : (
                    <div style={{ display: 'grid', gap: '0.75rem' }}>
                        {topIssues.map((issue) => (
                            <div
                                key={issue.key}
                                style={{
                                    padding: '0.95rem 1rem',
                                    borderRadius: '0.9rem',
                                    background: 'var(--surface-elevated)',
                                    border: `1px solid ${issue.severity === 'error' ? 'rgba(239, 68, 68, 0.14)' : 'rgba(245, 158, 11, 0.14)'}`,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    gap: '0.75rem',
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                                    {issue.severity === 'error' ? (
                                        <XCircle className="w-4 h-4 text-red-500" />
                                    ) : (
                                        <AlertTriangle className="w-4 h-4 text-amber-500" />
                                    )}
                                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text)' }}>
                                        {issue.label}
                                    </span>
                                </div>
                                <ArrowRight className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
