import type { Session } from '@supabase/supabase-js';

import { createClient } from '@/lib/supabase/server';
import { getReadClient } from '@/lib/supabase/read';
import { hasNewsManagementAccess, resolveBestUserRole } from '@/lib/auth/roles';
import { getReservedAdminRole } from '@/lib/types/user';
import type { LooseSupabaseClient } from '@/lib/supabase/loose';

type ServerAuthContext = {
    role: string | null;
    session: Session | null;
    supabase: LooseSupabaseClient;
};

export async function getServerAuthRole(): Promise<ServerAuthContext> {
    const authClient = await createClient();
    const fallbackToAnonymous = async (error?: unknown): Promise<ServerAuthContext> => {
        if (error) {
            console.warn('[newsAccess] Treating auth lookup as anonymous:', error);
        }
        return {
            supabase: await getReadClient(),
            session: null,
            role: null,
        };
    };

    let session: Session | null = null;

    try {
        const { data, error } = await authClient.auth.getSession();
        if (error) {
            return fallbackToAnonymous(error);
        }
        session = data.session;
    } catch (error) {
        return fallbackToAnonymous(error);
    }

    if (!session?.user?.id) {
        return fallbackToAnonymous();
    }

    const { data: userData } = await authClient
        .from('users')
        .select('role')
        .eq('id', session.user.id)
        .maybeSingle();

    return {
        supabase: authClient,
        session,
        role: resolveBestUserRole({
            reservedRole: getReservedAdminRole(session.user.email),
            profileRole: userData?.role ?? null,
            appMetadata: session.user.app_metadata,
            userMetadata: session.user.user_metadata,
        }),
    };
}

export async function canManageNewsServer(): Promise<boolean> {
    const { role } = await getServerAuthRole();
    return hasNewsManagementAccess(role);
}

/**
 * Exige sesión verificada y permiso de noticias. El nombre viene de cuando
 * era solo el super admin; hoy `hasNewsManagementAccess` cubre cualquier rol
 * de administración y la redacción.
 */
export async function requireNewsSuperAdminServer() {
    const context = await getServerAuthRole();

    if (!context.session?.user?.id || !hasNewsManagementAccess(context.role)) {
        throw new Error('Unauthorized');
    }

    return context;
}
