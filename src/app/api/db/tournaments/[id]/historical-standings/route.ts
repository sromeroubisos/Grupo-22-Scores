import { NextRequest, NextResponse } from 'next/server';
import { getReadClient } from '@/lib/supabase/read';
import { buildTournamentHistoricalStandings } from '@/lib/server/historicalStandings';

export const dynamic = 'force-dynamic';

/**
 * Tabla histórica del torneo: la suma de la tabla de fase regular de cada
 * temporada (src/lib/server/historicalStandings.ts).
 *
 * Cambia solo cuando termina un partido, y armarla lee todas las temporadas
 * (el Top 14 son 40), así que se cachea unos minutos en el borde.
 */
export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const { id } = await params;
    try {
        const supabase = await getReadClient();
        const result = await buildTournamentHistoricalStandings(supabase, id);
        if (!result) return NextResponse.json({ ok: false, error: 'Torneo no encontrado.' }, { status: 404 });
        return NextResponse.json(
            { ok: true, ...result },
            // max-age=0: el que cachea es el borde, no el navegador. Sin él, Chrome
            // guardaba la respuesta por heurística y seguía mostrando la vieja.
            { headers: { 'Cache-Control': 'public, max-age=0, s-maxage=600, stale-while-revalidate=3600' } },
        );
    } catch (error) {
        console.error('[historical-standings]', id, error);
        return NextResponse.json(
            { ok: false, error: 'No se pudo armar la tabla histórica.' },
            { status: 500, headers: { 'Cache-Control': 'no-store' } },
        );
    }
}
