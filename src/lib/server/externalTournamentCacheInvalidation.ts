import type { SupabaseClient } from '@supabase/supabase-js';
import { memoryCache } from '@/lib/cache';
import { deleteExpiredMatchesFeedSnapshots } from '@/lib/server/matchesFeedCache';
import { deleteExpiredTournamentsFeedSnapshots } from '@/lib/server/tournamentsFeedCache';
import {
    HOME_MANUAL_TOURNAMENTS_CACHE_PREFIX,
    LEGACY_MATCHES_RESPONSE_CACHE_PREFIXES,
    LEGACY_PUBLIC_TOURNAMENTS_RESPONSE_CACHE_PREFIXES,
    MATCHES_RESPONSE_CACHE_PREFIX,
    PUBLIC_TOURNAMENTS_RESPONSE_CACHE_PREFIX,
} from '@/lib/server/cacheKeys';

// Version liviana y sincrona: solo memoria, sin tocar Supabase. Se llama cuando
// se crea, edita o borra un torneo, para que el listado publico no espere a que
// venzan los TTL. Limpia por prefijo, asi cubre respuestas, filas y catalogo.
export function invalidatePublicTournamentListCaches() {
    return [
        PUBLIC_TOURNAMENTS_RESPONSE_CACHE_PREFIX,
        HOME_MANUAL_TOURNAMENTS_CACHE_PREFIX,
        ...LEGACY_PUBLIC_TOURNAMENTS_RESPONSE_CACHE_PREFIXES,
    ].reduce((deleted, prefix) => deleted + memoryCache.deleteByPrefix(prefix), 0);
}

export async function invalidateExternalTournamentApiCaches(
    supabase: SupabaseClient,
) {
    const deletedPublicTournamentEntries = invalidatePublicTournamentListCaches();
    const deletedMatchEntries = [
        MATCHES_RESPONSE_CACHE_PREFIX,
        // Transitional cleanup for old process-local cache entries.
        ...LEGACY_MATCHES_RESPONSE_CACHE_PREFIXES,
    ].reduce((deleted, prefix) => deleted + memoryCache.deleteByPrefix(prefix), 0);

    const tournamentsSnapshotsDeleted = await deleteExpiredTournamentsFeedSnapshots(supabase);
    const matchesSnapshotsDeleted = await deleteExpiredMatchesFeedSnapshots(supabase);

    return {
        deletedPublicTournamentEntries,
        deletedMatchEntries,
        tournamentsSnapshotsCleared: true,
        tournamentsSnapshotsDeleted,
        matchesSnapshotsCleared: true,
        matchesSnapshotsDeleted,
    };
}
