import {
    canManageClubContext,
    canManageMatchContext,
    getClubManagementTarget,
    getMatchManagementTarget,
    requireUserAccessContext,
    type UserAccessContext,
} from '@/lib/auth/permissions';
import { MANAGEMENT_MEMBERSHIP_ROLES, isGlobalAdminRole, isTournamentAdminRole } from '@/lib/auth/roles';
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

    // El partido que un club cargó desde su panel (`created_by_club_id`) lo
    // edita ese club: si puede crearlo y borrarlo, tiene que poder cargarle el
    // resultado. Se pide permiso sobre el club AUTOR, no sobre los que juegan:
    // figurar como local en un partido de torneo no da derecho a tocarlo.
    const { data: authorRow } = await supabase
        .from('matches')
        .select('created_by_club_id')
        .eq('id', target.matchId)
        .maybeSingle();
    const authorClubId = (authorRow as { created_by_club_id?: string | null } | null)?.created_by_club_id;
    if (authorClubId) {
        const clubTarget = await getClubManagementTarget(supabase, authorClubId);
        if (clubTarget && canManageClubContext(context, clubTarget, allowedRoles)) {
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

/**
 * A qué editor se manda a quien puede editar un partido.
 *
 * Los tres montan el mismo MatchCenterClient y las APIs validan partido por
 * partido; lo que cambia es la sección que rodea al editor, y cada sección tiene
 * su guarda por ROL. Un `admin_club` con membresía en un torneo pasa
 * `ensureMatchManagementAccess` pero rebota contra `/admin/torneo` (exige el rol
 * de gestor) y terminaba en la portada. Por eso el resto va a
 * `/matches/[id]/editar`, que no tiene guarda de rol propia.
 */
export function resolveMatchEditorHref(context: Pick<UserAccessContext, 'role'>, matchId: string): string {
    const id = encodeURIComponent(matchId);
    if (isGlobalAdminRole(context.role)) return `/admin/super/partidos/${id}`;
    if (isTournamentAdminRole(context.role)) return `/admin/torneo/partidos/${id}`;
    return `/matches/${id}/editar`;
}
