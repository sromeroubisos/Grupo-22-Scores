import { NextRequest, NextResponse } from 'next/server';
import { requireGlobalAdminApiUser } from '@/lib/auth/apiAdmin';
import { importClubRankingBase, listClubRankings } from '@/lib/server/clubRankings';

function jsonError(message: string, status = 500, details?: unknown) {
    return NextResponse.json({ error: message, details: details ?? null }, { status });
}

function getStatusCode(error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    if (message === 'Unauthorized') return 401;
    if (message === 'Forbidden') return 403;
    if (message.includes('schema cache')) return 503;
    if (
        message.includes('necesita') ||
        message.includes('No hay filas') ||
        message.includes('aparece mas de una vez') ||
        message.includes('seleccionar')
    ) {
        return 400;
    }
    return 500;
}

export async function GET() {
    try {
        await requireGlobalAdminApiUser();
        const data = await listClubRankings();
        return NextResponse.json({ data });
    } catch (error) {
        return jsonError(
            error instanceof Error ? error.message : 'No se pudieron cargar los rankings.',
            getStatusCode(error),
        );
    }
}

export async function POST(request: NextRequest) {
    try {
        const actorUserId = await requireGlobalAdminApiUser();
        const body = await request.json();

        const detail = await importClubRankingBase({
            id: String(body?.id || ''),
            name: String(body?.name || ''),
            sport: String(body?.sport || 'rugby'),
            season: String(body?.season || ''),
            resultsSeason:
                body?.resultsSeason === null || body?.resultsSeason === undefined
                    ? null
                    : Number(body.resultsSeason),
            scope: body?.scope ? String(body.scope) : null,
            description: body?.description ? String(body.description) : null,
            actorUserId,
            entries: Array.isArray(body?.entries)
                ? body.entries.map((entry: Record<string, unknown>) => ({
                    clubId: String(entry.clubId || ''),
                    sourceName: String(entry.sourceName || ''),
                    initialRating: Number(entry.initialRating),
                    sourceRowIndex:
                        entry.sourceRowIndex === null || entry.sourceRowIndex === undefined
                            ? null
                            : Number(entry.sourceRowIndex),
                    sourceRegion:
                        entry.sourceRegion === null || entry.sourceRegion === undefined
                            ? null
                            : String(entry.sourceRegion),
                    sourcePosition:
                        entry.sourcePosition === null || entry.sourcePosition === undefined
                            ? null
                            : Number(entry.sourcePosition),
                    sourcePreviousPosition:
                        entry.sourcePreviousPosition === null ||
                        entry.sourcePreviousPosition === undefined
                            ? null
                            : Number(entry.sourcePreviousPosition),
                    sourceVariation:
                        entry.sourceVariation === null || entry.sourceVariation === undefined
                            ? null
                            : Number(entry.sourceVariation),
                    sourcePayload:
                        entry.sourcePayload && typeof entry.sourcePayload === 'object'
                            ? (entry.sourcePayload as Record<string, unknown>)
                            : null,
                }))
                : [],
        });

        return NextResponse.json({ data: detail });
    } catch (error) {
        return jsonError(
            error instanceof Error ? error.message : 'No se pudo guardar la base del ranking.',
            getStatusCode(error),
        );
    }
}
