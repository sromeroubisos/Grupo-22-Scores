import { EDIT_MEMBERSHIP_ROLES, isGlobalAdminRole, type MembershipLike } from '@/lib/auth/roles';
import { hasScopedMembershipAccess } from '@/lib/auth/permissions';
import {
    getClubFamilySummary,
    getManagedClubSummaries,
    type ManagedClubSummary,
} from '@/lib/club-admin/managedClubFamily';
import { createClient } from '@/lib/supabase/server';

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type SharedRosterLinkRow = {
    family_base_club_id: string;
    roster_owner_club_id: string;
    division_club_id: string;
    group_name?: string | null;
};

type SharedRosterGroup = {
    id: string;
    name: string;
    rosterOwnerClubId: string;
    clubIds: string[];
};

export interface ClubAdminFamilyTeam {
    id: string;
    name: string;
    shortName: string | null;
    logoUrl: string | null;
    sport: string | null;
    parentClubId: string | null;
    parentClubName: string | null;
    isRoot: boolean;
    isCurrent: boolean;
    canManage: boolean;
    accessRole: string | null;
    accessSource: ManagedClubSummary['accessSource'] | null;
    sharedRosterGroupIds: string[];
}

export interface ClubAdminSharedRosterGroup {
    id: string;
    name: string;
    rosterOwnerClubId: string;
    clubIds: string[];
}

export interface ClubAdminTeamScope {
    rootClubId: string;
    rootClubName: string | null;
    activeClubId: string;
    manageableClubIds: string[];
    canManageFamily: boolean;
    teams: ClubAdminFamilyTeam[];
    sharedRosterGroups: ClubAdminSharedRosterGroup[];
}

function getErrorCode(error: unknown) {
    if (!error || typeof error !== 'object' || !('code' in error)) {
        return null;
    }

    const code = (error as { code?: unknown }).code;
    return typeof code === 'string' ? code : null;
}

function isMissingTableError(error: unknown) {
    const code = getErrorCode(error);
    return code === 'PGRST204' || code === 'PGRST205' || code === '42P01';
}

function isMissingColumnError(error: unknown) {
    return getErrorCode(error) === '42703';
}

function buildGroupId(rosterOwnerClubId: string, name: string) {
    return `${rosterOwnerClubId}::${name}`;
}

async function fetchSharedRosterGroups(
    supabase: SupabaseServerClient,
    familyRootId: string
): Promise<SharedRosterGroup[]> {
    const result = await supabase
        .from('club_family_divisions')
        .select('family_base_club_id, roster_owner_club_id, division_club_id, group_name')
        .eq('family_base_club_id', familyRootId);

    let rows = result.data as SharedRosterLinkRow[] | null;
    if (result.error) {
        if (isMissingTableError(result.error)) return [];

        if (isMissingColumnError(result.error)) {
            const fallback = await supabase
                .from('club_family_divisions')
                .select('family_base_club_id, roster_owner_club_id, division_club_id')
                .eq('family_base_club_id', familyRootId);

            if (fallback.error) {
                if (isMissingTableError(fallback.error)) return [];
                throw fallback.error;
            }

            rows = (fallback.data ?? []).map((row) => ({
                ...row,
                group_name: null,
            })) as SharedRosterLinkRow[];
        } else {
            throw result.error;
        }
    }

    const grouped = new Map<string, SharedRosterGroup>();

    for (const row of rows ?? []) {
        const rosterOwnerClubId = String(row.roster_owner_club_id || '');
        const divisionClubId = String(row.division_club_id || '');
        if (!rosterOwnerClubId || !divisionClubId) continue;

        const name = typeof row.group_name === 'string' && row.group_name.trim()
            ? row.group_name.trim()
            : 'Plantel compartido';
        const id = buildGroupId(rosterOwnerClubId, name);
        const existing = grouped.get(id) ?? {
            id,
            name,
            rosterOwnerClubId,
            clubIds: [rosterOwnerClubId],
        };

        existing.clubIds = Array.from(new Set([...existing.clubIds, divisionClubId]));
        grouped.set(id, existing);
    }

    return Array.from(grouped.values()).sort((left, right) => left.name.localeCompare(right.name));
}

export async function getClubAdminTeamScope(
    supabase: SupabaseServerClient,
    activeClubId: string,
    memberships: MembershipLike[] | null | undefined,
    rawRole?: string | null,
): Promise<ClubAdminTeamScope> {
    const [managed, family] = await Promise.all([
        getManagedClubSummaries(supabase, memberships),
        getClubFamilySummary(supabase, activeClubId),
    ]);

    const managedById = new Map(managed.clubs.map((club) => [club.id, club]));
    const sharedRosterGroups = await fetchSharedRosterGroups(supabase, family.rootClubId);
    const sharedRosterGroupIdsByClub = new Map<string, string[]>();

    for (const group of sharedRosterGroups) {
        for (const clubId of group.clubIds) {
            sharedRosterGroupIdsByClub.set(clubId, [
                ...(sharedRosterGroupIdsByClub.get(clubId) ?? []),
                group.id,
            ]);
        }
    }

    const canManageFamily = isGlobalAdminRole(rawRole) || family.clubs.some((club) => (
        hasScopedMembershipAccess(
            { memberships: memberships ?? [] },
            'club_family',
            club.id,
            EDIT_MEMBERSHIP_ROLES,
        )
    ));

    return {
        rootClubId: family.rootClubId,
        rootClubName: family.rootClubName,
        activeClubId,
        manageableClubIds: managed.clubs
            .filter((club) => club.familyRootId === family.rootClubId)
            .map((club) => club.id),
        canManageFamily,
        teams: family.clubs.map((club) => {
            const access = managedById.get(club.id);

            return {
                id: club.id,
                name: club.name,
                shortName: club.shortName,
                logoUrl: club.logoUrl,
                sport: club.sport,
                parentClubId: club.parentClubId,
                parentClubName: club.parentClubName,
                isRoot: club.isRoot,
                isCurrent: club.isCurrent,
                canManage: Boolean(access),
                accessRole: access?.accessRole ?? null,
                accessSource: access?.accessSource ?? null,
                sharedRosterGroupIds: sharedRosterGroupIdsByClub.get(club.id) ?? [],
            } satisfies ClubAdminFamilyTeam;
        }),
        sharedRosterGroups,
    };
}
