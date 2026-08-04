'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateEntity, deleteEntity, duplicateTournament } from '@/app/admin/entities/actions';
import { Database } from '@/lib/database.types';
import { TournamentHeader } from './TournamentHeader';
import { HistoricalSeasonImportDrawer } from './HistoricalSeasonImportDrawer';
import { TournamentSeasonCreationModal } from './TournamentSeasonCreationModal';
import { TournamentTabs } from './TournamentTabs';
import { TournamentRightSidebar } from './TournamentRightSidebar';
import {
    TournamentDraftProvider,
    type TournamentDetailsDraft,
    type TournamentFormatDraft,
    useTournamentDirty,
} from './TournamentContext';
import { beginClientRequest, usePerfComponentLifecycle } from '@/lib/perf/react';
import { persistTournamentLogo } from '@/lib/utils/persistTournamentLogo';
import { normalizeSlug, normalizeText } from '@/lib/utils/normalize';
import './basalt.css';
import './tournament-mobile.css';

type TournamentRow = Database['public']['Tables']['tournaments']['Row'];
type TournamentManageRow = TournamentRow & {
    display_name?: string | null;
    ruleset?: Record<string, unknown> | null;
    is_api_managed?: boolean | null;
};
type TournamentSeasonMenuItem = {
    id: string;
    label: string;
    subtitle: string;
    href: string;
    isCurrent: boolean;
};
type TournamentPhaseRow = {
    id: string;
    name: string;
    is_active?: boolean | null;
};

const NEXT_STATUS: Record<string, string> = {
    draft: 'published',
    published: 'active',
    active: 'archived',
    archived: 'draft',
};

function getVisibilityForStatus(status: string): boolean {
    return status === 'published' || status === 'active';
}

interface ShellProps {
    id: string;
    data: TournamentRow;
    currentTab: string;
    currentSubtab?: string | null;
    children: React.ReactNode;
    backHref?: string;
    matchCount?: number;
    seasonMenuItems?: TournamentSeasonMenuItem[];
}

function TournamentTabPendingState({ label }: { label: string }) {
    return (
        <div className="basalt-tab-pending" role="status" aria-live="polite">
            <div className="basalt-tab-pending-orb" aria-hidden="true" />
            <span className="basalt-tab-pending-kicker">Cargando modulo</span>
            <strong>{label}</strong>
            <div className="basalt-tab-pending-lines" aria-hidden="true">
                <span />
                <span />
                <span />
            </div>
        </div>
    );
}

function sanitizeMatchEventDefinitions(draft: TournamentFormatDraft) {
    return draft.definitions
        .map((definition, index) => ({
            ...definition,
            type: definition.type.trim() || `custom_${index + 1}`,
            label: definition.label.trim() || definition.type.trim() || `Evento ${index + 1}`,
            points: Number.isFinite(Number(definition.points)) ? Number(definition.points) : 0,
        }))
        .filter((definition, index, items) =>
            items.findIndex((candidate) => candidate.type === definition.type) === index || definition.type.startsWith('custom_'),
        );
}

function buildTournamentDetailsUpdates(
    tournament: TournamentManageRow,
    draft: TournamentDetailsDraft,
): Record<string, unknown> {
    const isApiManaged = Boolean(tournament.is_api_managed);
    const normalizedName = normalizeText(draft.name) || '';
    const normalizedCountryId = normalizeText(draft.country_id);
    const normalizedCountryLabel = normalizeText(draft.country_label);

    if (isApiManaged) {
        return {
            display_name: normalizedName,
            logo_url: normalizeText(draft.logo_url),
            priority: typeof draft.priority === 'number' ? draft.priority : 0,
        };
    }

    return {
        name: normalizedName,
        slug: normalizeSlug(draft.slug) || null,
        season_id: normalizeText(draft.season_id),
        sport_id: normalizeText(draft.sport_id),
        union_id: normalizeText(draft.union_id),
        country: normalizedCountryId ? (normalizedCountryLabel || normalizedCountryId) : null,
        country_id: normalizedCountryId,
        priority: typeof draft.priority === 'number' ? draft.priority : 0,
        region: normalizeText(draft.region),
        category: normalizeText(draft.category),
        age_grade: normalizeText(draft.age_grade),
        logo_url: normalizeText(draft.logo_url),
        ruleset: draft.ruleset,
    };
}

export function TournamentManageShell(props: ShellProps) {
    return (
        <TournamentDraftProvider tournamentId={props.id}>
            <TournamentManageShellInner {...props} />
        </TournamentDraftProvider>
    );
}

function TournamentManageShellInner({ id, data, currentTab, currentSubtab = null, children, seasonMenuItems = [] }: ShellProps) {
    const router = useRouter();
    const tournament = data as TournamentManageRow;
    const hasSidebar = currentTab === 'resumen';
    const useWideWorkspace = !hasSidebar;
    const shellRef = useRef<HTMLDivElement | null>(null);
    usePerfComponentLifecycle('TournamentManageShell', {
        tournamentId: id,
        tab: currentTab,
    });
    const {
        isDirty,
        drafts,
        dirtySections,
        clearSectionDraft,
        clearAllDrafts,
        markSectionDirty,
        triggerSectionSavedFlash,
        flushDraftPersistence,
    } = useTournamentDirty();
    const [isTransitioning, setIsTransitioning] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const [seasonMenuOpen, setSeasonMenuOpen] = useState(false);
    const [historicalImportOpen, setHistoricalImportOpen] = useState(false);
    const [seasonCreationOpen, setSeasonCreationOpen] = useState(false);
    const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [pendingTab, setPendingTab] = useState<{ id: string; label: string } | null>(null);

    useEffect(() => {
        const shell = shellRef.current;
        if (!shell || typeof window === 'undefined') return;

        const header = shell.querySelector<HTMLElement>('.basalt-header');
        const tabs = shell.querySelector<HTMLElement>('.basalt-tabs');
        if (!header || !tabs) return;

        const updateChromeOffsets = () => {
            shell.style.setProperty('--basalt-header-offset', `${Math.ceil(header.getBoundingClientRect().height)}px`);
            shell.style.setProperty('--basalt-tabs-offset', `${Math.ceil(tabs.getBoundingClientRect().height)}px`);
        };

        updateChromeOffsets();
        window.addEventListener('resize', updateChromeOffsets);

        if (typeof ResizeObserver === 'undefined') {
            return () => {
                window.removeEventListener('resize', updateChromeOffsets);
            };
        }

        const resizeObserver = new ResizeObserver(updateChromeOffsets);
        resizeObserver.observe(header);
        resizeObserver.observe(tabs);

        return () => {
            resizeObserver.disconnect();
            window.removeEventListener('resize', updateChromeOffsets);
        };
    }, []);

    useEffect(() => {
        if (!actionMessage) return;

        const timeout = window.setTimeout(() => setActionMessage(null), 5000);
        return () => window.clearTimeout(timeout);
    }, [actionMessage]);

    useEffect(() => {
        setPendingTab(null);
    }, [currentTab, currentSubtab]);

    useEffect(() => {
        if (!pendingTab) return;

        const timeout = window.setTimeout(() => {
            setPendingTab((current) => (current?.id === pendingTab.id ? null : current));
        }, 12000);

        return () => window.clearTimeout(timeout);
    }, [pendingTab]);

    const hasDirtyDetails = useMemo(
        () => Boolean(dirtySections.details && drafts.details),
        [dirtySections.details, drafts.details],
    );
    const hasDirtyFormat = useMemo(
        () => Boolean(dirtySections.format && drafts.format),
        [dirtySections.format, drafts.format],
    );
    const hasDirtyStructure = Boolean(dirtySections.structure);
    const dirtyLabels = useMemo(
        () => [
            hasDirtyDetails ? 'Detalles' : null,
            hasDirtyFormat ? 'Formato' : null,
            hasDirtyStructure ? 'Estructura' : null,
        ].filter(Boolean) as string[],
        [hasDirtyDetails, hasDirtyFormat, hasDirtyStructure],
    );

    const handleSave = useCallback(async () => {
        if (!isDirty) return;

        const updates: Record<string, unknown> = {};
        let nextRuleset = { ...(tournament.ruleset || {}) };

        if (hasDirtyDetails && drafts.details) {
            const detailDraft = drafts.details as TournamentDetailsDraft;
            const persistedLogoUrl = await persistTournamentLogo(id, detailDraft.logo_url);
            const detailUpdates = buildTournamentDetailsUpdates(tournament, {
                ...detailDraft,
                logo_url: persistedLogoUrl || '',
            });
            Object.assign(updates, detailUpdates);
            if (detailUpdates.ruleset && typeof detailUpdates.ruleset === 'object') {
                nextRuleset = detailUpdates.ruleset as Record<string, unknown>;
            }
        }

        if (hasDirtyFormat && drafts.format && !tournament.is_api_managed) {
            const nextMatchEvents = sanitizeMatchEventDefinitions(drafts.format as TournamentFormatDraft);
            nextRuleset = {
                ...nextRuleset,
                matchEvents: nextMatchEvents,
            };
            updates.ruleset = nextRuleset;
        }

        if (Object.keys(updates).length === 0) {
            // Structure has its own per-action save buttons (model selector,
            // phase wizard) and the shell does not know how to persist them,
            // so fall back to a clearer hint when that's the only dirty area.
            const hasOnlyStructureDirty = !hasDirtyDetails && !hasDirtyFormat && Boolean(dirtySections.structure);
            setActionMessage({
                type: 'error',
                text: hasOnlyStructureDirty
                    ? 'Guardá los cambios desde los botones de Estructura (Modelo competitivo o Crear/Guardar fase).'
                    : 'No hay cambios persistibles en el torneo.',
            });
            return;
        }

        setIsTransitioning(true);
        setActionMessage(null);
        const saveRequest = beginClientRequest(`tournament:${id}:save`, 'manual_save', {
            component: 'TournamentManageShell',
            sections: Object.keys(updates).join(','),
        });
        try {
            await updateEntity('tournament', id, updates);
            saveRequest.end({
                error: false,
            });

            if (hasDirtyFormat && drafts.format) {
                const nextMatchEvents = sanitizeMatchEventDefinitions(drafts.format as TournamentFormatDraft);
                window.dispatchEvent(new CustomEvent('tournament:match-events-updated', {
                    detail: {
                        tournamentId: id,
                        matchEvents: nextMatchEvents,
                    },
                }));
            }

            if (hasDirtyDetails) {
                clearSectionDraft('details');
                markSectionDirty('details', false);
                triggerSectionSavedFlash('details');
            }

            if (hasDirtyFormat) {
                clearSectionDraft('format');
                markSectionDirty('format', false);
                triggerSectionSavedFlash('format');
            }

            setActionMessage({ type: 'success', text: 'Cambios del torneo guardados correctamente.' });
            router.refresh();
        } catch (err: unknown) {
            saveRequest.end({
                error: true,
            });
            setActionMessage({ type: 'error', text: err instanceof Error ? err.message : String(err) });
        } finally {
            setIsTransitioning(false);
        }
    }, [
        clearSectionDraft,
        dirtySections.structure,
        drafts.details,
        drafts.format,
        hasDirtyDetails,
        hasDirtyFormat,
        id,
        isDirty,
        markSectionDirty,
        router,
        tournament,
        triggerSectionSavedFlash,
    ]);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
                e.preventDefault();
                void handleSave();
            }
        };

        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [handleSave]);

    useEffect(() => {
        const handler = (e: BeforeUnloadEvent) => {
            // Flush sincrónico de la escritura de draft pendiente (el persist está debounced),
            // para no perder los últimos cambios al cerrar/recargar la pestaña.
            flushDraftPersistence();
            if (isDirty) {
                e.preventDefault();
                e.returnValue = 'Tenes cambios sin guardar. Queres salir?';
            }
        };

        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, [isDirty, flushDraftPersistence]);

    const handleStatusTransition = async () => {
        const status = data.status ?? 'draft';
        const targetStatus = NEXT_STATUS[status];
        if (!targetStatus) return;

        if (!window.confirm(`Confirmar cambio de estado a ${targetStatus.toUpperCase()}?`)) return;

        setIsTransitioning(true);
        setActionMessage(null);
        const statusRequest = beginClientRequest(`tournament:${id}:status`, 'status_transition', {
            component: 'TournamentManageShell',
            targetStatus,
        });
        try {
            await updateEntity('tournament', id, {
                status: targetStatus,
                is_visible: getVisibilityForStatus(targetStatus),
            });
            statusRequest.end({
                error: false,
            });
            setActionMessage({ type: 'success', text: `Estado actualizado a ${targetStatus.toUpperCase()}.` });
            router.refresh();
        } catch (err: unknown) {
            statusRequest.end({
                error: true,
            });
            setActionMessage({ type: 'error', text: err instanceof Error ? err.message : String(err) });
        } finally {
            setIsTransitioning(false);
        }
    };

    const handleRecalculate = async () => {
        setIsTransitioning(true);
        setActionMessage(null);

        try {
            const phasesRequest = beginClientRequest(`tournament:${id}:phases`, 'recalculate', {
                component: 'TournamentManageShell',
            });
            const phasesRes = await fetch(`/api/tournaments/${id}/phases`, {
                cache: 'no-store',
            });
            const phasesJson = await phasesRes.json().catch(() => ({}));
            phasesRequest.end({
                status: phasesRes.status,
                error: !phasesRes.ok,
            });
            if (!phasesRes.ok) {
                throw new Error(typeof phasesJson?.error === 'string' ? phasesJson.error : 'No se pudieron cargar las fases del torneo.');
            }

            const phases = Array.isArray(phasesJson?.data) ? phasesJson.data as TournamentPhaseRow[] : [];
            const targetPhase = phases.find((phase) => phase.is_active) || phases[0];

            if (!targetPhase?.id) {
                throw new Error('El torneo no tiene fases activas para recalcular la tabla.');
            }

            const recalcRequest = beginClientRequest(`tournament:${id}:standings:recalculate`, 'recalculate', {
                component: 'TournamentManageShell',
                phaseId: targetPhase.id,
            });
            const recalcRes = await fetch(`/api/admin/tournaments/${id}/standings/recalculate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    phaseId: targetPhase.id,
                    tableType: 'general',
                }),
            });
            const recalcJson = await recalcRes.json().catch(() => ({}));
            recalcRequest.end({
                status: recalcRes.status,
                error: !recalcRes.ok,
            });

            if (!recalcRes.ok) {
                throw new Error(typeof recalcJson?.error === 'string' ? recalcJson.error : 'No se pudo recalcular la tabla.');
            }

            setActionMessage({
                type: 'success',
                text: `Tabla recalculada para ${targetPhase.name}. Filas procesadas: ${recalcJson.rows_calculated ?? 0}.`,
            });
            router.refresh();
        } catch (err: unknown) {
            setActionMessage({ type: 'error', text: err instanceof Error ? err.message : String(err) });
        } finally {
            setIsTransitioning(false);
        }
    };

    const handleDuplicate = async () => {
        if (!window.confirm('Deseas crear una copia de este torneo?')) return;
        setIsTransitioning(true);
        setActionMessage(null);
        try {
            const res = await duplicateTournament(id);
            if (res.success) {
                router.push(`/admin/entities/${res.id}/manage?type=tournament`);
            }
        } catch (err: unknown) {
            setActionMessage({ type: 'error', text: err instanceof Error ? err.message : String(err) });
        } finally {
            setIsTransitioning(false);
        }
    };

    const handleExport = () => {
        const jsonData = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonData], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `tournament-${data.slug || id}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleDelete = async () => {
        if (!window.confirm('Estas absolutamente seguro? Esta accion borrara el torneo y es irreversible.')) return;

        setIsTransitioning(true);
        setActionMessage(null);
        try {
            await deleteEntity('tournament', id);
            router.push('/admin/super/torneos');
        } catch (err: unknown) {
            setActionMessage({ type: 'error', text: err instanceof Error ? err.message : String(err) });
        } finally {
            setIsTransitioning(false);
        }
    };

    const handleSeasonNavigate = useCallback((href: string) => {
        if (!isDirty) {
            router.push(href);
            return;
        }

        const preserveDraft = window.confirm(
            'Tenes cambios sin guardar en esta temporada.\n\nAceptar: cambiar de temporada y conservar este borrador para retomarlo despues.\nCancelar: elegir si quieres descartarlo o quedarte aqui.'
        );

        if (preserveDraft) {
            router.push(href);
            return;
        }

        const discardDraft = window.confirm(
            'Quieres descartar los borradores de esta temporada antes de cambiar?\n\nAceptar: descartar y cambiar.\nCancelar: seguir en esta temporada.'
        );

        if (!discardDraft) {
            return;
        }

        clearAllDrafts();
        router.push(href);
    }, [clearAllDrafts, isDirty, router]);

    return (
        <div ref={shellRef} className="basalt-body flex flex-col min-h-screen">
            <TournamentHeader
                data={data}
                isDirty={isDirty}
                /* `handleSave` solo sabe persistir Detalles y Formato; si lo
                   único sucio es Estructura devuelve un error pidiendo que se
                   use el botón de la pestaña. Entonces el botón no se ofrece. */
                canSave={hasDirtyDetails || hasDirtyFormat}
                dirtyLabels={dirtyLabels}
                isTransitioning={isTransitioning}
                menuOpen={menuOpen}
                seasonMenuOpen={seasonMenuOpen}
                seasonItems={seasonMenuItems}
                onSave={() => void handleSave()}
                onStatusTransition={handleStatusTransition}
                onRecalculate={handleRecalculate}
                onDuplicate={handleDuplicate}
                onExport={handleExport}
                onDelete={handleDelete}
                onMenuToggle={() => {
                    setSeasonMenuOpen(false);
                    setMenuOpen((current) => !current);
                }}
                onMenuClose={() => setMenuOpen(false)}
                onSeasonMenuToggle={() => {
                    setMenuOpen(false);
                    setSeasonMenuOpen((current) => !current);
                }}
                onSeasonMenuClose={() => setSeasonMenuOpen(false)}
                onOpenHistoricalSeasonImport={() => {
                    setMenuOpen(false);
                    setSeasonMenuOpen(false);
                    setHistoricalImportOpen(true);
                }}
                onOpenSeasonCreation={() => {
                    setMenuOpen(false);
                    setSeasonMenuOpen(false);
                    setSeasonCreationOpen(true);
                }}
                onSeasonNavigate={handleSeasonNavigate}
            />

            <TournamentTabs
                id={id}
                currentTab={currentTab}
                data={data}
                onPendingTabChange={(tabId, tabLabel) => setPendingTab({ id: tabId, label: tabLabel })}
            />

            <div className="basalt-shell-stage">
                <div className={`basalt-shell-layout ${useWideWorkspace ? 'basalt-shell-layout-wide' : ''} ${!hasSidebar ? 'basalt-shell-layout-no-sidebar' : ''}`}>
                    <main className={`basalt-shell-main ${useWideWorkspace ? 'basalt-shell-main-wide' : ''} ${!hasSidebar ? 'basalt-shell-main-full' : ''}`}>
                        {pendingTab && pendingTab.id !== currentTab ? (
                            <TournamentTabPendingState label={pendingTab.label} />
                        ) : children}
                    </main>

                    {hasSidebar && (
                        <TournamentRightSidebar
                            id={id}
                            data={data}
                            onDelete={handleDelete}
                        />
                    )}
                </div>

                {actionMessage && (
                    <div
                        className={`basalt-toast is-${actionMessage.type}`}
                        role={actionMessage.type === 'error' ? 'alert' : 'status'}
                        aria-live={actionMessage.type === 'error' ? 'assertive' : 'polite'}
                    >
                        {actionMessage.text}
                    </div>
                )}

            </div>

            <HistoricalSeasonImportDrawer
                open={historicalImportOpen}
                tournamentId={id}
                seasonLabel={data.season_id}
                onClose={() => setHistoricalImportOpen(false)}
            />
            <TournamentSeasonCreationModal
                open={seasonCreationOpen}
                tournamentId={id}
                tournamentName={data.name || 'Torneo'}
                onClose={() => setSeasonCreationOpen(false)}
                onCreated={(seasonId) => {
                    setSeasonCreationOpen(false);
                    const params = new URLSearchParams({ type: 'tournament', tab: currentTab || 'resumen', seasonId });
                    if (currentSubtab) params.set('subtab', currentSubtab);
                    router.push(`/admin/entities/${id}/manage?${params.toString()}`);
                    router.refresh();
                }}
            />
        </div>
    );
}
