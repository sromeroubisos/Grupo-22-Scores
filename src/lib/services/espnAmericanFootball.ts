import { apiFetch } from '@/lib/apiFetch';
import { memoryCache } from '@/lib/cache';
import type {
    ExternalMatchWithMapping,
    ExternalStandingsRow,
    MatchConfidence,
} from '@/lib/types/flashscore-integration';
import type { Match, MatchStatus } from '@/types/match';

export type EspnAmericanFootballLeagueSlug =
    | 'nfl'
    | 'college-football'
    | 'cfl'
    | 'ufl'
    | 'xfl';

type EspnAmericanFootballLeague = {
    slug: EspnAmericanFootballLeagueSlug;
    name: string;
    shortName: string;
    countryName: string;
    tournamentUrl: string;
    aliases: string[];
};

type EspnScoreboardEvent = Record<string, any>;
type EspnSummaryPayload = Record<string, any>;
type EspnStandingsPayload = Record<string, any>;

type EspnParticipant = {
    club_id: string;
    clubs: {
        id: string;
        name: string;
        short_name: string | null;
    };
};

const SCOREBOARD_CACHE_TTL = 300;
const MATCH_CACHE_TTL = 300;
const TEAM_CACHE_TTL = 1800;
const STANDINGS_CACHE_TTL = 1800;
const TEAM_SCHEDULE_RANGE_DAYS = 240;

const LEAGUES: Record<EspnAmericanFootballLeagueSlug, EspnAmericanFootballLeague> = {
    nfl: {
        slug: 'nfl',
        name: 'National Football League',
        shortName: 'NFL',
        countryName: 'USA',
        tournamentUrl: '/american-football/usa/nfl/',
        aliases: ['nfl'],
    },
    'college-football': {
        slug: 'college-football',
        name: 'College Football',
        shortName: 'NCAA',
        countryName: 'USA',
        tournamentUrl: '/american-football/usa/ncaa/',
        aliases: ['college-football', 'ncaa', 'ncaa football', 'ncaaf', 'college'],
    },
    cfl: {
        slug: 'cfl',
        name: 'Canadian Football League',
        shortName: 'CFL',
        countryName: 'Canada',
        tournamentUrl: '/american-football/canada/cfl/',
        aliases: ['cfl'],
    },
    ufl: {
        slug: 'ufl',
        name: 'United Football League',
        shortName: 'UFL',
        countryName: 'USA',
        tournamentUrl: '/american-football/usa/ufl/',
        aliases: ['ufl'],
    },
    xfl: {
        slug: 'xfl',
        name: 'XFL',
        shortName: 'XFL',
        countryName: 'USA',
        tournamentUrl: '/american-football/usa/xfl/',
        aliases: ['xfl'],
    },
};

export const SUPPORTED_ESPN_AMERICAN_FOOTBALL_LEAGUES = Object.values(LEAGUES);

function isRecord(value: unknown): value is Record<string, any> {
    return typeof value === 'object' && value !== null;
}

function normalizeString(value: unknown): string | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return String(value);
    }
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed || null;
}

function normalizeKey(value: unknown): string | null {
    const normalized = normalizeString(value);
    return normalized ? normalized.toLowerCase() : null;
}

function toDateOnly(date: Date) {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addDays(date: Date, days: number) {
    const next = new Date(date);
    next.setUTCDate(next.getUTCDate() + days);
    return next;
}

function formatEspnDate(date: Date) {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}${month}${day}`;
}

function parseDate(value: unknown): Date | null {
    const normalized = normalizeString(value);
    if (!normalized) return null;
    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getCompetitors(event: Record<string, any>) {
    const competition = Array.isArray(event.competitions) ? event.competitions[0] : null;
    const competitors = Array.isArray(competition?.competitors) ? competition.competitors : [];
    const home = competitors.find((competitor: any) => competitor?.homeAway === 'home') || competitors[0] || null;
    const away = competitors.find((competitor: any) => competitor?.homeAway === 'away') || competitors[1] || null;
    return { competition, competitors, home, away };
}

function getEspnLogo(entity: any): string {
    const logos = Array.isArray(entity?.logos) ? entity.logos : [];
    for (const logo of logos) {
        if (typeof logo?.href === 'string' && logo.href.trim()) {
            return logo.href.trim();
        }
    }
    if (typeof entity?.logo === 'string' && entity.logo.trim()) {
        return entity.logo.trim();
    }
    if (typeof entity?.href === 'string' && entity.href.trim()) {
        return entity.href.trim();
    }
    return '';
}

function getEspnTeamDisplayName(competitor: any) {
    return (
        competitor?.team?.displayName ||
        competitor?.team?.shortDisplayName ||
        competitor?.team?.name ||
        competitor?.displayName ||
        competitor?.name ||
        'Equipo'
    );
}

function getEspnTeamAbbreviation(competitor: any) {
    return (
        competitor?.team?.abbreviation ||
        competitor?.abbreviation ||
        competitor?.team?.shortDisplayName ||
        null
    );
}

function parseScore(value: unknown) {
    const raw = normalizeString(value);
    if (!raw) return null;
    const numeric = Number(raw);
    return Number.isFinite(numeric) ? numeric : null;
}

function getEspnWeekLabel(event: Record<string, any>) {
    if (typeof event?.week?.text === 'string' && event.week.text.trim()) {
        return event.week.text.trim();
    }
    if (typeof event?.week?.number === 'number') {
        return `Week ${event.week.number}`;
    }
    return 'General';
}

function mapEspnStatus(statusType: any): MatchStatus {
    const state = normalizeKey(statusType?.state);
    const description = normalizeKey(statusType?.description);
    const detail = normalizeKey(statusType?.detail);
    const shortDetail = normalizeKey(statusType?.shortDetail);

    if (state === 'post' || statusType?.completed) return 'final';
    if (state === 'in' || description === 'in progress') return 'live';
    if (description?.includes('postponed') || detail?.includes('postponed') || shortDetail?.includes('postponed')) return 'postponed';
    if (description?.includes('canceled') || description?.includes('cancelled')) return 'cancelled';
    return 'scheduled';
}

function getLeagueLogo(payload: Record<string, any> | null | undefined) {
    return (
        getEspnLogo(payload?.league) ||
        getEspnLogo(Array.isArray(payload?.leagues) ? payload.leagues[0] : null)
    );
}

function getLeagueSeason(payload: Record<string, any> | null | undefined) {
    const season =
        payload?.season?.year ??
        payload?.requestedSeason?.year ??
        payload?.header?.season?.year ??
        null;
    return typeof season === 'number' ? season : null;
}

function getLeagueStandingEntries(payload: EspnStandingsPayload | null | undefined) {
    const direct = Array.isArray(payload?.standings?.entries) ? payload.standings.entries : [];
    if (direct.length > 0) return direct;

    const children = Array.isArray(payload?.children) ? payload.children : [];
    return children.flatMap((child) => {
        const entries = Array.isArray(child?.standings?.entries) ? child.standings.entries : [];
        return entries.map((entry: any) => ({
            ...entry,
            _groupName: child?.name || child?.abbreviation || null,
        }));
    });
}

function getStatValue(stats: any[], names: string[]) {
    for (const stat of stats) {
        const statName = normalizeKey(stat?.name);
        if (!statName) continue;
        if (names.includes(statName)) {
            const numeric = Number(stat?.value);
            if (Number.isFinite(numeric)) return numeric;
        }
    }
    return null;
}

export function isEspnAmericanFootballLeagueSlug(value: unknown): value is EspnAmericanFootballLeagueSlug {
    const normalized = normalizeKey(value);
    return Boolean(normalized && normalized in LEAGUES);
}

export function getEspnAmericanFootballLeague(slug: EspnAmericanFootballLeagueSlug) {
    return LEAGUES[slug];
}

export function toEspnAmericanFootballTournamentId(leagueSlug: EspnAmericanFootballLeagueSlug) {
    return `espn-league-${leagueSlug}`;
}

export function parseEspnAmericanFootballTournamentId(value: unknown): EspnAmericanFootballLeagueSlug | null {
    const normalized = normalizeKey(value);
    if (!normalized?.startsWith('espn-league-')) return null;
    const slug = normalized.slice('espn-league-'.length);
    return isEspnAmericanFootballLeagueSlug(slug) ? slug : null;
}

export function toEspnAmericanFootballTeamId(teamId: string | number) {
    return `espn-team-${String(teamId)}`;
}

export function parseEspnAmericanFootballTeamId(value: unknown) {
    const normalized = normalizeString(value);
    if (!normalized) return null;
    const match = /^espn-team-(\d+)$/i.exec(normalized);
    return match?.[1] || null;
}

export function toEspnAmericanFootballMatchId(matchId: string | number) {
    return `espn-game-${String(matchId)}`;
}

export function parseEspnAmericanFootballMatchId(value: unknown) {
    const normalized = normalizeString(value);
    if (!normalized) return null;
    const match = /^espn-game-(\d+)$/i.exec(normalized);
    return match?.[1] || null;
}

export function inferEspnAmericanFootballLeague(input: {
    id?: unknown;
    externalId?: unknown;
    tournamentUrl?: unknown;
    leagueSlug?: unknown;
    name?: unknown;
    ruleset?: unknown;
}) {
    const explicitLeague = normalizeKey(input.leagueSlug);
    if (isEspnAmericanFootballLeagueSlug(explicitLeague)) {
        return explicitLeague;
    }

    const prefixedIds = [
        parseEspnAmericanFootballTournamentId(input.id),
        parseEspnAmericanFootballTournamentId(input.externalId),
    ].filter(Boolean) as EspnAmericanFootballLeagueSlug[];
    if (prefixedIds.length > 0) {
        return prefixedIds[0];
    }

    const rawRuleset = isRecord(input.ruleset) ? input.ruleset : null;
    const rawExternal = isRecord(rawRuleset?.external) ? rawRuleset.external : null;
    const rulesetLeague = normalizeKey(
        rawExternal?.espn?.league_slug ??
        rawExternal?.espnAmericanFootball?.league_slug ??
        rawRuleset?.espn?.league_slug ??
        rawRuleset?.espnAmericanFootball?.league_slug
    );
    if (isEspnAmericanFootballLeagueSlug(rulesetLeague)) {
        return rulesetLeague;
    }

    const normalizedUrl = normalizeKey(input.tournamentUrl);
    if (normalizedUrl) {
        for (const league of SUPPORTED_ESPN_AMERICAN_FOOTBALL_LEAGUES) {
            if (normalizedUrl.includes(league.tournamentUrl.toLowerCase())) {
                return league.slug;
            }
        }
    }

    const normalizedName = normalizeKey(input.name);
    if (normalizedName) {
        for (const league of SUPPORTED_ESPN_AMERICAN_FOOTBALL_LEAGUES) {
            if (league.aliases.some((alias) => normalizedName.includes(alias))) {
                return league.slug;
            }
            if (normalizedName.includes(league.shortName.toLowerCase()) || normalizedName.includes(league.name.toLowerCase())) {
                return league.slug;
            }
        }
    }

    return null;
}

const inflightEspnAmFootRequests = new Map<string, Promise<unknown>>();

async function fetchEspnJson<T>(url: string, debugTag: string, cacheTtl: number) {
    const cacheKey = `espn-amfoot:${url}`;
    const cached = memoryCache.get<T>(cacheKey);
    if (cached) return cached;

    const existing = inflightEspnAmFootRequests.get(cacheKey) as Promise<T | null> | undefined;
    if (existing) return existing;

    const promise = (async () => {
        try {
            const { data } = await apiFetch<T>(url, {
                debugTag,
                silent: true,
                cacheTtl,
            });
            if (data) {
                memoryCache.set(cacheKey, data, cacheTtl);
            }
            return data;
        } finally {
            inflightEspnAmFootRequests.delete(cacheKey);
        }
    })();

    inflightEspnAmFootRequests.set(cacheKey, promise);
    return promise;
}

async function fetchScoreboardRangeEvents(
    leagueSlug: EspnAmericanFootballLeagueSlug,
    startDate: Date,
    endDate: Date,
) {
    const safeStart = toDateOnly(startDate);
    const safeEnd = toDateOnly(endDate);
    const eventsById = new Map<string, EspnScoreboardEvent>();

    let cursor = safeStart;
    while (cursor <= safeEnd) {
        const chunkEnd = addDays(cursor, 44);
        const boundedEnd = chunkEnd <= safeEnd ? chunkEnd : safeEnd;
        const datesParam = `${formatEspnDate(cursor)}-${formatEspnDate(boundedEnd)}`;
        const url = `https://site.api.espn.com/apis/site/v2/sports/football/${leagueSlug}/scoreboard?dates=${datesParam}`;
        const payload = await fetchEspnJson<Record<string, any>>(url, 'EspnAmFootScoreboard', SCOREBOARD_CACHE_TTL);
        const events = Array.isArray(payload?.events) ? payload.events : [];

        for (const event of events) {
            const eventId = normalizeString(event?.id);
            if (eventId) {
                eventsById.set(eventId, event);
            }
        }

        cursor = addDays(boundedEnd, 1);
    }

    return Array.from(eventsById.values()).sort((left, right) => {
        const leftDate = parseDate(left?.date)?.getTime() || 0;
        const rightDate = parseDate(right?.date)?.getTime() || 0;
        return leftDate - rightDate;
    });
}

async function fetchLeagueStandingsRaw(leagueSlug: EspnAmericanFootballLeagueSlug) {
    const url = `https://site.api.espn.com/apis/v2/sports/football/${leagueSlug}/standings`;
    return fetchEspnJson<EspnStandingsPayload>(url, 'EspnAmFootStandings', STANDINGS_CACHE_TTL);
}

async function fetchMatchSummaryForLeague(
    leagueSlug: EspnAmericanFootballLeagueSlug,
    matchId: string,
) {
    const url = `https://site.api.espn.com/apis/site/v2/sports/football/${leagueSlug}/summary?event=${matchId}`;
    return fetchEspnJson<EspnSummaryPayload>(url, 'EspnAmFootSummary', MATCH_CACHE_TTL);
}

async function resolveMatchLeagueAndSummary(matchId: string) {
    const results = await Promise.allSettled(
        SUPPORTED_ESPN_AMERICAN_FOOTBALL_LEAGUES.map(async (league) => ({
            league,
            summary: await fetchMatchSummaryForLeague(league.slug, matchId),
        })),
    );

    for (const result of results) {
        if (result.status !== 'fulfilled') continue;
        const summary = result.value.summary;
        const headerId = normalizeString(summary?.header?.id);
        if (headerId === matchId) {
            return result.value;
        }
    }

    return null;
}

async function resolveTeamLeague(teamId: string, preferredLeague?: string | null) {
    const preferred = isEspnAmericanFootballLeagueSlug(preferredLeague) ? preferredLeague : null;
    const orderedLeagues = preferred
        ? [LEAGUES[preferred], ...SUPPORTED_ESPN_AMERICAN_FOOTBALL_LEAGUES.filter((league) => league.slug !== preferred)]
        : SUPPORTED_ESPN_AMERICAN_FOOTBALL_LEAGUES;

    const results = await Promise.allSettled(
        orderedLeagues.map(async (league) => ({
            league,
            details: await fetchEspnJson<Record<string, any>>(
                `https://site.api.espn.com/apis/site/v2/sports/football/${league.slug}/teams/${teamId}`,
                'EspnAmFootTeam',
                TEAM_CACHE_TTL,
            ),
        })),
    );

    for (const result of results) {
        if (result.status !== 'fulfilled') continue;
        const details = result.value.details;
        if (normalizeString(details?.team?.id) === teamId) {
            return result.value;
        }
    }

    return null;
}

function normalizeEspnEventCore(event: Record<string, any>, league: EspnAmericanFootballLeague) {
    const { competition, home, away } = getCompetitors(event);
    const status = mapEspnStatus(competition?.status?.type || event?.status?.type);
    const kickoff = parseDate(competition?.date || event?.date);
    const homeScore = parseScore(home?.score);
    const awayScore = parseScore(away?.score);
    const eventId = normalizeString(event?.id || competition?.id);
    const venue = normalizeString(competition?.venue?.fullName);

    if (!eventId || !kickoff || !home || !away) {
        return null;
    }

    const homeId = normalizeString(home?.team?.id || home?.id);
    const awayId = normalizeString(away?.team?.id || away?.id);
    const leagueId = toEspnAmericanFootballTournamentId(league.slug);
    const leagueLogo = getLeagueLogo(event);
    const round = typeof event?.week?.number === 'number' ? event.week.number : 1;

    return {
        id: toEspnAmericanFootballMatchId(eventId),
        rawId: eventId,
        status,
        kickoff,
        round,
        weekText: getEspnWeekLabel(event),
        venue,
        season: typeof event?.season?.year === 'number' ? event.season.year : null,
        tournament: {
            id: leagueId,
            rawId: league.slug,
            name: league.shortName,
            fullName: league.name,
            countryName: league.countryName,
            logo: leagueLogo,
            league: league.slug,
            url: league.tournamentUrl,
        },
        home: {
            id: homeId ? toEspnAmericanFootballTeamId(homeId) : null,
            rawId: homeId,
            name: getEspnTeamDisplayName(home),
            shortName: getEspnTeamAbbreviation(home),
            logo: getEspnLogo(home?.team || home),
            league: league.slug,
        },
        away: {
            id: awayId ? toEspnAmericanFootballTeamId(awayId) : null,
            rawId: awayId,
            name: getEspnTeamDisplayName(away),
            shortName: getEspnTeamAbbreviation(away),
            logo: getEspnLogo(away?.team || away),
            league: league.slug,
        },
        score: {
            home: homeScore,
            away: awayScore,
        },
    };
}

function normalizeEspnEventForTournamentViews(event: Record<string, any>, league: EspnAmericanFootballLeague) {
    const normalized = normalizeEspnEventCore(event, league);
    if (!normalized) return null;

    return {
        match_id: normalized.id,
        event_key: normalized.id,
        timestamp: Math.floor(normalized.kickoff.getTime() / 1000),
        date: normalized.kickoff.toISOString(),
        match_status: normalized.status,
        event_status: normalized.status,
        status: normalized.status,
        week: normalized.weekText,
        season: normalized.season,
        tournament_id: normalized.tournament.id,
        tournament_name: normalized.tournament.fullName,
        tournament_name_short: normalized.tournament.name,
        tournament_logo: normalized.tournament.logo,
        country_name: normalized.tournament.countryName,
        sport_id: 'american-football',
        home_team: {
            id: normalized.home.id,
            team_id: normalized.home.id,
            name: normalized.home.name,
            short_name: normalized.home.shortName,
            logo: normalized.home.logo,
            image_path: normalized.home.logo,
            small_image_path: normalized.home.logo,
            team_url: '',
            league: normalized.home.league,
            provider: 'espn',
            source: 'espn',
        },
        away_team: {
            id: normalized.away.id,
            team_id: normalized.away.id,
            name: normalized.away.name,
            short_name: normalized.away.shortName,
            logo: normalized.away.logo,
            image_path: normalized.away.logo,
            small_image_path: normalized.away.logo,
            team_url: '',
            league: normalized.away.league,
            provider: 'espn',
            source: 'espn',
        },
        home_team_name: normalized.home.name,
        away_team_name: normalized.away.name,
        home_team_logo: normalized.home.logo,
        away_team_logo: normalized.away.logo,
        scores: normalized.score,
        score: normalized.score,
        venue: normalized.venue,
        source: 'espn',
        provider: 'espn',
    };
}

type EspnTournamentViewEvent = NonNullable<ReturnType<typeof normalizeEspnEventForTournamentViews>>;

function isEspnTournamentViewEvent(
    event: ReturnType<typeof normalizeEspnEventForTournamentViews>,
): event is EspnTournamentViewEvent {
    return Boolean(event);
}

function matchParticipantTeamName(name: string, participants: EspnParticipant[]) {
    const lower = name.toLowerCase().trim();

    for (const participant of participants) {
        const clubName = participant.clubs.name.toLowerCase().trim();
        const shortName = (participant.clubs.short_name ?? '').toLowerCase().trim();

        if (clubName === lower || (shortName.length >= 2 && shortName === lower)) {
            return { club_id: participant.club_id, confidence: 'exact' as MatchConfidence };
        }
    }

    for (const participant of participants) {
        const clubName = participant.clubs.name.toLowerCase().trim();
        const shortName = (participant.clubs.short_name ?? '').toLowerCase().trim();

        if (clubName.length >= 3 && (lower.includes(clubName) || clubName.includes(lower))) {
            return { club_id: participant.club_id, confidence: 'partial' as MatchConfidence };
        }
        if (shortName.length >= 3 && (lower.includes(shortName) || shortName.includes(lower))) {
            return { club_id: participant.club_id, confidence: 'partial' as MatchConfidence };
        }
    }

    return { club_id: null, confidence: 'none' as MatchConfidence };
}

export function normalizeEspnAmericanFootballEventForSyncPreview(
    event: Record<string, any>,
    leagueSlug: EspnAmericanFootballLeagueSlug,
    participants: EspnParticipant[],
): ExternalMatchWithMapping | null {
    const league = LEAGUES[leagueSlug];
    const normalized = normalizeEspnEventCore(event, league);
    if (!normalized) return null;

    const homeMatch = matchParticipantTeamName(normalized.home.name, participants);
    const awayMatch = matchParticipantTeamName(normalized.away.name, participants);

    return {
        external_match_id: normalized.id,
        home_team_name: normalized.home.name,
        away_team_name: normalized.away.name,
        timestamp: Math.floor(normalized.kickoff.getTime() / 1000),
        date_time: normalized.kickoff.toISOString(),
        venue: normalized.venue || undefined,
        status: normalized.status,
        score: normalized.score.home != null && normalized.score.away != null ? normalized.score : undefined,
        home_club_id: homeMatch.club_id,
        away_club_id: awayMatch.club_id,
        home_match_confidence: homeMatch.confidence,
        away_match_confidence: awayMatch.confidence,
    };
}

export function normalizeEspnAmericanFootballStandingsRows(
    payload: EspnStandingsPayload | null | undefined,
    leagueSlug: EspnAmericanFootballLeagueSlug,
): ExternalStandingsRow[] {
    const entries = getLeagueStandingEntries(payload);

    return entries.map((entry: any, index: number) => {
        const teamId = normalizeString(entry?.team?.id);
        const stats = Array.isArray(entry?.stats) ? entry.stats : [];
        const played = getStatValue(stats, ['gamesplayed', 'played']) ?? 0;
        const wins = getStatValue(stats, ['wins']) ?? 0;
        const draws = getStatValue(stats, ['ties']) ?? 0;
        const losses = getStatValue(stats, ['losses']) ?? 0;
        const scored = getStatValue(stats, ['pointsfor']) ?? undefined;
        const conceded = getStatValue(stats, ['pointsagainst']) ?? undefined;
        const differential = getStatValue(stats, ['pointdifferential', 'differential']) ?? undefined;
        const position = getStatValue(stats, ['playoffseed', 'rank']) ?? index + 1;

        return {
            position,
            team_name: entry?.team?.displayName || entry?.team?.shortDisplayName || entry?.team?.name || 'Equipo',
            team_id: teamId ? toEspnAmericanFootballTeamId(teamId) : null,
            team_logo: getEspnLogo(entry?.team),
            team_url: '',
            played,
            won: wins,
            drawn: draws,
            lost: losses,
            points: wins,
            scored,
            conceded,
            ...(typeof differential === 'number' ? { differential } : {}),
            ...(normalizeString(entry?._groupName) ? { group_name: String(entry._groupName) } : {}),
        };
    });
}

function enrichStandingsRowsForUi(
    standings: ExternalStandingsRow[],
    leagueSlug: EspnAmericanFootballLeagueSlug,
) {
    return standings.map((row) => ({
        rank: row.position,
        name: row.team_name,
        team_id: row.team_id,
        team_name: row.team_name,
        team_url: row.team_url,
        team_logo: row.team_logo,
        logo: row.team_logo || '',
        team: {
            id: row.team_id,
            team_id: row.team_id,
            name: row.team_name,
            logo: row.team_logo || '',
            image_path: row.team_logo || '',
            small_image_path: row.team_logo || '',
            team_url: '',
            league: leagueSlug,
            provider: 'espn',
            source: 'espn',
        },
        participant: {
            id: row.team_id,
            name: row.team_name,
            logo: row.team_logo || '',
            image_path: row.team_logo || '',
            small_image_path: row.team_logo || '',
            team_url: '',
            league: leagueSlug,
            provider: 'espn',
            source: 'espn',
        },
        matches_played: row.played,
        played: row.played,
        won: row.won,
        drawn: row.drawn,
        lost: row.lost,
        points: row.points,
        goal_difference: (row.scored ?? 0) - (row.conceded ?? 0),
        scored: row.scored ?? 0,
        conceded: row.conceded ?? 0,
        provider: 'espn',
        source: 'espn',
    }));
}

async function buildRecentH2H(
    leagueSlug: EspnAmericanFootballLeagueSlug,
    matchId: string,
    homeTeamId: string | null,
    awayTeamId: string | null,
) {
    if (!homeTeamId || !awayTeamId) return [];

    const [homeSchedule, awaySchedule] = await Promise.allSettled([
        fetchEspnJson<Record<string, any>>(
            `https://site.api.espn.com/apis/site/v2/sports/football/${leagueSlug}/teams/${homeTeamId}/schedule`,
            'EspnAmFootTeamSchedule',
            TEAM_CACHE_TTL,
        ),
        fetchEspnJson<Record<string, any>>(
            `https://site.api.espn.com/apis/site/v2/sports/football/${leagueSlug}/teams/${awayTeamId}/schedule`,
            'EspnAmFootTeamSchedule',
            TEAM_CACHE_TTL,
        ),
    ]);

    const eventsById = new Map<string, Record<string, any>>();
    for (const result of [homeSchedule, awaySchedule]) {
        if (result.status !== 'fulfilled') continue;
        const events = Array.isArray(result.value?.events) ? result.value.events : [];
        for (const event of events) {
            const eventId = normalizeString(event?.id);
            if (eventId && eventId !== matchId) {
                eventsById.set(eventId, event);
            }
        }
    }

    return Array.from(eventsById.values())
        .map((event) => normalizeEspnEventForTournamentViews(event, LEAGUES[leagueSlug]))
        .filter(isEspnTournamentViewEvent)
        .sort((left, right) => (right.timestamp || 0) - (left.timestamp || 0));
}

function buildTournamentDetails(
    league: EspnAmericanFootballLeague,
    standingsPayload: EspnStandingsPayload | null | undefined,
) {
    const season = getLeagueSeason(standingsPayload);

    return {
        id: toEspnAmericanFootballTournamentId(league.slug),
        tournament_id: toEspnAmericanFootballTournamentId(league.slug),
        tournament_stage_id: toEspnAmericanFootballTournamentId(league.slug),
        tournament_template_id: toEspnAmericanFootballTournamentId(league.slug),
        season_id: season,
        name: league.shortName,
        full_name: league.name,
        country: {
            name: league.countryName,
        },
        sport: {
            sport_id: 'american-football',
            name: 'American Football',
        },
        logo: getLeagueLogo(standingsPayload),
        url: league.tournamentUrl,
        source: 'espn',
        provider: 'espn',
    };
}

export async function getEspnAmericanFootballMatches(
    date: Date,
    _options?: { timeZone?: string; targetDateKey?: string },
): Promise<Match[]> {
    const targetDate = toDateOnly(date);
    const eventsByLeague = await Promise.all(
        SUPPORTED_ESPN_AMERICAN_FOOTBALL_LEAGUES.map((league) =>
            fetchScoreboardRangeEvents(league.slug, targetDate, targetDate),
        ),
    );

    return eventsByLeague.flatMap((events, index) => {
        const league = SUPPORTED_ESPN_AMERICAN_FOOTBALL_LEAGUES[index];
        return events
            .map((event) => normalizeEspnEventCore(event, league))
            .filter((event): event is NonNullable<ReturnType<typeof normalizeEspnEventCore>> => Boolean(event))
            .map((event) => ({
                id: event.id,
                tournamentId: event.tournament.id,
                phaseId: 'group',
                round: event.round,
                homeTeamId: event.home.id || 'espn-team-home',
                homeTeamName: event.home.name,
                awayTeamId: event.away.id || 'espn-team-away',
                awayTeamName: event.away.name,
                homeTeamLogo: event.home.logo,
                awayTeamLogo: event.away.logo,
                scheduledAt: event.kickoff,
                venueName: event.venue || undefined,
                status: event.status,
                score: event.score,
                result: {
                    isComplete: event.status === 'final',
                    updatedAt: new Date(),
                    updatedBy: 'espn',
                    version: 1,
                },
                createdFrom: 'generator' as const,
                createdAt: new Date(),
                updatedAt: new Date(),
            }));
    });
}

export async function getEspnAmericanFootballLiveMatches(): Promise<Match[]> {
    const today = toDateOnly(new Date());
    const matches = await getEspnAmericanFootballMatches(today);
    return matches.filter((match) => match.status === 'live');
}

export async function getEspnAmericanFootballLeagueResults(
    leagueSlug: EspnAmericanFootballLeagueSlug,
    page: number = 1,
) {
    const today = toDateOnly(new Date());
    const events = await fetchScoreboardRangeEvents(leagueSlug, addDays(today, -TEAM_SCHEDULE_RANGE_DAYS), today);
    const normalized = events
        .map((event) => normalizeEspnEventForTournamentViews(event, LEAGUES[leagueSlug]))
        .filter(isEspnTournamentViewEvent)
        .filter((event) => event.status === 'final')
        .sort((left, right) => (right.timestamp || 0) - (left.timestamp || 0));

    const pageSize = 20;
    const start = (Math.max(1, page) - 1) * pageSize;
    return {
        matches: normalized.slice(start, start + pageSize),
        hasMore: start + pageSize < normalized.length,
        total: normalized.length,
    };
}

export async function getEspnAmericanFootballLeagueFixtures(
    leagueSlug: EspnAmericanFootballLeagueSlug,
    page: number = 1,
) {
    const today = toDateOnly(new Date());
    const events = await fetchScoreboardRangeEvents(leagueSlug, addDays(today, -7), addDays(today, TEAM_SCHEDULE_RANGE_DAYS));
    const normalized = events
        .map((event) => normalizeEspnEventForTournamentViews(event, LEAGUES[leagueSlug]))
        .filter(isEspnTournamentViewEvent)
        .filter((event) => event.status !== 'final')
        .sort((left, right) => (left.timestamp || 0) - (right.timestamp || 0));

    const pageSize = 20;
    const start = (Math.max(1, page) - 1) * pageSize;
    return {
        matches: normalized.slice(start, start + pageSize),
        hasMore: start + pageSize < normalized.length,
        total: normalized.length,
    };
}

export async function getEspnAmericanFootballLeagueStandings(
    leagueSlug: EspnAmericanFootballLeagueSlug,
) {
    const raw = await fetchLeagueStandingsRaw(leagueSlug);
    const rows = normalizeEspnAmericanFootballStandingsRows(raw, leagueSlug);
    return {
        raw,
        rows,
        enrichedRows: enrichStandingsRowsForUi(rows, leagueSlug),
    };
}

export async function getEspnAmericanFootballTournamentBundle(
    leagueSlug: EspnAmericanFootballLeagueSlug,
) {
    const [resultsData, fixturesData, standingsData] = await Promise.all([
        getEspnAmericanFootballLeagueResults(leagueSlug, 1),
        getEspnAmericanFootballLeagueFixtures(leagueSlug, 1),
        getEspnAmericanFootballLeagueStandings(leagueSlug),
    ]);

    const league = LEAGUES[leagueSlug];
    const details = buildTournamentDetails(league, standingsData.raw);
    const seasonId = getLeagueSeason(standingsData.raw);

    return {
        ids: {
            tournamentId: toEspnAmericanFootballTournamentId(leagueSlug),
            stageId: toEspnAmericanFootballTournamentId(leagueSlug),
            templateId: toEspnAmericanFootballTournamentId(leagueSlug),
            seasonId,
        },
        details,
        results: resultsData.matches,
        fixtures: fixturesData.matches,
        standings: standingsData.enrichedRows,
        standingsForm: [],
        standingsHtFt: [],
        standingsOverUnder: [],
        teamLabels: [],
        topScorers: [],
        draw: [],
        archives: [],
    };
}

export async function getEspnAmericanFootballMatchBundle(matchId: string) {
    const resolved = await resolveMatchLeagueAndSummary(matchId);
    if (!resolved?.summary) return null;

    const summary = resolved.summary;
    const header = isRecord(summary?.header) ? summary.header : null;
    const competition = Array.isArray(header?.competitions) ? header.competitions[0] : null;
    const competitors = Array.isArray(competition?.competitors) ? competition.competitors : [];
    const home = competitors.find((competitor: any) => competitor?.homeAway === 'home') || competitors[0] || null;
    const away = competitors.find((competitor: any) => competitor?.homeAway === 'away') || competitors[1] || null;
    const kickoff = parseDate(competition?.date || header?.date);

    if (!header || !competition || !home || !away || !kickoff) {
        return null;
    }

    const league = resolved.league;
    const standingsRaw = summary?.standings ?? await fetchLeagueStandingsRaw(league.slug);
    const standings = enrichStandingsRowsForUi(
        normalizeEspnAmericanFootballStandingsRows(standingsRaw, league.slug),
        league.slug,
    );
    const homeTeamId = normalizeString(home?.team?.id || home?.id);
    const awayTeamId = normalizeString(away?.team?.id || away?.id);
    const h2h = await buildRecentH2H(league.slug, matchId, homeTeamId, awayTeamId);

    return {
        source: 'espn' as const,
        summary,
        match: {
            id: toEspnAmericanFootballMatchId(matchId),
            externalProvider: 'espn',
            sportId: 'american-football',
            status: mapEspnStatus(competition?.status?.type),
            date: kickoff.toISOString(),
            time: kickoff.toLocaleTimeString('es-AR', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
                timeZone: 'America/Argentina/Buenos_Aires',
            }),
            tournament: header?.league?.abbreviation || league.shortName,
            tournamentLogo: getLeagueLogo(summary),
            tournamentId: toEspnAmericanFootballTournamentId(league.slug),
            tournamentSeason: header?.season?.year || null,
            category: league.countryName,
            round: getEspnWeekLabel(header),
            venue: normalizeString(competition?.venue?.fullName) || '',
            referee: null,
            home: {
                id: homeTeamId ? toEspnAmericanFootballTeamId(homeTeamId) : null,
                name: getEspnTeamDisplayName(home),
                logo: getEspnLogo(home?.team || home),
                score: parseScore(home?.score),
                teamUrl: '',
                league: league.slug,
            },
            away: {
                id: awayTeamId ? toEspnAmericanFootballTeamId(awayTeamId) : null,
                name: getEspnTeamDisplayName(away),
                logo: getEspnLogo(away?.team || away),
                score: parseScore(away?.score),
                teamUrl: '',
                league: league.slug,
            },
            lineups: null,
            standings,
            h2h,
            draw: [],
            form: [],
            topScorers: [],
        },
        h2h,
        standings,
    };
}

function buildRosterPlayers(payload: Record<string, any> | null | undefined) {
    const athleteGroups = Array.isArray(payload?.athletes) ? payload.athletes : [];
    return athleteGroups.flatMap((group: any) => {
        const positionName = normalizeString(group?.position) || 'other';
        const items = Array.isArray(group?.items) ? group.items : [];
        return items.map((item: any) => ({
            name: item?.displayName || item?.fullName || 'Jugador',
            number: item?.jersey || '',
            jersey_number: item?.jersey || '',
            age: item?.age || '',
            nationality: item?.birthPlace?.country || '',
            position: item?.position?.displayName || item?.position?.name || positionName,
            position_name: item?.position?.displayName || item?.position?.name || positionName,
            image_path: item?.headshot?.href || '',
        }));
    });
}

export async function getEspnAmericanFootballTeamBundle(teamId: string, preferredLeague?: string | null) {
    const resolved = await resolveTeamLeague(teamId, preferredLeague);
    if (!resolved?.details) return null;

    const league = resolved.league;
    const [schedulePayload, rosterPayload, standingsPayload] = await Promise.all([
        fetchEspnJson<Record<string, any>>(
            `https://site.api.espn.com/apis/site/v2/sports/football/${league.slug}/teams/${teamId}/schedule`,
            'EspnAmFootTeamSchedule',
            TEAM_CACHE_TTL,
        ),
        fetchEspnJson<Record<string, any>>(
            `https://site.api.espn.com/apis/site/v2/sports/football/${league.slug}/teams/${teamId}/roster`,
            'EspnAmFootTeamRoster',
            TEAM_CACHE_TTL,
        ),
        fetchLeagueStandingsRaw(league.slug),
    ]);

    const events = Array.isArray(schedulePayload?.events) ? schedulePayload.events : [];
    const normalizedEvents = events
        .map((event) => normalizeEspnEventForTournamentViews(event, league))
        .filter(isEspnTournamentViewEvent);
    const standingsRows = normalizeEspnAmericanFootballStandingsRows(standingsPayload, league.slug);
    const standingRow = standingsRows.find((row) => row.team_id === toEspnAmericanFootballTeamId(teamId)) || null;
    const team = resolved.details?.team;
    const venue = resolved.details?.franchise?.venue;
    const logo = getEspnLogo(team);

    return {
        details: {
            id: toEspnAmericanFootballTeamId(teamId),
            name: team?.displayName || team?.name || 'Equipo',
            image_path: logo,
            logo,
            logo_url: logo,
            country: league.countryName,
            city: venue?.address?.city || '',
            region: venue?.address?.state || '',
            venue: venue?.fullName || '',
            founded: null,
            provider: 'espn',
            supported_tabs: ['summary', 'results', 'fixtures', 'squad'],
            current_league: league.shortName,
            current_league_logo: getLeagueLogo(standingsPayload),
            current_season: getLeagueSeason(schedulePayload) || getLeagueSeason(standingsPayload),
            standing: standingRow ? {
                position: standingRow.position,
                points: standingRow.points,
                played: standingRow.played,
                won: standingRow.won,
                drawn: standingRow.drawn,
                lost: standingRow.lost,
            } : null,
            statistics: standingRow ? {
                played: standingRow.played,
                wins: standingRow.won,
                draws: standingRow.drawn,
                losses: standingRow.lost,
                pointsFor: standingRow.scored ?? null,
                pointsAgainst: standingRow.conceded ?? null,
            } : null,
            short_code: team?.abbreviation || '',
            description: normalizeString(resolved.details?.standingSummary) || '',
        },
        results: normalizedEvents
            .filter((event) => event.status === 'final')
            .sort((left, right) => (right.timestamp || 0) - (left.timestamp || 0)),
        fixtures: normalizedEvents
            .filter((event) => event.status !== 'final')
            .sort((left, right) => (left.timestamp || 0) - (right.timestamp || 0)),
        squad: buildRosterPlayers(rosterPayload),
        transfers: [],
    };
}
