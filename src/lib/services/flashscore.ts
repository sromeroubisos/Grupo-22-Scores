import { Match, MatchStatus } from '@/types/match';
import { apiFetch } from '@/lib/apiFetch';
import { memoryCache } from '@/lib/cache';
import { formatDateKey } from '@/lib/timezone';

const API_KEY = '32e9f1aee1msha3c5470d1ea7367p10fac7jsnf9a1bfc88131';
const API_HOST = 'flashscore4.p.rapidapi.com';

// Cache configuration
const CACHE_TTL_MATCHES = 30; // 30 seconds for match lists
const CACHE_TTL_LIVE = 10; // 10 seconds for live matches
const CACHE_TTL_DETAILS = 120; // 2 minutes for match details
const CACHE_TTL_TOURNAMENTS = 300; // 5 minutes for tournament data
const CACHE_TTL_TEAMS = 300; // 5 minutes for team data
const CACHE_TTL_PLAYERS = 300; // 5 minutes for player data

// Mapping from our app's sport IDs to FlashScore sport IDs
// Based on user provided list
const SPORT_MAPPING: Record<string, number> = {
    'football': 1,
    'tennis': 2,
    'basketball': 3,
    'hockey': 4,
    'american-football': 5,
    'baseball': 6,
    'handball': 7,
    'rugby': 8, // Rugby Union
    'rugby-union': 8,
    'rugby-league': 19,
    'floorball': 9,
    'bandy': 10,
    'futsal': 11,
    'volleyball': 12,
    'cricket': 13,
    'darts': 14,
    'snooker': 15,
    'boxing': 16,
    'beach-volleyball': 17,
    'aussie-rules': 18,
    'field-hockey': 24,
    'badminton': 21,
    'water-polo': 22,
    'golf': 23,
    'table-tennis': 25,
    'beach-soccer': 26,
    'mma': 28,
    'netball': 29,
    'pesapallo': 30,
    'motorsport': 31,
    'cycling': 34,
    'horse-racing': 35,
    'esports': 36,
    'winter-sports': 37,
    'kabaddi': 42
};

// --- Request deduplication & concurrency limiter ---
// Prevents thundering-herd when the browser fires many concurrent requests
// (main fetch + prefetch for 7 days + live polling) that all miss the cache.
const inflightRequests = new Map<string, Promise<any>>();

const MAX_CONCURRENT_API = 3;
let activeApiCalls = 0;
const waitQueue: Array<() => void> = [];

function acquireSlot(): Promise<void> {
    if (activeApiCalls < MAX_CONCURRENT_API) {
        activeApiCalls++;
        return Promise.resolve();
    }
    return new Promise(resolve => waitQueue.push(resolve));
}

function releaseSlot() {
    activeApiCalls--;
    if (waitQueue.length > 0) {
        activeApiCalls++;
        waitQueue.shift()!();
    }
}

// Root is Array of Tournaments: { tournament_id, name, country_name, matches: Array<Match> }
// Match is: { match_id, is_finished, ... }

export async function getFlashScoreMatchesRaw(
    dayOffset: number,
    sportId: string | number,
    timeZone?: string
): Promise<any> {
    // Determine the numeric sport ID
    let flashScoreSportId = 1;
    if (typeof sportId === 'string') {
        flashScoreSportId = SPORT_MAPPING[sportId] || parseInt(sportId) || 1;
    } else {
        flashScoreSportId = sportId;
    }

    const safeDay = Math.max(-7, Math.min(7, dayOffset));

    // Check cache first (include timezone in cache key)
    const cacheKey = `matches-list-${safeDay}-${flashScoreSportId}-${timeZone || 'default'}`;
    const cached = memoryCache.get<any>(cacheKey);
    if (cached) {
        return cached;
    }

    // Deduplicate: if same request is already in-flight, share the promise
    const inflight = inflightRequests.get(cacheKey);
    if (inflight) return inflight;

    const promise = (async () => {
        await acquireSlot();
        try {
            let url = `https://${API_HOST}/api/flashscore/v2/matches/list?day=${safeDay}&sport_id=${flashScoreSportId}`;
            if (timeZone) {
                url += `&timezone=${encodeURIComponent(timeZone)}`;
            }

            const { data } = await apiFetch<any>(url, {
                headers: { 'x-rapidapi-host': API_HOST, 'x-rapidapi-key': API_KEY },
                debugTag: 'MatchesListRaw',
                silent: true,
                cacheTtl: CACHE_TTL_MATCHES
            });

            // Store in cache
            if (data) {
                memoryCache.set(cacheKey, data, CACHE_TTL_MATCHES);
            }

            return data;
        } finally {
            releaseSlot();
            inflightRequests.delete(cacheKey);
        }
    })();

    inflightRequests.set(cacheKey, promise);
    return promise;
}

// formatDateKey is now imported from @/lib/timezone

export async function getFlashScoreMatches(
    date: Date,
    sportId: string,
    options?: { timeZone?: string; targetDateKey?: string }
): Promise<Match[]> {
    const timeZone = options?.timeZone;
    const targetDateKey = options?.targetDateKey || formatDateKey(date, timeZone);

    // Calculate day offset using timezone-aware dates so that "today" is
    // correctly resolved in the user's timezone, not in UTC.
    const todayKey = formatDateKey(new Date(), timeZone);
    const todayMs = new Date(todayKey + 'T00:00:00Z').getTime();
    const targetMs = new Date(targetDateKey + 'T00:00:00Z').getTime();
    const dayOffset = Math.round((targetMs - todayMs) / 86400000);

    // Fetch the target day + one adjacent day to catch matches near the
    // UTC midnight boundary that belong to a different local day.
    // e.g. 00:00 UTC = 21:00 UTC-3 (previous day in Argentina).
    const adjacentOffset = getAdjacentDayOffset(timeZone);
    const offsets = [dayOffset];
    const adj = dayOffset + adjacentOffset;
    if (adj >= -7 && adj <= 7) offsets.push(adj);

    const results = await Promise.all(
        offsets.map(o => getFlashScoreMatchesRaw(o, sportId, timeZone))
    );

    let allMatches: Match[] = [];
    const seenMatchIds = new Set<string>();

    results.filter(d => d != null).forEach(data => {
        const tournaments = Array.isArray(data) ? data : (data.DATA || data.data || []);

        tournaments.forEach((tournament: any) => {
            const leagueName = tournament.name || tournament.league_name || 'Unknown League';
            const countryName = tournament.country_name || 'International';
            const leagueId = tournament.tournament_id;

            if (tournament.matches && Array.isArray(tournament.matches)) {
                const tournamentMatches = tournament.matches
                    .map((evt: any) => mapEventToMatch(evt, sportId, { leagueName, countryName, leagueId }))
                    .filter((match: Match) => {
                        // Skip duplicates
                        if (seenMatchIds.has(match.id.toString())) return false;
                        seenMatchIds.add(match.id.toString());

                        // Safety filter: ensure match falls on the target date in user timezone
                        const matchTime = match.scheduledAt ? new Date(match.scheduledAt) : null;
                        if (!matchTime || Number.isNaN(matchTime.getTime())) return false;
                        return formatDateKey(matchTime, timeZone) === targetDateKey;
                    });
                allMatches = allMatches.concat(tournamentMatches);
            }
        });
    });

    return allMatches;
}

/**
 * Determines which adjacent day to also fetch based on the user's timezone.
 * Behind UTC (e.g. America): early UTC hours are still "yesterday" locally → fetch +1.
 * Ahead of UTC (e.g. Asia): late UTC hours are already "tomorrow" locally → fetch -1.
 */
function getAdjacentDayOffset(timeZone?: string): number {
    if (!timeZone) return 1; // default: fetch next day
    try {
        const now = new Date();
        const utcDateStr = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit'
        }).format(now);
        const localDateStr = new Intl.DateTimeFormat('en-CA', {
            timeZone, year: 'numeric', month: '2-digit', day: '2-digit'
        }).format(now);
        // If the local date is behind UTC (e.g. UTC-3 at 01:00 UTC → still previous day)
        // localDateStr < utcDateStr → timezone is behind UTC → fetch next API day
        if (localDateStr < utcDateStr) return 1;
        if (localDateStr > utcDateStr) return -1;
        // Same date: offset is small, fetch next day as default safety net
        return 1;
    } catch {
        return 1;
    }
}

export async function getFlashScoreLiveMatches(sportId: string): Promise<Match[]> {
    const flashScoreSportId = SPORT_MAPPING[sportId] || 1;

    // Check cache first
    const cacheKey = `matches-live-${flashScoreSportId}`;
    const cached = memoryCache.get<Match[]>(cacheKey);
    if (cached) {
        return cached;
    }

    const url = `https://${API_HOST}/api/flashscore/v2/matches/live?sport_id=${flashScoreSportId}`;
    const { data } = await apiFetch<any>(url, {
        headers: { 'x-rapidapi-host': API_HOST, 'x-rapidapi-key': API_KEY },
        debugTag: 'LiveMatches',
        cacheTtl: CACHE_TTL_LIVE
    });

    if (!data) return [];

    const tournaments = Array.isArray(data) ? data : (data.data || []);
    let liveMatches: Match[] = [];

    tournaments.forEach((tournament: any) => {
        const leagueName = tournament.name || tournament.league_name || 'Unknown League';
        const countryName = tournament.country_name || 'International';
        const leagueId = tournament.tournament_id;

        if (tournament.matches && Array.isArray(tournament.matches)) {
            const tournamentMatches = tournament.matches.map((evt: any) => {
                return mapEventToMatch(evt, sportId, { leagueName, countryName, leagueId });
            });
            liveMatches = liveMatches.concat(tournamentMatches);
        }
    });

    // Store in cache
    memoryCache.set(cacheKey, liveMatches, CACHE_TTL_LIVE);

    return liveMatches;
}

function mapEventToMatch(evt: any, sportId: string, context: { leagueName: string, countryName: string, leagueId: string }): Match {
    // Structure based on provided User JSON:
    // evt = { match_id: "...", match_status: { is_finished: bool, is_started: bool, ... }, timestamp: 123456, home_team: { name: "...", short_name: "..." }, away_team: { name: "..." }, scores: { home: 1, away: 2 } }

    const status = mapStatus(evt.match_status, evt.status);

    const homeScore = evt.scores?.home ?? null;
    const awayScore = evt.scores?.away ?? null;

    const timestamp = evt.timestamp || evt.start_time || evt.time || evt.event_timestamp;
    const scheduledAt = timestamp ? new Date(timestamp * 1000) : new Date();

    const homeTeamName = evt.home_team?.name || evt.event_home_team?.name || evt.home_team_name || 'Home Team';
    const awayTeamName = evt.away_team?.name || evt.event_away_team?.name || evt.away_team_name || 'Away Team';

    const homeTeamId = `fs-team-${evt.home_team?.team_id || evt.home_team?.id || 'h'}`;
    const awayTeamId = `fs-team-${evt.away_team?.team_id || evt.away_team?.id || 'a'}`;

    return {
        id: evt.match_id || evt.event_key || `fs-${Math.random()}`,
        tournamentId: `fs-${context.leagueId || 'unknown'}`,
        // @ts-ignore
        leagueName: context.leagueName,
        // @ts-ignore
        countryName: context.countryName,

        phaseId: 'group',
        round: 1,

        homeTeamId: homeTeamId,
        homeTeamName: homeTeamName,

        awayTeamId: awayTeamId,
        awayTeamName: awayTeamName,

        homeTeamLogo: evt.home_team?.image_path || evt.home_team?.small_image_path || evt.home_team?.smaill_image_path || evt.home_team?.logo || evt.home_team?.player_image || '',
        awayTeamLogo: evt.away_team?.image_path || evt.away_team?.small_image_path || evt.away_team?.smaill_image_path || evt.away_team?.logo || evt.away_team?.player_image || '',

        currentMinute: evt.match_status?.stage || undefined,

        scheduledAt: scheduledAt,
        venueName: evt.venue || undefined,

        status: status,
        score: {
            home: typeof homeScore === 'number' ? homeScore : null,
            away: typeof awayScore === 'number' ? awayScore : null
        },
        result: { isComplete: status === 'final', updatedAt: new Date(), updatedBy: 'flashscore', version: 1 },
        createdFrom: 'generator',
        createdAt: new Date(),
        updatedAt: new Date()
    };
}

export function mapStatus(matchStatusObj: any, simpleStatus?: string): MatchStatus {
    // Priority to match_status object from user provided JSON
    if (matchStatusObj) {
        if (matchStatusObj.is_finished) return 'final';
        if (matchStatusObj.is_in_progress || matchStatusObj.is_started) return 'live';
        if (matchStatusObj.is_postponed) return 'postponed';
        if (matchStatusObj.is_cancelled) return 'cancelled';
    }

    // Fallback to string status
    const s = String(simpleStatus || '').toLowerCase();

    if (s.includes('finished') || s.includes('final') || s.includes('ended') || s.includes('full time')) return 'final';
    if (s.includes('live') || s.includes('playing') || s.includes('current')) return 'live';
    if (s.includes('postponed') || s.includes('aplazado')) return 'postponed';
    if (s.includes('cancelled') || s.includes('cancelado')) return 'cancelled';

    return 'scheduled';
}

// --- New Detail Endpoints ---

export async function getFlashScoreMatchDetails(matchId: string) {
    const cacheKey = `match-details-${matchId}`;
    const cached = memoryCache.get<any>(cacheKey);
    if (cached) return cached;

    const url = `https://${API_HOST}/api/flashscore/v2/matches/details?match_id=${matchId}`;
    const { data } = await apiFetch<any>(url, {
        headers: { 'x-rapidapi-host': API_HOST, 'x-rapidapi-key': API_KEY },
        debugTag: 'MatchDetails',
        cacheTtl: CACHE_TTL_DETAILS
    });

    if (data) {
        memoryCache.set(cacheKey, data, CACHE_TTL_DETAILS);
    }

    return data;
}

export async function getFlashScoreMatchSummary(matchId: string) {
    const cacheKey = `match-summary-${matchId}`;
    const cached = memoryCache.get<any>(cacheKey);
    if (cached) return cached;

    const url = `https://${API_HOST}/api/flashscore/v2/matches/match/summary?match_id=${matchId}`;
    const { data } = await apiFetch<any>(url, {
        headers: { 'x-rapidapi-host': API_HOST, 'x-rapidapi-key': API_KEY },
        debugTag: 'MatchSummary',
        silent: true,
        cacheTtl: CACHE_TTL_DETAILS
    });

    if (data) memoryCache.set(cacheKey, data, CACHE_TTL_DETAILS);
    return data;
}

export async function getFlashScoreMatchStats(matchId: string) {
    const cacheKey = `match-stats-${matchId}`;
    const cached = memoryCache.get<any>(cacheKey);
    if (cached) return cached;

    const url = `https://${API_HOST}/api/flashscore/v2/matches/match/stats?match_id=${matchId}`;
    const { data } = await apiFetch<any>(url, {
        headers: { 'x-rapidapi-host': API_HOST, 'x-rapidapi-key': API_KEY },
        debugTag: 'MatchStats',
        silent: true,
        cacheTtl: CACHE_TTL_DETAILS
    });

    if (data) memoryCache.set(cacheKey, data, CACHE_TTL_DETAILS);
    return data;
}

export async function getFlashScoreMatchLineups(matchId: string) {
    const cacheKey = `match-lineups-${matchId}`;
    const cached = memoryCache.get<any>(cacheKey);
    if (cached) return cached;

    const url = `https://${API_HOST}/api/flashscore/v2/matches/match/lineups?match_id=${matchId}`;
    const { data } = await apiFetch<any>(url, {
        headers: { 'x-rapidapi-host': API_HOST, 'x-rapidapi-key': API_KEY },
        debugTag: 'MatchLineups',
        silent: true,
        cacheTtl: CACHE_TTL_DETAILS
    });

    if (data) memoryCache.set(cacheKey, data, CACHE_TTL_DETAILS);
    return data;
}

export async function getFlashScoreMatchH2H(matchId: string) {
    const cacheKey = `match-h2h-${matchId}`;
    const cached = memoryCache.get<any>(cacheKey);
    if (cached) return cached;

    const url = `https://${API_HOST}/api/flashscore/v2/matches/h2h?match_id=${matchId}`;
    const { data } = await apiFetch<any>(url, {
        headers: { 'x-rapidapi-host': API_HOST, 'x-rapidapi-key': API_KEY },
        debugTag: 'MatchH2H',
        silent: true,
        cacheTtl: CACHE_TTL_DETAILS
    });

    if (data) memoryCache.set(cacheKey, data, CACHE_TTL_DETAILS);
    return data;
}

export async function getFlashScoreMatchStandings(matchId: string) {
    const cacheKey = `match-standings-${matchId}`;
    const cached = memoryCache.get<any>(cacheKey);
    if (cached) return cached;

    const url = `https://${API_HOST}/api/flashscore/v2/matches/standings?type=overall&match_id=${matchId}`;
    const { data } = await apiFetch<any>(url, {
        headers: { 'x-rapidapi-host': API_HOST, 'x-rapidapi-key': API_KEY },
        debugTag: 'MatchStandings',
        silent: true,
        cacheTtl: CACHE_TTL_DETAILS
    });

    if (data) memoryCache.set(cacheKey, data, CACHE_TTL_DETAILS);
    return data;
}

// --- Advanced & Sport-Specific Endpoints ---

export async function getFlashScoreMatchPointByPoint(matchId: string) {
    const url = `https://${API_HOST}/api/flashscore/v2/matches/match/point-by-point?match_id=${matchId}`;
    const { data } = await apiFetch<any>(url, {
        headers: { 'x-rapidapi-host': API_HOST, 'x-rapidapi-key': API_KEY },
        debugTag: 'MatchPBP',
        silent: true
    });
    return data;
}

export async function getFlashScoreMatchPenalties(matchId: string) {
    const url = `https://${API_HOST}/api/flashscore/v2/matches/penalties?match_id=${matchId}`;
    const { data } = await apiFetch<any>(url, {
        headers: { 'x-rapidapi-host': API_HOST, 'x-rapidapi-key': API_KEY },
        debugTag: 'MatchPenalties',
        silent: true
    });
    return data;
}

export async function getFlashScoreMatchDraw(matchId: string) {
    const url = `https://${API_HOST}/api/flashscore/v2/matches/draw?match_id=${matchId}`;
    const { data } = await apiFetch<any>(url, {
        headers: { 'x-rapidapi-host': API_HOST, 'x-rapidapi-key': API_KEY },
        debugTag: 'MatchDraw',
        silent: true
    });
    return data;
}

export async function getFlashScoreStandingsForm(matchId: string) {
    const url = `https://${API_HOST}/api/flashscore/v2/matches/standings/form?match_id=${matchId}&type=overall`;
    const { data } = await apiFetch<any>(url, {
        headers: { 'x-rapidapi-host': API_HOST, 'x-rapidapi-key': API_KEY },
        debugTag: 'StandingsForm',
        silent: true
    });
    return data;
}

export async function getFlashScoreStandingsOverUnder(matchId: string) {
    const url = `https://${API_HOST}/api/flashscore/v2/matches/standings/over-under?match_id=${matchId}`;
    const { data } = await apiFetch<any>(url, {
        headers: { 'x-rapidapi-host': API_HOST, 'x-rapidapi-key': API_KEY },
        debugTag: 'StandingsOU',
        silent: true
    });
    return data;
}

export async function getFlashScoreStandingsHtFt(matchId: string) {
    const url = `https://${API_HOST}/api/flashscore/v2/matches/standings/ht-ft?type=overall&match_id=${matchId}`;
    const { data } = await apiFetch<any>(url, {
        headers: { 'x-rapidapi-host': API_HOST, 'x-rapidapi-key': API_KEY },
        debugTag: 'StandingsHtFt',
        silent: true
    });
    return data;
}

export async function getFlashScoreTopScorers(matchId: string) {
    const url = `https://${API_HOST}/api/flashscore/v2/matches/standings/top-scorers?match_id=${matchId}`;
    const { data } = await apiFetch<any>(url, {
        headers: { 'x-rapidapi-host': API_HOST, 'x-rapidapi-key': API_KEY },
        debugTag: 'TopScorers',
        silent: true
    });
    return data;
}
export async function getFlashScorePlayerStats(matchId: string) {
    const url = `https://${API_HOST}/api/flashscore/v2/matches/match/player-stats?match_id=${matchId}`;
    const { data } = await apiFetch<any>(url, {
        headers: { 'x-rapidapi-host': API_HOST, 'x-rapidapi-key': API_KEY },
        debugTag: 'MatchPlayerStats',
        silent: true
    });
    return data;
}

export async function getFlashScoreMatchCommentary(matchId: string) {
    const url = `https://${API_HOST}/api/flashscore/v2/matches/match/commentary?match_id=${matchId}`;
    const { data } = await apiFetch<any>(url, {
        headers: { 'x-rapidapi-host': API_HOST, 'x-rapidapi-key': API_KEY },
        debugTag: 'MatchCommentary',
        silent: true
    });
    return data;
}

// --- Tournament Endpoints ---

/**
 * Get tournament IDs from a FlashScore URL
 * @param tournamentUrl - The tournament URL path (e.g., "/tennis/atp-singles/wimbledon/")
 * @returns Tournament IDs including tournament_id, tournament_stage_id, tournament_template_id, season_id, draw_stages
 */
export async function getTournamentIds(tournamentUrl: string) {
    const cacheKey = `tournament-ids-${tournamentUrl}`;
    const cached = memoryCache.get<any>(cacheKey);
    if (cached) return cached;

    const encodedUrl = encodeURIComponent(tournamentUrl);
    const url = `https://${API_HOST}/api/flashscore/v2/tournaments/ids?tournament_url=${encodedUrl}`;
    const { data } = await apiFetch<any>(url, {
        headers: { 'x-rapidapi-host': API_HOST, 'x-rapidapi-key': API_KEY },
        debugTag: 'TournamentIds',
        silent: true,
        cacheTtl: CACHE_TTL_TOURNAMENTS
    });

    if (data) memoryCache.set(cacheKey, data, CACHE_TTL_TOURNAMENTS);
    return data;
}

/**
 * Get tournament details
 * @param tournamentStageId - The tournament stage ID
 * @returns Tournament details including name, image, country, start/end dates, winner, etc.
 */
export async function getTournamentDetails(tournamentStageId: string) {
    const cacheKey = `tournament-details-${tournamentStageId}`;
    const cached = memoryCache.get<any>(cacheKey);
    if (cached) return cached;

    const url = `https://${API_HOST}/api/flashscore/v2/tournaments/details?tournament_stage_id=${tournamentStageId}`;
    const { data } = await apiFetch<any>(url, {
        headers: { 'x-rapidapi-host': API_HOST, 'x-rapidapi-key': API_KEY },
        debugTag: 'TournamentDetails',
        silent: true,
        cacheTtl: CACHE_TTL_TOURNAMENTS
    });

    if (data) memoryCache.set(cacheKey, data, CACHE_TTL_TOURNAMENTS);
    return data;
}

/**
 * Get tournament results (matches)
 * @param tournamentTemplateId - The tournament template ID
 * @param seasonId - The season ID
 * @param page - Optional page number for pagination (default: 1)
 * @returns Array of matches with results
 */
export async function getTournamentResults(tournamentTemplateId: string, seasonId: string, page: number = 1) {
    const cacheKey = `tournament-results-${tournamentTemplateId}-${seasonId}-${page}`;
    const cached = memoryCache.get<any>(cacheKey);
    if (cached) return cached;

    const url = `https://${API_HOST}/api/flashscore/v2/tournaments/results?tournament_template_id=${tournamentTemplateId}&season_id=${seasonId}&page=${page}`;
    const { data } = await apiFetch<any>(url, {
        headers: { 'x-rapidapi-host': API_HOST, 'x-rapidapi-key': API_KEY },
        debugTag: 'TournamentResults',
        silent: true,
        cacheTtl: CACHE_TTL_TOURNAMENTS
    });

    if (data) memoryCache.set(cacheKey, data, CACHE_TTL_TOURNAMENTS);
    return data;
}

export async function getTournamentFixtures(tournamentTemplateId: string, seasonId: string, page: number = 1) {
    const cacheKey = `tournament-fixtures-${tournamentTemplateId}-${seasonId}-${page}`;
    const cached = memoryCache.get<any>(cacheKey);
    if (cached) return cached;

    const url = `https://${API_HOST}/api/flashscore/v2/tournaments/fixtures?tournament_template_id=${tournamentTemplateId}&season_id=${seasonId}&page=${page}`;
    const { data } = await apiFetch<any>(url, {
        headers: { 'x-rapidapi-host': API_HOST, 'x-rapidapi-key': API_KEY },
        debugTag: 'TournamentFixtures',
        silent: true,
        cacheTtl: CACHE_TTL_TOURNAMENTS
    });

    if (data) memoryCache.set(cacheKey, data, CACHE_TTL_TOURNAMENTS);
    return data;
}

export async function getTournamentStandings(tournamentId: string, stageId: string) {
    const cacheKey = `tournament-standings-${tournamentId}-${stageId}`;
    const cached = memoryCache.get<any>(cacheKey);
    if (cached) return cached;

    const url = `https://${API_HOST}/api/flashscore/v2/tournaments/standings?tournament_id=${tournamentId}&tournament_stage_id=${stageId}&type=overall`;
    const { data } = await apiFetch<any>(url, {
        headers: { 'x-rapidapi-host': API_HOST, 'x-rapidapi-key': API_KEY },
        debugTag: 'TournamentStandings',
        silent: true,
        cacheTtl: CACHE_TTL_TOURNAMENTS
    });

    if (data) memoryCache.set(cacheKey, data, CACHE_TTL_TOURNAMENTS);
    return data;
}

export async function getTournamentTopScorers(tournamentId: string, stageId: string) {
    const cacheKey = `tournament-top-scorers-${tournamentId}-${stageId}`;
    const cached = memoryCache.get<any>(cacheKey);
    if (cached) return cached;

    const url = `https://${API_HOST}/api/flashscore/v2/tournaments/standings/top-scorers?tournament_id=${tournamentId}&tournament_stage_id=${stageId}`;
    const { data } = await apiFetch<any>(url, {
        headers: { 'x-rapidapi-host': API_HOST, 'x-rapidapi-key': API_KEY },
        debugTag: 'TournamentTopScorers',
        silent: true,
        cacheTtl: CACHE_TTL_TOURNAMENTS
    });

    if (data) memoryCache.set(cacheKey, data, CACHE_TTL_TOURNAMENTS);
    return data;
}

export async function getTournamentStandingsForm(tournamentId: string, stageId: string, type: string = 'overall') {
    const cacheKey = `tournament-standings-form-${tournamentId}-${stageId}-${type}`;
    const cached = memoryCache.get<any>(cacheKey);
    if (cached) return cached;

    const url = `https://${API_HOST}/api/flashscore/v2/tournaments/standings/form?tournament_id=${tournamentId}&tournament_stage_id=${stageId}&type=${type}`;
    const { data } = await apiFetch<any>(url, {
        headers: { 'x-rapidapi-host': API_HOST, 'x-rapidapi-key': API_KEY },
        debugTag: 'TournamentStandingsForm',
        silent: true,
        cacheTtl: CACHE_TTL_TOURNAMENTS
    });

    if (data) memoryCache.set(cacheKey, data, CACHE_TTL_TOURNAMENTS);
    return data;
}

export async function getTournamentStandingsHtFt(tournamentId: string, stageId: string, type: string = 'overall') {
    const cacheKey = `tournament-standings-htft-${tournamentId}-${stageId}-${type}`;
    const cached = memoryCache.get<any>(cacheKey);
    if (cached) return cached;

    const url = `https://${API_HOST}/api/flashscore/v2/tournaments/standings/ht-ft?tournament_id=${tournamentId}&tournament_stage_id=${stageId}&type=${type}`;
    const { data } = await apiFetch<any>(url, {
        headers: { 'x-rapidapi-host': API_HOST, 'x-rapidapi-key': API_KEY },
        debugTag: 'TournamentStandingsHtFt',
        silent: true,
        cacheTtl: CACHE_TTL_TOURNAMENTS
    });

    if (data) memoryCache.set(cacheKey, data, CACHE_TTL_TOURNAMENTS);
    return data;
}

export async function getTournamentStandingsOverUnder(
    tournamentId: string,
    stageId: string,
    type: string = 'overall',
    subType: string = '2.5'
) {
    const cacheKey = `tournament-standings-overunder-${tournamentId}-${stageId}-${type}-${subType}`;
    const cached = memoryCache.get<any>(cacheKey);
    if (cached) return cached;

    const url = `https://${API_HOST}/api/flashscore/v2/tournaments/standings/over-under?tournament_id=${tournamentId}&tournament_stage_id=${stageId}&type=${type}&sub_type=${encodeURIComponent(subType)}`;
    const { data } = await apiFetch<any>(url, {
        headers: { 'x-rapidapi-host': API_HOST, 'x-rapidapi-key': API_KEY },
        debugTag: 'TournamentStandingsOverUnder',
        silent: true,
        cacheTtl: CACHE_TTL_TOURNAMENTS
    });

    if (data) memoryCache.set(cacheKey, data, CACHE_TTL_TOURNAMENTS);
    return data;
}

export async function getTournamentArchives(stageId: string) {
    const cacheKey = `tournament-archives-${stageId}`;
    const cached = memoryCache.get<any>(cacheKey);
    if (cached) return cached;

    const url = `https://${API_HOST}/api/flashscore/v2/tournaments/archives?tournament_stage_id=${stageId}`;
    const { data } = await apiFetch<any>(url, {
        headers: { 'x-rapidapi-host': API_HOST, 'x-rapidapi-key': API_KEY },
        debugTag: 'TournamentArchives',
        silent: true,
        cacheTtl: CACHE_TTL_TOURNAMENTS
    });

    if (data) memoryCache.set(cacheKey, data, CACHE_TTL_TOURNAMENTS);
    return data;
}

export async function getTournamentDraw(tournamentId: string, drawStageId: string) {
    const cacheKey = `tournament-draw-${tournamentId}-${drawStageId}`;
    const cached = memoryCache.get<any>(cacheKey);
    if (cached) return cached;

    const url = `https://${API_HOST}/api/flashscore/v2/tournaments/draw?tournament_id=${tournamentId}&draw_stage_id=${drawStageId}`;
    const { data } = await apiFetch<any>(url, {
        headers: { 'x-rapidapi-host': API_HOST, 'x-rapidapi-key': API_KEY },
        debugTag: 'TournamentDraw',
        silent: true,
        cacheTtl: CACHE_TTL_TOURNAMENTS
    });

    if (data) memoryCache.set(cacheKey, data, CACHE_TTL_TOURNAMENTS);
    return data;
}

// --- Team Endpoints ---

export async function getTeamDetails(teamUrl: string) {
    const cacheKey = `team-details-${teamUrl}`;
    const cached = memoryCache.get<any>(cacheKey);
    if (cached) return cached;

    const url = `https://${API_HOST}/api/flashscore/v2/teams/details?team_url=${encodeURIComponent(teamUrl)}`;
    const { data } = await apiFetch<any>(url, {
        headers: { 'x-rapidapi-host': API_HOST, 'x-rapidapi-key': API_KEY },
        debugTag: 'TeamDetails',
        silent: true,
        cacheTtl: CACHE_TTL_TEAMS
    });

    if (data) memoryCache.set(cacheKey, data, CACHE_TTL_TEAMS);
    return data;
}

export async function getTeamResults(teamId: string, page: number = 1) {
    const cacheKey = `team-results-${teamId}-${page}`;
    const cached = memoryCache.get<any>(cacheKey);
    if (cached) return cached;

    const url = `https://${API_HOST}/api/flashscore/v2/teams/results?team_id=${teamId}&page=${page}`;
    const { data } = await apiFetch<any>(url, {
        headers: { 'x-rapidapi-host': API_HOST, 'x-rapidapi-key': API_KEY },
        debugTag: 'TeamResults',
        silent: true,
        cacheTtl: CACHE_TTL_TEAMS
    });

    if (data) memoryCache.set(cacheKey, data, CACHE_TTL_TEAMS);
    return data;
}

export async function getTeamFixtures(teamId: string, page: number = 1) {
    const cacheKey = `team-fixtures-${teamId}-${page}`;
    const cached = memoryCache.get<any>(cacheKey);
    if (cached) return cached;

    const url = `https://${API_HOST}/api/flashscore/v2/teams/fixtures?team_id=${teamId}&page=${page}`;
    const { data } = await apiFetch<any>(url, {
        headers: { 'x-rapidapi-host': API_HOST, 'x-rapidapi-key': API_KEY },
        debugTag: 'TeamFixtures',
        silent: true,
        cacheTtl: CACHE_TTL_TEAMS
    });

    if (data) memoryCache.set(cacheKey, data, CACHE_TTL_TEAMS);
    return data;
}

export async function getTeamSquad(teamUrl: string) {
    const cacheKey = `team-squad-${teamUrl}`;
    const cached = memoryCache.get<any>(cacheKey);
    if (cached) return cached;

    const url = `https://${API_HOST}/api/flashscore/v2/teams/squad?team_url=${encodeURIComponent(teamUrl)}`;
    const { data } = await apiFetch<any>(url, {
        headers: { 'x-rapidapi-host': API_HOST, 'x-rapidapi-key': API_KEY },
        debugTag: 'TeamSquad',
        silent: true,
        cacheTtl: CACHE_TTL_TEAMS
    });

    if (data) memoryCache.set(cacheKey, data, CACHE_TTL_TEAMS);
    return data;
}

export async function getTeamTransfers(teamId: string) {
    const cacheKey = `team-transfers-${teamId}`;
    const cached = memoryCache.get<any>(cacheKey);
    if (cached) return cached;

    const url = `https://${API_HOST}/api/flashscore/v2/teams/transfers?team_id=${teamId}`;
    const { data } = await apiFetch<any>(url, {
        headers: { 'x-rapidapi-host': API_HOST, 'x-rapidapi-key': API_KEY },
        debugTag: 'TeamTransfers',
        silent: true,
        cacheTtl: CACHE_TTL_TEAMS
    });

    if (data) memoryCache.set(cacheKey, data, CACHE_TTL_TEAMS);
    return data;
}

// --- Player Endpoints ---

export async function getPlayerDetails(playerUrl: string) {
    const cacheKey = `player-details-${playerUrl}`;
    const cached = memoryCache.get<any>(cacheKey);
    if (cached) return cached;

    const url = `https://${API_HOST}/api/flashscore/v2/players/details?player_url=${encodeURIComponent(playerUrl)}`;
    const { data } = await apiFetch<any>(url, {
        headers: { 'x-rapidapi-host': API_HOST, 'x-rapidapi-key': API_KEY },
        debugTag: 'PlayerDetails',
        silent: true,
        cacheTtl: CACHE_TTL_PLAYERS
    });

    if (data) memoryCache.set(cacheKey, data, CACHE_TTL_PLAYERS);
    return data;
}

export async function getPlayerCareer(playerUrl: string) {
    const cacheKey = `player-career-${playerUrl}`;
    const cached = memoryCache.get<any>(cacheKey);
    if (cached) return cached;

    const url = `https://${API_HOST}/api/flashscore/v2/players/career?player_url=${encodeURIComponent(playerUrl)}`;
    const { data } = await apiFetch<any>(url, {
        headers: { 'x-rapidapi-host': API_HOST, 'x-rapidapi-key': API_KEY },
        debugTag: 'PlayerCareer',
        silent: true,
        cacheTtl: CACHE_TTL_PLAYERS
    });

    if (data) memoryCache.set(cacheKey, data, CACHE_TTL_PLAYERS);
    return data;
}
