'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, MoreHorizontal, X } from 'lucide-react';
import type { ManagedClubSummary } from '@/lib/club-admin/managedClubFamily';
import { buildClubManageHref, type ClubConsoleMode } from '@/lib/clubAdminRoutes';
import type { ClubManageTabId } from '@/lib/club-admin/manageTabs';
import { CLUB_MANAGE_VISIBLE_TABS } from './ClubManageTabs';

interface ClubMobileConsoleProps {
    currentTab: string;
    currentClubId: string;
    managedClubs: ManagedClubSummary[];
    primarySportLabel?: string;
    navigationMode: ClubConsoleMode;
    onTabChange?: (tabId: ClubManageTabId) => void;
}

const QUICK_TAB_IDS = new Set(['general', 'planteles', 'partidos']);

export function ClubMobileConsole({
    currentTab,
    currentClubId,
    managedClubs,
    primarySportLabel,
    navigationMode,
    onTabChange,
}: ClubMobileConsoleProps) {
    const router = useRouter();
    const [isSheetOpen, setIsSheetOpen] = useState(false);

    useEffect(() => {
        if (!isSheetOpen) return;

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        return () => {
            document.body.style.overflow = previousOverflow;
        };
    }, [isSheetOpen]);

    const currentClub = useMemo(
        () => managedClubs.find((club) => club.id === currentClubId) ?? null,
        [currentClubId, managedClubs],
    );

    const currentTabMeta = useMemo(
        () => CLUB_MANAGE_VISIBLE_TABS.find((tab) => tab.id === currentTab) ?? CLUB_MANAGE_VISIBLE_TABS[0],
        [currentTab],
    );

    const quickTabs = useMemo(
        () => CLUB_MANAGE_VISIBLE_TABS.filter((tab) => QUICK_TAB_IDS.has(tab.id)),
        [],
    );

    const hasQuickTabActive = quickTabs.some((tab) => tab.id === currentTab);

    const handleTabChange = (tabId: ClubManageTabId) => {
        setIsSheetOpen(false);

        if (onTabChange) {
            onTabChange(tabId);
            return;
        }

        router.push(buildClubManageHref(currentClubId, tabId, navigationMode));
    };

    const handleClubChange = (clubId: string) => {
        setIsSheetOpen(false);
        router.push(buildClubManageHref(clubId, currentTab, navigationMode));
    };

    return (
        <>
            <section className="club-mobile-console">
                <div className="club-mobile-console-head">
                    <span className="club-mobile-console-brand">G22 CORE</span>
                    <span className="club-mobile-console-caption">Sistema operativo de clubes</span>
                </div>

                <div className="club-mobile-console-club">
                    <p>Club activo</p>
                    <strong>{currentClub?.shortName || currentClub?.name || 'Club'}</strong>
                    <span>{primarySportLabel || 'Deporte'} / Club activo</span>
                </div>

                <button
                    type="button"
                    className="club-mobile-module-trigger"
                    onClick={() => setIsSheetOpen(true)}
                    aria-haspopup="dialog"
                    aria-expanded={isSheetOpen}
                >
                    <span>{currentTabMeta.label}</span>
                    <ChevronDown className="w-4 h-4" />
                </button>

                <div className="club-mobile-quick-tabs" aria-label="Atajos de navegacion del club">
                    {quickTabs.map((tab) => (
                        <button
                            key={tab.id}
                            type="button"
                            className={`club-mobile-quick-tab ${tab.id === currentTab ? 'active' : ''}`}
                            onClick={() => handleTabChange(tab.id as ClubManageTabId)}
                        >
                            {tab.label}
                        </button>
                    ))}
                    <button
                        type="button"
                        className={`club-mobile-quick-tab ${hasQuickTabActive ? '' : 'active'}`}
                        onClick={() => setIsSheetOpen(true)}
                    >
                        <MoreHorizontal className="w-4 h-4" />
                        Mas
                    </button>
                </div>
            </section>

            <button
                type="button"
                className={`club-mobile-sheet-backdrop ${isSheetOpen ? 'open' : ''}`}
                aria-hidden={!isSheetOpen}
                tabIndex={isSheetOpen ? 0 : -1}
                onClick={() => setIsSheetOpen(false)}
            />

            <div
                className={`club-mobile-sheet ${isSheetOpen ? 'open' : ''}`}
                role="dialog"
                aria-modal="true"
                aria-hidden={!isSheetOpen}
                aria-label="Cambiar modulo del club"
            >
                <div className="club-mobile-sheet-handle" />

                <div className="club-mobile-sheet-header">
                    <div>
                        <p className="club-mobile-sheet-eyebrow">Navegacion del club</p>
                        <strong>{currentClub?.name || 'Club activo'}</strong>
                    </div>
                    <button
                        type="button"
                        className="club-mobile-sheet-close"
                        onClick={() => setIsSheetOpen(false)}
                        aria-label="Cerrar"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="club-mobile-sheet-section">
                    <label className="club-selector-label" htmlFor="club-mobile-switcher">
                        Cambiar club
                    </label>
                    <div className="club-selector-pill-wrap">
                        <select
                            id="club-mobile-switcher"
                            className="club-selector-pill"
                            value={currentClubId}
                            onChange={(event) => handleClubChange(event.target.value)}
                        >
                            {managedClubs.map((club) => (
                                <option key={club.id} value={club.id}>
                                    {club.shortName || club.name}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="club-mobile-sheet-links">
                    {CLUB_MANAGE_VISIBLE_TABS.map((tab) => (
                        <button
                            key={tab.id}
                            type="button"
                            className={`club-mobile-sheet-link ${tab.id === currentTab ? 'active' : ''}`}
                            onClick={() => handleTabChange(tab.id as ClubManageTabId)}
                        >
                            <span className="club-mobile-sheet-link-icon">
                                <tab.Icon className="w-4 h-4" />
                            </span>
                            <span className="club-mobile-sheet-link-copy">
                                <strong>{tab.label}</strong>
                                <small>{tab.live ? 'Operacion en vivo' : 'Abrir modulo'}</small>
                            </span>
                        </button>
                    ))}
                </div>
            </div>
        </>
    );
}
