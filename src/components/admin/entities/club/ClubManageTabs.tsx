'use client';

import Link from 'next/link';
import { Activity, Dumbbell, Layout, Radio, Settings2, Shield, Sparkles, Trophy, Users } from 'lucide-react';
import { Select } from '@/components/admin/ui';
import type { ManagedClubSummary } from '@/lib/club-admin/managedClubFamily';
import type { ClubManageTabId } from '@/lib/club-admin/manageTabs';
import { buildClubManageHref, type ClubConsoleMode } from '@/lib/clubAdminRoutes';

interface ClubManageTabsProps {
    currentTab: string;
    squadCount: number;
    managedClubs: ManagedClubSummary[];
    currentClubId: string;
    primarySportLabel?: string;
    navigationMode?: ClubConsoleMode;
    onTabChange?: (tabId: ClubManageTabId) => void;
}

export const CLUB_MANAGE_VISIBLE_TABS = [
    { id: 'general', label: 'General', Icon: Shield },
    { id: 'planteles', label: 'Jugadores', Icon: Users },
    { id: 'entrenamientos', label: 'Entrenamiento', Icon: Dumbbell },
    { id: 'rendimiento', label: 'Rendimiento', Icon: Activity },
    { id: 'competencias', label: 'Competencias', Icon: Trophy },
    { id: 'partidos', label: 'Partidos', Icon: Radio, live: true },
    { id: 'contenido', label: 'Exports Sociales', Icon: Sparkles },
    { id: 'pizarra', label: 'Pizarra', Icon: Layout },
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
    navigationMode = 'admin',
    onTabChange,
}: ClubManageTabsProps) {
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
                    <Select
                        className="club-selector-pill"
                        value={currentClubId}
                        onChange={(event) => {
                            window.location.assign(buildClubManageHref(event.target.value, currentTab, navigationMode));
                        }}
                        options={managedClubs.map((club) => ({
                            value: club.id,
                            label: club.shortName || club.name,
                        }))}
                    />
                </div>
            </div>

            <nav className="club-side-nav">
                <span className="club-nav-label">Modulos</span>
                {CLUB_MANAGE_VISIBLE_TABS.map((tab) => {
                    const isActive = currentTab === tab.id;
                    const href = buildClubManageHref(currentClubId, tab.id, navigationMode);

                    return (
                        <Link
                            key={tab.id}
                            href={href}
                            prefetch={false}
                            className={`club-side-link ${isActive ? 'active' : ''}`}
                            aria-current={isActive ? 'page' : undefined}
                            onClick={(event) => {
                                if (!onTabChange) {
                                    return;
                                }

                                if (
                                    event.defaultPrevented
                                    || event.button !== 0
                                    || event.metaKey
                                    || event.ctrlKey
                                    || event.shiftKey
                                    || event.altKey
                                ) {
                                    return;
                                }

                                event.preventDefault();
                                onTabChange(tab.id as ClubManageTabId);
                            }}
                        >
                            <span className="club-side-link-icon">
                                <tab.Icon className="w-4 h-4" />
                            </span>
                            <span className="club-side-link-copy">
                                <strong>{tab.label}</strong>
                                <small>
                                    {tab.id === 'general' ? 'Resumen operativo' : null}
                                    {tab.id === 'planteles' ? 'Jugadores y staff' : null}
                                    {tab.id === 'rendimiento' ? 'Graficos, evolucion y comparativas' : null}
                                    {tab.id === 'competencias' ? 'Tablas y torneos' : null}
                                    {tab.id === 'partidos' ? 'Fixture y vivo' : null}
                                    {tab.id === 'contenido' ? 'Studio y redes' : null}
                                    {tab.id === 'pizarra' ? 'Táctica y jugadas' : null}
                                    {tab.id === 'entrenamientos' ? 'Gimnasio, campo y asistencia' : null}
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
