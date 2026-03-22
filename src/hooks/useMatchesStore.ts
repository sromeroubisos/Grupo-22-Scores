'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { generateLocalDateKeys, getTodayKey } from '@/lib/timezone';

export type SourceErrorScenario = 'fs_down_db_ok' | 'db_down_fs_ok' | 'both_down' | 'fs_cache' | null;

export interface SourceError {
  flashscore: boolean;
  supabase: boolean;
  flashscoreFromCache?: boolean;
  flashscoreReason?: string | null;
  supabaseReason?: string | null;
  message?: string | null;
  scenario: SourceErrorScenario;
}

interface MatchesStoreResult {
  matches: any[];
  loading: boolean;
  liveCount: number;
  error: SourceError | null;
}

const ERROR_RECOVERY_TTL = 60 * 1000; // 1 minute - retry faster when a source fails
const PUBLIC_STALE_TTL = 5 * 60 * 1000;     // 5 minutes - shared public cache window
const PUBLIC_LIVE_POLL_INTERVAL = 60_000;   // 1 minute - live refresh cadence
const PREFETCH_BATCH_SIZE = 3;

// Module-level cache shared across hook instances
const matchesCache = new Map<string, any[]>();
const lastFetchedAt = new Map<string, number>();

function cacheKey(date: string, sportId: string) {
  return `${date}__${sportId}`;
}

// ─── Live reconciliation ─────────────────────────────────────────────────────
// Merges a live snapshot into the current match list:
//   - matches present in snapshot  → status='live' + live fields merged
//   - matches that WERE live but absent from snapshot → status='final', live_time cleared
//   - all others → unchanged
function reconcileLiveOverlay<T extends { id: string; status?: string | null; live_time?: number | null }>(
  current: T[],
  liveSnapshot: T[]
): T[] {
  const nextLiveMap = new Map(liveSnapshot.map(m => [m.id, m]));
  const nextLiveIds = new Set(liveSnapshot.map(m => m.id));

  return current.map(m => {
    const wasLive = m.status === 'live';
    const nowLive = nextLiveIds.has(m.id);

    if (nowLive) {
      const live = nextLiveMap.get(m.id)!;
      return { ...m, ...live, status: 'live' as const };
    }
    if (wasLive && !nowLive) {
      return { ...m, status: 'final' as const, live_time: null };
    }
    return m;
  });
}

export function useMatchesStore(
  selectedDate: string,
  sportId: string
): MatchesStoreResult {
  const [matches, setMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0); // force re-render on cache update
  const [sourceError, setSourceError] = useState<SourceError | null>(null);

  const timeZone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    []
  );

  const abortRef = useRef<AbortController | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prefetchedRef = useRef(false);
  const prevSportRef = useRef(sportId);

  // Convert API sources metadata to a rich error state with scenario discrimination
  function buildSourceError(sources: any): SourceError | null {
    if (!sources) return null;
    const flashscore = sources.flashscore ?? {};
    const supabase = sources.supabase ?? {};
    const fsErr = flashscore.ok === false;
    const dbErr = supabase.ok === false;
    const fsCache = flashscore.fromCache === true;
    if (!fsErr && !dbErr && !fsCache) return null;
    let scenario: SourceErrorScenario = null;
    let message: string | null = null;
    if (fsCache)              scenario = 'fs_cache';
    else if (fsErr && !dbErr) scenario = 'fs_down_db_ok';
    else if (!fsErr && dbErr) scenario = 'db_down_fs_ok';
    else if (fsErr && dbErr)  scenario = 'both_down';
    if (scenario === 'fs_cache') {
      message = flashscore.message || 'Datos de FlashScore desde caché; puede haber un leve retraso.';
    } else if (scenario === 'fs_down_db_ok') {
      message = flashscore.message || 'FlashScore no disponible; mostrando solo partidos locales.';
    } else if (scenario === 'db_down_fs_ok') {
      message = supabase.message || 'No se pudieron cargar los partidos desde la base de datos. Mostrando datos de FlashScore.';
    } else if (scenario === 'both_down') {
      message = 'No se pudieron cargar los partidos desde ninguna fuente de datos.';
    }
    return {
      flashscore: fsErr,
      supabase: dbErr,
      flashscoreFromCache: fsCache,
      flashscoreReason: flashscore.reason ?? null,
      supabaseReason: supabase.reason ?? null,
      message,
      scenario,
    };
  }

  // Fetch a single date, update cache, return data + sources metadata
  const fetchDate = useCallback(
    async (date: string, signal?: AbortSignal): Promise<{ matches: any[]; sources?: any }> => {
      try {
        const url = `/api/matches?date=${date}&sport=${sportId}&external=true&tz=${encodeURIComponent(timeZone)}`;
        const res = await fetch(url, { signal });
        if (!res.ok) return { matches: [] };
        const data = await res.json();
        const arr = Array.isArray(data) ? data : (data.data && Array.isArray(data.data) ? data.data : (data.items && Array.isArray(data.items) ? data.items : []));
        const sources = data.sources || null;

        // Use a shorter retry window when a source failed so errors self-correct quickly;
        // normal 5 minute TTL when everything is healthy.
        const hasError = sources && (!sources.flashscore?.ok || !sources.supabase?.ok);
        const SHORT_MISS = PUBLIC_STALE_TTL - ERROR_RECOVERY_TTL; // shift timestamp back so cache is stale in ~1m
        matchesCache.set(cacheKey(date, sportId), arr);
        lastFetchedAt.set(cacheKey(date, sportId), hasError ? Date.now() - SHORT_MISS : Date.now());

        return { matches: arr, sources };
      } catch (e: any) {
        if (e?.name === 'AbortError') return { matches: [] };
        console.error('fetchDate error:', e);
        return { matches: [] };
      }
    },
    [sportId, timeZone]
  );

  // Fetch live-only matches for fast polling
  const fetchLive = useCallback(
    async (signal?: AbortSignal): Promise<any[]> => {
      try {
        const url = `/api/matches?sport=${sportId}&live=true`;
        const res = await fetch(url, { signal });
        if (!res.ok) return [];
        const data = await res.json();
        return Array.isArray(data) ? data : (data.data && Array.isArray(data.data) ? data.data : (data.items && Array.isArray(data.items) ? data.items : []));
      } catch (e: any) {
        if (e?.name === 'AbortError') return [];
        return [];
      }
    },
    [sportId]
  );

  // Main fetch: selected date (with stale-while-revalidate)
  useEffect(() => {
    if (!selectedDate) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const key = cacheKey(selectedDate, sportId);
    const cached = matchesCache.get(key);
    const lastFetched = lastFetchedAt.get(key) || 0;
    const isStale = Date.now() - lastFetched > PUBLIC_STALE_TTL;

    if (cached) {
      // Show cached data immediately
      setMatches(cached);
      setLoading(false);

      if (isStale) {
        // Background refresh
        fetchDate(selectedDate, controller.signal).then(({ matches: data, sources }) => {
          if (!controller.signal.aborted && data.length > 0) {
            setMatches(data);
          }
          if (!controller.signal.aborted && sources) {
            setSourceError(buildSourceError(sources));
          }
        });
      }
    } else {
      // No cache · show loading
      setLoading(true);

      // If we are switching sports, clear previous matches immediately
      setMatches([]);

      fetchDate(selectedDate, controller.signal).then(({ matches: data, sources }) => {
        if (!controller.signal.aborted) {
          setMatches(data);
          setLoading(false);
          setSourceError(buildSourceError(sources));
        }
      });
    }

    return () => controller.abort();
  }, [selectedDate, sportId, fetchDate, tick]);

  // Prefetch 7 days in background (once per sport change)
  useEffect(() => {
    if (!selectedDate) return;

    // Reset prefetch flag when sport changes
    if (prevSportRef.current !== sportId) {
      prefetchedRef.current = false;
      prevSportRef.current = sportId;
    }

    if (prefetchedRef.current) return;
    prefetchedRef.current = true;

    const controller = new AbortController();
    const allDates = generateLocalDateKeys(timeZone, 0, 7).map(e => e.dateKey);
    // Remove the selectedDate (already fetched)
    const toFetch = allDates.filter(d => d !== selectedDate);

    // Batch prefetch with delay to avoid API rate limiting
    // Debounce the start of prefetching by 3 seconds to ensure user stays on the sport
    const prefetchTimeout = setTimeout(async () => {
      for (let i = 0; i < toFetch.length; i += PREFETCH_BATCH_SIZE) {
        if (controller.signal.aborted) break;
        // Wait between batches so the main fetch completes first
        if (i > 0) {
          await new Promise(r => setTimeout(r, 1500));
          if (controller.signal.aborted) break;
        }
        const batch = toFetch.slice(i, i + PREFETCH_BATCH_SIZE);
        await Promise.all(
          batch.map(d => fetchDate(d, controller.signal).then(r => r.matches))
        );
      }
    }, 3000);

    return () => {
      clearTimeout(prefetchTimeout);
      controller.abort();
    };
  }, [selectedDate, sportId, timeZone, fetchDate]);

  // LIVE polling: only when selectedDate is today
  // Smart control: stops when no live matches remain; restarts via full-refresh path.
  useEffect(() => {
    if (!selectedDate) return;

    const todayKey = getTodayKey(timeZone);
    const isToday = selectedDate === todayKey;

    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }

    if (!isToday) return;

    const controller = new AbortController();

    // ── Interval helpers (scoped — no stale closure risk) ─────────────────
    function startLivePolling(tick: () => Promise<void>): void {
      if (pollingRef.current != null) return;
      pollingRef.current = setInterval(() => { void tick(); }, PUBLIC_LIVE_POLL_INTERVAL);
    }

    function stopLivePolling(): void {
      if (pollingRef.current == null) return;
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }

    // ── Core polling tick ─────────────────────────────────────────────────
    async function pollLiveMatches(): Promise<void> {
      if (controller.signal.aborted) return;
      try {
        const key = cacheKey(selectedDate, sportId);

        // 1. Fetch live snapshot
        const liveSnapshot = await fetchLive(controller.signal);
        if (controller.signal.aborted) return;

        // 2. Reconcile: promote live, demote finished
        const current = matchesCache.get(key) ?? [];
        const merged = reconcileLiveOverlay(current, liveSnapshot);

        matchesCache.set(key, merged);
        // Only reset staleness clock when we actually got live data
        if (liveSnapshot.length > 0) lastFetchedAt.set(key, Date.now());
        setMatches(merged);

        // 3. Smart stop — no more live matches visible
        const newLiveCount = merged.filter(m => m.status === 'live').length;
        if (newLiveCount === 0) {
          stopLivePolling();
        }

        // 4. Full refresh when cache is stale (runs regardless of live count).
        //    Can restart polling if fresh data surfaces new live matches.
        const lastFull = lastFetchedAt.get(key) ?? 0;
        if (Date.now() - lastFull > PUBLIC_STALE_TTL) {
          const { matches: freshData } = await fetchDate(selectedDate, controller.signal);
          if (!controller.signal.aborted && freshData.length > 0) {
            matchesCache.set(key, freshData);
            lastFetchedAt.set(key, Date.now());
            setMatches(freshData);
            const freshLive = freshData.filter(
              (m: { status?: string | null }) => m.status === 'live'
            ).length;
            if (freshLive > 0) startLivePolling(pollLiveMatches);
          }
        }
      } catch {
        // fail-safe: never throw from inside interval
      }
    }

    startLivePolling(pollLiveMatches);

    return () => {
      controller.abort();
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [selectedDate, sportId, timeZone, fetchLive, fetchDate]);

  const liveCount = useMemo(
    () => matches.filter(m => m.status === 'live').length,
    [matches]
  );

  return { matches, loading, liveCount, error: sourceError };
}
