import type { Session } from '@supabase/supabase-js';

import { createClient } from '@/lib/supabase/server';
import { hasNewsManagementAccess } from '@/lib/auth/roles';

type ServerAuthContext = {
    role: string | null;
    session: Session | null;
    supabase: Awaited<ReturnType<typeof createClient>>;
};

export async function getServerAuthRole(): Promise<ServerAuthContext> {
    const supabase = await createClient();
    const {
        data: { session },
    } = await supabase.auth.getSession();

    if (!session?.user?.id) {
        return { supabase, session: null, role: null };
    }

    const { data: userData } = await supabase
        .from('users')
        .select('role')
        .eq('id', session.user.id)
        .maybeSingle();

    return {
        supabase,
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
