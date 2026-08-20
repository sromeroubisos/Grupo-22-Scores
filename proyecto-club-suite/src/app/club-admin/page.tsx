import { redirect } from 'next/navigation';
import { unstable_cache } from 'next/cache';
import { Shield, AlertTriangle, HelpCircle, Users } from 'lucide-react';
import { EmptyState } from '@/components/admin/ui';
import { ClubAccessHub } from '@/components/admin/entities/club/ClubAccessHub';
import { ClubManageShell } from '@/components/admin/entities/club/ClubManageShell';
import { getClubDashboardOverview } from '@/lib/club-admin/dashboard';
import {
    getClubDashboardModeForTab,
    normalizeClubManageTab,
    shouldLoadClubDashboardForTab,
    shouldLoadClubDivisionsForTab,
} from '@/lib/club-admin/manageTabs';
import type { Database } from '@/lib/database.types';
import { requireUserAccessContext } from '@/lib/auth/permissions';
import { getManagedClubSummaries } from '@/lib/club-admin/managedClubFamily';
import { getClubSponsors } from '@/lib/club-admin/sponsors';
import { fetchDivisions } from '@/lib/services/divisionService';
import { fetchPeopleByClub, type PersonWithRole } from '@/lib/services/personService';
import { getReadClient } from '@/lib/supabase/read';
import { createClient } from '@/lib/supabase/server';
import { normalizeError, serializeUnknownError } from '@/lib/utils/errorUtils';
import { buildTeamLogoProxyUrl, resolveSerializableLogoUrl } from '@/lib/utils/logoUrl';

export const dynamic = 'force-dynamic';
export const revalidate = 0; // dynamic page, but cached data below

const getCachedClubDashboard = unstable_cache(
    async (clubId: string, mode: string) => {
        const readClient = await getReadClient();
        return getClubDashboardOverview(readClient as never, clubId, { mode: mode as 'summary' | 'operational' });
    },
    ['club-dashboard-overview'],
    { revalidate: 60, tags: ['club-dashboard'] }
);

const getCachedDivisions = unstable_cache(
    async (clubId: string) => {
        const supabase = await createClient();
        return fetchDivisions(clubId, supabase as never);
    },
    ['club-divisions'],
    { revalidate: 120, tags: ['club-divisions'] }
);

const getCachedPeople = unstable_cache(
    async (clubId: string) => {
        const supabase = await createClient();
        return fetchPeopleByClub(clubId, supabase as never);
    },
    ['club-people'],
    { revalidate: 120, tags: ['club-people'] }
);

const getCachedSponsors = unstable_cache(
    async (clubId: string) => {
        return getClubSponsors(clubId);
    },
    ['club-sponsors'],
    { revalidate: 300, tags: ['club-sponsors'] }
);

type ClubRow = Database['public']['Tables']['clubs']['Row'];

interface ClubAdminPageProps {
    searchParams: Promise<{ club?: string; tab?: string; type?: string }>;
}

type PreloadResult<T> = {
    data: T | null;
    loaded: boolean;
};

function prepareClubRowForInitialPayload(row: ClubRow | null | undefined): ClubRow | null {
    if (!row) return null;

    const clubName = row.name || row.short_name || 'Club';
    const logoUrl = resolveSerializableLogoUrl(row.logo_url, { key: row.id, name: clubName })
        ?? buildTeamLogoProxyUrl({ key: row.id, name: clubName });

    return {
        ...row,
        logo_url: logoUrl,
    };
}

function isPlayer(person: PersonWithRole) {
    const normalizedRole = String(person.role || '').trim().toLowerCase();
    return normalizedRole === 'player' || normalizedRole === 'jugador';
}

function isStaffMember(person: PersonWithRole) {
    return !isPlayer(person);
}

function logPreloadFallback(scope: string, error: unknown) {
    const normalized = normalizeError(error);

    console.warn(`[club-admin/page] ${scope} preload fallback:`, {
        message: normalized.message,
        details: normalized.details,
        code: normalized.code,
        hint: normalized.hint,
        raw: serializeUnknownError(normalized.raw),
    });
}

async function preloadResource<T>(
    enabled: boolean,
    scope: string,
    loader: () => Promise<T>
): Promise<PreloadResult<T>> {
    if (!enabled) {
        return { data: null, loaded: false };
    }

    try {
        return {
            data: await loader(),
            loaded: true,
        };
    } catch (error) {
        logPreloadFallback(scope, error);
        return {
            data: null,
            loaded: false,
        };
    }
}

export default async function ClubAdminPage({ searchParams }: ClubAdminPageProps) {
    const {
        club: requestedClubId,
        tab: requestedTab,
        type: requestedType,
    } = await searchParams;
    const currentTab = normalizeClubManageTab(requestedTab);
    const supabase = await createClient();

    const context = await requireUserAccessContext(supabase).catch(() => null);
    if (!context) {
        redirect('/login');
    }

    const managed = await getManagedClubSummaries(supabase as never, context.memberships, {
        logoMode: 'proxy',
    });
    const requestedClubRef = typeof requestedClubId === 'string' ? requestedClubId.trim() : '';
    const requestedEntityType = typeof requestedType === 'string' ? requestedType.trim().toLowerCase() : '';
    const resolvedManagedClub = requestedClubRef
        ? managed.clubs.find((club) => club.id === requestedClubRef || club.slug === requestedClubRef) ?? null
        : null;
    const targetClubId = resolvedManagedClub?.id ?? null;

    if (!managed.clubs.length) {
        return (
            <EmptyState
                kicker="Club Admin"
                title="No hay clubes asignados"
                description="Esta cuenta todavía no tiene memberships de club o familia de club con permisos operativos."
                icon={<Users className="h-8 w-8" />}
            />
        );
    }

    if (requestedEntityType && requestedEntityType !== 'club') {
        return (
            <EmptyState
                kicker="Club Admin"
                title="Tipo de entidad no compatible"
                description="Esta vista solo admite type=club. Revisa la URL o vuelve a seleccionar un club real desde el panel."
                icon={<AlertTriangle className="h-8 w-8" />}
            />
        );
    }

    if (requestedClubRef && !targetClubId) {
        return (
            <EmptyState
                kicker="Club Admin"
                title="No pudimos resolver el club solicitado"
                description={`El valor club=${requestedClubRef} no corresponde a un club real con acceso para esta cuenta.`}
                icon={<HelpCircle className="h-8 w-8" />}
            />
        );
    }

    if (!targetClubId) {
        return <ClubAccessHub clubs={managed.clubs} />;
    }

    const shouldLoadDashboard = currentTab === 'general' ? false : shouldLoadClubDashboardForTab(currentTab);
    const shouldLoadDivisions = currentTab === 'general' ? false : shouldLoadClubDivisionsForTab(currentTab);
    const shouldLoadPlayers = currentTab === 'planteles'
        || currentTab === 'rendimiento'
        || currentTab === 'entrenamientos';
    const shouldLoadStaff = currentTab === 'configuracion'
        || currentTab === 'rendimiento'
        || currentTab === 'entrenamientos';
    const shouldLoadSponsors = currentTab === 'sponsors';

    const clubRowResultPromise = supabase
        .from('clubs')
        .select('id, union_id, name, short_name, slug, sport, country, region, city, primary_color, is_visible, categories')
        .eq('id', targetClubId)
        .maybeSingle()
        .then((result) => ({
            ...result,
            data: prepareClubRowForInitialPayload(result.data as ClubRow | null),
        }));

    const [
        { data: clubData },
        { data: unionsData },
        dashboardPreload,
        divisionsPreload,
        peoplePreload,
        sponsorsPreload,
    ] = await Promise.all([
        clubRowResultPromise,
        supabase
            .from('unions')
            .select('id, name')
            .order('name'),
        preloadResource(shouldLoadDashboard, 'Dashboard', async () => {
            return getCachedClubDashboard(targetClubId, getClubDashboardModeForTab(currentTab));
        }),
        preloadResource(shouldLoadDivisions, 'Division', () => getCachedDivisions(targetClubId)),
        preloadResource(shouldLoadPlayers || shouldLoadStaff, 'People', () => getCachedPeople(targetClubId)),
        preloadResource(shouldLoadSponsors, 'Sponsor', () => getCachedSponsors(targetClubId)),
    ]);

    const initialPlayers = shouldLoadPlayers
        ? peoplePreload.data?.filter(isPlayer) ?? null
        : null;
    const initialStaff = shouldLoadStaff
        ? peoplePreload.data?.filter(isStaffMember) ?? null
        : null;

    if (!clubData) {
        return (
            <EmptyState
                kicker="Club Admin"
                title="No pudimos abrir el club"
                description="El club seleccionado ya no existe o no está disponible para esta cuenta."
                icon={<Shield className="h-8 w-8" />}
            />
        );
    }

    return (
        <ClubManageShell
            id={targetClubId}
            data={clubData as ClubRow | null}
            unions={unionsData ?? []}
            managedClubs={managed.clubs}
            initialTab={currentTab}
            navigationMode="club-admin"
            initialDashboardData={dashboardPreload.data}
            initialDashboardLoaded={dashboardPreload.loaded}
            initialDashboardRequested={shouldLoadDashboard}
            initialLinkedDivisions={divisionsPreload.data ?? undefined}
            initialDivisionsLoaded={divisionsPreload.loaded}
            initialDivisionsRequested={shouldLoadDivisions}
            initialPlayers={initialPlayers ?? undefined}
            initialPlayersLoaded={shouldLoadPlayers && peoplePreload.loaded}
            initialStaff={initialStaff ?? undefined}
            initialStaffLoaded={shouldLoadStaff && peoplePreload.loaded}
            initialSponsors={sponsorsPreload.data ?? undefined}
            initialSponsorsLoaded={sponsorsPreload.loaded}
        />
    );
}
