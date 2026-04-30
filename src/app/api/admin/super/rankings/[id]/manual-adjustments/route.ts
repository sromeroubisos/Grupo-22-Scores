import { NextRequest, NextResponse } from 'next/server';
import { requireGlobalAdminApiUser } from '@/lib/auth/apiAdmin';
import { applyManualClubRankingAdjustment } from '@/lib/server/clubRankings';

function jsonError(message: string, status = 500, details?: unknown) {
    return NextResponse.json({ error: message, details: details ?? null }, { status });
}

function getStatusCode(error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    if (message === 'Unauthorized') return 401;
    if (message === 'Forbidden') return 403;
    if (message.includes('schema cache')) return 503;
    if (message.includes('seleccionar') || message.includes('numerico') || message.includes('motivo')) {
        return 400;
    }
    if (message.includes('No se encontro') || message.includes('no pertenece')) return 404;
    return 500;
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const actorUserId = await requireGlobalAdminApiUser();
        const { id } = await params;
        const body = await request.json();

        const data = await applyManualClubRankingAdjustment(id, {
            clubId: String(body?.clubId || ''),
            mode: body?.mode === 'set' ? 'set' : 'delta',
            value: Number(body?.value),
            reason: String(body?.reason || ''),
            actorUserId,
        });

        return NextResponse.json({ data });
    } catch (error) {
        return jsonError(
            error instanceof Error ? error.message : 'No se pudo aplicar el ajuste manual.',
            getStatusCode(error),
        );
    }
}
