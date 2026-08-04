'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArchiveRestore, CalendarPlus, ChevronDown, MoreHorizontal, X } from 'lucide-react';
import { Database } from '@/lib/database.types';
import { getTournamentFormatLabel } from '@/lib/utils/tournamentFormat';
import './basalt.css';
import { useAnchoredMenu } from './useAnchoredMenu';
import { useAnimatedDisclosure } from './useAnimatedDisclosure';
import { useDialog } from './useDialog';

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
    /**
     * Si la barra puede persistir lo que está sucio. No es lo mismo que
     * `isDirty`: Estructura marca cambios sin guardar —y el aviso tiene que
     * seguir apareciendo— pero se guarda con sus propios botones, dentro de la
     * pestaña. Cuando lo único sucio es Estructura, "Guardar" acá no guardaba
     * nada: devolvía un error pidiendo que se use el otro botón. Un botón que
     * promete guardar y no guarda es peor que no tener botón.
     */
    canSave?: boolean;
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

// El resto de la consola habla español; las etiquetas de estado eran las únicas
// en inglés (LIFECYCLE / VISIBILITY / HEALTH + DRAFT / PUBLIC / OK). Las claves
// siguen siendo el valor crudo porque de ahí sale la clase `badge-*`.
const STATUS_LABELS: Record<string, string> = {
    draft: 'Borrador',
    published: 'Publicado',
    active: 'Activo',
    archived: 'Archivado',
};

const HEALTH_LABELS: Record<'OK' | 'WARNING' | 'ERROR', string> = {
    OK: 'Completos',
    WARNING: 'Revisar',
    ERROR: 'Incompletos',
};

export function TournamentHeader({
    data, isDirty, canSave = true, dirtyLabels = [], isTransitioning, menuOpen, seasonMenuOpen, seasonItems,
    onSave, onStatusTransition, onRecalculate, onDuplicate, onExport, onDelete,
    onMenuToggle, onMenuClose, onSeasonMenuToggle, onSeasonMenuClose, onOpenSeasonCreation, onOpenHistoricalSeasonImport, onSeasonNavigate,
}: TournamentHeaderProps) {
    const tournament = data as TournamentDisplayRow;
    const statusKey = (data.status ?? 'draft').toLowerCase();
    const status = statusKey.toUpperCase();
    const statusLabel = STATUS_LABELS[statusKey] || status;
    const health = computeHealth(data);
    const isVisible = data.is_visible;
    const tournamentName = data.name || 'Torneo sin nombre';
    const sportLabel = tournament.sport || 'Disciplina pendiente';
    const categoryLabel = tournament.category || 'Categoría no definida';
    const formatLabel = tournament.format ? getTournamentFormatLabel(tournament.format) : 'Formato en configuración';
    const { shouldRender, isVisible: menuVisible } = useAnimatedDisclosure(menuOpen, 180);
    const { shouldRender: shouldRenderSeasonMenu, isVisible: seasonMenuVisible } = useAnimatedDisclosure(seasonMenuOpen, 180);

    // Both menus already declared role="menu"/"menuitem" without the arrow-key
    // model that role implies, and neither closed on Escape or returned focus to
    // its trigger. No page scroll lock: these are popovers, not modals.
    const { ref: overflowMenuRef, dialogProps: overflowMenuProps } = useDialog<HTMLDivElement>({
        open: menuOpen,
        onClose: onMenuClose,
        role: 'menu',
        label: 'Mas acciones del torneo',
        lockPageScroll: false,
    });
    const { ref: seasonMenuRef, dialogProps: seasonMenuProps } = useDialog<HTMLDivElement>({
        open: seasonMenuOpen,
        onClose: onSeasonMenuClose,
        role: 'menu',
        label: 'Acciones de temporada',
        lockPageScroll: false,
    });

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

    // Al portalear a <body>, el `top: calc(100% + 8px)` de estos menus dejo de
    // medirse contra su disparador: se abrian al final del documento. Ahora se
    // anclan con coordenadas de viewport calculadas del rect real del boton.
    const seasonTriggerRef = useRef<HTMLButtonElement>(null);
    const overflowTriggerRef = useRef<HTMLButtonElement>(null);
    const seasonAnchor = useAnchoredMenu(seasonMenuOpen, seasonTriggerRef, 340);
    const overflowAnchor = useAnchoredMenu(menuOpen, overflowTriggerRef, 280);

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
            label: 'Vista pública',
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
                    <span className="basalt-header-slug">{data.slug || 'draft-routing'}</span>
                </div>

                <div className="basalt-header-title-row">
                    {/* title: el nombre completo queda en el atributo porque la linea
                        se trunca con ellipsis cuando el torneo tiene nombre largo. */}
                    <h1 className="basalt-h1" title={tournamentName}>{tournamentName}</h1>

                    <div className="basalt-header-season-shell">
                        <button
                            ref={seasonTriggerRef}
                            type="button"
                            className={`basalt-header-season basalt-header-season-trigger ${seasonMenuOpen ? 'is-open' : ''}`}
                            onClick={onSeasonMenuToggle}
                            aria-haspopup="menu"
                            aria-expanded={seasonMenuOpen}
                            aria-label={`Temporada ${data.season_id || 'sin definir'}. Abrir acciones de temporada`}
                        >
                            <span>Temporada {data.season_id || '--'}</span>
                            <ChevronDown size={14} />
                        </button>

                        {shouldRenderSeasonMenu && portalTarget ? createPortal(
                            <>
                                <div
                                    className={`basalt-floating-backdrop ${seasonMenuVisible ? 'is-open' : ''}`}
                                    onClick={onSeasonMenuClose}
                                    aria-hidden="true"
                                />
                                <div
                                    ref={seasonMenuRef}
                                    className={`basalt-overflow-menu basalt-season-menu ${seasonMenuVisible ? 'is-open' : ''}`}
                                    style={seasonAnchor
                                        ? { top: seasonAnchor.top, left: seasonAnchor.left, width: seasonAnchor.width }
                                        : undefined}
                                    {...seasonMenuProps}
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

                <div className="basalt-header-meta">
                    <span>{sportLabel}</span>
                    <span>{categoryLabel}</span>
                    <span>{formatLabel}</span>
                </div>
            </div>

            <div className="basalt-header-actions">
                <div className="basalt-header-metrics">
                    {isDirty && (
                        <div className="basalt-unsaved">
                            <div className="basalt-dot-pulse" />
                            {/* Sin boton "Guardar" al lado, el aviso tiene que decir
                                donde se guarda; si no, avisa de un problema y no da
                                la salida. */}
                            {!canSave
                                ? 'Sin guardar en Estructura: usá el botón de su panel'
                                : dirtyLabels.length > 0
                                    ? `Sin guardar: ${dirtyLabels.join(', ')}`
                                    : 'Cambios sin guardar'}
                        </div>
                    )}

                    <div className="basalt-metric-group">
                        <span className={`basalt-badge badge-${statusKey}`}>
                            <span className="basalt-badge-prefix">Estado</span>
                            <span className="basalt-badge-dot" />
                            <span>{statusLabel}</span>
                        </span>
                        <span className={`basalt-badge ${isVisible ? 'badge-visible' : 'badge-hidden'}`}>
                            <span className="basalt-badge-prefix">Visibilidad</span>
                            <span className="basalt-badge-dot" />
                            <span>{isVisible ? 'Público' : 'Oculto'}</span>
                        </span>
                        <span className={`basalt-badge badge-${health.toLowerCase()}`}>
                            <span className="basalt-badge-prefix">Datos</span>
                            <span className="basalt-badge-dot" />
                            <span>{HEALTH_LABELS[health]}</span>
                        </span>
                    </div>
                </div>

                <div className="basalt-header-action-strip basalt-header-secondary">
                    {data.slug && (
                        <a
                            href={`/torneos/${data.slug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="basalt-btn"
                        >
                            Vista pública
                        </a>
                    )}
                    <button className="basalt-btn" onClick={onRecalculate} disabled={isTransitioning} type="button">
                        Recalcular
                    </button>
                    <button className="basalt-btn" onClick={onOpenSeasonCreation} disabled={isTransitioning} type="button">
                        <CalendarPlus size={15} />
                        Nueva temporada
                    </button>
                </div>

                <div className="basalt-header-action-strip basalt-header-primary">
                    {/* Jerarquia: una sola accion verde. Guardar solo existe cuando hay
                        algo que guardar, asi que "Cambiar estado" lleva el nivel
                        intermedio (contorno de acento) en vez de competir en verde. */}
                    <button className="basalt-btn basalt-btn-accent" onClick={onStatusTransition} disabled={isTransitioning} type="button">
                        {isTransitioning ? 'Procesando...' : 'Cambiar estado'}
                    </button>

                    {isDirty && canSave && (
                        <button className="basalt-btn basalt-btn-primary" onClick={onSave} disabled={isTransitioning} type="button">
                            Guardar
                        </button>
                    )}

                    <div className="basalt-header-menu">
                        <button
                            ref={overflowTriggerRef}
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
                                    aria-hidden="true"
                                />
                                <div
                                    ref={overflowMenuRef}
                                    className={`basalt-overflow-menu ${menuVisible ? 'is-open' : ''}`}
                                    style={overflowAnchor
                                        ? { top: overflowAnchor.top, left: overflowAnchor.left, width: overflowAnchor.width }
                                        : undefined}
                                    {...overflowMenuProps}
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
