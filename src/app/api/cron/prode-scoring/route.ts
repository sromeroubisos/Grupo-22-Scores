/**
 * /api/cron/prode-scoring
 *
 * Mantiene el prode al día FUERA del camino de render:
 *   1. Sincroniza los eventos base (partidos) de las competencias en curso desde
 *      sus proveedores (ESPN para fútbol, FlashScore/cache para el resto).
 *   2. Recalcula scoreboards: puntos por predicción, rankings por competencia/liga
 *      y la tabla total de usuarios (prode_user_totals).
 *
 * Así las páginas del lobby (/prode, /prode/ranking-global y /api/prode/leaderboard)
 * solo LEEN tablas ya computadas, en vez de disparar este trabajo pesado de
 * escritura en cada visita. Las vistas de juego (/prode/[slug]) conservan su
 * refresh por-competencia para inmediatez al abrir un prode puntual.
 *
 * Llamado por Vercel Cron cada 5 minutos: "*\/5 * * * *"
 * Autenticación: header Bearer {CRON_SECRET}.
 */
import { authorizeCronRequest } from '@/lib/server/cronAuth';
import { NextRequest, NextResponse } from 'next/server';
import { syncActiveProdeCompetitionsBaseEvents } from '@/lib/server/prodePlay';
import { refreshStoredProdeScoreboards } from '@/lib/server/prodeScoring';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;


export async function GET(request: NextRequest) {
    if (!(await authorizeCronRequest(request, 'prode-scoring'))) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const startedAt = Date.now();

    // Cada etapa es best-effort: un fallo de proveedor externo o del motor no debe
    // abortar la otra etapa ni devolver 500 al scheduler.
    let sync: { total: number; synced: number; errors: number } = { total: 0, synced: 0, errors: 0 };
    try {
        sync = await syncActiveProdeCompetitionsBaseEvents();
    } catch (error) {
        console.error('[prode-scoring] sync de eventos base falló:', error);
    }

    let scored = false;
    try {
        scored = await refreshStoredProdeScoreboards();
    } catch (error) {
        console.error('[prode-scoring] refresh de scoreboards falló:', error);
    }

    const elapsed = Date.now() - startedAt;
    console.log(`[prode-scoring] Done: synced ${sync.synced}/${sync.total} competencias, scored=${scored} en ${elapsed}ms`);

    return NextResponse.json({ ok: true, sync, scored, elapsed });
}
