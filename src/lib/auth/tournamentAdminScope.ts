import type { createClient } from '@/lib/supabase/server';
import { isGlobalAdminRole } from '@/lib/auth/roles';
import { getServiceWriter } from '@/lib/supabase/serviceWriter';
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
 *   - Every club participating in any tournament the user can access
 *     (tournament access cascades to its clubs, resolved dynamically so it
 *     stays in sync as participants change — no re-granting needed)
 */
export async function resolveTournamentAdminScope(
    supabase: SupabaseServerClient,
    context: UserAccessContext
): Promise<TournamentAdminScope> {
    // Local preview override: PREVIEW_TOURNAMENT_IDS restringe TODO el gestor
    // de torneos a un set fijo de torneos, sin importar el rol (incluido
    // admin global). Se setea solo en .env.local para previews; en
    // producción/Vercel la variable no existe → comportamiento normal.
    const previewTournamentIds = (process.env.PREVIEW_TOURNAMENT_IDS || '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);

    if (previewTournamentIds.length > 0) {
        const tournamentIds = new Set(previewTournamentIds);
        const clubIds = new Set<string>();
        const previewReader = getServiceWriter(supabase, 'resolveTournamentAdminScope:preview');
        const { data: previewClubs } = await previewReader
            .from('tournament_participants')
            .select('club_id')
            .in('tournament_id', Array.from(tournamentIds));

        for (const row of previewClubs ?? []) {
            if (typeof row.club_id === 'string' && row.club_id.length > 0) {
                clubIds.add(row.club_id);
            }
        }

        return {
            isUnlimited: false,
            tournamentIds,
            clubIds,
            createdByUserId: context.userId,
        };
    }

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

    // Service-role: a gestor_torneos owns drafts that the RLS SELECT policy
    // (public read = published+visible only) would hide, so the request client
    // would silently drop them from scope. Filtered by created_by_user_id.
    const reader = getServiceWriter(supabase, 'resolveTournamentAdminScope');
    const { data: ownedTournaments } = await reader
        .from('tournaments')
        .select('id')
        .eq('created_by_user_id', context.userId);

    for (const row of ownedTournaments ?? []) {
        if (typeof row.id === 'string') tournamentIds.add(row.id);
    }

    // Cascade: access to a tournament implies access to all of its clubs.
    // When a Super Admin grants tournament access (or the gestor owns the
    // tournament), the gestor must be able to manage its participating clubs.
    // Resolved here from tournament_participants so clubs added/removed later
    // are reflected automatically. Service-role read (already RLS-safe above);
    // tournament_participants is public-read anyway.
    if (tournamentIds.size > 0) {
        const { data: participantClubs } = await reader
            .from('tournament_participants')
            .select('club_id')
            .in('tournament_id', Array.from(tournamentIds));

        for (const row of participantClubs ?? []) {
            if (typeof row.club_id === 'string' && row.club_id.length > 0) {
                clubIds.add(row.club_id);
            }
        }
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
