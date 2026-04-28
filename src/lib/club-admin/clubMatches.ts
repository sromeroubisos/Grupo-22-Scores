import { createClient } from '@/lib/supabase/server';
import type { ClubDashboardMatch } from '@/lib/club-admin/dashboard-types';

export type MatchStatusFilter = 'all' | 'upcoming' | 'played';

export interface ClubMatchesPage {
    matches: ClubDashboardMatch[];
    nextCursor: string | null;
    hasMore: boolean;
}

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type ClubRelationRow = {
    id: string | null;
    name: string | null;
    short_name: string | null;
    logo_url: string | null;
    slug: string | null;
};

type TournamentRelationRow = {
    id: string;
    name: string | null;
    slug: string | null;
};

type ClubMatchRow = {
    id: string;
    date_time: string | null;
    status: string | null;
    venue: string | null;
    score: unknown;
    notes: string | null;
    tournament_id: string | null;
    home_club_id: string | null;
    away_club_id: string | null;
    home_division_id: string | null;
    away_division_id: string | null;
    lineup_home_count?: number | null;
    lineup_away_count?: number | null;
    events_count?: number | null;
    lineups?: unknown;
    events?: unknown;
    home_name?: string | null;
    home_short_name?: string | null;
    home_logo_url?: string | null;
    home_slug?: string | null;
    away_name?: string | null;
    away_short_name?: string | null;
    away_logo_url?: string | null;
    away_slug?: string | null;
    tournament_name?: string | null;
    tournament_slug?: string | null;
    home?: ClubRelationRow | ClubRelationRow[] | null;
    away?: ClubRelationRow | ClubRelationRow[] | null;
    tournament?: TournamentRelationRow | TournamentRelationRow[] | null;
};

const FINAL_MATCH_STATUSES = ['final', 'finished', 'ft'] as const;
const OPTIMIZED_MATCH_SELECT = `
    id, date_time, status, venue, score, notes, tournament_id, home_club_id, away_club_id, home_division_id, away_division_id,
    lineup_home_count, lineup_away_count, events_count,
    home:clubs!matches_home_club_id_fkey(id, name, short_name, logo_url, slug),
    away:clubs!matches_away_club_id_fkey(id, name, short_name, logo_url, slug),
    tournament:tournaments(id, name, slug)
`;
const LEGACY_MATCH_SELECT = `
    id, date_time, status, venue, score, notes, lineups, events, tournament_id, home_club_id, away_club_id, home_division_id, away_division_id,
    home:clubs!matches_home_club_id_fkey(id, name, short_name, logo_url, slug),
    away:clubs!matches_away_club_id_fkey(id, name, short_name, logo_url, slug),
    tournament:tournaments(id, name, slug)
`;

function getErrorCode(error: unknown) {
    if (!error || typeof error !== 'object' || !('code' in error)) {
        return null;
    }

    const code = (error as { code?: unknown }).code;
    return typeof code === 'string' ? code : null;
}

function isMissingRpcError(error: unknown) {
    const code = getErrorCode(error);
    const message = error && typeof error === 'object' && 'message' in error
        ? String((error as { message?: unknown }).message ?? '')
        : '';

    return code === 'PGRST202' || message.includes('Could not find the function public.get_club_matches_paginated');
}

function isMissingColumnError(error: unknown) {
    return getErrorCode(error) === '42703';
}

function normalizeNullableText(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function parseScore(score: unknown): { home: number | null; away: number | null } | null {
    if (!score || typeof score !== 'object') return null;
    const s = score as Record<string, unknown>;
    const home = typeof s.home === 'number' ? s.home : typeof s.home_score === 'number' ? s.home_score : null;
    const away = typeof s.away === 'number' ? s.away : typeof s.away_score === 'number' ? s.away_score : null;
    if (home === null && away === null) return null;
    return { home, away };
}

function unwrapRelationRow<T>(value: T | T[] | null | undefined): T | null {
    if (Array.isArray(value)) {
        return value[0] ?? null;
    }

    return value ?? null;
}

function countArrayValue(value: unknown) {
    return Array.isArray(value) ? value.length : 0;
}

function countLineupEntries(lineups: unknown) {
    if (!lineups || typeof lineups !== 'object') return 0;

    const source = lineups as { home?: unknown; away?: unknown };
    return countArrayValue(source.home) + countArrayValue(source.away);
}

function countEventEntries(events: unknown): number {
    if (Array.isArray(events)) return events.length;
    if (!events || typeof events !== 'object') return 0;

    return Object.values(events as Record<string, unknown>).reduce<number>(
        (total, value) => total + countArrayValue(value),
        0
    );
}

function getRelationClub(row: ClubMatchRow, side: 'home' | 'away'): ClubRelationRow {
    const relation = unwrapRelationRow(side === 'home' ? row.home : row.away);

    return {
        id: relation?.id ?? (side === 'home' ? row.home_club_id : row.away_club_id),
        name: relation?.name ?? (side === 'home' ? row.home_name ?? null : row.away_name ?? null),
        short_name: relation?.short_name ?? (side === 'home' ? row.home_short_name ?? null : row.away_short_name ?? null),
        logo_url: relation?.logo_url ?? (side === 'home' ? row.home_logo_url ?? null : row.away_logo_url ?? null),
        slug: relation?.slug ?? (side === 'home' ? row.home_slug ?? null : row.away_slug ?? null),
    };
}

function getRelationTournament(row: ClubMatchRow): TournamentRelationRow | null {
    const relation = unwrapRelationRow(row.tournament);

    if (relation) {
        return relation;
    }

    return row.tournament_id
        ? {
            id: row.tournament_id,
            name: row.tournament_name ?? null,
            slug: row.tournament_slug ?? null,
        }
        : null;
}

function getRowTime(row: ClubMatchRow, direction: 'asc' | 'desc') {
    if (!row.date_time) {
        return direction === 'asc' ? Number.MAX_SAFE_INTEGER : 0;
    }

    const time = new Date(row.date_time).getTime();
    return Number.isFinite(time) ? time : direction === 'asc' ? Number.MAX_SAFE_INTEGER : 0;
}

function sortRows(rows: ClubMatchRow[], direction: 'asc' | 'desc') {
    return [...rows].sort((left, right) => {
        const leftTime = getRowTime(left, direction);
        const rightTime = getRowTime(right, direction);
        return direction === 'asc' ? leftTime - rightTime : rightTime - leftTime;
    });
}

function toDashboardMatch(row: ClubMatchRow, clubId: string): ClubDashboardMatch {
    const isHome = row.home_club_id === clubId;
    const home = getRelationClub(row, 'home');
    const away = getRelationClub(row, 'away');
    const opponent = isHome ? away : home;
    const hasPrecomputedLineupCount =
        typeof row.lineup_home_count === 'number' || typeof row.lineup_away_count === 'number';
    const lineupCount = hasPrecomputedLineupCount
        ? (row.lineup_home_count ?? 0) + (row.lineup_away_count ?? 0)
        : countLineupEntries(row.lineups);
    const statsCount = typeof row.events_count === 'number'
        ? row.events_count
        : countEventEntries(row.events);
    const tournament = getRelationTournament(row);

    return {
        id: row.id,
        dateTime: row.date_time,
        status: row.status ?? 'scheduled',
        venue: row.venue,
        score: parseScore(row.score),
        notes: row.notes,
        lineups: null,
        events: null,
        lineupCount,
        statsCount,
        isHome,
        homeDivisionId: row.home_division_id ?? null,
        awayDivisionId: row.away_division_id ?? null,
        homeDivisionName: null,
        awayDivisionName: null,
        opponentName: normalizeNullableText(opponent.name) ?? (isHome ? 'Visitante' : 'Local'),
        opponentShortName: normalizeNullableText(opponent.short_name),
        opponentLogoUrl: normalizeNullableText(opponent.logo_url),
        home: {
            id: row.home_club_id,
            name: normalizeNullableText(home.name) ?? 'Local',
            shortName: normalizeNullableText(home.short_name),
            logoUrl: normalizeNullableText(home.logo_url),
            slug: normalizeNullableText(home.slug),
        },
        away: {
            id: row.away_club_id,
            name: normalizeNullableText(away.name) ?? 'Visitante',
            shortName: normalizeNullableText(away.short_name),
            logoUrl: normalizeNullableText(away.logo_url),
            slug: normalizeNullableText(away.slug),
        },
        tournament: tournament
            ? {
                id: tournament.id,
                name: normalizeNullableText(tournament.name) ?? 'Torneo',
                slug: normalizeNullableText(tournament.slug),
            }
            : null,
    };
}

function applyMatchFilters(
    query: any,
    options: {
        clubId: string;
        side: 'home_club_id' | 'away_club_id';
        statusFilter: MatchStatusFilter;
        cursor: string | null;
        limit: number;
        direction: 'asc' | 'desc';
    }
) {
    const { clubId, side, statusFilter, cursor, limit, direction } = options;
    let nextQuery = query.eq(side, clubId);

    if (statusFilter === 'upcoming') {
        nextQuery = nextQuery
            .gte('date_time', new Date().toISOString())
            .not('status', 'in', `(${FINAL_MATCH_STATUSES.join(',')})`);
    } else if (statusFilter === 'played') {
        nextQuery = nextQuery.in('status', [...FINAL_MATCH_STATUSES]);
    }

    if (cursor) {
        nextQuery = direction === 'asc'
            ? nextQuery.gt('date_time', cursor)
            : nextQuery.lt('date_time', cursor);
    }

    return nextQuery
        .order('date_time', { ascending: direction === 'asc', nullsFirst: false })
        .limit(limit);
}

async function fetchDirectClubMatchRows(
    supabase: SupabaseServerClient,
    clubId: string,
    options: {
        statusFilter: MatchStatusFilter;
        cursor: string | null;
        limit: number;
        direction: 'asc' | 'desc';
    },
    selectColumns = OPTIMIZED_MATCH_SELECT
) {
    const queryOptions = { clubId, ...options };

    const [homeResult, awayResult] = await Promise.all([
        applyMatchFilters(
            supabase.from('matches').select(selectColumns),
            { ...queryOptions, side: 'home_club_id' }
        ),
        applyMatchFilters(
            supabase.from('matches').select(selectColumns),
            { ...queryOptions, side: 'away_club_id' }
        ),
    ]);

    if (homeResult.error) throw homeResult.error;
    if (awayResult.error) throw awayResult.error;

    const rowsById = new Map<string, ClubMatchRow>();
    for (const row of [...(homeResult.data ?? []), ...(awayResult.data ?? [])] as ClubMatchRow[]) {
        if (row?.id && !rowsById.has(row.id)) {
            rowsById.set(row.id, row);
        }
    }

    return sortRows(Array.from(rowsById.values()), options.direction);
}

async function fetchDirectClubMatchesPage(
    supabase: SupabaseServerClient,
    clubId: string,
    options: {
        statusFilter: MatchStatusFilter;
        cursor: string | null;
        limit: number;
        direction: 'asc' | 'desc';
    }
): Promise<ClubMatchesPage> {
    const fetchLimit = options.limit + 1;
    let rows: ClubMatchRow[];

    try {
        rows = await fetchDirectClubMatchRows(supabase, clubId, { ...options, limit: fetchLimit });
    } catch (error) {
        if (!isMissingColumnError(error)) {
            throw error;
        }

        rows = await fetchDirectClubMatchRows(
            supabase,
            clubId,
            { ...options, limit: fetchLimit },
            LEGACY_MATCH_SELECT
        );
    }

    const hasMore = rows.length > options.limit;
    const visibleRows = hasMore ? rows.slice(0, options.limit) : rows;
    const nextCursor = hasMore && visibleRows.length > 0
        ? visibleRows[visibleRows.length - 1].date_time
        : null;

    return {
        matches: visibleRows.map((row) => toDashboardMatch(row, clubId)),
        nextCursor,
        hasMore,
    };
}

function normalizeStatusFilter(value: MatchStatusFilter) {
    return value === 'upcoming' || value === 'played' ? value : 'all';
}

function normalizeDirection(value: 'asc' | 'desc') {
    return value === 'asc' ? 'asc' : 'desc';
}

export async function fetchClubMatchesPaginated(
    supabase: SupabaseServerClient,
    clubId: string,
    options: {
        statusFilter?: MatchStatusFilter;
        cursor?: string | null;
        limit?: number;
        direction?: 'asc' | 'desc';
    } = {}
): Promise<ClubMatchesPage> {
    if (!clubId) {
        return { matches: [], nextCursor: null, hasMore: false };
    }

    const limit = Math.min(Math.max(options.limit ?? 25, 1), 100);
    const cursor = options.cursor ?? null;
    const statusFilter = normalizeStatusFilter(options.statusFilter ?? 'all');
    const direction = normalizeDirection(options.direction ?? 'desc');

    const { data, error } = await supabase.rpc('get_club_matches_paginated', {
        p_club_id: clubId,
        p_status_filter: statusFilter,
        p_cursor: cursor,
        p_limit: limit + 1, // fetch one extra to determine hasMore
        p_direction: direction,
    });

    if (error) {
        if (isMissingRpcError(error)) {
            return fetchDirectClubMatchesPage(supabase, clubId, {
                statusFilter,
                cursor,
                limit,
                direction,
            });
        }

        console.error('[fetchClubMatchesPaginated] RPC error:', error);
        throw error;
    }

    const rows = (data ?? []) as ClubMatchRow[];
    const hasMore = rows.length > limit;
    const visibleRows = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore && visibleRows.length > 0
        ? visibleRows[visibleRows.length - 1].date_time
        : null;

    return {
        matches: visibleRows.map((row) => toDashboardMatch(row, clubId)),
        nextCursor,
        hasMore,
    };
}
