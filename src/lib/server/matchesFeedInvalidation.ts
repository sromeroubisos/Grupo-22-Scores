import { memoryCache } from '@/lib/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { clearMatchesFeedSnapshots } from '@/lib/server/matchesFeedCache';
import {
  LEGACY_MATCHES_RESPONSE_CACHE_PREFIXES,
  MATCHES_RESPONSE_CACHE_PREFIX,
} from '@/lib/server/cacheKeys';

export async function invalidateMatchesFeedCaches(client?: any) {
  const prefixesToClear = [
    MATCHES_RESPONSE_CACHE_PREFIX,
    // Transitional cleanup for old process-local cache entries.
    ...LEGACY_MATCHES_RESPONSE_CACHE_PREFIXES,
  ];

  prefixesToClear.forEach((prefix) => {
    memoryCache.deleteByPrefix(prefix);
  });

  const supabase = client || (
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
      ? createAdminClient()
      : null
  );

  if (!supabase) {
    console.warn('[matchesFeedInvalidation] Skipping persisted cache invalidation: admin client unavailable.');
    return false;
  }

  return clearMatchesFeedSnapshots(supabase);
}
