import { NextRequest, NextResponse } from 'next/server';
import { getReadClient } from '@/lib/supabase/read';
import { fetchPublicTournamentSponsors } from '@/lib/server/tournamentSponsors';
import { isUuid } from '@/lib/utils/postgrest';

export const dynamic = 'force-dynamic';

/**
 * Sponsors ACTIVOS de un torneo para la página pública.
 *
 * Sin autenticación. Devuelve solo lo comercial (logo, nombre, link): la
 * lectura sale por la vista `tournament_sponsors_public`, que no tiene el
 * monto. Acepta el id o el slug del torneo.
 */
export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const { id } = await params;
    const raw = (id || '').trim();
    if (!raw) {
        return NextResponse.json({ data: [] });
    }

    let tournamentId = raw;
    if (!isUuid(raw)) {
        try {
            const db = await getReadClient();
            const { data } = await db
                .from('tournaments')
                .select('id')
                .eq('slug', raw)
                .maybeSingle();
            if (!data?.id) {
                return NextResponse.json({ data: [] });
            }
            tournamentId = String(data.id);
        } catch {
            return NextResponse.json({ data: [] });
        }
    }

    const sponsors = await fetchPublicTournamentSponsors(tournamentId);
    return NextResponse.json(
        { data: sponsors },
        { headers: { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=600' } },
    );
}
