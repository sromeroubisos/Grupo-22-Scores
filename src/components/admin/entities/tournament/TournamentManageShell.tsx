'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateEntity, deleteEntity, duplicateTournament } from '@/app/admin/entities/actions';
import { Database } from '@/lib/database.types';
import { TournamentHeader } from './TournamentHeader';
import { HistoricalSeasonImportDrawer } from './HistoricalSeasonImportDrawer';
import { TournamentTabs } from './TournamentTabs';
import { TournamentRightSidebar } from './TournamentRightSidebar';
import {
    TournamentDraftProvider,
    type TournamentDetailsDraft,
    type TournamentFormatDraft,
    useTournamentDirty,
} from './TournamentContext';
import './basalt.css';

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

    if (isApiManaged) {
        return {
            display_name: draft.name.trim(),
            logo_url: draft.logo_url || null,
        };
    }

    return {
        name: draft.name.trim(),
        slug: draft.slug || null,
        season_id: draft.season_id || null,
        sport_id: draft.sport_id || null,
        union_id: draft.union_id || null,
        country: draft.country_id ? (draft.country_label || draft.country_id) : null,
        country_id: draft.country_id || null,
        region: draft.region || null,
        category: draft.category || null,
        age_grade: draft.age_grade || null,
        logo_url: draft.logo_url || null,
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

function TournamentManageShellInner({ id, data, currentTab, children, seasonMenuItems = [] }: ShellProps) {
    const router = useRouter();
    const tournament = data as TournamentManageRow;
    const {
        isDirty,
        drafts,
        dirtySections,
        clearSectionDraft,
        clearAllDrafts,
        markSectionDirty,
        triggerSectionSavedFlash,
    } = useTournamentDirty();
    const [isTransitioning, setIsTransitioning] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const [seasonMenuOpen, setSeasonMenuOpen] = useState(false);
    const [historicalImportOpen, setHistoricalImportOpen] = useState(false);
    const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    useEffect(() => {
        if (!actionMessage) return;

        const timeout = window.setTimeout(() => setActionMessage(null), 5000);
        return () => window.clearTimeout(timeout);
    }, [actionMessage]);

    const hasDirtyDetails = useMemo(
        () => Boolean(dirtySections.details && drafts.details),
        [dirtySections.details, drafts.details],
    );
    const hasDirtyFormat = useMemo(
        () => Boolean(dirtySections.format && drafts.format),
        [dirtySections.format, drafts.format],
    );
    const dirtyLabels = useMemo(
        () => [
            hasDirtyDetails ? 'Detalles' : null,
            hasDirtyFormat ? 'Formato' : null,
        ].filter(Boolean) as string[],
        [hasDirtyDetails, hasDirtyFormat],
    );

    const handleSave = useCallback(async () => {
        if (!isDirty) return;

        const updates: Record<string, unknown> = {};
        let nextRuleset = { ...(tournament.ruleset || {}) };

        if (hasDirtyDetails && drafts.details) {
            const detailUpdates = buildTournamentDetailsUpdates(tournament, drafts.details as TournamentDetailsDraft);
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
            setActionMessage({ type: 'error', text: 'No hay cambios persistibles en el torneo.' });
            return;
        }

        setIsTransitioning(true);
        setActionMessage(null);
        try {
            await updateEntity('tournament', id, updates);

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
            setActionMessage({ type: 'error', text: err instanceof Error ? err.message : String(err) });
        } finally {
            setIsTransitioning(false);
        }
    }, [
        clearSectionDraft,
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
            if (isDirty) {
                e.preventDefault();
                e.returnValue = 'Tenes cambios sin guardar. Queres salir?';
            }
        };

        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, [isDirty]);

    const handleStatusTransition = async () => {
        const status = data.status ?? 'draft';
        const targetStatus = NEXT_STATUS[status];
        if (!targetStatus) return;

        if (!window.confirm(`Confirmar cambio de estado a ${targetStatus.toUpperCase()}?`)) return;

        setIsTransitioning(true);
        setActionMessage(null);
        try {
            await updateEntity('tournament', id, { status: targetStatus });
            setActionMessage({ type: 'success', text: `Estado actualizado a ${targetStatus.toUpperCase()}.` });
            router.refresh();
        } catch (err: unknown) {
            setActionMessage({ type: 'error', text: err instanceof Error ? err.message : String(err) });
        } finally {
            setIsTransitioning(false);
        }
    };

    const handleRecalculate = async () => {
        setIsTransitioning(true);
        setActionMessage(null);

        try {
            const phasesRes = await fetch(`/api/tournaments/${id}/phases`, {
                cache: 'no-store',
            });
            const phasesJson = await phasesRes.json().catch(() => ({}));
            if (!phasesRes.ok) {
                throw new Error(typeof phasesJson?.error === 'string' ? phasesJson.error : 'No se pudieron cargar las fases del torneo.');
            }

            const phases = Array.isArray(phasesJson?.data) ? phasesJson.data as TournamentPhaseRow[] : [];
            const targetPhase = phases.find((phase) => phase.is_active) || phases[0];

            if (!targetPhase?.id) {
                throw new Error('El torneo no tiene fases activas para recalcular la tabla.');
            }

            const recalcRes = await fetch(`/api/admin/tournaments/${id}/standings/recalculate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    phaseId: targetPhase.id,
                    tableType: 'general',
                }),
            });
            const recalcJson = await recalcRes.json().catch(() => ({}));

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
        <div className="basalt-body flex flex-col min-h-screen">
            <TournamentHeader
                data={data}
                isDirty={isDirty}
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
                onSeasonNavigate={handleSeasonNavigate}
            />

            <TournamentTabs id={id} currentTab={currentTab} data={data} />

            <div className="basalt-shell-stage">
                <div className={`basalt-shell-layout ${currentTab === 'posiciones' ? 'basalt-shell-layout-wide' : ''}`}>
                    <main className={`basalt-shell-main ${currentTab === 'posiciones' ? 'basalt-shell-main-wide' : ''}`}>
                        {children}
                    </main>

                    {currentTab === 'resumen' && (
                        <TournamentRightSidebar
                            id={id}
                            data={data}
                            onDelete={handleDelete}
                        />
                    )}
                </div>

                {actionMessage && (
                    <div className={`mx-4 mb-4 rounded border px-4 py-3 text-sm ${actionMessage.type === 'error' ? 'border-red-500/20 bg-red-500/10 text-red-300' : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'}`}>
                        {actionMessage.text}
                    </div>
                )}

                <footer className="basalt-action-footer">
                    <div className="basalt-action-footer-copy">
                        <span className="basalt-action-footer-kicker">Consola</span>
                        <strong className="basalt-action-footer-title">Gestion central del torneo</strong>
                        <p className="basalt-action-footer-text">
                            Recorre el flujo real del torneo desde una sola vista: detalles, formato, estructura,
                            participantes y operacion.
                        </p>
                    </div>

                    <div className="basalt-action-footer-meta">
                        <span className={`basalt-action-footer-badge ${isDirty ? 'is-live' : 'is-ready'}`}>
                            {isDirty ? 'Cambios pendientes' : 'Estado sincronizado'}
                        </span>
                        <span className="basalt-action-footer-shortcut">Ctrl/Cmd + S</span>
                    </div>

                    <div className="basalt-action-footer-actions">
                        <button
                            className="basalt-btn"
                            onClick={handleRecalculate}
                            disabled={isTransitioning}
                            type="button"
                        >
                            Recalcular
                        </button>
                        <button
                            className="basalt-btn basalt-btn-primary"
                            onClick={() => void handleSave()}
                            disabled={isTransitioning || !isDirty}
                            type="button"
                        >
                            {isTransitioning ? 'Procesando...' : 'Guardar cambios'}
                        </button>
                    </div>
                </footer>
            </div>

            <HistoricalSeasonImportDrawer
                open={historicalImportOpen}
                tournamentId={id}
                seasonLabel={data.season_id}
                onClose={() => setHistoricalImportOpen(false)}
            />
        </div>
    );
}
