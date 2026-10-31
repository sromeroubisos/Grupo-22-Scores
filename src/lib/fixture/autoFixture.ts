/**
 * Armado automático del fixture de una fase (puro, sin base ni reloj).
 *
 * Dos pasos separados a propósito, para poder mostrar el resultado ANTES de
 * escribir nada:
 *
 *   1. `planRounds`    quién juega contra quién en cada fecha.
 *   2. `placeInSlots`  a qué día, hora y cancha va cada partido.
 *
 * Es determinista: los mismos equipos dan siempre el mismo fixture. Por eso los
 * equipos se ordenan por `id` adentro y nunca se itera un `Set`/`Map` para
 * elegir. Regenerar con los mismos datos no mueve nada.
 */

export type PairingScope =
    /** Cada zona se juega por separado: A contra A, B contra B. */
    | 'within_groups'
    /** Sólo cruces entre zonas: todos los de A contra todos los de B. */
    | 'between_groups'
    /** Un solo todos contra todos, sin mirar las zonas. */
    | 'all';

export interface FixtureTeam {
    id: string;
    groupId?: string | null;
}

export interface PlanInput {
    teams: FixtureTeam[];
    scope: PairingScope;
    /** Cuántas veces se enfrentan cada dos equipos (1 = solo ida, 2 = ida y vuelta). */
    legs: number;
    /** Sin semilla el fixture es siempre el mismo; con una, es un sorteo reproducible. */
    seed?: number;
}

export interface PlannedMatch {
    homeId: string;
    awayId: string;
    /** Zona del cruce; `null` si es entre zonas o no hay zonas. */
    groupId: string | null;
}

export interface PlannedRound {
    /** Desde 1. */
    number: number;
    matches: PlannedMatch[];
    /** Equipos que descansan en esta fecha (cantidad impar). */
    byes: string[];
}

export const MAX_LEGS = 4;

const BYE = '\u0000bye';

function clampLegs(legs: number): number {
    const n = Math.floor(Number(legs));
    if (!Number.isFinite(n) || n < 1) return 1;
    return Math.min(n, MAX_LEGS);
}

/** Método del círculo: n-1 fechas (o n si es impar) y cada par se cruza una vez. */
function circleRounds(ids: string[]): Array<Array<[string, string]>> {
    if (ids.length < 2) return [];
    const list = ids.length % 2 === 1 ? [...ids, BYE] : [...ids];
    const n = list.length;
    const rounds: Array<Array<[string, string]>> = [];
    let rotating = list.slice(1);
    for (let r = 0; r < n - 1; r += 1) {
        const ring = [list[0], ...rotating];
        const pairs: Array<[string, string]> = [];
        for (let i = 0; i < n / 2; i += 1) {
            const a = ring[i];
            const b = ring[n - 1 - i];
            if (a === BYE || b === BYE) continue;
            // El que va fijo alterna de condición; el resto, según la paridad del
            // lugar: reparte los locales sin que nadie juegue tres seguidos de local.
            const flip = i === 0 ? r % 2 === 1 : (r + i) % 2 === 1;
            pairs.push(flip ? [b, a] : [a, b]);
        }
        rounds.push(pairs);
        rotating = [rotating[rotating.length - 1], ...rotating.slice(0, -1)];
    }
    return rounds;
}

function byesOf(ids: string[], matches: PlannedMatch[]): string[] {
    const playing = new Set<string>();
    for (const m of matches) {
        playing.add(m.homeId);
        playing.add(m.awayId);
    }
    return ids.filter((id) => !playing.has(id));
}

function sortedById<T extends { id: string }>(items: T[]): T[] {
    return [...items].sort((a, b) => a.id.localeCompare(b.id));
}

/** mulberry32: el mismo número da siempre la misma secuencia. */
export function seededRandom(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function shuffled<T>(items: T[], rng: () => number): T[] {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i -= 1) {
        const j = Math.floor(rng() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
}

/** Zonas en orden estable; adentro conserva el orden en que llegan los equipos. */
function groupTeams(teams: FixtureTeam[]): Array<{ groupId: string | null; ids: string[] }> {
    const keys = Array.from(new Set(teams.map((t) => t.groupId ?? null)));
    keys.sort((a, b) => String(a ?? '').localeCompare(String(b ?? '')));
    return keys.map((groupId) => ({
        groupId,
        ids: teams.filter((t) => (t.groupId ?? null) === groupId).map((t) => t.id),
    }));
}

/** Da vuelta las localías de la segunda vuelta, y vuelve a la original en la tercera. */
function legOrientation(pair: [string, string], leg: number): [string, string] {
    return leg % 2 === 0 ? pair : [pair[1], pair[0]];
}

function roundsFromCircle(ids: string[], groupId: string | null, legs: number): PlannedMatch[][] {
    const base = circleRounds(ids);
    const out: PlannedMatch[][] = [];
    for (let leg = 0; leg < legs; leg += 1) {
        for (const pairs of base) {
            out.push(
                pairs.map((pair) => {
                    const [homeId, awayId] = legOrientation(pair, leg);
                    return { homeId, awayId, groupId };
                }),
            );
        }
    }
    return out;
}

/**
 * Cruces entre zonas. No hay un "método del círculo" para esto, así que se arma
 * la lista completa de cruces y se reparte en fechas con un empaquetado goloso:
 * cada cruce va a la primera fecha donde sus dos equipos están libres. Da fechas
 * casi óptimas y, sobre todo, estables.
 */
function crossGroupRounds(
    groups: Array<{ groupId: string | null; ids: string[] }>,
    legs: number,
): PlannedMatch[][] {
    const homes = new Map<string, number>();
    const aways = new Map<string, number>();
    const rounds: Array<{ matches: PlannedMatch[]; busy: Set<string> }> = [];

    for (let leg = 0; leg < legs; leg += 1) {
        const legStart = leg === 0 ? 0 : rounds.length;
        const pending: Array<[string, string]> = [];
        for (let i = 0; i < groups.length; i += 1) {
            for (let j = i + 1; j < groups.length; j += 1) {
                for (const a of groups[i].ids) for (const b of groups[j].ids) pending.push([a, b]);
            }
        }
        for (const [a, b] of pending) {
            // La localía la pone quien menos veces jugó de local hasta acá.
            const balance = (id: string) => (homes.get(id) ?? 0) - (aways.get(id) ?? 0);
            const [homeId, awayId] = balance(a) <= balance(b) ? [a, b] : [b, a];
            let target = legStart;
            while (target < rounds.length && (rounds[target].busy.has(homeId) || rounds[target].busy.has(awayId))) {
                target += 1;
            }
            if (target === rounds.length) rounds.push({ matches: [], busy: new Set() });
            rounds[target].matches.push({ homeId, awayId, groupId: null });
            rounds[target].busy.add(homeId);
            rounds[target].busy.add(awayId);
            homes.set(homeId, (homes.get(homeId) ?? 0) + 1);
            aways.set(awayId, (aways.get(awayId) ?? 0) + 1);
        }
    }
    return rounds.map((r) => r.matches);
}

/** Qué fechas salen y qué se juega en cada una. */
export function planRounds(input: PlanInput): PlannedRound[] {
    const legs = clampLegs(input.legs);
    const unique = sortedById(Array.from(new Map(input.teams.map((t) => [t.id, t])).values()));
    if (unique.length < 2) return [];
    // Sin semilla: orden por id, siempre igual. Con semilla: sorteo reproducible.
    const rng = input.seed === undefined ? null : seededRandom(input.seed);
    const teams = rng ? shuffled(unique, rng) : unique;

    let perRound: PlannedMatch[][];

    if (input.scope === 'within_groups') {
        const groups = groupTeams(teams);
        const perGroup = groups.map((g) => roundsFromCircle(g.ids, g.groupId, legs));
        const length = Math.max(0, ...perGroup.map((rounds) => rounds.length));
        perRound = Array.from({ length }, (_, i) => perGroup.flatMap((rounds) => rounds[i] ?? []));
    } else if (input.scope === 'between_groups') {
        const groups = groupTeams(teams);
        perRound = groups.length < 2 ? [] : crossGroupRounds(groups, legs);
    } else {
        perRound = roundsFromCircle(teams.map((t) => t.id), null, legs);
    }

    // El sorteo también mezcla el orden de los partidos dentro de cada fecha.
    if (rng) perRound = perRound.map((matches) => shuffled(matches, rng));

    const allIds = unique.map((t) => t.id);
    return perRound.map((matches, index) => ({
        number: index + 1,
        matches,
        byes: byesOf(allIds, matches),
    }));
}

/** Cuántos partidos habrá, sin armar el fixture. Para el resumen en vivo. */
export function countMatches(input: PlanInput): number {
    return planRounds(input).reduce((sum, round) => sum + round.matches.length, 0);
}

// ─── Calendario ──────────────────────────────────────────────────────────────

export interface SlotConfig {
    /** `YYYY-MM-DD`, día local. */
    startDate: string;
    /** Días de la semana en que se juega (0 = domingo … 6 = sábado). */
    weekdays: number[];
    /** `HH:MM`: primer horario posible. */
    windowStart: string;
    /** `HH:MM`: el último partido tiene que TERMINAR a esta hora. */
    windowEnd: string;
    durationMin: number;
    /** Minutos entre el final de un partido y el comienzo del siguiente en la misma cancha. */
    gapMin: number;
    /** Canchas o sedes disponibles al mismo tiempo. Vacío = una sola, sin nombre. */
    venues: string[];
    /** Días en que no se juega (feriados, fechas FIFA…), `YYYY-MM-DD`. */
    skipDates?: string[];
    /** Si se juega "de tal día a tal día": último día posible, `YYYY-MM-DD`. */
    endDate?: string | null;
    /** Mezcla qué partido va a qué horario y cancha dentro de cada día. */
    seed?: number;
    /**
     * Qué fechas se juegan con todos los partidos a la misma hora:
     * `none` = nunca, `last_round` = sólo la última (para que nadie llegue
     * sabiendo el resultado de otro), `all_rounds` = todas.
     */
    simultaneous?: 'none' | 'last_round' | 'all_rounds';
}

export interface PlacedMatch extends PlannedMatch {
    roundNumber: number;
    date: string;
    time: string;
    venue: string | null;
}

export interface Placement {
    placed: PlacedMatch[];
    /** Fechas que no entraron en un solo día y se partieron en dos o más. */
    spilledRounds: number[];
    /** Partidos que quedaron después del último día del rango. */
    pastEndDate: number;
    /** Primer y último día usado, `null` si no hay partidos. */
    firstDate: string | null;
    lastDate: string | null;
}

const DAY_MS = 86_400_000;

function toUtcDate(iso: string): Date | null {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!m) return null;
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    return Number.isNaN(d.getTime()) ? null : d;
}

function toIso(date: Date): string {
    return date.toISOString().slice(0, 10);
}

export function parseClock(value: string): number | null {
    const m = /^(\d{1,2}):(\d{2})$/.exec((value || '').trim());
    if (!m) return null;
    const h = Number(m[1]);
    const min = Number(m[2]);
    return h < 24 && min < 60 ? h * 60 + min : null;
}

export function formatClock(minutes: number): string {
    const h = Math.floor(minutes / 60) % 24;
    const m = minutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Los horarios de arranque de un día en una misma cancha. */
export function daySlotTimes(config: Pick<SlotConfig, 'windowStart' | 'windowEnd' | 'durationMin' | 'gapMin'>): number[] {
    const start = parseClock(config.windowStart);
    const end = parseClock(config.windowEnd);
    const duration = Math.max(1, Math.floor(config.durationMin));
    const step = duration + Math.max(0, Math.floor(config.gapMin));
    if (start === null || end === null || end <= start) return [];
    const times: number[] = [];
    for (let t = start; t + duration <= end; t += step) times.push(t);
    return times;
}

/** Un texto por problema de la configuración; vacío si está bien. */
export function validateSlotConfig(config: SlotConfig): string[] {
    const problems: string[] = [];
    if (!toUtcDate(config.startDate)) problems.push('Elegí una fecha de inicio.');
    if (config.weekdays.length === 0) problems.push('Marcá al menos un día de la semana.');
    if (!(Number(config.durationMin) >= 1)) problems.push('La duración del partido tiene que ser mayor a cero.');
    const start = parseClock(config.windowStart);
    const end = parseClock(config.windowEnd);
    if (start === null || end === null) problems.push('Completá el horario de inicio y de cierre.');
    else if (end <= start) problems.push('El horario de cierre tiene que ser posterior al de inicio.');
    else if (daySlotTimes(config).length === 0) problems.push('Un partido no entra en esa franja: ampliá el horario o acortá la duración.');
    return problems;
}

/**
 * Reparte los partidos en días, horarios y canchas.
 *
 * Cada fecha arranca en el siguiente día habilitado. Si no entra en un día
 * (más partidos que horarios × canchas), sigue en el próximo día habilitado y la
 * fecha queda registrada en `spilledRounds`: el gestor tiene que enterarse.
 */
export function placeInSlots(rounds: PlannedRound[], config: SlotConfig): Placement {
    const empty: Placement = { placed: [], spilledRounds: [], pastEndDate: 0, firstDate: null, lastDate: null };
    if (validateSlotConfig(config).length > 0) return empty;

    const startDay = toUtcDate(config.startDate) as Date;
    const weekdays = new Set(config.weekdays);
    const skip = new Set(config.skipDates ?? []);
    const times = daySlotTimes(config);
    const venues = config.venues.map((v) => v.trim()).filter(Boolean);
    const lanes: Array<string | null> = venues.length > 0 ? venues : [null];
    const perDay = times.length * lanes.length;

    let cursor = startDay.getTime();
    const nextAllowedDay = (): string => {
        for (let guard = 0; guard < 3660; guard += 1) {
            const d = new Date(cursor);
            cursor += DAY_MS;
            if (weekdays.has(d.getUTCDay()) && !skip.has(toIso(d))) return toIso(d);
        }
        return toIso(new Date(cursor));
    };

    const placed: PlacedMatch[] = [];
    const spilledRounds: number[] = [];
    const rng = config.seed === undefined ? null : seededRandom(config.seed + 7919);
    const lastNumber = rounds.length > 0 ? rounds[rounds.length - 1].number : 0;

    for (const round of rounds) {
        if (round.matches.length === 0) continue;
        const sync = config.simultaneous === 'all_rounds'
            || (config.simultaneous === 'last_round' && round.number === lastNumber);
        if (sync) {
            // Todos al mismo horario, un solo día. Las canchas se reparten por
            // orden; si hay menos canchas que partidos igual salen a la misma
            // hora (cada club con su sede), por eso la sede se repite.
            const day = nextAllowedDay();
            const order = rng ? shuffled(round.matches, rng) : round.matches;
            order.forEach((match, i) => {
                placed.push({ ...match, roundNumber: round.number, date: day, time: formatClock(times[0]), venue: lanes[i % lanes.length] });
            });
            continue;
        }
        let day = nextAllowedDay();
        let used = 0;
        let spilled = false;
        const order = rng ? shuffled(round.matches, rng) : round.matches;
        for (const match of order) {
            if (used === perDay) {
                day = nextAllowedDay();
                used = 0;
                spilled = true;
            }
            // Los horarios se llenan por orden y, dentro de cada uno, cancha por cancha.
            const time = times[Math.floor(used / lanes.length)];
            const venue = lanes[used % lanes.length];
            placed.push({ ...match, roundNumber: round.number, date: day, time: formatClock(time), venue });
            used += 1;
        }
        if (spilled) spilledRounds.push(round.number);
    }

    const dates = placed.map((p) => p.date).sort();
    const end = config.endDate ?? null;
    return {
        placed,
        spilledRounds,
        pastEndDate: end ? placed.filter((p) => p.date > end).length : 0,
        firstDate: dates[0] ?? null,
        lastDate: dates[dates.length - 1] ?? null,
    };
}
