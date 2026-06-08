import { createClient } from '@/lib/supabase/server';
import { getReadClient } from '@/lib/supabase/read';
import { cookies } from 'next/headers';
import { logRefreshFlow } from '@/lib/debug/refreshFlow';
import { logRefreshLoop } from '@/lib/debug/refreshLoop';
import { resolveClubFamilyIds } from '@/lib/club-admin/managedClubFamily';
import { isUuid } from '@/lib/utils/postgrest';
import {
    EDIT_MEMBERSHIP_ROLES,
    MANAGEMENT_MEMBERSHIP_ROLES,
    VIEW_MEMBERSHIP_ROLES,
    isGlobalAdminRole,
    isTournamentAdminRole,
    resolveBestUserRole,
    type AppUserRole,
    type MembershipLike,
    type MembershipRole,
    type MembershipScope,
} from '@/lib/auth/roles';
import { getReservedAdminRole } from '@/lib/types/user';

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;
type AllowedMembershipRoles = ReadonlySet<string>;
const GUEST_CLUB_ACCESS_COOKIE = 'g22_guest_club_access';
const MISSING_TABLE_CODES = new Set(['PGRST204', '42P01']);

export interface UserAccessContext {
    userId: string;
    rawRole: string | null;
    role: AppUserRole;
    memberships: MembershipLike[];
}

type GuestClubCookiePayload = {
    kind?: string;
    clubHint?: string;
    membershipRole?: string;
};

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

function getErrorCode(error: unknown) {
    if (!error || typeof error !== 'object' || !('code' in error)) {
        return null;
    }

    const code = (error as { code?: unknown }).code;
    return typeof code === 'string' ? code : null;
}

function isMissingTableError(error: unknown) {
    const code = getErrorCode(error);
    return Boolean(code && MISSING_TABLE_CODES.has(code));
}

function normalizeLookupToken(value: string) {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
        .replace(/\s+/g, ' ');
}

function isAllowedGuestClubHint(value: string) {
    const normalized = normalizeLookupToken(value);
    return normalized === 'la tablada' || normalized === 'tablada';
}

function parseGuestClubCookie(rawValue?: string | null): GuestClubCookiePayload | null {
    if (!rawValue) {
        return null;
    }

    try {
        const parsed = JSON.parse(rawValue) as GuestClubCookiePayload;
        return parsed?.kind === 'club_family_guest' ? parsed : null;
    } catch {
        return null;
    }
}

async function resolveGuestClubIdFromHint(clubHint: string): Promise<string | null> {
    const normalizedHint = normalizeLookupToken(clubHint);
    if (!normalizedHint || !isAllowedGuestClubHint(normalizedHint)) {
        return null;
    }

    const readClient = await getReadClient();
    const searchTerms = Array.from(new Set([
        normalizedHint,
        normalizedHint.replace(/\s+/g, '-'),
        ...normalizedHint.split(' ').filter((chunk) => chunk.length >= 3),
    ]));

    for (const term of searchTerms) {
        const { data, error } = await readClient
            .from('clubs')
            .select('id, name, short_name')
            .or(`name.ilike.%${term}%,short_name.ilike.%${term}%`)
            .limit(25);

        if (error) {
            throw error;
        }

        const rows = Array.isArray(data) ? data : [];
        const ranked = rows
            .map((row) => {
                const name = normalizeLookupToken(row?.name ?? '');
                const shortName = normalizeLookupToken(row?.short_name ?? '');
                const exactName = name === normalizedHint;
                const exactShortName = shortName === normalizedHint;
                const includesName = Boolean(name && name.includes(normalizedHint));
                const includesShortName = Boolean(shortName && shortName.includes(normalizedHint));
                const wordMatch = normalizedHint.split(' ').some((word) => word.length >= 3 && (
                    name.includes(word) || shortName.includes(word)
                ));

                const score = exactName || exactShortName
                    ? 100
                    : includesName || includesShortName
                        ? 70
                        : wordMatch
                            ? 40
                            : 0;

                return {
                    id: typeof row?.id === 'string' ? row.id : null,
                    score,
                };
            })
            .filter((row): row is { id: string; score: number } => Boolean(row.id && row.score > 0))
            .sort((left, right) => right.score - left.score);

        if (ranked[0]?.id) {
            return ranked[0].id;
        }
    }

    return null;
}

async function getGuestAccessContext(): Promise<UserAccessContext | null> {
    const cookieStore = await cookies();
    const payload = parseGuestClubCookie(cookieStore.get(GUEST_CLUB_ACCESS_COOKIE)?.value);

    if (!payload?.clubHint) {
        return null;
    }

    if (!isAllowedGuestClubHint(payload.clubHint)) {
        return null;
    }

    const clubId = await resolveGuestClubIdFromHint(payload.clubHint).catch(() => null);
    if (!clubId) {
        return null;
    }

    return {
        userId: `guest:${clubId}`,
        rawRole: 'familia_club',
        role: 'familia_club',
        memberships: [{
            scopeType: 'club_family',
            scopeId: clubId,
            role: payload.membershipRole === 'admin' ? 'admin' : 'editor',
        }],
    };
}

export async function getUserAccessContext(
    supabase: SupabaseServerClient
): Promise<UserAccessContext | null> {
    const startedAt = Date.now();
    logRefreshFlow('permissions_get_user_start', {
        operation: 'getUserAccessContext',
    }, 'auth');
    logRefreshLoop('getUserAccessContext_start', {
        operation: 'getUserAccessContext',
    });
    logRefreshLoop('getUser_called', {
        source: 'permissions.getUserAccessContext',
    });
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    logRefreshFlow('permissions_get_user_complete', {
        operation: 'getUserAccessContext',
        hasUser: Boolean(user),
        hasError: Boolean(userError),
        durationMs: Date.now() - startedAt,
    }, 'auth');
    logRefreshLoop('getUserAccessContext_end', {
        operation: 'getUserAccessContext',
        hasUser: Boolean(user),
        errorCode: userError && 'code' in userError && typeof (userError as { code?: unknown }).code === 'string'
            ? (userError as { code?: string }).code
            : (userError ? 'auth_error' : null),
        durationMs: Date.now() - startedAt,
    });

    if (userError || !user) {
        return getGuestAccessContext();
    }

    const [{ data: profileData }, membershipsResult] = await Promise.all([
        supabase
            .from('users')
            .select('role')
            .eq('id', user.id)
            .maybeSingle(),
        supabase
            .from('memberships')
            .select('scope_type, scope_id, role')
            .eq('user_id', user.id),
    ]);

    const memberships = membershipsResult.error && !isMissingTableError(membershipsResult.error)
        ? []
        : normalizeMembershipRows(membershipsResult.data);

    const role = resolveBestUserRole({
        reservedRole: getReservedAdminRole(user.email),
        profileRole: profileData?.role ?? null,
        appMetadata: user.app_metadata,
        userMetadata: user.user_metadata,
    });

    return {
        userId: user.id,
        rawRole: role,
        role,
        memberships,
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

export async function requireTournamentAdminContext(
    supabase: SupabaseServerClient
): Promise<UserAccessContext> {
    const context = await requireUserAccessContext(supabase);

    if (!isGlobalAdminRole(context.role) && !isTournamentAdminRole(context.role)) {
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
    // External provider IDs (FlashScore, ESPN) are not UUIDs and have no local
    // tournament target. Skip the lookup so we don't pass a non-UUID into the
    // `tournaments.id` (uuid) column — mirrors getMatchManagementTarget below.
    // This guards every tournament mutation route via requireTournamentMutationContext.
    if (!isUuid(tournamentId)) {
        return null;
    }

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
    // External provider IDs (FlashScore, ESPN, Rugby API) are not UUIDs and have no
    // local management target. Skip the lookup so we don't spam Postgres with
    // `invalid input syntax for type uuid` errors.
    if (!isUuid(matchId)) {
        return null;
    }

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
