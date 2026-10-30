/**
 * /api/cron/rugbypass-catalog
 *
 * Vuelca el catalogo de RugbyPass —299 equipos y 5045 jugadores— a
 * `external_teams` y `external_players`, que es de donde el buscador saca los
 * resultados. Sin esta corrida las fichas existen pero no se pueden encontrar.
 *
 * ── POR QUE ES DIARIO Y NO HORARIO ──────────────────────────────────────────
 * Un plantel cambia entre temporadas, no entre horas. `rugbypass-sync` corre
 * cada hora porque los PARTIDOS se mueven; esto no. Y hay un motivo de costo:
 * la lista de jugadores se pide competicion por competicion en serie —trece
 * respuestas de cientos de KB— y meterla en la corrida horaria seria pagar
 * veinticuatro veces por dia por reescribir las mismas filas.
 *
 * Por eso tampoco va colgado del cron de partidos: aquel tiene sesenta segundos
 * y ya los usa en las dos puertas de fixtures.
 *
 * Vercel Cron: una vez por dia. Autenticacion: Bearer {CRON_SECRET}.
 * Con `?dry=1` no escribe y devuelve cuantas filas hubiera escrito.
 */
import { authorizeCronRequest } from '@/lib/server/cronAuth';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { syncRugbyPassDirectory } from '@/lib/services/rugbyPassDirectory';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
    if (!(await authorizeCronRequest(request, 'rugbypass-catalog'))) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const dry = new URL(request.url).searchParams.get('dry') === '1';
    const startedAt = Date.now();

    try {
        const resultado = await syncRugbyPassDirectory(createAdminClient(), { dry });

        // La tabla que falta no es una caida del proveedor: es una migracion sin
        // correr, y se dice con el nombre del archivo para que no haya que
        // adivinarlo desde un log.
        if (resultado.missingTables.includes('external_players')) {
            console.warn(
                '[rugbypass-catalog] falta la migración 20260907180000_external_players.sql:'
                + ' los equipos se actualizaron, los jugadores no'
            );
        }

        return NextResponse.json({
            ok: true,
            dry,
            teams: resultado.teams,
            players: resultado.players,
            missingTables: resultado.missingTables,
            elapsed: Date.now() - startedAt,
        });
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        console.error('[rugbypass-catalog] la corrida no pudo completarse:', e);
        return NextResponse.json(
            { ok: false, error: message, elapsed: Date.now() - startedAt },
            { status: 500 }
        );
    }
}
