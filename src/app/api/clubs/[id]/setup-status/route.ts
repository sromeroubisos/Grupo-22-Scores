import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { fetchDivisions } from '@/lib/services/divisionService';

function err(message: string, status: number) {
    return NextResponse.json({ error: message }, { status });
}

// ─── GET /api/clubs/:id/setup-status ─────────────────────────────────────────
// Devuelve el estado de configuración del club: qué secciones están completas.

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const supabase = await createClient();

    const [clubRes, divisions, venuesRes] = await Promise.all([
        // Sin `select('*')`: esa consulta se traía `logo_url`, que en los clubes
        // con escudo embebido son ~870 KB de base64 por una pantalla que solo
        // necesita saber SI hay escudo.
        supabase.from('clubs').select('name, logo_url, primary_color, is_visible, status').eq('id', id).single(),
        fetchDivisions(id),
        supabase.from('club_venues').select('id',    { count: 'exact', head: true }).eq('club_id', id),
    ]);

    if (clubRes.error || !clubRes.data) return err('Club no encontrado', 404);

    const club = clubRes.data;
    const divisionCount = divisions.length;
    const venueCount    = venuesRes.count    ?? 0;

    const missingIdentity: string[] = [];
    if (!club.name)          missingIdentity.push('name');
    if (!club.logo_url)      missingIdentity.push('logo_url');
    if (!club.primary_color) missingIdentity.push('primary_color');

    const steps = {
        identity: {
            done:          missingIdentity.length === 0,
            missingFields: missingIdentity,
        },
        venues: {
            done:  venueCount > 0,
            count: venueCount,
        },
        divisions: {
            done:  divisionCount > 0,
            count: divisionCount,
        },
    };

    const canPublish = steps.identity.done && steps.divisions.done;

    return NextResponse.json({
        data: {
            clubId:      id,
            isPublished: club.is_visible === true && club.status === 'published',
            status:      club.status,
            steps,
            canPublish,
        },
    });
}
