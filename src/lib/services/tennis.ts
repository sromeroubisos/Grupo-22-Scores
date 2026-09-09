/**
 * El tenis, servido por la API pública de ESPN.
 *
 * Es la misma API que ya sostiene el fútbol del sitio (`espnFootball.ts`):
 * contesta sin credenciales, sin huella TLS y sin bridge en el medio. Reemplaza
 * al bridge de SofaScore, que exigía imitar el TLS de Chrome y pedía un request
 * por torneo (139 en un domingo normal) para armar un día.
 *
 * Cómo modela ESPN el tenis, medido el 2026-09-08:
 *
 * - `/{atp|wta}/scoreboard?dates=YYYYMMDD` devuelve los TORNEOS cuya ventana
 *   contiene la fecha, cada uno con el cuadro ENTERO: un `grouping` por
 *   modalidad (singles masculino, dobles mixto...) y adentro cada partido con
 *   su ronda, su fecha, su estado y los games de cada set. Un slam pesa 1,7 MB.
 *   Un RANGO (`dates=20260906-20260908`) contesta vacío para tenis, aunque el
 *   fútbol lo acepte: cada día se pide por separado.
 * - No existe "torneo por id": el parámetro `event=` se ignora. Por eso el id
 *   que exponemos lleva el circuito y la FECHA DE INICIO del torneo, que es lo
 *   que hace falta para volver a pedirlo.
 * - Los dos circuitos devuelven el mismo evento cuando el torneo es combinado
 *   (el US Open sale en `atp` y en `wta`, con las cinco modalidades). Se
 *   desduplica por id de evento.
 * - Los cruces NO vienen en orden de llave. Sí es consistente quién ganó cada
 *   partido y quién juega el siguiente, así que la llave se reconstruye
 *   siguiendo a los ganadores de ronda en ronda (`ordenarRondas`).
 * - El sembrado viaja como `curatedRank.current`: solo en el cuadro principal y
 *   nunca pasa de 32, que es lo que un sembrado es.
 * - Un lugar todavía sin dueño llega como un jugador llamado "TBD" con id
 *   negativo.
 *
 * Lo que ESPN no da: superficie, punto en juego, estadísticas del partido
 * (`summary?event=` contesta 400 para tenis), ni Challengers ni ITF.
 *
 * NO comparte modelo con el fútbol: devuelve `TennisMatch`, no `Match`. Ver
 * `src/types/tennis.ts` para el porqué.
 */

import { apiFetch } from '@/lib/apiFetch';
import { memoryCache } from '@/lib/cache';
import { findCountryRecord } from '@/lib/data/countries';
import { APP_TIMEZONE, formatDateKey } from '@/lib/timezone';
import type {
    TennisCountry,
    TennisDay,
    TennisMatch,
    TennisMatchStatus,
    TennisSet,
    TennisSide,
    TennisTournamentDay,
} from '@/types/tennis';

type Tour = 'atp' | 'wta';

const TOURS: readonly Tour[] = ['atp', 'wta'];
const TOUR_LABEL: Record<Tour, string> = { atp: 'ATP', wta: 'WTA' };

const SCOREBOARD_BASE = 'https://site.api.espn.com/apis/site/v2/sports/tennis';

// Un torneo en juego se mueve set a set; la ficha en vivo se refresca cada 30 s
// y el feed sondea cada 15 s, así que 20 s deja como mucho un tick viejo sin
// pedirle a ESPN dos veces lo mismo dentro del mismo tick.
const SCOREBOARD_TTL = 20;
// El ranking cambia los lunes.
const RANKINGS_TTL = 6 * 60 * 60;
// Una caída no se martilla: un minuto de silencio antes de volver a probar.
const FAILURE_TTL = 60;
// Si un jugador tiene retrato o no, no cambia de un día para el otro.
const HEADSHOT_TTL = 24 * 60 * 60;

/** ESPN no pide credenciales: el tenis está siempre configurado. */
export function isTennisServiceConfigured(): boolean {
    return true;
}

export class TennisServiceError extends Error {
    constructor(message: string, public status?: number) {
        super(message);
        this.name = 'TennisServiceError';
    }
}

// ---------------------------------------------------------------------------
// Ids
// ---------------------------------------------------------------------------

/**
 * `espn-<circuito>-<evento>-<inicio>[-<partido>]`
 *
 *   espn-atp-189-2026-20260824           el US Open 2026
 *   espn-atp-189-2026-20260824-182780    un partido de ese cuadro
 *
 * El evento de ESPN ya trae el año (`189-2026`). La fecha de inicio va aparte
 * porque es lo único con lo que ESPN devuelve el torneo; el circuito, porque un
 * torneo solo de WTA no existe en el endpoint de ATP.
 */
const TENNIS_ID = /^espn-(atp|wta)-(\d+-\d{4})-(\d{8})(?:-(\d+))?$/i;

export interface TennisRef {
    tour: Tour;
    eventId: string;
    /** YYYYMMDD, tal cual lo pide ESPN. */
    startDate: string;
    competitionId: string | null;
}

export function parseTennisId(value: unknown): TennisRef | null {
    if (typeof value !== 'string') return null;
    const m = TENNIS_ID.exec(value.trim());
    if (!m) return null;
    return {
        tour: m[1].toLowerCase() as Tour,
        eventId: m[2],
        startDate: m[3],
        competitionId: m[4] ?? null,
    };
}

function tournamentIdOf(tour: Tour, eventId: string, startDate: string): string {
    return `espn-${tour}-${eventId}-${startDate}`;
}

function matchIdOf(tournamentId: string, competitionId: string): string {
    return `${tournamentId}-${competitionId}`;
}

/** "2026-08-24T04:00Z" → "20260824". */
function toEspnDate(iso: string): string {
    return iso.slice(0, 10).replace(/-/g, '');
}

/** "2026-09-08" ± días → "YYYYMMDD". */
function shiftDateKey(dateKey: string, days: number): string {
    const [y, m, d] = dateKey.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d + days));
    return formatDateKey(date).replace(/-/g, '');
}

// ---------------------------------------------------------------------------
// La forma de ESPN, en lo que se usa
// ---------------------------------------------------------------------------

interface EspnFlag {
    href?: string;
    alt?: string;
}

interface EspnAthlete {
    displayName?: string;
    shortName?: string;
    fullName?: string;
    flag?: EspnFlag;
}

interface EspnLinescore {
    value?: number;
    tiebreak?: number;
    winner?: boolean;
}

interface EspnCompetitor {
    id: string;
    type?: 'athlete' | 'team';
    order?: number;
    homeAway?: 'home' | 'away';
    winner?: boolean;
    possession?: boolean;
    curatedRank?: { current?: number };
    linescores?: EspnLinescore[];
    athlete?: EspnAthlete;
    roster?: {
        displayName?: string;
        shortDisplayName?: string;
        athletes?: EspnAthlete[];
    };
}

interface EspnCompetition {
    id: string;
    date?: string;
    timeValid?: boolean;
    status?: {
        type?: {
            name?: string;
            state?: 'pre' | 'in' | 'post';
            detail?: string;
            completed?: boolean;
        };
    };
    round?: { id?: string; displayName?: string };
    venue?: { fullName?: string; court?: string };
    type?: { slug?: string; text?: string };
    competitors?: EspnCompetitor[];
}

interface EspnGrouping {
    grouping?: { id?: string; slug?: string; displayName?: string };
    competitions?: EspnCompetition[];
}

interface EspnEvent {
    id: string;
    name?: string;
    shortName?: string;
    date?: string;
    endDate?: string;
    major?: boolean;
    venue?: { displayName?: string };
    groupings?: EspnGrouping[];
}

interface EspnScoreboard {
    events?: EspnEvent[];
}

interface EspnRankings {
    rankings?: Array<{
        ranks?: Array<{ current?: number; athlete?: { id?: string } }>;
    }>;
}

/** Un evento con el circuito (o los dos) en los que apareció. */
interface TourEvent {
    tour: Tour;
    tours: Tour[];
    event: EspnEvent;
}

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

const inflight = new Map<string, Promise<unknown>>();

async function fetchEspn<T>(url: string, ttlSeconds: number): Promise<T> {
    const cacheKey = `tennis:espn:${url}`;
    const failKey = `tennis:espn:fail:${url}`;

    const cached = memoryCache.get<T>(cacheKey);
    if (cached) return cached;
    if (memoryCache.get<boolean>(failKey)) {
        throw new TennisServiceError('ESPN tennis unavailable (cooling down)', 503);
    }

    const existing = inflight.get(cacheKey) as Promise<T> | undefined;
    if (existing) return existing;

    const promise = (async () => {
        try {
            // Un slam pesa 1,7 MB: el tope por request es más largo que el de
            // un listado. La frescura la gobierna SOLO el memoryCache: la Data
            // Cache de Next serviría un marcador viejo durante un torneo.
            const { data, ok, status } = await apiFetch<T>(url, {
                debugTag: 'EspnTennis',
                silent: true,
                cache: 'no-store',
                timeoutMs: 20_000,
            });
            if (!ok || !data) {
                memoryCache.set(failKey, true, FAILURE_TTL);
                throw new TennisServiceError(`ESPN tennis ${status || 'fetch failed'}`, status || 502);
            }
            memoryCache.set(cacheKey, data, ttlSeconds);
            return data;
        } finally {
            inflight.delete(cacheKey);
        }
    })();

    inflight.set(cacheKey, promise);
    return promise;
}

async function fetchScoreboard(tour: Tour, dates: string): Promise<EspnEvent[]> {
    const payload = await fetchEspn<EspnScoreboard>(
        `${SCOREBOARD_BASE}/${tour}/scoreboard?dates=${dates}&limit=100`,
        SCOREBOARD_TTL,
    );
    return Array.isArray(payload.events) ? payload.events : [];
}

/**
 * Los torneos de los dos circuitos en uno o más días, sin repetir: un torneo
 * combinado sale en los dos endpoints con el MISMO cuadro, y un torneo de una
 * semana sale en cada uno de sus días.
 */
async function loadEvents(days: readonly string[], tours: readonly Tour[] = TOURS): Promise<TourEvent[]> {
    const requests = tours.flatMap((tour) => days.map((day) => ({ tour, day })));
    const responses = await Promise.all(requests.map(({ tour, day }) => fetchScoreboard(tour, day)));

    const merged = new Map<string, TourEvent>();
    requests.forEach(({ tour }, i) => {
        for (const event of responses[i]) {
            const known = merged.get(event.id);
            if (!known) {
                merged.set(event.id, { tour, tours: [tour], event });
            } else if (!known.tours.includes(tour)) {
                known.tours.push(tour);
            }
        }
    });

    // Estable: los slams primero, después por nombre. El orden de llegada de
    // ESPN no dice nada.
    return [...merged.values()].sort((a, b) => {
        const major = Number(Boolean(b.event.major)) - Number(Boolean(a.event.major));
        if (major !== 0) return major;
        return (a.event.name ?? '').localeCompare(b.event.name ?? '');
    });
}

/**
 * Un torneo por su id. Se pide al circuito del id con su fecha de inicio; el
 * otro circuito se consulta también para saber si es combinado, y como es el
 * mismo día suele estar ya en caché.
 */
async function loadEvent(ref: TennisRef): Promise<TourEvent | null> {
    const events = await loadEvents([ref.startDate]);
    return events.find((e) => e.event.id === ref.eventId) ?? null;
}

async function loadRankings(tour: Tour): Promise<Map<string, number>> {
    try {
        const payload = await fetchEspn<EspnRankings>(`${SCOREBOARD_BASE}/${tour}/rankings`, RANKINGS_TTL);
        const ranks = payload.rankings?.[0]?.ranks ?? [];
        const map = new Map<string, number>();
        for (const row of ranks) {
            const id = row.athlete?.id;
            if (id && typeof row.current === 'number') map.set(id, row.current);
        }
        return map;
    } catch {
        // El ranking es un adorno del cuadro: sin él, el cuadro se dibuja igual.
        return new Map();
    }
}

// ---------------------------------------------------------------------------
// Traducción a `TennisMatch`
// ---------------------------------------------------------------------------

const DRAW_LABEL: Record<string, string> = {
    'mens-singles': 'Singles masculino',
    'womens-singles': 'Singles femenino',
    'mens-doubles': 'Dobles masculino',
    'womens-doubles': 'Dobles femenino',
    'mixed-doubles': 'Dobles mixto',
};

function drawLabel(grouping: EspnGrouping | undefined): string | null {
    const slug = grouping?.grouping?.slug ?? '';
    return DRAW_LABEL[slug] ?? grouping?.grouping?.displayName ?? null;
}

function tourLabel(tours: Tour[]): string {
    return tours.map((t) => TOUR_LABEL[t]).join(' · ');
}

/** Un lugar del cuadro todavía sin dueño: ESPN lo manda como un jugador "TBD". */
function isPlaceholder(competitor: EspnCompetitor | undefined): boolean {
    if (!competitor) return true;
    if (competitor.id.startsWith('-')) return true;
    const name = competitor.athlete?.displayName ?? competitor.roster?.displayName ?? '';
    return !name || name === 'TBD';
}

/**
 * El país, desde la bandera de ESPN: `.../countries/500/esp.png` con `alt`
 * "Spain". El trigrama se lee de la URL; el catálogo del sitio resuelve el id
 * por alias o por nombre en inglés.
 */
function toCountry(flag: EspnFlag | undefined): TennisCountry | null {
    if (!flag) return null;
    const file = /\/([a-z]{2,3})\.png(?:\?|$)/i.exec(flag.href ?? '');
    const alpha3 = file ? file[1].toUpperCase() : null;
    const alt = flag.alt?.trim() || null;
    if (!alpha3 && !alt) return null;
    const record = findCountryRecord(alpha3, alt);
    return {
        code: record?.id ?? null,
        alpha3,
        name: record?.nameEs ?? alt,
    };
}

function sameFlag(athletes: EspnAthlete[]): EspnFlag | undefined {
    const first = athletes[0]?.flag;
    if (!first) return undefined;
    return athletes.every((a) => a.flag?.href === first.href) ? first : undefined;
}

/**
 * La cara del jugador. ESPN la sirve por id de atleta; el combinador la achica.
 *
 * El banco no tiene a todo el mundo: medido el 2026-09-08, 53 de los 150 del
 * ranking ATP y 31 de los 150 del WTA. Por eso el feed no lleva foto —cada
 * ausente sería un 404 en la consola de la portada— y la ficha la verifica
 * antes de mostrarla (`verificarRetrato`), una vez por jugador y por día.
 */
function headshot(athleteId: string): string {
    return `https://a.espncdn.com/combiner/i?img=/i/headshots/tennis/players/full/${athleteId}.png&w=200`;
}

async function verificarRetrato(side: TennisSide): Promise<TennisSide> {
    if (!side.photo) return side;
    const key = `tennis:headshot:${side.id}`;
    let existe = memoryCache.get<boolean>(key);
    if (existe === undefined || existe === null) {
        try {
            const res = await fetch(side.photo, { method: 'HEAD', cache: 'no-store', signal: AbortSignal.timeout(3000) });
            existe = res.ok;
            memoryCache.set(key, existe, HEADSHOT_TTL);
        } catch {
            // Sin respuesta no se sabe: esta vez sin foto, y se vuelve a probar.
            existe = false;
        }
    }
    return existe ? side : { ...side, photo: null };
}

function setsWonOf(competitor: EspnCompetitor | undefined): number | null {
    const lines = competitor?.linescores;
    if (!Array.isArray(lines) || lines.length === 0) return null;
    return lines.filter((l) => l.winner === true).length;
}

function toSide(competitor: EspnCompetitor | undefined, live: boolean, withPhoto: boolean): TennisSide {
    const empty: TennisSide = {
        id: '',
        name: '',
        players: [],
        country: null,
        photo: null,
        seed: null,
        setsWon: null,
        gamePoint: null,
        isServing: false,
    };
    if (!competitor || isPlaceholder(competitor)) return empty;

    const seed = competitor.curatedRank?.current;
    const base = {
        id: competitor.id,
        seed: typeof seed === 'number' ? seed : null,
        setsWon: setsWonOf(competitor),
        gamePoint: null,
        isServing: live && competitor.possession === true,
    };

    if (competitor.roster) {
        const athletes = competitor.roster.athletes ?? [];
        const players = athletes.map((a) => a.displayName ?? '').filter(Boolean);
        return {
            ...base,
            name: competitor.roster.displayName ?? players.join(' / '),
            players,
            // Una pareja de dos países no tiene bandera. Una del mismo, sí.
            country: toCountry(sameFlag(athletes)),
            photo: null,
        };
    }

    const athlete = competitor.athlete ?? {};
    const name = athlete.displayName ?? athlete.fullName ?? '';
    return {
        ...base,
        name,
        players: name ? [name] : [],
        country: toCountry(athlete.flag),
        photo: withPhoto && /^\d+$/.test(competitor.id) ? headshot(competitor.id) : null,
    };
}

function numberOrNull(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function toSets(home: EspnCompetitor | undefined, away: EspnCompetitor | undefined): TennisSet[] {
    const h = home?.linescores ?? [];
    const a = away?.linescores ?? [];
    const total = Math.max(h.length, a.length);
    const sets: TennisSet[] = [];
    for (let i = 0; i < total; i += 1) {
        sets.push({
            set: i + 1,
            home: numberOrNull(h[i]?.value),
            away: numberOrNull(a[i]?.value),
            homeTiebreak: numberOrNull(h[i]?.tiebreak),
            awayTiebreak: numberOrNull(a[i]?.tiebreak),
        });
    }
    return sets;
}

/**
 * El estado, en el vocabulario que traducen las etiquetas (`lib/tennis/labels`).
 *
 * ESPN escribe el set en curso con mayúscula ("2nd Set") y los cierres con
 * nombre propio (STATUS_RETIRED, STATUS_WALKOVER). Los tres terminan en
 * `final` porque el partido no sigue; el rótulo conserva el porqué.
 */
function toStatus(competition: EspnCompetition): { status: TennisMatchStatus; label: string; isLive: boolean } {
    const type = competition.status?.type ?? {};
    const name = type.name ?? '';
    const state = type.state;

    if (state === 'in') {
        return { status: 'live', label: (type.detail ?? 'En juego').replace(/\bSet\b/, 'set'), isLive: true };
    }
    if (name === 'STATUS_RETIRED') return { status: 'final', label: 'Retired', isLive: false };
    if (name === 'STATUS_WALKOVER') return { status: 'final', label: 'Walkover', isLive: false };
    if (name === 'STATUS_POSTPONED') return { status: 'other', label: 'POST', isLive: false };
    if (name === 'STATUS_CANCELED') return { status: 'other', label: 'CANC', isLive: false };
    if (name === 'STATUS_SUSPENDED') return { status: 'other', label: 'Suspended', isLive: false };
    if (state === 'post' || type.completed) return { status: 'final', label: 'FT', isLive: false };
    if (state === 'pre') return { status: 'scheduled', label: 'NS', isLive: false };
    return { status: 'other', label: type.detail ?? '', isLive: false };
}

function sortedCompetitors(competition: EspnCompetition): [EspnCompetitor | undefined, EspnCompetitor | undefined] {
    const list = [...(competition.competitors ?? [])];
    // `homeAway` es el dato; `order` es el desempate. Sin ninguno, el orden de llegada.
    const home = list.find((c) => c.homeAway === 'home');
    const away = list.find((c) => c.homeAway === 'away');
    if (home && away) return [home, away];
    list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    return [list[0], list[1]];
}

function toMatch(
    competition: EspnCompetition,
    grouping: EspnGrouping | undefined,
    ctx: TourEvent,
    tournamentId: string,
    withPhoto = false,
): TennisMatch {
    const [home, away] = sortedCompetitors(competition);
    const { status, label, isLive } = toStatus(competition);
    const slug = grouping?.grouping?.slug ?? competition.type?.slug ?? '';
    const isDoubles = /doubles/i.test(slug) || home?.type === 'team' || away?.type === 'team';
    const startsAt = competition.date ? new Date(competition.date) : null;

    return {
        id: matchIdOf(tournamentId, competition.id),
        status,
        statusLabel: label,
        isLive,
        startsAt: startsAt && !Number.isNaN(startsAt.getTime()) ? startsAt : null,
        home: toSide(home, isLive, withPhoto),
        away: toSide(away, isLive, withPhoto),
        sets: toSets(home, away),
        isDoubles,
        draw: drawLabel(grouping),
        round: competition.round?.displayName ?? null,
        surface: null,
        court: competition.venue?.court ?? null,
        tournament: {
            id: tournamentId,
            name: ctx.event.name ?? ctx.event.shortName ?? '',
            tour: tourLabel(ctx.tours),
            slug: ctx.event.id,
        },
    };
}

function tournamentIdFor(ctx: TourEvent): string {
    return tournamentIdOf(ctx.tour, ctx.event.id, toEspnDate(ctx.event.date ?? ''));
}

function* competitionsOf(event: EspnEvent): Generator<[EspnCompetition, EspnGrouping]> {
    for (const grouping of event.groupings ?? []) {
        for (const competition of grouping.competitions ?? []) {
            yield [competition, grouping];
        }
    }
}

function parseCategories(raw: string | undefined): Set<Tour> | null {
    if (!raw || raw.trim().toLowerCase() === 'all') return null;
    const wanted = new Set<Tour>();
    for (const part of raw.split(',')) {
        const key = part.trim().toLowerCase();
        if (key === 'atp' || key === 'wta') wanted.add(key);
    }
    return wanted.size > 0 ? wanted : null;
}

function byStart(a: TennisMatch, b: TennisMatch): number {
    const ta = a.startsAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const tb = b.startsAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
    if (ta !== tb) return ta - tb;
    return a.id.localeCompare(b.id);
}

/**
 * Un día, agrupado por torneo.
 *
 * Se piden el día y el anterior, y se filtra por el huso del visitante: para
 * el que mira desde Tokio, el 8 empieza a las 15:00Z del 7, y el torneo que
 * terminó ese día ya no está en la ventana de ESPN del 8. Hacia adelante no
 * hace falta: la ventana de un torneo arranca a las 04:00Z de su primer día.
 * Los cruces cuyo rival todavía no existe ("TBD") no son un fixture y no
 * entran.
 */
function buildDay(
    events: TourEvent[],
    keep: (match: TennisMatch) => boolean,
    options: { timeZone: string; categories: Set<Tour> | null },
): TennisDay {
    const tournaments: TennisTournamentDay[] = [];
    let discarded = 0;

    for (const ctx of events) {
        if (options.categories && !ctx.tours.some((t) => options.categories!.has(t))) continue;

        const tournamentId = tournamentIdFor(ctx);
        const matches: TennisMatch[] = [];
        for (const [competition, grouping] of competitionsOf(ctx.event)) {
            const [home, away] = sortedCompetitors(competition);
            if (isPlaceholder(home) || isPlaceholder(away)) continue;
            const match = toMatch(competition, grouping, ctx, tournamentId);
            if (keep(match)) matches.push(match);
            else discarded += 1;
        }
        if (matches.length === 0) continue;

        matches.sort(byStart);
        tournaments.push({
            id: tournamentId,
            name: ctx.event.name ?? '',
            tour: tourLabel(ctx.tours),
            slug: ctx.event.id,
            matches,
        });
    }

    return {
        tournaments,
        count: tournaments.reduce((n, t) => n + t.matches.length, 0),
        discardedOffDay: discarded,
        timezone: options.timeZone,
        categories: (options.categories ? [...options.categories] : TOURS).map((t) => TOUR_LABEL[t]),
    };
}

export async function getTennisLiveMatches(): Promise<TennisDay | null> {
    const today = formatDateKey(new Date());
    const events = await loadEvents([shiftDateKey(today, -1), shiftDateKey(today, 0)]);
    return buildDay(events, (match) => match.isLive, { timeZone: 'UTC', categories: null });
}

export async function getTennisMatchesByDate(
    dateKey: string,
    options?: { timeZone?: string; categories?: string },
): Promise<TennisDay | null> {
    const timeZone = options?.timeZone || APP_TIMEZONE;
    const events = await loadEvents([shiftDateKey(dateKey, -1), shiftDateKey(dateKey, 0)]);
    return buildDay(
        events,
        (match) => match.startsAt !== null && formatDateKey(match.startsAt, timeZone) === dateKey,
        { timeZone, categories: parseCategories(options?.categories) },
    );
}

// ---------------------------------------------------------------------------
// La ficha de un partido
// ---------------------------------------------------------------------------

/**
 * Una fila de la planilla de estadísticas. ESPN no la sirve para tenis, así que
 * hoy la ficha llega con la planilla vacía y el panel no se dibuja. La forma se
 * conserva para que la pantalla no cambie cuando aparezca una fuente.
 */
export interface TennisStatRow {
    name: string;
    home: string;
    away: string;
    compareCode?: number;
    statisticsType?: string;
    homeValue?: number;
    awayValue?: number;
    homeTotal?: number;
    awayTotal?: number;
    key?: string;
}

export interface TennisStatGroup {
    period: string;
    groups: Array<{ groupName: string; statisticsItems: TennisStatRow[] }>;
}

export interface TennisMatchDetails {
    match: TennisMatch;
    statistics: TennisStatGroup[];
}

export async function getTennisMatch(matchId: string): Promise<TennisMatchDetails | null> {
    const ref = parseTennisId(matchId);
    if (!ref || !ref.competitionId) return null;

    const ctx = await loadEvent(ref);
    if (!ctx) return null;

    const tournamentId = tournamentIdFor(ctx);
    for (const [competition, grouping] of competitionsOf(ctx.event)) {
        if (competition.id === ref.competitionId) {
            const match = toMatch(competition, grouping, ctx, tournamentId, true);
            const [home, away] = await Promise.all([verificarRetrato(match.home), verificarRetrato(match.away)]);
            return { match: { ...match, home, away }, statistics: [] };
        }
    }
    return null;
}

// ---------------------------------------------------------------------------
// El cuadro
// ---------------------------------------------------------------------------

/**
 * Un lado del cuadro.
 *
 * `disabled` marca un hueco que todavía no tiene dueño. Dibujarlo como nombre
 * pondría a la final jugándose entre "TBD" y "TBD", así que se lee como lo que
 * es: un lugar por definir.
 */
export interface TennisDrawTeam {
    id?: string;
    name?: string;
    shortName?: string;
    /** El código de tres letras: "ZVE", "SIN". ESPN no lo da. */
    nameCode?: string;
    ranking?: number;
    disabled?: boolean;
}

export interface TennisDrawParticipant {
    team?: TennisDrawTeam;
    winner?: boolean;
    /**
     * El sembrado, como texto: además del número puede ser la vía de entrada al
     * cuadro ("Q", "LL", "WC"). ESPN solo da el número.
     */
    teamSeed?: string | number | null;
    order?: number;
}

/** Un bloque del cuadro: un cruce, con sus dos lados y el resultado. */
export interface TennisDrawBlock {
    order: number;
    blockId?: number;
    finished: boolean;
    /** Los sets: "3:1". "Retired" si se cortó por abandono, "Bye" si no se jugó. */
    result: string | null;
    homeTeamScore: string | null;
    awayTeamScore: string | null;
    eventInProgress?: boolean;
    /** El id del partido. Es lo que conecta el cuadro con la ficha de cada uno. */
    events?: string[];
    seriesStartDateTimestamp?: number;
    participants: TennisDrawParticipant[];
}

export interface TennisDrawRound {
    id: number;
    order: number;
    description: string;
    blocks: TennisDrawBlock[];
}

export interface TennisDrawTree {
    id: number;
    name: string;
    currentRound?: number | null;
    rounds: TennisDrawRound[];
}

export interface TennisTournamentInfo {
    id: string;
    name: string;
    tour: string | null;
    slug: string | null;
    logo: string | null;
    country: string | null;
    groundType: string | null;
}

export interface TennisTournamentDetails {
    tournament: TennisTournamentInfo;
    draw: TennisDrawTree[];
    seasonId: number | null;
}

/** Una celda de la llave: un partido real, o el bye de un sembrado. */
type Slot =
    | { kind: 'match'; competition: EspnCompetition }
    | { kind: 'bye'; competitor: EspnCompetitor };

interface RoundBucket {
    id: number;
    name: string;
    competitions: EspnCompetition[];
}

function byDate(a: EspnCompetition, b: EspnCompetition): number {
    const ta = a.date ? Date.parse(a.date) : Number.MAX_SAFE_INTEGER;
    const tb = b.date ? Date.parse(b.date) : Number.MAX_SAFE_INTEGER;
    if (ta !== tb) return ta - tb;
    return a.id.localeCompare(b.id);
}

/**
 * La llave, reconstruida.
 *
 * ESPN no dice en qué posición del cuadro va cada cruce, pero sí quién ganó y
 * quién juega el siguiente. Se recorre de la final hacia atrás: el cruce de la
 * ronda anterior que contiene al jugador del lugar `j` del bloque `k` va en la
 * posición `2k + j`. Un jugador que aparece en una ronda sin haber jugado la
 * anterior tuvo un bye, y se le dibuja uno para que la columna no se corra. Los
 * cruces cuyo ganador todavía no existe ("TBD" en la ronda siguiente) llenan
 * los lugares que quedaron vacíos, por fecha.
 */
function ordenarRondas(rounds: RoundBucket[]): Slot[][] {
    const ordered: Slot[][] = new Array(rounds.length);
    if (rounds.length === 0) return ordered;

    const last = rounds.length - 1;
    ordered[last] = [...rounds[last].competitions]
        .sort(byDate)
        .map((competition) => ({ kind: 'match', competition }));

    for (let i = last - 1; i >= 0; i -= 1) {
        const next = ordered[i + 1];
        const pool = new Map(rounds[i].competitions.map((c) => [c.id, c]));
        const byCompetitor = new Map<string, EspnCompetition>();
        for (const competition of rounds[i].competitions) {
            for (const competitor of competition.competitors ?? []) {
                if (!isPlaceholder(competitor)) byCompetitor.set(competitor.id, competition);
            }
        }

        const slots: Array<Slot | null> = new Array(next.length * 2).fill(null);
        next.forEach((nextSlot, k) => {
            if (nextSlot.kind !== 'match') return;
            sortedCompetitors(nextSlot.competition).forEach((competitor, j) => {
                if (!competitor || isPlaceholder(competitor)) return;
                const previous = byCompetitor.get(competitor.id);
                if (previous && pool.has(previous.id)) {
                    slots[2 * k + j] = { kind: 'match', competition: previous };
                    pool.delete(previous.id);
                } else if (!previous) {
                    slots[2 * k + j] = { kind: 'bye', competitor };
                }
            });
        });

        const remaining = [...pool.values()].sort(byDate);
        for (let s = 0; s < slots.length && remaining.length > 0; s += 1) {
            if (slots[s] === null) slots[s] = { kind: 'match', competition: remaining.shift()! };
        }
        const placed = slots.filter((s): s is Slot => s !== null);
        for (const competition of remaining) placed.push({ kind: 'match', competition });
        ordered[i] = placed;
    }

    return ordered;
}

function toParticipant(
    competitor: EspnCompetitor | undefined,
    order: number,
    rankings: Map<string, number>,
): TennisDrawParticipant {
    if (!competitor || isPlaceholder(competitor)) {
        return { team: { name: 'TBD', disabled: true }, winner: false, teamSeed: null, order };
    }
    const seed = competitor.curatedRank?.current;
    const name = competitor.roster?.displayName ?? competitor.athlete?.displayName ?? competitor.athlete?.fullName ?? '';
    const shortName = competitor.roster?.shortDisplayName ?? competitor.athlete?.shortName ?? name;
    return {
        team: {
            id: competitor.id,
            name,
            shortName,
            ranking: rankings.get(competitor.id),
        },
        winner: competitor.winner === true,
        teamSeed: typeof seed === 'number' ? seed : null,
        order,
    };
}

function toBlock(slot: Slot, order: number, tournamentId: string, rankings: Map<string, number>): TennisDrawBlock {
    if (slot.kind === 'bye') {
        return {
            order,
            finished: true,
            result: 'Bye',
            homeTeamScore: null,
            awayTeamScore: null,
            events: [],
            participants: [
                { ...toParticipant(slot.competitor, 1, rankings), winner: true },
                // En la planilla del torneo el lugar dice "BYE", y así se lee.
                { team: { name: 'Bye', shortName: 'Bye' }, winner: false, teamSeed: null, order: 2 },
            ],
        };
    }

    const competition = slot.competition;
    const [home, away] = sortedCompetitors(competition);
    const { status, label } = toStatus(competition);
    const finished = status === 'final';
    const live = status === 'live';
    const homeSets = setsWonOf(home);
    const awaySets = setsWonOf(away);
    const started = Date.parse(competition.date ?? '');

    let result: string | null = null;
    if (label === 'Retired') result = 'Retired';
    else if (label === 'Walkover') result = 'Walkover';
    else if (finished && homeSets !== null && awaySets !== null) result = `${homeSets}:${awaySets}`;

    return {
        order,
        blockId: /^\d+$/.test(competition.id) ? Number(competition.id) : undefined,
        finished,
        result,
        homeTeamScore: finished || live ? String(homeSets ?? 0) : null,
        awayTeamScore: finished || live ? String(awaySets ?? 0) : null,
        eventInProgress: live,
        events: [matchIdOf(tournamentId, competition.id)],
        seriesStartDateTimestamp: Number.isNaN(started) ? undefined : Math.floor(started / 1000),
        participants: [toParticipant(home, 1, rankings), toParticipant(away, 2, rankings)],
    };
}

/** Las rondas de clasificación son otro cuadro: ESPN las mezcla en la misma modalidad. */
function isQualifyingRound(round: EspnCompetition['round']): boolean {
    return /qualif/i.test(round?.displayName ?? '');
}

function buildTree(
    treeId: number,
    name: string,
    competitions: EspnCompetition[],
    tournamentId: string,
    rankings: Map<string, number>,
): TennisDrawTree | null {
    const buckets = new Map<number, RoundBucket>();
    for (const competition of competitions) {
        const id = Number(competition.round?.id);
        if (!Number.isFinite(id)) continue;
        const bucket = buckets.get(id) ?? { id, name: competition.round?.displayName ?? `Round ${id}`, competitions: [] };
        bucket.competitions.push(competition);
        buckets.set(id, bucket);
    }
    if (buckets.size === 0) return null;

    const rounds = [...buckets.values()].sort((a, b) => a.id - b.id);
    const ordered = ordenarRondas(rounds);

    return {
        id: treeId,
        name,
        currentRound: null,
        rounds: rounds.map((round, i) => ({
            id: round.id,
            order: i + 1,
            description: round.name,
            blocks: ordered[i].map((slot, j) => toBlock(slot, j + 1, tournamentId, rankings)),
        })),
    };
}

export async function getTennisTournament(
    tournamentId: string,
    _seasonId?: number,
): Promise<TennisTournamentDetails | null> {
    void _seasonId;
    const ref = parseTennisId(tournamentId);
    if (!ref || ref.competitionId) return null;

    const ctx = await loadEvent(ref);
    if (!ctx) return null;

    const id = tournamentIdFor(ctx);
    const rankings = new Map<string, number>();
    for (const tour of ctx.tours) {
        for (const [athleteId, rank] of await loadRankings(tour)) rankings.set(athleteId, rank);
    }

    const draw: TennisDrawTree[] = [];
    for (const grouping of ctx.event.groupings ?? []) {
        const label = drawLabel(grouping) ?? 'Cuadro';
        const groupingId = Number(grouping.grouping?.id) || draw.length + 1;
        const all = grouping.competitions ?? [];
        const main = buildTree(groupingId * 10, label, all.filter((c) => !isQualifyingRound(c.round)), id, rankings);
        const qualifying = buildTree(groupingId * 10 + 1, `${label} · Clasificación`, all.filter((c) => isQualifyingRound(c.round)), id, rankings);
        if (main) draw.push(main);
        if (qualifying) draw.push(qualifying);
    }

    return {
        tournament: {
            id,
            name: ctx.event.name ?? ctx.event.shortName ?? '',
            tour: tourLabel(ctx.tours),
            slug: ctx.event.id,
            logo: null,
            country: ctx.event.venue?.displayName ?? null,
            groundType: null,
        },
        draw,
        seasonId: null,
    };
}
