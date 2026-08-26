// El hub de videos de un torneo: los highlights, partidos completos y clips
// cargados en las fichas, juntos, más la votación al mejor try. Vive dentro
// de Noticias porque es contenido editorial, no un dato del torneo.

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';

import { getServerAuthRole } from '@/lib/auth/newsAccess';
import { hasNewsManagementAccess } from '@/lib/auth/roles';
import { getVideoHub, isVideoHubId, listHubCandidateMatches } from '@/lib/server/videoHub';
import { listVideoPolls, VIDEO_POLLS_MIGRATION, type VideoPollsListing } from '@/lib/server/videoPolls';
import { playLabelForSport } from '@/lib/videoHub/polls';
import VideoHubClient from './VideoHubClient';

export const dynamic = 'force-dynamic';

type Props = {
    params: Promise<{ tournamentId: string }>;
    /** `?votacion=nueva` abre el editor de la votación (desde la portada de noticias). */
    searchParams: Promise<{ votacion?: string | string[] }>;
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

export default async function VideoHubPage({ params, searchParams }: Props) {
    const [{ tournamentId }, { votacion }] = await Promise.all([params, searchParams]);
    if (!isVideoHubId(tournamentId)) notFound();

    const [{ role, session }, hub] = await Promise.all([
        getServerAuthRole(),
        loadHub(tournamentId),
    ]);
    if (!hub) notFound();

    const canManage = hasNewsManagementAccess(role);
    const [polls, candidateMatches] = await Promise.all([
        listVideoPolls(tournamentId, session?.user?.id ?? null)
            .catch((error: unknown): VideoPollsListing => {
                console.error('[video-hub] polls read failed:', error);
                return { available: false, polls: [] };
            }),
        // Los partidos del torneo, para cargarles un clip desde la votación. Solo a quien administra.
        canManage
            ? listHubCandidateMatches(tournamentId).catch((error: unknown) => {
                console.error('[video-hub] candidate matches read failed:', error);
                return [];
            })
            : Promise.resolve([]),
    ]);

    // El atajo "Nueva votación" de la portada llega acá: el editor ya abierto.
    const openEditor = canManage && polls.available && votacion === 'nueva';

    return (
        <VideoHubClient
            hub={hub}
            canManage={canManage}
            initialPolls={polls.polls}
            initialEditing={openEditor}
            candidateMatches={candidateMatches}
            pollsAvailable={polls.available}
            pollsOutdated={polls.reason === 'outdated-table'}
            migration={VIDEO_POLLS_MIGRATION}
        />
    );
}
