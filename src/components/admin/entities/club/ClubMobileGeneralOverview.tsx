'use client';

import Link from 'next/link';
import { AlertTriangle, ArrowRight, CalendarDays, Clock3, Layers3, ShieldCheck, Users } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { ClubDashboardHealth, ClubDashboardMatch } from '@/lib/club-admin/dashboard-types';
import type { ClubManageTabId } from '@/lib/club-admin/manageTabs';
import type { Division } from '@/lib/services/divisionService';
import { buildClubManageHref, type ClubConsoleMode } from '@/lib/clubAdminRoutes';

interface ClubMobileGeneralOverviewProps {
    clubId: string;
    clubName: string;
    sportLabel?: string;
    divisions: Division[];
    health: ClubDashboardHealth;
    upcomingMatches: number;
    nextMatch: ClubDashboardMatch | null;
    navigationMode: ClubConsoleMode;
    onTabChange?: (tabId: ClubManageTabId) => void;
}

function formatNextMatchLabel(clubName: string, match: ClubDashboardMatch | null) {
    if (!match) {
        return {
            title: 'Sin partido programado',
            subtitle: 'Todavia no hay eventos cargados en el calendario del club.',
        };
    }

    const rival = match.opponentShortName || match.opponentName || 'Rival';
    const title = match.isHome ? `${clubName} vs ${rival}` : `${rival} vs ${clubName}`;
    const date = match.dateTime ? new Date(match.dateTime) : null;
    const dateLabel = date
        ? `${format(date, 'EEE d MMM', { locale: es })} / ${format(date, 'HH:mm')}`
        : 'Fecha pendiente';
    const venueLabel = match.venue?.trim() || 'Sede a confirmar';

    return {
        title,
        subtitle: `${dateLabel} / ${venueLabel}`,
    };
}

export function ClubMobileGeneralOverview({
    clubId,
    clubName,
    sportLabel,
    divisions,
    health,
    upcomingMatches,
    nextMatch,
    navigationMode,
    onTabChange,
}: ClubMobileGeneralOverviewProps) {
    const totalPlayers = divisions.reduce((sum, division) => sum + (division.players_count || 0), 0);
    const nextMatchCopy = formatNextMatchLabel(clubName, nextMatch);

    const handleTabLinkClick = (
        event: React.MouseEvent<HTMLAnchorElement>,
        tabId: ClubManageTabId
    ) => {
        if (!onTabChange) {
            return;
        }

        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
            return;
        }

        event.preventDefault();
        onTabChange(tabId);
    };

    return (
        <section className="club-mobile-overview" aria-label="Estado operativo del club">
            <div className="club-mobile-overview-copy">
                <span className="club-ui-pill">Resumen operativo</span>
                <h2>{clubName}</h2>
                <p>{sportLabel || 'Deporte'} / Club activo</p>
            </div>

            <div className="club-mobile-kpis">
                <div className="club-mobile-kpi">
                    <span>Planteles</span>
                    <strong>{divisions.length}</strong>
                </div>
                <div className="club-mobile-kpi">
                    <span>Jugadores</span>
                    <strong>{totalPlayers}</strong>
                </div>
                <div className="club-mobile-kpi">
                    <span>Partidos proximos</span>
                    <strong>{upcomingMatches}</strong>
                </div>
                <div className="club-mobile-kpi">
                    <span>Alertas activas</span>
                    <strong>{health.issues.length}</strong>
                </div>
            </div>

            <div className="club-mobile-next-match">
                <div className="club-mobile-next-match-head">
                    <span className="club-mobile-section-label">Proximo partido</span>
                    <CalendarDays className="w-4 h-4" />
                </div>
                <strong>{nextMatchCopy.title}</strong>
                <p>{nextMatchCopy.subtitle}</p>
            </div>

            <div className="club-mobile-quick-actions">
                <Link
                    href={buildClubManageHref(clubId, 'equipos', navigationMode)}
                    className="club-mobile-action"
                    prefetch={false}
                    onClick={(event) => handleTabLinkClick(event, 'equipos')}
                >
                    <ShieldCheck className="w-4 h-4" />
                    <span>Editar identidad</span>
                </Link>
                <Link
                    href={buildClubManageHref(clubId, 'planteles', navigationMode)}
                    className="club-mobile-action"
                    prefetch={false}
                    onClick={(event) => handleTabLinkClick(event, 'planteles')}
                >
                    <Users className="w-4 h-4" />
                    <span>Abrir planteles</span>
                </Link>
                <Link
                    href={buildClubManageHref(clubId, 'partidos', navigationMode)}
                    className="club-mobile-action"
                    prefetch={false}
                    onClick={(event) => handleTabLinkClick(event, 'partidos')}
                >
                    <Clock3 className="w-4 h-4" />
                    <span>Ir a partidos</span>
                </Link>
            </div>

            <div className="club-mobile-overview-footer">
                <div className="club-mobile-health-inline">
                    {health.issues.length > 0 ? (
                        <AlertTriangle className="w-4 h-4" />
                    ) : (
                        <Layers3 className="w-4 h-4" />
                    )}
                    <span>
                        {health.issues.length > 0
                            ? `${health.issues.length} alertas para revisar`
                            : 'Base operativa lista'}
                    </span>
                </div>
                <Link
                    href={buildClubManageHref(clubId, 'configuracion', navigationMode)}
                    className="club-mobile-overview-link"
                    prefetch={false}
                    onClick={(event) => handleTabLinkClick(event, 'configuracion')}
                >
                    Ajustes del club
                    <ArrowRight className="w-4 h-4" />
                </Link>
            </div>
        </section>
    );
}
