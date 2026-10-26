'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArchiveRestore, CalendarPlus, ChevronDown, ExternalLink, MoreHorizontal, X } from 'lucide-react';
import { Database } from '@/lib/database.types';
import { getTournamentFormatLabel } from '@/lib/utils/tournamentFormat';
import './basalt.css';
import './tournament-header.css';
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

const STATUS_LABELS: Record<string, string> = {
    draft: 'Borrador',
    published: 'Publicado',
    active: 'En curso',
    archived: 'Archivado',
};

// Mismo ciclo que NEXT_STATUS en TournamentManageShell: el botón dice a qué
// estado pasa en vez de un "Cambiar estado" que obliga a adivinar.
const NEXT_STATUS_LABEL: Record<string, string> = {
    draft: 'Publicar',
    published: 'Poner en curso',
    active: 'Archivar',
    archived: 'Volver a borrador',
};

function initialsOf(name: string): string {
    const words = name.replace(/["'“”]/g, '').split(/\s+/).filter((word) => word.length > 2 || /^[A-Z]/.test(word));
    return (words.slice(0, 3).map((word) => word[0]).join('') || name.slice(0, 2)).toUpperCase();
}

export function TournamentHeader({
    data, isDirty, canSave = true, dirtyLabels = [], isTransitioning, menuOpen, seasonMenuOpen, seasonItems,
    onSave, onStatusTransition, onRecalculate, onDuplicate, onExport, onDelete,
    onMenuToggle, onMenuClose, onSeasonMenuToggle, onSeasonMenuClose, onOpenSeasonCreation, onOpenHistoricalSeasonImport, onSeasonNavigate,
}: TournamentHeaderProps) {
    const tournament = data as TournamentDisplayRow;
    const statusKey = (data.status ?? 'draft').toLowerCase();
    const statusLabel = STATUS_LABELS[statusKey] || statusKey;
    const nextStatusLabel = NEXT_STATUS_LABEL[statusKey] || 'Cambiar estado';
    const health = computeHealth(data);
    const isVisible = data.is_visible;
    const tournamentName = data.name || 'Torneo sin nombre';
    const subtitle = [
        tournament.category,
        tournament.format ? getTournamentFormatLabel(tournament.format) : null,
    ].filter(Boolean).join(' · ');
    const { shouldRender, isVisible: menuVisible } = useAnimatedDisclosure(menuOpen, 180);
    const { shouldRender: shouldRenderSeasonMenu, isVisible: seasonMenuVisible } = useAnimatedDisclosure(seasonMenuOpen, 180);

    const { ref: overflowMenuRef, dialogProps: overflowMenuProps } = useDialog<HTMLDivElement>({
        open: menuOpen,
        onClose: onMenuClose,
        role: 'menu',
        label: 'Más acciones del torneo',
        lockPageScroll: false,
    });
    const { ref: seasonMenuRef, dialogProps: seasonMenuProps } = useDialog<HTMLDivElement>({
        open: seasonMenuOpen,
        onClose: onSeasonMenuClose,
        role: 'menu',
        label: 'Temporadas',
        lockPageScroll: false,
    });

    // `.basalt-header` lleva `backdrop-filter`, que vuelve al header el bloque
    // contenedor de los `position: fixed`: los menús se portalean a <body> y se
    // anclan con coordenadas del rect real del disparador.
    const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
    useEffect(() => {
        setPortalTarget(document.body);
    }, []);

    const seasonTriggerRef = useRef<HTMLButtonElement>(null);
    const overflowTriggerRef = useRef<HTMLButtonElement>(null);
    const seasonAnchor = useAnchoredMenu(seasonMenuOpen, seasonTriggerRef, 300);
    const overflowAnchor = useAnchoredMenu(menuOpen, overflowTriggerRef, 260);

    const menuActions = [
        data.slug ? {
            id: 'public',
            label: 'Ver página pública',
            href: `/torneos/${data.slug}`,
        } : null,
        { id: 'recalculate', label: 'Recalcular tabla', onClick: onRecalculate },
        { id: 'duplicate', label: 'Duplicar torneo', onClick: onDuplicate },
        { id: 'export', label: 'Exportar datos', onClick: onExport },
        { id: 'historical', label: 'Importar torneo histórico', onClick: onOpenHistoricalSeasonImport },
        { id: 'delete', label: 'Borrar torneo', onClick: onDelete, danger: true },
    ].filter(Boolean) as Array<{
        id: string;
        label: string;
        onClick?: () => void;
        href?: string;
        danger?: boolean;
    }>;

    return (
        <header className="basalt-header tmh">
            <div className="tmh-row">
                <div className="tmh-crest" aria-hidden="true">
                    {data.logo_url
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={data.logo_url} alt="" />
                        : <span>{initialsOf(tournamentName)}</span>}
                </div>

                <div className="tmh-ident">
                    <div className="tmh-crumb">
                        <a href="/admin/super/torneos">Torneos</a>
                        {tournament.sport ? <> / {tournament.sport}</> : null}
                    </div>
                    {/* title: el nombre completo queda en el atributo porque la linea
                        se trunca con ellipsis cuando el torneo tiene nombre largo. */}
                    <h1 className="tmh-title" title={tournamentName}>{tournamentName}</h1>
                    {subtitle ? <div className="tmh-sub">{subtitle}</div> : null}
                </div>

                <div className="tmh-tools">
                    {isDirty && (
                        <span className="tmh-unsaved" role="status">
                            <span className="tmh-unsaved-dot" aria-hidden="true" />
                            {/* Sin boton "Guardar" al lado, el aviso tiene que decir
                                donde se guarda; si no, avisa de un problema y no da
                                la salida. */}
                            {!canSave
                                ? 'Sin guardar en Fases: usá el botón de su panel'
                                : dirtyLabels.length > 0
                                    ? `Sin guardar: ${dirtyLabels.join(', ')}`
                                    : 'Cambios sin guardar'}
                        </span>
                    )}

                    <button
                        ref={seasonTriggerRef}
                        type="button"
                        className={`tmh-season ${seasonMenuOpen ? 'is-open' : ''}`}
                        onClick={onSeasonMenuToggle}
                        aria-haspopup="menu"
                        aria-expanded={seasonMenuOpen}
                    >
                        <small>Temporada</small>
                        <span>{data.season_id || 'Sin definir'}</span>
                        <ChevronDown size={14} aria-hidden="true" />
                    </button>

                    <span className={`tmh-chip is-${statusKey}`} title={isVisible ? 'Se ve en la página pública' : 'No se ve en la página pública'}>
                        <span className="tmh-chip-dot" aria-hidden="true" />
                        {statusLabel}
                        {!isVisible ? <span className="tmh-chip-note">· oculto</span> : null}
                    </span>

                    {health !== 'OK' ? (
                        <span className="tmh-chip is-warning" title="Faltan datos básicos del torneo">
                            <span className="tmh-chip-dot" aria-hidden="true" />
                            {health === 'ERROR' ? 'Datos incompletos' : 'Revisar datos'}
                        </span>
                    ) : null}

                    {data.slug && (
                        <a
                            href={`/torneos/${data.slug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="tmh-btn tmh-hide-narrow"
                        >
                            <ExternalLink size={15} aria-hidden="true" />
                            Ver página pública
                        </a>
                    )}

                    <button className="tmh-btn" onClick={onStatusTransition} disabled={isTransitioning} type="button">
                        {isTransitioning ? 'Procesando...' : nextStatusLabel}
                    </button>

                    {isDirty && canSave && (
                        <button className="tmh-btn tmh-btn-primary" onClick={onSave} disabled={isTransitioning} type="button">
                            Guardar
                        </button>
                    )}

                    <button
                        ref={overflowTriggerRef}
                        className="tmh-btn tmh-btn-icon"
                        onClick={onMenuToggle}
                        aria-label="Más acciones"
                        aria-expanded={menuOpen}
                        aria-haspopup="menu"
                        type="button"
                    >
                        <MoreHorizontal size={18} />
                    </button>
                </div>
            </div>

            {shouldRenderSeasonMenu && portalTarget ? createPortal(
                <>
                    <div
                        className={`basalt-floating-backdrop ${seasonMenuVisible ? 'is-open' : ''}`}
                        onClick={onSeasonMenuClose}
                        aria-hidden="true"
                    />
                    <div
                        ref={seasonMenuRef}
                        className={`tmh-menu ${seasonMenuVisible ? 'is-open' : ''}`}
                        style={seasonAnchor
                            ? { top: seasonAnchor.top, left: seasonAnchor.left, width: seasonAnchor.width }
                            : undefined}
                        {...seasonMenuProps}
                    >
                        {seasonItems.length > 0 ? seasonItems.map((item) => (
                            <a
                                key={item.id}
                                href={item.href}
                                className={`tmh-menu-item ${item.isCurrent ? 'is-current' : ''}`}
                                role="menuitem"
                                aria-current={item.isCurrent ? 'true' : undefined}
                                onClick={(event) => {
                                    event.preventDefault();
                                    onSeasonMenuClose();
                                    if (!item.isCurrent) onSeasonNavigate(item.href);
                                }}
                            >
                                <span>{item.label}</span>
                                <small>{item.subtitle}</small>
                            </a>
                        )) : (
                            <div className="tmh-menu-empty">Este torneo tiene una sola temporada.</div>
                        )}

                        <div className="tmh-menu-sep" role="separator" />
                        <button
                            type="button"
                            className="tmh-menu-item is-new"
                            role="menuitem"
                            onClick={() => {
                                onSeasonMenuClose();
                                onOpenSeasonCreation();
                            }}
                        >
                            <span><CalendarPlus size={15} aria-hidden="true" /> Nueva temporada</span>
                            <small>Copia equipos y fases si querés</small>
                        </button>
                        <button
                            type="button"
                            className="tmh-menu-item"
                            role="menuitem"
                            onClick={() => {
                                onSeasonMenuClose();
                                onOpenHistoricalSeasonImport();
                            }}
                        >
                            <span><ArchiveRestore size={15} aria-hidden="true" /> Importar temporada histórica</span>
                        </button>
                    </div>
                </>,
                portalTarget,
            ) : null}

            {shouldRender && portalTarget && createPortal(
                <>
                    <div
                        className={`basalt-floating-backdrop ${menuVisible ? 'is-open' : ''}`}
                        onClick={onMenuClose}
                        aria-hidden="true"
                    />
                    <div
                        ref={overflowMenuRef}
                        className={`tmh-menu ${menuVisible ? 'is-open' : ''}`}
                        style={overflowAnchor
                            ? { top: overflowAnchor.top, left: overflowAnchor.left, width: overflowAnchor.width }
                            : undefined}
                        {...overflowMenuProps}
                    >
                        <div className="tmh-menu-head">
                            <span>Acciones</span>
                            <button type="button" className="tmh-menu-close" onClick={onMenuClose} aria-label="Cerrar menú">
                                <X size={15} />
                            </button>
                        </div>
                        {menuActions.map((action) => {
                            if (action.danger) {
                                return (
                                    <div key={action.id}>
                                        <div className="tmh-menu-sep" role="separator" />
                                        <button
                                            className="tmh-menu-item is-danger"
                                            role="menuitem"
                                            onClick={() => {
                                                action.onClick?.();
                                                onMenuClose();
                                            }}
                                            disabled={isTransitioning}
                                            type="button"
                                        >
                                            <span>{action.label}</span>
                                        </button>
                                    </div>
                                );
                            }
                            if (action.href) {
                                return (
                                    <a
                                        key={action.id}
                                        href={action.href}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="tmh-menu-item"
                                        role="menuitem"
                                        onClick={onMenuClose}
                                    >
                                        <span>{action.label}</span>
                                    </a>
                                );
                            }
                            return (
                                <button
                                    key={action.id}
                                    className="tmh-menu-item"
                                    role="menuitem"
                                    onClick={() => {
                                        action.onClick?.();
                                        onMenuClose();
                                    }}
                                    disabled={isTransitioning}
                                    type="button"
                                >
                                    <span>{action.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </>,
                portalTarget,
            )}
        </header>
    );
}
