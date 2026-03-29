import 'server-only';

import { memoryCache } from '@/lib/cache';
import type { Match, MatchStatus } from '@/types/match';

type QueryValue = string | number | null | undefined;

type RugbyApiSportsResponse<T> = {
    get: string;
    parameters: Record<string, string>;
    errors: unknown;
    results: number;
    response: T;
};

export type RugbyApiSportsCountry = {
    id: number;
    name: string;
    code?: string | null;
    flag?: string | null;
};

export type RugbyApiSportsLeague = {
    id: number;
    name: string;
    type?: string | null;
    logo?: string | null;
    country?: RugbyApiSportsCountry | null;
    seasons?: Array<{
        season: number;
        current?: boolean;
        start?: string | null;
        end?: string | null;
    }>;
};

export type RugbyApiSportsTeam = {
    id: number;
    name: string;
    logo?: string | null;
    national?: boolean;
    founded?: number | null;
    arena?: {
        name?: string | null;
        capacity?: number | null;
        location?: string | null;
    } | null;
    country?: RugbyApiSportsCountry | null;
};

export type RugbyApiSportsGame = {
    id: number;
    date: string;
    time?: string | null;
    timestamp: number;
    timezone?: string | null;
    week?: string | null;
    status?: {
        long?: string | null;
        short?: string | null;
    } | null;
    country?: RugbyApiSportsCountry | null;
    league?: {
        id: number;
        name: string;
        type?: string | null;
        logo?: string | null;
        season?: number | null;
    } | null;
    teams?: {
        home?: { id?: number | null; name?: string | null; logo?: string | null } | null;
        away?: { id?: number | null; name?: string | null; logo?: string | null } | null;
    } | null;
    scores?: {
        home?: number | null;
        away?: number | null;
    } | null;
    periods?: unknown;
};

export type RugbyApiSportsStandingsRow = {
    position: number;
    stage?: string | null;
    group?: { name?: string | null } | null;
    team?: { id?: number | null; name?: string | null; logo?: string | null } | null;
    league?: { id?: number | null; name?: string | null; season?: number | null } | null;
    country?: RugbyApiSportsCountry | null;
    games?: {
        played?: number | null;
        win?: { total?: number | null; percentage?: string | null } | null;
        draw?: { total?: number | null; percentage?: string | null } | null;
        lose?: { total?: number | null; percentage?: string | null } | null;
    } | null;
    goals?: {
        for?: number | null;
        against?: number | null;
    } | null;
    points?: number | null;
    form?: string | null;
    description?: string | null;
};

export type RugbyApiSportsTeamStatistics = {
    country?: RugbyApiSportsCountry | null;
    league?: { id?: number | null; name?: string | null; season?: number | null; logo?: string | null } | null;
    team?: { id?: number | null; name?: string | null; logo?: string | null } | null;
    games?: {
        played?: { home?: number | null; away?: number | null; all?: number | null } | null;
        wins?: { home?: { total?: number | null } | null; away?: { total?: number | null } | null; all?: { total?: number | null } | null } | null;
        draws?: { home?: { total?: number | null } | null; away?: { total?: number | null } | null; all?: { total?: number | null } | null } | null;
        loses?: { home?: { total?: number | null } | null; away?: { total?: number | null } | null; all?: { total?: number | null } | null } | null;
    } | null;
    goals?: {
        for?: { total?: { home?: number | null; away?: number | null; all?: number | null } | null } | null;
        against?: { total?: { home?: number | null; away?: number | null; all?: number | null } | null } | null;
    } | null;
};

const BASE_URL = process.env.RUGBY_API_SPORTS_BASE_URL || 'https://v1.rugby.api-sports.io';
const API_KEY = process.env.RUGBY_API_SPORTS_KEY || '';

const TTL = {
    games: 60,
    gameById: 60,
    standings: 60 * 60,
    h2h: 6 * 60 * 60,
    metadata: 24 * 60 * 60,
    teamStatistics: 60 * 60,
} as const;

const inflightRequests = new Map<string, Promise<any>>();

function ensureApiKey() {
    if (!API_KEY) {
        throw new Error('RUGBY_API_SPORTS_KEY is not configured');
    }
}

function normalizeErrorMessages(errors: unknown): string[] {
    if (!errors) return [];
    if (Array.isArray(errors)) {
        return errors.map((error) => String(error)).filter(Boolean);
    }
    if (typeof errors === 'object') {
        return Object.values(errors as Record<string, unknown>)
            .map((value) => String(value))
            .filter(Boolean);
    }
    return [String(errors)];
}

function buildUrl(pathname: string, query: Record<string, QueryValue>) {
    const url = new URL(pathname, BASE_URL.endsWith('/') ? BASE_URL : `${BASE_URL}/`);

    for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === null || value === '') continue;
        url.searchParams.set(key, String(value));
    }

    return url;
}

async function requestApi<T>(
    pathname: string,
    query: Record<string, QueryValue>,
    ttlSeconds: number
) {
    ensureApiKey();

    const url = buildUrl(pathname, query);
    const cacheKey = `rugby-api-sports:${url.toString()}`;
    const cached = memoryCache.get<RugbyApiSportsResponse<T>>(cacheKey);
    if (cached) return cached;

    const inflight = inflightRequests.get(cacheKey);
    if (inflight) {
        return inflight as Promise<RugbyApiSportsResponse<T>>;
    }

    const requestPromise = (async () => {
        const response = await fetch(url.toString(), {
            method: 'GET',
            headers: {
                'x-apisports-key': API_KEY,
            },
        });

        const payload = await response.json().catch(() => null);

        if (!response.ok) {
            throw new Error(
                `Rugby API-Sports request failed (${response.status}): ${typeof payload === 'object' && payload && 'message' in payload ? String((payload as any).message) : response.statusText}`
            );
        }

        const errors = normalizeErrorMessages(payload?.errors);
        if (errors.length > 0) {
            throw new Error(errors.join('; '));
        }

        memoryCache.set(cacheKey, payload, ttlSeconds);
        return payload as RugbyApiSportsResponse<T>;
    })().finally(() => {
        inflightRequests.delete(cacheKey);
    });

    inflightRequests.set(cacheKey, requestPromise);
    return requestPromise;
}

export function toRugbyApiSportsMatchId(matchId: string | number) {
    return `ras-game-${matchId}`;
}

export function parseRugbyApiSportsMatchId(matchId: string | null | undefined) {
    if (!matchId) return null;
    const match = /^ras-game-(\d+)$/i.exec(String(matchId).trim());
    return match ? match[1] : null;
}

export function toRugbyApiSportsTeamId(teamId: string | number) {
    return `ras-team-${teamId}`;
}

export function parseRugbyApiSportsTeamId(teamId: string | null | undefined) {
    if (!teamId) return null;
    const match = /^ras-team-(\d+)$/i.exec(String(teamId).trim());
    return match ? match[1] : null;
}

export function toRugbyApiSportsTournamentId(leagueId: string | number) {
    return `ras-league-${leagueId}`;
}

export function parseRugbyApiSportsTournamentId(tournamentId: string | null | undefined) {
    if (!tournamentId) return null;
    const match = /^ras-league-(\d+)$/i.exec(String(tournamentId).trim());
    return match ? match[1] : null;
}

export function mapRugbyApiSportsStatus(status: RugbyApiSportsGame['status']): MatchStatus {
    const short = String(status?.short || '').toUpperCase();

    if (['1H', '2H', 'HT', 'ET', 'BT', 'PT'].includes(short)) return 'live';
    if (['FT', 'AET', 'AW'].includes(short)) return 'final';
    if (['POST', 'INTR', 'ABD'].includes(short)) return 'postponed';
    if (short === 'CANC') return 'cancelled';
    return 'scheduled';
}

export function mapRugbyApiSportsGameToMatch(game: RugbyApiSportsGame, sport: string = 'rugby'): Match {
    const mappedStatus = mapRugbyApiSportsStatus(game.status);
    const home = game.teams?.home;
    const away = game.teams?.away;

    return {
        id: toRugbyApiSportsMatchId(game.id),
        tournamentId: toRugbyApiSportsTournamentId(game.league?.id || 'unknown'),
        phaseId: 'external',
        round: 1,
        homeTeamId: toRugbyApiSportsTeamId(home?.id || 'home'),
        homeTeamName: home?.name || 'Home Team',
        awayTeamId: toRugbyApiSportsTeamId(away?.id || 'away'),
        awayTeamName: away?.name || 'Away Team',
        homeTeamLogo: home?.logo || '',
        awayTeamLogo: away?.logo || '',
        scheduledAt: game.date ? new Date(game.date) : new Date(game.timestamp * 1000),
        venueName: undefined,
        status: mappedStatus,
        currentMinute: mappedStatus === 'live' ? (game.status?.long || 'Live') : undefined,
        score: {
            home: game.scores?.home ?? null,
            away: game.scores?.away ?? null,
        },
        result: {
            isComplete: mappedStatus === 'final',
            updatedAt: new Date(),
            updatedBy: 'rugby-api-sports',
            version: 1,
        },
        createdFrom: 'generator',
        createdAt: new Date(),
        updatedAt: new Date(),
        ...(Object.freeze({
            leagueName: game.league?.name || 'League',
            countryName: game.country?.name || 'International',
            leagueId: game.league?.id ? String(game.league.id) : null,
            seasonId: game.league?.season ? String(game.league.season) : null,
            roundLabel: game.week || null,
        }) as any),
    };
}

export async function getRugbyApiSportsSeasons() {
    const payload = await requestApi<number[]>('/seasons', {}, TTL.metadata);
    return payload.response || [];
}

export async function getRugbyApiSportsCountries(query: {
    id?: number | string;
    name?: string;
    code?: string;
    search?: string;
} = {}) {
    const payload = await requestApi<RugbyApiSportsCountry[]>('/countries', query, TTL.metadata);
    return payload.response || [];
}

export async function getRugbyApiSportsLeagues(query: {
    id?: number | string;
    name?: string;
    country_id?: number | string;
    country?: string;
    type?: string;
    season?: number | string;
    search?: string;
} = {}) {
    const payload = await requestApi<RugbyApiSportsLeague[]>('/leagues', query, TTL.metadata);
    return payload.response || [];
}

export async function getRugbyApiSportsTeams(query: {
    id?: number | string;
    name?: string;
    country_id?: number | string;
    country?: string;
    league?: number | string;
    season?: number | string;
    search?: string;
} = {}) {
    const payload = await requestApi<RugbyApiSportsTeam[]>('/teams', query, TTL.metadata);
    return payload.response || [];
}

export async function getRugbyApiSportsStandings(query: {
    league: number | string;
    season: number | string;
    team?: number | string;
    stage?: string;
    group?: string;
}) {
    const payload = await requestApi<RugbyApiSportsStandingsRow[][] | RugbyApiSportsStandingsRow[]>('/standings', query, TTL.standings);
    return payload.response || [];
}

export async function getRugbyApiSportsStandingsStages(query: {
    league: number | string;
    season: number | string;
}) {
    const payload = await requestApi<string[]>('/standings/stages', query, TTL.standings);
    return payload.response || [];
}

export async function getRugbyApiSportsStandingsGroups(query: {
    league: number | string;
    season: number | string;
}) {
    const payload = await requestApi<string[]>('/standings/groups', query, TTL.standings);
    return payload.response || [];
}

export async function getRugbyApiSportsGames(query: {
    id?: number | string;
    date?: string;
    league?: number | string;
    season?: number | string;
    team?: number | string;
    timezone?: string;
}) {
    const ttl = query.id ? TTL.gameById : TTL.games;
    const payload = await requestApi<RugbyApiSportsGame[]>('/games', query, ttl);
    return payload.response || [];
}

export async function getRugbyApiSportsGame(gameId: number | string, timezone?: string) {
    const games = await getRugbyApiSportsGames({ id: gameId, timezone });
    return games[0] || null;
}

export async function getRugbyApiSportsGamesH2H(query: {
    homeTeamId: number | string;
    awayTeamId: number | string;
    date?: string;
    league?: number | string;
    season?: number | string;
    timezone?: string;
}) {
    const payload = await requestApi<RugbyApiSportsGame[]>('/games/h2h', {
        h2h: `${query.homeTeamId}-${query.awayTeamId}`,
        date: query.date,
        league: query.league,
        season: query.season,
        timezone: query.timezone,
    }, TTL.h2h);
    return payload.response || [];
}

export async function getRugbyApiSportsTeamStatistics(query: {
    league: number | string;
    season: number | string;
    team: number | string;
    date?: string;
}) {
    const payload = await requestApi<RugbyApiSportsTeamStatistics>('/teams/statistics', query, TTL.teamStatistics);
    return payload.response || null;
}
