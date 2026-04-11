import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiUser } from '@/lib/auth/apiAdmin';
import {
    deleteClubRankingEntry,
    updateClubRankingEntry,
} from '@/lib/server/clubRankings';

function jsonError(message: string, status = 500, details?: unknown) {
    return NextResponse.json({ error: message, details: details ?? null }, { status });
}

function getStatusCode(error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    if (message === 'Unauthorized') return 401;
    if (message === 'Forbidden') return 403;
    if (message.includes('schema cache')) return 503;
    if (
        message.includes('seleccionar') ||
        message.includes('numerico') ||
        message.includes('No se encontro') ||
        message.includes('ya forma parte') ||
        message.includes('deporte')
    ) {
        return 400;
    }
    return 500;
}

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; entryId: string }> },
) {
    try {
        const actorUserId = await requireAdminApiUser();
        const body = await request.json();
        const { id, entryId } = await params;

        const data = await updateClubRankingEntry(id, entryId, {
            clubId: String(body?.clubId || ''),
            sourceName:
                body?.sourceName === null || body?.sourceName === undefined
                    ? null
                    : String(body.sourceName),
            initialRating: Number(body?.initialRating),
            sourceRegion:
                body?.sourceRegion === null || body?.sourceRegion === undefined
                    ? null
                    : String(body.sourceRegion),
            sourcePosition:
                body?.sourcePosition === null || body?.sourcePosition === undefined || body.sourcePosition === ''
                    ? null
                    : Number(body.sourcePosition),
            sourcePreviousPosition:
                body?.sourcePreviousPosition === null ||
                body?.sourcePreviousPosition === undefined ||
                body.sourcePreviousPosition === ''
                    ? null
                    : Number(body.sourcePreviousPosition),
            sourceVariation:
                body?.sourceVariation === null || body?.sourceVariation === undefined || body.sourceVariation === ''
                    ? null
                    : Number(body.sourceVariation),
            sourcePayload:
                body?.sourcePayload && typeof body.sourcePayload === 'object'
                    ? (body.sourcePayload as Record<string, unknown>)
                    : null,
            isActive: body?.isActive !== false,
            actorUserId,
        });

        return NextResponse.json({ data });
    } catch (error) {
        return jsonError(
            error instanceof Error ? error.message : 'No se pudo actualizar el club del ranking.',
            getStatusCode(error),
        );
    }
}

export async function DELETE(
    _request: Request,
    { params }: { params: Promise<{ id: string; entryId: string }> },
) {
    try {
        const actorUserId = await requireAdminApiUser();
        const { id, entryId } = await params;
        const data = await deleteClubRankingEntry(id, entryId, actorUserId);
        return NextResponse.json({ data });
    } catch (error) {
        return jsonError(
            error instanceof Error ? error.message : 'No se pudo quitar el club del ranking.',
            getStatusCode(error),
        );
    }
}
