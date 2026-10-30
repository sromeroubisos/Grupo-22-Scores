import { NextRequest, NextResponse } from 'next/server';

import {
    getTennisLiveMatches,
    getTennisMatchesByDate,
    isSupportedTimeZone,
    TennisServiceError,
} from '@/lib/services/tennis';
import { limitAnonymousRequest } from '@/lib/server/publicRouteGuards';

export const dynamic = 'force-dynamic';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Un día pedido fuera de esta ventana no tiene partidos que mostrar, pero cada
// fecha distinta eran dos llamadas a ESPN y una entrada de caché nueva.
const MAX_DATE_DISTANCE_MS = 366 * 24 * 60 * 60 * 1000;

function isDateWithinWindow(dateKey: string): boolean {
    const ms = Date.parse(`${dateKey}T12:00:00Z`);
    if (!Number.isFinite(ms)) return false;
    // `2026-02-31` parsea a marzo: si no vuelve igual, la fecha no existe.
    if (new Date(ms).toISOString().slice(0, 10) !== dateKey) return false;
    return Math.abs(ms - Date.now()) <= MAX_DATE_DISTANCE_MS;
}

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
    if (!wantsLive && date && !isDateWithinWindow(date)) {
        return NextResponse.json(
            { error: 'invalid_date', message: 'date tiene que estar a menos de un año de hoy.' },
            { status: 400 },
        );
    }
    const tz = params.get('tz');
    if (!wantsLive && tz && !isSupportedTimeZone(tz)) {
        // Antes era un 502 "se cayó el proveedor": el error era del pedido.
        return NextResponse.json(
            { error: 'invalid_tz', message: 'tz tiene que ser una zona IANA (p. ej. America/Argentina/Buenos_Aires).' },
            { status: 400 },
        );
    }

    // Anónima y contra ESPN: tope por IP (falla abierto si no hay contador).
    const limited = await limitAnonymousRequest(request, 'tennis-matches');
    if (limited) return limited;

    try {
        const day = wantsLive
            ? await getTennisLiveMatches()
            : await getTennisMatchesByDate(date as string, {
                  timeZone: tz || undefined,
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
