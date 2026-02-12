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
    const cacheStrategy: RequestCache = (opts.cacheTtl && opts.cacheTtl > 0)
        ? "default"
        : "no-store";

    // Set a timeout to prevent hanging requests
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

    try {
        const res = await fetch(url, {
            ...opts,
            headers,
            cache: cacheStrategy,
            signal: controller.signal,
            // @ts-ignore - next specific options
            next: opts.cacheTtl ? { revalidate: opts.cacheTtl } : undefined,
        });

        clearTimeout(timeoutId);

        const ms = Date.now() - t0;
        const contentType = res.headers.get("content-type");

        let json: any = null;
        let bodyPreview: any = null;

        try {
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

        console.log(`[API Call] ${opts.debugTag || 'Fetch'} - Status: ${res.status} - ${url} (${ms}ms)`);
        if (!res.ok) {
            if (!opts.silent) console.error(`[API Error] Details:`, debug);
            return { data: null, debug };
        }

        return { data: json as T, debug };
    } catch (error: any) {
        clearTimeout(timeoutId);
        const ms = Date.now() - t0;
        const isTimeout = error.name === 'AbortError';

        const debug: ApiDebug = {
            url,
            status: isTimeout ? 408 : 500,
            ok: false,
            ms,
            bodyPreview: { error: String(error), isTimeout }
        };

        console.error(`[API Fetch Failed] ${opts.debugTag || 'Fetch'} - ${url} - Error: ${error.message} (${ms}ms)`);
        return { data: null, debug };
    }
}

