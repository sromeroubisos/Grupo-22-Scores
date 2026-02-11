export type ApiDebug = {
    url: string;
    status: number;
    ok: boolean;
    ms: number;
    contentType?: string | null;
    bodyPreview?: unknown;
};

export async function apiFetch<T = unknown>(
    url: string,
    opts: RequestInit & {
        debugTag?: string;
        silent?: boolean;
        cacheTtl?: number; // Cache TTL in seconds, 0 = no cache
    } = {}
): Promise<{ data: T | null; debug: ApiDebug }> {
    const t0 = Date.now();

    // Default headers
    const headers = new Headers(opts.headers || {});
    if (!headers.has("Accept")) {
        headers.set("Accept", "application/json");
    }

    // Determine cache strategy
    // If cacheTtl is provided and > 0, use default cache
    // Otherwise use no-store (for dev/debugging)
    const cacheStrategy: RequestCache = (opts.cacheTtl && opts.cacheTtl > 0)
        ? "default"
        : "no-store";

    const res = await fetch(url, {
        ...opts,
        headers,
        cache: cacheStrategy,
        next: opts.cacheTtl ? { revalidate: opts.cacheTtl } : undefined,
    });

    const ms = Date.now() - t0;
    const contentType = res.headers.get("content-type");

    let json: any = null;
    let bodyPreview: any = null;

    try {
        // Clone response so we can read it twice if needed (though we only read once here)
        const clone = res.clone();
        if (contentType?.includes("application/json")) {
            json = await res.json();
            bodyPreview = Array.isArray(json) ? json.slice(0, 1) : json;
        } else {
            const text = await clone.text();
            bodyPreview = text.slice(0, 300);
        }
    } catch (e) {
        bodyPreview = { parseError: String(e) };
    }

    const debug: ApiDebug = { url, status: res.status, ok: res.ok, ms, contentType, bodyPreview };

    console.log(`[API Call] ${opts.debugTag || 'Fetch'} - Status: ${res.status} - ${url}`);
    if (!res.ok) {
        console.error(`[API Error] Details:`, debug);
        return { data: null, debug };
    }

    return { data: json as T, debug };
}
