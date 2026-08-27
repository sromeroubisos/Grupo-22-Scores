/**
 * LO QUE HACE FALTA PARA ARMAR UNA FORMACIÓN EN LA PREVIA DE UN PARTIDO:
 * la grilla de puestos del deporte y el plantel cargado de cada equipo.
 *
 * Va por equipo y no por partido a propósito. Un partido del feed puede ser local
 * (`matches`) o del proveedor (`external_match_cache`), y resolver el id contra las
 * dos tablas para volver a sacar los mismos dos equipos que la pantalla YA tiene en
 * la mano es trabajo repetido. La pantalla manda los equipos.
 *
 * Es público y sin sesión: la formación que arma el hincha no se guarda —se exporta
 * y se descarta—, así que no hay nada que proteger ni a quién atribuírselo.
 */

import { NextResponse } from 'next/server';
import { getReadClient } from '@/lib/supabase/read';
import { getLineupForSport } from '@/lib/data/lineupPositions';
import { getSquadForTeamKey, type TeamSquad } from '@/lib/services/teamSquad';

type TeamOption = TeamSquad & {
    /** El nombre que muestra la pantalla, que puede no ser el del club vinculado. */
    name: string;
};

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);

    const sport = (searchParams.get('sport') || '').trim();
    const home = (searchParams.get('home') || '').trim();
    const away = (searchParams.get('away') || '').trim();
    const homeName = (searchParams.get('home_name') || '').trim();
    const awayName = (searchParams.get('away_name') || '').trim();

    const lineup = getLineupForSport(sport);

    // Un deporte sin formación declarada no es un error: es un deporte al que no se
    // le arma un XV. La pantalla lee `lineup: null` y no ofrece el armado.
    if (!lineup) {
        return NextResponse.json({ lineup: null, teams: [], reason: 'sport_without_lineup' });
    }

    if (!home && !away) {
        return NextResponse.json(
            { error: 'Faltan los equipos: mandá home y away.' },
            { status: 400 },
        );
    }

    try {
        const supabase = await getReadClient();

        const [homeSquad, awaySquad] = await Promise.all([
            home ? getSquadForTeamKey(supabase, home) : Promise.resolve(null),
            away ? getSquadForTeamKey(supabase, away) : Promise.resolve(null),
        ]);

        const teams: TeamOption[] = [];
        if (homeSquad) teams.push({ ...homeSquad, name: homeName || homeSquad.clubName || 'Local' });
        if (awaySquad) teams.push({ ...awaySquad, name: awayName || awaySquad.clubName || 'Visitante' });

        const response = NextResponse.json({ lineup, teams });
        // El plantel cambia cuando alguien lo edita, no cada minuto: un rato de caché
        // pública ahorra dos lecturas por cada hincha que abre la previa.
        response.headers.set('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=600');
        return response;
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Error desconocido';
        console.error('[lineup-options]', error);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
