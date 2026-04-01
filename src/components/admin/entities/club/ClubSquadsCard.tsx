'use client';

import { Users, ChevronRight, UserPlus, ShieldCheck, Briefcase, Loader2 } from 'lucide-react';
import { type Division } from '@/lib/services/divisionService';

interface ClubSquadsCardProps {
    divisions: Division[];
    fallbackCategories: string[];
    loading?: boolean;
}

function formatDivisionMeta(division: Division) {
    const parts = [division.sport, division.gender, division.category]
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value));

    return parts.length > 0 ? parts.join(' / ') : 'Segmento sin clasificar';
}

export function ClubSquadsCard({ divisions, fallbackCategories, loading }: ClubSquadsCardProps) {
    if (loading) {
        return (
            <>
                <div className="card-header">
                    <div className="card-title">Planteles Registrados</div>
                    <button className="btn">Gestionar</button>
                </div>
                <div className="py-16 flex flex-col items-center justify-center gap-4 opacity-50">
                    <Loader2 className="w-8 h-8 animate-spin text-accent" />
                    <p className="text-[11px] font-black uppercase tracking-[0.2em]">Sincronizando planteles</p>
                </div>
            </>
        );
    }

    if (divisions.length > 0) {
        return (
            <>
                <div className="card-header">
                    <div className="card-title">Planteles Registrados</div>
                    <button className="btn">Gestionar</button>
                </div>
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Plantel</th>
                            <th>Segmento</th>
                            <th>Staff</th>
                            <th>Jugadores</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        {divisions.map((division) => (
                            <tr key={division.id}>
                                <td>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                        <div style={{ padding: '0.25rem', background: 'var(--surface-elevated)', borderRadius: '4px', border: '1px solid var(--border)' }}>
                                            <ShieldCheck className="w-4 h-4 text-muted" />
                                        </div>
                                        <strong>{(division.name || division.category || 'SIN NOMBRE').toUpperCase()}</strong>
                                    </div>
                                </td>
                                <td style={{ color: 'var(--text-muted)' }}>
                                    {formatDivisionMeta(division)}
                                </td>
                                <td style={{ color: 'var(--text-muted)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <Briefcase className="w-3 h-3" />
                                        <span>{division.staff_count || 0}</span>
                                    </div>
                                </td>
                                <td className="mono">
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <Users className="w-3 h-3 text-muted" />
                                        <span>{division.players_count || 0}</span>
                                    </div>
                                </td>
                                <td style={{ textAlign: 'right' }}>
                                    <ChevronRight className="w-4 h-4 text-muted inline-block cursor-pointer hover:text-white" />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </>
        );
    }

    if (fallbackCategories.length > 0) {
        return (
            <>
                <div className="card-header">
                    <div>
                        <div className="card-title">Planteles Registrados</div>
                        <div className="subinfo" style={{ marginTop: '0.25rem' }}>Mostrando categorias legacy hasta completar la migracion.</div>
                    </div>
                    <button className="btn">Gestionar</button>
                </div>
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Categoria</th>
                            <th>Staff</th>
                            <th>Jugadores</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        {fallbackCategories.map((squad) => (
                            <tr key={squad}>
                                <td>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                        <div style={{ padding: '0.25rem', background: 'var(--surface-elevated)', borderRadius: '4px', border: '1px solid var(--border)' }}>
                                            <ShieldCheck className="w-4 h-4 text-muted" />
                                        </div>
                                        <strong>{squad.toUpperCase()}</strong>
                                    </div>
                                </td>
                                <td style={{ color: 'var(--text-muted)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <Briefcase className="w-3 h-3" />
                                        <span>-</span>
                                    </div>
                                </td>
                                <td className="mono">
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <Users className="w-3 h-3 text-muted" />
                                        <span>-</span>
                                    </div>
                                </td>
                                <td style={{ textAlign: 'right' }}>
                                    <ChevronRight className="w-4 h-4 text-muted inline-block cursor-pointer hover:text-white" />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </>
        );
    }

    return (
        <>
            <div className="card-header">
                <div className="card-title">Planteles Registrados</div>
                <button className="btn">Gestionar</button>
            </div>
            <div className="py-16 flex flex-col items-center justify-center border-2 border-dashed border-white/5 rounded-2xl opacity-30">
                <UserPlus className="w-10 h-10 mb-4" />
                <p className="text-[11px] font-black uppercase tracking-[0.2em]">Sincronizar planteles registrados</p>
            </div>
        </>
    );
}
