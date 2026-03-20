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
            const [{ data: clubs, error: clubsError }, { data: unions, error: unionsError }] = await Promise.all([
                admin
                    .from('clubs')
                    .select('id, name, short_name, city, region, country, logo_url, primary_color, slug, is_visible, union_id')
                    .order('name'),
                admin
                    .from('unions')
                    .select('id, name'),
            ]);

            if (clubsError) return jsonError('Failed to load clubs', 500, clubsError.message);
            if (unionsError) return jsonError('Failed to load unions for clubs', 500, unionsError.message);

            const unionMap = new Map((unions ?? []).map((union) => [union.id, union]));
            const data = (clubs ?? []).map((club) => ({
                ...club,
                union: club.union_id ? unionMap.get(club.union_id) ?? null : null,
            }));

            return NextResponse.json({ data });
        }

        const [{ data: matches, error: matchesError }, { data: tournaments, error: tournamentsError }, { data: clubs, error: clubsError }] = await Promise.all([
            admin
                .from('matches')
                .select('id, round_id, round_label, date_time, venue, status, score, tournament_id, home_club_id, away_club_id')
                .order('date_time', { ascending: false }),
            admin
                .from('tournaments')
                .select('id, name, sport_id, sport, season_id'),
            admin
                .from('clubs')
                .select('id, name, logo_url, primary_color'),
        ]);

        if (matchesError) return jsonError('Failed to load matches', 500, matchesError.message);
        if (tournamentsError) return jsonError('Failed to load tournaments for matches', 500, tournamentsError.message);
        if (clubsError) return jsonError('Failed to load clubs for matches', 500, clubsError.message);

        const tournamentMap = new Map((tournaments ?? []).map((tournament) => [
            tournament.id,
            {
                id: tournament.id,
                name: tournament.name,
                sport_id: tournament.sport_id || tournament.sport || null,
                season_id: tournament.season_id,
            }
        ]));
        const clubMap = new Map((clubs ?? []).map((club) => [club.id, club]));

        const data = (matches ?? []).map((match) => ({
            ...match,
            round_id: match.round_label || match.round_id,
            tournament: match.tournament_id ? tournamentMap.get(match.tournament_id) ?? null : null,
            home_team: match.home_club_id ? clubMap.get(match.home_club_id) ?? null : null,
            away_team: match.away_club_id ? clubMap.get(match.away_club_id) ?? null : null,
        }));

        return NextResponse.json({ data });
    } catch (error) {
        return jsonError('Console data error', 500, error instanceof Error ? error.message : String(error));
    }
}
