import { NextRequest, NextResponse } from 'next/server';
import { getReadClient } from '@/lib/supabase/read';
import { buildTournamentSquadTable } from '@/lib/server/squadTable';
import { getTournamentReadAccess } from '@/lib/server/tournamentReadGate';

export const dynamic = 'force-dynamic';

/**
 * Tabla de planteles del torneo (src/lib/server/squadTable.ts). Un torneo que no
 * pertenece a ninguna agrupación contesta `available: false`: la página no
 * muestra la pestaña.
 */
export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const { id } = await params;
    try {
        const access = await getTournamentReadAccess(id);
        if (access === 'denied') {
            return NextResponse.json({ ok: false, available: false }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
        }
        const supabase = await getReadClient();
        const payload = await buildTournamentSquadTable(supabase, id);
        return NextResponse.json(
            { ok: true, ...payload },
            { headers: { 'Cache-Control': access === 'restricted' ? 'private, no-store' : 'public, max-age=0, s-maxage=300, stale-while-revalidate=1800' } },
        );
    } catch (error) {
        console.error('[squad-table]', id, error);
        return NextResponse.json({ ok: false, available: false }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
    }
}
