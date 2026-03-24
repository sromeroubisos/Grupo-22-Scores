import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiUser } from '@/lib/auth/apiAdmin';
import { getReadClient } from '@/lib/supabase/read';

function jsonError(message: string, status = 500, details?: unknown) {
    return NextResponse.json({ error: message, details: details ?? null }, { status });
}

async function selectWithFallback<T>(
    baseQuery: {
        select: (columns: string) => PromiseLike<{
            data: T[] | null;
            error: { code?: string | null; message?: string | null; details?: string | null } | null;
        }> & {
            order: (
                column: string,
                options?: { ascending?: boolean }
            ) => PromiseLike<{
                data: T[] | null;
                error: { code?: string | null; message?: string | null; details?: string | null } | null;
            }>;
        };
    },
    variants: string[],
    orderBy?: { column: string; ascending?: boolean }
) {
    let lastError: { code?: string | null; message?: string | null; details?: string | null } | null = null;

    for (const columns of variants) {
        const query = baseQuery.select(columns);
        const result = orderBy
            ? await query.order(orderBy.column, { ascending: orderBy.ascending })
            : await query;

        if (!result?.error) {
            return { data: result?.data || [], error: null };
        }

        lastError = result.error;

        if (result.error.code !== 'PGRST204') {
            return { data: null, error: result.error };
        }
    }

    return { data: null, error: lastError };
}

type MatchConsoleRow = {
    id: string;
    round_id: string | null;
    round_label?: string | null;
    date_time: string;
    venue: string | null;
    status: string | null;
    score: unknown;
    tournament_id: string | null;
    home_club_id: string | null;
    away_club_id: string | null;
    sport?: string | null;
    sport_id?: string | null;
};

type ClubConsoleRow = {
    id: string;
    name: string;
    short_name?: string | null;
    city?: string | null;
    region?: string | null;
    country?: string | null;
    logo_url?: string | null;
    primary_color?: string | null;
    slug?: string | null;
    is_visible?: boolean | null;
    union_id?: string | null;
    sport?: string | null;
    sport_id?: string | null;
};

type UnionConsoleRow = {
    id: string;
    name: string;
};

type TournamentConsoleRow = {
    id: string;
    name: string;
    sport_id?: string | null;
    sport?: string | null;
    season_id?: string | null;
};

function normalizeSportValue(value: string | null | undefined) {
    const normalized = value?.trim().toLowerCase();
    return normalized || null;
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
        const readClient = await getReadClient();

        if (resource === 'clubs') {
            const [{ data: clubs, error: clubsError }, { data: unions, error: unionsError }] = await Promise.all([
                selectWithFallback<ClubConsoleRow>(
                    readClient.from('clubs'),
                    [
                        'id, name, short_name, city, region, country, logo_url, primary_color, slug, is_visible, union_id, sport, sport_id',
                        'id, name, short_name, city, region, country, logo_url, primary_color, slug, is_visible, union_id, sport',
                        'id, name, short_name, city, region, country, logo_url, primary_color, slug, is_visible, union_id, sport_id',
                        'id, name, short_name, city, country, logo_url, slug, is_visible, union_id, sport',
                        'id, name, short_name, city, country, logo_url, slug, is_visible, union_id, sport_id',
                        'id, name, city, country, logo_url, slug, is_visible, union_id, sport',
                        'id, name, city, country, logo_url, slug, is_visible, union_id, sport_id',
                        'id, name, city, country, logo_url, union_id, sport',
                        'id, name, city, country, logo_url, union_id, sport_id',
                        'id, name, union_id'
                    ],
                    { column: 'name', ascending: true }
                ),
                readClient
                    .from('unions')
                    .select('id, name') as PromiseLike<{
                    data: UnionConsoleRow[] | null;
                    error: { code?: string | null; message?: string | null; details?: string | null } | null;
                }>,
            ]);

            if (clubsError) return jsonError('Failed to load clubs', 500, clubsError.message);
            if (unionsError) return jsonError('Failed to load unions for clubs', 500, unionsError.message);

            const unionMap = new Map((unions ?? []).map((union) => [union.id, union]));
            const data = (clubs ?? []).map((club) => ({
                ...club,
                sport: club.sport || club.sport_id || null,
                union: club.union_id ? unionMap.get(club.union_id) ?? null : null,
            }));

            return NextResponse.json({ data });
        }

        const tournamentsPromise = selectWithFallback<TournamentConsoleRow>(
            readClient.from('tournaments'),
            [
                'id, name, sport_id, sport, season_id',
                'id, name, sport_id, sport',
                'id, name, sport_id, season_id',
                'id, name, sport',
                'id, name'
            ]
        );
        const clubsPromise = selectWithFallback<ClubConsoleRow>(
            readClient.from('clubs'),
            [
                'id, name, logo_url, primary_color, sport, sport_id',
                'id, name, logo_url, primary_color, sport_id',
                'id, name, logo_url, primary_color, sport',
                'id, name, logo_url, sport, sport_id',
                'id, name, logo_url, sport_id',
                'id, name, logo_url, sport',
                'id, name, logo_url',
                'id, name'
            ]
        );

        const matchesResult = await selectWithFallback<MatchConsoleRow>(
            readClient.from('matches'),
            [
                'id, round_id, round_label, date_time, venue, status, score, tournament_id, home_club_id, away_club_id, sport_id, sport',
                'id, round_id, round_label, date_time, venue, status, score, tournament_id, home_club_id, away_club_id, sport_id',
                'id, round_id, round_label, date_time, venue, status, score, tournament_id, home_club_id, away_club_id, sport',
                'id, round_id, round_label, date_time, venue, status, score, tournament_id, home_club_id, away_club_id',
                'id, round_id, date_time, venue, status, score, tournament_id, home_club_id, away_club_id, sport_id, sport',
                'id, round_id, date_time, venue, status, score, tournament_id, home_club_id, away_club_id, sport_id',
                'id, round_id, date_time, venue, status, score, tournament_id, home_club_id, away_club_id, sport',
                'id, round_id, date_time, venue, status, score, tournament_id, home_club_id, away_club_id'
            ],
            { column: 'date_time', ascending: false }
        );

        const [{ data: tournaments, error: tournamentsError }, { data: clubs, error: clubsError }] = await Promise.all([
            tournamentsPromise,
            clubsPromise,
        ]);

        const { data: matches, error: matchesError } = matchesResult;

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

        const data = (matches ?? []).map((match) => {
            const tournament = match.tournament_id ? tournamentMap.get(match.tournament_id) ?? null : null;
            const homeTeam = match.home_club_id ? clubMap.get(match.home_club_id) ?? null : null;
            const awayTeam = match.away_club_id ? clubMap.get(match.away_club_id) ?? null : null;
            const resolvedSportId = normalizeSportValue(
                match.sport_id ||
                match.sport ||
                tournament?.sport_id ||
                homeTeam?.sport_id ||
                homeTeam?.sport ||
                awayTeam?.sport_id ||
                awayTeam?.sport ||
                null
            );

            return {
                ...match,
                sport_id: resolvedSportId,
                round_id: match.round_label || match.round_id,
                tournament,
                home_team: homeTeam,
                away_team: awayTeam,
            };
        });

        return NextResponse.json({ data });
    } catch (error) {
        return jsonError('Console data error', 500, error instanceof Error ? error.message : String(error));
    }
}
