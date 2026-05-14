/**
 * Client for the Python SofaScore microservice (see /python-service).
 *
 * Used as the football-only replacement for FlashScore. Returns data in the
 * same shapes the rest of the codebase already expects, so call sites in
 * flashscore.ts can delegate by sport without further changes.
 *
 * Identifier prefixes:
 *   - matches: "ss-match-<id>"
 *   - teams:   "ss-team-<id>"
 *   - players: "ss-player-<id>"
 *   - tours:   "ss-tour-<id>"
 */

import { Match, MatchStatus } from '@/types/match';
import { memoryCache } from '@/lib/cache';
import { formatDateKey } from '@/lib/timezone';

const SERVICE_URL = (process.env.SOFASCORE_SERVICE_URL || process.env.NEXT_PUBLIC_SOFASCORE_SERVICE_URL || '').replace(/\/$/, '');
const SERVICE_TOKEN = process.env.SOFASCORE_SERVICE_TOKEN || '';

export const SOFASCORE_MATCH_PREFIX = 'ss-match-';
export const SOFASCORE_TEAM_PREFIX = 'ss-team-';
export const SOFASCORE_PLAYER_PREFIX = 'ss-player-';
export const SOFASCORE_TOURNAMENT_PREFIX = 'ss-tour-';

export function isSofaScoreId(value: unknown): value is string {
    if (typeof value !== 'string') return false;
    return (
        value.startsWith(SOFASCORE_MATCH_PREFIX)
        || value.startsWith(SOFASCORE_TEAM_PREFIX)
        || value.startsWith(SOFASCORE_PLAYER_PREFIX)
        || value.startsWith(SOFASCORE_TOURNAMENT_PREFIX)
    );
}

export function isSofaScoreServiceConfigured(): boolean {
    return SERVICE_URL.length > 0;
}

class SofaScoreServiceError extends Error {
    constructor(message: string, public status?: number) {
        super(message);
    }
}

async function fetchJson<T>(path: string, ttlSeconds: number, cacheKey: string): Promise<T | null> {
    if (!isSofaScoreServiceConfigured()) {
        return null;
    }

    const cached = memoryCache.get<T>(cacheKey);
    if (cached) return cached;

    const url = `${SERVICE_URL}${path}`;
    const headers: Record<string, string> = { 'accept': 'application/json' };
    if (SERVICE_TOKEN) headers['x-service-token'] = SERVICE_TOKEN;

    try {
        const res = await fetch(url, { headers, cache: 'no-store' });
        if (res.status === 404) return null;
        if (!res.ok) {
            throw new SofaScoreServiceError(`sofascore service ${res.status}`, res.status);
        }
        const json = (await res.json()) as T;
        memoryCache.set(cacheKey, json, ttlSeconds);
        return json;
    } catch (err) {
        if (err instanceof SofaScoreServiceError) throw err;
        throw new SofaScoreServiceError(`sofascore service fetch failed: ${(err as Error).message}`);
    }
}

// ---------- Raw payload shapes returned by the Python service ----------

interface SofaScoreEvent {
    match_id: string;
    home_team: { team_id: string; name: string; short_name?: string; small_image_path?: string; image_path?: string };
    away_team: { team_id: string; name: string; short_name?: string; small_image_path?: string; image_path?: string };
    scores: { home: number | null; away: number | null };
    event_final_result?: string;
    match_status: string;
    timestamp: number;
    tournament_id: string;
    tournament_name: string;
    country_name?: string | null;
    sport_id?: string;
    season_id?: number | null;
    season_name?: string | null;
}

interface SofaScoreTournamentGroup {
    tournament_id: string;
    name: string;
    country_name?: string | null;
    matches: SofaScoreEvent[];
}

interface SofaScoreMatchesPayload {
    DATA: SofaScoreTournamentGroup[];
    count: number;
}

// ---------- Status mapping ----------

function mapSofaStatus(raw: string): MatchStatus {
    const v = (raw || '').toLowerCase();
    if (!v) return 'scheduled';
    if (v === 'ns' || v.includes('not started') || v.includes('postpon') === false && v === 'scheduled') return 'scheduled';
    if (v === 'ft' || v.includes('full time') || v.includes('finished') || v.includes('final') || v === 'aet' || v === 'pen') return 'final';
    if (v === 'post' || v.includes('postpon')) return 'postponed';
    if (v === 'canc' || v.includes('cancel')) return 'cancelled';
    if (v === 'live' || v.includes('half') || v.includes('extra') || v.includes('break') || v.includes('penalty') || v === 'ht') return 'live';
    return 'scheduled';
}

function mapSofaEventToMatch(evt: SofaScoreEvent, leagueId: string, leagueName: string, countryName: string): Match {
    const status = mapSofaStatus(evt.match_status);
    const homeScore = evt.scores?.home ?? null;
    const awayScore = evt.scores?.away ?? null;
    const timestamp = evt.timestamp || 0;
    const scheduledAt = timestamp ? new Date(timestamp * 1000) : new Date();

    return {
        id: evt.match_id,
        tournamentId: evt.tournament_id || leagueId || `${SOFASCORE_TOURNAMENT_PREFIX}unknown`,
        leagueName,
        countryName,
        phaseId: 'group',
        round: 1,
        homeTeamId: evt.home_team?.team_id || `${SOFASCORE_TEAM_PREFIX}h`,
        homeTeamName: evt.home_team?.name || 'Home Team',
        awayTeamId: evt.away_team?.team_id || `${SOFASCORE_TEAM_PREFIX}a`,
        awayTeamName: evt.away_team?.name || 'Away Team',
        homeTeamLogo: evt.home_team?.image_path || evt.home_team?.small_image_path || '',
        awayTeamLogo: evt.away_team?.image_path || evt.away_team?.small_image_path || '',
        homeTeamImagePath: evt.home_team?.image_path || evt.home_team?.small_image_path || '',
        awayTeamImagePath: evt.away_team?.image_path || evt.away_team?.small_image_path || '',
        scheduledAt,
        status,
        score: { home: homeScore, away: awayScore },
        result: {
            isComplete: status === 'final',
            updatedAt: new Date(),
            updatedBy: 'sofascore',
            version: 1,
        },
        createdFrom: 'generator',
        createdAt: new Date(),
        updatedAt: new Date(),
    };
}

function flattenSofaPayload(payload: SofaScoreMatchesPayload | null): Match[] {
    if (!payload?.DATA) return [];
    const out: Match[] = [];
    const seen = new Set<string>();
    for (const tour of payload.DATA) {
        const leagueId = tour.tournament_id;
        const leagueName = tour.name || 'Unknown League';
        const countryName = tour.country_name || 'Internacional';
        for (const evt of tour.matches || []) {
            if (seen.has(evt.match_id)) continue;
            seen.add(evt.match_id);
            out.push(mapSofaEventToMatch(evt, leagueId, leagueName, countryName));
        }
    }
    return out;
}

// ---------- Public API: list & live ----------

export async function getSofaScoreFootballMatches(
    date: Date,
    options?: { timeZone?: string; targetDateKey?: string }
): Promise<Match[]> {
    if (!isSofaScoreServiceConfigured()) return [];
    const tz = options?.timeZone;
    const dateKey = options?.targetDateKey || formatDateKey(date, tz);
    const cacheKey = `ss-matches:${dateKey}:${tz || 'utc'}`;
    const path = `/v1/matches?date=${encodeURIComponent(dateKey)}${tz ? `&tz=${encodeURIComponent(tz)}` : ''}`;
    const payload = await fetchJson<SofaScoreMatchesPayload>(path, 60, cacheKey);
    return flattenSofaPayload(payload);
}

export async function getSofaScoreFootballLiveMatches(): Promise<Match[]> {
    if (!isSofaScoreServiceConfigured()) return [];
    const payload = await fetchJson<SofaScoreMatchesPayload>('/v1/matches/live', 5, 'ss-matches:live');
    return flattenSofaPayload(payload);
}

export async function getSofaScoreFootballMatchesRaw(
    date: Date,
    options?: { timeZone?: string; targetDateKey?: string }
): Promise<SofaScoreMatchesPayload | null> {
    if (!isSofaScoreServiceConfigured()) return null;
    const tz = options?.timeZone;
    const dateKey = options?.targetDateKey || formatDateKey(date, tz);
    const path = `/v1/matches?date=${encodeURIComponent(dateKey)}${tz ? `&tz=${encodeURIComponent(tz)}` : ''}`;
    return fetchJson<SofaScoreMatchesPayload>(path, 60, `ss-matches-raw:${dateKey}:${tz || 'utc'}`);
}

// ---------- Match details / lineups / stats / shotmap ----------

export async function getSofaScoreMatchDetails(matchId: string) {
    return fetchJson<unknown>(`/v1/matches/${encodeURIComponent(matchId)}`, 30, `ss-match-details:${matchId}`);
}

export async function getSofaScoreMatchLineups(matchId: string) {
    return fetchJson<unknown>(`/v1/matches/${encodeURIComponent(matchId)}/lineups`, 30, `ss-match-lineups:${matchId}`);
}

export async function getSofaScoreMatchStats(matchId: string) {
    return fetchJson<unknown>(`/v1/matches/${encodeURIComponent(matchId)}/statistics`, 30, `ss-match-stats:${matchId}`);
}

export async function getSofaScoreMatchShotmap(matchId: string) {
    return fetchJson<unknown>(`/v1/matches/${encodeURIComponent(matchId)}/shotmap`, 30, `ss-match-shotmap:${matchId}`);
}

export async function getSofaScoreMatchH2H(matchId: string) {
    return fetchJson<unknown>(`/v1/matches/${encodeURIComponent(matchId)}/h2h`, 60, `ss-match-h2h:${matchId}`);
}

// ---------- Teams / players ----------

export async function getSofaScoreTeamBundle(teamId: string) {
    return fetchJson<unknown>(`/v1/teams/${encodeURIComponent(teamId)}`, 3600, `ss-team:${teamId}`);
}

export async function getSofaScoreTeamResults(teamId: string, page: number = 0) {
    return fetchJson<unknown>(
        `/v1/teams/${encodeURIComponent(teamId)}/results?page=${page}`,
        300,
        `ss-team-results:${teamId}:${page}`,
    );
}

export async function getSofaScoreTeamFixtures(teamId: string, page: number = 0) {
    return fetchJson<unknown>(
        `/v1/teams/${encodeURIComponent(teamId)}/fixtures?page=${page}`,
        300,
        `ss-team-fixtures:${teamId}:${page}`,
    );
}

export async function getSofaScorePlayerBundle(playerId: string) {
    return fetchJson<unknown>(`/v1/players/${encodeURIComponent(playerId)}`, 3600, `ss-player:${playerId}`);
}

// ---------- Tournaments ----------

export async function getSofaScoreTournamentDetails(tournamentId: string) {
    return fetchJson<unknown>(
        `/v1/tournaments/${encodeURIComponent(tournamentId)}`,
        3600,
        `ss-tour-details:${tournamentId}`,
    );
}

export async function getSofaScoreTournamentSeasons(tournamentId: string) {
    return fetchJson<unknown>(
        `/v1/tournaments/${encodeURIComponent(tournamentId)}/seasons`,
        3600,
        `ss-tour-seasons:${tournamentId}`,
    );
}

export async function getSofaScoreTournamentStandings(tournamentId: string, seasonId?: string | number) {
    const qs = seasonId ? `?season=${encodeURIComponent(String(seasonId))}` : '';
    return fetchJson<unknown>(
        `/v1/tournaments/${encodeURIComponent(tournamentId)}/standings${qs}`,
        600,
        `ss-tour-standings:${tournamentId}:${seasonId ?? 'current'}`,
    );
}

export async function getSofaScoreTournamentMatches(
    tournamentId: string,
    seasonId?: string | number,
    page: number = 0,
) {
    const params = new URLSearchParams();
    if (seasonId) params.set('season', String(seasonId));
    params.set('page', String(page));
    return fetchJson<unknown>(
        `/v1/tournaments/${encodeURIComponent(tournamentId)}/matches?${params.toString()}`,
        300,
        `ss-tour-matches:${tournamentId}:${seasonId ?? 'current'}:${page}`,
    );
}

export async function getSofaScoreTournamentTopScorers(tournamentId: string, seasonId?: string | number) {
    const qs = seasonId ? `?season=${encodeURIComponent(String(seasonId))}` : '';
    return fetchJson<unknown>(
        `/v1/tournaments/${encodeURIComponent(tournamentId)}/top-scorers${qs}`,
        3600,
        `ss-tour-top-scorers:${tournamentId}:${seasonId ?? 'current'}`,
    );
}

// ---------- Search ----------

export async function getSofaScoreSearch(query: string) {
    const q = query.trim();
    if (!q) return null;
    return fetchJson<unknown>(
        `/v1/search?q=${encodeURIComponent(q)}`,
        60,
        `ss-search:${q.toLowerCase()}`,
    );
}
