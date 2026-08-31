/**
 * /api/cron/world-rugby-rankings
 *
 * Los lunes, que es cuando World Rugby publica. La agenda de Vercel dice
 * `0 14 * * 1` (11:00 de Argentina): la actualizacion de ellos sale durante la
 * maniana europea, asi que a esa hora ya esta arriba y todavia es lunes
 * temprano aca.
 *
 * Guarda una foto por categoria en `world_rugby_ranking_snapshots`. La pantalla
 * lee esa tabla; el pedido a Pulselive queda como red de contencion para cuando
 * el cron no llego a correr.
 *
 * Que corra dos veces un lunes no rompe nada: la clave es (categoria, fecha) y
 * la segunda pasada pisa la primera con el mismo dato.
 *
 * Autenticacion: header Bearer {CRON_SECRET} o API key con scope `cron:run`.
 * Con `?dry=1` consulta y reporta sin escribir — es lo que hay que usar para
 * probar desde local, porque SITE_URL apunta a localhost y una sonda sin `dry`
 * escribe en produccion.
 */
import { NextRequest, NextResponse } from 'next/server';
import { authorizeCronRequest } from '@/lib/server/cronAuth';
import { refreshWorldRugbySnapshots } from '@/lib/server/worldRugbyRankings';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
    if (!(await authorizeCronRequest(request, 'world-rugby-rankings'))) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const dryRun = request.nextUrl.searchParams.get('dry') === '1';
    const startedAt = Date.now();

    const results = await refreshWorldRugbySnapshots({ dryRun });
    const elapsed = Date.now() - startedAt;
    const fallaron = results.filter((result) => !result.ok);

    for (const result of fallaron) {
        console.error(`[world-rugby-rankings] fallo ${result.category}: ${result.error}`);
    }

    const resumen = results
        .filter((result) => result.ok)
        .map((result) => (
            `${result.category}: ${result.entries} uniones al ${result.effectiveDate}, lidera ${result.leader}`
        ))
        .join(' | ');

    console.log(`[world-rugby-rankings]${dryRun ? ' (dry)' : ''} ${resumen || 'sin datos'}, ${elapsed}ms`);

    // Una categoria caida no es un exito a medias: si las dos fallaron, el cron
    // tiene que verse rojo en el panel de Vercel y no pasar de largo.
    return NextResponse.json(
        { ok: fallaron.length === 0, dryRun, results, elapsed },
        { status: fallaron.length === results.length ? 502 : 200 },
    );
}
