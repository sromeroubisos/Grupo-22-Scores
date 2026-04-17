import type { SupabaseClient } from '@supabase/supabase-js';
import { memoryCache } from '@/lib/cache';
import { clearMatchesFeedSnapshots } from '@/lib/server/matchesFeedCache';
import { clearTournamentsFeedSnapshots } from '@/lib/server/tournamentsFeedCache';

const PUBLIC_TOURNAMENTS_CACHE_PREFIX = 'public-tournaments-response:v3';
const MATCHES_CACHE_PREFIX = 'matches-response:v3';

export async function invalidateExternalTournamentApiCaches(
    supabase: SupabaseClient,
) {
    const deletedPublicTournamentEntries = memoryCache.deleteByPrefix(PUBLIC_TOURNAMENTS_CACHE_PREFIX);
    const deletedMatchEntries = memoryCache.deleteByPrefix(MATCHES_CACHE_PREFIX);

    const [tournamentsSnapshotsCleared, matchesSnapshotsCleared] = await Promise.all([
        clearTournamentsFeedSnapshots(supabase),
        clearMatchesFeedSnapshots(supabase),
    ]);

    return {
        deletedPublicTournamentEntries,
        deletedMatchEntries,
        tournamentsSnapshotsCleared,
        matchesSnapshotsCleared,
    };
}
