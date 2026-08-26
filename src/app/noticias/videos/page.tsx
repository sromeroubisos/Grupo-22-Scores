// El índice de hubs: todos los torneos que tienen videos, sin el tope de la
// portada de noticias. Cada tarjeta lleva al hub del torneo.

import type { Metadata } from 'next';

import { getServerAuthRole } from '@/lib/auth/newsAccess';
import { hasNewsManagementAccess } from '@/lib/auth/roles';
import { listVideoHubs } from '@/lib/server/videoHub';
import { listOpenVideoPolls } from '@/lib/server/videoPolls';
import type { VideoHubSummary } from '@/lib/videoHub/types';
import { VideoHubsIndex } from '../VideoHubCards';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Videos por torneo | Noticias',
    description: 'Todos los torneos con videos: highlights, partidos completos y clips, y la votación al mejor try o gol.',
};

export default async function VideoHubsIndexPage() {
    const [{ role }, hubs, openPolls] = await Promise.all([
        getServerAuthRole(),
        listVideoHubs().catch((error: unknown) => {
            console.error('[noticias/videos] video hubs read failed:', error);
            return [] as VideoHubSummary[];
        }),
        listOpenVideoPolls(),
    ]);

    const videoHubs: VideoHubSummary[] = hubs.map((hub) => ({
        ...hub,
        openPoll: openPolls.get(hub.tournament.id) ?? null,
    }));

    return <VideoHubsIndex hubs={videoHubs} canManage={hasNewsManagementAccess(role)} />;
}
