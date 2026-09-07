/**
 * /api/cron/rugbypass-ratings
 *
 * Puntua los partidos de RugbyPass que ya terminaron y todavia no tienen
 * puntaje, y los guarda en `external_match_player_ratings`.
 *
 * ── POR QUE ES UN CRON Y NO SE CALCULA AL ABRIR LA FICHA ────────────────────
 * El puntaje de 1 a 10 sale de la PLANILLA del partido, y la planilla cuesta
 * veintitres requests al proveedor: la ficha con las alineaciones mas un pedido
 * por cada uno de los veintidos rubros. La tabla de partidos de un jugador
 * muestra cuarenta filas — calcularlas al vuelo serian novecientos requests por
 * visita.
 *
 * Un partido terminado no cambia mas, asi que se puntua una sola vez. Lo que
 * queda guardado lo lee la ficha del jugador sin tocar al proveedor.
 *
 * ── EL CUPO ES DE TIEMPO, NO DE PARTIDOS ────────────────────────────────────
 * Cada partido tarda del orden de tres segundos y la corrida tiene sesenta.
 * Por eso el corte es un presupuesto de milisegundos que se mira ANTES de
 * arrancar cada tanda: cortar por cantidad obliga a adivinar cuanto tarda el
 * proveedor hoy, y el dia que tarda el doble la funcion muere a la mitad.
 *
 * Cada partido se guarda apenas se puntua, no todos juntos al final: si la
 * corrida se corta, lo hecho queda hecho y la proxima sigue desde ahi.
 *
 * Vercel Cron: cada seis horas. Autenticacion: Bearer {CRON_SECRET}.
 * Con `?dry=1` no escribe nada y devuelve que hubiera hecho.
 */
import { authorizeCronRequest } from '@/lib/server/cronAuth';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isMissingTableError } from '@/lib/utils/supabaseSchema';
import {
    pendingMatches,
    ratePlayersOfMatch,
    saveMatchRatings,
} from '@/lib/services/rugbyPassMatchRatings';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Cuanto de la corrida se gasta pidiendo planillas. Los quince segundos que
 * quedan son para la ultima escritura y para que la funcion cierre sola en vez
 * de que la corte Vercel.
 */
const PRESUPUESTO_MS = 45_000;

/**
 * Cuantos partidos se piden en paralelo. Dos: son veintitres requests cada uno,
 * y el proveedor no tiene por que aguantar cuarenta y seis conexiones de golpe
 * para llenar una tabla que no corre ningun apuro.
 */
const CONCURRENCIA = 2;

/** Tope duro por corrida, para que un dia raro no se lleve la cuota entera. */
const MAX_PARTIDOS = 24;

export async function GET(request: NextRequest) {
    if (!(await authorizeCronRequest(request, 'rugbypass-ratings'))) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const dry = searchParams.get('dry') === '1';
    const pedido = Number(searchParams.get('limit'));
    const cupo = Number.isFinite(pedido) && pedido > 0 ? Math.min(pedido, MAX_PARTIDOS) : MAX_PARTIDOS;

    const startedAt = Date.now();
    const supabase = createAdminClient();

    let pendientes;
    try {
        pendientes = await pendingMatches(supabase, cupo);
    } catch (e) {
        const error = e as { code?: string; message?: string };
        if (error.code === '42P01' || isMissingTableError(error, 'external_match_rating_runs')) {
            console.warn('[rugbypass-ratings] falta la migración 20260907120000_external_match_player_ratings.sql');
            return NextResponse.json(
                {
                    ok: false,
                    reason: 'missing_table',
                    message: 'Aplicar 20260907120000_external_match_player_ratings.sql.',
                },
                { status: 500 }
            );
        }
        throw e;
    }

    if (pendientes.length === 0) {
        return NextResponse.json({
            ok: true, pending: 0, rated: 0, players: 0, elapsed: Date.now() - startedAt,
        });
    }

    if (dry) {
        return NextResponse.json({
            ok: true,
            dry: true,
            pending: pendientes.length,
            matches: pendientes.map((m) => ({ id: m.id, date: m.dateTime })),
        });
    }

    let rated = 0;
    let players = 0;
    let sinPlanilla = 0;
    let fallados = 0;
    let cortadaPorTiempo = false;

    for (let i = 0; i < pendientes.length; i += CONCURRENCIA) {
        if (Date.now() - startedAt > PRESUPUESTO_MS) {
            cortadaPorTiempo = true;
            break;
        }

        const tanda = pendientes.slice(i, i + CONCURRENCIA);
        await Promise.all(
            tanda.map(async (partido) => {
                try {
                    const { rows, ok } = await ratePlayersOfMatch(partido);
                    await saveMatchRatings(supabase, partido.id, rows, ok);
                    rated++;
                    players += rows.length;
                    // Que el proveedor no publique rubros de esa competicion no
                    // es una falla: se cuenta aparte para no confundirlo con una
                    // caida.
                    if (!ok) sinPlanilla++;
                } catch (e) {
                    // Un partido que falla no puede voltear la corrida: queda sin
                    // marca y lo agarra la proxima.
                    fallados++;
                    console.warn(`[rugbypass-ratings] ${partido.id} no se pudo puntuar:`, e);
                }
            })
        );
    }

    const elapsed = Date.now() - startedAt;
    console.log(
        `[rugbypass-ratings] ${rated} partidos puntuados (${players} jugadores) en ${elapsed}ms` +
        (sinPlanilla ? ` — ${sinPlanilla} sin planilla publicada` : '') +
        (fallados ? ` — ${fallados} fallaron` : '') +
        (cortadaPorTiempo ? ' — cortada por tiempo, sigue en la próxima' : '')
    );

    return NextResponse.json({
        ok: true,
        pending: pendientes.length,
        rated,
        players,
        withoutSheet: sinPlanilla,
        failed: fallados,
        stoppedByBudget: cortadaPorTiempo,
        elapsed,
    });
}
