/**
 * Lectura de la API del match centre de Ultimate Sevens — la liga de seven de
 * franquicias (seis clubes, rama masculina y femenina) que juega por etapas:
 * Madrid, Cardiff, Biarritz y Londres en 2026.
 *
 * El sitio (`www.ultimatesevens.com`) es un WordPress con un plugin propio
 * ("AFZ") que publica una API REST sin credenciales:
 *
 *   /wp-json/afz/v1/fixtures      todos los partidos de la liga (las dos ramas)
 *   /wp-json/afz/v1/players       los jugadores, con el `wpid` que usan los planteles
 *
 * Hay más (`/fixture/{id}`, `/tournaments` con las etapas, `/teams`), pero
 * `/fixtures` ya trae la liga entera en una llamada: 6 partidos y 11 KB el
 * 11/09. Las tablas NO están en la REST: salen de `admin-ajax.php` con un
 * nonce de la página, y el 11/09 decían "No standings available".
 *
 * Las horas vienen SIN huso y son GMT: la página las rotula "@ 16:35 GMT", el
 * contador cuenta hacia "Sep, 12 2026 16:35:00 GMT" y el WordPress guarda
 * `date` igual a `date_gmt`. Leerlas como hora local de la sede (BST en
 * Cardiff) correría todo el día una hora.
 *
 * Este módulo es PURO: entra JSON, sale dato. Sin red, sin caché, sin DOM. Es
 * lo que se prueba con `node --test` (`ultimateSevensParser.test.ts`).
 */

import type { MatchStatus } from '@/types/match';

export const US7_PROVIDER = 'ultimate-sevens';
export const US7_SITE_URL = 'https://www.ultimatesevens.com';
export const US7_API_URL = `${US7_SITE_URL}/wp-json/afz/v1`;
export const US7_LOGO_URL = `${US7_SITE_URL}/wp-content/uploads/2026/04/favicon-1.svg`;

export const US7_MATCH_ID_PREFIX = 'us7-match-';
export const US7_TEAM_ID_PREFIX = 'us7-team-';

export type Us7CompetitionKey = 'm' | 'w';

export type Us7Competition = {
    key: Us7CompetitionKey;
    /** Lo que la API escribe en `category`. */
    category: 'men' | 'women';
    tournamentId: string;
    name: string;
    fullName: string;
    genderLabel: string;
    url: string;
};

/**
 * Una competencia por rama, no una por etapa: la liga es UNA y las etapas son
 * sus fechas. Así Biarritz y Londres entran solas cuando la mesa las cargue,
 * sin tocar código, y la etapa viaja como instancia del partido.
 */
export const US7_COMPETITIONS: Record<Us7CompetitionKey, Us7Competition> = {
    m: {
        key: 'm',
        category: 'men',
        tournamentId: 'us7-m',
        name: 'Ultimate Sevens Masculino',
        fullName: 'Ultimate Sevens — Masculino',
        genderLabel: 'Masculino',
        url: `${US7_SITE_URL}/match-centre/`,
    },
    w: {
        key: 'w',
        category: 'women',
        tournamentId: 'us7-w',
        name: 'Ultimate Sevens Femenino',
        fullName: 'Ultimate Sevens — Femenino',
        genderLabel: 'Femenino',
        url: `${US7_SITE_URL}/match-centre/`,
    },
};

export const US7_COMPETITION_KEYS: Us7CompetitionKey[] = ['m', 'w'];

// --------------------------------------------------------------------------
// Tipos normalizados
// --------------------------------------------------------------------------

export type Us7Side = {
    /** Id del plantel de la rama (`4730` = Foudre Bleue masculino). */
    teamId: string;
    name: string;
    logo: string;
    /** `wpid` de los jugadores del plantel; se resuelven contra `/players`. */
    playerIds: number[];
    score: number | null;
};

export type Us7Fixture = {
    gameId: string;
    key: Us7CompetitionKey;
    /** Instante de inicio en UTC (ISO). Null si la fecha no se pudo leer. */
    startsAtIso: string | null;
    /** Año de la temporada (`"2026 Season"` -> `"2026"`). */
    season: string | null;
    /** La etapa: `competitionId` y `competition` de la API (`2222`, `Cardiff`). */
    stageId: string;
    stageName: string;
    round: number | null;
    home: Us7Side;
    away: Us7Side;
    status: string;
    state: MatchStatus;
    venue: string;
    webUrl: string;
};

export type Us7Player = {
    wpid: number;
    name: string;
    number: string | null;
    position: string;
    /** Retrato del jugador (`mugshot`), o vacío. */
    photo: string;
    /** Código ISO de dos letras del país (`US`), o null. */
    countryCode: string | null;
};

/** Una rama de una franquicia: el plantel masculino o el femenino. */
export type Us7Branch = {
    /** Id del plantel, el mismo que viaja en los partidos (`4730`). */
    teamId: string;
    key: Us7CompetitionKey;
    playerIds: number[];
};

/** Una franquicia de la liga, con sus dos ramas. */
export type Us7Club = {
    id: string;
    name: string;
    logo: string;
    webUrl: string;
    branches: Us7Branch[];
};

// --------------------------------------------------------------------------
// Utilidades
// --------------------------------------------------------------------------

type Json = Record<string, unknown>;

function asRecord(value: unknown): Json | null {
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : null;
}

function asString(value: unknown): string {
    return typeof value === 'string' ? value : (typeof value === 'number' ? String(value) : '');
}

function toInt(value: unknown): number | null {
    if (typeof value === 'number') return Number.isInteger(value) ? value : null;
    const raw = asString(value).trim();
    if (!/^-?\d+$/.test(raw)) return null;
    return Number(raw);
}

/**
 * `2026-09-12T18:00:00` (o `2026-09-12 18:00:00`) en GMT -> ISO en UTC. Si
 * algún día la API empieza a mandar el huso, se respeta el que venga.
 */
export function parseUs7DateTime(raw: string): string | null {
    const trimmed = raw.trim().replace(' ', 'T');
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?/.test(trimmed)) return null;
    const hasZone = /(Z|[+-]\d{2}:?\d{2})$/i.test(trimmed);
    const parsed = new Date(hasZone ? trimmed : `${trimmed}Z`);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function seasonYearOf(seasonName: string): string | null {
    return /\b(\d{4})\b/.exec(seasonName)?.[1] ?? null;
}

function competitionOfCategory(category: string): Us7CompetitionKey | null {
    const token = category.trim().toLowerCase();
    if (token === 'men' || token === 'male' || token === 'm') return 'm';
    if (token === 'women' || token === 'female' || token === 'w') return 'w';
    return null;
}

// --------------------------------------------------------------------------
// Estados
// --------------------------------------------------------------------------

/**
 * Cuánto antes del horario se acepta un partido "en juego". La mesa arranca
 * un par de minutos antes o después; un partido EN VIVO con el inicio a horas
 * de distancia no es un partido, es la mesa probando el sistema.
 */
const EARLY_START_TOLERANCE_MS = 30 * 60 * 1000;
/**
 * Un seven dura 14-20 minutos. Con marcador, un estado que no se reconoce y
 * una hora desde el inicio, el partido terminó.
 */
const SETTLED_AFTER_MS = 60 * 60 * 1000;

/**
 * Traduce el `status` de la API. Solo se VIERON `Fixture` y `Live`: el primer
 * partido se va a cerrar en Cardiff. Para el cierre se reconocen las formas
 * habituales, y un estado desconocido con marcador se decide por el reloj.
 *
 * Antes del horario (menos la tolerancia) todo es "programado" y el marcador
 * no cuenta: el 11/09, un día antes de Cardiff, la API publicaba
 * `Clan Taran 22-22 Sol Feroz` en `Live` — la mesa ensayando la carga.
 */
export function classifyUs7Status(
    status: string,
    hasScore: boolean,
    startsAtIso: string | null,
    nowMs: number,
): MatchStatus {
    const token = status.trim().toLowerCase();

    if (/cancel|abandon/.test(token)) return 'cancelled';
    if (/postpon|delay|suspend/.test(token)) return 'postponed';

    const startsAt = startsAtIso ? Date.parse(startsAtIso) : Number.NaN;
    if (!Number.isNaN(startsAt) && nowMs < startsAt - EARLY_START_TOLERANCE_MS) return 'scheduled';

    if (/result|full.?time|^ft$|final|complete|finish|played|ended/.test(token)) return 'final';
    if (/live|in.?play|half|running|progress|^1st|^2nd/.test(token)) return 'live';
    if (token === 'fixture' || token === 'scheduled' || token === 'upcoming' || token === '') {
        return 'scheduled';
    }

    if (!hasScore) return 'scheduled';
    if (!Number.isNaN(startsAt) && nowMs >= startsAt + SETTLED_AFTER_MS) return 'final';
    return 'live';
}

// --------------------------------------------------------------------------
// Parsers
// --------------------------------------------------------------------------

function parseSide(value: unknown): Us7Side | null {
    const record = asRecord(value);
    if (!record) return null;
    const teamId = asString(record.id).trim();
    const name = asString(record.name).trim();
    if (!teamId && !name) return null;

    const playerIds = Array.isArray(record.teamPlayers)
        ? record.teamPlayers.map(toInt).filter((id): id is number => id !== null)
        : [];

    return {
        teamId,
        name: name || 'Por definir',
        logo: asString(record.logo).trim(),
        playerIds,
        score: toInt(record.score),
    };
}

/**
 * Un partido de `/fixtures` (o `/fixture/{id}`) al modelo propio. Null para lo
 * que no tiene id, rama reconocible o los dos equipos.
 */
export function parseUs7Fixture(item: unknown, nowMs: number): Us7Fixture | null {
    const record = asRecord(item);
    if (!record) return null;

    const gameId = asString(record.gameId).trim();
    if (!/^[A-Za-z0-9_]+$/.test(gameId)) return null;

    const key = competitionOfCategory(asString(record.category));
    if (!key) return null;

    const home = parseSide(record.homeTeam);
    const away = parseSide(record.awayTeam);
    if (!home || !away) return null;

    const startsAtIso = parseUs7DateTime(asString(record.date));
    const status = asString(record.status).trim();
    const hasScore = home.score !== null && away.score !== null;
    const state = classifyUs7Status(status, hasScore, startsAtIso, nowMs);

    // Un marcador solo existe con la pelota en juego. El de un partido
    // programado es un ensayo de la mesa, no un 22-22.
    const played = state === 'live' || state === 'final';

    return {
        gameId,
        key,
        startsAtIso,
        season: seasonYearOf(asString(record.seasonName)),
        stageId: asString(record.competitionId).trim(),
        stageName: asString(record.competition).trim(),
        round: toInt(record.round),
        home: { ...home, score: played ? home.score : null },
        away: { ...away, score: played ? away.score : null },
        status,
        state,
        venue: asString(record.venue).trim(),
        webUrl: asString(record.webUrl).trim(),
    };
}

/**
 * La lista entera de `/fixtures`, ordenada por hora de inicio. Un id repetido
 * queda una sola vez.
 */
export function parseUs7Fixtures(json: unknown, nowMs: number): Us7Fixture[] {
    if (!Array.isArray(json)) return [];
    const seen = new Set<string>();
    const fixtures: Us7Fixture[] = [];
    for (const item of json) {
        const fixture = parseUs7Fixture(item, nowMs);
        if (!fixture || seen.has(fixture.gameId)) continue;
        seen.add(fixture.gameId);
        fixtures.push(fixture);
    }
    return fixtures.sort((left, right) =>
        (left.startsAtIso || '').localeCompare(right.startsAtIso || '') || left.gameId.localeCompare(right.gameId),
    );
}

/**
 * El puesto como se lee al lado del nombre. La liga escribe todos los que el
 * jugador puede ocupar, con el matiz del seven entre paréntesis
 * ("Prop/Hooker (Edge forward), Prop/Hooker (Middle forward)"): en la fila del
 * plantel eso pisa el nombre. Va el primero, en castellano de seven.
 */
export function us7ShortPosition(raw: string): string {
    const first = raw.split(',')[0]?.replace(/\(.*?\)/g, '').trim() ?? '';
    if (!first) return '';
    if (/prop|hooker|forward/i.test(first)) return 'Forward';
    if (/playmaker|scrum|fly|9\/10/i.test(first)) return 'Medio';
    if (/cent(re|er)/i.test(first)) return 'Centro';
    if (/wing/i.test(first)) return 'Wing';
    return first;
}

/**
 * El bloque del plantel en el que va un puesto ya acortado: forwards o tres
 * cuartos. Es la división que se lee en un plantel de rugby; sin puesto
 * publicado, el jugador no se inventa en ninguno de los dos.
 */
export function us7PositionGroup(shortPosition: string): 'forwards' | 'backs' | 'otros' {
    if (shortPosition === 'Forward') return 'forwards';
    if (shortPosition === 'Medio' || shortPosition === 'Centro' || shortPosition === 'Wing') return 'backs';
    return 'otros';
}

/** Los jugadores de `/players`, por `wpid` (la llave de `teamPlayers`). */
export function parseUs7Players(json: unknown): Map<number, Us7Player> {
    const players = new Map<number, Us7Player>();
    if (!Array.isArray(json)) return players;
    for (const item of json) {
        const record = asRecord(item);
        const wpid = toInt(record?.wpid);
        const name = asString(record?.name).trim();
        if (!record || wpid === null || !name) continue;
        const number = asString(record.shirtNumber).trim();
        const country = asString(record.country).trim().toUpperCase();
        players.set(wpid, {
            wpid,
            name,
            number: number || null,
            position: us7ShortPosition(asString(record.position)),
            photo: asString(record.mugshot).trim(),
            countryCode: /^[A-Z]{2}$/.test(country) ? country : null,
        });
    }
    return players;
}

/**
 * El país en castellano, desde el código ISO que publica la liga. La API lo
 * escribe en inglés (`countryName: "United States"`); `Intl` lo da en el
 * idioma de la pantalla sin mantener una tabla a mano.
 */
export function us7CountryName(code: string | null): string {
    if (!code) return '';
    try {
        return new Intl.DisplayNames(['es'], { type: 'region' }).of(code) ?? code;
    } catch {
        return code;
    }
}

/**
 * Las franquicias de `/teams`. La API mezcla en la misma lista los clubes
 * (con `subTeams`) y cada rama suelta (con `parentTeam`); acá cuentan solo los
 * clubes, y las ramas salen de sus `subTeams`.
 */
export function parseUs7Clubs(json: unknown): Us7Club[] {
    if (!Array.isArray(json)) return [];
    const clubs: Us7Club[] = [];
    for (const item of json) {
        const record = asRecord(item);
        if (!record || !Array.isArray(record.subTeams)) continue;
        const name = asString(record.name).trim();
        if (!name) continue;

        const branches: Us7Branch[] = [];
        for (const sub of record.subTeams) {
            const branch = asRecord(sub);
            const teamId = asString(branch?.id).trim();
            const key = competitionOfCategory(asString(branch?.category));
            if (!branch || !teamId || !key) continue;
            branches.push({
                teamId,
                key,
                playerIds: Array.isArray(branch.teamPlayers)
                    ? branch.teamPlayers.map(toInt).filter((id): id is number => id !== null)
                    : [],
            });
        }

        clubs.push({
            id: asString(record.id).trim(),
            name,
            logo: asString(record.logo).trim(),
            webUrl: asString(record.webUrl).trim(),
            // Masculino primero: el mismo orden que las competencias.
            branches: branches.sort((left, right) => US7_COMPETITION_KEYS.indexOf(left.key) - US7_COMPETITION_KEYS.indexOf(right.key)),
        });
    }
    return clubs.sort((left, right) => left.name.localeCompare(right.name));
}

/** El plantel de un lado, en el orden de la camiseta. Los ids sin jugador se saltean. */
export function resolveUs7Roster(playerIds: number[], players: Map<number, Us7Player>): Us7Player[] {
    const byNumber = (player: Us7Player) => {
        const number = Number(player.number);
        return player.number !== null && Number.isFinite(number) ? number : 999;
    };
    return playerIds
        .map((id) => players.get(id))
        .filter((player): player is Us7Player => player !== undefined)
        .sort((left, right) => byNumber(left) - byNumber(right) || left.name.localeCompare(right.name));
}

/**
 * La instancia que se lee al lado del partido: la etapa, y la ronda si la
 * mesa la cargó (`Cardiff · Ronda 1`).
 */
export function us7StageLabel(fixture: Pick<Us7Fixture, 'stageName' | 'round'>): string {
    const stage = fixture.stageName || 'Ultimate Sevens';
    return fixture.round ? `${stage} · Ronda ${fixture.round}` : stage;
}

// --------------------------------------------------------------------------
// Cuadro
// --------------------------------------------------------------------------

/** Un partido en la forma que dibuja `PlayoffBracket`. */
export type Us7BracketMatch = {
    match_id: string;
    home_participant: null;
    away_participant: null;
    home_team: { id: string; name: string; logo: string };
    away_team: { id: string; name: string; logo: string };
    score_home: number | null;
    score_away: number | null;
    winner_id: string | null;
    match_start_iso: string | null;
    status: string;
};

export type Us7BracketRound = {
    round_id: string;
    name: string;
    matches: Us7BracketMatch[];
};

export type Us7Bracket = {
    /** `competitionId` de la etapa (`2222` = Cardiff). */
    stageId: string;
    name: string;
    active: boolean;
    rounds: Us7BracketRound[];
};

/**
 * `PlayoffBracket` imprime el estado tal cual al lado de la fecha: se manda ya
 * en castellano. `finished` es la excepción: el componente lo lee para marcar
 * al ganador y lo rotula "Final" él mismo.
 */
function bracketStatusOf(state: MatchStatus): string {
    if (state === 'final') return 'finished';
    if (state === 'live') return 'En juego';
    if (state === 'postponed') return 'Postergado';
    if (state === 'cancelled') return 'Cancelado';
    return 'Programado';
}

function toBracketMatch(fixture: Us7Fixture): Us7BracketMatch {
    const home = { id: us7TeamIdOf(fixture.home), name: fixture.home.name, logo: fixture.home.logo };
    const away = { id: us7TeamIdOf(fixture.away), name: fixture.away.name, logo: fixture.away.logo };
    const { score: homeScore } = fixture.home;
    const { score: awayScore } = fixture.away;

    // En eliminación directa no hay empate: sin ganador claro, no se marca ninguno.
    let winnerId: string | null = null;
    if (fixture.state === 'final' && homeScore !== null && awayScore !== null && homeScore !== awayScore) {
        winnerId = homeScore > awayScore ? home.id : away.id;
    }

    return {
        match_id: us7MatchIdOf(fixture),
        home_participant: null,
        away_participant: null,
        home_team: home,
        away_team: away,
        score_home: homeScore,
        score_away: awayScore,
        winner_id: winnerId,
        match_start_iso: fixture.startsAtIso,
        status: bracketStatusOf(fixture.state),
    };
}

const byKickoff = (left: Us7Fixture, right: Us7Fixture) =>
    (left.startsAtIso || '').localeCompare(right.startsAtIso || '') || left.gameId.localeCompare(right.gameId);

/**
 * La ronda de cada partido de una etapa. La mesa a veces deja `round` vacío
 * (el ensayo del 11/09 vino así): ese partido va a la última ronda que ya
 * había empezado a su hora, y si es anterior a todas, a la primera.
 */
function roundsOfStage(stageFixtures: Us7Fixture[]): Map<number, Us7Fixture[]> {
    const firstKickoff = new Map<number, string>();
    for (const fixture of stageFixtures) {
        if (fixture.round === null || !fixture.startsAtIso) continue;
        const current = firstKickoff.get(fixture.round);
        if (!current || fixture.startsAtIso < current) firstKickoff.set(fixture.round, fixture.startsAtIso);
    }
    const ordered = [...firstKickoff.entries()].sort((left, right) => left[0] - right[0]);

    const placeOf = (fixture: Us7Fixture): number => {
        if (fixture.round !== null) return fixture.round;
        if (ordered.length === 0) return 1;
        let chosen = ordered[0][0];
        for (const [round, first] of ordered) {
            if (fixture.startsAtIso && first <= fixture.startsAtIso) chosen = round;
        }
        return chosen;
    };

    const rounds = new Map<number, Us7Fixture[]>();
    for (const fixture of stageFixtures) {
        const round = placeOf(fixture);
        rounds.set(round, [...(rounds.get(round) ?? []), fixture]);
    }
    return rounds;
}

/**
 * El cuadro de cada etapa de una rama. La liga juega "straight knockout" y un
 * campeón por etapa, pero NO publica el cuadro entero: carga los cruces a
 * medida que se definen. Acá se dibuja lo publicado, ronda por ronda, sin
 * inventar las que faltan — seis clubes no arman un cuadro de potencia de dos
 * y la liga no dijo cómo sigue después de la primera ronda.
 *
 * Activa: la primera etapa con partidos por jugar; si ya se jugó todo, la última.
 */
export function buildUs7Brackets(fixtures: Us7Fixture[]): Us7Bracket[] {
    const stages = new Map<string, Us7Fixture[]>();
    for (const fixture of fixtures) {
        const key = fixture.stageId || fixture.stageName || 'us7';
        stages.set(key, [...(stages.get(key) ?? []), fixture]);
    }

    const brackets = [...stages.entries()]
        .map(([stageId, stageFixtures]) => {
            const sorted = [...stageFixtures].sort(byKickoff);
            const rounds = [...roundsOfStage(sorted).entries()]
                .sort((left, right) => left[0] - right[0])
                .map(([round, roundFixtures]) => ({
                    round_id: `${stageId}-r${round}`,
                    name: `Ronda ${round}`,
                    matches: [...roundFixtures].sort(byKickoff).map(toBracketMatch),
                }));
            return {
                stageId,
                name: sorted[0]?.stageName || 'Ultimate Sevens',
                firstKickoff: sorted[0]?.startsAtIso || '',
                pending: sorted.some((fixture) => fixture.state !== 'final' && fixture.state !== 'cancelled'),
                rounds,
            };
        })
        .sort((left, right) => left.firstKickoff.localeCompare(right.firstKickoff) || left.stageId.localeCompare(right.stageId));

    const activeIndex = brackets.findIndex((bracket) => bracket.pending);
    const chosen = activeIndex >= 0 ? activeIndex : brackets.length - 1;

    return brackets.map((bracket, index) => ({
        stageId: bracket.stageId,
        name: bracket.name,
        active: index === chosen,
        rounds: bracket.rounds,
    }));
}

// --------------------------------------------------------------------------
// Política de refresco
// --------------------------------------------------------------------------

export const US7_TTL_HOT_SECONDS = 20;
export const US7_TTL_IDLE_SECONDS = 300;

const HOT_BEFORE_MS = 15 * 60 * 1000;
const HOT_AFTER_MS = 60 * 60 * 1000;

/**
 * Cada cuánto releer la lista. Caliente (20 s) con un partido en juego o en la
 * ventana de su horario; tibia (5 min) el resto: fuera de las etapas la liga
 * no se mueve. `nowMs` entra por parámetro para poder probarlo.
 */
export function us7RefreshTtlSeconds(fixtures: Us7Fixture[], nowMs: number): number {
    for (const fixture of fixtures) {
        if (fixture.state === 'live') return US7_TTL_HOT_SECONDS;
        if (!fixture.startsAtIso || fixture.state === 'final') continue;
        const startsAt = Date.parse(fixture.startsAtIso);
        if (!Number.isNaN(startsAt) && nowMs >= startsAt - HOT_BEFORE_MS && nowMs <= startsAt + HOT_AFTER_MS) {
            return US7_TTL_HOT_SECONDS;
        }
    }
    return US7_TTL_IDLE_SECONDS;
}

// --------------------------------------------------------------------------
// Identificadores
// --------------------------------------------------------------------------
//
//   us7-m / us7-w          la liga, por rama
//   us7-match-31176        partido: el `gameId` de la API
//   us7-team-4730          plantel de una rama (Foudre Bleue masculino)

export function us7MatchIdOf(fixture: Pick<Us7Fixture, 'gameId'>): string {
    return `${US7_MATCH_ID_PREFIX}${fixture.gameId}`;
}

export function us7TeamIdOf(side: Pick<Us7Side, 'teamId' | 'name'>): string {
    if (side.teamId) return `${US7_TEAM_ID_PREFIX}${side.teamId}`;
    const slug = side.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    return `${US7_TEAM_ID_PREFIX}${slug || 'tbd'}`;
}

export function parseUs7MatchId(value: unknown): { gameId: string } | null {
    if (typeof value !== 'string') return null;
    const match = /^us7-match-([A-Za-z0-9_]+)$/i.exec(value.trim());
    return match ? { gameId: match[1] } : null;
}

/** El id del plantel dentro de `us7-team-4730`. `null` si no es de la liga. */
export function parseUs7TeamId(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const match = /^us7-team-([A-Za-z0-9_]+)$/i.exec(value.trim());
    return match ? match[1] : null;
}

export function parseUs7TournamentId(value: unknown): Us7CompetitionKey | null {
    if (typeof value !== 'string') return null;
    const match = /^us7-([mw])$/i.exec(value.trim());
    return match ? (match[1].toLowerCase() as Us7CompetitionKey) : null;
}
