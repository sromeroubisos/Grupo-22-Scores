import { NextResponse } from 'next/server';
import { db } from '@/lib/mock-db';
import { getFlashScoreMatches, getFlashScoreLiveMatches } from '@/lib/services/flashscore';
import { persistFromExternalMatches, persistFromExternalMatchesWithProvider } from '@/lib/sync/catalog';
import { formatDateKey, canonicalizeTimezone, toLocalMatch } from '@/lib/timezone';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminApiUser } from '@/lib/auth/apiAdmin';
import { getCountryById } from '@/lib/data/countries';
import { isFlashScoreEnabledForSport, isRugbySport } from '@/lib/externalProviderPolicy';
import { isMissingColumnError } from '@/lib/utils/supabaseSchema';
import { isBlockedTournamentId } from '@/lib/utils/blockedTournaments';
import {
    getMatchesForDate,
    getLiveMatches,
    mapCachedToEnrichedMatch,
    mapExternalMatchToCached,
    upsertMatches,
} from '@/lib/services/externalMatchCache';
import {
    getRugbyApiSportsGames,
    mapRugbyApiSportsStatus,
    toRugbyApiSportsTeamId,
    toRugbyApiSportsTournamentId,
    type RugbyApiSportsGame,
} from '@/lib/services/rugbyApiSports';

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
        case 'rugby-league': return ['rugby', 'rugby-league'];
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

    let lastError: { code?: string | null; message?: string | null; details?: string | null } | null = null;

    for (const columns of variants) {
        const result = await client
            .from(table)
            .select(columns)
            .in(idColumn, ids);

        if (!result.error) {
            return { data: (result.data as T[] | null) || [], error: null };
        }

        lastError = result.error;

        if (result.error.code !== 'PGRST204') {
            return { data: [] as T[], error: result.error };
        }
    }

    return { data: [] as T[], error: lastError };
}

async function getReadClient() {
    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
        return createAdminClient();
    }

    return createClient();
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
    season_id?: string | null;
    status?: string | null;
    is_visible?: boolean | null;
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
    if (!tournament) return true;
    if (tournament.is_visible === false) return false;

    const status = tournament.status?.toLowerCase?.() || null;
    if (!status) return true;

    return status !== 'archived' && status !== 'deleted';
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
                'id, name, sport_id, sport, season_id, status, country_id, union_id',
                'id, name, sport_id, sport, season_id, status, is_visible, country_id, union_id',
                'id, name, sport_id, sport, status, is_visible, country_id, union_id',
                'id, name, sport_id, status, is_visible, country_id, union_id',
                'id, name, sport, status, is_visible, country_id, union_id',
                'id, name, status, is_visible, country_id, union_id',
                'id, name, is_visible',
                'id, name'
            ]
        ),
        selectManyWithFallback<DbClubLite>(
            lookupClient,
            'clubs',
            'id',
            clubIds,
            [
                'id, name, short_name, logo_url, primary_color, sport_id, sport',
                'id, name, short_name, logo_url, primary_color, sport_id',
                'id, name, short_name, logo_url, primary_color, sport',
                'id, name, short_name, logo_url, primary_color',
                'id, name, short_name, logo_url, sport_id',
                'id, name, short_name, logo_url, sport',
                'id, name, short_name, logo_url',
                'id, name, logo_url, sport_id',
                'id, name, logo_url, sport',
                'id, name, logo_url',
                'id, name'
            ]
        ),
    ]);

    if (tournamentsRes.error) throw tournamentsRes.error;
    if (clubsRes.error) throw clubsRes.error;

    return {
        tournamentMap: new Map((tournamentsRes.data || []).map((t: any) => [t.id, t as DbTournamentLite])),
        clubMap: new Map((clubsRes.data || []).map((c: any) => [c.id, c as DbClubLite])),
    };
}

function buildPublicCacheHeaders(options: { liveOnly: boolean; date?: string | null }) {
    const headers = new Headers();

    if (options.liveOnly) {
        headers.set('Cache-Control', 'public, max-age=30, s-maxage=60, stale-while-revalidate=30');
        return headers;
    }

    if (options.date) {
        headers.set('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=60');
    }

    return headers;
}

function jsonWithPublicCache(payload: unknown, options: { liveOnly: boolean; date?: string | null }) {
    const headers = buildPublicCacheHeaders(options);
    return NextResponse.json(payload, headers.get('Cache-Control') ? { headers } : undefined);
}

function mapRugbyGameToEnrichedMatch(game: RugbyApiSportsGame, sport: string, timeZone: string) {
    const status = mapRugbyApiSportsStatus(game.status);
    const localDate = new Date(game.date);
    const { localTime } = toLocalMatch(localDate.toISOString(), timeZone);

    return {
        id: `ras-game-${game.id}`,
        tournamentId: toRugbyApiSportsTournamentId(game.league?.id || 'unknown'),
        dateTime: localDate.toISOString(),
        time: localTime,
        status,
        score: game.scores?.home != null || game.scores?.away != null
            ? { home: game.scores?.home ?? null, away: game.scores?.away ?? null }
            : null,
        clock: {
            running: status === 'live',
            seconds: 0,
            period: status === 'live' ? (game.status?.long || 'En Vivo') : (game.week || 'General'),
        },
        roundId: game.week || 'General',
        venue: '',
        homeClubId: game.teams?.home?.id ? toRugbyApiSportsTeamId(game.teams.home.id) : null,
        awayClubId: game.teams?.away?.id ? toRugbyApiSportsTeamId(game.teams.away.id) : null,
        homeTeam: {
            id: game.teams?.home?.id ? toRugbyApiSportsTeamId(game.teams.home.id) : null,
            name: game.teams?.home?.name || 'Local',
            logo: game.teams?.home?.logo || '',
            shortName: (game.teams?.home?.name || 'LOC').slice(0, 3).toUpperCase(),
        },
        awayTeam: {
            id: game.teams?.away?.id ? toRugbyApiSportsTeamId(game.teams.away.id) : null,
            name: game.teams?.away?.name || 'Visitante',
            logo: game.teams?.away?.logo || '',
            shortName: (game.teams?.away?.name || 'VIS').slice(0, 3).toUpperCase(),
        },
        tournament: {
            id: toRugbyApiSportsTournamentId(game.league?.id || 'unknown'),
            name: game.league?.name || 'Liga',
            sport,
            status: 'published' as const,
            country: game.country?.name || 'Internacional',
        },
        liveEnabled: status === 'live',
        source: 'rugby-api-sports' as const,
    };
}

function mapRugbyGameToCachedMatch(game: RugbyApiSportsGame, sport: string) {
    return mapExternalMatchToCached({
        id: `ras-game-${game.id}`,
        sport,
        tournamentId: toRugbyApiSportsTournamentId(game.league?.id || 'unknown'),
        tournamentName: game.league?.name || 'Liga',
        countryName: game.country?.name || 'Internacional',
        homeTeam: {
            id: game.teams?.home?.id ? toRugbyApiSportsTeamId(game.teams.home.id) : 'ras-team-home',
            name: game.teams?.home?.name || 'Local',
            logo: game.teams?.home?.logo || '',
            shortName: (game.teams?.home?.name || 'LOC').slice(0, 3).toUpperCase(),
        },
        awayTeam: {
            id: game.teams?.away?.id ? toRugbyApiSportsTeamId(game.teams.away.id) : 'ras-team-away',
            name: game.teams?.away?.name || 'Visitante',
            logo: game.teams?.away?.logo || '',
            shortName: (game.teams?.away?.name || 'VIS').slice(0, 3).toUpperCase(),
        },
        score: {
            home: game.scores?.home ?? null,
            away: game.scores?.away ?? null,
        },
        status: mapRugbyApiSportsStatus(game.status),
        dateTime: game.date,
        roundLabel: game.week || null,
    });
}

// GET /api/matches
// Parameters: 
// - date: YYYY-MM-DD
// - sport: 'rugby' | 'football' | ...
// - status: 'live' | 'scheduled' | ...
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const date = searchParams.get('date');
        const sport = searchParams.get('sport') || undefined;
        const status = searchParams.get('status');
        const rawTimeZone = searchParams.get('tz') || undefined;
        const timeZone = (() => {
            const tz = rawTimeZone || 'America/Argentina/Buenos_Aires';
            try {
                // Validate the timezone is recognized by Node.js
                new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
                return canonicalizeTimezone(tz);
            } catch {
                return 'America/Argentina/Buenos_Aires';
            }
        })();

        // Fast path: live=true returns only live matches (for polling)
        const liveOnly = searchParams.get('live') === 'true';
        if (liveOnly && sport && isRugbySport(sport)) {
            try {
                const todayKey = formatDateKey(new Date(), timeZone);
                const games = await getRugbyApiSportsGames({
                    date: todayKey,
                    timezone: timeZone,
                });

                const liveGames = games.filter((game) => mapRugbyApiSportsStatus(game.status) === 'live');
                const enrichedLive = liveGames.map((game) => mapRugbyGameToEnrichedMatch(game, sport, timeZone));

                if (liveGames.length > 0) {
                    const adminClient = process.env.SUPABASE_SERVICE_ROLE_KEY
                        ? createAdminClient()
                        : await createClient();
                    await upsertMatches(liveGames.map((game) => mapRugbyGameToCachedMatch(game, sport)), adminClient);
                }

                return jsonWithPublicCache({ data: enrichedLive }, { liveOnly: true });
            } catch (error) {
                console.error('Rugby live-only fetch failed, trying external_match_cache:', error);
                try {
                    const supabase = await getReadClient();
                    const cachedLive = await getLiveMatches(sport, supabase);
                    const enriched = cachedLive.map((match) => mapCachedToEnrichedMatch(match, sport));
                    return jsonWithPublicCache({
                        data: enriched,
                        sources: { flashscore: { ok: true, count: enriched.length, fromCache: cachedLive.length > 0 } }
                    }, { liveOnly: true });
                } catch {
                    return jsonWithPublicCache({ data: [] }, { liveOnly: true });
                }
            }
        }

        if (liveOnly && sport) {
            try {
                const liveMatches = await getFlashScoreLiveMatches(sport);
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
                        homeTeam: {
                            id: m.homeTeamId,
                            name: m.homeTeamName,
                            logo: m.homeTeamLogo || '',
                            shortName: m.homeTeamName?.substring(0, 3).toUpperCase() || 'LOC'
                        },
                        awayTeam: {
                            id: m.awayTeamId,
                            name: m.awayTeamName,
                            logo: m.awayTeamLogo || '',
                            shortName: m.awayTeamName?.substring(0, 3).toUpperCase() || 'VIS'
                        },
                        tournament: {
                            id: m.tournamentId,
                            name: (m as any).leagueName || 'Liga',
                            sport: sport as any,
                            status: 'published' as const,
                            country: (m as any).countryName || 'Internacional'
                        },
                        liveEnabled: true
                    };
                });
                if (liveMatches && liveMatches.length > 0) {
                    persistFromExternalMatches(liveMatches, sport);
                }

                let finalLiveMatches: any[] = [...enrichedLive];

                // Append DB live matches
                try {
                    const supabase = await getReadClient();
                    const { data: dbLiveMatches, error: dbError } = await supabase
                        .from('matches')
                        .select('*')
                        .eq('status', 'live');

                    if (!dbError && dbLiveMatches) {
                        const tournamentIds = [...new Set(dbLiveMatches.map((m: any) => m.tournament_id).filter(Boolean))];
                        const clubIds = [...new Set(dbLiveMatches.flatMap((m: any) => [m.home_club_id, m.away_club_id]).filter(Boolean))];
                        const { tournamentMap, clubMap } = await fetchDbLookupMaps(supabase, tournamentIds, clubIds);
                        const sportVariants = getSportVariants(sport);
                        const enrichedDbLive = dbLiveMatches.filter((m: any) => {
                            const tournament = tournamentMap.get(m.tournament_id);
                            const homeTeam = clubMap.get(m.home_club_id);
                            const awayTeam = clubMap.get(m.away_club_id);
                            if (!isTournamentPubliclyVisible(tournament)) return false;
                            const resolvedSport = resolveMatchSport(m, tournament, homeTeam, awayTeam);
                            return resolvedSport ? sportVariants.includes(resolvedSport) : false;
                        }).map((m: any) => {
                           const tournament = tournamentMap.get(m.tournament_id);
                           const homeTeam = clubMap.get(m.home_club_id);
                           const awayTeam = clubMap.get(m.away_club_id);
                           const resolvedSport = resolveMatchSport(m, tournament, homeTeam, awayTeam);
                           const { localTime } = toLocalMatch(m.date_time, timeZone);
                           return {
                                id: m.id,
                                tournamentId: m.tournament_id,
                                dateTime: m.date_time,
                                time: localTime,
                                status: m.status || 'scheduled',
                                score: m.status === 'scheduled' ? null : (m.score ?? null),
                                clock: { running: true, seconds: 0, period: 'En Vivo' },
                                roundId: m.round_label || m.round_id || 'General',
                                venue: m.venue || 'Sede',
                                homeClubId: m.home_club_id,
                                awayClubId: m.away_club_id,
                                homeTeam: homeTeam ? {
                                    id: homeTeam.id,
                                    name: homeTeam.name,
                                    logo: homeTeam.logo_url || '',
                                    shortName: homeTeam.short_name || homeTeam.name?.substring(0, 3).toUpperCase() || 'LOC'
                                } : { id: m.home_club_id, name: 'Local', logo: '', shortName: 'LOC' },
                                awayTeam: awayTeam ? {
                                    id: awayTeam.id,
                                    name: awayTeam.name,
                                    logo: awayTeam.logo_url || '',
                                    shortName: awayTeam.short_name || awayTeam.name?.substring(0, 3).toUpperCase() || 'VIS'
                                } : { id: m.away_club_id, name: 'Visitante', logo: '', shortName: 'VIS' },
                                tournament: tournament ? {
                                    id: tournament.id,
                                    name: tournament.name,
                                    sport: resolvedSport || tournament.sport_id || tournament.sport || null,
                                    status: tournament.status || 'published',
                                    country: resolveTournamentCountry(tournament)
                                } : { id: m.tournament_id || 'db-local', name: 'Partido Local', sport: resolvedSport, status: 'published', country: 'Internacional' },
                                liveEnabled: m.status === 'live',
                                source: 'db'
                           }
                        });
                        finalLiveMatches = [...finalLiveMatches, ...enrichedDbLive];
                    }
                } catch (dbErr) {
                    console.error('DB Live-only fetch failed:', dbErr);
                }

                return jsonWithPublicCache({ data: finalLiveMatches }, { liveOnly: true });
            } catch (e) {
                console.error('Live-only fetch failed, trying external_match_cache:', e);
                try {
                    const supabase = await getReadClient();
                    const cachedLive = await getLiveMatches(sport, supabase);
                    const enriched = cachedLive.map(m => mapCachedToEnrichedMatch(m, sport));
                    return jsonWithPublicCache({
                        data: enriched,
                        sources: { flashscore: { ok: false, count: 0, fromCache: cachedLive.length > 0 } }
                    }, { liveOnly: true });
                } catch {
                    return jsonWithPublicCache({ data: [] }, { liveOnly: true });
                }
            }
        }

        // formatDateKey is imported from @/lib/timezone - uses Intl when
        // timeZone is provided, falls back to UTC otherwise.

        // External API Integration
        const useExternal = searchParams.get('external') === 'true';

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

        if (!useExternal) {
            let matches = db.matches;

            // Filter by Status
            if (status) {
                matches = matches.filter(m => m.status === status);
            }

            // Enrich data (join relationships)
            enrichedMatches = matches.map(m => {
                const home = db.clubs.find(c => c.id === m.homeClubId);
                const away = db.clubs.find(c => c.id === m.awayClubId);
                const tournament = db.tournaments.find(t => t.id === m.tournamentId);

                return {
                    ...m,
                    homeTeam: {
                        id: home?.id,
                        name: home?.name,
                        logo: home?.logoUrl,
                        shortName: home?.shortName
                    },
                    awayTeam: {
                        id: away?.id,
                        name: away?.name,
                        logo: away?.logoUrl,
                        shortName: away?.shortName
                    },
                    tournament: {
                        id: tournament?.id,
                        name: tournament?.name,
                        sport: tournament?.sport,
                        status: tournament?.status
                    }
                };
            });

            // Filter by Sport (needs enriched data to know the sport)
            if (sport) {
                enrichedMatches = enrichedMatches.filter(m => m.tournament?.sport === sport);
            }

            // Filter public visibility (only published tournaments)
            enrichedMatches = enrichedMatches.filter(m => m.tournament?.status === 'published' || m.id.startsWith('ext-') || m.id.startsWith('fs-'));
        }

        const flashScoreEnabledForRequestedSport = isFlashScoreEnabledForSport(sport || 'rugby');

        if (useExternal && date && sport && isRugbySport(sport)) {
            try {
                const games = await getRugbyApiSportsGames({
                    date,
                    timezone: timeZone,
                });

                const enrichedExternalMatches = games.map((game) => mapRugbyGameToEnrichedMatch(game, sport, timeZone));
                const filteredRugbyMatches = enrichedExternalMatches.filter(
                    m => !isBlockedTournamentId(m.tournamentId)
                );
                enrichedMatches = [...enrichedMatches, ...filteredRugbyMatches];
                fsOk = true;
                fsCount = filteredRugbyMatches.length;
                fsReason = fsCount === 0 ? 'empty_result' : null;
                fsMessage = fsCount === 0 ? 'No hay partidos externos para este filtro.' : null;

                if (games.length > 0) {
                    const adminClient = process.env.SUPABASE_SERVICE_ROLE_KEY
                        ? createAdminClient()
                        : await createClient();
                    await upsertMatches(games.map((game) => mapRugbyGameToCachedMatch(game, sport)), adminClient);

                    persistFromExternalMatchesWithProvider(
                        games.map((game) => ({
                            tournamentId: game.league?.id ? toRugbyApiSportsTournamentId(game.league.id) : undefined,
                            leagueId: game.league?.id ? String(game.league.id) : undefined,
                            leagueName: game.league?.name || 'Liga',
                            countryName: game.country?.name || 'Internacional',
                            seasonId: game.league?.season ? String(game.league.season) : undefined,
                            homeTeamId: game.teams?.home?.id ? toRugbyApiSportsTeamId(game.teams.home.id) : undefined,
                            awayTeamId: game.teams?.away?.id ? toRugbyApiSportsTeamId(game.teams.away.id) : undefined,
                            homeTeamName: game.teams?.home?.name || 'Local',
                            awayTeamName: game.teams?.away?.name || 'Visitante',
                            homeTeamLogo: game.teams?.home?.logo || '',
                            awayTeamLogo: game.teams?.away?.logo || '',
                            tournamentLogo: game.league?.logo || '',
                        })),
                        sport,
                        {
                            provider: 'rugby-api-sports',
                            tournamentPrefix: 'ras-league-',
                            teamPrefix: 'ras-team-',
                        },
                    );
                }
            } catch (error) {
                console.error('Rugby external section failed:', error);
                try {
                    const supabaseForCache = await getReadClient();
                    const cached = await getMatchesForDate(date, sport, supabaseForCache);
                    if (cached.length > 0) {
                        const fromCache = cached.map((match) => mapCachedToEnrichedMatch(match, sport));
                        enrichedMatches = [...enrichedMatches, ...fromCache];
                        fsOk = true;
                        fsFromCache = true;
                        fsCount = fromCache.length;
                        fsReason = 'rugby_api_sports_cache_fallback';
                        fsMessage = 'Datos externos desde cache; puede haber un leve retraso.';
                    } else {
                        fsReason = 'rugby_api_sports_failed';
                        fsMessage = 'No se pudieron cargar los partidos externos de rugby.';
                    }
                } catch {
                    fsReason = 'rugby_api_sports_failed';
                    fsMessage = 'No se pudieron cargar los partidos externos de rugby.';
                }
            }
        } else if (useExternal && date && flashScoreEnabledForRequestedSport) {
            try {
                // Fix: Parse YYYY-MM-DD as local date to avoid UTC timezone shift
                const [year, month, day] = date.split('-').map(Number);
                const localDate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));

                // Check if date is today for live updates (user timezone aware when provided)
                const todayKey = formatDateKey(new Date(), timeZone);
                const isToday = date === todayKey;

                // Track whether FlashScore API actually failed (vs returned 0 results)
                let fsFetchFailed = false;

                // Parallel fetch if today, otherwise just list
                const [externalMatches, liveMatches] = await Promise.all([
                    getFlashScoreMatches(localDate, sport || 'rugby', {
                        timeZone,
                        targetDateKey: date || undefined
                    }).catch(e => {
                        console.warn('[matches] FlashScore fetch failed - trying cache', e?.message);
                        fsFetchFailed = true;
                        fsReason = 'flashscore_fetch_failed';
                        fsMessage = 'No se pudieron cargar los partidos desde FlashScore.';
                        return [];
                    }),
                    isToday ? getFlashScoreLiveMatches(sport || 'rugby').catch(e => {
                        console.warn('[matches] FlashScore live fetch failed', e?.message);
                        return [];
                    }) : Promise.resolve([])
                ]);

                // ── Cache fallback when FlashScore is unavailable ─────────────
                if (fsFetchFailed) {
                    try {
                        const supabaseForCache = await getReadClient();
                        const cached = await getMatchesForDate(date, sport || 'rugby', supabaseForCache);
                        if (cached.length > 0) {
                            const fromCache = cached.map(m => mapCachedToEnrichedMatch(m, sport || 'rugby'));
                            enrichedMatches = [...enrichedMatches, ...fromCache];
                            fsOk = false;
                            fsFromCache = true;
                            fsCount = fromCache.length;
                            fsReason = 'flashscore_cache_fallback';
                            fsMessage = 'Datos de FlashScore desde caché; puede haber un leve retraso.';
                            console.log(`[matches] FlashScore cache fallback: ${fsCount} matches for date=${date}`);
                        }
                    } catch (cacheErr) {
                        console.warn('[matches] Cache fallback also failed:', cacheErr);
                    }
                    // Skip the rest of the FlashScore enrichment path
                }

                if (!fsFetchFailed) {
                // Merge live data into list
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
                        homeTeam: {
                            id: m.homeTeamId,
                            name: m.homeTeamName,
                            logo: m.homeTeamLogo || '',
                            shortName: m.homeTeamName?.substring(0, 3).toUpperCase() || 'LOC'
                        },
                        awayTeam: {
                            id: m.awayTeamId,
                            name: m.awayTeamName,
                            logo: m.awayTeamLogo || '',
                            shortName: m.awayTeamName?.substring(0, 3).toUpperCase() || 'VIS'
                        },
                        tournament: {
                            id: m.tournamentId,
                            name: (m as any).leagueName || 'Liga (EXT)',
                            sport: (sport || 'rugby') as any,
                            status: 'published' as const,
                            country: (m as any).countryName || 'Internacional'
                        },
                        liveEnabled: false
                    };
                });

                const filteredExternalMatches = enrichedExternalMatches.filter(
                    m => !isBlockedTournamentId(m.tournamentId)
                );
                enrichedMatches = [...enrichedMatches, ...filteredExternalMatches];
                fsOk = true;
                fsCount = filteredExternalMatches.length;
                fsReason = fsCount === 0 ? 'empty_result' : null;
                fsMessage = fsCount === 0 ? 'No hay partidos de FlashScore para este filtro.' : null;
                console.log(`[matches] FlashScore: ${fsCount} matches for date=${date}`);

                if (mergedExternalMatches && mergedExternalMatches.length > 0) {
                    persistFromExternalMatches(mergedExternalMatches, sport || 'rugby');
                }
                } // end if (!fsFetchFailed)
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
            const supabase = await getReadClient();

            // Build the base query for the selected date
            const { localStart, localEnd } = (() => {
                // date is YYYY-MM-DD. We want the full range of that day in UTC for the DB query.
                // However, since we use TIMESTAMPTZ, comparing with string dates works well if they include the offset.
                // For simplicity, we use the date as-is which PostgreSQL interprets relative to UTC if no offset.
                return {
                    localStart: `${date}T00:00:00Z`,
                    localEnd: `${date}T23:59:59Z`
                };
            })();

            // Filter by sport through tournament relationship
            const sportVariants = sport ? getSportVariants(sport) : null;

            const query = supabase
                .from('matches')
                .select('*')
                .gte('date_time', localStart)
                .lte('date_time', localEnd)
                .order('date_time', { ascending: true });

            const { data: dbMatches, error: dbError } = await query;

            if (!dbError && dbMatches) {
                const tournamentIds = [...new Set(dbMatches.map((m: any) => m.tournament_id).filter(Boolean))];
                const clubIds = [...new Set(dbMatches.flatMap((m: any) => [m.home_club_id, m.away_club_id]).filter(Boolean))];
                const { tournamentMap, clubMap } = await fetchDbLookupMaps(supabase, tournamentIds, clubIds);

                dbOk = true;
                const existingIds = new Set(enrichedMatches.map((m: any) => m.id));

                const enrichedDbMatches = dbMatches
                    .filter((m: any) => {
                        if (existingIds.has(m.id)) return false;
                        const tournament = tournamentMap.get(m.tournament_id);
                        const homeTeam = clubMap.get(m.home_club_id);
                        const awayTeam = clubMap.get(m.away_club_id);
                        if (!isTournamentPubliclyVisible(tournament)) return false;
                        if (!sportVariants) return true;
                        const resolvedSport = resolveMatchSport(m, tournament, homeTeam, awayTeam);
                        return resolvedSport ? sportVariants.includes(resolvedSport) : false;
                    })
                    .map((m: any) => {
                        const tournament = tournamentMap.get(m.tournament_id);
                        const homeTeam = clubMap.get(m.home_club_id);
                        const awayTeam = clubMap.get(m.away_club_id);
                        const resolvedSport = resolveMatchSport(m, tournament, homeTeam, awayTeam);
                        const { localTime } = toLocalMatch(m.date_time, timeZone);
                        return {
                            id: m.id,
                            tournamentId: m.tournament_id,
                            dateTime: m.date_time,
                            time: localTime,
                            status: m.status || 'scheduled',
                            score: m.status === 'scheduled' ? null : (m.score ?? null),
                            clock: {
                                running: m.status === 'live',
                                seconds: 0,
                                period: m.status === 'live' ? 'En Vivo' : (m.status === 'final' ? 'Final' : '1T')
                            },
                            roundId: m.round_label || m.round_id || 'General',
                            venue: m.venue || 'Sede',
                            homeClubId: m.home_club_id,
                            awayClubId: m.away_club_id,
                            homeTeam: homeTeam ? {
                                id: homeTeam.id,
                                name: homeTeam.name,
                                logo: homeTeam.logo_url || '',
                                shortName: homeTeam.short_name || homeTeam.name?.substring(0, 3).toUpperCase() || 'LOC'
                            } : {
                                id: m.home_club_id,
                                name: 'Local',
                                logo: '',
                                shortName: 'LOC'
                            },
                            awayTeam: awayTeam ? {
                                id: awayTeam.id,
                                name: awayTeam.name,
                                logo: awayTeam.logo_url || '',
                                shortName: awayTeam.short_name || awayTeam.name?.substring(0, 3).toUpperCase() || 'VIS'
                            } : {
                                id: m.away_club_id,
                                name: 'Visitante',
                                logo: '',
                                shortName: 'VIS'
                            },
                            tournament: tournament ? {
                                id: tournament.id,
                                name: tournament.name,
                                sport: resolvedSport || tournament.sport_id || tournament.sport || null,
                                status: tournament.status || 'published',
                                country: resolveTournamentCountry(tournament)
                            } : {
                                id: m.tournament_id || 'db-local',
                                name: 'Partido Local',
                                sport: resolvedSport,
                                status: 'published',
                                country: 'Internacional'
                            },
                            liveEnabled: false,
                            source: 'db' // Mark as database-sourced
                        };
                    });

                enrichedMatches = [...enrichedMatches, ...enrichedDbMatches];
                dbCount = enrichedDbMatches.length;
                dbReason = dbCount === 0 ? 'empty_result' : null;
                dbMessage = dbCount === 0 ? 'No hay partidos en base de datos para este filtro.' : null;
                console.log(`[matches] Supabase: ${dbCount} matches (fallback=${dbFallback})`);
            } else if (dbError) {
                dbReason = 'database_query_failed';
                dbMessage = 'No se pudieron cargar los partidos desde la base de datos.';
                console.error('[matches] Supabase query failed:', JSON.stringify(dbError));
                if (process.env.NODE_ENV === 'development') {
                    dbMessage = `Supabase error: ${dbError.message} | code: ${dbError.code} | details: ${dbError.details}`;
                }
            }
        } catch (dbFetchError) {
            console.error('Supabase DB matches fetch failed (non-fatal):', dbFetchError);
            dbReason = 'database_fetch_failed';
            dbMessage = 'No se pudieron cargar los partidos desde la base de datos.';
            // Non-fatal: FlashScore data still available
        }

        // ─── Date Filter ─────────────────────────────────────────────────────
        // Always use timezone-aware comparison so that
        // e.g. 00:00 UTC correctly maps to 21:00 previous day in UTC-3.
        if (date) {
            enrichedMatches = enrichedMatches.filter(m => {
                const dt = new Date(m.dateTime);
                if (Number.isNaN(dt.getTime())) return false;
                return formatDateKey(dt, timeZone) === date;
            });
        }

        // Final sort by date_time
        enrichedMatches.sort((a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime());

        console.log(`[matches] Final after filter (${date ?? 'no-date'}): ${enrichedMatches.length} total (fs=${fsCount}, db=${dbCount})`);

        return jsonWithPublicCache({
            data: enrichedMatches,
            sources: {
                flashscore: { ok: fsOk, count: fsCount, fromCache: fsFromCache, reason: fsReason, message: fsMessage },
                supabase: { ok: dbOk, count: dbCount, fallback: dbFallback, reason: dbReason, message: dbMessage }
            }
        }, { liveOnly: false, date });
    } catch (error) {
        console.error('Fatal API Error [GET /api/matches]:', error);
        return NextResponse.json({ error: 'Internal Server Error', details: String(error) }, { status: 500 });
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
            dateTime,
            venue,
            status,
            notes,
        } = body;
        const normalizedRoundId = isUuidLike(roundId) ? roundId : null;
        const normalizedSportId = normalizeSportValue(sportId ?? body.sport ?? null);
        const normalizedRoundLabel = typeof body.roundLabel === 'string' && body.roundLabel.trim()
            ? body.roundLabel.trim()
            : null;
        const normalizedWatchUrl = typeof body.watchUrl === 'string' && body.watchUrl.trim()
            ? body.watchUrl.trim()
            : (typeof body.streamUrl === 'string' && body.streamUrl.trim() ? body.streamUrl.trim() : null);

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
                finalTournamentId = (round.tournament_phases as any).tournament_id;
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
        ] = await Promise.all([
            normalizedRoundId ? supportsMatchesColumn(supabase, 'round_uuid') : Promise.resolve(false),
            normalizedRoundLabel ? supportsMatchesColumn(supabase, 'round_label') : Promise.resolve(false),
            body.referee ? supportsMatchesColumn(supabase, 'referee') : Promise.resolve(false),
            normalizedWatchUrl ? supportsMatchesColumn(supabase, 'broadcast_url') : Promise.resolve(false),
            normalizedSportId ? supportsMatchesColumn(supabase, 'sport_id') : Promise.resolve(false),
            normalizedSportId ? supportsMatchesColumn(supabase, 'sport') : Promise.resolve(false),
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

        const { data: match, error: insertError } = await supabase
            .from('matches')
            .insert(matchPayload)
            .select(supportsBroadcastUrl ? 'id, broadcast_url' : 'id')
            .single();

        if (insertError) {
            console.error('Error creating match:', insertError);
            return NextResponse.json(
                { error: 'Failed to create match', details: insertError.message },
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


