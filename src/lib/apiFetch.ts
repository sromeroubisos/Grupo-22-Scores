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
        /**
         * Tope por request. El default de 25 s está pensado para cargas largas
         * (detalle de torneo, historial); un listado que se sirve en el camino
         * crítico de una página tiene que rendirse mucho antes y caer a caché.
         */
        timeoutMs?: number;
    } = {}
    // M9: `ok`/`status` let callers distinguish a failed request (network error,
    // timeout, non-2xx) from a legitimately empty payload without breaking the
    // existing `{ data, debug }` destructuring.
): Promise<{ data: T | null; ok: boolean; status: number; debug: ApiDebug }> {
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
    const TIMEOUT_MS = opts.timeoutMs && opts.timeoutMs > 0 ? opts.timeoutMs : 25000; // 25s por defecto
    const timeoutId = setTimeout(() => controller.abort(new Error("Request timeout")), TIMEOUT_MS);

    // Chain external signal if provided
    if (opts.signal) {
        opts.signal.addEventListener('abort', () => {
            controller.abort(opts.signal?.reason);
        });
    }

    try {
        const res = await fetch(url, {
            ...opts,
            headers,
            cache: cacheStrategy,
            signal: controller.signal,
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
            return { data: null, ok: false, status: res.status, debug };
        }

        return { data: json as T, ok: true, status: res.status, debug };
    } catch (error: any) {
        clearTimeout(timeoutId);
        const ms = Date.now() - t0;
        // The timeout above aborts with `new Error("Request timeout")`, which does
        // NOT surface as error.name === 'AbortError' - match the message too.
        const isTimeout = error?.name === 'AbortError'
            || error?.name === 'TimeoutError'
            || /request timeout/i.test(String(error?.message ?? error));

        const debug: ApiDebug = {
            url,
            status: isTimeout ? 408 : 500,
            ok: false,
            ms,
            bodyPreview: { error: String(error), isTimeout }
        };

        console.error(`[API Fetch Failed] ${opts.debugTag || 'Fetch'} - ${url} - Error: ${error.message} (${ms}ms)`);
        return { data: null, ok: false, status: isTimeout ? 408 : 500, debug };
    }
}
