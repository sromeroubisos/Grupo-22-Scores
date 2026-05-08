'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
    ChevronDown,
    FileText,
    Layers,
    LayoutDashboard,
    Link2,
    Palette,
    Shield,
    Users,
    X,
    Zap,
} from 'lucide-react';
import { Database } from '@/lib/database.types';
import './basalt.css';
import { useAnimatedDisclosure } from './useAnimatedDisclosure';
import { useTournamentDirty } from './TournamentContext';

type TournamentRow = Database['public']['Tables']['tournaments']['Row'];

export const TOURNAMENT_TABS = [
    { id: 'resumen', label: 'Resumen', icon: LayoutDashboard, description: 'Estado general y salud del torneo' },
    { id: 'detalles', label: 'Detalles', icon: FileText, description: 'Identidad, temporada y datos base' },
    { id: 'formato', label: 'Formato', icon: Palette, description: 'Puntaje, eventos y reglas deportivas' },
    { id: 'estructura', label: 'Estructura', icon: Layers, description: 'Fases, reglas y formato competitivo' },
    { id: 'participantes', label: 'Participantes', icon: Users, description: 'Altas, filtros y control de equipos' },
    { id: 'operacion', label: 'Operacion', icon: Zap, description: 'Fixture, resultados y tabla operativa' },
    { id: 'related', label: 'Relacionados', icon: Link2, description: 'Cruces y torneos vinculados' },
    { id: 'audit', label: 'Auditoria', icon: Shield, description: 'Bitacora y trazabilidad operativa' },
];

const DISABLE_ADMIN_PREFETCH = process.env.NEXT_PUBLIC_DISABLE_ADMIN_PREFETCH !== 'false';

function isProtectedAdminHref(href: string) {
    return href.startsWith('/admin') || href.startsWith('/club-admin');
}

function shouldPrefetchHref(href: string) {
    if (DISABLE_ADMIN_PREFETCH && isProtectedAdminHref(href)) {
        return false;
    }

    return true;
}

interface TournamentTabsProps {
    id: string;
    currentTab: string;
    data: TournamentRow;
}

export function TournamentTabs({ id, currentTab }: TournamentTabsProps) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const { hasDirtySection, hasRecentlySavedSection } = useTournamentDirty();
    const [mobileSelectorOpen, setMobileSelectorOpen] = useState(false);
    const [optimisticTab, setOptimisticTab] = useState(currentTab);
    const prefetchedTabsRef = useRef<Set<string>>(new Set());
    const { shouldRender, isVisible } = useAnimatedDisclosure(mobileSelectorOpen, 180);
    const visualTabId = TOURNAMENT_TABS.some((tab) => tab.id === optimisticTab) ? optimisticTab : currentTab;
    const activeTab = TOURNAMENT_TABS.find((tab) => tab.id === visualTabId) || TOURNAMENT_TABS[0];
    const activeTabIndex = TOURNAMENT_TABS.findIndex((tab) => tab.id === activeTab.id);
    const isTabNavigationPending = isPending || activeTab.id !== currentTab;
    const activeTabHasDraft =
        (activeTab.id === 'detalles' && hasDirtySection('details')) ||
        (activeTab.id === 'formato' && hasDirtySection('format')) ||
        (activeTab.id === 'estructura' && hasDirtySection('structure'));
    const activeTabWasSaved =
        (activeTab.id === 'detalles' && hasRecentlySavedSection('details')) ||
        (activeTab.id === 'formato' && hasRecentlySavedSection('format')) ||
        (activeTab.id === 'estructura' && hasRecentlySavedSection('structure'));

    const tabHref = useCallback(
        (tabId: string) => `/admin/entities/${id}/manage?type=tournament&tab=${tabId}`,
        [id],
    );

    useEffect(() => {
        setOptimisticTab(currentTab);
    }, [currentTab]);

    const prefetchTab = useCallback((tabId: string) => {
        if (tabId === currentTab || prefetchedTabsRef.current.has(tabId)) return;
        const href = tabHref(tabId);
        prefetchedTabsRef.current.add(tabId);
        if (!shouldPrefetchHref(href)) return;

        router.prefetch(href);
    }, [currentTab, router, tabHref]);

    useEffect(() => {
        if (!mobileSelectorOpen) return;
        TOURNAMENT_TABS.forEach((tab) => prefetchTab(tab.id));
    }, [mobileSelectorOpen, prefetchTab]);

    useEffect(() => {
        if (!mobileSelectorOpen || typeof document === 'undefined') return;
        // Prevent the page from scrolling behind the bottom-sheet on iOS Safari,
        // which doesn't honour overflow:hidden on html alone. Restore both
        // properties on close so we don't leak state across navigations.
        const previousBodyOverflow = document.body.style.overflow;
        const previousHtmlOverflow = document.documentElement.style.overflow;
        document.body.style.overflow = 'hidden';
        document.documentElement.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = previousBodyOverflow;
            document.documentElement.style.overflow = previousHtmlOverflow;
        };
    }, [mobileSelectorOpen]);

    const switchTab = (tabId: string) => {
        if (tabId === visualTabId) return;
        setMobileSelectorOpen(false);
        setOptimisticTab(tabId);
        prefetchTab(tabId);
        startTransition(() => {
            router.push(tabHref(tabId), { scroll: false });
        });
    };

    const tabHasDraft = (tabId: string) => {
        if (tabId === 'detalles') return hasDirtySection('details');
        if (tabId === 'formato') return hasDirtySection('format');
        if (tabId === 'estructura') return hasDirtySection('structure');
        return false;
    };

    const tabWasRecentlySaved = (tabId: string) => {
        if (tabId === 'detalles') return hasRecentlySavedSection('details');
        if (tabId === 'formato') return hasRecentlySavedSection('format');
        if (tabId === 'estructura') return hasRecentlySavedSection('structure');
        return false;
    };

    const ActiveIcon = activeTab.icon;

    return (
        <nav className="basalt-tabs" aria-busy={isTabNavigationPending}>
            <div className="basalt-tabs-mobile">
                <div className="basalt-tabs-mobile-head">
                    <span className="basalt-tabs-mobile-label">Modulo activo</span>
                    <span className="basalt-tabs-mobile-meta">
                        {activeTabIndex + 1}/{TOURNAMENT_TABS.length}
                    </span>
                </div>
                <button
                    type="button"
                    className="basalt-tabs-trigger"
                    onClick={() => setMobileSelectorOpen(true)}
                    aria-haspopup="dialog"
                    aria-expanded={mobileSelectorOpen}
                >
                    <span className="basalt-tabs-trigger-copy">
                        <span className="basalt-tabs-trigger-glyph">
                            <ActiveIcon size={16} />
                        </span>
                        <span className="basalt-tabs-trigger-text">
                            <span className="basalt-tabs-trigger-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span>{activeTab.label}</span>
                                {activeTabHasDraft ? (
                                    <span
                                        aria-label="Cambios pendientes"
                                        title="Cambios pendientes"
                                        style={{
                                            width: 8,
                                            height: 8,
                                            borderRadius: '999px',
                                            background: 'var(--accent)',
                                            boxShadow: '0 0 8px rgba(0, 163, 101, 0.65)',
                                            flexShrink: 0,
                                        }}
                                    />
                                ) : activeTabWasSaved ? (
                                    <span
                                        aria-label="Guardado recientemente"
                                        title="Guardado recientemente"
                                        style={{
                                            width: 10,
                                            height: 10,
                                            borderRadius: '999px',
                                            background: '#34d399',
                                            boxShadow: '0 0 0 4px rgba(52, 211, 153, 0.2), 0 0 12px rgba(52, 211, 153, 0.75)',
                                            flexShrink: 0,
                                            transition: 'all 180ms ease',
                                        }}
                                    />
                                ) : null}
                            </span>
                            <span className="basalt-tabs-trigger-caption">{activeTab.description}</span>
                        </span>
                    </span>
                    <ChevronDown size={16} className="basalt-tabs-trigger-icon" />
                </button>
            </div>

            <div className="basalt-tabs-desktop-head">
                <span className="basalt-tabs-desktop-kicker">Navegacion</span>
                <strong className="basalt-tabs-desktop-title">Gestion del torneo</strong>
                <span className="basalt-tabs-desktop-meta">
                    {activeTabIndex + 1} de {TOURNAMENT_TABS.length} modulos
                </span>
            </div>

            <div className="basalt-tabs-inner">
                {TOURNAMENT_TABS.map((tab) => {
                    const Icon = tab.icon;
                    const isActive = activeTab.id === tab.id;
                    const index = TOURNAMENT_TABS.indexOf(tab);
                    const hasDraft = tabHasDraft(tab.id);
                    const wasSaved = tabWasRecentlySaved(tab.id);
                    return (
                        <button
                            key={tab.id}
                            className={`basalt-tab-item ${isActive ? 'active' : ''} ${isActive && isTabNavigationPending ? 'is-pending' : ''}`}
                            onClick={() => switchTab(tab.id)}
                            onFocus={() => prefetchTab(tab.id)}
                            onPointerEnter={() => prefetchTab(tab.id)}
                            type="button"
                            aria-current={currentTab === tab.id ? 'page' : undefined}
                        >
                            <span className="basalt-tab-step">{String(index + 1).padStart(2, '0')}</span>
                            <span className="basalt-tab-glyph">
                                <Icon size={14} className="basalt-tab-icon" />
                            </span>
                            <span className="basalt-tab-copy">
                                <span className="basalt-tab-label" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span>{tab.label}</span>
                                    {hasDraft ? (
                                        <span
                                            aria-label={`Cambios pendientes en ${tab.label}`}
                                            title={`Cambios pendientes en ${tab.label}`}
                                            style={{
                                                width: 8,
                                                height: 8,
                                                borderRadius: '999px',
                                                background: 'var(--accent)',
                                                boxShadow: '0 0 8px rgba(0, 163, 101, 0.65)',
                                                flexShrink: 0,
                                            }}
                                        />
                                    ) : wasSaved ? (
                                        <span
                                            aria-label={`Cambios guardados recientemente en ${tab.label}`}
                                            title={`Cambios guardados recientemente en ${tab.label}`}
                                            style={{
                                                width: 10,
                                                height: 10,
                                                borderRadius: '999px',
                                                background: '#34d399',
                                                boxShadow: '0 0 0 4px rgba(52, 211, 153, 0.2), 0 0 12px rgba(52, 211, 153, 0.75)',
                                                flexShrink: 0,
                                                transition: 'all 180ms ease',
                                            }}
                                        />
                                    ) : null}
                                </span>
                                <small className="basalt-tab-description">{tab.description}</small>
                            </span>
                        </button>
                    );
                })}
            </div>

            {isTabNavigationPending ? <span className="basalt-tabs-progress" aria-hidden="true" /> : null}

            {shouldRender && (
                <>
                    <button
                        type="button"
                        className={`basalt-sheet-backdrop ${isVisible ? 'is-open' : ''}`}
                        aria-label="Cerrar selector de modulos"
                        onClick={() => setMobileSelectorOpen(false)}
                    />
                    <div
                        className={`basalt-tabs-sheet ${isVisible ? 'is-open' : ''}`}
                        role="dialog"
                        aria-modal="true"
                        aria-label="Selector de modulos"
                    >
                        <div className="basalt-tabs-sheet-handle" />
                        <div className="basalt-tabs-sheet-header">
                            <div>
                                <span className="basalt-tabs-sheet-kicker">Administracion de torneo</span>
                                <strong className="basalt-tabs-sheet-title">Seleccionar modulo</strong>
                            </div>
                            <button
                                type="button"
                                className="basalt-tabs-sheet-close"
                                onClick={() => setMobileSelectorOpen(false)}
                                aria-label="Cerrar"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <div className="basalt-tabs-sheet-list">
                            {TOURNAMENT_TABS.map((tab) => {
                                const Icon = tab.icon;
                                const isActive = activeTab.id === tab.id;
                                const hasDraft = tabHasDraft(tab.id);
                                const wasSaved = tabWasRecentlySaved(tab.id);

                                return (
                                    <button
                                        key={tab.id}
                                        type="button"
                                        className={`basalt-tabs-sheet-item ${isActive ? 'active' : ''} ${isActive && isTabNavigationPending ? 'is-pending' : ''}`}
                                        onClick={() => switchTab(tab.id)}
                                        onFocus={() => prefetchTab(tab.id)}
                                        aria-current={currentTab === tab.id ? 'page' : undefined}
                                    >
                                        <span className="basalt-tabs-sheet-item-copy">
                                            <span className="basalt-tabs-sheet-item-glyph">
                                                <Icon size={16} />
                                            </span>
                                            <span className="basalt-tabs-sheet-item-text">
                                                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <span>{tab.label}</span>
                                                    {hasDraft ? (
                                                        <span
                                                            aria-hidden="true"
                                                            style={{
                                                                width: 8,
                                                                height: 8,
                                                                borderRadius: '999px',
                                                                background: 'var(--accent)',
                                                                boxShadow: '0 0 8px rgba(0, 163, 101, 0.65)',
                                                                flexShrink: 0,
                                                            }}
                                                        />
                                                    ) : wasSaved ? (
                                                        <span
                                                            aria-hidden="true"
                                                            style={{
                                                                width: 10,
                                                                height: 10,
                                                                borderRadius: '999px',
                                                                background: '#34d399',
                                                                boxShadow: '0 0 0 4px rgba(52, 211, 153, 0.2), 0 0 12px rgba(52, 211, 153, 0.75)',
                                                                flexShrink: 0,
                                                            }}
                                                        />
                                                    ) : null}
                                                </span>
                                                <small>{tab.description}</small>
                                            </span>
                                        </span>
                                        {(isActive || hasDraft || wasSaved) && (
                                            <span className="basalt-tabs-sheet-badge">
                                                {isActive ? 'Actual' : hasDraft ? 'Pendiente' : 'Guardado'}
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </>
            )}
        </nav>
    );
}
