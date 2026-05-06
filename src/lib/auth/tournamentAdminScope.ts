import type { createClient } from '@/lib/supabase/server';
import { isGlobalAdminRole } from '@/lib/auth/roles';
import type { UserAccessContext } from '@/lib/auth/permissions';

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export interface TournamentAdminScope {
    isUnlimited: boolean;
    tournamentIds: Set<string>;
    clubIds: Set<string>;
    createdByUserId: string | null;
}

const UNLIMITED_SCOPE: TournamentAdminScope = {
    isUnlimited: true,
    tournamentIds: new Set(),
    clubIds: new Set(),
    createdByUserId: null,
};

/**
 * Returns the set of tournament/club ids that a tournament-admin user can
 * see and operate on. Global admins return an "unlimited" sentinel scope.
 *
 * Sources of access for non-global admins:
 *   - Memberships granted by super admin (scope_type IN ('tournament', 'club'))
 *   - Tournaments where created_by_user_id matches the current user
 */
export async function resolveTournamentAdminScope(
    supabase: SupabaseServerClient,
    context: UserAccessContext
): Promise<TournamentAdminScope> {
    if (isGlobalAdminRole(context.role)) {
        return UNLIMITED_SCOPE;
    }

    const tournamentIds = new Set<string>();
    const clubIds = new Set<string>();

    for (const membership of context.memberships) {
        if (membership.role !== 'admin' && membership.role !== 'editor') continue;
        if (!membership.scopeId) continue;
        if (membership.scopeType === 'tournament') tournamentIds.add(membership.scopeId);
        if (membership.scopeType === 'club') clubIds.add(membership.scopeId);
    }

    const { data: ownedTournaments } = await supabase
        .from('tournaments')
        .select('id')
        .eq('created_by_user_id', context.userId);

    for (const row of ownedTournaments ?? []) {
        if (typeof row.id === 'string') tournamentIds.add(row.id);
    }

    return {
        isUnlimited: false,
        tournamentIds,
        clubIds,
        createdByUserId: context.userId,
    };
}

export function isScopeAllowedTournament(scope: TournamentAdminScope, tournamentId: string): boolean {
    return scope.isUnlimited || scope.tournamentIds.has(tournamentId);
}

export function isScopeAllowedClub(scope: TournamentAdminScope, clubId: string): boolean {
    return scope.isUnlimited || scope.clubIds.has(clubId);
}
