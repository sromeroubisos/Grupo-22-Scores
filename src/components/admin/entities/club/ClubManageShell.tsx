'use client';

import { useState, useEffect, Suspense, useEffectEvent, type CSSProperties } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Database } from '@/lib/database.types';
import {
    getClubDashboardModeForTab,
    normalizeClubManageTab,
    shouldLoadClubDashboardForTab,
    shouldLoadClubDivisionsForTab,
} from '@/lib/club-admin/manageTabs';
import type { ClubSponsorItem } from '@/lib/club-admin/sponsors';
import type { PersonWithRole } from '@/lib/services/personService';
import { fetchDivisions, type Division } from '@/lib/services/divisionService';
import type { ClubFull, ClubUpdateInput, ClubValidationError } from '@/lib/types/clubs';
import { ClubContext } from './ClubContext';
import { ClubContentStudioTab } from './ClubContentStudioTab';
import { ClubCompetitionsPanel } from './ClubCompetitionsPanel';
import { ClubPerformanceTab } from './ClubPerformanceTab';
import { ClubPizarraTab } from './ClubPizarraTab';
import { ClubEntrenamientosTab } from './ClubEntrenamientosTab';
import { ClubDataHealthCard } from './ClubDataHealthCard';
import { ClubFixtureResultsTab } from './ClubFixtureResultsTab';
import { ClubIdentityTab } from './ClubIdentityTab';
import { ClubManageHeader } from './ClubManageHeader';
import { ClubManageTabs } from './ClubManageTabs';
import { ClubNextMatchesCard } from './ClubNextMatchesCard';
import { ClubSponsorsTab } from './ClubSponsorsTab';
import { ClubSquadsCard } from './ClubSquadsCard';
import { ClubSquadsTab } from './ClubSquadsTab';
import { ClubStaffTab } from './ClubStaffTab';
import { ClubStandingsCard } from './ClubStandingsCard';
import { ClubSummaryHero } from './ClubSummaryHero';
import type { ClubDashboardMode, ClubDashboardOverview } from '@/lib/club-admin/dashboard-types';
import { EMPTY_CLUB_DASHBOARD_OVERVIEW } from '@/lib/club-admin/dashboard-types';
import type { ManagedClubSummary } from '@/lib/club-admin/managedClubFamily';
import { buildClubManageHref, type ClubConsoleMode } from '@/lib/clubAdminRoutes';

import './vitreous-club.css';

type ClubRow = Database['public']['Tables']['clubs']['Row'];
type ClubFormState = Partial<ClubRow> & { sport?: string | null };

interface ManageClubRouteResponse {
    data?: ClubFull;
    error?: string;
    details?: unknown;
}

interface ClubManageShellProps {
    id: string;
    data: ClubRow | null;
    unions: { id: string; name: string }[];
    managedClubs: ManagedClubSummary[];
    navigationMode?: ClubConsoleMode;
    initialDashboardData?: ClubDashboardOverview | null;
    initialDashboardLoaded?: boolean;
    initialDashboardRequested?: boolean;
    initialLinkedDivisions?: Division[];
    initialDivisionsLoaded?: boolean;
    initialDivisionsRequested?: boolean;
    initialPlayers?: PersonWithRole[];
    initialPlayersLoaded?: boolean;
    initialStaff?: PersonWithRole[];
    initialStaffLoaded?: boolean;
    initialSponsors?: ClubSponsorItem[];
    initialSponsorsLoaded?: boolean;
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

async function fetchClubDashboardData(clubId: string, mode: ClubDashboardMode): Promise<ClubDashboardOverview> {
    try {
        const params = new URLSearchParams({
            club: clubId,
            mode,
        });
        const response = await fetch(`/api/club-admin/dashboard?${params.toString()}`, {
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

function formatSportLabel(sport?: string | null) {
    if (!sport?.trim()) return null;

    return sport
        .trim()
        .replace(/[-_]+/g, ' ')
        .split(/\s+/)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join(' ');
}

function filterVisibleDivisions(divisions?: Division[]) {
    return (divisions ?? []).filter((division) => !division.is_family_division);
}

function normalizeNullableText(value: unknown) {
    if (typeof value !== 'string') {
        return value == null ? null : String(value);
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function buildClubManagePayload(form: ClubFormState): ClubUpdateInput {
    return {
        core: {
            name: typeof form.name === 'string' ? form.name : '',
            short_name: normalizeNullableText(form.short_name) as string | null,
            slug: typeof form.slug === 'string' ? form.slug : '',
            sport: typeof form.sport === 'string' ? form.sport : '',
            country: typeof form.country === 'string' ? form.country : '',
            region: normalizeNullableText(form.region) as string | null,
            city: normalizeNullableText(form.city) as string | null,
            union_id: normalizeNullableText(form.union_id) as string | null,
            logo_url: normalizeNullableText(form.logo_url) as string | null,
            primary_color: normalizeNullableText(form.primary_color) as string | null,
            visibility: form.is_visible === false ? 'hidden' : 'visible',
        },
    };
}

function buildSaveErrorMessage(payload: ManageClubRouteResponse | null | undefined) {
    const details = payload?.details;
    if (Array.isArray(details)) {
        const validationMessages = details
            .map((detail) => {
                if (!detail || typeof detail !== 'object') {
                    return null;
                }

                const entry = detail as Partial<ClubValidationError>;
                if (typeof entry.message !== 'string') {
                    return null;
                }

                return typeof entry.field === 'string'
                    ? `${entry.field}: ${entry.message}`
                    : entry.message;
            })
            .filter((value): value is string => Boolean(value));

        if (validationMessages.length > 0) {
            return validationMessages.join('\n');
        }
    }

    if (typeof payload?.error === 'string' && payload.error.trim()) {
        return payload.error;
    }

    if (typeof details === 'string' && details.trim()) {
        return details;
    }

    return 'No se pudo guardar el club';
}

function createInitialClubForm(data: ClubRow | null): ClubFormState {
    if (data) {
        return data;
    }

    return {
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
    };
}

export function ClubManageShell({
    id,
    data,
    unions,
    managedClubs,
    navigationMode = 'admin',
    initialDashboardData = null,
    initialDashboardLoaded = false,
    initialDashboardRequested = false,
    initialLinkedDivisions,
    initialDivisionsLoaded = false,
    initialDivisionsRequested = false,
    initialPlayers,
    initialPlayersLoaded = false,
    initialStaff,
    initialStaffLoaded = false,
    initialSponsors,
    initialSponsorsLoaded = false,
}: ClubManageShellProps) {
    const isCreate = id === 'new';
    const router = useRouter();
    const searchParams = useSearchParams();
    const currentTab = normalizeClubManageTab(searchParams.get('tab'));
    const isPizarraFocus = currentTab === 'pizarra';
    const shouldUseDashboard = shouldLoadClubDashboardForTab(currentTab);
    const shouldUseDivisions = shouldLoadClubDivisionsForTab(currentTab);
    const dashboardMode = getClubDashboardModeForTab(currentTab);

    const [isDirty, setIsDirty] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [form, setForm] = useState<ClubFormState>(createInitialClubForm(data));

    const [dashboardData, setDashboardData] = useState<ClubDashboardOverview>(
        initialDashboardLoaded && initialDashboardRequested ? (initialDashboardData ?? EMPTY_CLUB_DASHBOARD_OVERVIEW) : EMPTY_CLUB_DASHBOARD_OVERVIEW
    );
    const [isLoadingDashboard, setIsLoadingDashboard] = useState(!isCreate && shouldUseDashboard && !initialDashboardLoaded);
    const [linkedDivisions, setLinkedDivisions] = useState<Division[]>(filterVisibleDivisions(initialLinkedDivisions));
    const [isLoadingDivisions, setIsLoadingDivisions] = useState(!isCreate && shouldUseDivisions && !initialDivisionsLoaded);

    useEffect(() => {
        setForm(createInitialClubForm(data));
        setIsDirty(false);
    }, [data, id]);

    useEffect(() => {
        if (isCreate || !shouldUseDashboard) {
            setDashboardData(EMPTY_CLUB_DASHBOARD_OVERVIEW);
            setIsLoadingDashboard(false);
            return;
        }

        setDashboardData(initialDashboardLoaded && initialDashboardRequested ? (initialDashboardData ?? EMPTY_CLUB_DASHBOARD_OVERVIEW) : EMPTY_CLUB_DASHBOARD_OVERVIEW);
        setIsLoadingDashboard(!(initialDashboardLoaded && initialDashboardRequested));
    }, [id, initialDashboardData, initialDashboardLoaded, initialDashboardRequested, isCreate, shouldUseDashboard]);

    useEffect(() => {
        if (isCreate || !shouldUseDashboard || (initialDashboardLoaded && initialDashboardRequested)) return;

        let isMounted = true;

        const loadDashboard = async () => {
            if (isMounted) {
                setIsLoadingDashboard(true);
            }
            try {
                const response = await fetchClubDashboardData(id, dashboardMode);
                if (isMounted) {
                    setDashboardData(response);
                }
            } catch (error) {
                console.error('Dashboard load error:', error);
            } finally {
                if (isMounted) {
                    setIsLoadingDashboard(false);
                }
            }
        };

        void loadDashboard();
        return () => {
            isMounted = false;
        };
    }, [dashboardMode, id, initialDashboardLoaded, initialDashboardRequested, isCreate, shouldUseDashboard]);

    useEffect(() => {
        if (isCreate || !shouldUseDivisions) {
            setLinkedDivisions([]);
            setIsLoadingDivisions(false);
            return;
        }

        setLinkedDivisions(initialDivisionsLoaded && initialDivisionsRequested ? filterVisibleDivisions(initialLinkedDivisions) : []);
        setIsLoadingDivisions(!(initialDivisionsLoaded && initialDivisionsRequested));
    }, [id, initialDivisionsLoaded, initialDivisionsRequested, initialLinkedDivisions, isCreate, shouldUseDivisions]);

    useEffect(() => {
        let isMounted = true;

        const loadLinkedDivisions = async (force = false) => {
            if (isCreate || !shouldUseDivisions) {
                if (isMounted) {
                    setLinkedDivisions([]);
                    setIsLoadingDivisions(false);
                }
                return;
            }

            if (!force && initialDivisionsLoaded && initialDivisionsRequested) {
                return;
            }

            if (isMounted) {
                setIsLoadingDivisions(true);
            }

            try {
                const divisions = await fetchDivisions(id);
                if (isMounted) {
                    setLinkedDivisions(divisions.filter((division) => !division.is_family_division));
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

        if (!(initialDivisionsLoaded && initialDivisionsRequested)) {
            void loadLinkedDivisions();
        }

        const refreshDivisions = () => {
            void loadLinkedDivisions(true);
        };

        window.addEventListener('club:divisions-updated', refreshDivisions);
        return () => {
            isMounted = false;
            window.removeEventListener('club:divisions-updated', refreshDivisions);
        };
    }, [id, initialDivisionsLoaded, initialDivisionsRequested, isCreate, shouldUseDivisions]);

    const unionName = unions.find((union) => union.id === form.union_id)?.name;
    const legacyCategories = form.categories || [];
    const divisionFilterOptions = linkedDivisions.length > 0
        ? Array.from(new Set(linkedDivisions.map((division) => division.name?.trim() || division.category?.trim() || 'Sin nombre')))
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
    const competitionCount = dashboardData.competitions.length;

    const summaryMetrics = {
        teams: squadCount,
        upcomingMatches: dashboardData.stats.upcomingMatches,
        competitions: dashboardData.stats.tournaments || competitionCount,
        standings: dashboardData.standings.length,
    };
    const currentManagedClub = managedClubs.find((club) => club.id === id) ?? null;
    const clubFamilyCount = currentManagedClub
        ? managedClubs.filter((club) => club.familyRootId === currentManagedClub.familyRootId).length
        : managedClubs.length;
    const pizarraBackHref = buildClubManageHref(id, 'general', navigationMode);

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
                router.push(buildClubManageHref(response.id, 'general', navigationMode));
                return;
            }

            const response = await fetch(`/api/clubs/${id}/manage`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify(buildClubManagePayload(form)),
            });
            const payload = await response.json() as ManageClubRouteResponse;

            if (!response.ok || !payload.data?.core) {
                throw new Error(buildSaveErrorMessage(payload));
            }

            setForm(payload.data.core as ClubRow);
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

    return (
        <ClubContext.Provider value={{ isDirty, setDirty: setIsDirty }}>
            <div
                className={`flash-ui-container${isPizarraFocus ? ' is-pizarra-focus' : ''}`}
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
                                                <ClubDataHealthCard health={dashboardData.health} />
                                            </div>

                                            <div className="card col-8">
                                                <ClubNextMatchesCard
                                                    categories={divisionFilterOptions}
                                                    matches={dashboardData.upcomingMatches}
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
                                        <div className="card col-12">
                                            <ClubIdentityTab id={id} data={form as ClubRow} unions={unions} />
                                        </div>
                                    ) : null}

                                    {currentTab === 'planteles' ? (
                                        <div className="col-12">
                                            <ClubSquadsTab
                                                id={id}
                                                data={form as ClubRow}
                                                navigationMode={navigationMode}
                                                initialPlayers={initialPlayers}
                                                initialPlayersLoaded={initialPlayersLoaded}
                                                initialDivisions={initialLinkedDivisions}
                                                initialDivisionsLoaded={initialDivisionsLoaded}
                                            />
                                        </div>
                                    ) : null}

                                    {currentTab === 'competencias' ? (
                                        <div className="card col-12">
                                            <ClubCompetitionsPanel
                                                competitions={dashboardData.competitions}
                                                standings={dashboardData.standings}
                                                matches={dashboardData.matches}
                                                clubName={form.name || currentManagedClub?.name || 'el club'}
                                                loading={isLoadingDashboard}
                                            />
                                        </div>
                                    ) : null}

                                    {currentTab === 'rendimiento' ? (
                                        <div className="col-12">
                                            <ClubPerformanceTab
                                                clubId={id}
                                                clubName={form.name || currentManagedClub?.name || 'Club'}
                                                sport={form.sport}
                                                divisions={linkedDivisions}
                                                players={initialPlayers ?? []}
                                                staff={initialStaff ?? []}
                                                dashboardData={dashboardData}
                                                loading={isLoadingDashboard || isLoadingDivisions}
                                            />
                                        </div>
                                    ) : null}

                                    {currentTab === 'partidos' ? (
                                        <div className="card col-12">
                                            <ClubFixtureResultsTab
                                                clubId={id}
                                                clubName={form.name || currentManagedClub?.name || 'Club'}
                                                divisions={linkedDivisions}
                                                upcomingMatches={dashboardData.upcomingMatches}
                                                recentMatches={dashboardData.recentMatches}
                                                pastMatches={dashboardData.pastMatches}
                                                loading={isLoadingDashboard}
                                            />
                                        </div>
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

                                    {currentTab === 'pizarra' ? (
                                        <div className="card col-12 club-pizarra-card">
                                            <ClubPizarraTab
                                                key={`${id}:${form.sport ?? 'rugby'}`}
                                                clubId={id}
                                                sport={form.sport}
                                                primaryColor={form.primary_color}
                                                clubName={form.name || currentManagedClub?.name || 'Club'}
                                                backHref={pizarraBackHref}
                                                mobileCanvasFirst={isPizarraFocus}
                                            />
                                        </div>
                                    ) : null}

                                    {currentTab === 'sponsors' ? (
                                        <div className="col-12">
                                            <ClubSponsorsTab
                                                clubId={id}
                                                initialSponsors={initialSponsors}
                                                initialSponsorsLoaded={initialSponsorsLoaded}
                                            />
                                        </div>
                                    ) : null}

                                    {currentTab === 'entrenamientos' ? (
                                        <div className="col-12">
                                            <ClubEntrenamientosTab
                                                clubId={id}
                                                clubName={form.name || currentManagedClub?.name || 'Club'}
                                                sport={form.sport}
                                                divisions={linkedDivisions}
                                                players={initialPlayers ?? []}
                                                staff={initialStaff ?? []}
                                                dashboardData={dashboardData}
                                                loading={isLoadingDashboard || isLoadingDivisions}
                                            />
                                        </div>
                                    ) : null}

                                    {currentTab === 'configuracion' ? (
                                        <>
                                            <div className="card col-12">
                                                <ClubIdentityTab id={id} data={form as ClubRow} unions={unions} />
                                            </div>

                                            <div className="card col-8">
                                                <ClubStaffTab
                                                    clubId={id}
                                                    initialPeople={initialStaff}
                                                    initialPeopleLoaded={initialStaffLoaded}
                                                />
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

                        </div>
                    </main>
                </div>
            </div>
        </ClubContext.Provider>
    );
}
