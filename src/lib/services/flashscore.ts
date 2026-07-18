import { Match, MatchStatus } from '@/types/match';
import { apiFetch } from '@/lib/apiFetch';
import { memoryCache } from '@/lib/cache';
import { formatDateKey } from '@/lib/timezone';
import { isFlashScoreEnabledForSport, isFootballSport } from '@/lib/externalProviderPolicy';
import {
    getEspnAmericanFootballLiveMatches,
    getEspnAmericanFootballMatches,
} from '@/lib/services/espnAmericanFootball';
import {
    getEspnFootballLiveMatches,
    getEspnFootballMatches,
} from '@/lib/services/espnFootball';
import {
    getEspnMotorsportLiveMatches,
    getEspnMotorsportMatches,
} from '@/lib/services/espnMotorsport';
import {
    getSofaScoreFootballLiveMatches,
    getSofaScoreFootballMatches,
    getSofaScoreFootballMatchesRaw,
    getSofaScoreMatchDetails,
    getSofaScoreMatchH2H,
    getSofaScoreMatchLineups,
    getSofaScoreMatchStats,
    isSofaScoreServiceConfigured,
    SOFASCORE_MATCH_PREFIX,
} from '@/lib/services/sofascore';

// M10: prefer the server-only RAPIDAPI_KEY; NEXT_PUBLIC_* vars are embedded in
// the client bundle and expose the key publicly. The fallback keeps the current
// deploy working until RAPIDAPI_KEY is created in Vercel and the public var removed.
const API_KEY = process.env.RAPIDAPI_KEY || process.env.NEXT_PUBLIC_RAPIDAPI_KEY || '';
if (!process.env.RAPIDAPI_KEY && process.env.NEXT_PUBLIC_RAPIDAPI_KEY) {
    console.warn('[FlashScore] Using NEXT_PUBLIC_RAPIDAPI_KEY (exposed in the client bundle). Create the server-only env var RAPIDAPI_KEY and remove NEXT_PUBLIC_RAPIDAPI_KEY.');
}
const API_HOST = process.env.NEXT_PUBLIC_RAPIDAPI_HOST || 'flashscore4.p.rapidapi.com';

// Cache configuration
const CACHE_TTL_MATCHES = 60;   // 60 seconds for match lists default
const CACHE_TTL_LIVE = 5;       // 5 seconds for live matches
const CACHE_TTL_DETAILS = 30;   // 30 seconds for match details
const CACHE_TTL_TOURNAMENTS = 24 * 60 * 60; // 24 hours for tournaments (metadata: details/archives/ids)
// Tournament endpoints that reflect live match state (results/fixtures/standings/...)
// use a dynamic TTL: short while the tournament has live/today matches (state changes
// fast), long (CACHE_TTL_TOURNAMENTS) for past/idle seasons. Mirrors the dynamic-TTL
// approach in getFlashScoreMatchesRaw.
const CACHE_TTL_TOURNAMENT_LIVE = 60;            // tournament has live/today matches → refresh fast
const CACHE_TTL_TOURNAMENT_ACTIVITY_UNKNOWN = 120; // standings/top-scorers before the tournament is classified
const TOURNAMENT_ACTIVE_WINDOW_PAST_MS = 12 * 60 * 60 * 1000;   // a match counts as "active" up to 12h after kickoff
const TOURNAMENT_ACTIVE_WINDOW_FUTURE_MS = 36 * 60 * 60 * 1000; // ...and up to 36h before kickoff
const TOURNAMENT_ACTIVITY_MARKER_PREFIX = 'tournament-activity-';
const CACHE_TTL_CATALOG = 60;   // 60 seconds for countries and leagues catalog
const CACHE_TTL_TEAMS = 24 * 60 * 60;       // 24 hours for teams
const CACHE_TTL_PLAYERS = 24 * 60 * 60;     // 24 hours for player info
const MATCHES_LIST_DAY_OFFSET_LIMIT = 7;
const MATCHES_LIST_CACHE_PREFIX = 'matches-list:v3';

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

// Two concurrency lanes against RapidAPI:
//  - 'default' (3): browser-facing match-list fetches (main + 7-day prefetch + live
//    polling). Kept small to avoid a thundering-herd from a single client. NOTE:
//    RapidAPI DOES throttle aggressively (a burst of 2 unsubscribed calls already
//    returned 429 "Too many requests"), so do not raise this without measuring the
//    live plan's real rate limit first.
//  - 'resolution' (10): server-side tournament ID-resolution sweep, which fans out
//    ~22 day-offset reads at once. Measured safe: a 12-concurrent burst returned
//    12x200, no 429, and the plan exposes no per-second rate limit (only a 10k/period
//    quota). The old 3-wide lane was adding ~4.6s of pure serialization to the sweep.
type ApiLane = 'default' | 'resolution';
const LANE_LIMITS: Record<ApiLane, number> = { default: 3, resolution: 10 };
const laneState: Record<ApiLane, { active: number; queue: Array<() => void> }> = {
    default: { active: 0, queue: [] },
    resolution: { active: 0, queue: [] },
};

function acquireSlot(lane: ApiLane = 'default'): Promise<void> {
    const state = laneState[lane];
    if (state.active < LANE_LIMITS[lane]) {
        state.active++;
        return Promise.resolve();
    }
    return new Promise(resolve => state.queue.push(resolve));
}

function releaseSlot(lane: ApiLane = 'default') {
    const state = laneState[lane];
    state.active--;
    if (state.queue.length > 0) {
        state.active++;
        state.queue.shift()!();
    }
}

function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function getDayOffsetForDateKey(targetDateKey: string, timeZone?: string): number {
    const todayKey = formatDateKey(new Date(), timeZone);
    const todayMs = new Date(todayKey + 'T00:00:00Z').getTime();
    const targetMs = new Date(targetDateKey + 'T00:00:00Z').getTime();
    return Math.round((targetMs - todayMs) / 86400000);
}

function isMatchesListDayOffsetSupported(dayOffset: number): boolean {
    return Math.abs(dayOffset) <= MATCHES_LIST_DAY_OFFSET_LIMIT;
}

export function isFlashScoreMatchesListDateSupported(targetDateKey: string, timeZone?: string): boolean {
    return isMatchesListDayOffsetSupported(getDayOffsetForDateKey(targetDateKey, timeZone));
}

function getFlashScoreRawTournamentList(data: any): any[] {
    if (Array.isArray(data)) return data;
    if (!data || typeof data !== 'object') return [];
    if (Array.isArray(data.DATA)) return data.DATA;
    if (Array.isArray(data.data)) return data.data;
    return [];
}

function countFlashScoreRawMatches(data: any): number {
    return getFlashScoreRawTournamentList(data).reduce((total, tournament) => {
        return total + (Array.isArray(tournament?.matches) ? tournament.matches.length : 0);
    }, 0);
}

// ─── Dynamic tournament cache TTL ────────────────────────────────────────────
// A tournament is "active" when it has a live match, or a match starting/finishing
// inside the active window around now. Active tournaments change state fast, so we
// cache results/fixtures/standings briefly; idle/past seasons keep the long 24h TTL.
// Returns the FlashScore tournament_id(s) found so sibling endpoints whose payload
// has no per-match timestamps (standings/top-scorers) can reuse the classification.
function resolveTournamentActivity(data: any): { isActive: boolean; tournamentIds: string[] } {
    const groups = getFlashScoreRawTournamentList(data);
    const now = Date.now();
    let isActive = false;
    const tournamentIds: string[] = [];

    for (const group of groups) {
        const tid = group?.tournament_id != null ? String(group.tournament_id).trim() : '';
        if (tid && !tournamentIds.includes(tid)) tournamentIds.push(tid);

        const matches = Array.isArray(group?.matches) ? group.matches : [];
        for (const evt of matches) {
            if (mapStatus(evt?.match_status, evt?.status) === 'live') {
                isActive = true;
                continue;
            }
            const tsSec = Number(evt?.timestamp || evt?.start_time || evt?.time || evt?.event_timestamp || 0);
            if (tsSec > 0) {
                const tsMs = tsSec * 1000;
                if (tsMs >= now - TOURNAMENT_ACTIVE_WINDOW_PAST_MS && tsMs <= now + TOURNAMENT_ACTIVE_WINDOW_FUTURE_MS) {
                    isActive = true;
                }
            }
        }
    }

    return { isActive, tournamentIds };
}

// Publish the active/idle classification per FlashScore tournament_id so that
// standings/top-scorers (fetched in the same request, with no match timestamps in
// their own payload) can pick the matching TTL. "true" is sticky within a request:
// an idle signal never downgrades a tournament another endpoint just marked active.
function publishTournamentActivity(tournamentIds: string[], isActive: boolean): void {
    for (const tid of tournamentIds) {
        const key = `${TOURNAMENT_ACTIVITY_MARKER_PREFIX}${tid}`;
        if (isActive) {
            memoryCache.set(key, true, CACHE_TTL_TOURNAMENTS);
        } else if (memoryCache.get<boolean>(key) !== true) {
            memoryCache.set(key, false, CACHE_TTL_TOURNAMENTS);
        }
    }
}

// TTL for endpoints whose payload has no match timestamps (standings/top-scorers):
// reuse the classification published by results/fixtures for the same tournament_id.
function resolveSiblingTournamentTtl(tournamentId: string): number {
    const marker = memoryCache.get<boolean>(`${TOURNAMENT_ACTIVITY_MARKER_PREFIX}${tournamentId}`);
    if (marker === true) return CACHE_TTL_TOURNAMENT_LIVE;
    if (marker === false) return CACHE_TTL_TOURNAMENTS;
    return CACHE_TTL_TOURNAMENT_ACTIVITY_UNKNOWN; // not yet classified → re-check soon
}

// Root is Array of Tournaments: { tournament_id, name, country_name, matches: Array<Match> }
// Match is: { match_id, is_finished, ... }

export async function getFlashScoreMatchesRaw(
    dayOffset: number,
    sportId: string | number,
    timeZone?: string,
    options: { bypassCache?: boolean; lane?: ApiLane } = {}
): Promise<any> {
    if (isFootballSport(sportId)) {
        if (isSofaScoreServiceConfigured()) {
            const target = new Date(Date.now() + dayOffset * 86400000);
            const targetDateKey = formatDateKey(target, timeZone);
            const raw = await getSofaScoreFootballMatchesRaw(target, { timeZone, targetDateKey });
            return raw ?? { DATA: [] };
        }
        // SofaScore is the sole football provider — never fall through to
        // FlashScore. Returning an empty payload keeps the contract of
        // getFlashScoreMatchesRaw stable for downstream code.
        return { DATA: [] };
    }

    if (!isFlashScoreEnabledForSport(sportId)) {
        return [];
    }

    // Determine the numeric sport ID
    let flashScoreSportId = 1;
    if (typeof sportId === 'string') {
        flashScoreSportId = SPORT_MAPPING[sportId] || parseInt(sportId) || 1;
    } else {
        flashScoreSportId = sportId;
    }

    if (!isMatchesListDayOffsetSupported(dayOffset)) {
        throw new Error(`FlashScore matches/list only supports day offsets within +/-${MATCHES_LIST_DAY_OFFSET_LIMIT}.`);
    }

    // Check cache first (include timezone in cache key)
    const cacheKey = `${MATCHES_LIST_CACHE_PREFIX}-${dayOffset}-${flashScoreSportId}-${timeZone || 'default'}`;
    if (!options.bypassCache) {
        const cached = memoryCache.get<any>(cacheKey);
        if (cached) {
            return cached;
        }
    }

    // Deduplicate: if same request is already in-flight, share the promise
    const inflight = inflightRequests.get(cacheKey);
    if (inflight) return inflight;

    const promise = (async () => {
        await acquireSlot(options.lane);
        try {
            let url = `https://${API_HOST}/api/flashscore/v2/matches/list?day=${dayOffset}&sport_id=${flashScoreSportId}`;
            if (timeZone) {
                url += `&timezone=${encodeURIComponent(timeZone)}`;
            }

            // Dynamic Cache TTL logic
            // User requirement: Cache duration 30s if match is within 120m of start in Rugby.
            // Simplified: If fetching for Rugby (8) and day is effectively today (-1 to 1 range), use 30s.
            let dynamicTtl = CACHE_TTL_MATCHES;
            const isRugby = flashScoreSportId === 8 || flashScoreSportId === 19;
            const isApproximatelyToday = Math.abs(dayOffset) <= 1;

            if (isRugby && isApproximatelyToday) {
                dynamicTtl = 30;
            }

            const { data } = await apiFetch<any>(url, {
                headers: { 'x-rapidapi-host': API_HOST, 'x-rapidapi-key': API_KEY },
                debugTag: 'MatchesListRaw',
                silent: true,
                cacheTtl: 0
            });

            if (data) {
                const matchCount = countFlashScoreRawMatches(data);
                if (matchCount > 0) {
                    memoryCache.set(cacheKey, data, dynamicTtl);
                }
            }

            return data;
        } finally {
            releaseSlot(options.lane);
            inflightRequests.delete(cacheKey);
        }
    })();

    inflightRequests.set(cacheKey, promise);
    return promise;
}

async function getFlashScoreMatchesRawWithEmptyRetry(
    dayOffset: number,
    sportId: string | number,
    timeZone?: string,
): Promise<any> {
    const first = await getFlashScoreMatchesRaw(dayOffset, sportId, timeZone);
    if (countFlashScoreRawMatches(first) > 0) return first;

    await delay(150);
    return getFlashScoreMatchesRaw(dayOffset, sportId, timeZone, { bypassCache: true });
}

// formatDateKey is now imported from @/lib/timezone

export async function getFlashScoreMatches(
    date: Date,
    sportId: string,
    options?: { timeZone?: string; targetDateKey?: string }
): Promise<Match[]> {
    if (sportId === 'american-football') {
        return getEspnAmericanFootballMatches(date, options);
    }

    if (sportId === 'motorsport') {
        return getEspnMotorsportMatches(date, options);
    }

    if (isFootballSport(sportId)) {
        return getEspnFootballMatches(date, options);
    }

    const timeZone = options?.timeZone;
    const targetDateKey = options?.targetDateKey || formatDateKey(date, timeZone);

    // Calculate day offset using timezone-aware dates so that "today" is
    // correctly resolved in the user's timezone, not in UTC.
    const dayOffset = getDayOffsetForDateKey(targetDateKey, timeZone);

    // Fetch the target day + one adjacent day to catch matches near the
    // UTC midnight boundary that belong to a different local day.
    // e.g. 00:00 UTC = 21:00 UTC-3 (previous day in Argentina).
    const adjacentOffset = getAdjacentDayOffset(timeZone);
    const offsets = isMatchesListDayOffsetSupported(dayOffset) ? [dayOffset] : [];
    const adj = dayOffset + adjacentOffset;
    if (isMatchesListDayOffsetSupported(adj)) offsets.push(adj);

    // When the caller requests generic 'rugby', fetch both Rugby Union (8) and
    // Rugby League (19) in parallel so that both appear on the same page.
    const rawFetches: Array<[number, string]> =
        sportId === 'rugby'
            ? offsets.flatMap(o => ([[o, 'rugby-union'], [o, 'rugby-league']] as [number, string][]))
            : offsets.map(o => [o, sportId] as [number, string]);

    const results = await Promise.all(
        rawFetches.map(([o, sid]) => getFlashScoreMatchesRawWithEmptyRetry(o, sid, timeZone))
    );

    // Tell a real "no matches" day apart from an upstream failure. apiFetch never
    // throws (it returns data:null on timeout/5xx), so getFlashScoreMatchesRaw
    // surfaces a failed request as `null` here. If EVERY underlying request failed
    // we must throw so the caller treats it as a FlashScore outage — cache fallback
    // + explicit error — instead of silently rendering (and caching) an empty list
    // as if the provider legitimately had zero matches. This hit rugby hardest: it
    // fans out to union + league × 2 days, so the odds of the whole batch failing
    // (or the function timing out) are much higher than for single-endpoint sports.
    if (rawFetches.length > 0 && results.every((data) => data == null)) {
        throw new Error('FlashScore matches/list failed for all requests');
    }

    let allMatches: Match[] = [];
    const seenMatchIds = new Set<string>();

    results.forEach((data, idx) => {
        if (data == null) return;
        const effectiveSportId = rawFetches[idx][1];
        const tournaments = getFlashScoreRawTournamentList(data);

        tournaments.forEach((tournament: any) => {
            const context = buildTournamentContext(tournament);

            if (tournament.matches && Array.isArray(tournament.matches)) {
                const tournamentMatches = tournament.matches
                    // C5: drop events without a stable provider ID — never invent one.
                    .filter((evt: any) => hasStableEventId(evt))
                    .map((evt: any) => mapEventToMatch(evt, effectiveSportId, context))
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
    if (sportId === 'american-football') {
        return getEspnAmericanFootballLiveMatches();
    }

    if (sportId === 'motorsport') {
        return getEspnMotorsportLiveMatches();
    }

    if (isFootballSport(sportId)) {
        return getEspnFootballLiveMatches();
    }

    if (!isFlashScoreEnabledForSport(sportId)) {
        return [];
    }

    // For generic 'rugby', fetch both union (8) and league (19) live endpoints.
    if (sportId === 'rugby') {
        const combinedCacheKey = 'matches-live-rugby-combined';
        const cached = memoryCache.get<Match[]>(combinedCacheKey);
        if (cached) return cached;

        const [unionMatches, leagueMatches] = await Promise.all([
            getFlashScoreLiveMatches('rugby-union'),
            getFlashScoreLiveMatches('rugby-league'),
        ]);

        const seenIds = new Set<string>();
        const merged: Match[] = [];
        for (const m of [...unionMatches, ...leagueMatches]) {
            const key = m.id.toString();
            if (!seenIds.has(key)) { seenIds.add(key); merged.push(m); }
        }

        memoryCache.set(combinedCacheKey, merged, CACHE_TTL_LIVE);
        return merged;
    }

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
        const context = buildTournamentContext(tournament);

        if (tournament.matches && Array.isArray(tournament.matches)) {
            const tournamentMatches = tournament.matches
                // C5: drop events without a stable provider ID — never invent one.
                .filter((evt: any) => hasStableEventId(evt))
                .map((evt: any) => mapEventToMatch(evt, sportId, context));
            liveMatches = liveMatches.concat(tournamentMatches);
        }
    });

    // Store in cache
    memoryCache.set(cacheKey, liveMatches, CACHE_TTL_LIVE);

    return liveMatches;
}

// C5: an event without match_id/event_key cannot be persisted or deduplicated;
// callers must filter these out instead of inventing a random ID.
function hasStableEventId(evt: any): boolean {
    return Boolean(evt?.match_id || evt?.event_key);
}

// B12: explicit API states that mean "not playing" (suspended / interrupted /
// postponed / abandoned / delayed). mapStatus maps some of these to a fallback
// 'scheduled', so the time-based heuristics below must check the raw tokens and
// never override them.
function hasExplicitHaltedStatusToken(evt: any): boolean {
    const tokens = [
        evt?.match_status?.type,
        evt?.match_status?.stage,
        evt?.match_status?.code,
        evt?.status,
    ].map(normalizeStatusToken);
    return tokens.some((token) =>
        token.includes('susp')
        || token.includes('interrup')
        || token.includes('postpon')
        || token.includes('abandon')
        || token.includes('delay')
        || token.includes('aplazado')
        || token.includes('suspendido')
    );
}

// matches/list emits one group per STAGE, and the `tournament_id` it reports there
// is really the tournament_stage_id (lowercased). The only field every stage of a
// competition shares is `tournament_url`, so that URL — not the id — is the
// canonical tournament identity. See splitFlashScoreStageName for the display side.
const STAGE_QUALIFIER = 'losers|winners|championship|relegation|promotion|placement|classification|qualification|main|regular|final';
const STAGE_KIND = 'stage|group|round|season|phase|play[\\s-]?(?:offs?|in|out)';
const STAGE_SUFFIX_RE = new RegExp(
    `\\s*[-–]\\s*(\\d+(?:st|nd|rd|th)-\\d+(?:st|nd|rd|th)\\s+places?|(?:${STAGE_QUALIFIER})(?:\\s+(?:${STAGE_KIND}))?|${STAGE_KIND})\\s*$`,
    'i',
);

/**
 * Splits "WORLD: World Championship U20 - Play Offs" into the competition name and
 * its stage. Only strips suffixes that match FlashScore's stage vocabulary, so a
 * competition whose real name contains a dash is left untouched.
 */
export function splitFlashScoreStageName(name: string): { baseName: string; stageName: string } {
    const raw = String(name || '').trim();
    const match = raw.match(STAGE_SUFFIX_RE);
    if (!match || match.index == null) return { baseName: raw, stageName: '' };
    const baseName = raw.slice(0, match.index).trim();
    if (!baseName) return { baseName: raw, stageName: '' };
    return { baseName, stageName: match[1].trim() };
}

function readTournamentUrl(tournament: any): string {
    const raw = tournament?.tournament_url || tournament?.url || tournament?.link || '';
    return typeof raw === 'string' ? raw.trim() : '';
}

type TournamentContext = {
    leagueName: string;
    countryName: string;
    leagueId: string;
    leagueUrl?: string;
    leagueStageName?: string;
    leagueLogo?: string;
};

/** Builds the per-tournament context shared by the list and live mappers. */
function buildTournamentContext(tournament: any): TournamentContext {
    const rawName = tournament?.name || tournament?.league_name || 'Unknown League';
    const { baseName, stageName } = splitFlashScoreStageName(rawName);
    return {
        leagueName: baseName || rawName,
        countryName: tournament?.country_name || 'International',
        leagueId: tournament?.tournament_id,
        leagueUrl: readTournamentUrl(tournament) || undefined,
        leagueStageName: stageName || undefined,
        leagueLogo: tournament?.image_path || tournament?.logo || tournament?.image || undefined,
    };
}

function mapEventToMatch(evt: any, sportId: string, context: TournamentContext): Match {
    // Structure based on provided User JSON:
    // evt = { match_id: "...", match_status: { is_finished: bool, is_started: bool, ... }, timestamp: 123456, home_team: { name: "...", short_name: "..." }, away_team: { name: "..." }, scores: { home: 1, away: 2 } }

    const status = mapStatus(evt.match_status, evt.status);

    const homeScore = evt.scores?.home ?? null;
    const awayScore = evt.scores?.away ?? null;
    // Penalty shootout result, when the feed provides it (present in match
    // details `scores`, absent from the lighter list payload).
    const homePenalties = evt.scores?.home_penalties;
    const awayPenalties = evt.scores?.away_penalties;
    const penalties = typeof homePenalties === 'number' && typeof awayPenalties === 'number'
        ? { home: homePenalties, away: awayPenalties }
        : null;

    const timestamp = evt.timestamp || evt.start_time || evt.time || evt.event_timestamp;
    const scheduledAt = timestamp ? new Date(timestamp * 1000) : new Date();

    const homeTeamName = evt.home_team?.name || evt.event_home_team?.name || evt.home_team_name || 'Home Team';
    const awayTeamName = evt.away_team?.name || evt.event_away_team?.name || evt.away_team_name || 'Away Team';

    const homeTeamId = `fs-team-${evt.home_team?.team_id || evt.home_team?.id || 'h'}`;
    const awayTeamId = `fs-team-${evt.away_team?.team_id || evt.away_team?.id || 'a'}`;

    const finalMatch: Match = {
        // C5: callers pre-filter with hasStableEventId — never invent a random ID here.
        id: evt.match_id || evt.event_key,
        tournamentId: `fs-${context.leagueId || 'unknown'}`,
        leagueName: context.leagueName,
        countryName: context.countryName,
        leagueUrl: context.leagueUrl,
        leagueStageName: context.leagueStageName,
        leagueLogo: context.leagueLogo,

        phaseId: 'group',
        round: 1,

        homeTeamId: homeTeamId,
        homeTeamName: homeTeamName,

        awayTeamId: awayTeamId,
        awayTeamName: awayTeamName,

        homeTeamLogo: evt.home_team?.image_path || evt.home_team?.small_image_path || evt.home_team?.smaill_image_path || evt.home_team?.logo || evt.home_team?.player_image || '',
        awayTeamLogo: evt.away_team?.image_path || evt.away_team?.small_image_path || evt.away_team?.smaill_image_path || evt.away_team?.logo || evt.away_team?.player_image || '',
        homeTeamImagePath: evt.home_team?.image_path || evt.home_team?.small_image_path || evt.home_team?.smaill_image_path || evt.home_team?.player_image || '',
        awayTeamImagePath: evt.away_team?.image_path || evt.away_team?.small_image_path || evt.away_team?.smaill_image_path || evt.away_team?.player_image || '',
        homeTeamUrl: evt.home_team?.team_url || evt.home_team?.player_url || '',
        awayTeamUrl: evt.away_team?.team_url || evt.away_team?.player_url || '',

        currentMinute: evt.match_status?.stage || undefined,

        scheduledAt: scheduledAt,
        venueName: evt.venue || undefined,

        status: status,
        score: {
            home: typeof homeScore === 'number' ? homeScore : null,
            away: typeof awayScore === 'number' ? awayScore : null,
            penalties
        },
        result: { isComplete: status === 'final', updatedAt: new Date(), updatedBy: 'flashscore', version: 1 },
        createdFrom: 'generator',
        createdAt: new Date(),
        updatedAt: new Date()
    };

    // B12: both heuristics below only apply when the API state is unknown/absent —
    // an explicit suspended/interrupted/postponed/abandoned token must win.
    const apiReportsHaltedState = hasExplicitHaltedStatusToken(evt);

    // Fix for matches that have scores but bad status flags (API list view often lacks live flags)
    // If we have scores, no finish flag, and match started recently (< 5 hours), force LIVE.
    if (!apiReportsHaltedState && finalMatch.status === 'scheduled' && typeof homeScore === 'number' && typeof awayScore === 'number') {
        const isFinished = evt.match_status?.is_finished || false;
        const now = Date.now();
        const matchTime = scheduledAt.getTime();
        const hoursSinceStart = (now - matchTime) / (1000 * 60 * 60);

        if (!isFinished && hoursSinceStart > 0 && hoursSinceStart < 5) {
            finalMatch.status = 'live';
        }
    }

    // New Request: If Rugby match > 100 minutes since start, force finalize as 'pending result'
    const flashScoreSportId = SPORT_MAPPING[sportId] || parseInt(sportId) || 1;
    const isRugbyVariant = flashScoreSportId === 8 || flashScoreSportId === 19;
    if (isRugbyVariant && !apiReportsHaltedState && finalMatch.status !== 'final' && finalMatch.status !== 'postponed' && finalMatch.status !== 'cancelled') {
        const now = Date.now();
        const matchTime = scheduledAt.getTime();
        const minutesSinceStart = (now - matchTime) / (1000 * 60);

        if (minutesSinceStart > 100) {
            finalMatch.status = 'final';
            finalMatch.result.isComplete = true;
            // We consider it final because it exceeded time limits, even if API didn't confirm
        }
    }

    return finalMatch;
}

function normalizeStatusToken(value: unknown): string {
    return String(value || '').trim().toLowerCase();
}

function isFinalStatusToken(value: unknown): boolean {
    const token = normalizeStatusToken(value);
    return token === 'ft'
        || token === 'full time'
        || token === 'finished'
        || token === 'final'
        || token === 'ended'
        || token === 'after extra time'
        || token === 'after penalties'
        || token === 'aet'
        || token === 'pen'
        || token.includes('finished')
        || token.includes('full time')
        || token.includes('after penalties')
        || token.includes('after extra time');
}

function isLiveStatusToken(value: unknown): boolean {
    const token = normalizeStatusToken(value);
    if (!token) return false;

    const liveIndicators = [
        'live', 'playing', 'current', 'inprogress',
        '1st half', '2nd half', '1st period', '2nd period', '3rd period',
        '1st quarter', '2nd quarter', '3rd quarter', '4th quarter',
        'set 1', 'set 2', 'set 3', 'set 4', 'set 5',
        'inning', 'batting', 'fielding',
        'timeout', 'break', 'halftime', 'ht', 'pause',
        'q1', 'q2', 'q3', 'q4', 'ot'
    ];

    return liveIndicators.some((indicator) => token.includes(indicator));
}

export function mapStatus(matchStatusObj: any, simpleStatus?: string): MatchStatus {
    if (matchStatusObj) {
        const type = normalizeStatusToken(matchStatusObj.type);
        const stage = normalizeStatusToken(matchStatusObj.stage);
        const code = normalizeStatusToken(matchStatusObj.code);

        if (type === 'inprogress') return 'live';
        if (type === 'finished') return 'final';
        if (type === 'postponed') return 'postponed';
        if (type === 'canceled' || type === 'cancelled') return 'cancelled';

        if (matchStatusObj.is_finished) return 'final';
        if (matchStatusObj.is_postponed) return 'postponed';
        if (matchStatusObj.is_cancelled) return 'cancelled';
        if (matchStatusObj.is_in_progress) return 'live';

        if (isFinalStatusToken(stage) || isFinalStatusToken(code)) return 'final';
        if (isLiveStatusToken(stage) || isLiveStatusToken(code)) return 'live';

        if (matchStatusObj.is_started) {
            return isFinalStatusToken(stage) || isFinalStatusToken(code) ? 'final' : 'live';
        }
    }

    const normalizedSimpleStatus = normalizeStatusToken(simpleStatus);

    if (isFinalStatusToken(normalizedSimpleStatus)) return 'final';
    if (isLiveStatusToken(normalizedSimpleStatus)) return 'live';

    if (normalizedSimpleStatus.includes('postponed') || normalizedSimpleStatus.includes('aplazado')) return 'postponed';
    if (normalizedSimpleStatus.includes('cancelled') || normalizedSimpleStatus.includes('cancelado') || normalizedSimpleStatus.includes('abandoned')) return 'cancelled';

    return 'scheduled';
}

// --- New Detail Endpoints ---

function isSofaScoreMatchId(matchId: string): boolean {
    return typeof matchId === 'string' && matchId.startsWith(SOFASCORE_MATCH_PREFIX);
}

export async function getFlashScoreMatchDetails(matchId: string) {
    if (isSofaScoreMatchId(matchId) && isSofaScoreServiceConfigured()) {
        return getSofaScoreMatchDetails(matchId);
    }

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

// Hard cap on how many match-details lookups a single penalty-enrichment pass
// may trigger. Keeps the tournament route bounded; the shared `default` API lane
// (3-wide) throttles the burst and results are cached for CACHE_TTL_DETAILS.
const MAX_PENALTY_ENRICHMENT = 16;

export type PenaltyInfo = {
    regHome: number | null;
    regAway: number | null;
    penalties: { home: number; away: number };
};

/**
 * The lighter results / fixtures / draw payloads carry only the regulation
 * score — never the shootout. For a set of match IDs (caller pre-filters to the
 * level/finished ones that could have gone to penalties), pull each match's
 * details and return the regulation score + penalties for those actually decided
 * on penalties. Best-effort: matches that error or had no shootout are omitted.
 */
export async function fetchPenaltyInfoForMatchIds(
    matchIds: Array<string | number | null | undefined>,
): Promise<Map<string, PenaltyInfo>> {
    const out = new Map<string, PenaltyInfo>();
    const ids = Array.from(
        new Set(matchIds.map((v) => (v == null ? '' : String(v))).filter(Boolean)),
    ).slice(0, MAX_PENALTY_ENRICHMENT);

    if (ids.length === 0) return out;

    await Promise.all(ids.map(async (id) => {
        try {
            const details = await getFlashScoreMatchDetails(id);
            const evt = details?.DATA?.EVENT || details;
            const sc = evt?.scores as Record<string, unknown> | undefined;
            const ph = sc?.home_penalties;
            const pa = sc?.away_penalties;
            if (typeof ph === 'number' && typeof pa === 'number') {
                out.set(id, {
                    regHome: typeof sc?.home === 'number' ? sc.home as number : null,
                    regAway: typeof sc?.away === 'number' ? sc.away as number : null,
                    penalties: { home: ph, away: pa },
                });
            }
        } catch {
            /* best-effort: skip matches we couldn't enrich */
        }
    }));

    return out;
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
    if (isSofaScoreMatchId(matchId) && isSofaScoreServiceConfigured()) {
        return getSofaScoreMatchStats(matchId);
    }

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
    if (isSofaScoreMatchId(matchId) && isSofaScoreServiceConfigured()) {
        return getSofaScoreMatchLineups(matchId);
    }

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
    if (isSofaScoreMatchId(matchId) && isSofaScoreServiceConfigured()) {
        return getSofaScoreMatchH2H(matchId);
    }

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

    const normalized = normalizeFlashScoreTournamentDetails(data);
    if (normalized) memoryCache.set(cacheKey, normalized, CACHE_TTL_TOURNAMENTS);
    return normalized;
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
        cacheTtl: 0
    });

    if (data) {
        const { isActive, tournamentIds } = resolveTournamentActivity(data);
        publishTournamentActivity(tournamentIds, isActive);
        memoryCache.set(cacheKey, data, isActive ? CACHE_TTL_TOURNAMENT_LIVE : CACHE_TTL_TOURNAMENTS);
    }
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
        cacheTtl: 0
    });

    if (data) {
        const { isActive, tournamentIds } = resolveTournamentActivity(data);
        publishTournamentActivity(tournamentIds, isActive);
        memoryCache.set(cacheKey, data, isActive ? CACHE_TTL_TOURNAMENT_LIVE : CACHE_TTL_TOURNAMENTS);
    }
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
        cacheTtl: 0
    });

    if (data) memoryCache.set(cacheKey, data, resolveSiblingTournamentTtl(tournamentId));
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
        cacheTtl: 0
    });

    if (data) memoryCache.set(cacheKey, data, resolveSiblingTournamentTtl(tournamentId));
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
        cacheTtl: 0
    });

    if (data) memoryCache.set(cacheKey, data, resolveSiblingTournamentTtl(tournamentId));
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
        cacheTtl: 0
    });

    if (data) memoryCache.set(cacheKey, data, resolveSiblingTournamentTtl(tournamentId));
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
        cacheTtl: 0
    });

    if (data) memoryCache.set(cacheKey, data, resolveSiblingTournamentTtl(tournamentId));
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

export async function getTournamentDraw(tournamentId: string, stageId: string) {
    const cacheKey = `tournament-draw-${tournamentId}-${stageId}`;
    const cached = memoryCache.get<any>(cacheKey);
    if (cached) return cached;

    const url = `https://${API_HOST}/api/flashscore/v2/tournaments/draw?tournament_id=${tournamentId}&tournament_stage_id=${stageId}`;
    const { data } = await apiFetch<any>(url, {
        headers: { 'x-rapidapi-host': API_HOST, 'x-rapidapi-key': API_KEY },
        debugTag: 'TournamentDraw',
        silent: true,
        cacheTtl: 0
    });

    if (data) {
        // Self-classify from the bracket payload; don't publish the activity marker so
        // a draw with an unparseable shape can't downgrade results/fixtures' signal.
        const { isActive } = resolveTournamentActivity(data);
        memoryCache.set(cacheKey, data, isActive ? CACHE_TTL_TOURNAMENT_LIVE : CACHE_TTL_TOURNAMENTS);
    }
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
    if (cached !== undefined && cached !== null && !(Array.isArray(cached) && cached.length === 0)) return cached;

    const url = `https://${API_HOST}/api/flashscore/v2/teams/results?team_id=${teamId}&page=${page}`;
    const { data } = await apiFetch<any>(url, {
        headers: { 'x-rapidapi-host': API_HOST, 'x-rapidapi-key': API_KEY },
        debugTag: 'TeamResults',
        silent: true,
        cacheTtl: CACHE_TTL_TEAMS
    });

    if (data && !(Array.isArray(data) && data.length === 0)) memoryCache.set(cacheKey, data, CACHE_TTL_TEAMS);
    return data;
}

export async function getTeamFixtures(teamId: string, page: number = 1) {
    const cacheKey = `team-fixtures-${teamId}-${page}`;
    const cached = memoryCache.get<any>(cacheKey);
    if (cached !== undefined && cached !== null && !(Array.isArray(cached) && cached.length === 0)) return cached;

    const url = `https://${API_HOST}/api/flashscore/v2/teams/fixtures?team_id=${teamId}&page=${page}`;
    const { data } = await apiFetch<any>(url, {
        headers: { 'x-rapidapi-host': API_HOST, 'x-rapidapi-key': API_KEY },
        debugTag: 'TeamFixtures',
        silent: true,
        cacheTtl: CACHE_TTL_TEAMS
    });

    if (data && !(Array.isArray(data) && data.length === 0)) memoryCache.set(cacheKey, data, CACHE_TTL_TEAMS);
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

// --- Tournament Ingestion Discovery Endpoints ---

/**
 * Get list of available sports from the API
 */
export async function getSports() {
    const cacheKey = 'flashscore-sports-list';
    const cached = memoryCache.get<any>(cacheKey);
    if (cached) return cached;

    const url = `https://${API_HOST}/api/flashscore/v2/sports/list`;
    const { data } = await apiFetch<any>(url, {
        headers: { 'x-rapidapi-host': API_HOST, 'x-rapidapi-key': API_KEY },
        debugTag: 'SportsList',
        silent: true,
        cacheTtl: CACHE_TTL_TOURNAMENTS
    });

    if (data) memoryCache.set(cacheKey, data, CACHE_TTL_TOURNAMENTS);
    return data;
}

function extractFlashScoreList<T>(payload: any): T[] {
    if (Array.isArray(payload)) return payload as T[];
    if (!payload || typeof payload !== 'object') return [];

    if (Array.isArray(payload.data)) return payload.data as T[];
    if (Array.isArray(payload.DATA)) return payload.DATA as T[];
    if (Array.isArray(payload.countries)) return payload.countries as T[];
    if (Array.isArray(payload.tournaments)) return payload.tournaments as T[];
    if (Array.isArray(payload.results)) return payload.results as T[];

    return [];
}

function normalizeFlashScoreCountryList(payload: any) {
    return {
        data: extractFlashScoreList<any>(payload)
            .map((country) => ({
                country_id: country?.country_id ?? country?.id ?? null,
                id: country?.id ?? country?.country_id ?? null,
                name: country?.name ?? country?.country_name ?? '',
                flag: country?.flag ?? country?.flag_emoji ?? country?.flagEmoji ?? null,
                tournament_count:
                    typeof country?.tournaments_count === 'number' ? country.tournaments_count :
                    typeof country?.tournamentsCount === 'number' ? country.tournamentsCount :
                    typeof country?.league_count === 'number' ? country.league_count :
                    typeof country?.leagueCount === 'number' ? country.leagueCount :
                    typeof country?.competitions_count === 'number' ? country.competitions_count :
                    typeof country?.competitionsCount === 'number' ? country.competitionsCount :
                    typeof country?.count === 'number' ? country.count :
                    null,
            }))
            .filter((country) => country.country_id != null && country.name),
    };
}

function normalizeFlashScoreTournamentList(payload: any) {
    return {
        data: extractFlashScoreList<any>(payload)
            .map((tournament) => ({
                tournament_id:
                    tournament?.tournament_id ??
                    tournament?.id ??
                    tournament?.tournament?.id ??
                    null,
                tournament_stage_id:
                    tournament?.tournament_stage_id ??
                    tournament?.stage_id ??
                    tournament?.stageId ??
                    tournament?.tournament_stage?.id ??
                    null,
                name:
                    tournament?.name ??
                    tournament?.tournament_name ??
                    tournament?.league_name ??
                    '',
                image:
                    tournament?.image ??
                    tournament?.logo ??
                    tournament?.image_path ??
                    tournament?.logo_url ??
                    null,
                logo:
                    tournament?.logo ??
                    tournament?.image ??
                    tournament?.logo_url ??
                    tournament?.image_path ??
                    null,
                url:
                    tournament?.url ??
                    tournament?.link ??
                    tournament?.tournament_url ??
                    null,
                link:
                    tournament?.link ??
                    tournament?.url ??
                    tournament?.tournament_url ??
                    null,
                country_id:
                    tournament?.country_id ??
                    tournament?.country?.id ??
                    null,
            }))
            .filter((tournament) => (tournament.tournament_id != null || tournament.url) && tournament.name),
    };
}

function pickFlashScoreTournamentLogo(source: any): string | null {
    const candidate =
        source?.logo_url ??
        source?.logo ??
        source?.image ??
        source?.image_path ??
        source?.logo_path ??
        source?.league_logo ??
        source?.current_league_logo ??
        source?.tournament_logo ??
        source?.tournament_image_path ??
        source?.league?.logo ??
        source?.league?.image ??
        source?.league?.logo_url ??
        source?.competition?.logo ??
        source?.competition?.image ??
        source?.competition?.logo_url ??
        source?.tournament?.logo ??
        source?.tournament?.image ??
        source?.tournament?.logo_url ??
        null;

    return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : null;
}

function normalizeFlashScoreTournamentDetails(payload: any) {
    const data = payload?.DATA || payload;
    if (!data || typeof data !== 'object') return payload;

    const resolvedLogo = pickFlashScoreTournamentLogo(data);
    const resolvedName =
        (typeof data.name === 'string' && data.name.trim() ? data.name.trim() : null) ||
        (typeof data.tournament_name === 'string' && data.tournament_name.trim() ? data.tournament_name.trim() : null) ||
        (typeof data.league_name === 'string' && data.league_name.trim() ? data.league_name.trim() : null) ||
        (typeof data.display_name === 'string' && data.display_name.trim() ? data.display_name.trim() : null) ||
        (typeof data.tournament?.name === 'string' && data.tournament.name.trim() ? data.tournament.name.trim() : null) ||
        (typeof data.league?.name === 'string' && data.league.name.trim() ? data.league.name.trim() : null) ||
        null;

    return {
        ...payload,
        ...(payload?.DATA && typeof payload.DATA === 'object'
            ? {
                DATA: {
                    ...payload.DATA,
                    ...(resolvedName ? { name: resolvedName, display_name: resolvedName } : {}),
                    ...(resolvedLogo
                        ? {
                            logo_url: resolvedLogo,
                            logo: resolvedLogo,
                            image: resolvedLogo,
                            image_path: resolvedLogo,
                            logo_path: resolvedLogo,
                            tournament_logo: resolvedLogo,
                            tournament_image_path: resolvedLogo,
                            league_logo: resolvedLogo,
                            current_league_logo: resolvedLogo,
                        }
                        : {}),
                },
            }
            : {}),
        ...(resolvedName ? { name: resolvedName, display_name: resolvedName } : {}),
        ...(resolvedLogo
            ? {
                logo_url: resolvedLogo,
                logo: resolvedLogo,
                image: resolvedLogo,
                image_path: resolvedLogo,
                logo_path: resolvedLogo,
                tournament_logo: resolvedLogo,
                tournament_image_path: resolvedLogo,
                league_logo: resolvedLogo,
                current_league_logo: resolvedLogo,
            }
            : {}),
    };
}

/**
 * Get countries associated with a sport
 */
export async function getCountriesBySport(sportId: string | number) {
    const flashScoreSportId = typeof sportId === 'string' ? (SPORT_MAPPING[sportId] || parseInt(sportId)) : sportId;
    const cacheKey = `countries-by-sport-${flashScoreSportId}`;
    const cached = memoryCache.get<any>(cacheKey);
    if (cached) return cached;

    const headers = { 'x-rapidapi-host': API_HOST, 'x-rapidapi-key': API_KEY };
    const primaryUrl = `https://${API_HOST}/api/flashscore/v2/general/countries?sport_id=${flashScoreSportId}`;
    const fallbackUrl = `https://${API_HOST}/api/flashscore/v2/countries/list?sport_id=${flashScoreSportId}`;

    try {
        const { data } = await apiFetch<any>(primaryUrl, {
            headers,
            debugTag: 'GeneralCountriesBySport',
            silent: true,
            cacheTtl: CACHE_TTL_CATALOG,
        });
        const normalized = normalizeFlashScoreCountryList(data);
        if (normalized.data.length > 0) {
            memoryCache.set(cacheKey, normalized, CACHE_TTL_CATALOG);
            return normalized;
        }
    } catch {
        // Fall through to legacy endpoint.
    }

    const { data } = await apiFetch<any>(fallbackUrl, {
        headers,
        debugTag: 'CountriesBySport',
        silent: true,
        cacheTtl: CACHE_TTL_CATALOG,
    });

    const normalized = normalizeFlashScoreCountryList(data);
    if (normalized.data.length > 0) {
        memoryCache.set(cacheKey, normalized, CACHE_TTL_CATALOG);
    }

    return normalized;
}

/**
 * Get tournaments by sport and entity (country or continental ID)
 */
export async function getTournamentsBySportAndEntity(sportId: string | number, entityId: string | number) {
    const flashScoreSportId = typeof sportId === 'string' ? (SPORT_MAPPING[sportId] || parseInt(sportId)) : sportId;
    const cacheKey = `tournaments-by-entity-${flashScoreSportId}-${entityId}`;
    const cached = memoryCache.get<any>(cacheKey);
    if (cached) return cached;

    const headers = { 'x-rapidapi-host': API_HOST, 'x-rapidapi-key': API_KEY };
    const primaryUrl = `https://${API_HOST}/api/flashscore/v2/general/tournaments?country_id=${entityId}&sport_id=${flashScoreSportId}`;
    const fallbackUrl = `https://${API_HOST}/api/flashscore/v2/tournaments/list?sport_id=${flashScoreSportId}&country_id=${entityId}`;

    try {
        const { data } = await apiFetch<any>(primaryUrl, {
            headers,
            debugTag: 'GeneralTournamentsByEntity',
            silent: true,
            cacheTtl: CACHE_TTL_CATALOG,
        });
        const normalized = normalizeFlashScoreTournamentList(data);
        if (normalized.data.length > 0) {
            memoryCache.set(cacheKey, normalized, CACHE_TTL_CATALOG);
            return normalized;
        }
    } catch {
        // Fall through to legacy endpoint.
    }

    const { data } = await apiFetch<any>(fallbackUrl, {
        headers,
        debugTag: 'TournamentsByEntity',
        silent: true,
        cacheTtl: CACHE_TTL_CATALOG,
    });

    const normalized = normalizeFlashScoreTournamentList(data);
    if (normalized.data.length > 0) {
        memoryCache.set(cacheKey, normalized, CACHE_TTL_CATALOG);
    }

    return normalized;
}

/**
 * Get seasons/archives for a tournament
 */
export async function getSeasonsByTournament(tournamentStageId: string) {
    // Reuse existing archives function as it provides the list of seasons
    return getTournamentArchives(tournamentStageId);
}

/**
 * Get fixtures for a specific tournament or season
 */
export async function getFixturesByTournamentOrSeason(tournamentTemplateId: string, seasonId: string, page: number = 1) {
    return getTournamentFixtures(tournamentTemplateId, seasonId, page);
}

// The provider exposes no search endpoint — /api/flashscore/v2/search answers
// "Endpoint does not exist" (404) — so there is nothing to call here. External
// tournaments and clubs are searched through our own indexes instead: see
// `externalTournamentCatalog` and the `external_teams` cache.
