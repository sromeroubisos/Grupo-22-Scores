'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { ArrowRight, Plus, Shield, Sparkles } from 'lucide-react';
import type { ManagedClubSummary } from '@/lib/club-admin/managedClubFamily';
import { buildClubCreateHref } from '@/lib/clubAdminRoutes';

import './vitreous-club.css';

interface ClubAccessHubProps {
    clubs: ManagedClubSummary[];
}

function initialsFromName(value?: string | null) {
    if (!value?.trim()) return 'GC';
    return value
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? '')
        .join('') || 'GC';
}

function formatSport(value?: string | null) {
    if (!value?.trim()) return 'Deporte';
    return value
        .trim()
        .replace(/[-_]+/g, ' ')
        .split(/\s+/)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join(' ');
}

export function ClubAccessHub({ clubs }: ClubAccessHubProps) {
    const sportGroups = useMemo(() => {
        const groups = new Map<string, ManagedClubSummary[]>();

        clubs.forEach((club) => {
            const sport = formatSport(club.sport);
            groups.set(sport, [...(groups.get(sport) ?? []), club]);
        });

        return Array.from(groups.entries())
            .map(([sport, items]) => ({
                sport,
                clubs: [...items].sort((left, right) => (left.shortName || left.name).localeCompare(right.shortName || right.name)),
            }))
            .sort((left, right) => left.sport.localeCompare(right.sport));
    }, [clubs]);

    const familyRoots = useMemo(() => {
        const grouped = new Map<string, ManagedClubSummary[]>();

        clubs.forEach((club) => {
            grouped.set(club.familyRootId, [...(grouped.get(club.familyRootId) ?? []), club]);
        });

        return Array.from(grouped.entries()).map(([familyRootId, familyClubs]) => {
            const rootClub = familyClubs.find((club) => club.id === familyRootId) ?? familyClubs[0];
            return {
                familyRootId,
                familyRootName: rootClub?.familyRootName || rootClub?.name || 'Familia',
                sport: rootClub?.sport || familyClubs[0]?.sport || null,
                clubs: familyClubs,
            };
        }).sort((left, right) => left.familyRootName.localeCompare(right.familyRootName));
    }, [clubs]);

    return (
        <div className="flash-ui-container club-access-page">
            <main className="club-access-shell">
                <header className="club-access-header">
                    <div className="club-access-header-copy">
                        <span className="club-access-kicker">G22 Club Admin</span>
                        <h1>Selecciona el club o equipo al que quieres entrar</h1>
                        <p>
                            La primera vista del administrador general es una planilla visual de todos los clubes/equipos creados.
                            Cada card es el punto de entrada al panel operativo de esa unidad.
                        </p>
                    </div>

                    <div className="club-access-summary">
                        <div>
                            <strong>{clubs.length}</strong>
                            <span>clubes disponibles</span>
                        </div>
                        <div>
                            <strong>{new Set(clubs.map((club) => club.familyRootId)).size}</strong>
                            <span>familias activas</span>
                        </div>
                    </div>
                </header>

                <section className="club-access-actions">
                    <div className="club-access-actions-head">
                        <div>
                            <span className="club-access-kicker">Familias activas</span>
                            <h2>Crear equipos dentro de la familia operativa</h2>
                            <p>El administrador de club da de alta nuevos equipos desde la familia correspondiente.</p>
                        </div>
                    </div>

                    <div className="club-access-family-grid">
                        {familyRoots.map((family) => (
                            <div key={family.familyRootId} className="club-access-family-card">
                                <div className="club-access-family-content">
                                    <span className="club-access-family-kicker">Familia operativa</span>
                                    <div className="club-access-family-copy">
                                        <strong>{family.familyRootName}</strong>
                                        <p>{family.clubs.length} clubes vinculados - {formatSport(family.sport)}</p>
                                    </div>
                                </div>
                                <Link
                                    href={buildClubCreateHref('club-admin', {
                                        derivedFrom: family.familyRootId,
                                        derivativeType: 'divisions',
                                        derivedSport: family.sport || '',
                                    })}
                                    prefetch={false}
                                    className="club-access-create-btn"
                                >
                                    <Plus className="w-4 h-4" />
                                    Crear equipo
                                </Link>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="club-access-sports">
                    {sportGroups.map((group) => (
                        <div key={group.sport} className="club-access-sport-section">
                            <div className="club-access-sport-header">
                                <div>
                                    <span className="club-access-kicker">Deporte</span>
                                    <h2>{group.sport}</h2>
                                    <p>{group.clubs.length} equipos o clubes listos para entrar.</p>
                                </div>
                            </div>

                            <div className="club-access-grid">
                                {group.clubs.map((club, index) => (
                                    <Link
                                        key={club.id}
                                        href={`/club-admin?club=${encodeURIComponent(club.id)}&tab=general&type=club`}
                                        prefetch={false}
                                        className="club-access-card"
                                        style={{ animationDelay: `${0.08 + (index * 0.04)}s` }}
                                    >
                                        <span className="club-access-card-glaze" />

                                        <div className="club-access-card-top">
                                            <div className="club-access-card-brand">
                                                <div className="club-access-card-logo">
                                                    {club.logoUrl ? (
                                                        // eslint-disable-next-line @next/next/no-img-element
                                                        <img src={club.logoUrl} alt={club.name} />
                                                    ) : (
                                                        <span>{initialsFromName(club.name)}</span>
                                                    )}
                                                </div>

                                                <div className="club-access-card-copy">
                                                    <span className="club-access-card-kicker">{formatSport(club.sport)}</span>
                                                    <h2>{club.shortName || club.name}</h2>
                                                    <p>{club.name}</p>
                                                </div>
                                            </div>

                                            <ArrowRight className="w-4 h-4 club-access-card-arrow" />
                                        </div>

                                        <div className="club-access-card-meta">
                                            <span className="club-access-card-pill">
                                                <Shield className="w-3.5 h-3.5" />
                                                {club.managementType === 'club_family' ? 'Familia de club' : 'Club'}
                                            </span>
                                            <span className="club-access-card-pill neutral">
                                                <Sparkles className="w-3.5 h-3.5" />
                                                {club.familyRootName || 'Sin familia declarada'}
                                            </span>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        </div>
                    ))}
                </section>
            </main>
        </div>
    );
}
