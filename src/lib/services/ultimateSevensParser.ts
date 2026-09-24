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
 * Las horas de los partidos vienen SIN huso, y aunque la página las rotule
 * "GMT" son hora de EUROPA CENTRAL para todas las etapas (ver
 * `US7_FIXTURE_TIME_ZONE`, medido con Cardiff en juego). Ojo: el horario de
 * las ETAPAS (`/tournaments`, "KICK OFF 15:00 GMT" en la portada) sí es el de
 * la sede, como confirma la ticketera (Cardiff show 15:00+01:00). Son dos
 * cargas distintas y no se pueden leer con la misma regla.
 *
 * La cronología y las estadísticas de cada partido no están en la REST: salen
 * de su página del match centre (`ultimateSevensMatchCentre.ts`).
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
        // Una URL por rama: la portada agrupa por URL de torneo (es lo único que
        // comparten las etapas de un proveedor) y con la misma URL la rama
        // masculina se metía adentro del bloque "Femenino".
        url: `${US7_SITE_URL}/match-centre/#masculino`,
    },
    w: {
        key: 'w',
        category: 'women',
        tournamentId: 'us7-w',
        name: 'Ultimate Sevens Femenino',
        fullName: 'Ultimate Sevens — Femenino',
        genderLabel: 'Femenino',
        url: `${US7_SITE_URL}/match-centre/#femenino`,
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
    /**
     * La ronda tal cual la escribió la mesa. Es texto libre y llega de las tres
     * formas: vacía, un número (`"1"`) o un rótulo (`"SF"`, `"Final!"`). `round`
     * se queda solo con el número; el rótulo sirve para nombrar la ronda del
     * cuadro, y tirarlo era perder la única etiqueta que publica la liga.
     */
    roundLabel: string | null;
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
 * El huso de las horas de `/fixtures`: Europa central (UTC+2 en septiembre),
 * para TODAS las etapas, no el de la sede.
 *
 * La primera lectura fue "GMT = hora de Londres" y después "hora de la sede",
 * y las dos corrían Cardiff una hora tarde. Medido el 12/09, con la etapa en
 * juego:
 *
 *   - DAZN arrancó la transmisión "at 3.30pm BST" y la noticia del sorteo pone
 *     el primer partido (Clan Taran v Sol Feroz) a las "3.30pm": la API lo
 *     tiene a las 16:35. Es la misma hora, en UTC+2.
 *   - A las 18:29 UTC la final masculina (API 20:12) ya iba 5-19 y la crónica
 *     oficial nombraba al campeón. Leída como Londres, faltaban 43 minutos.
 *   - "La etapa corre 40 minutos adelantada" (lo que se anotó toda la tarde)
 *     era este error: un seven televisado no se adelanta, se atrasa.
 *
 * Las etapas de `/tournaments` (`startDateTime`) sí vienen en hora de la sede
 * —Cardiff 15:00 = show de Fever 15:00+01:00—: son dos cargas distintas. Ese
 * endpoint no se usa acá.
 */
export const US7_FIXTURE_TIME_ZONE = 'Europe/Madrid';

/** Cuánto adelanta el reloj de pared de `timeZone` a UTC en ese instante, en ms. */
function zoneOffsetMs(instantMs: number, timeZone: string): number {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    }).formatToParts(new Date(instantMs));
    const part = (type: string) => Number(parts.find((entry) => entry.type === type)?.value ?? 0);
    const wall = Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'), part('second'));
    return wall - instantMs;
}

/**
 * `2026-09-12T16:35:00` (o `2026-09-12 16:35:00`) como hora de pared de la
 * sede -> ISO en UTC. El huso se recalcula en el instante resultante para no
 * errarle en el día del cambio de horario. Si algún día la API empieza a mandar
 * el huso, se respeta el que venga.
 */
export function parseUs7DateTime(raw: string, timeZone: string = US7_FIXTURE_TIME_ZONE): string | null {
    const trimmed = raw.trim().replace(' ', 'T');
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(trimmed);
    if (!match) return null;

    if (/(Z|[+-]\d{2}:?\d{2})$/i.test(trimmed)) {
        const parsed = new Date(trimmed);
        return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
    }

    const [, year, month, day, hour, minute, second] = match;
    const asUtc = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second ?? 0));
    if (Number.isNaN(asUtc)) return null;
    try {
        const firstGuess = asUtc - zoneOffsetMs(asUtc, timeZone);
        const instant = asUtc - zoneOffsetMs(firstGuess, timeZone);
        return new Date(instant).toISOString();
    } catch {
        // Un huso que el runtime no conoce: mejor la hora sin corregir que ninguna.
        return new Date(asUtc).toISOString();
    }
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
 * Cuánto antes del horario se acepta un partido "en juego". Un partido EN VIVO
 * con el inicio a horas de distancia no es un partido: es la mesa probando el
 * sistema.
 *
 * La tolerancia arrancó en 30 minutos y en Cardiff (12/09) tapó la jornada
 * entera: cada partido en juego parecía 40 minutos adelantado y se mostraba
 * programado y sin marcador. No era la etapa, era el huso mal leído (ver
 * `US7_FIXTURE_TIME_ZONE`); con la hora bien leída la etapa corrió unos
 * minutos ATRASADA. La tolerancia queda ancha igual, porque lo que tiene que
 * filtrar es de OTRO DÍA (el 11/09 la API publicaba `Clan Taran 22-22 Sol
 * Feroz` en `Live` para un partido del 12/09): tres horas lo dejan afuera y no
 * dependen de que el horario publicado se cumpla.
 */
const EARLY_START_TOLERANCE_MS = 3 * 60 * 60 * 1000;
/**
 * Un seven dura 14-20 minutos. Con marcador, un estado que no se reconoce y
 * una hora desde el inicio, el partido terminó.
 */
const SETTLED_AFTER_MS = 60 * 60 * 1000;
/**
 * Un `Live` vencido. La mesa no siempre cierra el partido: la final masculina
 * de Cardiff (31717) siguió `Live 5-19` más de media hora después de que la
 * crónica oficial nombrara al campeón. Diez minutos más golden point y el
 * atraso de la etapa no llegan a hora y media: pasado eso, con marcador, el
 * partido terminó y así se muestra.
 */
const STALE_LIVE_AFTER_MS = 90 * 60 * 1000;

/**
 * Traduce el `status` de la API: `Fixture`, `Live` y `Result` (visto en
 * Cardiff). Para el cierre se reconocen además las formas habituales, un
 * estado desconocido con marcador se decide por el reloj, y un `Live` que la
 * mesa se olvidó de cerrar vence a la hora y media.
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
    if (/live|in.?play|half|running|progress|^1st|^2nd/.test(token)) {
        return hasScore && !Number.isNaN(startsAt) && nowMs >= startsAt + STALE_LIVE_AFTER_MS ? 'final' : 'live';
    }
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

    const stageName = asString(record.competition).trim();
    const startsAtIso = parseUs7DateTime(asString(record.date), US7_FIXTURE_TIME_ZONE);
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
        stageName,
        round: toInt(record.round),
        roundLabel: asString(record.round).trim() || null,
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

/**
 * De dónde sale un lado del cruce: el ganador o el perdedor de un partido de
 * la ronda anterior. `match_id` es `null` para el mejor perdedor que todavía no
 * se sabe de qué partido sale.
 */
export type Us7BracketSource = {
    match_id: string | null;
    outcome: 'winner' | 'loser';
};

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
    /** Con qué partido de la ronda anterior se une cada lado: son las líneas del cuadro. */
    home_source: Us7BracketSource | null;
    away_source: Us7BracketSource | null;
    /** Un cruce del formato que la liga todavía no publicó. */
    placeholder: boolean;
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
        home_source: null,
        away_source: null,
        placeholder: false,
    };
}

const byKickoff = (left: Us7Fixture, right: Us7Fixture) =>
    (left.startsAtIso || '').localeCompare(right.startsAtIso || '') || left.gameId.localeCompare(right.gameId);

/**
 * El hueco que separa dos rondas de una etapa. Medido en Cardiff (12/09): los
 * partidos de una misma ronda salen cada 17 minutos —un seven dura 14— y entre
 * ronda y ronda la liga deja de 48 a 77. Con 35 la jornada masculina se parte
 * en 3 + 2 + 1, que es el cuadro que se jugó.
 */
const US7_ROUND_BREAK_MS = 35 * 60 * 1000;

/**
 * El rótulo de la mesa, solo si es un NOMBRE (`"SF"`, `"Final!"`). Un número no
 * sirve para agrupar: en Cardiff la primera ronda vino con `round` vacío y las
 * semis y la final, las dos, con `"1"`. Agrupar por ese "1" armaba una ronda de
 * tres partidos con la final adentro.
 */
function nameLabelOf(fixture: Us7Fixture): string | null {
    const label = fixture.roundLabel;
    return label !== null && !/^\d+$/.test(label) ? label : null;
}

/** Los rótulos con nombre de una ronda ya armada. */
function labelsOf(round: Us7Fixture[]): string[] {
    return round.map(nameLabelOf).filter((label): label is string => label !== null);
}

/**
 * Las rondas de una etapa, en orden de juego.
 *
 * El corte sale del HORARIO, no del campo `round`: la mesa lo deja vacío, o le
 * pone un número, o le pone un rótulo (`"SF"`, `"Final!"`), y leerlo solo como
 * número mandaba la etapa entera a una "Ronda 1" de seis partidos — el cuadro
 * quedaba en una columna y no avanzaba nunca. El reloj, en cambio, siempre está.
 *
 * Un rótulo con nombre manda cuando existe: dos partidos con el mismo van
 * juntos aunque el horario los separe, y dos con rótulos distintos se parten
 * aunque salgan seguidos.
 */
function roundsOfStage(stageFixtures: Us7Fixture[]): Us7Fixture[][] {
    const rounds: Us7Fixture[][] = [];

    for (const fixture of [...stageFixtures].sort(byKickoff)) {
        const current = rounds[rounds.length - 1];
        if (!current) {
            rounds.push([fixture]);
            continue;
        }

        const labels = labelsOf(current);
        const label = nameLabelOf(fixture);
        let breaks: boolean;
        if (label !== null && labels.length > 0) {
            breaks = !labels.includes(label);
        } else {
            const previous = current[current.length - 1];
            const gap =
                fixture.startsAtIso && previous.startsAtIso
                    ? Date.parse(fixture.startsAtIso) - Date.parse(previous.startsAtIso)
                    : 0;
            breaks = Number.isFinite(gap) && gap > US7_ROUND_BREAK_MS;
        }

        if (breaks) rounds.push([fixture]);
        else current.push(fixture);
    }

    return rounds;
}

/**
 * El rótulo de la liga en castellano. Solo se traducen las abreviaturas que
 * publica; cualquier otra cosa va tal cual, porque inventarle el nombre a una
 * fase que no conocemos es peor que repetir el de la mesa.
 */
const US7_ROUND_NAMES: Record<string, string> = {
    f: 'Final',
    final: 'Final',
    sf: 'Semifinal',
    qf: 'Cuartos de final',
};

/** `"Final!"` -> `Final`, `"SF"` -> `Semifinal`, `"1"` -> `Ronda 1`. */
export function us7RoundName(round: number | null, label: string | null): string | null {
    if (round !== null) return `Ronda ${round}`;
    if (label === null) return null;
    const clean = label.replace(/[!¡.]+$/, '').trim();
    if (!clean) return null;
    return US7_ROUND_NAMES[clean.toLowerCase()] ?? clean;
}

/**
 * Cuántos cruces tiene cada ronda, a partir de la primera: la mitad de la
 * anterior, redondeada para arriba. Si no da par, el lugar que sobra es para el
 * mejor perdedor — el formato oficial de la liga con seis clubes: tres cruces,
 * pasan los tres ganadores y el mejor perdedor, semis y final.
 */
function knockoutSizes(firstRound: number): number[] {
    const sizes = [Math.max(firstRound, 1)];
    while (sizes[sizes.length - 1] > 1) sizes.push(Math.ceil(sizes[sizes.length - 1] / 2));
    return sizes;
}

/**
 * El nombre de una ronda del cuadro. Primero el rótulo de la liga, si todos los
 * partidos de la ronda traen el mismo; si no, la posición contando desde la
 * final (un cruce: final; dos antes de ella: semis; cuatro: cuartos). El resto
 * queda numerado, que es lo único que se puede afirmar.
 */
function roundNameOf(fixtures: Us7Fixture[], index: number, total: number, size: number): string {
    const labels = labelsOf(fixtures);
    if (fixtures.length > 0 && labels.length === fixtures.length && new Set(labels).size === 1) {
        const named = us7RoundName(null, labels[0]);
        if (named) return named;
    }

    const fromEnd = total - 1 - index;
    if (total > 1) {
        if (fromEnd === 0 && size === 1) return 'Final';
        if (fromEnd === 1 && size === 2) return 'Semifinales';
        if (fromEnd === 2 && size === 4) return 'Cuartos de final';
    }
    return `Ronda ${index + 1}`;
}

/** Cómo se lee, en un cruce sin publicar, el lado que viene de la ronda anterior. */
function winnerLabelOf(previousRoundName: string): string {
    if (/^semifinal/i.test(previousRoundName)) return 'Ganador semifinal';
    if (/^cuartos/i.test(previousRoundName)) return 'Ganador cuartos';
    return `Ganador ${previousRoundName.toLowerCase()}`;
}

const US7_BEST_LOSER_LABEL = 'Mejor perdedor';

/** De qué partido anterior viene un club, y si llegó ganando o como mejor perdedor. */
function sourceOf(teamId: string, previous: Us7BracketMatch[]): Us7BracketSource | null {
    if (!teamId) return null;
    const feeder = previous.find(
        (match) => !match.placeholder && (match.home_team.id === teamId || match.away_team.id === teamId),
    );
    if (!feeder) return null;
    const lost = feeder.winner_id !== null && feeder.winner_id !== teamId;
    return { match_id: feeder.match_id, outcome: lost ? 'loser' : 'winner' };
}

function placeholderMatch(matchId: string): Us7BracketMatch {
    const pending = { id: '', name: 'Por definir', logo: '' };
    return {
        match_id: matchId,
        home_participant: null,
        away_participant: null,
        home_team: { ...pending },
        away_team: { ...pending },
        score_home: null,
        score_away: null,
        winner_id: null,
        match_start_iso: null,
        status: 'Por definir',
        home_source: null,
        away_source: null,
        placeholder: true,
    };
}

/**
 * Une una ronda con la anterior y la completa hasta el formato.
 *
 * 1. Lo publicado: cada lado sale del partido anterior donde jugó su club.
 * 2. Lo que la liga todavía no cargó: cruces "Por definir" hasta `expected`.
 * 3. Los lados sin origen toman, en orden, los ganadores que nadie reclamó y,
 *    si el formato deja lugar, el mejor perdedor.
 *
 * La liga siembra las semis por el resultado de la primera ronda (el slug de
 * la semi dice `1group-a-vs-5group-a`), así que un cruce sin publicar no nombra
 * clubes: dice "Ganador ronda 1", que es lo único cierto antes del sorteo.
 */
function linkRound(
    matches: Us7BracketMatch[],
    previous: Us7BracketMatch[],
    expected: number,
    previousRoundName: string,
    idPrefix: string,
): void {
    const claimed = new Set<string>();
    let loserSlots = Math.max(0, expected * 2 - previous.length);

    for (const match of matches) {
        match.home_source = sourceOf(match.home_team.id, previous);
        match.away_source = sourceOf(match.away_team.id, previous);
        for (const source of [match.home_source, match.away_source]) {
            if (source?.outcome === 'winner' && source.match_id) claimed.add(source.match_id);
            else if (source?.outcome === 'loser') loserSlots -= 1;
        }
    }

    while (matches.length < expected) matches.push(placeholderMatch(`${idPrefix}-p${matches.length + 1}`));

    const unclaimed = previous.filter((match) => !claimed.has(match.match_id));
    let cursor = 0;
    for (const match of matches) {
        for (const side of ['home', 'away'] as const) {
            if (match[`${side}_source`]) continue;
            let source: Us7BracketSource | null = null;
            if (cursor < unclaimed.length) {
                source = { match_id: unclaimed[cursor].match_id, outcome: 'winner' };
                cursor += 1;
            } else if (loserSlots > 0) {
                source = { match_id: null, outcome: 'loser' };
                loserSlots -= 1;
            }
            match[`${side}_source`] = source;
            if (match.placeholder && source) {
                const name = source.outcome === 'winner' ? winnerLabelOf(previousRoundName) : US7_BEST_LOSER_LABEL;
                match[`${side}_team`] = { id: '', name, logo: '' };
            }
        }
    }
}

/**
 * Ordena cada ronda para que el árbol no cruce líneas: de la final hacia
 * atrás, los partidos de una ronda van en el orden de los cruces que alimentan.
 * Un partido que no alimenta a nadie (el del mejor perdedor no se dibuja) queda
 * al final, en su orden de juego.
 */
function orderForTree(rounds: Us7BracketMatch[][]): void {
    for (let index = rounds.length - 1; index > 0; index -= 1) {
        const slot = new Map<string, number>();
        rounds[index].forEach((match, position) => {
            [match.home_source, match.away_source].forEach((source, side) => {
                if (source?.outcome !== 'winner' || !source.match_id || slot.has(source.match_id)) return;
                slot.set(source.match_id, position * 2 + side);
            });
        });
        const at = (match: Us7BracketMatch) => slot.get(match.match_id) ?? Number.POSITIVE_INFINITY;
        rounds[index - 1] = [...rounds[index - 1]].sort((left, right) => at(left) - at(right));
    }
}

/**
 * Las rondas de una etapa, unidas y completas. La liga carga los cruces a
 * medida que se definen, pero el FORMATO es público (straight knockout, un
 * campeón por etapa): con la primera ronda publicada ya se sabe cuántos
 * cruces faltan, y el cuadro los muestra por definir en vez de cortarse.
 * Mientras la última ronda tenga más de un partido, falta al menos una.
 */
function stageRounds(stageId: string, stageFixtures: Us7Fixture[]): Us7BracketRound[] {
    const fixtureRounds = roundsOfStage(stageFixtures);
    if (fixtureRounds.length === 0) return [];

    const sizes = knockoutSizes(fixtureRounds[0].length);
    const total = Math.max(sizes.length, fixtureRounds.length);
    const names = Array.from({ length: total }, (_, index) =>
        roundNameOf(fixtureRounds[index] ?? [], index, total, Math.max(fixtureRounds[index]?.length ?? 0, sizes[index] ?? 0)),
    );

    const rounds: Us7BracketMatch[][] = [];
    for (let index = 0; index < total; index += 1) {
        const matches = (fixtureRounds[index] ?? []).map(toBracketMatch);
        if (index > 0) {
            const expected = Math.max(sizes[index] ?? 0, matches.length);
            linkRound(matches, rounds[index - 1], expected, names[index - 1], `${stageId}-r${index + 1}`);
        }
        rounds.push(matches);
    }
    orderForTree(rounds);

    return rounds.map((matches, index) => ({
        round_id: `${stageId}-r${index + 1}`,
        name: names[index],
        matches,
    }));
}

/**
 * El cuadro de cada etapa de una rama, con sus líneas: cada cruce sabe de qué
 * partido de la ronda anterior sale cada lado (`home_source`/`away_source`), y
 * los que la liga todavía no publicó van como `placeholder`.
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
            const rounds = stageRounds(stageId, sorted);
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

export const US7_TTL_HOT_SECONDS = 10;
export const US7_TTL_IDLE_SECONDS = 300;

/**
 * La ventana caliente alrededor del horario publicado. Es ANCHA a propósito:
 * un seven de etapa dura la tarde y el fixture publicado se corre (una etapa
 * se atrasa, y un huso mal leído la corre una hora entera), así que una
 * ventana ajustada al horario deja la lista tibia justo mientras se juega. Con
 * esto la etapa entera
 * queda caliente, que es lo que cuesta poco: un JSON de 17 KB.
 */
const HOT_BEFORE_MS = 90 * 60 * 1000;
const HOT_AFTER_MS = 3 * 60 * 60 * 1000;

/**
 * Cada cuánto releer la lista. Caliente (10 s) con un partido en juego o en la
 * ventana de su horario; tibia (5 min) el resto: fuera de las etapas la liga
 * no se mueve. Un seven dura 14 minutos y un try cambia el marcador cada dos:
 * diez segundos es el techo de atraso que la pantalla puede mostrar.
 * `nowMs` entra por parámetro para poder probarlo.
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
