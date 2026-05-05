const CACHE_KEY = 'g22_tournament_logos';
const CACHE_VERSION = 2;
const MAX_ENTRIES = 160;
const MAX_STORAGE_BYTES = 120_000;
const MAX_LOGO_VALUE_LENGTH = 4_096;

type LogoCacheEntry = {
    url: string;
    updatedAt: number;
};

type LogoCachePayload = {
    version: typeof CACHE_VERSION;
    entries: Record<string, LogoCacheEntry>;
};

type LogoCache = Record<string, LogoCacheEntry>;

// In-memory cache to avoid repeated localStorage hits and JSON parsing.
let memoryCache: LogoCache | null = null;

function estimateStorageBytes(value: string): number {
    // localStorage is usually UTF-16, so this is a conservative budget.
    return value.length * 2;
}

function normalizeCacheKey(value: string): string {
    return value.trim().slice(0, 160);
}

function isCacheableLogoUrl(value: string): boolean {
    const trimmed = value.trim();
    if (!trimmed || trimmed.length > MAX_LOGO_VALUE_LENGTH) return false;

    // Large inline/base64 logos are the easiest way to fill localStorage.
    // They still render from the current payload; we only skip persistence.
    if (/^data:image\//i.test(trimmed) && trimmed.length > MAX_LOGO_VALUE_LENGTH) return false;
    if (trimmed.startsWith('<svg') && trimmed.length > MAX_LOGO_VALUE_LENGTH) return false;

    return true;
}

function normalizeEntry(value: unknown, fallbackUpdatedAt = Date.now()): LogoCacheEntry | null {
    if (typeof value === 'string') {
        const url = value.trim();
        return isCacheableLogoUrl(url) ? { url, updatedAt: fallbackUpdatedAt } : null;
    }

    if (!value || typeof value !== 'object') return null;

    const record = value as Partial<LogoCacheEntry>;
    const url = typeof record.url === 'string' ? record.url.trim() : '';
    if (!isCacheableLogoUrl(url)) return null;

    return {
        url,
        updatedAt: typeof record.updatedAt === 'number' && Number.isFinite(record.updatedAt)
            ? record.updatedAt
            : fallbackUpdatedAt,
    };
}

function pruneCache(cache: LogoCache): LogoCache {
    const next: LogoCache = {};
    let usedBytes = 0;

    const entries = Object.entries(cache)
        .map(([key, entry]) => [normalizeCacheKey(key), normalizeEntry(entry)] as const)
        .filter((entry): entry is readonly [string, LogoCacheEntry] => Boolean(entry[0] && entry[1]))
        .sort((left, right) => right[1].updatedAt - left[1].updatedAt);

    for (const [key, entry] of entries) {
        if (Object.keys(next).length >= MAX_ENTRIES) break;

        const entryBytes = estimateStorageBytes(key) + estimateStorageBytes(entry.url) + 32;
        if (usedBytes + entryBytes > MAX_STORAGE_BYTES) continue;

        next[key] = entry;
        usedBytes += entryBytes;
    }

    return next;
}

function parseStoredCache(raw: string | null): { cache: LogoCache; shouldPersist: boolean } {
    if (!raw) return { cache: {}, shouldPersist: false };

    try {
        const parsed = JSON.parse(raw) as unknown;
        if (!parsed || typeof parsed !== 'object') {
            return { cache: {}, shouldPersist: true };
        }

        const record = parsed as LogoCachePayload | Record<string, unknown>;
        const source = 'version' in record && record.version === CACHE_VERSION && 'entries' in record
            ? record.entries
            : record;
        if (!source || typeof source !== 'object') {
            return { cache: {}, shouldPersist: true };
        }

        const cache: LogoCache = {};

        for (const [rawKey, rawEntry] of Object.entries(source || {})) {
            const key = normalizeCacheKey(rawKey);
            const entry = normalizeEntry(rawEntry);
            if (key && entry) {
                cache[key] = entry;
            }
        }

        const pruned = pruneCache(cache);
        return {
            cache: pruned,
            shouldPersist: raw.length !== JSON.stringify({ version: CACHE_VERSION, entries: pruned }).length,
        };
    } catch {
        return { cache: {}, shouldPersist: true };
    }
}

function persistCache(cache: LogoCache): void {
    if (typeof window === 'undefined') return;

    let pruned = pruneCache(cache);
    memoryCache = pruned;

    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ version: CACHE_VERSION, entries: pruned }));
        return;
    } catch {
        // If the browser is already over quota, keep the newest small subset.
    }

    pruned = pruneCache(Object.fromEntries(Object.entries(pruned).slice(0, Math.floor(MAX_ENTRIES / 2))));
    memoryCache = pruned;

    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ version: CACHE_VERSION, entries: pruned }));
        return;
    } catch {
        // Last resort: free the persistent slot but keep the in-memory cache for this page.
    }

    try {
        localStorage.removeItem(CACHE_KEY);
    } catch {
        // Ignore readonly/private browsing storage failures.
    }
}

function getCache(): LogoCache {
    if (memoryCache) return memoryCache;
    if (typeof window === 'undefined') return {};

    try {
        const { cache, shouldPersist } = parseStoredCache(localStorage.getItem(CACHE_KEY));
        memoryCache = cache;
        if (shouldPersist) persistCache(cache);
        return memoryCache;
    } catch {
        memoryCache = {};
        return {};
    }
}

export function getCachedLogo(tournamentId: string): string | null {
    const key = normalizeCacheKey(tournamentId);
    if (!key) return null;

    const cache = getCache();
    return cache[key]?.url || null;
}

export function setCachedLogo(tournamentId: string, logoUrl: string): void {
    if (typeof window === 'undefined') return;

    const key = normalizeCacheKey(tournamentId);
    const url = logoUrl.trim();
    if (!key || !isCacheableLogoUrl(url)) return;

    const cache = getCache();
    if (cache[key]?.url === url) return;

    cache[key] = { url, updatedAt: Date.now() };
    persistCache(cache);
}
