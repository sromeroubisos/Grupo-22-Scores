import { apiFetch } from '@/lib/apiFetch';
import { memoryCache } from '@/lib/cache';
import type { ExternalStandingsRow } from '@/lib/types/flashscore-integration';
import type { Match, MatchStatus } from '@/types/match';

export type EspnMotorsportLeagueSlug =
    | 'f1'
    | 'irl'
    | 'nascar-premier'
    | 'nascar-secondary'
    | 'nascar-truck';

type EspnMotorsportLeague = {
    slug: EspnMotorsportLeagueSlug;
    name: string;
    shortName: string;
    countryName: string;
    tournamentUrl: string;
    aliases: string[];
};

type EspnScoreboardEvent = Record<string, any>;
type EspnSummaryPayload = Record<string, any>;
type EspnStandingsPayload = Record<string, any>;
type EspnCoreLeaguePayload = Record<string, any>;
type EspnCoreEventPayload = Record<string, any>;
type MotorsportSessionType = 'practice' | 'qualifying' | 'sprint' | 'race';

const SCOREBOARD_CACHE_TTL = 300;
const STANDINGS_CACHE_TTL = 1800;
const MATCH_CACHE_TTL = 300;
const CORE_CACHE_TTL = 1800;
const RESULTS_RANGE_DAYS = 240;
const FIXTURES_RANGE_DAYS = 240;

const LEAGUES: Record<EspnMotorsportLeagueSlug, EspnMotorsportLeague> = {
    f1: {
        slug: 'f1',
        name: 'Formula 1',
        shortName: 'F1',
        countryName: 'International',
        tournamentUrl: '/motorsport/formula-1/',
        aliases: ['f1', 'formula 1', 'formula1', 'formula one'],
    },
    irl: {
        slug: 'irl',
        name: 'IndyCar Series',
        shortName: 'IndyCar',
        countryName: 'USA',
        tournamentUrl: '/motorsport/indycar/',
        aliases: ['irl', 'indycar', 'indy car'],
    },
    'nascar-premier': {
        slug: 'nascar-premier',
        name: 'NASCAR Cup Series',
        shortName: 'NASCAR Cup',
        countryName: 'USA',
        tournamentUrl: '/motorsport/nascar-cup/',
        aliases: ['nascar', 'nascar cup', 'nascar premier', 'cup series'],
    },
    'nascar-secondary': {
        slug: 'nascar-secondary',
        name: 'NASCAR Xfinity Series',
        shortName: 'NASCAR Xfinity',
        countryName: 'USA',
        tournamentUrl: '/motorsport/nascar-xfinity/',
        aliases: ['nascar secondary', 'xfinity', 'nascar xfinity'],
    },
    'nascar-truck': {
        slug: 'nascar-truck',
        name: 'NASCAR Truck Series',
        shortName: 'NASCAR Truck',
        countryName: 'USA',
        tournamentUrl: '/motorsport/nascar-truck/',
        aliases: ['nascar truck', 'truck series'],
    },
};

export const SUPPORTED_ESPN_MOTORSPORT_LEAGUES = Object.values(LEAGUES);

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

function getCompetition(event: Record<string, any>) {
    const competitions = Array.isArray(event?.competitions) ? event.competitions : [];
    return competitions.find((competition) => {
        const abbreviation = normalizeLookupText(competition?.type?.abbreviation || competition?.type?.text);
        return abbreviation === 'race';
    }) || competitions[0] || null;
}

function sortMotorsportCompetitors(input: any[]) {
    return input.slice().sort((left: any, right: any) => {
        const leftOrder =
            Number(left?.order ?? left?.position ?? left?.curatedRank ?? left?.place ?? left?.rank);
        const rightOrder =
            Number(right?.order ?? right?.position ?? right?.curatedRank ?? right?.place ?? right?.rank);
        const safeLeft = Number.isFinite(leftOrder) ? leftOrder : Number.MAX_SAFE_INTEGER;
        const safeRight = Number.isFinite(rightOrder) ? rightOrder : Number.MAX_SAFE_INTEGER;
        return safeLeft - safeRight;
    });
}

function getCompetitors(event: Record<string, any>) {
    const competition = getCompetition(event);
    const competitors = Array.isArray(competition?.competitors) ? sortMotorsportCompetitors(competition.competitors) : [];

    return { competition, competitors, primary: competitors[0] || null, secondary: competitors[1] || null };
}

function getEntityLogo(entity: any): string {
    const logos = Array.isArray(entity?.logos) ? entity.logos : [];
    for (const logo of logos) {
        if (typeof logo?.href === 'string' && logo.href.trim()) {
            return logo.href.trim();
        }
    }

    if (typeof entity?.headshot?.href === 'string' && entity.headshot.href.trim()) {
        return entity.headshot.href.trim();
    }

    if (typeof entity?.logo === 'string' && entity.logo.trim()) {
        return entity.logo.trim();
    }

    return '';
}

function getLeagueLogo(payload: Record<string, any> | null | undefined) {
    return (
        getEntityLogo(payload?.league) ||
        getEntityLogo(Array.isArray(payload?.leagues) ? payload.leagues[0] : null)
    );
}

function getCompetitorDisplayName(competitor: any) {
    return (
        competitor?.athlete?.displayName ||
        competitor?.athlete?.shortName ||
        competitor?.team?.displayName ||
        competitor?.team?.shortDisplayName ||
        competitor?.displayName ||
        competitor?.name ||
        null
    );
}

function getCompetitorId(competitor: any) {
    return normalizeString(
        competitor?.athlete?.id ||
        competitor?.team?.id ||
        competitor?.id
    );
}

function getCompetitorLogo(competitor: any) {
    return (
        getEntityLogo(competitor?.athlete) ||
        getEntityLogo(competitor?.team) ||
        getEntityLogo(competitor)
    );
}

function getCompetitorCountryName(competitor: any) {
    const raw = normalizeString(
        competitor?.athlete?.flag?.alt ||
        competitor?.athlete?.country?.name ||
        competitor?.athlete?.nationality ||
        competitor?.team?.country?.name ||
        competitor?.country?.name ||
        competitor?.country
    );

    if (!raw) return null;

    return raw
        .replace(/^flag of\s+/i, '')
        .replace(/^the\s+/i, '')
        .trim();
}

function getEventDisplayName(event: Record<string, any>, fallback: string) {
    return (
        normalizeString(event?.shortName) ||
        normalizeString(event?.name) ||
        normalizeString(event?.headline) ||
        fallback
    );
}

function normalizeLookupText(value: unknown) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

function toPublicEspnCoreUrl(url: string) {
    return url
        .replace(/^http:\/\//i, 'https://')
        .replace('sports.core.api.espn.pvt', 'sports.core.api.espn.com');
}

function toEspnCoreUrl(urlOrRef: unknown) {
    const normalized = normalizeString(urlOrRef);
    if (!normalized) return null;

    const publicUrl = toPublicEspnCoreUrl(normalized);
    if (publicUrl.includes('?')) return publicUrl;
    return `${publicUrl}?lang=en&region=us`;
}

function getRefUrl(value: unknown) {
    return toEspnCoreUrl(isRecord(value) ? value.$ref : value);
}

function stripQuery(url: string) {
    return url.split('?')[0] || url;
}

function buildRefChildUrl(ref: unknown, childPath: string) {
    const base = getRefUrl(ref);
    if (!base) return null;
    return `${stripQuery(base)}${childPath}?lang=en&region=us`;
}

function extractEspnRefId(ref: unknown) {
    const url = getRefUrl(ref);
    if (!url) return null;
    const parts = stripQuery(url).split('/').filter(Boolean);
    return parts.length > 0 ? parts[parts.length - 1] : null;
}

function inferMotorsportSessionType(
    event: Record<string, any>,
    competition: Record<string, any> | null,
    eventName: string,
): MotorsportSessionType {
    const text = normalizeLookupText([
        eventName,
        event?.shortName,
        event?.name,
        event?.headline,
        competition?.type?.text,
        competition?.type?.description,
        competition?.notes?.map((note: any) => note?.headline || note?.type || '').join(' '),
    ].filter(Boolean).join(' '));

    if (
        /\b(fp\d|practice|practice\s+\d|practica|practicas|entrenamiento|entrenamientos)\b/.test(text)
    ) {
        return 'practice';
    }

    if (
        /\b(shootout|qualifying|qualy|quali|q1|q2|q3|clasificacion|clasificacion sprint|sprint qualifying)\b/.test(text)
    ) {
        return 'qualifying';
    }

    if (/\bsprint\b/.test(text)) {
        return 'sprint';
    }

    return 'race';
}

function getMotorsportSessionLabel(sessionType: MotorsportSessionType) {
    switch (sessionType) {
        case 'practice':
            return 'Practica';
        case 'qualifying':
            return 'Clasificacion';
        case 'sprint':
            return 'Sprint';
        case 'race':
        default:
            return 'Carrera';
    }
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

function getStandingEntries(payload: EspnStandingsPayload | null | undefined) {
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
        const statName = normalizeKey(
            stat?.name ||
            stat?.abbreviation ||
            stat?.shortDisplayName ||
            stat?.displayName
        );
        if (!statName) continue;
        if (names.includes(statName)) {
            const numeric = Number(stat?.value);
            if (Number.isFinite(numeric)) return numeric;

            const displayNumeric = Number(
                normalizeString(stat?.displayValue || stat?.summary || stat?.description)?.replace(',', '.')
            );
            if (Number.isFinite(displayNumeric)) return displayNumeric;
        }
    }
    return null;
}

const MOTORSPORT_STANDINGS_BASE_STAT_NAMES = new Set([
    'rank',
    'position',
    'playoffseed',
    'points',
    'wins',
    'victories',
    'events',
    'event',
    'races',
    'starts',
    'gamesplayed',
    'played',
    'losses',
    'loss',
    'draws',
    'draw',
    'top5',
    'top10',
    'behind',
    'averagefinish',
    'average_start',
    'averagestart',
    'laps',
    'led',
]);

function extractMotorsportRoundStats(stats: any[]) {
    return stats.flatMap((stat: any) => {
        const key = normalizeKey(stat?.name || stat?.abbreviation || stat?.shortDisplayName || stat?.displayName);
        const label = normalizeString(stat?.abbreviation || stat?.shortDisplayName || stat?.name || stat?.displayName);
        if (!key || !label || MOTORSPORT_STANDINGS_BASE_STAT_NAMES.has(key)) {
            return [];
        }

        const displayValue = normalizeString(stat?.displayValue) || normalizeString(stat?.summary) || normalizeString(stat?.description);
        const rawValue = stat?.value;
        const value =
            displayValue ??
            (typeof rawValue === 'number' && Number.isFinite(rawValue) ? String(rawValue) : normalizeString(rawValue)) ??
            '-';

        if (!/^[a-z0-9]{2,6}$/i.test(label) && !/grand prix|prix|gp|sprint|race/i.test(label)) {
            return [];
        }

        return [{
            key,
            label: label.toUpperCase(),
            value,
        }];
    });
}

export function isEspnMotorsportLeagueSlug(value: unknown): value is EspnMotorsportLeagueSlug {
    const normalized = normalizeKey(value);
    return Boolean(normalized && normalized in LEAGUES);
}

export function getEspnMotorsportLeague(slug: EspnMotorsportLeagueSlug) {
    return LEAGUES[slug];
}

export function toEspnMotorsportTournamentId(leagueSlug: EspnMotorsportLeagueSlug) {
    return `espn-racing-league-${leagueSlug}`;
}

export function parseEspnMotorsportTournamentId(value: unknown): EspnMotorsportLeagueSlug | null {
    const normalized = normalizeKey(value);
    if (!normalized?.startsWith('espn-racing-league-')) return null;
    const slug = normalized.slice('espn-racing-league-'.length);
    return isEspnMotorsportLeagueSlug(slug) ? slug : null;
}

export function toEspnMotorsportMatchId(leagueSlug: EspnMotorsportLeagueSlug, eventId: string | number) {
    return `espn-race-${leagueSlug}--${String(eventId)}`;
}

export function parseEspnMotorsportMatchId(value: unknown) {
    const normalized = normalizeString(value);
    if (!normalized) return null;

    const match = /^espn-race-([a-z0-9-]+)--(.+)$/i.exec(normalized);
    if (!match) return null;

    const [, leagueSlug, eventId] = match;
    if (!isEspnMotorsportLeagueSlug(leagueSlug)) return null;

    return { leagueSlug, eventId };
}

export function inferEspnMotorsportLeague(input: {
    id?: unknown;
    externalId?: unknown;
    tournamentUrl?: unknown;
    leagueSlug?: unknown;
    name?: unknown;
    ruleset?: unknown;
}) {
    const explicitLeague = normalizeKey(input.leagueSlug);
    if (isEspnMotorsportLeagueSlug(explicitLeague)) {
        return explicitLeague;
    }

    const prefixedIds = [
        parseEspnMotorsportTournamentId(input.id),
        parseEspnMotorsportTournamentId(input.externalId),
    ].filter(Boolean) as EspnMotorsportLeagueSlug[];
    if (prefixedIds.length > 0) {
        return prefixedIds[0];
    }

    const rawRuleset = isRecord(input.ruleset) ? input.ruleset : null;
    const rawExternal = isRecord(rawRuleset?.external) ? rawRuleset.external : null;
    const rulesetLeague = normalizeKey(
        rawExternal?.espnMotorsport?.league_slug ??
        rawExternal?.espn?.league_slug ??
        rawRuleset?.espnMotorsport?.league_slug ??
        rawRuleset?.espn?.league_slug
    );
    if (isEspnMotorsportLeagueSlug(rulesetLeague)) {
        return rulesetLeague;
    }

    const normalizedUrl = normalizeKey(input.tournamentUrl);
    if (normalizedUrl) {
        for (const league of SUPPORTED_ESPN_MOTORSPORT_LEAGUES) {
            if (normalizedUrl.includes(league.tournamentUrl.toLowerCase())) {
                return league.slug;
            }
        }
    }

    const normalizedName = normalizeKey(input.name);
    if (normalizedName) {
        for (const league of SUPPORTED_ESPN_MOTORSPORT_LEAGUES) {
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

async function fetchEspnJson<T>(url: string, debugTag: string, cacheTtl: number) {
    const cacheKey = `espn-motorsport:${url}`;
    const cached = memoryCache.get<T>(cacheKey);
    if (cached) return cached;

    const { data } = await apiFetch<T>(url, {
        debugTag,
        silent: true,
        cacheTtl,
    });

    if (data) {
        memoryCache.set(cacheKey, data, cacheTtl);
    }

    return data;
}

async function fetchEspnCoreJson<T>(urlOrRef: unknown, debugTag: string, cacheTtl: number) {
    const url = toEspnCoreUrl(urlOrRef);
    if (!url) return null;
    return fetchEspnJson<T>(url, debugTag, cacheTtl);
}

async function fetchLeagueCoreInfo(leagueSlug: EspnMotorsportLeagueSlug) {
    return fetchEspnCoreJson<EspnCoreLeaguePayload>(
        `https://sports.core.api.espn.com/v2/sports/racing/leagues/${leagueSlug}?lang=en&region=us`,
        'EspnMotorsportCoreLeague',
        CORE_CACHE_TTL,
    );
}

async function fetchLeagueCoreEvents(
    leagueSlug: EspnMotorsportLeagueSlug,
    seasonYear?: number | null,
) {
    const payload = await fetchEspnCoreJson<Record<string, any>>(
        `https://sports.core.api.espn.com/v2/sports/racing/leagues/${leagueSlug}/events?lang=en&region=us`,
        'EspnMotorsportCoreEvents',
        CORE_CACHE_TTL,
    );
    const events = Array.isArray(payload?.events) ? payload.events : [];
    return events
        .filter((event: any) => {
            if (!seasonYear) return true;
            return Number(event?.season?.year) === seasonYear;
        })
        .sort((left: any, right: any) => {
            const leftDate = parseDate(left?.date)?.getTime() || 0;
            const rightDate = parseDate(right?.date)?.getTime() || 0;
            return leftDate - rightDate;
        });
}

function getCoreStatsArray(payload: Record<string, any> | null | undefined) {
    const categories = Array.isArray(payload?.splits?.categories)
        ? payload.splits.categories
        : Array.isArray(payload?.categories)
            ? payload.categories
            : [];

    return categories.flatMap((category: any) => (Array.isArray(category?.stats) ? category.stats : []));
}

function getMotorsportRaceColumnLabel(event: Record<string, any> | null | undefined, index: number) {
    const text = normalizeLookupText([
        event?.shortName,
        event?.name,
        event?.circuit?.fullName,
        event?.circuit?.address?.country,
        event?.circuit?.address?.city,
    ].filter(Boolean).join(' '));

    const labels: Array<[string, string]> = [
        ['australian', 'AUS'],
        ['china', 'CHN'],
        ['chinese', 'CHN'],
        ['japan', 'JPN'],
        ['japanese', 'JPN'],
        ['bahrain', 'BRN'],
        ['saudi', 'SAU'],
        ['miami', 'MIA'],
        ['canada', 'CAN'],
        ['canadian', 'CAN'],
        ['monaco', 'MON'],
        ['barcelona', 'ESP'],
        ['catalunya', 'ESP'],
        ['spanish', 'ESP'],
        ['austria', 'AUT'],
        ['austrian', 'AUT'],
        ['british', 'GBR'],
        ['silverstone', 'GBR'],
        ['belgian', 'BEL'],
        ['spa', 'BEL'],
        ['hungarian', 'HUN'],
        ['budapest', 'HUN'],
        ['dutch', 'NED'],
        ['zandvoort', 'NED'],
        ['italian', 'ITA'],
        ['monza', 'ITA'],
        ['azerbaijan', 'AZB'],
        ['baku', 'AZB'],
        ['singapore', 'SIN'],
        ['united states', 'USA'],
        ['austin', 'USA'],
        ['mexico', 'MEX'],
        ['sao paulo', 'BRA'],
        ['brazil', 'BRA'],
        ['las vegas', 'LAS'],
        ['qatar', 'QAT'],
        ['abu dhabi', 'ARE'],
        ['emilia romagna', 'ITA2'],
        ['imola', 'ITA2'],
    ];

    for (const [needle, label] of labels) {
        if (text.includes(needle)) return label;
    }

    return `R${index + 1}`;
}

async function buildRacePointsFromEventLog(
    eventLogRef: unknown,
    eventIndexById: Map<string, number>,
    eventById: Map<string, EspnCoreEventPayload>,
    pointStatNames: string[],
) {
    const eventLog = await fetchEspnCoreJson<Record<string, any>>(eventLogRef, 'EspnMotorsportEventLog', CORE_CACHE_TTL).catch(() => null);
    const items = Array.isArray(eventLog?.events?.items) ? eventLog.events.items : [];
    const playedItems = items.filter((item: any) => item?.played && getRefUrl(item?.statistics));

    const statsPayloads = await Promise.all(
        playedItems.map((item: any) =>
            fetchEspnCoreJson<Record<string, any>>(item.statistics, 'EspnMotorsportEventLogStats', CORE_CACHE_TTL).catch(() => null),
        ),
    );

    return playedItems
        .map((item: any, index: number) => {
            const eventId = normalizeString(item?.eventId);
            if (!eventId) return null;

            const stats = getCoreStatsArray(statsPayloads[index]);
            const points = getStatValue(stats, pointStatNames);
            const event = eventById.get(eventId);
            const eventIndex = eventIndexById.get(eventId) ?? index;

            return {
                key: eventId,
                label: getMotorsportRaceColumnLabel(event, eventIndex),
                value: Number.isFinite(points) ? String(points) : '—',
            };
        })
        .filter((item: { key: string; label: string; value: string } | null): item is { key: string; label: string; value: string } => Boolean(item))
        .sort(
            (
                left: { key: string; label: string; value: string },
                right: { key: string; label: string; value: string },
            ) => (eventIndexById.get(left.key) ?? 0) - (eventIndexById.get(right.key) ?? 0),
        );
}

async function fetchScoreboardRangeEvents(
    leagueSlug: EspnMotorsportLeagueSlug,
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
        const url = `https://site.api.espn.com/apis/site/v2/sports/racing/${leagueSlug}/scoreboard?dates=${datesParam}`;
        const payload = await fetchEspnJson<Record<string, any>>(url, 'EspnMotorsportScoreboard', SCOREBOARD_CACHE_TTL);
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

async function fetchLeagueStandingsRaw(leagueSlug: EspnMotorsportLeagueSlug) {
    const urls = [
        `https://site.api.espn.com/apis/v2/sports/racing/${leagueSlug}/standings`,
        `https://site.api.espn.com/apis/site/v2/sports/racing/${leagueSlug}/standings`,
    ];

    for (const url of urls) {
        const payload = await fetchEspnJson<EspnStandingsPayload>(url, 'EspnMotorsportStandings', STANDINGS_CACHE_TTL).catch(() => null);
        if (payload) return payload;
    }

    return null;
}

async function fetchMatchSummaryForLeague(
    leagueSlug: EspnMotorsportLeagueSlug,
    eventId: string,
) {
    const url = `https://site.api.espn.com/apis/site/v2/sports/racing/${leagueSlug}/summary?event=${eventId}`;
    return fetchEspnJson<EspnSummaryPayload>(url, 'EspnMotorsportSummary', MATCH_CACHE_TTL);
}

function getSummaryCompetitors(summary: EspnSummaryPayload | null | undefined) {
    const candidates = [
        summary?.header?.competitions?.[0]?.competitors,
        summary?.competitions?.[0]?.competitors,
        summary?.boxscore?.competitions?.[0]?.competitors,
    ];

    for (const candidate of candidates) {
        if (Array.isArray(candidate) && candidate.length > 0) {
            return sortMotorsportCompetitors(candidate);
        }
    }

    return [];
}

function buildPodiumRows(competitors: any[]) {
    return competitors.slice(0, 3).map((competitor: any, index: number) => ({
        position: index + 1,
        id: getCompetitorId(competitor),
        name: getCompetitorDisplayName(competitor) || `Competidor ${index + 1}`,
        logo: getCompetitorLogo(competitor),
        countryName: getCompetitorCountryName(competitor),
    }));
}

function normalizeEspnEventCore(
    event: Record<string, any>,
    league: EspnMotorsportLeague,
    summary?: EspnSummaryPayload | null,
) {
    const { competition, competitors } = getCompetitors(event);
    const kickoff = parseDate(competition?.date || event?.date);
    const status = mapEspnStatus(competition?.status?.type || event?.status?.type);
    const eventId = normalizeString(event?.id || competition?.id);

    if (!eventId || !kickoff) {
        return null;
    }

    const eventName = getEventDisplayName(event, league.shortName);
    const sessionType = inferMotorsportSessionType(event, competition, eventName);
    const summaryCompetitors = getSummaryCompetitors(summary);
    const displayCompetitors = summaryCompetitors.length > 0 ? summaryCompetitors : competitors;
    const primary = displayCompetitors[0] || competitors[0] || null;
    const secondary = displayCompetitors[1] || competitors[1] || null;
    const homeName = getCompetitorDisplayName(primary) || eventName;
    const awayName = getCompetitorDisplayName(secondary) || league.shortName;
    const venue = normalizeString(
        competition?.venue?.fullName ||
        competition?.circuit?.fullName ||
        event?.circuit?.fullName ||
        competition?.type?.text,
    );
    const round = typeof event?.week?.number === 'number' ? event.week.number : null;

    return {
        id: toEspnMotorsportMatchId(league.slug, eventId),
        rawId: eventId,
        status,
        kickoff,
        round,
        sessionType,
        sessionLabel: getMotorsportSessionLabel(sessionType),
        tournament: {
            id: toEspnMotorsportTournamentId(league.slug),
            rawId: league.slug,
            name: league.shortName,
            fullName: league.name,
            countryName: league.countryName,
            logo: getLeagueLogo(event),
            league: league.slug,
            url: league.tournamentUrl,
        },
        home: {
            id: getCompetitorId(primary),
            name: homeName,
            shortName: getCompetitorDisplayName(primary),
            logo: getCompetitorLogo(primary),
        },
        away: {
            id: getCompetitorId(secondary),
            name: awayName,
            shortName: getCompetitorDisplayName(secondary),
            logo: getCompetitorLogo(secondary),
        },
        podium: buildPodiumRows(displayCompetitors),
        eventName,
        venue,
    };
}

function mapNormalizedEspnEventToTournamentView(
    normalized: NonNullable<ReturnType<typeof normalizeEspnEventCore>>,
    league: EspnMotorsportLeague,
) {
    return {
        match_id: normalized.id,
        event_key: normalized.id,
        timestamp: Math.floor(normalized.kickoff.getTime() / 1000),
        date: normalized.kickoff.toISOString(),
        match_status: normalized.status,
        event_status: normalized.status,
        status: normalized.status,
        event_name: normalized.eventName,
        tournament_id: normalized.tournament.id,
        tournament_name: normalized.tournament.fullName,
        tournament_name_short: normalized.tournament.name,
        tournament_logo: normalized.tournament.logo,
        country_name: normalized.tournament.countryName,
        sport_id: 'motorsport',
        home_team: {
            id: normalized.home.id,
            team_id: normalized.home.id,
            name: normalized.home.name,
            short_name: normalized.home.shortName,
            logo: normalized.home.logo,
            image_path: normalized.home.logo,
            small_image_path: normalized.home.logo,
            team_url: '',
            league: league.slug,
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
            league: league.slug,
            provider: 'espn',
            source: 'espn',
        },
        home_team_name: normalized.home.name,
        away_team_name: normalized.away.name,
        home_team_logo: normalized.home.logo,
        away_team_logo: normalized.away.logo,
        podium: normalized.podium,
        round_number: normalized.round,
        session_type: normalized.sessionType,
        session_label: normalized.sessionLabel,
        scores: { home: null, away: null },
        venue: normalized.venue || undefined,
        provider: 'espn',
        source: 'espn',
    };
}

async function normalizeEspnEventForTournamentViews(event: Record<string, any>, league: EspnMotorsportLeague) {
    const baseEvent = normalizeEspnEventCore(event, league);
    if (!baseEvent) return null;

    if (baseEvent.sessionType !== 'race' || baseEvent.podium.length >= 3) {
        return mapNormalizedEspnEventToTournamentView(baseEvent, league);
    }

    const summary = await fetchMatchSummaryForLeague(league.slug, baseEvent.rawId).catch(() => null);
    const normalized = normalizeEspnEventCore(event, league, summary) || baseEvent;
    if (!normalized) return null;

    return mapNormalizedEspnEventToTournamentView(normalized, league);
}

function normalizeMotorsportStandingsRows(
    payload: EspnStandingsPayload | null | undefined,
    leagueSlug: EspnMotorsportLeagueSlug,
): ExternalStandingsRow[] {
    const entries = getStandingEntries(payload);

    return entries.map((entry: any, index: number) => {
        const athlete = entry?.athlete || entry?.competitor || entry?.team || null;
        const stats = Array.isArray(entry?.stats) ? entry.stats : [];
        const affiliationName = normalizeString(
            entry?.team?.displayName ||
            entry?.team?.shortDisplayName ||
            athlete?.team?.displayName ||
            athlete?.team?.shortDisplayName ||
            athlete?.owner?.displayName ||
            athlete?.owner?.shortDisplayName
        );
        const played = getStatValue(stats, ['events', 'races', 'starts', 'gamesplayed', 'played']) ?? 0;
        const wins = getStatValue(stats, ['wins', 'victories']) ?? 0;
        const points = getStatValue(stats, ['points', 'pts', 'championshippoints']) ??
            Number(entry?.points ?? entry?.pointTotal ?? athlete?.points ?? 0);
        const position = getStatValue(stats, ['rank', 'position', 'playoffseed']) ?? index + 1;
        const racePoints = extractMotorsportRoundStats(stats);

        return {
            position,
            team_name:
                athlete?.displayName ||
                athlete?.shortDisplayName ||
                athlete?.name ||
                entry?.displayName ||
                entry?.name ||
                'Competidor',
            team_id: normalizeString(athlete?.id || entry?.id),
            team_logo: getEntityLogo(athlete),
            team_url: '',
            country_name: getCompetitorCountryName({ athlete, team: athlete }),
            ...(affiliationName ? { affiliation_name: affiliationName } : {}),
            ...(racePoints.length > 0 ? { race_points: racePoints } : {}),
            played,
            won: wins,
            drawn: 0,
            lost: Math.max(0, played - wins),
            points,
            ...(normalizeString(entry?._groupName) ? { group_name: String(entry._groupName) } : {}),
            provider: 'espn',
            source: 'espn',
            league: leagueSlug,
        } as ExternalStandingsRow & Record<string, unknown>;
    });
}

async function buildCoreStandingsRowsBundle(
    leagueSlug: EspnMotorsportLeagueSlug,
) {
    const leagueInfo = await fetchLeagueCoreInfo(leagueSlug).catch(() => null);
    const seasonYear = Number(leagueInfo?.season?.year || 0) || null;
    const seasonTypeId = normalizeString(leagueInfo?.season?.type?.id) || '2';

    if (!seasonYear) {
        return null;
    }

    const [driverRaw, constructorRaw, seasonEvents] = await Promise.all([
        fetchEspnCoreJson<Record<string, any>>(
            `https://sports.core.api.espn.com/v2/sports/racing/leagues/${leagueSlug}/seasons/${seasonYear}/types/${seasonTypeId}/standings/0?lang=en&region=us`,
            'EspnMotorsportCoreDriverStandings',
            CORE_CACHE_TTL,
        ).catch(() => null),
        fetchEspnCoreJson<Record<string, any>>(
            `https://sports.core.api.espn.com/v2/sports/racing/leagues/${leagueSlug}/seasons/${seasonYear}/types/${seasonTypeId}/standings/1?lang=en&region=us`,
            'EspnMotorsportCoreConstructorStandings',
            CORE_CACHE_TTL,
        ).catch(() => null),
        fetchLeagueCoreEvents(leagueSlug, seasonYear).catch(() => []),
    ]);

    const eventById = new Map<string, EspnCoreEventPayload>();
    const eventIndexById = new Map<string, number>();

    seasonEvents.forEach((event: any, index: number) => {
        const eventId = normalizeString(event?.id);
        if (!eventId) return;
        eventById.set(eventId, event);
        eventIndexById.set(eventId, index);
    });

    const driverEntries = Array.isArray(driverRaw?.standings) ? driverRaw.standings : [];
    const constructorEntries = Array.isArray(constructorRaw?.standings) ? constructorRaw.standings : [];

    const driverRows = await Promise.all(
        driverEntries.map(async (entry: any, index: number) => {
            const athleteRef = getRefUrl(entry?.athlete);
            const athlete = athleteRef
                ? await fetchEspnCoreJson<Record<string, any>>(athleteRef, 'EspnMotorsportDriverAthlete', CORE_CACHE_TTL).catch(() => null)
                : null;
            const record = Array.isArray(entry?.records) ? entry.records[0] : null;
            const stats = Array.isArray(record?.stats) ? record.stats : [];
            const points = getStatValue(stats, ['championshippts', 'championshippoints', 'points', 'pts']) ?? 0;
            const position = getStatValue(stats, ['rank', 'position', 'playoffseed']) ?? index + 1;
            const played = getStatValue(stats, ['events', 'races', 'starts', 'gamesplayed', 'played']) ?? 0;
            const wins = getStatValue(stats, ['wins', 'victories']) ?? 0;
            const vehicle = Array.isArray(athlete?.vehicles) ? athlete.vehicles[0] : null;
            const teamName =
                normalizeString(vehicle?.team) ||
                normalizeString(vehicle?.manufacturer) ||
                normalizeString(athlete?.team?.displayName) ||
                normalizeString(athlete?.team?.shortDisplayName);
            const racePoints = athleteRef
                ? await buildRacePointsFromEventLog(
                    buildRefChildUrl(athleteRef, '/eventlog'),
                    eventIndexById,
                    eventById,
                    ['championshippts', 'championshippoints', 'points', 'pts', 'cp'],
                )
                : [];

            return {
                position,
                team_name: athlete?.displayName || athlete?.shortName || 'Piloto',
                team_id: normalizeString(athlete?.id || extractEspnRefId(athleteRef)),
                team_logo: getEntityLogo(athlete),
                team_url: normalizeString(Array.isArray(athlete?.links) ? athlete.links[0]?.href : null),
                country_name: normalizeString(athlete?.flag?.alt) || null,
                country_flag: normalizeString(athlete?.flag?.href) || null,
                affiliation_name: teamName || null,
                race_points: racePoints,
                played,
                won: wins,
                drawn: 0,
                lost: Math.max(0, played - wins),
                points,
                points_total: points,
                abbreviation: normalizeString(athlete?.abbreviation) || null,
                group_name: normalizeString(driverRaw?.displayName || driverRaw?.name) || 'Driver',
                provider: 'espn',
                source: 'espn',
                league: leagueSlug,
            } as ExternalStandingsRow & Record<string, unknown>;
        }),
    );

    const constructorRows = await Promise.all(
        constructorEntries.map(async (entry: any, index: number) => {
            const manufacturerRef = getRefUrl(entry?.manufacturer);
            const manufacturer = manufacturerRef
                ? await fetchEspnCoreJson<Record<string, any>>(manufacturerRef, 'EspnMotorsportConstructor', CORE_CACHE_TTL).catch(() => null)
                : null;
            const record = Array.isArray(entry?.records) ? entry.records[0] : null;
            const stats = Array.isArray(record?.stats) ? record.stats : [];
            const points = getStatValue(stats, ['points', 'pts']) ?? 0;
            const position = getStatValue(stats, ['rank', 'position', 'playoffseed']) ?? index + 1;
            const played = getStatValue(stats, ['events', 'races', 'starts', 'gamesplayed', 'played']) ?? 0;
            const wins = getStatValue(stats, ['wins', 'victories']) ?? 0;
            const racePoints = manufacturerRef
                ? await buildRacePointsFromEventLog(
                    buildRefChildUrl(manufacturerRef, '/eventlog'),
                    eventIndexById,
                    eventById,
                    ['points', 'pts'],
                )
                : [];

            return {
                position,
                team_name:
                    manufacturer?.displayName ||
                    manufacturer?.shortDisplayName ||
                    manufacturer?.name ||
                    'Constructor',
                team_id: normalizeString(manufacturer?.id || extractEspnRefId(manufacturerRef)),
                team_logo: '',
                team_url: '',
                country_name: null,
                country_flag: null,
                affiliation_name: normalizeString(manufacturer?.abbreviation) || 'Constructor',
                race_points: racePoints,
                played,
                won: wins,
                drawn: 0,
                lost: Math.max(0, played - wins),
                points,
                points_total: points,
                abbreviation: normalizeString(manufacturer?.abbreviation) || null,
                group_name: normalizeString(constructorRaw?.displayName || constructorRaw?.name) || 'Constructor',
                provider: 'espn',
                source: 'espn',
                league: leagueSlug,
            } as ExternalStandingsRow & Record<string, unknown>;
        }),
    );

    return {
        seasonYear,
        seasonEvents,
        raw: {
            season: { year: seasonYear },
            league: leagueInfo,
            drivers: driverRaw,
            constructors: constructorRaw,
        },
        driverRows,
        constructorRows,
        allRows: [...driverRows, ...constructorRows],
    };
}

function enrichStandingsRowsForUi(
    standings: ExternalStandingsRow[],
    leagueSlug: EspnMotorsportLeagueSlug,
) {
    return standings.map((row) => ({
        rank: row.position,
        name: row.team_name,
        team_id: row.team_id,
        team_name: row.team_name,
        team_url: row.team_url,
        team_logo: row.team_logo,
        logo: row.team_logo || '',
        country_name: (row as any).country_name || null,
        country_flag: (row as any).country_flag || null,
        affiliation_name: (row as any).affiliation_name || null,
        race_points: (row as any).race_points || [],
        points_total: (row as any).points_total ?? row.points,
        abbreviation: (row as any).abbreviation || null,
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
            country_name: (row as any).country_name || null,
            country_flag: (row as any).country_flag || null,
            affiliation_name: (row as any).affiliation_name || null,
            race_points: (row as any).race_points || [],
            points_total: (row as any).points_total ?? row.points,
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
            country_name: (row as any).country_name || null,
            country_flag: (row as any).country_flag || null,
            affiliation_name: (row as any).affiliation_name || null,
            race_points: (row as any).race_points || [],
            points_total: (row as any).points_total ?? row.points,
        },
        matches_played: row.played,
        played: row.played,
        won: row.won,
        drawn: row.drawn,
        lost: row.lost,
        points: row.points,
        ...(normalizeString((row as any).group_name) ? { group_name: String((row as any).group_name) } : {}),
        provider: 'espn',
        source: 'espn',
    }));
}

function buildTournamentDetails(
    league: EspnMotorsportLeague,
    standingsPayload: EspnStandingsPayload | null | undefined,
) {
    const season =
        standingsPayload?.season?.year ??
        standingsPayload?.requestedSeason?.year ??
        standingsPayload?.header?.season?.year ??
        null;

    return {
        id: toEspnMotorsportTournamentId(league.slug),
        tournament_id: toEspnMotorsportTournamentId(league.slug),
        tournament_stage_id: toEspnMotorsportTournamentId(league.slug),
        tournament_template_id: toEspnMotorsportTournamentId(league.slug),
        season_id: typeof season === 'number' ? season : null,
        name: league.shortName,
        full_name: league.name,
        country: {
            name: league.countryName,
        },
        sport: {
            sport_id: 'motorsport',
            name: 'Motorsport',
        },
        logo: getLeagueLogo(standingsPayload),
        url: league.tournamentUrl,
        source: 'espn',
        provider: 'espn',
    };
}

async function fetchLeagueEventsForWindow(
    leagueSlug: EspnMotorsportLeagueSlug,
    startOffset: number,
    endOffset: number,
) {
    const today = toDateOnly(new Date());
    return fetchScoreboardRangeEvents(leagueSlug, addDays(today, startOffset), addDays(today, endOffset));
}

async function getEspnMotorsportSeasonRaceEventsForTournamentView(
    leagueSlug: EspnMotorsportLeagueSlug,
) {
    const leagueInfo = await fetchLeagueCoreInfo(leagueSlug).catch(() => null);
    const seasonYear = Number(leagueInfo?.season?.year || 0) || null;
    if (!seasonYear) return [];

    const league = LEAGUES[leagueSlug];
    const seasonStart = parseDate(leagueInfo?.season?.startDate) || new Date(Date.UTC(seasonYear, 0, 1));
    const seasonEnd = parseDate(leagueInfo?.season?.endDate) || new Date(Date.UTC(seasonYear, 11, 31));
    const events = await fetchScoreboardRangeEvents(leagueSlug, seasonStart, seasonEnd);
    const normalized = (await Promise.all(events.map((event) => normalizeEspnEventForTournamentViews(event, league))))
        .filter((event): event is NonNullable<Awaited<ReturnType<typeof normalizeEspnEventForTournamentViews>>> => Boolean(event))
        .filter((event) => event.session_type === 'race')
        .sort((left, right) => (left.timestamp || 0) - (right.timestamp || 0))
        .map((event, index) => ({
            ...event,
            round_number: index + 1,
        }));

    return normalized;
}

export async function getEspnMotorsportMatches(
    date: Date,
    _options?: { timeZone?: string; targetDateKey?: string },
): Promise<Match[]> {
    const targetDate = toDateOnly(date);
    const eventsByLeague = await Promise.all(
        SUPPORTED_ESPN_MOTORSPORT_LEAGUES.map((league) =>
            fetchScoreboardRangeEvents(league.slug, targetDate, targetDate),
        ),
    );

    return eventsByLeague.flatMap((events, index) => {
        const league = SUPPORTED_ESPN_MOTORSPORT_LEAGUES[index];
        return events
            .map((event) => normalizeEspnEventCore(event, league))
            .filter((event): event is NonNullable<ReturnType<typeof normalizeEspnEventCore>> => Boolean(event))
              .filter((event) => event.sessionType === 'race')
              .map((event) => ({
                  id: event.id,
                  tournamentId: event.tournament.id,
                  leagueName: event.tournament.fullName,
                  leagueShortName: event.tournament.name,
                  countryName: event.tournament.countryName,
                  eventName: event.eventName,
                  phaseId: 'group',
                  round: event.round,
                  homeTeamId: event.home.id || `espn-race-home-${league.slug}`,
                homeTeamName: event.home.name,
                awayTeamId: event.away.id || `espn-race-away-${league.slug}`,
                awayTeamName: event.away.name,
                homeTeamLogo: event.home.logo,
                awayTeamLogo: event.away.logo,
                scheduledAt: event.kickoff,
                venueName: event.venue || undefined,
                status: event.status,
                score: { home: null, away: null },
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

export async function getEspnMotorsportLiveMatches(): Promise<Match[]> {
    const today = toDateOnly(new Date());
    const matches = await getEspnMotorsportMatches(today);
    return matches.filter((match) => match.status === 'live');
}

export async function getEspnMotorsportLeagueResults(
    leagueSlug: EspnMotorsportLeagueSlug,
    page: number = 1,
) {
    const normalized = (await getEspnMotorsportSeasonRaceEventsForTournamentView(leagueSlug))
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

export async function getEspnMotorsportLeagueFixtures(
    leagueSlug: EspnMotorsportLeagueSlug,
    page: number = 1,
) {
    const normalized = (await getEspnMotorsportSeasonRaceEventsForTournamentView(leagueSlug))
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

export async function getEspnMotorsportLeagueStandings(
    leagueSlug: EspnMotorsportLeagueSlug,
) {
    const coreBundle = await buildCoreStandingsRowsBundle(leagueSlug).catch(() => null);
    if (coreBundle) {
        return {
            raw: coreBundle.raw,
            rows: coreBundle.allRows,
            enrichedRows: enrichStandingsRowsForUi(coreBundle.allRows, leagueSlug),
        };
    }

    const raw = await fetchLeagueStandingsRaw(leagueSlug);
    const rows = normalizeMotorsportStandingsRows(raw, leagueSlug);
    return {
        raw,
        rows,
        enrichedRows: enrichStandingsRowsForUi(rows, leagueSlug),
    };
}

export async function getEspnMotorsportTournamentBundle(
    leagueSlug: EspnMotorsportLeagueSlug,
) {
    const [resultsData, fixturesData, standingsData] = await Promise.all([
        getEspnMotorsportLeagueResults(leagueSlug, 1),
        getEspnMotorsportLeagueFixtures(leagueSlug, 1),
        getEspnMotorsportLeagueStandings(leagueSlug),
    ]);

    const league = LEAGUES[leagueSlug];
    const details = buildTournamentDetails(league, standingsData.raw);
    const seasonId = details.season_id;

    return {
        ids: {
            tournamentId: toEspnMotorsportTournamentId(leagueSlug),
            stageId: toEspnMotorsportTournamentId(leagueSlug),
            templateId: toEspnMotorsportTournamentId(leagueSlug),
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

export async function getEspnMotorsportMatchBundle(matchId: string) {
    const parsed = parseEspnMotorsportMatchId(matchId);
    if (!parsed) return null;

    const { leagueSlug, eventId } = parsed;
    const events = await fetchLeagueEventsForWindow(leagueSlug, -365, 365);
    const event = events.find((item) => normalizeString(item?.id) === eventId);
    if (!event) return null;

    const league = LEAGUES[leagueSlug];
    const normalized = normalizeEspnEventCore(event, league);
    if (!normalized) return null;

    const standingsData = await getEspnMotorsportLeagueStandings(leagueSlug);

    return {
        source: 'espn' as const,
        match: {
            id: normalized.id,
            externalProvider: 'espn',
            sportId: 'motorsport',
            status: normalized.status,
            date: normalized.kickoff.toISOString(),
            time: normalized.kickoff.toLocaleTimeString('es-AR', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
                timeZone: 'America/Argentina/Buenos_Aires',
            }),
            tournament: league.shortName,
            tournamentLogo: normalized.tournament.logo,
            tournamentId: normalized.tournament.id,
            tournamentSeason: null,
            category: league.countryName,
            round: normalized.eventName,
            venue: normalized.venue || '',
            referee: null,
            home: {
                id: normalized.home.id,
                name: normalized.home.name,
                logo: normalized.home.logo,
                score: null,
                teamUrl: '',
                league: league.slug,
            },
            away: {
                id: normalized.away.id,
                name: normalized.away.name,
                logo: normalized.away.logo,
                score: null,
                teamUrl: '',
                league: league.slug,
            },
            lineups: null,
            standings: standingsData.enrichedRows,
            h2h: [],
            draw: [],
            form: [],
            topScorers: [],
        },
        h2h: [],
        standings: standingsData.enrichedRows,
    };
}
