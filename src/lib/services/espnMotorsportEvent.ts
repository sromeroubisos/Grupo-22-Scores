import type { MatchStatus } from '@/types/match';

import {
    fetchEspnCoreJson,
    fetchLeagueCoreInfo,
    fetchScoreboardRangeEvents,
    getEspnMotorsportLeague,
    getEspnMotorsportLeagueStandings,
    getRefUrl,
    mapEspnStatus,
    parseDate,
    toEspnMotorsportMatchId,
    type EspnMotorsportLeagueSlug,
} from './espnMotorsport';

/**
 * La ficha de un evento de automovilismo, con lo que ESPN publica de verdad.
 *
 * Un Gran Premio no es un partido: es un fin de semana con varias SESIONES
 * (prácticas, clasificación, sprint, carrera) y en cada una los pilotos
 * terminan en un orden, con su tiempo, su gap con el ganador, sus vueltas y
 * sus paradas. Eso no entra en `home/away + score`, así que va aparte.
 *
 * De dónde sale cada cosa, medido el 2026-09-09:
 *
 * - El scoreboard (`site.api.espn.com/.../racing/{liga}/scoreboard?dates=`)
 *   trae el evento con sus sesiones (`competitions[]`, con `type.abbreviation`
 *   FP1/SS/SR/Qual/Race), y en cada una los pilotos ya ORDENADOS por llegada
 *   (`order`, `winner`). No trae tiempos: `statistics` viene vacío.
 * - La API core (`sports.core.api.espn.com/v2/sports/racing/leagues/{liga}/
 *   events/{evento}/competitions/{sesión}`) agrega por piloto la GRILLA de
 *   largada (`startOrder`) y el auto (`vehicle.number`, `manufacturer`,
 *   `teamColor`), y un `$ref` a sus estadísticas: vueltas, tiempo total, gap
 *   (`behindTime` / `behindLaps`), paradas, puntos, tiempos de Q1/Q2/Q3. Es
 *   UN request por piloto y por sesión, así que se piden con concurrencia
 *   acotada y se cachean media hora (un minuto en vivo).
 * - El estado del piloto (`.../competitors/{id}/status`) dice si abandonó.
 *   Solo se pide en la carrera y solo para los que no completaron el total.
 * - El circuito (`.../circuits/{id}`, o `venues/{id}` cuando la liga no tiene
 *   circuitos) trae longitud, vueltas, curvas, sentido, año, el récord de
 *   vuelta y un diagrama en SVG con variante para fondo oscuro.
 * - `summary?event=` contesta 404 para racing: no existe.
 *
 * NASCAR e IndyCar publican el evento con una sola sesión (la carrera), sin
 * `type`; los tiempos vienen con la misma forma.
 */

export type MotorsportSessionKind = 'practice' | 'sprint-qualifying' | 'sprint' | 'qualifying' | 'race';

export type MotorsportDriverStatus = 'finished' | 'running' | 'retired' | 'disqualified' | 'not-started' | 'not-classified';

export interface MotorsportDriverRef {
    id: string | null;
    name: string;
    shortName: string | null;
    /** El código de tres letras: NOR, VER. */
    abbreviation: string | null;
    headshot: string | null;
    countryName: string | null;
    countryFlag: string | null;
}

export interface MotorsportSessionResult {
    position: number;
    driver: MotorsportDriverRef;
    number: string | null;
    team: string | null;
    /** El color del equipo, en hex sin numeral. */
    teamColor: string | null;
    /** Desde dónde largó. */
    grid: number | null;
    /** Posiciones ganadas (positivo) o perdidas respecto de la grilla. */
    gained: number | null;
    laps: number | null;
    /** El tiempo total del ganador, o la mejor vuelta en prácticas y clasificación. */
    time: string | null;
    /** La diferencia con el primero: "+12.345" o "+2 vueltas". */
    gap: string | null;
    pits: number | null;
    lapsLed: number | null;
    points: number | null;
    /** Puntos extra (por etapas en NASCAR, por vuelta rápida donde exista). */
    bonusPoints: number | null;
    q1: string | null;
    q2: string | null;
    q3: string | null;
    status: MotorsportDriverStatus;
    statusText: string | null;
    winner: boolean;
}

export interface MotorsportSession {
    id: string;
    kind: MotorsportSessionKind;
    label: string;
    shortLabel: string;
    startsAt: string | null;
    status: MatchStatus;
    /** Vueltas completadas (en vivo: la vuelta que va). */
    lapsCompleted: number | null;
    totalLaps: number | null;
    lengthKm: number | null;
    broadcast: string[];
    results: MotorsportSessionResult[];
}

export interface MotorsportCircuit {
    name: string | null;
    city: string | null;
    country: string | null;
    countryFlag: string | null;
    type: string | null;
    length: string | null;
    distance: string | null;
    laps: number | null;
    turns: number | null;
    direction: string | null;
    established: number | null;
    lapRecord: { time: string; driver: string | null; year: number | null } | null;
    diagramDark: string | null;
    diagramLight: string | null;
}

export interface MotorsportStandingRow {
    position: number;
    name: string;
    abbreviation: string | null;
    team: string | null;
    logo: string | null;
    countryFlag: string | null;
    points: number;
    wins: number;
}

export interface MotorsportEventRef {
    id: string;
    name: string;
    startsAt: string | null;
    circuit: string | null;
}

export interface MotorsportEventDetails {
    id: string;
    league: { slug: EspnMotorsportLeagueSlug; name: string; shortName: string };
    name: string;
    status: MatchStatus;
    startsAt: string | null;
    endsAt: string | null;
    season: number | null;
    /** "Fecha 15 de 24" del calendario. */
    round: { number: number | null; total: number | null };
    circuit: MotorsportCircuit;
    sessions: MotorsportSession[];
    /** La sesión con la que abre la ficha: la que se corre, o la última corrida. */
    defaultSessionId: string | null;
    previousEvent: MotorsportEventRef | null;
    nextEvent: MotorsportEventRef | null;
    standings: { drivers: MotorsportStandingRow[]; constructors: MotorsportStandingRow[] };
}

const CORE_TTL = 30 * 60;
const LIVE_TTL = 60;
const ATHLETE_TTL = 24 * 60 * 60;
const CONCURRENCY = 12;

type Json = Record<string, any>;

function str(value: unknown): string | null {
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed || null;
}

function num(value: unknown): number | null {
    const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
    return Number.isFinite(n) ? n : null;
}

function iso(value: unknown): string | null {
    const date = parseDate(value);
    return date ? date.toISOString() : null;
}

/** Un tiempo "0.000", ".000" o "0" es un hueco, no un tiempo. */
function timeOrNull(value: unknown): string | null {
    const text = str(value);
    if (!text) return null;
    if (/^[+-]?0*\.?0*$/.test(text)) return null;
    return text;
}

async function mapConcurrent<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
    const out: R[] = new Array(items.length);
    let next = 0;
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (next < items.length) {
            const i = next;
            next += 1;
            out[i] = await fn(items[i]);
        }
    });
    await Promise.all(workers);
    return out;
}

// ---------------------------------------------------------------------------
// Sesiones
// ---------------------------------------------------------------------------

const SESSION_LABELS: Array<{ test: RegExp; kind: MotorsportSessionKind; label: (n: string) => string; short: (n: string) => string }> = [
    { test: /^fp(\d)$/i, kind: 'practice', label: (n) => `Práctica ${n}`, short: (n) => `P${n}` },
    { test: /^(practice|free practice)/i, kind: 'practice', label: () => 'Práctica', short: () => 'Prác.' },
    { test: /^(ss|sq|sprint shootout|sprint qualifying)$/i, kind: 'sprint-qualifying', label: () => 'Clasificación sprint', short: () => 'Clas. sprint' },
    { test: /^(sr|sprint|sprint race)$/i, kind: 'sprint', label: () => 'Sprint', short: () => 'Sprint' },
    { test: /^(qual|qualifying|q)$/i, kind: 'qualifying', label: () => 'Clasificación', short: () => 'Clasif.' },
    { test: /^race$/i, kind: 'race', label: () => 'Carrera', short: () => 'Carrera' },
];

export function classifyMotorsportSession(competition: Json): { kind: MotorsportSessionKind; label: string; shortLabel: string } {
    const abbreviation = str(competition?.type?.abbreviation) ?? str(competition?.type?.text) ?? '';
    for (const entry of SESSION_LABELS) {
        const m = entry.test.exec(abbreviation);
        if (m) return { kind: entry.kind, label: entry.label(m[1] ?? ''), shortLabel: entry.short(m[1] ?? '') };
    }
    const text = str(competition?.type?.text);
    if (text && /practice/i.test(text)) return { kind: 'practice', label: text, shortLabel: text };
    if (text && /qualif/i.test(text)) return { kind: 'qualifying', label: 'Clasificación', shortLabel: 'Clasif.' };
    // Sin tipo (NASCAR, IndyCar) la única sesión es la carrera.
    return { kind: 'race', label: 'Carrera', shortLabel: 'Carrera' };
}

function statsOf(payload: Json | null | undefined): Map<string, { value: number | null; display: string | null }> {
    const map = new Map<string, { value: number | null; display: string | null }>();
    const categories = Array.isArray(payload?.splits?.categories)
        ? payload!.splits.categories
        : Array.isArray(payload?.categories) ? payload!.categories : [];
    for (const category of categories) {
        for (const stat of Array.isArray(category?.stats) ? category.stats : []) {
            const key = str(stat?.name)?.toLowerCase();
            if (!key) continue;
            map.set(key, { value: num(stat?.value), display: str(stat?.displayValue) });
        }
    }
    return map;
}

function millisToGap(ms: number): string {
    const totalSeconds = ms / 1000;
    if (totalSeconds >= 60) {
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = (totalSeconds - minutes * 60).toFixed(3).padStart(6, '0');
        return `+${minutes}:${seconds}`;
    }
    return `+${totalSeconds.toFixed(3)}`;
}

function lapsGap(laps: number): string {
    return laps === 1 ? '+1 vuelta' : `+${laps} vueltas`;
}

function driverStatusOf(payload: Json | null | undefined): { status: MotorsportDriverStatus; text: string | null } | null {
    const name = str(payload?.type?.name)?.toUpperCase() ?? '';
    const text = str(payload?.displayValue) ?? str(payload?.type?.description);
    if (!name) return null;
    if (name === 'STATUS_RETIRED') return { status: 'retired', text: 'Abandonó' };
    if (name.includes('DISQUAL')) return { status: 'disqualified', text: 'Descalificado' };
    if (name.includes('DID_NOT_START') || name === 'STATUS_DNS') return { status: 'not-started', text: 'No largó' };
    if (name === 'STATUS_FINAL' || name === 'STATUS_FINISHED') return { status: 'finished', text: null };
    if (name === 'STATUS_IN_PROGRESS') return { status: 'running', text: 'En pista' };
    if (name.includes('NOT_CLASSIFIED')) return { status: 'not-classified', text: 'No clasificado' };
    return { status: 'finished', text };
}

interface AthleteCard {
    headshot: string | null;
    abbreviation: string | null;
    countryName: string | null;
    countryFlag: string | null;
    team: string | null;
}

async function loadAthlete(id: string): Promise<AthleteCard | null> {
    const payload = await fetchEspnCoreJson<Json>(
        `https://sports.core.api.espn.com/v2/sports/racing/athletes/${id}?lang=en&region=us`,
        'EspnMotorsportAthlete',
        ATHLETE_TTL,
    ).catch(() => null);
    if (!payload) return null;
    const vehicle = Array.isArray(payload.vehicles) ? payload.vehicles[0] : null;
    return {
        headshot: str(payload?.headshot?.href),
        abbreviation: str(payload?.abbreviation),
        countryName: str(payload?.flag?.alt),
        countryFlag: str(payload?.flag?.href),
        team: str(vehicle?.team) ?? str(vehicle?.manufacturer),
    };
}

async function buildSession(
    leagueSlug: EspnMotorsportLeagueSlug,
    eventId: string,
    competition: Json,
    athletes: Map<string, AthleteCard | null>,
): Promise<MotorsportSession> {
    const { kind, label, shortLabel } = classifyMotorsportSession(competition);
    const status = mapEspnStatus(competition?.status?.type);
    const started = status !== 'scheduled' && status !== 'postponed' && status !== 'cancelled';
    const ttl = status === 'live' ? LIVE_TTL : CORE_TTL;
    const competitionId = str(competition?.id) ?? '';

    const broadcast: string[] = Array.isArray(competition?.broadcasts)
        ? [...new Set<string>(competition.broadcasts.flatMap((b: Json) => (Array.isArray(b?.names) ? b.names : [])))]
        : [];

    const scoreboardCompetitors: Json[] = Array.isArray(competition?.competitors) ? competition.competitors : [];
    const base: MotorsportSession = {
        id: competitionId,
        kind,
        label,
        shortLabel,
        startsAt: iso(competition?.date),
        status,
        lapsCompleted: null,
        totalLaps: null,
        lengthKm: null,
        broadcast,
        results: [],
    };

    if (!started || scoreboardCompetitors.length === 0 || !competitionId) return base;

    const coreBase = `https://sports.core.api.espn.com/v2/sports/racing/leagues/${leagueSlug}/events/${eventId}/competitions/${competitionId}`;
    const [core, sessionStats] = await Promise.all([
        fetchEspnCoreJson<Json>(`${coreBase}?lang=en&region=us`, 'EspnMotorsportCoreCompetition', ttl).catch(() => null),
        fetchEspnCoreJson<Json>(`${coreBase}/statistics?lang=en&region=us`, 'EspnMotorsportCoreCompetitionStats', ttl).catch(() => null),
    ]);

    const coreById = new Map<string, Json>();
    for (const competitor of Array.isArray(core?.competitors) ? core!.competitors : []) {
        const id = str(competitor?.id);
        if (id) coreById.set(id, competitor);
    }

    const generalStats = statsOf(sessionStats);
    const totalLaps = generalStats.get('laps')?.value ?? null;
    base.totalLaps = totalLaps;
    base.lengthKm = generalStats.get('length')?.value ?? null;
    // En el scoreboard `status.period` de la carrera es la vuelta que va (o el total al cerrar).
    base.lapsCompleted = num(competition?.status?.period) || null;

    const ordered = scoreboardCompetitors
        .slice()
        .sort((a, b) => (num(a?.order) ?? 999) - (num(b?.order) ?? 999));

    const statsList = await mapConcurrent(ordered, CONCURRENCY, (competitor) => {
        const id = str(competitor?.id);
        if (!id) return Promise.resolve(null);
        return fetchEspnCoreJson<Json>(`${coreBase}/competitors/${id}/statistics?lang=en&region=us`, 'EspnMotorsportCompetitorStats', ttl).catch(() => null);
    });

    const parsed = ordered.map((competitor, i) => ({ competitor, stats: statsOf(statsList[i]) }));
    const winnerTotal = parsed.find((p) => p.competitor?.winner)?.stats.get('totaltime')?.value
        ?? parsed[0]?.stats.get('totaltime')?.value
        ?? null;

    // El estado (abandonó, descalificado) solo importa en carrera, y solo
    // para el que no completó las vueltas del ganador.
    const needsStatus = (kind === 'race' || kind === 'sprint')
        ? parsed.filter((p) => {
            const laps = p.stats.get('lapscompleted')?.value;
            const behind = p.stats.get('behindlaps')?.value ?? 0;
            return status === 'final' && (behind > 0 || laps == null || laps === 0 || (totalLaps != null && laps < totalLaps));
        })
        : [];
    const statusById = new Map<string, { status: MotorsportDriverStatus; text: string | null } | null>();
    await mapConcurrent(needsStatus, CONCURRENCY, async (p) => {
        const id = str(p.competitor?.id);
        if (!id) return;
        const payload = await fetchEspnCoreJson<Json>(`${coreBase}/competitors/${id}/status?lang=en&region=us`, 'EspnMotorsportCompetitorStatus', ttl).catch(() => null);
        statusById.set(id, driverStatusOf(payload));
    });

    base.results = parsed.map(({ competitor, stats }, index) => {
        const id = str(competitor?.id);
        const coreRow = id ? coreById.get(id) : undefined;
        const card = id ? athletes.get(id) ?? null : null;
        const athlete = competitor?.athlete ?? {};
        const position = num(competitor?.order) ?? index + 1;
        const grid = num(coreRow?.startOrder);
        const laps = stats.get('lapscompleted')?.value ?? null;
        const behindLaps = stats.get('behindlaps')?.value ?? 0;
        const totalTime = timeOrNull(stats.get('totaltime')?.display);
        const totalMs = stats.get('totaltime')?.value ?? null;
        const behindTime = timeOrNull(stats.get('behindtime')?.display);
        const isWinner = competitor?.winner === true || (position === 1 && status === 'final');

        let gap: string | null = null;
        if (kind === 'race' || kind === 'sprint') {
            if (isWinner) gap = null;
            else if (behindLaps > 0) gap = lapsGap(behindLaps);
            else if (behindTime) gap = behindTime.startsWith('+') ? behindTime : `+${behindTime}`;
            else if (totalMs != null && winnerTotal != null && totalMs > winnerTotal) gap = millisToGap(totalMs - winnerTotal);
            // En los óvalos ESPN deja `behindLaps` en cero aunque el piloto
            // haya terminado una vuelta atrás: se lee de las vueltas mismas.
            else if (status === 'final' && totalLaps != null && laps != null && laps > 0 && laps < totalLaps) gap = lapsGap(totalLaps - laps);
        } else if (!isWinner && behindTime) {
            gap = behindTime.startsWith('+') ? behindTime : `+${behindTime}`;
        } else if (!isWinner && totalMs != null && winnerTotal != null && totalMs > winnerTotal) {
            gap = millisToGap(totalMs - winnerTotal);
        }

        const explicit = id ? statusById.get(id) ?? null : null;
        let driverStatus: MotorsportDriverStatus = status === 'live' ? 'running' : 'finished';
        let statusText: string | null = null;
        if (explicit) {
            driverStatus = explicit.status;
            statusText = explicit.text;
        } else if ((kind === 'race' || kind === 'sprint') && status === 'final' && laps === 0 && !totalTime) {
            driverStatus = 'retired';
            statusText = 'Abandonó';
        }
        if (driverStatus === 'retired' && (kind === 'race' || kind === 'sprint')) {
            gap = laps != null && laps > 0 ? `${statusText ?? 'Abandonó'} · vuelta ${laps}` : (statusText ?? 'Abandonó');
        }

        return {
            position,
            driver: {
                id,
                name: str(athlete?.displayName) ?? str(athlete?.fullName) ?? str(competitor?.displayName) ?? `Piloto ${position}`,
                shortName: str(athlete?.shortName),
                abbreviation: card?.abbreviation ?? null,
                headshot: card?.headshot ?? null,
                countryName: str(athlete?.flag?.alt) ?? card?.countryName ?? null,
                countryFlag: str(athlete?.flag?.href) ?? card?.countryFlag ?? null,
            },
            number: str(coreRow?.vehicle?.number),
            team: str(coreRow?.vehicle?.team) ?? str(coreRow?.vehicle?.manufacturer) ?? card?.team ?? null,
            teamColor: str(coreRow?.vehicle?.teamColor),
            grid,
            gained: grid != null ? grid - position : null,
            laps,
            time: totalTime,
            gap,
            pits: stats.get('pitstaken')?.value ?? null,
            lapsLed: stats.get('lapslead')?.value ?? null,
            points: stats.get('championshippts')?.value ?? stats.get('points')?.value ?? null,
            bonusPoints: stats.get('bonus')?.value || null,
            q1: timeOrNull(stats.get('qual1timems')?.display),
            q2: timeOrNull(stats.get('qual2timems')?.display),
            q3: timeOrNull(stats.get('qual3timems')?.display),
            status: driverStatus,
            statusText,
            winner: isWinner,
        };
    });

    return base;
}

// ---------------------------------------------------------------------------
// Circuito
// ---------------------------------------------------------------------------

async function loadCircuit(coreEvent: Json | null, scoreboardEvent: Json): Promise<MotorsportCircuit> {
    const fallback: MotorsportCircuit = {
        name: str(scoreboardEvent?.circuit?.fullName) ?? str(scoreboardEvent?.venue?.fullName) ?? null,
        city: str(scoreboardEvent?.circuit?.address?.city) ?? null,
        country: str(scoreboardEvent?.circuit?.address?.country) ?? null,
        countryFlag: null,
        type: null,
        length: null,
        distance: null,
        laps: null,
        turns: null,
        direction: null,
        established: null,
        lapRecord: null,
        diagramDark: null,
        diagramLight: null,
    };

    const circuitRef = getRefUrl(coreEvent?.circuit);
    const venueRef = getRefUrl(Array.isArray(coreEvent?.venues) ? coreEvent!.venues[0] : null);
    const payload = circuitRef
        ? await fetchEspnCoreJson<Json>(circuitRef, 'EspnMotorsportCircuit', ATHLETE_TTL).catch(() => null)
        : venueRef
            ? await fetchEspnCoreJson<Json>(venueRef, 'EspnMotorsportVenue', ATHLETE_TTL).catch(() => null)
            : null;
    if (!payload) return fallback;

    const diagrams: Json[] = Array.isArray(payload.diagrams) ? payload.diagrams : [];
    const pick = (rel: string) => str(diagrams.find((d) => Array.isArray(d?.rel) && d.rel.includes(rel) && /\.svg(\?|$)/i.test(String(d?.href ?? '')))?.href);

    let recordDriver: string | null = null;
    const fastestRef = getRefUrl(payload.fastestLapDriver);
    if (fastestRef) {
        const driver = await fetchEspnCoreJson<Json>(fastestRef, 'EspnMotorsportAthlete', ATHLETE_TTL).catch(() => null);
        recordDriver = str(driver?.displayName) ?? str(driver?.fullName);
    }
    const recordTime = timeOrNull(payload.fastestLapTime);
    const length = typeof payload.length === 'number' ? `${payload.length} km` : str(payload.length);
    // La forma del óvalo llega con basura pegada ("Super Speedway Oval TURNS: 25/",
    // "Tri-Oval TURN 1"): se corta en la primera mención a las curvas.
    const shape = (str(payload.type) ?? str(payload.shape))?.replace(/\s*turns?.*$/i, '').trim() || null;

    return {
        name: str(payload.fullName) ?? fallback.name,
        city: str(payload.address?.city) ?? fallback.city,
        country: str(payload.address?.country) ?? fallback.country,
        countryFlag: str(payload.countryFlag?.href),
        type: shape,
        length,
        distance: str(payload.distance),
        laps: num(payload.laps),
        turns: num(payload.turns),
        direction: str(payload.direction),
        established: num(payload.established),
        lapRecord: recordTime ? { time: recordTime, driver: recordDriver, year: num(payload.fastestLapYear) } : null,
        diagramDark: pick('day-dark') ?? pick('circuit'),
        diagramLight: pick('day') ?? pick('circuit'),
    };
}

// ---------------------------------------------------------------------------
// Campeonato
// ---------------------------------------------------------------------------

function isConstructorRow(row: Json): boolean {
    const group = String(row?.group_name ?? '').toLowerCase();
    return /constructor|manufacturer|owner|team/.test(group);
}

function toStandingRow(row: Json, index: number): MotorsportStandingRow {
    return {
        position: num(row?.rank ?? row?.position) ?? index + 1,
        name: str(row?.name) ?? str(row?.team_name) ?? 'Competidor',
        abbreviation: str(row?.abbreviation),
        team: str(row?.affiliation_name),
        logo: str(row?.logo) ?? str(row?.team_logo),
        countryFlag: str(row?.country_flag),
        points: num(row?.points_total ?? row?.points) ?? 0,
        wins: num(row?.won) ?? 0,
    };
}

async function loadStandings(leagueSlug: EspnMotorsportLeagueSlug) {
    const data = await getEspnMotorsportLeagueStandings(leagueSlug).catch(() => null);
    const rows: Json[] = Array.isArray(data?.enrichedRows) ? data!.enrichedRows : [];
    const drivers = rows.filter((r) => !isConstructorRow(r)).map(toStandingRow).sort((a, b) => a.position - b.position);
    const constructors = rows.filter(isConstructorRow).map(toStandingRow).sort((a, b) => a.position - b.position);
    return { drivers, constructors };
}

// ---------------------------------------------------------------------------
// El evento
// ---------------------------------------------------------------------------

function eventStatus(scoreboardEvent: Json, sessions: MotorsportSession[]): MatchStatus {
    if (sessions.some((s) => s.status === 'live')) return 'live';
    const own = mapEspnStatus(scoreboardEvent?.status?.type);
    if (own === 'postponed' || own === 'cancelled') return own;
    if (sessions.length > 0 && sessions.every((s) => s.status === 'final')) return 'final';
    if (own === 'final') return 'final';
    return 'scheduled';
}

function pickDefaultSession(sessions: MotorsportSession[]): string | null {
    const live = sessions.find((s) => s.status === 'live');
    if (live) return live.id;
    const finished = sessions.filter((s) => s.status === 'final' && s.results.length > 0);
    if (finished.length > 0) return finished[finished.length - 1].id;
    return sessions[0]?.id ?? null;
}

function toEventRef(leagueSlug: EspnMotorsportLeagueSlug, event: Json | undefined): MotorsportEventRef | null {
    const id = str(event?.id);
    if (!id) return null;
    return {
        id: toEspnMotorsportMatchId(leagueSlug, id),
        name: str(event?.shortName) ?? str(event?.name) ?? 'Evento',
        startsAt: iso(event?.date),
        circuit: str(event?.circuit?.fullName) ?? null,
    };
}

export async function getEspnMotorsportEventDetails(
    leagueSlug: EspnMotorsportLeagueSlug,
    eventId: string,
): Promise<MotorsportEventDetails | null> {
    const league = getEspnMotorsportLeague(leagueSlug);
    const leagueInfo = await fetchLeagueCoreInfo(leagueSlug).catch(() => null);
    const seasonYear = num(leagueInfo?.season?.year);

    // El calendario de la temporada da la fecha del evento ("15 de 24") y sus
    // vecinos. Si el evento no está en la temporada en curso (mirar diciembre
    // desde enero), se busca en una ventana de un año a cada lado.
    const seasonStart = parseDate(leagueInfo?.season?.startDate) ?? (seasonYear ? new Date(Date.UTC(seasonYear, 0, 1)) : null);
    const seasonEnd = parseDate(leagueInfo?.season?.endDate) ?? (seasonYear ? new Date(Date.UTC(seasonYear, 11, 31)) : null);
    let seasonEvents: Json[] = seasonStart && seasonEnd
        ? await fetchScoreboardRangeEvents(leagueSlug, seasonStart, seasonEnd).catch(() => [])
        : [];
    let index = seasonEvents.findIndex((e) => str(e?.id) === eventId);
    if (index === -1) {
        const today = new Date();
        const wide = await fetchScoreboardRangeEvents(
            leagueSlug,
            new Date(today.getTime() - 365 * 86400000),
            new Date(today.getTime() + 365 * 86400000),
        ).catch(() => []);
        const found = wide.findIndex((e) => str(e?.id) === eventId);
        if (found === -1) return null;
        seasonEvents = wide;
        index = found;
    }
    const scoreboardEvent = seasonEvents[index];

    const coreEvent = await fetchEspnCoreJson<Json>(
        `https://sports.core.api.espn.com/v2/sports/racing/leagues/${leagueSlug}/events/${eventId}?lang=en&region=us`,
        'EspnMotorsportCoreEvent',
        CORE_TTL,
    ).catch(() => null);

    const competitions: Json[] = Array.isArray(scoreboardEvent?.competitions) ? scoreboardEvent.competitions : [];
    const athleteIds = new Set<string>();
    for (const competition of competitions) {
        for (const competitor of Array.isArray(competition?.competitors) ? competition.competitors : []) {
            const id = str(competitor?.id);
            if (id) athleteIds.add(id);
        }
    }
    const athleteList = await mapConcurrent([...athleteIds], CONCURRENCY, async (id) => [id, await loadAthlete(id)] as const);
    const athletes = new Map<string, AthleteCard | null>(athleteList);

    const [sessions, circuit, standings] = await Promise.all([
        Promise.all(competitions.map((competition) => buildSession(leagueSlug, eventId, competition, athletes))),
        loadCircuit(coreEvent, scoreboardEvent),
        loadStandings(leagueSlug),
    ]);
    sessions.sort((a, b) => (a.startsAt ?? '').localeCompare(b.startsAt ?? ''));

    const name = str(scoreboardEvent?.name) ?? str(scoreboardEvent?.shortName) ?? league.name;
    const lastSession = sessions[sessions.length - 1];

    return {
        id: toEspnMotorsportMatchId(leagueSlug, eventId),
        league: { slug: leagueSlug, name: league.name, shortName: league.shortName },
        name,
        status: eventStatus(scoreboardEvent, sessions),
        startsAt: iso(scoreboardEvent?.date) ?? sessions[0]?.startsAt ?? null,
        endsAt: iso(scoreboardEvent?.endDate) ?? lastSession?.startsAt ?? null,
        season: num(scoreboardEvent?.season?.year) ?? seasonYear,
        round: {
            number: index + 1,
            total: seasonEvents.length || null,
        },
        circuit,
        sessions,
        defaultSessionId: pickDefaultSession(sessions),
        previousEvent: toEventRef(leagueSlug, seasonEvents[index - 1]),
        nextEvent: toEventRef(leagueSlug, seasonEvents[index + 1]),
        standings,
    };
}

/**
 * Lo que la portada necesita de un fin de semana: qué sesiones hay ese día,
 * quién ganó si ya terminó. Sale del scoreboard solo, sin pedir la API core.
 */
export interface MotorsportFeedCard {
    eventName: string;
    series: string;
    seriesShort: string;
    circuit: string | null;
    city: string | null;
    country: string | null;
    sessions: Array<{ id: string; kind: MotorsportSessionKind; label: string; startsAt: string | null; status: MatchStatus }>;
    winner: { name: string; countryFlag: string | null } | null;
    podium: Array<{ position: number; name: string; countryFlag: string | null }>;
}

export function buildMotorsportFeedCard(
    leagueSlug: EspnMotorsportLeagueSlug,
    scoreboardEvent: Json,
    competitionsOfDay: Json[],
): MotorsportFeedCard {
    const league = getEspnMotorsportLeague(leagueSlug);
    const all: Json[] = Array.isArray(scoreboardEvent?.competitions) ? scoreboardEvent.competitions : [];
    const race = all.find((c) => classifyMotorsportSession(c).kind === 'race') ?? all[all.length - 1];
    const raceFinal = race ? mapEspnStatus(race?.status?.type) === 'final' : false;
    const competitors: Json[] = raceFinal && Array.isArray(race?.competitors)
        ? race.competitors.slice().sort((a: Json, b: Json) => (num(a?.order) ?? 999) - (num(b?.order) ?? 999))
        : [];
    const podium = competitors.slice(0, 3).map((c, i) => ({
        position: num(c?.order) ?? i + 1,
        name: str(c?.athlete?.displayName) ?? str(c?.athlete?.shortName) ?? `Piloto ${i + 1}`,
        countryFlag: str(c?.athlete?.flag?.href),
    }));

    return {
        eventName: str(scoreboardEvent?.name) ?? str(scoreboardEvent?.shortName) ?? league.name,
        series: league.name,
        seriesShort: league.shortName,
        circuit: str(scoreboardEvent?.circuit?.fullName) ?? null,
        city: str(scoreboardEvent?.circuit?.address?.city) ?? null,
        country: str(scoreboardEvent?.circuit?.address?.country) ?? null,
        sessions: competitionsOfDay.map((c) => {
            const { kind, label } = classifyMotorsportSession(c);
            return { id: str(c?.id) ?? '', kind, label, startsAt: iso(c?.date), status: mapEspnStatus(c?.status?.type) };
        }),
        winner: podium[0] ? { name: podium[0].name, countryFlag: podium[0].countryFlag } : null,
        podium,
    };
}
