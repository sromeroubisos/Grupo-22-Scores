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

function buildRetryableRefreshFailureResponse(response: Response, reason: string) {
    const headers = new Headers(response.headers);
    headers.set('Content-Type', 'application/json');
    headers.set('X-G22-Original-Auth-Status', String(response.status));
    headers.set('X-G22-Auth-Preserved-Reason', reason);

    return new Response(
        JSON.stringify({
            error: 'supabase_auth_refresh_preserved',
            message: 'Supabase auth refresh failed transiently; preserving the current session.',
            reason,
        }),
        {
            status: 503,
            statusText: 'Service Unavailable',
            headers,
        },
    );
}

function refreshFailureReasonFromBody(body: unknown): string | null {
    const value = typeof body === 'string'
        ? body
        : body && typeof body === 'object'
            ? JSON.stringify(body)
            : '';
    const normalized = value.toLowerCase();

    if (
        normalized.includes('refresh_token_already_used') ||
        normalized.includes('refresh token already used')
    ) {
        return 'refresh_token_already_used';
    }

    if (
        normalized.includes('invalid_refresh_token') ||
        normalized.includes('refresh_token_not_found') ||
        normalized.includes('refresh token is not valid') ||
        normalized.includes('invalid refresh token')
    ) {
        return 'invalid_refresh_token';
    }

    return null;
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
    return buildRetryableRefreshFailureResponse(response, 'rate_limited');
}

export async function coerceRefreshFailureToRetryable(
    input: string | URL | Request,
    supabaseUrl: string,
    response: Response,
) {
    const rateLimitResponse = coerceRefreshRateLimitToRetryable(input, supabaseUrl, response);
    if (rateLimitResponse !== response) return rateLimitResponse;
    if (!isSupabaseRefreshTokenRequest(input, supabaseUrl)) return response;
    if (![400, 401, 403].includes(response.status)) return response;

    let reason: string | null = null;
    try {
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
            reason = refreshFailureReasonFromBody(await response.clone().json());
        } else {
            reason = refreshFailureReasonFromBody(await response.clone().text());
        }
    } catch {
        reason = null;
    }

    if (!reason) return response;

    // Supabase rotates refresh tokens. During a client/server refresh race,
    // the loser can see "already used" or "invalid" even though another
    // request just minted a good session. Treat that as retryable so auth-js
    // does not eagerly wipe storage and emit SIGNED_OUT.
    return buildRetryableRefreshFailureResponse(response, reason);
}

export function createRetryableRefreshFetch(
    supabaseUrl: string | undefined,
    fetchImpl: typeof fetch,
): typeof fetch {
    return async (input, init) => {
        const response = await fetchImpl(input, init);
        if (!supabaseUrl) return response;
        return coerceRefreshFailureToRetryable(input, supabaseUrl, response);
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
        message.includes('timed out') ||
        message.includes('refresh failed transiently')
    );
}
