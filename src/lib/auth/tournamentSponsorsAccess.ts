import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { TournamentApiError } from '@/lib/auth/tournamentApi';
import {
    canManageTournamentContext,
    requireUserAccessContext,
    type UserAccessContext,
} from '@/lib/auth/permissions';
import {
    MANAGEMENT_MEMBERSHIP_ROLES,
    VIEW_MEMBERSHIP_ROLES,
    isGlobalAdminRole,
    isTournamentAdminRole,
} from '@/lib/auth/roles';
import { isScopeAllowedTournament, resolveTournamentAdminScope } from '@/lib/auth/tournamentAdminScope';
import { isUuid } from '@/lib/utils/postgrest';
import type { LooseSupabaseClient } from '@/lib/supabase/loose';

export type TournamentSponsorsAccess = {
    actorUserId: string;
    context: UserAccessContext;
    /** Cliente admin: el scope ya quedó validado acá, RLS no aplica. */
    writer: LooseSupabaseClient;
};

/**
 * Quién puede administrar los sponsors de un torneo. Es la unión de los dos
 * modelos de permisos que conviven en el gestor:
 *
 *  1. Membresías (`canManageTournamentContext`): admin global, o membresía
 *     sobre el torneo, el deporte o la unión. Es lo que usan las rutas
 *     /api/tournaments/[id]/*.
 *  2. Scope del Panel Torneos (`resolveTournamentAdminScope`): un
 *     gestor_torneos que CREÓ el torneo (created_by_user_id) sin membresía.
 *     Es lo que usan las rutas /api/admin/torneo/*.
 *
 * El torneo se lee con el cliente admin a propósito: la RLS de `tournaments`
 * solo deja ver los publicados, así que con el cliente del usuario un gestor
 * recibía 404 sobre su propio borrador.
 */
export async function requireTournamentSponsorsAccess(
    tournamentId: string,
    mode: 'read' | 'write',
): Promise<TournamentSponsorsAccess> {
    if (!isUuid(tournamentId)) {
        throw new TournamentApiError('Tournament not found', 404);
    }

    const authClient = await createClient();
    let context: UserAccessContext;
    try {
        context = await requireUserAccessContext(authClient);
    } catch {
        throw new TournamentApiError('Unauthorized', 401);
    }

    const writer = createAdminClient();
    const { data: tournament, error } = await writer
        .from('tournaments')
        .select('id, sport_id, union_id')
        .eq('id', tournamentId)
        .maybeSingle();

    if (error || !tournament) {
        throw new TournamentApiError('Tournament not found', 404);
    }

    const allowedRoles = mode === 'read' ? VIEW_MEMBERSHIP_ROLES : MANAGEMENT_MEMBERSHIP_ROLES;
    const target = {
        tournamentId: String(tournament.id),
        sportId: (tournament.sport_id as string | null) ?? null,
        unionId: (tournament.union_id as string | null) ?? null,
    };

    let allowed = isGlobalAdminRole(context.role) || canManageTournamentContext(context, target, allowedRoles);

    if (!allowed && isTournamentAdminRole(context.role)) {
        const scope = await resolveTournamentAdminScope(authClient, context);
        allowed = isScopeAllowedTournament(scope, tournamentId);
    }

    if (!allowed) {
        throw new TournamentApiError('Forbidden', 403);
    }

    return { actorUserId: context.userId, context, writer };
}
