// La ficha de un jugador.
//
// Casi siempre la resuelve el componente de cliente de siempre. La excepción
// son las JUGADORAS DEL MUNDIAL de hockey, que no viven en `people`: existen
// solo en el plantel que publica la FIH. Su id lo dice
// (`fih-wc-1867-ARG-3968`) y la ficha se arma contra el feed, en el servidor.
// Ver `server/worldCupProfiles.ts`.

import { cache } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import WorldCupPlayerProfile from '@/components/worldcup/WorldCupPlayerProfile';
import { getWorldCupPlayerProfile, type WorldCupPlayerProfile as WorldCupProfile } from '@/lib/server/worldCupProfiles';
import { parseFihPlayerRef } from '@/lib/services/fihHockeyParser';

import PlayerDetailClientPage from './PlayerDetailClientPage';

/**
 * La jugadora, una vez por request: la piden `generateMetadata` y la página.
 */
const loadWorldCupProfile = cache(async (id: string): Promise<WorldCupProfile | null> => {
    if (!parseFihPlayerRef(id)) return null;
    try {
        return await getWorldCupPlayerProfile(id);
    } catch (error) {
        console.error('[players/[id]] ficha del Mundial no disponible:', error);
        return null;
    }
});

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
    const { id } = await params;
    const playerId = id.trim();

    if (!parseFihPlayerRef(playerId)) return {};

    const worldCup = await loadWorldCupProfile(playerId);
    // Un id del Mundial que el plantel ya no tiene es un 404 de verdad, y se
    // decide acá: más tarde el status ya viajó y una página vacía se indexaría
    // como buena.
    if (!worldCup) notFound();

    const detalle = `${worldCup.team.name} · ${worldCup.competition.name}`;
    const title = `${worldCup.name} · ${detalle}`;
    const { played, goals } = worldCup.totals;
    const description = worldCup.linesUnavailable || played === 0
        ? `Ficha de ${worldCup.name} en el ${worldCup.competition.name} con ${worldCup.team.name}.`
        : `${worldCup.name} en el ${worldCup.competition.name}: ${played} ${played === 1 ? 'partido' : 'partidos'}`
          + (goals ? `, ${goals} ${goals === 1 ? 'gol' : 'goles'}` : '')
          + ` con ${worldCup.team.name}.`;

    return {
        title: `${title} · G22 Scores`,
        description,
        openGraph: {
            title,
            description,
            type: 'profile',
            images: [{ url: worldCup.image || worldCup.team.flagUrl }],
        },
    };
}

export default async function PlayerDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const playerId = id.trim();

    if (parseFihPlayerRef(playerId)) {
        const worldCup = await loadWorldCupProfile(playerId);
        if (!worldCup) notFound();
        return <WorldCupPlayerProfile profile={worldCup} />;
    }

    return <PlayerDetailClientPage id={playerId} />;
}
