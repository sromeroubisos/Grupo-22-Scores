'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
    ChevronDown,
    FileText,
    Globe,
    Image,
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

type TournamentRow = Database['public']['Tables']['tournaments']['Row'];

export const TOURNAMENT_TABS = [
    { id: 'resumen', label: 'Resumen', icon: LayoutDashboard, description: 'Estado general y salud del torneo' },
    { id: 'detalles', label: 'Detalles', icon: FileText, description: 'Identidad, temporada y metadata' },
    { id: 'estructura', label: 'Estructura', icon: Layers, description: 'Fases, reglas y formato competitivo' },
    { id: 'participantes', label: 'Participantes', icon: Users, description: 'Altas, filtros y control de equipos' },
    { id: 'operacion', label: 'Operacion', icon: Zap, description: 'Fixture, posiciones y operacion diaria' },
    { id: 'formato', label: 'Formato', icon: Palette, description: 'Branding y experiencia visual' },
    { id: 'medios', label: 'Medios', icon: Image, description: 'Assets y contenido multimedia' },
    { id: 'publicacion', label: 'Publicacion', icon: Globe, description: 'Salida publica y visibilidad' },
    { id: 'related', label: 'Relacionados', icon: Link2, description: 'Cruces y torneos vinculados' },
    { id: 'audit', label: 'Auditoria', icon: Shield, description: 'Bitacora y trazabilidad operativa' },
];

interface TournamentTabsProps {
    id: string;
    currentTab: string;
    data: TournamentRow;
}

export function TournamentTabs({ id, currentTab }: TournamentTabsProps) {
    const router = useRouter();
    const [mobileSelectorOpen, setMobileSelectorOpen] = useState(false);
    const { shouldRender, isVisible } = useAnimatedDisclosure(mobileSelectorOpen, 180);
    const activeTab = TOURNAMENT_TABS.find((tab) => tab.id === currentTab) || TOURNAMENT_TABS[0];
    const activeTabIndex = TOURNAMENT_TABS.findIndex((tab) => tab.id === activeTab.id);

    const switchTab = (tabId: string) => {
        setMobileSelectorOpen(false);
        router.push(`/admin/entities/${id}/manage?type=tournament&tab=${tabId}`);
    };

    const ActiveIcon = activeTab.icon;

    return (
        <nav className="basalt-tabs">
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
                            <span className="basalt-tabs-trigger-title">{activeTab.label}</span>
                            <span className="basalt-tabs-trigger-caption">{activeTab.description}</span>
                        </span>
                    </span>
                    <ChevronDown size={16} className="basalt-tabs-trigger-icon" />
                </button>
            </div>

            <div className="basalt-tabs-inner">
                {TOURNAMENT_TABS.map((tab) => {
                    const Icon = tab.icon;
                    const isActive = currentTab === tab.id;
                    const index = TOURNAMENT_TABS.indexOf(tab);
                    return (
                        <button
                            key={tab.id}
                            className={`basalt-tab-item ${isActive ? 'active' : ''}`}
                            onClick={() => switchTab(tab.id)}
                            type="button"
                            aria-current={isActive ? 'page' : undefined}
                        >
                            <span className="basalt-tab-step">{String(index + 1).padStart(2, '0')}</span>
                            <span className="basalt-tab-glyph">
                                <Icon size={14} className="basalt-tab-icon" />
                            </span>
                            <span className="basalt-tab-copy">
                                <span className="basalt-tab-label">{tab.label}</span>
                                <small className="basalt-tab-description">{tab.description}</small>
                            </span>
                        </button>
                    );
                })}
            </div>

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
                                const isActive = currentTab === tab.id;

                                return (
                                    <button
                                        key={tab.id}
                                        type="button"
                                        className={`basalt-tabs-sheet-item ${isActive ? 'active' : ''}`}
                                        onClick={() => switchTab(tab.id)}
                                    >
                                        <span className="basalt-tabs-sheet-item-copy">
                                            <span className="basalt-tabs-sheet-item-glyph">
                                                <Icon size={16} />
                                            </span>
                                            <span className="basalt-tabs-sheet-item-text">
                                                <span>{tab.label}</span>
                                                <small>{tab.description}</small>
                                            </span>
                                        </span>
                                        {isActive && <span className="basalt-tabs-sheet-badge">Actual</span>}
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
