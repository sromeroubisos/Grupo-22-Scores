import { redirect } from 'next/navigation';
import { ClubAccessHub } from '@/components/admin/entities/club/ClubAccessHub';
import { ClubManageShell } from '@/components/admin/entities/club/ClubManageShell';
import { getClubDashboardOverview } from '@/lib/club-admin/dashboard';
import { normalizeClubManageTab } from '@/lib/club-admin/manageTabs';
import type { Database } from '@/lib/database.types';
import { requireUserAccessContext } from '@/lib/auth/permissions';
import { getManagedClubSummaries } from '@/lib/club-admin/managedClubFamily';
import { getClubSponsors } from '@/lib/club-admin/sponsors';
import { fetchDivisions } from '@/lib/services/divisionService';
import { fetchPeopleByClub, type PersonWithRole } from '@/lib/services/personService';
import { getReadClient } from '@/lib/supabase/read';
import { createClient } from '@/lib/supabase/server';
import { normalizeError, serializeUnknownError } from '@/lib/utils/errorUtils';

export const dynamic = 'force-dynamic';

type ClubRow = Database['public']['Tables']['clubs']['Row'];

interface ClubAdminPageProps {
    searchParams: Promise<{ club?: string; tab?: string }>;
}

type PreloadResult<T> = {
    data: T | null;
    loaded: boolean;
};

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
    const { club: requestedClubId, tab: requestedTab } = await searchParams;
    const currentTab = normalizeClubManageTab(requestedTab);
    const supabase = await createClient();

    const context = await requireUserAccessContext(supabase).catch(() => null);
    if (!context) {
        redirect('/login');
    }

    const managed = await getManagedClubSummaries(supabase as never, context.memberships);
    const availableClubIds = new Set(managed.clubs.map((club) => club.id));
    const targetClubId = requestedClubId && availableClubIds.has(requestedClubId)
        ? requestedClubId
        : null;

    if (!managed.clubs.length) {
        return (
            <div className="min-h-screen flex items-center justify-center p-6 bg-[var(--color-bg-primary)] text-[var(--color-text-primary)]">
                <div className="max-w-xl w-full rounded-[28px] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-8 shadow-[var(--shadow-card)]">
                    <p className="text-xs uppercase tracking-[0.24em] text-[#00ff88] font-black">Club Admin</p>
                    <h1 className="mt-4 text-3xl font-black tracking-tight">No hay clubes asignados</h1>
                    <p className="mt-4 text-sm text-[var(--color-text-secondary)]">
                        Esta cuenta todavía no tiene memberships de club o familia de club con permisos operativos.
                    </p>
                </div>
            </div>
        );
    }

    if (!targetClubId) {
        return <ClubAccessHub clubs={managed.clubs} />;
    }

    const shouldLoadDashboard = currentTab === 'general'
        || currentTab === 'rendimiento'
        || currentTab === 'competencias'
        || currentTab === 'partidos'
        || currentTab === 'contenido'
        || currentTab === 'entrenamientos';
    const shouldLoadDivisions = currentTab === 'general'
        || currentTab === 'rendimiento'
        || currentTab === 'partidos'
        || currentTab === 'planteles'
        || currentTab === 'entrenamientos';
    const shouldLoadPlayers = currentTab === 'planteles'
        || currentTab === 'rendimiento'
        || currentTab === 'entrenamientos';
    const shouldLoadStaff = currentTab === 'configuracion'
        || currentTab === 'rendimiento'
        || currentTab === 'entrenamientos';
    const shouldLoadSponsors = currentTab === 'sponsors';

    const [
        { data: clubData },
        { data: unionsData },
        dashboardPreload,
        divisionsPreload,
        peoplePreload,
        sponsorsPreload,
    ] = await Promise.all([
        supabase
            .from('clubs')
            .select('*')
            .eq('id', targetClubId)
            .maybeSingle(),
        supabase
            .from('unions')
            .select('id, name')
            .order('name'),
        preloadResource(shouldLoadDashboard, 'Dashboard', async () => {
            const client = await getReadClient();
            return getClubDashboardOverview(client as never, targetClubId);
        }),
        preloadResource(shouldLoadDivisions, 'Division', () => fetchDivisions(targetClubId, supabase as never)),
        preloadResource(shouldLoadPlayers || shouldLoadStaff, 'People', () => fetchPeopleByClub(targetClubId, supabase as never)),
        preloadResource(shouldLoadSponsors, 'Sponsor', () => getClubSponsors(targetClubId)),
    ]);

    const initialPlayers = shouldLoadPlayers
        ? peoplePreload.data?.filter(isPlayer) ?? null
        : null;
    const initialStaff = shouldLoadStaff
        ? peoplePreload.data?.filter(isStaffMember) ?? null
        : null;

    if (!clubData) {
        return (
            <div className="min-h-screen flex items-center justify-center p-6 bg-[var(--color-bg-primary)] text-[var(--color-text-primary)]">
                <div className="max-w-xl w-full rounded-[28px] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-8 shadow-[var(--shadow-card)]">
                    <p className="text-xs uppercase tracking-[0.24em] text-[#00ff88] font-black">Club Admin</p>
                    <h1 className="mt-4 text-3xl font-black tracking-tight">No pudimos abrir el club</h1>
                    <p className="mt-4 text-sm text-[var(--color-text-secondary)]">
                        El club seleccionado ya no existe o no está disponible para esta cuenta.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <ClubManageShell
            id={targetClubId}
            data={clubData as ClubRow}
            unions={unionsData ?? []}
            managedClubs={managed.clubs}
            navigationMode="club-admin"
            initialDashboardData={dashboardPreload.data}
            initialDashboardLoaded={dashboardPreload.loaded}
            initialLinkedDivisions={divisionsPreload.data ?? undefined}
            initialDivisionsLoaded={divisionsPreload.loaded}
            initialPlayers={initialPlayers ?? undefined}
            initialPlayersLoaded={shouldLoadPlayers && peoplePreload.loaded}
            initialStaff={initialStaff ?? undefined}
            initialStaffLoaded={shouldLoadStaff && peoplePreload.loaded}
            initialSponsors={sponsorsPreload.data ?? undefined}
            initialSponsorsLoaded={sponsorsPreload.loaded}
        />
    );
}
