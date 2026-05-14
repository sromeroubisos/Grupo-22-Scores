import { canManageMatchContext, getMatchManagementTarget, requireUserAccessContext, type UserAccessContext } from '@/lib/auth/permissions';
import { MANAGEMENT_MEMBERSHIP_ROLES, hasFederationAdminAccess } from '@/lib/auth/roles';
import { fetchMatchCenterMatch } from '@/lib/services/matchCenterService';
import { getReadClient } from '@/lib/supabase/read';
import { createClient } from '@/lib/supabase/server';

type AllowedMembershipRoles = ReadonlySet<string>;

export async function ensureMatchManagementAccess(
    matchId: string,
    allowedRoles: AllowedMembershipRoles = MANAGEMENT_MEMBERSHIP_ROLES,
): Promise<UserAccessContext> {
    const supabase = await createClient();
    const context = await requireUserAccessContext(supabase);

    if (hasFederationAdminAccess(context.rawRole, context.memberships)) {
        return context;
    }

    const target = await getMatchManagementTarget(supabase, matchId);
    if (!target || !canManageMatchContext(context, target, allowedRoles)) {
        throw new Error('Forbidden');
    }

    return context;
}

export async function loadManagedMatchCenterMatch(
    matchId: string,
    allowedRoles: AllowedMembershipRoles = MANAGEMENT_MEMBERSHIP_ROLES,
) {
    // Fire the heavy match center read concurrently with the auth check.
    // Auth is awaited first so a forbidden caller short-circuits before we
    // do anything with the read result; the read promise is attached to a
    // .catch() to keep an unhandled rejection from being raised when auth
    // fails before the read finishes.
    const readClientPromise = getReadClient();
    const authPromise = ensureMatchManagementAccess(matchId, allowedRoles);

    type ReadResult = Awaited<ReturnType<typeof fetchMatchCenterMatch>>;
    const matchPromise: Promise<ReadResult | { data: null; error: Error }> = readClientPromise
        .then((readClient) => fetchMatchCenterMatch(readClient, matchId))
        .catch((err: unknown) => ({
            data: null,
            error: err instanceof Error ? err : new Error('Failed to load match.'),
        }));

    const context = await authPromise;
    const { data, error } = await matchPromise;

    if (error || !data) {
        throw new Error('Match not found');
    }

    return { context, match: data };
}
