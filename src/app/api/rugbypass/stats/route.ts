/**
 * Las estadisticas de un torneo de RugbyPass, para la pestana Estadisticas.
 *
 * Va aparte del bundle del torneo (`/api/tournaments?id=rp-comp-…`) a proposito:
 * armar la tabla de equipos son ocho llamadas al sitio y no puede pagarlas
 * quien entra a ver el fixture. Se pide recien cuando la pestana se abre.
 */

import { NextResponse } from 'next/server';
import { getRugbyPassCompetitionStats, isRugbyPassSeasonLabel } from '@/lib/services/rugbyPass';
import { parseRugbyPassTournamentId } from '@/lib/services/rugbyPassTournamentBundle';
import { normalizeRugbyPassSeasonLabel } from '@/lib/services/rugbyPassSeasonStats';
import { limitAnonymousRequest, PUBLIC_SHORT_CACHE_CONTROL } from '@/lib/server/publicRouteGuards';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const crudo = searchParams.get('competition') || searchParams.get('tournament') || '';
    // Acepta las dos formas con las que se lo puede nombrar: el id del torneo
    // (`rp-comp-203`) y el oid pelado (`203`).
    const competitionId = parseRugbyPassTournamentId(crudo) ?? Number(crudo);

    // Entero positivo y corto: los oid de RugbyPass son de tres o cuatro cifras.
    if (!Number.isInteger(competitionId) || competitionId <= 0 || competitionId > 9_999_999) {
        return NextResponse.json({ error: 'Falta el id de la competicion' }, { status: 400 });
    }

    // `season` vacio = la temporada que la pagina abre. Lo demas tiene que tener
    // forma de temporada (`2026`, `2026-27`): cada rotulo distinto era una clave
    // de memoria nueva. Un rotulo raro NO es 400: el servicio ya caia a la
    // temporada por defecto, y la pestana tiene que seguir dibujandose si el
    // torneo trae su temporada escrita de otra manera.
    const seasonCruda = (searchParams.get('season') || '').slice(0, 20);
    const seasonNormalizada = seasonCruda ? normalizeRugbyPassSeasonLabel(seasonCruda) : '';
    const season = isRugbyPassSeasonLabel(seasonNormalizada) ? seasonNormalizada : '';

    // Anonima y cara (ocho llamadas al sitio por temporada nueva): tope por IP.
    const limited = await limitAnonymousRequest(request, 'rugbypass-stats');
    if (limited) return limited;

    try {
        const stats = await getRugbyPassCompetitionStats(competitionId, season || null);
        if (!stats) {
            // La competicion no esta habilitada o no publica estadisticas
            // ("Internationals" es un cajon de test matches y su /stats/ da 404).
            return NextResponse.json({ error: 'Esta competicion no publica estadisticas' }, { status: 404 });
        }
        // Igual para cualquiera (no lee sesion): el CDN puede servirla.
        return NextResponse.json(stats, { headers: { 'Cache-Control': PUBLIC_SHORT_CACHE_CONTROL } });
    } catch (error) {
        // El mensaje del servicio lleva la URL del sitio (`… en https://…`): va
        // al log, no a la respuesta. Hacia afuera, solo si se puede reintentar.
        console.error('[rugbypass/stats] fallo al pedir estadisticas:', error);
        const lento = error instanceof Error && /tardo demasiado/.test(error.message);
        return NextResponse.json(
            { error: lento ? 'RugbyPass tardo demasiado en responder' : 'No se pudieron traer las estadisticas de RugbyPass' },
            { status: 502 },
        );
    }
}
