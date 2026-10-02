import { NextRequest, NextResponse } from 'next/server';
import { getApiErrorStatus, requireGlobalAdminApiContext } from '@/lib/auth/apiAdmin';
import {
    deleteExternalMatchResultOverride,
    upsertExternalMatchResultOverride,
} from '@/lib/server/externalMatchResultOverrides';
import { WR_PROVIDER, parseWrManualResult, parseWrMatchId } from '@/lib/services/worldRugbyEventParser';

export const dynamic = 'force-dynamic';

/**
 * PUT    /api/admin/super/matches/:id/result-override  carga el resultado a mano
 * DELETE /api/admin/super/matches/:id/result-override  vuelve a lo que publica la fuente
 *
 * Solo para los partidos de World Rugby (`wr-match-<uuid>`), que no tienen
 * fila en `matches` ni editor. La fuente oficial manda en cuanto publica el
 * partido: ver `applyWrManualResults`.
 */

function jsonError(message: string, status: number) {
    return NextResponse.json({ error: message }, { status });
}

async function authorize(): Promise<{ userId: string } | NextResponse> {
    try {
        const context = await requireGlobalAdminApiContext();
        return { userId: context.userId };
    } catch (error) {
        return jsonError('No autorizado.', getApiErrorStatus(error, 401));
    }
}

async function matchIdOf(params: Promise<{ id: string }>): Promise<string | null> {
    const { id } = await params;
    const decoded = decodeURIComponent(id || '').trim().toLowerCase();
    return parseWrMatchId(decoded) ? decoded : null;
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const auth = await authorize();
    if (auth instanceof NextResponse) return auth;

    const matchId = await matchIdOf(params);
    if (!matchId) return jsonError('Solo se puede cargar a mano un partido de World Rugby.', 400);

    const body = await request.json().catch(() => null);
    const result = parseWrManualResult(body);
    if (!result) return jsonError('Resultado inválido: falta el estado o algún marcador.', 400);

    try {
        const saved = await upsertExternalMatchResultOverride({
            matchId,
            provider: WR_PROVIDER,
            result,
            updatedBy: auth.userId,
        });
        return NextResponse.json({ ok: true, data: saved });
    } catch (error) {
        console.error('[Resultado manual] no se pudo guardar:', error);
        return jsonError(error instanceof Error ? error.message : 'No se pudo guardar el resultado.', 500);
    }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const auth = await authorize();
    if (auth instanceof NextResponse) return auth;

    const matchId = await matchIdOf(params);
    if (!matchId) return jsonError('Solo se puede cargar a mano un partido de World Rugby.', 400);

    try {
        await deleteExternalMatchResultOverride(matchId, WR_PROVIDER);
        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error('[Resultado manual] no se pudo borrar:', error);
        return jsonError(error instanceof Error ? error.message : 'No se pudo borrar el resultado.', 500);
    }
}
