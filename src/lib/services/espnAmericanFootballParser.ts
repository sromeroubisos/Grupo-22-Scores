/**
 * Fútbol americano por ESPN: la parte PURA del conector.
 *
 * Acá entra el JSON de ESPN y sale la forma que consumen el feed, la página de
 * torneo, la ficha del partido y la del equipo. No hay red ni caché: eso vive
 * en `espnAmericanFootball.ts`. La separación existe para que esto se pueda
 * probar con `node --test` sin arrastrar `memoryCache` (ver
 * `espnAmericanFootballParser.test.ts`).
 *
 * Lo que este archivo sabe de ESPN y no se ve en el código de red — medido el
 * 2026-09-10 contra los endpoints vivos:
 *
 * - La tabla llega por CONFERENCIA (`children[]`) y, con `level=3`, por división
 *   anidada dos niveles. La NCAA trae la Sun Belt anidada aun sin `level`.
 *   Por eso el recorrido es recursivo.
 * - No existe la estadística `gamesPlayed`. En la NCAA tampoco `losses` ni
 *   `ties`: el récord real está en el resumen `overall` ("11-2", "9-7-1").
 * - `playoffSeed` es 0 fuera de temporada y en temporada es la semilla DENTRO
 *   de la conferencia; el orden de `entries` no es el de la tabla. Se ordena acá.
 * - Cancelado (id 5) y postergado (id 6) vienen con `state: 'post'`, así que el
 *   estado se resuelve por id antes que por `state`.
 * - En el calendario por equipo el marcador es un objeto `{value, displayValue}`;
 *   en el scoreboard es un string.
 * - El resumen del partido trae dos mini-tablas en `standings.groups[]` con el
 *   equipo como STRING y el id en la entrada.
 * - El Pro Bowl entra al scoreboard como un partido (`type.abbreviation:
 *   'ALLSTAR'`) entre "AFC" y "NFC".
 *
 * Los imports de valor van relativos y con extensión porque `node --test`
 * corre sin el resolver de alias de Next.
 */

import type {
    ExternalMatchWithMapping,
    ExternalStandingsRow,
    MatchConfidence,
} from '../types/flashscore-integration.ts';
import type { MatchStatus } from '../../types/match.ts';

export type EspnAmericanFootballLeagueSlug =
    | 'nfl'
    | 'college-football'
    | 'cfl'
    | 'ufl'
    | 'xfl';

export type EspnAmericanFootballLeague = {
    slug: EspnAmericanFootballLeagueSlug;
    name: string;
    shortName: string;
    countryName: string;
    /** Misma convención de URL que FlashScore: sirve para reconocer la liga desde afuera. */
    tournamentUrl: string;
    aliases: string[];
    /**
     * `false` = ESPN dejó de publicarla. El id se sigue reconociendo (partidas
     * guardadas, links viejos) pero no se le pide nada: el feed y la
     * resolución de partidos recorren solo las activas.
     */
    active: boolean;
    /** `level` del endpoint de standings. 3 baja hasta la división (NFL). */
    standingsLevel: number | null;
};

export const LEAGUES: Record<EspnAmericanFootballLeagueSlug, EspnAmericanFootballLeague> = {
    nfl: {
        slug: 'nfl',
        name: 'National Football League',
        shortName: 'NFL',
        countryName: 'USA',
        tournamentUrl: '/american-football/usa/nfl/',
        aliases: ['nfl'],
        active: true,
        standingsLevel: 3,
    },
    'college-football': {
        slug: 'college-football',
        name: 'College Football',
        shortName: 'NCAA',
        countryName: 'USA',
        tournamentUrl: '/american-football/usa/ncaa/',
        aliases: ['college-football', 'ncaa', 'ncaa football', 'ncaaf', 'college'],
        active: true,
        standingsLevel: null,
    },
    // ESPN no publica la CFL desde la postemporada 2022: el scoreboard devuelve
    // un evento viejo y la tabla viene vacía. La cubre FlashScore.
    cfl: {
        slug: 'cfl',
        name: 'Canadian Football League',
        shortName: 'CFL',
        countryName: 'Canada',
        tournamentUrl: '/american-football/canada/cfl/',
        aliases: ['cfl'],
        active: false,
        standingsLevel: null,
    },
    ufl: {
        slug: 'ufl',
        name: 'United Football League',
        shortName: 'UFL',
        countryName: 'USA',
        tournamentUrl: '/american-football/usa/ufl/',
        aliases: ['ufl'],
        active: true,
        standingsLevel: null,
    },
    // La XFL se fusionó en la UFL en 2024; en ESPN quedó congelada en 2023.
    xfl: {
        slug: 'xfl',
        name: 'XFL',
        shortName: 'XFL',
        countryName: 'USA',
        tournamentUrl: '/american-football/usa/xfl/',
        aliases: ['xfl'],
        active: false,
        standingsLevel: null,
    },
};

/** Todas las ligas que el conector RECONOCE (ids, links guardados). */
export const SUPPORTED_ESPN_AMERICAN_FOOTBALL_LEAGUES = Object.values(LEAGUES);

/** Las que ESPN sigue publicando: las únicas a las que se les pide algo. */
export const ACTIVE_ESPN_AMERICAN_FOOTBALL_LEAGUES = SUPPORTED_ESPN_AMERICAN_FOOTBALL_LEAGUES.filter(
    (league) => league.active,
);

export type EspnSeasonPhase = 'preseason' | 'regular' | 'postseason';

// ── Utilidades ──────────────────────────────────────────────────────────────

export function isRecord(value: unknown): value is Record<string, any> {
    return typeof value === 'object' && value !== null;
}

export function normalizeString(value: unknown): string | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return String(value);
    }
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed || null;
}

export function normalizeKey(value: unknown): string | null {
    const normalized = normalizeString(value);
    return normalized ? normalized.toLowerCase() : null;
}

export function parseDate(value: unknown): Date | null {
    const normalized = normalizeString(value);
    if (!normalized) return null;
    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * El marcador llega como string en el scoreboard ("13") y como objeto en el
 * calendario por equipo ({ value: 13, displayValue: "13" }). Antes el objeto se
 * descartaba y los resultados del equipo salían sin goles.
 */
export function parseScore(value: unknown): number | null {
    if (isRecord(value)) {
        return parseScore(value.value ?? value.displayValue);
    }
    const raw = normalizeString(value);
    if (!raw) return null;
    const numeric = Number(raw);
    return Number.isFinite(numeric) ? numeric : null;
}

export function getEspnLogo(entity: any): string {
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

export function getCompetitors(event: Record<string, any>) {
    const competition = Array.isArray(event?.competitions) ? event.competitions[0] : null;
    const competitors = Array.isArray(competition?.competitors) ? competition.competitors : [];
    const home = competitors.find((competitor: any) => competitor?.homeAway === 'home') || competitors[0] || null;
    const away = competitors.find((competitor: any) => competitor?.homeAway === 'away') || competitors[1] || null;
    return { competition, competitors, home, away };
}

export function getEspnTeamDisplayName(competitor: any) {
    return (
        competitor?.team?.displayName ||
        competitor?.team?.shortDisplayName ||
        competitor?.team?.name ||
        competitor?.displayName ||
        competitor?.name ||
        'Equipo'
    );
}

export function getEspnTeamAbbreviation(competitor: any) {
    return (
        competitor?.team?.abbreviation ||
        competitor?.abbreviation ||
        competitor?.team?.shortDisplayName ||
        null
    );
}

export function getLeagueLogo(payload: Record<string, any> | null | undefined) {
    return (
        getEspnLogo(payload?.league) ||
        getEspnLogo(Array.isArray(payload?.leagues) ? payload.leagues[0] : null)
    );
}

export function getLeagueSeason(payload: Record<string, any> | null | undefined) {
    const season =
        payload?.season?.year ??
        payload?.requestedSeason?.year ??
        payload?.header?.season?.year ??
        null;
    return typeof season === 'number' ? season : null;
}

// ── Ids ─────────────────────────────────────────────────────────────────────

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

function asActiveLeague(slug: EspnAmericanFootballLeagueSlug | null | undefined) {
    if (!slug) return null;
    return LEAGUES[slug].active ? slug : null;
}

/**
 * Qué liga ACTIVA de ESPN es esto. Devuelve `null` para la CFL y la XFL aunque
 * el id o el nombre coincidan: una liga muerta en ESPN no tiene que capturar
 * un torneo que FlashScore sí cubre.
 */
export function inferEspnAmericanFootballLeague(input: {
    id?: unknown;
    externalId?: unknown;
    tournamentUrl?: unknown;
    leagueSlug?: unknown;
    name?: unknown;
    ruleset?: unknown;
}): EspnAmericanFootballLeagueSlug | null {
    const explicitLeague = normalizeKey(input.leagueSlug);
    if (isEspnAmericanFootballLeagueSlug(explicitLeague)) {
        return asActiveLeague(explicitLeague);
    }

    const prefixedIds = [
        parseEspnAmericanFootballTournamentId(input.id),
        parseEspnAmericanFootballTournamentId(input.externalId),
    ].filter(Boolean) as EspnAmericanFootballLeagueSlug[];
    if (prefixedIds.length > 0) {
        return asActiveLeague(prefixedIds[0]);
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
        return asActiveLeague(rulesetLeague);
    }

    const normalizedUrl = normalizeKey(input.tournamentUrl);
    if (normalizedUrl) {
        for (const league of ACTIVE_ESPN_AMERICAN_FOOTBALL_LEAGUES) {
            if (normalizedUrl.includes(league.tournamentUrl.toLowerCase())) {
                return league.slug;
            }
        }
        // Con URL la decisión es por URL: el nombre solo decide cuando no hay URL.
        // Si no, "NFL Canada" o un "College Bowl" de otro país caerían en ESPN.
        return null;
    }

    const normalizedName = normalizeKey(input.name);
    if (normalizedName) {
        for (const league of ACTIVE_ESPN_AMERICAN_FOOTBALL_LEAGUES) {
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

// ── Estado, fase y reloj ────────────────────────────────────────────────────

/**
 * Ids de `status.type` de ESPN: 1 programado, 2 en juego, 3 final, 4 forfeit,
 * 5 cancelado, 6 postergado, 7 demorado, 8 suspendido, 22 entretiempo,
 * 23 fin de cuarto. Cancelado y postergado llegan con `state: 'post'`, así
 * que el id se mira ANTES que el estado: si no, un partido cancelado 3-7 se
 * publica como Final.
 */
export function mapEspnStatus(statusType: any): MatchStatus {
    const id = normalizeString(statusType?.id);
    const state = normalizeKey(statusType?.state);
    const text = [statusType?.name, statusType?.description, statusType?.detail, statusType?.shortDetail]
        .map((value) => normalizeKey(value))
        .filter(Boolean)
        .join(' ');

    if (id === '5' || text.includes('cancel')) return 'cancelled';
    if (id === '6' || text.includes('postponed')) return 'postponed';
    if (id === '8' || text.includes('suspended')) return 'postponed';
    if (id === '4' || state === 'post' || statusType?.completed === true) return 'final';
    if (state === 'in' || text.includes('in progress') || text.includes('halftime')) return 'live';
    return 'scheduled';
}

export function getEspnSeasonPhase(event: Record<string, any> | null | undefined): EspnSeasonPhase {
    const raw =
        event?.season?.type ??
        event?.seasonType?.type ??
        event?.seasonType?.id ??
        event?.header?.season?.type ??
        null;
    const type = Number(raw);
    if (type === 1) return 'preseason';
    if (type === 3) return 'postseason';
    return 'regular';
}

/** El Pro Bowl y cualquier otro partido de estrellas: no es un partido de la liga. */
export function isEspnAllStarEvent(event: Record<string, any> | null | undefined) {
    const competition = Array.isArray(event?.competitions) ? event.competitions[0] : null;
    return normalizeKey(competition?.type?.abbreviation) === 'allstar';
}

export function getEspnWeekNumber(event: Record<string, any> | null | undefined): number | null {
    const week = event?.week?.number ?? event?.header?.week ?? null;
    return typeof week === 'number' && Number.isFinite(week) ? week : null;
}

/**
 * Rótulo de la fecha. La semana reinicia por tipo de temporada (la 1 de
 * playoffs no es la 1 regular), así que el rótulo lleva la fase. En playoffs
 * ESPN manda el nombre de la instancia en `competitions[0].notes[].headline`
 * ("AFC Wild Card Playoffs", "Super Bowl LX") y ese gana.
 */
export function getEspnRoundLabel(event: Record<string, any> | null | undefined): string {
    const phase = getEspnSeasonPhase(event);
    const week = getEspnWeekNumber(event);
    const competition = Array.isArray(event?.competitions) ? event.competitions[0] : null;
    const notes = Array.isArray(competition?.notes) ? competition.notes : [];
    const headline = notes
        .map((note: any) => normalizeString(note?.headline))
        .find(Boolean) as string | undefined;

    if (phase === 'postseason') {
        if (headline) return headline;
        return week ? `Playoffs · Semana ${week}` : 'Playoffs';
    }
    if (phase === 'preseason') {
        return week ? `Pretemporada · Semana ${week}` : 'Pretemporada';
    }
    if (week) return `Semana ${week}`;
    return normalizeString(event?.week?.text) || 'General';
}

export type EspnLiveClock = {
    period: number | null;
    clock: string | null;
    /** Lo que se muestra al lado del marcador: "3Q 5:12", "ET", "OT 2:00". */
    label: string | null;
};

export function getEspnLiveClock(statusPayload: any): EspnLiveClock {
    const period = typeof statusPayload?.period === 'number' ? statusPayload.period : null;
    const clock = normalizeString(statusPayload?.displayClock);
    const typeId = normalizeString(statusPayload?.type?.id);
    const state = normalizeKey(statusPayload?.type?.state);

    if (state !== 'in') return { period, clock, label: null };
    if (typeId === '22') return { period, clock, label: 'ET' };
    if (period === null) return { period, clock, label: clock };
    const periodLabel = period > 4 ? (period === 5 ? 'OT' : `OT${period - 4}`) : `${period}Q`;
    return { period, clock, label: clock ? `${periodLabel} ${clock}` : periodLabel };
}

export type EspnSituation = {
    down: number | null;
    distance: number | null;
    yardLine: number | null;
    downDistanceText: string | null;
    possessionTeamId: string | null;
    isRedZone: boolean;
    lastPlay: string | null;
    homeTimeouts: number | null;
    awayTimeouts: number | null;
};

export function getEspnSituation(competition: any): EspnSituation | null {
    const situation = competition?.situation;
    if (!isRecord(situation)) return null;
    const possession = normalizeString(situation.possession);
    return {
        down: typeof situation.down === 'number' ? situation.down : null,
        distance: typeof situation.distance === 'number' ? situation.distance : null,
        yardLine: typeof situation.yardLine === 'number' ? situation.yardLine : null,
        downDistanceText: normalizeString(situation.downDistanceText) || normalizeString(situation.shortDownDistanceText),
        possessionTeamId: possession ? toEspnAmericanFootballTeamId(possession) : null,
        isRedZone: situation.isRedZone === true,
        lastPlay: normalizeString(situation.lastPlay?.text),
        homeTimeouts: typeof situation.homeTimeouts === 'number' ? situation.homeTimeouts : null,
        awayTimeouts: typeof situation.awayTimeouts === 'number' ? situation.awayTimeouts : null,
    };
}

export function getEspnLinescores(competitor: any): number[] {
    const linescores = Array.isArray(competitor?.linescores) ? competitor.linescores : [];
    return linescores
        .map((line: any) => parseScore(line?.value ?? line?.displayValue))
        .filter((value: number | null): value is number => value !== null);
}

/** "12-5" o "9-7-1": el récord acumulado como lo publica ESPN al lado del equipo. */
export function getEspnRecordSummary(competitor: any): string | null {
    const records = Array.isArray(competitor?.records)
        ? competitor.records
        : Array.isArray(competitor?.record)
            ? competitor.record
            : [];
    const total = records.find((record: any) => normalizeKey(record?.type) === 'total') || records[0];
    return normalizeString(total?.summary) || normalizeString(total?.displayValue);
}

/** Ranking AP en la NCAA. ESPN manda 99 para "sin ranking". */
export function getEspnCuratedRank(competitor: any): number | null {
    const rank = competitor?.curatedRank?.current;
    return typeof rank === 'number' && rank >= 1 && rank <= 25 ? rank : null;
}

// ── Partidos ────────────────────────────────────────────────────────────────

export type EspnNormalizedEvent = NonNullable<ReturnType<typeof normalizeEspnEventCore>>;

export function normalizeEspnEventCore(event: Record<string, any>, league: EspnAmericanFootballLeague) {
    if (isEspnAllStarEvent(event)) return null;

    const { competition, home, away } = getCompetitors(event);
    const statusPayload = competition?.status || event?.status;
    const status = mapEspnStatus(statusPayload?.type);
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
    const phase = getEspnSeasonPhase(event);
    const week = getEspnWeekNumber(event);
    const roundLabel = getEspnRoundLabel(event);
    const broadcasts = (Array.isArray(competition?.broadcasts) ? competition.broadcasts : [])
        .flatMap((broadcast: any) => (Array.isArray(broadcast?.names) ? broadcast.names : []))
        .map((name: unknown) => normalizeString(name))
        .filter(Boolean) as string[];

    return {
        id: toEspnAmericanFootballMatchId(eventId),
        rawId: eventId,
        status,
        kickoff,
        round: week ?? 1,
        phase,
        roundLabel,
        /** Compatibilidad: el rótulo que antes se llamaba `weekText`. */
        weekText: roundLabel,
        live: getEspnLiveClock(statusPayload),
        situation: status === 'live' ? getEspnSituation(competition) : null,
        venue,
        neutralSite: competition?.neutralSite === true,
        broadcasts,
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
            record: getEspnRecordSummary(home),
            rank: getEspnCuratedRank(home),
            linescores: getEspnLinescores(home),
            winner: home?.winner === true,
        },
        away: {
            id: awayId ? toEspnAmericanFootballTeamId(awayId) : null,
            rawId: awayId,
            name: getEspnTeamDisplayName(away),
            shortName: getEspnTeamAbbreviation(away),
            logo: getEspnLogo(away?.team || away),
            league: league.slug,
            record: getEspnRecordSummary(away),
            rank: getEspnCuratedRank(away),
            linescores: getEspnLinescores(away),
            winner: away?.winner === true,
        },
        score: {
            home: homeScore,
            away: awayScore,
        },
    };
}

/** La fase del feed (`Match.phaseId`) a partir del tipo de temporada. */
export function toFeedPhaseId(phase: EspnSeasonPhase): string {
    if (phase === 'postseason') return 'playoffs';
    if (phase === 'preseason') return 'preseason';
    return 'group';
}

export function normalizeEspnEventForTournamentViews(event: Record<string, any>, league: EspnAmericanFootballLeague) {
    const normalized = normalizeEspnEventCore(event, league);
    if (!normalized) return null;

    const team = (side: EspnNormalizedEvent['home']) => ({
        id: side.id,
        team_id: side.id,
        name: side.name,
        short_name: side.shortName,
        logo: side.logo,
        image_path: side.logo,
        small_image_path: side.logo,
        team_url: '',
        league: side.league,
        record: side.record,
        rank: side.rank,
        linescores: side.linescores,
        provider: 'espn',
        source: 'espn',
    });

    return {
        match_id: normalized.id,
        event_key: normalized.id,
        timestamp: Math.floor(normalized.kickoff.getTime() / 1000),
        date: normalized.kickoff.toISOString(),
        match_status: normalized.status,
        event_status: normalized.status,
        status: normalized.status,
        week: normalized.roundLabel,
        round: normalized.roundLabel,
        round_number: normalized.round,
        season: normalized.season,
        season_phase: normalized.phase,
        period: normalized.live.period,
        clock: normalized.live.clock,
        current_minute: normalized.live.label,
        situation: normalized.situation,
        neutral_site: normalized.neutralSite,
        broadcasts: normalized.broadcasts,
        tournament_id: normalized.tournament.id,
        tournament_name: normalized.tournament.fullName,
        tournament_name_short: normalized.tournament.name,
        tournament_logo: normalized.tournament.logo,
        country_name: normalized.tournament.countryName,
        sport_id: 'american-football',
        home_team: team(normalized.home),
        away_team: team(normalized.away),
        home_team_name: normalized.home.name,
        away_team_name: normalized.away.name,
        home_team_logo: normalized.home.logo,
        away_team_logo: normalized.away.logo,
        scores: normalized.score,
        score: normalized.score,
        linescores: {
            home: normalized.home.linescores,
            away: normalized.away.linescores,
        },
        venue: normalized.venue,
        source: 'espn',
        provider: 'espn',
    };
}

export type EspnTournamentViewEvent = NonNullable<ReturnType<typeof normalizeEspnEventForTournamentViews>>;

export function isEspnTournamentViewEvent(
    event: ReturnType<typeof normalizeEspnEventForTournamentViews>,
): event is EspnTournamentViewEvent {
    return Boolean(event);
}

export type EspnParticipant = {
    club_id: string;
    clubs: {
        id: string;
        name: string;
        short_name: string | null;
    };
};

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

// ── Tabla de posiciones ─────────────────────────────────────────────────────

type StandingsGroup = {
    name: string | null;
    entries: any[];
};

/**
 * Recorre `children[]` hasta donde haya entradas. Con `level=3` la NFL viene
 * conferencia → división, y la NCAA trae la Sun Belt anidada aun sin `level`;
 * el aplanado de un solo nivel perdía esos 14 equipos.
 */
function collectStandingGroups(node: any, groups: StandingsGroup[] = []): StandingsGroup[] {
    if (!isRecord(node)) return groups;
    const entries = Array.isArray(node?.standings?.entries) ? node.standings.entries : [];
    if (entries.length > 0) {
        groups.push({
            name: normalizeString(node?.name) || normalizeString(node?.abbreviation),
            entries,
        });
        return groups;
    }
    const children = Array.isArray(node?.children) ? node.children : [];
    for (const child of children) collectStandingGroups(child, groups);
    return groups;
}

function findStat(stats: any[], names: string[]) {
    for (const stat of stats) {
        const statName = normalizeKey(stat?.name);
        const statType = normalizeKey(stat?.type);
        if ((statName && names.includes(statName)) || (statType && names.includes(statType))) {
            return stat;
        }
    }
    return null;
}

function getStatNumber(stats: any[], names: string[]): number | null {
    const stat = findStat(stats, names);
    if (!stat) return null;
    const numeric = Number(stat?.value);
    return Number.isFinite(numeric) ? numeric : null;
}

function getStatDisplay(stats: any[], names: string[]): string | null {
    const stat = findStat(stats, names);
    return normalizeString(stat?.displayValue) || normalizeString(stat?.summary);
}

/** "11-2" → { w: 11, l: 2, t: 0 }; "9-7-1" → { w: 9, l: 7, t: 1 }. */
export function parseRecordSummary(summary: unknown): { w: number; l: number; t: number } | null {
    const normalized = normalizeString(summary);
    if (!normalized) return null;
    const match = /^(\d+)-(\d+)(?:-(\d+))?$/.exec(normalized);
    if (!match) return null;
    return {
        w: Number(match[1]),
        l: Number(match[2]),
        t: match[3] ? Number(match[3]) : 0,
    };
}

type RawStandingEntry = {
    teamId: string | null;
    teamName: string;
    teamLogo: string;
    rank: number | null;
    note: string | null;
    stats: any[];
};

function readLeagueEntry(entry: any): RawStandingEntry {
    return {
        teamId: normalizeString(entry?.team?.id),
        teamName: entry?.team?.displayName || entry?.team?.shortDisplayName || entry?.team?.name || 'Equipo',
        teamLogo: getEspnLogo(entry?.team),
        rank: typeof entry?.team?.rank === 'number' ? entry.team.rank : null,
        note: normalizeString(entry?.note?.description),
        stats: Array.isArray(entry?.stats) ? entry.stats : [],
    };
}

/** En el resumen del partido el equipo es un string y el id y el logo van en la entrada. */
function readSummaryEntry(entry: any): RawStandingEntry {
    return {
        teamId: normalizeString(entry?.id),
        teamName: normalizeString(entry?.team) || 'Equipo',
        teamLogo: getEspnLogo({ logos: entry?.logo }),
        rank: null,
        note: null,
        stats: Array.isArray(entry?.stats) ? entry.stats : [],
    };
}

type BuiltRow = ExternalStandingsRow & { _pct: number; _diff: number; _pf: number };

function buildStandingRow(entry: RawStandingEntry): BuiltRow {
    const stats = entry.stats;
    // El récord: primero el resumen "W-L(-T)" del bloque `overall`, que es el
    // único lugar donde la NCAA publica las derrotas; después las estadísticas
    // sueltas de la NFL.
    const overall = parseRecordSummary(findStat(stats, ['total', 'overall'])?.summary);
    const wins = overall?.w ?? getStatNumber(stats, ['wins']) ?? 0;
    const losses = overall?.l ?? getStatNumber(stats, ['losses']) ?? 0;
    const ties = overall?.t ?? getStatNumber(stats, ['ties']) ?? 0;
    const played = wins + losses + ties;
    const scored = getStatNumber(stats, ['pointsfor']);
    const conceded = getStatNumber(stats, ['pointsagainst']);
    const differential =
        getStatNumber(stats, ['pointdifferential', 'differential']) ??
        (scored !== null && conceded !== null ? scored - conceded : null);
    const publishedPct = getStatNumber(stats, ['winpercent', 'leaguewinpercent']);
    const winPercentage = played > 0
        ? (wins + ties / 2) / played
        : (publishedPct ?? 0);
    const seedValue = getStatNumber(stats, ['playoffseed']);

    return {
        position: 0,
        team_name: entry.teamName,
        team_id: entry.teamId ? toEspnAmericanFootballTeamId(entry.teamId) : null,
        team_logo: entry.teamLogo,
        team_url: '',
        played,
        won: wins,
        drawn: ties,
        lost: losses,
        // Sin puntos de tabla en este deporte: la UI ordena por porcentaje.
        points: wins,
        ...(scored !== null ? { scored } : {}),
        ...(conceded !== null ? { conceded } : {}),
        ...(differential !== null ? { differential } : {}),
        win_percentage: Number(winPercentage.toFixed(3)),
        streak: getStatDisplay(stats, ['streak']),
        games_behind: getStatDisplay(stats, ['gamesbehind']),
        seed: seedValue !== null && seedValue > 0 ? seedValue : null,
        note: entry.note,
        rank: entry.rank,
        _pct: winPercentage,
        _diff: differential ?? 0,
        _pf: scored ?? 0,
    };
}

function finishGroups(groups: Array<{ name: string | null; rows: BuiltRow[] }>): ExternalStandingsRow[] {
    // Con un solo grupo no hay cabecera que mostrar (UFL, tabla plana).
    const labelGroups = groups.length > 1;
    const out: ExternalStandingsRow[] = [];

    for (const group of groups) {
        const ordered = [...group.rows].sort((left, right) => {
            if (right._pct !== left._pct) return right._pct - left._pct;
            if (right._diff !== left._diff) return right._diff - left._diff;
            if (right._pf !== left._pf) return right._pf - left._pf;
            return left.team_name.localeCompare(right.team_name);
        });
        ordered.forEach((row, index) => {
            const { _pct, _diff, _pf, ...clean } = row;
            void _pct; void _diff; void _pf;
            out.push({
                ...clean,
                position: index + 1,
                ...(labelGroups && group.name ? { group_name: group.name } : {}),
            });
        });
    }

    return out;
}

/**
 * La tabla de liga (`apis/v2/.../standings`). Una fila por equipo, ordenada
 * dentro de su grupo y con `group_name` cuando hay más de uno.
 */
export function normalizeEspnAmericanFootballStandingsRows(
    payload: Record<string, any> | null | undefined,
    _leagueSlug: EspnAmericanFootballLeagueSlug,
): ExternalStandingsRow[] {
    void _leagueSlug;
    const groups = collectStandingGroups(payload).map((group) => ({
        name: group.name,
        rows: group.entries.map((entry: any) => buildStandingRow(readLeagueEntry(entry))),
    }));
    return finishGroups(groups);
}

/** "2026 AFC East Standings" → "AFC East". */
function cleanSummaryGroupHeader(group: any): string | null {
    const explicit = normalizeString(group?.divisionHeader) || normalizeString(group?.conferenceHeader);
    if (explicit) return explicit;
    const header = normalizeString(group?.header);
    if (!header) return null;
    return header.replace(/^\d{4}\s+/, '').replace(/\s+standings$/i, '').trim() || null;
}

/**
 * Las mini-tablas del resumen del partido (`summary.standings.groups[]`): la
 * división de cada equipo. Antes se le pasaba este objeto al lector de la
 * tabla de liga, que no lo entiende, y la ficha quedaba sin tabla.
 */
export function normalizeEspnSummaryStandingsRows(
    summary: Record<string, any> | null | undefined,
): ExternalStandingsRow[] {
    const groups = Array.isArray(summary?.standings?.groups) ? summary.standings.groups : [];
    const built = groups
        .map((group: any) => ({
            name: cleanSummaryGroupHeader(group),
            rows: (Array.isArray(group?.standings?.entries) ? group.standings.entries : [])
                .map((entry: any) => buildStandingRow(readSummaryEntry(entry))),
        }))
        .filter((group: { rows: BuiltRow[] }) => group.rows.length > 0);
    return finishGroups(built);
}

export function enrichStandingsRowsForUi(
    standings: ExternalStandingsRow[],
    leagueSlug: EspnAmericanFootballLeagueSlug,
) {
    return standings.map((row) => ({
        rank: row.position,
        position: row.position,
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
        wins: row.won,
        drawn: row.drawn,
        draws: row.drawn,
        lost: row.lost,
        losses: row.lost,
        points: row.points,
        goal_difference: row.differential ?? ((row.scored ?? 0) - (row.conceded ?? 0)),
        scored: row.scored ?? 0,
        conceded: row.conceded ?? 0,
        win_percentage: row.win_percentage ?? null,
        streak: row.streak ?? null,
        games_behind: row.games_behind ?? null,
        seed: row.seed ?? null,
        note: row.note ?? null,
        ap_rank: row.rank ?? null,
        ...(row.group_name ? { group_name: row.group_name, group: row.group_name } : {}),
        provider: 'espn',
        source: 'espn',
    }));
}

// ── Detalle del partido ─────────────────────────────────────────────────────

const TEAM_STAT_LABELS_ES: Record<string, string> = {
    firstdowns: 'Primeros downs',
    firstdownspassing: 'Primeros downs por pase',
    firstdownsrushing: 'Primeros downs por carrera',
    firstdownspenalty: 'Primeros downs por penalidad',
    thirddowneff: 'Eficiencia en tercer down',
    fourthdowneff: 'Eficiencia en cuarto down',
    totaloffensiveplays: 'Jugadas ofensivas',
    totalyards: 'Yardas totales',
    yardsperplay: 'Yardas por jugada',
    totaldrives: 'Series ofensivas',
    netpassingyards: 'Yardas por pase',
    completionattempts: 'Pases completados / intentos',
    yardsperpass: 'Yardas por intento de pase',
    interceptions: 'Intercepciones lanzadas',
    sacksyardslost: 'Sacks recibidos / yardas',
    rushingyards: 'Yardas por carrera',
    rushingattempts: 'Intentos de carrera',
    yardsperrushattempt: 'Yardas por intento de carrera',
    redzoneattempts: 'Zona roja (anotadas / intentos)',
    totalpenaltiesyards: 'Penalidades / yardas',
    turnovers: 'Pérdidas de balón',
    fumbleslost: 'Fumbles perdidos',
    defensivetouchdowns: 'Touchdowns defensivos',
    possessiontime: 'Tiempo de posesión',
};

/**
 * Las estadísticas de equipo del boxscore, en la forma que dibuja la ficha
 * (`{ label, home, away }`, igual que las del fútbol de ESPN). `interceptions`
 * aparece dos veces en ESPN (lanzadas y recuperadas): se emparejan por
 * posición, no por nombre, para no fundirlas.
 */
export function buildAmericanFootballTeamStats(summary: Record<string, any> | null | undefined) {
    const teams = Array.isArray(summary?.boxscore?.teams) ? summary.boxscore.teams : [];
    if (teams.length < 2) return [];

    const home = teams.find((team: any) => team?.homeAway === 'home') || teams[0];
    const away = teams.find((team: any) => team?.homeAway === 'away') || teams[1];
    const homeStats: any[] = Array.isArray(home?.statistics) ? home.statistics : [];
    const awayStats: any[] = Array.isArray(away?.statistics) ? away.statistics : [];
    const seen = new Map<string, number>();

    return homeStats.map((stat, index) => {
        const key = normalizeKey(stat?.name) || `stat-${index}`;
        const occurrence = (seen.get(key) ?? 0) + 1;
        seen.set(key, occurrence);
        const awayAtIndex = awayStats[index];
        const awayStat = normalizeKey(awayAtIndex?.name) === key
            ? awayAtIndex
            : awayStats.filter((candidate) => normalizeKey(candidate?.name) === key)[occurrence - 1];
        const baseLabel = TEAM_STAT_LABELS_ES[key] || stat?.label || stat?.name || key;
        const label = key === 'interceptions' && occurrence > 1 ? 'Intercepciones (defensa)' : baseLabel;
        const homeValue = stat?.displayValue ?? stat?.value ?? '';
        const awayValue = awayStat?.displayValue ?? awayStat?.value ?? '';
        return {
            type: label,
            label,
            home: String(homeValue),
            away: String(awayValue),
            home_value: homeValue,
            away_value: awayValue,
        };
    });
}

/**
 * El tipo de jugada en el vocabulario del catálogo de eventos del deporte
 * (`eventPresentation.ts` sabe rotular y colorear estos). Se decide por el
 * TIPO que manda ESPN ("Passing Touchdown", "Field Goal Good", "Two-Point
 * Pass", "Safety"), nunca por el texto: un TD cuya conversión de dos puntos
 * falló sigue siendo un TD.
 */
export function toAmericanFootballEventType(play: any): string {
    const text = normalizeKey([play?.type?.text, play?.type?.abbreviation].filter(Boolean).join(' ')) || '';
    if (text.includes('two-point') || text.includes('two point') || /\b2pt\b/.test(text)) return 'two_point_conversion';
    if (text.includes('extra point') || /\bpat\b/.test(text)) return 'extra_point';
    if (text.includes('safety') || /\bsf\b/.test(text)) return 'safety';
    if (text.includes('field goal') || /\bfg\b/.test(text)) return 'field_goal';
    if (text.includes('touchdown') || /\btd\b/.test(text)) return 'touchdown';
    return normalizeKey(play?.type?.abbreviation) || 'score';
}

/** Minuto de partido transcurrido a partir del cuarto y el reloj que QUEDA ("9:11" en el 2Q → 21'). */
export function toElapsedMinute(period: number | null, clock: string | null): number | null {
    if (period === null) return null;
    const match = clock ? /^(\d+):(\d{2})$/.exec(clock) : null;
    const remaining = match ? Number(match[1]) + Number(match[2]) / 60 : 0;
    const quarterLength = 15;
    const before = period <= 4 ? (period - 1) * quarterLength : 4 * quarterLength + (period - 5) * quarterLength;
    const elapsed = before + Math.max(0, quarterLength - remaining);
    return Math.max(1, Math.ceil(elapsed));
}

/** "Eli Raridon 2 Yd pass from Drake Maye (Andy Borregales Kick)" → "Eli Raridon". */
function scorerFromPlayText(text: string | null): string {
    if (!text) return '';
    const match = /^(.+?)\s+\d/.exec(text);
    return (match ? match[1] : text).trim();
}

/**
 * Jugadas de anotación como línea de tiempo: TD, gol de campo, safety,
 * conversión. Lleva la forma que lee "Sucesos recientes" de la ficha (`type`,
 * `time` numérico, `player`, `description`, `team` local/visitante) más el
 * reloj real de ESPN por si alguien lo quiere mostrar tal cual.
 */
export function buildAmericanFootballScoringPlays(
    summary: Record<string, any> | null | undefined,
    homeRawId: string | null,
) {
    const plays = Array.isArray(summary?.scoringPlays) ? summary.scoringPlays : [];
    return plays.map((play: any, index: number) => {
        const teamId = normalizeString(play?.team?.id);
        const period = typeof play?.period?.number === 'number' ? play.period.number : null;
        const clock = normalizeString(play?.clock?.displayValue);
        const periodLabel = period === null ? '' : period > 4 ? 'OT' : `${period}Q`;
        const text = normalizeString(play?.text) || '';
        const elapsed = toElapsedMinute(period, clock);
        const typeText = normalizeString(play?.type?.text) || '';
        const score = typeof play?.homeScore === 'number' && typeof play?.awayScore === 'number'
            ? `${play.awayScore}-${play.homeScore}`
            : '';
        return {
            type: toAmericanFootballEventType(play),
            type_text: typeText,
            abbreviation: normalizeString(play?.type?.abbreviation) || '',
            team: teamId && homeRawId && teamId === homeRawId ? 'home' : 'away',
            team_id: teamId ? toEspnAmericanFootballTeamId(teamId) : null,
            team_name: normalizeString(play?.team?.displayName) || '',
            period,
            clock,
            clock_label: [periodLabel, clock].filter(Boolean).join(' '),
            time: elapsed,
            minute: elapsed,
            player: scorerFromPlayText(text),
            description: [text, score ? `(${score})` : ''].filter(Boolean).join(' '),
            text,
            scorer: text,
            home_score: typeof play?.homeScore === 'number' ? play.homeScore : null,
            away_score: typeof play?.awayScore === 'number' ? play.awayScore : null,
            order: index,
        };
    });
}

/** Las series ofensivas (drives) resumidas: quién, cuántas jugadas, cuántas yardas, cómo terminó. */
export function buildAmericanFootballDrives(summary: Record<string, any> | null | undefined) {
    const previous = Array.isArray(summary?.drives?.previous) ? summary.drives.previous : [];
    const current = isRecord(summary?.drives?.current) ? [summary.drives.current] : [];
    return [...previous, ...current].map((drive: any, index: number) => {
        const teamId = normalizeString(drive?.team?.id);
        return {
            id: normalizeString(drive?.id) || String(index),
            team_id: teamId ? toEspnAmericanFootballTeamId(teamId) : null,
            team_name: normalizeString(drive?.team?.displayName) || normalizeString(drive?.team?.abbreviation) || '',
            description: normalizeString(drive?.description) || '',
            result: normalizeString(drive?.displayResult) || normalizeString(drive?.result) || '',
            short_result: normalizeString(drive?.shortDisplayResult) || '',
            is_score: drive?.isScore === true,
            plays: typeof drive?.offensivePlays === 'number' ? drive.offensivePlays : null,
            yards: typeof drive?.yards === 'number' ? drive.yards : null,
            time_elapsed: normalizeString(drive?.timeElapsed?.displayValue),
            start: {
                period: typeof drive?.start?.period?.number === 'number' ? drive.start.period.number : null,
                clock: normalizeString(drive?.start?.clock?.displayValue),
                text: normalizeString(drive?.start?.text),
            },
            end: {
                period: typeof drive?.end?.period?.number === 'number' ? drive.end.period.number : null,
                clock: normalizeString(drive?.end?.clock?.displayValue),
                text: normalizeString(drive?.end?.text),
            },
        };
    });
}

/** Estadísticas por jugador del boxscore, por equipo y por categoría (pases, carreras…). */
export function buildAmericanFootballPlayerStats(summary: Record<string, any> | null | undefined) {
    const teams = Array.isArray(summary?.boxscore?.players) ? summary.boxscore.players : [];
    return teams.map((team: any) => {
        const teamId = normalizeString(team?.team?.id);
        const categories = Array.isArray(team?.statistics) ? team.statistics : [];
        return {
            team_id: teamId ? toEspnAmericanFootballTeamId(teamId) : null,
            team_name: normalizeString(team?.team?.displayName) || '',
            categories: categories.map((category: any) => ({
                key: normalizeString(category?.name) || '',
                label: normalizeString(category?.text) || normalizeString(category?.name) || '',
                columns: Array.isArray(category?.labels) ? category.labels.map(String) : [],
                players: (Array.isArray(category?.athletes) ? category.athletes : []).map((row: any) => ({
                    id: normalizeString(row?.athlete?.id),
                    name: normalizeString(row?.athlete?.displayName) || normalizeString(row?.athlete?.shortName) || '',
                    jersey: normalizeString(row?.athlete?.jersey) || '',
                    position: normalizeString(row?.athlete?.position?.abbreviation) || '',
                    image_path: normalizeString(row?.athlete?.headshot?.href) || '',
                    values: Array.isArray(row?.stats) ? row.stats.map(String) : [],
                })),
            })),
        };
    });
}

export function getEspnReferee(summary: Record<string, any> | null | undefined): string | null {
    const officials = Array.isArray(summary?.gameInfo?.officials) ? summary.gameInfo.officials : [];
    const referee = officials.find((official: any) => normalizeKey(official?.position?.name) === 'referee') || null;
    return normalizeString(referee?.displayName) || normalizeString(referee?.fullName);
}

export function getEspnAttendance(summary: Record<string, any> | null | undefined): number | null {
    const raw = summary?.gameInfo?.attendance;
    const numeric = Number(raw);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

// ── Plantel ─────────────────────────────────────────────────────────────────

const ROSTER_GROUP_LABELS_ES: Record<string, string> = {
    offense: 'Ataque',
    defense: 'Defensa',
    specialteam: 'Equipos especiales',
    specialteams: 'Equipos especiales',
    injuredreserveorout: 'Lesionados',
    suspended: 'Suspendidos',
    practicesquad: 'Practice squad',
};

/**
 * El plantel viene en grupos (ataque, defensa, equipos especiales, lesionados,
 * suspendidos, practice squad). Se conservan todos, pero cada jugador lleva su
 * grupo y su estado para que la UI no los mezcle con los activos.
 */
export function buildRosterPlayers(payload: Record<string, any> | null | undefined) {
    const athleteGroups = Array.isArray(payload?.athletes) ? payload.athletes : [];
    return athleteGroups.flatMap((group: any) => {
        const groupKey = normalizeKey(group?.position) || 'other';
        const groupLabel = ROSTER_GROUP_LABELS_ES[groupKey] || normalizeString(group?.position) || 'Otros';
        const items = Array.isArray(group?.items) ? group.items : [];
        return items.map((item: any) => ({
            id: normalizeString(item?.id),
            name: item?.displayName || item?.fullName || 'Jugador',
            number: item?.jersey || '',
            jersey_number: item?.jersey || '',
            age: item?.age || '',
            nationality: item?.birthPlace?.country || '',
            position: item?.position?.displayName || item?.position?.name || groupLabel,
            position_name: item?.position?.displayName || item?.position?.name || groupLabel,
            position_abbreviation: item?.position?.abbreviation || '',
            group: groupKey,
            group_label: groupLabel,
            status: normalizeString(item?.status?.name) || '',
            experience_years: typeof item?.experience?.years === 'number' ? item.experience.years : null,
            college: normalizeString(item?.college?.name) || '',
            height: normalizeString(item?.displayHeight) || '',
            weight: normalizeString(item?.displayWeight) || '',
            image_path: item?.headshot?.href || '',
        }));
    });
}

export function getEspnCoachName(payload: Record<string, any> | null | undefined): string | null {
    const coaches = Array.isArray(payload?.coach) ? payload.coach : isRecord(payload?.coach) ? [payload.coach] : [];
    const head = coaches[0];
    if (!head) return null;
    const first = normalizeString(head?.firstName);
    const last = normalizeString(head?.lastName);
    return [first, last].filter(Boolean).join(' ') || normalizeString(head?.displayName);
}
