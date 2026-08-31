import { NextRequest, NextResponse } from 'next/server';
import { listPublicRankings } from '@/lib/server/publicRankings';

// Mismo criterio que el detalle: el catalogo de rankings publicados cambia cuando
// alguien guarda uno en el panel, no en cada visita.
const PUBLIC_RANKING_CACHE_CONTROL = 'public, max-age=60, s-maxage=300, stale-while-revalidate=3600';

function jsonError(message: string, status = 500, details?: unknown) {
    return NextResponse.json({ error: message, details: details ?? null }, { status });
}

function getStatusCode(error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    if (message.includes('schema cache')) return 503;
    return 500;
}

export async function GET(request: NextRequest) {
    try {
        const sport = String(request.nextUrl.searchParams.get('sport') || '').trim().toLowerCase();
        // El filtro por deporte y el armado del payload viven en el compositor:
        // es el que sabe que los rankings de rugby son dos cosas distintas (los
        // clubes que calculamos nosotros y las selecciones de World Rugby).
        const data = await listPublicRankings(sport);

        return NextResponse.json({ data }, {
            headers: { 'Cache-Control': PUBLIC_RANKING_CACHE_CONTROL },
        });
    } catch (error) {
        return jsonError(
            error instanceof Error ? error.message : 'No se pudieron cargar los rankings publicos.',
            getStatusCode(error),
        );
    }
}
