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
const DB_QUERY_LOG_MAX_VALUE_LENGTH = 500;
const DB_QUERY_LOG_IGNORED_FILTERS = new Set([
    'select',
    'order',
    'limit',
    'offset',
    'apikey',
    'authorization',
]);
const DB_QUERY_LOG_SENSITIVE_KEYS = [
    'access_token',
    'refresh_token',
    'token',
    'apikey',
    'api_key',
    'authorization',
    'password',
    'secret',
    'service_role',
];

type SupabaseResponseInspection = {
    payloadBytes: number;
    rows: number;
    error: {
        code?: string | null;
        message?: string | null;
        details?: unknown;
        hint?: unknown;
    } | null;
};

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

function isDbQueryDebugEnabled(runtime: Exclude<PerfRuntime, 'either'>) {
    if (runtime === 'client') {
        return process.env.NEXT_PUBLIC_DEBUG_DB_QUERIES === 'true';
    }

    return process.env.DEBUG_DB_QUERIES === 'true';
}

function shouldDebugLogDbQuery(pathname: string) {
    return pathname.includes('/rest/v1/') || pathname.includes('/rpc/');
}

function sanitizeLogValue(value: unknown) {
    const normalized = String(value ?? '')
        .replace(/\s+/g, ' ')
        .trim();

    if (normalized.length <= DB_QUERY_LOG_MAX_VALUE_LENGTH) return normalized;
    return `${normalized.slice(0, DB_QUERY_LOG_MAX_VALUE_LENGTH)}...`;
}

function isSensitiveKey(key: string) {
    const normalized = key.toLowerCase();
    return DB_QUERY_LOG_SENSITIVE_KEYS.some((sensitive) => normalized.includes(sensitive));
}

function getRequestHeader(input: string | URL | Request, init: RequestInit | undefined, name: string) {
    const lowerName = name.toLowerCase();

    if (input instanceof Request) {
        const value = input.headers.get(name);
        if (value) return value;
    }

    const headers = init?.headers;
    if (!headers) return null;

    if (headers instanceof Headers) {
        return headers.get(name);
    }

    if (Array.isArray(headers)) {
        const found = headers.find(([key]) => key.toLowerCase() === lowerName);
        return found?.[1] ?? null;
    }

    const record = headers as Record<string, string>;
    return record[name] ?? record[lowerName] ?? null;
}

function getRequestCorrelationId(input: string | URL | Request, init?: RequestInit) {
    return (
        getRequestHeader(input, init, 'x-request-id') ||
        getRequestHeader(input, init, 'x-correlation-id') ||
        getRequestHeader(input, init, 'x-client-info')
    );
}

function getSafeDbFilters(searchParams: URLSearchParams) {
    const filters: string[] = [];

    searchParams.forEach((value, key) => {
        if (DB_QUERY_LOG_IGNORED_FILTERS.has(key.toLowerCase())) return;
        if (isSensitiveKey(key)) {
            filters.push(`${key}=[redacted]`);
            return;
        }

        filters.push(`${key}=${sanitizeLogValue(value)}`);
    });

    return filters.join(',');
}

function getDbAction(method: string, pathname: string) {
    if (pathname.includes('/rpc/')) return 'rpc';
    if (method === 'GET') return 'select';
    if (method === 'POST') return 'insert';
    if (method === 'PATCH') return 'update';
    if (method === 'DELETE') return 'delete';
    return method.toLowerCase();
}

function getDbOperationName(operation: string, table: string, action: string) {
    if (operation && operation !== action) return operation;
    if (!table || table === 'unknown') return action;
    return `${action}:${table}`;
}

function serializeDbQueryLog(metadata: Record<string, unknown>) {
    return Object.entries(metadata)
        .filter(([, value]) => value !== undefined && value !== null && value !== '')
        .map(([key, value]) => `${key}=${sanitizeLogValue(value)}`)
        .join(' ');
}

function logDbQuery(metadata: Record<string, unknown>) {
    const body = serializeDbQueryLog(metadata);
    console.log(body ? `[DB] ${body}` : '[DB]');
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

async function inspectSupabaseResponse(response: Response): Promise<SupabaseResponseInspection> {
    const contentType = response.headers.get('content-type') || '';
    const contentLength = response.headers.get('content-length');
    let payloadBytes = contentLength ? Number(contentLength) : 0;
    let rows = 0;
    let error: SupabaseResponseInspection['error'] = null;

    if (!contentType.includes('application/json')) {
        return { payloadBytes, rows, error };
    }

    try {
        const cloned = response.clone();
        const text = await cloned.text();
        if (!payloadBytes) {
            payloadBytes = new TextEncoder().encode(text).length;
        }

        if (!text.trim()) {
            return { payloadBytes, rows, error };
        }

        const parsed = JSON.parse(text) as unknown;
        rows = extractRowCount(parsed);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            const record = parsed as {
                code?: unknown;
                message?: unknown;
                details?: unknown;
                hint?: unknown;
            };
            if (
                typeof record.code === 'string' ||
                typeof record.message === 'string' ||
                record.details !== undefined ||
                record.hint !== undefined
            ) {
                error = {
                    code: typeof record.code === 'string' ? record.code : null,
                    message: typeof record.message === 'string' ? record.message : null,
                    details: record.details,
                    hint: record.hint,
                };
            }
        }
    } catch {
        return { payloadBytes, rows, error };
    }

    return { payloadBytes, rows, error };
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
        const action = getDbAction(method, parsedUrl.pathname);
        const selectValue = parsedUrl.searchParams.get('select') || '';
        const timeoutMs = getSupabaseFetchTimeoutMs(runtime);
        const perfEnabled = isPerfEnabled(runtime);
        const dbQueryDebugEnabled = isDbQueryDebugEnabled(runtime) && shouldDebugLogDbQuery(parsedUrl.pathname);
        const startedAtIso = new Date().toISOString();
        const filters = getSafeDbFilters(parsedUrl.searchParams);
        const requestId = getRequestCorrelationId(input, init);
        const timedFetch = () => fetchWithTimeout(
            fetchImpl,
            input,
            init,
            timeoutMs,
            `${runtime}:${service}:${operation}`,
        );

        if (!perfEnabled && !dbQueryDebugEnabled) {
            return timedFetch();
        }

        const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();

        try {
            const response = await timedFetch();
            const durationMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt;
            const inspection = await inspectSupabaseResponse(response);

            if (perfEnabled) {
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
            }

            if (dbQueryDebugEnabled) {
                logDbQuery({
                    operation: getDbOperationName(operation, table, action),
                    table,
                    action,
                    startedAt: startedAtIso,
                    endedAt: new Date().toISOString(),
                    durationMs: Math.round(durationMs),
                    status: response.ok ? 'ok' : 'error',
                    httpStatus: response.status,
                    rows: inspection.rows,
                    filters,
                    requestId,
                    errorCode: inspection.error?.code,
                    errorMessage: inspection.error?.message,
                    errorDetails: inspection.error?.details ? JSON.stringify(inspection.error.details) : undefined,
                    errorHint: inspection.error?.hint ? JSON.stringify(inspection.error.hint) : undefined,
                });
            }

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
            if (perfEnabled) {
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
            }
            if (dbQueryDebugEnabled) {
                logDbQuery({
                    operation: getDbOperationName(operation, table, action),
                    table,
                    action,
                    startedAt: startedAtIso,
                    endedAt: new Date().toISOString(),
                    durationMs: Math.round(durationMs),
                    status: 'error',
                    filters,
                    requestId,
                    errorMessage: normalizeErrorMessage(error),
                });
            }
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
