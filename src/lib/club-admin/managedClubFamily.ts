import { createClient } from '@/lib/supabase/server';
import {
    MANAGEMENT_MEMBERSHIP_ROLES,
    type MembershipLike,
    type MembershipRole,
} from '@/lib/auth/roles';
import { buildTeamLogoProxyUrl, resolveSerializableLogoUrl } from '@/lib/utils/logoUrl';

const MISSING_TABLE_CODES = new Set(['PGRST204', '42P01']);
const MAX_CLUB_FAMILY_TRAVERSAL = 100;
type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;
type ClubLogoDeliveryMode = 'source' | 'proxy';

type ClubSummaryRow = {
    id: string;
    slug: string | null;
    name: string | null;
    short_name: string | null;
    logo_url?: string | null;
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
    slug: string | null;
    name: string;
    shortName: string | null;
    logoUrl: string | null;
    sport: string | null;
    familyRootId: string;
    familyRootName: string | null;
    accessRole: string;
    managementType: 'club' | 'club_family';
    accessSource: 'direct' | 'family' | 'shared_roster';
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
    clubIds: string[],
    options: { includeLogoUrls?: boolean; logoMode?: ClubLogoDeliveryMode } = {}
): Promise<ClubSummaryRow[]> {
    const logoMode = options.logoMode ?? (options.includeLogoUrls === false ? 'proxy' : 'source');
    const includeLogoUrls = logoMode === 'source';
    const fullSelect = includeLogoUrls
        ? 'id, slug, name, short_name, logo_url, sport, sport_id'
        : 'id, slug, name, short_name, sport, sport_id';
    const fallbackSelect = includeLogoUrls
        ? 'id, slug, name, short_name, logo_url'
        : 'id, slug, name, short_name';

    const fullResult = await supabase
        .from('clubs')
        .select(fullSelect)
        .in('id', clubIds);

    if (!fullResult.error) {
        return toClubSummaryRows(fullResult.data);
    }

    if (!isMissingColumnError(fullResult.error)) {
        throw fullResult.error;
    }

    const fallbackResult = await supabase
        .from('clubs')
        .select(fallbackSelect)
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

async function findSharedRosterLinkedClubIds(
    supabase: SupabaseServerClient,
    clubId: string
): Promise<string[]> {
    const { data: seedLinks, error } = await supabase
        .from('club_family_divisions')
        .select('roster_owner_club_id, division_club_id, group_name')
        .or(`roster_owner_club_id.eq.${clubId},division_club_id.eq.${clubId}`);

    if (error) {
        if (isMissingTableError(error)) return [];
        throw error;
    }

    const groupKeys = new Set(
        (Array.isArray(seedLinks) ? seedLinks : []).map((link) => (
            `${link?.roster_owner_club_id || ''}::${link?.group_name || ''}`
        ))
    );

    if (groupKeys.size === 0) {
        return [];
    }

    const rosterOwnerClubIds = Array.from(new Set(
        (Array.isArray(seedLinks) ? seedLinks : [])
            .map((link) => link?.roster_owner_club_id)
            .filter((value): value is string => typeof value === 'string' && value.length > 0)
    ));

    let relatedLinks = Array.isArray(seedLinks) ? seedLinks : [];
    if (rosterOwnerClubIds.length > 0) {
        const { data: ownerLinks, error: ownerLinksError } = await supabase
            .from('club_family_divisions')
            .select('roster_owner_club_id, division_club_id, group_name')
            .in('roster_owner_club_id', rosterOwnerClubIds);

        if (ownerLinksError) {
            if (!isMissingTableError(ownerLinksError)) {
                throw ownerLinksError;
            }
        } else {
            relatedLinks = (Array.isArray(ownerLinks) ? ownerLinks : []).filter((link) => (
                groupKeys.has(`${link?.roster_owner_club_id || ''}::${link?.group_name || ''}`)
            ));
        }
    }

    return Array.from(new Set(
        relatedLinks
            .flatMap((link) => [link?.roster_owner_club_id, link?.division_club_id])
            .filter((value): value is string => typeof value === 'string' && value.length > 0)
    ));
}

export async function resolveClubFamilyIds(supabase: SupabaseServerClient, clubId: string): Promise<{
    rootClubId: string;
    clubIds: string[];
}> {
    const visitedParents = new Set<string>([clubId]);
    let rootClubId = clubId;
    let currentClubId = clubId;
    let parentDepth = 0;

    while (parentDepth < MAX_CLUB_FAMILY_TRAVERSAL) {
        const parentClubId = await findParentClubId(supabase, currentClubId);
        if (!parentClubId || visitedParents.has(parentClubId)) {
            break;
        }

        visitedParents.add(parentClubId);
        rootClubId = parentClubId;
        currentClubId = parentClubId;
        parentDepth += 1;
    }

    if (parentDepth >= MAX_CLUB_FAMILY_TRAVERSAL) {
        console.warn('[managedClubFamily] parent traversal cap reached:', {
            clubId,
            traversalCap: MAX_CLUB_FAMILY_TRAVERSAL,
        });
    }

    const familyIds = new Set<string>([rootClubId]);
    const queue = [rootClubId];
    const visitedDescendants = new Set<string>();

    while (queue.length > 0 && visitedDescendants.size < MAX_CLUB_FAMILY_TRAVERSAL) {
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

    if (visitedDescendants.size >= MAX_CLUB_FAMILY_TRAVERSAL) {
        console.warn('[managedClubFamily] descendant traversal cap reached:', {
            clubId,
            rootClubId,
            traversalCap: MAX_CLUB_FAMILY_TRAVERSAL,
        });
    }

    return {
        rootClubId,
        clubIds: Array.from(familyIds),
    };
}

export async function getManagedClubSummaries(
    supabase: SupabaseServerClient,
    memberships?: MembershipLike[] | null,
    options: { includeLogoUrls?: boolean; logoMode?: ClubLogoDeliveryMode } = {}
): Promise<{
    clubs: ManagedClubSummary[];
    defaultClubId: string | null;
}> {
    const directMemberships = (memberships || []).filter(
        (membership) =>
            (membership.scopeType === 'club' || membership.scopeType === 'club_family') &&
            membership.scopeId &&
            MANAGEMENT_MEMBERSHIP_ROLES.has(membership.role as MembershipRole)
    );

    if (directMemberships.length === 0) {
        return { clubs: [], defaultClubId: null };
    }

    const familyResolutionCache = new Map<string, Promise<{
        rootClubId: string;
        clubIds: string[];
    }>>();
    const sharedRosterCache = new Map<string, Promise<string[]>>();
    const getFamilyResolution = (scopeId: string) => {
        const cached = familyResolutionCache.get(scopeId);
        if (cached) {
            return cached;
        }

        const created = resolveClubFamilyIds(supabase, scopeId).catch(() => ({
            rootClubId: scopeId,
            clubIds: [scopeId],
        }));
        familyResolutionCache.set(scopeId, created);
        return created;
    };
    const getSharedRosterLinks = (scopeId: string) => {
        const cached = sharedRosterCache.get(scopeId);
        if (cached) {
            return cached;
        }

        const created = findSharedRosterLinkedClubIds(supabase, scopeId).catch(() => []);
        sharedRosterCache.set(scopeId, created);
        return created;
    };
    const familyAccess = new Map<string, {
        familyRootId: string;
        accessRole: string;
        managementType: 'club' | 'club_family';
        accessSource: 'direct' | 'family' | 'shared_roster';
        isDirect: boolean;
    }>();
    const defaultClubId = directMemberships[0]?.scopeId ?? null;

    const preparedMemberships = await Promise.all(
        directMemberships.map(async (membership) => {
            const scopeId = membership.scopeId!;
            const managementType: 'club' | 'club_family' = membership.scopeType === 'club_family' ? 'club_family' : 'club';
            const resolvedFamily = await getFamilyResolution(scopeId);
            const familyClubIds = managementType === 'club_family'
                ? resolvedFamily.clubIds
                : Array.from(new Set([
                    scopeId,
                    ...await getSharedRosterLinks(scopeId),
                ]));

            return {
                membership,
                scopeId,
                managementType,
                resolvedFamily,
                familyClubIds,
            };
        })
    );

    for (const preparedMembership of preparedMemberships) {
        const { membership, scopeId, managementType, resolvedFamily, familyClubIds } = preparedMembership;

        for (const familyClubId of familyClubIds) {
            const current = familyAccess.get(familyClubId);
            const nextPriority = rolePriority(membership.role);
            const currentPriority = current ? rolePriority(current.accessRole) : -1;

            const prefersBroaderManagement =
                current?.managementType === 'club' && managementType === 'club_family';
            const accessSource =
                familyClubId === scopeId
                    ? 'direct'
                    : managementType === 'club_family'
                        ? 'family'
                        : 'shared_roster';

            if (!current || nextPriority > currentPriority || (nextPriority === currentPriority && prefersBroaderManagement)) {
                familyAccess.set(familyClubId, {
                    familyRootId: resolvedFamily.rootClubId,
                    accessRole: membership.role,
                    managementType,
                    accessSource,
                    isDirect: familyClubId === scopeId,
                });
                continue;
            }

            if (familyClubId === scopeId && !current.isDirect) {
                familyAccess.set(familyClubId, {
                    ...current,
                    accessSource: 'direct',
                    isDirect: true,
                });
            }
        }
    }

    const clubIds = Array.from(familyAccess.keys());
    if (clubIds.length === 0) {
        return { clubs: [], defaultClubId };
    }

    const clubRows = await fetchClubSummaryRows(supabase, clubIds, {
        logoMode: options.logoMode,
        includeLogoUrls: options.includeLogoUrls,
    });
    const clubById = new Map(clubRows.map((club) => [club.id, club]));

    const summaries = clubIds
        .map((clubId) => {
            const access = familyAccess.get(clubId);
            const club = clubById.get(clubId);
            if (!access || !club) return null;

            const rootClub = clubById.get(access.familyRootId);
            const clubName = club.name || 'Club';
            const logoMode = options.logoMode ?? (options.includeLogoUrls === false ? 'proxy' : 'source');
            const logoUrl = logoMode === 'proxy'
                ? buildTeamLogoProxyUrl({ key: club.id, name: clubName })
                : resolveSerializableLogoUrl(club.logo_url, { key: club.id, name: clubName });

            return {
                id: club.id,
                slug: club.slug || null,
                name: clubName,
                shortName: club.short_name || null,
                logoUrl,
                sport: club.sport || club.sport_id || null,
                familyRootId: access.familyRootId,
                familyRootName: rootClub?.name || null,
                accessRole: access.accessRole,
                managementType: access.managementType,
                accessSource: access.accessSource,
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
            const clubName = club.name || 'Club';

            return {
                id: club.id,
                name: clubName,
                shortName: club.short_name || null,
                logoUrl: resolveSerializableLogoUrl(club.logo_url, { key: club.id, name: clubName }),
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
