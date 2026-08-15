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

/**
 * Descarga + parseo con caché de TTL adaptativo y último-dato-bueno.
 *
 * El TTL sale de `fihRefreshTtlSeconds`: 20 s mientras hay partidos en la
 * ventana caliente, 120 s el resto del tiempo. Con las dos competencias son
 * ~6 requests/minuto contra Altius en el peor caso, sin importar cuántos
 * usuarios haya conectados.
 */
async function readCompetitionPage<T>(
    cacheKey: string,
    path: string,
    parse: (html: string) => T,
    ttlSeconds: (parsed: T) => number,
): Promise<T> {
    const cached = memoryCache.get<T>(cacheKey);
    if (cached) return cached;

    try {
        const parsed = parse(await fetchHtml(path));
        memoryCache.set(cacheKey, parsed, ttlSeconds(parsed));
        lastGood.set(cacheKey, parsed);
        return parsed;
    } catch (error) {
        const stale = lastGood.get(cacheKey) as T | undefined;
        if (stale !== undefined) {
            console.warn(`[FIH] ${path} no responde; sirvo el último dato bueno.`, error instanceof Error ? error.message : error);
            return stale;
        }
        throw error;
    }
}

export async function getFihCompetitionMatches(key: FihCompetitionKey): Promise<FihMatchRow[]> {
    return readCompetitionPage(
        `${CACHE_PREFIX}:matches:${key}`,
        `/competitions/${FIH_COMPETITIONS[key].altiusId}/matches`,
        parseFihMatchesHtml,
        (rows) => fihRefreshTtlSeconds(rows, Date.now()),
    );
}

export async function getFihCompetitionPools(key: FihCompetitionKey): Promise<FihPool[]> {
    return readCompetitionPage(
        `${CACHE_PREFIX}:pools:${key}`,
        `/competitions/${FIH_COMPETITIONS[key].altiusId}/pools`,
        parseFihPoolsHtml,
        () => TTL_POOLS_SECONDS,
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
            referee: null,
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
            lineups: null,
            standings,
            h2h: [] as unknown[],
            draw: [] as unknown[],
            form: [] as unknown[],
            topScorers: [] as unknown[],
        },
        h2h: [] as unknown[],
        standings,
    };
}
