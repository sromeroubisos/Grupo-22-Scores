import { memoryCache } from '@/lib/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  deleteExpiredMatchesFeedSnapshots,
  deleteMatchesFeedSnapshotsForScope,
  type MatchesFeedCacheInvalidationScope,
} from '@/lib/server/matchesFeedCache';
import {
  LEGACY_MATCHES_RESPONSE_CACHE_PREFIXES,
  MATCHES_RESPONSE_CACHE_PREFIX,
} from '@/lib/server/cacheKeys';

export type MatchesFeedInvalidationScope = MatchesFeedCacheInvalidationScope;

type NormalizedMatchesFeedInvalidationScope = {
  effectiveDate: string;
  sport: string | null;
  statusFilter: string | null;
};

function normalizeDateOnly(value: string | null | undefined) {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function normalizeDateTimeToDate(value: string | Date | null | undefined) {
  if (!value) return null;
  const parsed = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function normalizeSportScope(value: string | null | undefined) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return normalized || null;
}

function normalizeScopes(scopes: MatchesFeedInvalidationScope[]) {
  const byKey = new Map<string, NormalizedMatchesFeedInvalidationScope>();

  for (const scope of scopes) {
    const effectiveDate = normalizeDateOnly(scope.effectiveDate) || normalizeDateTimeToDate(scope.dateTime);
    if (!effectiveDate) continue;

    const sport = normalizeSportScope(scope.sport);
    const statusFilter = normalizeSportScope(scope.statusFilter);
    byKey.set(`${effectiveDate}|${sport || '*'}|${statusFilter || '*'}`, {
      effectiveDate,
      sport,
      statusFilter,
    });
  }

  const dateOnlyScopes = new Set(
    Array.from(byKey.values())
      .filter((scope) => !scope.sport)
      .map((scope) => scope.effectiveDate),
  );

  return Array.from(byKey.values())
    .filter((scope) => !scope.sport || !dateOnlyScopes.has(scope.effectiveDate));
}

function parseMatchesMemoryCacheKey(prefix: string, key: string) {
  const prefixWithSeparator = `${prefix}:`;
  if (!key.startsWith(prefixWithSeparator)) return null;

  const [feedType, effectiveDate, sport, statusFilter] = key.slice(prefixWithSeparator.length).split(':');
  if (!feedType || !effectiveDate || !sport) return null;

  return {
    feedType,
    effectiveDate,
    sport: sport.toLowerCase(),
    statusFilter: (statusFilter || 'all').toLowerCase(),
  };
}

function deleteMemoryCacheByScopes(scopes: NormalizedMatchesFeedInvalidationScope[]) {
  const prefixesToClear = [
    MATCHES_RESPONSE_CACHE_PREFIX,
    ...LEGACY_MATCHES_RESPONSE_CACHE_PREFIXES,
  ];
  let deletedEntries = 0;

  for (const key of memoryCache.stats().keys) {
    const parsed = prefixesToClear
      .map((prefix) => parseMatchesMemoryCacheKey(prefix, key))
      .find((candidate) => candidate !== null);

    if (!parsed) continue;

    const shouldDelete = scopes.some((scope) => (
      parsed.effectiveDate === scope.effectiveDate &&
      (
        !scope.sport ||
        parsed.sport === 'all' ||
        parsed.sport === scope.sport
      ) &&
      (
        !scope.statusFilter ||
        parsed.statusFilter === 'all' ||
        parsed.statusFilter === scope.statusFilter
      )
    ));

    if (!shouldDelete) continue;

    memoryCache.delete(key);
    deletedEntries += 1;
  }

  return deletedEntries;
}

export async function invalidateMatchesFeedCaches(
  client?: any,
  scopes?: MatchesFeedInvalidationScope[],
) {
  const scopedMode = Array.isArray(scopes);
  const normalizedScopes = scopedMode ? normalizeScopes(scopes) : [];

  if (scopedMode) {
    if (normalizedScopes.length > 0) {
      deleteMemoryCacheByScopes(normalizedScopes);
    }
  } else {
    const prefixesToClear = [
      MATCHES_RESPONSE_CACHE_PREFIX,
      // Transitional cleanup for old process-local cache entries.
      ...LEGACY_MATCHES_RESPONSE_CACHE_PREFIXES,
    ];

    prefixesToClear.forEach((prefix) => {
      memoryCache.deleteByPrefix(prefix);
    });
  }

  const supabase = client || (
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
      ? createAdminClient()
      : null
  );

  if (!supabase) {
    console.warn('[matchesFeedInvalidation] Skipping persisted cache invalidation: admin client unavailable.');
    return false;
  }

  if (normalizedScopes.length === 0) {
    return deleteExpiredMatchesFeedSnapshots(supabase);
  }

  const deletedCounts = await Promise.all([
    ...normalizedScopes.map((scope) => deleteMatchesFeedSnapshotsForScope(supabase, scope)),
    deleteExpiredMatchesFeedSnapshots(supabase),
  ]);

  return deletedCounts.reduce((total, count) => total + count, 0);
}
