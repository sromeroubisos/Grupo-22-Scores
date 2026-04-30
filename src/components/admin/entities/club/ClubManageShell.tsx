'use client';

import dynamic from 'next/dynamic';
import { startTransition, useState, useEffect, Suspense, useEffectEvent, type CSSProperties } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Database } from '@/lib/database.types';
import {
    getClubDashboardModeForTab,
    normalizeClubManageTab,
    shouldLoadClubDashboardForTab,
    shouldLoadClubDivisionsForTab,
    type ClubManageTabId,
} from '@/lib/club-admin/manageTabs';
import type { ClubSponsorItem } from '@/lib/club-admin/sponsors';
import type { PersonWithRole } from '@/lib/services/personService';
import { fetchDivisions, type Division } from '@/lib/services/divisionService';
import type { ClubFull, ClubUpdateInput, ClubValidationError } from '@/lib/types/clubs';
import { ClubContext } from './ClubContext';
import { ClubAdminToast } from './ClubAdminToast';
import { ClubDataHealthCard } from './ClubDataHealthCard';
import { ClubIdentityTab } from './ClubIdentityTab';
import { ClubManageHeader } from './ClubManageHeader';
import { ClubManageTabs } from './ClubManageTabs';
import { ClubNextMatchesCard } from './ClubNextMatchesCard';
import { ClubSponsorsTab } from './ClubSponsorsTab';
import { ClubSquadsCard } from './ClubSquadsCard';
import { ClubStaffTab } from './ClubStaffTab';
import { ClubStandingsCard } from './ClubStandingsCard';
import { ClubSummaryHero } from './ClubSummaryHero';
import type { ClubDashboardMode, ClubDashboardOverview } from '@/lib/club-admin/dashboard-types';
import { EMPTY_CLUB_DASHBOARD_OVERVIEW } from '@/lib/club-admin/dashboard-types';
import type { ManagedClubSummary } from '@/lib/club-admin/managedClubFamily';
import { buildClubManageHref, pushClubManageHistoryState, type ClubConsoleMode } from '@/lib/clubAdminRoutes';
import { ClubMobileConsole } from './ClubMobileConsole';
import { ClubMobileGeneralOverview } from './ClubMobileGeneralOverview';
import { buildTeamLogoProxyUrl, isTeamLogoProxyUrl, resolveSerializableLogoUrl } from '@/lib/utils/logoUrl';

import './vitreous-club.css';
import './club-admin-mobile.css';

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
    initialTab: ClubManageTabId;
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

type DashboardDataByMode = Record<ClubDashboardMode, ClubDashboardOverview | null>;
type DashboardFlagByMode = Record<ClubDashboardMode, boolean>;
type BuildClubManagePayloadOptions = {
    includeLogoUrl?: boolean;
};

const PERSISTENT_CLUB_TABS = new Set<ClubManageTabId>([
    'planteles',
    'competencias',
    'rendimiento',
    'partidos',
    'contenido',
    'entrenamientos',
    'usuarios',
    'configuracion',
]);

function TabModuleFallback({ label }: { label: string }) {
    return (
        <div className="club-tab-empty">
            <span>Cargando {label}...</span>
        </div>
    );
}

const DynamicClubContentStudioTab = dynamic(
    () => import('./ClubContentStudioTab').then((module) => module.ClubContentStudioTab),
    { loading: () => <TabModuleFallback label="studio" /> }
);
const DynamicClubCompetitionsPanel = dynamic(
    () => import('./ClubCompetitionsPanel').then((module) => module.ClubCompetitionsPanel),
    { loading: () => <TabModuleFallback label="competencias" /> }
);
const DynamicClubEntrenamientosTab = dynamic(
    () => import('./ClubEntrenamientosTab').then((module) => module.ClubEntrenamientosTab),
    { loading: () => <TabModuleFallback label="entrenamientos" /> }
);
const DynamicClubFixtureResultsTab = dynamic(
    () => import('./ClubFixtureResultsTab').then((module) => module.ClubFixtureResultsTab),
    { loading: () => <TabModuleFallback label="partidos" /> }
);
const DynamicClubPerformanceTab = dynamic(
    () => import('./ClubPerformanceTab').then((module) => module.ClubPerformanceTab),
    { loading: () => <TabModuleFallback label="rendimiento" /> }
);
const DynamicClubPizarraTab = dynamic(
    () => import('./ClubPizarraTab').then((module) => module.ClubPizarraTab),
    { loading: () => <TabModuleFallback label="pizarra" /> }
);
const DynamicClubSquadsTab = dynamic(
    () => import('./ClubSquadsTab').then((module) => module.ClubSquadsTab),
    { loading: () => <TabModuleFallback label="planteles" /> }
);
const DynamicClubUsersTab = dynamic(
    () => import('./ClubUsersTab').then((module) => module.ClubUsersTab),
    { loading: () => <TabModuleFallback label="usuarios" /> }
);

function createEmptyDashboardDataByMode(): DashboardDataByMode {
    return {
        summary: null,
        operational: null,
    };
}

function createDashboardModeFlags(value = false): DashboardFlagByMode {
    return {
        summary: value,
        operational: value,
    };
}

function createInitialDashboardDataByMode(
    hydratedMode: ClubDashboardMode | null,
    initialDashboardData: ClubDashboardOverview | null
): DashboardDataByMode {
    const cache = createEmptyDashboardDataByMode();

    if (hydratedMode) {
        cache[hydratedMode] = initialDashboardData ?? EMPTY_CLUB_DASHBOARD_OVERVIEW;
    }

    return cache;
}

function createInitialDashboardLoadedByMode(hydratedMode: ClubDashboardMode | null): DashboardFlagByMode {
    const flags = createDashboardModeFlags(false);

    if (hydratedMode) {
        flags[hydratedMode] = true;
    }

    return flags;
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
            cache: 'force-cache',
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

function prepareClubFormForClient(data: ClubRow | null): ClubFormState {
    const initialForm = createInitialClubForm(data);
    const clubName = initialForm.name || initialForm.short_name || 'Club';
    const logoUrl = resolveSerializableLogoUrl(initialForm.logo_url, {
        key: initialForm.id,
        name: clubName,
    }) ?? buildTeamLogoProxyUrl({
        key: initialForm.id,
        name: clubName,
    });

    return {
        ...initialForm,
        logo_url: logoUrl ?? initialForm.logo_url,
    };
}

function buildClubManagePayload(
    form: ClubFormState,
    options: BuildClubManagePayloadOptions = {}
): ClubUpdateInput {
    const core: NonNullable<ClubUpdateInput['core']> = {
        name: typeof form.name === 'string' ? form.name : '',
        short_name: normalizeNullableText(form.short_name) as string | null,
        slug: typeof form.slug === 'string' ? form.slug : '',
        sport: typeof form.sport === 'string' ? form.sport : '',
        country: typeof form.country === 'string' ? form.country : '',
        region: normalizeNullableText(form.region) as string | null,
        city: normalizeNullableText(form.city) as string | null,
        union_id: normalizeNullableText(form.union_id) as string | null,
        primary_color: normalizeNullableText(form.primary_color) as string | null,
        visibility: form.is_visible === false ? 'hidden' : 'visible',
    };

    if (options.includeLogoUrl && !isTeamLogoProxyUrl(form.logo_url)) {
        core.logo_url = normalizeNullableText(form.logo_url) as string | null;
    }

    return {
        core,
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
    initialTab,
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
    const urlTab = normalizeClubManageTab(searchParams.get('tab'));
    const [currentTab, setCurrentTab] = useState<ClubManageTabId>(urlTab);
    const isPizarraFocus = currentTab === 'pizarra';
    const shouldUseDashboard = shouldLoadClubDashboardForTab(currentTab);
    const shouldUseDivisions = shouldLoadClubDivisionsForTab(currentTab);
    const dashboardMode = getClubDashboardModeForTab(currentTab);
    const hydratedDashboardMode = initialDashboardLoaded && initialDashboardRequested
        ? getClubDashboardModeForTab(initialTab)
        : null;
    const hydratedDivisionsLoaded = initialDivisionsLoaded && initialDivisionsRequested;

    const [isDirty, setIsDirty] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [logoUrlTouched, setLogoUrlTouched] = useState(false);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [form, setForm] = useState<ClubFormState>(prepareClubFormForClient(data));
    const [mountedTabs, setMountedTabs] = useState<ClubManageTabId[]>(
        PERSISTENT_CLUB_TABS.has(initialTab) ? [initialTab] : []
    );
    const [dashboardDataByMode, setDashboardDataByMode] = useState<DashboardDataByMode>(
        createInitialDashboardDataByMode(hydratedDashboardMode, initialDashboardData)
    );
    const [dashboardLoadedByMode, setDashboardLoadedByMode] = useState<DashboardFlagByMode>(
        createInitialDashboardLoadedByMode(hydratedDashboardMode)
    );
    const [dashboardLoadingByMode, setDashboardLoadingByMode] = useState<DashboardFlagByMode>(
        createDashboardModeFlags(false)
    );
    const [linkedDivisions, setLinkedDivisions] = useState<Division[]>(filterVisibleDivisions(initialLinkedDivisions));
    const [divisionsLoaded, setDivisionsLoaded] = useState(hydratedDivisionsLoaded);
    const [isFetchingDivisions, setIsFetchingDivisions] = useState(false);

    useEffect(() => {
        setForm(prepareClubFormForClient(data));
        setIsDirty(false);
        setLogoUrlTouched(false);
    }, [data, id]);

    useEffect(() => {
        setCurrentTab(urlTab);
    }, [urlTab]);

    useEffect(() => {
        const syncTabFromLocation = () => {
            const nextSearchParams = new URLSearchParams(window.location.search);
            setCurrentTab(normalizeClubManageTab(nextSearchParams.get('tab')));
        };

        window.addEventListener('popstate', syncTabFromLocation);
        return () => window.removeEventListener('popstate', syncTabFromLocation);
    }, []);

    useEffect(() => {
        const nextHydratedDashboardMode = initialDashboardLoaded && initialDashboardRequested
            ? getClubDashboardModeForTab(initialTab)
            : null;

        setMountedTabs(PERSISTENT_CLUB_TABS.has(initialTab) ? [initialTab] : []);
        setDashboardDataByMode(createInitialDashboardDataByMode(nextHydratedDashboardMode, initialDashboardData));
        setDashboardLoadedByMode(createInitialDashboardLoadedByMode(nextHydratedDashboardMode));
        setDashboardLoadingByMode(createDashboardModeFlags(false));
    }, [id, initialDashboardData, initialDashboardLoaded, initialDashboardRequested, initialTab]);

    useEffect(() => {
        setLinkedDivisions(hydratedDivisionsLoaded ? filterVisibleDivisions(initialLinkedDivisions) : []);
        setDivisionsLoaded(hydratedDivisionsLoaded);
        setIsFetchingDivisions(false);
    }, [hydratedDivisionsLoaded, id, initialLinkedDivisions]);

    useEffect(() => {
        if (!PERSISTENT_CLUB_TABS.has(currentTab)) {
            return;
        }

        setMountedTabs((current) => (current.includes(currentTab) ? current : [...current, currentTab]));
    }, [currentTab]);

    const loadDashboardForMode = useEffectEvent(async (mode: ClubDashboardMode) => {
        if (isCreate) {
            return;
        }

        setDashboardLoadingByMode((current) => ({ ...current, [mode]: true }));

        try {
            const response = await fetchClubDashboardData(id, mode);
            setDashboardDataByMode((current) => ({ ...current, [mode]: response }));
            setDashboardLoadedByMode((current) => ({ ...current, [mode]: true }));
        } catch (error) {
            console.error('Dashboard load error:', error);
        } finally {
            setDashboardLoadingByMode((current) => ({ ...current, [mode]: false }));
        }
    });

    useEffect(() => {
        const hasDashboardForCurrentTab = dashboardMode === 'summary'
            ? (dashboardLoadedByMode.summary || dashboardLoadedByMode.operational)
            : dashboardLoadedByMode.operational;

        if (isCreate || !shouldUseDashboard || hasDashboardForCurrentTab || dashboardLoadingByMode[dashboardMode]) {
            return;
        }

        void loadDashboardForMode(dashboardMode);
    }, [
        currentTab,
        dashboardLoadedByMode.operational,
        dashboardLoadedByMode.summary,
        dashboardLoadingByMode,
        dashboardMode,
        isCreate,
        shouldUseDashboard,
    ]);

    const loadLinkedDivisions = useEffectEvent(async (force = false) => {
        if (isCreate) {
            return;
        }

        if (!force && divisionsLoaded) {
            return;
        }

        setIsFetchingDivisions(true);

        try {
            const divisions = await fetchDivisions(id);
            setLinkedDivisions(filterVisibleDivisions(divisions));
            setDivisionsLoaded(true);
        } catch (error) {
            console.error('Division load error:', error);
            if (!divisionsLoaded) {
                setLinkedDivisions([]);
            }
            setDivisionsLoaded(false);
        } finally {
            setIsFetchingDivisions(false);
        }
    });

    useEffect(() => {
        if (isCreate || !shouldUseDivisions || divisionsLoaded || isFetchingDivisions) {
            return;
        }

        void loadLinkedDivisions();
    }, [divisionsLoaded, id, isCreate, isFetchingDivisions, shouldUseDivisions]);

    useEffect(() => {
        const refreshDivisions = () => {
            void loadLinkedDivisions(true);
        };

        window.addEventListener('club:divisions-updated', refreshDivisions);
        return () => {
            window.removeEventListener('club:divisions-updated', refreshDivisions);
        };
    }, [id]);

    useEffect(() => {
        const warmClubTabs = () => {
            void import('./ClubSquadsTab');
            void import('./ClubFixtureResultsTab');
            void import('./ClubPerformanceTab');
            void import('./ClubEntrenamientosTab');
            void import('./ClubCompetitionsPanel');
        };

        if (typeof window === 'undefined') {
            return;
        }

        if ('requestIdleCallback' in window) {
            const idleId = window.requestIdleCallback(warmClubTabs);
            return () => window.cancelIdleCallback(idleId);
        }

        const timeoutId = setTimeout(warmClubTabs, 1200);
        return () => clearTimeout(timeoutId);
    }, []);

    const navigateToClubTab = (tabId: ClubManageTabId) => {
        if (tabId === currentTab) {
            return;
        }

        startTransition(() => {
            setCurrentTab(tabId);
        });

        pushClubManageHistoryState(id, tabId, navigationMode);
    };

    const summaryDashboardData = dashboardDataByMode.summary ?? dashboardDataByMode.operational ?? EMPTY_CLUB_DASHBOARD_OVERVIEW;
    const operationalDashboardData = dashboardDataByMode.operational ?? EMPTY_CLUB_DASHBOARD_OVERVIEW;
    const isLoadingSummaryDashboard = !dashboardLoadedByMode.summary
        && !dashboardLoadedByMode.operational
        && dashboardLoadingByMode.summary;
    const isLoadingOperationalDashboard = !dashboardLoadedByMode.operational
        && dashboardLoadingByMode.operational;
    const isLoadingDivisions = !divisionsLoaded && isFetchingDivisions;

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
    const currentManagedClub = managedClubs.find((club) => club.id === id) ?? null;
    const primarySportLabel = linkedSports.length > 1
        ? 'Multideporte'
        : linkedSports[0] || configuredSportLabel || (legacyCategories.length > 0 ? 'Rugby' : 'Deporte');
    const squadCount = linkedDivisions.length > 0 ? linkedDivisions.length : legacyCategories.length;
    const competitionCount = summaryDashboardData.competitions.length;
    const clubDisplayName = form.name || currentManagedClub?.name || 'Club';

    const summaryMetrics = {
        teams: squadCount,
        upcomingMatches: summaryDashboardData.stats.upcomingMatches,
        competitions: summaryDashboardData.stats.tournaments || competitionCount,
        standings: summaryDashboardData.standings.length,
    };
    const clubFamilyCount = currentManagedClub
        ? managedClubs.filter((club) => club.familyRootId === currentManagedClub.familyRootId).length
        : managedClubs.length;
    const pizarraBackHref = buildClubManageHref(id, 'general', navigationMode);

    useEffect(() => {
        const handler = (event: Event) => {
            const customEvent = event as CustomEvent<Partial<ClubRow>>;
            if (customEvent.detail) {
                setForm((current) => ({ ...current, ...customEvent.detail }));
                if (Object.prototype.hasOwnProperty.call(customEvent.detail, 'logo_url')) {
                    setLogoUrlTouched(true);
                }
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
            setToast({ message: 'El nombre del club es obligatorio', type: 'error' });
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
                body: JSON.stringify(buildClubManagePayload(form, { includeLogoUrl: logoUrlTouched })),
            });
            const payload = await response.json() as ManageClubRouteResponse;

            if (!response.ok || !payload.data?.core) {
                throw new Error(buildSaveErrorMessage(payload));
            }

            setForm(prepareClubFormForClient(payload.data.core as unknown as ClubRow));
            setIsDirty(false);
            setLogoUrlTouched(false);
            window.dispatchEvent(new CustomEvent('club:save-success'));
            router.refresh();
            setToast({ message: 'Cambios guardados correctamente', type: 'success' });
        } catch (error) {
            console.error('Save error:', error);
            setToast({ message: `Error al guardar: ${error instanceof Error ? error.message : String(error)}`, type: 'error' });
        } finally {
            setIsSaving(false);
        }
    }

    return (
        <ClubContext.Provider value={{ isDirty, setDirty: setIsDirty }}>
            <div
                className={`flash-ui-container${isPizarraFocus ? ' is-pizarra-focus' : ''}`}
                style={{
                    '--accent': 'var(--ca-accent)',
                    '--accent-secondary': 'var(--ca-accent)',
                    '--accent-tertiary': 'var(--ca-accent-tertiary)',
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
                                navigationMode={navigationMode}
                                onTabChange={navigateToClubTab}
                            />
                        </Suspense>
                    </aside>

                    <main className="club-admin-main">
                        <ClubMobileConsole
                            currentTab={currentTab}
                            currentClubId={id}
                            managedClubs={managedClubs}
                            primarySportLabel={primarySportLabel}
                            navigationMode={navigationMode}
                            onTabChange={navigateToClubTab}
                        />

                        <div className={`club-main-header-shell${currentTab === 'general' ? ' is-general' : ''}`}>
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
                        </div>

                        <div className="club-main-grid">
                            <section className="club-workspace">
                                <div className="content-area">
                                    {currentTab === 'general' ? (
                                        <>
                                            <ClubMobileGeneralOverview
                                                clubId={id}
                                                clubName={clubDisplayName}
                                                sportLabel={primarySportLabel}
                                                divisions={linkedDivisions}
                                                health={summaryDashboardData.health}
                                                upcomingMatches={summaryMetrics.upcomingMatches}
                                                nextMatch={summaryDashboardData.upcomingMatches[0] ?? null}
                                                navigationMode={navigationMode}
                                                onTabChange={navigateToClubTab}
                                            />

                                            <div className="card col-12 club-general-hero-card">
                                                <ClubSummaryHero
                                                    data={form}
                                                    unionName={unionName}
                                                    sportLabel={primarySportLabel}
                                                    metrics={summaryMetrics}
                                                    onTabChange={navigateToClubTab}
                                                />
                                            </div>

                                            <div className="card col-7 club-general-card-squads">
                                                <ClubSquadsCard
                                                    divisions={linkedDivisions}
                                                    fallbackCategories={legacyCategories}
                                                    loading={isLoadingDivisions}
                                                />
                                            </div>

                                            <div className="card col-5 club-general-card-health">
                                                <ClubDataHealthCard health={summaryDashboardData.health} />
                                            </div>

                                            <div className="card col-8 club-general-card-matches">
                                                <ClubNextMatchesCard
                                                    categories={divisionFilterOptions}
                                                    matches={summaryDashboardData.upcomingMatches}
                                                    loading={isLoadingSummaryDashboard}
                                                />
                                            </div>

                                            <div className="card col-4 club-general-card-standings">
                                                <ClubStandingsCard
                                                    clubId={id}
                                                    tournamentName={summaryDashboardData.standings[0]?.tournamentName}
                                                    standings={summaryDashboardData.standings.map((standing) => ({
                                                        pos: standing.position ?? 0,
                                                        label: standing.tournamentName,
                                                        row_id: `${standing.tournamentId}-${standing.phaseId || 'base'}-${standing.groupId || 'all'}`,
                                                        pj: standing.played,
                                                        pts: standing.points,
                                                    }))}
                                                    loading={isLoadingSummaryDashboard}
                                                />
                                            </div>

                                            <div className="card col-12 club-surface-band club-general-card-band">
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

                                    {currentTab === 'planteles' || mountedTabs.includes('planteles') ? (
                                        <div className="col-12" hidden={currentTab !== 'planteles'}>
                                            <DynamicClubSquadsTab
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

                                    {currentTab === 'competencias' || mountedTabs.includes('competencias') ? (
                                        <div className="card col-12" hidden={currentTab !== 'competencias'}>
                                            <DynamicClubCompetitionsPanel
                                                clubId={id}
                                                competitions={summaryDashboardData.competitions}
                                                standings={summaryDashboardData.standings}
                                                matches={summaryDashboardData.matches}
                                                clubName={form.name || currentManagedClub?.name || 'el club'}
                                                loading={isLoadingSummaryDashboard}
                                            />
                                        </div>
                                    ) : null}

                                    {currentTab === 'rendimiento' || mountedTabs.includes('rendimiento') ? (
                                        <div className="col-12" hidden={currentTab !== 'rendimiento'}>
                                            <DynamicClubPerformanceTab
                                                clubId={id}
                                                clubName={form.name || currentManagedClub?.name || 'Club'}
                                                sport={form.sport}
                                                divisions={linkedDivisions}
                                                players={initialPlayers ?? []}
                                                staff={initialStaff ?? []}
                                                dashboardData={summaryDashboardData}
                                                loading={isLoadingSummaryDashboard || isLoadingDivisions}
                                                onTabChange={navigateToClubTab}
                                            />
                                        </div>
                                    ) : null}

                                    {currentTab === 'partidos' || mountedTabs.includes('partidos') ? (
                                        <div className="card col-12" hidden={currentTab !== 'partidos'}>
                                            <DynamicClubFixtureResultsTab
                                                clubId={id}
                                                clubName={form.name || currentManagedClub?.name || 'Club'}
                                                divisions={linkedDivisions}
                                                upcomingMatches={operationalDashboardData.upcomingMatches}
                                                recentMatches={operationalDashboardData.recentMatches}
                                                pastMatches={operationalDashboardData.pastMatches}
                                                loading={isLoadingOperationalDashboard}
                                            />
                                        </div>
                                    ) : null}

                                    {currentTab === 'contenido' || mountedTabs.includes('contenido') ? (
                                        <div className="col-12" hidden={currentTab !== 'contenido'}>
                                            <DynamicClubContentStudioTab
                                                data={form}
                                                upcomingMatches={summaryDashboardData.upcomingMatches}
                                                standings={summaryDashboardData.standings}
                                            />
                                        </div>
                                    ) : null}

                                    {currentTab === 'pizarra' ? (
                                        <div className="card col-12 club-pizarra-card">
                                            <DynamicClubPizarraTab
                                                key={`${id}:${form.sport ?? 'rugby'}`}
                                                clubId={id}
                                                sport={form.sport}
                                                primaryColor={form.primary_color}
                                                clubName={form.name || currentManagedClub?.name || 'Club'}
                                                backHref={pizarraBackHref}
                                                mobileCanvasFirst={isPizarraFocus}
                                                onBack={() => navigateToClubTab('general')}
                                            />
                                        </div>
                                    ) : null}

                                    {currentTab === 'entrenamientos' || mountedTabs.includes('entrenamientos') ? (
                                        <div className="col-12" hidden={currentTab !== 'entrenamientos'}>
                                            <DynamicClubEntrenamientosTab
                                                clubId={id}
                                                clubName={form.name || currentManagedClub?.name || 'Club'}
                                                sport={form.sport}
                                                divisions={linkedDivisions}
                                                players={initialPlayers ?? []}
                                                staff={initialStaff ?? []}
                                                dashboardData={summaryDashboardData}
                                                loading={isLoadingSummaryDashboard || isLoadingDivisions}
                                                onTabChange={navigateToClubTab}
                                            />
                                        </div>
                                    ) : null}

                                    {currentTab === 'usuarios' || mountedTabs.includes('usuarios') ? (
                                        <div className="col-12" hidden={currentTab !== 'usuarios'}>
                                            <DynamicClubUsersTab clubId={id} />
                                        </div>
                                    ) : null}

                                    {currentTab === 'configuracion' || mountedTabs.includes('configuracion') ? (
                                        <div hidden={currentTab !== 'configuracion'}>
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

                                            <div className="card col-12">
                                                <ClubSponsorsTab
                                                    clubId={id}
                                                    initialSponsors={initialSponsors}
                                                    initialSponsorsLoaded={initialSponsorsLoaded}
                                                />
                                            </div>
                                        </div>
                                    ) : null}
                                </div>
                            </section>

                        </div>
                    </main>
                </div>
            </div>
            {toast && (
                <div className="club-admin-toast-container">
                    <ClubAdminToast
                        message={toast.message}
                        type={toast.type}
                        onClose={() => setToast(null)}
                    />
                </div>
            )}
        </ClubContext.Provider>
    );
}
