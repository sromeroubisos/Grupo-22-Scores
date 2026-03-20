import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiUser } from '@/lib/auth/apiAdmin';
import { getReadClient } from '@/lib/supabase/read';

function jsonError(message: string, status = 500, details?: unknown) {
    return NextResponse.json({ error: message, details: details ?? null }, { status });
}

function hasMissingColumnError(error: { code?: string | null; message?: string | null; details?: string | null } | null, column: string) {
    if (!error) return false;

    const haystack = `${error.message || ''} ${error.details || ''}`.toLowerCase();
    return error.code === 'PGRST204' || haystack.includes(column.toLowerCase());
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
};

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
                selectWithFallback(
                    readClient.from('clubs'),
                    [
                        'id, name, short_name, city, region, country, logo_url, primary_color, slug, is_visible, union_id',
                        'id, name, short_name, city, country, logo_url, slug, is_visible, union_id',
                        'id, name, city, country, logo_url, slug, is_visible, union_id',
                        'id, name, city, country, logo_url, union_id',
                        'id, name, union_id'
                    ],
                    { column: 'name', ascending: true }
                ),
                readClient
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

        const matchesQueryWithRoundLabel = readClient
            .from('matches')
            .select('id, round_id, round_label, date_time, venue, status, score, tournament_id, home_club_id, away_club_id')
            .order('date_time', { ascending: false });

        let matchesResult: { data: MatchConsoleRow[] | null; error: { code?: string | null; message?: string | null; details?: string | null } | null } =
            await matchesQueryWithRoundLabel;

        if (hasMissingColumnError(matchesResult.error, 'round_label')) {
            matchesResult = await readClient
                .from('matches')
                .select('id, round_id, date_time, venue, status, score, tournament_id, home_club_id, away_club_id')
                .order('date_time', { ascending: false });
        }

        const [{ data: tournaments, error: tournamentsError }, { data: clubs, error: clubsError }] = await Promise.all([
            selectWithFallback(
                readClient.from('tournaments'),
                [
                    'id, name, sport_id, sport, season_id',
                    'id, name, sport_id, sport',
                    'id, name, sport_id, season_id',
                    'id, name, sport',
                    'id, name'
                ]
            ),
            selectWithFallback(
                readClient.from('clubs'),
                [
                    'id, name, logo_url, primary_color',
                    'id, name, logo_url',
                    'id, name'
                ]
            ),
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
