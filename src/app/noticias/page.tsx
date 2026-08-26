import { getServerAuthRole } from '@/lib/auth/newsAccess';
import { hasNewsManagementAccess } from '@/lib/auth/roles';
import { listVideoHubs } from '@/lib/server/videoHub';
import NoticiasClient from './NoticiasClient';
import { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Noticias | Torneos',
    description: 'Últimas noticias y actualizaciones',
};

const INITIAL_NEWS_LIMIT = 50;
const PUBLIC_INITIAL_NEWS_LIMIT = 10;

export default async function NoticiasPage() {
    const { supabase, role } = await getServerAuthRole();
    const canManageNews = hasNewsManagementAccess(role);

    // Editorial users see all (including drafts), public users only see published
    let query = supabase.from('news').select('*').order('published_at', { ascending: false });

    if (!canManageNews) {
        query = query.eq('status', 'published').limit(PUBLIC_INITIAL_NEWS_LIMIT);
    } else {
        query = query.limit(INITIAL_NEWS_LIMIT);
    }

    const [{ data: initialNews }, videoHubs] = await Promise.all([
        query,
        // Los hubs de video son un extra de la portada: si fallan, la portada sale igual.
        listVideoHubs().catch((error: unknown) => {
            console.error('[noticias] video hubs read failed:', error);
            return [];
        }),
    ]);

    return (
        <div style={{ minHeight: '100vh', background: '#0a0a0b' }}>
            <NoticiasClient
                initialNews={initialNews || []}
                canManageNews={canManageNews}
                videoHubs={videoHubs}
            />
        </div>
    );
}
