import type { SupabaseClient } from '@supabase/supabase-js';
import { isMissingColumnError, isMissingTableError } from '@/lib/utils/supabaseSchema';

const TOURNAMENTS_FEED_CACHE_TABLE = 'tournaments_feed_cache';
const TOURNAMENTS_FEED_CACHE_META_COLUMNS = [
    'cache_key',
    'feed_type',
    'sport',
    'scope',
    'audience',
    'search_query',
    'external_country_id',
    'generated_at',
    'expires_at',
    'fresh_until',
    'stale_until',
    'payload_size_bytes',
    'source_summary',
    'last_refresh_started_at',
    'last_refresh_completed_at',
].join(', ');
const TOURNAMENTS_FEED_CACHE_META_COLUMNS_LEGACY = [
    'cache_key',
    'feed_type',
    'sport',
    'scope',
    'audience',
    'search_query',
    'external_country_id',
    'generated_at',
    'expires_at',
    'source_summary',
    'last_refresh_started_at',
    'last_refresh_completed_at',
].join(', ');

export type TournamentsFeedType = 'list' | 'summary' | 'country' | 'db';

type PersistedTournamentsFeedRow = {
    cache_key: string;
    feed_type: TournamentsFeedType;
    sport: string | null;
    scope: string | null;
    audience: string | null;
    search_query: string | null;
    external_country_id: string | null;
    payload_json: unknown;
    generated_at: string;
    expires_at: string;
    fresh_until: string | null;
    stale_until: string | null;
    payload_size_bytes: number | null;
    source_summary: unknown;
    last_refresh_started_at: string | null;
    last_refresh_completed_at: string | null;
};

export type PersistedTournamentsFeedSnapshotMeta = {
    cacheKey: string;
    feedType: TournamentsFeedType;
    sport: string | null;
    scope: string | null;
    audience: string | null;
    searchQuery: string | null;
    externalCountryId: string | null;
    generatedAt: string;
    expiresAt: string;
    freshUntil: string | null;
    staleUntil: string | null;
    payloadSizeBytes: number | null;
    sourceSummary: unknown;
    lastRefreshStartedAt: string | null;
    lastRefreshCompletedAt: string | null;
};

export type PersistedTournamentsFeedSnapshot<T> = PersistedTournamentsFeedSnapshotMeta & {
    payload: T;
};

export type UpsertTournamentsFeedSnapshotInput<T> = {
    cacheKey: string;
    feedType: TournamentsFeedType;
    sport?: string | null;
    scope?: string | null;
    audience?: string | null;
    searchQuery?: string | null;
    externalCountryId?: string | null;
    payload: T;
    sourceSummary?: unknown;
    generatedAt?: Date;
    freshTtlSeconds: number;
    staleTtlSeconds: number;
    lastRefreshStartedAt?: Date | null;
    lastRefreshCompletedAt?: Date | null;
};

function mapRowToSnapshotMeta(row: PersistedTournamentsFeedRow): PersistedTournamentsFeedSnapshotMeta {
    return {
        cacheKey: row.cache_key,
        feedType: row.feed_type,
        sport: row.sport,
        scope: row.scope,
        audience: row.audience,
        searchQuery: row.search_query,
        externalCountryId: row.external_country_id,
        generatedAt: row.generated_at,
        expiresAt: row.expires_at,
        freshUntil: row.fresh_until || row.expires_at,
        staleUntil: row.stale_until,
        payloadSizeBytes: row.payload_size_bytes,
        sourceSummary: row.source_summary,
        lastRefreshStartedAt: row.last_refresh_started_at,
        lastRefreshCompletedAt: row.last_refresh_completed_at,
    };
}

function mapRowToSnapshot<T>(row: PersistedTournamentsFeedRow): PersistedTournamentsFeedSnapshot<T> {
    return {
        ...mapRowToSnapshotMeta(row),
        payload: row.payload_json as T,
    };
}

export async function readTournamentsFeedSnapshotMetadata(
    supabase: SupabaseClient,
    cacheKey: string,
): Promise<PersistedTournamentsFeedSnapshotMeta | null> {
    let { data, error } = await supabase
        .from(TOURNAMENTS_FEED_CACHE_TABLE)
        .select(TOURNAMENTS_FEED_CACHE_META_COLUMNS)
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
            .from(TOURNAMENTS_FEED_CACHE_TABLE)
            .select(TOURNAMENTS_FEED_CACHE_META_COLUMNS_LEGACY)
            .eq('cache_key', cacheKey)
            .maybeSingle();

        data = legacyResult.data;
        error = legacyResult.error;
    }

    if (error) {
        if (isMissingTableError(error, TOURNAMENTS_FEED_CACHE_TABLE)) {
            return null;
        }

        console.error('[tournamentsFeedCache] metadata read error:', error);
        return null;
    }

    if (!data) {
        return null;
    }

    return mapRowToSnapshotMeta(data as PersistedTournamentsFeedRow);
}

export async function readTournamentsFeedSnapshotPayload<T>(
    supabase: SupabaseClient,
    cacheKey: string,
): Promise<PersistedTournamentsFeedSnapshot<T> | null> {
    let { data, error } = await supabase
        .from(TOURNAMENTS_FEED_CACHE_TABLE)
        .select(`payload_json, ${TOURNAMENTS_FEED_CACHE_META_COLUMNS}`)
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
            .from(TOURNAMENTS_FEED_CACHE_TABLE)
            .select(`payload_json, ${TOURNAMENTS_FEED_CACHE_META_COLUMNS_LEGACY}`)
            .eq('cache_key', cacheKey)
            .maybeSingle();

        data = legacyResult.data;
        error = legacyResult.error;
    }

    if (error) {
        if (isMissingTableError(error, TOURNAMENTS_FEED_CACHE_TABLE)) {
            return null;
        }

        console.error('[tournamentsFeedCache] payload read error:', error);
        return null;
    }

    if (!data) {
        return null;
    }

    return mapRowToSnapshot<T>(data as PersistedTournamentsFeedRow);
}

export async function readUsableTournamentsFeedSnapshot<T>(
    supabase: SupabaseClient,
    cacheKey: string,
    staleAfterIso: string,
): Promise<PersistedTournamentsFeedSnapshot<T> | null> {
    const { data, error } = await supabase
        .from(TOURNAMENTS_FEED_CACHE_TABLE)
        .select(`payload_json, ${TOURNAMENTS_FEED_CACHE_META_COLUMNS}`)
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
        return readTournamentsFeedSnapshotPayload<T>(supabase, cacheKey);
    }

    if (error) {
        if (isMissingTableError(error, TOURNAMENTS_FEED_CACHE_TABLE)) {
            return null;
        }

        console.error('[tournamentsFeedCache] usable read error:', error);
        return null;
    }

    if (!data) {
        return null;
    }

    return mapRowToSnapshot<T>(data as PersistedTournamentsFeedRow);
}

export async function upsertTournamentsFeedSnapshot<T>(
    supabase: SupabaseClient,
    input: UpsertTournamentsFeedSnapshotInput<T>,
): Promise<boolean> {
    const generatedAt = input.generatedAt || new Date();
    const freshUntil = new Date(generatedAt.getTime() + input.freshTtlSeconds * 1000);
    const staleUntil = new Date(generatedAt.getTime() + input.staleTtlSeconds * 1000);
    const payloadSizeBytes = new TextEncoder().encode(JSON.stringify(input.payload)).length;

    const payload = {
        cache_key: input.cacheKey,
        feed_type: input.feedType,
        sport: input.sport || null,
        scope: input.scope || null,
        audience: input.audience || null,
        search_query: input.searchQuery || null,
        external_country_id: input.externalCountryId || null,
        payload_json: input.payload,
        generated_at: generatedAt.toISOString(),
        expires_at: freshUntil.toISOString(),
        fresh_until: freshUntil.toISOString(),
        stale_until: staleUntil.toISOString(),
        payload_size_bytes: payloadSizeBytes,
        source_summary: input.sourceSummary ?? {},
        last_refresh_started_at: input.lastRefreshStartedAt ? input.lastRefreshStartedAt.toISOString() : generatedAt.toISOString(),
        last_refresh_completed_at: input.lastRefreshCompletedAt ? input.lastRefreshCompletedAt.toISOString() : generatedAt.toISOString(),
    };

    let { error } = await supabase
        .from(TOURNAMENTS_FEED_CACHE_TABLE)
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
            scope: input.scope || null,
            audience: input.audience || null,
            search_query: input.searchQuery || null,
            external_country_id: input.externalCountryId || null,
            payload_json: input.payload,
            generated_at: generatedAt.toISOString(),
            expires_at: freshUntil.toISOString(),
            source_summary: input.sourceSummary ?? {},
            last_refresh_started_at: input.lastRefreshStartedAt ? input.lastRefreshStartedAt.toISOString() : generatedAt.toISOString(),
            last_refresh_completed_at: input.lastRefreshCompletedAt ? input.lastRefreshCompletedAt.toISOString() : generatedAt.toISOString(),
        };

        const legacyResult = await supabase
            .from(TOURNAMENTS_FEED_CACHE_TABLE)
            .upsert(legacyPayload, { onConflict: 'cache_key' });

        error = legacyResult.error;
    }

    if (error) {
        if (isMissingTableError(error, TOURNAMENTS_FEED_CACHE_TABLE)) {
            return false;
        }

        console.error('[tournamentsFeedCache] upsert error:', error);
        return false;
    }

    return true;
}

export async function clearTournamentsFeedSnapshots(
    supabase: SupabaseClient,
): Promise<boolean> {
    const { error } = await supabase
        .from(TOURNAMENTS_FEED_CACHE_TABLE)
        .delete()
        .not('cache_key', 'is', null);

    if (error) {
        if (isMissingTableError(error, TOURNAMENTS_FEED_CACHE_TABLE)) {
            return false;
        }

        console.error('[tournamentsFeedCache] clear error:', error);
        return false;
    }

    return true;
}
