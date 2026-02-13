'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { generateLocalDateKeys, getTodayKey } from '@/lib/timezone';

interface MatchesStoreResult {
  matches: any[];
  loading: boolean;
  liveCount: number;
}

const STALE_TTL = 2 * 60 * 1000;    // 2 minutes · background refresh
const LIVE_POLL_INTERVAL = 30_000;   // 30 seconds
const PREFETCH_BATCH_SIZE = 3;

// Module-level cache shared across hook instances
const matchesCache = new Map<string, any[]>();
const lastFetchedAt = new Map<string, number>();

function cacheKey(date: string, sportId: string) {
  return `${date}__${sportId}`;
}

export function useMatchesStore(
  selectedDate: string,
  sportId: string
): MatchesStoreResult {
  const [matches, setMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0); // force re-render on cache update

  const timeZone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    []
  );

  const abortRef = useRef<AbortController | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prefetchedRef = useRef(false);
  const prevSportRef = useRef(sportId);

  // Fetch a single date, update cache, return data
  const fetchDate = useCallback(
    async (date: string, signal?: AbortSignal): Promise<any[]> => {
      try {
        const url = `/api/matches?date=${date}&sport=${sportId}&external=true&tz=${encodeURIComponent(timeZone)}`;
        const res = await fetch(url, { signal });
        if (!res.ok) return [];
        const data = await res.json();
        const arr = Array.isArray(data) ? data : [];
        matchesCache.set(cacheKey(date, sportId), arr);
        lastFetchedAt.set(cacheKey(date, sportId), Date.now());
        return arr;
      } catch (e: any) {
        if (e?.name === 'AbortError') return [];
        console.error('fetchDate error:', e);
        return [];
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
        return Array.isArray(data) ? data : [];
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
    const isStale = Date.now() - lastFetched > STALE_TTL;

    if (cached) {
      // Show cached data immediately
      setMatches(cached);
      setLoading(false);

      if (isStale) {
        // Background refresh
        fetchDate(selectedDate, controller.signal).then(data => {
          if (!controller.signal.aborted && data.length > 0) {
            setMatches(data);
          }
        });
      }
    } else {
      // No cache · show loading
      setLoading(true);
      fetchDate(selectedDate, controller.signal).then(data => {
        if (!controller.signal.aborted) {
          setMatches(data);
          setLoading(false);
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
    (async () => {
      for (let i = 0; i < toFetch.length; i += PREFETCH_BATCH_SIZE) {
        if (controller.signal.aborted) break;
        // Wait between batches so the main fetch completes first
        if (i > 0) {
          await new Promise(r => setTimeout(r, 1500));
          if (controller.signal.aborted) break;
        }
        const batch = toFetch.slice(i, i + PREFETCH_BATCH_SIZE);
        await Promise.all(
          batch.map(d => fetchDate(d, controller.signal))
        );
      }
    })();

    return () => controller.abort();
  }, [selectedDate, sportId, timeZone, fetchDate]);

  // Immediate live fetch when sport changes
  useEffect(() => {
    const controller = new AbortController();

    // Fetch live matches immediately when sport changes
    fetchLive(controller.signal).then(liveData => {
      if (controller.signal.aborted || liveData.length === 0) return;

      // If we're on today's date, merge with current matches
      const todayKey = getTodayKey(timeZone);
      if (selectedDate === todayKey) {
        const key = cacheKey(selectedDate, sportId);
        const current = matchesCache.get(key) || [];
        const liveMap = new Map(liveData.map(m => [m.id, m]));

        const merged = current.map(match => {
          const liveMatch = liveMap.get(match.id);
          if (liveMatch) {
            return {
              ...match,
              status: 'live',
              score: liveMatch.score,
              clock: liveMatch.clock
            };
          }
          return match;
        });

        matchesCache.set(key, merged);
        lastFetchedAt.set(key, Date.now());
        setMatches(merged);
      }
    });

    return () => controller.abort();
  }, [sportId, selectedDate, timeZone, fetchLive]);

  // LIVE polling: only when selectedDate is today
  useEffect(() => {
    if (!selectedDate) return;

    const todayKey = getTodayKey(timeZone);
    const isToday = selectedDate === todayKey;

    // Clear existing polling
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }

    if (!isToday) return;

    const controller = new AbortController();

    pollingRef.current = setInterval(async () => {
      if (controller.signal.aborted) return;

      const liveData = await fetchLive(controller.signal);

      if (controller.signal.aborted) return;

      if (liveData.length > 0) {
        // Merge live data into current matches
        const key = cacheKey(selectedDate, sportId);
        const current = matchesCache.get(key) || [];
        const liveMap = new Map(liveData.map(m => [m.id, m]));

        const merged = current.map(match => {
          const liveMatch = liveMap.get(match.id);
          if (liveMatch) {
            return {
              ...match,
              status: 'live',
              score: liveMatch.score,
              clock: liveMatch.clock
            };
          }
          return match;
        });

        matchesCache.set(key, merged);
        lastFetchedAt.set(key, Date.now());
        setMatches(merged);
      }

      // Also do a full background refresh every other tick (~ every 60s)
      const lastFull = lastFetchedAt.get(cacheKey(selectedDate, sportId)) || 0;
      if (Date.now() - lastFull > STALE_TTL) {
        const freshData = await fetchDate(selectedDate, controller.signal);
        if (!controller.signal.aborted && freshData.length > 0) {
          setMatches(freshData);
        }
      }
    }, LIVE_POLL_INTERVAL);

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

  return { matches, loading, liveCount };
}
