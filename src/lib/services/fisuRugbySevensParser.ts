/**
 * Lectura de la API de resultados de la FISU (Bornan Web Results) para el
 * Mundial Universitario de Rugby Seven 2026 — Stellenbosch.
 *
 * El sitio público (`championships-results.fisu.net`) es una SPA de Vue que
 * pega a `back.fisuchampionships.bornan.sport`. La API no está documentada
 * pero es JSON puro y sin credenciales:
 *
 *   /s/{champ}/{lang}/{disc}/schedule/days          los días con partidos
 *   /s/{champ}/{lang}/{disc}/schedule/daily/{date}  las unidades de un día
 *   /s/{champ}/{lang}/{disc}/groups/{phase}         la tabla de un grupo
 *   /s/{champ}/{lang}/{disc}/results/{unit}         la planilla de un partido
 *
 * La única trampa es el envoltorio: la respuesta viene comprimida con zlib y
 * después servida como TEXTO (`text/plain`, con los bytes >0x7F codificados en
 * UTF-8). Descomprimirla es tarea del servicio (`fisuRugbySevens.ts`); acá
 * entra el JSON ya abierto.
 *
 * Este módulo es PURO: entra JSON, sale dato. Sin red, sin caché, sin DOM. Es
 * lo que se puede probar con `node --test` (`fisuRugbySevensParser.test.ts`).
 * Los imports de valor van relativos y con extensión (no `@/…`) porque
 * `node --test` corre sin el resolver de alias de Next.
 */

import type { MatchStatus } from '@/types/match';

export const FISU_PROVIDER = 'fisu';
export const FISU_RESULTS_URL = 'https://championships-results.fisu.net';
export const FISU_API_URL = 'https://back.fisuchampionships.bornan.sport';
export const FISU_LOGO_URL = `${FISU_RESULTS_URL}/favicon.png`;

/** Campeonato, idioma y disciplina con los que se arma cada ruta de la API. */
export const FISU_CHAMP = 'FCH2026';
export const FISU_LANG = 'en';
export const FISU_DISC = 'RU7';

export const FISU_MATCH_ID_PREFIX = 'fisu-match-';
export const FISU_TOURNAMENT_ID_PREFIX = 'fisu-ru7-2026-';
export const FISU_TEAM_ID_PREFIX = 'fisu-team-';

export type FisuCompetitionKey = 'm' | 'w';

export type FisuCompetition = {
    key: FisuCompetitionKey;
    /** `EvKey` con el que la API nombra al evento (`M.TEAM7-------------`). */
    eventKey: string;
    /** Id con el que el resto de la app referencia al torneo. */
    tournamentId: string;
    name: string;
    fullName: string;
    genderLabel: string;
    url: string;
    season: string;
};

export const FISU_COMPETITIONS: Record<FisuCompetitionKey, FisuCompetition> = {
    m: {
        key: 'm',
        eventKey: 'M.TEAM7-------------',
        tournamentId: `${FISU_TOURNAMENT_ID_PREFIX}m`,
        name: 'Mundial Universitario de Seven Masculino 2026',
        fullName: 'FISU World University Championship Rugby Sevens 2026 — Stellenbosch (M)',
        genderLabel: 'Masculino',
        url: `${FISU_RESULTS_URL}/#/discipline/${FISU_DISC}/schedule/by-event/M.TEAM7-------------`,
        season: '2026',
    },
    w: {
        key: 'w',
        eventKey: 'W.TEAM7-------------',
        tournamentId: `${FISU_TOURNAMENT_ID_PREFIX}w`,
        name: 'Mundial Universitario de Seven Femenino 2026',
        fullName: 'FISU World University Championship Rugby Sevens 2026 — Stellenbosch (W)',
        genderLabel: 'Femenino',
        url: `${FISU_RESULTS_URL}/#/discipline/${FISU_DISC}/schedule/by-event/W.TEAM7-------------`,
        season: '2026',
    },
};

export const FISU_COMPETITION_KEYS: FisuCompetitionKey[] = ['m', 'w'];

/**
 * Selecciones: código de 3 letras -> nombre en castellano y en inglés. El
 * inglés es el que publica la API (`Name`, `OrgDesc`); el castellano es el que
 * se muestra. El nombre PELADO del país es además el que resuelve la bandera
 * en `teamLogoOverrides.ts`, así que las dos formas tienen que estar ahí.
 */
const TEAMS: Record<string, { es: string; en: string }> = {
    ARG: { es: 'Argentina', en: 'Argentina' },
    AUS: { es: 'Australia', en: 'Australia' },
    BOT: { es: 'Botsuana', en: 'Botswana' },
    CAN: { es: 'Canadá', en: 'Canada' },
    CHI: { es: 'Chile', en: 'Chile' },
    FRA: { es: 'Francia', en: 'France' },
    IRL: { es: 'Irlanda', en: 'Ireland' },
    JPN: { es: 'Japón', en: 'Japan' },
    MEX: { es: 'México', en: 'Mexico' },
    NOR: { es: 'Noruega', en: 'Norway' },
    RSA: { es: 'Sudáfrica', en: 'South Africa' },
    UGA: { es: 'Uganda', en: 'Uganda' },
    USA: { es: 'Estados Unidos', en: 'United States' },
    ZIM: { es: 'Zimbabue', en: 'Zimbabwe' },
};

export function fisuTeamNameFromCode(code: string | null, fallback = ''): string {
    if (!code) return fallback;
    return TEAMS[code.toUpperCase()]?.es || fallback || code;
}

export function fisuTeamId(code: string | null, fallbackName: string): string {
    if (code) return `${FISU_TEAM_ID_PREFIX}${code.toUpperCase()}`;
    const slug = fallbackName
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
    return `${FISU_TEAM_ID_PREFIX}${slug || 'tbd'}`;
}

// --------------------------------------------------------------------------
// Estados
// --------------------------------------------------------------------------

/** Vocabulario de estados de Bornan, tal cual aparece en el bundle del sitio. */
const SCHEDULED_STATUSES = new Set(['START_LIST', 'SCHEDULED', 'GETTING_READY', 'UNCONFIRMED']);
const LIVE_STATUSES = new Set(['RUNNING', 'LIVE', 'INTERMEDIATE', 'INTERRUPTED']);
const FINISHED_STATUSES = new Set(['FINISHED', 'UNOFFICIAL', 'OFFICIAL', 'PROTESTED']);
const POSTPONED_STATUSES = new Set(['POSTPONED', 'RESCHEDULED', 'DELAYED']);

export function classifyFisuStatus(status: string, hasScore: boolean): MatchStatus {
    const token = status.trim().toUpperCase();
    if (FINISHED_STATUSES.has(token)) return 'final';
    if (LIVE_STATUSES.has(token)) return 'live';
    if (POSTPONED_STATUSES.has(token)) return 'postponed';
    if (token === 'CANCELLED' || token === 'CANCELED') return 'cancelled';
    if (SCHEDULED_STATUSES.has(token) || token === '') return 'scheduled';
    // Estado desconocido: si ya hay marcador, se está jugando.
    return hasScore ? 'live' : 'scheduled';
}

/**
 * Lo que va en el reloj de un partido en juego. La API escribe el estado en
 * inglés y en mayúsculas; al lado del marcador iría "RUNNING" en crudo.
 */
export function fisuLiveLabel(status: string, currentPeriod: number | null): string {
    const token = status.trim().toUpperCase();
    if (token === 'INTERMEDIATE') return 'Entretiempo';
    if (token === 'INTERRUPTED') return 'Interrumpido';
    if (currentPeriod === 1) return '1T';
    if (currentPeriod === 2) return '2T';
    return 'En juego';
}

// --------------------------------------------------------------------------
// Etapas
// --------------------------------------------------------------------------

/**
 * Traduce la instancia que publica la API (`PhaseDescA` + `UnitDescA`).
 * "Finals" agrupa la final y el bronce: los distingue el nombre de la unidad.
 */
export function fisuStageName(phaseDescA: string, unitDescA: string): { pool: string | null; stageName: string } {
    const phase = phaseDescA.trim();
    const unit = unitDescA.trim();

    const pool = /^Pool\s+([A-Z])$/i.exec(phase);
    if (pool) {
        const letter = pool[1].toUpperCase();
        return { pool: letter, stageName: `Grupo ${letter}` };
    }

    if (/^finals?$/i.test(phase)) {
        if (/bronze/i.test(unit)) return { pool: null, stageName: 'Tercer puesto' };
        if (/gold/i.test(unit) || unit === '') return { pool: null, stageName: 'Final' };
        return { pool: null, stageName: unit };
    }
    if (/^semi-?finals?$/i.test(phase)) return { pool: null, stageName: 'Semifinal' };
    if (/^quarter-?finals?$/i.test(phase)) return { pool: null, stageName: 'Cuartos de final' };

    // "Placing 5th-8th" (cruce) y "Placing 5th-6th" (definición de puesto).
    const placing = /^Placing\s+(\d+)(?:st|nd|rd|th)?-(\d+)(?:st|nd|rd|th)?$/i.exec(phase);
    if (placing) {
        const from = Number(placing[1]);
        const to = Number(placing[2]);
        return to - from === 1
            ? { pool: null, stageName: `${from}° puesto` }
            : { pool: null, stageName: `Puestos ${from}-${to}` };
    }

    return { pool: null, stageName: phase || unit };
}

/** "1st Half" / "2nd Half" -> como se leen al lado del marcador. */
export function fisuPeriodName(raw: string): string {
    const trimmed = raw.trim();
    if (/^1st\s+half$/i.test(trimmed) || trimmed.toUpperCase() === 'P1') return 'Primer tiempo';
    if (/^2nd\s+half$/i.test(trimmed) || trimmed.toUpperCase() === 'P2') return 'Segundo tiempo';
    if (/extra/i.test(trimmed)) return 'Alargue';
    return trimmed;
}

// --------------------------------------------------------------------------
// Tipos normalizados
// --------------------------------------------------------------------------

export type FisuUnit = {
    /** `ResCode` completo, la llave con la que la API nombra al partido. */
    resCode: string;
    key: FisuCompetitionKey;
    /** Código de fase (`PO03`, `SF-9`, `FNL-`) y número de unidad (`000100`). */
    phaseCode: string;
    unitCode: string;
    /** Instante de inicio en UTC (ISO). Null si la fecha no se pudo leer. */
    startsAtIso: string | null;
    dateTimeRaw: string;
    homeCode: string | null;
    awayCode: string | null;
    /** Nombre a mostrar: la selección, o el marcador de posición del cruce. */
    homeName: string;
    awayName: string;
    homeRoster: string[];
    awayRoster: string[];
    pool: string | null;
    stageName: string;
    unitName: string;
    homeScore: number | null;
    awayScore: number | null;
    status: string;
    state: MatchStatus;
    isLive: boolean;
    venue: string;
};

export type FisuStandingRow = {
    position: number | null;
    code: string | null;
    nameEn: string;
    name: string;
    played: number | null;
    won: number | null;
    lost: number | null;
    tied: number | null;
    pointsFor: number | null;
    pointsAgainst: number | null;
    diff: number | null;
    points: number | null;
    triesFor: number | null;
    triesAgainst: number | null;
};

export type FisuPool = {
    /** Código de fase del grupo (`PO01`). */
    phaseCode: string;
    key: FisuCompetitionKey;
    name: string;
    rows: FisuStandingRow[];
};

export type FisuPeriod = {
    order: number;
    name: string;
    home: number | null;
    away: number | null;
};

export type FisuResultDetail = {
    status: string;
    state: MatchStatus;
    homeScore: number | null;
    awayScore: number | null;
    currentPeriod: number | null;
    periods: FisuPeriod[];
    homeRoster: string[];
    awayRoster: string[];
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
    const raw = asString(value).trim().replace('+', '');
    if (!/^-?\d+$/.test(raw)) return null;
    return Number(raw);
}

function orgCode(value: unknown): string | null {
    const raw = asString(value).trim().toUpperCase();
    return /^[A-Z]{3}$/.test(raw) ? raw : null;
}

/** "2026-09-04T10:00:00+02:00" -> ISO en UTC. La API ya trae el huso de la sede. */
export function parseFisuDateTime(raw: string): string | null {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function extension(list: unknown, code: string): string {
    if (!Array.isArray(list)) return '';
    for (const item of list) {
        const record = asRecord(item);
        if (record && asString(record.Code) === code) return asString(record.Value);
    }
    return '';
}

function memberNames(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value
        .map((member) => asString(asRecord(member)?.Name).trim())
        .filter((name) => name.length > 0);
}

function competitionOfEvent(eventKey: string): FisuCompetitionKey | null {
    return FISU_COMPETITION_KEYS.find((key) => FISU_COMPETITIONS[key].eventKey === eventKey) ?? null;
}

/**
 * Los cruces todavía sin equipos vienen con `Name: ""`. La API a veces dice de
 * dónde sale cada rival (`ComesFromRank` + `ComesFromPhaseKey`); si no, queda
 * "Por definir", que es la verdad.
 */
function placeholderName(side: Json | null, phaseNames?: Map<string, string>): string {
    const extensions = side?.Extensions;
    const rank = toInt(extension(extensions, 'ComesFromRank'));
    const phaseKey = extension(extensions, 'ComesFromPhaseKey');
    if (rank && phaseKey) {
        const phaseName = phaseNames?.get(phaseKey);
        if (phaseName) return `${rank}° ${phaseName}`;
    }
    return 'Por definir';
}

// --------------------------------------------------------------------------
// Parsers
// --------------------------------------------------------------------------

/** Separa `M.TEAM7-------------.PO03.000100--` en evento, fase y unidad. */
export function splitResCode(resCode: string): { eventKey: string; phaseCode: string; unitCode: string } | null {
    const match = /^([MW]\.TEAM7-{13})\.([A-Z0-9-]{4})\.(\d{6})--$/.exec(resCode.trim());
    if (!match) return null;
    return { eventKey: match[1], phaseCode: match[2], unitCode: match[3] };
}

/**
 * Una unidad del cronograma diario (`schedule/daily/{date}`) al modelo propio.
 * Devuelve null para lo que no es un partido de seven (otra disciplina, una
 * fila de fase) o para un `ResCode` que no tiene la forma esperada.
 */
export function parseFisuUnit(item: unknown, phaseNames?: Map<string, string>): FisuUnit | null {
    const record = asRecord(item);
    if (!record) return null;
    if (asString(record.Disc) && asString(record.Disc) !== FISU_DISC) return null;
    if (record.IsPhase === true) return null;

    const resCode = asString(record.ResCode) || asString(record.Key);
    const parts = splitResCode(resCode);
    if (!parts) return null;

    const key = competitionOfEvent(parts.eventKey);
    if (!key) return null;

    const home = asRecord(record.Home);
    const away = asRecord(record.Away);
    const homeCode = orgCode(home?.Org);
    const awayCode = orgCode(away?.Org);
    const homeScore = toInt(home?.Result);
    const awayScore = toInt(away?.Result);
    const status = asString(record.Status);
    const { pool, stageName } = fisuStageName(asString(record.PhaseDescA), asString(record.UnitDescA));

    return {
        resCode,
        key,
        phaseCode: parts.phaseCode,
        unitCode: parts.unitCode,
        startsAtIso: parseFisuDateTime(asString(record.DateTimeRaw)),
        dateTimeRaw: asString(record.DateTimeRaw),
        homeCode,
        awayCode,
        homeName: homeCode
            ? fisuTeamNameFromCode(homeCode, asString(home?.Name))
            : (asString(home?.Name).trim() || placeholderName(home, phaseNames)),
        awayName: awayCode
            ? fisuTeamNameFromCode(awayCode, asString(away?.Name))
            : (asString(away?.Name).trim() || placeholderName(away, phaseNames)),
        homeRoster: memberNames(home?.Members),
        awayRoster: memberNames(away?.Members),
        pool,
        stageName,
        unitName: asString(record.UnitDescA) || asString(record.UnitDesc),
        homeScore,
        awayScore,
        status,
        state: classifyFisuStatus(status, homeScore !== null && awayScore !== null),
        isLive: record.IsLive === true,
        venue: asString(record.LocDesc) || asString(record.VenueDesc),
    };
}

/**
 * El cronograma de un día entero. Los grupos se leen primero para que los
 * cruces puedan decir "1° Grupo A" en vez de "Por definir".
 */
export function parseFisuDaily(json: unknown): FisuUnit[] {
    if (!Array.isArray(json)) return [];

    const phaseNames = new Map<string, string>();
    for (const item of json) {
        const record = asRecord(item);
        const phaseKey = asString(record?.Phase);
        const { pool } = fisuStageName(asString(record?.PhaseDescA), '');
        if (phaseKey && pool) phaseNames.set(phaseKey, `Grupo ${pool}`);
    }

    return json
        .map((item) => parseFisuUnit(item, phaseNames))
        .filter((unit): unit is FisuUnit => unit !== null);
}

/** La tabla de un grupo (`groups/{phase}`). */
export function parseFisuGroups(json: unknown): FisuPool[] {
    const root = asRecord(json);
    const groups = Array.isArray(root?.Groups) ? root.Groups : [];
    const key = competitionOfEvent(asString(root?.EvKey));
    if (!key) return [];

    const pools: FisuPool[] = [];
    for (const item of groups) {
        const group = asRecord(item);
        if (!group || asString(group.Type) !== 'POOL') continue;

        const groupKey = asString(group.Key);
        const phaseCode = groupKey.split('.').pop() || groupKey;
        const { pool } = fisuStageName(asString(group.DescA), '');
        const name = pool ? `Grupo ${pool}` : asString(group.DescA) || asString(group.Desc);

        const competitors = Array.isArray(group.Competitors) ? group.Competitors : [];
        const rows: FisuStandingRow[] = [];
        for (const entry of competitors) {
            const competitor = asRecord(entry);
            if (!competitor) continue;
            const code = orgCode(competitor.Org);
            const nameEn = asString(competitor.Name) || asString(competitor.OrgDesc);
            if (!code && !nameEn) continue;

            rows.push({
                position: toInt(competitor.Pos) ?? toInt(competitor.Rk),
                code,
                nameEn,
                name: fisuTeamNameFromCode(code, nameEn),
                played: toInt(competitor.Played),
                won: toInt(competitor.Won),
                lost: toInt(competitor.Lost),
                tied: toInt(competitor.Tied),
                pointsFor: toInt(competitor.PtsFor) ?? toInt(competitor.For),
                pointsAgainst: toInt(competitor.PtsAgainst) ?? toInt(competitor.Against),
                diff: toInt(competitor.PtsDiff) ?? toInt(competitor.Diff),
                points: toInt(competitor.Points),
                triesFor: toInt(extension(competitor.Extensions, 'TriesFor')),
                triesAgainst: toInt(extension(competitor.Extensions, 'TriesAgainst')),
            });
        }

        rows.sort((left, right) => (left.position ?? 99) - (right.position ?? 99));
        pools.push({ phaseCode, key, name, rows });
    }

    return pools;
}

/** La planilla de un partido (`results/{unit}`): parciales y planteles. */
export function parseFisuResultDetail(json: unknown): FisuResultDetail | null {
    const root = asRecord(json);
    if (!root) return null;

    const info = asRecord(root.Info);
    const results = asRecord(root.Results);
    const competitors = Array.isArray(root.Competitors) ? root.Competitors.map(asRecord) : [];
    const status = asString(info?.Status);

    // Antes del pitazo la planilla ya viene con los dos tiempos en "0": no es
    // un 0-0, es una planilla vacía. Los parciales sólo cuentan con el partido
    // en juego o terminado.
    const provisional = classifyFisuStatus(status, false);
    const played = provisional === 'live' || provisional === 'final';

    const periods: FisuPeriod[] = (Array.isArray(results?.Periods) ? results.Periods : [])
        .map((entry) => asRecord(entry))
        .filter((period): period is Json => period !== null)
        .map((period) => ({
            order: toInt(period.Order) ?? 0,
            name: fisuPeriodName(asString(period.Desc) || asString(period.DescS)),
            home: played ? toInt(period.ResHome) : null,
            away: played ? toInt(period.ResAway) : null,
        }));

    // El marcador manda desde el competidor; si todavía no lo cargaron, se
    // reconstruye sumando los parciales que sí están.
    const [home, away] = [competitors[0] ?? null, competitors[1] ?? null];
    const sumOf = (side: 'home' | 'away') => {
        const known = periods.filter((period) => period[side] !== null);
        return known.length > 0 ? known.reduce((total, period) => total + (period[side] ?? 0), 0) : null;
    };
    const homeScore = toInt(home?.Result) ?? (played ? sumOf('home') : null);
    const awayScore = toInt(away?.Result) ?? (played ? sumOf('away') : null);

    return {
        status,
        state: classifyFisuStatus(status, homeScore !== null && awayScore !== null),
        homeScore,
        awayScore,
        currentPeriod: toInt(results?.CurrentPeriod),
        periods,
        homeRoster: memberNames(home?.Members),
        awayRoster: memberNames(away?.Members),
    };
}

// --------------------------------------------------------------------------
// Política de refresco
// --------------------------------------------------------------------------

export const FISU_TTL_HOT_SECONDS = 20;
export const FISU_TTL_IDLE_SECONDS = 120;

/** Desde cuánto antes del inicio se considera "caliente" el fixture. */
const HOT_BEFORE_MS = 15 * 60 * 1000;
/** Y hasta cuándo después: un partido de seven dura ~20 minutos con demoras. */
const HOT_AFTER_MS = 60 * 60 * 1000;

/**
 * Cada cuánto vale la pena volver a leer el cronograma. Igual que con la FIH:
 * la ventana caliente abre ANTES del horario de inicio, porque entre el
 * pitazo y que la mesa marque RUNNING pasa un rato. `nowMs` entra por
 * parámetro para que sea comprobable sin esperar al torneo.
 */
export function fisuRefreshTtlSeconds(units: FisuUnit[], nowMs: number): number {
    for (const unit of units) {
        if (unit.state === 'live') return FISU_TTL_HOT_SECONDS;
    }

    for (const unit of units) {
        if (!unit.startsAtIso || unit.state === 'final') continue;
        const startsAt = Date.parse(unit.startsAtIso);
        if (Number.isNaN(startsAt)) continue;
        if (nowMs >= startsAt - HOT_BEFORE_MS && nowMs <= startsAt + HOT_AFTER_MS) {
            return FISU_TTL_HOT_SECONDS;
        }
    }

    return FISU_TTL_IDLE_SECONDS;
}

// --------------------------------------------------------------------------
// Identificadores
// --------------------------------------------------------------------------
//
//   fisu-ru7-2026-m                torneo (masculino)
//   fisu-match-m-PO03-000100       partido: fase + unidad del ResCode
//   fisu-match-w-FNL_-000100       la fase lleva `_` donde la API pone `-`,
//                                  para que el guion siga siendo separador
//   fisu-team-ARG                  selección

export function toFisuMatchId(key: FisuCompetitionKey, phaseCode: string, unitCode: string): string {
    return `${FISU_MATCH_ID_PREFIX}${key}-${phaseCode.replace(/-/g, '_')}-${unitCode}`;
}

export function fisuMatchIdOf(unit: FisuUnit): string {
    return toFisuMatchId(unit.key, unit.phaseCode, unit.unitCode);
}

export function parseFisuMatchId(value: unknown): { key: FisuCompetitionKey; resCode: string } | null {
    if (typeof value !== 'string') return null;
    const match = new RegExp(`^${FISU_MATCH_ID_PREFIX}([mw])-([A-Z0-9_]{4})-(\\d{6})$`, 'i').exec(value.trim());
    if (!match) return null;
    const key = match[1].toLowerCase() as FisuCompetitionKey;
    const phaseCode = match[2].toUpperCase().replace(/_/g, '-');
    return { key, resCode: `${FISU_COMPETITIONS[key].eventKey}.${phaseCode}.${match[3]}--` };
}

export function parseFisuTournamentId(value: unknown): FisuCompetitionKey | null {
    if (typeof value !== 'string') return null;
    const normalized = value.trim().toLowerCase();
    if (!normalized.startsWith(FISU_TOURNAMENT_ID_PREFIX)) return null;
    const key = normalized.slice(FISU_TOURNAMENT_ID_PREFIX.length);
    return key === 'm' || key === 'w' ? key : null;
}
