/**
 * Lectura del visor de resultados de los Juegos Olímpicos de la Juventud
 * Dakar 2026 (Rugby Seven, código de deporte `RU7`).
 *
 * La página pública de olympics.com embebe un iframe del "Web Information
 * System" (`webresult.apps.dakar2026.org`). No hay API JSON: sirve HTML
 * renderizado en el servidor, y los fragmentos que usamos son estos:
 *
 *   /hide/en/Comp/ScheduleEventPartial?sportCode=RU7        el fixture, M y F
 *   /hide/en/Comp/ListPartial?pagetype=AthleteList&rsc=...  los atletas
 *   /hide/en/Comp/ListPartial?pagetype=GroupSummary&rsc=... la tabla de un grupo
 *
 * Todo se identifica con el `rscCode` de la unidad:
 * `RU7WTEAM7-------------GPA-000100--` = deporte, género (M/W), evento,
 * 13 guiones, fase (4 caracteres) y número de unidad (6 dígitos).
 *
 * Este módulo es PURO: entra HTML, sale dato. Sin red, sin caché, sin DOM.
 * Los imports de valor van relativos y con extensión porque `node --test`
 * corre sin el resolver de alias de Next.
 */

import type { MatchStatus } from '../../types/match.ts';

export const DAKAR_PROVIDER = 'dakar';
export const DAKAR_RESULTS_URL = 'https://webresult.apps.dakar2026.org';
export const DAKAR_PUBLIC_URL = 'https://www.olympics.com/en/dakar-2026/schedule-results';
export const DAKAR_LOGO_URL = '/competiciones/dakar-2026.svg';
export const DAKAR_SPORT_CODE = 'RU7';

export const DAKAR_MATCH_ID_PREFIX = 'dakar-match-';
export const DAKAR_TOURNAMENT_ID_PREFIX = 'dakar-ru7-2026-';
export const DAKAR_TEAM_ID_PREFIX = 'dakar-team-';

export type DakarCompetitionKey = 'm' | 'w';

export type DakarCompetition = {
    key: DakarCompetitionKey;
    /** Evento tal como lo nombra el `rscCode`: `RU7MTEAM7`. */
    eventCode: string;
    /** `rsc` del evento entero, sirve para pedir la lista de atletas. */
    eventRsc: string;
    tournamentId: string;
    name: string;
    fullName: string;
    genderLabel: string;
    url: string;
    season: string;
};

export const DAKAR_COMPETITIONS: Record<DakarCompetitionKey, DakarCompetition> = {
    m: {
        key: 'm',
        eventCode: 'RU7MTEAM7',
        eventRsc: 'RU7MTEAM7-------------------------',
        tournamentId: `${DAKAR_TOURNAMENT_ID_PREFIX}m`,
        name: 'JOJ Dakar 2026 · Rugby 7 Masculino',
        fullName: 'Juegos Olímpicos de la Juventud Dakar 2026 — Rugby Seven masculino',
        genderLabel: 'Masculino',
        url: `${DAKAR_PUBLIC_URL}#/en/Comp/DetailedScheduleByEvent?sportCode=${DAKAR_SPORT_CODE}`,
        season: '2026',
    },
    w: {
        key: 'w',
        eventCode: 'RU7WTEAM7',
        eventRsc: 'RU7WTEAM7-------------------------',
        tournamentId: `${DAKAR_TOURNAMENT_ID_PREFIX}w`,
        name: 'JOJ Dakar 2026 · Rugby 7 Femenino',
        fullName: 'Juegos Olímpicos de la Juventud Dakar 2026 — Rugby Seven femenino',
        genderLabel: 'Femenino',
        url: `${DAKAR_PUBLIC_URL}#/en/Comp/DetailedScheduleByEvent?sportCode=${DAKAR_SPORT_CODE}`,
        season: '2026',
    },
};

export const DAKAR_COMPETITION_KEYS: DakarCompetitionKey[] = ['m', 'w'];

/**
 * Selecciones: código de 3 letras -> nombre en castellano. El nombre PELADO
 * del país es el que resuelve la bandera en `teamLogoOverrides.ts`. Si la
 * fuente trae un país que no está acá se usa el nombre en inglés tal cual.
 */
const TEAMS_ES: Record<string, string> = {
    ARG: 'Argentina',
    AUS: 'Australia',
    CAN: 'Canadá',
    CHN: 'China',
    CZE: 'Chequia',
    ESP: 'España',
    FRA: 'Francia',
    GER: 'Alemania',
    JPN: 'Japón',
    KEN: 'Kenia',
    MAD: 'Madagascar',
    RSA: 'Sudáfrica',
    SEN: 'Senegal',
    UGA: 'Uganda',
    USA: 'Estados Unidos',
};

export function dakarTeamName(code: string | null, fallbackEn: string): string {
    if (code && TEAMS_ES[code.toUpperCase()]) return TEAMS_ES[code.toUpperCase()];
    return fallbackEn || code || '';
}

export function dakarTeamId(code: string | null, fallbackName: string): string {
    if (code) return `${DAKAR_TEAM_ID_PREFIX}${code.toUpperCase()}`;
    const slug = fallbackName
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
    return `${DAKAR_TEAM_ID_PREFIX}${slug || 'tbd'}`;
}

/** Bandera SVG que sirve el propio visor, para el país que el cajón local no tenga. */
export function dakarFlagUrl(code: string | null): string {
    return code ? `${DAKAR_RESULTS_URL}/skins/flags/svg_flags/${code.toUpperCase()}.svg` : '';
}

// --------------------------------------------------------------------------
// Estados
// --------------------------------------------------------------------------

/**
 * El visor escribe el estado en inglés ("Scheduled", "Finished"). El estado de
 * un partido EN JUEGO no estaba publicado al escribir esto (el torneo arranca
 * el 1/11): se lee por palabras y, ante un texto desconocido con marcador, se
 * trata como en juego.
 */
export function classifyDakarStatus(status: string, hasScore: boolean): MatchStatus {
    const token = status.trim().toLowerCase();
    if (/(finished|official|unofficial|result|completed|final)/.test(token)) return 'final';
    if (/(postponed|delayed|rescheduled)/.test(token)) return 'postponed';
    if (/(cancel|abandon|walkover)/.test(token)) return 'cancelled';
    if (/(live|running|progress|half|interval|break|interrupt|suspend|overtime|extra)/.test(token)) return 'live';
    if (token === '' || /(schedul|start list|getting ready|unconfirmed|upcoming)/.test(token)) return 'scheduled';
    return hasScore ? 'live' : 'scheduled';
}

export function dakarLiveLabel(status: string): string {
    const token = status.trim().toLowerCase();
    if (/half/.test(token)) return 'Entretiempo';
    if (/interrupt|suspend/.test(token)) return 'Interrumpido';
    return 'En juego';
}

// --------------------------------------------------------------------------
// Códigos y etapas
// --------------------------------------------------------------------------

export type DakarRsc = {
    key: DakarCompetitionKey;
    /** Fase de 4 caracteres (`GPA-`, `SF5-`) tal cual viene. */
    phaseCode: string;
    /** Unidad de 6 dígitos (`000100`). */
    unitCode: string;
};

export function parseDakarRsc(rsc: string): DakarRsc | null {
    const found = /^RU7([MW])TEAM7-{13}([A-Z0-9-]{4})(\d{6})-*$/.exec(rsc.trim());
    if (!found) return null;
    return {
        key: found[1] === 'M' ? 'm' : 'w',
        phaseCode: found[2],
        unitCode: found[3],
    };
}

export function toDakarRsc(key: DakarCompetitionKey, phaseCode: string, unitCode: string): string {
    return `${DAKAR_COMPETITIONS[key].eventCode}-------------${phaseCode}${unitCode}--`;
}

/** Id público del partido: la fase va con `_` donde el código trae `-`. */
export function toDakarMatchId(key: DakarCompetitionKey, phaseCode: string, unitCode: string): string {
    return `${DAKAR_MATCH_ID_PREFIX}${key}-${phaseCode.replace(/-/g, '_')}-${unitCode}`;
}

export function dakarMatchIdOf(unit: Pick<DakarUnit, 'key' | 'phaseCode' | 'unitCode'>): string {
    return toDakarMatchId(unit.key, unit.phaseCode, unit.unitCode);
}

export function parseDakarMatchId(value: unknown): { key: DakarCompetitionKey; phaseCode: string; unitCode: string } | null {
    if (typeof value !== 'string') return null;
    const found = /^dakar-match-([mw])-([A-Z0-9_]{4})-(\d{6})$/i.exec(value.trim());
    if (!found) return null;
    return {
        key: found[1].toLowerCase() as DakarCompetitionKey,
        phaseCode: found[2].toUpperCase().replace(/_/g, '-'),
        unitCode: found[3],
    };
}

export function parseDakarTournamentId(value: unknown): DakarCompetitionKey | null {
    if (typeof value !== 'string') return null;
    const normalized = value.trim().toLowerCase();
    if (normalized === DAKAR_COMPETITIONS.m.tournamentId) return 'm';
    if (normalized === DAKAR_COMPETITIONS.w.tournamentId) return 'w';
    return null;
}

/**
 * Traduce la instancia que publica el visor: el rótulo de la fase ("Pool A",
 * "Placing 5-8", "Finals") y el nombre de la unidad ("Finals Placing 5-6").
 */
export function dakarStageName(phaseLabel: string, unitName: string): { pool: string | null; stageName: string } {
    const phase = phaseLabel.trim();
    const unit = unitName.trim();

    const pool = /^Pool\s+([A-Z])$/i.exec(phase);
    if (pool) {
        const letter = pool[1].toUpperCase();
        return { pool: letter, stageName: `Grupo ${letter}` };
    }

    if (/^semi-?finals?$/i.test(phase)) return { pool: null, stageName: 'Semifinal' };
    if (/^quarter-?finals?$/i.test(phase)) return { pool: null, stageName: 'Cuartos de final' };

    if (/^finals?$/i.test(phase)) {
        const placing = /placing\s+(\d+)\s*-\s*(\d+)/i.exec(unit);
        if (placing) return { pool: null, stageName: `${Number(placing[1])}° puesto` };
        if (/bronze|3rd|third/i.test(unit)) return { pool: null, stageName: 'Tercer puesto' };
        return { pool: null, stageName: 'Final' };
    }

    const placing = /^Placing\s+(\d+)\s*-\s*(\d+)$/i.exec(phase);
    if (placing) {
        const from = Number(placing[1]);
        const to = Number(placing[2]);
        return to - from === 1
            ? { pool: null, stageName: `${from}° puesto` }
            : { pool: null, stageName: `Puestos ${from}-${to}` };
    }

    return { pool: null, stageName: phase || unit };
}

/**
 * Cruces sin equipo todavía: "3rd in Pool A", "Winner Match #15". Se leen en
 * castellano y la unidad queda marcada como `placeholder`.
 */
export function dakarPlaceholderLabel(raw: string): string {
    const text = raw.trim();
    const inPool = /^(\d+)(?:st|nd|rd|th)\s+in\s+Pool\s+([A-Z])$/i.exec(text);
    if (inPool) return `${inPool[1]}.º Grupo ${inPool[2].toUpperCase()}`;
    const winner = /^Winner\s+(?:of\s+)?(?:Match\s+)?#?(\d+)$/i.exec(text);
    if (winner) return `Ganador partido ${winner[1]}`;
    const loser = /^Loser\s+(?:of\s+)?(?:Match\s+)?#?(\d+)$/i.exec(text);
    if (loser) return `Perdedor partido ${loser[1]}`;
    return text || 'Por definir';
}

// --------------------------------------------------------------------------
// Tipos normalizados
// --------------------------------------------------------------------------

export type DakarUnit = {
    rsc: string;
    key: DakarCompetitionKey;
    phaseCode: string;
    unitCode: string;
    /** Instante de inicio en UTC (ISO). Null si no se pudo leer. */
    startsAtIso: string | null;
    homeCode: string | null;
    awayCode: string | null;
    /** Nombre a mostrar: la selección, o el marcador de posición del cruce. */
    homeName: string;
    awayName: string;
    placeholder: boolean;
    pool: string | null;
    stageName: string;
    unitName: string;
    homeScore: number | null;
    awayScore: number | null;
    status: string;
    state: MatchStatus;
    venue: string;
    location: string;
};

export type DakarAthlete = {
    id: string;
    code: string;
    /** "Henar Alvarez Cuervo": nombre de pila + apellidos en minúscula con capital. */
    name: string;
    gender: 'Male' | 'Female' | '';
    /** Fecha de nacimiento ISO (`YYYY-MM-DD`). */
    birthDate: string | null;
};

export type DakarStandingRow = {
    position: number | null;
    code: string | null;
    name: string;
    played: number | null;
    won: number | null;
    drawn: number | null;
    lost: number | null;
    pointsFor: number | null;
    pointsAgainst: number | null;
    diff: number | null;
    points: number | null;
};

export type DakarPool = {
    phaseCode: string;
    key: DakarCompetitionKey;
    name: string;
    rows: DakarStandingRow[];
};

// --------------------------------------------------------------------------
// Utilidades de HTML
// --------------------------------------------------------------------------

const NAMED_ENTITIES: Record<string, string> = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
};

export function decodeHtml(value: string): string {
    return value
        .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
        .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
        .replace(/&([a-z]+);/gi, (whole, name) => NAMED_ENTITIES[name.toLowerCase()] ?? whole);
}

function stripTags(value: string): string {
    return decodeHtml(value.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function firstMatch(source: string, pattern: RegExp): string {
    const found = pattern.exec(source);
    return found ? stripTags(found[1]) : '';
}

function toInt(value: string): number | null {
    const raw = value.trim().replace('+', '');
    return /^-?\d+$/.test(raw) ? Number(raw) : null;
}

// --------------------------------------------------------------------------
// Fixture
// --------------------------------------------------------------------------

type Side = { code: string | null; name: string; score: number | null; placeholder: boolean };

function parseSide(block: string): Side {
    if (/emptyTeam/.test(block)) {
        // Los cruces de medalla traen dos `sport-code` y el primero va vacío.
        const labels = Array.from(block.matchAll(/class="sport-code">([\s\S]*?)<\/span>/g)).map((found) => stripTags(found[1])).filter(Boolean);
        return {
            code: null,
            name: dakarPlaceholderLabel(labels[labels.length - 1] ?? ''),
            score: null,
            placeholder: true,
        };
    }
    const code = /svg_flags\/([A-Z]{3})\.svg/.exec(block)?.[1] ?? null;
    const english = firstMatch(block, /class="sortValue lastName">([\s\S]*?)<\/span>/);
    const score = toInt(firstMatch(block, /class="score">\s*<div>([\s\S]*?)<\/div>/));
    return { code, name: dakarTeamName(code, english), score, placeholder: false };
}

/**
 * El fixture de los dos géneros. Recorre el HTML en orden: cada encabezado
 * de género (`event-name`) y de fase (`SubTitle phase`) fija el contexto de las
 * `scheduleItem` que le siguen.
 */
export function parseDakarSchedule(html: string): DakarUnit[] {
    // El partido en juego lleva `scheduleItem c-live` y los de medalla
    // `scheduleItem medal-match gold|bronze`: el contenedor no es siempre el mismo.
    const marker = /<div class="event-name">([\s\S]*?)<\/div>|SubTitle phase">([\s\S]*?)<\/div>|<div class="scheduleItem(?: [^"]*)?">/g;
    const hits: Array<{ index: number; kind: 'gender' | 'phase' | 'item'; text: string }> = [];
    let found: RegExpExecArray | null;
    while ((found = marker.exec(html)) !== null) {
        if (found[1] !== undefined) hits.push({ index: found.index, kind: 'gender', text: stripTags(found[1]) });
        else if (found[2] !== undefined) hits.push({ index: found.index, kind: 'phase', text: stripTags(found[2]) });
        else hits.push({ index: found.index, kind: 'item', text: '' });
    }

    const units: DakarUnit[] = [];
    let phaseLabel = '';

    hits.forEach((hit, position) => {
        if (hit.kind === 'gender') { phaseLabel = ''; return; }
        if (hit.kind === 'phase') { phaseLabel = hit.text; return; }

        const end = position + 1 < hits.length ? hits[position + 1].index : html.length;
        const item = html.slice(hit.index, end);

        const rsc = /rscCode="([^"]+)"/.exec(item)?.[1] ?? '';
        const parsedRsc = parseDakarRsc(rsc);
        if (!parsedRsc) return;

        const ticks = Number(/data-time-ticks="(\d+)"/.exec(item)?.[1]);
        const startsAt = Number.isFinite(ticks) && ticks > 0 ? new Date(ticks) : null;

        const status = firstMatch(item, /class="textStatus">([\s\S]*?)<\/span>/);
        const unitName = firstMatch(item, /class="competition-name">([\s\S]*?)<\/div>/);

        const leftStart = item.indexOf('scoredevLeft');
        const rightStart = item.indexOf('scoredevRight');
        const left = parseSide(leftStart >= 0 ? item.slice(leftStart, rightStart > leftStart ? rightStart : undefined) : '');
        const right = parseSide(rightStart >= 0 ? item.slice(rightStart) : '');

        const hasScore = left.score !== null || right.score !== null;
        const stage = dakarStageName(phaseLabel, unitName);

        units.push({
            rsc,
            key: parsedRsc.key,
            phaseCode: parsedRsc.phaseCode,
            unitCode: parsedRsc.unitCode,
            startsAtIso: startsAt && !Number.isNaN(startsAt.getTime()) ? startsAt.toISOString() : null,
            homeCode: left.code,
            awayCode: right.code,
            homeName: left.name,
            awayName: right.name,
            placeholder: left.placeholder || right.placeholder,
            pool: stage.pool,
            stageName: stage.stageName,
            unitName,
            homeScore: left.score,
            awayScore: right.score,
            status,
            state: classifyDakarStatus(status, hasScore),
            venue: firstMatch(item, /class="venue">([\s\S]*?)<\/div>/),
            location: firstMatch(item, /class="location">([\s\S]*?)<\/div>/),
        });
    });

    return units.sort((a, b) => (a.startsAtIso || '').localeCompare(b.startsAtIso || '') || a.rsc.localeCompare(b.rsc));
}

// --------------------------------------------------------------------------
// Atletas
// --------------------------------------------------------------------------

function titleCase(token: string): string {
    return token
        .toLowerCase()
        .replace(/(^|[-'’])(\p{L})/gu, (_, prefix: string, letter: string) => `${prefix}${letter.toUpperCase()}`);
}

/** "ALVAREZ CUERVO Henar" -> "Henar Alvarez Cuervo". */
export function dakarAthleteName(raw: string): string {
    const tokens = raw.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return '';
    const isSurname = (token: string) => token.length > 1 && token === token.toUpperCase() && /\p{L}/u.test(token);

    let split = 0;
    while (split < tokens.length && isSurname(tokens[split])) split += 1;
    // Todo en mayúscula o sin apellido marcado: se deja como vino.
    if (split === 0 || split === tokens.length) return tokens.map(titleCase).join(' ');

    const surnames = tokens.slice(0, split).map(titleCase);
    const given = tokens.slice(split);
    return [...given, ...surnames].join(' ');
}

export function parseDakarAthletes(html: string): DakarAthlete[] {
    const athletes: DakarAthlete[] = [];
    const rows = html.match(/<tr class="[^"]*">[\s\S]*?<\/tr>/g) || [];

    for (const row of rows) {
        const code = /<span>([A-Z]{3})<\/span>/.exec(row)?.[1];
        const link = /ParticipantInfo\/([0-9a-f-]{36})"[^>]*><span class="sortValue">([\s\S]*?)<\/span>/i.exec(row);
        if (!code || !link) continue;

        const genderText = firstMatch(row, /class="gender">([\s\S]*?)<\/td>/);
        const gender = genderText === 'Male' ? 'Male' : genderText === 'Female' ? 'Female' : '';

        const ticks = Number(/data-time-ticks="(-?\d+)"/.exec(row)?.[1]);
        const birth = Number.isFinite(ticks) ? new Date(ticks) : null;

        athletes.push({
            id: link[1].toLowerCase(),
            code,
            name: dakarAthleteName(decodeHtml(link[2])),
            gender,
            birthDate: birth && !Number.isNaN(birth.getTime()) ? birth.toISOString().slice(0, 10) : null,
        });
    }

    return athletes;
}

/** Edad cumplida a una fecha dada. */
export function dakarAgeAt(birthDate: string | null, at: Date): number | null {
    if (!birthDate) return null;
    const born = new Date(`${birthDate}T00:00:00Z`);
    if (Number.isNaN(born.getTime())) return null;
    let age = at.getUTCFullYear() - born.getUTCFullYear();
    const hadBirthday = at.getUTCMonth() > born.getUTCMonth()
        || (at.getUTCMonth() === born.getUTCMonth() && at.getUTCDate() >= born.getUTCDate());
    if (!hadBirthday) age -= 1;
    return age >= 0 ? age : null;
}

// --------------------------------------------------------------------------
// Tablas
// --------------------------------------------------------------------------

type ColumnKey = 'rank' | 'played' | 'won' | 'drawn' | 'lost' | 'pointsFor' | 'pointsAgainst' | 'diff' | 'points';

/** Qué columna es cada encabezado: por el texto y por el `title` del `<abbr>`. */
function columnOf(header: string): ColumnKey | null {
    const text = header.trim().toLowerCase();
    if (/^rank$/.test(text)) return 'rank';
    if (/(^gp$|games played|matches played|^mp$|^p$|^played$)/.test(text)) return 'played';
    if (/(^w$|^won$|^wins?$)/.test(text)) return 'won';
    if (/(^d$|^drawn$|^draws?$|^tied$)/.test(text)) return 'drawn';
    if (/(^l$|^lost$|^loss(es)?$)/.test(text)) return 'lost';
    if (/(^pf$|points for|^for$|scored)/.test(text)) return 'pointsFor';
    if (/(^pa$|points against|^against$|conceded)/.test(text)) return 'pointsAgainst';
    if (/(^\+\/-$|^diff|difference)/.test(text)) return 'diff';
    if (/(^pts$|^points$|total points|pool points)/.test(text)) return 'points';
    return null;
}

type HeaderEntry = { text: string; title: string; top: boolean };

/**
 * El encabezado del visor tiene dos filas con `colspan` y `rowspan`
 * ("Matches" abarca MP/W/D/L; "Points" abarca F/A/D/B). Se arma la grilla y se
 * devuelve, por columna, el grupo y la hoja (la celda de más abajo).
 */
function readHeaderColumns(thead: string): Array<{ group: string; text: string; title: string }> {
    const grid: HeaderEntry[][] = [];
    const headRows: string[] = thead.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) ?? [];
    headRows.forEach((row, r) => {
        grid[r] = grid[r] ?? [];
        let c = 0;
        for (const cell of row.match(/<th[\s\S]*?<\/th>/g) ?? []) {
            while (grid[r][c]) c += 1;
            const colspan = Number(/colspan="(\d+)"/.exec(cell)?.[1] ?? 1);
            const rowspan = Number(/rowspan="(\d+)"/.exec(cell)?.[1] ?? 1);
            const entry: HeaderEntry = {
                text: stripTags(cell),
                title: decodeHtml(/<abbr title="([^"]*)"/.exec(cell)?.[1] ?? ''),
                top: /topHeader/.test(cell),
            };
            for (let dr = 0; dr < rowspan; dr += 1) {
                grid[r + dr] = grid[r + dr] ?? [];
                for (let dc = 0; dc < colspan; dc += 1) grid[r + dr][c + dc] = entry;
            }
            c += colspan;
        }
    });

    const width = Math.max(0, ...grid.map((row) => row.length));
    return Array.from({ length: width }, (_, c) => {
        const leaf = [...grid].reverse().map((row) => row[c]).find(Boolean);
        const head = grid[0]?.[c];
        return {
            group: head && head.top && head !== leaf ? head.text : '',
            text: leaf?.text ?? '',
            title: leaf?.title ?? '',
        };
    });
}

/** Qué columna es, mirando el grupo ("Matches", "Points", "Tries") y la hoja. */
function classifyColumn(group: string, text: string, title: string): ColumnKey | 'skip' | null {
    const g = group.toLowerCase();
    const t = text.trim().toLowerCase();
    if (g.startsWith('matches')) {
        if (/played/.test(t)) return 'played';
        if (/won/.test(t)) return 'won';
        if (/draw/.test(t)) return 'drawn';
        if (/lost/.test(t)) return 'lost';
        return 'skip';
    }
    if (g.startsWith('points')) {
        if (/^f$|\bfor\b/.test(t) || /^for$/i.test(title)) return 'pointsFor';
        if (/^a$|against/.test(t) || /^against$/i.test(title)) return 'pointsAgainst';
        return 'skip';
    }
    if (g.startsWith('tries')) return 'skip';
    if (/points difference|\bpd$/.test(t)) return 'diff';
    if (/\bpts$/.test(t)) return 'points';
    return columnOf(text) ?? columnOf(title);
}

/**
 * Lee la(s) tabla(s) de `GroupSummary`. El visor la arma como tabla de
 * posiciones + cruce de resultados; las columnas se reconocen por su
 * encabezado y las que no se reconocen se ignoran. Devuelve las filas de
 * TODAS las tablas del fragmento (antes del primer partido vienen vacías).
 */
export function parseDakarGroupSummary(html: string): DakarStandingRow[][] {
    const tables = html.match(/<table[\s\S]*?<\/table>/g) || [];

    return tables.map((table) => {
        const thead = /<thead>([\s\S]*?)<\/thead>/.exec(table)?.[1] ?? '';
        const columns = readHeaderColumns(thead).map((column) => classifyColumn(column.group, column.text, column.title));

        const body = /<tbody>([\s\S]*?)<\/tbody>/.exec(table)?.[1] ?? '';
        const rows = body.match(/<tr[^>]*rowKey[\s\S]*?<\/tr>/g) || [];

        return rows.map((row): DakarStandingRow => {
            const cells = (row.match(/<td[\s\S]*?<\/td>/g) || []).map(stripTags);
            const value = (key: ColumnKey) => {
                const index = columns.indexOf(key);
                return index >= 0 ? cells[index] ?? '' : '';
            };
            // La celda trae "=1" más el valor ordenable repetido ("=1 1").
            const rankText = value('rank').replace(/^=/, '').split(' ')[0];
            return {
                position: toInt(rankText),
                code: /<span>([A-Z]{3})<\/span>/.exec(row)?.[1] ?? null,
                name: firstMatch(row, /class="sortValue">([\s\S]*?)<\/span>/),
                played: toInt(value('played')),
                won: toInt(value('won')),
                drawn: toInt(value('drawn')),
                lost: toInt(value('lost')),
                pointsFor: toInt(value('pointsFor')),
                pointsAgainst: toInt(value('pointsAgainst')),
                diff: toInt(value('diff')),
                points: toInt(value('points')),
            };
        }).filter((row) => row.code !== null);
    });
}

/**
 * Tabla calculada desde los partidos terminados, para cuando el visor no la
 * publica o no se reconoce. Puntos de pool de World Rugby Sevens: 3 por
 * victoria, 2 por empate, 1 por derrota. Desempata diferencia y puntos a favor.
 */
export function computeDakarPools(units: DakarUnit[]): DakarPool[] {
    const pools = new Map<string, DakarPool & { byCode: Map<string, DakarStandingRow> }>();

    for (const unit of units) {
        if (!unit.pool || unit.placeholder || !unit.homeCode || !unit.awayCode) continue;
        const id = `${unit.key}:${unit.phaseCode}`;
        let pool = pools.get(id);
        if (!pool) {
            pool = { phaseCode: unit.phaseCode, key: unit.key, name: `Grupo ${unit.pool}`, rows: [], byCode: new Map() };
            pools.set(id, pool);
        }
        const target = pool;
        const rowFor = (code: string, name: string) => {
            let row = target.byCode.get(code);
            if (!row) {
                row = { position: null, code, name, played: 0, won: 0, drawn: 0, lost: 0, pointsFor: 0, pointsAgainst: 0, diff: 0, points: 0 };
                target.byCode.set(code, row);
                target.rows.push(row);
            }
            return row;
        };
        const home = rowFor(unit.homeCode, unit.homeName);
        const away = rowFor(unit.awayCode, unit.awayName);

        if (unit.state !== 'final' || unit.homeScore === null || unit.awayScore === null) continue;

        const apply = (row: DakarStandingRow, scored: number, conceded: number) => {
            row.played = (row.played ?? 0) + 1;
            row.pointsFor = (row.pointsFor ?? 0) + scored;
            row.pointsAgainst = (row.pointsAgainst ?? 0) + conceded;
            row.diff = (row.pointsFor ?? 0) - (row.pointsAgainst ?? 0);
            if (scored > conceded) { row.won = (row.won ?? 0) + 1; row.points = (row.points ?? 0) + 3; }
            else if (scored === conceded) { row.drawn = (row.drawn ?? 0) + 1; row.points = (row.points ?? 0) + 2; }
            else { row.lost = (row.lost ?? 0) + 1; row.points = (row.points ?? 0) + 1; }
        };
        apply(home, unit.homeScore, unit.awayScore);
        apply(away, unit.awayScore, unit.homeScore);
    }

    return Array.from(pools.values())
        .map(({ byCode: _byCode, ...pool }) => {
            const rows = [...pool.rows].sort((a, b) =>
                (b.points ?? 0) - (a.points ?? 0)
                || (b.diff ?? 0) - (a.diff ?? 0)
                || (b.pointsFor ?? 0) - (a.pointsFor ?? 0)
                || (a.code || '').localeCompare(b.code || ''));
            rows.forEach((row, index) => { row.position = index + 1; });
            return { ...pool, rows };
        })
        .sort((a, b) => a.key.localeCompare(b.key) || a.phaseCode.localeCompare(b.phaseCode));
}

// --------------------------------------------------------------------------
// Estadísticas por equipo (`TeamStatistics`)
// --------------------------------------------------------------------------

export type DakarStatRow = { label: string; home: string; away: string };

const STAT_LABELS: Array<{ match: RegExp; label: string; alwaysShow: boolean }> = [
    { match: /^points$/i, label: 'Puntos', alwaysShow: true },
    { match: /^tries$/i, label: 'Tries', alwaysShow: true },
    { match: /^penalty tries$/i, label: 'Tries penales', alwaysShow: false },
    { match: /^conversions/i, label: 'Conversiones (hechas / intentos)', alwaysShow: false },
    { match: /^penalty goals/i, label: 'Penales (hechos / intentos)', alwaysShow: false },
    { match: /^drop goals/i, label: 'Drops (hechos / intentos)', alwaysShow: false },
    { match: /^yellow cards$/i, label: 'Tarjetas amarillas', alwaysShow: true },
    { match: /^red cards$/i, label: 'Tarjetas rojas', alwaysShow: true },
];

/** "-" y vacío son cero; "2 / 9" se lee "2/9". */
function statValue(raw: string): string {
    const value = raw.replace(/\s*\/\s*/g, '/').trim();
    return value === '' || value === '-' ? '0' : value;
}

/**
 * Las estadísticas de un partido, en castellano. Una fila donde los dos lados
 * están en cero (penales, drops) no se muestra: es ruido. Puntos, tries y
 * tarjetas sí, aunque sean cero. Un partido que no se jugó no trae números: se
 * devuelve vacío y la pestaña no se ofrece.
 */
export function parseDakarTeamStatistics(html: string): DakarStatRow[] {
    const rows: DakarStatRow[] = [];
    const items = html.matchAll(/<div class="item">\s*<div class="competitor first">([\s\S]*?)<\/div>\s*<div class="description">([\s\S]*?)<\/div>\s*<div class="competitor second">([\s\S]*?)<\/div>/g);

    for (const item of items) {
        const description = stripTags(item[2]);
        const known = STAT_LABELS.find((entry) => entry.match.test(description));
        if (!known) continue;
        const home = statValue(stripTags(item[1]));
        const away = statValue(stripTags(item[3]));
        const bothZero = /^0(\/0)?$/.test(home) && /^0(\/0)?$/.test(away);
        if (bothZero && !known.alwaysShow) continue;
        rows.push({ label: known.label, home, away });
    }

    // Sin un solo punto en juego el partido no empezó: nada que mostrar.
    const points = rows.find((row) => row.label === 'Puntos');
    if (points && points.home === '0' && points.away === '0' && !rows.some((row) => row.label === 'Tries' && (row.home !== '0' || row.away !== '0'))) {
        return [];
    }
    return rows;
}

// --------------------------------------------------------------------------
// Cronología (`PlayByPlay`)
// --------------------------------------------------------------------------

export type DakarEventType =
    | 'try'
    | 'penalty_try'
    | 'conversion'
    | 'penalty_goal'
    | 'drop_goal'
    | 'card_yellow'
    | 'card_red'
    | 'substitution';

export type DakarTimelineEvent = {
    type: DakarEventType;
    team: 'home' | 'away';
    player: string;
    playerId: string | null;
    /** Dorsal de `player`. */
    number: number | null;
    /** En un cambio, `player` es el que SALE y `subPlayer` el que entra. */
    subPlayer?: string;
    subPlayerId?: string | null;
    subNumber?: number | null;
    description: string;
    minute: number;
    time: number;
    minuteNumber: number;
    period: '1T' | '2T';
    order: number;
    points: number;
};

/** El tiempo de un seven dura siete minutos: el reloj de la API reinicia en el segundo. */
const SEVENS_HALF_MINUTES = 7;

function classifyAction(action: string): { type: DakarEventType; points: number; miss: boolean } | null {
    const text = action.trim().toLowerCase();
    if (/^penalty try/.test(text)) return { type: 'penalty_try', points: 7, miss: false };
    if (/^try/.test(text)) return { type: 'try', points: 5, miss: false };
    if (/^conversion/.test(text)) {
        const miss = /miss/.test(text);
        return { type: 'conversion', points: miss ? 0 : 2, miss };
    }
    if (/^penalty goal/.test(text)) {
        const miss = /miss/.test(text);
        return { type: 'penalty_goal', points: miss ? 0 : 3, miss };
    }
    if (/^drop goal/.test(text)) {
        const miss = /miss/.test(text);
        return { type: 'drop_goal', points: miss ? 0 : 3, miss };
    }
    if (/^yellow card/.test(text)) return { type: 'card_yellow', points: 0, miss: false };
    if (/^red card/.test(text)) return { type: 'card_red', points: 0, miss: false };
    if (/^replacement/.test(text)) return { type: 'substitution', points: 0, miss: false };
    return null;
}

function describeEvent(type: DakarEventType, player: string, miss: boolean, incoming: string): string {
    const of = player ? ` de ${player}` : '';
    switch (type) {
        case 'try': return `Try${of}`;
        case 'penalty_try': return 'Try penal';
        case 'conversion': return miss ? `[palos:miss] Conversión${of}` : `Conversión${of}`;
        case 'penalty_goal': return miss ? `[palos:miss] Penal${of}` : `Penal${of}`;
        case 'drop_goal': return miss ? `[palos:miss] Drop${of}` : `Drop${of}`;
        case 'card_yellow': return `Tarjeta amarilla${of}`;
        case 'card_red': return `Tarjeta roja${of}`;
        case 'substitution': return incoming ? `Cambio · Entra: ${incoming}` : 'Cambio';
    }
}

type SideCell = { numbers: number[]; players: Array<{ id: string | null; name: string; role: 'IN' | 'OUT' | null }> };

function readSide(jerseyCell: string, nameCell: string): SideCell {
    const numbers = Array.from(jerseyCell.matchAll(/<div class="number">\s*<span>(\d+)<\/span>/g)).map((found) => Number(found[1]));
    const players = Array.from(nameCell.matchAll(/<span class="athleteLink(?: (IN|OUT))?">\s*<a[^>]*ParticipantInfo\/([0-9a-f-]{36})[^>]*>\s*<span class="sortValue">([\s\S]*?)<\/span>/gi))
        .map((found) => ({
            id: found[2].toLowerCase(),
            name: dakarAthleteName(decodeHtml(found[3])),
            role: (found[1] as 'IN' | 'OUT' | undefined) ?? null,
        }));
    return { numbers, players };
}

/**
 * La cronología de un partido, de la más vieja a la más nueva. La API la sirve
 * al revés (lo último arriba) y en dos grupos, `H1` y `H2`, con el reloj
 * reiniciado en cada tiempo. El minuto que se muestra es el corrido: el 2T
 * arranca en el 8. Un cambio trae `IN` y `OUT` marcados con su dorsal.
 */
export function parseDakarPlayByPlay(html: string): DakarTimelineEvent[] {
    const flat = html.replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/\s+/g, ' ');
    const groups = Array.from(flat.matchAll(/key="H([12])" class="group"/g));
    const collected: Array<Omit<DakarTimelineEvent, 'order'> & { secs: number; seq: number }> = [];
    let seq = 0;

    groups.forEach((group, position) => {
        const period = group[1] === '2' ? '2T' as const : '1T' as const;
        const start = group.index ?? 0;
        const end = position + 1 < groups.length ? (groups[position + 1].index ?? flat.length) : flat.length;
        const chunk = flat.slice(start, end);

        for (const row of chunk.matchAll(/<tr> <td class="pbpJersey">([\s\S]*?)<\/td><td class="pbpName">([\s\S]*?)<\/td><td class="time-result-action">([\s\S]*?)<\/td><td class="pbpJersey">([\s\S]*?)<\/td><td class="pbpName">([\s\S]*?)<\/td> <\/tr>/g)) {
            const action = firstMatch(row[3], /class="action">([\s\S]*?)<\/div>/);
            const kind = classifyAction(action);
            if (!kind) continue;

            const clock = /class="time">\s*(\d+):(\d+)/.exec(row[3]);
            if (!clock) continue;
            const secs = Number(clock[1]) * 60 + Number(clock[2]);

            const home = readSide(row[1], row[2]);
            const away = readSide(row[4], row[5]);
            const team: 'home' | 'away' = home.players.length > 0 ? 'home' : 'away';
            const side = team === 'home' ? home : away;
            if (side.players.length === 0 && kind.type !== 'penalty_try') continue;

            const minute = (period === '2T' ? SEVENS_HALF_MINUTES : 0) + Math.floor(secs / 60) + 1;
            seq += 1;
            const base = { team, minute, time: minute, minuteNumber: minute, period, secs, seq };

            if (kind.type === 'substitution') {
                const entering = side.players.find((player) => player.role === 'IN') ?? side.players[0];
                const leaving = side.players.find((player) => player.role === 'OUT') ?? side.players[1];
                const enteringIndex = side.players.indexOf(entering);
                const leavingIndex = leaving ? side.players.indexOf(leaving) : -1;
                collected.push({
                    ...base,
                    type: 'substitution',
                    player: leaving?.name ?? '',
                    playerId: leaving?.id ?? null,
                    number: leavingIndex >= 0 ? side.numbers[leavingIndex] ?? null : null,
                    subPlayer: entering?.name ?? '',
                    subPlayerId: entering?.id ?? null,
                    subNumber: enteringIndex >= 0 ? side.numbers[enteringIndex] ?? null : null,
                    description: describeEvent('substitution', '', false, entering?.name ?? ''),
                    points: 0,
                });
                continue;
            }

            const player = kind.type === 'penalty_try' ? undefined : side.players[0];
            collected.push({
                ...base,
                type: kind.type,
                player: player?.name ?? '',
                playerId: player?.id ?? null,
                number: player ? side.numbers[0] ?? null : null,
                description: describeEvent(kind.type, player?.name ?? '', kind.miss, ''),
                points: kind.points,
            });
        }
    });

    // La tabla viene con lo último arriba: a igual segundo, el que está más
    // abajo pasó antes, o sea el de mayor `seq` dentro de su tiempo.
    return collected
        .sort((a, b) =>
            (a.period === b.period ? 0 : a.period === '1T' ? -1 : 1)
            || a.secs - b.secs
            || b.seq - a.seq)
        .map(({ secs: _secs, seq: _seq, ...event }, order) => ({ ...event, order }));
}

/** El marcador de cada tiempo, sacado de la cronología. */
export function dakarPeriodScores(events: readonly DakarTimelineEvent[]): Array<{ period: string; label: string; home: number; away: number }> {
    const first = { home: 0, away: 0 };
    const second = { home: 0, away: 0 };
    for (const event of events) {
        if (event.points <= 0) continue;
        (event.period === '1T' ? first : second)[event.team] += event.points;
    }
    const periods = [{ period: '1', label: 'Primer tiempo', ...first }];
    if (events.some((event) => event.period === '2T')) periods.push({ period: '2', label: 'Segundo tiempo', ...second });
    return periods;
}

// --------------------------------------------------------------------------
// Planilla por jugador (`ResultList`)
// --------------------------------------------------------------------------

export type DakarPlayerLine = {
    code: string;
    number: number | null;
    id: string | null;
    name: string;
    points: number;
    tries: number;
    conversions: string;
    yellowCards: number;
    redCards: number;
};

/**
 * Los jugadores de un partido con su dorsal y lo que hicieron. Las filas de
 * equipo (`isTeam`) fijan a qué selección pertenecen las que siguen. Antes del
 * partido no hay planilla: devuelve vacío.
 */
export function parseDakarResultList(html: string): DakarPlayerLine[] {
    const flat = html.replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/\s+/g, ' ');
    const players: DakarPlayerLine[] = [];
    let current = '';

    for (const row of flat.match(/<tr[^>]*rowKey[\s\S]*?<\/tr>/g) || []) {
        const isTeam = /class="[^"]*\bisTeam\b/.test(row);
        const cells = (row.match(/<td[\s\S]*?<\/td>/g) || []);
        if (isTeam) {
            current = /<span>([A-Z]{3})<\/span>/.exec(row)?.[1] ?? '';
            continue;
        }
        if (!current || cells.length < 10) continue;

        const link = /ParticipantInfo\/([0-9a-f-]{36})[^>]*>\s*<span class="sortValue">([\s\S]*?)<\/span>/i.exec(row);
        if (!link) continue;
        const [bib, , , points, tries, conversions, , , yellow, red] = cells.map(stripTags);

        players.push({
            code: current,
            number: toInt(bib),
            id: link[1].toLowerCase(),
            name: dakarAthleteName(decodeHtml(link[2])),
            points: toInt(points) ?? 0,
            tries: toInt(tries) ?? 0,
            conversions: statValue(conversions),
            yellowCards: toInt(yellow ?? '') ?? 0,
            redCards: toInt(red ?? '') ?? 0,
        });
    }

    return players;
}

// --------------------------------------------------------------------------
// Formación (`StartList`)
// --------------------------------------------------------------------------

export type DakarStartEntry = {
    code: string;
    number: number | null;
    id: string | null;
    name: string;
    captain: boolean;
    /** Marcado con `*` en la lista: uno de los siete que arrancan. */
    starter: boolean;
    /** `Forward` o `Back`, como lo rotula el visor (F / B). */
    position: 'Forward' | 'Back' | '';
};

/**
 * La formación de un partido: dorsal, capitán (`(C)`), titular (`*`) y puesto
 * (F / B). En un seven arrancan siete y los otros cinco son suplentes; los
 * dorsales NO dicen cuáles (Argentina arrancó con 1, 3, 4, 6, 8, 9 y 10), por
 * eso se lee la marca y no se infiere. Antes de que los equipos presenten la
 * lista solo vienen las filas de selección: devuelve vacío.
 */
export function parseDakarStartList(html: string): DakarStartEntry[] {
    const flat = html.replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/\s+/g, ' ');
    const entries: DakarStartEntry[] = [];
    let current = '';

    for (const row of flat.match(/<tr[^>]*rowKey[\s\S]*?<\/tr>/g) || []) {
        if (/class="[^"]*\bisTeam\b/.test(row)) {
            current = /<span>([A-Z]{3})<\/span>/.exec(row)?.[1] ?? '';
            continue;
        }
        if (!current) continue;

        const link = /ParticipantInfo\/([0-9a-f-]{36})[^>]*>\s*<span class="sortValue">([\s\S]*?)<\/span>/i.exec(row);
        if (!link) continue;

        const number = toInt(firstMatch(row, /class="number[^"]*">([\s\S]*?)<\/div>/));
        const position = /title="Forward"/.test(row) ? 'Forward' : /title="Back"/.test(row) ? 'Back' : '';

        entries.push({
            code: current,
            number,
            id: link[1].toLowerCase(),
            name: dakarAthleteName(decodeHtml(link[2])),
            captain: /title="Captain"/.test(row),
            starter: /class="starting">\s*\*/.test(row),
            position,
        });
    }

    return entries;
}

// --------------------------------------------------------------------------
// Etiquetas de posición
// --------------------------------------------------------------------------

/**
 * Hacia dónde va cada posición de grupo, según el propio fixture: el 1.º y el
 * 2.º juegan semifinales (1.º A–2.º B, 1.º B–2.º A) y el 3.º y el 4.º juegan
 * los cruces por el 5.º al 8.º puesto. Etiquetas con la misma forma que las
 * asignaciones de la base, sin fase ni grupo, así la banda de color cae en el
 * mismo puesto de los dos grupos.
 */
const DAKAR_PLACEMENT_LABELS = [
    { position: 1, name: 'A semifinales', color: '#16a34a' },
    { position: 2, name: 'A semifinales', color: '#16a34a' },
    { position: 3, name: 'Por el 5.º al 8.º puesto', color: '#d97706' },
    { position: 4, name: 'Por el 5.º al 8.º puesto', color: '#d97706' },
] as const;

export function dakarStandingsTeamLabels(key: DakarCompetitionKey) {
    const tournamentId = DAKAR_COMPETITIONS[key].tournamentId;
    return DAKAR_PLACEMENT_LABELS.map((label) => ({
        id: `${tournamentId}:placement-${label.position}`,
        label_id: `${tournamentId}:placement-${label.position}`,
        club_id: null,
        position: label.position,
        tournament_id: tournamentId,
        phase_id: null,
        group_id: null,
        created_at: null,
        label: {
            id: `${tournamentId}:placement-${label.position}`,
            name: label.name,
            color: label.color,
            scope: 'standings',
        },
    }));
}

// --------------------------------------------------------------------------
// Caché adaptativa
// --------------------------------------------------------------------------

export const DAKAR_TTL_HOT_SECONDS = 20;
export const DAKAR_TTL_IDLE_SECONDS = 120;

/**
 * 20 s mientras hay un partido en juego o por empezar/terminar en la ventana
 * (-20 min, +3 h); 120 s el resto del tiempo.
 */
export function dakarRefreshTtlSeconds(units: DakarUnit[], nowMs: number): number {
    const hot = units.some((unit) => {
        if (unit.state === 'live') return true;
        if (!unit.startsAtIso) return false;
        const startsAt = new Date(unit.startsAtIso).getTime();
        if (Number.isNaN(startsAt)) return false;
        return unit.state === 'scheduled' && startsAt - nowMs < 20 * 60 * 1000 && nowMs - startsAt < 3 * 60 * 60 * 1000;
    });
    return hot ? DAKAR_TTL_HOT_SECONDS : DAKAR_TTL_IDLE_SECONDS;
}
