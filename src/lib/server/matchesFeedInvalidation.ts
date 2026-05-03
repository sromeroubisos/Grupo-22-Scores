import { memoryCache } from '@/lib/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { clearMatchesFeedSnapshots } from '@/lib/server/matchesFeedCache';

export const MATCHES_RESPONSE_CACHE_PREFIX = 'matches-response:v5';

export async function invalidateMatchesFeedCaches(client?: any) {
  memoryCache.deleteByPrefix(MATCHES_RESPONSE_CACHE_PREFIX);

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
