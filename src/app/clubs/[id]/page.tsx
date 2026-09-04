// La ficha de un club.
//
// Casi siempre es un club de la base y la resuelve el componente de cliente de
// siempre. La excepción son las SELECCIONES DEL MUNDIAL de hockey, que no
// tienen fila en ninguna tabla: existen solo en el feed de la FIH, su id lo
// dice (`fih-wc-1867-ARG`, o el viejo `fih-team-ARG` de las filas de partidos)
// y su ficha se arma en el servidor (ver `server/worldCupProfiles.ts`).
//
// La excepción de la excepción: una selección que SÍ tiene ficha en la base
// —Las Leonas juegan la Pro League acá adentro— es el mismo equipo que la del
// feed, y tiene que ser una sola ficha. El id del feed cae en la de la base
// (ver `services/nationalTeamLinks.ts`), que es la que tiene plantel.

import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { cache } from 'react';

import WorldCupTeamProfile from '@/components/worldcup/WorldCupTeamProfile';
import { getWorldCupTeamProfile, type WorldCupTeamProfile as Profile } from '@/lib/server/worldCupProfiles';
import { FIH_TOURNAMENT_ID_PREFIX, parseFihTeamRef } from '@/lib/services/fihHockeyParser';
import { resolveLinkedNationalTeamClub } from '@/lib/services/nationalTeamLinks';
import { getReadClient } from '@/lib/supabase/read';

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

/**
 * La ficha de la base detrás del id del feed, una vez por request.
 *
 * Va ANTES que el feed a propósito: si esa selección ya es un club nuestro, la
 * ficha buena es la del club —tiene el plantel cargado y los partidos que la
 * FIH no publica— y el id del feed no debería abrir una segunda.
 */
const loadLinkedClub = cache(async (id: string): Promise<string | null> => {
    if (!parseFihTeamRef(id)) return null;
    try {
        // El mismo cliente con el que `/api/team-squads` resuelve este vínculo:
        // la tabla es pública y no depende de la sesión de quien mira.
        const supabase = await getReadClient();
        const linked = await resolveLinkedNationalTeamClub(supabase, id);
        return linked?.clubId ?? null;
    } catch (error) {
        // Sin vínculo la ficha del feed sigue siendo una respuesta correcta.
        console.error('[clubs/[id]] no se pudo leer el vinculo de la seleccion:', error);
        return null;
    }
});

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
    const { id } = await params;

    // El redirect va ACÁ y no en la página: `generateMetadata` corre antes de
    // que empiece a streamear el HTML, así que Next puede contestar un 307 de
    // verdad. Hecho abajo sale como `<meta http-equiv="refresh">` —anda en el
    // navegador, pero es el mismo parche que ya arrastran las noticias— y
    // además el `notFound()` de más abajo se le adelantaría cuando el feed no
    // contesta, mandando a 404 un vínculo perfectamente bueno.
    const linkedClubId = await loadLinkedClub(id.trim());
    if (linkedClubId) redirect(`/clubs/${encodeURIComponent(linkedClubId)}`);

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

    // Un país con ficha propia no tiene dos: el id del feed lleva a la de la
    // base. `generateMetadata` ya redirigió antes de streamear; esto es la red
    // por si alguna vez se renderiza la página sin pasar por los metadatos.
    const linkedClubId = await loadLinkedClub(trimmed);
    if (linkedClubId) redirect(`/clubs/${encodeURIComponent(linkedClubId)}`);

    const worldCup = await loadWorldCupTeam(trimmed);
    if (worldCup) return <WorldCupTeamProfile profile={worldCup} />;
    if (isWorldCupOnlyId(trimmed)) notFound();

    return <TeamDetailClientPage id={id} />;
}
