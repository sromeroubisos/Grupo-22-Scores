import { NextResponse } from 'next/server';
import { requireGlobalAdminContext } from '@/lib/auth/permissions';
import { createClient } from '@/lib/supabase/server';
import { getReadClient } from '@/lib/supabase/read';
import { APP_TIMEZONE, formatDateInTimeZone } from '@/lib/timezone';
import { isMissingColumnError } from '@/lib/utils/supabaseSchema';

type AppUserRow = {
    id: string;
    name: string | null;
    email: string;
    role: string;
    created_at: string | null;
    last_login_at: string | null;
    avatar_url: string | null;
};

type MembershipRow = {
    id: string;
    user_id: string;
    scope_type: 'union' | 'sport' | 'tournament' | 'match' | 'club';
    scope_id: string;
    role: 'admin' | 'editor' | 'operator' | 'viewer';
    created_at: string | null;
};

type NamedEntityRow = {
    id: string;
    name: string | null;
};

type MatchRow = {
    id: string;
    date_time: string | null;
    tournament_id: string | null;
};

type QueryError = {
    code?: string | null;
    message?: string | null;
    details?: string | null;
} | null;

function jsonError(message: string, status = 500, details?: unknown) {
    return NextResponse.json({ error: message, details: details ?? null }, { status });
}

async function ensureGlobalAdmin() {
    const supabase = await createClient();
    return requireGlobalAdminContext(supabase);
}

function uniqueIds(values: Array<string | null | undefined>) {
    return Array.from(new Set(values.filter(Boolean))) as string[];
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

async function selectWithFallback<T>(
    execute: (columns: string) => Promise<{
        data: T[] | null;
        error: QueryError;
    }>,
    variants: string[],
) {
    let lastError: QueryError = null;

    for (const columns of variants) {
        const result = await execute(columns);

        if (!result.error) {
            return {
                data: (result.data ?? []) as T[],
                error: null as QueryError,
            };
        }

        lastError = result.error;

        if (!isRetryableMissingColumnError(result.error, columns)) {
            return {
                data: [] as T[],
                error: result.error,
            };
        }
    }

    return {
        data: [] as T[],
        error: lastError,
    };
}

function extractScopeIds(
    memberships: MembershipRow[],
    scopeType: MembershipRow['scope_type'],
) {
    return uniqueIds(
        memberships
            .filter((membership) => membership.scope_type === scopeType)
            .map((membership) => membership.scope_id),
    );
}

async function selectNamedEntities(
    admin: Awaited<ReturnType<typeof getReadClient>>,
    table: 'sports' | 'unions' | 'tournaments' | 'clubs',
    ids: string[],
) {
    if (ids.length === 0) {
        return { data: [] as NamedEntityRow[], error: null as QueryError };
    }

    const result = await admin
        .from(table)
        .select('id, name')
        .in('id', ids);

    return {
        data: (result.data ?? []) as NamedEntityRow[],
        error: result.error as QueryError,
    };
}

function buildMatchLabel(match: MatchRow, tournamentsById: Map<string, string>) {
    const tournamentName = match.tournament_id ? tournamentsById.get(match.tournament_id) : null;
    const dateLabel = match.date_time
        ? formatDateInTimeZone(
            match.date_time,
            'es-AR',
            {
                day: '2-digit',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
            },
            APP_TIMEZONE,
        ) || match.id
        : match.id;

    return tournamentName
        ? `${tournamentName} - ${dateLabel}`
        : `Partido ${dateLabel}`;
}

export async function GET() {
    try {
        await ensureGlobalAdmin();
    } catch (error) {
        return jsonError('Unauthorized', 401, error instanceof Error ? error.message : String(error));
    }

    try {
        const admin = await getReadClient();

        const [usersResult, membershipsResult] = await Promise.all([
            selectWithFallback<AppUserRow>(
                async (columns) => {
                    const result = await admin
                        .from('users')
                        .select(columns)
                        .order('created_at', { ascending: false });

                    return {
                        data: (result.data ?? []) as unknown as AppUserRow[],
                        error: result.error as QueryError,
                    };
                },
                [
                    'id, name, email, role, created_at, last_login_at, avatar_url',
                    'id, name, email, role, created_at, last_login_at',
                    'id, name, email, role, created_at, avatar_url',
                    'id, name, email, role, created_at',
                ],
            ),
            selectWithFallback<MembershipRow>(
                async (columns) => {
                    const result = await admin
                        .from('memberships')
                        .select(columns)
                        .order('created_at', { ascending: false });

                    return {
                        data: (result.data ?? []) as unknown as MembershipRow[],
                        error: result.error as QueryError,
                    };
                },
                [
                    'id, user_id, scope_type, scope_id, role, created_at',
                    'id, user_id, scope_type, scope_id, role',
                ],
            ),
        ]);

        if (usersResult.error) {
            return jsonError('No se pudieron cargar los usuarios', 500, usersResult.error.details || usersResult.error.message);
        }

        if (membershipsResult.error) {
            return jsonError('No se pudieron cargar las membresias', 500, membershipsResult.error.details || membershipsResult.error.message);
        }

        const users = (usersResult.data ?? []) as AppUserRow[];
        const memberships = (membershipsResult.data ?? []) as MembershipRow[];

        const sportIds = extractScopeIds(memberships, 'sport');
        const unionIds = extractScopeIds(memberships, 'union');
        const clubIds = extractScopeIds(memberships, 'club');
        const directTournamentIds = extractScopeIds(memberships, 'tournament');
        const matchIds = extractScopeIds(memberships, 'match');

        const [
            sportsResult,
            unionsResult,
            clubsResult,
            directTournamentsResult,
            matchesResult,
        ] = await Promise.all([
            selectNamedEntities(admin, 'sports', sportIds),
            selectNamedEntities(admin, 'unions', unionIds),
            selectNamedEntities(admin, 'clubs', clubIds),
            selectNamedEntities(admin, 'tournaments', directTournamentIds),
            matchIds.length > 0
                ? admin
                    .from('matches')
                    .select('id, date_time, tournament_id')
                    .in('id', matchIds)
                : Promise.resolve({ data: [] as MatchRow[], error: null }),
        ]);

        if (sportsResult.error) {
            return jsonError('No se pudieron cargar los deportes', 500, sportsResult.error.message);
        }

        if (unionsResult.error) {
            return jsonError('No se pudieron cargar las uniones', 500, unionsResult.error.message);
        }

        if (clubsResult.error) {
            return jsonError('No se pudieron cargar los clubes', 500, clubsResult.error.message);
        }

        if (directTournamentsResult.error) {
            return jsonError('No se pudieron cargar los torneos', 500, directTournamentsResult.error.message);
        }

        if (matchesResult.error) {
            return jsonError('No se pudieron cargar los partidos', 500, matchesResult.error.message);
        }

        const matches = (matchesResult.data ?? []) as MatchRow[];
        const tournamentIds = uniqueIds([
            ...directTournamentIds,
            ...matches.map((match) => match.tournament_id),
        ]);

        const tournamentsResult = await selectNamedEntities(admin, 'tournaments', tournamentIds);

        if (tournamentsResult.error) {
            return jsonError('No se pudieron resolver los nombres de torneos', 500, tournamentsResult.error.message);
        }

        const entityNames: Record<string, string> = {};

        sportsResult.data.forEach((sport) => {
            if (sport.name) {
                entityNames[`sport:${sport.id}`] = sport.name;
            }
        });

        unionsResult.data.forEach((union) => {
            if (union.name) {
                entityNames[`union:${union.id}`] = union.name;
            }
        });

        tournamentsResult.data.forEach((tournament) => {
            if (tournament.name) {
                entityNames[`tournament:${tournament.id}`] = tournament.name;
            }
        });

        clubsResult.data.forEach((club) => {
            if (club.name) {
                entityNames[`club:${club.id}`] = club.name;
            }
        });

        const tournamentsById = new Map(
            tournamentsResult.data
                .filter((tournament) => Boolean(tournament.name))
                .map((tournament) => [tournament.id, tournament.name as string]),
        );

        matches.forEach((match) => {
            entityNames[`match:${match.id}`] = buildMatchLabel(match, tournamentsById);
        });

        return NextResponse.json({
            data: {
                users,
                memberships,
                entityNames,
            },
        });
    } catch (error) {
        return jsonError(
            'Personas/Roles error',
            500,
            error instanceof Error ? error.message : String(error),
        );
    }
}
