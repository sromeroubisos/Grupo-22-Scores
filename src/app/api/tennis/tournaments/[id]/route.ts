import { NextRequest, NextResponse } from 'next/server';

import { getTennisTournament, TennisServiceError } from '@/lib/services/tennis';

export const dynamic = 'force-dynamic';

/**
 * GET /api/tennis/tournaments/<id>?season=<n>
 *
 * Los datos del torneo y su cuadro. Ruta propia: un torneo de tenis no tiene
 * tabla de posiciones, tiene un cuadro de eliminación con sembrados.
 */
export async function GET(
    request: NextRequest,
    context: { params: Promise<{ id: string }> },
) {
    const { id } = await context.params;

    const seasonRaw = request.nextUrl.searchParams.get('season');
    const season = seasonRaw && /^\d+$/.test(seasonRaw) ? Number(seasonRaw) : undefined;

    try {
        const details = await getTennisTournament(id, season);
        if (!details) {
            return NextResponse.json(
                { error: 'not_found', message: 'No encontramos ese torneo.' },
                { status: 404 },
            );
        }
        return NextResponse.json(details, { status: 200 });
    } catch (err) {
        return NextResponse.json(
            {
                error: 'tennis_provider_unavailable',
                message: err instanceof TennisServiceError ? err.message : 'Error consultando el proveedor de tenis.',
            },
            { status: 502 },
        );
    }
}
