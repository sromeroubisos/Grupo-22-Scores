'use client';

import Link from 'next/link';
import { Radio, Settings2, Shield, Sparkles, Trophy, Users, UserSquare2, Workflow } from 'lucide-react';
import { usePathname, useSearchParams } from 'next/navigation';
import type { ManagedClubSummary } from '@/lib/club-admin/managedClubFamily';

interface ClubManageTabsProps {
    currentTab: string;
    squadCount: number;
    managedClubs: ManagedClubSummary[];
    currentClubId: string;
    primarySportLabel?: string;
}

export const CLUB_MANAGE_VISIBLE_TABS = [
    { id: 'general', label: 'General', Icon: Shield },
    { id: 'equipos', label: 'Identidad', Icon: Workflow },
    { id: 'planteles', label: 'Jugadores', Icon: Users },
    { id: 'competencias', label: 'Competencias', Icon: Trophy },
    { id: 'partidos', label: 'Partidos', Icon: Radio, live: true },
    { id: 'contenido', label: 'Exports Sociales', Icon: Sparkles },
    { id: 'sponsors', label: 'Sponsors', Icon: UserSquare2 },
    { id: 'configuracion', label: 'Configuracion', Icon: Settings2 },
];

export const CLUB_MANAGE_VISIBLE_TAB_IDS = new Set(
    CLUB_MANAGE_VISIBLE_TABS.map((tab) => tab.id)
);

export function ClubManageTabs({
    currentTab,
    managedClubs,
    currentClubId,
    primarySportLabel,
}: ClubManageTabsProps) {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const currentClub = managedClubs.find((club) => club.id === currentClubId) ?? null;

    return (
        <div className="club-nav-panel">
            <div className="club-nav-brand">
                <div className="club-nav-brand-mark" />
                <div>
                    <strong>G22 CORE</strong>
                    <span>Sistema operativo de clubes</span>
                </div>
            </div>

            <div className="club-nav-dropdown-shell">
                <span className="club-nav-label">Club activo</span>
                <div className="club-selector-block sidebar">
                    <div className="club-selector-meta">
                        <strong>{currentClub?.shortName || currentClub?.name || 'Club'}</strong>
                        <span>{primarySportLabel || 'Deporte'}</span>
                    </div>
                    <div className="club-selector-pill-wrap">
                        <select
                            className="club-selector-pill"
                            value={currentClubId}
                            onChange={(event) => {
                                const params = new URLSearchParams(searchParams.toString());
                                params.set('club', event.target.value);
                                params.set('type', 'club');
                                if (!params.get('tab')) params.set('tab', currentTab);
                                window.location.assign(`${pathname}?${params.toString()}`);
                            }}
                        >
                            {managedClubs.map((club) => (
                                <option key={club.id} value={club.id}>
                                    {club.shortName || club.name}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

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
                                    {tab.id === 'equipos' ? 'Identidad del equipo' : null}
                                    {tab.id === 'planteles' ? 'Jugadores y staff' : null}
                                    {tab.id === 'competencias' ? 'Tablas y torneos' : null}
                                    {tab.id === 'partidos' ? 'Fixture y vivo' : null}
                                    {tab.id === 'contenido' ? 'Studio y redes' : null}
                                    {tab.id === 'sponsors' ? 'Marcas activas' : null}
                                    {tab.id === 'configuracion' ? 'Identidad y roles' : null}
                                </small>
                            </span>
                            {tab.live ? <span className="club-nav-badge live">Live</span> : null}
                        </Link>
                    );
                })}
            </nav>
        </div>
    );
}
