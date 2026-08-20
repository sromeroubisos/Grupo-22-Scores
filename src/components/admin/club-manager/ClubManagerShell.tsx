'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ExternalLink, MapPin, Shield, Trophy } from 'lucide-react';
import type { Database } from '@/lib/database.types';
import { buildClubManageHref, pushClubManageHistoryState, type ClubConsoleMode } from '@/lib/clubAdminRoutes';
import { getSportDisplayName } from '@/lib/clubDerivatives';
import { resolveLogoPreviewSrc } from '@/lib/utils/logoUrl';
import {
    CLUB_MANAGER_TABS,
    normalizeClubManagerTab,
    type ClubManagerTabId,
} from '@/lib/club-admin/manageTabs';
import { GeneralTab } from './GeneralTab';
import { PlayersTab } from './PlayersTab';
import { PublishTab } from './PublishTab';
import { RelatedClubsTab } from './RelatedClubsTab';
import { UsersTab } from './UsersTab';
import { VenuesTab } from './VenuesTab';

import './club-manager.css';

type ClubRow = Database['public']['Tables']['clubs']['Row'];

export interface ClubManagerShellProps {
    id: string;
    data: ClubRow | null;
    unions: { id: string; name: string }[];
    initialTab: ClubManagerTabId;
    navigationMode?: ClubConsoleMode;
    backHref?: string;
    /** El escudo llega resuelto por el servidor: `logo_url` puede ser un data URI de 870 KB. */
    crestSrc?: string | null;
}

export type ClubToast = { text: string; kind: 'ok' | 'error' } | null;

function initialsOf(name: string) {
    return name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((word) => word[0])
        .join('')
        .toUpperCase();
}

export function ClubManagerShell({
    id,
    data,
    unions,
    initialTab,
    navigationMode = 'admin',
    backHref,
    crestSrc,
}: ClubManagerShellProps) {
    const [tab, setTab] = useState<ClubManagerTabId>(initialTab);
    const [club, setClub] = useState<ClubRow | null>(data);
    const [toast, setToast] = useState<ClubToast>(null);
    const tabsRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => setClub(data), [data]);
    useEffect(() => setTab(initialTab), [initialTab]);

    // El botón "atrás" del navegador tiene que mover la pestaña: la navegación
    // se hace con pushState nativo, así que el popstate es la única señal.
    useEffect(() => {
        const onPop = () => {
            const requested = new URLSearchParams(window.location.search).get('tab');
            setTab(normalizeClubManagerTab(requested));
        };
        window.addEventListener('popstate', onPop);
        return () => window.removeEventListener('popstate', onPop);
    }, []);

    // En 390px las seis pestañas no entran y la barra scrollea. Si se entra por
    // URL a "Publicar", la pestaña activa queda fuera de cuadro y la pantalla
    // parece abierta en otra sección. Se mueve el scroll de la barra, no el de
    // la página: scrollIntoView arrastraría el documento entero.
    useEffect(() => {
        const bar = tabsRef.current;
        const active = bar?.querySelector<HTMLElement>('[aria-selected="true"]');
        if (!bar || !active) return;

        const left = active.offsetLeft;
        const right = left + active.offsetWidth;
        const margin = 12;

        if (left < bar.scrollLeft + margin) {
            bar.scrollTo({ left: Math.max(0, left - margin), behavior: 'smooth' });
        } else if (right > bar.scrollLeft + bar.clientWidth - margin) {
            bar.scrollTo({ left: right - bar.clientWidth + margin, behavior: 'smooth' });
        }
    }, [tab]);

    useEffect(() => {
        if (!toast) return;
        const timer = window.setTimeout(() => setToast(null), 3200);
        return () => window.clearTimeout(timer);
    }, [toast]);

    const notify = useCallback((text: string, kind: 'ok' | 'error' = 'ok') => {
        setToast({ text, kind });
    }, []);

    const goToTab = useCallback((next: ClubManagerTabId) => {
        setTab(next);
        pushClubManageHistoryState(id, next, navigationMode);
    }, [id, navigationMode]);

    // El escudo del estado manda sobre el que llegó del servidor: si se cambia en
    // General, la cabecera tiene que reflejarlo sin recargar.
    const crest = useMemo(
        () => resolveLogoPreviewSrc(club?.logo_url) ?? crestSrc ?? null,
        [club?.logo_url, crestSrc],
    );

    const unionName = useMemo(
        () => unions.find((union) => union.id === club?.union_id)?.name ?? null,
        [unions, club?.union_id],
    );

    if (!club) {
        return (
            <div className="cm-root">
                <div className="cm-empty">
                    <strong>No pudimos abrir el club</strong>
                    El club <code>{id}</code> ya no existe o no está disponible para esta cuenta.
                </div>
            </div>
        );
    }

    const location = [club.city, club.region].filter(Boolean).join(', ');
    const sportLabel = club.sport ? getSportDisplayName(club.sport) : null;
    const fallbackBack = navigationMode === 'club-admin' ? '/club-admin' : '/admin/super/clubes';

    return (
        <div className="cm-root">
            <Link href={backHref || fallbackBack} prefetch={false} className="cm-back">
                <ArrowLeft size={14} aria-hidden="true" />
                {navigationMode === 'club-admin' ? 'Volver al panel' : 'Volver a clubes'}
            </Link>

            <header className="cm-header">
                <div className="cm-crest">
                    {crest
                        ? <img src={crest} alt="" />
                        : (
                            <span
                                className="cm-crest-fallback"
                                style={{ background: club.primary_color || 'var(--color-bg-tertiary)' }}
                            >
                                {initialsOf(club.name)}
                            </span>
                        )}
                </div>

                <div className="cm-titles">
                    <h1>{club.name}</h1>
                    <div className="cm-chips">
                        {sportLabel && (
                            <span className="cm-chip"><Trophy size={11} aria-hidden="true" />{sportLabel}</span>
                        )}
                        {unionName && (
                            <span className="cm-chip"><Shield size={11} aria-hidden="true" />{unionName}</span>
                        )}
                        {location && (
                            <span className="cm-chip"><MapPin size={11} aria-hidden="true" />{location}</span>
                        )}
                        {!club.is_visible && <span className="cm-chip">Oculto</span>}
                    </div>
                </div>

                <div className="cm-header-actions">
                    <Link
                        href={`/clubs/${club.slug || club.id}`}
                        prefetch={false}
                        target="_blank"
                        rel="noreferrer"
                        className="cm-btn"
                    >
                        <ExternalLink size={14} aria-hidden="true" />
                        Ver ficha
                    </Link>
                </div>
            </header>

            <div className="cm-tabs" role="tablist" aria-label="Secciones del club" ref={tabsRef}>
                {CLUB_MANAGER_TABS.map((item) => (
                    <button
                        key={item.id}
                        type="button"
                        role="tab"
                        id={`cm-tab-${item.id}`}
                        aria-selected={tab === item.id}
                        aria-controls={`cm-panel-${item.id}`}
                        className="cm-tab"
                        onClick={() => goToTab(item.id)}
                    >
                        {item.label}
                    </button>
                ))}
            </div>

            <div
                className="cm-panel"
                role="tabpanel"
                id={`cm-panel-${tab}`}
                aria-labelledby={`cm-tab-${tab}`}
            >
                {tab === 'general' && (
                    <GeneralTab
                        id={id}
                        club={club}
                        unions={unions}
                        onSaved={(updated) => setClub(updated)}
                        notify={notify}
                    />
                )}
                {tab === 'jugadores' && <PlayersTab clubId={id} notify={notify} />}
                {tab === 'sedes' && <VenuesTab clubId={id} notify={notify} />}
                {tab === 'usuarios' && <UsersTab clubId={id} notify={notify} />}
                {tab === 'relacionados' && (
                    <RelatedClubsTab
                        clubId={id}
                        navigationMode={navigationMode}
                        notify={notify}
                    />
                )}
                {tab === 'publicar' && (
                    <PublishTab
                        clubId={id}
                        notify={notify}
                        onPublishedChange={(isPublished) => {
                            // Publicar toca `is_visible`, y de ahí sale el chip
                            // "Oculto" de la cabecera: sin esto queda mintiendo
                            // hasta la próxima recarga.
                            setClub((prev) => (prev ? { ...prev, is_visible: isPublished } : prev));
                        }}
                    />
                )}
            </div>

            {toast && (
                <div
                    className={`cm-toast${toast.kind === 'error' ? ' cm-toast-error' : ''}`}
                    role="status"
                    aria-live="polite"
                >
                    {toast.text}
                </div>
            )}
        </div>
    );
}

export { buildClubManageHref };
