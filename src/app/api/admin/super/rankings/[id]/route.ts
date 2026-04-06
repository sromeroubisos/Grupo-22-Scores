import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiUser } from '@/lib/auth/apiAdmin';
import { getClubRankingDetail, updateClubRankingMetadata } from '@/lib/server/clubRankings';

function jsonError(message: string, status = 500, details?: unknown) {
    return NextResponse.json({ error: message, details: details ?? null }, { status });
}

function getStatusCode(error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    if (message === 'Unauthorized') return 401;
    if (message === 'Forbidden') return 403;
    if (message.includes('schema cache')) return 503;
    if (message.includes('necesita')) return 400;
    if (message.includes('No se encontro')) return 404;
    return 500;
}

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        await requireAdminApiUser();
        const { id } = await params;
        const data = await getClubRankingDetail(id);
        return NextResponse.json({ data });
    } catch (error) {
        return jsonError(
            error instanceof Error ? error.message : 'No se pudo cargar el ranking.',
            getStatusCode(error),
        );
    }
}

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const actorUserId = await requireAdminApiUser();
        const { id } = await params;
        const body = await request.json().catch(() => ({}));
        const data = await updateClubRankingMetadata(id, {
            name: String(body?.name || ''),
            description:
                body?.description === null || body?.description === undefined
                    ? null
                    : String(body.description),
            actorUserId,
        });
        return NextResponse.json({ data });
    } catch (error) {
        return jsonError(
            error instanceof Error ? error.message : 'No se pudo actualizar el ranking.',
            getStatusCode(error),
        );
    }
}
