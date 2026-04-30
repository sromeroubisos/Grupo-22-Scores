import { NextRequest, NextResponse } from 'next/server';
import { requireGlobalAdminApiUser } from '@/lib/auth/apiAdmin';
import { createClubRankingEntry } from '@/lib/server/clubRankings';

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

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const actorUserId = await requireGlobalAdminApiUser();
        const body = await request.json();
        const { id } = await params;

        const data = await createClubRankingEntry(id, {
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
            error instanceof Error ? error.message : 'No se pudo agregar el club al ranking.',
            getStatusCode(error),
        );
    }
}
