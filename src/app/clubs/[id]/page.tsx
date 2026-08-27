// La ficha de un club.
//
// Casi siempre es un club de la base y la resuelve el componente de cliente de
// siempre. La excepción son las SELECCIONES DEL MUNDIAL de hockey, que no
// tienen fila en ninguna tabla: existen solo en el feed de la FIH, su id lo
// dice (`fih-wc-1867-ARG`, o el viejo `fih-team-ARG` de las filas de partidos)
// y su ficha se arma en el servidor (ver `server/worldCupProfiles.ts`).

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';

import WorldCupTeamProfile from '@/components/worldcup/WorldCupTeamProfile';
import { getWorldCupTeamProfile, type WorldCupTeamProfile as Profile } from '@/lib/server/worldCupProfiles';
import { FIH_TOURNAMENT_ID_PREFIX, parseFihTeamRef } from '@/lib/services/fihHockeyParser';

import TeamDetailClientPage from './TeamDetailClientPage';

/**
 * La selección, una vez por request: la piden `generateMetadata` y la página.
 * Si el feed no contesta devuelve null y la ruta sigue por el camino de
 * siempre, en vez de tirar un 500.
 */
const loadWorldCupTeam = cache(async (id: string): Promise<Profile | null> => {
    if (!parseFihTeamRef(id)) return null;
    try {
        return await getWorldCupTeamProfile(id);
    } catch (error) {
        console.error('[clubs/[id]] ficha del Mundial no disponible:', error);
        return null;
    }
});

/** true para `fih-wc-1867-ARG`: un id que solo puede ser una selección del Mundial. */
function isWorldCupOnlyId(id: string): boolean {
    return id.toLowerCase().startsWith(FIH_TOURNAMENT_ID_PREFIX);
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
    const { id } = await params;
    const profile = await loadWorldCupTeam(id.trim());

    // El 404 se decide acá, antes del primer byte: más tarde el status ya
    // viajó y una página vacía se indexaría como buena. Mismo criterio que en
    // la ficha de un jugador.
    if (!profile && isWorldCupOnlyId(id.trim())) notFound();
    if (!profile) return {};

    const competition = profile.competitions.length === 1 ? profile.competitions[0].competition.name : 'Mundial de Hockey 2026';
    const title = `${profile.name} · ${competition}`;
    const squad = profile.competitions.reduce((total, entry) => total + entry.squad.length, 0);
    const description = squad > 0
        ? `Plantel, fixture y resultados de ${profile.name} en el ${competition}.`
        : `Fixture y resultados de ${profile.name} en el ${competition}.`;

    return {
        title: `${title} · G22 Scores`,
        description,
        openGraph: { title, description, type: 'website', images: [{ url: profile.flagUrl }] },
    };
}

export default async function TeamDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const trimmed = id.trim();

    const worldCup = await loadWorldCupTeam(trimmed);
    if (worldCup) return <WorldCupTeamProfile profile={worldCup} />;
    if (isWorldCupOnlyId(trimmed)) notFound();

    return <TeamDetailClientPage id={id} />;
}
