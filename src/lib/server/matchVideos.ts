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

import { createAdminClient } from '@/lib/supabase/admin';
import { isMissingTableError } from '@/lib/utils/supabaseSchema';
import { normalizeMatchVideoLinks, type MatchVideoLink } from '@/lib/matches/videoLinks';

const TABLE = 'match_videos';
const FALLBACK_TABLE = 'external_tournament_standings_overrides';
const FALLBACK_ID_PREFIX = 'match-videos:';
const FALLBACK_KIND = 'match_videos';

// Los mensajes que llegan al cliente. El error crudo de Supabase (columnas,
// constraints) va solo al log del server.
export const MATCH_VIDEOS_READ_ERROR = 'No se pudieron leer los videos del partido.';
export const MATCH_VIDEOS_WRITE_ERROR = 'No se pudieron guardar los videos del partido.';

export function normalizeMatchVideoKey(matchId: string): string {
    return String(matchId ?? '').trim();
}

function fallbackId(key: string) {
    return `${FALLBACK_ID_PREFIX}${key}`;
}

function parseFallbackRow(row: Record<string, unknown> | null | undefined): MatchVideoLink[] | null {
    if (!row) return null;
    const groups = Array.isArray(row.groups) ? row.groups : [];
    const payload = groups.find((group) => (
        group
        && typeof group === 'object'
        && (group as Record<string, unknown>).kind === FALLBACK_KIND
    )) as Record<string, unknown> | undefined;

    if (!payload) return null;
    return normalizeMatchVideoLinks(payload.videos);
}

/** null = no hay fila (o no hay tabla de respaldo). */
async function readFallback(key: string): Promise<MatchVideoLink[] | null> {
    const admin = createAdminClient();
    const { data, error } = await admin
        .from(FALLBACK_TABLE)
        .select('id, groups')
        .eq('id', fallbackId(key))
        .maybeSingle();

    if (error) {
        if (isMissingTableError(error, FALLBACK_TABLE)) return null;
        console.error('[matchVideos] fallback read failed:', error);
        throw new Error(MATCH_VIDEOS_READ_ERROR);
    }

    return parseFallbackRow(data as Record<string, unknown> | null);
}

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

export async function getMatchVideos(matchId: string): Promise<MatchVideoLink[]> {
    const key = normalizeMatchVideoKey(matchId);
    if (!key) return [];

    const admin = createAdminClient();
    const { data, error } = await admin
        .from(TABLE)
        .select('videos')
        .eq('match_id', key)
        .maybeSingle();

    if (error) {
        if (isMissingTableError(error, TABLE)) return (await readFallback(key)) ?? [];
        console.error('[matchVideos] read failed:', error);
        throw new Error(MATCH_VIDEOS_READ_ERROR);
    }

    if (data) return normalizeMatchVideoLinks((data as { videos?: unknown }).videos);

    // Sin fila en la tabla: pudo quedar en el respaldo de antes de la migración.
    return (await readFallback(key)) ?? [];
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
    const now = new Date().toISOString();
    const admin = createAdminClient();

    const { error } = await admin
        .from(TABLE)
        .upsert(
            {
                match_id: key,
                videos,
                updated_by: input.updatedBy,
                updated_at: now,
            },
            { onConflict: 'match_id' },
        );

    if (error) {
        if (isMissingTableError(error, TABLE)) {
            await writeFallback(key, videos, input.updatedBy, now);
            return videos;
        }
        console.error('[matchVideos] write failed:', error);
        throw new Error(MATCH_VIDEOS_WRITE_ERROR);
    }

    return videos;
}
