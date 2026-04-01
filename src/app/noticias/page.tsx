import { createClient } from '@/lib/supabase/server';
import { hasEditorialAccess } from '@/lib/auth/roles';
import NoticiasClient from './NoticiasClient';
import { Metadata } from 'next';

export const dynamic = 'force-dynamic';

type MembershipRow = {
    scope_type: 'union' | 'sport' | 'tournament' | 'match' | 'club';
    scope_id?: string | null;
    role: string;
};

export const metadata: Metadata = {
    title: 'Noticias | Torneos',
    description: 'Últimas noticias y actualizaciones',
};

export default async function NoticiasPage() {
    const supabase = await createClient();

    const {
        data: { session },
    } = await supabase.auth.getSession();

    let canManageNews = false;

    if (session?.user?.id) {
        // Fetch the real role from public.users
        const { data: userData } = await supabase
            .from('users')
            .select('role')
            .eq('id', session.user.id)
            .single();

        const userRole = userData?.role || session.user.user_metadata?.role;

        // Fetch memberships
        const { data: memberships } = await supabase
            .from('memberships')
            .select('scope_type, scope_id, role')
            .eq('user_id', session.user.id);

        // Map memberships to the structure expected by the auth helpers
        const mappedMemberships = ((memberships || []) as MembershipRow[]).map((m) => ({
            scopeType: m.scope_type,
            scopeId: m.scope_id,
            role: m.role
        }));

        canManageNews = hasEditorialAccess(userRole, mappedMemberships);
    }

    // Editorial users see all (including drafts), public users only see published
    let query = supabase.from('news').select('*').order('published_at', { ascending: false });

    if (!canManageNews) {
        query = query.eq('status', 'published');
    }

    const { data: initialNews } = await query;

    return (
        <div style={{ minHeight: '100vh', background: '#0a0a0b' }}>
            <NoticiasClient
                initialNews={initialNews || []}
                canManageNews={canManageNews}
            />
        </div>
    );
}
