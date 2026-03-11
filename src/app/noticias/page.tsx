import { createClient } from '@/lib/supabase/server';
import { isAdminUser } from '@/lib/auth/roles';
import NoticiasClient from './NoticiasClient';
import { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Noticias | Torneos',
    description: 'Últimas noticias y actualizaciones',
};

export default async function NoticiasPage() {
    const supabase = await createClient();

    const {
        data: { session },
    } = await supabase.auth.getSession();

    let isAdmin = false;

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

        // Map memberships to the structure expected by isAdminUser
        const mappedMemberships = (memberships || []).map((m: any) => ({
            scopeType: m.scope_type,
            scopeId: m.scope_id,
            role: m.role
        }));

        isAdmin = isAdminUser(userRole, mappedMemberships);
    }

    // Fetch news depending on role
    // Admins see all (including drafts), normal users only see published
    let query = supabase.from('news').select('*').order('published_at', { ascending: false });

    if (!isAdmin) {
        query = query.eq('status', 'published');
    }

    const { data: initialNews, error } = await query;

    return (
        <div style={{ minHeight: '100vh', background: '#0a0a0b' }}>
            <NoticiasClient
                initialNews={initialNews || []}
                isAdmin={isAdmin}
            />
        </div>
    );
}
