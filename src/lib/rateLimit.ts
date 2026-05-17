type LimitEntry = {
    count: number;
    resetAt: number;
};

const store = new Map<string, LimitEntry>();
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 10;

export function rateLimitByIp(
    ip: string,
    maxRequests: number = MAX_REQUESTS,
): { allowed: boolean; retryAfter?: number } {
    const now = Date.now();
    const entry = store.get(ip);

    if (!entry || now > entry.resetAt) {
        store.set(ip, { count: 1, resetAt: now + WINDOW_MS });
        return { allowed: true };
    }

    if (entry.count >= maxRequests) {
        const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
        return { allowed: false, retryAfter };
    }

    entry.count += 1;
    return { allowed: true };
}

// Simple in-memory sliding window for auth callbacks (stricter)
const authStore = new Map<string, LimitEntry>();
const AUTH_WINDOW_MS = 60_000;
const AUTH_MAX_REQUESTS = 5;

export function rateLimitAuthCallback(ip: string): { allowed: boolean; retryAfter?: number } {
    const now = Date.now();
    const entry = authStore.get(ip);

    if (!entry || now > entry.resetAt) {
        authStore.set(ip, { count: 1, resetAt: now + AUTH_WINDOW_MS });
        return { allowed: true };
    }

    if (entry.count >= AUTH_MAX_REQUESTS) {
        const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
        return { allowed: false, retryAfter };
    }

    entry.count += 1;
    return { allowed: true };
}
