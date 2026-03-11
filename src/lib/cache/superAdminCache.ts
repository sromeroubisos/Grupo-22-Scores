/**
 * Shared data cache for the Super Admin console.
 *
 * Strategy: In-memory singleton cache per browser session.
 *  - First load → fetch from Supabase, store in cache with TTL.
 *  - Subsequent navigations within the same session → instant, return cached data.
 *  - User can manually refresh → invalidate cache and re-fetch.
 *  - TTL default: 60 seconds (enough to prevent redundant fetches on navigation).
 *
 * This eliminates the N×supabase-round-trips caused by each page doing its own fetch
 * every time the user navigates between Torneos, Clubes, Partidos, Jugadores.
 */

import { createClient } from '@/lib/supabase/client';

const DEFAULT_TTL_MS = 5 * 60_000; // 5 minutes

interface CacheEntry<T> {
    data: T;
    fetchedAt: number; // timestamp ms
    ttl: number;
}

// Singleton in-memory store
const cache = new Map<string, CacheEntry<unknown>>();
// Track active promises to prevent redundant simultaneous fetches
const activeFetches = new Map<string, Promise<unknown>>();

function isStale<T>(entry: CacheEntry<T>): boolean {
    return Date.now() - entry.fetchedAt > entry.ttl;
}

export function invalidateCache(key?: string) {
    if (key) {
        cache.delete(key);
    } else {
        cache.clear();
    }
}

export function invalidateAll() {
    cache.clear();
}

/**
 * Returns cached data for a key regardless of staleness.
 * Returns null if the key has never been cached.
 * Used for stale-while-revalidate: show old data immediately, revalidate in background.
 */
export function getCachedStale<T>(key: string): T | null {
    const entry = cache.get(key) as CacheEntry<T> | undefined;
    return entry ? entry.data : null;
}

/**
 * Returns true if the cache entry is absent or its TTL has expired.
 */
export function isCacheEntryStale(key: string): boolean {
    const entry = cache.get(key);
    if (!entry) return true;
    return isStale(entry);
}

/**
 * Thin wrapper around a supabase fetch with in-memory caching.
 * @param key   - cache key (unique per query)
 * @param fetcher - async function that does the actual supabase call
 * @param ttl   - time-to-live in ms (default 60s)
 */
const FETCH_TIMEOUT_MS = 15_000; // 15 seconds for cold start safety instead of 45s

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    let timeoutId: NodeJS.Timeout;
    const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
            reject(new Error(`[Cache] Timeout after ${ms}ms fetching '${label}'`));
        }, ms);
    });

    return Promise.race([
        promise.finally(() => clearTimeout(timeoutId)),
        timeoutPromise
    ]);
}

export async function cachedFetch<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl: number = DEFAULT_TTL_MS,
): Promise<T> {
    const existing = cache.get(key) as CacheEntry<T> | undefined;

    if (existing && !isStale(existing)) {
        return existing.data;
    }

    // Deduplication: if a fetch is already in progress for this key, return that promise
    if (activeFetches.has(key)) {
        console.log(`[Cache] Reusing active fetch for '${key}'`);
        return activeFetches.get(key) as Promise<T>;
    }

    const fetchPromise = (async () => {
        const start = Date.now();
        try {
            console.log(`[Cache] Starting fetch for '${key}'...`);

            try {
                // Attempt fetch with timeout - increased for safety
                const data = await withTimeout(fetcher(), FETCH_TIMEOUT_MS, key);
                const duration = Date.now() - start;
                console.log(`[Cache] Fetch for '${key}' succeeded in ${duration}ms`);

                cache.set(key, { data, fetchedAt: Date.now(), ttl });
                return data;
            } catch (err: any) {
                console.warn(`[Cache] Primary fetch failed for '${key}', attempting fallback:`, err.message);
                // Fallback direct fetch (bypassing timeout wrapper just in case it's a wrapper bug or a transient network stall)
                const fallbackData = await fetcher();
                cache.set(key, { data: fallbackData, fetchedAt: Date.now(), ttl });
                return fallbackData;
            }
        } catch (err: any) {
            const duration = Date.now() - start;
            console.error(`[Cache] Fetch failed for '${key}' after ${duration}ms:`, err.message);
            // DO NOT auto-retry without timeout here, it causes infinite loading
            throw err;
        } finally {
            activeFetches.delete(key);
        }
    })();

    activeFetches.set(key, fetchPromise);
    return fetchPromise as Promise<T>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Specific fetchers — using explicit column selection (never `select('*')`)
// to minimize payload size and allow Supabase to use covering indexes.
// ─────────────────────────────────────────────────────────────────────────────

// Getter for supabase client to ensure it's initialized correctly in all environments
function getSupabase() {
    return createClient();
}

export interface ClubRow {
    id: string;
    name: string;
    short_name: string | null;
    city: string | null;
    region: string | null;
    country: string | null;
    logo_url: string | null;
    primary_color: string | null;
    slug: string | null;
    visibility: 'visible' | 'hidden' | null;
    union_id: string | null;
    external_id: string | null;
}

export interface ClubWithUnion extends ClubRow {
    union: { id: string; name: string } | null;
}

export async function fetchClubs(force = false): Promise<ClubWithUnion[]> {
    const KEY = 'clubs_list';
    if (force) invalidateCache(KEY);

    return cachedFetch(KEY, async () => {
        const { data, error } = await getSupabase()
            .from('clubs')
            .select('id, name, short_name, city, region, country, logo_url, primary_color, slug, visibility, union_id, external_id, union:unions(id, name)')
            .order('name');

        if (error) throw error;
        return (data as unknown as ClubWithUnion[]) ?? [];
    });
}

export interface MatchRow {
    id: string;
    round_id: string | null;
    date_time: string;
    venue: string | null;
    status: string | null;
    score: { home: number; away: number } | null;
    live_enabled: boolean | null;
    tournament_id: string | null;
    home_club_id: string | null;
    away_club_id: string | null;
    tournament: { id: string; name: string; sport: string | null; season_id: string | null } | null;
    home_team: { id: string; name: string; logo_url: string | null; primary_color: string | null } | null;
    away_team: { id: string; name: string; logo_url: string | null; primary_color: string | null } | null;
}

export async function fetchMatches(force = false): Promise<MatchRow[]> {
    const KEY = 'matches_list';
    if (force) invalidateCache(KEY);

    return cachedFetch(KEY, async () => {
        console.log('[Cache] Fetching matches from Supabase...');
        try {
            const result = await getSupabase()
                .from('matches')
                .select(`
                    id, round_id, date_time, venue, status, score, live_enabled, tournament_id, home_club_id, away_club_id,
                    tournament:tournaments(id, name, sport, season_id),
                    home_team:clubs!matches_home_club_id_fkey(id, name, logo_url, primary_color),
                    away_team:clubs!matches_away_club_id_fkey(id, name, logo_url, primary_color)
                `)
                .order('date_time', { ascending: false });

            console.log('[Cache] Matches returned:', result.data?.length, 'Error:', result.error);

            if (result.error) throw result.error;
            return (result.data as unknown as MatchRow[]) ?? [];
        } catch (err) {
            console.error('[Cache] fetchMatches failed:', err);
            throw err;
        }
    });
}

export interface TournamentRow {
    id: string;
    name: string;
    season_id: string;
    status: string | null;
    sport: string | null;
    category: string | null;
    age_grade: string | null;
    region: string | null;
    country: string | null;
    format: string | null;
    is_visible: boolean | null;
    created_at: string | null;
    updated_at: string | null;
    union_id: string | null;
    external_id: string | null;
    logo_url: string | null;
    slug: string | null;
    is_api_managed: boolean | null;
    data_source: string | null;
    display_name: string | null;
    original_name: string | null;
}

export interface UnionRow {
    id: string;
    name: string;
    country: string | null;
    region?: string | null;
    sport?: string | null;
    union_level?: string | null;
    parent_union_id?: string | null;
}

export interface NewsRow {
    id: string;
    title: string;
    summary: string | null;
    content: string | null;
    image_url: string | null;
    status: string | null;
    published_at: string | null;
}

export async function fetchTournaments(force = false): Promise<TournamentRow[]> {
    const KEY = 'tournaments_list';
    if (force) invalidateCache(KEY);

    return cachedFetch(KEY, async () => {
        const { data, error } = await getSupabase()
            .from('tournaments')
            .select('id, name, season_id, status, sport, category, age_grade, region, country, format, is_visible, created_at, updated_at, union_id, external_id, logo_url, slug, is_api_managed, data_source, display_name, original_name')
            .order('created_at', { ascending: false });

        if (error) throw error;
        return (data as TournamentRow[]) ?? [];
    });
}

export async function fetchUnions(force = false): Promise<UnionRow[]> {
    const KEY = 'unions_list';
    if (force) invalidateCache(KEY);

    // Unions change rarely — cache for 5 minutes
    return cachedFetch(KEY, async () => {
        const { data, error } = await getSupabase()
            .from('unions')
            .select('id, name, country')
            .order('name');

        if (error) throw error;
        return (data as UnionRow[]) ?? [];
    }, 5 * 60_000);
}

export async function fetchNews(force = false): Promise<NewsRow[]> {
    const KEY = 'news_list';
    if (force) invalidateCache(KEY);

    return cachedFetch(KEY, async () => {
        try {
            const { data, error } = await getSupabase()
                .from('news')
                .select('id, title, summary, content, image_url, status, published_at')
                .order('published_at', { ascending: false });

            if (error) {
                console.error('[Cache] fetchNews error:', error);
                throw error;
            }
            return (data as NewsRow[]) ?? [];
        } catch (err) {
            console.error('[Cache] fetchNews failed:', err);
            throw err;
        }
    });
}

export interface IncidentRow {
    id: string;
    tournament_id: string;
    match_id: string | null;
    player_id: string | null;
    player_name: string;
    club_id: string | null;
    incident_type: string;
    description: string | null;
    severity: string | null;
    status: string | null;
    created_at: string;
}

export interface SanctionRow {
    id: string;
    incident_id: string;
    summary: string | null;
    weeks: number | null;
    start_date: string | null;
    end_date: string | null;
    status: string | null;
    created_at: string;
}

export async function fetchDisciplineIncidents(force = false): Promise<IncidentRow[]> {
    const KEY = 'discipline_incidents_list';
    if (force) invalidateCache(KEY);

    return cachedFetch(KEY, async () => {
        const { data, error } = await getSupabase()
            .from('discipline_incidents')
            .select('id, tournament_id, match_id, player_id, player_name, club_id, incident_type, description, severity, status, created_at, club:clubs(name)')
            .order('created_at', { ascending: false });

        if (error) throw error;
        return (data as any[]) ?? [];
    });
}

export async function fetchDisciplineSanctions(force = false): Promise<SanctionRow[]> {
    const KEY = 'discipline_sanctions_list';
    if (force) invalidateCache(KEY);

    return cachedFetch(KEY, async () => {
        const { data, error } = await getSupabase()
            .from('discipline_sanctions')
            .select('id, incident_id, summary, weeks, start_date, end_date, status, created_at')
            .order('created_at', { ascending: false });

        if (error) throw error;
        return (data as SanctionRow[]) ?? [];
    });
}

export interface RegulationRow {
    id: string;
    scope_type: string | null;
    scope_id: string | null;
    content: string | null;
    updated_at: string;
}

export async function fetchRegulations(force = false): Promise<RegulationRow[]> {
    const KEY = 'regulations_list';
    if (force) invalidateCache(KEY);

    return cachedFetch(KEY, async () => {
        const { data, error } = await getSupabase()
            .from('regulations')
            .select('id, scope_type, scope_id, content, updated_at');

        if (error) throw error;
        return (data as RegulationRow[]) ?? [];
    });
}

