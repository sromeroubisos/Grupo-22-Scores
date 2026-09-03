import { NextResponse } from 'next/server';
import { db } from '@/lib/mock-db';
import {
    getFlashScoreMatches,
    getFlashScoreLiveMatches,
    isExternalMatchesListDateSupported,
    isFlashScoreMatchesListDateSupported,
} from '@/lib/services/flashscore';
import { persistFromExternalMatches } from '@/lib/sync/catalog';
import { recordExternalTournamentsFromMatches } from '@/lib/server/externalTournamentCatalog';
import {
    addDaysToIsoDate,
    combineLocalDateTimeToUtcIso,
    formatDateKey,
    canonicalizeTimezone,
    toLocalMatch,
} from '@/lib/timezone';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminApiUser } from '@/lib/auth/apiAdmin';
import { getCountryById } from '@/lib/data/countries';
import { memoryCache } from '@/lib/cache';
import { dedupeCrossSourceMatches } from '@/lib/matchFeedDedupe';
import { isFlashScoreEnabledForSport } from '@/lib/externalProviderPolicy';
import { isMatchVisibleToPublic } from '@/lib/matchReview';
import {
    readMatchesFeedSnapshotMetadata,
    readMatchesFeedSnapshotPayload,
    readUsableMatchesFeedSnapshot,
    upsertMatchesFeedSnapshot,
} from '@/lib/server/matchesFeedCache';
import { MATCHES_RESPONSE_CACHE_PREFIX } from '@/lib/server/cacheKeys';
import {
    applyExternalTournamentOverride,
    getStoredExternalTournamentOverrides,
} from '@/lib/server/externalTournamentOverrides';
import { isMissingColumnError, isMissingTableError } from '@/lib/utils/supabaseSchema';
import { isBlockedTournamentId } from '@/lib/utils/blockedTournaments';
import { buildClubLogoProxyUrl, resolveTeamLogo } from '@/lib/utils/teamLogoOverrides';
import { isTournamentVisibleToPublic } from '@/lib/tournamentReview';
import {
    getMatchesForDate,
    getLiveMatches,
    hasRecentFixtureSyncEvidence,
    mapCachedToEnrichedMatch,
    mapFlashScoreMatchToCached,
    shouldPollLiveMatches,
    upsertMatches,
} from '@/lib/services/externalMatchCache';

function isUuidLike(value: unknown): value is string {
    return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function supportsMatchesColumn(
    supabase: Awaited<ReturnType<typeof createClient>>,
    column: string
) {
    const { error } = await supabase
        .from('matches')
        .select(column)
        .limit(0);

    if (!error) return true;
    if (isMissingColumnError(error, column)) return false;
    return false;
}

// Maps internal sport IDs to all DB variants that should match
function getSportVariants(sport: string): string[] {
    const lower = sport.toLowerCase();
    switch (lower) {
        case 'rugby': return ['rugby', 'rugby-union', 'rugby-league'];
        case 'rugby-union': return ['rugby', 'rugby-union'];
        case 'rugby-league': return ['rugby-league'];
        case 'football': return ['football', 'soccer'];
        case 'hockey': return ['hockey', 'field-hockey'];
        default: return [lower];
    }
}

function normalizeSportValue(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const normalized = value.trim().toLowerCase();
    return normalized || null;
}

function sanitizeInlineAssetUrl(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const normalized = value.trim();
    if (!normalized) return null;
    if (normalized.startsWith('data:')) return null;
    return normalized;
}

function resolveTournamentCountry(tournament: any): string {
    const relationCountry = tournament?.country?.nameEs || tournament?.country?.name || null;
    if (relationCountry) return relationCountry;

    const countryId = tournament?.country_id;
    if (typeof countryId === 'string' && countryId.trim()) {
        const mapped = getCountryById(countryId.trim().toLowerCase());
        if (mapped?.nameEs) return mapped.nameEs;
        if (mapped?.name) return mapped.name;
        return countryId;
    }

    if (typeof tournament?.union?.country === 'string' && tournament.union.country.trim()) {
        return tournament.union.country;
    }

    return 'Internacional';
}

function buildResolvedMatchTeam(
    team: {
        id?: string | null;
        name?: string | null;
        shortName?: string | null;
        logo?: string | null;
        logo_url?: string | null;
        image_path?: string | null;
        small_image_path?: string | null;
        source?: string | null;
        team_url?: string | null;
        teamUrl?: string | null;
        updated_at?: string | null;
    } | null | undefined,
    fallbackName: string,
    fallbackShortName: string
) {
    const id = team?.id ? String(team.id) : null;
    const name = typeof team?.name === 'string' && team.name.trim() ? team.name : fallbackName;
    const shortName = typeof team?.shortName === 'string' && team.shortName.trim()
        ? team.shortName
        : (name.substring(0, 3).toUpperCase() || fallbackShortName);
    const resolvedLogo = sanitizeInlineAssetUrl(resolveTeamLogo({
        id,
        team_id: id,
        name,
        short_name: shortName,
        logo: team?.logo || '',
        logo_url: team?.logo_url || '',
        image_path: team?.image_path || '',
        small_image_path: team?.small_image_path || '',
        source: team?.source || '',
        team_url: team?.team_url || team?.teamUrl || '',
        logo_updated_at: team?.updated_at || '',
    }));
    const imagePath = resolvedLogo || sanitizeInlineAssetUrl(team?.image_path || team?.small_image_path || team?.logo || team?.logo_url || null);
    const smallImagePath = resolvedLogo || sanitizeInlineAssetUrl(team?.small_image_path || team?.image_path || team?.logo || team?.logo_url || null);

    return {
        id,
        name,
        logo: resolvedLogo,
        image_path: imagePath,
        small_image_path: smallImagePath,
        team_url: team?.team_url || team?.teamUrl || null,
        teamUrl: team?.team_url || team?.teamUrl || null,
        shortName,
    };
}

async function applyStoredTournamentOverridesToMatches<T extends {
    tournament?: Record<string, unknown> & { id?: string | null } | null;
}>(matches: T[]): Promise<T[]> {
    const tournamentIds = [...new Set(
        matches
            .map((match) => (typeof match.tournament?.id === 'string' ? match.tournament.id : null))
            .filter((id): id is string => typeof id === 'string' && /^fs-/i.test(id)),
    )];

    if (tournamentIds.length === 0) {
        return matches;
    }

    const overrides = await getStoredExternalTournamentOverrides(tournamentIds);

    return matches.map((match) => {
        const tournamentId = typeof match.tournament?.id === 'string' ? match.tournament.id : null;
        if (!tournamentId || !match.tournament) {
            return match;
        }

        const override = overrides.get(tournamentId) || overrides.get(tournamentId.toLowerCase());
        if (!override) {
            return match;
        }

        return {
            ...match,
            tournament: applyExternalTournamentOverride(match.tournament, override),
        };
    });
}

async function selectManyWithFallback<T>(
    client: LookupMapsClient,
    table: string,
    idColumn: string,
    ids: string[],
    variants: string[]
) {
    if (ids.length === 0) {
        return { data: [] as T[], error: null };
    }

    const variantCacheKey = `${table}:${idColumn}`;
    const preferredVariant = lookupSelectVariantCache.get(variantCacheKey);
    const orderedVariants = preferredVariant
        ? [preferredVariant, ...variants.filter((columns) => columns !== preferredVariant)]
        : variants;
    let lastError: { code?: string | null; message?: string | null; details?: string | null } | null = null;

    // Un domingo de rugby junta 630 clubes: en un solo `in (...)` la URL pasa
    // los 12 KB y PostgREST la rechaza. Se pide por lotes, en paralelo.
    const chunks: string[][] = [];
    for (let index = 0; index < ids.length; index += LOOKUP_IN_CHUNK_SIZE) {
        chunks.push(ids.slice(index, index + LOOKUP_IN_CHUNK_SIZE));
    }

    for (const columns of orderedVariants) {
        const results = await Promise.all(
            chunks.map((chunk) => client.from(table).select(columns).in(idColumn, chunk)),
        );
        const failed = results.find((result) => result.error);

        if (!failed) {
            lookupSelectVariantCache.set(variantCacheKey, columns);
            return {
                data: results.flatMap((result) => (result.data as T[] | null) || []),
                error: null,
            };
        }

        lastError = failed.error;

        if (failed.error?.code !== 'PGRST204') {
            return { data: [] as T[], error: failed.error };
        }
    }

    return { data: [] as T[], error: lastError };
}

const LOOKUP_IN_CHUNK_SIZE = 150;

async function getReadClient() {
    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
        return createAdminClient();
    }

    return createClient();
}

async function selectMatchesRowsWithFallback(
    supabase: Awaited<ReturnType<typeof getReadClient>>,
    buildQuery: (columns: string) => Promise<{ data: any[] | null; error: any }>,
) {
    const orderedVariants = preferredMatchesSelectVariant
        ? [preferredMatchesSelectVariant, ...MATCHES_DB_SELECT_VARIANTS.filter((columns) => columns !== preferredMatchesSelectVariant)]
        : MATCHES_DB_SELECT_VARIANTS;
    let lastError: any = null;

    for (const columns of orderedVariants) {
        const result = await buildQuery(columns);
        if (!result.error) {
            preferredMatchesSelectVariant = columns;
            return result;
        }

        lastError = result.error;
        const isSchemaFallbackCandidate = MATCHES_DB_SCHEMA_FALLBACK_COLUMNS.some((column) =>
            isMissingColumnError(result.error, column),
        );

        if (!isSchemaFallbackCandidate) {
            return result;
        }
    }

    return { data: null, error: lastError };
}

type LookupMapsClient = {
    from: (table: string) => {
        select: (columns: string) => {
            in: (column: string, values: string[]) => PromiseLike<{
                data: unknown[] | null;
                error: { code?: string | null; message?: string | null; details?: string | null } | null;
            }>;
        };
    };
};

type DbTournamentLite = {
    id: string;
    name: string;
    sport_id?: string | null;
    sport?: string | null;
    priority?: number | null;
    season_id?: string | null;
    status?: string | null;
    is_visible?: boolean | null;
    review_status?: string | null;
    country_id?: string | null;
    union_id?: string | null;
};

type DbClubLite = {
    id: string;
    name: string;
    short_name?: string | null;
    logo_url?: string | null;
    primary_color?: string | null;
    sport?: string | null;
    sport_id?: string | null;
    updated_at?: string | null;
};

function resolveClubSport(club?: DbClubLite | null) {
    return normalizeSportValue(club?.sport_id || club?.sport || null);
}

function resolveTournamentSport(tournament?: DbTournamentLite | null) {
    return normalizeSportValue(tournament?.sport_id || tournament?.sport || null);
}

function resolveMatchSport(
    match: { sport_id?: string | null; sport?: string | null },
    tournament?: DbTournamentLite | null,
    homeClub?: DbClubLite | null,
    awayClub?: DbClubLite | null
) {
    const directSport = normalizeSportValue(match.sport_id || match.sport || null);
    if (directSport) return directSport;

    const tournamentSport = resolveTournamentSport(tournament);
    if (tournamentSport) return tournamentSport;

    const homeSport = resolveClubSport(homeClub);
    const awaySport = resolveClubSport(awayClub);

    if (homeSport && awaySport && homeSport === awaySport) {
        return homeSport;
    }

    return homeSport || awaySport || null;
}

function isTournamentPubliclyVisible(tournament?: DbTournamentLite | null) {
    return isTournamentVisibleToPublic(tournament ?? null);
}

function isLookupPermissionError(error: { code?: string | null; message?: string | null; details?: string | null } | null | undefined) {
    if (!error) return false;

    const haystack = `${error.message || ''} ${error.details || ''}`.toLowerCase();
    return (
        error.code === '42501' ||
        haystack.includes('permission denied') ||
        haystack.includes('not authorized') ||
        haystack.includes('row-level security')
    );
}

async function fetchDbLookupMaps(
    supabase: unknown,
    tournamentIds: string[],
    clubIds: string[]
) {
    const lookupClient = supabase as LookupMapsClient;
    const [tournamentsRes, clubsRes] = await Promise.all([
        selectManyWithFallback<DbTournamentLite>(
            lookupClient,
            'tournaments',
            'id',
            tournamentIds,
            [
                'id, name, sport_id, sport, priority, season_id, status, is_visible, review_status, country_id, union_id',
                'id, name, sport_id, sport, priority, season_id, status, is_visible, country_id, union_id',
                'id, name, sport_id, sport, priority, season_id, status, country_id, union_id',
                'id, name, sport_id, sport, season_id, status, is_visible, country_id, union_id',
                'id, name, sport_id, sport, status, priority, is_visible, country_id, union_id',
                'id, name, sport_id, sport, status, is_visible, country_id, union_id',
                'id, name, sport_id, status, is_visible, country_id, union_id',
                'id, name, sport, status, is_visible, country_id, union_id',
                'id, name, status, is_visible, country_id, union_id',
                'id, name, is_visible',
                'id, name'
            ]
        ),
        // Sin `logo_url` A PROPÓSITO: 409 de los 521 clubes de un sábado guardan
        // el escudo en base64 (hasta 850 KB cada uno) y la consulta devolvía
        // 47 MB en 8 s; sin la columna son 100 KB en medio segundo. El escudo
        // sale por el proxy, que lo resuelve por id (ver mapDbMatchToPublicFeed).
        selectManyWithFallback<DbClubLite>(
            lookupClient,
            'clubs',
            'id',
            clubIds,
            [
                'id, name, short_name, primary_color, sport_id, sport, updated_at',
                'id, name, short_name, primary_color, sport_id, sport',
                'id, name, short_name, primary_color, sport_id',
                'id, name, short_name, primary_color, sport',
                'id, name, short_name, primary_color',
                'id, name, short_name, sport_id',
                'id, name, short_name, sport',
                'id, name, short_name',
                'id, name, sport_id',
                'id, name, sport',
                'id, name'
            ]
        ),
    ]);

    const ignoreTournamentLookupError = Boolean(
        tournamentsRes.error && (
            isMissingTableError(tournamentsRes.error, 'tournaments') ||
            isLookupPermissionError(tournamentsRes.error)
        ),
    );
    const ignoreClubLookupError = Boolean(
        clubsRes.error && (
            isMissingTableError(clubsRes.error, 'clubs') ||
            isLookupPermissionError(clubsRes.error)
        ),
    );

    if (tournamentsRes.error && !ignoreTournamentLookupError) throw tournamentsRes.error;
    if (clubsRes.error && !ignoreClubLookupError) throw clubsRes.error;

    if (ignoreTournamentLookupError) {
        console.warn('[matches] Tournament lookup unavailable, continuing with raw match data.', {
            code: tournamentsRes.error?.code ?? null,
            message: tournamentsRes.error?.message ?? null,
        });
    }

    if (ignoreClubLookupError) {
        console.warn('[matches] Club lookup unavailable, continuing with raw match data.', {
            code: clubsRes.error?.code ?? null,
            message: clubsRes.error?.message ?? null,
        });
    }

    const tournamentRows = (ignoreTournamentLookupError ? [] : tournamentsRes.data) || [];
    const clubRows = (ignoreClubLookupError ? [] : clubsRes.data) || [];

    return {
        tournamentMap: new Map(tournamentRows.map((t: any) => [t.id, t as DbTournamentLite])),
        clubMap: new Map(clubRows.map((c: any) => [c.id, c as DbClubLite])),
    };
}

type PublicDbMatchRow = {
    id: string;
    tournament_id: string | null;
    date_time: string;
    status: string | null;
    score?: unknown;
    round_label?: string | null;
    round_id?: string | null;
    venue?: string | null;
    home_club_id: string | null;
    away_club_id: string | null;
    sport_id?: string | null;
    sport?: string | null;
    is_visible?: boolean | null;
    review_status?: string | null;
    created_by_club_id?: string | null;
};

type PublicDbMatchesResult = {
    matches: any[];
    ok: boolean;
    count: number;
    reason: string | null;
    message: string | null;
};

function mapDbMatchToPublicFeed(
    match: PublicDbMatchRow,
    tournamentMap: Map<string, DbTournamentLite>,
    clubMap: Map<string, DbClubLite>,
    timeZone: string,
    liveOnly: boolean,
) {
    const tournament = tournamentMap.get(match.tournament_id || '');
    const homeTeam = clubMap.get(match.home_club_id || '');
    const awayTeam = clubMap.get(match.away_club_id || '');
    const resolvedSport = resolveMatchSport(match, tournament, homeTeam, awayTeam);
    const { localTime } = toLocalMatch(match.date_time, timeZone);
    const normalizedStatus = match.status || 'scheduled';

    return {
        id: match.id,
        tournamentId: match.tournament_id,
        dateTime: match.date_time,
        time: localTime,
        status: normalizedStatus,
        score: normalizedStatus === 'scheduled' ? null : (match.score ?? null),
        clock: {
            running: normalizedStatus === 'live',
            seconds: 0,
            period: liveOnly
                ? 'En Vivo'
                : (normalizedStatus === 'live' ? 'En Vivo' : (normalizedStatus === 'final' ? 'Final' : '1T')),
        },
        roundId: match.round_label || match.round_id || 'General',
        venue: match.venue || 'Sede',
        homeClubId: match.home_club_id,
        awayClubId: match.away_club_id,
        homeTeam: buildResolvedMatchTeam(homeTeam ? {
            id: homeTeam.id,
            name: homeTeam.name,
            logo: buildClubLogoProxyUrl(homeTeam.id, homeTeam.name),
            shortName: homeTeam.short_name || homeTeam.name?.substring(0, 3).toUpperCase() || 'LOC',
            updated_at: homeTeam.updated_at || '',
        } : {
            id: match.home_club_id,
            name: 'Local',
            logo: '',
            shortName: 'LOC',
        }, 'Local', 'LOC'),
        awayTeam: buildResolvedMatchTeam(awayTeam ? {
            id: awayTeam.id,
            name: awayTeam.name,
            logo: buildClubLogoProxyUrl(awayTeam.id, awayTeam.name),
            shortName: awayTeam.short_name || awayTeam.name?.substring(0, 3).toUpperCase() || 'VIS',
            updated_at: awayTeam.updated_at || '',
        } : {
            id: match.away_club_id,
            name: 'Visitante',
            logo: '',
            shortName: 'VIS',
        }, 'Visitante', 'VIS'),
        tournament: tournament ? {
            id: tournament.id,
            name: tournament.name,
            sport: resolvedSport || tournament.sport_id || tournament.sport || null,
            status: tournament.status || 'published',
            priority: tournament.priority ?? 0,
            country: resolveTournamentCountry(tournament),
        } : {
            id: match.tournament_id || 'db-local',
            name: 'Partido Local',
            sport: resolvedSport,
            status: 'published',
            country: 'Internacional',
        },
        liveEnabled: normalizedStatus === 'live',
        source: 'db' as const,
    };
}

async function fetchPublicSupabaseMatches(options: {
    readClientPromise: Promise<Awaited<ReturnType<typeof getReadClient>>>;
    requestedDate: string;
    timeZone: string;
    sport?: string;
    liveOnly: boolean;
    trace?: MatchesTraceContext;
}): Promise<PublicDbMatchesResult> {
    const startedAt = Date.now();
    const metricName = options.liveOnly ? 'supabase_live_read_ms' : 'supabase_matches_read_ms';

    try {
        const supabase = await options.readClientPromise;
        const sportVariants = options.sport ? getSportVariants(options.sport) : null;

        const utcStart = options.liveOnly
            ? null
            : combineLocalDateTimeToUtcIso(options.requestedDate, '00:00:00', options.timeZone);
        const utcNextDayStart = options.liveOnly
            ? null
            : combineLocalDateTimeToUtcIso(addDaysToIsoDate(options.requestedDate, 1), '00:00:00', options.timeZone);

        if (!options.liveOnly && (!utcStart || !utcNextDayStart)) {
            throw new Error('No se pudo construir el rango horario local para la consulta de partidos.');
        }

        const { data: dbMatches, error: dbError } = await selectMatchesRowsWithFallback(
            supabase,
            async (columns) => {
                const query = supabase.from('matches').select(columns);

                if (options.liveOnly) {
                    return await query
                        .eq('status', 'live')
                        .order('date_time', { ascending: true })
                        .limit(MAX_PUBLIC_DB_LIVE_MATCH_ROWS);
                }

                return await query
                    .gte('date_time', utcStart as string)
                    .lt('date_time', utcNextDayStart as string)
                    .order('date_time', { ascending: true })
                    .limit(MAX_PUBLIC_DB_MATCH_ROWS);
            },
        );

        if (dbError) {
            console.error('[matches] Supabase query returned error:', {
                code: dbError.code ?? null,
                message: dbError.message ?? null,
                details: dbError.details ?? null,
            });
            return {
                matches: [],
                ok: false,
                count: 0,
                reason: 'database_query_failed',
                message: 'No se pudieron cargar los partidos desde la base de datos.',
            };
        }

        const rows = (dbMatches || []) as PublicDbMatchRow[];
        const rowCap = options.liveOnly ? MAX_PUBLIC_DB_LIVE_MATCH_ROWS : MAX_PUBLIC_DB_MATCH_ROWS;
        if (rows.length >= rowCap && options.trace) {
            logMatchesEvent('warn', 'matches_supabase_row_cap_reached', options.trace, {
                row_cap: rowCap,
                live_only: options.liveOnly,
            });
        }
        const tournamentIds = [...new Set(rows.map((match) => match.tournament_id).filter(Boolean))] as string[];
        const clubIds = [...new Set(rows.flatMap((match) => [match.home_club_id, match.away_club_id]).filter(Boolean))] as string[];
        const { tournamentMap, clubMap } = await fetchDbLookupMaps(supabase, tournamentIds, clubIds);

        const matches = rows
            .filter((match) => {
                const tournament = tournamentMap.get(match.tournament_id || '');
                const homeTeam = clubMap.get(match.home_club_id || '');
                const awayTeam = clubMap.get(match.away_club_id || '');

                if (!isMatchVisibleToPublic(match)) {
                    return false;
                }
                if (match.tournament_id && (!tournament || !isTournamentPubliclyVisible(tournament))) {
                    return false;
                }
                // Un partido que cargó un club y no pertenece a ninguna competencia
                // vive PUERTAS ADENTRO de su panel: es la promesa del Panel del Día,
                // que el amistoso de la M15 no compita con los torneos oficiales en
                // la portada. Sin esta guarda entraba igual, y peor: sin torneo que
                // mostrar, mapDbMatchToPublicFeed le inventaba uno, 'Partido Local'.
                if (match.created_by_club_id && !match.tournament_id) {
                    return false;
                }
                if (!sportVariants) return true;

                const resolvedSport = resolveMatchSport(match, tournament, homeTeam, awayTeam);
                return resolvedSport ? sportVariants.includes(resolvedSport) : false;
            })
            .map((match) => mapDbMatchToPublicFeed(match, tournamentMap, clubMap, options.timeZone, options.liveOnly));

        return {
            matches,
            ok: true,
            count: matches.length,
            reason: matches.length === 0 ? 'empty_result' : null,
            message: matches.length === 0 ? 'No hay partidos en base de datos para este filtro.' : null,
        };
    } catch (error) {
        console.error('[matches] Supabase public feed fetch failed:', error);
        return {
            matches: [],
            ok: false,
            count: 0,
            reason: 'database_fetch_failed',
            message: 'No se pudieron cargar los partidos desde la base de datos.',
        };
    } finally {
        if (options.trace) {
            const durationMs = trackDuration(options.trace.metrics, metricName, startedAt);
            if (!options.liveOnly) {
                options.trace.metrics.supabase_read_time_ms = durationMs;
            }
            if (durationMs > 250) {
                logMatchesEvent(
                    'warn',
                    options.liveOnly ? 'matches_slow_supabase_live_read' : 'matches_slow_supabase_matches_read',
                    options.trace,
                    { threshold_ms: 250 },
                );
            }
        }
    }
}

function buildPublicCacheHeaders(options: { liveOnly: boolean; date?: string | null; useExternal?: boolean }) {
    const headers = new Headers();

    if (options.liveOnly) {
        headers.set('Cache-Control', 'private, no-store, no-cache, max-age=0, must-revalidate');
        headers.set('Pragma', 'no-cache');
    } else if (options.date && options.useExternal) {
        headers.set('Cache-Control', 'public, max-age=10, s-maxage=15');
    } else if (options.date) {
        headers.set('Cache-Control', 'public, max-age=20, s-maxage=30, stale-while-revalidate=90');
    }

    return headers;
}

function jsonWithPublicCache(payload: unknown, options: { liveOnly: boolean; date?: string | null; useExternal?: boolean }) {
    const headers = buildPublicCacheHeaders(options);
    return NextResponse.json(payload, headers.get('Cache-Control') ? { headers } : undefined);
}

type MatchesRequestParams = {
    date: string | null;
    sport?: string;
    status: string | null;
    timeZone: string;
    requestedDate: string;
    liveOnly: boolean;
    useExternal: boolean;
};

type MatchesPayload = {
    data: any[];
    sources?: {
        flashscore?: {
            ok: boolean;
            count: number;
            fromCache?: boolean;
            reason?: string | null;
            message?: string | null;
        };
        supabase?: {
            ok: boolean;
            count: number;
            fallback?: boolean;
            reason?: string | null;
            message?: string | null;
        };
    };
};

type MatchesResponseCacheEntry = {
    payload: MatchesPayload;
    createdAt: number;
    freshTtlMs: number;
    staleTtlMs: number;
};

type MatchesRequestMetrics = Record<string, number>;

type MatchesTraceContext = {
    requestId: string;
    cacheKey: string;
    params: MatchesRequestParams;
    metrics: MatchesRequestMetrics;
    backgroundRefresh?: boolean;
    refreshId?: string;
    parentRequestId?: string;
};

const EXTERNAL_MATCHES_PERSIST_TTL_MS = 10 * 60 * 1000;
const MATCHES_DB_SELECT_COLUMNS = [
    'id',
    'tournament_id',
    'date_time',
    'status',
    'score',
    'round_label',
    'round_id',
    'venue',
    'home_club_id',
    'away_club_id',
    'sport_id',
    'sport',
    'is_visible',
    'review_status',
    'created_by_club_id',
].join(', ');
const MATCHES_DB_SELECT_VARIANTS = [
    MATCHES_DB_SELECT_COLUMNS,
    'id, tournament_id, date_time, status, score, round_label, round_id, venue, home_club_id, away_club_id, sport_id, sport, is_visible',
    'id, tournament_id, date_time, status, score, round_label, round_id, venue, home_club_id, away_club_id, sport_id, sport, review_status',
    'id, tournament_id, date_time, status, score, round_label, round_id, venue, home_club_id, away_club_id, sport_id',
    'id, tournament_id, date_time, status, score, round_label, round_id, venue, home_club_id, away_club_id, sport',
    'id, tournament_id, date_time, status, score, round_label, venue, home_club_id, away_club_id',
    'id, tournament_id, date_time, status, score, round_id, venue, home_club_id, away_club_id',
    'id, tournament_id, date_time, status, score, venue, home_club_id, away_club_id, sport_id',
    'id, tournament_id, date_time, status, score, venue, home_club_id, away_club_id, sport',
    'id, tournament_id, date_time, status, score, venue, home_club_id, away_club_id',
    'id, tournament_id, date_time, status, round_label, round_id, venue, home_club_id, away_club_id',
    'id, tournament_id, date_time, status, round_label, venue, home_club_id, away_club_id',
    'id, tournament_id, date_time, status, round_id, venue, home_club_id, away_club_id',
    'id, tournament_id, date_time, status, home_club_id, away_club_id, sport_id',
    'id, tournament_id, date_time, status, home_club_id, away_club_id, sport',
    'id, tournament_id, date_time, status, home_club_id, away_club_id',
];
const MAX_PUBLIC_DB_MATCH_ROWS = 1500;
const MAX_PUBLIC_DB_LIVE_MATCH_ROWS = 500;
const MATCHES_DB_SCHEMA_FALLBACK_COLUMNS = [
    'id',
    'tournament_id',
    'date_time',
    'status',
    'score',
    'round_label',
    'round_id',
    'venue',
    'home_club_id',
    'away_club_id',
    'sport_id',
    'sport',
    'is_visible',
    'review_status',
];
const matchesRefreshLocks = new Map<string, Promise<void>>();
const matchesInFlightResponses = new Map<string, Promise<MatchesPayload>>();
const matchesSnapshotPersistLocks = new Map<string, Promise<boolean>>();
const externalMatchesPersistedAt = new Map<string, number>();
const lookupSelectVariantCache = new Map<string, string>();
let preferredMatchesSelectVariant: string | null = null;

function createTraceId(prefix: 'req' | 'refresh') {
    const randomPart = typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID().slice(0, 8)
        : Math.random().toString(36).slice(2, 10);
    return `${prefix}_${randomPart}`;
}

function trackDuration(metrics: MatchesRequestMetrics, metricName: string, startedAt: number) {
    const durationMs = Date.now() - startedAt;
    metrics[metricName] = durationMs;
    return durationMs;
}

function addDurationMetric(metrics: MatchesRequestMetrics, metricName: string, durationMs: number) {
    metrics[metricName] = (metrics[metricName] || 0) + durationMs;
    return metrics[metricName];
}

function buildTraceLogPayload(
    trace: MatchesTraceContext,
    extra: Record<string, unknown> = {},
) {
    return {
        request_id: trace.requestId,
        refresh_id: trace.refreshId ?? null,
        parent_request_id: trace.parentRequestId ?? null,
        cache_key: trace.cacheKey,
        sport: trace.params.sport || 'all',
        live: trace.params.liveOnly,
        date: trace.params.date,
        requested_date: trace.params.requestedDate,
        timezone: trace.params.timeZone,
        status: trace.params.status,
        external: trace.params.useExternal,
        background_refresh: trace.backgroundRefresh === true,
        ...trace.metrics,
        ...extra,
    };
}

function logMatchesEvent(
    level: 'info' | 'warn' | 'error',
    event: string,
    trace: MatchesTraceContext,
    extra: Record<string, unknown> = {},
) {
    const payload = buildTraceLogPayload(trace, { event, ...extra });
    const line = `[matches] ${JSON.stringify(payload)}`;

    if (level === 'warn') {
        console.warn(line);
        return;
    }

    if (level === 'error') {
        console.error(line);
        return;
    }

    console.info(line);
}

function attachObservabilityHeaders(
    response: NextResponse,
    trace: MatchesTraceContext,
    cacheStatus: string,
) {
    response.headers.set('X-G22-Cache', cacheStatus);
    response.headers.set('X-G22-Request-Id', trace.requestId);

    if (process.env.NODE_ENV !== 'production') {
        response.headers.set('X-G22-Cache-Key', trace.cacheKey);
        if (typeof trace.metrics.compute_payload_ms === 'number') {
            response.headers.set('X-G22-Compute-Ms', String(trace.metrics.compute_payload_ms));
        }
    }

    return response;
}

function finalizeRequestMetrics(trace: MatchesTraceContext, requestStartedAt: number) {
    const totalMs = trackDuration(trace.metrics, 'response_time_ms', requestStartedAt);
    trace.metrics.total_request_ms = totalMs;
    return totalMs;
}

function logSlowComputeStageWarnings(trace: MatchesTraceContext) {
    const warnings: Array<{ metric: string; threshold: number; event: string }> = [
        { metric: 'external_fetch_ms', threshold: 800, event: 'matches_slow_external_fetch' },
        { metric: 'supabase_matches_read_ms', threshold: 250, event: 'matches_slow_supabase_matches_read' },
        { metric: 'supabase_live_read_ms', threshold: 250, event: 'matches_slow_supabase_live_read' },
        { metric: 'merge_sources_ms', threshold: 250, event: 'matches_slow_merge_sources' },
        { metric: 'enrich_matches_ms', threshold: 300, event: 'matches_slow_enrich_matches' },
    ];

    warnings.forEach(({ metric, threshold, event }) => {
        const value = trace.metrics[metric];
        if (typeof value === 'number' && value > threshold) {
            logMatchesEvent('warn', event, trace, { threshold_ms: threshold, metric, value_ms: value });
        }
    });
}

function normalizeMatchesRequest(request: Request): MatchesRequestParams {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');
    const sport = searchParams.get('sport') || undefined;
    const status = searchParams.get('status');
    const rawTimeZone = searchParams.get('tz') || undefined;
    const timeZone = (() => {
        const tz = rawTimeZone || 'America/Argentina/Buenos_Aires';
        try {
            new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
            return canonicalizeTimezone(tz);
        } catch {
            return 'America/Argentina/Buenos_Aires';
        }
    })();

    return {
        date,
        sport,
        status,
        timeZone,
        requestedDate: date || formatDateKey(new Date(), timeZone),
        liveOnly: searchParams.get('live') === 'true',
        useExternal: searchParams.get('external') === 'true',
    };
}

/**
 * Lo único del timezone que cambia el payload es DÓNDE empieza y termina el día
 * pedido (y el offset con el que se escriben las horas locales). Doce zonas
 * argentinas, Montevideo y Santiago dan el mismo listado, pero con el nombre
 * IANA en la clave eran doce cálculos y doce fan-outs al proveedor por el
 * mismo día. Se identifica el día por sus bordes en UTC.
 */
function buildDayWindowKey(params: MatchesRequestParams) {
    const dayStart = combineLocalDateTimeToUtcIso(params.requestedDate, '00:00:00', params.timeZone);
    const nextDayStart = combineLocalDateTimeToUtcIso(addDaysToIsoDate(params.requestedDate, 1), '00:00:00', params.timeZone);
    if (!dayStart || !nextDayStart) return params.timeZone;

    const offsetMinutes = (iso: string, localDate: string) =>
        Math.round((Date.parse(`${localDate}T00:00:00Z`) - Date.parse(iso)) / 60000);
    const startOffset = offsetMinutes(dayStart, params.requestedDate);
    const endOffset = offsetMinutes(nextDayStart, addDaysToIsoDate(params.requestedDate, 1));
    return startOffset === endOffset ? `utc${startOffset}` : `utc${startOffset}_${endOffset}`;
}

function buildMatchesCacheKey(params: MatchesRequestParams) {
    return [
        MATCHES_RESPONSE_CACHE_PREFIX,
        params.liveOnly ? 'live' : 'list',
        params.requestedDate,
        params.sport || 'all',
        params.status || 'all',
        params.useExternal ? 'external' : 'local',
        buildDayWindowKey(params),
    ].join(':');
}

function shouldUsePersistedFeedCache(params: MatchesRequestParams) {
    return !params.liveOnly;
}

/**
 * Stale-while-revalidate para el feed diario. Antes estaba apagado con
 * external=true —que es lo que manda la portada— y cada request pasada la
 * ventana fresh esperaba el recálculo entero (proveedor incluido) con el
 * usuario mirando. Servir lo viejo y refrescar atrás es exactamente lo que ese
 * caso necesita.
 *
 * El sondeo de en vivo queda afuera: lo viejo, ahí, es un partido que ya
 * arrancó y todavía no figura, y el cliente lo lee como que terminó.
 */
function shouldServeStaleMatchesFeed(params: MatchesRequestParams) {
    return !params.liveOnly;
}

/**
 * fixture-sync cubre, en días UTC, de ayer a hoy+2. Un día local cuyo rango
 * entero cae dentro de ese horizonte puede confiar en la caché como fuente
 * completa: si no tiene filas, no hay partidos.
 */
function isWithinFixtureSyncHorizon(params: MatchesRequestParams, nowMs: number = Date.now()) {
    const dayStart = combineLocalDateTimeToUtcIso(params.requestedDate, '00:00:00', params.timeZone);
    const nextDayStart = combineLocalDateTimeToUtcIso(addDaysToIsoDate(params.requestedDate, 1), '00:00:00', params.timeZone);
    if (!dayStart || !nextDayStart) return false;

    const todayUtc = new Date(nowMs);
    const horizonFrom = Date.UTC(todayUtc.getUTCFullYear(), todayUtc.getUTCMonth(), todayUtc.getUTCDate() - 1);
    const horizonTo = Date.UTC(todayUtc.getUTCFullYear(), todayUtc.getUTCMonth(), todayUtc.getUTCDate() + 3);
    return Date.parse(dayStart) >= horizonFrom && Date.parse(nextDayStart) <= horizonTo;
}

function buildExternalPersistKey(
    params: MatchesRequestParams,
    scope: 'live' | 'daily',
) {
    return [
        'external-catalog',
        scope,
        params.sport || 'all',
        scope === 'daily' ? params.requestedDate : 'current',
    ].join(':');
}

function shouldPersistExternalCatalog(
    key: string,
    nowMs: number = Date.now(),
) {
    const lastPersistedAt = externalMatchesPersistedAt.get(key) || 0;
    if (nowMs - lastPersistedAt < EXTERNAL_MATCHES_PERSIST_TTL_MS) {
        return false;
    }

    externalMatchesPersistedAt.set(key, nowMs);
    return true;
}

/**
 * La base no contestó y esta respuesta es la última sana, servida en su lugar.
 * Viaja con `ok: true` porque la pantalla tiene partidos de verdad; la razón
 * queda para el log y para que la cache la reintente enseguida.
 */
const DB_STALE_FALLBACK_REASON = 'database_stale_fallback';
const MAX_DB_STALE_FALLBACK_AGE_MS = 12 * 60 * 60 * 1000;
const MAX_LAST_HEALTHY_PAYLOADS = 64;

/** Última respuesta con la base sana, por clave. Vive lo que vive la instancia. */
const lastHealthyMatchesPayloads = new Map<string, { payload: MatchesPayload; createdAt: number }>();

function isDatabaseUnhealthy(payload?: MatchesPayload) {
    const supabase = payload?.sources?.supabase;
    return supabase?.ok === false || supabase?.reason === DB_STALE_FALLBACK_REASON;
}

function rememberHealthyMatchesPayload(key: string, payload: MatchesPayload, createdAt: number) {
    if (isDatabaseUnhealthy(payload)) return;
    lastHealthyMatchesPayloads.delete(key);
    if (lastHealthyMatchesPayloads.size >= MAX_LAST_HEALTHY_PAYLOADS) {
        const oldest = lastHealthyMatchesPayloads.keys().next().value;
        if (oldest !== undefined) lastHealthyMatchesPayloads.delete(oldest);
    }
    lastHealthyMatchesPayloads.set(key, { payload, createdAt });
}

/**
 * Si la base se cayó en esta lectura, devuelve la última respuesta sana en vez
 * del cartel: primero la de memoria, en frío el snapshot persistido aunque
 * esté vencido. Un corte de un minuto no puede vaciar la portada.
 */
async function recoverFromDatabaseOutage(
    key: string,
    params: MatchesRequestParams,
    payload: MatchesPayload,
    trace: MatchesTraceContext,
): Promise<MatchesPayload> {
    if (payload.sources?.supabase?.ok !== false) return payload;

    let fallback: MatchesPayload | null = null;
    let generatedAtMs: number | null = null;
    let origin: 'memory' | 'persisted' | null = null;

    const remembered = lastHealthyMatchesPayloads.get(key);
    if (remembered) {
        fallback = remembered.payload;
        generatedAtMs = remembered.createdAt;
        origin = 'memory';
    } else if (shouldUsePersistedFeedCache(params)) {
        try {
            const snapshot = await readMatchesFeedSnapshotPayload<MatchesPayload>(await getReadClient(), key);
            if (snapshot && !isDatabaseUnhealthy(snapshot.payload)) {
                fallback = snapshot.payload;
                generatedAtMs = new Date(snapshot.generatedAt).getTime();
                origin = 'persisted';
            }
        } catch (error) {
            console.error('[matches] stale fallback snapshot read failed:', error);
        }
    }

    const ageMs = generatedAtMs ? Date.now() - generatedAtMs : Number.NaN;
    if (!fallback || Number.isNaN(ageMs) || ageMs > MAX_DB_STALE_FALLBACK_AGE_MS) {
        return payload;
    }

    logMatchesEvent('warn', 'matches_database_stale_fallback', trace, {
        fallback_origin: origin,
        fallback_age_ms: ageMs,
        fallback_items_count: fallback.data.length,
        database_reason: payload.sources?.supabase?.reason ?? null,
    });

    return {
        ...fallback,
        sources: {
            ...fallback.sources,
            supabase: {
                ok: true,
                count: fallback.sources?.supabase?.count ?? 0,
                fallback: fallback.sources?.supabase?.fallback,
                reason: DB_STALE_FALLBACK_REASON,
                message: null,
            },
        },
    };
}

function hasSourceDegradation(payload?: MatchesPayload) {
    if (!payload?.sources) return false;
    return payload.sources.flashscore?.ok === false || isDatabaseUnhealthy(payload);
}

function hasShortLivedExternalResult(params: MatchesRequestParams, payload?: MatchesPayload) {
    if (!params.useExternal || !payload?.sources) return false;
    if (hasSourceDegradation(payload)) return true;

    // Un día sin partidos es un resultado válido y se cachea como cualquier otro.
    // Solo queda corto el caso dudoso: el proveedor contestó vacío para un día
    // en el que la caché tenía filas sin cerrar.
    const flashscoreReason = payload.sources.flashscore?.reason;
    return flashscoreReason === 'flashscore_empty_cache_fallback';
}

function getMatchesResponseCachePolicy(params: MatchesRequestParams, payload?: MatchesPayload) {
    if (params.liveOnly) {
        // El sondeo de en vivo se cacheaba 60 s fresco y 240 s rancio. Con el
        // cliente sondeando cada 60 s, una copia de antes de que un partido
        // arrancara —vacía— podía contestarle hasta cuatro minutos después y
        // la portada la leía como «terminó». Ahora la copia dura menos que un
        // sondeo, y una respuesta con una fuente caída casi nada.
        if (hasSourceDegradation(payload)) {
            return { freshTtlSec: 3, staleTtlSec: 3 };
        }
        return { freshTtlSec: 15, staleTtlSec: 15 };
    }

    // Una fuente caída se reintenta enseguida, pida o no FlashScore: sin esto,
    // un día lejano con la base caída quedaba cacheado hasta cuatro horas.
    if (hasSourceDegradation(payload) || hasShortLivedExternalResult(params, payload)) {
        return { freshTtlSec: 15, staleTtlSec: 60 };
    }

    if (params.useExternal && isFlashScoreMatchesListDateSupported(params.requestedDate, params.timeZone)) {
        return { freshTtlSec: 60, staleTtlSec: 180 };
    }

    const todayKey = formatDateKey(new Date(), params.timeZone);
    const dayDiff = Math.round(
        (new Date(`${params.requestedDate}T00:00:00Z`).getTime() - new Date(`${todayKey}T00:00:00Z`).getTime()) / 86400000
    );

    if (dayDiff === 0) {
        return { freshTtlSec: 120, staleTtlSec: 600 };
    }

    if (Math.abs(dayDiff) === 1) {
        return { freshTtlSec: 600, staleTtlSec: 1800 };
    }

    return { freshTtlSec: 3600, staleTtlSec: 14400 };
}

function getMatchesFeedState(
    generatedAtIso: string,
    expiresAtIso: string,
    params: MatchesRequestParams,
    staleUntilIso?: string | null,
) {
    const generatedAtMs = new Date(generatedAtIso).getTime();
    const expiresAtMs = new Date(expiresAtIso).getTime();
    const staleUntilMs = staleUntilIso ? new Date(staleUntilIso).getTime() : Number.NaN;
    const { staleTtlSec } = getMatchesResponseCachePolicy(params);
    const staleCutoffMs = Number.isNaN(staleUntilMs)
        ? generatedAtMs + staleTtlSec * 1000
        : staleUntilMs;
    const nowMs = Date.now();

    if (Number.isNaN(generatedAtMs) || Number.isNaN(expiresAtMs)) {
        return { state: 'miss' as const, createdAt: Date.now() };
    }

    if (nowMs <= expiresAtMs) {
        return { state: 'fresh' as const, createdAt: generatedAtMs };
    }

    if (nowMs <= staleCutoffMs) {
        return { state: 'stale' as const, createdAt: generatedAtMs };
    }

    return { state: 'miss' as const, createdAt: generatedAtMs };
}

function readMatchesResponseCache(key: string) {
    const entry = memoryCache.get<MatchesResponseCacheEntry>(key);
    if (!entry) return { state: 'miss' as const, entry: null };

    const ageMs = Date.now() - entry.createdAt;
    if (ageMs <= entry.freshTtlMs) {
        return { state: 'fresh' as const, entry };
    }
    if (ageMs <= entry.staleTtlMs) {
        return { state: 'stale' as const, entry };
    }

    memoryCache.delete(key);
    return { state: 'miss' as const, entry: null };
}

function writeMatchesResponseCache(
    key: string,
    payload: MatchesPayload,
    params: MatchesRequestParams,
    createdAt: number = Date.now(),
) {
    const policy = getMatchesResponseCachePolicy(params, payload);
    const entry: MatchesResponseCacheEntry = {
        payload,
        createdAt,
        freshTtlMs: policy.freshTtlSec * 1000,
        staleTtlMs: policy.staleTtlSec * 1000,
    };

    memoryCache.set(key, entry, Math.ceil(policy.staleTtlSec));
    rememberHealthyMatchesPayload(key, payload, createdAt);
}

async function persistMatchesFeedSnapshot(
    key: string,
    params: MatchesRequestParams,
    payload: MatchesPayload,
    generatedAt: Date = new Date(),
    trace?: MatchesTraceContext,
) {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !shouldUsePersistedFeedCache(params)) {
        return false;
    }

    const { freshTtlSec, staleTtlSec } = getMatchesResponseCachePolicy(params, payload);
    const persistStartedAt = Date.now();

    try {
        const persisted = await upsertMatchesFeedSnapshot(createAdminClient(), {
            cacheKey: key,
            feedType: params.liveOnly ? 'live' : 'daily',
            sport: params.sport,
            effectiveDate: params.liveOnly ? null : params.requestedDate,
            timeZone: params.timeZone,
            statusFilter: params.status,
            externalMode: params.useExternal,
            payload,
            sourceSummary: payload.sources ?? {},
            generatedAt,
            freshTtlSeconds: freshTtlSec,
            staleTtlSeconds: staleTtlSec,
            lastRefreshStartedAt: generatedAt,
            lastRefreshCompletedAt: new Date(),
        });

        if (trace) {
            const durationMs = trackDuration(trace.metrics, 'snapshot_write_time_ms', persistStartedAt);
            if (durationMs > 400) {
                logMatchesEvent('warn', 'matches_slow_snapshot_write', trace, { threshold_ms: 400, snapshot_persisted: persisted });
            }
        }

        return persisted;
    } catch (error) {
        console.error('[matches] persisted feed snapshot failed:', error);
        if (trace) {
            trackDuration(trace.metrics, 'snapshot_write_time_ms', persistStartedAt);
        }
        return false;
    }
}

function queuePersistMatchesFeedSnapshot(
    key: string,
    params: MatchesRequestParams,
    payload: MatchesPayload,
    generatedAt: Date = new Date(),
    trace?: MatchesTraceContext,
) {
    if (!shouldUsePersistedFeedCache(params)) {
        return Promise.resolve(false);
    }

    // Una lectura fallida de la base no pisa el snapshot compartido: si lo
    // hiciera, todas las instancias servirían el cartel de "no se pudieron
    // cargar" hasta que venciera, aunque el snapshot anterior estuviera sano.
    // La respuesta fallida vive solo en la memoria de esta instancia y con TTL
    // corto (hasSourceDegradation), así el próximo pedido vuelve a intentar.
    // Tampoco se re-persiste un respaldo viejo con fecha nueva.
    if (isDatabaseUnhealthy(payload)) {
        return Promise.resolve(false);
    }

    const existing = matchesSnapshotPersistLocks.get(key);
    if (existing) return existing;

    const persistPromise = persistMatchesFeedSnapshot(key, params, payload, generatedAt, trace)
        .finally(() => {
            matchesSnapshotPersistLocks.delete(key);
        });

    matchesSnapshotPersistLocks.set(key, persistPromise);
    return persistPromise;
}

async function refreshMatchesResponseCache(
    key: string,
    params: MatchesRequestParams,
    parentRequestId?: string,
) {
    const existing = matchesRefreshLocks.get(key);
    if (existing) return existing;

    const refreshPromise = (async () => {
        const startedAt = new Date();
        const trace: MatchesTraceContext = {
            requestId: parentRequestId || createTraceId('req'),
            parentRequestId,
            refreshId: createTraceId('refresh'),
            cacheKey: key,
            params,
            metrics: {},
            backgroundRefresh: true,
        };

        logMatchesEvent('info', 'matches_refresh_started', trace);
        try {
            const computeStartedAt = Date.now();
            const payload = await recoverFromDatabaseOutage(
                key,
                params,
                await computeMatchesPayload(params, trace),
                trace,
            );
            const computeDurationMs = trackDuration(trace.metrics, 'compute_payload_ms', computeStartedAt);
            writeMatchesResponseCache(key, payload, params, startedAt.getTime());
            void queuePersistMatchesFeedSnapshot(key, params, payload, startedAt, trace);
            if (computeDurationMs > 1200) {
                logMatchesEvent('warn', 'matches_slow_compute', trace, { threshold_ms: 1200 });
            }
            trackDuration(trace.metrics, 'refresh_total_ms', startedAt.getTime());
            logMatchesEvent('info', 'matches_refresh_succeeded', trace);
        } catch (error) {
            console.error('[matches] background refresh failed:', error);
            trackDuration(trace.metrics, 'refresh_total_ms', startedAt.getTime());
            logMatchesEvent('error', 'matches_refresh_failed', trace, { error: String(error) });
        } finally {
            matchesRefreshLocks.delete(key);
        }
    })();

    matchesRefreshLocks.set(key, refreshPromise);
    return refreshPromise;
}

async function getOrComputeMatchesPayload(
    key: string,
    params: MatchesRequestParams,
    trace: MatchesTraceContext,
) {
    const existing = matchesInFlightResponses.get(key);
    if (existing) return existing;

    const promise = (async () => {
        const startedAt = new Date();
        try {
            const computeStartedAt = Date.now();
            let computed: MatchesPayload;
            try {
                computed = await computeMatchesPayload(params, trace);
            } catch (error) {
                // El cómputo entero reventó (la base cortó la conexión a mitad
                // de camino): se intenta el respaldo antes de contestar 500.
                computed = await recoverFromDatabaseOutage(
                    key,
                    params,
                    {
                        data: [],
                        sources: {
                            flashscore: { ok: false, count: 0, reason: 'compute_failed', message: null },
                            supabase: { ok: false, count: 0, reason: 'compute_failed', message: null },
                        },
                    },
                    trace,
                );
                if (computed.sources?.supabase?.reason !== DB_STALE_FALLBACK_REASON) throw error;
            }
            const payload = await recoverFromDatabaseOutage(key, params, computed, trace);
            const computeDurationMs = trackDuration(trace.metrics, 'compute_payload_ms', computeStartedAt);
            writeMatchesResponseCache(key, payload, params, startedAt.getTime());
            void queuePersistMatchesFeedSnapshot(key, params, payload, startedAt, trace);
            if (computeDurationMs > 1200) {
                logMatchesEvent('warn', 'matches_slow_compute', trace, { threshold_ms: 1200 });
            }
            return payload;
        } finally {
            matchesInFlightResponses.delete(key);
        }
    })();

    matchesInFlightResponses.set(key, promise);
    return promise;
}

// GET /api/matches
// Parameters: 
// - date: YYYY-MM-DD
// - sport: 'rugby' | 'football' | ...
// - status: 'live' | 'scheduled' | ...
async function computeMatchesPayload(
    params: MatchesRequestParams,
    trace?: MatchesTraceContext,
): Promise<MatchesPayload> {
    const computeStartedAt = Date.now();
    let externalItemsCount = 0;
    let supabaseItemsCount = 0;
    let mergedItemsCount = 0;
    let finalItemsCount = 0;

    try {
        const { date, sport, status, timeZone, requestedDate, liveOnly, useExternal } = params;
        const readClientPromise = getReadClient();

        // Fast path: live=true returns only live matches (for polling)
        if (liveOnly && sport) {
            const dbLiveMatchesPromise = fetchPublicSupabaseMatches({
                readClientPromise,
                requestedDate,
                timeZone,
                sport,
                liveOnly: true,
                trace,
            });
            try {
                // Gate por ventana: si external_match_cache dice que no hay nada
                // en vivo ni por arrancar, el poll del usuario no gasta un request
                // del proveedor. 'unknown' falla abierto y pollea como siempre.
                let livePollGated = false;
                try {
                    const supabaseForGate = await readClientPromise;
                    livePollGated = (await shouldPollLiveMatches(sport, supabaseForGate)) === 'skip';
                } catch {
                    livePollGated = false;
                }

                const externalFetchStartedAt = Date.now();
                const liveMatches = livePollGated ? [] : await getFlashScoreLiveMatches(sport);
                externalItemsCount = liveMatches?.length || 0;
                if (trace) {
                    const durationMs = trackDuration(trace.metrics, 'external_fetch_ms', externalFetchStartedAt);
                    trace.metrics.external_fetch_time_ms = durationMs;
                }
                const enrichLiveStartedAt = Date.now();
                const enrichedLive = (liveMatches || []).map(m => {
                    let dateStr = new Date().toISOString();
                    try {
                        if (m.scheduledAt instanceof Date && !isNaN(m.scheduledAt.getTime())) {
                            dateStr = m.scheduledAt.toISOString();
                        } else if (typeof m.scheduledAt === 'string') {
                            const d = new Date(m.scheduledAt);
                            if (!isNaN(d.getTime())) dateStr = d.toISOString();
                        }
                    } catch { /* ignore */ }

                    return {
                        id: m.id,
                        tournamentId: m.tournamentId,
                        dateTime: dateStr,
                        status: 'live' as const,
                        score: m.score as any,
                        clock: {
                            running: true,
                            seconds: 0,
                            period: m.currentMinute || 'En Vivo'
                        },
                        roundId: m.round ? `F${m.round}` : 'General',
                        venue: m.venueName || 'Estadio',
                        homeClubId: m.homeTeamId,
                        awayClubId: m.awayTeamId,
                        homeTeam: buildResolvedMatchTeam({
                            id: m.homeTeamId,
                            name: m.homeTeamName,
                            logo: m.homeTeamLogo || '',
                            image_path: m.homeTeamImagePath || m.homeTeamLogo || '',
                            small_image_path: m.homeTeamImagePath || m.homeTeamLogo || '',
                            shortName: m.homeTeamName?.substring(0, 3).toUpperCase() || 'LOC',
                            source: 'flashscore',
                            team_url: m.homeTeamUrl || '',
                        }, 'Local', 'LOC'),
                        awayTeam: buildResolvedMatchTeam({
                            id: m.awayTeamId,
                            name: m.awayTeamName,
                            logo: m.awayTeamLogo || '',
                            image_path: m.awayTeamImagePath || m.awayTeamLogo || '',
                            small_image_path: m.awayTeamImagePath || m.awayTeamLogo || '',
                            shortName: m.awayTeamName?.substring(0, 3).toUpperCase() || 'VIS',
                            source: 'flashscore',
                            team_url: m.awayTeamUrl || '',
                        }, 'Visitante', 'VIS'),
                        tournament: {
                            id: m.tournamentId,
                            name: (m as any).leagueName || 'Liga',
                            sport: sport as any,
                            status: 'published' as const,
                            country: (m as any).countryName || 'Internacional',
                            url: (m as any).leagueUrl || undefined,
                            stageName: (m as any).leagueStageName || undefined
                        },
                        liveEnabled: true,
                        source: 'flashscore' as const
                    };
                });
                if (trace) {
                    addDurationMetric(trace.metrics, 'enrich_matches_ms', Date.now() - enrichLiveStartedAt);
                }
                if (liveMatches && liveMatches.length > 0) {
                    const persistKey = buildExternalPersistKey(params, 'live');
                    if (shouldPersistExternalCatalog(persistKey)) {
                        persistFromExternalMatches(liveMatches, sport);
                        void recordExternalTournamentsFromMatches(liveMatches, sport);
                    }
                }

                let finalLiveMatches: any[] = [...enrichedLive];

                // Lo que se le cuenta al cliente de cada fuente. Sin esto, el
                // sondeo devolvía `{ data: [] }` con 200 cuando la base no
                // contestaba, y la portada leía ese vacío como «terminaron
                // todos»: un partido de la base en el segundo tiempo se dibujaba
                // «FT» y el sondeo se apagaba.
                let liveSupabase: NonNullable<MatchesPayload['sources']>['supabase'] = {
                    ok: false,
                    count: 0,
                    reason: 'database_query_failed',
                    message: null,
                };

                try {
                    const dbLiveResult = await dbLiveMatchesPromise;
                    liveSupabase = {
                        ok: dbLiveResult.ok,
                        count: dbLiveResult.count,
                        reason: dbLiveResult.reason ?? null,
                        message: dbLiveResult.message ?? null,
                    };
                    if (dbLiveResult.ok) {
                        supabaseItemsCount = dbLiveResult.count;
                        const mergeLiveStartedAt = Date.now();
                        const existingIds = new Set(finalLiveMatches.map((match: { id: string }) => match.id));
                        finalLiveMatches = [
                            ...finalLiveMatches,
                            ...dbLiveResult.matches.filter((match) => !existingIds.has(match.id)),
                        ];
                        if (trace) {
                            addDurationMetric(trace.metrics, 'merge_sources_ms', Date.now() - mergeLiveStartedAt);
                        }
                    }
                } catch (dbErr) {
                    console.error('DB Live-only fetch failed:', dbErr);
                }

                const buildLivePayloadStartedAt = Date.now();
                finalLiveMatches = await applyStoredTournamentOverridesToMatches(finalLiveMatches);
                mergedItemsCount = finalLiveMatches.length;
                finalItemsCount = finalLiveMatches.length;
                if (trace) {
                    trackDuration(trace.metrics, 'build_payload_ms', buildLivePayloadStartedAt);
                    trace.metrics.compute_total_ms = Date.now() - computeStartedAt;
                    logSlowComputeStageWarnings(trace);
                    logMatchesEvent('info', 'matches_compute_summary', trace, {
                        external_items_count: externalItemsCount,
                        supabase_items_count: supabaseItemsCount,
                        merged_items_count: mergedItemsCount,
                        final_items_count: finalItemsCount,
                        live_poll_gated: livePollGated,
                    });
                }
                return {
                    data: finalLiveMatches,
                    sources: {
                        // Con el sondeo gateado no se preguntó nada: no es una caída.
                        flashscore: { ok: true, count: externalItemsCount },
                        supabase: liveSupabase,
                    },
                };
            } catch (e) {
                console.error('Live-only fetch failed, trying external_match_cache:', e);
                try {
                    const externalCacheFallbackStartedAt = Date.now();
                    const supabase = await readClientPromise;
                    const cachedLive = await getLiveMatches(sport, supabase);
                    externalItemsCount = cachedLive.length;
                    const dbLiveResult = await dbLiveMatchesPromise;
                    const enriched = await applyStoredTournamentOverridesToMatches(
                        [
                            ...cachedLive.map(m => mapCachedToEnrichedMatch(m, sport)),
                            ...dbLiveResult.matches,
                        ].filter((match, index, arr) => arr.findIndex((candidate) => candidate.id === match.id) === index),
                    );
                    if (trace) {
                        trackDuration(trace.metrics, 'external_cache_fallback_ms', externalCacheFallbackStartedAt);
                    }
                    mergedItemsCount = enriched.length;
                    finalItemsCount = enriched.length;
                    if (trace) {
                        trace.metrics.compute_total_ms = Date.now() - computeStartedAt;
                        logSlowComputeStageWarnings(trace);
                        logMatchesEvent('info', 'matches_compute_summary', trace, {
                            external_items_count: externalItemsCount,
                            supabase_items_count: dbLiveResult.count,
                            merged_items_count: mergedItemsCount,
                            final_items_count: finalItemsCount,
                            fallback_path: 'live_external_cache',
                        });
                    }
                    return {
                        data: enriched,
                        sources: {
                            flashscore: { ok: false, count: 0, fromCache: cachedLive.length > 0 },
                            supabase: {
                                ok: dbLiveResult.ok,
                                count: dbLiveResult.count,
                                reason: dbLiveResult.reason ?? null,
                                message: dbLiveResult.message ?? null,
                            },
                        },
                    };
                } catch {
                    // Ni el proveedor ni la base: un vacío que NO significa
                    // «no hay nada en vivo». Se declara para que el cliente no
                    // cierre partidos con él.
                    return {
                        data: [],
                        sources: {
                            flashscore: { ok: false, count: 0, reason: 'live_fetch_failed', message: null },
                            supabase: { ok: false, count: 0, reason: 'live_fetch_failed', message: null },
                        },
                    };
                }
            }
        }

        // formatDateKey is imported from @/lib/timezone - uses Intl when
        // timeZone is provided, falls back to UTC otherwise.

        // External API Integration
        // When using external data, skip mock-db matches entirely
        // so the user only sees real FlashScore data.
        let enrichedMatches: any[] = [];

        // Per-source tracking (returned in response for client error visibility)
        let fsOk = false, fsCount = 0, fsFromCache = false;
        let dbOk = false, dbCount = 0;
        const dbFallback = false;
        let fsReason: string | null = null;
        let fsMessage: string | null = null;
        let dbReason: string | null = null;
        let dbMessage: string | null = null;
        const dbMatchesPromise = fetchPublicSupabaseMatches({
            readClientPromise,
            requestedDate,
            timeZone,
            sport,
            liveOnly: false,
            trace,
        });

        if (!useExternal) {
            let matches = db.matches;

            // Filter by Status
            if (status) {
                matches = matches.filter(m => m.status === status);
            }

            // Enrich data (join relationships)
            const enrichLocalStartedAt = Date.now();
            enrichedMatches = matches.map(m => {
                const home = db.clubs.find(c => c.id === m.homeClubId);
                const away = db.clubs.find(c => c.id === m.awayClubId);
                const tournament = db.tournaments.find(t => t.id === m.tournamentId);

                return {
                    ...m,
                    homeTeam: buildResolvedMatchTeam({
                        id: home?.id,
                        name: home?.name,
                        logo_url: home?.logoUrl,
                        shortName: home?.shortName
                    }, 'Local', 'LOC'),
                    awayTeam: buildResolvedMatchTeam({
                        id: away?.id,
                        name: away?.name,
                        logo_url: away?.logoUrl,
                        shortName: away?.shortName
                    }, 'Visitante', 'VIS'),
                    tournament: {
                        id: tournament?.id,
                        name: tournament?.name,
                        sport: tournament?.sport,
                        status: tournament?.status
                    }
                };
            });
            if (trace) {
                addDurationMetric(trace.metrics, 'enrich_matches_ms', Date.now() - enrichLocalStartedAt);
            }

            // Filter by Sport (needs enriched data to know the sport)
            if (sport) {
                enrichedMatches = enrichedMatches.filter(m => m.tournament?.sport === sport);
            }

            // Filter public visibility (only published tournaments)
            enrichedMatches = enrichedMatches.filter(m => m.tournament?.status === 'published' || m.id.startsWith('ext-') || m.id.startsWith('fs-'));
            mergedItemsCount = enrichedMatches.length;
        }

        const flashScoreEnabledForRequestedSport = isFlashScoreEnabledForSport(sport || 'rugby');

        if (useExternal && date && flashScoreEnabledForRequestedSport) {
            try {
                // Fix: Parse YYYY-MM-DD as local date to avoid UTC timezone shift
                const [year, month, day] = date.split('-').map(Number);
                const localDate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));

                // Check if date is today for live updates (user timezone aware when provided)
                const todayKey = formatDateKey(new Date(), timeZone);
                const isToday = date === todayKey;
                // La ventana de ±7 días es de FlashScore, no del calendario: para
                // hockey el fixture completo del Mundial lo publica la FIH.
                const supportsFlashScoreDailyList = await isExternalMatchesListDateSupported(
                    date,
                    sport || 'rugby',
                    timeZone,
                );

                // ── DB-first: external_match_cache es la fuente primaria ──────
                // fixture-sync (cada hora) y live-sync (cada minuto) la mantienen
                // al día, así que servir desde acá no gasta requests del proveedor.
                // FlashScore queda como camino de reparación para cuando la caché
                // no puede responder por la fecha pedida.
                let cachedEnriched: any[] = [];
                let cacheIsServable = false;
                // Día sin filas pero con el sync vivo: no hay partidos, y se sirve
                // sin tocar al proveedor. Ver hasRecentFixtureSyncEvidence.
                let emptyDayFromCache = false;
                try {
                    const cacheReadStartedAt = Date.now();
                    const supabaseForCache = await readClientPromise;
                    const cachedRows = await getMatchesForDate(date, sport || 'rugby', supabaseForCache);
                    if (trace) {
                        trackDuration(trace.metrics, 'external_cache_read_ms', cacheReadStartedAt);
                    }

                    // getMatchesForDate trae ±1 día UTC; acá solo cuentan las
                    // filas que caen en la fecha pedida según la timezone del
                    // request. Sin este corte, un día futuro que fixture-sync
                    // todavía no cubrió se serviría "desde caché" con el derrame
                    // del día anterior.
                    const rowsForDate = cachedRows.filter((row) => {
                        const rowDate = new Date(row.date_time);
                        return !Number.isNaN(rowDate.getTime()) && formatDateKey(rowDate, timeZone) === date;
                    });

                    // Una fila sin resultado con kickoff de hace más de 3 horas
                    // es una deuda del sync (un final que live-sync no vio): en
                    // ese caso se repara con el proveedor en vez de servir un
                    // "scheduled" viejo. El write-through de la reparación la
                    // sana para los próximos requests.
                    const nowMs = Date.now();
                    const hasStaleNonTerminal = rowsForDate.some((row) => {
                        if (row.status === 'final' || row.status === 'cancelled' || row.status === 'postponed') {
                            return false;
                        }
                        const kickoffMs = new Date(row.date_time).getTime();
                        return !Number.isNaN(kickoffMs) && nowMs - kickoffMs > 3 * 60 * 60 * 1000;
                    });

                    if (rowsForDate.length > 0) {
                        const enrichCacheStartedAt = Date.now();
                        cachedEnriched = rowsForDate
                            .map(m => mapCachedToEnrichedMatch(m, sport || 'rugby'))
                            .filter(m => !isBlockedTournamentId(m.tournamentId));
                        if (trace) {
                            addDurationMetric(trace.metrics, 'enrich_matches_ms', Date.now() - enrichCacheStartedAt);
                        }
                        cacheIsServable = !hasStaleNonTerminal;
                    } else if (supportsFlashScoreDailyList && isWithinFixtureSyncHorizon(params)) {
                        const evidenceStartedAt = Date.now();
                        emptyDayFromCache = (await hasRecentFixtureSyncEvidence(sport || 'rugby', supabaseForCache)) === true;
                        if (trace) {
                            addDurationMetric(trace.metrics, 'external_cache_read_ms', Date.now() - evidenceStartedAt);
                        }
                    }
                } catch (cacheErr) {
                    console.warn('[matches] external cache primary read failed:', cacheErr);
                }

                const servedFromExternalCache = cacheIsServable && cachedEnriched.length > 0;
                if (servedFromExternalCache) {
                    enrichedMatches = [...enrichedMatches, ...cachedEnriched];
                    externalItemsCount = cachedEnriched.length;
                    fsOk = true;
                    fsFromCache = true;
                    fsCount = cachedEnriched.length;
                    fsReason = 'external_cache_primary';
                    console.log(`[matches] external cache primary: ${fsCount} matches for date=${date}`);
                } else if (emptyDayFromCache) {
                    fsOk = true;
                    fsFromCache = true;
                    fsCount = 0;
                    fsReason = 'external_cache_empty_day';
                    console.log(`[matches] external cache empty day: no matches for date=${date}`);
                }

                // Track whether FlashScore API actually failed (vs returned 0 results)
                let fsFetchFailed = false;
                if (!servedFromExternalCache && !supportsFlashScoreDailyList) {
                    fsOk = true;
                    fsReason = 'flashscore_date_out_of_window';
                }

                // Reparación: FlashScore solo corre cuando la caché no sirvió.
                const shouldFetchExternal = !servedFromExternalCache && !emptyDayFromCache && supportsFlashScoreDailyList;
                const externalFetchStartedAt = Date.now();
                const [externalMatches, liveMatches] = await Promise.all([
                    shouldFetchExternal
                        ? getFlashScoreMatches(localDate, sport || 'rugby', {
                            timeZone,
                            targetDateKey: date || undefined
                        }).catch(e => {
                            console.warn('[matches] FlashScore fetch failed - trying cache', e?.message);
                            fsFetchFailed = true;
                            fsReason = 'flashscore_fetch_failed';
                            fsMessage = 'No se pudieron cargar los partidos desde FlashScore.';
                            return [];
                        })
                        : Promise.resolve([]),
                    shouldFetchExternal && isToday ? getFlashScoreLiveMatches(sport || 'rugby').catch(e => {
                        console.warn('[matches] FlashScore live fetch failed', e?.message);
                        return [];
                    }) : Promise.resolve([])
                ]);
                if (trace && shouldFetchExternal) {
                    const durationMs = trackDuration(trace.metrics, 'external_fetch_ms', externalFetchStartedAt);
                    trace.metrics.external_fetch_time_ms = durationMs;
                }
                if (!servedFromExternalCache) {
                    externalItemsCount = externalMatches.length;
                }

                // ── Cache fallback (semántica previa): el proveedor falló, vino
                // vacío o la fecha está fuera de ventana, y la caché tenía filas
                // que no calificaron como primarias.
                const repairProducedNothing = shouldFetchExternal && (fsFetchFailed || externalMatches.length === 0);
                const outOfWindowWithCache = !servedFromExternalCache && !supportsFlashScoreDailyList;
                const servedCacheAsFallback = (repairProducedNothing || outOfWindowWithCache) && cachedEnriched.length > 0;
                if (servedCacheAsFallback) {
                    const mergeFallbackStartedAt = Date.now();
                    enrichedMatches = [...enrichedMatches, ...cachedEnriched];
                    if (trace) {
                        addDurationMetric(trace.metrics, 'merge_sources_ms', Date.now() - mergeFallbackStartedAt);
                    }
                    fsOk = !fsFetchFailed;
                    fsFromCache = true;
                    fsCount = cachedEnriched.length;
                    fsReason = !supportsFlashScoreDailyList
                        ? 'flashscore_date_out_of_window'
                        : fsFetchFailed
                            ? 'flashscore_cache_fallback'
                            : 'flashscore_empty_cache_fallback';
                    fsMessage = 'Datos de FlashScore desde caché; puede haber un leve retraso.';
                    console.log(`[matches] FlashScore cache fallback: ${fsCount} matches for date=${date}`);
                }

                if (shouldFetchExternal && !fsFetchFailed && !servedCacheAsFallback) {
                // Merge live data into list
                const mergeExternalStartedAt = Date.now();
                const mergedExternalMatches = liveMatches && liveMatches.length > 0
                    ? (() => {
                        const liveMap = new Map(liveMatches.map(m => [m.id, m]));
                        return externalMatches.map(match => {
                            const liveMatch = liveMap.get(match.id);
                            if (liveMatch) {
                                return {
                                    ...match,
                                    status: 'live',
                                    score: liveMatch.score,
                                };
                            }
                            return match;
                        });
                    })()
                    : externalMatches;
                if (trace) {
                    addDurationMetric(trace.metrics, 'merge_sources_ms', Date.now() - mergeExternalStartedAt);
                }

                const enrichExternalStartedAt = Date.now();
                const enrichedExternalMatches = (mergedExternalMatches || []).map(m => {
                    // Defensive date conversion
                    let dateStr = new Date().toISOString();
                    try {
                        if (m.scheduledAt instanceof Date && !isNaN(m.scheduledAt.getTime())) {
                            dateStr = m.scheduledAt.toISOString();
                        } else if (typeof m.scheduledAt === 'string') {
                            const d = new Date(m.scheduledAt);
                            if (!isNaN(d.getTime())) dateStr = d.toISOString();
                        }
                    } catch {
                        console.warn('Date conversion failed for match', m.id);
                    }

                    return {
                        id: m.id,
                        tournamentId: m.tournamentId,
                        dateTime: dateStr,
                        status: (m.status === 'final' ? 'final' : m.status === 'live' ? 'live' : 'scheduled') as any,
                        score: m.status === 'scheduled' ? null : (m.score ?? null),
                        clock: {
                            running: m.status === 'live',
                            seconds: 0,
                            period: m.currentMinute || (m.status === 'live' ? 'En Vivo' : '1T')
                        },
                        roundId: m.round ? `F${m.round}` : 'General',
                        venue: m.venueName || 'Estadio',
                        homeClubId: m.homeTeamId,
                        awayClubId: m.awayTeamId,
                        homeTeam: buildResolvedMatchTeam({
                            id: m.homeTeamId,
                            name: m.homeTeamName,
                            logo: m.homeTeamLogo || '',
                            image_path: m.homeTeamImagePath || m.homeTeamLogo || '',
                            small_image_path: m.homeTeamImagePath || m.homeTeamLogo || '',
                            shortName: m.homeTeamName?.substring(0, 3).toUpperCase() || 'LOC',
                            source: 'flashscore',
                            team_url: m.homeTeamUrl || '',
                        }, 'Local', 'LOC'),
                        awayTeam: buildResolvedMatchTeam({
                            id: m.awayTeamId,
                            name: m.awayTeamName,
                            logo: m.awayTeamLogo || '',
                            image_path: m.awayTeamImagePath || m.awayTeamLogo || '',
                            small_image_path: m.awayTeamImagePath || m.awayTeamLogo || '',
                            shortName: m.awayTeamName?.substring(0, 3).toUpperCase() || 'VIS',
                            source: 'flashscore',
                            team_url: m.awayTeamUrl || '',
                        }, 'Visitante', 'VIS'),
                        tournament: {
                            id: m.tournamentId,
                            name: (m as any).leagueName || 'Liga (EXT)',
                            sport: (sport || 'rugby') as any,
                            status: 'published' as const,
                            country: (m as any).countryName || 'Internacional',
                            url: (m as any).leagueUrl || undefined,
                            stageName: (m as any).leagueStageName || undefined
                        },
                        liveEnabled: false,
                        source: 'flashscore' as const
                    };
                });
                if (trace) {
                    addDurationMetric(trace.metrics, 'enrich_matches_ms', Date.now() - enrichExternalStartedAt);
                }

                const dedupeExternalStartedAt = Date.now();
                const filteredExternalMatches = enrichedExternalMatches.filter(
                    m => !isBlockedTournamentId(m.tournamentId)
                );
                if (trace) {
                    addDurationMetric(trace.metrics, 'dedupe_matches_ms', Date.now() - dedupeExternalStartedAt);
                }
                const mergeFilteredExternalStartedAt = Date.now();
                enrichedMatches = [...enrichedMatches, ...filteredExternalMatches];
                if (trace) {
                    addDurationMetric(trace.metrics, 'merge_sources_ms', Date.now() - mergeFilteredExternalStartedAt);
                }
                fsOk = true;
                fsCount = filteredExternalMatches.length;
                mergedItemsCount = enrichedMatches.length;
                fsReason = fsCount === 0 ? 'empty_result' : null;
                fsMessage = fsCount === 0 ? 'No hay partidos de FlashScore para este filtro.' : null;
                console.log(`[matches] FlashScore: ${fsCount} matches for date=${date}`);

                if (mergedExternalMatches && mergedExternalMatches.length > 0) {
                    const persistKey = buildExternalPersistKey(params, 'daily');
                    if (shouldPersistExternalCatalog(persistKey)) {
                        persistFromExternalMatches(mergedExternalMatches, sport || 'rugby');
                        // The provider has no search endpoint, so this feed is where the
                        // searchable catalog of external tournaments comes from.
                        void recordExternalTournamentsFromMatches(mergedExternalMatches, sport || 'rugby');
                    }

                    // Write-through: la reparación deja la fecha en la caché para
                    // que el próximo request se resuelva DB-first sin gastar otro
                    // request del proveedor.
                    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
                        void (async () => {
                            try {
                                const rows = mergedExternalMatches.map((m) => mapFlashScoreMatchToCached(m, sport || 'rugby'));
                                await upsertMatches(rows, createAdminClient());
                            } catch (writeThroughErr) {
                                console.warn('[matches] write-through a external_match_cache falló:', writeThroughErr);
                            }
                        })();
                    }
                }
                } // end repair path (FlashScore)
            } catch (e) {
                console.error('External section processing failed:', e);
                fsReason = 'flashscore_processing_failed';
                fsMessage = 'No se pudo procesar la respuesta de FlashScore.';
            }
        }

        // ─── Supabase DB Matches ─────────────────────────────────────────────
        // Always fetch matches stored in the database (created via admin panel)
        // and merge them with external (FlashScore) matches.
        try {
            const dbResult = await dbMatchesPromise;
            dbOk = dbResult.ok;
            dbReason = dbResult.reason;
            dbMessage = dbResult.message;
            supabaseItemsCount = dbResult.count;

            if (dbResult.ok) {
                const dedupeDbStartedAt = Date.now();
                const existingIds = new Set(enrichedMatches.map((m: any) => m.id));
                if (trace) {
                    addDurationMetric(trace.metrics, 'dedupe_matches_ms', Date.now() - dedupeDbStartedAt);
                }
                const enrichedDbMatches = dbResult.matches.filter((match) => !existingIds.has(match.id));

                const mergeDbStartedAt = Date.now();
                enrichedMatches = [...enrichedMatches, ...enrichedDbMatches];
                if (trace) {
                    addDurationMetric(trace.metrics, 'merge_sources_ms', Date.now() - mergeDbStartedAt);
                }
                dbCount = enrichedDbMatches.length;
                mergedItemsCount = enrichedMatches.length;
                dbReason = dbCount === 0 ? 'empty_result' : null;
                dbMessage = dbCount === 0 ? 'No hay partidos en base de datos para este filtro.' : null;
                console.log(`[matches] Supabase: ${dbCount} matches (fallback=${dbFallback})`);
            }
        } catch (dbFetchError) {
            console.error('Supabase DB matches fetch failed (non-fatal):', dbFetchError);
            dbReason = 'database_fetch_failed';
            dbMessage = 'No se pudieron cargar los partidos desde la base de datos.';
            // Non-fatal: FlashScore data still available
            if (trace) {
                trace.metrics.supabase_matches_read_ms = trace.metrics.supabase_matches_read_ms || 0;
                trace.metrics.supabase_read_time_ms = trace.metrics.supabase_read_time_ms || 0;
            }
        }

        // ─── Date Filter ─────────────────────────────────────────────────────
        // Always use timezone-aware comparison so that
        // e.g. 00:00 UTC correctly maps to 21:00 previous day in UTC-3.
        const buildPayloadStartedAt = Date.now();
        enrichedMatches = await applyStoredTournamentOverridesToMatches(enrichedMatches);

        if (date) {
            enrichedMatches = enrichedMatches.filter(m => {
                const dt = new Date(m.dateTime);
                if (Number.isNaN(dt.getTime())) return false;
                return formatDateKey(dt, timeZone) === date;
            });
        }

        // Un partido que vive en las dos fuentes es UN partido.
        const antesDePlegar = enrichedMatches.length;
        enrichedMatches = dedupeCrossSourceMatches(enrichedMatches);
        if (antesDePlegar !== enrichedMatches.length) {
            console.log(`[matches] plegados ${antesDePlegar - enrichedMatches.length} duplicados entre fuentes`);
        }

        // Final sort by date_time
        const sortStartedAt = Date.now();
        enrichedMatches.sort((a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime());
        if (trace) {
            trackDuration(trace.metrics, 'sort_matches_ms', sortStartedAt);
        }

        console.log(`[matches] Final after filter (${date ?? 'no-date'}): ${enrichedMatches.length} total (fs=${fsCount}, db=${dbCount})`);

        finalItemsCount = enrichedMatches.length;
        mergedItemsCount = mergedItemsCount || enrichedMatches.length;
        const payload = {
            data: enrichedMatches,
            sources: {
                flashscore: { ok: fsOk, count: fsCount, fromCache: fsFromCache, reason: fsReason, message: fsMessage },
                supabase: { ok: dbOk, count: dbCount, fallback: dbFallback, reason: dbReason, message: dbMessage }
            }
        };
        if (trace) {
            trackDuration(trace.metrics, 'build_payload_ms', buildPayloadStartedAt);
            trace.metrics.compute_total_ms = Date.now() - computeStartedAt;
            logSlowComputeStageWarnings(trace);
            logMatchesEvent('info', 'matches_compute_summary', trace, {
                external_items_count: externalItemsCount,
                supabase_items_count: supabaseItemsCount,
                merged_items_count: mergedItemsCount,
                final_items_count: finalItemsCount,
            });
        }
        return payload;
    } catch (error) {
        console.error('Fatal API Error [computeMatchesPayload]:', error);
        if (trace) {
            trace.metrics.compute_total_ms = Date.now() - computeStartedAt;
            logMatchesEvent('error', 'matches_compute_failed', trace, {
                error: String(error),
                external_items_count: externalItemsCount,
                supabase_items_count: supabaseItemsCount,
                merged_items_count: mergedItemsCount,
                final_items_count: finalItemsCount,
            });
        }
        throw error;
    }
}

export async function GET(request: Request) {
    const requestStartedAt = Date.now();
    const params = normalizeMatchesRequest(request);
    const cacheKey = buildMatchesCacheKey(params);
    const trace: MatchesTraceContext = {
        requestId: createTraceId('req'),
        cacheKey,
        params,
        metrics: {},
    };
    const responseCacheOptions = {
        liveOnly: params.liveOnly,
        date: params.date,
        useExternal: params.useExternal,
    };
    const canServeStale = shouldServeStaleMatchesFeed(params);

    const memoryLookupStartedAt = Date.now();
    const cacheState = readMatchesResponseCache(cacheKey);
    trackDuration(trace.metrics, 'memory_cache_lookup_ms', memoryLookupStartedAt);

    if (cacheState.state === 'fresh' && cacheState.entry) {
        const serializeStartedAt = Date.now();
        const response = jsonWithPublicCache(cacheState.entry.payload, responseCacheOptions);
        trackDuration(trace.metrics, 'serialize_response_ms', serializeStartedAt);
        finalizeRequestMetrics(trace, requestStartedAt);
        attachObservabilityHeaders(response, trace, 'HIT');
        logMatchesEvent('info', 'matches_cache_hit', trace, { cache_status: 'HIT' });
        return response;
    }

    if (cacheState.state === 'stale' && cacheState.entry && canServeStale) {
        void refreshMatchesResponseCache(cacheKey, params, trace.requestId);
        const serializeStartedAt = Date.now();
        const response = jsonWithPublicCache(cacheState.entry.payload, responseCacheOptions);
        trackDuration(trace.metrics, 'serialize_response_ms', serializeStartedAt);
        finalizeRequestMetrics(trace, requestStartedAt);
        attachObservabilityHeaders(response, trace, 'STALE');
        logMatchesEvent('info', 'matches_cache_stale', trace, { cache_status: 'STALE' });
        return response;
    } else if (cacheState.state === 'stale' && cacheState.entry) {
        logMatchesEvent('info', 'matches_cache_stale_bypassed', trace, { cache_status: 'STALE-BYPASS' });
    }

    try {
        if (shouldUsePersistedFeedCache(params)) {
            const readClient = await getReadClient();
            const persistedLookupStartedAt = Date.now();
            const persistedSnapshot = await readUsableMatchesFeedSnapshot<MatchesPayload>(
                readClient,
                cacheKey,
                new Date().toISOString(),
            );
            const persistedLookupMs = trackDuration(trace.metrics, 'persisted_cache_lookup_ms', persistedLookupStartedAt);
            if (persistedLookupMs > 300) {
                logMatchesEvent('warn', 'matches_slow_persisted_lookup', trace, { threshold_ms: 300 });
            }

            if (persistedSnapshot) {
                const persistedState = getMatchesFeedState(
                    persistedSnapshot.generatedAt,
                    persistedSnapshot.expiresAt,
                    params,
                    persistedSnapshot.staleUntil,
                );
                trace.metrics.persisted_payload_bytes = persistedSnapshot.payloadSizeBytes || 0;

                if (persistedState.state === 'fresh') {
                    writeMatchesResponseCache(cacheKey, persistedSnapshot.payload, params, persistedState.createdAt);
                    const serializeStartedAt = Date.now();
                    const response = jsonWithPublicCache(persistedSnapshot.payload, responseCacheOptions);
                    trackDuration(trace.metrics, 'serialize_response_ms', serializeStartedAt);
                    finalizeRequestMetrics(trace, requestStartedAt);
                    attachObservabilityHeaders(response, trace, 'PERSISTED-HIT');
                    logMatchesEvent('info', 'matches_cache_persisted_hit', trace, { cache_status: 'PERSISTED-HIT', persisted_snapshot_state: 'fresh' });
                    return response;
                }

                if (persistedState.state === 'stale' && canServeStale) {
                    writeMatchesResponseCache(cacheKey, persistedSnapshot.payload, params, persistedState.createdAt);
                    void refreshMatchesResponseCache(cacheKey, params, trace.requestId);
                    const serializeStartedAt = Date.now();
                    const response = jsonWithPublicCache(persistedSnapshot.payload, responseCacheOptions);
                    trackDuration(trace.metrics, 'serialize_response_ms', serializeStartedAt);
                    finalizeRequestMetrics(trace, requestStartedAt);
                    attachObservabilityHeaders(response, trace, 'PERSISTED-STALE');
                    logMatchesEvent('info', 'matches_cache_persisted_stale', trace, { cache_status: 'PERSISTED-STALE', persisted_snapshot_state: 'stale' });
                    return response;
                } else if (persistedState.state === 'stale') {
                    logMatchesEvent('info', 'matches_cache_persisted_stale_bypassed', trace, {
                        cache_status: 'PERSISTED-STALE-BYPASS',
                        persisted_snapshot_state: 'stale',
                    });
                }
            }

            const persistedMetaStartedAt = Date.now();
            const persistedSnapshotMeta = await readMatchesFeedSnapshotMetadata(readClient, cacheKey);
            if (persistedSnapshotMeta) {
                trackDuration(trace.metrics, 'persisted_metadata_recheck_ms', persistedMetaStartedAt);
                trace.metrics.persisted_payload_bytes = persistedSnapshotMeta.payloadSizeBytes || 0;
                logMatchesEvent('info', 'matches_cache_persisted_expired', trace, {
                    cache_status: 'EXPIRED',
                    persisted_snapshot_state: 'expired',
                });
            }
        }

        const payload = await getOrComputeMatchesPayload(cacheKey, params, trace);
        const serializeStartedAt = Date.now();
        const response = jsonWithPublicCache(payload, responseCacheOptions);
        trackDuration(trace.metrics, 'serialize_response_ms', serializeStartedAt);
        finalizeRequestMetrics(trace, requestStartedAt);
        attachObservabilityHeaders(response, trace, 'MISS');
        logMatchesEvent('info', 'matches_cache_miss', trace, { cache_status: 'MISS' });
        return response;
    } catch (error) {
        console.error('Fatal API Error [GET /api/matches]:', error);
        finalizeRequestMetrics(trace, requestStartedAt);
        logMatchesEvent('error', 'matches_request_failed', trace, { error: String(error) });
        const response = NextResponse.json({ error: 'Internal Server Error', details: String(error) }, { status: 500 });
        attachObservabilityHeaders(response, trace, 'ERROR');
        return response;
    }
}


// POST /api/matches
// Create a new match
export async function POST(request: Request) {
    try {
        try {
            await requireAdminApiUser();
        } catch {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const supabase = process.env.SUPABASE_SERVICE_ROLE_KEY
            ? createAdminClient()
            : await createClient();

        const body = await request.json();

        const {
            tournamentId,
            phaseId,
            roundId,
            sportId,
            homeClubId,
            awayClubId,
            homeSquadId,
            awaySquadId,
            category,
            dateTime,
            venue,
            status,
            notes,
        } = body;
        const normalizedRoundId = isUuidLike(roundId) ? roundId : null;

        // These values end up in uuid columns / filters: reject malformed ids early.
        const uuidFields: Array<[string, unknown]> = [
            ['tournamentId', tournamentId],
            ['phaseId', phaseId],
            ['homeSquadId', homeSquadId],
            ['awaySquadId', awaySquadId],
        ];
        for (const [fieldName, fieldValue] of uuidFields) {
            if (fieldValue !== undefined && fieldValue !== null && fieldValue !== '' && !isUuidLike(fieldValue)) {
                return NextResponse.json(
                    { error: `${fieldName} must be a valid UUID` },
                    { status: 400 }
                );
            }
        }

        const normalizedSportId = normalizeSportValue(sportId ?? body.sport ?? null);
        const normalizedRoundLabel = typeof body.roundLabel === 'string' && body.roundLabel.trim()
            ? body.roundLabel.trim()
            : null;
        const normalizedWatchUrl = typeof body.watchUrl === 'string' && body.watchUrl.trim()
            ? body.watchUrl.trim()
            : (typeof body.streamUrl === 'string' && body.streamUrl.trim() ? body.streamUrl.trim() : null);
        // "Público" del alta (amistosos). Sin el campo, la columna queda en su default.
        const requestedVisibility: boolean | undefined = typeof body.isVisible === 'boolean'
            ? body.isVisible
            : (typeof body.isPublic === 'boolean' ? body.isPublic : undefined);

        // Validate required fields
        if (!homeClubId || !awayClubId) {
            return NextResponse.json(
                { error: 'Home and away clubs are required' },
                { status: 400 }
            );
        }

        if (homeClubId === awayClubId) {
            return NextResponse.json(
                { error: 'Home and away clubs must be different' },
                { status: 400 }
            );
        }

        if (!dateTime) {
            return NextResponse.json({ error: 'Date and time are required' }, { status: 400 });
        }

        if (!venue) {
            return NextResponse.json({ error: 'Venue is required' }, { status: 400 });
        }

        // Get tournament_id if roundId is provided
        let finalTournamentId = tournamentId;
        if (normalizedRoundId && !finalTournamentId) {
            const { data: round } = await supabase
                .from('tournament_rounds')
                .select('phase_id, tournament_phases(tournament_id)')
                .eq('id', normalizedRoundId)
                .single();

            if (round && round.tournament_phases) {
                const rawPhase = Array.isArray(round.tournament_phases)
                    ? round.tournament_phases[0]
                    : round.tournament_phases;
                const resolvedTournamentId = (rawPhase as { tournament_id?: unknown } | undefined)?.tournament_id;
                if (isUuidLike(resolvedTournamentId)) {
                    finalTournamentId = resolvedTournamentId;
                }
            }

            if (!finalTournamentId) {
                return NextResponse.json(
                    { error: 'Could not resolve a valid tournament for the provided round' },
                    { status: 400 }
                );
            }
        }

        if (!finalTournamentId && !normalizedSportId) {
            return NextResponse.json(
                { error: 'Sport is required for friendly matches' },
                { status: 400 }
            );
        }

        const [
            supportsRoundUuid,
            supportsRoundLabel,
            supportsReferee,
            supportsBroadcastUrl,
            supportsSportId,
            supportsSport,
            supportsHomeDivision,
            supportsAwayDivision,
            supportsCategory,
            supportsIsVisible,
        ] = await Promise.all([
            normalizedRoundId ? supportsMatchesColumn(supabase, 'round_uuid') : Promise.resolve(false),
            normalizedRoundLabel ? supportsMatchesColumn(supabase, 'round_label') : Promise.resolve(false),
            body.referee ? supportsMatchesColumn(supabase, 'referee') : Promise.resolve(false),
            normalizedWatchUrl ? supportsMatchesColumn(supabase, 'broadcast_url') : Promise.resolve(false),
            normalizedSportId ? supportsMatchesColumn(supabase, 'sport_id') : Promise.resolve(false),
            normalizedSportId ? supportsMatchesColumn(supabase, 'sport') : Promise.resolve(false),
            homeSquadId ? supportsMatchesColumn(supabase, 'home_division_id') : Promise.resolve(false),
            awaySquadId ? supportsMatchesColumn(supabase, 'away_division_id') : Promise.resolve(false),
            category ? supportsMatchesColumn(supabase, 'category') : Promise.resolve(false),
            typeof requestedVisibility === 'boolean' ? supportsMatchesColumn(supabase, 'is_visible') : Promise.resolve(false),
        ]);

        // Insert match
        // Only include columns that are confirmed in the database schema
        const matchPayload: any = {
            tournament_id: finalTournamentId || null,
            phase_id: phaseId || null,
            home_club_id: homeClubId,
            away_club_id: awayClubId,
            date_time: dateTime,
            venue,
            status: status || 'scheduled',
            score: { home: 0, away: 0 },
            notes: notes || null,
        };

        if (normalizedRoundId) {
            if (supportsRoundUuid) {
                matchPayload.round_uuid = normalizedRoundId;
            } else {
                matchPayload.round_id = normalizedRoundId;
            }
        }

        if (supportsRoundLabel) {
            matchPayload.round_label = normalizedRoundLabel;
        }

        if (supportsReferee) {
            matchPayload.referee = body.referee || null;
        }

        if (supportsBroadcastUrl) {
            matchPayload.broadcast_url = normalizedWatchUrl;
        }

        if (normalizedSportId) {
            if (supportsSportId) {
                matchPayload.sport_id = normalizedSportId;
            }
            if (supportsSport) {
                matchPayload.sport = normalizedSportId;
            }
        }

        if (supportsHomeDivision) {
            matchPayload.home_division_id = homeSquadId || null;
        }

        if (supportsAwayDivision) {
            matchPayload.away_division_id = awaySquadId || null;
        }

        if (supportsCategory) {
            matchPayload.category = typeof category === 'string' && category.trim() ? category.trim() : null;
        }

        if (supportsIsVisible && typeof requestedVisibility === 'boolean') {
            matchPayload.is_visible = requestedVisibility;
        }

        const { data: match, error: insertError } = await supabase
            .from('matches')
            .insert(matchPayload)
            .select(supportsBroadcastUrl ? 'id, broadcast_url' : 'id')
            .single();

        if (insertError) {
            console.error('Error creating match:', insertError);
            return NextResponse.json(
                { error: 'Failed to create match' },
                { status: 500 }
            );
        }

        return NextResponse.json(match, { status: 201 });
    } catch (error) {
        console.error('Unexpected error creating match:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
