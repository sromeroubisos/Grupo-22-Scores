/**
 * Juegos Suramericanos ODESUR Santa Fe 2026 en la app: descarga, caché y
 * traducción al modelo de partido, de torneo, de ficha y de medallero.
 *
 * La lectura de la fuente está en `odesur2026Parser.ts` (puro y testeado).
 * Acá va lo que toca el mundo: el fetch a la API de Bornan, el envoltorio
 * zlib, la caché con TTL adaptativo y el mapeo a lo que consume cada pantalla.
 *
 * Es el patrón de `fisuRugbySevens.ts` —el mismo proveedor, otro campeonato—
 * con una diferencia de forma: la FISU alimenta un deporte y los Juegos
 * alimentan siete. Por eso cada entrada pide el `sportId` y resuelve las
 * disciplinas que le tocan.
 *
 * Proveedor virtual, sin fila en la base: los torneos y las delegaciones
 * existen solo en el feed. Cuando Bornan archive la edición, la ficha
 * contesta 404, que es la verdad.
 *
 * Módulo de servidor: hace fetch cross-origin. No lo importes desde un
 * componente cliente.
 */

import type { Match } from '@/types/match';
import { memoryCache } from '@/lib/cache';
import { formatDateKey } from '@/lib/timezone';
import { getNationalTeamFlag } from '@/lib/utils/teamLogoOverrides';
import {
    ODESUR_API_URL,
    ODESUR_CHAMP,
    ODESUR_EVENT_NAME,
    ODESUR_LANG,
    ODESUR_LOGO_URL,
    ODESUR_PROVIDER,
    ODESUR_RESULTS_URL,
    ODESUR_SEASON,
    findOdesurUnit,
    odesurCompetition,
    odesurDisciplineName,
    odesurDisciplinesForSport,
    odesurLiveLabel,
    odesurMatchIdOf,
    odesurOrgIso2,
    odesurTeamId,
    parseOdesurActions,
    parseOdesurAgenda,
    parseOdesurDaily,
    parseOdesurDays,
    parseOdesurGroups,
    parseOdesurMatchId,
    parseOdesurMedalDisciplines,
    parseOdesurMedallists,
    parseOdesurMedals,
    parseOdesurResultDetail,
    rankMedals,
    type OdesurAction,
    type OdesurAgendaItem,
    type OdesurCompetition,
    type OdesurDisciplineCode,
    type OdesurGroup,
    type OdesurMedalCount,
    type OdesurMedallist,
    type OdesurResultDetail,
    type OdesurRosterPlayer,
    type OdesurStandingRow,
    type OdesurUnit,
} from '@/lib/services/odesur2026Parser';

export {
    ODESUR_DISCIPLINES,
    ODESUR_DISCIPLINE_CODES,
    ODESUR_EVENT_NAME,
    ODESUR_FIRST_DAY,
    ODESUR_LAST_DAY,
    ODESUR_PROVIDER,
    isOdesurCopyLeague,
    isOdesurSport,
    odesurCompetition,
    odesurCompetitionsForSport,
    odesurDisciplineName,
    parseOdesurMatchId,
    parseOdesurTournamentId,
    type OdesurAgendaItem,
    type OdesurCompetition,
    type OdesurDisciplineCode,
    type OdesurMedallist,
} from '@/lib/services/odesur2026Parser';

const API_ROOT = `/s/${ODESUR_CHAMP}/${ODESUR_LANG}`;
const CACHE_PREFIX = 'odesur-2026';
const FETCH_TIMEOUT_MS = 15000;

/** Los días de una disciplina no cambian durante los Juegos. */
const TTL_DAYS_SECONDS = 3600;
/** Un día con un partido en juego se refresca con el reloj. */
const TTL_DAILY_LIVE_SECONDS = 20;
/** Un día con partidos por jugarse: los horarios y los cruces se confirman. */
const TTL_DAILY_OPEN_SECONDS = 120;
/** Un día cerrado es historia. */
const TTL_DAILY_SETTLED_SECONDS = 1800;
/** La tabla solo se mueve cuando termina un partido. */
const TTL_GROUPS_SECONDS = 120;
/** El medallero se mueve con cada final. */
const TTL_MEDALS_SECONDS = 120;
const TTL_DETAIL_LIVE_SECONDS = 20;
const TTL_DETAIL_SETTLED_SECONDS = 1800;

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
 * del stream comprimido viaja como un carácter (los >0x7F, en UTF-8). Se
 * deshace el camino: carácter -> byte -> inflate -> JSON. Adentro hay UTF-8
 * válido (medido en bytes), así que el inflado se lee como texto normal.
 *
 * Es la misma lectura que `decodeFisuBody`, copiada a propósito: cada
 * proveedor se cae por su cuenta, y un cambio en la FISU no tiene por qué
 * tocar los Juegos.
 */
async function decodeBornanBody(text: string): Promise<unknown> {
    const trimmed = text.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        return JSON.parse(trimmed);
    }

    const bytes = new Uint8Array(text.length);
    for (let index = 0; index < text.length; index += 1) {
        bytes[index] = text.charCodeAt(index) & 0xff;
    }

    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
    return JSON.parse(await new Response(stream).text());
}

/** Lanza si Bornan no contesta. Un fallo NO es "no hay partidos". */
async function fetchJson(path: string): Promise<unknown> {
    const pending = inflight.get(path);
    if (pending) return pending;

    const request = (async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
        try {
            const response = await fetch(`${ODESUR_API_URL}${API_ROOT}/${path}`, {
                signal: controller.signal,
                cache: 'no-store',
                headers: {
                    // El sitio rechaza con 403 a `curl`; a un agente que se
                    // identifica le contesta. Es el mismo que usa la FISU.
                    'User-Agent': 'G22Scores/1.0 (+https://g22scores.com)',
                    Accept: '*/*',
                    'Accept-Language': 'en',
                    Origin: ODESUR_RESULTS_URL,
                    Referer: `${ODESUR_RESULTS_URL}/`,
                },
            });
            if (!response.ok) {
                throw new Error(`[ODESUR] ${path} respondió ${response.status}`);
            }
            const decoded = await decodeBornanBody(await response.text());
            const record = decoded && typeof decoded === 'object' && !Array.isArray(decoded)
                ? (decoded as Record<string, unknown>)
                : null;
            if (record?.error === true) {
                throw new Error(`[ODESUR] ${path}: ${String(record.message || 'error del proveedor')}`);
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

/** Descarga + parseo con caché de TTL adaptativo y último-dato-bueno. */
async function readResource<T>(
    cacheKey: string,
    label: string,
    load: () => Promise<T>,
    ttlSeconds: (parsed: T) => number,
): Promise<T> {
    const key = `${CACHE_PREFIX}:${cacheKey}`;
    const cached = memoryCache.get<T>(key);
    if (cached !== null && cached !== undefined) return cached;

    try {
        const parsed = await load();
        memoryCache.set(key, parsed, ttlSeconds(parsed));
        lastGood.set(key, parsed);
        return parsed;
    } catch (error) {
        const stale = lastGood.get(key) as T | undefined;
        if (stale !== undefined) {
            console.warn(`[ODESUR] ${label} no responde; sirvo el último dato bueno.`, error instanceof Error ? error.message : error);
            return stale;
        }
        throw error;
    }
}

// --------------------------------------------------------------------------
// Fechas
// --------------------------------------------------------------------------

/** "2026-09-13" +/- días, sin pasar por el huso de la máquina. */
function shiftDay(day: string, delta: number): string {
    const [year, month, date] = day.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, date + delta)).toISOString().slice(0, 10);
}

/** El día de hoy en Santa Fe, que es el día de los Juegos. */
export function odesurToday(): string {
    return formatDateKey(new Date(), 'America/Argentina/Buenos_Aires');
}

// --------------------------------------------------------------------------
// Recursos
// --------------------------------------------------------------------------

async function getDisciplineDays(code: OdesurDisciplineCode): Promise<string[]> {
    return readResource(
        `days:${code}`,
        `días de ${code}`,
        async () => parseOdesurDays(await fetchJson(`${code}/schedule/days`)),
        () => TTL_DAYS_SECONDS,
    );
}

function dailyTtl(units: OdesurUnit[]): number {
    if (units.some((unit) => unit.state === 'live')) return TTL_DAILY_LIVE_SECONDS;
    if (units.length > 0 && units.every((unit) => unit.state === 'final')) return TTL_DAILY_SETTLED_SECONDS;
    return TTL_DAILY_OPEN_SECONDS;
}

/**
 * Los partidos de una disciplina en un día de Santa Fe. Es `schedule/daily`
 * por disciplina y no `ALL/schedule/day`: la segunda no trae los equipos.
 */
async function getDisciplineDaily(code: OdesurDisciplineCode, day: string): Promise<OdesurUnit[]> {
    return readResource(
        `daily:${code}:${day}`,
        `cronograma de ${code} del ${day}`,
        async () => parseOdesurDaily(await fetchJson(`${code}/schedule/daily/${day}`)),
        dailyTtl,
    );
}

/** Todos los partidos de una disciplina, en todos sus días. */
async function getDisciplineUnits(code: OdesurDisciplineCode): Promise<OdesurUnit[]> {
    const days = await getDisciplineDays(code);
    const perDay = await Promise.all(days.map((day) => getDisciplineDaily(code, day)));
    return perDay.flat();
}

/**
 * Los partidos de una disciplina que pueden caer en una fecha del usuario. Un
 * usuario en Madrid ve a las 01:00 del 14 un partido de las 20:00 del 13 en
 * Santa Fe, así que se leen el día pedido y sus vecinos y se filtra después
 * por el huso de quien mira. Solo los días en que la disciplina juega: un día
 * sin actividad no se pide.
 */
async function getDisciplineUnitsAround(code: OdesurDisciplineCode, targetDateKey: string): Promise<OdesurUnit[]> {
    const days = new Set(await getDisciplineDays(code));
    const candidates = [shiftDay(targetDateKey, -1), targetDateKey, shiftDay(targetDateKey, 1)]
        .filter((day) => days.has(day));
    const perDay = await Promise.all(candidates.map((day) => getDisciplineDaily(code, day)));
    return perDay.flat();
}

async function getCompetitionGroups(competition: OdesurCompetition): Promise<OdesurGroup[]> {
    const { code } = competition.discipline;
    return readResource(
        `groups:${code}:${competition.gender}`,
        `zonas de ${code} ${competition.gender}`,
        async () => parseOdesurGroups(await fetchJson(`${code}/groups/${competition.eventKey}`), competition.gender),
        () => TTL_GROUPS_SECONDS,
    );
}

async function getResultDetail(code: OdesurDisciplineCode, resCode: string, live: boolean): Promise<OdesurResultDetail | null> {
    return readResource(
        `detail:${resCode}`,
        `planilla ${resCode}`,
        async () => parseOdesurResultDetail(await fetchJson(`${code}/results/${resCode}`), code),
        (detail) => (live || detail?.state === 'live' ? TTL_DETAIL_LIVE_SECONDS : TTL_DETAIL_SETTLED_SECONDS),
    );
}

async function getActions(code: OdesurDisciplineCode, resCode: string, live: boolean): Promise<OdesurAction[]> {
    return readResource(
        `actions:${resCode}`,
        `cronología ${resCode}`,
        // `Summary` son los hechos que cuentan (goles, tarjetas); `Total` suma
        // cada tiro y cada cambio de arquero, que la cronología no muestra.
        async () => parseOdesurActions(await fetchJson(`${code}/actions/Summary/${resCode}`)),
        () => (live ? TTL_DETAIL_LIVE_SECONDS : TTL_DETAIL_SETTLED_SECONDS),
    );
}

// --------------------------------------------------------------------------
// Banderas
// --------------------------------------------------------------------------

/**
 * La bandera curada del cajón `public/logos/selecciones` cuando existe (la
 * misma que usa el resto del sitio para ese país) y, si no, la SVG de
 * `public/flags` por el código ISO. El cajón curado tiene 5 de las 15
 * delegaciones; sin la SVG, Paraguay o Colombia saldrían con iniciales.
 */
export function odesurFlagUrl(code: string | null, name: string): string {
    const curated = getNationalTeamFlag(name);
    if (curated) return curated;
    const iso2 = odesurOrgIso2(code);
    return iso2 ? `/flags/${iso2}.svg` : '';
}

// --------------------------------------------------------------------------
// Feed de partidos
// --------------------------------------------------------------------------

function roundOf(unit: OdesurUnit): number {
    return Math.max(1, Math.floor(Number(unit.unitCode) / 100) || 1);
}

function toAppMatch(unit: OdesurUnit): Match | null {
    if (!unit.startsAtIso) return null;

    const scheduledAt = new Date(unit.startsAtIso);
    if (Number.isNaN(scheduledAt.getTime())) return null;

    const competition = odesurCompetition(unit.code, unit.gender);
    const now = new Date();
    const homeLogo = odesurFlagUrl(unit.homeCode, unit.homeName);
    const awayLogo = odesurFlagUrl(unit.awayCode, unit.awayName);

    return {
        id: odesurMatchIdOf(unit),
        tournamentId: competition.tournamentId,
        leagueName: competition.name,
        countryName: 'Internacional',
        leagueUrl: competition.url,
        leagueStageName: unit.stageName || undefined,
        leagueLogo: ODESUR_LOGO_URL,

        phaseId: unit.pool ? 'group' : 'playoff',
        round: roundOf(unit),

        homeTeamId: odesurTeamId(unit.homeCode, unit.homeName),
        homeTeamName: unit.homeName,
        awayTeamId: odesurTeamId(unit.awayCode, unit.awayName),
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
            updatedBy: ODESUR_PROVIDER,
            version: 1,
        },
        currentMinute: unit.state === 'live' ? odesurLiveLabel(unit.status, null, unit.code) : undefined,
        createdFrom: 'generator',
        createdAt: now,
        updatedAt: now,
    };
}

/**
 * Los partidos de los Juegos de un deporte de G22 que caen en la fecha
 * pedida, en el huso del usuario. Cada disciplina va por su cuenta: si el
 * handball no contesta, el vóley aparece igual.
 */
export async function getOdesurMatches(
    sportId: string,
    date: Date,
    options?: { timeZone?: string; targetDateKey?: string },
): Promise<Match[]> {
    const disciplines = odesurDisciplinesForSport(sportId);
    if (disciplines.length === 0) return [];

    const timeZone = options?.timeZone;
    const targetDateKey = options?.targetDateKey || formatDateKey(date, timeZone);

    const perDiscipline = await Promise.all(disciplines.map(async (discipline) => {
        try {
            return await getDisciplineUnitsAround(discipline.code, targetDateKey);
        } catch (error) {
            console.warn(`[ODESUR] ${discipline.code} no disponible:`, error instanceof Error ? error.message : error);
            return [] as OdesurUnit[];
        }
    }));

    return perDiscipline
        .flat()
        .map(toAppMatch)
        .filter((match): match is Match => match !== null)
        .filter((match) => match.scheduledAt !== null && formatDateKey(match.scheduledAt, timeZone) === targetDateKey)
        .sort((left, right) => (left.scheduledAt?.getTime() ?? 0) - (right.scheduledAt?.getTime() ?? 0));
}

/**
 * ¿Los Juegos juegan algo de ese deporte en esa fecha? Sale de los días
 * publicados de cada disciplina, no de un rango escrito a mano. Es una
 * compuerta y no una respuesta: con Bornan caído dice que no y el feed sigue
 * por el camino de siempre.
 *
 * Mira los días vecinos porque la fecha es la del usuario y los días son los
 * de Santa Fe; el filtro fino por huso lo hace `getOdesurMatches`.
 */
export async function hasOdesurMatchesOnDate(sportId: string, targetDateKey: string): Promise<boolean> {
    const disciplines = odesurDisciplinesForSport(sportId);
    if (disciplines.length === 0) return false;

    const window = new Set([shiftDay(targetDateKey, -1), targetDateKey, shiftDay(targetDateKey, 1)]);
    const perDiscipline = await Promise.all(disciplines.map((discipline) => (
        getDisciplineDays(discipline.code).catch(() => [] as string[])
    )));
    return perDiscipline.some((days) => days.some((day) => window.has(day)));
}

/** Los partidos en juego de un deporte de G22 (hoy y ayer en Santa Fe). */
export async function getOdesurLiveMatches(sportId: string): Promise<Match[]> {
    const disciplines = odesurDisciplinesForSport(sportId);
    if (disciplines.length === 0) return [];

    const today = odesurToday();
    const perDiscipline = await Promise.all(disciplines.map(async (discipline) => {
        try {
            const days = new Set(await getDisciplineDays(discipline.code));
            const candidates = [shiftDay(today, -1), today].filter((day) => days.has(day));
            return (await Promise.all(candidates.map((day) => getDisciplineDaily(discipline.code, day)))).flat();
        } catch (error) {
            console.warn(`[ODESUR] en vivo de ${discipline.code} no disponible:`, error instanceof Error ? error.message : error);
            return [] as OdesurUnit[];
        }
    }));

    return perDiscipline
        .flat()
        .filter((unit) => unit.state === 'live')
        .map(toAppMatch)
        .filter((match): match is Match => match !== null);
}

// --------------------------------------------------------------------------
// Vista de torneo (detalle, fixture, resultados, posiciones)
// --------------------------------------------------------------------------

function teamView(code: string | null, name: string) {
    const logo = odesurFlagUrl(code, name);
    return {
        id: odesurTeamId(code, name),
        team_id: odesurTeamId(code, name),
        name,
        short_name: code || name,
        logo,
        image_path: logo,
        small_image_path: logo,
        team_url: '',
        country_name: name,
        provider: ODESUR_PROVIDER,
        source: ODESUR_PROVIDER,
    };
}

function matchUrl(unit: OdesurUnit): string {
    // Sin llave no hay página del partido en el sitio oficial: va la del torneo.
    if (!unit.resCode) return odesurCompetition(unit.code, unit.gender).url;
    return `${ODESUR_RESULTS_URL}/#/discipline/${unit.code}/results/${unit.resCode}`;
}

function toTournamentViewMatch(unit: OdesurUnit, competition: OdesurCompetition) {
    const id = odesurMatchIdOf(unit);
    const timestamp = unit.startsAtIso ? Math.floor(new Date(unit.startsAtIso).getTime() / 1000) : null;
    const home = teamView(unit.homeCode, unit.homeName);
    const away = teamView(unit.awayCode, unit.awayName);

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
        tournament_logo: ODESUR_LOGO_URL,
        tournament_stage_name: unit.stageName,
        country_name: 'Internacional',
        sport_id: competition.discipline.sportId,
        home_team: home,
        away_team: away,
        home_team_name: unit.homeName,
        away_team_name: unit.awayName,
        home_team_logo: home.logo,
        away_team_logo: away.logo,
        scores: {
            home: unit.homeScore,
            away: unit.awayScore,
            penalties: null,
        },
        venue: unit.venue || undefined,
        url: matchUrl(unit),
        provider: ODESUR_PROVIDER,
        source: ODESUR_PROVIDER,
    };
}

/**
 * Fila de posiciones con el vocabulario que lee la pantalla de torneo. Emite
 * los dos juegos de nombres (`wins`/`won`, `matches_played`/`played`) porque la
 * tabla y la exportación no leen los mismos campos.
 */
function toStandingsRow(row: OdesurStandingRow, position: number, groupName: string) {
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
        points: row.points ?? 0,
        points_total: row.points ?? 0,
        provider: ODESUR_PROVIDER,
        source: ODESUR_PROVIDER,
    };
}

function buildTournamentDetails(competition: OdesurCompetition) {
    return {
        id: competition.tournamentId,
        tournament_id: competition.tournamentId,
        tournament_stage_id: competition.tournamentId,
        tournament_template_id: competition.tournamentId,
        season_id: Number(ODESUR_SEASON),
        season: ODESUR_SEASON,
        name: competition.name,
        full_name: `${ODESUR_EVENT_NAME} — ${competition.discipline.nameEs} ${competition.genderLabel}`,
        gender: competition.genderLabel,
        country: { name: 'Internacional' },
        sport: { sport_id: competition.discipline.sportId, name: competition.discipline.nameEs },
        logo: ODESUR_LOGO_URL,
        image_path: ODESUR_LOGO_URL,
        url: competition.url,
        source: ODESUR_PROVIDER,
        provider: ODESUR_PROVIDER,
    };
}

async function getCompetitionUnits(competition: OdesurCompetition): Promise<OdesurUnit[]> {
    const units = await getDisciplineUnits(competition.discipline.code);
    return units.filter((unit) => unit.gender === competition.gender);
}

export async function getOdesurTournamentBundle(competition: OdesurCompetition) {
    const units = await getCompetitionUnits(competition);
    // La tabla va por su cuenta: sin zonas (un evento que se juega por llave
    // o una API caída) el fixture tiene que aparecer igual.
    const groups = await getCompetitionGroups(competition).catch((error) => {
        console.warn(`[ODESUR] zonas de ${competition.tournamentId} no disponibles:`, error instanceof Error ? error.message : error);
        return [] as OdesurGroup[];
    });

    const views = units.map((unit) => ({ unit, view: toTournamentViewMatch(unit, competition) }));

    const results = views
        .filter(({ unit }) => unit.state === 'final')
        .sort((left, right) => (right.view.timestamp || 0) - (left.view.timestamp || 0))
        .map(({ view }) => view);

    const fixtures = views
        .filter(({ unit }) => unit.state !== 'final')
        .sort((left, right) => (left.view.timestamp || 0) - (right.view.timestamp || 0))
        .map(({ view }) => view);

    const standings = groups.map((group) => ({
        group_name: group.name,
        name: group.name,
        note: '',
        rows: group.rows.map((row, index) => toStandingsRow(row, index + 1, group.name)),
    }));

    return {
        ids: {
            tournamentId: competition.tournamentId,
            stageId: competition.tournamentId,
            templateId: competition.tournamentId,
            seasonId: ODESUR_SEASON,
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
 * La planilla publica el plantel de cada lado con dorsal y puesto, pero sin
 * separar titulares de suplentes: van todos como plantel, que es lo que son.
 */
function toLineupPlayer(player: OdesurRosterPlayer) {
    const number = Number(player.bib);
    return {
        id: null,
        name: player.name,
        number: player.bib !== '' && Number.isFinite(number) ? number : null,
        position: player.position,
        role: 'starter',
        rating: null,
        isCaptain: false,
        caps: null,
    };
}

function buildLineups(homeRoster: OdesurRosterPlayer[], awayRoster: OdesurRosterPlayer[], homeName: string, awayName: string) {
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

/** El período con el vocabulario de la cronología de la app. */
function eventPeriod(code: OdesurDisciplineCode, period: string): string {
    const order = Number(period);
    if (!Number.isFinite(order) || order <= 0) return period;
    if (code === 'HOC' || code === 'WPO') return order <= 4 ? `Q${order}` : 'ET';
    if (code === 'VVO' || code === 'VBV') return `S${order}`;
    return order <= 2 ? `${order}T` : 'ET';
}

/**
 * La cronología al formato de `MatchTimeline` (el mismo que arma la FIH).
 * Solo lo que la cronología dibuja: un cambio de arquero no es un hecho del
 * partido para quien lo mira.
 */
function toTimelineEvents(code: OdesurDisciplineCode, actions: OdesurAction[]) {
    return actions
        .filter((action) => action.type !== null)
        .map((action, index) => {
            const number = Number(action.playerBib);
            const minute = action.minute ?? 0;
            return {
                id: `${code}-${action.order}-${index}`,
                type: action.type as string,
                team: action.side,
                player: action.playerName,
                playerId: null,
                number: action.playerBib !== '' && Number.isFinite(number) ? number : null,
                description: action.label,
                minute,
                time: minute,
                period: eventPeriod(code, action.period),
                order: index,
                scoreHome: action.scoreHome,
                scoreAway: action.scoreAway,
            };
        });
}

export async function getOdesurMatchBundle(matchId: string) {
    const parsed = parseOdesurMatchId(matchId);
    if (!parsed) return null;

    const { competition } = parsed;
    const code = competition.discipline.code;
    const units = await getCompetitionUnits(competition);
    const unit = findOdesurUnit(units, parsed);
    if (!unit) return null;

    const live = unit.state === 'live';

    // La planilla, la cronología y las tablas van por su cuenta: la ficha
    // tiene que abrir igual con el cronograma solo si alguna no contesta. Un
    // partido provisional no tiene llave, así que no hay planilla que pedir.
    const [detailResult, actionsResult, groupsResult] = await Promise.allSettled([
        unit.resCode ? getResultDetail(code, unit.resCode, live) : Promise.resolve(null),
        unit.resCode && unit.state !== 'scheduled'
            ? getActions(code, unit.resCode, live)
            : Promise.resolve([] as OdesurAction[]),
        getCompetitionGroups(competition),
    ]);
    const detail = detailResult.status === 'fulfilled' ? detailResult.value : null;
    const actions = actionsResult.status === 'fulfilled' ? actionsResult.value : [];
    const groups = groupsResult.status === 'fulfilled' ? groupsResult.value : [];

    // La planilla es más fresca que el cronograma para el marcador en juego.
    const homeScore = detail?.homeScore ?? unit.homeScore;
    const awayScore = detail?.awayScore ?? unit.awayScore;
    const state = detail?.state === 'live' || detail?.state === 'final' ? detail.state : unit.state;
    const statusText = detail?.status || unit.status;

    const standings = groups
        // La tabla que importa es la de la zona del partido; si es cruce, van
        // todas. Se busca también por la letra: la fase de un provisional
        // (`GPA-`) no es la del confirmado (`GP01`).
        .filter((group) => (
            unit.pool ? group.phaseCode === unit.phaseCode || group.name === `Grupo ${unit.pool}` : true
        ))
        .flatMap((group) => group.rows.map((row, index) => toStandingsRow(row, index + 1, group.name)));

    const periods = (detail?.periods ?? []).map((period) => ({
        period: String(period.order),
        label: period.name,
        home: period.home,
        away: period.away,
    }));

    const events = toTimelineEvents(code, actions);
    const kickoff = unit.startsAtIso ? new Date(unit.startsAtIso) : null;
    const lineups = buildLineups(detail?.homeRoster ?? [], detail?.awayRoster ?? [], unit.homeName, unit.awayName);
    const empty: unknown[] = [];

    return {
        source: ODESUR_PROVIDER,
        match: {
            id: odesurMatchIdOf(unit),
            externalProvider: ODESUR_PROVIDER,
            sportId: competition.discipline.sportId,
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
            tournamentLogo: ODESUR_LOGO_URL,
            tournamentId: competition.tournamentId,
            tournamentSeason: ODESUR_SEASON,
            category: 'Internacional',
            round: unit.stageName,
            venue: unit.venue || '',
            referee: null,
            attendance: null,
            currentMinute: state === 'live' ? odesurLiveLabel(statusText, detail?.currentPeriod ?? null, code) : undefined,
            home: {
                id: odesurTeamId(unit.homeCode, unit.homeName),
                name: unit.homeName,
                logo: odesurFlagUrl(unit.homeCode, unit.homeName),
                score: homeScore,
                teamUrl: '',
                league: competition.tournamentId,
            },
            away: {
                id: odesurTeamId(unit.awayCode, unit.awayName),
                name: unit.awayName,
                logo: odesurFlagUrl(unit.awayCode, unit.awayName),
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
            events,
            stats: empty,
            periods,
            officials: empty,
            draw: empty,
            form: empty,
            topScorers: empty,
        },
        h2h: empty,
        standings,
        events,
        stats: empty,
        periods,
        lineups,
        playerStats: null,
    };
}

// --------------------------------------------------------------------------
// Medallero
// --------------------------------------------------------------------------

export type OdesurMedalTable = {
    /** `ALL` para el general, o el código de la disciplina. */
    discipline: string;
    disciplineName: string;
    rows: Array<OdesurMedalCount & { position: number }>;
    fetchedAt: string;
};

/** El medallero general de los Juegos. */
export async function getOdesurMedalTable(): Promise<OdesurMedalTable> {
    return readResource(
        'medals:ALL',
        'medallero general',
        async () => ({
            discipline: 'ALL',
            disciplineName: 'General',
            rows: rankMedals(parseOdesurMedals(await fetchJson('ALL/medals/standings'))),
            fetchedAt: new Date().toISOString(),
        }),
        () => TTL_MEDALS_SECONDS,
    );
}

/** El medallero de una disciplina (cualquiera de las 60, no solo las del feed). */
export async function getOdesurDisciplineMedalTable(code: string): Promise<OdesurMedalTable> {
    const discipline = code.trim().toUpperCase();
    return readResource(
        `medals:${discipline}`,
        `medallero de ${discipline}`,
        async () => ({
            discipline,
            disciplineName: odesurDisciplineName(discipline),
            rows: rankMedals(parseOdesurMedals(await fetchJson(`${discipline}/medals/standings`))),
            fetchedAt: new Date().toISOString(),
        }),
        () => TTL_MEDALS_SECONDS,
    );
}

/**
 * Las disciplinas que ya repartieron medallas, según `medals/params`. Es la
 * compuerta del desglose por deporte: sin ella habría que pedir los 60
 * medalleros para descubrir que 55 están vacíos.
 */
export async function getOdesurMedalDisciplines(): Promise<string[]> {
    return readResource(
        'medals:params',
        'deportes con medallas',
        async () => parseOdesurMedalDisciplines(await fetchJson('ALL/medals/params')),
        () => TTL_MEDALS_SECONDS,
    );
}

/** El medallero de cada deporte que ya repartió medallas, en orden alfabético. */
export async function getOdesurMedalTablesByDiscipline(): Promise<OdesurMedalTable[]> {
    const disciplines = await getOdesurMedalDisciplines();
    const tables = await Promise.all(disciplines.map((code) => (
        getOdesurDisciplineMedalTable(code).catch((error) => {
            console.warn(`[ODESUR] medallero de ${code} no disponible:`, error instanceof Error ? error.message : error);
            return null;
        })
    )));
    return tables
        .filter((table): table is OdesurMedalTable => table !== null && table.rows.length > 0)
        .sort((a, b) => a.disciplineName.localeCompare(b.disciplineName, 'es'));
}

/** Quién ganó cada prueba de una disciplina. */
export async function getOdesurMedallists(code: string): Promise<OdesurMedallist[]> {
    const discipline = code.trim().toUpperCase();
    return readResource(
        `medallists:${discipline}`,
        `medallistas de ${discipline}`,
        async () => parseOdesurMedallists(await fetchJson(`${discipline}/medals/discipline`)),
        () => TTL_MEDALS_SECONDS,
    );
}

/** Las últimas medallas entregadas, de cualquier deporte, la más reciente primero. */
export async function getOdesurLatestMedallists(): Promise<OdesurMedallist[]> {
    const rows = await readResource(
        'medallists:latest',
        'últimas medallas',
        async () => parseOdesurMedallists(await fetchJson('ALL/medals/latest')),
        () => TTL_MEDALS_SECONDS,
    );
    // El parser las ordena por prueba; acá interesa la más reciente primero.
    return [...rows].sort((a, b) => (b.awardedAtIso ?? '').localeCompare(a.awardedAtIso ?? ''));
}

// --------------------------------------------------------------------------
// Agenda y vistas del apartado de los Juegos
// --------------------------------------------------------------------------

/** La agenda de un día de Santa Fe, con los 60 deportes. */
export async function getOdesurAgenda(day: string): Promise<OdesurAgendaItem[]> {
    return readResource(
        `agenda:${day}`,
        `agenda del ${day}`,
        async () => parseOdesurAgenda(await fetchJson(`ALL/schedule/day/${day}`)),
        (items) => (items.some((item) => item.state === 'live') ? TTL_DAILY_LIVE_SECONDS : TTL_DAILY_OPEN_SECONDS),
    );
}

/** Los partidos de una competencia, para las pestañas del apartado. */
export async function getOdesurCompetitionMatches(competition: OdesurCompetition): Promise<Match[]> {
    const units = await getCompetitionUnits(competition);
    return units
        .map(toAppMatch)
        .filter((match): match is Match => match !== null)
        .sort((left, right) => (left.scheduledAt?.getTime() ?? 0) - (right.scheduledAt?.getTime() ?? 0));
}

/** Las zonas de una competencia, con las banderas ya resueltas. */
export async function getOdesurCompetitionStandings(competition: OdesurCompetition) {
    const groups = await getCompetitionGroups(competition);
    return groups.map((group) => ({
        name: group.name,
        rows: group.rows.map((row) => ({ ...row, flag: odesurFlagUrl(row.code, row.name) })),
    }));
}
