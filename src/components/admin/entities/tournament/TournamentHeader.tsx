'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArchiveRestore, CalendarPlus, ChevronDown, MoreHorizontal, X } from 'lucide-react';
import { Database } from '@/lib/database.types';
import { getTournamentFormatLabel } from '@/lib/utils/tournamentFormat';
import './basalt.css';
import { useAnimatedDisclosure } from './useAnimatedDisclosure';

type TournamentRow = Database['public']['Tables']['tournaments']['Row'];
type TournamentDisplayRow = TournamentRow & { sport?: string | null };
type TournamentSeasonMenuItem = {
    id: string;
    label: string;
    subtitle: string;
    href: string;
    isCurrent: boolean;
};

export interface TournamentHeaderProps {
    data: TournamentRow;
    isDirty: boolean;
    dirtyLabels?: string[];
    isTransitioning: boolean;
    menuOpen: boolean;
    seasonMenuOpen: boolean;
    seasonItems: TournamentSeasonMenuItem[];
    onSave: () => void;
    onStatusTransition: () => void;
    onRecalculate: () => void;
    onDuplicate: () => void;
    onExport: () => void;
    onDelete: () => void;
    onMenuToggle: () => void;
    onMenuClose: () => void;
    onSeasonMenuToggle: () => void;
    onSeasonMenuClose: () => void;
    onOpenSeasonCreation: () => void;
    onOpenHistoricalSeasonImport: () => void;
    onSeasonNavigate: (href: string) => void;
}

export function computeHealth(data: TournamentRow): 'OK' | 'WARNING' | 'ERROR' {
    const tournament = data as TournamentDisplayRow;
    if (!tournament.name) return 'ERROR';
    if (!tournament.slug || !tournament.sport || !tournament.union_id) return 'WARNING';
    return 'OK';
}

export function TournamentHeader({
    data, isDirty, dirtyLabels = [], isTransitioning, menuOpen, seasonMenuOpen, seasonItems,
    onSave, onStatusTransition, onRecalculate, onDuplicate, onExport, onDelete,
    onMenuToggle, onMenuClose, onSeasonMenuToggle, onSeasonMenuClose, onOpenSeasonCreation, onOpenHistoricalSeasonImport, onSeasonNavigate,
}: TournamentHeaderProps) {
    const tournament = data as TournamentDisplayRow;
    const status = (data.status ?? 'draft').toUpperCase();
    const health = computeHealth(data);
    const isVisible = data.is_visible;
    const sportLabel = tournament.sport || 'Disciplina pendiente';
    const categoryLabel = tournament.category || 'Categoria no definida';
    const formatLabel = tournament.format ? getTournamentFormatLabel(tournament.format) : 'Formato en configuracion';
    const { shouldRender, isVisible: menuVisible } = useAnimatedDisclosure(menuOpen, 180);
    const { shouldRender: shouldRenderSeasonMenu, isVisible: seasonMenuVisible } = useAnimatedDisclosure(seasonMenuOpen, 180);

    // Floating menus (3-dot + season) live inside `.basalt-header`, which
    // has `backdrop-filter: blur(...)` on desktop. That property creates a
    // containing block, so the menu's `position: fixed` ends up resolving
    // against the header rather than the viewport — on mobile the panel
    // gets pinned right under the header instead of the bottom of the
    // screen. Portaling to <body> sidesteps the issue entirely.
    const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
    useEffect(() => {
        setPortalTarget(document.body);
    }, []);

    const menuActions = [
        {
            // Mobile-only: surfaces the lifecycle change action that lives as a
            // prominent button on desktop. On phones we collapse the primary
            // action strip so this needs to be reachable from the overflow menu.
            id: 'status-transition',
            label: isTransitioning ? 'Procesando...' : 'Cambiar estado',
            onClick: onStatusTransition,
            hiddenDesktop: true,
        },
        {
            // Mobile-only: same rationale as the lifecycle action above. The
            // Season chip menu already exposes "Nueva temporada", but adding it
            // here keeps both paths discoverable from the same overflow menu.
            id: 'new-season',
            label: 'Nueva temporada',
            onClick: onOpenSeasonCreation,
            hiddenDesktop: true,
        },
        {
            id: 'recalculate',
            label: 'Recalcular',
            onClick: onRecalculate,
            hiddenDesktop: true,
        },
        data.slug ? {
            id: 'public',
            label: 'Vista publica',
            href: `/torneos/${data.slug}`,
            hiddenDesktop: true,
        } : null,
        {
            id: 'duplicate',
            label: 'Duplicar torneo',
            onClick: onDuplicate,
        },
        {
            id: 'export',
            label: 'Exportar datos',
            onClick: onExport,
        },
        {
            id: 'delete',
            label: 'Borrar torneo',
            onClick: onDelete,
            danger: true,
        },
    ].filter(Boolean) as Array<{
        id: string;
        label: string;
        onClick?: () => void;
        href?: string;
        hiddenDesktop?: boolean;
        danger?: boolean;
    }>;

    return (
        <header className="basalt-header">
            <div className="basalt-header-main">
                <div className="basalt-header-eyebrow">
                    <span className="basalt-header-kicker">Tournament Console</span>
                    <span className="basalt-header-slug">{data.slug || 'draft-routing'}</span>
                </div>

                {isDirty && (
                    <div className="basalt-unsaved">
                        <div className="basalt-dot-pulse" />
                        {dirtyLabels.length > 0
                            ? `Cambios sin guardar en ${dirtyLabels.join(', ')}`
                            : 'Cambios sin guardar'}
                    </div>
                )}

                <div className="basalt-header-title-row">
                    <h1 className="basalt-h1">{data.name || 'TORNEO SIN NOMBRE'}</h1>
                </div>

                <div className="basalt-header-meta">
                    <span>{sportLabel}</span>
                    <span>{categoryLabel}</span>
                    <span>{formatLabel}</span>
                </div>
            </div>

            <div className="basalt-header-actions">
                <div className="basalt-header-metrics">
                    <div className="basalt-metric-group">
                        <span className={`basalt-badge badge-${status.toLowerCase()}`}>
                            <span className="basalt-badge-prefix">Lifecycle</span>
                            <span className="basalt-badge-dot" />
                            <span>{status}</span>
                        </span>
                        <span className={`basalt-badge ${isVisible ? 'badge-visible' : 'badge-hidden'}`}>
                            <span className="basalt-badge-prefix">Visibility</span>
                            <span className="basalt-badge-dot" />
                            <span>{isVisible ? 'PUBLIC' : 'HIDDEN'}</span>
                        </span>
                        <span className={`basalt-badge badge-${health.toLowerCase()}`}>
                            <span className="basalt-badge-prefix">Health</span>
                            <span className="basalt-badge-dot" />
                            <span>{health}</span>
                        </span>
                    </div>

                    <div className="basalt-header-divider" aria-hidden="true" />

                    <div className="basalt-header-season-shell">
                        <button
                            type="button"
                            className={`basalt-header-season basalt-header-season-trigger ${seasonMenuOpen ? 'is-open' : ''}`}
                            onClick={onSeasonMenuToggle}
                            aria-haspopup="menu"
                            aria-expanded={seasonMenuOpen}
                            aria-label="Abrir acciones de temporada"
                        >
                            <span>SEASON {data.season_id || '--'}</span>
                            <ChevronDown size={14} />
                        </button>

                        {shouldRenderSeasonMenu && portalTarget ? createPortal(
                            <>
                                <div
                                    className={`basalt-floating-backdrop ${seasonMenuVisible ? 'is-open' : ''}`}
                                    onClick={onSeasonMenuClose}
                                />
                                <div
                                    className={`basalt-overflow-menu basalt-season-menu ${seasonMenuVisible ? 'is-open' : ''}`}
                                    role="menu"
                                    aria-label="Acciones de temporada"
                                >
                                    <div className="basalt-overflow-menu-header">
                                        <span className="basalt-overflow-menu-kicker">Temporadas</span>
                                        <strong className="basalt-overflow-menu-title">Edicion {data.season_id || '--'}</strong>
                                    </div>

                                    <div className="basalt-overflow-menu-list">
                                        {seasonItems.length > 0 ? (
                                            <>
                                                <span className="basalt-season-menu-section-label">Temporadas disponibles</span>
                                                {seasonItems.map((item) => (
                                                    <a
                                                        key={item.id}
                                                        href={item.href}
                                                        className={`basalt-overflow-item basalt-season-nav-item ${item.isCurrent ? 'is-current' : ''}`}
                                                        role="menuitem"
                                                        onClick={(event) => {
                                                            event.preventDefault();
                                                            onSeasonMenuClose();
                                                            if (!item.isCurrent) {
                                                                onSeasonNavigate(item.href);
                                                            }
                                                        }}
                                                    >
                                                        <span className="basalt-season-nav-copy">
                                                            <strong>{item.label}</strong>
                                                            {item.isCurrent ? <span className="basalt-season-nav-badge">Actual</span> : null}
                                                        </span>
                                                        <small>{item.subtitle}</small>
                                                    </a>
                                                ))}
                                            </>
                                        ) : (
                                            <div className="basalt-season-menu-empty">
                                                No hay otras temporadas vinculadas todavia.
                                            </div>
                                        )}

                                        <span className="basalt-season-menu-section-label">Acciones</span>
                                        <button
                                            type="button"
                                            className="basalt-overflow-item"
                                            role="menuitem"
                                            onClick={() => {
                                                onSeasonMenuClose();
                                                onOpenSeasonCreation();
                                            }}
                                        >
                                            <span className="basalt-season-menu-copy">
                                                <CalendarPlus size={16} />
                                                <span>Nueva temporada</span>
                                            </span>
                                            <small>Rapida, copia, manual o historica dentro del mismo torneo.</small>
                                        </button>
                                        <button
                                            type="button"
                                            className="basalt-overflow-item"
                                            role="menuitem"
                                            onClick={() => {
                                                onSeasonMenuClose();
                                                onOpenHistoricalSeasonImport();
                                            }}
                                        >
                                            <span className="basalt-season-menu-copy">
                                                <ArchiveRestore size={16} />
                                                <span>Importar torneo historico legado</span>
                                            </span>
                                            <small>Crea otro torneo vinculado. Usar solo por compatibilidad.</small>
                                        </button>
                                    </div>
                                </div>
                            </>,
                            portalTarget,
                        ) : null}
                    </div>
                </div>

                <div className="basalt-header-action-strip basalt-header-secondary">
                    <button className="basalt-btn" onClick={onRecalculate} disabled={isTransitioning} type="button">
                        Recalcular
                    </button>
                    {data.slug && (
                        <a
                            href={`/torneos/${data.slug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="basalt-btn"
                            style={{ textDecoration: 'none' }}
                        >
                            Vista publica
                        </a>
                    )}
                </div>

                <div className="basalt-header-action-strip basalt-header-primary">
                    {isDirty ? (
                        <button className="basalt-btn basalt-btn-primary" onClick={onSave} disabled={isTransitioning} type="button">
                            Guardar
                        </button>
                    ) : (
                        <div className="basalt-header-action-placeholder" aria-hidden="true" />
                    )}

                    <button className="basalt-btn basalt-btn-primary" onClick={onOpenSeasonCreation} disabled={isTransitioning} type="button">
                        <CalendarPlus size={15} />
                        Nueva temporada
                    </button>

                    <button className="basalt-btn basalt-btn-primary" onClick={onStatusTransition} disabled={isTransitioning} type="button">
                        {isTransitioning ? 'Procesando...' : 'Cambiar estado'}
                    </button>

                    <div className="basalt-header-menu">
                        <button
                            className="basalt-btn basalt-btn-ghost basalt-overflow-trigger"
                            onClick={onMenuToggle}
                            aria-label="Abrir mas acciones"
                            aria-expanded={menuOpen}
                            aria-haspopup="menu"
                            type="button"
                        >
                            <MoreHorizontal size={18} />
                        </button>

                        {shouldRender && portalTarget && createPortal(
                            <>
                                <div
                                    className={`basalt-floating-backdrop ${menuVisible ? 'is-open' : ''}`}
                                    onClick={onMenuClose}
                                />
                                <div
                                    className={`basalt-overflow-menu ${menuVisible ? 'is-open' : ''}`}
                                    role="menu"
                                    aria-label="Mas acciones del torneo"
                                >
                                    <div className="basalt-overflow-menu-header basalt-overflow-menu-header--with-close">
                                        <div className="basalt-overflow-menu-header-copy">
                                            <span className="basalt-overflow-menu-kicker">Acciones rapidas</span>
                                            <strong className="basalt-overflow-menu-title">Panel de torneo</strong>
                                        </div>
                                        <button
                                            type="button"
                                            className="basalt-overflow-menu-close"
                                            onClick={onMenuClose}
                                            aria-label="Cerrar menu"
                                        >
                                            <X size={16} />
                                        </button>
                                    </div>

                                    <div className="basalt-overflow-menu-list">
                                        {menuActions.map((action) => {
                                            const className = [
                                                'basalt-overflow-item',
                                                action.hiddenDesktop ? 'basalt-overflow-mobile-only' : '',
                                                action.danger ? 'danger' : '',
                                            ].filter(Boolean).join(' ');

                                            if (action.href) {
                                                return (
                                                    <a
                                                        key={action.id}
                                                        href={action.href}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className={className}
                                                        role="menuitem"
                                                        onClick={onMenuClose}
                                                    >
                                                        <span>{action.label}</span>
                                                        <small>Abrir en nueva pestana</small>
                                                    </a>
                                                );
                                            }

                                            return (
                                                <button
                                                    key={action.id}
                                                    className={className}
                                                    role="menuitem"
                                                    onClick={() => {
                                                        action.onClick?.();
                                                        onMenuClose();
                                                    }}
                                                    disabled={isTransitioning}
                                                    type="button"
                                                >
                                                    <span>{action.label}</span>
                                                    <small>
                                                        {action.danger ? 'Accion irreversible' : 'Disponible ahora'}
                                                    </small>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            </>,
                            portalTarget,
                        )}
                    </div>
                </div>
            </div>
        </header>
    );
}
