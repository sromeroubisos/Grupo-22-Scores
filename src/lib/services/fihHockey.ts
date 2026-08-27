/**
 * Mundial de Hockey 2026 (FIH Hockey World Cup Belgium & Netherlands) en el feed
 * de la app: descarga, caché y traducción al modelo de partido de G22.
 *
 * La fuente y su lectura están en `fihHockeyParser.ts` (módulo puro y testeado).
 * Acá va lo que toca el mundo: fetch a Altius RT, caché con TTL adaptativo y el
 * mapeo a `Match` / a la vista de torneo.
 *
 * Módulo de servidor: hace fetch cross-origin a Altius. No lo importes desde un
 * componente cliente.
 */

import type { Match } from '@/types/match';
import { memoryCache } from '@/lib/cache';
import { formatDateKey } from '@/lib/timezone';
import {
    FIH_BASE_URL,
    FIH_COMPETITION_KEYS,
    FIH_COMPETITIONS,
    FIH_LOGO_URL,
    FIH_PROVIDER,
    FIH_TTL_HOT_SECONDS,
    FIH_TTL_IDLE_SECONDS,
    fihLiveLabel,
    fihRefreshTtlSeconds,
    fihTeamFlagUrl,
    fihTeamId,
    parseFihMatchesHtml,
    parseFihMatchId,
    parseFihPoolsHtml,
    toFihMatchId,
    type FihCompetition,
    type FihCompetitionKey,
    type FihMatchRow,
    type FihPool,
    type FihStandingRow,
} from '@/lib/services/fihHockeyParser';
import {
    fihFixtureJoinKey,
    parseFihH2H,
    parseFihSquad,
    parseFihTour,
    parseSportradarFixtures,
    parseSportradarMatchDetail,
    type FihBoxScorePlayer,
    type FihH2H,
    type FihMatchDetail,
    type FihSquadPlayer,
    type FihTour,
} from '@/lib/services/fihMatchDataParser';

export {
    FIH_COMPETITIONS,
    FIH_COMPETITION_KEYS,
    FIH_PROVIDER,
    fihTeamFlagUrl,
    fihTeamKey,
    parseFihMatchId,
    parseFihTournamentId,
    toFihMatchId,
    type FihCompetitionKey,
} from '@/lib/services/fihHockeyParser';

const CACHE_PREFIX = 'fih-wc-2026';
const TTL_POOLS_SECONDS = 120;  // la tabla sólo se mueve cuando termina un partido
const FETCH_TIMEOUT_MS = 15000;

/** Sportradar Connect: el play-by-play y la planilla del partido. */
const SR_BASE_URL = 'https://embed-api.eui.connect.sportradar.com/v1/embed/250';
/** Sportz Interactive: los planteles y el historial entre selecciones. */
const FIH_FEED_URL = 'https://www.fih.hockey/datafeeds/static/json/en';

/**
 * La grilla de Sportradar y el plantel de la FIH cambian de temporada, no de
 * minuto: media hora de caché ahorra el 99% de los pedidos sin que se note.
 * El detalle del partido es el único que corre con el reloj (§`detailTtl`).
 */
const TTL_TOUR_SECONDS = 1800;
const TTL_SQUAD_SECONDS = 1800;
const TTL_H2H_SECONDS = 1800;
const TTL_SR_FIXTURES_SECONDS = 300;
const TTL_DETAIL_SETTLED_SECONDS = 1800;

// --------------------------------------------------------------------------
// Cliente HTTP + caché
// --------------------------------------------------------------------------

const inflight = new Map<string, Promise<string>>();

/**
 * Último dato bueno de cada página, sin vencimiento. No reemplaza a la caché:
 * es la red de contención para cuando Altius no contesta. Un blackout de tres
 * minutos no tiene por qué vaciarle el fixture a nadie.
 */
const lastGood = new Map<string, unknown>();

/** Lanza si Altius no contesta. Un fallo NO es "no hay partidos". */
async function fetchHtml(path: string): Promise<string> {
    const pending = inflight.get(path);
    if (pending) return pending;

    const request = (async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
        try {
            const response = await fetch(`${FIH_BASE_URL}${path}`, {
                signal: controller.signal,
                cache: 'no-store',
                headers: {
                    // Altius sirve el HTML público sin credenciales; identificarse
                    // es cortesía, no requisito.
                    'User-Agent': 'G22Scores/1.0 (+https://g22scores.com)',
                    Accept: 'text/html,application/xhtml+xml',
                    'Accept-Language': 'en',
                },
            });
            if (!response.ok) {
                throw new Error(`[FIH] ${path} respondió ${response.status}`);
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

/** Lanza si el recurso no contesta. Igual que el HTML: un fallo NO es "vacío". */
async function fetchJson(url: string): Promise<unknown> {
    const pending = inflight.get(url);
    if (pending) return JSON.parse(await pending);

    const request = (async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
        try {
            const response = await fetch(url, {
                signal: controller.signal,
                cache: 'no-store',
                headers: {
                    'User-Agent': 'G22Scores/1.0 (+https://g22scores.com)',
                    Accept: 'application/json',
                    'Accept-Language': 'en',
                },
            });
            if (!response.ok) {
                // En el feed de la FIH un 404/403 significa "ese archivo no
                // existe" —es S3 con el listado apagado—, no "no tenés permiso".
                throw new Error(`[FIH] ${url} respondió ${response.status}`);
            }
            return await response.text();
        } finally {
            clearTimeout(timeout);
            inflight.delete(url);
        }
    })();

    inflight.set(url, request);
    return JSON.parse(await request);
}

/**
 * Descarga + parseo con caché de TTL adaptativo y último-dato-bueno.
 *
 * El TTL de Altius sale de `fihRefreshTtlSeconds`: 20 s mientras hay partidos
 * en la ventana caliente, 120 s el resto del tiempo. Con las dos competencias
 * son ~6 requests/minuto contra el proveedor en el peor caso, sin importar
 * cuántos usuarios haya conectados.
 */
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
            console.warn(`[FIH] ${label} no responde; sirvo el último dato bueno.`, error instanceof Error ? error.message : error);
            return stale;
        }
        throw error;
    }
}

export async function getFihCompetitionMatches(key: FihCompetitionKey): Promise<FihMatchRow[]> {
    const path = `/competitions/${FIH_COMPETITIONS[key].altiusId}/matches`;
    return readResource(
        `${CACHE_PREFIX}:matches:${key}`,
        path,
        async () => parseFihMatchesHtml(await fetchHtml(path)),
        (rows) => fihRefreshTtlSeconds(rows, Date.now()),
    );
}

export async function getFihCompetitionPools(key: FihCompetitionKey): Promise<FihPool[]> {
    const path = `/competitions/${FIH_COMPETITIONS[key].altiusId}/pools`;
    return readResource(
        `${CACHE_PREFIX}:pools:${key}`,
        path,
        async () => parseFihPoolsHtml(await fetchHtml(path)),
        () => TTL_POOLS_SECONDS,
    );
}

// --------------------------------------------------------------------------
// Lo que pasó adentro del partido: Sportradar Connect + feed de la FIH
// --------------------------------------------------------------------------

/**
 * Participantes del torneo, con el puente de identificadores entre las tres
 * fuentes: el código de 3 letras que usa Altius, el `team_id` de la FIH que
 * abre el plantel y el `sr_team_id` de Sportradar que firma el play-by-play.
 *
 * De acá sale también el `seasonId` de Sportradar. Es la razón por la que en
 * todo el módulo no hay un UUID escrito a mano: se descubre desde el id de
 * competencia que ya teníamos, así que cuando la FIH los rote —lo hace entre
 * ediciones— no hay nada que actualizar.
 */
async function getFihTour(key: FihCompetitionKey): Promise<FihTour> {
    const seriesId = FIH_COMPETITIONS[key].altiusId;
    const url = `${FIH_FEED_URL}/sportradar/${seriesId}_tour.json`;
    return readResource(
        `${CACHE_PREFIX}:tour:${key}`,
        url,
        async () => parseFihTour(await fetchJson(url)),
        () => TTL_TOUR_SECONDS,
    );
}

/**
 * `fixtureId` de Sportradar indexado por la llave de cruce con Altius.
 *
 * Se piden las DOS sub-páginas porque `/fixtures` no devuelve el torneo entero:
 * `FIXTURES` es lo que falta jugar y `RESULTS` lo ya jugado. Con una sola se
 * pierden justo los partidos que tienen algo para contar.
 */
async function getSportradarFixtureIndex(key: FihCompetitionKey): Promise<Map<string, string>> {
    const tour = await getFihTour(key);
    const seasonId = tour.seasonId;
    if (!seasonId) return new Map();

    return readResource(
        `${CACHE_PREFIX}:sr-fixtures:${key}`,
        `sportradar fixtures ${key}`,
        async () => {
            const pages = await Promise.all(
                (['FIXTURES', 'RESULTS'] as const).map((sub) =>
                    fetchJson(`${SR_BASE_URL}/fixtures?seasonId=${encodeURIComponent(seasonId)}&sub=${sub}`)
                        .then(parseSportradarFixtures)
                        .catch(() => []),
                ),
            );

            const index = new Map<string, string>();
            for (const fixture of pages.flat()) {
                const joinKey = fihFixtureJoinKey(fixture.homeCode, fixture.awayCode, fixture.startsAtIso);
                if (joinKey) index.set(joinKey, fixture.fixtureId);
            }
            return index;
        },
        (index) => (index.size === 0 ? FIH_TTL_IDLE_SECONDS : TTL_SR_FIXTURES_SECONDS),
    );
}

/**
 * El detalle es el único recurso que corre con el reloj: mientras el partido se
 * juega hay que releerlo cada 20 s, y una vez cerrado no vuelve a cambiar.
 */
async function getSportradarMatchDetail(fixtureId: string, live: boolean): Promise<FihMatchDetail> {
    const url = `${SR_BASE_URL}/fixture_detail?fixtureId=${encodeURIComponent(fixtureId)}`;
    return readResource(
        `${CACHE_PREFIX}:sr-detail:${fixtureId}`,
        url,
        async () => parseSportradarMatchDetail(await fetchJson(url)),
        (detail) => {
            if (live) return FIH_TTL_HOT_SECONDS;
            // "CONFIRMED" es la mesa firmando la planilla: de ahí en más el
            // partido es historia y no hay nada que refrescar.
            return detail.status.toUpperCase() === 'CONFIRMED'
                ? TTL_DETAIL_SETTLED_SECONDS
                : FIH_TTL_IDLE_SECONDS;
        },
    );
}

async function getFihSquad(key: FihCompetitionKey, teamId: number): Promise<FihSquadPlayer[]> {
    const seriesId = FIH_COMPETITIONS[key].altiusId;
    const url = `${FIH_FEED_URL}/squads/${seriesId}_${teamId}_squad.json`;
    return readResource(
        `${CACHE_PREFIX}:squad:${seriesId}:${teamId}`,
        url,
        async () => parseFihSquad(await fetchJson(url)),
        () => TTL_SQUAD_SECONDS,
    );
}

/**
 * Historial entre las dos selecciones. Sale gratis: el feed lo indexa por el
 * mismo número de partido que Altius pone en `/matches/22334`, o sea el que ya
 * viaja adentro de nuestro `fih-match-m-22334`. No hay nada que resolver.
 */
async function getFihMatchH2H(altiusId: string): Promise<FihH2H> {
    const url = `${FIH_FEED_URL}/h2h/${altiusId}_h2h.json`;
    return readResource(
        `${CACHE_PREFIX}:h2h:${altiusId}`,
        url,
        async () => parseFihH2H(await fetchJson(url)),
        () => TTL_H2H_SECONDS,
    );
}

// --------------------------------------------------------------------------
// Mapeo al modelo de la app
// --------------------------------------------------------------------------

function toAppMatch(row: FihMatchRow, competition: FihCompetition): Match | null {
    if (!row.altiusId || !row.startsAtIso) return null;

    const scheduledAt = new Date(row.startsAtIso);
    if (Number.isNaN(scheduledAt.getTime())) return null;

    const now = new Date();

    return {
        id: toFihMatchId(competition.key, row.altiusId),
        tournamentId: competition.tournamentId,
        leagueName: competition.name,
        countryName: 'Internacional',
        leagueUrl: competition.url,
        leagueStageName: row.stageName || undefined,
        leagueLogo: FIH_LOGO_URL,

        phaseId: row.pool ? 'group' : 'playoff',
        round: row.number ?? 1,

        homeTeamId: fihTeamId(row.homeCode, row.homeName),
        homeTeamName: row.homeName,
        awayTeamId: fihTeamId(row.awayCode, row.awayName),
        awayTeamName: row.awayName,

        homeTeamLogo: fihTeamFlagUrl(row.homeCode),
        awayTeamLogo: fihTeamFlagUrl(row.awayCode),
        homeTeamImagePath: fihTeamFlagUrl(row.homeCode),
        awayTeamImagePath: fihTeamFlagUrl(row.awayCode),
        homeTeamUrl: '',
        awayTeamUrl: '',

        scheduledAt,
        venueName: row.venue || undefined,

        status: row.state,
        score: {
            home: row.homeGoals,
            away: row.awayGoals,
            // El shoot-out del hockey desempata igual que los penales: la app ya
            // lo muestra sólo cuando el tiempo reglamentario terminó igualado.
            penalties: row.shootout ? { home: row.shootout.home, away: row.shootout.away } : null,
        },
        result: {
            isComplete: row.state === 'final',
            updatedAt: now,
            updatedBy: FIH_PROVIDER,
            version: 1,
        },
        currentMinute: row.state === 'live' ? (fihLiveLabel(row.status) || undefined) : undefined,
        createdFrom: 'generator',
        createdAt: now,
        updatedAt: now,
    };
}

/**
 * Las dos competencias, tolerando que una falle. Si fallan LAS DOS lanza, para
 * que el feed lo trate como corte del proveedor —caché + aviso— y no dibuje un
 * día vacío como si el Mundial no jugara. Es la misma lección que dejó
 * FlashScore: un fallo silencioso se cachea igual que un día sin partidos.
 */
async function getAllCompetitionMatches(): Promise<{ competition: FihCompetition; rows: FihMatchRow[] }[]> {
    const settled = await Promise.allSettled(
        FIH_COMPETITION_KEYS.map(async (key) => ({
            competition: FIH_COMPETITIONS[key],
            rows: await getFihCompetitionMatches(key),
        })),
    );

    const ok = settled.filter((result) => result.status === 'fulfilled');
    settled
        .filter((result) => result.status === 'rejected')
        .forEach((result) => console.warn('[FIH] competencia no disponible:', result.reason));

    if (ok.length === 0) {
        throw new Error('[FIH] no se pudo leer ninguna competencia del Mundial');
    }

    return ok.map((result) => result.value);
}

/** Partidos del Mundial (M y F) que caen en la fecha pedida, en el huso del usuario. */
export async function getFihWorldCupMatches(
    date: Date,
    options?: { timeZone?: string; targetDateKey?: string },
): Promise<Match[]> {
    const timeZone = options?.timeZone;
    const targetDateKey = options?.targetDateKey || formatDateKey(date, timeZone);
    const competitions = await getAllCompetitionMatches();

    return competitions.flatMap(({ competition, rows }) =>
        rows
            .map((row) => toAppMatch(row, competition))
            .filter((match): match is Match => match !== null)
            .filter((match) => match.scheduledAt !== null && formatDateKey(match.scheduledAt, timeZone) === targetDateKey),
    );
}

/**
 * ¿El Mundial juega ese día? La respuesta sale del fixture publicado, no de un
 * rango de fechas escrito a mano que envejece con la próxima edición. La usa el
 * feed para saber que ese día hay algo que pedir aunque caiga fuera de la
 * ventana de ±7 días de FlashScore.
 */
export async function hasFihWorldCupMatchesOnDate(targetDateKey: string, timeZone?: string): Promise<boolean> {
    // Esto es una compuerta, no una respuesta: si Altius no contesta acá, el
    // feed sigue por el camino de siempre (caché + aviso) en vez de romperse.
    const competitions = await getAllCompetitionMatches().catch(() => []);

    return competitions.some(({ rows }) => rows.some((row) => {
        if (!row.startsAtIso) return false;
        const startsAt = new Date(row.startsAtIso);
        return !Number.isNaN(startsAt.getTime()) && formatDateKey(startsAt, timeZone) === targetDateKey;
    }));
}

export async function getFihWorldCupLiveMatches(): Promise<Match[]> {
    const competitions = await getAllCompetitionMatches();

    return competitions.flatMap(({ competition, rows }) =>
        rows
            .filter((row) => row.state === 'live')
            .map((row) => toAppMatch(row, competition))
            .filter((match): match is Match => match !== null),
    );
}

// --------------------------------------------------------------------------
// Vista de torneo (detalle, fixture, resultados, posiciones)
// --------------------------------------------------------------------------

function toTournamentViewMatch(row: FihMatchRow, competition: FihCompetition) {
    const id = row.altiusId ? toFihMatchId(competition.key, row.altiusId) : null;
    const timestamp = row.startsAtIso ? Math.floor(new Date(row.startsAtIso).getTime() / 1000) : null;

    const team = (code: string | null, name: string) => ({
        id: fihTeamId(code, name),
        team_id: fihTeamId(code, name),
        name,
        short_name: code || name,
        logo: fihTeamFlagUrl(code),
        image_path: fihTeamFlagUrl(code),
        small_image_path: fihTeamFlagUrl(code),
        team_url: '',
        country_name: name,
        provider: FIH_PROVIDER,
        source: FIH_PROVIDER,
    });

    return {
        match_id: id,
        event_key: id,
        timestamp,
        date: row.startsAtIso,
        match_status: row.state,
        event_status: row.state,
        status: row.state,
        status_text: row.status,
        event_name: row.stageName,
        round_number: row.number,
        tournament_id: competition.tournamentId,
        tournament_name: competition.name,
        tournament_name_short: competition.name,
        tournament_logo: FIH_LOGO_URL,
        tournament_stage_name: row.stageName,
        country_name: 'Internacional',
        sport_id: 'field-hockey',
        home_team: team(row.homeCode, row.homeName),
        away_team: team(row.awayCode, row.awayName),
        home_team_name: row.homeName,
        away_team_name: row.awayName,
        home_team_logo: fihTeamFlagUrl(row.homeCode),
        away_team_logo: fihTeamFlagUrl(row.awayCode),
        scores: {
            home: row.homeGoals,
            away: row.awayGoals,
            penalties: row.shootout ? { home: row.shootout.home, away: row.shootout.away } : null,
        },
        venue: row.venue || undefined,
        url: row.url,
        provider: FIH_PROVIDER,
        source: FIH_PROVIDER,
    };
}

/**
 * Fila de posiciones con el vocabulario que lee la pantalla de torneo. Emite los
 * dos juegos de nombres (`wins`/`won`, `matches_played`/`played`) porque la
 * tabla y la exportación no leen los mismos campos.
 */
function toStandingsRow(row: FihStandingRow, position: number, groupName: string) {
    const logo = fihTeamFlagUrl(row.code);
    const identity = {
        id: fihTeamId(row.code, row.teamEn),
        team_id: fihTeamId(row.code, row.teamEn),
        name: row.team,
        short_name: row.code || row.team,
        logo,
        image_path: logo,
        small_image_path: logo,
        team_url: row.teamUrl || '',
        country_name: row.team,
        provider: FIH_PROVIDER,
        source: FIH_PROVIDER,
    };

    const goalsFor = row.goalsFor ?? 0;
    const goalsAgainst = row.goalsAgainst ?? 0;

    return {
        position: row.rank ?? position,
        rank: row.rank ?? position,
        name: row.team,
        team_name: row.team,
        team_id: identity.team_id,
        team_logo: logo,
        logo,
        team_url: row.teamUrl || '',
        team: identity,
        participant: identity,
        group_name: groupName,
        matches_played: row.played ?? 0,
        matches_total: row.played ?? 0,
        played: row.played ?? 0,
        wins: row.wins ?? 0,
        won: row.wins ?? 0,
        draws: row.draws ?? 0,
        drawn: row.draws ?? 0,
        losses: row.losses ?? 0,
        lost: row.losses ?? 0,
        goals_for: goalsFor,
        goals_against: goalsAgainst,
        scored: goalsFor,
        conceded: goalsAgainst,
        goal_difference: row.goalDifference ?? goalsFor - goalsAgainst,
        points: row.points ?? 0,
        points_total: row.points ?? 0,
        provider: FIH_PROVIDER,
        source: FIH_PROVIDER,
    };
}

function buildTournamentDetails(competition: FihCompetition) {
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
        sport: { sport_id: 'field-hockey', name: 'Hockey' },
        logo: FIH_LOGO_URL,
        image_path: FIH_LOGO_URL,
        url: competition.url,
        source: FIH_PROVIDER,
        provider: FIH_PROVIDER,
    };
}

export async function getFihWorldCupTournamentBundle(key: FihCompetitionKey) {
    const competition = FIH_COMPETITIONS[key];
    const [rows, pools] = await Promise.all([
        getFihCompetitionMatches(key),
        getFihCompetitionPools(key),
    ]);

    const views = rows
        .filter((row) => row.altiusId)
        .map((row) => ({ row, view: toTournamentViewMatch(row, competition) }));

    const results = views
        .filter(({ row }) => row.state === 'final')
        .sort((left, right) => (right.view.timestamp || 0) - (left.view.timestamp || 0))
        .map(({ view }) => view);

    const fixtures = views
        .filter(({ row }) => row.state !== 'final')
        .sort((left, right) => (left.view.timestamp || 0) - (right.view.timestamp || 0))
        .map(({ view }) => view);

    const standings = pools.map((pool) => ({
        group_name: pool.name,
        name: pool.name,
        note: pool.note,
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
        teamLabels: [] as unknown[],
        topScorers: [] as unknown[],
        draw: [] as unknown[],
        archives: [] as unknown[],
    };
}

// --------------------------------------------------------------------------
// Detalle del partido: de las tres fuentes al vocabulario de la pantalla
// --------------------------------------------------------------------------

/** El puesto que publica Sportradar es `GK` o nada: sólo distingue al arquero. */
function positionLabel(isGoalkeeper: boolean) {
    return isGoalkeeper ? 'Arquero' : '';
}

function toLineupPlayer(player: FihBoxScorePlayer, caps: number | null) {
    return {
        // Sin id: el enlace a `/players/{id}` no resuelve un UUID de
        // Sportradar, y un nombre que no lleva a ningún lado es peor que un
        // nombre.
        id: null,
        name: player.name,
        number: player.number,
        position: positionLabel(player.isGoalkeeper),
        role: player.starter ? 'starter' : 'substitute',
        rating: null,
        isCaptain: false,
        caps,
    };
}

function buildLineups(
    players: FihBoxScorePlayer[],
    capsByPersonId: Map<string, number>,
    homeName: string,
    awayName: string,
) {
    if (players.length === 0) return null;

    const bySide = (side: 'home' | 'away', starter: boolean) => players
        .filter((player) => player.team === side && player.starter === starter)
        .map((player) => toLineupPlayer(player, player.id ? capsByPersonId.get(player.id) ?? null : null));

    const homeStarting = bySide('home', true);
    const awayStarting = bySide('away', true);
    const homeSubs = bySide('home', false);
    const awaySubs = bySide('away', false);

    if (homeStarting.length === 0 && awayStarting.length === 0) return null;

    return {
        HOME_STARTING_LINEUPS: homeStarting,
        AWAY_STARTING_LINEUPS: awayStarting,
        HOME_SUBSTITUTES: homeSubs,
        AWAY_SUBSTITUTES: awaySubs,
        home_team: { name: homeName, formation: '', starting_lineups: homeStarting, substitutes: homeSubs },
        away_team: { name: awayName, formation: '', starting_lineups: awayStarting, substitutes: awaySubs },
    };
}

/**
 * La planilla por jugador que lee la pestaña Jugadores.
 *
 * Antes del bols no hay planilla, y ahí el plantel de la FIH es el que tiene
 * algo para decir: los 20 convocados con sus caps. No es un invento para
 * rellenar —caps son partidos internacionales jugados, que es exactamente la
 * métrica "partidos jugados" que la tabla ya sabe mostrar—, y desaparece sola
 * cuando el partido empieza y la planilla real la reemplaza.
 */
function buildPlayerStats(
    players: FihBoxScorePlayer[],
    capsByPersonId: Map<string, number>,
    squads: { side: 'home' | 'away'; players: FihSquadPlayer[] }[],
    homeName: string,
    awayName: string,
) {
    const teamName = (side: 'home' | 'away') => (side === 'home' ? homeName : awayName);

    if (players.length > 0) {
        return {
            players: players.map((player) => ({
                // Sin id, por lo mismo que en las alineaciones: ni el `personId`
                // de Sportradar ni el de la FIH abren una ficha en esta app.
                player_id: null,
                player_name: player.name,
                team_name: teamName(player.team),
                number: player.number,
                position: positionLabel(player.isGoalkeeper),
                stats: {
                    goals: player.stats.goalsScored ?? 0,
                    penalties: player.stats.penaltyStrokesScored ?? 0,
                    green_cards: player.stats.greenCards ?? 0,
                    yellow_cards: player.stats.yellowCards ?? 0,
                    red_cards: player.stats.redCards ?? 0,
                    matches_played: player.id ? capsByPersonId.get(player.id) ?? null : null,
                },
            })),
        };
    }

    const roster = squads.flatMap(({ side, players: squad }) => squad.map((player) => ({
        player_id: null,
        player_name: player.name,
        team_name: teamName(side),
        number: player.number,
        position: player.isGoalkeeper ? 'Arquero' : '',
        stats: { matches_played: player.caps },
    })));

    return roster.length > 0 ? { players: roster } : null;
}

/**
 * Los dos árbitros de cancha, separados por coma. Null si el feed no los trae.
 *
 * El filtro va contra el CÓDIGO del rol, no contra la etiqueta: la lista de
 * oficiales incluye al árbitro de video y al reserva, y buscar "umpire" en el
 * texto los mete a los dos en la cabecera como si hubieran dirigido el partido.
 */
function refereeLabel(detail: FihMatchDetail | null) {
    const umpires = (detail?.officials ?? [])
        .filter((official) => /^(FIELD_)?UMPIRE(_\d+)?$/.test(official.role))
        .map((official) => official.name);

    return umpires.length > 0 ? umpires.join(', ') : null;
}

function toH2HView(h2h: FihH2H, competitionName: string) {
    const team = (code: string, name: string) => ({
        team_id: fihTeamId(code || null, name),
        name,
        logo: fihTeamFlagUrl(code || null),
        image_path: fihTeamFlagUrl(code || null),
        short_name: code || name,
    });

    return h2h.matches.map((match) => ({
        match_id: match.matchId,
        event_key: match.matchId,
        timestamp: match.timestamp,
        date: match.dateIso,
        home_team: team(match.homeCode, match.homeName),
        away_team: team(match.awayCode, match.awayName),
        home_team_name: match.homeName,
        away_team_name: match.awayName,
        scores: { home: match.homeScore, away: match.awayScore },
        tournament_name: match.tournamentName || competitionName,
        tournament_name_short: match.tournamentName || competitionName,
        provider: FIH_PROVIDER,
        source: FIH_PROVIDER,
    }));
}

/**
 * Todo lo que Altius no publica, tolerando que cualquier pieza falte.
 *
 * Ninguna de las dos plataformas es una API documentada: son los feeds internos
 * del sitio de la FIH y pueden cambiar de forma sin aviso. Por eso cada pedazo
 * va por su cuenta y un fallo se traga en silencio: la pantalla del partido
 * tiene que abrir igual con el fixture y las posiciones, que ya funcionaban
 * antes de que esto existiera.
 */
async function loadFihMatchExtras(key: FihCompetitionKey, row: FihMatchRow) {
    const empty = {
        detail: null as FihMatchDetail | null,
        lineups: null as ReturnType<typeof buildLineups>,
        playerStats: null as ReturnType<typeof buildPlayerStats>,
        h2h: [] as ReturnType<typeof toH2HView>,
    };

    const competition = FIH_COMPETITIONS[key];
    const [tourResult, h2hResult] = await Promise.allSettled([
        getFihTour(key),
        row.altiusId ? getFihMatchH2H(row.altiusId) : Promise.resolve({ balance: [], matches: [] } as FihH2H),
    ]);

    const h2h = h2hResult.status === 'fulfilled' ? toH2HView(h2hResult.value, competition.name) : [];
    if (tourResult.status !== 'fulfilled') return { ...empty, h2h };

    const teamsByCode = new Map(tourResult.value.teams.map((team) => [team.code, team]));
    const homeTeam = row.homeCode ? teamsByCode.get(row.homeCode.toUpperCase()) : undefined;
    const awayTeam = row.awayCode ? teamsByCode.get(row.awayCode.toUpperCase()) : undefined;

    const [detailResult, homeSquadResult, awaySquadResult] = await Promise.allSettled([
        (async () => {
            const joinKey = fihFixtureJoinKey(row.homeCode, row.awayCode, row.startsAtIso);
            if (!joinKey) return null;
            const fixtureId = (await getSportradarFixtureIndex(key)).get(joinKey);
            return fixtureId ? getSportradarMatchDetail(fixtureId, row.state === 'live') : null;
        })(),
        homeTeam ? getFihSquad(key, homeTeam.teamId) : Promise.resolve([] as FihSquadPlayer[]),
        awayTeam ? getFihSquad(key, awayTeam.teamId) : Promise.resolve([] as FihSquadPlayer[]),
    ]);

    const detail = detailResult.status === 'fulfilled' ? detailResult.value : null;
    const homeSquad = homeSquadResult.status === 'fulfilled' ? homeSquadResult.value : [];
    const awaySquad = awaySquadResult.status === 'fulfilled' ? awaySquadResult.value : [];

    // El plantel es lo único que sabe de caps, y se cruza con la planilla por el
    // `si_person_id` que el feed de la FIH publica al lado de cada jugador: es
    // el mismo `personId` con el que Sportradar firma el box score.
    const capsByPersonId = new Map<string, number>();
    for (const player of [...homeSquad, ...awaySquad]) {
        if (player.srPersonId && player.caps !== null) capsByPersonId.set(player.srPersonId, player.caps);
    }

    const players = detail?.players ?? [];
    return {
        detail: detail && {
            ...detail,
            // El `personId` de Sportradar no es un jugador de esta app: la
            // cronología lo convertiría en un enlace a `/players/{id}` que abre
            // una ficha vacía. Mismo criterio que en las alineaciones.
            events: detail.events.map((event) => ({ ...event, playerId: null })),
        },
        lineups: buildLineups(players, capsByPersonId, row.homeName, row.awayName),
        playerStats: buildPlayerStats(
            players,
            capsByPersonId,
            [{ side: 'home', players: homeSquad }, { side: 'away', players: awaySquad }],
            row.homeName,
            row.awayName,
        ),
        h2h,
    };
}

export async function getFihWorldCupMatchBundle(matchId: string) {
    const parsed = parseFihMatchId(matchId);
    if (!parsed) return null;

    const competition = FIH_COMPETITIONS[parsed.key];
    const [rows, pools] = await Promise.all([
        getFihCompetitionMatches(parsed.key),
        getFihCompetitionPools(parsed.key),
    ]);

    const row = rows.find((candidate) => candidate.altiusId === parsed.altiusId);
    if (!row) return null;

    const extras = await loadFihMatchExtras(parsed.key, row);

    const standings = pools
        // La tabla que importa es la del grupo del partido; si es cruce, van todas.
        .filter((pool) => (row.pool ? pool.name.toUpperCase().endsWith(row.pool) : true))
        .flatMap((pool) => pool.rows.map((standingRow, index) => toStandingsRow(standingRow, index + 1, pool.name)));

    const kickoff = row.startsAtIso ? new Date(row.startsAtIso) : null;

    return {
        source: FIH_PROVIDER,
        match: {
            id: toFihMatchId(parsed.key, parsed.altiusId),
            externalProvider: FIH_PROVIDER,
            sportId: 'field-hockey',
            status: row.state,
            statusText: row.status,
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
            tournamentLogo: FIH_LOGO_URL,
            tournamentId: competition.tournamentId,
            tournamentSeason: competition.season,
            category: 'Internacional',
            round: row.stageName,
            venue: row.venue || '',
            // El feed publica hasta cuatro oficiales por partido (dos jueces y
            // el árbitro técnico). La cabecera tiene lugar para uno: van los
            // jueces, que son los que la gente busca.
            referee: refereeLabel(extras.detail),
            attendance: extras.detail?.attendance ?? null,
            currentMinute: row.state === 'live' ? (fihLiveLabel(row.status) || undefined) : undefined,
            home: {
                id: fihTeamId(row.homeCode, row.homeName),
                name: row.homeName,
                logo: fihTeamFlagUrl(row.homeCode),
                score: row.homeGoals,
                teamUrl: '',
                league: competition.tournamentId,
            },
            away: {
                id: fihTeamId(row.awayCode, row.awayName),
                name: row.awayName,
                logo: fihTeamFlagUrl(row.awayCode),
                score: row.awayGoals,
                teamUrl: '',
                league: competition.tournamentId,
            },
            scores: {
                home: row.homeGoals,
                away: row.awayGoals,
                penalties: row.shootout ? { home: row.shootout.home, away: row.shootout.away } : null,
            },
            url: row.url,
            lineups: extras.lineups,
            standings,
            h2h: extras.h2h,
            events: extras.detail?.events ?? [],
            stats: extras.detail?.teamStats ?? [],
            periods: extras.detail?.periods ?? [],
            officials: extras.detail?.officials ?? [],
            draw: [] as unknown[],
            form: [] as unknown[],
            topScorers: [] as unknown[],
        },
        h2h: extras.h2h,
        standings,
        events: extras.detail?.events ?? [],
        stats: extras.detail?.teamStats ?? [],
        periods: extras.detail?.periods ?? [],
        lineups: extras.lineups,
        playerStats: extras.playerStats,
    };
}

// --------------------------------------------------------------------------
// Para etiquetar desde una noticia (lib/server/newsMentions.ts)
// --------------------------------------------------------------------------

/** Una selección del Mundial, con la competencia en la que juega. */
export interface FihWorldCupTeam {
    competition: FihCompetition;
    team: FihTour['teams'][number];
}

/** El plantel de una selección del Mundial. */
export interface FihWorldCupSquad extends FihWorldCupTeam {
    players: FihSquadPlayer[];
}

/** Todos los partidos del Mundial (M y F), jugados y por jugar, en el modelo de la app. */
export async function getFihWorldCupAllMatches(): Promise<Match[]> {
    const competitions = await getAllCompetitionMatches();
    return competitions.flatMap(({ competition, rows }) =>
        rows
            .map((row) => toAppMatch(row, competition))
            .filter((match): match is Match => match !== null),
    );
}

/** Las selecciones de las dos competencias. Una competencia que no responde no tira la otra. */
export async function getFihWorldCupTeams(): Promise<FihWorldCupTeam[]> {
    const settled = await Promise.allSettled(FIH_COMPETITION_KEYS.map(async (key) => {
        const tour = await getFihTour(key);
        return tour.teams.map((team) => ({ competition: FIH_COMPETITIONS[key], team }));
    }));
    return settled.flatMap((result) => (result.status === 'fulfilled' ? result.value : []));
}

/**
 * Los planteles de todas las selecciones del Mundial. Son hasta 32 pedidos al
 * feed la primera vez; después viven en la caché (TTL_SQUAD_SECONDS). Un
 * plantel que no responde se saltea.
 */
export async function getFihWorldCupSquads(): Promise<FihWorldCupSquad[]> {
    const teams = await getFihWorldCupTeams();
    const settled = await Promise.allSettled(teams.map(async (entry) => ({
        ...entry,
        players: await getFihSquad(entry.competition.key, entry.team.teamId),
    })));
    return settled.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []));
}
