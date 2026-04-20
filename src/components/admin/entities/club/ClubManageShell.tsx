'use client';

import { useState, useEffect, Suspense, useEffectEvent, type CSSProperties } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Database } from '@/lib/database.types';
import { fetchDivisions, type Division } from '@/lib/services/divisionService';
import { ClubContext } from './ClubContext';
import { ClubContentStudioTab } from './ClubContentStudioTab';
import { ClubDataHealthCard } from './ClubDataHealthCard';
import { ClubFixtureResultsTab } from './ClubFixtureResultsTab';
import { ClubIdentityTab } from './ClubIdentityTab';
import { ClubManageHeader } from './ClubManageHeader';
import { ClubManageSidebar } from './ClubManageSidebar';
import { ClubManageTabs } from './ClubManageTabs';
import { ClubNextMatchesCard } from './ClubNextMatchesCard';
import { ClubRelatedClubsTab } from './ClubRelatedClubsTab';
import { ClubSponsorsTab } from './ClubSponsorsTab';
import { ClubSquadsCard } from './ClubSquadsCard';
import { ClubSquadsTab } from './ClubSquadsTab';
import { ClubStaffTab } from './ClubStaffTab';
import { ClubStandingsCard } from './ClubStandingsCard';
import { ClubStandingsOverviewTab } from './ClubStandingsOverviewTab';
import { ClubSummaryHero } from './ClubSummaryHero';
import type { ClubDashboardMatch, ClubDashboardOverview, ClubDashboardStanding } from '@/lib/club-admin/dashboard-types';
import { EMPTY_CLUB_DASHBOARD_OVERVIEW } from '@/lib/club-admin/dashboard-types';
import type { ManagedClubSummary } from '@/lib/club-admin/managedClubFamily';

import './vitreous-club.css';

type ClubRow = Database['public']['Tables']['clubs']['Row'];
type ClubFormState = Partial<ClubRow> & { sport?: string | null };

interface ClubManageShellProps {
    id: string;
    data: ClubRow | null;
    unions: { id: string; name: string }[];
    managedClubs: ManagedClubSummary[];
}

interface ClubRelatedClub {
    id: string;
    name: string;
    shortName: string | null;
    logoUrl: string | null;
    sport: string | null;
    familyRootId: string;
    parentClubId: string | null;
    parentClubName: string | null;
    isRoot: boolean;
    isCurrent: boolean;
}

interface ClubRelatedData {
    rootClubId: string;
    rootClubName: string | null;
    clubs: ClubRelatedClub[];
}

async function readJsonOrThrow<T>(response: Response): Promise<T> {
    const payload = await response.json() as T & { error?: string };
    if (!response.ok) {
        throw new Error(
            typeof payload === 'object' && payload && 'error' in payload && typeof payload.error === 'string'
                ? payload.error
                : 'Request failed'
        );
    }

    return payload;
}

async function fetchClubDashboardData(clubId: string): Promise<ClubDashboardOverview> {
    try {
        const response = await fetch(`/api/club-admin/dashboard?club=${encodeURIComponent(clubId)}`, {
            credentials: 'same-origin',
            cache: 'no-store',
        });
        const payload = await readJsonOrThrow<{ ok?: boolean; data?: ClubDashboardOverview; error?: string }>(response);
        return payload.data ?? EMPTY_CLUB_DASHBOARD_OVERVIEW;
    } catch (error) {
        console.error('Club dashboard request failed:', error);
        return EMPTY_CLUB_DASHBOARD_OVERVIEW;
    }
}

async function fetchClubRelatedData(clubId: string): Promise<ClubRelatedData> {
    const response = await fetch(`/api/clubs/${encodeURIComponent(clubId)}/family`, {
        credentials: 'same-origin',
        cache: 'no-store',
    });
    const payload = await readJsonOrThrow<{ data?: ClubRelatedData; error?: string }>(response);
    return payload.data ?? { rootClubId: clubId, rootClubName: null, clubs: [] };
}

async function createClubEntity(form: ClubFormState): Promise<{ id: string }> {
    const response = await fetch('/api/clubs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
            name: form.name,
            slug: form.slug,
            sport: form.sport,
            union_id: form.union_id,
        }),
    });
    const payload = await readJsonOrThrow<{ data?: { id: string }; error?: string }>(response);

    if (!payload.data?.id) {
        throw new Error('No se pudo crear el club');
    }

    return { id: payload.data.id };
}

async function deleteClubEntity(clubId: string): Promise<void> {
    const response = await fetch(`/api/clubs/${encodeURIComponent(clubId)}`, {
        method: 'DELETE',
        credentials: 'same-origin',
    });
    await readJsonOrThrow<{ success?: boolean; error?: string }>(response);
}

const CLUB_MANAGE_ALLOWED_TABS = new Set([
    'general',
    'equipos',
    'planteles',
    'competencias',
    'partidos',
    'contenido',
    'sponsors',
    'configuracion',
]);

const CLUB_MANAGE_TAB_ALIASES: Record<string, string> = {
    resumen: 'general',
    fixture: 'partidos',
    posiciones: 'competencias',
    relacionados: 'equipos',
    identidad: 'configuracion',
    staff: 'configuracion',
    medios: 'contenido',
    estadisticas: 'general',
    auditoria: 'configuracion',
};

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

export function ClubManageShell({ id, data, unions, managedClubs }: ClubManageShellProps) {
    const isCreate = id === 'new';
    const router = useRouter();
    const searchParams = useSearchParams();
    const requestedTab = searchParams.get('tab') || 'general';
    const normalizedRequestedTab = CLUB_MANAGE_TAB_ALIASES[requestedTab] || requestedTab;
    const currentTab = CLUB_MANAGE_ALLOWED_TABS.has(normalizedRequestedTab) ? normalizedRequestedTab : 'general';

    const [isDirty, setIsDirty] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [form, setForm] = useState<ClubFormState>(data || {
        name: '',
        short_name: '',
        slug: '',
        city: '',
        region: '',
        country: 'Argentina',
        sport: null,
        union_id: '',
        logo_url: '',
        primary_color: '#3b82f6',
        is_visible: true,
        categories: [],
    });

    const [dashboardData, setDashboardData] = useState<ClubDashboardOverview>(EMPTY_CLUB_DASHBOARD_OVERVIEW);
    const [isLoadingDashboard, setIsLoadingDashboard] = useState(false);
    const [relatedData, setRelatedData] = useState<ClubRelatedData>({
        rootClubId: id,
        rootClubName: null,
        clubs: [],
    });
    const [isLoadingRelated, setIsLoadingRelated] = useState(false);
    const [linkedDivisions, setLinkedDivisions] = useState<Division[]>([]);
    const [isLoadingDivisions, setIsLoadingDivisions] = useState(!isCreate);

    useEffect(() => {
        if (isCreate) return;

        const loadDashboard = async () => {
            setIsLoadingDashboard(true);
            try {
                const response = await fetchClubDashboardData(id);
                setDashboardData(response);
            } catch (error) {
                console.error('Dashboard load error:', error);
            } finally {
                setIsLoadingDashboard(false);
            }
        };

        void loadDashboard();
    }, [id, isCreate]);

    useEffect(() => {
        if (isCreate) return;

        const loadRelated = async () => {
            setIsLoadingRelated(true);
            try {
                const response = await fetchClubRelatedData(id);
                setRelatedData(response);
            } catch (error) {
                console.error('Related clubs load error:', error);
                setRelatedData({
                    rootClubId: id,
                    rootClubName: null,
                    clubs: [],
                });
            } finally {
                setIsLoadingRelated(false);
            }
        };

        void loadRelated();
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

    const unionName = unions.find((union) => union.id === form.union_id)?.name;
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
    const configuredSportLabel = formatSportLabel(form.sport);
    const primarySportLabel = linkedSports.length > 1
        ? 'Multideporte'
        : linkedSports[0] || configuredSportLabel || (legacyCategories.length > 0 ? 'Rugby' : 'Deporte');
    const squadCount = linkedDivisions.length > 0 ? linkedDivisions.length : legacyCategories.length;
    const competitionCount = Array.from(
        new Set(
            dashboardData.standings
                .map((standing) => standing.tournamentId)
                .filter(Boolean)
        )
    ).length;

    const summaryMetrics = {
        teams: squadCount,
        upcomingMatches: dashboardData.upcomingMatches.length,
        competitions: competitionCount,
        standings: dashboardData.standings.length,
    };
    const currentManagedClub = managedClubs.find((club) => club.id === id) ?? null;
    const clubFamilyCount = currentManagedClub
        ? managedClubs.filter((club) => club.familyRootId === currentManagedClub.familyRootId).length
        : managedClubs.length;
    const upcomingMatch = dashboardData.upcomingMatches[0] ?? null;

    useEffect(() => {
        const handler = (event: Event) => {
            const customEvent = event as CustomEvent<Partial<ClubRow>>;
            if (customEvent.detail) {
                setForm((current) => ({ ...current, ...customEvent.detail }));
                setIsDirty(true);
            }
        };

        window.addEventListener('club:form-update', handler);
        return () => window.removeEventListener('club:form-update', handler);
    }, []);

    const handleSaveShortcut = useEffectEvent(() => {
        void handleSave();
    });

    useEffect(() => {
        const handleKeys = (event: KeyboardEvent) => {
            if ((event.metaKey || event.ctrlKey) && event.key === 's') {
                event.preventDefault();
                handleSaveShortcut();
            }
        };

        window.addEventListener('keydown', handleKeys);
        return () => window.removeEventListener('keydown', handleKeys);
    }, []);

    async function handleSave() {
        if (!form.name?.trim()) {
            alert('El nombre del club es obligatorio');
            return;
        }

        setIsSaving(true);
        try {
            if (isCreate) {
                const response = await createClubEntity(form);
                setIsDirty(false);
                router.push(`/admin/entities/${response.id}/manage?type=club&tab=general`);
                return;
            }

            const response = await fetch(`/api/clubs/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify(form),
            });
            const payload = await response.json() as { data?: ClubRow; error?: string };

            if (!response.ok || !payload.data) {
                throw new Error(payload.error || 'No se pudo guardar el club');
            }

            setForm(payload.data);
            setIsDirty(false);
            window.dispatchEvent(new CustomEvent('club:save-success'));
            router.refresh();
        } catch (error) {
            console.error('Save error:', error);
            alert(`Error al guardar: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            setIsSaving(false);
        }
    }

    const handleDelete = async () => {
        if (!window.confirm('Eliminar este club es irreversible. Continuar?')) return;

        setIsSaving(true);
        try {
            await deleteClubEntity(id);
            router.push('/admin/super/clubes');
        } catch (error) {
            alert(error instanceof Error ? error.message : String(error));
            setIsSaving(false);
        }
    };

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
            <div
                className="flash-ui-container"
                style={{
                    '--accent': '#3b82f6',
                    '--accent-secondary': '#3b82f6',
                    '--accent-tertiary': '#f43f5e',
                    '--club-primary': form.primary_color || '#3b82f6',
                } as CSSProperties}
            >
                <div className="club-admin-shell">
                    <aside className="club-admin-nav">
                        <Suspense fallback={<div className="club-nav-skeleton" />}>
                            <ClubManageTabs
                                currentTab={currentTab}
                                squadCount={squadCount}
                                managedClubs={managedClubs}
                                currentClubId={id}
                                primarySportLabel={primarySportLabel}
                                familyClubCount={clubFamilyCount}
                            />
                        </Suspense>
                    </aside>

                    <main className="club-admin-main">
                        <ClubManageHeader
                            id={id}
                            data={form}
                            sportLabel={primarySportLabel}
                            isDirty={isDirty}
                            isSaving={isSaving}
                            onSave={handleSave}
                            unionName={unionName}
                            managedClubs={managedClubs}
                            currentClubId={id}
                            familyClubCount={clubFamilyCount}
                        />

                        <div className="club-main-grid">
                            <section className="club-workspace">
                                <div className="content-area">
                                    {currentTab === 'general' ? (
                                        <>
                                            <div className="card col-12">
                                                <ClubSummaryHero
                                                    data={form}
                                                    unionName={unionName}
                                                    sportLabel={primarySportLabel}
                                                    metrics={summaryMetrics}
                                                />
                                            </div>

                                            <div className="card col-7">
                                                <ClubSquadsCard
                                                    divisions={linkedDivisions}
                                                    fallbackCategories={legacyCategories}
                                                    loading={isLoadingDivisions}
                                                />
                                            </div>

                                            <div className="card col-5">
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
                                                    tournamentName={dashboardData.standings[0]?.tournamentName}
                                                    standings={dashboardData.standings.map((standing) => ({
                                                        pos: standing.position ?? 0,
                                                        label: standing.tournamentName,
                                                        row_id: `${standing.tournamentId}-${standing.phaseId || 'base'}-${standing.groupId || 'all'}`,
                                                        pj: standing.played,
                                                        pts: standing.points,
                                                    }))}
                                                    loading={isLoadingDashboard}
                                                />
                                            </div>

                                            <div className="card col-12 club-surface-band">
                                                <div className="club-surface-band-copy">
                                                    <span className="club-ui-pill">Sistema operativo del club</span>
                                                    <h3>La operacion del club vive en un solo tablero.</h3>
                                                    <p>
                                                        Identidad, planteles, competencias, partidos y contenidos quedan alineados
                                                        para que un admin de club o familia trabaje con criterio operativo, no con pantallas sueltas.
                                                    </p>
                                                </div>
                                                <div className="club-surface-band-metrics">
                                                    <div>
                                                        <strong>{summaryMetrics.teams}</strong>
                                                        <span>equipos</span>
                                                    </div>
                                                    <div>
                                                        <strong>{summaryMetrics.upcomingMatches}</strong>
                                                        <span>partidos</span>
                                                    </div>
                                                    <div>
                                                        <strong>{summaryMetrics.competitions}</strong>
                                                        <span>torneos</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </>
                                    ) : null}

                                    {currentTab === 'equipos' ? (
                                        <>
                                            <div className="card col-7">
                                                <ClubSquadsCard
                                                    divisions={linkedDivisions}
                                                    fallbackCategories={legacyCategories}
                                                    loading={isLoadingDivisions}
                                                />
                                            </div>

                                            <div className="card col-5">
                                                <div className="club-tab-stack">
                                                    <div className="card-title">Estructura deportiva</div>
                                                    <h3 className="club-tab-heading">Equipos, relaciones y alcance</h3>
                                                    <p className="club-tab-copy">
                                                        Primera, intermedia, juveniles y familia de club deben convivir en una estructura clara,
                                                        editable y lista para operar sin recargar toda la app.
                                                    </p>
                                                    <div className="club-inline-metrics">
                                                        <div><strong>{summaryMetrics.teams}</strong><span>equipos</span></div>
                                                        <div><strong>{relatedData.clubs.length}</strong><span>clubes vinculados</span></div>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="card col-12">
                                                <ClubRelatedClubsTab
                                                    clubs={relatedData.clubs}
                                                    rootClubName={relatedData.rootClubName}
                                                    loading={isLoadingRelated}
                                                />
                                            </div>
                                        </>
                                    ) : null}

                                    {currentTab === 'planteles' ? (
                                        <div className="col-12">
                                            <ClubSquadsTab id={id} data={form as ClubRow} />
                                        </div>
                                    ) : null}

                                    {currentTab === 'competencias' ? (
                                        <>
                                            <div className="card col-8">
                                                <ClubStandingsOverviewTab
                                                    standings={dashboardData.standings}
                                                    loading={isLoadingDashboard}
                                                />
                                            </div>

                                            <div className="card col-4">
                                                <div className="club-tab-stack">
                                                    <div className="card-title">Participacion competitiva</div>
                                                    <h3 className="club-tab-heading">Torneos activos e historicos</h3>
                                                    <p className="club-tab-copy">
                                                        Conecta cada equipo con sus torneos y sostiene standings, fixture, contenido y analitica.
                                                    </p>
                                                    <div className="club-inline-metrics">
                                                        <div><strong>{summaryMetrics.competitions}</strong><span>torneos</span></div>
                                                        <div><strong>{dashboardData.standings.length}</strong><span>filas activas</span></div>
                                                    </div>
                                                    <button className="btn club-ops-secondary">Vincular a torneo</button>
                                                </div>
                                            </div>
                                        </>
                                    ) : null}

                                    {currentTab === 'partidos' ? (
                                        <>
                                            <div className="card col-8">
                                                <ClubFixtureResultsTab
                                                    upcomingMatches={dashboardData.upcomingMatches}
                                                    recentMatches={dashboardData.recentMatches}
                                                    loading={isLoadingDashboard}
                                                />
                                            </div>

                                            <div className="card col-4">
                                                <div className="club-tab-stack">
                                                    <div className="card-title">Operacion de partidos</div>
                                                    <h3 className="club-tab-heading">Horario, sede, live y resultado</h3>
                                                    <p className="club-tab-copy">
                                                        Este modulo diferencia a G22 de una web de resultados: el club opera el partido,
                                                        no solo lo ve.
                                                    </p>
                                                    <div className="content-ops-list compact">
                                                        <div className="content-ops-item">
                                                            <span className="club-status-dot live" />
                                                            <div>
                                                                <strong>Live control</strong>
                                                                <span>Activa cobertura y eventos en tiempo real.</span>
                                                            </div>
                                                        </div>
                                                        <div className="content-ops-item">
                                                            <span className="club-status-dot" />
                                                            <div>
                                                                <strong>Resultado final</strong>
                                                                <span>Cierra score y dispara piezas automaticas.</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </>
                                    ) : null}

                                    {currentTab === 'contenido' ? (
                                        <div className="col-12">
                                            <ClubContentStudioTab
                                                data={form}
                                                upcomingMatches={dashboardData.upcomingMatches}
                                                standings={dashboardData.standings}
                                            />
                                        </div>
                                    ) : null}

                                    {currentTab === 'sponsors' ? (
                                        <div className="col-12">
                                            <ClubSponsorsTab clubId={id} />
                                        </div>
                                    ) : null}

                                    {currentTab === 'configuracion' ? (
                                        <>
                                            <div className="card col-12">
                                                <ClubIdentityTab id={id} data={form as ClubRow} unions={unions} />
                                            </div>

                                            <div className="card col-8">
                                                <ClubStaffTab clubId={id} />
                                            </div>

                                            <div className="card col-4">
                                                <div className="club-tab-stack">
                                                    <div className="card-title">Permisos y roles</div>
                                                    <h3 className="club-tab-heading">Accesos para escalar sin caos</h3>
                                                    <p className="club-tab-copy">
                                                        Admin del club, editor y operador trabajan sobre el mismo sistema con responsabilidades separadas.
                                                    </p>
                                                    <div className="club-role-list">
                                                        <div><strong>Administrador</strong><span>Identidad, equipos, sponsors y publicacion.</span></div>
                                                        <div><strong>Editor</strong><span>Planteles, contenido y ajustes de partido.</span></div>
                                                        <div><strong>Operador</strong><span>Resultado, live y validaciones de campo.</span></div>
                                                    </div>
                                                </div>
                                            </div>
                                        </>
                                    ) : null}
                                </div>
                            </section>

                            <aside className="club-context-shell">
                                <ClubManageSidebar
                                    onDelete={handleDelete}
                                    completeness={completeness}
                                    metrics={{
                                        teams: summaryMetrics.teams,
                                        upcomingMatches: summaryMetrics.upcomingMatches,
                                        competitions: summaryMetrics.competitions,
                                    }}
                                    diagnostics={diagnostics}
                                    clubName={form.name || currentManagedClub?.name || 'Club'}
                                    clubShortName={form.short_name || currentManagedClub?.shortName || null}
                                    primaryColor={form.primary_color || '#3b82f6'}
                                    nextMatchLabel={upcomingMatch?.opponentShortName || upcomingMatch?.opponentName || null}
                                />
                            </aside>
                        </div>
                    </main>
                </div>
            </div>
        </ClubContext.Provider>
    );
}
