import { NextRequest, NextResponse } from 'next/server';

import {
    getTennisLiveMatches,
    getTennisMatchesByDate,
    TennisServiceError,
} from '@/lib/services/tennis';

export const dynamic = 'force-dynamic';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /api/tennis/matches
 *
 *   ?live=1                      partidos en vivo (ATP y WTA)
 *   ?date=YYYY-MM-DD&tz=IANA     el día, agrupado por torneo
 *   &categories=ATP,WTA | all    circuitos; por defecto los dos
 *
 * Ruta propia, no `/api/matches`: el tenis no devuelve `Match`. Ver
 * `src/types/tennis.ts`.
 */
export async function GET(request: NextRequest) {
    const params = request.nextUrl.searchParams;

    const wantsLive = params.get('live') === '1' || params.get('live') === 'true';
    const date = params.get('date');

    if (!wantsLive && !date) {
        return NextResponse.json(
            { error: 'missing_date', message: 'Indicá ?date=YYYY-MM-DD o ?live=1.' },
            { status: 400 },
        );
    }
    if (date && !ISO_DATE.test(date)) {
        return NextResponse.json(
            { error: 'invalid_date', message: 'date tiene que ser YYYY-MM-DD.' },
            { status: 400 },
        );
    }

    try {
        const day = wantsLive
            ? await getTennisLiveMatches()
            : await getTennisMatchesByDate(date as string, {
                  timeZone: params.get('tz') || undefined,
                  categories: params.get('categories') || undefined,
              });

        if (!day) {
            return NextResponse.json(
                { tournaments: [], count: 0, discardedOffDay: 0, timezone: null, categories: [] },
                { status: 200 },
            );
        }
        return NextResponse.json(day, { status: 200 });
    } catch (err) {
        // ESPN se cayó o no contestó a tiempo. Es distinto de "no hay
        // partidos": la UI tiene que poder decirlo, no mostrar un día vacío.
        return NextResponse.json(
            {
                error: 'tennis_provider_unavailable',
                message: err instanceof TennisServiceError ? err.message : 'Error consultando el proveedor de tenis.',
            },
            { status: 502 },
        );
    }
}
