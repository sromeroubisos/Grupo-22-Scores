/**
 * /api/cron/rebuild-stale-rankings
 *
 * Reconstruye los rankings de club marcados como "stale" FUERA del camino de
 * edicion. Al cargar/editar un resultado, `syncClubRankingsForMatchUpdate` ya no
 * corre el rebuild completo (O(clubes + partidos), cientos de round-trips
 * seriales que tumbaban la app por timeout): solo marca el ranking stale con un
 * unico write barato. Este cron hace el trabajo pesado en background, asi el
 * admin ve el resultado guardado al instante y el ranking se pone al dia en el
 * proximo tick (~1-2 min).
 *
 * `rebuildStaleClubRankings` limpia `stale_from_match_id` al reconstruir con
 * exito; si un ranking falla, queda stale para el proximo tick. Se procesa un
 * lote acotado por corrida para no pasarse del maxDuration.
 *
 * Llamado por Vercel Cron cada 2 minutos. Autenticacion: header Bearer {CRON_SECRET}.
 * Ver [[perf_edit_bottleneck_rootcause]].
 */
import { NextRequest, NextResponse } from 'next/server';
import { rebuildStaleClubRankings } from '@/lib/server/clubRankings';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function isAuthorized(request: NextRequest): boolean {
    const secret = process.env.CRON_SECRET;
    if (!secret) {
        if (process.env.NODE_ENV === 'development') {
            console.warn('[rebuild-stale-rankings] CRON_SECRET not set — allowing request in development mode');
            return true;
        }
        return false;
    }
    const authHeader = request.headers.get('authorization');
    return authHeader === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
    if (!isAuthorized(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const startedAt = Date.now();

    let result: { pending: number; rebuilt: number; failed: number } = { pending: 0, rebuilt: 0, failed: 0 };
    try {
        result = await rebuildStaleClubRankings({ limit: 25 });
    } catch (error) {
        console.error('[rebuild-stale-rankings] rebuild de rankings stale fallo:', error);
        return NextResponse.json({ ok: false, error: 'rebuild_failed' }, { status: 500 });
    }

    const elapsed = Date.now() - startedAt;
    console.log(
        `[rebuild-stale-rankings] Done: ${result.rebuilt} reconstruidos, ${result.failed} fallidos de ${result.pending} pendientes en ${elapsed}ms`,
    );

    return NextResponse.json({ ok: true, ...result, elapsed });
}
