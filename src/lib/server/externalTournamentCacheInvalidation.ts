import type { SupabaseClient } from '@supabase/supabase-js';
import { memoryCache } from '@/lib/cache';
import { deleteExpiredMatchesFeedSnapshots } from '@/lib/server/matchesFeedCache';
import { deleteExpiredTournamentsFeedSnapshots } from '@/lib/server/tournamentsFeedCache';
import {
    LEGACY_MATCHES_RESPONSE_CACHE_PREFIXES,
    LEGACY_PUBLIC_TOURNAMENTS_RESPONSE_CACHE_PREFIXES,
    MATCHES_RESPONSE_CACHE_PREFIX,
    PUBLIC_TOURNAMENTS_RESPONSE_CACHE_PREFIX,
} from '@/lib/server/cacheKeys';

export async function invalidateExternalTournamentApiCaches(
    supabase: SupabaseClient,
) {
    const deletedPublicTournamentEntries = [
        PUBLIC_TOURNAMENTS_RESPONSE_CACHE_PREFIX,
        // Transitional cleanup for old process-local cache entries.
        ...LEGACY_PUBLIC_TOURNAMENTS_RESPONSE_CACHE_PREFIXES,
    ].reduce((deleted, prefix) => deleted + memoryCache.deleteByPrefix(prefix), 0);
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
