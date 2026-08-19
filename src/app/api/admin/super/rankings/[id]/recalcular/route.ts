/**
 * POST /api/admin/super/rankings/[id]/recalcular
 *
 * El boton "Recalcular" del panel. Corre la MISMA cuenta que el cron de los
 * martes (`actualizarRankingSemanal`): la temporada entera desde los puntajes
 * iniciales, en memoria, y una escritura en lote.
 *
 * Antes el boton apuntaba a `recalculate-from-match`, que es otra cosa: el
 * rebuild viejo, que ademas de ser mucho mas caro deja la tabla con otra
 * semantica —el "anterior" pasa a ser el puntaje previo al ultimo partido, y las
 * posiciones anteriores se borran, asi que la tabla publica se queda sin las
 * flechas de subio/bajo—. Dos caminos que dan tablas distintas es una fuente de
 * bugs por si sola; este deja uno solo.
 *
 * Y no depende de que el ranking este marcado como stale: forzar la cuenta tiene
 * que poder hacerse siempre, que para eso esta el boton.
 */
import { NextResponse } from 'next/server';
import { requireGlobalAdminApiUser } from '@/lib/auth/apiAdmin';
import { actualizarRankingSemanal, getClubRankingDetail } from '@/lib/server/clubRankings';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function getStatusCode(error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    if (message === 'Unauthorized') return 401;
    if (message === 'Forbidden') return 403;
    if (message.includes('schema cache')) return 503;
    if (message.includes('No se encontro')) return 404;
    return 500;
}

export async function POST(
    _request: Request,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        await requireGlobalAdminApiUser();
        const { id } = await params;

        const resumen = await actualizarRankingSemanal(id);
        const data = await getClubRankingDetail(id);

        return NextResponse.json({ data, resumen });
    } catch (error) {
        return NextResponse.json(
            {
                error: error instanceof Error ? error.message : 'No se pudo recalcular el ranking.',
                details: null,
            },
            { status: getStatusCode(error) },
        );
    }
}
