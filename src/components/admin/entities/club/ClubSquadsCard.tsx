'use client';

import { Users, ChevronRight, UserPlus, ShieldCheck, UserCheck, Briefcase } from 'lucide-react';

interface ClubSquadsCardProps {
    categories: string[];
}

export function ClubSquadsCard({ categories }: ClubSquadsCardProps) {
    const defaultSquads = [
        "Primera División",
        "Intermedia",
        "Pre Intermedia",
        "M19",
        "M17"
    ];

    const squads = categories.length > 0 ? categories : defaultSquads;

    return (
        <>
            <div className="card-header">
                <div className="card-title">Planteles Registrados</div>
                <button className="btn">Gestionar</button>
            </div>
            {squads.length > 0 ? (
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Categoría</th>
                            <th>Staff</th>
                            <th>Jugadores</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        {squads.map((squad) => (
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
            ) : (
                <div className="py-16 flex flex-col items-center justify-center border-2 border-dashed border-white/5 rounded-2xl opacity-30">
                    <UserPlus className="w-10 h-10 mb-4" />
                    <p className="text-[11px] font-black uppercase tracking-[0.2em]">Sincronizar planteles registrados</p>
                </div>
            )}
        </>
    );
}
