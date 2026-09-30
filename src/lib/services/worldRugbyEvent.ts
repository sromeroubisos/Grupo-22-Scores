/**
 * Torneos de World Rugby que FlashScore no cubre (el U20 Challenger 2026 de
 * Santiago), en el feed de la app: descarga, caché y traducción al modelo de
 * partido de G22.
 *
 * La fuente y su lectura están en `worldRugbyEventParser.ts` (módulo puro y
 * testeado). Acá va lo que toca el mundo: fetch a la API de Pulselive, caché
 * con TTL adaptativo y el mapeo a `Match` / a la vista de torneo / a la vista
 * de partido.
 *
 * Mismo patrón que `ultimateSevens.ts`: un proveedor virtual, sin fila en la
 * base. El torneo y sus selecciones existen solo en el feed.
 *
 * Módulo de servidor: hace fetch cross-origin. No lo importes desde un
 * componente cliente.
 */

import type { Match } from '@/types/match';
import { memoryCache } from '@/lib/cache';
import { formatDateKey } from '@/lib/timezone';
import { getNationalTeamFlag } from '@/lib/utils/teamLogoOverrides';
import {
    WR_API_URL,
    WR_EVENTS,
    WR_PROVIDER,
    computeWrPoolTables,
    parseWrMatchId,
    parseWrSchedule,
    parseWrSquads,
    parseWrStandings,
    parseWrStats,
    parseWrSummary,
    parseWrTimeline,
    pickWrStandings,
    wrCountryEs,
    wrLiveLabel,
    wrMatchIdOf,
    wrPeriodScores,
    wrRefereeOf,
    wrRefreshTtlSeconds,
    wrTeamIdOf,
    wrTriesOf,
    type WrEventDef,
    type WrFixture,
    type WrLineupPlayer,
    type WrPerson,
    type WrPoolTable,
    type WrSide,
    type WrStandingRow,
    type WrSummary,
} from '@/lib/services/worldRugbyEventParser';

export {
    WR_EVENTS,
    WR_PROVIDER,
    parseWrMatchId,
    wrEventByTournamentId,
} from '@/lib/services/worldRugbyEventParser';

const CACHE_PREFIX = 'wr';
const FETCH_TIMEOUT_MS = 15000;
const MINUTE = 60;
/** Los planteles del torneo se entregan antes del primer partido. */
const TTL_SQUADS_SECONDS = 6 * 60 * MINUTE;
/** La tabla oficial se genera aparte y no cambia mientras no termine un partido. */
const TTL_STANDINGS_SECONDS = 5 * MINUTE;
/** Con la pelota en juego la cronología cambia con cada try; cerrada, ya no cambia. */
const TTL_MATCH_LIVE_SECONDS = 15;
const TTL_MATCH_FINAL_SECONDS = 60 * MINUTE;
/** La formación se publica 48 h antes y puede corregirse hasta el inicio. */
const TTL_SUMMARY_SCHEDULED_SECONDS = 10 * MINUTE;

// --------------------------------------------------------------------------
// Cliente HTTP + caché
// --------------------------------------------------------------------------

const inflight = new Map<string, Promise<unknown>>();

/**
 * Último dato bueno de cada recurso, sin vencimiento: si la API no contesta un
 * rato, el fixture no se le vacía a nadie.
 */
const lastGood = new Map<string, unknown>();

/** Lanza si la API no contesta. Un fallo NO es "no hay partidos". */
async function fetchJson(path: string): Promise<unknown> {
    const pending = inflight.get(path);
    if (pending) return pending;

    const request = (async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
        try {
            const response = await fetch(`${WR_API_URL}${path}`, {
                signal: controller.signal,
                cache: 'no-store',
                headers: {
                    'User-Agent': 'G22Scores/1.0 (+https://g22scores.com)',
                    Accept: 'application/json',
                },
            });
            if (!response.ok) {
                throw new Error(`[World Rugby] ${path} respondió ${response.status}`);
            }
            return await response.json();
        } finally {
            clearTimeout(timeout);
            inflight.delete(path);
        }
    })();

    inflight.set(path, request);
    return request;
}

async function readResource(
    cacheKey: string,
    path: string,
    ttlSeconds: (json: unknown) => number,
): Promise<unknown> {
    const cached = memoryCache.get<unknown>(cacheKey);
    if (cached !== null && cached !== undefined) return cached;

    try {
        const json = await fetchJson(path);
        if (!json || typeof json !== 'object') throw new Error(`[World Rugby] ${path} no devolvió un objeto`);
        memoryCache.set(cacheKey, json, ttlSeconds(json));
        lastGood.set(cacheKey, json);
        return json;
    } catch (error) {
        const stale = lastGood.get(cacheKey);
        if (stale !== undefined) {
            console.warn(`[World Rugby] ${path} no responde; sirvo el último dato bueno.`, error instanceof Error ? error.message : error);
            return stale;
        }
        throw error;
    }
}

// --------------------------------------------------------------------------
// Recursos
// --------------------------------------------------------------------------

/**
 * El fixture de un torneo. En caché se guarda el JSON CRUDO y se parsea en
 * cada lectura: el estado depende del reloj (un "en vivo" a horas del inicio
 * es un ensayo de la mesa).
 */
async function getEventFixtures(event: WrEventDef): Promise<WrFixture[]> {
    const json = await readResource(
        `${CACHE_PREFIX}:schedule:${event.eventId}`,
        `/event/${event.eventId}/schedule`,
        (raw) => wrRefreshTtlSeconds(parseWrSchedule(raw, event, Date.now()), Date.now()),
    );
    return parseWrSchedule(json, event, Date.now());
}

/** Todos los torneos a la vez. Uno caído no se lleva a los demás. */
async function getAllFixtures(): Promise<{ event: WrEventDef; fixture: WrFixture }[]> {
    const results = await Promise.all(WR_EVENTS.map(async (event) => {
        try {
            return (await getEventFixtures(event)).map((fixture) => ({ event, fixture }));
        } catch (error) {
            console.warn(`[World Rugby] fixture de ${event.name} no disponible:`, error instanceof Error ? error.message : error);
            return [];
        }
    }));
    return results.flat();
}

function matchTtl(fixture: WrFixture): number {
    return fixture.state === 'final' ? TTL_MATCH_FINAL_SECONDS : TTL_MATCH_LIVE_SECONDS;
}

async function getTimelineJson(fixture: WrFixture): Promise<unknown | null> {
    if (fixture.state !== 'live' && fixture.state !== 'final') return null;
    return readResource(`${CACHE_PREFIX}:timeline:${fixture.matchId}`, `/match/${fixture.matchId}/timeline`, () => matchTtl(fixture));
}

async function getStatsJson(fixture: WrFixture): Promise<unknown | null> {
    if (fixture.state !== 'live' && fixture.state !== 'final') return null;
    return readResource(`${CACHE_PREFIX}:stats:${fixture.matchId}`, `/match/${fixture.matchId}/stats`, () => matchTtl(fixture));
}

async function getSummary(fixture: WrFixture): Promise<WrSummary> {
    const ttl = fixture.state === 'scheduled' ? TTL_SUMMARY_SCHEDULED_SECONDS : matchTtl(fixture);
    return parseWrSummary(await readResource(`${CACHE_PREFIX}:summary:${fixture.matchId}`, `/match/${fixture.matchId}/summary`, () => ttl));
}

async function getSquads(event: WrEventDef): Promise<Map<string, WrPerson[]>> {
    return parseWrSquads(await readResource(`${CACHE_PREFIX}:squads:${event.eventId}`, `/event/${event.eventId}/squads`, () => TTL_SQUADS_SECONDS));
}

/**
 * La tabla de cada grupo. La oficial manda si está al día; si no, se calcula
 * con los tries de la cronología de cada partido terminado (medido contra el
 * Mundial Juvenil 2026: los cuatro grupos dan igual que la oficial).
 */
async function getPoolTables(event: WrEventDef, fixtures: WrFixture[]): Promise<WrPoolTable[]> {
    const finished = fixtures.filter((fixture) => fixture.pool && fixture.state === 'final');
    const [official, tries] = await Promise.all([
        readResource(`${CACHE_PREFIX}:standings:${event.eventId}`, `/event/${event.eventId}/standings`, () => TTL_STANDINGS_SECONDS)
            .then((json) => parseWrStandings(json, event))
            .catch(() => [] as WrPoolTable[]),
        Promise.all(finished.map(async (fixture) => {
            const json = await getTimelineJson(fixture).catch(() => null);
            return [fixture.matchId, json ? wrTriesOf(json) : null] as const;
        })),
    ]);
    const triesByMatch = new Map<string, { home: number; away: number }>();
    for (const [matchId, value] of tries) if (value) triesByMatch.set(matchId, value);
    return pickWrStandings(official, computeWrPoolTables(fixtures, triesByMatch)).tables;
}

// --------------------------------------------------------------------------
// Identidad de cada lado
// --------------------------------------------------------------------------

/** La bandera del país. Un lugar del cuadro sin dueño no tiene ninguna. */
function flagOf(side: Pick<WrSide, 'country' | 'placeholder'>): string {
    if (side.placeholder || !side.country) return '';
    return getNationalTeamFlag(wrCountryEs(side.country)) ?? getNationalTeamFlag(side.country) ?? '';
}

function teamIdOf(side: WrSide): string {
    return wrTeamIdOf(side.teamId, side.name);
}

// --------------------------------------------------------------------------
// Mapeo al modelo de la app
// --------------------------------------------------------------------------

function liveLabel(fixture: WrFixture): string | undefined {
    return fixture.state === 'live' ? wrLiveLabel(fixture.rawStatus, fixture.clockSecs) : undefined;
}

function toAppMatch(event: WrEventDef, fixture: WrFixture): Match | null {
    if (fixture.kickoffMs === null) return null;
    const now = new Date();
    const homeLogo = flagOf(fixture.home);
    const awayLogo = flagOf(fixture.away);

    return {
        id: wrMatchIdOf(fixture.matchId),
        tournamentId: event.tournamentId,
        leagueName: event.name,
        countryName: 'Internacional',
        leagueUrl: event.url,
        leagueStageName: fixture.stageLabel,
        leagueLogo: event.logo,

        phaseId: fixture.pool ? 'group' : 'playoff',
        round: fixture.round,

        homeTeamId: teamIdOf(fixture.home),
        homeTeamName: fixture.home.name,
        awayTeamId: teamIdOf(fixture.away),
        awayTeamName: fixture.away.name,

        homeTeamLogo: homeLogo,
        awayTeamLogo: awayLogo,
        homeTeamImagePath: homeLogo,
        awayTeamImagePath: awayLogo,
        homeTeamUrl: '',
        awayTeamUrl: '',

        scheduledAt: new Date(fixture.kickoffMs),
        venueName: fixture.venue || undefined,

        status: fixture.state,
        score: {
            home: fixture.home.score,
            away: fixture.away.score,
            penalties: null,
        },
        result: {
            isComplete: fixture.state === 'final',
            updatedAt: now,
            updatedBy: WR_PROVIDER,
            version: 1,
        },
        currentMinute: liveLabel(fixture),
        createdFrom: 'generator',
        createdAt: now,
        updatedAt: now,
    };
}

/** Partidos de los torneos de World Rugby que caen en la fecha pedida, en el huso del usuario. */
export async function getWorldRugbyMatches(
    date: Date,
    options?: { timeZone?: string; targetDateKey?: string },
): Promise<Match[]> {
    const timeZone = options?.timeZone;
    const targetDateKey = options?.targetDateKey || formatDateKey(date, timeZone);

    return (await getAllFixtures())
        .map(({ event, fixture }) => toAppMatch(event, fixture))
        .filter((match): match is Match => match !== null)
        .filter((match) => match.scheduledAt !== null && formatDateKey(match.scheduledAt, timeZone) === targetDateKey);
}

/**
 * ¿Algún torneo juega ese día? Sale del fixture publicado, no de un rango
 * escrito a mano. Es una compuerta: si la API no contesta, el feed sigue.
 */
export async function hasWorldRugbyMatchesOnDate(targetDateKey: string, timeZone?: string): Promise<boolean> {
    const fixtures = await getAllFixtures().catch(() => []);
    return fixtures.some(({ fixture }) =>
        fixture.kickoffMs !== null && formatDateKey(new Date(fixture.kickoffMs), timeZone) === targetDateKey);
}

export async function getWorldRugbyLiveMatches(): Promise<Match[]> {
    return (await getAllFixtures())
        .filter(({ fixture }) => fixture.state === 'live')
        .map(({ event, fixture }) => toAppMatch(event, fixture))
        .filter((match): match is Match => match !== null);
}

// --------------------------------------------------------------------------
// Vista de torneo (detalle, fixture, resultados, tabla)
// --------------------------------------------------------------------------

function teamView(side: WrSide) {
    const id = teamIdOf(side);
    const logo = flagOf(side);
    return {
        id,
        team_id: id,
        name: side.name,
        short_name: side.name,
        logo,
        image_path: logo,
        small_image_path: logo,
        team_url: '',
        country_name: side.placeholder ? 'Internacional' : wrCountryEs(side.country),
        // Un lugar del cuadro ("1.º Grupo A") no es un equipo: la pantalla no
        // lo cuenta ni lo lista.
        placeholder: side.placeholder,
        provider: WR_PROVIDER,
        source: WR_PROVIDER,
    };
}

function toTournamentViewMatch(event: WrEventDef, fixture: WrFixture) {
    const id = wrMatchIdOf(fixture.matchId);
    const timestamp = fixture.kickoffMs !== null ? Math.floor(fixture.kickoffMs / 1000) : null;

    return {
        match_id: id,
        event_key: id,
        timestamp,
        date: fixture.kickoffIso,
        match_status: fixture.state,
        event_status: fixture.state,
        status: fixture.state,
        status_text: fixture.rawStatus,
        event_name: fixture.stageLabel,
        round_number: fixture.round,
        tournament_id: event.tournamentId,
        tournament_name: event.name,
        tournament_name_short: event.name,
        tournament_logo: event.logo,
        tournament_stage_name: fixture.stageLabel,
        country_name: 'Internacional',
        sport_id: 'rugby',
        home_team: teamView(fixture.home),
        away_team: teamView(fixture.away),
        home_team_name: fixture.home.name,
        away_team_name: fixture.away.name,
        home_team_logo: flagOf(fixture.home),
        away_team_logo: flagOf(fixture.away),
        scores: {
            home: fixture.home.score,
            away: fixture.away.score,
            penalties: null,
        },
        venue: fixture.venue || undefined,
        url: event.siteUrl,
        provider: WR_PROVIDER,
        source: WR_PROVIDER,
    };
}

/**
 * Fila de posiciones con el vocabulario de la pantalla de torneo. Emite los
 * dos juegos de nombres (`wins`/`won`, `matches_played`/`played`) porque la
 * tabla y la exportación no leen los mismos campos, igual que la FIH.
 */
function toStandingsRow(row: WrStandingRow, position: number, groupName: string) {
    const side: WrSide = {
        teamId: row.teamId,
        name: row.name,
        country: row.country,
        abbreviation: null,
        placeholder: false,
        score: null,
    };
    const identity = teamView(side);
    const difference = row.pointsFor - row.pointsAgainst;

    return {
        position,
        rank: position,
        name: row.name,
        team_name: row.name,
        team_id: identity.team_id,
        team_logo: identity.logo,
        logo: identity.logo,
        team_url: '',
        team: identity,
        participant: identity,
        group_name: groupName,
        matches_played: row.played,
        matches_total: row.played,
        played: row.played,
        wins: row.won,
        won: row.won,
        wins_total: row.won,
        draws: row.drawn,
        drawn: row.drawn,
        draws_total: row.drawn,
        losses: row.lost,
        lost: row.lost,
        losses_total: row.lost,
        goals_for: row.pointsFor,
        goals_against: row.pointsAgainst,
        points_for: row.pointsFor,
        points_against: row.pointsAgainst,
        scored: row.pointsFor,
        conceded: row.pointsAgainst,
        goal_difference: difference,
        points_diff: difference,
        tries_for: row.triesFor,
        tries_against: row.triesAgainst,
        bonus_points: row.bonusPoints,
        points: row.points,
        points_total: row.points,
        provider: WR_PROVIDER,
        source: WR_PROVIDER,
    };
}

function toStandingsGroups(tables: WrPoolTable[]) {
    return tables.map((table) => ({
        group_name: table.name,
        name: table.name,
        note: 'Triunfo 4, empate 2. Bonus: 1 por cuatro tries o más y 1 por perder por siete o menos.',
        rows: table.rows.map((row, index) => toStandingsRow(row, index + 1, table.name)),
    }));
}

function buildTournamentDetails(event: WrEventDef) {
    return {
        id: event.tournamentId,
        tournament_id: event.tournamentId,
        tournament_stage_id: event.tournamentId,
        tournament_template_id: event.tournamentId,
        season_id: Number(event.season),
        season: event.season,
        name: event.name,
        full_name: event.fullName,
        gender: 'Masculino',
        country: { name: 'Internacional' },
        sport: { sport_id: 'rugby', name: 'Rugby' },
        logo: event.logo,
        image_path: event.logo,
        url: event.url,
        source: WR_PROVIDER,
        provider: WR_PROVIDER,
    };
}

export async function getWorldRugbyTournamentBundle(event: WrEventDef) {
    const allFixtures = await getEventFixtures(event);
    const views = allFixtures.map((fixture) => ({ fixture, view: toTournamentViewMatch(event, fixture) }));

    const results = views
        .filter(({ fixture }) => fixture.state === 'final')
        .sort((left, right) => (right.view.timestamp || 0) - (left.view.timestamp || 0))
        .map(({ view }) => view);

    const fixtures = views
        .filter(({ fixture }) => fixture.state !== 'final')
        .sort((left, right) => (left.view.timestamp || 0) - (right.view.timestamp || 0))
        .map(({ view }) => view);

    const standings = toStandingsGroups(await getPoolTables(event, allFixtures).catch(() => [] as WrPoolTable[]));

    return {
        ids: {
            tournamentId: event.tournamentId,
            stageId: event.tournamentId,
            templateId: event.tournamentId,
            seasonId: event.season,
        },
        details: buildTournamentDetails(event),
        results,
        fixtures,
        standings,
        standingsForm: [] as unknown[],
        standingsHtFt: [] as unknown[],
        standingsOverUnder: [] as unknown[],
        teamLabels: [] as unknown[],
        topScorers: [] as unknown[],
        draw: [] as unknown[],
        archives: [] as unknown[],
    };
}

// --------------------------------------------------------------------------
// Detalle del partido
// --------------------------------------------------------------------------

type LineupPlayer = {
    id: null;
    name: string;
    number: number | null;
    position: string;
    role: 'starter' | 'substitute';
    rating: null;
    isCaptain: boolean;
    caps: null;
};

function toLineupPlayer(player: WrLineupPlayer): LineupPlayer {
    return {
        // Sin id a propósito: los jugadores de World Rugby no tienen ficha en
        // G22, y un link a un 404 es peor que un nombre quieto.
        id: null,
        name: player.name,
        number: player.number,
        position: player.position,
        role: player.isReplacement ? 'substitute' : 'starter',
        rating: null,
        isCaptain: player.isCaptain,
        caps: null,
    };
}

function squadPlayer(person: WrPerson): LineupPlayer {
    return { id: null, name: person.name, number: null, position: '', role: 'starter', rating: null, isCaptain: false, caps: null };
}

/**
 * La formación del partido si ya se publicó (48 h antes); si no, el plantel
 * del torneo entero, rotulado como plantel. Null si no hay ni una cosa ni la
 * otra (un cruce sin definir).
 */
function buildLineups(fixture: WrFixture, summary: WrSummary | null, squads: Map<string, WrPerson[]>) {
    const hasSheet = Boolean(summary && (summary.home.starters.length > 0 || summary.away.starters.length > 0));
    const none: LineupPlayer[] = [];

    let homeStarters: LineupPlayer[];
    let awayStarters: LineupPlayer[];
    let homeSubs: LineupPlayer[] = none;
    let awaySubs: LineupPlayer[] = none;

    if (hasSheet && summary) {
        homeStarters = summary.home.starters.map(toLineupPlayer);
        awayStarters = summary.away.starters.map(toLineupPlayer);
        homeSubs = summary.home.replacements.map(toLineupPlayer);
        awaySubs = summary.away.replacements.map(toLineupPlayer);
    } else {
        homeStarters = (fixture.home.teamId ? squads.get(fixture.home.teamId) ?? [] : []).map(squadPlayer);
        awayStarters = (fixture.away.teamId ? squads.get(fixture.away.teamId) ?? [] : []).map(squadPlayer);
    }

    if (homeStarters.length === 0 && awayStarters.length === 0) return { lineups: null, kind: null };

    return {
        kind: hasSheet ? 'lineup' as const : 'squad' as const,
        lineups: {
            HOME_STARTING_LINEUPS: homeStarters,
            AWAY_STARTING_LINEUPS: awayStarters,
            HOME_SUBSTITUTES: homeSubs,
            AWAY_SUBSTITUTES: awaySubs,
            home_team: {
                name: fixture.home.name,
                formation: '',
                coach: summary?.home.coach ?? null,
                starting_lineups: homeStarters,
                substitutes: homeSubs,
            },
            away_team: {
                name: fixture.away.name,
                formation: '',
                coach: summary?.away.coach ?? null,
                starting_lineups: awayStarters,
                substitutes: awaySubs,
            },
        },
    };
}

/** Nombres de todos los jugadores que puede nombrar la cronología: formación y plantel. */
function namesOf(summary: WrSummary | null, squads: Map<string, WrPerson[]>): Map<string, string> {
    const names = new Map<string, string>();
    for (const players of squads.values()) for (const person of players) names.set(person.id, person.name);
    if (summary) {
        for (const sheet of [summary.home, summary.away]) {
            for (const player of [...sheet.starters, ...sheet.replacements]) names.set(player.id, player.name);
        }
    }
    return names;
}

async function findFixture(matchId: string): Promise<{ event: WrEventDef; fixture: WrFixture } | null> {
    return (await getAllFixtures()).find(({ fixture }) => fixture.matchId === matchId) ?? null;
}

export async function getWorldRugbyMatchBundle(rawMatchId: string) {
    const matchId = parseWrMatchId(rawMatchId);
    if (!matchId) return null;

    const found = await findFixture(matchId);
    if (!found) return null;
    const { event, fixture } = found;

    // Cada recurso va por su cuenta: la ficha abre igual si alguno falla. Lo
    // que falla es un agregado, no el partido.
    const warn = (what: string) => (error: unknown) => {
        console.warn(`[World Rugby] ${what} no disponible:`, error instanceof Error ? error.message : error);
        return null;
    };
    const [summary, squads, timelineJson, statsJson, tables] = await Promise.all([
        getSummary(fixture).catch(warn('formación')),
        getSquads(event).catch((error) => {
            warn('planteles')(error);
            return new Map<string, WrPerson[]>();
        }),
        getTimelineJson(fixture).catch(warn('cronología')),
        getStatsJson(fixture).catch(warn('estadísticas')),
        fixture.pool
            ? getEventFixtures(event).then((all) => getPoolTables(event, all)).catch(() => [] as WrPoolTable[])
            : Promise.resolve([] as WrPoolTable[]),
    ]);

    const events = timelineJson ? parseWrTimeline(timelineJson, namesOf(summary, squads)) : [];
    const stats = statsJson ? parseWrStats(statsJson) : [];
    const periods = events.length > 0 ? wrPeriodScores(events) : [];
    const { lineups, kind } = buildLineups(fixture, summary, squads);
    // La tabla que importa es la del grupo del partido.
    const standings = tables
        .filter((table) => table.pool === fixture.pool)
        .flatMap((table) => table.rows.map((row, index) => toStandingsRow(row, index + 1, table.name)));
    const officials = (summary?.officials ?? []).map((official) => ({
        role: official.role,
        name: official.name,
        country: official.country,
    }));
    const kickoff = fixture.kickoffMs !== null ? new Date(fixture.kickoffMs) : null;
    const empty: unknown[] = [];
    const venue = [fixture.venue, fixture.city].filter(Boolean).join(', ');

    return {
        source: WR_PROVIDER,
        match: {
            id: wrMatchIdOf(fixture.matchId),
            externalProvider: WR_PROVIDER,
            sportId: 'rugby',
            status: fixture.state,
            statusText: fixture.rawStatus,
            date: kickoff ? kickoff.toISOString() : null,
            time: kickoff
                ? kickoff.toLocaleTimeString('es-AR', {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false,
                    timeZone: 'America/Argentina/Buenos_Aires',
                })
                : null,
            tournament: event.name,
            tournamentLogo: event.logo,
            tournamentId: event.tournamentId,
            tournamentSeason: event.season,
            category: 'Internacional',
            round: fixture.stageLabel,
            venue,
            referee: summary ? wrRefereeOf(summary) : null,
            attendance: null,
            currentMinute: liveLabel(fixture),
            home: {
                id: teamIdOf(fixture.home),
                name: fixture.home.name,
                logo: flagOf(fixture.home),
                score: fixture.home.score,
                teamUrl: '',
                league: event.tournamentId,
            },
            away: {
                id: teamIdOf(fixture.away),
                name: fixture.away.name,
                logo: flagOf(fixture.away),
                score: fixture.away.score,
                teamUrl: '',
                league: event.tournamentId,
            },
            scores: {
                home: fixture.home.score,
                away: fixture.away.score,
                penalties: null,
            },
            url: event.siteUrl,
            lineups,
            // Sin formación publicada va el plantel del torneo: la pantalla lo
            // rotula "Plantel" y no "Titulares".
            lineupsKind: kind === 'squad' ? 'squad' : undefined,
            standings,
            h2h: empty,
            events,
            stats,
            periods,
            officials,
            draw: empty,
            form: empty,
            topScorers: empty,
        },
        h2h: empty,
        standings,
        events,
        stats,
        periods,
        lineups,
        playerStats: null,
    };
}
