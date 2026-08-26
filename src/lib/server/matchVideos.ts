// Dónde viven los videos de un partido.
//
// Tabla propia `match_videos` (una fila por partido, la lista en JSONB) y, si
// la migración todavía no corrió, el mismo respaldo que usan los overrides de
// alineación externa: una fila en `external_tournament_standings_overrides`
// con id 'match-videos:{matchId}'. La lectura mira los dos lugares, así
// aplicar la migración no esconde lo que se cargó antes.
//
// La llave es el id del partido tal como viaja en la URL: uuid para los
// locales, id del proveedor para los externos. Un video se cuelga de
// cualquiera de los dos por igual.
//
// La portada de cada video (la que publica la plataforma) se resuelve una
// sola vez y queda en el link. Una fila vieja sin portada la completa la
// primera lectura que la encuentre, con un tope de tiempo para no frenar la
// ficha; lo que no llega a tiempo se reintenta en la siguiente.

import { createAdminClient } from '@/lib/supabase/admin';
import type { LooseSupabaseClient } from '@/lib/supabase/loose';
import { isMissingTableError } from '@/lib/utils/supabaseSchema';
import {
    needsThumbnailLookup,
    normalizeMatchVideoLinks,
    type MatchVideoLink,
} from '@/lib/matches/videoLinks';
import { enrichVideoThumbnails } from '@/lib/server/videoThumbnails';

const TABLE = 'match_videos';
const FALLBACK_TABLE = 'external_tournament_standings_overrides';
const FALLBACK_ID_PREFIX = 'match-videos:';
const FALLBACK_KIND = 'match_videos';
const IN_CHUNK = 100;
const PAGE = 500;

/** Cuánto espera una lectura común (la ficha del partido) a las portadas que faltan. */
const READ_THUMBNAIL_BUDGET_MS = 3000;

// Los mensajes que llegan al cliente. El error crudo de Supabase (columnas,
// constraints) va solo al log del server.
export const MATCH_VIDEOS_READ_ERROR = 'No se pudieron leer los videos del partido.';
export const MATCH_VIDEOS_WRITE_ERROR = 'No se pudieron guardar los videos del partido.';

export interface StoredMatchVideos {
    matchId: string;
    videos: MatchVideoLink[];
    updatedBy: string | null;
    updatedAt: string | null;
}

export interface ReadMatchVideosOptions {
    /** Tope para completar portadas que faltan. 0 = no buscar. */
    thumbnailBudgetMs?: number;
}

type Row = Record<string, unknown>;

export function normalizeMatchVideoKey(matchId: string): string {
    return String(matchId ?? '').trim();
}

function fallbackId(key: string) {
    return `${FALLBACK_ID_PREFIX}${key}`;
}

function text(value: unknown): string | null {
    return typeof value === 'string' && value ? value : null;
}

function chunks<T>(items: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
    return out;
}

function parseTableRow(row: Row | null | undefined): StoredMatchVideos | null {
    const matchId = text(row?.match_id);
    if (!matchId) return null;
    return {
        matchId,
        videos: normalizeMatchVideoLinks(row?.videos),
        updatedBy: text(row?.updated_by),
        updatedAt: text(row?.updated_at),
    };
}

function parseFallbackRow(row: Row | null | undefined): StoredMatchVideos | null {
    const id = text(row?.id);
    if (!id || !id.startsWith(FALLBACK_ID_PREFIX)) return null;

    const groups = Array.isArray(row?.groups) ? (row!.groups as unknown[]) : [];
    const payload = groups.find((group) => (
        group
        && typeof group === 'object'
        && (group as Row).kind === FALLBACK_KIND
    )) as Row | undefined;
    if (!payload) return null;

    return {
        matchId: id.slice(FALLBACK_ID_PREFIX.length),
        videos: normalizeMatchVideoLinks(payload.videos),
        updatedBy: text(payload.updated_by),
        updatedAt: text(payload.updated_at) ?? text(row?.updated_at),
    };
}

// ── Lectura ───────────────────────────────────────────────────────────────

/** null = la tabla no existe todavía. */
async function readTableMany(keys: string[]): Promise<Map<string, StoredMatchVideos> | null> {
    const admin = createAdminClient();
    const { data, error } = await admin
        .from(TABLE)
        .select('match_id, videos, updated_by, updated_at')
        .in('match_id', keys);

    if (error) {
        if (isMissingTableError(error, TABLE)) return null;
        console.error('[matchVideos] read failed:', error);
        throw new Error(MATCH_VIDEOS_READ_ERROR);
    }

    const out = new Map<string, StoredMatchVideos>();
    for (const row of (data ?? []) as Row[]) {
        const stored = parseTableRow(row);
        if (stored) out.set(stored.matchId, stored);
    }
    return out;
}

async function readFallbackMany(keys: string[]): Promise<Map<string, StoredMatchVideos>> {
    const admin = createAdminClient();
    const { data, error } = await admin
        .from(FALLBACK_TABLE)
        .select('id, groups, updated_at')
        .in('id', keys.map(fallbackId));

    const out = new Map<string, StoredMatchVideos>();
    if (error) {
        if (isMissingTableError(error, FALLBACK_TABLE)) return out;
        console.error('[matchVideos] fallback read failed:', error);
        throw new Error(MATCH_VIDEOS_READ_ERROR);
    }

    for (const row of (data ?? []) as Row[]) {
        const stored = parseFallbackRow(row);
        if (stored) out.set(stored.matchId, stored);
    }
    return out;
}

async function readStoredMany(keys: string[]): Promise<Map<string, StoredMatchVideos>> {
    const out = new Map<string, StoredMatchVideos>();
    for (const chunk of chunks(keys, IN_CHUNK)) {
        const [fromTable, fromFallback] = await Promise.all([readTableMany(chunk), readFallbackMany(chunk)]);
        // La fila vieja del respaldo vale si la tabla no la tiene; si la tiene, la tabla manda.
        for (const [key, stored] of fromFallback) out.set(key, stored);
        for (const [key, stored] of fromTable ?? []) out.set(key, stored);
    }
    return out;
}

/** null = la tabla no existe. */
async function readAllPages(
    table: string,
    columns: string,
    refine: (query: LooseSupabaseClient) => LooseSupabaseClient,
): Promise<Row[] | null> {
    const admin = createAdminClient();
    const rows: Row[] = [];

    for (let from = 0; ; from += PAGE) {
        const { data, error } = await refine(admin.from(table).select(columns)).range(from, from + PAGE - 1);
        if (error) {
            if (isMissingTableError(error, table)) return null;
            console.error(`[matchVideos] ${table} list failed:`, error);
            throw new Error(MATCH_VIDEOS_READ_ERROR);
        }
        const page = (data ?? []) as Row[];
        rows.push(...page);
        if (page.length < PAGE) break;
    }

    return rows;
}

/** Todo lo cargado, para armar los hubs por torneo. Sin buscar portadas: es un índice. */
export async function listStoredMatchVideos(): Promise<StoredMatchVideos[]> {
    const [tableRows, fallbackRows] = await Promise.all([
        readAllPages(TABLE, 'match_id, videos, updated_by, updated_at', (query) => query.order('match_id')),
        readAllPages(FALLBACK_TABLE, 'id, groups, updated_at', (query) => query.like('id', `${FALLBACK_ID_PREFIX}%`).order('id')),
    ]);

    const out = new Map<string, StoredMatchVideos>();
    for (const row of fallbackRows ?? []) {
        const stored = parseFallbackRow(row);
        if (stored) out.set(stored.matchId, stored);
    }
    for (const row of tableRows ?? []) {
        const stored = parseTableRow(row);
        if (stored) out.set(stored.matchId, stored);
    }

    return Array.from(out.values()).filter((stored) => stored.videos.length > 0);
}

// ── Escritura ─────────────────────────────────────────────────────────────

async function writeFallback(key: string, videos: MatchVideoLink[], updatedBy: string | null, now: string) {
    const admin = createAdminClient();
    const payload = {
        kind: FALLBACK_KIND,
        videos,
        updated_by: updatedBy,
        updated_at: now,
    };

    const { error } = await admin
        .from(FALLBACK_TABLE)
        .upsert(
            {
                id: fallbackId(key),
                source: 'match-videos',
                groups: [payload],
                assignments: [],
                labels: [],
                updated_at: now,
            },
            { onConflict: 'id' },
        );

    if (error) {
        console.error('[matchVideos] fallback write failed:', error);
        throw new Error(MATCH_VIDEOS_WRITE_ERROR);
    }
}

async function writeStored(key: string, videos: MatchVideoLink[], updatedBy: string | null, now: string): Promise<void> {
    const admin = createAdminClient();
    const { error } = await admin
        .from(TABLE)
        .upsert(
            {
                match_id: key,
                videos,
                updated_by: updatedBy,
                updated_at: now,
            },
            { onConflict: 'match_id' },
        );

    if (error) {
        if (isMissingTableError(error, TABLE)) {
            await writeFallback(key, videos, updatedBy, now);
            return;
        }
        console.error('[matchVideos] write failed:', error);
        throw new Error(MATCH_VIDEOS_WRITE_ERROR);
    }
}

// ── Portadas ──────────────────────────────────────────────────────────────

/**
 * Completa las portadas que faltan y las deja guardadas. Si no se puede
 * persistir, la lectura igual devuelve lo resuelto: la portada se ve y se
 * vuelve a intentar guardar la próxima vez.
 */
async function settleThumbnails(stored: StoredMatchVideos, budgetMs: number): Promise<MatchVideoLink[]> {
    if (budgetMs <= 0 || !stored.videos.some(needsThumbnailLookup)) return stored.videos;

    const { videos, changed } = await enrichVideoThumbnails(stored.videos, { budgetMs });
    if (changed) {
        try {
            await writeStored(stored.matchId, videos, stored.updatedBy, new Date().toISOString());
        } catch (error) {
            console.error('[matchVideos] no se pudo persistir la portada:', error);
        }
    }
    return videos;
}

// ── Lo que usan la API y las páginas ──────────────────────────────────────

export async function getMatchVideos(matchId: string, options: ReadMatchVideosOptions = {}): Promise<MatchVideoLink[]> {
    const key = normalizeMatchVideoKey(matchId);
    if (!key) return [];

    const stored = (await readStoredMany([key])).get(key);
    if (!stored) return [];

    return settleThumbnails(stored, options.thumbnailBudgetMs ?? READ_THUMBNAIL_BUDGET_MS);
}

/** Los videos de varios partidos a la vez (el hub). Solo figuran los que tienen algo. */
export async function getMatchVideosForMatches(
    matchIds: string[],
    options: ReadMatchVideosOptions = {},
): Promise<Map<string, MatchVideoLink[]>> {
    const keys = Array.from(new Set(matchIds.map(normalizeMatchVideoKey).filter(Boolean)));
    const out = new Map<string, MatchVideoLink[]>();
    if (keys.length === 0) return out;

    const stored = await readStoredMany(keys);
    const budgetMs = options.thumbnailBudgetMs ?? READ_THUMBNAIL_BUDGET_MS;
    await Promise.all(Array.from(stored.values()).map(async (entry) => {
        const videos = await settleThumbnails(entry, budgetMs);
        if (videos.length > 0) out.set(entry.matchId, videos);
    }));

    return out;
}

/**
 * Reemplaza la lista entera. Son pocos links por partido y la pestaña los
 * edita todos juntos: un upsert es más simple y más seguro que borrar e
 * insertar de a uno.
 */
export async function saveMatchVideos(input: {
    matchId: string;
    videos: MatchVideoLink[];
    updatedBy: string | null;
}): Promise<MatchVideoLink[]> {
    const key = normalizeMatchVideoKey(input.matchId);
    if (!key) throw new Error(MATCH_VIDEOS_WRITE_ERROR);

    const videos = normalizeMatchVideoLinks(input.videos);
    await writeStored(key, videos, input.updatedBy, new Date().toISOString());
    return videos;
}
