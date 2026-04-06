import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiUser } from '@/lib/auth/apiAdmin';
import { rebuildClubRankingFromMatch } from '@/lib/server/clubRankings';

function jsonError(message: string, status = 500, details?: unknown) {
    return NextResponse.json({ error: message, details: details ?? null }, { status });
}

function getStatusCode(error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    if (message === 'Unauthorized') return 401;
    if (message === 'Forbidden') return 403;
    if (message.includes('schema cache')) return 503;
    if (message.includes('No se encontro')) return 404;
    if (message.includes('match')) return 400;
    return 500;
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const actorUserId = await requireAdminApiUser();
        const { id } = await params;
        const body = await request.json();
        const matchId = String(body?.matchId || '');

        if (!matchId) {
            return jsonError('matchId es obligatorio.', 400);
        }

        const data = await rebuildClubRankingFromMatch(id, matchId, actorUserId);
        return NextResponse.json({ data });
    } catch (error) {
        return jsonError(
            error instanceof Error ? error.message : 'No se pudo recalcular el ranking desde ese partido.',
            getStatusCode(error),
        );
    }
}
