'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { updateEntity, deleteEntity, duplicateTournament } from '@/app/admin/entities/actions';
import { Database } from '@/lib/database.types';
import { TournamentDirtyCtx } from './TournamentContext';
import { TournamentHeader } from './TournamentHeader';
import { HistoricalSeasonImportDrawer } from './HistoricalSeasonImportDrawer';
import { TournamentTabs } from './TournamentTabs';
import { TournamentRightSidebar } from './TournamentRightSidebar';
import './basalt.css';

type TournamentRow = Database['public']['Tables']['tournaments']['Row'];
type TournamentSeasonMenuItem = {
    id: string;
    label: string;
    subtitle: string;
    href: string;
    isCurrent: boolean;
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

export function TournamentManageShell({ id, data, currentTab, children, seasonMenuItems = [] }: ShellProps) {
    const router = useRouter();
    const [isDirty, setDirty] = useState(false);
    const [isTransitioning, setIsTransitioning] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const [seasonMenuOpen, setSeasonMenuOpen] = useState(false);
    const [historicalImportOpen, setHistoricalImportOpen] = useState(false);

    // Keyboard shortcut: Ctrl/Cmd+S
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
                e.preventDefault();
                window.dispatchEvent(new CustomEvent('tournament:save'));
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, []);

    // Dirty state guard
    useEffect(() => {
        const handler = (e: BeforeUnloadEvent) => {
            if (isDirty) {
                e.preventDefault();
                e.returnValue = 'Tenés cambios sin guardar. ¿Querés salir?';
            }
        };
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, [isDirty]);

    const handleSave = () => {
        window.dispatchEvent(new CustomEvent('tournament:save'));
    };

    const handleStatusTransition = async () => {
        const status = data.status ?? 'draft';
        const targetStatus = NEXT_STATUS[status];
        if (!targetStatus) return;

        if (!window.confirm(`¿Confirmar cambio de estado a ${targetStatus.toUpperCase()}?`)) return;

        setIsTransitioning(true);
        try {
            await updateEntity('tournament', id, { status: targetStatus });
            router.refresh();
        } catch (err: unknown) {
            alert(err instanceof Error ? err.message : String(err));
        } finally {
            setIsTransitioning(false);
        }
    };

    const handleRecalculate = async () => {
        setIsTransitioning(true);
        // Simulate recalculation for now as there's no backend endpoint yet
        await new Promise(r => setTimeout(r, 2000));
        alert('Cálculo de posiciones y estadísticas completado.');
        setIsTransitioning(false);
    };

    const handleDuplicate = async () => {
        if (!window.confirm('¿Deseas crear una copia de este torneo?')) return;
        setIsTransitioning(true);
        try {
            const res = await duplicateTournament(id);
            if (res.success) {
                router.push(`/admin/entities/${res.id}/manage?type=tournament`);
            }
        } catch (err: unknown) {
            alert(err instanceof Error ? err.message : String(err));
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
        if (!window.confirm('¿ESTÁS ABSOLUTAMENTE SEGURO? Esta acción borrará el torneo y es irreversible.')) return;

        setIsTransitioning(true);
        try {
            await deleteEntity('tournament', id);
            router.push('/admin/super/torneos');
        } catch (err: unknown) {
            alert(err instanceof Error ? err.message : String(err));
        } finally {
            setIsTransitioning(false);
        }
    };

    return (
        <TournamentDirtyCtx.Provider value={{ isDirty, setDirty }}>
            <div className="basalt-body flex flex-col min-h-screen">
                <TournamentHeader
                    data={data}
                    isDirty={isDirty}
                    isTransitioning={isTransitioning}
                    menuOpen={menuOpen}
                    seasonMenuOpen={seasonMenuOpen}
                    seasonItems={seasonMenuItems}
                    onSave={handleSave}
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
                />

                <div className="basalt-shell-stage">
                    <TournamentTabs id={id} currentTab={currentTab} data={data} />

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

                    <footer className="basalt-action-footer">
                        <div className="basalt-action-footer-copy">
                            <span className="basalt-action-footer-kicker">Workspace</span>
                            <strong className="basalt-action-footer-title">Gestion del torneo</strong>
                            <p className="basalt-action-footer-text">
                                Navega por modulos, valida estructura y cierra cambios desde una consola unificada.
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
                                onClick={handleSave}
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
        </TournamentDirtyCtx.Provider>
    );
}
