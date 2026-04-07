import { createClient } from '@/lib/supabase/server';
import {
    MANAGEMENT_MEMBERSHIP_ROLES,
    type MembershipLike,
    type MembershipRole,
} from '@/lib/auth/roles';

const MISSING_TABLE_CODES = new Set(['PGRST204', '42P01']);
type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type ClubSummaryRow = {
    id: string;
    name: string | null;
    short_name: string | null;
    logo_url: string | null;
    sport?: string | null;
    sport_id?: string | null;
};

function getErrorCode(error: unknown) {
    if (!error || typeof error !== 'object' || !('code' in error)) {
        return null;
    }

    const code = (error as { code?: unknown }).code;
    return typeof code === 'string' ? code : null;
}

export interface ManagedClubSummary {
    id: string;
    name: string;
    shortName: string | null;
    logoUrl: string | null;
    sport: string | null;
    familyRootId: string;
    familyRootName: string | null;
    accessRole: string;
    accessSource: 'direct' | 'family';
    isDirect: boolean;
}

export interface ClubFamilyMemberSummary {
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

function isMissingTableError(error: unknown) {
    const code = getErrorCode(error);
    return Boolean(code && MISSING_TABLE_CODES.has(code));
}

function isMissingColumnError(error: unknown) {
    return getErrorCode(error) === '42703';
}

function toClubSummaryRows(data: unknown): ClubSummaryRow[] {
    return (Array.isArray(data) ? data : []) as ClubSummaryRow[];
}

async function fetchClubSummaryRows(
    supabase: SupabaseServerClient,
    clubIds: string[]
): Promise<ClubSummaryRow[]> {
    const fullResult = await supabase
        .from('clubs')
        .select('id, name, short_name, logo_url, sport, sport_id')
        .in('id', clubIds);

    if (!fullResult.error) {
        return toClubSummaryRows(fullResult.data);
    }

    if (!isMissingColumnError(fullResult.error)) {
        throw fullResult.error;
    }

    const fallbackResult = await supabase
        .from('clubs')
        .select('id, name, short_name, logo_url')
        .in('id', clubIds);

    if (fallbackResult.error) {
        throw fallbackResult.error;
    }

    return toClubSummaryRows(fallbackResult.data).map((club) => ({
        ...club,
        sport: null,
        sport_id: null,
    }));
}

function rolePriority(role: string) {
    switch (role) {
        case 'admin':
            return 3;
        case 'editor':
            return 2;
        case 'operator':
            return 1;
        case 'viewer':
            return 0;
        default:
            return -1;
    }
}

async function findParentClubId(supabase: SupabaseServerClient, clubId: string): Promise<string | null> {
    const { data, error } = await supabase
        .from('club_derivatives')
        .select('base_club_id')
        .eq('derived_club_id', clubId);

    if (error) {
        if (isMissingTableError(error)) return null;
        throw error;
    }

    const rows = Array.isArray(data) ? data : [];
    return typeof rows[0]?.base_club_id === 'string' ? rows[0].base_club_id : null;
}

async function findDerivedClubIds(supabase: SupabaseServerClient, clubId: string): Promise<string[]> {
    const { data, error } = await supabase
        .from('club_derivatives')
        .select('derived_club_id')
        .eq('base_club_id', clubId);

    if (error) {
        if (isMissingTableError(error)) return [];
        throw error;
    }

    return (Array.isArray(data) ? data : [])
        .map((row) => row?.derived_club_id)
        .filter((value): value is string => typeof value === 'string' && value.length > 0);
}

export async function resolveClubFamilyIds(supabase: SupabaseServerClient, clubId: string): Promise<{
    rootClubId: string;
    clubIds: string[];
}> {
    const visitedParents = new Set<string>([clubId]);
    let rootClubId = clubId;
    let currentClubId = clubId;

    while (true) {
        const parentClubId = await findParentClubId(supabase, currentClubId);
        if (!parentClubId || visitedParents.has(parentClubId)) {
            break;
        }

        visitedParents.add(parentClubId);
        rootClubId = parentClubId;
        currentClubId = parentClubId;
    }

    const familyIds = new Set<string>([rootClubId]);
    const queue = [rootClubId];
    const visitedDescendants = new Set<string>();

    while (queue.length > 0) {
        const nextClubId = queue.shift();
        if (!nextClubId || visitedDescendants.has(nextClubId)) {
            continue;
        }

        visitedDescendants.add(nextClubId);
        const derivedClubIds = await findDerivedClubIds(supabase, nextClubId);

        for (const derivedClubId of derivedClubIds) {
            if (!familyIds.has(derivedClubId)) {
                familyIds.add(derivedClubId);
                queue.push(derivedClubId);
            }
        }
    }

    return {
        rootClubId,
        clubIds: Array.from(familyIds),
    };
}

export async function getManagedClubSummaries(
    supabase: SupabaseServerClient,
    memberships?: MembershipLike[] | null
): Promise<{
    clubs: ManagedClubSummary[];
    defaultClubId: string | null;
}> {
    const directMemberships = (memberships || []).filter(
        (membership) =>
            membership.scopeType === 'club' &&
            membership.scopeId &&
            MANAGEMENT_MEMBERSHIP_ROLES.has(membership.role as MembershipRole)
    );

    if (directMemberships.length === 0) {
        return { clubs: [], defaultClubId: null };
    }

    const familyAccess = new Map<string, {
        familyRootId: string;
        accessRole: string;
        isDirect: boolean;
    }>();
    const defaultClubId = directMemberships[0]?.scopeId ?? null;

    for (const membership of directMemberships) {
        const scopeId = membership.scopeId!;
        const family = await resolveClubFamilyIds(supabase, scopeId);

        for (const familyClubId of family.clubIds) {
            const current = familyAccess.get(familyClubId);
            const nextPriority = rolePriority(membership.role);
            const currentPriority = current ? rolePriority(current.accessRole) : -1;

            if (!current || nextPriority > currentPriority) {
                familyAccess.set(familyClubId, {
                    familyRootId: family.rootClubId,
                    accessRole: membership.role,
                    isDirect: familyClubId === scopeId,
                });
                continue;
            }

            if (familyClubId === scopeId && !current.isDirect) {
                familyAccess.set(familyClubId, {
                    ...current,
                    isDirect: true,
                });
            }
        }
    }

    const clubIds = Array.from(familyAccess.keys());
    if (clubIds.length === 0) {
        return { clubs: [], defaultClubId };
    }

    const clubRows = await fetchClubSummaryRows(supabase, clubIds);
    const clubById = new Map(clubRows.map((club) => [club.id, club]));

    const summaries = clubIds
        .map((clubId) => {
            const access = familyAccess.get(clubId);
            const club = clubById.get(clubId);
            if (!access || !club) return null;

            const rootClub = clubById.get(access.familyRootId);

            return {
                id: club.id,
                name: club.name || 'Club',
                shortName: club.short_name || null,
                logoUrl: club.logo_url || null,
                sport: club.sport || club.sport_id || null,
                familyRootId: access.familyRootId,
                familyRootName: rootClub?.name || null,
                accessRole: access.accessRole,
                accessSource: access.isDirect ? 'direct' : 'family',
                isDirect: access.isDirect,
            } satisfies ManagedClubSummary;
        })
        .filter((club): club is ManagedClubSummary => club !== null)
        .sort((left, right) => {
            const rootCompare = String(left.familyRootName || left.familyRootId).localeCompare(
                String(right.familyRootName || right.familyRootId)
            );
            if (rootCompare !== 0) return rootCompare;

            if (left.familyRootId === left.id && right.familyRootId !== right.id) return -1;
            if (right.familyRootId === right.id && left.familyRootId !== left.id) return 1;

            return left.name.localeCompare(right.name);
        }) as ManagedClubSummary[];

    return {
        clubs: summaries,
        defaultClubId,
    };
}

export async function getClubFamilySummary(
    supabase: SupabaseServerClient,
    clubId: string
): Promise<{
    rootClubId: string;
    rootClubName: string | null;
    clubs: ClubFamilyMemberSummary[];
}> {
    const family = await resolveClubFamilyIds(supabase, clubId);
    const clubIds = family.clubIds;

    if (clubIds.length === 0) {
        return {
            rootClubId: clubId,
            rootClubName: null,
            clubs: [],
        };
    }

    const [clubRows, parents] = await Promise.all([
        fetchClubSummaryRows(supabase, clubIds),
        Promise.all(
            clubIds.map(async (candidateId) => ({
                clubId: candidateId,
                parentClubId: await findParentClubId(supabase, candidateId),
            }))
        ),
    ]);
    const clubById = new Map(clubRows.map((club) => [club.id, club]));
    const parentById = new Map(parents.map((row) => [row.clubId, row.parentClubId]));
    const rootClub = clubById.get(family.rootClubId) ?? null;

    const clubs = clubIds
        .map((candidateId) => {
            const club = clubById.get(candidateId);
            if (!club) return null;

            return {
                id: club.id,
                name: club.name || 'Club',
                shortName: club.short_name || null,
                logoUrl: club.logo_url || null,
                sport: club.sport || club.sport_id || null,
                familyRootId: family.rootClubId,
                parentClubId: parentById.get(candidateId) ?? null,
                parentClubName: clubById.get(parentById.get(candidateId) ?? '')?.name || null,
                isRoot: candidateId === family.rootClubId,
                isCurrent: candidateId === clubId,
            } satisfies ClubFamilyMemberSummary;
        })
        .filter((club): club is ClubFamilyMemberSummary => club !== null)
        .sort((left, right) => {
            if (left.isRoot && !right.isRoot) return -1;
            if (right.isRoot && !left.isRoot) return 1;
            if (left.isCurrent && !right.isCurrent) return -1;
            if (right.isCurrent && !left.isCurrent) return 1;
            return left.name.localeCompare(right.name);
        });

    return {
        rootClubId: family.rootClubId,
        rootClubName: rootClub?.name || null,
        clubs,
    };
}
