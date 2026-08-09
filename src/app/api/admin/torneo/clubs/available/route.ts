import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getServiceWriter } from '@/lib/supabase/serviceWriter';
import { requireTournamentAdminContext } from '@/lib/auth/permissions';
import { resolveTournamentAdminScope } from '@/lib/auth/tournamentAdminScope';
import { buildTeamLogoProxyUrl } from '@/lib/utils/logoUrl';

function err(message: string, status = 400) {
    return NextResponse.json({ error: message }, { status });
}

/**
 * Lista los clubes a los que el admin de torneos AÚN no tiene acceso.
 * Alimenta el selector de "Solicitar acceso a otros clubes".
 */
export async function GET(request: NextRequest) {
    const supabase = await createClient();

    let context;
    try {
        context = await requireTournamentAdminContext(supabase);
    } catch {
        return err('Unauthorized', 401);
    }

    const scope = await resolveTournamentAdminScope(supabase, context);

    // El admin global ya ve todo: no tiene clubes "pendientes" que solicitar.
    if (scope.isUnlimited) {
        return NextResponse.json({ data: [] });
    }

    const { searchParams } = new URL(request.url);
    const search = (searchParams.get('search') || '').trim();
    const limit = Math.min(Number.parseInt(searchParams.get('limit') || '200', 10) || 200, 1000);

    // Service-role: lets a gestor request access to any club, including
    // hidden/draft ones the RLS SELECT policy would hide. Owned ids excluded below.
    const reader = getServiceWriter(supabase, 'admin/torneo/clubs/available');
    let query = reader
        .from('clubs')
        // Sin `logo_url`: es la columna con el escudo en base64 y acá se pide un
        // catálogo entero. El escudo viaja como URL del proxy (ver abajo).
        .select('id, name, short_name, slug, sport, sport_id, city, region, country, primary_color, updated_at')
        .order('name', { ascending: true })
        .limit(limit);

    const ownedIds = Array.from(scope.clubIds);
    if (ownedIds.length > 0) {
        const sanitized = ownedIds
            .map((id) => `"${String(id).replace(/["\\]/g, '')}"`)
            .join(',');
        query = query.not('id', 'in', `(${sanitized})`);
    }

    if (search) {
        const escaped = search.replace(/[%_]/g, (m) => `\\${m}`);
        query = query.or(`name.ilike.%${escaped}%,slug.ilike.%${escaped}%,short_name.ilike.%${escaped}%,city.ilike.%${escaped}%`);
    }

    const { data, error } = await query;
    if (error) {
        return err('No se pudieron cargar los clubes disponibles', 500);
    }

    return NextResponse.json({
        data: (data ?? []).map((club) => ({
            ...club,
            logo_url: buildTeamLogoProxyUrl({
                key: club.id,
                name: club.name,
                version: club.updated_at,
            }),
        })),
    });
}
