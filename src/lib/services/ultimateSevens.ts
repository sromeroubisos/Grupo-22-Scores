/**
 * Ultimate Sevens (liga de seven de franquicias, 2026) en el feed de la app:
 * descarga, caché y traducción al modelo de partido de G22.
 *
 * La fuente y su lectura están en `ultimateSevensParser.ts` (módulo puro y
 * testeado). Acá va lo que toca el mundo: fetch a la REST del WordPress del
 * match centre, caché con TTL adaptativo y el mapeo a `Match` / a la vista de
 * torneo / a la vista de partido.
 *
 * Mismo patrón que `fisuRugbySevens.ts`: un proveedor virtual, sin fila en la
 * base. La liga y sus franquicias existen solo en el feed.
 *
 * Módulo de servidor: hace fetch cross-origin. No lo importes desde un
 * componente cliente.
 */

import type { Match } from '@/types/match';
import { memoryCache } from '@/lib/cache';
import { formatDateKey } from '@/lib/timezone';
import {
    US7_API_URL,
    US7_COMPETITIONS,
    US7_LOGO_URL,
    US7_PROVIDER,
    US7_SITE_URL,
    buildUs7Brackets,
    parseUs7Fixtures,
    parseUs7MatchId,
    parseUs7Players,
    resolveUs7Roster,
    us7MatchIdOf,
    us7RefreshTtlSeconds,
    us7StageLabel,
    us7TeamIdOf,
    type Us7CompetitionKey,
    type Us7Fixture,
    type Us7Player,
    type Us7Side,
} from '@/lib/services/ultimateSevensParser';

export {
    US7_COMPETITIONS,
    US7_PROVIDER,
    parseUs7MatchId,
    parseUs7TournamentId,
    type Us7CompetitionKey,
} from '@/lib/services/ultimateSevensParser';

const CACHE_PREFIX = 'us7';
const FETCH_TIMEOUT_MS = 15000;
/** Los planteles cambian con un fichaje, no durante la etapa. */
const TTL_PLAYERS_SECONDS = 3600;

// --------------------------------------------------------------------------
// Cliente HTTP + caché
// --------------------------------------------------------------------------

const inflight = new Map<string, Promise<unknown>>();

/**
 * Último dato bueno de cada recurso, sin vencimiento: si el WordPress no
 * contesta un rato, el fixture no se le vacía a nadie.
 */
const lastGood = new Map<string, unknown>();

/** Lanza si el sitio no contesta. Un fallo NO es "no hay partidos". */
async function fetchJson(path: string): Promise<unknown> {
    const pending = inflight.get(path);
    if (pending) return pending;

    const request = (async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
        try {
            const response = await fetch(`${US7_API_URL}${path}`, {
                signal: controller.signal,
                cache: 'no-store',
                headers: {
                    'User-Agent': 'G22Scores/1.0 (+https://g22scores.com)',
                    Accept: 'application/json',
                },
            });
            if (!response.ok) {
                throw new Error(`[Ultimate Sevens] ${path} respondió ${response.status}`);
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
        if (!Array.isArray(json)) throw new Error(`[Ultimate Sevens] ${path} no devolvió una lista`);
        memoryCache.set(cacheKey, json, ttlSeconds(json));
        lastGood.set(cacheKey, json);
        return json;
    } catch (error) {
        const stale = lastGood.get(cacheKey);
        if (stale !== undefined) {
            console.warn(`[Ultimate Sevens] ${path} no responde; sirvo el último dato bueno.`, error instanceof Error ? error.message : error);
            return stale;
        }
        throw error;
    }
}

// --------------------------------------------------------------------------
// Recursos
// --------------------------------------------------------------------------

/**
 * Toda la liga. En caché se guarda el JSON CRUDO y se parsea en cada lectura:
 * el estado depende del reloj (un "Live" a horas del inicio es un ensayo), y
 * con la lista tibia cinco minutos un partido quedaría "programado" pasado su
 * horario.
 */
async function getAllFixtures(): Promise<Us7Fixture[]> {
    const json = await readResource(
        `${CACHE_PREFIX}:fixtures`,
        '/fixtures',
        (raw) => us7RefreshTtlSeconds(parseUs7Fixtures(raw, Date.now()), Date.now()),
    );
    return parseUs7Fixtures(json, Date.now());
}

async function getPlayers(): Promise<Map<number, Us7Player>> {
    return parseUs7Players(await readResource(`${CACHE_PREFIX}:players`, '/players', () => TTL_PLAYERS_SECONDS));
}

/**
 * Los partidos de una rama en su última temporada. La lista de la API es de
 * toda la historia de la liga; el torneo muestra la temporada en curso.
 */
async function getCompetitionFixtures(key: Us7CompetitionKey): Promise<{ fixtures: Us7Fixture[]; season: string | null }> {
    const all = (await getAllFixtures()).filter((fixture) => fixture.key === key);
    const seasons = all.map((fixture) => fixture.season).filter((season): season is string => season !== null).sort();
    const season = seasons.length > 0 ? seasons[seasons.length - 1] : null;
    return {
        fixtures: season ? all.filter((fixture) => fixture.season === season || fixture.season === null) : all,
        season,
    };
}

// --------------------------------------------------------------------------
// Mapeo al modelo de la app
// --------------------------------------------------------------------------

function liveLabel(fixture: Us7Fixture): string | undefined {
    if (fixture.state !== 'live') return undefined;
    return /half/i.test(fixture.status) ? 'Entretiempo' : 'En juego';
}

function toAppMatch(fixture: Us7Fixture): Match | null {
    if (!fixture.startsAtIso) return null;

    const scheduledAt = new Date(fixture.startsAtIso);
    if (Number.isNaN(scheduledAt.getTime())) return null;

    const competition = US7_COMPETITIONS[fixture.key];
    const now = new Date();

    return {
        id: us7MatchIdOf(fixture),
        tournamentId: competition.tournamentId,
        leagueName: competition.name,
        countryName: 'Internacional',
        leagueUrl: competition.url,
        leagueStageName: us7StageLabel(fixture),
        leagueLogo: US7_LOGO_URL,

        phaseId: fixture.stageId || 'league',
        round: fixture.round ?? 1,

        homeTeamId: us7TeamIdOf(fixture.home),
        homeTeamName: fixture.home.name,
        awayTeamId: us7TeamIdOf(fixture.away),
        awayTeamName: fixture.away.name,

        homeTeamLogo: fixture.home.logo,
        awayTeamLogo: fixture.away.logo,
        homeTeamImagePath: fixture.home.logo,
        awayTeamImagePath: fixture.away.logo,
        homeTeamUrl: '',
        awayTeamUrl: '',

        scheduledAt,
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
            updatedBy: US7_PROVIDER,
            version: 1,
        },
        currentMinute: liveLabel(fixture),
        createdFrom: 'generator',
        createdAt: now,
        updatedAt: now,
    };
}

/** Partidos de la liga (las dos ramas) que caen en la fecha pedida, en el huso del usuario. */
export async function getUltimateSevensMatches(
    date: Date,
    options?: { timeZone?: string; targetDateKey?: string },
): Promise<Match[]> {
    const timeZone = options?.timeZone;
    const targetDateKey = options?.targetDateKey || formatDateKey(date, timeZone);

    return (await getAllFixtures())
        .map(toAppMatch)
        .filter((match): match is Match => match !== null)
        .filter((match) => match.scheduledAt !== null && formatDateKey(match.scheduledAt, timeZone) === targetDateKey);
}

/**
 * ¿La liga juega ese día? Sale de la lista publicada, no de un rango escrito a
 * mano. Es una compuerta: si el sitio no contesta, el feed sigue su camino.
 */
export async function hasUltimateSevensMatchesOnDate(targetDateKey: string, timeZone?: string): Promise<boolean> {
    const fixtures = await getAllFixtures().catch(() => [] as Us7Fixture[]);
    return fixtures.some((fixture) => {
        if (!fixture.startsAtIso) return false;
        const startsAt = new Date(fixture.startsAtIso);
        return !Number.isNaN(startsAt.getTime()) && formatDateKey(startsAt, timeZone) === targetDateKey;
    });
}

export async function getUltimateSevensLiveMatches(): Promise<Match[]> {
    return (await getAllFixtures())
        .filter((fixture) => fixture.state === 'live')
        .map(toAppMatch)
        .filter((match): match is Match => match !== null);
}

// --------------------------------------------------------------------------
// Vista de torneo (detalle, fixture, resultados)
// --------------------------------------------------------------------------

function teamView(side: Us7Side) {
    const id = us7TeamIdOf(side);
    return {
        id,
        team_id: id,
        name: side.name,
        short_name: side.name,
        logo: side.logo,
        image_path: side.logo,
        small_image_path: side.logo,
        team_url: '',
        country_name: 'Internacional',
        provider: US7_PROVIDER,
        source: US7_PROVIDER,
    };
}

function matchUrl(fixture: Us7Fixture): string {
    return fixture.webUrl || `${US7_SITE_URL}/match-centre/`;
}

function toTournamentViewMatch(fixture: Us7Fixture) {
    const competition = US7_COMPETITIONS[fixture.key];
    const id = us7MatchIdOf(fixture);
    const timestamp = fixture.startsAtIso ? Math.floor(new Date(fixture.startsAtIso).getTime() / 1000) : null;
    const stage = us7StageLabel(fixture);

    return {
        match_id: id,
        event_key: id,
        timestamp,
        date: fixture.startsAtIso,
        match_status: fixture.state,
        event_status: fixture.state,
        status: fixture.state,
        status_text: fixture.status,
        event_name: stage,
        round_number: fixture.round ?? 1,
        tournament_id: competition.tournamentId,
        tournament_name: competition.name,
        tournament_name_short: competition.name,
        tournament_logo: US7_LOGO_URL,
        tournament_stage_name: stage,
        country_name: 'Internacional',
        sport_id: 'rugby',
        home_team: teamView(fixture.home),
        away_team: teamView(fixture.away),
        home_team_name: fixture.home.name,
        away_team_name: fixture.away.name,
        home_team_logo: fixture.home.logo,
        away_team_logo: fixture.away.logo,
        scores: {
            home: fixture.home.score,
            away: fixture.away.score,
            penalties: null,
        },
        venue: fixture.venue || undefined,
        url: matchUrl(fixture),
        provider: US7_PROVIDER,
        source: US7_PROVIDER,
    };
}

function buildTournamentDetails(key: Us7CompetitionKey, season: string | null) {
    const competition = US7_COMPETITIONS[key];
    return {
        id: competition.tournamentId,
        tournament_id: competition.tournamentId,
        tournament_stage_id: competition.tournamentId,
        tournament_template_id: competition.tournamentId,
        season_id: season ? Number(season) : null,
        season,
        name: competition.name,
        full_name: competition.fullName,
        gender: competition.genderLabel,
        country: { name: 'Internacional' },
        sport: { sport_id: 'rugby', name: 'Rugby' },
        logo: US7_LOGO_URL,
        image_path: US7_LOGO_URL,
        url: competition.url,
        source: US7_PROVIDER,
        provider: US7_PROVIDER,
    };
}

/**
 * Sin tabla: la liga la publica por `admin-ajax.php` con un nonce de sesión,
 * no por la REST, y el 11/09 todavía no había ninguna. Calcularla nosotros
 * sería inventar el sistema de puntos de una liga que no lo publicó.
 */
export async function getUltimateSevensTournamentBundle(key: Us7CompetitionKey) {
    const competition = US7_COMPETITIONS[key];
    const { fixtures: competitionFixtures, season } = await getCompetitionFixtures(key);
    const views = competitionFixtures.map((fixture) => ({ fixture, view: toTournamentViewMatch(fixture) }));

    const results = views
        .filter(({ fixture }) => fixture.state === 'final')
        .sort((left, right) => (right.view.timestamp || 0) - (left.view.timestamp || 0))
        .map(({ view }) => view);

    const fixtures = views
        .filter(({ fixture }) => fixture.state !== 'final')
        .sort((left, right) => (left.view.timestamp || 0) - (right.view.timestamp || 0))
        .map(({ view }) => view);

    // Un cuadro por etapa (Cardiff, Biarritz, Londres): la pantalla los ofrece
    // en el selector de fases y abre el activo.
    const brackets = buildUs7Brackets(competitionFixtures);
    const active = brackets.find((bracket) => bracket.active);

    return {
        ids: {
            tournamentId: competition.tournamentId,
            stageId: competition.tournamentId,
            templateId: competition.tournamentId,
            seasonId: season,
        },
        details: buildTournamentDetails(key, season),
        results,
        fixtures,
        standings: [] as unknown[],
        standingsForm: [] as unknown[],
        standingsHtFt: [] as unknown[],
        standingsOverUnder: [] as unknown[],
        teamLabels: [] as unknown[],
        topScorers: [] as unknown[],
        draw: active ? active.rounds : [],
        brackets,
        archives: [] as unknown[],
    };
}

// --------------------------------------------------------------------------
// Detalle del partido
// --------------------------------------------------------------------------

/**
 * El plantel que publica la liga es el de la temporada, no la formación del
 * partido: va entero como plantel, que es lo que es.
 */
function toLineupPlayer(player: Us7Player) {
    return {
        id: null,
        name: player.name,
        number: player.number,
        position: player.position,
        role: 'starter',
        rating: null,
        isCaptain: false,
        caps: null,
    };
}

function buildLineups(fixture: Us7Fixture, players: Map<number, Us7Player>) {
    const home = resolveUs7Roster(fixture.home.playerIds, players).map(toLineupPlayer);
    const away = resolveUs7Roster(fixture.away.playerIds, players).map(toLineupPlayer);
    if (home.length === 0 && away.length === 0) return null;

    const none: ReturnType<typeof toLineupPlayer>[] = [];
    return {
        HOME_STARTING_LINEUPS: home,
        AWAY_STARTING_LINEUPS: away,
        HOME_SUBSTITUTES: none,
        AWAY_SUBSTITUTES: none,
        home_team: { name: fixture.home.name, formation: '', starting_lineups: home, substitutes: none },
        away_team: { name: fixture.away.name, formation: '', starting_lineups: away, substitutes: none },
    };
}

export async function getUltimateSevensMatchBundle(matchId: string) {
    const parsed = parseUs7MatchId(matchId);
    if (!parsed) return null;

    const fixture = (await getAllFixtures()).find((candidate) => candidate.gameId === parsed.gameId);
    if (!fixture) return null;

    // Los planteles van por su cuenta: la ficha abre igual si `/players` falla.
    const players = await getPlayers().catch((error) => {
        console.warn('[Ultimate Sevens] planteles no disponibles:', error instanceof Error ? error.message : error);
        return new Map<number, Us7Player>();
    });

    const competition = US7_COMPETITIONS[fixture.key];
    const kickoff = fixture.startsAtIso ? new Date(fixture.startsAtIso) : null;
    const lineups = buildLineups(fixture, players);
    const stage = us7StageLabel(fixture);
    const empty: unknown[] = [];

    return {
        source: US7_PROVIDER,
        match: {
            id: us7MatchIdOf(fixture),
            externalProvider: US7_PROVIDER,
            sportId: 'rugby',
            status: fixture.state,
            statusText: fixture.status,
            date: kickoff ? kickoff.toISOString() : null,
            time: kickoff
                ? kickoff.toLocaleTimeString('es-AR', {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false,
                    timeZone: 'America/Argentina/Buenos_Aires',
                })
                : null,
            tournament: competition.name,
            tournamentLogo: US7_LOGO_URL,
            tournamentId: competition.tournamentId,
            tournamentSeason: fixture.season,
            category: 'Internacional',
            round: stage,
            venue: fixture.venue,
            referee: null,
            attendance: null,
            currentMinute: liveLabel(fixture),
            home: {
                id: us7TeamIdOf(fixture.home),
                name: fixture.home.name,
                logo: fixture.home.logo,
                score: fixture.home.score,
                teamUrl: '',
                league: competition.tournamentId,
            },
            away: {
                id: us7TeamIdOf(fixture.away),
                name: fixture.away.name,
                logo: fixture.away.logo,
                score: fixture.away.score,
                teamUrl: '',
                league: competition.tournamentId,
            },
            scores: {
                home: fixture.home.score,
                away: fixture.away.score,
                penalties: null,
            },
            url: matchUrl(fixture),
            lineups,
            // Plantel de la temporada, no formación del partido: la pantalla
            // lo rotula "Plantel" y no "Titulares".
            lineupsKind: 'squad',
            standings: empty,
            h2h: empty,
            events: empty,
            stats: empty,
            periods: empty,
            officials: empty,
            draw: empty,
            form: empty,
            topScorers: empty,
        },
        h2h: empty,
        standings: empty,
        events: empty,
        stats: empty,
        periods: empty,
        lineups,
        playerStats: null,
    };
}
