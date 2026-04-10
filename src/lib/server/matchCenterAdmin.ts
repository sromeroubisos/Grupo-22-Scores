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
    const context = await ensureMatchManagementAccess(matchId, allowedRoles);
    const readClient = await getReadClient();
    const { data, error } = await fetchMatchCenterMatch(readClient, matchId);

    if (error || !data) {
        throw new Error('Match not found');
    }

    return { context, match: data };
}
