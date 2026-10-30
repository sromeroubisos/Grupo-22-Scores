'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import type { ManagedClubSummary } from '@/lib/club-admin/managedClubFamily';
import { getSportDisplayName } from '@/lib/clubDerivatives';

import '@/components/admin/club-manager/club-manager.css';

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

/**
 * La puerta del panel de club cuando la cuenta maneja más de un club.
 *
 * Usa la misma hoja que el gestor (`club-manager.css`, pintada con los tokens
 * de globals.css). Antes cargaba `vitreous-club.css` —fondo negro fijo con
 * degradés azul y rosa, títulos de 5rem— y era la única pantalla del panel que
 * no se parecía al sitio: lo primero que veía un club al entrar.
 *
 * Las categorías de un club ("Catamarca R.C. M16") van agrupadas bajo su club
 * principal: son la misma institución, no clubes aparte.
 */
export function ClubAccessHub({ clubs }: ClubAccessHubProps) {
    const families = useMemo(() => {
        const grouped = new Map<string, ManagedClubSummary[]>();
        for (const club of clubs) {
            grouped.set(club.familyRootId, [...(grouped.get(club.familyRootId) ?? []), club]);
        }

        return Array.from(grouped.entries())
            .map(([familyRootId, members]) => {
                const root = members.find((club) => club.id === familyRootId) ?? null;
                const rest = members
                    .filter((club) => club.id !== root?.id)
                    .sort((left, right) => left.name.localeCompare(right.name, 'es'));
                return {
                    familyRootId,
                    name: root?.name || members[0]?.familyRootName || members[0]?.name || 'Club',
                    root,
                    members: root ? [root, ...rest] : rest,
                };
            })
            .sort((left, right) => left.name.localeCompare(right.name, 'es'));
    }, [clubs]);

    return (
        <div className="cm-root">
            <header className="cm-header">
                <div className="cm-titles">
                    <h1>Tus clubes</h1>
                    <p className="cm-hint" style={{ marginTop: 6 }}>
                        Elegí el club o la categoría que querés administrar.
                    </p>
                </div>
            </header>

            {families.map((family) => (
                <section key={family.familyRootId} className="cm-card">
                    <div className="cm-card-head">
                        <div>
                            <h2>{family.name}</h2>
                            <p>
                                {family.members.length === 1
                                    ? 'Un club'
                                    : `${family.members.length} entre club y categorías`}
                            </p>
                        </div>
                    </div>

                    <div className="cm-list">
                        {family.members.map((club) => (
                            <Link
                                key={club.id}
                                href={`/club-admin?club=${encodeURIComponent(club.id)}&tab=inicio&type=club`}
                                prefetch={false}
                                className="cm-row cm-row-link-card"
                            >
                                <span className="cm-avatar" aria-hidden="true">
                                    {club.logoUrl
                                        // eslint-disable-next-line @next/next/no-img-element
                                        ? <img src={club.logoUrl} alt="" loading="lazy" />
                                        : initialsFromName(club.name)}
                                </span>
                                <div className="cm-row-main">
                                    <div className="cm-row-title">{club.name}</div>
                                    <div className="cm-row-sub">
                                        {[
                                            club.id === family.root?.id ? 'Club principal' : 'Categoría',
                                            club.sport ? getSportDisplayName(club.sport) : null,
                                        ].filter(Boolean).join(' · ')}
                                    </div>
                                </div>
                                <ChevronRight size={16} aria-hidden="true" />
                            </Link>
                        ))}
                    </div>
                </section>
            ))}
        </div>
    );
}
