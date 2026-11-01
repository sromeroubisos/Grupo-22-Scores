/**
 * Rugby Seven de los Juegos Olímpicos de la Juventud Dakar 2026 en el feed de
 * la app: descarga, caché y traducción al modelo de partido de G22.
 *
 * La fuente y su lectura están en `dakarRugbySevensParser.ts` (módulo puro y
 * testeado). Acá va lo que toca el mundo: fetch al visor de resultados de
 * Dakar, caché con TTL adaptativo y el mapeo a `Match` / a la vista de torneo /
 * a la vista de partido.
 *
 * Es el mismo patrón que `fisuRugbySevens.ts`: un proveedor virtual, sin fila
 * en la base. El torneo y sus selecciones existen solo en el feed, y se
 * actualizan solos porque cada lectura vuelve a pedir el fixture (20 s con un
 * partido en la ventana, 120 s el resto). Cuando el visor archive la edición,
 * la ficha contesta 404, que es la verdad.
 *
 * Módulo de servidor: hace fetch cross-origin. No lo importes desde un
 * componente cliente.
 */

import type { Match } from '@/types/match';
import { memoryCache } from '@/lib/cache';
import { formatDateKey } from '@/lib/timezone';
import { getNationalTeamFlag } from '@/lib/utils/teamLogoOverrides';
import {
    DAKAR_COMPETITIONS,
    DAKAR_LOGO_URL,
    DAKAR_PROVIDER,
    DAKAR_PUBLIC_URL,
    DAKAR_RESULTS_URL,
    DAKAR_SPORT_CODE,
    DAKAR_TTL_HOT_SECONDS,
    DAKAR_TTL_IDLE_SECONDS,
    computeDakarPools,
    dakarAgeAt,
    dakarPeriodScores,
    dakarFlagUrl,
    dakarLiveLabel,
    dakarMatchIdOf,
    dakarRefreshTtlSeconds,
    dakarStandingsTeamLabels,
    dakarTeamId,
    parseDakarAthletes,
    parseDakarGroupSummary,
    parseDakarMatchId,
    parseDakarPlayByPlay,
    parseDakarResultList,
    parseDakarSchedule,
    parseDakarStartList,
    parseDakarTeamStatistics,
    type DakarAthlete,
    type DakarCompetition,
    type DakarCompetitionKey,
    type DakarPlayerLine,
    type DakarPool,
    type DakarStandingRow,
    type DakarStartEntry,
    type DakarUnit,
} from '@/lib/services/dakarRugbySevensParser';

export {
    DAKAR_COMPETITIONS,
    DAKAR_COMPETITION_KEYS,
    DAKAR_PROVIDER,
    parseDakarMatchId,
    parseDakarTournamentId,
    type DakarCompetitionKey,
} from '@/lib/services/dakarRugbySevensParser';

const CACHE_PREFIX = 'dakar-ru7-2026';
const FETCH_TIMEOUT_MS = 15000;
/** Los planteles se cierran antes del torneo: una hora alcanza. */
const TTL_ATHLETES_SECONDS = 3600;
/** La tabla solo se mueve cuando termina un partido. */
const TTL_GROUPS_SECONDS = 60;
/** Una planilla cerrada es historia; una abierta corre con el reloj. */
const TTL_DETAIL_SETTLED_SECONDS = 1800;

// --------------------------------------------------------------------------
// Cliente HTTP + caché
// --------------------------------------------------------------------------

const inflight = new Map<string, Promise<string>>();

/**
 * Último dato bueno de cada recurso, sin vencimiento. No reemplaza a la caché:
 * es la red de contención para cuando el visor no contesta. Un blackout de tres
 * minutos no tiene por qué vaciarle el fixture a nadie.
 */
const lastGood = new Map<string, unknown>();

/**
 * Los fragmentos `/hide/...` solo se sirven como iframe de olympics.com: sin
 * `Referer` de esa página redirigen a `/nopermission/` (403). Se lee como HTML
 * y un fallo NO es "no hay partidos": lanza.
 */
async function fetchHtml(path: string): Promise<string> {
    const pending = inflight.get(path);
    if (pending) return pending;

    const request = (async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
        try {
            const response = await fetch(`${DAKAR_RESULTS_URL}${path}`, {
                signal: controller.signal,
                cache: 'no-store',
                redirect: 'manual',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; G22Scores/1.0; +https://g22scores.com)',
                    Accept: 'text/html,*/*',
                    'Accept-Language': 'en',
                    Referer: `${DAKAR_PUBLIC_URL}`,
                },
            });
            if (response.status >= 300) {
                throw new Error(`[Dakar] ${path} respondió ${response.status}`);
            }
            return await response.text();
        } finally {
            clearTimeout(timeout);
            inflight.delete(path);
        }
    })();

    inflight.set(path, request);
    return request;
}

async function readResource<T>(
    cacheKey: string,
    label: string,
    load: () => Promise<T>,
    ttlSeconds: (parsed: T) => number,
): Promise<T> {
    const cached = memoryCache.get<T>(cacheKey);
    if (cached) return cached;

    try {
        const parsed = await load();
        memoryCache.set(cacheKey, parsed, ttlSeconds(parsed));
        lastGood.set(cacheKey, parsed);
        return parsed;
    } catch (error) {
        const stale = lastGood.get(cacheKey) as T | undefined;
        if (stale !== undefined) {
            console.warn(`[Dakar] ${label} no responde; sirvo el último dato bueno.`, error instanceof Error ? error.message : error);
            return stale;
        }
        throw error;
    }
}

// --------------------------------------------------------------------------
// Recursos
// --------------------------------------------------------------------------

const SCHEDULE_PATH = `/hide/en/Comp/ScheduleEventPartial?sportCode=${DAKAR_SPORT_CODE}`;

/** Todas las unidades del torneo (M y F). Lanza si no se pudo leer ninguna. */
async function getAllUnits(): Promise<DakarUnit[]> {
    return readResource(
        `${CACHE_PREFIX}:schedule`,
        SCHEDULE_PATH,
        async () => {
            const units = parseDakarSchedule(await fetchHtml(SCHEDULE_PATH));
            // Un fragmento sin una sola unidad es un visor roto, no un torneo vacío.
            if (units.length === 0) throw new Error('[Dakar] el cronograma de rugby no trae unidades');
            return units;
        },
        (units) => dakarRefreshTtlSeconds(units, Date.now()),
    );
}

async function getCompetitionUnits(key: DakarCompetitionKey): Promise<DakarUnit[]> {
    return (await getAllUnits()).filter((unit) => unit.key === key);
}

/** Los doce atletas de cada selección, por código de país. */
async function getRosters(key: DakarCompetitionKey): Promise<Map<string, DakarAthlete[]>> {
    const competition = DAKAR_COMPETITIONS[key];
    const path = `/hide/en/Comp/ListPartial?pagetype=AthleteList&rsc=${competition.eventRsc}`;
    const athletes = await readResource(
        `${CACHE_PREFIX}:athletes:${key}`,
        path,
        async () => parseDakarAthletes(await fetchHtml(path)),
        () => TTL_ATHLETES_SECONDS,
    );

    const byCode = new Map<string, DakarAthlete[]>();
    for (const athlete of athletes) {
        const list = byCode.get(athlete.code) ?? [];
        list.push(athlete);
        byCode.set(athlete.code, list);
    }
    byCode.forEach((list) => list.sort((a, b) => a.name.localeCompare(b.name)));
    return byCode;
}

type MatchPartialKind = 'PlayByPlay' | 'TeamStatistics' | 'ResultList' | 'StartList';

/**
 * Un fragmento de la planilla de un partido (cronología, estadísticas por
 * equipo o jugadores). Un partido en juego se relee cada 20 s; uno cerrado, cada
 * media hora; uno por jugar casi no cambia.
 */
async function getMatchPartial<T>(kind: MatchPartialKind, unit: DakarUnit, parse: (html: string) => T): Promise<T> {
    const path = `/hide/en/Comp/ListPartial?pagetype=${kind}&rsc=${unit.rsc}`;
    return readResource(
        `${CACHE_PREFIX}:${kind}:${unit.rsc}`,
        path,
        async () => parse(await fetchHtml(path)),
        () => (unit.state === 'live' ? DAKAR_TTL_HOT_SECONDS : unit.state === 'final' ? TTL_DETAIL_SETTLED_SECONDS : DAKAR_TTL_IDLE_SECONDS),
    );
}

/**
 * Tabla de un grupo. Sale del visor cuando publica las posiciones de ese grupo
 * con las mismas selecciones; si no (o antes del primer partido), de los
 * partidos terminados. Las columnas que el visor no traiga se completan con la
 * tabla calculada.
 */
async function getPools(key: DakarCompetitionKey, units: DakarUnit[]): Promise<DakarPool[]> {
    const computed = computeDakarPools(units.filter((unit) => unit.key === key));

    return Promise.all(computed.map(async (pool) => {
        const playedAny = pool.rows.some((row) => (row.played ?? 0) > 0);
        if (!playedAny) return pool;

        const anchor = units.find((unit) => unit.key === key && unit.phaseCode === pool.phaseCode);
        if (!anchor) return pool;

        try {
            const path = `/hide/en/Comp/ListPartial?pagetype=GroupSummary&rsc=${anchor.rsc}`;
            const tables = await readResource(
                `${CACHE_PREFIX}:groups:${anchor.rsc}`,
                path,
                async () => parseDakarGroupSummary(await fetchHtml(path)),
                () => TTL_GROUPS_SECONDS,
            );

            const codes = pool.rows.map((row) => row.code).sort().join(',');
            const official = tables.find((rows) => rows.map((row) => row.code).sort().join(',') === codes);
            if (!official || !official.some((row) => row.points !== null && row.played !== null)) return pool;

            const byCode = new Map(pool.rows.map((row) => [row.code, row]));
            const rows: DakarStandingRow[] = official.map((row, index) => {
                const calc = byCode.get(row.code) as DakarStandingRow;
                return {
                    position: row.position ?? index + 1,
                    code: row.code,
                    name: calc.name,
                    played: row.played ?? calc.played,
                    won: row.won ?? calc.won,
                    drawn: row.drawn ?? calc.drawn,
                    lost: row.lost ?? calc.lost,
                    pointsFor: row.pointsFor ?? calc.pointsFor,
                    pointsAgainst: row.pointsAgainst ?? calc.pointsAgainst,
                    diff: row.diff ?? calc.diff,
                    points: row.points ?? calc.points,
                };
            }).sort((a, b) => (a.position ?? 99) - (b.position ?? 99));

            return { ...pool, rows };
        } catch (error) {
            console.warn('[Dakar] tabla oficial no disponible; uso la calculada.', error instanceof Error ? error.message : error);
            return pool;
        }
    }));
}

// --------------------------------------------------------------------------
// Mapeo al modelo de la app
// --------------------------------------------------------------------------

/**
 * La bandera es de la plataforma si el cajón la tiene; si no, la SVG que sirve
 * el propio visor. Un cruce todavía sin equipo no tiene bandera.
 */
function flagOf(name: string, code: string | null): string {
    if (!code) return '';
    return getNationalTeamFlag(name) || dakarFlagUrl(code);
}

/**
 * Ronda: los partidos de grupo van de a dos por fecha (1-2, 3-4, 5-6); los
 * cruces y las definiciones de puesto van después.
 */
function roundOf(unit: DakarUnit): number {
    if (unit.pool) return Math.max(1, Math.ceil(Number(unit.unitCode) / 200));
    return /^(Puestos|Semifinal|Cuartos)/.test(unit.stageName) ? 4 : 5;
}

function venueOf(unit: DakarUnit): string {
    if (!unit.venue) return '';
    return unit.location ? `${unit.venue} · ${unit.location}` : unit.venue;
}

function toAppMatch(unit: DakarUnit, competition: DakarCompetition): Match | null {
    if (!unit.startsAtIso) return null;

    const scheduledAt = new Date(unit.startsAtIso);
    if (Number.isNaN(scheduledAt.getTime())) return null;

    const now = new Date();
    const homeLogo = flagOf(unit.homeName, unit.homeCode);
    const awayLogo = flagOf(unit.awayName, unit.awayCode);

    return {
        id: dakarMatchIdOf(unit),
        tournamentId: competition.tournamentId,
        leagueName: competition.name,
        countryName: 'Internacional',
        leagueUrl: competition.url,
        leagueStageName: unit.stageName || undefined,
        leagueLogo: DAKAR_LOGO_URL,

        phaseId: unit.pool ? 'group' : 'playoff',
        round: roundOf(unit),

        homeTeamId: dakarTeamId(unit.homeCode, unit.homeName),
        homeTeamName: unit.homeName,
        awayTeamId: dakarTeamId(unit.awayCode, unit.awayName),
        awayTeamName: unit.awayName,

        homeTeamLogo: homeLogo,
        awayTeamLogo: awayLogo,
        homeTeamImagePath: homeLogo,
        awayTeamImagePath: awayLogo,
        homeTeamUrl: '',
        awayTeamUrl: '',

        scheduledAt,
        venueName: venueOf(unit) || undefined,

        status: unit.state,
        score: {
            home: unit.homeScore,
            away: unit.awayScore,
            penalties: null,
        },
        result: {
            isComplete: unit.state === 'final',
            updatedAt: now,
            updatedBy: DAKAR_PROVIDER,
            version: 1,
        },
        currentMinute: unit.state === 'live' ? dakarLiveLabel(unit.status) : undefined,
        createdFrom: 'generator',
        createdAt: now,
        updatedAt: now,
    };
}

/** Partidos del seven de Dakar (M y F) que caen en la fecha pedida, en el huso del usuario. */
export async function getDakarRugbySevensMatches(
    date: Date,
    options?: { timeZone?: string; targetDateKey?: string },
): Promise<Match[]> {
    const timeZone = options?.timeZone;
    const targetDateKey = options?.targetDateKey || formatDateKey(date, timeZone);
    const units = await getAllUnits();

    return units
        .map((unit) => toAppMatch(unit, DAKAR_COMPETITIONS[unit.key]))
        .filter((match): match is Match => match !== null)
        .filter((match) => match.scheduledAt !== null && formatDateKey(match.scheduledAt, timeZone) === targetDateKey);
}

/**
 * ¿El torneo juega ese día? La respuesta sale del cronograma publicado, no de
 * un rango de fechas escrito a mano. Es una compuerta, no una respuesta: si el
 * visor no contesta acá, el feed sigue por el camino de siempre.
 */
export async function hasDakarRugbySevensMatchesOnDate(targetDateKey: string, timeZone?: string): Promise<boolean> {
    const units = await getAllUnits().catch(() => [] as DakarUnit[]);
    return units.some((unit) => {
        if (!unit.startsAtIso) return false;
        const startsAt = new Date(unit.startsAtIso);
        return !Number.isNaN(startsAt.getTime()) && formatDateKey(startsAt, timeZone) === targetDateKey;
    });
}

export async function getDakarRugbySevensLiveMatches(): Promise<Match[]> {
    const units = await getAllUnits();
    return units
        .filter((unit) => unit.state === 'live')
        .map((unit) => toAppMatch(unit, DAKAR_COMPETITIONS[unit.key]))
        .filter((match): match is Match => match !== null);
}

// --------------------------------------------------------------------------
// Vista de torneo (detalle, fixture, resultados, posiciones)
// --------------------------------------------------------------------------

function teamView(code: string | null, name: string) {
    const logo = flagOf(name, code);
    return {
        id: dakarTeamId(code, name),
        team_id: dakarTeamId(code, name),
        name,
        short_name: code || name,
        logo,
        image_path: logo,
        small_image_path: logo,
        team_url: '',
        country_name: name,
        placeholder: code === null,
        provider: DAKAR_PROVIDER,
        source: DAKAR_PROVIDER,
    };
}

function matchUrl(unit: DakarUnit): string {
    return `${DAKAR_RESULTS_URL}/hide/en/Info/StartList/${unit.rsc}`;
}

function toTournamentViewMatch(unit: DakarUnit, competition: DakarCompetition) {
    const id = dakarMatchIdOf(unit);
    const timestamp = unit.startsAtIso ? Math.floor(new Date(unit.startsAtIso).getTime() / 1000) : null;

    return {
        match_id: id,
        event_key: id,
        timestamp,
        date: unit.startsAtIso,
        match_status: unit.state,
        event_status: unit.state,
        status: unit.state,
        status_text: unit.status,
        event_name: unit.stageName,
        round_number: roundOf(unit),
        tournament_id: competition.tournamentId,
        tournament_name: competition.name,
        tournament_name_short: competition.name,
        tournament_logo: DAKAR_LOGO_URL,
        tournament_stage_name: unit.stageName,
        country_name: 'Internacional',
        sport_id: 'rugby',
        home_team: teamView(unit.homeCode, unit.homeName),
        away_team: teamView(unit.awayCode, unit.awayName),
        home_team_name: unit.homeName,
        away_team_name: unit.awayName,
        home_team_logo: flagOf(unit.homeName, unit.homeCode),
        away_team_logo: flagOf(unit.awayName, unit.awayCode),
        scores: {
            home: unit.homeScore,
            away: unit.awayScore,
            penalties: null,
        },
        venue: unit.venue || undefined,
        url: matchUrl(unit),
        provider: DAKAR_PROVIDER,
        source: DAKAR_PROVIDER,
    };
}

/**
 * Fila de posiciones con el vocabulario que lee la pantalla de torneo. Emite
 * los dos juegos de nombres (`wins`/`won`, `matches_played`/`played`) porque la
 * tabla y la exportación no leen los mismos campos. Los "goles" son los puntos
 * a favor y en contra: es lo que ordena una tabla de seven.
 */
function toStandingsRow(row: DakarStandingRow, position: number, groupName: string) {
    const identity = teamView(row.code, row.name);
    const pointsFor = row.pointsFor ?? 0;
    const pointsAgainst = row.pointsAgainst ?? 0;

    return {
        position: row.position ?? position,
        rank: row.position ?? position,
        name: row.name,
        team_name: row.name,
        team_id: identity.team_id,
        team_logo: identity.logo,
        logo: identity.logo,
        team_url: '',
        team: identity,
        participant: identity,
        group_name: groupName,
        matches_played: row.played ?? 0,
        matches_total: row.played ?? 0,
        played: row.played ?? 0,
        wins: row.won ?? 0,
        won: row.won ?? 0,
        draws: row.drawn ?? 0,
        drawn: row.drawn ?? 0,
        losses: row.lost ?? 0,
        lost: row.lost ?? 0,
        goals_for: pointsFor,
        goals_against: pointsAgainst,
        scored: pointsFor,
        conceded: pointsAgainst,
        goal_difference: row.diff ?? pointsFor - pointsAgainst,
        points: row.points ?? 0,
        points_total: row.points ?? 0,
        provider: DAKAR_PROVIDER,
        source: DAKAR_PROVIDER,
    };
}

function buildTournamentDetails(competition: DakarCompetition) {
    return {
        id: competition.tournamentId,
        tournament_id: competition.tournamentId,
        tournament_stage_id: competition.tournamentId,
        tournament_template_id: competition.tournamentId,
        season_id: Number(competition.season),
        season: competition.season,
        name: competition.name,
        full_name: competition.fullName,
        gender: competition.genderLabel,
        country: { name: 'Internacional' },
        sport: { sport_id: 'rugby', name: 'Rugby' },
        logo: DAKAR_LOGO_URL,
        image_path: DAKAR_LOGO_URL,
        url: competition.url,
        source: DAKAR_PROVIDER,
        provider: DAKAR_PROVIDER,
    };
}

export async function getDakarRugbySevensTournamentBundle(key: DakarCompetitionKey) {
    const competition = DAKAR_COMPETITIONS[key];
    const units = await getCompetitionUnits(key);
    const pools = await getPools(key, units);

    const views = units.map((unit) => ({ unit, view: toTournamentViewMatch(unit, competition) }));

    const results = views
        .filter(({ unit }) => unit.state === 'final')
        .sort((left, right) => (right.view.timestamp || 0) - (left.view.timestamp || 0))
        .map(({ view }) => view);

    const fixtures = views
        .filter(({ unit }) => unit.state !== 'final')
        .sort((left, right) => (left.view.timestamp || 0) - (right.view.timestamp || 0))
        .map(({ view }) => view);

    const standings = pools.map((pool) => ({
        group_name: pool.name,
        name: pool.name,
        note: '',
        rows: pool.rows.map((row, index) => toStandingsRow(row, index + 1, pool.name)),
    }));

    return {
        ids: {
            tournamentId: competition.tournamentId,
            stageId: competition.tournamentId,
            templateId: competition.tournamentId,
            seasonId: competition.season,
        },
        details: buildTournamentDetails(competition),
        results,
        fixtures,
        standings,
        standingsForm: [] as unknown[],
        standingsHtFt: [] as unknown[],
        standingsOverUnder: [] as unknown[],
        teamLabels: dakarStandingsTeamLabels(key) as unknown[],
        topScorers: [] as unknown[],
        draw: [] as unknown[],
        archives: [] as unknown[],
    };
}

// --------------------------------------------------------------------------
// Detalle del partido
// --------------------------------------------------------------------------

/**
 * Un jugador de la formación. La edad es la que tenía el día del partido. En un
 * seven arrancan siete (`starter`) y los otros cinco son `substitute`; sin la
 * lista de salida no se sabe quién arranca y van todos como plantel.
 */
function toLineupPlayer(
    athlete: DakarAthlete,
    at: Date,
    extra?: { line?: DakarPlayerLine; entry?: DakarStartEntry },
) {
    const { line, entry } = extra ?? {};
    return {
        id: athlete.id,
        name: athlete.name,
        // El dorsal, el puesto y el capitán salen de la lista de salida; lo que
        // hizo, de la planilla del partido.
        number: entry?.number ?? line?.number ?? null,
        position: entry?.position ?? '',
        role: entry && !entry.starter ? 'substitute' : 'starter',
        rating: null,
        isCaptain: entry?.captain ?? false,
        caps: null,
        age: dakarAgeAt(athlete.birthDate, at),
        birthDate: athlete.birthDate,
        points: line?.points ?? 0,
        tries: line?.tries ?? 0,
    };
}

/**
 * Los jugadores de una selección en este partido, de más a menos confiable:
 *   1. la lista de salida (titulares, suplentes, dorsal, puesto, capitán);
 *   2. la planilla del partido (dorsal y lo que hizo, sin titulares);
 *   3. los doce atletas inscriptos, antes de que haya lista.
 * Con lista, titulares primero y después suplentes, cada grupo por dorsal.
 */
function lineupFor(roster: DakarAthlete[], entries: DakarStartEntry[], lines: DakarPlayerLine[], at: Date) {
    const byId = new Map(roster.map((athlete) => [athlete.id, athlete] as const));
    const lineById = new Map(lines.map((line) => [line.id ?? '', line] as const));
    const athleteOf = (id: string | null, name: string, code: string): DakarAthlete =>
        byId.get(id ?? '') ?? { id: id ?? '', code, name, gender: '' as const, birthDate: null };

    if (entries.length > 0) {
        return entries
            .map((entry) => toLineupPlayer(athleteOf(entry.id, entry.name, entry.code), at, { entry, line: lineById.get(entry.id ?? '') }))
            .sort((a, b) =>
                (a.role === b.role ? 0 : a.role === 'starter' ? -1 : 1)
                || (a.number ?? 99) - (b.number ?? 99));
    }

    if (lines.length === 0) return roster.map((athlete) => toLineupPlayer(athlete, at));

    return lines
        .map((line) => toLineupPlayer(athleteOf(line.id, line.name, line.code), at, { line }))
        .sort((a, b) => (a.number ?? 99) - (b.number ?? 99));
}

function buildLineups(
    home: ReturnType<typeof lineupFor>,
    away: ReturnType<typeof lineupFor>,
    homeName: string,
    awayName: string,
) {
    if (home.length === 0 && away.length === 0) return null;

    const homePlayers = home;
    const awayPlayers = away;
    const none: ReturnType<typeof lineupFor> = [];

    return {
        HOME_STARTING_LINEUPS: homePlayers,
        AWAY_STARTING_LINEUPS: awayPlayers,
        HOME_SUBSTITUTES: none,
        AWAY_SUBSTITUTES: none,
        home_team: { name: homeName, formation: '', starting_lineups: homePlayers, substitutes: none },
        away_team: { name: awayName, formation: '', starting_lineups: awayPlayers, substitutes: none },
    };
}

export async function getDakarRugbySevensMatchBundle(matchId: string) {
    const parsed = parseDakarMatchId(matchId);
    if (!parsed) return null;

    const competition = DAKAR_COMPETITIONS[parsed.key];
    const units = await getCompetitionUnits(parsed.key);
    const unit = units.find((candidate) => candidate.phaseCode === parsed.phaseCode && candidate.unitCode === parsed.unitCode);
    if (!unit) return null;

    // Planteles y tablas van por su cuenta: la pantalla tiene que abrir igual
    // con el cronograma solo si alguna de las dos no contesta.
    // La cronología, las estadísticas y la planilla solo existen con el partido
    // en juego o terminado: antes del pitazo no se le pide nada al visor.
    const played = unit.state === 'live' || unit.state === 'final';
    const [rostersResult, poolsResult, timelineResult, statsResult, sheetResult, startResult] = await Promise.allSettled([
        getRosters(parsed.key),
        getPools(parsed.key, units),
        played ? getMatchPartial('PlayByPlay', unit, parseDakarPlayByPlay) : Promise.resolve([]),
        played ? getMatchPartial('TeamStatistics', unit, parseDakarTeamStatistics) : Promise.resolve([]),
        played ? getMatchPartial('ResultList', unit, parseDakarResultList) : Promise.resolve([] as DakarPlayerLine[]),
        // La lista de salida (7 titulares y 5 suplentes) se publica antes del
        // partido, así que se pide también con el partido por jugar. Un cruce
        // sin equipos no tiene lista.
        unit.placeholder ? Promise.resolve([] as DakarStartEntry[]) : getMatchPartial('StartList', unit, parseDakarStartList),
    ]);
    const rosters = rostersResult.status === 'fulfilled' ? rostersResult.value : new Map<string, DakarAthlete[]>();
    const pools = poolsResult.status === 'fulfilled' ? poolsResult.value : [];
    const events = timelineResult.status === 'fulfilled' ? timelineResult.value : [];
    const stats = statsResult.status === 'fulfilled' ? statsResult.value : [];
    const sheet = sheetResult.status === 'fulfilled' ? sheetResult.value : [];
    const startList = startResult.status === 'fulfilled' ? startResult.value : [];
    const periods = events.length > 0 ? dakarPeriodScores(events) : [];
    // Con titulares marcados es una formación; sin ellos, un plantel.
    const hasStarters = startList.some((entry) => entry.starter);

    const standings = pools
        // La tabla que importa es la del grupo del partido; si es cruce, van todas.
        .filter((pool) => (unit.pool ? pool.phaseCode === unit.phaseCode : true))
        .flatMap((pool) => pool.rows.map((row, index) => toStandingsRow(row, index + 1, pool.name)));

    const kickoff = unit.startsAtIso ? new Date(unit.startsAtIso) : null;
    const at = kickoff ?? new Date();
    const linesOf = (code: string | null) => (code ? sheet.filter((line) => line.code === code) : []);
    const entriesOf = (code: string | null) => (code ? startList.filter((entry) => entry.code === code) : []);
    const lineups = buildLineups(
        unit.homeCode ? lineupFor(rosters.get(unit.homeCode) ?? [], entriesOf(unit.homeCode), linesOf(unit.homeCode), at) : [],
        unit.awayCode ? lineupFor(rosters.get(unit.awayCode) ?? [], entriesOf(unit.awayCode), linesOf(unit.awayCode), at) : [],
        unit.homeName,
        unit.awayName,
    );
    const empty: unknown[] = [];

    return {
        source: DAKAR_PROVIDER,
        match: {
            id: dakarMatchIdOf(unit),
            externalProvider: DAKAR_PROVIDER,
            sportId: 'rugby',
            status: unit.state,
            statusText: unit.status,
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
            tournamentLogo: DAKAR_LOGO_URL,
            tournamentId: competition.tournamentId,
            tournamentSeason: competition.season,
            category: 'Internacional',
            round: unit.stageName,
            venue: venueOf(unit),
            referee: null,
            attendance: null,
            currentMinute: unit.state === 'live' ? dakarLiveLabel(unit.status) : undefined,
            home: {
                id: dakarTeamId(unit.homeCode, unit.homeName),
                name: unit.homeName,
                logo: flagOf(unit.homeName, unit.homeCode),
                score: unit.homeScore,
                teamUrl: '',
                league: competition.tournamentId,
            },
            away: {
                id: dakarTeamId(unit.awayCode, unit.awayName),
                name: unit.awayName,
                logo: flagOf(unit.awayName, unit.awayCode),
                score: unit.awayScore,
                teamUrl: '',
                league: competition.tournamentId,
            },
            scores: {
                home: unit.homeScore,
                away: unit.awayScore,
                penalties: null,
            },
            url: matchUrl(unit),
            lineups,
            // Con la lista de salida hay siete titulares y cinco suplentes
            // ("Titulares"); sin ella son los doce inscriptos ("Plantel").
            lineupsKind: hasStarters ? undefined : 'squad',
            // Un seven: la ficha limita los titulares a siete y dibuja la cancha de 7.
            modality: 'sevens',
            standings,
            h2h: empty,
            events,
            stats,
            periods,
            officials: empty,
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
