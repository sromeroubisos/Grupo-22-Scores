'use client';

import { Database } from '@/lib/database.types';
import { useRouter } from 'next/navigation';
import { MapPin, Shield, ShieldCheck } from 'lucide-react';

type ClubRow = Database['public']['Tables']['clubs']['Row'];

interface ClubSummaryHeroProps {
    data: Partial<ClubRow>;
    unionName?: string;
    sportLabel?: string;
}

export function ClubSummaryHero({ data, unionName, sportLabel }: ClubSummaryHeroProps) {
    const router = useRouter();

    return (
        <div className="hero-identity">
            <div className="club-logo-placeholder" style={{ borderRadius: '12px' }}>
                {data.logo_url ? (
                    <img src={data.logo_url} alt="Logo" className="w-full h-full object-contain p-2" />
                ) : (
                    <Shield className="w-8 h-8 text-muted/20" style={{ color: 'var(--border)' }} />
                )}
            </div>
            <div className="hero-details" style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h2>{data.name || 'NUEVO CLUB'}</h2>
                    <button
                        onClick={() => router.push('?tab=identidad&type=club')}
                        className="btn"
                    >
                        Configurar Club
                    </button>
                </div>

                <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '0.5rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    <span style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}><ShieldCheck className="w-3 h-3" /> {sportLabel || 'Deporte'}</span>
                    <span>/</span>
                    <span style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}><MapPin className="w-3 h-3" /> {data.city || '...'}, {data.country || 'ARG'}</span>
                    <span>/</span>
                    <span style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}><Shield className="w-3 h-3" /> {unionName || 'S/V'}</span>
                    <span>/</span>
                    <div className="mono" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', color: data.is_visible ? 'var(--success)' : 'var(--text-muted)' }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: data.is_visible ? 'var(--success)' : 'var(--border)' }} />
                        {data.is_visible ? 'Publicado' : 'Draft'}
                    </div>
                </div>
            </div>
        </div>
    );
}
