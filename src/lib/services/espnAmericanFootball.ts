/**
 * Fútbol americano por ESPN: red, caché y armado de los bundles.
 *
 * Toda la interpretación del JSON vive en `espnAmericanFootballParser.ts`
 * (puro, con tests). Acá solo se decide QUÉ pedir y cómo se junta.
 *
 * Endpoints (medidos el 2026-09-10):
 * - scoreboard `?dates=AAAAMMDD-AAAAMMDD&limit=1000`: sin `limit` la NCAA corta
 *   en 300 eventos por rango y un tramo de 45 días tiene unos 390.
 * - standings `?level=3` para la NFL: baja hasta la división. Sin `level` viene
 *   por conferencia.
 * - summary `?event=`: trae `standings.groups[]` (las divisiones de los dos
 *   equipos), boxscore, drives, jugadas de anotación y árbitros.
 * - teams/{id}/schedule: el marcador viene como objeto; lo resuelve el parser.
 *
 * Solo se consultan las ligas ACTIVAS: la CFL y la XFL están muertas en ESPN
 * (ver `LEAGUES`) y las cubre FlashScore.
 */

import { apiFetch } from '@/lib/apiFetch';
import { memoryCache } from '@/lib/cache';
import type { Match } from '@/types/match';
import {
    ACTIVE_ESPN_AMERICAN_FOOTBALL_LEAGUES,
    LEAGUES,
    buildAmericanFootballDrives,
    buildAmericanFootballPlayerStats,
    buildAmericanFootballScoringPlays,
    buildAmericanFootballTeamStats,
    buildRosterPlayers,
    enrichStandingsRowsForUi,
    getEspnAttendance,
    getEspnCoachName,
    getEspnLinescores,
    getEspnLiveClock,
    getEspnLogo,
    getEspnReferee,
    getEspnRoundLabel,
    getEspnSeasonPhase,
    getEspnSituation,
    getEspnTeamDisplayName,
    getLeagueLogo,
    getLeagueSeason,
    isEspnAmericanFootballLeagueSlug,
    isEspnTournamentViewEvent,
    isRecord,
    mapEspnStatus,
    normalizeEspnAmericanFootballStandingsRows,
    normalizeEspnEventCore,
    normalizeEspnEventForTournamentViews,
    normalizeEspnSummaryStandingsRows,
    normalizeString,
    parseDate,
    parseScore,
    toEspnAmericanFootballMatchId,
    toEspnAmericanFootballTeamId,
    toEspnAmericanFootballTournamentId,
    toFeedPhaseId,
    type EspnAmericanFootballLeague,
    type EspnAmericanFootballLeagueSlug,
    type EspnNormalizedEvent,
} from './espnAmericanFootballParser';

export * from './espnAmericanFootballParser';

type EspnScoreboardEvent = Record<string, any>;
type EspnSummaryPayload = Record<string, any>;
type EspnStandingsPayload = Record<string, any>;

const SCOREBOARD_CACHE_TTL = 300;
const MATCH_CACHE_TTL = 300;
const TEAM_CACHE_TTL = 1800;
const STANDINGS_CACHE_TTL = 1800;
const TEAM_SCHEDULE_RANGE_DAYS = 240;
const SCOREBOARD_CHUNK_DAYS = 44;
const SCOREBOARD_LIMIT = 1000;

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
        const chunkEnd = addDays(cursor, SCOREBOARD_CHUNK_DAYS);
        const boundedEnd = chunkEnd <= safeEnd ? chunkEnd : safeEnd;
        const datesParam = `${formatEspnDate(cursor)}-${formatEspnDate(boundedEnd)}`;
        const url = `https://site.api.espn.com/apis/site/v2/sports/football/${leagueSlug}/scoreboard?dates=${datesParam}&limit=${SCOREBOARD_LIMIT}`;
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
    const league = LEAGUES[leagueSlug];
    const level = league.standingsLevel ? `?level=${league.standingsLevel}` : '';
    const url = `https://site.api.espn.com/apis/v2/sports/football/${leagueSlug}/standings${level}`;
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
        ACTIVE_ESPN_AMERICAN_FOOTBALL_LEAGUES.map(async (league) => ({
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
    const preferred = isEspnAmericanFootballLeagueSlug(preferredLeague) && LEAGUES[preferredLeague].active
        ? preferredLeague
        : null;
    const orderedLeagues = preferred
        ? [LEAGUES[preferred], ...ACTIVE_ESPN_AMERICAN_FOOTBALL_LEAGUES.filter((league) => league.slug !== preferred)]
        : ACTIVE_ESPN_AMERICAN_FOOTBALL_LEAGUES;

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

function toFeedMatch(event: EspnNormalizedEvent): Match {
    return {
        id: event.id,
        tournamentId: event.tournament.id,
        // Denormalizado para el feed y para la fila de cache: sin esto el
        // partido de la NFL se agrupaba como "Internacional: Liga (cache)" en
        // vez de "USA: NFL".
        leagueName: event.tournament.name,
        countryName: event.tournament.countryName,
        leagueUrl: event.tournament.url,
        leagueLogo: event.tournament.logo || undefined,
        // Pretemporada, temporada regular y playoffs reinician la semana: sin
        // la fase, la semana 1 de playoffs se confundía con la 1 regular.
        phaseId: toFeedPhaseId(event.phase),
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
        currentMinute: event.live.label || undefined,
        result: {
            isComplete: event.status === 'final',
            updatedAt: new Date(),
            updatedBy: 'espn',
            version: 1,
        },
        createdFrom: 'generator' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
    };
}

export async function getEspnAmericanFootballMatches(
    date: Date,
    _options?: { timeZone?: string; targetDateKey?: string },
): Promise<Match[]> {
    // ESPN interpreta `dates=` en hora del Este de Estados Unidos. Coincide con
    // el día argentino salvo para partidos que arrancan después de las 23 ET,
    // que en la práctica no existen.
    const targetDate = toDateOnly(date);
    const eventsByLeague = await Promise.all(
        ACTIVE_ESPN_AMERICAN_FOOTBALL_LEAGUES.map((league) =>
            fetchScoreboardRangeEvents(league.slug, targetDate, targetDate),
        ),
    );

    return eventsByLeague.flatMap((events, index) => {
        const league = ACTIVE_ESPN_AMERICAN_FOOTBALL_LEAGUES[index];
        return events
            .map((event) => normalizeEspnEventCore(event, league))
            .filter((event): event is EspnNormalizedEvent => Boolean(event))
            .map(toFeedMatch);
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
    const status = mapEspnStatus(competition?.status?.type);

    // La tabla de la ficha: primero las divisiones de los dos equipos que trae el
    // resumen; si no vienen, la tabla de liga entera.
    let standingsRows = normalizeEspnSummaryStandingsRows(summary);
    if (standingsRows.length === 0) {
        const standingsRaw = await fetchLeagueStandingsRaw(league.slug).catch(() => null);
        standingsRows = normalizeEspnAmericanFootballStandingsRows(standingsRaw, league.slug);
    }
    const standings = enrichStandingsRowsForUi(standingsRows, league.slug);

    const homeTeamId = normalizeString(home?.team?.id || home?.id);
    const awayTeamId = normalizeString(away?.team?.id || away?.id);
    const h2h = await buildRecentH2H(league.slug, matchId, homeTeamId, awayTeamId).catch(() => []);
    const live = getEspnLiveClock(competition?.status);
    const events = buildAmericanFootballScoringPlays(summary, homeTeamId);
    const stats = buildAmericanFootballTeamStats(summary);
    const drives = buildAmericanFootballDrives(summary);
    const playerStats = buildAmericanFootballPlayerStats(summary);
    const roundLabel = getEspnRoundLabel({
        season: header?.season,
        week: { number: header?.week },
        competitions: [competition],
    });

    return {
        source: 'espn' as const,
        summary,
        match: {
            id: toEspnAmericanFootballMatchId(matchId),
            externalProvider: 'espn',
            sportId: 'american-football',
            status,
            currentMinute: live.label,
            period: live.period,
            clock: live.clock,
            situation: status === 'live' ? getEspnSituation(competition) : null,
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
            seasonPhase: getEspnSeasonPhase(header),
            category: league.countryName,
            round: roundLabel,
            venue: normalizeString(competition?.venue?.fullName) || normalizeString(summary?.gameInfo?.venue?.fullName) || '',
            neutralSite: competition?.neutralSite === true,
            referee: getEspnReferee(summary),
            attendance: getEspnAttendance(summary),
            home: {
                id: homeTeamId ? toEspnAmericanFootballTeamId(homeTeamId) : null,
                name: getEspnTeamDisplayName(home),
                logo: getEspnLogo(home?.team || home),
                score: parseScore(home?.score),
                linescores: getEspnLinescores(home),
                teamUrl: '',
                league: league.slug,
            },
            away: {
                id: awayTeamId ? toEspnAmericanFootballTeamId(awayTeamId) : null,
                name: getEspnTeamDisplayName(away),
                logo: getEspnLogo(away?.team || away),
                score: parseScore(away?.score),
                linescores: getEspnLinescores(away),
                teamUrl: '',
                league: league.slug,
            },
            lineups: null,
            standings,
            h2h,
            events,
            stats,
            drives,
            playerStats,
            draw: [],
            form: [],
            topScorers: [],
        },
        h2h,
        standings,
        events,
        stats,
        drives,
        playerStats,
    };
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
    const venue = team?.franchise?.venue || resolved.details?.franchise?.venue;
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
            coach: getEspnCoachName(rosterPayload),
            standing: standingRow ? {
                position: standingRow.position,
                group_name: standingRow.group_name ?? null,
                points: standingRow.points,
                played: standingRow.played,
                won: standingRow.won,
                drawn: standingRow.drawn,
                lost: standingRow.lost,
                win_percentage: standingRow.win_percentage ?? null,
                seed: standingRow.seed ?? null,
                streak: standingRow.streak ?? null,
            } : null,
            statistics: standingRow ? {
                played: standingRow.played,
                wins: standingRow.won,
                draws: standingRow.drawn,
                losses: standingRow.lost,
                pointsFor: standingRow.scored ?? null,
                pointsAgainst: standingRow.conceded ?? null,
                winPercentage: standingRow.win_percentage ?? null,
            } : null,
            short_code: team?.abbreviation || '',
            description: normalizeString(team?.standingSummary) || normalizeString(resolved.details?.standingSummary) || '',
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
