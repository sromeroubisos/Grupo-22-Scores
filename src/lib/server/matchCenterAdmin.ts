import { canManageMatchContext, getMatchManagementTarget, requireUserAccessContext, type UserAccessContext } from '@/lib/auth/permissions';
import { MANAGEMENT_MEMBERSHIP_ROLES, isGlobalAdminRole } from '@/lib/auth/roles';
import {
    isScopeAllowedTournament,
    resolveTournamentAdminScope,
} from '@/lib/auth/tournamentAdminScope';
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

    // Truly global admins (super_admin / admin_general) manage any match.
    if (isGlobalAdminRole(context.role)) {
        return context;
    }

    // Everyone else must be scoped to THIS match's tournament. We deliberately
    // do NOT grant blanket access by role (a tournament/federation admin role
    // alone is tournament-agnostic): a tournament admin may only manage matches
    // of the tournaments they are enabled on.
    const target = await getMatchManagementTarget(supabase, matchId);
    if (!target) {
        throw new Error('Forbidden');
    }

    // Scoped membership on the match's tournament / sport / union.
    if (canManageMatchContext(context, target, allowedRoles)) {
        return context;
    }

    // Tournaments the user created / has tournament-scoped access to (this
    // also covers the participant→club cascade), still bound to THIS match's
    // tournament — never another one.
    if (target.tournamentId) {
        const scope = await resolveTournamentAdminScope(supabase, context);
        if (isScopeAllowedTournament(scope, target.tournamentId)) {
            return context;
        }
    }

    throw new Error('Forbidden');
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

    if (!data) {
        // Solo el "no hay fila" es un 404 real. Un fallo de lectura (red, DB)
        // se lanza aparte para que la pagina NO lo disfrace de partido
        // inexistente — el detalle queda en el log del server.
        const code = (error as { code?: string } | null)?.code;
        if (!error || code === 'PGRST116') {
            throw new Error('Match not found');
        }
        console.error('[matchCenterAdmin] Failed to load match center match:', { matchId, error });
        throw new Error('Failed to load match.');
    }

    return { context, match: data };
}
