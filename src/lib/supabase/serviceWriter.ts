import type { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

type RequestClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Service-role client for the tournament-admin panel, with graceful fallback.
 *
 * The panel enforces access in the application layer
 * (`requireTournamentAdminContext` + `resolveTournamentAdminScope` +
 * `isScopeAllowed*`), so every query is already constrained to the caller's
 * scope BEFORE it reaches the database. RLS is therefore redundant here and,
 * worse, actively breaks the panel for its target role: there is no
 * membership- or `created_by_user_id`-based RLS policy on `tournaments` /
 * `tournament_participants`, only `is_admin()` (super_admin/admin_general/
 * admin/operator). A `gestor_torneos` using the request client cannot see
 * its own drafts, publish, delete or link clubs.
 *
 * Falls back to the request client if the service-role key is unavailable,
 * which preserves the previous (RLS-bound) behaviour instead of 500ing.
 */
export function getServiceWriter(fallback: RequestClient, tag: string): RequestClient {
    try {
        return createAdminClient() as unknown as RequestClient;
    } catch (error) {
        console.warn(`[${tag}] Service-role client unavailable, using request client:`, error);
        return fallback;
    }
}
