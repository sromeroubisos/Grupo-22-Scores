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

    // getSession() decodifica la cookie sin verificar la firma, y de este rol
    // cuelga requireNewsSuperAdminServer(). Se conserva el `session` porque los
    // llamadores lo usan, pero el rol se resuelve sobre el usuario que Supabase
    // valida en getUser(). Si no coinciden, la cookie es fabricada.
    const { data: { user: verifiedUser }, error: verifyError } = await authClient.auth.getUser();

    if (verifyError || !verifiedUser || verifiedUser.id !== session.user.id) {
        return fallbackToAnonymous(verifyError);
    }

    const { data: userData } = await authClient
        .from('users')
        .select('role')
        .eq('id', verifiedUser.id)
        .maybeSingle();

    return {
        supabase: authClient,
        session,
        role: resolveBestUserRole({
            reservedRole: getReservedAdminRole(verifiedUser.email),
            profileRole: userData?.role ?? null,
            appMetadata: verifiedUser.app_metadata,
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
