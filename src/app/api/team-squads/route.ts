/**
 * LOS PLANTELES DE UN EQUIPO, UNO POR PERÍODO.
 *
 * `/api/teams` devuelve un plantel y ninguna fecha, así que no alcanza para mirar
 * hacia atrás: un club tiene el plantel de esta temporada, el de la anterior y el de
 * la gira, y son listas distintas de la misma gente.
 *
 * Es público, como el resto de la ficha del club. Cargar un plantel es de admin;
 * mirarlo, no.
 */

import { NextResponse } from 'next/server';
import { getReadClient } from '@/lib/supabase/read';
import { resolveClubIdForTeamKey, getSquadPeriodsForClub } from '@/lib/services/teamSquad';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const team = (searchParams.get('team') || '').trim();

    if (!team) {
        return NextResponse.json({ error: 'Falta el equipo.' }, { status: 400 });
    }

    try {
        const supabase = await getReadClient();
        const club = await resolveClubIdForTeamKey(supabase, team);

        // Sin club vinculado no hay plantel, y eso no es un error: es un equipo al que
        // todavía nadie le cargó uno.
        if (!club) {
            return NextResponse.json({ clubId: null, clubName: null, periods: [] });
        }

        const periods = await getSquadPeriodsForClub(supabase, club.clubId);

        const response = NextResponse.json({
            clubId: club.clubId,
            clubName: club.clubName,
            periods,
        });
        response.headers.set('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=600');
        return response;
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Error desconocido';
        console.error('[team-squads]', error);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
