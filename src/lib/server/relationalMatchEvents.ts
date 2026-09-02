import { isMissingTableError } from '@/lib/utils/supabaseSchema';

/**
 * Los eventos de un partido viven en `match_events` (tabla relacional). La
 * columna JSON `matches.events` es un espejo heredado que el Match Center solo
 * reescribe cuando manda el array completo; el alta en vivo viaja como
 * `eventPatch` y deja el JSON vacio o atrasado. Cualquier pantalla que resuma
 * eventos de muchos partidos (estadisticas del torneo, bonus por tries) tiene
 * que leer la tabla y caer al JSON solo cuando la tabla no tiene nada.
 *
 * Devuelve los eventos en la MISMA forma que el JSON heredado (`type`, `team`
 * en home/away, `playerName`, `detail`...), asi los consumidores no distinguen
 * de donde salio cada uno.
 */

type QueryError = { code?: string | null; message?: string | null; details?: string | null } | null;

type MatchEventRow = {
    id: string;
    match_id: string;
    club_id: string | null;
    player_id: string | null;
    player_name: string | null;
    event_type: string | null;
    minute: number | null;
    video_time: string | null;
    parent_event_id: string | null;
    sequence: number | null;
    details: Record<string, unknown> | null;
    created_at: string | null;
};

type PagedResult = PromiseLike<{ data: MatchEventRow[] | null; error: QueryError }>;

type OrderedQuery = {
    order(column: 'id', options: { ascending: boolean }): { limit(n: number): PagedResult };
};

type MatchEventsQuery = {
    from(table: 'match_events'): {
        select(columns: string): {
            in(column: 'match_id', values: string[]): OrderedQuery & {
                gt(column: 'id', value: string): OrderedQuery;
            };
        };
    };
};

// Campos en `unknown` a proposito: varios lectores traen las filas como
// Record<string, unknown> y no vale la pena tiparlas solo para pasar por aca.
export type RelationalMatchSide = {
    id?: unknown;
    home_club_id?: unknown;
    away_club_id?: unknown;
};

export type LegacyJsonMatchEvent = {
    id: string;
    minute: number;
    type: string;
    team: 'home' | 'away' | null;
    playerId: string | null;
    playerName: string;
    secondaryPlayerId: string | null;
    secondaryPlayerName: string;
    detail: string;
    videoTime: string | null;
    parentEventId: string | null;
    sequence: number | null;
    period: string | null;
    order: number | null;
};

// Tipos internos del reloj: no son jugadas y no suman en ninguna estadistica.
const CLOCK_EVENT_TYPES = new Set(['clock_snapshot', 'clock_state']);
const SELECT_COLUMNS = 'id, match_id, club_id, player_id, player_name, event_type, minute, video_time, parent_event_id, sequence, details, created_at';
// PostgREST corta en 1000 filas: se pagina por id y se pide de a 100 partidos
// para que la URL del `in()` no se desborde.
const PAGE_SIZE = 1000;
const MATCH_ID_CHUNK = 100;

function text(value: unknown) {
    return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function numberOrNull(value: unknown) {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function normalizeTeam(value: unknown): 'home' | 'away' | null {
    return value === 'home' || value === 'away' ? value : null;
}

function chunk<T>(items: T[], size: number) {
    const out: T[][] = [];
    for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
    return out;
}

export function mapRelationalEventToLegacyJson(row: MatchEventRow, match: RelationalMatchSide): LegacyJsonMatchEvent {
    const details = row.details && typeof row.details === 'object' ? row.details : {};
    const clubId = text(row.club_id);
    const team =
        clubId && clubId === text(match.home_club_id)
            ? 'home'
            : clubId && clubId === text(match.away_club_id)
                ? 'away'
                : normalizeTeam(details.team);

    return {
        id: row.id,
        minute: numberOrNull(row.minute) ?? 0,
        type: text(row.event_type) || 'note',
        team,
        playerId: text(row.player_id) || text(details.playerId) || null,
        playerName: text(row.player_name) || text(details.playerName),
        secondaryPlayerId: text(details.secondaryPlayerId) || text(details.subPlayerId) || null,
        secondaryPlayerName: text(details.secondaryPlayerName) || text(details.subPlayer),
        detail: text(details.detail),
        videoTime: text(row.video_time) || text(details.videoTime) || null,
        parentEventId: text(row.parent_event_id) || text(details.parentEventId) || null,
        sequence: numberOrNull(row.sequence) ?? numberOrNull(details.sequence),
        period: text(details.period) || null,
        order: numberOrNull(details.order),
    };
}

function sortEvents(a: LegacyJsonMatchEvent, b: LegacyJsonMatchEvent) {
    if (a.order !== null && b.order !== null && a.order !== b.order) return a.order - b.order;
    if (a.minute !== b.minute) return a.minute - b.minute;
    if (a.sequence !== null && b.sequence !== null && a.sequence !== b.sequence) return a.sequence - b.sequence;
    return a.id.localeCompare(b.id);
}

/**
 * Lee `match_events` para los partidos dados. Nunca tira: si la tabla no
 * existe o falla la consulta, devuelve lo que alcanzo a leer y lo deja en el
 * log, y el consumidor sigue con el JSON heredado.
 */
export async function loadRelationalMatchEvents(
    client: MatchEventsQuery,
    // `object` y no RelationalMatchSide: un Record<string, unknown> no pasa el
    // chequeo de "tipo debil" de TS contra un tipo de campos todos opcionales.
    matches: ReadonlyArray<object>,
): Promise<Map<string, LegacyJsonMatchEvent[]>> {
    const byMatch = new Map<string, LegacyJsonMatchEvent[]>();
    const sides = new Map<string, RelationalMatchSide>();
    for (const match of matches as ReadonlyArray<RelationalMatchSide>) {
        const id = text(match.id);
        if (id) sides.set(id, match);
    }
    if (sides.size === 0) return byMatch;

    for (const ids of chunk(Array.from(sides.keys()), MATCH_ID_CHUNK)) {
        let cursor: string | null = null;
        for (;;) {
            const base = client.from('match_events').select(SELECT_COLUMNS).in('match_id', ids);
            const paged: OrderedQuery = cursor ? base.gt('id', cursor) : base;
            const { data, error } = await paged.order('id', { ascending: true }).limit(PAGE_SIZE);

            if (error) {
                if (!isMissingTableError(error, 'match_events')) {
                    console.warn('[relationalMatchEvents] no se pudieron leer los eventos:', error.message || error);
                }
                return byMatch;
            }

            const rows = data ?? [];
            for (const row of rows) {
                if (CLOCK_EVENT_TYPES.has(text(row.event_type))) continue;
                const matchId = text(row.match_id);
                const match = sides.get(matchId);
                if (!match) continue;
                const list = byMatch.get(matchId) ?? [];
                list.push(mapRelationalEventToLegacyJson(row, match));
                byMatch.set(matchId, list);
            }

            if (rows.length < PAGE_SIZE) break;
            cursor = rows[rows.length - 1].id;
        }
    }

    for (const list of byMatch.values()) list.sort(sortEvents);
    return byMatch;
}

/**
 * Pisa `events` de cada partido con la tabla relacional cuando esta tiene
 * filas; si no, conserva el JSON heredado (partidos cargados antes de la
 * tabla, o importados solo al JSON).
 */
export function mergeRelationalMatchEvents<T extends RelationalMatchSide & { events?: unknown }>(
    matches: T[],
    relational: Map<string, LegacyJsonMatchEvent[]>,
): Array<T & { events: unknown[] | null }> {
    return matches.map((match) => {
        const matchId = text(match.id);
        const fromTable = matchId ? relational.get(matchId) : undefined;
        if (fromTable && fromTable.length > 0) {
            return { ...match, events: fromTable };
        }
        return { ...match, events: Array.isArray(match.events) ? match.events : null };
    });
}
