import { SupabaseClient } from '@supabase/supabase-js';

export interface FavoriteRow {
    entity_id: string;
}

// Cache structure: 
// Key: `${userId}:${entityType}`
// Value: { promise: Promise<Set<string>>, timestamp: number }
interface CacheEntry {
    promise: Promise<Set<string>>;
    timestamp: number;
}

const cache = new Map<string, CacheEntry>();
const TTL_MS = 120 * 1000; // 120 seconds
const SHORT_TTL_MS = 5 * 1000; // 5 seconds for errors

let requestsSent = 0;

export function clearFavoritesCache(reason?: string) {
    if (cache.size > 0) {
        if (process.env.NEXT_PUBLIC_DEBUG_CACHE === 'true') {
            console.debug(`[FavoriteCache] Clearing cache. Reason: ${reason || 'Manual clear'}`);
        }
        cache.clear();
    }
}

/**
 * Gets a set of favorited entity IDs for a user and entity type.
 * Uses an in-memory cache with TTL.
 */
export async function getFavoriteSet(
    supabase: SupabaseClient,
    userId: string,
    entityType: string
): Promise<Set<string>> {
    const cacheKey = `${userId}:${entityType}`;
    const now = Date.now();

    // Check if cache exists and is fresh
    const cached = cache.get(cacheKey);
    if (cached && (now - cached.timestamp < TTL_MS)) {
        return cached.promise;
    }

    // Cache miss or expired => fetch
    requestsSent++;
    if (process.env.NEXT_PUBLIC_DEBUG_CACHE === 'true') {
        console.debug(`[FavoriteCache] Fetching from DB for key: ${cacheKey}. Total requests this session: ${requestsSent}`);
    }

    const fetchPromise = (async () => {
        const start = performance.now();
        const { data, error } = await supabase.rpc('get_user_favorites', { p_entity_type: entityType });
        const end = performance.now();
        if (process.env.NEXT_PUBLIC_DEBUG_CACHE === 'true') {
            console.debug(`[FavoriteCache] RPC duration for ${cacheKey}: ${(end - start).toFixed(2)}ms`);
        }

        if (error) {
            if (process.env.NEXT_PUBLIC_DEBUG_CACHE === 'true') {
                console.error(`[FavoriteCache] Error fetching favorites:`, error);
            }
            // On error we cache empty set but mark it to expire in 5s
            const cachedEntry = cache.get(cacheKey);
            if (cachedEntry) {
                cachedEntry.timestamp = Date.now() - TTL_MS + SHORT_TTL_MS;
            }
            return new Set<string>();
        }

        if (!data || !Array.isArray(data)) {
            return new Set<string>();
        }

        return new Set<string>((data as FavoriteRow[]).map(f => f.entity_id));
    })();

    cache.set(cacheKey, { promise: fetchPromise, timestamp: now });

    return fetchPromise;
}

/**
 * Synchronously/optimistically updates the cache set if it exists.
 */
export function updateFavoriteSet(userId: string, entityType: string, entityId: string, isFav: boolean): void {
    const cacheKey = `${userId}:${entityType}`;
    const cached = cache.get(cacheKey);

    if (cached) {
        // Reset TTL timestamp so recent interactions stay fresh
        cached.timestamp = Date.now();

        // We fire and forget the promise resolution to mutate the set
        cached.promise.then(favSet => {
            if (isFav) {
                favSet.add(entityId);
            } else {
                favSet.delete(entityId);
            }
        }).catch(() => {
            // Ignore errors here
        });
    }
}
