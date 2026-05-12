function resolveRequestUrl(input: string | URL | Request): string {
    if (typeof input === 'string') return input;
    if (input instanceof URL) return input.toString();
    return input.url;
}

export function isSupabaseAuthRequest(input: string | URL | Request, supabaseUrl: string) {
    return resolveRequestUrl(input).startsWith(`${supabaseUrl}/auth/v1`);
}

export function isSupabaseRefreshTokenRequest(input: string | URL | Request, supabaseUrl: string) {
    const requestUrl = resolveRequestUrl(input);
    if (!requestUrl.startsWith(`${supabaseUrl}/auth/v1/token`)) return false;
    return requestUrl.includes('grant_type=refresh_token');
}

function buildRetryableRefreshRateLimitResponse(response: Response) {
    const headers = new Headers(response.headers);
    headers.set('Content-Type', 'application/json');
    headers.set('X-G22-Original-Auth-Status', String(response.status));

    return new Response(
        JSON.stringify({
            error: 'supabase_auth_refresh_rate_limited',
            message: 'Supabase auth refresh is temporarily rate limited; preserving the current session.',
        }),
        {
            status: 503,
            statusText: 'Service Unavailable',
            headers,
        },
    );
}

export function coerceRefreshRateLimitToRetryable(
    input: string | URL | Request,
    supabaseUrl: string,
    response: Response,
) {
    if (response.status !== 429) return response;
    if (!isSupabaseRefreshTokenRequest(input, supabaseUrl)) return response;

    // auth-js treats 429 as a non-retryable AuthApiError and clears storage.
    // For refresh-token calls that is too destructive: rate limits are
    // transient, so expose them as retryable 503s and keep the session intact.
    return buildRetryableRefreshRateLimitResponse(response);
}

export function createRetryableRefreshFetch(
    supabaseUrl: string | undefined,
    fetchImpl: typeof fetch,
): typeof fetch {
    return async (input, init) => {
        const response = await fetchImpl(input, init);
        if (!supabaseUrl) return response;
        return coerceRefreshRateLimitToRetryable(input, supabaseUrl, response);
    };
}

export function isRetryableAuthRefreshError(error: unknown) {
    if (!error || typeof error !== 'object') return false;

    const name = 'name' in error && typeof error.name === 'string'
        ? error.name
        : '';
    const status = 'status' in error && typeof error.status === 'number'
        ? error.status
        : null;
    const message = 'message' in error && typeof error.message === 'string'
        ? error.message.toLowerCase()
        : '';

    return (
        name === 'AuthRetryableFetchError' ||
        status === 429 ||
        status === 502 ||
        status === 503 ||
        status === 504 ||
        message.includes('rate limit') ||
        message.includes('temporarily unavailable') ||
        message.includes('timed out')
    );
}
