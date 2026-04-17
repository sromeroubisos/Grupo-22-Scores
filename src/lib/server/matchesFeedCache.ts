import type { SupabaseClient } from '@supabase/supabase-js';
import { isMissingColumnError, isMissingTableError } from '@/lib/utils/supabaseSchema';

const MATCHES_FEED_CACHE_TABLE = 'matches_feed_cache';
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

    return mapRowToSnapshotMeta(data as PersistedMatchesFeedRow);
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

    return mapRowToSnapshot<T>(data as PersistedMatchesFeedRow);
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

    return mapRowToSnapshot<T>(data as PersistedMatchesFeedRow);
}

export async function upsertMatchesFeedSnapshot<T>(
    supabase: SupabaseClient,
    input: UpsertMatchesFeedSnapshotInput<T>,
): Promise<boolean> {
    const generatedAt = input.generatedAt || new Date();
    const freshUntil = new Date(generatedAt.getTime() + input.freshTtlSeconds * 1000);
    const staleUntil = new Date(generatedAt.getTime() + input.staleTtlSeconds * 1000);
    const payloadSizeBytes = new TextEncoder().encode(JSON.stringify(input.payload)).length;

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

export async function clearMatchesFeedSnapshots(
    supabase: SupabaseClient,
): Promise<boolean> {
    const { error } = await supabase
        .from(MATCHES_FEED_CACHE_TABLE)
        .delete()
        .not('cache_key', 'is', null);

    if (error) {
        if (isMissingTableError(error, MATCHES_FEED_CACHE_TABLE)) {
            return false;
        }

        console.error('[matchesFeedCache] clear error:', error);
        return false;
    }

    return true;
}
