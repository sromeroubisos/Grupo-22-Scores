import { createClient } from '@/lib/supabase/server';
import { resolveClubFamilyIds } from '@/lib/club-admin/managedClubFamily';
import {
    EDIT_MEMBERSHIP_ROLES,
    MANAGEMENT_MEMBERSHIP_ROLES,
    VIEW_MEMBERSHIP_ROLES,
    isGlobalAdminRole,
    normalizeRole,
    type AppUserRole,
    type MembershipLike,
    type MembershipRole,
    type MembershipScope,
} from '@/lib/auth/roles';

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;
type AllowedMembershipRoles = ReadonlySet<string>;

export interface UserAccessContext {
    userId: string;
    rawRole: string | null;
    role: AppUserRole;
    memberships: MembershipLike[];
}

export interface TournamentManagementTarget {
    tournamentId: string;
    sportId: string | null;
    unionId: string | null;
}

export interface ClubManagementTarget {
    clubId: string;
    sportId: string | null;
    unionId: string | null;
    familyRootId: string;
    familyClubIds: string[];
}

export interface MatchManagementTarget {
    matchId: string;
    tournamentId: string | null;
    sportId: string | null;
    unionId: string | null;
}

function normalizeMembershipRows(
    rows: Array<{ scope_type: string; scope_id: string; role: string }> | null | undefined
): MembershipLike[] {
    return (rows || []).map((row) => ({
        scopeType: row.scope_type as MembershipScope,
        scopeId: row.scope_id,
        role: row.role,
    }));
}

export async function getUserAccessContext(
    supabase: SupabaseServerClient
): Promise<UserAccessContext | null> {
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
        return null;
    }

    const { data: profileData } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();

    const rawRole = profileData?.role || user.user_metadata?.role || null;

    return {
        userId: user.id,
        rawRole,
        role: normalizeRole(rawRole),
        memberships: [],
    };
}

export async function requireUserAccessContext(
    supabase: SupabaseServerClient
): Promise<UserAccessContext> {
    const context = await getUserAccessContext(supabase);

    if (!context) {
        throw new Error('Unauthorized');
    }

    return context;
}

export async function requireGlobalAdminContext(
    supabase: SupabaseServerClient
): Promise<UserAccessContext> {
    const context = await requireUserAccessContext(supabase);

    if (!isGlobalAdminRole(context.role)) {
        throw new Error('Forbidden');
    }

    return context;
}

export function hasScopedMembershipAccess(
    context: Pick<UserAccessContext, 'memberships'>,
    scopeType: MembershipScope,
    scopeId: string | null | undefined,
    allowedRoles: AllowedMembershipRoles = MANAGEMENT_MEMBERSHIP_ROLES
): boolean {
    if (!scopeId) {
        return false;
    }

    return context.memberships.some((membership) =>
        membership.scopeType === scopeType &&
        membership.scopeId === scopeId &&
        allowedRoles.has(membership.role)
    );
}

export function hasAnyScopedMembershipAccess(
    context: Pick<UserAccessContext, 'memberships'>,
    scopeTypes: MembershipScope[],
    allowedRoles: AllowedMembershipRoles = MANAGEMENT_MEMBERSHIP_ROLES
): boolean {
    return context.memberships.some((membership) =>
        scopeTypes.includes(membership.scopeType) &&
        allowedRoles.has(membership.role)
    );
}

export function canManageSportContext(
    context: UserAccessContext,
    sportId: string | null | undefined,
    allowedRoles: AllowedMembershipRoles = MANAGEMENT_MEMBERSHIP_ROLES
): boolean {
    if (isGlobalAdminRole(context.role)) {
        return true;
    }

    return hasScopedMembershipAccess(context, 'sport', sportId, allowedRoles);
}

export function canManageTournamentContext(
    context: UserAccessContext,
    target: TournamentManagementTarget,
    allowedRoles: AllowedMembershipRoles = MANAGEMENT_MEMBERSHIP_ROLES
): boolean {
    if (isGlobalAdminRole(context.role)) {
        return true;
    }

    return (
        hasScopedMembershipAccess(context, 'tournament', target.tournamentId, allowedRoles) ||
        hasScopedMembershipAccess(context, 'sport', target.sportId, allowedRoles) ||
        hasScopedMembershipAccess(context, 'union', target.unionId, allowedRoles)
    );
}

export function canManageClubContext(
    context: UserAccessContext,
    target: ClubManagementTarget,
    allowedRoles: AllowedMembershipRoles = EDIT_MEMBERSHIP_ROLES
): boolean {
    if (isGlobalAdminRole(context.role)) {
        return true;
    }

    return (
        hasScopedMembershipAccess(context, 'club', target.clubId, allowedRoles) ||
        target.familyClubIds.some((clubId) =>
            hasScopedMembershipAccess(context, 'club_family', clubId, allowedRoles)
        ) ||
        hasScopedMembershipAccess(context, 'sport', target.sportId, allowedRoles) ||
        hasScopedMembershipAccess(context, 'union', target.unionId, allowedRoles)
    );
}

export function canManageMatchContext(
    context: UserAccessContext,
    target: MatchManagementTarget,
    allowedRoles: AllowedMembershipRoles = MANAGEMENT_MEMBERSHIP_ROLES
): boolean {
    if (isGlobalAdminRole(context.role)) {
        return true;
    }

    return (
        hasScopedMembershipAccess(context, 'match', target.matchId, allowedRoles) ||
        hasScopedMembershipAccess(context, 'tournament', target.tournamentId, allowedRoles) ||
        hasScopedMembershipAccess(context, 'sport', target.sportId, allowedRoles) ||
        hasScopedMembershipAccess(context, 'union', target.unionId, allowedRoles)
    );
}

export async function getTournamentManagementTarget(
    supabase: SupabaseServerClient,
    tournamentId: string
): Promise<TournamentManagementTarget | null> {
    const { data, error } = await supabase
        .from('tournaments')
        .select('id, sport_id, union_id')
        .eq('id', tournamentId)
        .maybeSingle();

    if (error || !data) {
        return null;
    }

    return {
        tournamentId: data.id,
        sportId: data.sport_id ?? null,
        unionId: data.union_id ?? null,
    };
}

export async function getClubManagementTarget(
    supabase: SupabaseServerClient,
    clubId: string
): Promise<ClubManagementTarget | null> {
    const { data, error } = await supabase
        .from('clubs')
        .select('id, sport_id, union_id')
        .eq('id', clubId)
        .maybeSingle();

    if (error || !data) {
        return null;
    }

    const family = await resolveClubFamilyIds(supabase, data.id).catch(() => ({
        rootClubId: data.id,
        clubIds: [data.id],
    }));

    return {
        clubId: data.id,
        sportId: data.sport_id ?? null,
        unionId: data.union_id ?? null,
        familyRootId: family.rootClubId,
        familyClubIds: family.clubIds,
    };
}

export async function getMatchManagementTarget(
    supabase: SupabaseServerClient,
    matchId: string
): Promise<MatchManagementTarget | null> {
    const { data: matchData, error: matchError } = await supabase
        .from('matches')
        .select('id, tournament_id, sport_id, sport')
        .eq('id', matchId)
        .maybeSingle();

    if (matchError || !matchData) {
        return null;
    }

    let tournamentTarget: TournamentManagementTarget | null = null;
    if (matchData.tournament_id) {
        tournamentTarget = await getTournamentManagementTarget(supabase, matchData.tournament_id);
    }

    const fallbackSportId = typeof matchData.sport === 'string' ? matchData.sport : null;

    return {
        matchId: matchData.id,
        tournamentId: matchData.tournament_id ?? null,
        sportId: matchData.sport_id ?? tournamentTarget?.sportId ?? fallbackSportId,
        unionId: tournamentTarget?.unionId ?? null,
    };
}

export const MEMBERSHIP_ROLE_OPTIONS: MembershipRole[] = ['admin', 'editor', 'operator', 'viewer'];
export const ACCESS_VIEW_ROLE_SET = VIEW_MEMBERSHIP_ROLES;
