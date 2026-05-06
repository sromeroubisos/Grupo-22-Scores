import {
    extractRowCount,
    findHeavyFields,
    formatDurationMs,
    isPerfEnabled,
    isSelectStar,
    logLargePayloadWarning,
    logOverfetchWarning,
    logPerf,
    measureAsync,
    normalizeErrorMessage,
    type PerfRuntime,
} from './measure';

type SupabaseMinimalQueryable = {
    from: (table: string) => {
        select: (columns: string) => {
            limit: (count: number) => PromiseLike<{ data: unknown; error: { message?: string } | null }>;
        };
    };
};

const DEFAULT_SERVER_SUPABASE_FETCH_TIMEOUT_MS = 8000;
const DEFAULT_CLIENT_SUPABASE_FETCH_TIMEOUT_MS = 15000;

function resolveUrl(input: string | URL | Request) {
    if (typeof input === 'string') return input;
    if (input instanceof URL) return input.toString();
    return input.url;
}

function getMethod(init?: RequestInit) {
    return init?.method?.toUpperCase() || 'GET';
}

function getSupabaseServiceLabel(pathname: string) {
    if (pathname.includes('/auth/v1')) return 'AUTH';
    if (pathname.includes('/storage/v1')) return 'STORAGE';
    if (pathname.includes('/rest/v1')) return 'SUPABASE';
    return 'SUPABASE';
}

function getSupabaseFetchTimeoutMs(runtime: Exclude<PerfRuntime, 'either'>) {
    if (runtime === 'client') {
        return DEFAULT_CLIENT_SUPABASE_FETCH_TIMEOUT_MS;
    }

    const configured = Number(process.env.SUPABASE_FETCH_TIMEOUT_MS);
    if (Number.isFinite(configured) && configured > 0) {
        return configured;
    }

    return DEFAULT_SERVER_SUPABASE_FETCH_TIMEOUT_MS;
}

async function fetchWithTimeout(
    fetchImpl: typeof fetch,
    input: string | URL | Request,
    init: RequestInit | undefined,
    timeoutMs: number,
    label: string,
) {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
        return fetchImpl(input, init);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
        controller.abort(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    const upstreamSignal = init?.signal;
    const abortFromUpstream = () => {
        controller.abort(upstreamSignal?.reason);
    };

    if (upstreamSignal) {
        if (upstreamSignal.aborted) {
            abortFromUpstream();
        } else {
            upstreamSignal.addEventListener('abort', abortFromUpstream, { once: true });
        }
    }

    try {
        return await fetchImpl(input, {
            ...init,
            signal: controller.signal,
        });
    } finally {
        clearTimeout(timeoutId);
        if (upstreamSignal) {
            upstreamSignal.removeEventListener('abort', abortFromUpstream);
        }
    }
}

function getOperationLabel(method: string, pathname: string, searchParams: URLSearchParams) {
    if (pathname.includes('/rpc/')) {
        return pathname.split('/rpc/')[1] || 'rpc';
    }

    if (pathname.includes('/auth/v1')) {
        return pathname.split('/auth/v1/')[1] || method.toLowerCase();
    }

    if (method === 'GET') {
        const selectValue = searchParams.get('select');
        const limitValue = searchParams.get('limit');
        if (selectValue === 'id' && limitValue === '1') return 'minimal_select';
        return 'select';
    }

    if (method === 'POST') return 'insert';
    if (method === 'PATCH') return 'update';
    if (method === 'DELETE') return 'delete';
    return method.toLowerCase();
}

function getTableLabel(pathname: string) {
    if (pathname.includes('/rpc/')) {
        return pathname.split('/rpc/')[1] || 'rpc';
    }

    const match = pathname.match(/\/rest\/v1\/([^/?]+)/);
    if (match?.[1]) return match[1];

    const authMatch = pathname.match(/\/auth\/v1\/([^/?]+)/);
    if (authMatch?.[1]) return authMatch[1];

    return 'unknown';
}

async function inspectSupabaseResponse(response: Response) {
    const contentType = response.headers.get('content-type') || '';
    const contentLength = response.headers.get('content-length');
    let payloadBytes = contentLength ? Number(contentLength) : 0;
    let rows = 0;

    if (!contentType.includes('application/json')) {
        return { payloadBytes, rows };
    }

    try {
        const cloned = response.clone();
        const text = await cloned.text();
        if (!payloadBytes) {
            payloadBytes = new TextEncoder().encode(text).length;
        }

        if (!text.trim()) {
            return { payloadBytes, rows };
        }

        const parsed = JSON.parse(text) as unknown;
        rows = extractRowCount(parsed);
    } catch {
        return { payloadBytes, rows };
    }

    return { payloadBytes, rows };
}

export function createInstrumentedSupabaseFetch(
    runtime: Exclude<PerfRuntime, 'either'>,
    supabaseUrl: string | undefined,
    fetchImpl: typeof fetch,
) {
    return async (input: string | URL | Request, init?: RequestInit) => {
        const requestUrl = resolveUrl(input);
        const isSupabaseRequest = Boolean(supabaseUrl) && requestUrl.startsWith(String(supabaseUrl));

        if (!isSupabaseRequest) {
            return fetchImpl(input, init);
        }

        const parsedUrl = new URL(requestUrl);
        const method = getMethod(init);
        const service = getSupabaseServiceLabel(parsedUrl.pathname);
        const operation = getOperationLabel(method, parsedUrl.pathname, parsedUrl.searchParams);
        const table = getTableLabel(parsedUrl.pathname);
        const selectValue = parsedUrl.searchParams.get('select') || '';
        const timeoutMs = getSupabaseFetchTimeoutMs(runtime);
        const timedFetch = () => fetchWithTimeout(
            fetchImpl,
            input,
            init,
            timeoutMs,
            `${runtime}:${service}:${operation}`,
        );

        if (!isPerfEnabled(runtime)) {
            return timedFetch();
        }

        const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();

        try {
            const response = await timedFetch();
            const durationMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt;
            const inspection = await inspectSupabaseResponse(response);

            logPerf(
                [runtime.toUpperCase(), service],
                {
                    operation,
                    table,
                    method,
                    duration: formatDurationMs(durationMs),
                    rows: inspection.rows,
                    error: !response.ok,
                    status: response.status,
                },
                runtime,
            );

            if (selectValue && isSelectStar(selectValue)) {
                logOverfetchWarning(
                    {
                        location: `${runtime}:${table}`,
                        reason: 'select(*) detected',
                        table,
                        operation,
                    },
                    runtime,
                );
            }

            const heavyFields = selectValue ? findHeavyFields(selectValue) : [];
            if (heavyFields.length > 0) {
                logOverfetchWarning(
                    {
                        location: `${runtime}:${table}`,
                        reason: 'heavy_fields_selected',
                        table,
                        fields: heavyFields.join(','),
                    },
                    runtime,
                );
            }

            if (inspection.payloadBytes > 250 * 1024) {
                logLargePayloadWarning(
                    {
                        location: `${runtime}:${table}`,
                        table,
                        operation,
                        payload: `${(inspection.payloadBytes / 1024).toFixed(1)}kb`,
                    },
                    runtime,
                );
            }

            return response;
        } catch (error) {
            const durationMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt;
            logPerf(
                [runtime.toUpperCase(), service, 'ERROR'],
                {
                    operation,
                    table,
                    method,
                    duration: formatDurationMs(durationMs),
                    error: normalizeErrorMessage(error),
                },
                runtime,
            );
            throw error;
        }
    };
}

export async function runSupabaseLatencyProbe(
    client: SupabaseMinimalQueryable,
    options?: {
        runtime?: Exclude<PerfRuntime, 'either'>;
        table?: string;
        columns?: string;
        limit?: number;
    },
) {
    const runtime = options?.runtime ?? 'server';
    const table = options?.table ?? 'matches';
    const columns = options?.columns ?? 'id';
    const limit = options?.limit ?? 1;

    return measureAsync(
        'minimal_select',
        async () => {
            const { data, error } = await client
                .from(table)
                .select(columns)
                .limit(limit);

            return {
                data,
                error,
            };
        },
        {
            runtime,
            tags: [runtime.toUpperCase(), 'SUPABASE'],
            metadata: {
                operation: 'minimal_select',
                table,
            },
            describeResult: (result) => ({
                rows: extractRowCount(result.data),
                error: Boolean(result.error),
            }),
            describeError: (error) => ({
                table,
                error: normalizeErrorMessage(error),
            }),
        },
    );
}

export function shouldRunClientPerf() {
    return isPerfEnabled('client');
}
