// La portada de Noticias: los torneos con videos arriba (con su último video
// y la votación abierta, si hay) y las notas abajo. Quien administra ve
// también los borradores.

import type { Metadata } from 'next';

import { getServerAuthRole } from '@/lib/auth/newsAccess';
import { hasNewsManagementAccess } from '@/lib/auth/roles';
import { listVideoHubs } from '@/lib/server/videoHub';
import { listOpenVideoPolls } from '@/lib/server/videoPolls';
import type { VideoHubSummary } from '@/lib/videoHub/types';
import NoticiasClient from './NoticiasClient';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Noticias | G22 Scores',
    description: 'Novedades y comunicados, y los videos de cada torneo: highlights, partidos completos y la votación al mejor try.',
};

const INITIAL_NEWS_LIMIT = 50;
const PUBLIC_INITIAL_NEWS_LIMIT = 10;

export default async function NoticiasPage() {
    const { supabase, role } = await getServerAuthRole();
    const canManageNews = hasNewsManagementAccess(role);

    // Quien edita ve todo (borradores incluidos); el público, solo lo publicado.
    let query = supabase.from('news').select('*').order('published_at', { ascending: false });

    if (!canManageNews) {
        query = query.eq('status', 'published').limit(PUBLIC_INITIAL_NEWS_LIMIT);
    } else {
        query = query.limit(INITIAL_NEWS_LIMIT);
    }

    const [{ data: initialNews }, hubs, openPolls] = await Promise.all([
        query,
        // Los hubs de video son un extra de la portada: si fallan, la portada sale igual.
        listVideoHubs().catch((error: unknown) => {
            console.error('[noticias] video hubs read failed:', error);
            return [] as VideoHubSummary[];
        }),
        // Nunca lanza: sin tablas o con error, no hay votación que anunciar.
        listOpenVideoPolls(),
    ]);

    const videoHubs: VideoHubSummary[] = hubs.map((hub) => ({
        ...hub,
        openPoll: openPolls.get(hub.tournament.id) ?? null,
    }));

    return (
        <NoticiasClient
            initialNews={initialNews || []}
            canManageNews={canManageNews}
            videoHubs={videoHubs}
        />
    );
}
