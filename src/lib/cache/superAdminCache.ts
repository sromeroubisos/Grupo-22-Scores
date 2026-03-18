/**
 * Shared data cache for the Super Admin console.
 *
 * Strategy: In-memory singleton cache per browser session.
 *  - First load → fetch from Supabase, store in cache with TTL.
 *  - Subsequent navigations within the same session → instant, return cached data.
 *  - User can manually refresh → invalidate cache and re-fetch.
 *  - TTL default: 5 minutes.
 */

import { createClient } from '@/lib/supabase/client';
import { normalizeError } from '@/lib/utils/errorUtils';

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

const FETCH_TIMEOUT_MS = 15_000; // 15 seconds

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

    if (activeFetches.has(key)) {
        return activeFetches.get(key) as Promise<T>;
    }

    const fetchPromise = (async () => {
        try {
            const data = await withTimeout(fetcher(), FETCH_TIMEOUT_MS, key);
            cache.set(key, { data, fetchedAt: Date.now(), ttl });
            return data;
        } catch (err: any) {
            const msg = err.message || 'Unknown error';
            console.warn(`[Cache] Primary fetch failed for '${key}'. Rethrying WITHOUT timeout. Error: ${msg}`);
            try {
                const fallbackData = await fetcher();
                cache.set(key, { data: fallbackData, fetchedAt: Date.now(), ttl });
                return fallbackData;
            } catch (retryErr: any) {
                // If it's a Supabase error, it might not stringify well
                const errorData = {
                    message: retryErr?.message,
                    code: retryErr?.code,
                    details: retryErr?.details,
                    hint: retryErr?.hint,
                    status: retryErr?.status,
                    name: retryErr?.name
                };
                console.error(`[Cache] RE-FETCH FAILED for '${key}':`, errorData);
                
                const normalized = normalizeError(retryErr);
                console.error(`[Cache] RE-FETCH FAILED NORMALIZED for '${key}':`, normalized);
                throw normalized;
            }
        } finally {
            activeFetches.delete(key);
        }
    })();

    activeFetches.set(key, fetchPromise);
    return fetchPromise as Promise<T>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fetchers
// ─────────────────────────────────────────────────────────────────────────────

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
        const { data, error } = await getSupabase()
            .from('matches')
            .select(`
                id, round_id, date_time, venue, status, score, live_enabled, tournament_id, home_club_id, away_club_id,
                tournament:tournaments(id, name, sport, season_id),
                home_team:clubs!matches_home_club_id_fkey(id, name, logo_url, primary_color),
                away_team:clubs!matches_away_club_id_fkey(id, name, logo_url, primary_color)
            `)
            .order('date_time', { ascending: false });

        if (error) throw error;
        return (data as unknown as MatchRow[]) ?? [];
    });
}

export interface TournamentRow {
    id: string;
    name: string;
    slug: string | null;
    sport_id: string | null;
    sport_name: string | null;
    country_id: string | null;
    country_name: string | null;
    organization_id: string | null;
    organization_name: string | null;
    logo_url: string | null;
    is_popular: boolean;
    is_active: boolean;
    display_order: number | null;
    followers_count: number;
    is_followed_by_user: boolean;
    created_at: string;
    updated_at: string;
    // Admin fields
    season_id: string | null;
    status: string | null;
    category: string | null;
    age_grade: string | null;
    format: string | null;
    is_visible: boolean | null;
    is_api_managed: boolean;
    data_source: string | null;
    display_name: string | null;
    original_name: string | null;
    union_id: string | null;
    external_id: string | null;
    // Compatibility
    sport?: string | null;
    country?: string | null;
}

export async function fetchTournaments(force = false): Promise<TournamentRow[]> {
    const KEY = 'tournaments_list';
    if (force) invalidateCache(KEY);

    return cachedFetch(KEY, async () => {
        try {
            const { data, error } = await getSupabase()
                .rpc('get_all_tournaments', {
                    p_include_hidden: true,
                    p_viewer_user_id: null
                });

            if (error) {
                // PGRST202 is "function not found"
                if (error.code === 'PGRST202' || error.message?.includes('not find the function')) {
                    console.warn('[Cache] get_all_tournaments RPC not found, falling back to direct query');
                    return fetchTournamentsFallback();
                }
                console.error('[fetchTournaments][RAW] Supabase RPC error:', error);
                console.error('[fetchTournaments][RAW] JSON (all props):',
                    JSON.stringify(error, Object.getOwnPropertyNames(error)));
                const normalized = normalizeError(error);
                console.error('[fetchTournaments][NORMALIZED]:', normalized);
                throw normalized;
            }

            return (data || []).map(t => ({
                ...t,
                sport: t.sport_id, // For backward compatibility with existing filters
                country: t.country_name || t.country_id // For grouping by country
            })) as unknown as TournamentRow[];
        } catch (err: any) {
             if (err.code === 'PGRST202' || err.message?.includes('not find the function')) {
                return fetchTournamentsFallback();
             }
             throw err;
        }
    });
}

/**
 * Direct table query fallback for super admin cache
 */
async function fetchTournamentsFallback(): Promise<TournamentRow[]> {
    const { data, error } = await getSupabase()
        .from('tournaments')
        .select(`
            *,
            sport:sports(name),
            country:countries(name),
            union:unions(name)
        `);

    if (error) {
        console.error('[Cache] Fallback query failed:', error);
        throw error;
    }

    return (data || []).map(t => ({
        ...t,
        sport_name: (t.sport as any)?.name || 'Unknown',
        country_name: (t.country as any)?.name || 'Generic',
        organization_name: (t.union as any)?.name || null,
        sport: t.sport_id,
        country: (t.country as any)?.name || t.country_id,
        followers_count: 0,
        is_followed_by_user: false,
        display_name: t.display_name || t.name,
        original_name: t.original_name || t.name
    })) as unknown as TournamentRow[];
}

export interface UnionRow {
    id: string;
    name: string;
    country: string | null;
    region?: string | null;
    sport?: string | null;
    union_level?: string | null;
    parent_union_id?: string | null;
    branding?: Record<string, any> | null;
}

export async function fetchUnions(force = false): Promise<UnionRow[]> {
    const KEY = 'unions_list';
    if (force) invalidateCache(KEY);

    return cachedFetch(KEY, async () => {
        const { data, error } = await getSupabase()
            .from('unions')
            .select('id, name, country, branding')
            .order('name');

        if (error) throw error;
        return ((data as any[]) ?? []).map((union) => ({
            id: union.id,
            name: union.name,
            country: union.country,
            branding: union.branding || null,
            region: union.branding?.organization?.jurisdiction?.region || null,
            sport: union.branding?.organization?.identity?.sport || null,
            union_level: union.branding?.organization?.jurisdiction?.jurisdiction_type
                || union.branding?.organization?.identity?.union_level
                || null,
            parent_union_id: union.branding?.organization?.relationships?.parent_organization_id || null,
        }));
    }, 5 * 60_000);
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

export async function fetchNews(force = false): Promise<NewsRow[]> {
    const KEY = 'news_list';
    if (force) invalidateCache(KEY);

    return cachedFetch(KEY, async () => {
        const { data, error } = await getSupabase()
            .from('news')
            .select('id, title, summary, content, image_url, status, published_at')
            .order('published_at', { ascending: false });

        if (error) throw error;
        return (data as NewsRow[]) ?? [];
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
