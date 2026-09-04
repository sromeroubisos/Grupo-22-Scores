/**
 * Mundial Universitario de Rugby Seven 2026 (FISU — Stellenbosch) en el feed
 * de la app: descarga, caché y traducción al modelo de partido de G22.
 *
 * La fuente y su lectura están en `fisuRugbySevensParser.ts` (módulo puro y
 * testeado). Acá va lo que toca el mundo: fetch a la API de Bornan, la
 * descompresión del envoltorio zlib, caché con TTL adaptativo y el mapeo a
 * `Match` / a la vista de torneo / a la vista de partido.
 *
 * Es el mismo patrón que `fihHockey.ts` (Mundial de hockey): un proveedor
 * virtual, sin fila en la base. El torneo y sus selecciones existen solo en
 * el feed; cuando la FISU archive la edición, la ficha contesta 404, que es la
 * verdad.
 *
 * Módulo de servidor: hace fetch cross-origin. No lo importes desde un
 * componente cliente.
 */

import type { Match } from '@/types/match';
import { memoryCache } from '@/lib/cache';
import { formatDateKey } from '@/lib/timezone';
import { getNationalTeamFlag } from '@/lib/utils/teamLogoOverrides';
import {
    FISU_API_URL,
    FISU_CHAMP,
    FISU_COMPETITIONS,
    FISU_DISC,
    FISU_LANG,
    FISU_LOGO_URL,
    FISU_PROVIDER,
    FISU_RESULTS_URL,
    FISU_TTL_HOT_SECONDS,
    FISU_TTL_IDLE_SECONDS,
    fisuLiveLabel,
    fisuMatchIdOf,
    fisuRefreshTtlSeconds,
    fisuTeamId,
    parseFisuDaily,
    parseFisuGroups,
    parseFisuMatchId,
    parseFisuResultDetail,
    type FisuCompetition,
    type FisuCompetitionKey,
    type FisuPool,
    type FisuResultDetail,
    type FisuStandingRow,
    type FisuUnit,
} from '@/lib/services/fisuRugbySevensParser';

export {
    FISU_COMPETITIONS,
    FISU_COMPETITION_KEYS,
    FISU_PROVIDER,
    parseFisuMatchId,
    parseFisuTournamentId,
    type FisuCompetitionKey,
} from '@/lib/services/fisuRugbySevensParser';

const CACHE_PREFIX = 'fisu-ru7-2026';
const FETCH_TIMEOUT_MS = 15000;
/** Los días con partidos no cambian durante el torneo. */
const TTL_DAYS_SECONDS = 3600;
/** La tabla sólo se mueve cuando termina un partido. */
const TTL_GROUPS_SECONDS = 120;
/** Una planilla cerrada es historia; una abierta corre con el reloj. */
const TTL_DETAIL_SETTLED_SECONDS = 1800;

const API_ROOT = `/s/${FISU_CHAMP}/${FISU_LANG}/${FISU_DISC}`;

// --------------------------------------------------------------------------
// Cliente HTTP + descompresión + caché
// --------------------------------------------------------------------------

const inflight = new Map<string, Promise<unknown>>();

/**
 * Último dato bueno de cada recurso, sin vencimiento. No reemplaza a la caché:
 * es la red de contención para cuando Bornan no contesta. Un blackout de tres
 * minutos no tiene por qué vaciarle el fixture a nadie.
 */
const lastGood = new Map<string, unknown>();

/**
 * La API responde el JSON comprimido con zlib y servido como texto: cada byte
 * del stream comprimido viaja como un carácter (los >0x7F, codificados en
 * UTF-8). Se deshace el camino: carácter -> byte -> inflate -> JSON. Cuando
 * el cuerpo es JSON plano (los errores lo son), se lee directo.
 */
export async function decodeFisuBody(text: string): Promise<unknown> {
    const trimmed = text.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        return JSON.parse(trimmed);
    }

    const bytes = new Uint8Array(text.length);
    for (let index = 0; index < text.length; index += 1) {
        bytes[index] = text.charCodeAt(index) & 0xff;
    }

    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
    const inflated = await new Response(stream).text();
    return JSON.parse(inflated);
}

/** Lanza si Bornan no contesta. Un fallo NO es "no hay partidos". */
async function fetchJson(path: string): Promise<unknown> {
    const pending = inflight.get(path);
    if (pending) return pending;

    const request = (async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
        try {
            const response = await fetch(`${FISU_API_URL}${path}`, {
                signal: controller.signal,
                cache: 'no-store',
                headers: {
                    'User-Agent': 'G22Scores/1.0 (+https://g22scores.com)',
                    Accept: '*/*',
                    'Accept-Language': 'en',
                    Origin: FISU_RESULTS_URL,
                    Referer: `${FISU_RESULTS_URL}/`,
                },
            });
            if (!response.ok) {
                throw new Error(`[FISU] ${path} respondió ${response.status}`);
            }
            const decoded = await decodeFisuBody(await response.text());
            const asRecord = decoded && typeof decoded === 'object' && !Array.isArray(decoded)
                ? (decoded as Record<string, unknown>)
                : null;
            if (asRecord?.error === true) {
                throw new Error(`[FISU] ${path}: ${String(asRecord.message || 'error del proveedor')}`);
            }
            return decoded;
        } finally {
            clearTimeout(timeout);
            inflight.delete(path);
        }
    })();

    inflight.set(path, request);
    return request;
}

/**
 * Descarga + parseo con caché de TTL adaptativo y último-dato-bueno. El TTL
 * del cronograma sale de `fisuRefreshTtlSeconds`: 20 s mientras hay partidos
 * en la ventana caliente, 120 s el resto del tiempo.
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
            console.warn(`[FISU] ${label} no responde; sirvo el último dato bueno.`, error instanceof Error ? error.message : error);
            return stale;
        }
        throw error;
    }
}

// --------------------------------------------------------------------------
// Recursos
// --------------------------------------------------------------------------

/** Los días del torneo, como `YYYY-MM-DD`. */
export async function getFisuDays(): Promise<string[]> {
    const path = `${API_ROOT}/schedule/days`;
    return readResource(
        `${CACHE_PREFIX}:days`,
        path,
        async () => {
            const json = await fetchJson(path);
            if (!Array.isArray(json)) return [];
            return json
                .map((day) => (day && typeof day === 'object' ? String((day as Record<string, unknown>).raw || '') : ''))
                .filter((raw) => /^\d{4}-\d{2}-\d{2}$/.test(raw));
        },
        () => TTL_DAYS_SECONDS,
    );
}

async function getFisuDailyUnits(day: string): Promise<FisuUnit[]> {
    const path = `${API_ROOT}/schedule/daily/${day}`;
    return readResource(
        `${CACHE_PREFIX}:daily:${day}`,
        path,
        async () => parseFisuDaily(await fetchJson(path)),
        (units) => fisuRefreshTtlSeconds(units, Date.now()),
    );
}

/**
 * Todas las unidades del torneo (M y F), tolerando que un día falle. Si no se
 * pudo leer NINGÚN día lanza, para que el feed lo trate como corte del
 * proveedor —caché + aviso— y no dibuje un día vacío como si no se jugara.
 */
async function getAllUnits(): Promise<FisuUnit[]> {
    const days = await getFisuDays();
    if (days.length === 0) throw new Error('[FISU] el cronograma no publica días');

    const settled = await Promise.allSettled(days.map((day) => getFisuDailyUnits(day)));
    const ok = settled.filter((result) => result.status === 'fulfilled');
    settled
        .filter((result) => result.status === 'rejected')
        .forEach((result) => console.warn('[FISU] día no disponible:', result.reason));

    if (ok.length === 0) throw new Error('[FISU] no se pudo leer ningún día del cronograma');

    return ok
        .flatMap((result) => result.value)
        .sort((left, right) => (left.startsAtIso || '').localeCompare(right.startsAtIso || ''));
}

async function getCompetitionUnits(key: FisuCompetitionKey): Promise<FisuUnit[]> {
    return (await getAllUnits()).filter((unit) => unit.key === key);
}

/**
 * Las tablas de los grupos de una competencia. La API las sirve una por fase
 * (`groups/{phase}`); qué fases son grupos lo dice el propio cronograma.
 */
async function getCompetitionPools(key: FisuCompetitionKey, units: FisuUnit[]): Promise<FisuPool[]> {
    const phaseCodes = Array.from(new Set(
        units.filter((unit) => unit.key === key && unit.pool).map((unit) => unit.phaseCode),
    )).sort();

    const settled = await Promise.allSettled(phaseCodes.map((phaseCode) => {
        const path = `${API_ROOT}/groups/${FISU_COMPETITIONS[key].eventKey}.${phaseCode}`;
        return readResource(
            `${CACHE_PREFIX}:groups:${key}:${phaseCode}`,
            path,
            async () => parseFisuGroups(await fetchJson(path)),
            () => TTL_GROUPS_SECONDS,
        );
    }));

    const seen = new Set<string>();
    const pools: FisuPool[] = [];
    for (const result of settled) {
        if (result.status !== 'fulfilled') {
            console.warn('[FISU] grupo no disponible:', result.reason);
            continue;
        }
        for (const pool of result.value) {
            if (seen.has(pool.phaseCode)) continue;
            seen.add(pool.phaseCode);
            pools.push(pool);
        }
    }
    return pools.sort((left, right) => left.phaseCode.localeCompare(right.phaseCode));
}

async function getResultDetail(resCode: string, live: boolean): Promise<FisuResultDetail | null> {
    const path = `${API_ROOT}/results/${resCode}`;
    return readResource(
        `${CACHE_PREFIX}:results:${resCode}`,
        path,
        async () => parseFisuResultDetail(await fetchJson(path)),
        (detail) => {
            if (live || detail?.state === 'live') return FISU_TTL_HOT_SECONDS;
            return detail?.state === 'final' ? TTL_DETAIL_SETTLED_SECONDS : FISU_TTL_IDLE_SECONDS;
        },
    );
}

// --------------------------------------------------------------------------
// Mapeo al modelo de la app
// --------------------------------------------------------------------------

/**
 * La bandera es de la plataforma, no del proveedor: sale del cajón de
 * `public/logos/selecciones` por el nombre pelado del país. Un cruce todavía
 * sin equipo ("Por definir") no tiene bandera y el proxy pinta las iniciales.
 */
function flagOf(name: string): string {
    return getNationalTeamFlag(name) || '';
}

function roundOf(unit: FisuUnit): number {
    return Math.max(1, Math.floor(Number(unit.unitCode) / 100) || 1);
}

function toAppMatch(unit: FisuUnit, competition: FisuCompetition): Match | null {
    if (!unit.startsAtIso) return null;

    const scheduledAt = new Date(unit.startsAtIso);
    if (Number.isNaN(scheduledAt.getTime())) return null;

    const now = new Date();
    const homeLogo = flagOf(unit.homeName);
    const awayLogo = flagOf(unit.awayName);

    return {
        id: fisuMatchIdOf(unit),
        tournamentId: competition.tournamentId,
        leagueName: competition.name,
        countryName: 'Internacional',
        leagueUrl: competition.url,
        leagueStageName: unit.stageName || undefined,
        leagueLogo: FISU_LOGO_URL,

        phaseId: unit.pool ? 'group' : 'playoff',
        round: roundOf(unit),

        homeTeamId: fisuTeamId(unit.homeCode, unit.homeName),
        homeTeamName: unit.homeName,
        awayTeamId: fisuTeamId(unit.awayCode, unit.awayName),
        awayTeamName: unit.awayName,

        homeTeamLogo: homeLogo,
        awayTeamLogo: awayLogo,
        homeTeamImagePath: homeLogo,
        awayTeamImagePath: awayLogo,
        homeTeamUrl: '',
        awayTeamUrl: '',

        scheduledAt,
        venueName: unit.venue || undefined,

        status: unit.state,
        score: {
            home: unit.homeScore,
            away: unit.awayScore,
            penalties: null,
        },
        result: {
            isComplete: unit.state === 'final',
            updatedAt: now,
            updatedBy: FISU_PROVIDER,
            version: 1,
        },
        currentMinute: unit.state === 'live' ? fisuLiveLabel(unit.status, null) : undefined,
        createdFrom: 'generator',
        createdAt: now,
        updatedAt: now,
    };
}

/** Partidos del Mundial Universitario (M y F) que caen en la fecha pedida, en el huso del usuario. */
export async function getFisuRugbySevensMatches(
    date: Date,
    options?: { timeZone?: string; targetDateKey?: string },
): Promise<Match[]> {
    const timeZone = options?.timeZone;
    const targetDateKey = options?.targetDateKey || formatDateKey(date, timeZone);
    const units = await getAllUnits();

    return units
        .map((unit) => toAppMatch(unit, FISU_COMPETITIONS[unit.key]))
        .filter((match): match is Match => match !== null)
        .filter((match) => match.scheduledAt !== null && formatDateKey(match.scheduledAt, timeZone) === targetDateKey);
}

/**
 * ¿El torneo juega ese día? La respuesta sale del cronograma publicado, no de
 * un rango de fechas escrito a mano. Es una compuerta, no una respuesta: si
 * Bornan no contesta acá, el feed sigue por el camino de siempre.
 */
export async function hasFisuRugbySevensMatchesOnDate(targetDateKey: string, timeZone?: string): Promise<boolean> {
    const units = await getAllUnits().catch(() => [] as FisuUnit[]);
    return units.some((unit) => {
        if (!unit.startsAtIso) return false;
        const startsAt = new Date(unit.startsAtIso);
        return !Number.isNaN(startsAt.getTime()) && formatDateKey(startsAt, timeZone) === targetDateKey;
    });
}

export async function getFisuRugbySevensLiveMatches(): Promise<Match[]> {
    const units = await getAllUnits();
    return units
        .filter((unit) => unit.state === 'live')
        .map((unit) => toAppMatch(unit, FISU_COMPETITIONS[unit.key]))
        .filter((match): match is Match => match !== null);
}

// --------------------------------------------------------------------------
// Vista de torneo (detalle, fixture, resultados, posiciones)
// --------------------------------------------------------------------------

function teamView(code: string | null, name: string) {
    const logo = flagOf(name);
    return {
        id: fisuTeamId(code, name),
        team_id: fisuTeamId(code, name),
        name,
        short_name: code || name,
        logo,
        image_path: logo,
        small_image_path: logo,
        team_url: '',
        country_name: name,
        provider: FISU_PROVIDER,
        source: FISU_PROVIDER,
    };
}

function matchUrl(unit: FisuUnit): string {
    return `${FISU_RESULTS_URL}/#/discipline/${FISU_DISC}/results/${unit.resCode}`;
}

function toTournamentViewMatch(unit: FisuUnit, competition: FisuCompetition) {
    const id = fisuMatchIdOf(unit);
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
        tournament_logo: FISU_LOGO_URL,
        tournament_stage_name: unit.stageName,
        country_name: 'Internacional',
        sport_id: 'rugby',
        home_team: teamView(unit.homeCode, unit.homeName),
        away_team: teamView(unit.awayCode, unit.awayName),
        home_team_name: unit.homeName,
        away_team_name: unit.awayName,
        home_team_logo: flagOf(unit.homeName),
        away_team_logo: flagOf(unit.awayName),
        scores: {
            home: unit.homeScore,
            away: unit.awayScore,
            penalties: null,
        },
        venue: unit.venue || undefined,
        url: matchUrl(unit),
        provider: FISU_PROVIDER,
        source: FISU_PROVIDER,
    };
}

/**
 * Fila de posiciones con el vocabulario que lee la pantalla de torneo. Emite
 * los dos juegos de nombres (`wins`/`won`, `matches_played`/`played`) porque la
 * tabla y la exportación no leen los mismos campos. Los "goles" son los puntos
 * a favor y en contra: es lo que ordena una tabla de seven.
 */
function toStandingsRow(row: FisuStandingRow, position: number, groupName: string) {
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
        draws: row.tied ?? 0,
        drawn: row.tied ?? 0,
        losses: row.lost ?? 0,
        lost: row.lost ?? 0,
        goals_for: pointsFor,
        goals_against: pointsAgainst,
        scored: pointsFor,
        conceded: pointsAgainst,
        goal_difference: row.diff ?? pointsFor - pointsAgainst,
        tries_for: row.triesFor,
        tries_against: row.triesAgainst,
        points: row.points ?? 0,
        points_total: row.points ?? 0,
        provider: FISU_PROVIDER,
        source: FISU_PROVIDER,
    };
}

function buildTournamentDetails(competition: FisuCompetition) {
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
        logo: FISU_LOGO_URL,
        image_path: FISU_LOGO_URL,
        url: competition.url,
        source: FISU_PROVIDER,
        provider: FISU_PROVIDER,
    };
}

export async function getFisuRugbySevensTournamentBundle(key: FisuCompetitionKey) {
    const competition = FISU_COMPETITIONS[key];
    const units = await getCompetitionUnits(key);
    const pools = await getCompetitionPools(key, units);

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
        teamLabels: [] as unknown[],
        topScorers: [] as unknown[],
        draw: [] as unknown[],
        archives: [] as unknown[],
    };
}

// --------------------------------------------------------------------------
// Detalle del partido
// --------------------------------------------------------------------------

/**
 * El plantel que publica la API son los doce convocados, sin distinguir
 * titulares de suplentes: van todos como plantel, que es lo que son.
 */
function toLineupPlayer(name: string) {
    return {
        id: null,
        name,
        number: null,
        position: '',
        role: 'starter',
        rating: null,
        isCaptain: false,
        caps: null,
    };
}

function buildLineups(homeRoster: string[], awayRoster: string[], homeName: string, awayName: string) {
    if (homeRoster.length === 0 && awayRoster.length === 0) return null;

    const home = homeRoster.map(toLineupPlayer);
    const away = awayRoster.map(toLineupPlayer);
    const none: ReturnType<typeof toLineupPlayer>[] = [];

    return {
        HOME_STARTING_LINEUPS: home,
        AWAY_STARTING_LINEUPS: away,
        HOME_SUBSTITUTES: none,
        AWAY_SUBSTITUTES: none,
        home_team: { name: homeName, formation: '', starting_lineups: home, substitutes: none },
        away_team: { name: awayName, formation: '', starting_lineups: away, substitutes: none },
    };
}

export async function getFisuRugbySevensMatchBundle(matchId: string) {
    const parsed = parseFisuMatchId(matchId);
    if (!parsed) return null;

    const competition = FISU_COMPETITIONS[parsed.key];
    const units = await getCompetitionUnits(parsed.key);
    const unit = units.find((candidate) => candidate.resCode === parsed.resCode);
    if (!unit) return null;

    // La planilla y las tablas van por su cuenta: la pantalla tiene que abrir
    // igual con el cronograma solo si alguna de las dos no contesta.
    const [detailResult, poolsResult] = await Promise.allSettled([
        getResultDetail(unit.resCode, unit.state === 'live'),
        getCompetitionPools(parsed.key, units),
    ]);
    const detail = detailResult.status === 'fulfilled' ? detailResult.value : null;
    const pools = poolsResult.status === 'fulfilled' ? poolsResult.value : [];

    // La planilla es más fresca que el cronograma para el marcador en juego.
    const homeScore = detail?.homeScore ?? unit.homeScore;
    const awayScore = detail?.awayScore ?? unit.awayScore;
    const state = detail?.state === 'live' || detail?.state === 'final' ? detail.state : unit.state;
    const statusText = detail?.status || unit.status;
    const homeRoster = detail && detail.homeRoster.length > 0 ? detail.homeRoster : unit.homeRoster;
    const awayRoster = detail && detail.awayRoster.length > 0 ? detail.awayRoster : unit.awayRoster;

    const standings = pools
        // La tabla que importa es la del grupo del partido; si es cruce, van todas.
        .filter((pool) => (unit.pool ? pool.phaseCode === unit.phaseCode : true))
        .flatMap((pool) => pool.rows.map((row, index) => toStandingsRow(row, index + 1, pool.name)));

    const periods = (detail?.periods ?? []).map((period) => ({
        period: String(period.order),
        label: period.name,
        home: period.home,
        away: period.away,
    }));

    const kickoff = unit.startsAtIso ? new Date(unit.startsAtIso) : null;
    const lineups = buildLineups(homeRoster, awayRoster, unit.homeName, unit.awayName);
    const empty: unknown[] = [];

    return {
        source: FISU_PROVIDER,
        match: {
            id: fisuMatchIdOf(unit),
            externalProvider: FISU_PROVIDER,
            sportId: 'rugby',
            status: state,
            statusText,
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
            tournamentLogo: FISU_LOGO_URL,
            tournamentId: competition.tournamentId,
            tournamentSeason: competition.season,
            category: 'Internacional',
            round: unit.stageName,
            venue: unit.venue || '',
            referee: null,
            attendance: null,
            currentMinute: state === 'live' ? fisuLiveLabel(statusText, detail?.currentPeriod ?? null) : undefined,
            home: {
                id: fisuTeamId(unit.homeCode, unit.homeName),
                name: unit.homeName,
                logo: flagOf(unit.homeName),
                score: homeScore,
                teamUrl: '',
                league: competition.tournamentId,
            },
            away: {
                id: fisuTeamId(unit.awayCode, unit.awayName),
                name: unit.awayName,
                logo: flagOf(unit.awayName),
                score: awayScore,
                teamUrl: '',
                league: competition.tournamentId,
            },
            scores: {
                home: homeScore,
                away: awayScore,
                penalties: null,
            },
            url: matchUrl(unit),
            lineups,
            standings,
            h2h: empty,
            events: empty,
            stats: empty,
            periods,
            officials: empty,
            draw: empty,
            form: empty,
            topScorers: empty,
        },
        h2h: empty,
        standings,
        events: empty,
        stats: empty,
        periods,
        lineups,
        playerStats: null,
    };
}
