/**
 * Resultados cargados a mano para partidos de un proveedor virtual que la
 * fuente no publica (el U20 Challenger 2026: World Rugby dejó los partidos en
 * "sin empezar, 0-0" mientras se jugaban).
 *
 * Sin tabla propia a propósito: cada carga es una fila de
 * `external_tournament_standings_overrides` con id `match-result:<id del
 * partido>` y el resultado en `groups`, igual que el respaldo de
 * `externalMatchLineupOverrides.ts`. Así entra sin migración. Esa tabla solo
 * se lee por id, así que estas filas no se cruzan con las tablas de posiciones.
 *
 * Quién gana entre la carga y la fuente lo decide `applyWrManualResults`
 * (worldRugbyEventParser.ts): la fuente oficial, en cuanto publica algo.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { memoryCache } from '@/lib/cache';
import { isMissingTableError } from '@/lib/utils/supabaseSchema';
import { parseWrManualResult, type WrManualResult } from '@/lib/services/worldRugbyEventParser';

const TABLE = 'external_tournament_standings_overrides';
const ID_PREFIX = 'match-result:';
const KIND = 'match_result_override';
/** Corto: con un partido en vivo cada carga tiene que llegar enseguida a todas las instancias. */
const CACHE_TTL_SECONDS = 10;

export type ExternalMatchResultOverride = WrManualResult & {
    matchId: string;
    provider: string;
    updatedBy: string | null;
    updatedAt: string;
};

function cacheKey(provider: string) {
    return `match-result-overrides:${provider}`;
}

function rowToOverride(row: Record<string, unknown>): ExternalMatchResultOverride | null {
    const id = String(row.id || '');
    if (!id.startsWith(ID_PREFIX)) return null;
    const groups = Array.isArray(row.groups) ? row.groups : [];
    const payload = groups.find((group) => (
        group && typeof group === 'object' && (group as Record<string, unknown>).kind === KIND
    )) as Record<string, unknown> | undefined;
    if (!payload) return null;
    const result = parseWrManualResult(payload);
    if (!result) return null;
    return {
        ...result,
        matchId: id.slice(ID_PREFIX.length),
        provider: String(payload.provider || ''),
        updatedBy: payload.updatedBy ? String(payload.updatedBy) : null,
        updatedAt: String(payload.updatedAt || row.updated_at || ''),
    };
}

/**
 * Las cargas de un proveedor, por id de partido de la app (`wr-match-<uuid>`).
 * Nunca lanza: si la base no contesta, el fixture sale como lo publica la fuente.
 */
export async function getExternalMatchResultOverrides(
    provider: string,
    idPrefix: string,
): Promise<Map<string, ExternalMatchResultOverride>> {
    const key = cacheKey(provider);
    const cached = memoryCache.get<Map<string, ExternalMatchResultOverride>>(key);
    if (cached) return cached;

    const overrides = new Map<string, ExternalMatchResultOverride>();
    try {
        const admin = createAdminClient();
        const { data, error } = await admin
            .from(TABLE)
            .select('id, groups, updated_at')
            .like('id', `${ID_PREFIX}${idPrefix}%`)
            .order('id');
        if (error) {
            if (!isMissingTableError(error, TABLE)) {
                console.warn('[Resultado manual] no se pudo leer:', error.message);
            }
            return overrides;
        }
        for (const row of (data ?? []) as Record<string, unknown>[]) {
            const override = rowToOverride(row);
            if (override && override.provider === provider) overrides.set(override.matchId, override);
        }
        memoryCache.set(key, overrides, CACHE_TTL_SECONDS);
    } catch (error) {
        console.warn('[Resultado manual] no se pudo leer:', error instanceof Error ? error.message : error);
    }
    return overrides;
}

export async function upsertExternalMatchResultOverride(input: {
    matchId: string;
    provider: string;
    result: WrManualResult;
    updatedBy: string;
}): Promise<ExternalMatchResultOverride> {
    const now = new Date().toISOString();
    const payload = {
        kind: KIND,
        provider: input.provider,
        ...input.result,
        updatedBy: input.updatedBy,
        updatedAt: now,
    };
    const admin = createAdminClient();
    const { data, error } = await admin
        .from(TABLE)
        .upsert(
            {
                id: `${ID_PREFIX}${input.matchId}`,
                source: `match-result:${input.provider}`,
                groups: [payload],
                assignments: [],
                labels: [],
                updated_at: now,
            },
            { onConflict: 'id' },
        )
        .select('id, groups, updated_at')
        .single();
    if (error || !data) throw new Error(error?.message || 'No se pudo guardar el resultado.');
    memoryCache.delete(cacheKey(input.provider));
    const saved = rowToOverride(data as Record<string, unknown>);
    if (!saved) throw new Error('No se pudo guardar el resultado.');
    return saved;
}

export async function deleteExternalMatchResultOverride(matchId: string, provider: string): Promise<void> {
    const admin = createAdminClient();
    const { error } = await admin.from(TABLE).delete().eq('id', `${ID_PREFIX}${matchId}`);
    if (error) throw new Error(error.message || 'No se pudo borrar el resultado.');
    memoryCache.delete(cacheKey(provider));
}
