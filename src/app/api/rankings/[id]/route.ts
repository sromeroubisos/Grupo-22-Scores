import { NextResponse } from 'next/server';
import { getPublicRankingDetail } from '@/lib/server/publicRankings';

// El ranking lo recalcula el cron de rankings, no el request: no hay motivo para
// que cada visita pague la consulta entera. El navegador revalida al minuto y el
// CDN sirve una copia tibia mientras refresca por detras.
const PUBLIC_RANKING_CACHE_CONTROL = 'public, max-age=60, s-maxage=300, stale-while-revalidate=3600';

function jsonError(message: string, status = 500, details?: unknown) {
    return NextResponse.json({ error: message, details: details ?? null }, { status });
}

function getStatusCode(error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    if (message.includes('schema cache')) return 503;
    if (message.includes('No se encontro')) return 404;
    return 500;
}

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const { id } = await params;
        // Que semana mirar. Solo la usan los rankings importados; una fecha con
        // otra forma se ignora en vez de romper — la escribe cualquiera en la
        // barra de direcciones.
        const rawDate = new URL(request.url).searchParams.get('date')?.trim() || '';
        const date = ISO_DATE_REGEX.test(rawDate) ? rawDate : null;

        // El id decide la fuente: un UUID es un ranking de clubes de la base, y
        // `world-rugby-mru` / `world-rugby-wru` son las fotos de World Rugby.
        const data = await getPublicRankingDetail(id, { date });

        return NextResponse.json({ data }, {
            headers: { 'Cache-Control': PUBLIC_RANKING_CACHE_CONTROL },
        });
    } catch (error) {
        return jsonError(
            error instanceof Error ? error.message : 'No se pudo cargar el ranking publico.',
            getStatusCode(error),
        );
    }
}
