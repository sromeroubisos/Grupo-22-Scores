import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getServiceWriter } from '@/lib/supabase/serviceWriter';
import { requireTournamentAdminContext } from '@/lib/auth/permissions';
import { resolveTournamentAdminScope } from '@/lib/auth/tournamentAdminScope';

function err(message: string, status = 400) {
    return NextResponse.json({ error: message }, { status });
}

/**
 * Lista los torneos a los que el admin de torneos AÚN no tiene acceso.
 * Alimenta el selector de "Solicitar acceso a otros torneos".
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

    // El admin global ya ve todo: no tiene torneos "pendientes" que solicitar.
    if (scope.isUnlimited) {
        return NextResponse.json({ data: [] });
    }

    const { searchParams } = new URL(request.url);
    const search = (searchParams.get('search') || '').trim();
    const limit = Math.min(Number.parseInt(searchParams.get('limit') || '200', 10) || 200, 1000);

    // Service-role: lets a gestor request access to any tournament, including
    // drafts the RLS SELECT policy would hide. Owned ids are excluded below.
    const reader = getServiceWriter(supabase, 'admin/torneo/tournaments/available');
    let query = reader
        .from('tournaments')
        .select('id, name, display_name, slug, sport_id, season_id, country, region, format, status, logo_url, primary_color')
        .order('created_at', { ascending: false })
        .limit(limit);

    const ownedIds = Array.from(scope.tournamentIds);
    if (ownedIds.length > 0) {
        const sanitized = ownedIds
            .map((id) => `"${String(id).replace(/["\\]/g, '')}"`)
            .join(',');
        query = query.not('id', 'in', `(${sanitized})`);
    }

    if (search) {
        const escaped = search.replace(/[%_]/g, (m) => `\\${m}`);
        query = query.or(`name.ilike.%${escaped}%,display_name.ilike.%${escaped}%,slug.ilike.%${escaped}%`);
    }

    const { data, error } = await query;
    if (error) {
        return err('No se pudieron cargar los torneos disponibles', 500);
    }

    return NextResponse.json({ data: data ?? [] });
}
