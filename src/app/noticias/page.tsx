import { getServerAuthRole } from '@/lib/auth/newsAccess';
import { hasNewsManagementAccess } from '@/lib/auth/roles';
import NoticiasClient from './NoticiasClient';
import { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Noticias | Torneos',
    description: 'Últimas noticias y actualizaciones',
};

export default async function NoticiasPage() {
    const { supabase, role } = await getServerAuthRole();
    const canManageNews = hasNewsManagementAccess(role);

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
