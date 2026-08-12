/**
 * /api/cron/weekly-club-ranking
 *
 * El ÚNICO momento en que se mueve el ranking de clubes: los martes a las 00:00
 * de Argentina (`0 3 * * 2` en UTC, que es como Vercel lee el cron).
 *
 * Guardar un resultado dejó de tocar el ranking. Antes cada partido cargado
 * disparaba el sync, y como los resultados se cargan fuera de orden
 * cronológico, casi siempre terminaba marcando el ranking para reconstruir: la
 * reconstrucción borraba las ~800 aplicaciones y las rehacía de a una, cada dos
 * minutos, disputándole las filas al gestor que estaba cargando la fecha. Ese
 * era el trabe al cargar varios resultados seguidos.
 *
 * `applyPendingMatchesToRanking` hace la cuenta entera en memoria y escribe en
 * bloque: ~8 viajes a la base por una semana de resultados.
 *
 * Autenticación: header Bearer {CRON_SECRET}.
 */
import { NextRequest, NextResponse } from 'next/server';
import { runWeeklyClubRankingUpdate } from '@/lib/server/clubRankings';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function isAuthorized(request: NextRequest): boolean {
    const secret = process.env.CRON_SECRET;
    if (!secret) {
        if (process.env.NODE_ENV === 'development') {
            console.warn('[weekly-club-ranking] CRON_SECRET no configurado — se permite en desarrollo');
            return true;
        }
        return false;
    }

    return request.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
    if (!isAuthorized(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const startedAt = Date.now();

    try {
        const rankings = await runWeeklyClubRankingUpdate();
        const elapsed = Date.now() - startedAt;
        const aplicados = rankings.reduce((total, r) => total + (r.aplicados ?? 0), 0);

        console.log(
            `[weekly-club-ranking] ${aplicados} partidos aplicados en ${rankings.length} rankings, ${elapsed}ms`,
        );

        return NextResponse.json({ ok: true, rankings, aplicados, elapsed });
    } catch (error) {
        console.error('[weekly-club-ranking] fallo la actualizacion semanal:', error);
        return NextResponse.json({ ok: false, error: 'weekly_update_failed' }, { status: 500 });
    }
}
