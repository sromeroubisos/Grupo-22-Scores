'use client';

import React, {
    createContext, useContext, useMemo, useState, useEffect, useCallback, useRef
} from 'react';
import {
    fetchClubs, fetchMatches, fetchTournaments, fetchUnions, fetchNews,
    invalidateCache, getCachedStale, isCacheEntryStale,
    type ClubWithUnion, type MatchRow, type TournamentRow, type UnionRow, type NewsRow
} from '@/lib/cache/superAdminCache';
import { normalizeError } from '@/lib/utils/errorUtils';

// ─── Cache keys ───────────────────────────────────────────────────────────────

const KEYS = {
    clubs: 'clubs_list',
    matches: 'matches_list',
    tournaments: 'tournaments_list',
    unions: 'unions_list',
    news: 'news_list',
} as const;

// ─── Filter types ─────────────────────────────────────────────────────────────

export type SuperConsoleFilters = {
    sport: string;
    search: string;
    country: string;
    status: string;
    source: string;
};

const defaultFilters: SuperConsoleFilters = {
    sport: 'all', search: '', country: 'all', status: 'all', source: 'all',
};

// ─── Data state ───────────────────────────────────────────────────────────────

export type SuperConsoleData = {
    clubs: ClubWithUnion[];
    matches: MatchRow[];
    tournaments: TournamentRow[];
    unions: UnionRow[];
    news: NewsRow[];
    loading: {
        clubs: boolean;
        matches: boolean;
        tournaments: boolean;
        unions: boolean;
        news: boolean;
    };
    errors: {
        clubs: string | null;
        matches: string | null;
        tournaments: string | null;
        unions: string | null;
        news: string | null;
    };
    refresh: (key?: 'clubs' | 'matches' | 'tournaments' | 'unions' | 'news') => void;
};

// ─── Context ──────────────────────────────────────────────────────────────────

type ContextValue = {
    filters: SuperConsoleFilters;
    setFilters: React.Dispatch<React.SetStateAction<SuperConsoleFilters>>;
} & SuperConsoleData;

const SuperConsoleContext = createContext<ContextValue | undefined>(undefined);

const STORAGE_KEY = 'super_console_filters';

// ─── Provider ─────────────────────────────────────────────────────────────────

export function SuperConsoleProvider({ children }: { children: React.ReactNode }) {
    // ── Filters ─────────────────────────────────────────────────────────────────
    const [filters, setFilters] = useState<SuperConsoleFilters>(() => {
        if (typeof window !== 'undefined') {
            try {
                const saved = localStorage.getItem(STORAGE_KEY);
                if (saved) return { ...defaultFilters, ...JSON.parse(saved) };
            } catch { /* ignore */ }
        }
        return defaultFilters;
    });

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
    }, [filters]);

    // ── Data stores — initialize from cache for instant first render ─────────────
    // If the cache already has data (e.g. user navigated away and came back),
    // React state is seeded with it synchronously — zero loading time.
    const [clubs, setClubs] = useState<ClubWithUnion[]>(
        () => getCachedStale<ClubWithUnion[]>(KEYS.clubs) ?? []
    );
    const [matches, setMatches] = useState<MatchRow[]>(
        () => getCachedStale<MatchRow[]>(KEYS.matches) ?? []
    );
    const [tournaments, setTournaments] = useState<TournamentRow[]>(
        () => getCachedStale<TournamentRow[]>(KEYS.tournaments) ?? []
    );
    const [unions, setUnions] = useState<UnionRow[]>(
        () => getCachedStale<UnionRow[]>(KEYS.unions) ?? []
    );
    const [news, setNews] = useState<NewsRow[]>(
        () => getCachedStale<NewsRow[]>(KEYS.news) ?? []
    );

    // Loading is true only when there is NO data at all (first ever fetch).
    // If cache has data (even stale), loading starts false — data shows immediately.
    const [loading, setLoading] = useState({
        clubs: getCachedStale(KEYS.clubs) === null,
        matches: getCachedStale(KEYS.matches) === null,
        tournaments: getCachedStale(KEYS.tournaments) === null,
        unions: getCachedStale(KEYS.unions) === null,
        news: getCachedStale(KEYS.news) === null,
    });
    const [errors, setErrors] = useState({
        clubs: null as string | null,
        matches: null as string | null,
        tournaments: null as string | null,
        unions: null as string | null,
        news: null as string | null,
    });

    const prefetched = useRef(false);

    // ── Stale-while-revalidate loaders ──────────────────────────────────────────
    //
    // Pattern:
    //   1. Cache has FRESH data  → return immediately, no network call.
    //   2. Cache has STALE data  → return immediately, revalidate in background (no spinner).
    //   3. No cache (first visit) OR force=true → show spinner, await network.
    //
    // This makes tab switching feel instant after the first load.

    const loadClubs = useCallback(async (force = false) => {
        const stale = getCachedStale<ClubWithUnion[]>(KEYS.clubs);
        if (stale && !force) {
            setClubs(stale);
            setLoading(prev => ({ ...prev, clubs: false }));
            if (isCacheEntryStale(KEYS.clubs)) {
                fetchClubs().then(fresh => setClubs(fresh)).catch(() => { });
            }
            return;
        }
        setLoading(prev => ({ ...prev, clubs: true }));
        setErrors(prev => ({ ...prev, clubs: null }));
        try {
            const data = await fetchClubs(force);
            setClubs(data);
            setErrors(prev => ({ ...prev, clubs: null }));
        } catch (err: unknown) {
            const normalized = normalizeError(err);
            console.error(`[SuperConsoleContext] Failed to load clubs:`, {
                message: normalized.message,
                details: normalized.details,
                code: normalized.code,
                raw: normalized.raw
            });
            setErrors(prev => ({ ...prev, clubs: normalized.message }));
        } finally {
            setLoading(prev => ({ ...prev, clubs: false }));
        }
    }, [fetchClubs]);

    const loadMatches = useCallback(async (force = false) => {
        const stale = getCachedStale<MatchRow[]>(KEYS.matches);
        if (stale && !force) {
            setMatches(stale);
            setLoading(prev => ({ ...prev, matches: false }));
            if (isCacheEntryStale(KEYS.matches)) {
                fetchMatches().then(fresh => setMatches(fresh)).catch(() => { });
            }
            return;
        }
        setLoading(prev => ({ ...prev, matches: true }));
        setErrors(prev => ({ ...prev, matches: null }));
        try {
            const data = await fetchMatches(force);
            setMatches(data);
            setErrors(prev => ({ ...prev, matches: null }));
        } catch (err: unknown) {
            const normalized = normalizeError(err);
            console.error(`[SuperConsoleContext] Failed to load matches:`, {
                message: normalized.message,
                details: normalized.details,
                code: normalized.code,
                raw: normalized.raw
            });
            setErrors(prev => ({ ...prev, matches: normalized.message }));
        } finally {
            setLoading(prev => ({ ...prev, matches: false }));
        }
    }, [fetchMatches]);

    const loadTournaments = useCallback(async (force = false) => {
        const stale = getCachedStale<TournamentRow[]>(KEYS.tournaments);
        if (stale && !force) {
            setTournaments(stale);
            setLoading(prev => ({ ...prev, tournaments: false }));
            if (isCacheEntryStale(KEYS.tournaments)) {
                fetchTournaments().then(fresh => setTournaments(fresh)).catch(() => { });
            }
            return;
        }
        setLoading(prev => ({ ...prev, tournaments: true }));
        setErrors(prev => ({ ...prev, tournaments: null }));
        try {
            const data = await fetchTournaments(force);
            setTournaments(data);
            setErrors(prev => ({ ...prev, tournaments: null }));
        } catch (err: unknown) {
            const normalized = normalizeError(err);
            console.error(`[SuperConsoleContext] Failed to load tournaments:`, {
                message: normalized.message,
                details: normalized.details,
                code: normalized.code,
                raw: normalized.raw
            });
            setErrors(prev => ({ ...prev, tournaments: normalized.message }));
        } finally {
            setLoading(prev => ({ ...prev, tournaments: false }));
        }
    }, [fetchTournaments]);

    const loadUnions = useCallback(async (force = false) => {
        const stale = getCachedStale<UnionRow[]>(KEYS.unions);
        if (stale && !force) {
            setUnions(stale);
            setLoading(prev => ({ ...prev, unions: false }));
            if (isCacheEntryStale(KEYS.unions)) {
                fetchUnions().then(fresh => setUnions(fresh)).catch(() => { });
            }
            return;
        }
        setLoading(prev => ({ ...prev, unions: true }));
        setErrors(prev => ({ ...prev, unions: null }));
        try {
            const data = await fetchUnions(force);
            setUnions(data);
            setErrors(prev => ({ ...prev, unions: null }));
        } catch (err: unknown) {
            const normalized = normalizeError(err);
            console.error(`[SuperConsoleContext] Failed to load unions:`, {
                message: normalized.message,
                details: normalized.details,
                code: normalized.code,
                raw: normalized.raw
            });
            setErrors(prev => ({ ...prev, unions: normalized.message }));
        } finally {
            setLoading(prev => ({ ...prev, unions: false }));
        }
    }, [fetchUnions]);

    const loadNews = useCallback(async (force = false) => {
        const stale = getCachedStale<NewsRow[]>(KEYS.news);
        if (stale && !force) {
            setNews(stale);
            setLoading(prev => ({ ...prev, news: false }));
            if (isCacheEntryStale(KEYS.news)) {
                fetchNews().then(fresh => setNews(fresh)).catch(() => { });
            }
            return;
        }
        setLoading(prev => ({ ...prev, news: true }));
        setErrors(prev => ({ ...prev, news: null }));
        try {
            const data = await fetchNews(force);
            setNews(data);
            setErrors(prev => ({ ...prev, news: null }));
        } catch (err: unknown) {
            const normalized = normalizeError(err);
            console.error(`[SuperConsoleContext] Failed to load news:`, {
                message: normalized.message,
                details: normalized.details,
                code: normalized.code,
                raw: normalized.raw
            });
            setErrors(prev => ({ ...prev, news: normalized.message }));
        } finally {
            setLoading(prev => ({ ...prev, news: false }));
        }
    }, [fetchNews]);

    // ── Prefetch on mount ────────────────────────────────────────────────────────
    // If cache is warm, loaders return instantly (no network).
    // If cache is stale, loaders show data + revalidate in background.
    // If cache is cold (first visit), loaders show spinners.
    useEffect(() => {
        if (prefetched.current) return;
        prefetched.current = true;

        loadClubs();
        loadMatches();
        loadTournaments();
        loadUnions();
        loadNews();
    }, [loadClubs, loadMatches, loadTournaments, loadUnions, loadNews]);

    // ── Public refresh (called after mutations) ──────────────────────────────────
    // force=true → invalidates cache + shows spinner → guarantees fresh data.
    const refresh = useCallback((key?: 'clubs' | 'matches' | 'tournaments' | 'unions' | 'news') => {
        if (!key || key === 'clubs') loadClubs(true);
        if (!key || key === 'matches') loadMatches(true);
        if (!key || key === 'tournaments') loadTournaments(true);
        if (!key || key === 'unions') loadUnions(true);
        if (!key || key === 'news') loadNews(true);
    }, [loadClubs, loadMatches, loadTournaments, loadUnions, loadNews]);

    const value = useMemo(() => ({
        filters, setFilters,
        clubs, matches, tournaments, unions, news,
        loading, errors,
        refresh,
    }), [filters, clubs, matches, tournaments, unions, news, loading, errors, refresh]);

    return (
        <SuperConsoleContext.Provider value={value}>
            {children}
        </SuperConsoleContext.Provider>
    );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useSuperConsole() {
    const context = useContext(SuperConsoleContext);
    if (!context) throw new Error('useSuperConsole must be used within SuperConsoleProvider');
    return context;
}
