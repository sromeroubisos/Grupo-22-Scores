import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiUser } from '@/lib/auth/apiAdmin';
import { getReadClient } from '@/lib/supabase/read';
import { isMissingColumnError } from '@/lib/utils/supabaseSchema';

type QueryError = {
    code?: string | null;
    message?: string | null;
    details?: string | null;
} | null;

const AUXILIARY_QUERY_TIMEOUT_MS = 8_000;

function jsonError(message: string, status = 500, details?: unknown) {
    return NextResponse.json({ error: message, details: details ?? null }, { status });
}

function getSelectedColumns(columns: string) {
    return columns
        .split(',')
        .map((column) => {
            const trimmed = column.trim();
            if (!trimmed) return null;

            const aliasTarget = trimmed.includes(':')
                ? trimmed.split(':').slice(-1)[0]
                : trimmed;

            return aliasTarget.trim();
        })
        .filter((column): column is string => Boolean(column));
}

function isRetryableMissingColumnError(error: QueryError, columns: string) {
    if (!error) return false;

    const selectedColumns = getSelectedColumns(columns);
    if (selectedColumns.some((column) => isMissingColumnError(error, column))) {
        return true;
    }

    const haystack = `${error.message || ''} ${error.details || ''}`.toLowerCase();
    return (error.code === 'PGRST204' || error.code === '42703') && haystack.includes('column');
}

async function withSoftTimeout<T>(
    promise: PromiseLike<T>,
    ms: number,
    fallback: T,
    label: string,
) {
    let settled = false;

    return new Promise<T>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
            if (settled) return;
            settled = true;
            console.warn(`[ConsoleData] ${label} timed out after ${ms}ms, using fallback.`);
            resolve(fallback);
        }, ms);

        Promise.resolve(promise)
            .then((value) => {
                if (settled) return;
                settled = true;
                clearTimeout(timeoutId);
                resolve(value);
            })
            .catch((error) => {
                if (settled) return;
                settled = true;
                clearTimeout(timeoutId);
                reject(error);
            });
    });
}

async function selectWithFallback<T>(
    baseQuery: {
        select: (columns: string) => PromiseLike<{
            data: T[] | null;
            error: QueryError;
        }> & {
            order: (
                column: string,
                options?: { ascending?: boolean }
            ) => PromiseLike<{
                data: T[] | null;
                error: QueryError;
            }>;
        };
    },
    variants: string[],
    orderBy?: { column: string; ascending?: boolean }
) {
    let lastError: QueryError = null;

    for (const columns of variants) {
        const query = baseQuery.select(columns);
        const result = orderBy
            ? await query.order(orderBy.column, { ascending: orderBy.ascending })
            : await query;

        if (!result?.error) {
            return { data: result?.data || [], error: null };
        }

        lastError = result.error;

        if (!isRetryableMissingColumnError(result.error, columns)) {
            return { data: null, error: result.error };
        }
    }

    return { data: null, error: lastError };
}

async function selectManyWithFallback<T>(
    execute: (columns: string) => PromiseLike<{
        data: T[] | null;
        error: QueryError;
    }>,
    variants: string[],
) {
    let lastError: QueryError = null;

    for (const columns of variants) {
        const result = await execute(columns);
        if (!result.error) {
            return { data: result.data || [], error: null };
        }

        lastError = result.error;
        if (!isRetryableMissingColumnError(result.error, columns)) {
            return { data: [], error: result.error };
        }
    }

    return { data: [], error: lastError };
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
    followers_count?: number;
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

type TournamentAdminListRow = {
    id: string;
    name: string;
    slug?: string | null;
    sport_id?: string | null;
    country_id?: string | null;
    logo_url?: string | null;
    is_popular?: boolean | null;
    is_active?: boolean | null;
    display_order?: number | null;
    priority?: number | null;
    created_at?: string | null;
    updated_at?: string | null;
    season_id?: string | null;
    status?: string | null;
    category?: string | null;
    age_grade?: string | null;
    format?: string | null;
    is_visible?: boolean | null;
    is_api_managed?: boolean | null;
    data_source?: string | null;
    display_name?: string | null;
    original_name?: string | null;
    union_id?: string | null;
    external_id?: string | null;
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

    if (!resource || !['clubs', 'matches', 'tournaments'].includes(resource)) {
        return jsonError('Invalid resource', 400);
    }

    try {
        const readClient = await getReadClient();

        if (resource === 'clubs') {
            const [
                { data: clubs, error: clubsError },
                { data: unions, error: unionsError },
                { data: clubFavs, error: clubFavsError },
            ] = await Promise.all([
                selectWithFallback<ClubConsoleRow>(
                    readClient.from('clubs'),
                    [
                        'id, name, short_name, city, region, country, logo_url, primary_color, slug, is_visible, union_id, sport, sport_id',
                        'id, name, short_name, city, country, logo_url, primary_color, slug, is_visible, union_id, sport',
                        'id, name, city, country, logo_url, slug, is_visible, union_id',
                    ]
                ),
                withSoftTimeout(
                    readClient
                        .from('unions')
                        .select('id, name') as PromiseLike<{
                            data: UnionConsoleRow[] | null;
                            error: { code?: string | null; message?: string | null; details?: string | null } | null;
                        }>,
                    AUXILIARY_QUERY_TIMEOUT_MS,
                    { data: [] as UnionConsoleRow[], error: null },
                    'clubs unions lookup'
                ),
                withSoftTimeout(
                    readClient
                        .from('favorites')
                        .select('entity_id')
                        .eq('entity_type', 'club') as PromiseLike<{
                            data: { entity_id: string }[] | null;
                            error: { code?: string | null; message?: string | null; details?: string | null } | null;
                        }>,
                    AUXILIARY_QUERY_TIMEOUT_MS,
                    { data: [] as { entity_id: string }[], error: null },
                    'clubs favorites lookup'
                ),
            ]);

            if (clubsError) return jsonError('Failed to load clubs', 500, clubsError.message);

            if (unionsError) {
                console.warn('[ConsoleData] Failed to load unions for clubs, continuing without union labels:', unionsError.message);
            }

            if (clubFavsError) {
                console.warn('[ConsoleData] Failed to load club favorites, continuing with zero follower counts:', clubFavsError.message);
            }

            const unionMap = new Map(((unionsError ? [] : unions) ?? []).map((union) => [union.id, union]));
            const clubFavMap = new Map<string, number>();
            for (const row of (clubFavsError ? [] : clubFavs) ?? []) {
                clubFavMap.set(row.entity_id, (clubFavMap.get(row.entity_id) ?? 0) + 1);
            }
            const data = (clubs ?? []).map((club) => ({
                ...club,
                sport: club.sport || club.sport_id || null,
                union: club.union_id ? unionMap.get(club.union_id) ?? null : null,
                followers_count: clubFavMap.get(club.id) ?? 0,
            }));

            return NextResponse.json({ data });
        }

        if (resource === 'tournaments') {
            const [
                tournamentsResult,
                { data: favoriteRows, error: favoritesError },
            ] = await Promise.all([
                selectWithFallback<TournamentAdminListRow>(
                    readClient.from('tournaments'),
                    [
                        'id, name, slug, sport_id, country_id, logo_url, is_popular, is_active, display_order, priority, created_at, updated_at, season_id, status, category, age_grade, format, is_visible, is_api_managed, data_source, display_name, original_name, union_id, external_id',
                        'id, name, slug, sport_id, country_id, logo_url, is_popular, display_order, priority, created_at, updated_at, season_id, status, category, age_grade, format, is_visible, is_api_managed, data_source, display_name, original_name, union_id, external_id',
                        'id, name, slug, sport_id, country_id, logo_url, display_order, priority, created_at, updated_at, season_id, status, category, age_grade, format, is_visible, is_api_managed, data_source, display_name, original_name, union_id, external_id',
                        'id, name, sport_id, country_id, logo_url, created_at, updated_at, season_id, status, is_visible, display_name, original_name, union_id, external_id',
                        'id, name, sport_id, country_id, logo_url, created_at, updated_at',
                        'id, name'
                    ],
                    { column: 'updated_at', ascending: false }
                ),
                withSoftTimeout(
                    readClient
                        .from('favorites')
                        .select('entity_id')
                        .in('entity_type', ['tournament', 'league']) as PromiseLike<{
                            data: { entity_id: string }[] | null;
                            error: QueryError;
                        }>,
                    AUXILIARY_QUERY_TIMEOUT_MS,
                    { data: [] as { entity_id: string }[], error: null },
                    'tournaments favorites lookup'
                ),
            ]);

            const { data: tournaments, error: tournamentsError } = tournamentsResult;
            if (tournamentsError) return jsonError('Failed to load tournaments', 500, tournamentsError.message);

            if (favoritesError) {
                console.warn('[ConsoleData] Failed to load tournament favorites, continuing with zero follower counts:', favoritesError.message);
            }

            const favoriteMap = new Map<string, number>();
            for (const row of (favoritesError ? [] : favoriteRows) ?? []) {
                favoriteMap.set(row.entity_id, (favoriteMap.get(row.entity_id) ?? 0) + 1);
            }

            const data = (tournaments ?? []).map((tournament) => ({
                id: tournament.id,
                name: tournament.name,
                slug: tournament.slug ?? null,
                sport_id: tournament.sport_id ?? null,
                sport_name: null,
                country_id: tournament.country_id ?? null,
                country_name: null,
                organization_id: tournament.union_id ?? null,
                organization_name: null,
                logo_url: tournament.logo_url ?? null,
                is_popular: Boolean(tournament.is_popular ?? false),
                is_active: Boolean(tournament.is_active ?? (tournament.status === 'active' || tournament.status === 'published')),
                display_order: typeof tournament.display_order === 'number' ? tournament.display_order : null,
                priority: typeof tournament.priority === 'number' ? tournament.priority : null,
                followers_count: favoriteMap.get(tournament.id) ?? 0,
                is_followed_by_user: false,
                created_at: tournament.created_at ?? '',
                updated_at: tournament.updated_at ?? '',
                season_id: tournament.season_id ?? null,
                status: tournament.status ?? null,
                category: tournament.category ?? null,
                age_grade: tournament.age_grade ?? null,
                format: tournament.format ?? null,
                is_visible: tournament.is_visible ?? null,
                is_api_managed: Boolean(tournament.is_api_managed ?? false),
                data_source: tournament.data_source ?? null,
                display_name: tournament.display_name ?? tournament.name ?? null,
                original_name: tournament.original_name ?? tournament.name ?? null,
                union_id: tournament.union_id ?? null,
                external_id: tournament.external_id ?? null,
                sport: tournament.sport_id ?? null,
                country: tournament.country_id ?? null,
            }));

            return NextResponse.json({ data });
        }

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

        const { data: matches, error: matchesError } = matchesResult;

        if (matchesError) return jsonError('Failed to load matches', 500, matchesError.message);

        const tournamentIds = Array.from(new Set((matches ?? []).map((match) => match.tournament_id).filter(Boolean))) as string[];
        const clubIds = Array.from(new Set(
            (matches ?? []).flatMap((match) => [match.home_club_id, match.away_club_id]).filter(Boolean),
        )) as string[];

        const [{ data: tournaments, error: tournamentsError }, { data: clubs, error: clubsError }] = await Promise.all([
            tournamentIds.length > 0
                ? selectManyWithFallback<TournamentConsoleRow>(
                    (columns) => readClient
                        .from('tournaments')
                        .select(columns)
                        .in('id', tournamentIds) as PromiseLike<{
                            data: TournamentConsoleRow[] | null;
                            error: QueryError;
                        }>,
                    [
                        'id, name, sport_id, sport, season_id',
                        'id, name, sport_id, sport',
                        'id, name, sport_id, season_id',
                        'id, name, sport',
                        'id, name'
                    ]
                )
                : Promise.resolve({ data: [] as TournamentConsoleRow[], error: null }),
            clubIds.length > 0
                ? selectManyWithFallback<ClubConsoleRow>(
                    (columns) => readClient
                        .from('clubs')
                        .select(columns)
                        .in('id', clubIds) as PromiseLike<{
                            data: ClubConsoleRow[] | null;
                            error: QueryError;
                        }>,
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
                )
                : Promise.resolve({ data: [] as ClubConsoleRow[], error: null }),
        ]);

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
