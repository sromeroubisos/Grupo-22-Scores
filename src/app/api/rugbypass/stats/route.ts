/**
 * Las estadisticas de un torneo de RugbyPass, para la pestana Estadisticas.
 *
 * Va aparte del bundle del torneo (`/api/tournaments?id=rp-comp-…`) a proposito:
 * armar la tabla de equipos son ocho llamadas al sitio y no puede pagarlas
 * quien entra a ver el fixture. Se pide recien cuando la pestana se abre.
 */

import { NextResponse } from 'next/server';
import { getRugbyPassCompetitionStats } from '@/lib/services/rugbyPass';
import { parseRugbyPassTournamentId } from '@/lib/services/rugbyPassTournamentBundle';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const crudo = searchParams.get('competition') || searchParams.get('tournament') || '';
    // Acepta las dos formas con las que se lo puede nombrar: el id del torneo
    // (`rp-comp-203`) y el oid pelado (`203`).
    const competitionId = parseRugbyPassTournamentId(crudo) ?? Number(crudo);

    if (!Number.isFinite(competitionId)) {
        return NextResponse.json({ error: 'Falta el id de la competicion' }, { status: 400 });
    }

    try {
        const stats = await getRugbyPassCompetitionStats(competitionId, searchParams.get('season'));
        if (!stats) {
            // La competicion no esta habilitada o no publica estadisticas
            // ("Internationals" es un cajon de test matches y su /stats/ da 404).
            return NextResponse.json({ error: 'Esta competicion no publica estadisticas' }, { status: 404 });
        }
        return NextResponse.json(stats);
    } catch (error) {
        const detalle = error instanceof Error ? error.message : 'Error desconocido';
        return NextResponse.json({ error: detalle }, { status: 502 });
    }
}
