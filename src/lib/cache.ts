// Simple in-memory cache with TTL (Time To Live)
interface CacheEntry<T> {
    data: T;
    timestamp: number;
    ttl: number;
}

// Tope de entradas por instancia. Sin tope, las rutas anónimas que arman la
// clave con parámetros libres (search, url, season, fecha) hacen crecer el Map
// sin límite: cada combinación distinta es una entrada nueva que solo se va por
// TTL, y un script puede llenar la memoria de la lambda antes de que venza.
// 1000 alcanza de sobra para el uso legítimo (los feeds canónicos son decenas).
const MAX_ENTRIES = 1000;

class MemoryCache {
    private cache: Map<string, CacheEntry<unknown>>;
    private readonly maxEntries: number;

    constructor(maxEntries: number = MAX_ENTRIES) {
        this.cache = new Map();
        this.maxEntries = maxEntries;
    }

    set<T>(key: string, data: T, ttlSeconds: number = 300): void {
        // delete + set la manda al final: el Map conserva el orden de inserción
        // y eso es lo que usamos como orden LRU (el primero es el más viejo).
        this.cache.delete(key);
        this.cache.set(key, {
            data,
            timestamp: Date.now(),
            ttl: ttlSeconds * 1000
        });
        this.evictOverflow();
    }

    private evictOverflow(): void {
        if (this.cache.size <= this.maxEntries) return;
        // Primero lo vencido, que no le cuesta nada a nadie; si con eso no
        // alcanza, se va lo menos usado recientemente.
        this.cleanup();
        while (this.cache.size > this.maxEntries) {
            const oldest = this.cache.keys().next();
            if (oldest.done) break;
            this.cache.delete(oldest.value);
        }
    }

    get<T>(key: string): T | null {
        const entry = this.cache.get(key);

        if (!entry) {
            return null;
        }

        const now = Date.now();
        const age = now - entry.timestamp;

        // Check if cache has expired
        if (age > entry.ttl) {
            this.cache.delete(key);
            return null;
        }

        // Un acierto la vuelve "reciente" para el desalojo LRU.
        this.cache.delete(key);
        this.cache.set(key, entry);

        return entry.data as T;
    }

    has(key: string): boolean {
        const data = this.get(key);
        return data !== null;
    }

    delete(key: string): void {
        this.cache.delete(key);
    }

    deleteByPrefix(prefix: string): number {
        let deleted = 0;

        for (const key of this.cache.keys()) {
            if (!key.startsWith(prefix)) continue;
            this.cache.delete(key);
            deleted += 1;
        }

        return deleted;
    }

    clear(): void {
        this.cache.clear();
    }

    // Clean up expired entries
    cleanup(): void {
        const now = Date.now();
        for (const [key, entry] of this.cache.entries()) {
            const age = now - entry.timestamp;
            if (age > entry.ttl) {
                this.cache.delete(key);
            }
        }
    }

    // Get cache stats
    stats() {
        return {
            size: this.cache.size,
            keys: Array.from(this.cache.keys())
        };
    }
}

// Global cache instance
export const memoryCache = new MemoryCache();

// Auto cleanup every 5 minutes
if (typeof window === 'undefined') {
    // Only run cleanup on server-side
    setInterval(() => {
        memoryCache.cleanup();
    }, 5 * 60 * 1000);
}
