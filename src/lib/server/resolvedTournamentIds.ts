import { memoryCache } from '@/lib/cache';
import { createAdminClient } from '@/lib/supabase/admin';

export type ResolvedTournamentIds = {
    tournamentId?: string;
    stageId?: string;
    templateId?: string;
    seasonId?: string;
    url?: string;
};

const CACHE_PREFIX = 'resolved-tids:';
const CACHE_TTL_SECONDS = 24 * 60 * 60; // resolved IDs are stable → refresh daily

const cacheKey = (routeId: string, url?: string) =>
    `${CACHE_PREFIX}${(routeId || url || '').toLowerCase()}`;

export function isCompleteResolvedIds(
    ids?: ResolvedTournamentIds | null,
): ids is ResolvedTournamentIds {
    return Boolean(ids && ids.tournamentId && ids.stageId && ids.templateId && ids.seasonId);
}

export function readResolvedTournamentIds(routeId: string, url?: string): ResolvedTournamentIds | null {
    const cached = memoryCache.get<ResolvedTournamentIds>(cacheKey(routeId, url));
    return isCompleteResolvedIds(cached) ? cached : null;
}

// Fire-and-forget — NEVER awaited on the request path.
export function persistResolvedTournamentIds(params: {
    routeId: string;
    ids: ResolvedTournamentIds;
    dbTournamentMeta: { id?: string | null; slug?: string | null; ruleset?: any } | null;
}): void {
    const { routeId, ids, dbTournamentMeta } = params;
    if (!isCompleteResolvedIds(ids)) return; // never cache partial/broken state

    // 1) Always seed the in-process cache (covers fs-* with no DB row + warm DB rows).
    memoryCache.set(cacheKey(routeId, ids.url), ids, CACHE_TTL_SECONDS);

    // 2) Durable write ONLY for real DB tournaments. fs-* has no row, so it relies on the
    //    in-memory cache above. We deliberately do NOT create rows for external ids —
    //    prior outages came from external ids landing in uuid columns.
    const rowId = dbTournamentMeta?.id;
    if (!rowId) return;

    void (async () => {
        try {
            const admin = createAdminClient();
            const ruleset = (dbTournamentMeta?.ruleset && typeof dbTournamentMeta.ruleset === 'object')
                ? dbTournamentMeta.ruleset as Record<string, unknown>
                : {};
            const external = (ruleset.external && typeof ruleset.external === 'object')
                ? ruleset.external as Record<string, unknown>
                : {};
            const fs = (external.flashscore && typeof external.flashscore === 'object')
                ? external.flashscore as Record<string, unknown>
                : {};

            // Durable va SOLO lo que sobrevive a un cambio de temporada: la URL
            // compartida y la plantilla. `tournament_id`, `tournament_stage_id` y
            // `season_id` son de un año concreto, y guardarlos deja al torneo
            // mirando para siempre la temporada en que se resolvió: el proveedor
            // rueda en julio y la página sigue mostrando la anterior. Con la URL
            // guardada, la resolución vuelve a ser UNA llamada memoizada 24h
            // —no el barrido que motivó este archivo— y siempre cae en la
            // temporada corriente.
            //
            // El set completo sigue viviendo en la caché de proceso de arriba,
            // que caduca sola en 24h: rápido dentro del día, nunca eterno.
            const nextFs = {
                ...fs,
                tournament_template_id: ids.templateId,
                ...(ids.url ? { tournament_url: ids.url } : {}),
            };

            const unchanged =
                fs.tournament_template_id === nextFs.tournament_template_id &&
                fs.tournament_url === nextFs.tournament_url;
            if (unchanged) return; // skip a DB round-trip when nothing changed

            const nextRuleset = { ...ruleset, external: { ...external, flashscore: nextFs } };
            await admin.from('tournaments').update({ ruleset: nextRuleset }).eq('id', rowId);
        } catch (error) {
            console.warn('[resolvedTournamentIds] durable persist failed (non-fatal):', error);
        }
    })();
}
