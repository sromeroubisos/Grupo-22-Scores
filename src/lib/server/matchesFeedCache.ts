import type { SupabaseClient } from '@supabase/supabase-js';
import { isMissingColumnError, isMissingTableError } from '@/lib/utils/supabaseSchema';

const MATCHES_FEED_CACHE_TABLE = 'matches_feed_cache';
const MAX_PERSISTED_MATCHES_FEED_PAYLOAD_BYTES = 750_000;
const MATCHES_FEED_CACHE_META_COLUMNS = [
    'cache_key',
    'feed_type',
    'sport',
    'effective_date',
    'time_zone',
    'status_filter',
    'external_mode',
    'source_summary',
    'generated_at',
    'expires_at',
    'fresh_until',
    'stale_until',
    'payload_size_bytes',
    'last_refresh_started_at',
    'last_refresh_completed_at',
].join(', ');
const MATCHES_FEED_CACHE_META_COLUMNS_LEGACY = [
    'cache_key',
    'feed_type',
    'sport',
    'effective_date',
    'time_zone',
    'status_filter',
    'external_mode',
    'source_summary',
    'generated_at',
    'expires_at',
    'last_refresh_started_at',
    'last_refresh_completed_at',
].join(', ');

let cleanupInFlight: Promise<number> | null = null;
const scopedDeletionInFlight = new Map<string, Promise<number>>();

export type MatchesFeedType = 'daily' | 'live';

export type PersistedMatchesFeedSnapshotMeta = {
    cacheKey: string;
    feedType: MatchesFeedType;
    sport: string | null;
    effectiveDate: string | null;
    timeZone: string;
    statusFilter: string | null;
    externalMode: boolean;
    sourceSummary: unknown;
    generatedAt: string;
    expiresAt: string;
    freshUntil: string | null;
    staleUntil: string | null;
    payloadSizeBytes: number | null;
    lastRefreshStartedAt: string | null;
    lastRefreshCompletedAt: string | null;
};

export type PersistedMatchesFeedSnapshot<T> = PersistedMatchesFeedSnapshotMeta & {
    payload: T;
};

type PersistedMatchesFeedRow = {
    cache_key: string;
    feed_type: MatchesFeedType;
    sport: string | null;
    effective_date: string | null;
    time_zone: string;
    status_filter: string | null;
    external_mode: boolean;
    payload_json: unknown;
    source_summary: unknown;
    generated_at: string;
    expires_at: string;
    fresh_until: string | null;
    stale_until: string | null;
    payload_size_bytes: number | null;
    last_refresh_started_at: string | null;
    last_refresh_completed_at: string | null;
};

type CacheCleanupError = {
    code?: string | null;
    message?: string | null;
    details?: string | null;
    hint?: string | null;
};

export type MatchesFeedCacheInvalidationScope = {
    effectiveDate?: string | null;
    dateTime?: string | Date | null;
    sport?: string | null;
    statusFilter?: string | null;
};

type NormalizedMatchesFeedCacheInvalidationScope = {
    effectiveDate: string | null;
    dateTime: string | null;
    sport: string | null;
    statusFilter: string | null;
};

export type UpsertMatchesFeedSnapshotInput<T> = {
    cacheKey: string;
    feedType: MatchesFeedType;
    sport?: string;
    effectiveDate?: string | null;
    timeZone: string;
    statusFilter?: string | null;
    externalMode: boolean;
    payload: T;
    sourceSummary?: unknown;
    generatedAt?: Date;
    freshTtlSeconds: number;
    staleTtlSeconds: number;
    lastRefreshStartedAt?: Date | null;
    lastRefreshCompletedAt?: Date | null;
};

function mapRowToSnapshotMeta(row: PersistedMatchesFeedRow): PersistedMatchesFeedSnapshotMeta {
    return {
        cacheKey: row.cache_key,
        feedType: row.feed_type,
        sport: row.sport,
        effectiveDate: row.effective_date,
        timeZone: row.time_zone,
        statusFilter: row.status_filter,
        externalMode: row.external_mode,
        sourceSummary: row.source_summary,
        generatedAt: row.generated_at,
        expiresAt: row.expires_at,
        freshUntil: row.fresh_until || row.expires_at,
        staleUntil: row.stale_until,
        payloadSizeBytes: row.payload_size_bytes,
        lastRefreshStartedAt: row.last_refresh_started_at,
        lastRefreshCompletedAt: row.last_refresh_completed_at,
    };
}

function mapRowToSnapshot<T>(row: PersistedMatchesFeedRow): PersistedMatchesFeedSnapshot<T> {
    return {
        ...mapRowToSnapshotMeta(row),
        payload: row.payload_json as T,
    };
}

function shouldLogDbDebug() {
    return process.env.DEBUG_DB_QUERIES === 'true';
}

function normalizeCleanupLimit(limit: number) {
    if (!Number.isFinite(limit)) return 500;
    return Math.max(1, Math.min(Math.floor(limit), 5000));
}

function normalizeDateOnly(value: string | null | undefined) {
    if (!value) return null;
    const trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toISOString().slice(0, 10);
}

function normalizeDateTime(value: string | Date | null | undefined) {
    if (!value) return null;
    const parsed = typeof value === 'string' ? new Date(value) : value;
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toISOString();
}

function normalizeSportScope(value: string | null | undefined) {
    if (typeof value !== 'string') return null;
    const normalized = value.trim().toLowerCase();
    return normalized || null;
}

function normalizeInvalidationScope(
    scope: MatchesFeedCacheInvalidationScope,
): NormalizedMatchesFeedCacheInvalidationScope | null {
    const effectiveDate = normalizeDateOnly(scope.effectiveDate);
    const dateTime = normalizeDateTime(scope.dateTime);

    if (!effectiveDate && !dateTime) {
        return null;
    }

    return {
        effectiveDate,
        dateTime,
        sport: normalizeSportScope(scope.sport),
        statusFilter: normalizeSportScope(scope.statusFilter),
    };
}

function getScopeFlightKey(scope: NormalizedMatchesFeedCacheInvalidationScope, limit: number) {
    return [
        scope.effectiveDate || 'no-date',
        scope.dateTime || 'no-date-time',
        scope.sport || 'all-sports',
        scope.statusFilter || 'all-statuses',
        normalizeCleanupLimit(limit),
    ].join('|');
}

function serializeDbLog(metadata: Record<string, unknown>) {
    return Object.entries(metadata)
        .filter(([, value]) => value !== undefined && value !== null && value !== '')
        .map(([key, value]) => `${key}=${String(value).replace(/\s+/g, ' ').trim()}`)
        .join(' ');
}

function logDbDebug(metadata: Record<string, unknown>) {
    if (!shouldLogDbDebug()) return;
    const body = serializeDbLog(metadata);
    console.log(body ? `[DB] ${body}` : '[DB]');
}

function isMissingCleanupRpcError(error: CacheCleanupError | null | undefined) {
    if (!error) return false;
    const code = String(error.code || '').toUpperCase();
    const message = String(error.message || '').toLowerCase();
    return (
        code === '42883' ||
        code === 'PGRST202' ||
        message.includes('delete_expired_matches_feed_cache') ||
        message.includes('delete_matches_feed_cache_for_scope') ||
        message.includes('function') && message.includes('not found')
    );
}

export async function readMatchesFeedSnapshotMetadata(
    supabase: SupabaseClient,
    cacheKey: string,
): Promise<PersistedMatchesFeedSnapshotMeta | null> {
    let { data, error } = await supabase
        .from(MATCHES_FEED_CACHE_TABLE)
        .select(MATCHES_FEED_CACHE_META_COLUMNS)
        .eq('cache_key', cacheKey)
        .maybeSingle();

    if (
        error &&
        (
            isMissingColumnError(error, 'fresh_until') ||
            isMissingColumnError(error, 'stale_until') ||
            isMissingColumnError(error, 'payload_size_bytes')
        )
    ) {
        const legacyResult = await supabase
            .from(MATCHES_FEED_CACHE_TABLE)
            .select(MATCHES_FEED_CACHE_META_COLUMNS_LEGACY)
            .eq('cache_key', cacheKey)
            .maybeSingle();

        data = legacyResult.data;
        error = legacyResult.error;
    }

    if (error) {
        if (isMissingTableError(error, MATCHES_FEED_CACHE_TABLE)) {
            return null;
        }

        console.error('[matchesFeedCache] read error:', error);
        return null;
    }

    if (!data) {
        return null;
    }

    return mapRowToSnapshotMeta(data as unknown as PersistedMatchesFeedRow);
}

export async function readMatchesFeedSnapshotPayload<T>(
    supabase: SupabaseClient,
    cacheKey: string,
): Promise<PersistedMatchesFeedSnapshot<T> | null> {
    let { data, error } = await supabase
        .from(MATCHES_FEED_CACHE_TABLE)
        .select(`payload_json, ${MATCHES_FEED_CACHE_META_COLUMNS}`)
        .eq('cache_key', cacheKey)
        .maybeSingle();

    if (
        error &&
        (
            isMissingColumnError(error, 'fresh_until') ||
            isMissingColumnError(error, 'stale_until') ||
            isMissingColumnError(error, 'payload_size_bytes')
        )
    ) {
        const legacyResult = await supabase
            .from(MATCHES_FEED_CACHE_TABLE)
            .select(`payload_json, ${MATCHES_FEED_CACHE_META_COLUMNS_LEGACY}`)
            .eq('cache_key', cacheKey)
            .maybeSingle();

        data = legacyResult.data;
        error = legacyResult.error;
    }

    if (error) {
        if (isMissingTableError(error, MATCHES_FEED_CACHE_TABLE)) {
            return null;
        }

        console.error('[matchesFeedCache] payload read error:', error);
        return null;
    }

    if (!data) {
        return null;
    }

    return mapRowToSnapshot<T>(data as unknown as PersistedMatchesFeedRow);
}

export async function readUsableMatchesFeedSnapshot<T>(
    supabase: SupabaseClient,
    cacheKey: string,
    staleAfterIso: string,
): Promise<PersistedMatchesFeedSnapshot<T> | null> {
    const { data, error } = await supabase
        .from(MATCHES_FEED_CACHE_TABLE)
        .select(`payload_json, ${MATCHES_FEED_CACHE_META_COLUMNS}`)
        .eq('cache_key', cacheKey)
        .gt('stale_until', staleAfterIso)
        .maybeSingle();

    if (
        error &&
        (
            isMissingColumnError(error, 'fresh_until') ||
            isMissingColumnError(error, 'stale_until') ||
            isMissingColumnError(error, 'payload_size_bytes')
        )
    ) {
        return readMatchesFeedSnapshotPayload<T>(supabase, cacheKey);
    }

    if (error) {
        if (isMissingTableError(error, MATCHES_FEED_CACHE_TABLE)) {
            return null;
        }

        console.error('[matchesFeedCache] usable snapshot read error:', error);
        return null;
    }

    if (!data) {
        return null;
    }

    return mapRowToSnapshot<T>(data as unknown as PersistedMatchesFeedRow);
}

export async function upsertMatchesFeedSnapshot<T>(
    supabase: SupabaseClient,
    input: UpsertMatchesFeedSnapshotInput<T>,
): Promise<boolean> {
    const generatedAt = input.generatedAt || new Date();
    const freshUntil = new Date(generatedAt.getTime() + input.freshTtlSeconds * 1000);
    const staleUntil = new Date(generatedAt.getTime() + input.staleTtlSeconds * 1000);
    const payloadSizeBytes = new TextEncoder().encode(JSON.stringify(input.payload)).length;

    if (payloadSizeBytes > MAX_PERSISTED_MATCHES_FEED_PAYLOAD_BYTES) {
        console.warn('[matchesFeedCache] skipping oversized snapshot write:', {
            cacheKey: input.cacheKey,
            payloadSizeBytes,
            maxBytes: MAX_PERSISTED_MATCHES_FEED_PAYLOAD_BYTES,
        });
        return false;
    }

    const payload = {
        cache_key: input.cacheKey,
        feed_type: input.feedType,
        sport: input.sport || null,
        effective_date: input.effectiveDate || null,
        time_zone: input.timeZone,
        status_filter: input.statusFilter || null,
        external_mode: input.externalMode,
        payload_json: input.payload,
        source_summary: input.sourceSummary ?? {},
        generated_at: generatedAt.toISOString(),
        expires_at: freshUntil.toISOString(),
        fresh_until: freshUntil.toISOString(),
        stale_until: staleUntil.toISOString(),
        payload_size_bytes: payloadSizeBytes,
        last_refresh_started_at: input.lastRefreshStartedAt ? input.lastRefreshStartedAt.toISOString() : generatedAt.toISOString(),
        last_refresh_completed_at: input.lastRefreshCompletedAt ? input.lastRefreshCompletedAt.toISOString() : generatedAt.toISOString(),
    };

    let { error } = await supabase
        .from(MATCHES_FEED_CACHE_TABLE)
        .upsert(payload, { onConflict: 'cache_key' });

    if (
        error &&
        (
            isMissingColumnError(error, 'fresh_until') ||
            isMissingColumnError(error, 'stale_until') ||
            isMissingColumnError(error, 'payload_size_bytes')
        )
    ) {
        const legacyPayload = {
            cache_key: input.cacheKey,
            feed_type: input.feedType,
            sport: input.sport || null,
            effective_date: input.effectiveDate || null,
            time_zone: input.timeZone,
            status_filter: input.statusFilter || null,
            external_mode: input.externalMode,
            payload_json: input.payload,
            source_summary: input.sourceSummary ?? {},
            generated_at: generatedAt.toISOString(),
            expires_at: freshUntil.toISOString(),
            last_refresh_started_at: input.lastRefreshStartedAt ? input.lastRefreshStartedAt.toISOString() : generatedAt.toISOString(),
            last_refresh_completed_at: input.lastRefreshCompletedAt ? input.lastRefreshCompletedAt.toISOString() : generatedAt.toISOString(),
        };

        const legacyResult = await supabase
            .from(MATCHES_FEED_CACHE_TABLE)
            .upsert(legacyPayload, { onConflict: 'cache_key' });

        error = legacyResult.error;
    }

    if (error) {
        if (isMissingTableError(error, MATCHES_FEED_CACHE_TABLE)) {
            return false;
        }

        console.error('[matchesFeedCache] upsert error:', error);
        return false;
    }

    return true;
}

async function runDeleteExpiredMatchesFeedSnapshots(
    supabase: SupabaseClient,
    limit: number,
): Promise<number> {
    const safeLimit = normalizeCleanupLimit(limit);
    const startedAt = Date.now();

    try {
        const { data, error } = await (supabase as any).rpc('delete_expired_matches_feed_cache', {
            p_limit: safeLimit,
        });

        if (error) {
            if (isMissingTableError(error, MATCHES_FEED_CACHE_TABLE) || isMissingCleanupRpcError(error)) {
                logDbDebug({
                    operation: 'deleteExpiredMatchesFeedSnapshots',
                    table: MATCHES_FEED_CACHE_TABLE,
                    action: 'rpc',
                    durationMs: Date.now() - startedAt,
                    status: 'skipped',
                    reason: isMissingCleanupRpcError(error) ? 'missing_rpc' : 'missing_table',
                    limit: safeLimit,
                });
                return 0;
            }

            console.error('[matchesFeedCache] expired cleanup error:', error);
            logDbDebug({
                operation: 'deleteExpiredMatchesFeedSnapshots',
                table: MATCHES_FEED_CACHE_TABLE,
                action: 'rpc',
                durationMs: Date.now() - startedAt,
                status: 'error',
                errorCode: error.code,
                errorMessage: error.message,
                limit: safeLimit,
            });
            return 0;
        }

        const deletedRows = typeof data === 'number' ? data : Number(data || 0);
        const normalizedDeletedRows = Number.isFinite(deletedRows) ? deletedRows : 0;
        logDbDebug({
            operation: 'deleteExpiredMatchesFeedSnapshots',
            table: MATCHES_FEED_CACHE_TABLE,
            action: 'rpc',
            durationMs: Date.now() - startedAt,
            status: 'ok',
            rowsDeleted: normalizedDeletedRows,
            limit: safeLimit,
        });
        return normalizedDeletedRows;
    } catch (error) {
        console.error('[matchesFeedCache] expired cleanup failed:', error);
        logDbDebug({
            operation: 'deleteExpiredMatchesFeedSnapshots',
            table: MATCHES_FEED_CACHE_TABLE,
            action: 'rpc',
            durationMs: Date.now() - startedAt,
            status: 'error',
            errorMessage: error instanceof Error ? error.message : String(error),
            limit: safeLimit,
        });
        return 0;
    }
}

export async function deleteExpiredMatchesFeedSnapshots(
    supabase: SupabaseClient,
    limit = 500,
): Promise<number> {
    if (cleanupInFlight) {
        logDbDebug({
            operation: 'deleteExpiredMatchesFeedSnapshots',
            table: MATCHES_FEED_CACHE_TABLE,
            action: 'rpc',
            status: 'skipped',
            reason: 'single_flight',
        });
        return cleanupInFlight;
    }

    cleanupInFlight = runDeleteExpiredMatchesFeedSnapshots(supabase, limit)
        .finally(() => {
            cleanupInFlight = null;
        });

    return cleanupInFlight;
}

async function runDeleteMatchesFeedSnapshotsForScope(
    supabase: SupabaseClient,
    scope: NormalizedMatchesFeedCacheInvalidationScope,
    limit: number,
): Promise<number> {
    const safeLimit = normalizeCleanupLimit(limit);
    const startedAt = Date.now();

    try {
        const { data, error } = await (supabase as any).rpc('delete_matches_feed_cache_for_scope', {
            p_effective_date: scope.effectiveDate,
            p_date_time: scope.dateTime,
            p_sport: scope.sport,
            p_status_filter: scope.statusFilter,
            p_limit: safeLimit,
        });

        if (error) {
            if (isMissingTableError(error, MATCHES_FEED_CACHE_TABLE) || isMissingCleanupRpcError(error)) {
                logDbDebug({
                    operation: 'deleteMatchesFeedSnapshotsForScope',
                    table: MATCHES_FEED_CACHE_TABLE,
                    action: 'rpc',
                    durationMs: Date.now() - startedAt,
                    status: 'skipped',
                    reason: isMissingCleanupRpcError(error) ? 'missing_rpc' : 'missing_table',
                    effectiveDate: scope.effectiveDate,
                    sport: scope.sport,
                    statusFilter: scope.statusFilter,
                    limit: safeLimit,
                });
                return 0;
            }

            console.error('[matchesFeedCache] scoped deletion error:', error);
            logDbDebug({
                operation: 'deleteMatchesFeedSnapshotsForScope',
                table: MATCHES_FEED_CACHE_TABLE,
                action: 'rpc',
                durationMs: Date.now() - startedAt,
                status: 'error',
                errorCode: error.code,
                errorMessage: error.message,
                effectiveDate: scope.effectiveDate,
                sport: scope.sport,
                statusFilter: scope.statusFilter,
                limit: safeLimit,
            });
            return 0;
        }

        const deletedRows = typeof data === 'number' ? data : Number(data || 0);
        const normalizedDeletedRows = Number.isFinite(deletedRows) ? deletedRows : 0;
        logDbDebug({
            operation: 'deleteMatchesFeedSnapshotsForScope',
            table: MATCHES_FEED_CACHE_TABLE,
            action: 'rpc',
            durationMs: Date.now() - startedAt,
            status: 'ok',
            rowsDeleted: normalizedDeletedRows,
            effectiveDate: scope.effectiveDate,
            sport: scope.sport,
            statusFilter: scope.statusFilter,
            limit: safeLimit,
        });
        return normalizedDeletedRows;
    } catch (error) {
        console.error('[matchesFeedCache] scoped deletion failed:', error);
        logDbDebug({
            operation: 'deleteMatchesFeedSnapshotsForScope',
            table: MATCHES_FEED_CACHE_TABLE,
            action: 'rpc',
            durationMs: Date.now() - startedAt,
            status: 'error',
            errorMessage: error instanceof Error ? error.message : String(error),
            effectiveDate: scope.effectiveDate,
            sport: scope.sport,
            statusFilter: scope.statusFilter,
            limit: safeLimit,
        });
        return 0;
    }
}

export async function deleteMatchesFeedSnapshotsForScope(
    supabase: SupabaseClient,
    scope: MatchesFeedCacheInvalidationScope,
    limit = 500,
): Promise<number> {
    const normalizedScope = normalizeInvalidationScope(scope);

    if (!normalizedScope) {
        logDbDebug({
            operation: 'deleteMatchesFeedSnapshotsForScope',
            table: MATCHES_FEED_CACHE_TABLE,
            action: 'rpc',
            status: 'skipped',
            reason: 'missing_scope_date',
        });
        return 0;
    }

    const flightKey = getScopeFlightKey(normalizedScope, limit);
    const existingFlight = scopedDeletionInFlight.get(flightKey);

    if (existingFlight) {
        logDbDebug({
            operation: 'deleteMatchesFeedSnapshotsForScope',
            table: MATCHES_FEED_CACHE_TABLE,
            action: 'rpc',
            status: 'skipped',
            reason: 'single_flight',
            effectiveDate: normalizedScope.effectiveDate,
            sport: normalizedScope.sport,
            statusFilter: normalizedScope.statusFilter,
        });
        return existingFlight;
    }

    const flight = runDeleteMatchesFeedSnapshotsForScope(supabase, normalizedScope, limit)
        .finally(() => {
            scopedDeletionInFlight.delete(flightKey);
        });

    scopedDeletionInFlight.set(flightKey, flight);
    return flight;
}

export async function clearMatchesFeedSnapshots(
    supabase: SupabaseClient,
): Promise<boolean> {
    await deleteExpiredMatchesFeedSnapshots(supabase);
    return true;
}
