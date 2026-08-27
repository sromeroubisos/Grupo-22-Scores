import { cache } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { getLocalPlayerProfile, type LocalPlayerProfile } from '@/lib/services/localPlayerProfile';
import WorldCupPlayerProfile from '@/components/worldcup/WorldCupPlayerProfile';
import { getWorldCupPlayerProfile, type WorldCupPlayerProfile as WorldCupProfile } from '@/lib/server/worldCupProfiles';
import { parseFihPlayerRef } from '@/lib/services/fihHockeyParser';
import PlayerDetailClientPage from './PlayerDetailClientPage';
import PlayerProfile from './PlayerProfile';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * La ficha de un jugador local se resuelve EN EL SERVIDOR. Antes todo salia de
 * un `useEffect` con `cache: 'no-store'`, asi que el HTML que llegaba no tenia
 * ni el nombre: ni titulo de pestana, ni tarjeta al compartir, ni nada que
 * indexar. Un perfil publico es justamente la pagina que mas se comparte.
 *
 * Los jugadores de proveedor (FlashScore, ESPN, SofaScore) siguen por el
 * camino de siempre: sus ids no son UUID y su carga depende de APIs externas
 * que no conviene meter en el render del servidor.
 */
const loadLocalProfile = cache(async (id: string): Promise<LocalPlayerProfile | null> => {
    if (!UUID_RE.test(id)) return null;
    try {
        const supabase = process.env.SUPABASE_SERVICE_ROLE_KEY ? createAdminClient() : await createClient();
        return await getLocalPlayerProfile(supabase, id);
    } catch {
        // Base caida o sin permisos: que la pagina siga por el camino externo
        // en vez de tirar un 500 en la cara.
        return null;
    }
});

/**
 * Las jugadoras del MUNDIAL DE HOCKEY tampoco viven en `people`: existen solo
 * en el plantel que publica la FIH. Su id lo dice (`fih-wc-1867-ARG-3968`) y
 * la ficha se arma contra el feed, en el servidor, como la de un jugador
 * local. Ver `server/worldCupProfiles.ts`.
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

    if (parseFihPlayerRef(playerId)) {
        const worldCup = await loadWorldCupProfile(playerId);
        // Un id del Mundial que el plantel ya no tiene es un 404 de verdad, y
        // se decide aca por el mismo motivo que el de un UUID: mas tarde el
        // status ya viajo.
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

    const profile = await loadLocalProfile(playerId);

    // El 404 se decide ACA y no en el render: `loading.tsx` abre un limite de
    // Suspense, asi que para cuando el componente corre la respuesta ya empezo
    // a viajar y el status queda clavado en 200. Un 404 que contesta 200 se
    // indexa como pagina buena. `generateMetadata` se resuelve antes del
    // primer byte, que es el ultimo momento en que el status todavia se puede
    // cambiar.
    if (!profile && UUID_RE.test(playerId)) notFound();

    if (!profile) {
        return { title: 'Jugador · G22 Scores' };
    }

    const club = profile.club?.name;
    const detalle = [club, profile.position].filter(Boolean).join(' · ');
    const title = detalle ? `${profile.name} · ${detalle}` : profile.name;
    const { matches, tries, points } = profile.totals;
    const description = matches
        ? `${profile.name}: ${matches} ${matches === 1 ? 'partido' : 'partidos'}` +
          (tries ? `, ${tries} ${tries === 1 ? 'try' : 'tries'}` : '') +
          (points ? `, ${points} puntos` : '') +
          (club ? ` con ${club}.` : '.')
        : `Ficha de ${profile.name}${club ? ` en ${club}` : ''} en G22 Scores.`;

    return {
        title: `${title} · G22 Scores`,
        description,
        openGraph: { title, description, type: 'profile' },
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

    if (UUID_RE.test(playerId)) {
        const profile = await loadLocalProfile(playerId);
        // Un UUID que no es nadie es un 404 de verdad. Antes la API contestaba
        // 200 con `details: []` y la pagina publicaba el id crudo como titulo.
        if (!profile) notFound();
        return <PlayerProfile profile={profile} />;
    }

    return <PlayerDetailClientPage id={playerId} />;
}
