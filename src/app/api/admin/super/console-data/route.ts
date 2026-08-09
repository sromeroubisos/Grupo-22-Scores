import { NextRequest, NextResponse } from 'next/server';
import { getApiErrorStatus, requireGlobalAdminApiUser } from '@/lib/auth/apiAdmin';
import { getReadClient } from '@/lib/supabase/read';
import { buildTeamLogoProxyUrl } from '@/lib/utils/logoUrl';
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

type OrderSpec = { column: string; ascending?: boolean };

// El builder de PostgREST encadena: `.order()` devuelve algo que vuelve a tener
// `.order()` y `.range()`. Lo declaramos recursivo para poder ordenar por más de
// una columna sin perder el tipado.
type ConsoleQuery<T> = PromiseLike<{ data: T[] | null; error: QueryError }> & {
    order: (column: string, options?: { ascending?: boolean }) => ConsoleQuery<T>;
    range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: QueryError }>;
};

async function selectWithFallback<T>(
    baseQuery: {
        select: (columns: string) => ConsoleQuery<T>;
    },
    variants: string[],
    orderBy?: OrderSpec | OrderSpec[],
    range?: { from: number; to: number },
) {
    let lastError: QueryError = null;
    const orders = orderBy ? (Array.isArray(orderBy) ? orderBy : [orderBy]) : [];

    for (const columns of variants) {
        let query = baseQuery.select(columns);
        for (const order of orders) {
            query = query.order(order.column, { ascending: order.ascending });
        }
        const pending: PromiseLike<{ data: T[] | null; error: QueryError }> = range
            ? query.range(range.from, range.to)
            : query;
        const result = await pending;

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
    is_visible?: boolean | null;
    review_status?: string | null;
    created_by_user_id?: string | null;
    created_by_club_id?: string | null;
    reviewed_at?: string | null;
    review_notes?: string | null;
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
    updated_at?: string | null;
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
    review_status?: string | null;
    created_by_user_id?: string | null;
    created_by_club_id?: string | null;
    linked_official_tournament_id?: string | null;
    reviewed_at?: string | null;
    review_notes?: string | null;
};

function normalizeSportValue(value: string | null | undefined) {
    const normalized = value?.trim().toLowerCase();
    return normalized || null;
}

// Server-side caps to prevent dashboards from accidentally streaming the
// entire matches/clubs/tournaments tables on every load. Callers can request
// smaller pages via ?limit= and traverse with ?offset=.
const DEFAULT_PAGE_SIZE: Record<string, number> = {
    matches: 500,
    clubs: 2000,
    tournaments: 500,
};
const MAX_PAGE_SIZE = 2000;

function parsePagination(searchParams: URLSearchParams, resource: string) {
    const defaultLimit = DEFAULT_PAGE_SIZE[resource] ?? 500;
    const limitParam = parseInt(searchParams.get('limit') || '', 10);
    const offsetParam = parseInt(searchParams.get('offset') || '', 10);
    const limit = Number.isFinite(limitParam) && limitParam > 0
        ? Math.min(limitParam, MAX_PAGE_SIZE)
        : defaultLimit;
    const offset = Number.isFinite(offsetParam) && offsetParam >= 0 ? offsetParam : 0;
    return { limit, offset, range: { from: offset, to: offset + limit - 1 } };
}

export async function GET(request: NextRequest) {
    try {
        await requireGlobalAdminApiUser();
    } catch (error) {
        return jsonError('Unauthorized', getApiErrorStatus(error, 401));
    }

    const url = new URL(request.url);
    const resource = url.searchParams.get('resource');

    if (!resource || !['clubs', 'matches', 'tournaments'].includes(resource)) {
        return jsonError('Invalid resource', 400);
    }

    const pagination = parsePagination(url.searchParams, resource);

    try {
        const readClient = await getReadClient();

        if (resource === 'clubs') {
            const [
                { data: clubs, error: clubsError },
                { data: unions, error: unionsError },
            ] = await Promise.all([
                selectWithFallback<ClubConsoleRow>(
                    readClient.from('clubs'),
                    [
                        'id, name, short_name, city, region, country, primary_color, slug, is_visible, union_id, sport, sport_id, updated_at',
                        'id, name, short_name, city, region, country, primary_color, slug, is_visible, union_id, sport, sport_id',
                        'id, name, short_name, city, country, primary_color, slug, is_visible, union_id, sport',
                        'id, name, city, country, slug, is_visible, union_id',
                    ],
                    // `name` para que el catálogo llegue alfabético, `id` para
                    // desempatar: la consola pagina con ?offset= y hay clubes con
                    // el mismo nombre, así que sin la PK el orden no es total y
                    // entre páginas se repiten filas y se saltean otras.
                    [{ column: 'name', ascending: true }, { column: 'id', ascending: true }],
                    pagination.range,
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
            ]);

            if (clubsError) return jsonError('Failed to load clubs', 500, clubsError.message);

            if (unionsError) {
                console.warn('[ConsoleData] Failed to load unions for clubs, continuing without union labels:', unionsError.message);
            }

            const unionMap = new Map(((unionsError ? [] : unions) ?? []).map((union) => [union.id, union]));
            const data = (clubs ?? []).map((club) => ({
                ...club,
                // `updated_at` como token de cache-busting: sin él, cambiar el escudo
                // de un club se ve en su panel pero la lista sigue mostrando el viejo
                // (el proxy sin versión se cachea en el CDN por una semana).
                logo_url: buildTeamLogoProxyUrl({ key: club.id, name: club.name, version: club.updated_at }),
                sport: club.sport || club.sport_id || null,
                union: club.union_id ? unionMap.get(club.union_id) ?? null : null,
                followers_count: 0,
            }));

            return NextResponse.json({ data });
        }

        if (resource === 'tournaments') {
            const [
                tournamentsResult,
            ] = await Promise.all([
                selectWithFallback<TournamentAdminListRow>(
                    readClient.from('tournaments'),
                    [
                        'id, name, slug, sport_id, country_id, logo_url, is_popular, is_active, display_order, priority, created_at, updated_at, season_id, status, category, age_grade, format, is_visible, is_api_managed, data_source, display_name, original_name, union_id, external_id, review_status, created_by_user_id, created_by_club_id, linked_official_tournament_id, reviewed_at, review_notes',
                        'id, name, slug, sport_id, country_id, logo_url, is_popular, is_active, display_order, priority, created_at, updated_at, season_id, status, category, age_grade, format, is_visible, is_api_managed, data_source, display_name, original_name, union_id, external_id',
                        'id, name, slug, sport_id, country_id, logo_url, is_popular, display_order, priority, created_at, updated_at, season_id, status, category, age_grade, format, is_visible, is_api_managed, data_source, display_name, original_name, union_id, external_id',
                        'id, name, slug, sport_id, country_id, logo_url, display_order, priority, created_at, updated_at, season_id, status, category, age_grade, format, is_visible, is_api_managed, data_source, display_name, original_name, union_id, external_id',
                        'id, name, sport_id, country_id, logo_url, created_at, updated_at, season_id, status, is_visible, display_name, original_name, union_id, external_id',
                        'id, name, sport_id, country_id, logo_url, created_at, updated_at',
                        'id, name'
                    ],
                    // Ordenamos por `id` y no por `updated_at`: la consola se trae el
                    // catálogo entero paginando con ?offset=, y `updated_at` empata en
                    // masa (una ingesta toca cientos de filas en el mismo instante), con
                    // lo que el offset repetiría filas y saltearía otras entre páginas.
                    // `id` es la PK, así que el orden es total y estable. La pantalla
                    // reagrupa por país y reordena por prioridad igual, así que el orden
                    // que salga de acá no se ve.
                    { column: 'id', ascending: true },
                    pagination.range,
                ),
            ]);

            const { data: tournaments, error: tournamentsError } = tournamentsResult;
            if (tournamentsError) return jsonError('Failed to load tournaments', 500, tournamentsError.message);

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
                followers_count: 0,
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
                review_status: tournament.review_status ?? null,
                created_by_user_id: tournament.created_by_user_id ?? null,
                created_by_club_id: tournament.created_by_club_id ?? null,
                linked_official_tournament_id: tournament.linked_official_tournament_id ?? null,
                reviewed_at: tournament.reviewed_at ?? null,
                review_notes: tournament.review_notes ?? null,
                sport: tournament.sport_id ?? null,
                country: tournament.country_id ?? null,
            }));

            return NextResponse.json({ data });
        }

        const matchesResult = await selectWithFallback<MatchConsoleRow>(
            readClient.from('matches'),
            [
                'id, round_id, round_label, date_time, venue, status, score, tournament_id, home_club_id, away_club_id, sport_id, sport, is_visible, review_status, created_by_user_id, created_by_club_id, reviewed_at, review_notes',
                'id, round_id, round_label, date_time, venue, status, score, tournament_id, home_club_id, away_club_id, sport_id, sport, is_visible, review_status',
                'id, round_id, round_label, date_time, venue, status, score, tournament_id, home_club_id, away_club_id, sport_id, sport, review_status',
                'id, round_id, round_label, date_time, venue, status, score, tournament_id, home_club_id, away_club_id, sport_id, sport',
                'id, round_id, round_label, date_time, venue, status, score, tournament_id, home_club_id, away_club_id, sport_id',
                'id, round_id, round_label, date_time, venue, status, score, tournament_id, home_club_id, away_club_id, sport',
                'id, round_id, round_label, date_time, venue, status, score, tournament_id, home_club_id, away_club_id',
                'id, round_id, date_time, venue, status, score, tournament_id, home_club_id, away_club_id, sport_id, sport',
                'id, round_id, date_time, venue, status, score, tournament_id, home_club_id, away_club_id, sport_id',
                'id, round_id, date_time, venue, status, score, tournament_id, home_club_id, away_club_id, sport',
                'id, round_id, date_time, venue, status, score, tournament_id, home_club_id, away_club_id'
            ],
            { column: 'date_time', ascending: false },
            pagination.range,
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
                        'id, name, primary_color, sport, sport_id',
                        'id, name, primary_color, sport_id',
                        'id, name, primary_color, sport',
                        'id, name, sport, sport_id',
                        'id, name, sport_id',
                        'id, name, sport',
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
        const clubMap = new Map((clubs ?? []).map((club) => [
            club.id,
            {
                ...club,
                logo_url: buildTeamLogoProxyUrl({ key: club.id, name: club.name }),
            },
        ]));

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
