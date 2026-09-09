import { NextRequest, NextResponse } from 'next/server';

import { getTennisMatch, TennisServiceError } from '@/lib/services/tennis';

export const dynamic = 'force-dynamic';

/**
 * GET /api/tennis/matches/<id>
 *
 * La ficha de un partido de tenis. Ruta propia y no `/api/matches/<id>`, que
 * transforma con la forma de fútbol y para un tenista devuelve una ficha vacía.
 */
export async function GET(
    _request: NextRequest,
    context: { params: Promise<{ id: string }> },
) {
    const { id } = await context.params;

    try {
        const details = await getTennisMatch(id);
        if (!details) {
            return NextResponse.json(
                { error: 'not_found', message: 'No encontramos ese partido.' },
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
