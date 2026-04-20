'use client';

import { useRouter } from 'next/navigation';
import { ArrowRight, MapPin, Shield, ShieldCheck, Sparkles } from 'lucide-react';
import type { Database } from '@/lib/database.types';

type ClubRow = Database['public']['Tables']['clubs']['Row'];

interface ClubSummaryHeroProps {
    data: Partial<ClubRow>;
    unionName?: string;
    sportLabel?: string;
    metrics: {
        teams: number;
        upcomingMatches: number;
        competitions: number;
        standings: number;
    };
}

export function ClubSummaryHero({ data, unionName, sportLabel, metrics }: ClubSummaryHeroProps) {
    const router = useRouter();

    return (
        <section className="club-command-hero">
            <div className="club-command-copy">
                <div className="club-command-kicker">
                    <span className="club-ui-pill">Club OS</span>
                    <span className="club-command-year">{new Date().getFullYear()}</span>
                </div>

                <div className="club-command-brandline">
                    <div className="club-command-logo">
                        {data.logo_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={data.logo_url} alt={data.name || 'Club'} className="w-full h-full object-contain p-3" />
                        ) : (
                            <Shield className="w-8 h-8" />
                        )}
                    </div>
                    <div>
                        <div className="club-command-short">{data.short_name || 'CLUB'}</div>
                        <h2>{data.name || 'Nuevo club'}</h2>
                    </div>
                </div>

                <p className="club-command-description">
                    Organiza identidad, equipos, planteles, competencias, partidos, contenido y sponsors
                    desde una misma consola operativa.
                </p>

                <div className="club-command-meta">
                    <span><ShieldCheck className="w-3.5 h-3.5" /> {sportLabel || 'Deporte'}</span>
                    <span><MapPin className="w-3.5 h-3.5" /> {data.city || 'Ciudad'}, {data.country || 'Pais'}</span>
                    <span><Shield className="w-3.5 h-3.5" /> {unionName || 'Sin union'}</span>
                </div>

                <div className="club-command-actions">
                    <button
                        type="button"
                        className="btn btn-primary club-ops-primary"
                        onClick={() => router.push('?tab=configuracion&type=club')}
                    >
                        Configurar identidad
                    </button>
                    <button
                        type="button"
                        className="btn club-ops-secondary"
                        onClick={() => router.push('?tab=contenido&type=club')}
                    >
                        <Sparkles className="w-4 h-4" />
                        Abrir studio
                    </button>
                </div>
            </div>

            <div className="club-command-stats">
                <div className="club-command-panel">
                    <span>Equipos</span>
                    <strong>{metrics.teams}</strong>
                </div>
                <div className="club-command-panel">
                    <span>Partidos proximos</span>
                    <strong>{metrics.upcomingMatches}</strong>
                </div>
                <div className="club-command-panel">
                    <span>Competencias</span>
                    <strong>{metrics.competitions}</strong>
                </div>
                <div className="club-command-panel highlight">
                    <span>Salud competitiva</span>
                    <strong>{metrics.standings}</strong>
                    <small>filas de posicion activas</small>
                </div>
                <button
                    type="button"
                    className="club-command-link"
                    onClick={() => router.push('?tab=partidos&type=club')}
                >
                    Ir a operacion de partidos
                    <ArrowRight className="w-4 h-4" />
                </button>
            </div>
        </section>
    );
}
