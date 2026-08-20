import { redirect } from 'next/navigation';
import { AlertTriangle, HelpCircle, Shield, Users } from 'lucide-react';
import { EmptyState } from '@/components/admin/ui';
import { ClubAccessHub } from '@/components/admin/entities/club/ClubAccessHub';
import { ClubManagerShell } from '@/components/admin/club-manager/ClubManagerShell';
import { normalizeClubManagerTab } from '@/lib/club-admin/manageTabs';
import type { Database } from '@/lib/database.types';
import { requireUserAccessContext } from '@/lib/auth/permissions';
import { getManagedClubSummaries } from '@/lib/club-admin/managedClubFamily';
import { createClient } from '@/lib/supabase/server';
import { buildTeamLogoProxyUrl, resolveSerializableLogoUrl } from '@/lib/utils/logoUrl';

export const dynamic = 'force-dynamic';
export const revalidate = 0; // dynamic page, but cached data below

type ClubRow = Database['public']['Tables']['clubs']['Row'];

interface ClubAdminPageProps {
    searchParams: Promise<{ club?: string; tab?: string; type?: string }>;
}

function prepareClubRowForInitialPayload(row: ClubRow | null | undefined): ClubRow | null {
    if (!row) return null;

    const clubName = row.name || row.short_name || 'Club';

    return {
        ...row,
        logo_url: resolveSerializableLogoUrl(row.logo_url, { key: row.id, name: clubName }),
    };
}

export default async function ClubAdminPage({ searchParams }: ClubAdminPageProps) {
    const {
        club: requestedClubId,
        tab: requestedTab,
        type: requestedType,
    } = await searchParams;
    const currentTab = normalizeClubManagerTab(requestedTab);
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

    const [{ data: clubRow }, { data: unionsData }] = await Promise.all([
        supabase
            .from('clubs')
            .select('id, union_id, name, short_name, slug, sport, country, region, city, primary_color, logo_url, is_visible, categories')
            .eq('id', targetClubId)
            .maybeSingle(),
        supabase.from('unions').select('id, name').order('name'),
    ]);

    if (!clubRow) {
        return (
            <EmptyState
                kicker="Club Admin"
                title="No pudimos abrir el club"
                description="El club seleccionado ya no existe o no esta disponible para esta cuenta."
                icon={<Shield className="h-8 w-8" />}
            />
        );
    }

    const clubData = prepareClubRowForInitialPayload(clubRow as ClubRow);

    return (
        <ClubManagerShell
            id={targetClubId}
            data={clubData}
            unions={unionsData ?? []}
            initialTab={currentTab}
            navigationMode="club-admin"
            crestSrc={clubData?.logo_url ?? buildTeamLogoProxyUrl({
                key: targetClubId,
                name: clubRow.name || 'Club',
            })}
        />
    );
}
