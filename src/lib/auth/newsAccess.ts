import type { Session } from '@supabase/supabase-js';

import { createClient } from '@/lib/supabase/server';
import { getReadClient } from '@/lib/supabase/read';
import { hasNewsManagementAccess } from '@/lib/auth/roles';
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
        role: userData?.role || session.user.user_metadata?.role || null,
    };
}

export async function canManageNewsServer(): Promise<boolean> {
    const { role } = await getServerAuthRole();
    return hasNewsManagementAccess(role);
}

export async function requireNewsSuperAdminServer() {
    const context = await getServerAuthRole();

    if (!context.session?.user?.id || !hasNewsManagementAccess(context.role)) {
        throw new Error('Unauthorized');
    }

    return context;
}
