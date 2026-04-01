'use client';

import { useState, useEffect, Suspense, useEffectEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { updateEntity, deleteEntity, createEntity, getClubDashboardData } from '@/app/admin/entities/actions';
import { Database } from '@/lib/database.types';
import { fetchDivisions, type Division } from '@/lib/services/divisionService';
import { ClubContext } from './ClubContext';
import { ClubManageHeader } from './ClubManageHeader';
import { ClubManageTabs } from './ClubManageTabs';
import { ClubManageSidebar } from './ClubManageSidebar';
import { ClubSummaryHero } from './ClubSummaryHero';
import { ClubSquadsCard } from './ClubSquadsCard';
import { ClubNextMatchesCard } from './ClubNextMatchesCard';
import { ClubDataHealthCard } from './ClubDataHealthCard';
import { ClubStandingsCard } from './ClubStandingsCard';
import { ClubIdentityTab } from './ClubIdentityTab';
import { ClubSquadsTab } from './ClubSquadsTab';
import { TabPlaceholder } from './TabPlaceholder';

// Monolithic Basalt CSS integration
import './vitreous-club.css';

type ClubRow = Database['public']['Tables']['clubs']['Row'];

interface DashboardMatch {
    id: string;
    date_time: string;
    status: string;
    venue: string | null;
    home: { name: string; short_name: string; logo_url: string };
    away: { name: string; short_name: string; logo_url: string };
    tournament: { name: string } | null;
}

interface ClubManageShellProps {
    id: string;
    data: ClubRow | null;
    unions: { id: string, name: string }[];
}

function formatSportLabel(sport?: string | null) {
    if (!sport?.trim()) return null;

    return sport
        .trim()
        .replace(/[-_]+/g, ' ')
        .split(/\s+/)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join(' ');
}

function getDivisionDisplayName(division: Division) {
    return division.name?.trim() || division.category?.trim() || 'Sin nombre';
}

export function ClubManageShell({ id, data, unions }: ClubManageShellProps) {
    const isCreate = id === 'new';
    const router = useRouter();
    const searchParams = useSearchParams();
    const currentTab = searchParams.get('tab') || 'resumen';

    const [isDirty, setIsDirty] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [form, setForm] = useState<Partial<ClubRow>>(data || {
        name: '',
        short_name: '',
        slug: '',
        city: '',
        region: '',
        country: 'Argentina',
        union_id: '',
        logo_url: '',
        primary_color: '#3b82f6',
        is_visible: true,
        categories: [],
    });

    const [dashboardData, setDashboardData] = useState<{ matches: DashboardMatch[] }>({ matches: [] });
    const [isLoadingDashboard, setIsLoadingDashboard] = useState(false);
    const [linkedDivisions, setLinkedDivisions] = useState<Division[]>([]);
    const [isLoadingDivisions, setIsLoadingDivisions] = useState(!isCreate);

    useEffect(() => {
        if (isCreate) return;

        const loadDashboard = async () => {
            setIsLoadingDashboard(true);
            try {
                const res = await getClubDashboardData(id);
                setDashboardData(res);
            } catch (err) {
                console.error('Dashboard Load Error:', err);
            } finally {
                setIsLoadingDashboard(false);
            }
        };

        loadDashboard();
    }, [id, isCreate]);

    useEffect(() => {
        let isMounted = true;

        const loadLinkedDivisions = async () => {
            if (isCreate) {
                if (isMounted) {
                    setLinkedDivisions([]);
                    setIsLoadingDivisions(false);
                }
                return;
            }

            if (isMounted) {
                setIsLoadingDivisions(true);
            }

            try {
                const divisions = await fetchDivisions(id);
                if (isMounted) {
                    setLinkedDivisions(divisions);
                }
            } catch (error) {
                console.error('Division load error:', error);
                if (isMounted) {
                    setLinkedDivisions([]);
                }
            } finally {
                if (isMounted) {
                    setIsLoadingDivisions(false);
                }
            }
        };

        void loadLinkedDivisions();

        const refreshDivisions = () => {
            void loadLinkedDivisions();
        };

        window.addEventListener('club:divisions-updated', refreshDivisions);

        return () => {
            isMounted = false;
            window.removeEventListener('club:divisions-updated', refreshDivisions);
        };
    }, [id, isCreate]);

    const unionName = unions.find(u => u.id === form.union_id)?.name;
    const legacyCategories = form.categories || [];
    const divisionFilterOptions = linkedDivisions.length > 0
        ? Array.from(new Set(linkedDivisions.map((division) => getDivisionDisplayName(division))))
        : legacyCategories;
    const linkedSports = Array.from(
        new Set(
            linkedDivisions
                .map((division) => formatSportLabel(division.sport))
                .filter((sport): sport is string => Boolean(sport))
        )
    );
    const primarySportLabel = linkedSports.length > 1
        ? 'Multideporte'
        : linkedSports[0] || (legacyCategories.length > 0 ? 'Rugby' : 'Deporte');
    const squadCount = linkedDivisions.length > 0 ? linkedDivisions.length : legacyCategories.length;

    // Handle form updates via custom events
    useEffect(() => {
        const handler = (event: Event) => {
            const customEvent = event as CustomEvent<Partial<ClubRow>>;
            if (customEvent.detail) {
                setForm(prev => ({ ...prev, ...customEvent.detail }));
                setIsDirty(true);
            }
        };
        window.addEventListener('club:form-update', handler);
        return () => window.removeEventListener('club:form-update', handler);
    }, []);

    const handleSaveShortcut = useEffectEvent(() => {
        void handleSave();
    });

    // Global Shortcuts
    useEffect(() => {
        const handleKeys = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 's') {
                e.preventDefault();
                handleSaveShortcut();
            }
        };
        window.addEventListener('keydown', handleKeys);
        return () => window.removeEventListener('keydown', handleKeys);
    }, []);

    async function handleSave() {
        if (!form.name?.trim()) {
            alert('❌ El nombre del club es obligatorio');
            return;
        }
        setIsSaving(true);
        try {
            if (isCreate) {
                const res = await createEntity('club', form as Record<string, unknown>);
                setIsDirty(false);
                router.push(`/admin/entities/${res.id}/manage?type=club&tab=resumen`);
            } else {
                await updateEntity('club', id, form);
                setIsDirty(false);
                window.dispatchEvent(new CustomEvent('club:save-success'));
                router.refresh();
            }
        } catch (err: unknown) {
            console.error('Save error:', err);
            alert('Error al guardar: ' + (err instanceof Error ? err.message : String(err)));
        } finally {
            setIsSaving(false);
        }
    }

    const handleDelete = async () => {
        if (!window.confirm('¿ELIMINAR ESTE CLUB? Esta acción es irreversible.')) return;
        setIsSaving(true);
        try {
            await deleteEntity('club', id);
            router.push('/admin/super/clubes');
        } catch (err: unknown) {
            alert(err instanceof Error ? err.message : String(err));
            setIsSaving(false);
        }
    };

    // Diagnostics
    const diagnostics = {
        hasName: !!form.name,
        hasSlug: !!form.slug,
        hasCountry: !!form.country,
        hasLogo: !!form.logo_url,
        hasUnion: !!form.union_id,
    };

    const completeness = Object.values(diagnostics).filter(Boolean).length / 5 * 100;

    return (
        <ClubContext.Provider value={{ isDirty, setDirty: setIsDirty }}>
            <div className="flash-ui-container dark" style={{ '--accent': form.primary_color || '#3b82f6' } as React.CSSProperties}>
                <div className="app-container">

                    {/* Main Panel */}
                    <main>
                        <ClubManageHeader
                            id={id}
                            data={form}
                            sportLabel={primarySportLabel}
                            isDirty={isDirty}
                            isSaving={isSaving}
                            onSave={handleSave}
                            unionName={unionName}
                        />

                        <Suspense fallback={<div className="h-14" />}>
                            <ClubManageTabs
                                id={id}
                                currentTab={currentTab}
                                squadCount={squadCount}
                            />
                        </Suspense>

                        <div className="content-area">
                            {currentTab === 'resumen' && (
                                <>
                                    <div className="card col-12">
                                        <ClubSummaryHero data={form} unionName={unionName} sportLabel={primarySportLabel} />
                                    </div>

                                    <div className="card col-8">
                                        <ClubSquadsCard
                                            divisions={linkedDivisions}
                                            fallbackCategories={legacyCategories}
                                            loading={isLoadingDivisions}
                                        />
                                    </div>
                                    <div className="card col-4">
                                        <ClubDataHealthCard diagnostics={diagnostics} />
                                    </div>

                                    <div className="card col-8">
                                        <ClubNextMatchesCard
                                            categories={divisionFilterOptions}
                                            matches={dashboardData.matches}
                                            loading={isLoadingDashboard}
                                        />
                                    </div>
                                    <div className="card col-4">
                                        <ClubStandingsCard
                                            clubId={id}
                                            tournamentName={dashboardData.matches[0]?.tournament?.name}
                                            loading={isLoadingDashboard}
                                        />
                                    </div>
                                </>
                            )}

                            {currentTab === 'identidad' && (
                                <div className="card col-12">
                                    <ClubIdentityTab id={id} data={form as ClubRow} unions={unions} />
                                </div>
                            )}

                            {currentTab === 'planteles' && (
                                <div className="col-12">
                                    <ClubSquadsTab id={id} data={form as ClubRow} />
                                </div>
                            )}

                            {currentTab === 'staff' && (
                                <div className="card col-12">
                                    <div className="card-header">
                                        <div className="card-title">Directiva y Cuerpo Técnico</div>
                                        <button className="btn btn-primary">+ Vincular Miembro</button>
                                    </div>
                                    <table className="data-table">
                                        <thead>
                                            <tr>
                                                <th>Profesional</th>
                                                <th>Rol / Cargo</th>
                                                <th>Vinculación</th>
                                                <th style={{ textAlign: 'right' }}>Acciones</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <tr>
                                                <td colSpan={4} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                                                    No hay staff asociado a este club actualmente.
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {currentTab === 'competencias' && (
                                <div className="card col-12">
                                    <div className="card-header">
                                        <div className="card-title">Competencias Activas e Históricas</div>
                                        <button className="btn">Inscribir en Torneo</button>
                                    </div>
                                    <table className="data-table">
                                        <thead>
                                            <tr>
                                                <th>Torneo / Campeonato</th>
                                                <th>Categorías Anotadas</th>
                                                <th>Estado</th>
                                                <th style={{ textAlign: 'right' }}>Ver Detalles</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <tr>
                                                <td colSpan={4} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                                                    El club no ha sido inscrito en ninguna competencia.
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {currentTab === 'partidos' && (
                                <div className="card col-12">
                                    <div className="card-header">
                                        <div className="card-title">Fixture Global de Partidos</div>
                                        <button className="btn">Filtrar por Temporada</button>
                                    </div>
                                    <table className="data-table">
                                        <thead>
                                            <tr>
                                                <th>Fecha y Torneo</th>
                                                <th>Local</th>
                                                <th>Visitante</th>
                                                <th style={{ textAlign: 'right' }}>Resultado</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <tr>
                                                <td colSpan={4} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                                                    Sin partidos programados en el sistema general.
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {currentTab === 'medios' && (
                                <div className="card col-12">
                                    <div className="card-header">
                                        <div className="card-title">Galería Institucional (Medios)</div>
                                        <button className="btn btn-primary">+ Subir Archivo</button>
                                    </div>
                                    <div style={{ padding: '4rem', textAlign: 'center', border: '1px dashed var(--border)', borderRadius: '8px', color: 'var(--text-muted)' }}>
                                        No hay recursos multimedia cargados.
                                    </div>
                                </div>
                            )}

                            {['posiciones', 'estadisticas', 'relacionados', 'auditoria'].includes(currentTab) && (
                                <div className="card col-12">
                                    <TabPlaceholder name={currentTab} />
                                </div>
                            )}
                        </div>
                    </main>

                    {/* Right Sidebar */}
                    <aside className="sidebar hidden lg:flex">
                        <ClubManageSidebar
                            onDelete={handleDelete}
                            completeness={completeness}
                            diagnostics={diagnostics}
                        />
                    </aside>
                </div>
            </div>
        </ClubContext.Provider>
    );
}
