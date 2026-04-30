import { NextResponse } from 'next/server';
import { requireGlobalAdminApiUser } from '@/lib/auth/apiAdmin';
import { backfillClubRankingSeason } from '@/lib/server/clubRankings';

function jsonError(message: string, status = 500, details?: unknown) {
    return NextResponse.json({ error: message, details: details ?? null }, { status });
}

function getStatusCode(error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    if (message === 'Unauthorized') return 401;
    if (message === 'Forbidden') return 403;
    if (message.includes('schema cache')) return 503;
    if (message.includes('No se encontro')) return 404;
    if (message.includes('ya fue ejecutada')) return 400;
    return 500;
}

export async function POST(
    _request: Request,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const actorUserId = await requireGlobalAdminApiUser();
        const { id } = await params;
        const data = await backfillClubRankingSeason(id, actorUserId);
        return NextResponse.json({ data });
    } catch (error) {
        return jsonError(
            error instanceof Error ? error.message : 'No se pudo ejecutar el backfill del ranking.',
            getStatusCode(error),
        );
    }
}
