// El hub de videos de un torneo: los highlights, partidos completos y clips
// cargados en las fichas, juntos, más la votación al mejor try. Vive dentro
// de Noticias porque es contenido editorial, no un dato del torneo.

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';

import { getServerAuthRole } from '@/lib/auth/newsAccess';
import { hasNewsManagementAccess } from '@/lib/auth/roles';
import { getVideoHub, isVideoHubId } from '@/lib/server/videoHub';
import { listVideoPolls, VIDEO_POLLS_MIGRATION, type VideoPollsListing } from '@/lib/server/videoPolls';
import { playLabelForSport } from '@/lib/videoHub/polls';
import VideoHubClient from './VideoHubClient';

export const dynamic = 'force-dynamic';

type Props = {
    params: Promise<{ tournamentId: string }>;
};

// generateMetadata y la página piden el mismo hub en el mismo render.
const loadHub = cache((tournamentId: string) => getVideoHub(tournamentId));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { tournamentId } = await params;
    if (!isVideoHubId(tournamentId)) return { title: 'Videos | Noticias' };

    const hub = await loadHub(tournamentId).catch(() => null);
    if (!hub) return { title: 'Videos | Noticias' };

    const play = playLabelForSport(hub.tournament.sportId);
    return {
        title: `Videos de ${hub.tournament.name} | Noticias`,
        description: `Highlights, partidos completos y clips de ${hub.tournament.name}, y la votación al mejor ${play.singular}.`,
    };
}

export default async function VideoHubPage({ params }: Props) {
    const { tournamentId } = await params;
    if (!isVideoHubId(tournamentId)) notFound();

    const [{ role, session }, hub] = await Promise.all([
        getServerAuthRole(),
        loadHub(tournamentId),
    ]);
    if (!hub) notFound();

    const canManage = hasNewsManagementAccess(role);
    const polls: VideoPollsListing = await listVideoPolls(tournamentId, session?.user?.id ?? null)
        .catch((error: unknown) => {
            console.error('[video-hub] polls read failed:', error);
            return { available: false, polls: [] };
        });

    return (
        <div style={{ minHeight: '100vh', background: '#0a0a0b' }}>
            <VideoHubClient
                hub={hub}
                canManage={canManage}
                initialPolls={polls.polls}
                pollsAvailable={polls.available}
                pollsOutdated={polls.reason === 'outdated-table'}
                migration={VIDEO_POLLS_MIGRATION}
            />
        </div>
    );
}
