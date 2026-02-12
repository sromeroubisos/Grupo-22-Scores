const CACHE_KEY = 'g22_tournament_logos';

// In-memory cache to avoid repeated localStorage hits and JSON parsing
let memoryCache: Record<string, string> | null = null;

function getCache(): Record<string, string> {
    if (memoryCache) return memoryCache;

    if (typeof window === 'undefined') return {};

    try {
        const stored = localStorage.getItem(CACHE_KEY);
        memoryCache = stored ? JSON.parse(stored) : {};
        return memoryCache || {};
    } catch (e) {
        memoryCache = {};
        return {};
    }
}

export function getCachedLogo(tournamentId: string): string | null {
    const cache = getCache();
    return cache[tournamentId] || null;
}

export function setCachedLogo(tournamentId: string, logoUrl: string): void {
    if (typeof window === 'undefined' || !logoUrl) return;

    const cache = getCache();
    if (cache[tournamentId] === logoUrl) return; // Already cached

    cache[tournamentId] = logoUrl;
    // Set memory cache reference just in case
    memoryCache = cache;

    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    } catch (e) {
        // Silently fail
    }
}
