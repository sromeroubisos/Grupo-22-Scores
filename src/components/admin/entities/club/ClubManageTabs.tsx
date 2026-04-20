'use client';

import Link from 'next/link';
import { Radio, Settings2, Shield, Sparkles, Trophy, Users, UserSquare2, Workflow } from 'lucide-react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { ROLE_LABELS } from '@/lib/auth/roles';
import type { ManagedClubSummary } from '@/lib/club-admin/managedClubFamily';

interface ClubManageTabsProps {
    currentTab: string;
    squadCount: number;
    managedClubs: ManagedClubSummary[];
    currentClubId: string;
    primarySportLabel?: string;
    familyClubCount: number;
}

export const CLUB_MANAGE_VISIBLE_TABS = [
    { id: 'general', label: 'General', Icon: Shield },
    { id: 'equipos', label: 'Equipos', Icon: Workflow },
    { id: 'planteles', label: 'Planteles', Icon: Users },
    { id: 'competencias', label: 'Competencias', Icon: Trophy },
    { id: 'partidos', label: 'Partidos', Icon: Radio, live: true },
    { id: 'contenido', label: 'Exports Sociales', Icon: Sparkles },
    { id: 'sponsors', label: 'Sponsors', Icon: UserSquare2 },
    { id: 'configuracion', label: 'Configuracion', Icon: Settings2 },
];

export const CLUB_MANAGE_VISIBLE_TAB_IDS = new Set(
    CLUB_MANAGE_VISIBLE_TABS.map((tab) => tab.id)
);

function initialsFromName(value?: string | null) {
    if (!value?.trim()) return 'AC';
    return value
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? '')
        .join('') || 'AC';
}

export function ClubManageTabs({
    currentTab,
    squadCount,
    managedClubs,
    currentClubId,
    primarySportLabel,
    familyClubCount,
}: ClubManageTabsProps) {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const { user } = useAuth();
    const currentClub = managedClubs.find((club) => club.id === currentClubId) ?? null;
    const activeRoleLabel = user?.role ? ROLE_LABELS[user.role] : (
        currentClub?.managementType === 'club_family' ? 'Familia de Club' : 'Administrador de Club'
    );
    const familyClubs = currentClub
        ? managedClubs.filter((club) => club.familyRootId === currentClub.familyRootId)
        : managedClubs;

    return (
        <div className="club-nav-panel">
            <div className="club-nav-brand">
                <div className="club-nav-brand-mark" />
                <div>
                    <strong>G22 CORE</strong>
                    <span>Sistema operativo de clubes</span>
                </div>
            </div>

            <section className="club-nav-family-shell">
                <span className="club-nav-label">Unidad operativa</span>
                <div className="club-nav-club-card">
                    <div className="club-nav-club-topline">
                        <span>{currentClub?.managementType === 'club_family' ? 'Familia de clubes' : 'Club gestionado'}</span>
                        <span>{primarySportLabel || 'Deporte'}</span>
                    </div>
                    <strong>{currentClub?.familyRootName || currentClub?.name || 'Club'}</strong>
                    <p>
                        {familyClubCount > 1
                            ? `${familyClubCount} clubes conectados en la misma familia operativa.`
                            : 'Operacion individual con identidad y estructura propia.'}
                    </p>
                </div>

                {familyClubs.length > 1 ? (
                    <div className="club-nav-club-list">
                        {familyClubs.map((club) => {
                            const params = new URLSearchParams(searchParams.toString());
                            params.set('club', club.id);
                            params.set('type', 'club');
                            if (!params.get('tab')) params.set('tab', currentTab);

                            return (
                                <Link
                                    key={club.id}
                                    href={`${pathname}?${params.toString()}`}
                                    className={`club-nav-club-link ${club.id === currentClubId ? 'active' : ''}`}
                                >
                                    <span className="club-nav-club-link-mark">
                                        {club.logoUrl ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img src={club.logoUrl} alt={club.name} />
                                        ) : (
                                            <span>{initialsFromName(club.name)}</span>
                                        )}
                                    </span>
                                    <span className="club-nav-club-link-copy">
                                        <strong>{club.shortName || club.name}</strong>
                                        <small>{club.id === currentClubId ? 'Activo ahora' : club.accessSource === 'family' ? 'Misma familia' : 'Acceso directo'}</small>
                                    </span>
                                </Link>
                            );
                        })}
                    </div>
                ) : null}
            </section>

            <nav className="club-side-nav">
                <span className="club-nav-label">Modulos</span>
                {CLUB_MANAGE_VISIBLE_TABS.map((tab) => {
                    const params = new URLSearchParams(searchParams.toString());
                    params.set('tab', tab.id);
                    params.set('type', 'club');
                    const isActive = currentTab === tab.id;

                    return (
                        <Link
                            key={tab.id}
                            href={`${pathname}?${params.toString()}`}
                            className={`club-side-link ${isActive ? 'active' : ''}`}
                        >
                            <span className="club-side-link-icon">
                                <tab.Icon className="w-4 h-4" />
                            </span>
                            <span className="club-side-link-copy">
                                <strong>{tab.label}</strong>
                                <small>
                                    {tab.id === 'general' ? 'Resumen operativo' : null}
                                    {tab.id === 'equipos' ? 'Club y familia' : null}
                                    {tab.id === 'planteles' ? 'Roster y staff' : null}
                                    {tab.id === 'competencias' ? 'Tablas y torneos' : null}
                                    {tab.id === 'partidos' ? 'Fixture y vivo' : null}
                                    {tab.id === 'contenido' ? 'Studio y redes' : null}
                                    {tab.id === 'sponsors' ? 'Marcas activas' : null}
                                    {tab.id === 'configuracion' ? 'Identidad y roles' : null}
                                </small>
                            </span>
                            {tab.live ? <span className="club-nav-badge live">Live</span> : null}
                            {tab.id === 'planteles' && squadCount > 0 ? (
                                <span className="club-nav-badge">{squadCount}</span>
                            ) : null}
                        </Link>
                    );
                })}
            </nav>

            <div className="club-nav-user">
                <span className="club-nav-label">Usuario activo</span>
                <div className="club-nav-user-card">
                    <div className="club-nav-user-avatar">{initialsFromName(user?.name || activeRoleLabel)}</div>
                    <div>
                        <strong>{user?.name || 'Admin Club'}</strong>
                        <span>{activeRoleLabel}</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
