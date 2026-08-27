/**
 * Lectura del HTML de Altius RT (el sistema oficial de competencias de la FIH)
 * para el Mundial de Hockey 2026 — Belgium & Netherlands.
 *
 * La API de la FIH (`fih.altiusrt.com/api/v1`) existe pero pide API key: sin
 * credenciales devuelve 401. Lo que sí es público es el mismo sistema que la
 * alimenta, el que usa la mesa para cargar el resultado en vivo, servido como
 * HTML:
 *
 *   /competitions/{id}/matches   fixture + marcador + estado
 *   /competitions/{id}/pools     tablas de grupos
 *
 * Es la misma fuente que fih.hockey, así que el dato llega al mismo tiempo.
 *
 * Este módulo es PURO: entra HTML, sale dato. Sin red, sin caché, sin DOM. La
 * parte que descarga y mapea al modelo de la app vive en `fihHockey.ts`; acá
 * está lo que se puede probar con `node --test` (ver `fihHockeyParser.test.ts`).
 *
 * El parser se guía por los NOMBRES DE COLUMNA (`Match #`, `Scoreline`, `Rank`…),
 * no por clases CSS ni por posiciones fijas, así que aguanta cambios menores de
 * maquetado. Si Altius renombra una columna, se toca acá y los tests avisan
 * primero.
 *
 * Los imports de valor van relativos y con extensión (no `@/…`) porque
 * `node --test` corre sin el resolver de alias de Next. Mismo motivo que en
 * `standingsEngine.ts`.
 */

import type { MatchStatus } from '@/types/match';
import { combineLocalDateTimeToUtcIso } from '../timezone.ts';

export const FIH_BASE_URL = 'https://fih.altiusrt.com';
export const FIH_CDN_URL = 'https://hockey-cdn.altius.live';
export const FIH_LOGO_URL = `${FIH_CDN_URL}/fih/content/associations/1/fih_logo.jpg`;

/** Huso de las sedes (Amstelveen y Amberes comparten CEST). Es solo el fallback:
 *  cada fila trae su propio `data-timezone`, que es el que manda. */
const EVENT_TIMEZONE = 'Europe/Amsterdam';

export const FIH_PROVIDER = 'fih';
export const FIH_MATCH_ID_PREFIX = 'fih-match-';
export const FIH_TOURNAMENT_ID_PREFIX = 'fih-wc-';
export const FIH_TEAM_ID_PREFIX = 'fih-team-';

export type FihCompetitionKey = 'm' | 'w';

export type FihCompetition = {
    key: FihCompetitionKey;
    /** Id de la competencia en Altius RT. */
    altiusId: number;
    /** Id con el que el resto de la app referencia al torneo. */
    tournamentId: string;
    name: string;
    fullName: string;
    genderLabel: string;
    url: string;
    season: string;
};

export const FIH_COMPETITIONS: Record<FihCompetitionKey, FihCompetition> = {
    m: {
        key: 'm',
        altiusId: 1866,
        tournamentId: `${FIH_TOURNAMENT_ID_PREFIX}1866`,
        name: 'Mundial de Hockey Masculino 2026',
        fullName: 'FIH Hockey World Cup Belgium & Netherlands 2026 (M)',
        genderLabel: 'Masculino',
        url: `${FIH_BASE_URL}/competitions/1866`,
        season: '2026',
    },
    w: {
        key: 'w',
        altiusId: 1867,
        tournamentId: `${FIH_TOURNAMENT_ID_PREFIX}1867`,
        name: 'Mundial de Hockey Femenino 2026',
        fullName: 'FIH Hockey World Cup Belgium & Netherlands 2026 (W)',
        genderLabel: 'Femenino',
        url: `${FIH_BASE_URL}/competitions/1867`,
        season: '2026',
    },
};

export const FIH_COMPETITION_KEYS: FihCompetitionKey[] = ['m', 'w'];

/**
 * Selecciones: código de 3 letras -> nombre en castellano y en inglés. El inglés
 * es el que usan las tablas de posiciones (columna `Team`), el código es el que
 * usan las filas de partidos y el que arma la URL de la bandera. Una sola tabla
 * para no tener dos verdades.
 */
const TEAMS: Record<string, { es: string; en: string }> = {
    ARG: { es: 'Argentina', en: 'Argentina' },
    AUS: { es: 'Australia', en: 'Australia' },
    AUT: { es: 'Austria', en: 'Austria' },
    BEL: { es: 'Bélgica', en: 'Belgium' },
    CAN: { es: 'Canadá', en: 'Canada' },
    CHI: { es: 'Chile', en: 'Chile' },
    CHN: { es: 'China', en: 'China' },
    CZE: { es: 'Chequia', en: 'Czech Republic' },
    EGY: { es: 'Egipto', en: 'Egypt' },
    ENG: { es: 'Inglaterra', en: 'England' },
    ESP: { es: 'España', en: 'Spain' },
    FRA: { es: 'Francia', en: 'France' },
    GER: { es: 'Alemania', en: 'Germany' },
    GBR: { es: 'Gran Bretaña', en: 'Great Britain' },
    IND: { es: 'India', en: 'India' },
    IRL: { es: 'Irlanda', en: 'Ireland' },
    ITA: { es: 'Italia', en: 'Italy' },
    JPN: { es: 'Japón', en: 'Japan' },
    KEN: { es: 'Kenia', en: 'Kenya' },
    KOR: { es: 'Corea del Sur', en: 'Korea' },
    MAS: { es: 'Malasia', en: 'Malaysia' },
    NED: { es: 'Países Bajos', en: 'Netherlands' },
    NGR: { es: 'Nigeria', en: 'Nigeria' },
    NZL: { es: 'Nueva Zelanda', en: 'New Zealand' },
    PAK: { es: 'Pakistán', en: 'Pakistan' },
    POL: { es: 'Polonia', en: 'Poland' },
    RSA: { es: 'Sudáfrica', en: 'South Africa' },
    SCO: { es: 'Escocia', en: 'Scotland' },
    UGA: { es: 'Uganda', en: 'Uganda' },
    URU: { es: 'Uruguay', en: 'Uruguay' },
    USA: { es: 'Estados Unidos', en: 'United States' },
    WAL: { es: 'Gales', en: 'Wales' },
    ZIM: { es: 'Zimbabue', en: 'Zimbabwe' },
};

const TEAM_CODE_BY_NAME: Record<string, string> = Object.entries(TEAMS).reduce(
    (acc, [code, names]) => {
        acc[names.en.toLowerCase()] = code;
        acc[names.es.toLowerCase()] = code;
        // El código también es un nombre: FlashScore publica "USA W", no
        // "United States W", y sin esta línea ese partido entra duplicado.
        acc[code.toLowerCase()] = code;
        return acc;
    },
    {} as Record<string, string>,
);

/** Estados que reporta Altius RT. */
const FINISHED_STATUSES = new Set(['official', 'completed', 'finished', 'result', 'unofficial']);
const LIVE_STATUSES = new Set([
    'in progress', 'live', 'playing', 'started',
    '1st half', '2nd half', 'half time', 'ht',
    'q1', 'q2', 'q3', 'q4', 'shoot-out', 'shootout',
]);

// --------------------------------------------------------------------------
// Tipos
// --------------------------------------------------------------------------

export type FihMatchRow = {
    number: number | null;
    /** Instante de inicio en UTC (ISO). Null si la fila no trae fecha legible. */
    startsAtIso: string | null;
    /** Texto crudo de la celda de fecha, tal cual lo publica Altius. */
    dateTimeRaw: string;
    homeCode: string | null;
    awayCode: string | null;
    /** Nombre a mostrar: la selección, o el marcador de posición ("Ganador 47"). */
    homeName: string;
    awayName: string;
    /** Letra del grupo cuando el partido es de la fase de grupos. */
    pool: string | null;
    /** Etiqueta de la instancia ("Pool D", "Semifinal", "3° puesto"). */
    stageName: string;
    homeGoals: number | null;
    awayGoals: number | null;
    shootout: { home: number; away: number } | null;
    scoreline: string;
    status: string;
    state: MatchStatus;
    venue: string;
    /** Id del partido en Altius (el de `/matches/22334`). */
    altiusId: string | null;
    url: string | null;
};

export type FihStandingRow = {
    rank: number | null;
    teamEn: string;
    team: string;
    code: string | null;
    teamUrl: string | null;
    played: number | null;
    wins: number | null;
    draws: number | null;
    losses: number | null;
    goalsFor: number | null;
    goalsAgainst: number | null;
    goalDifference: number | null;
    points: number | null;
};

export type FihPool = {
    name: string;
    note: string;
    rows: FihStandingRow[];
};

// --------------------------------------------------------------------------
// Utilidades de HTML
// --------------------------------------------------------------------------

function decodeEntities(value: string): string {
    return value
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&(?:apos|#0?39);/gi, "'")
        .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function stripTags(html: string): string {
    return decodeEntities(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

/**
 * Corta las tablas contando apertura y cierre. Un `<table>...</table>` no
 * codicioso se rompe con tablas anidadas, y Altius anida (la caja de ayuda vive
 * adentro del layout).
 */
function extractTables(html: string): string[] {
    const tables: string[] = [];
    const tokens = /<table\b[^>]*>|<\/table\s*>/gi;
    let depth = 0;
    let start = -1;
    let token: RegExpExecArray | null;

    while ((token = tokens.exec(html)) !== null) {
        const isClosing = token[0][1] === '/';
        if (!isClosing) {
            if (depth === 0) start = token.index;
            depth += 1;
            continue;
        }
        if (depth === 0) continue;
        depth -= 1;
        if (depth === 0 && start >= 0) {
            tables.push(html.slice(start, token.index + token[0].length));
            start = -1;
        }
    }

    return tables;
}

function extractRows(tableHtml: string): string[] {
    return tableHtml.match(/<tr\b[^>]*>[\s\S]*?<\/tr\s*>/gi) || [];
}

type Cell = { html: string; text: string };

function extractCells(rowHtml: string, tag: 'td' | 'th'): Cell[] {
    const cells: Cell[] = [];
    const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}\\s*>`, 'gi');
    let cell: RegExpExecArray | null;
    while ((cell = re.exec(rowHtml)) !== null) {
        cells.push({ html: cell[1], text: stripTags(cell[1]) });
    }
    return cells;
}

/**
 * Índice de columnas por nombre de encabezado. Devuelve null si la tabla no
 * tiene `<th>` o no contiene la columna obligatoria: así se descartan solas las
 * tablas de layout que Altius mete en la misma página.
 */
function readHeaderIndex(tableHtml: string, requiredHeader: string): Record<string, number> | null {
    for (const row of extractRows(tableHtml)) {
        const headers = extractCells(row, 'th');
        if (headers.length === 0) continue;

        const index: Record<string, number> = {};
        headers.forEach((header, position) => {
            if (header.text) index[header.text] = position;
        });

        return requiredHeader in index ? index : null;
    }
    return null;
}

/** Filas de datos: las que tienen `<td>`. La página de grupos no usa `<tbody>`. */
function extractDataRows(tableHtml: string): Cell[][] {
    return extractRows(tableHtml)
        .map((row) => extractCells(row, 'td'))
        .filter((cells) => cells.length > 0);
}

function cellReader(index: Record<string, number>) {
    return (cells: Cell[], name: string): Cell | null => {
        const position = index[name];
        return position !== undefined && position < cells.length ? cells[position] : null;
    };
}

function toInt(value: string): number | null {
    const normalized = value.trim().replace('+', '');
    if (!/^-?\d+$/.test(normalized)) return null;
    return Number(normalized);
}

function firstHref(html: string): string | null {
    const match = /href\s*=\s*"([^"]+)"/i.exec(html);
    return match ? decodeEntities(match[1]) : null;
}

// --------------------------------------------------------------------------
// Fecha y hora
// --------------------------------------------------------------------------

const MONTHS: Record<string, number> = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
    jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/**
 * Altius publica la hora de la sede en un atributo legible por máquina
 * (`data-datetimelocal__notimechange="2026-08-15 13:00:00"` + `data-timezone`)
 * y también en texto. Manda el atributo: trae el huso de la sede, así que el
 * horario de verano —y una eventual sede en otro huso— salen del dato y no de
 * una constante nuestra.
 */
export function parseFihCellDateTime(cellHtml: string): string | null {
    const local = /data-datetimelocal__notimechange\s*=\s*"([^"]+)"/i.exec(cellHtml);
    const zone = /data-timezone\s*=\s*"([^"]+)"/i.exec(cellHtml);

    if (local) {
        const [datePart, timePart = '00:00:00'] = local[1].trim().split(/\s+/);
        if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
            const iso = combineLocalDateTimeToUtcIso(datePart, timePart, zone?.[1]?.trim() || EVENT_TIMEZONE);
            if (iso) return iso;
        }
    }

    return parseFihTextDateTime(stripTags(cellHtml));
}

/** '15 Aug 2026 13:00' -> ISO en UTC. Fallback si no está el atributo. */
export function parseFihTextDateTime(raw: string): string | null {
    const match = /(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/.exec(raw);
    if (!match) return null;

    const month = MONTHS[match[2].slice(0, 3).toLowerCase()];
    if (!month) return null;

    const date = `${match[3]}-${String(month).padStart(2, '0')}-${match[1].padStart(2, '0')}`;
    const time = `${(match[4] || '00').padStart(2, '0')}:${match[5] || '00'}:00`;
    return combineLocalDateTimeToUtcIso(date, time, EVENT_TIMEZONE);
}

// --------------------------------------------------------------------------
// Equipos e instancias
// --------------------------------------------------------------------------

export function fihTeamFlagUrl(code: string | null): string {
    return code ? `${FIH_CDN_URL}/resources/flags/round/${code.toUpperCase()}.png` : '';
}

export function fihTeamNameFromCode(code: string): string {
    return TEAMS[code]?.es || code;
}

export function fihTeamCodeFromName(name: string): string | null {
    return TEAM_CODE_BY_NAME[name.trim().toLowerCase()] || null;
}

/**
 * Clave de selección independiente del idioma: "Netherlands" y "Países Bajos"
 * son el mismo equipo. La usa el merge con FlashScore para no mostrar dos veces
 * el mismo partido cuando los dos proveedores cubren el Mundial.
 */
export function fihTeamKey(name: string): string {
    const code = fihTeamCodeFromName(name);
    if (code) return code;

    return name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
}

export function fihTeamId(code: string | null, fallbackName: string): string {
    if (code) return `${FIH_TEAM_ID_PREFIX}${code.toUpperCase()}`;
    return `${FIH_TEAM_ID_PREFIX}${fihTeamKey(fallbackName) || 'tbd'}`;
}

/**
 * Traduce los marcadores de posición del cuadro final. Altius escribe
 * "1st Pool F", "Winner 47", "Loser 48" —y alguna vez "4h Pool D", con el typo
 * incluido—, que son los rivales todavía sin definir.
 */
function translatePlaceholder(raw: string): string {
    const pool = /^(\d+)(?:st|nd|rd|th|h)?\s+Pool\s+([A-Z])$/i.exec(raw.trim());
    if (pool) return `${pool[1]}° Pool ${pool[2].toUpperCase()}`;

    const winner = /^Winner\s+(\d+)$/i.exec(raw.trim());
    if (winner) return `Ganador ${winner[1]}`;

    const loser = /^Loser\s+(\d+)$/i.exec(raw.trim());
    if (loser) return `Perdedor ${loser[1]}`;

    return raw.trim();
}

/**
 * La etiqueta entre paréntesis es el grupo (A…H) o la instancia: `SF`,
 * `1/2` (la final), `3/4` (el bronce) y los cruces por puesto (`5/6`, `13/14`…).
 */
function describeStage(token: string | null): { pool: string | null; stageName: string } {
    const raw = (token || '').trim();
    if (!raw) return { pool: null, stageName: '' };

    if (/^[A-Z]$/i.test(raw)) {
        const letter = raw.toUpperCase();
        return { pool: letter, stageName: `Pool ${letter}` };
    }

    const upper = raw.toUpperCase();
    if (upper === 'SF') return { pool: null, stageName: 'Semifinal' };
    if (upper === 'QF') return { pool: null, stageName: 'Cuartos de final' };

    const places = /^(\d+)\s*\/\s*(\d+)$/.exec(raw);
    if (places) {
        return places[1] === '1'
            ? { pool: null, stageName: 'Final' }
            : { pool: null, stageName: `${places[1]}° puesto` };
    }

    return { pool: null, stageName: raw };
}

/**
 * Lo que va en el reloj de un partido en juego. Altius escribe el estado en
 * inglés y el feed lo muestra tal cual al lado del marcador, así que "In
 * Progress" aparecería en crudo sobre una pantalla en castellano.
 */
export function fihLiveLabel(status: string): string {
    const token = status.trim().toLowerCase();
    if (!token) return '';
    if (token === 'in progress' || token === 'live' || token === 'playing' || token === 'started') return 'En juego';
    if (token === 'half time' || token === 'ht') return 'Entretiempo';
    if (token === 'shoot-out' || token === 'shootout') return 'Shoot-out';
    return status.trim();
}

function classifyStatus(status: string, scoreline: string): MatchStatus {
    const token = status.trim().toLowerCase();

    if (FINISHED_STATUSES.has(token)) return 'final';
    if (LIVE_STATUSES.has(token) || token.includes('progress') || token.includes('half') || token.includes('quarter')) {
        return 'live';
    }
    if (token.includes('cancel') || token.includes('abandon')) return 'cancelled';
    if (token.includes('postpon') || token.includes('delay')) return 'postponed';
    if (token === '' || token === 'upcoming' || token === 'scheduled' || token === 'not started') return 'scheduled';

    // Estado desconocido: si ya hay marcador, se está jugando.
    return /\d+\s*-\s*\d+/.test(scoreline) ? 'live' : 'scheduled';
}

// --------------------------------------------------------------------------
// Parsers
// --------------------------------------------------------------------------

// Grupos numerados (1 local, 2 visitante, 3 instancia): el `target` del
// proyecto es anterior a ES2018 y los grupos con nombre no compilan.
const DETAILS_RE = /^\s*(.+?)\s+v\s+(.+?)\s*(?:\(([^)]+)\))?\s*$/;
const SCORE_RE = /(\d+)\s*-\s*(\d+)/;
const SHOOTOUT_RE = /\((\d+)\s*-\s*(\d+)\s*(?:SO|PS)\)/i;

export function parseFihMatchesHtml(html: string): FihMatchRow[] {
    for (const table of extractTables(html)) {
        const index = readHeaderIndex(table, 'Scoreline');
        if (!index) continue;

        const cellAt = cellReader(index);
        const rows: FihMatchRow[] = [];

        for (const cells of extractDataRows(table)) {
            if (cells.length < 5) continue;

            const detailsCell = cellAt(cells, 'Details');
            const parsed = DETAILS_RE.exec(detailsCell?.text || '');
            if (!parsed) continue;

            const homeRaw = parsed[1].trim();
            const awayRaw = parsed[2].trim();
            const homeCode = /^[A-Z]{2,4}$/.test(homeRaw) ? homeRaw : null;
            const awayCode = /^[A-Z]{2,4}$/.test(awayRaw) ? awayRaw : null;
            const { pool, stageName } = describeStage(parsed[3] ?? null);

            const scoreline = cellAt(cells, 'Scoreline')?.text || '';
            const score = SCORE_RE.exec(scoreline);
            const shootout = SHOOTOUT_RE.exec(scoreline);
            const status = cellAt(cells, 'Status')?.text || '';
            const url = detailsCell ? firstHref(detailsCell.html) : null;
            const altiusId = url ? (/\/matches\/(\d+)/.exec(url)?.[1] ?? null) : null;
            const dateCell = cellAt(cells, 'Date/Time');

            rows.push({
                number: toInt(cellAt(cells, 'Match #')?.text || ''),
                startsAtIso: dateCell ? parseFihCellDateTime(dateCell.html) : null,
                dateTimeRaw: dateCell?.text || '',
                homeCode,
                awayCode,
                homeName: homeCode ? fihTeamNameFromCode(homeCode) : translatePlaceholder(homeRaw),
                awayName: awayCode ? fihTeamNameFromCode(awayCode) : translatePlaceholder(awayRaw),
                pool,
                stageName,
                homeGoals: score ? Number(score[1]) : null,
                awayGoals: score ? Number(score[2]) : null,
                shootout: shootout ? { home: Number(shootout[1]), away: Number(shootout[2]) } : null,
                scoreline,
                status,
                state: classifyStatus(status, scoreline),
                venue: cellAt(cells, 'Venue')?.text || '',
                altiusId,
                url,
            });
        }

        return rows;
    }

    return [];
}

// --------------------------------------------------------------------------
// Política de refresco
// --------------------------------------------------------------------------

export const FIH_TTL_HOT_SECONDS = 20;
export const FIH_TTL_IDLE_SECONDS = 120;

/** Desde cuánto antes del inicio se considera "caliente" el fixture. */
const HOT_BEFORE_MS = 15 * 60 * 1000;
/** Y hasta cuándo después: un partido de hockey dura ~1h45 con demoras. */
const HOT_AFTER_MS = 3 * 60 * 60 * 1000;

/**
 * Cada cuánto vale la pena volver a leer el fixture.
 *
 * No alcanza con mirar si hay algo `live`: entre que empieza el partido y que la
 * mesa marca "In Progress" hay un rato, y con el TTL largo la app se enteraría
 * hasta dos minutos tarde de que arrancó. Por eso la ventana caliente abre
 * ANTES del horario de inicio y se cierra cuando ya no puede seguir en juego.
 *
 * `nowMs` entra por parámetro para que esto sea comprobable sin esperar al
 * Mundial.
 */
export function fihRefreshTtlSeconds(rows: FihMatchRow[], nowMs: number): number {
    for (const row of rows) {
        if (row.state === 'live') return FIH_TTL_HOT_SECONDS;
    }

    for (const row of rows) {
        if (!row.startsAtIso || row.state === 'final') continue;
        const startsAt = Date.parse(row.startsAtIso);
        if (Number.isNaN(startsAt)) continue;
        if (nowMs >= startsAt - HOT_BEFORE_MS && nowMs <= startsAt + HOT_AFTER_MS) {
            return FIH_TTL_HOT_SECONDS;
        }
    }

    return FIH_TTL_IDLE_SECONDS;
}

/** El nombre del grupo es el `<h4>` que precede a la tabla. */
function poolNameBefore(html: string, tableStart: number): string {
    const headings = html.slice(0, tableStart).match(/<h[1-6]\b[^>]*>[\s\S]*?<\/h[1-6]\s*>/gi);
    if (!headings || headings.length === 0) return '';
    return stripTags(headings[headings.length - 1]);
}

export function parseFihPoolsHtml(html: string): FihPool[] {
    const pools: FihPool[] = [];

    for (const table of extractTables(html)) {
        const index = readHeaderIndex(table, 'Rank');
        if (!index || !('Team' in index)) continue;

        const cellAt = cellReader(index);
        const rows: FihStandingRow[] = [];

        for (const cells of extractDataRows(table)) {
            if (cells.length < 3) continue;

            const teamCell = cellAt(cells, 'Team');
            const teamEn = teamCell?.text || '';
            if (!teamEn) continue;

            const code = fihTeamCodeFromName(teamEn);
            rows.push({
                rank: toInt(cellAt(cells, 'Rank')?.text || ''),
                teamEn,
                team: code ? fihTeamNameFromCode(code) : teamEn,
                code,
                teamUrl: teamCell ? firstHref(teamCell.html) : null,
                played: toInt(cellAt(cells, 'Played')?.text || ''),
                wins: toInt(cellAt(cells, 'Wins')?.text || ''),
                draws: toInt(cellAt(cells, 'Draws')?.text || ''),
                losses: toInt(cellAt(cells, 'Losses')?.text || ''),
                goalsFor: toInt(cellAt(cells, 'Goals For')?.text || ''),
                goalsAgainst: toInt(cellAt(cells, 'Goals Against')?.text || ''),
                goalDifference: toInt(cellAt(cells, 'Goal Difference')?.text || ''),
                points: toInt(cellAt(cells, 'Points')?.text || ''),
            });
        }

        if (rows.length === 0) continue;

        const caption = /<caption\b[^>]*>([\s\S]*?)<\/caption\s*>/i.exec(table);
        const rawName = poolNameBefore(html, html.indexOf(table));

        pools.push({
            name: /^[A-Z]$/i.test(rawName) ? `Pool ${rawName.toUpperCase()}` : (rawName || 'Grupo'),
            note: caption ? stripTags(caption[1]) : '',
            rows,
        });
    }

    return pools;
}

// --------------------------------------------------------------------------
// Identificadores
// --------------------------------------------------------------------------

export function toFihMatchId(key: FihCompetitionKey, altiusId: string | number): string {
    return `${FIH_MATCH_ID_PREFIX}${key}-${altiusId}`;
}

export function parseFihMatchId(value: unknown): { key: FihCompetitionKey; altiusId: string } | null {
    if (typeof value !== 'string') return null;
    const match = new RegExp(`^${FIH_MATCH_ID_PREFIX}([mw])-(\\d+)$`, 'i').exec(value.trim());
    if (!match) return null;
    return { key: match[1].toLowerCase() as FihCompetitionKey, altiusId: match[2] };
}

export function parseFihTournamentId(value: unknown): FihCompetitionKey | null {
    if (typeof value !== 'string') return null;
    const normalized = value.trim().toLowerCase();
    if (!normalized.startsWith(FIH_TOURNAMENT_ID_PREFIX)) return null;

    const altiusId = Number(normalized.slice(FIH_TOURNAMENT_ID_PREFIX.length));
    return FIH_COMPETITION_KEYS.find((key) => FIH_COMPETITIONS[key].altiusId === altiusId) || null;
}

// --------------------------------------------------------------------------
// Ids de las fichas del Mundial
// --------------------------------------------------------------------------
//
// Una selección y una jugadora del Mundial no viven en la base: existen solo
// en el feed. Para que tengan ficha necesitan un id estable que se pueda
// escribir en una URL y volver a resolver contra el feed. Se cuelgan del id
// del torneo, que ya distingue masculino de femenino:
//
//   fih-wc-1867-ARG        → Argentina, Mundial Femenino
//   fih-wc-1867-ARG-3968   → la jugadora 3968 de esa selección
//
// El viejo `fih-team-ARG` (el que ponen las filas de partidos, ver
// `fihTeamId`) sigue resolviendo: no dice el género, así que la ficha muestra
// las dos competencias en las que juega ese país.

/** `fih-wc-1867-ARG`: la selección de un país en una competencia. */
export function toFihTeamRef(key: FihCompetitionKey, code: string): string {
    return `${FIH_COMPETITIONS[key].tournamentId}-${code.toUpperCase()}`;
}

/** `fih-wc-1867-ARG-3968`: una jugadora de esa selección, por su id en el feed. */
export function toFihPlayerRef(key: FihCompetitionKey, code: string, personId: string): string {
    return `${toFihTeamRef(key, code)}-${personId}`;
}

const TEAM_REF = new RegExp(`^${FIH_TOURNAMENT_ID_PREFIX}(\\d+)-([a-z]{3})$`, 'i');
const PLAYER_REF = new RegExp(`^${FIH_TOURNAMENT_ID_PREFIX}(\\d+)-([a-z]{3})-([a-z0-9_-]{1,64})$`, 'i');
const LEGACY_TEAM_REF = new RegExp(`^${FIH_TEAM_ID_PREFIX}([a-z]{3})$`, 'i');

function keyOfAltiusId(raw: string): FihCompetitionKey | null {
    const altiusId = Number(raw);
    return FIH_COMPETITION_KEYS.find((key) => FIH_COMPETITIONS[key].altiusId === altiusId) || null;
}

/**
 * La selección que nombra un id. `key: null` = el id no dice el género (el
 * viejo `fih-team-ARG`), así que la ficha tiene que mirar las dos.
 */
export function parseFihTeamRef(value: unknown): { key: FihCompetitionKey | null; code: string } | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();

    const legacy = LEGACY_TEAM_REF.exec(trimmed);
    if (legacy) return { key: null, code: legacy[1].toUpperCase() };

    const match = TEAM_REF.exec(trimmed);
    if (!match) return null;
    const key = keyOfAltiusId(match[1]);
    return key ? { key, code: match[2].toUpperCase() } : null;
}

export function parseFihPlayerRef(value: unknown): { key: FihCompetitionKey; code: string; personId: string } | null {
    if (typeof value !== 'string') return null;
    const match = PLAYER_REF.exec(value.trim());
    if (!match) return null;
    const key = keyOfAltiusId(match[1]);
    return key ? { key, code: match[2].toUpperCase(), personId: match[3] } : null;
}

/**
 * El feed escribe "JANKUNAS Julieta": el apellido en mayusculas y adelante.
 * En una ficha o en una nota se lee "Julieta Jankunas". Un nombre que no
 * viene asi queda como esta.
 */
export function fihPlayerDisplayName(raw: string): string {
    const words = raw.trim().split(/\s+/).filter(Boolean);
    const isUpper = (word: string) => word.length > 1
        && word === word.toLocaleUpperCase('es')
        && word !== word.toLocaleLowerCase('es');

    let split = 0;
    while (split < words.length && isUpper(words[split])) split += 1;
    if (split === 0 || split === words.length) return raw.trim();

    const surname = words.slice(0, split).map((word) => word
        .toLocaleLowerCase('es')
        .replace(/(^|[\s'-])(\p{L})/gu, (_match, before: string, letter: string) => `${before}${letter.toLocaleUpperCase('es')}`)
        // Las particulas van en minuscula: "Van Der Berg" se lee "van der Berg".
        .replace(/^(De|Del|Da|Di|Van|Von|La|Le)$/u, (particle) => particle.toLocaleLowerCase('es')));

    return `${words.slice(split).join(' ')} ${surname.join(' ')}`;
}
