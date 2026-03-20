import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiUser } from '@/lib/auth/apiAdmin';
import { createAdminClient } from '@/lib/supabase/admin';

function jsonError(message: string, status = 500, details?: unknown) {
    return NextResponse.json({ error: message, details: details ?? null }, { status });
}

export async function GET(request: NextRequest) {
    try {
        await requireAdminApiUser();
    } catch {
        return jsonError('Unauthorized', 401);
    }

    const resource = new URL(request.url).searchParams.get('resource');

    if (!resource || !['clubs', 'matches'].includes(resource)) {
        return jsonError('Invalid resource', 400);
    }

    try {
        const admin = createAdminClient();

        if (resource === 'clubs') {
            const { data, error } = await admin
                .from('clubs')
                .select('id, name, short_name, city, region, country, logo_url, primary_color, slug, is_visible, union_id, union:unions(id, name)')
                .order('name');

            if (error) return jsonError('Failed to load clubs', 500, error.message);
            return NextResponse.json({ data: data ?? [] });
        }

        const { data, error } = await admin
            .from('matches')
            .select(`
                id, round_id, date_time, venue, status, score, tournament_id, home_club_id, away_club_id,
                tournament:tournaments(id, name, sport_id, season_id),
                home_team:clubs!matches_home_club_id_fkey(id, name, logo_url, primary_color),
                away_team:clubs!matches_away_club_id_fkey(id, name, logo_url, primary_color)
            `)
            .order('date_time', { ascending: false });

        if (error) return jsonError('Failed to load matches', 500, error.message);
        return NextResponse.json({ data: data ?? [] });
    } catch (error) {
        return jsonError('Console data error', 500, error instanceof Error ? error.message : String(error));
    }
}
