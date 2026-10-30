import { NextRequest, NextResponse } from 'next/server';
import { fetchTournamentData } from '@/lib/server/fetchTournamentData';
import { getTournamentReadAccess } from '@/lib/server/tournamentReadGate';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const NO_STORE_HEADERS = {
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    Pragma: 'no-cache',
    Expires: '0',
};

function jsonNoStore(body: unknown, init?: ResponseInit) {
    return NextResponse.json(body, {
        ...init,
        headers: {
            ...NO_STORE_HEADERS,
            ...(init?.headers ?? {}),
        },
    });
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const { id } = await params;
    // Borrador u oculto: 404 salvo para quien lo puede leer en el gestor.
    if ((await getTournamentReadAccess(id)) === 'denied') {
        return jsonNoStore({ ok: false, error: 'Tournament not found' }, { status: 404 });
    }
    const seasonId =
        request.nextUrl.searchParams.get('seasonId') ||
        request.nextUrl.searchParams.get('season_id') ||
        request.nextUrl.searchParams.get('season');
    const data = await fetchTournamentData(id, { seasonId });

    if (!data) {
        return jsonNoStore(
            { ok: false, error: 'Tournament data unavailable' },
            { status: 503 },
        );
    }

    if (!data.ok) {
        return jsonNoStore(
            {
                ok: false,
                error: data.error ?? 'Tournament data unavailable',
                queryErrors: data.queryErrors,
            },
            { status: data.error === 'Tournament not found' ? 404 : 503 },
        );
    }

    return jsonNoStore({
        ...data,
        debug: {
            id,
            queryErrors: data.queryErrors,
            partial: !!data.partial,
        },
    });
}
