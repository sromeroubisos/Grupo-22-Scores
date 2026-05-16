import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { logRefreshFlow } from '@/lib/debug/refreshFlow';
import { logRefreshLoop } from '@/lib/debug/refreshLoop';
import { createInstrumentedSupabaseFetch } from '@/lib/perf/supabase';
import { logPerf, measureAsync } from '@/lib/perf/measure';
import { createRetryableRefreshFetch, isRetryableAuthRefreshError } from '@/lib/supabase/auth-fetch';
import {
    getSupabaseAuthCookieOptions,
    getSupabaseAuthStorageKey,
    MAX_SUPABASE_AUTH_COOKIE_CHUNKS,
    normalizeSupabaseAuthCookies,
    parseSupabaseAuthCookiePayload,
    readSupabaseAuthSessionCookieValue,
} from '@/lib/supabase/auth-cookie';

const AUTH_REFRESH_TIMEOUT_MS = 2500;
// Protected/admin routes are low-traffic compared to public pages, so the
// "avoid a refresh storm" reasoning behind the tight public timeout does not
// apply. On mobile networks a single `/token` round-trip can take several
// seconds; abandoning it at 2.5s leaves the proxy forwarding a stale cookie
// (readUserFromCookie ignores expiry), and the protected Server Component
// then fails `getUser()` and bounces the user to `/`. Give these requests
// enough room to actually complete the refresh.
export const PROTECTED_AUTH_REFRESH_TIMEOUT_MS = 9000;
const SHOULD_LOG_PROXY_AUTH = process.env.ENABLE_SERVER_PERF_LOGS === 'true' || process.env.NODE_ENV !== 'production';
// Margin before access_token expiry where the proxy will trigger a refresh.
// Anything fresher than this window is treated as valid and the entire auth
// roundtrip is skipped to avoid hammering Supabase Auth with /token calls.
const ACCESS_TOKEN_REFRESH_MARGIN_SECONDS = 120;
const INVALID_REFRESH_TOKEN_CODES = new Set([
    'refresh_token_already_used',
    'invalid_refresh_token',
    'refresh_token_not_found',
]);

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const timeoutPromise = new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => {
            reject(new Error(`${label} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
    });

    return Promise.race([promise, timeoutPromise]).finally(() => {
        if (timeoutId) clearTimeout(timeoutId);
    });
}

function getSupabaseAuthCookieBaseName(): string | null {
    return getSupabaseAuthStorageKey();
}

function getRequestHost(request: NextRequest) {
    return request.headers.get('x-forwarded-host') || request.headers.get('host') || request.nextUrl.hostname;
}

function buildResponseAuthCookieOptions(request: NextRequest, options?: NonNullable<Parameters<NextResponse['cookies']['set']>[2]>) {
    const sharedCookieOptions = getSupabaseAuthCookieOptions(getRequestHost(request));
    return {
        ...sharedCookieOptions,
        ...options,
        sameSite: 'lax' as const,
        secure: process.env.NODE_ENV === 'production',
        httpOnly: false,
        path: '/',
        ...(sharedCookieOptions.domain ? { domain: sharedCookieOptions.domain } : {}),
    };
}

function getAuthCookieNames(): string[] {
    const baseName = getSupabaseAuthCookieBaseName();
    if (!baseName) return [];

    const names = [baseName, `${baseName}-code-verifier`, `${baseName}-user`];
    for (let index = 0; index < MAX_SUPABASE_AUTH_COOKIE_CHUNKS; index += 1) {
        names.push(`${baseName}.${index}`);
    }
    return names;
}

function clearAuthCookies(request: NextRequest, response: NextResponse) {
    for (const name of getAuthCookieNames()) {
        request.cookies.delete(name);
        response.cookies.set(name, '', {
            ...buildResponseAuthCookieOptions(request),
            maxAge: 0,
            expires: new Date(0),
        });
    }
}

function buildExpiredAuthCookieHeader(name: string, domain?: string): string {
    const parts = [
        `${name}=`,
        'Path=/',
        'Max-Age=0',
        'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
        'SameSite=Lax',
    ];
    if (domain) parts.push(`Domain=${domain}`);
    if (process.env.NODE_ENV === 'production') parts.push('Secure');
    return parts.join('; ');
}

/**
 * Expire every Supabase auth cookie variant in BOTH the host-only scope and
 * the shared `.g22scores.com` scope.
 *
 * For a long time different code paths wrote the session cookie at different
 * scopes (OAuth callback was host-only, email login + proxy refresh were
 * domain-scoped). On the apex domain that leaves duplicate `sb-<ref>-auth-
 * token` cookies that permanently shadow each other and break server-side
 * session recognition -> infinite /login loop. `clearAuthCookies` only
 * expires the domain-scoped variant, so a stale host-only cookie survives
 * and re-poisons every fresh login. Clearing both scopes on the login
 * bounce flushes already-poisoned browsers so the next login is clean.
 *
 * We append raw Set-Cookie headers because `NextResponse.cookies.set`
 * de-duplicates by name and cannot emit the same cookie name twice (once
 * per scope) in one response.
 */
export function clearAllAuthCookieScopes(request: NextRequest, response: NextResponse) {
    const sharedDomain = getSupabaseAuthCookieOptions(getRequestHost(request)).domain;
    for (const name of getAuthCookieNames()) {
        request.cookies.delete(name);
        response.headers.append('Set-Cookie', buildExpiredAuthCookieHeader(name));
        if (sharedDomain) {
            response.headers.append('Set-Cookie', buildExpiredAuthCookieHeader(name, sharedDomain));
        }
    }
}

function isInvalidRefreshTokenError(error: unknown) {
    if (!error || typeof error !== 'object') {
        return false;
    }

    const code = 'code' in error && typeof error.code === 'string'
        ? error.code.toLowerCase()
        : '';
    const message = 'message' in error && typeof error.message === 'string'
        ? error.message.toLowerCase()
        : '';

    return (
        INVALID_REFRESH_TOKEN_CODES.has(code) ||
        message.includes('invalid refresh token') ||
        message.includes('refresh token already used')
    );
}

function getAuthCookieChunkIndex(name: string, baseName: string): number | null {
    if (!name.startsWith(`${baseName}.`)) return null;

    const suffix = name.slice(baseName.length + 1);
    if (!/^\d+$/.test(suffix)) return null;

    const index = Number(suffix);
    return Number.isInteger(index) && index >= 0 ? index : null;
}

function getStaleAuthCookieNamesToClear(cookiesToSet: Array<{ name: string }>): string[] {
    const baseName = getSupabaseAuthCookieBaseName();
    if (!baseName) return [];

    const incomingNames = new Set(cookiesToSet.map((cookie) => cookie.name));
    const authNames = [...incomingNames].filter((name) => (
        name === baseName || name.startsWith(`${baseName}.`)
    ));
    if (authNames.length === 0) return [];

    const chunkIndexes = authNames
        .map((name) => getAuthCookieChunkIndex(name, baseName))
        .filter((index): index is number => index !== null);
    const hasDirectCookie = incomingNames.has(baseName);
    const staleNames = new Set<string>();

    if (hasDirectCookie) {
        for (let i = 0; i < MAX_SUPABASE_AUTH_COOKIE_CHUNKS; i += 1) {
            staleNames.add(`${baseName}.${i}`);
        }
    }

    if (chunkIndexes.length > 0) {
        staleNames.add(baseName);
        const lastIncomingChunk = Math.max(...chunkIndexes);
        for (let i = lastIncomingChunk + 1; i < MAX_SUPABASE_AUTH_COOKIE_CHUNKS; i += 1) {
            staleNames.add(`${baseName}.${i}`);
        }
    }

    incomingNames.forEach((name) => staleNames.delete(name));
    return [...staleNames];
}

function upsertCookieHeaderValue(header: string, name: string, value: string): string {
    const parts = header
        .split(';')
        .map((part) => part.trim())
        .filter(Boolean);
    const nextCookie = `${name}=${value}`;
    const index = parts.findIndex((part) => part.startsWith(`${name}=`));

    if (index >= 0) {
        parts[index] = nextCookie;
    } else {
        parts.push(nextCookie);
    }

    return parts.join('; ');
}

function removeCookieHeaderValue(header: string, name: string): string {
    return header
        .split(';')
        .map((part) => part.trim())
        .filter((part) => part && !part.startsWith(`${name}=`))
        .join('; ');
}

function decodeBase64Url(value: string): string | null {
    try {
        let normalized = value.replace(/-/g, '+').replace(/_/g, '/');
        const padding = normalized.length % 4;
        if (padding) normalized += '='.repeat(4 - padding);
        if (typeof atob === 'function') {
            return atob(normalized);
        }
        return Buffer.from(normalized, 'base64').toString('utf-8');
    } catch {
        return null;
    }
}

function readAuthCookieValue(request: NextRequest): string | null {
    return readSupabaseAuthSessionCookieValue(request.cookies.getAll());
}

function extractAccessTokenFromCookie(cookieValue: string): string | null {
    const parsed = parseSupabaseAuthCookiePayload(cookieValue);
    return typeof parsed?.access_token === 'string' ? parsed.access_token : null;
}

function readAccessTokenExpirySeconds(request: NextRequest): number | null {
    const cookieValue = readAuthCookieValue(request);
    if (!cookieValue) return null;
    const accessToken = extractAccessTokenFromCookie(cookieValue);
    if (!accessToken) return null;
    const segments = accessToken.split('.');
    if (segments.length < 2) return null;
    const payloadJson = decodeBase64Url(segments[1]);
    if (!payloadJson) return null;
    try {
        const parsed = JSON.parse(payloadJson) as { exp?: unknown };
        return typeof parsed.exp === 'number' ? parsed.exp : null;
    } catch {
        return null;
    }
}

export function readUserFromCookie(request: NextRequest): { id: string; email: string } | null {
    const cookieValue = readAuthCookieValue(request);
    if (!cookieValue) return null;
    const accessToken = extractAccessTokenFromCookie(cookieValue);
    if (!accessToken) return null;
    const segments = accessToken.split('.');
    if (segments.length < 2) return null;
    const payloadJson = decodeBase64Url(segments[1]);
    if (!payloadJson) return null;
    try {
        const parsed = JSON.parse(payloadJson) as { sub?: unknown; email?: unknown };
        if (typeof parsed.sub === 'string' && typeof parsed.email === 'string') {
            return { id: parsed.sub, email: parsed.email };
        }
        return null;
    } catch {
        return null;
    }
}

export async function updateSession(
    request: NextRequest,
    options?: { refreshTimeoutMs?: number },
): Promise<{ response: NextResponse; user: { id: string; email: string } | null }> {
    const refreshTimeoutMs = options?.refreshTimeoutMs ?? AUTH_REFRESH_TIMEOUT_MS;
    const updateStartedAt = Date.now();
    // Forward the resolved pathname so protected Server Component layouts can
    // build an accurate `returnTo` when a stale session forces a login bounce.
    const forwardedHeaders = new Headers(request.headers)
    forwardedHeaders.set('x-pathname', request.nextUrl.pathname)
    let response = NextResponse.next({
        request: {
            headers: forwardedHeaders,
        },
    })

    logRefreshFlow('proxy_update_session_start', {
        path: request.nextUrl.pathname,
    }, 'auth');
    logRefreshLoop('proxy_update_session_start', {
        path: request.nextUrl.pathname,
        method: request.method,
    });

    // Fast-path: if the access_token cookie has plenty of life left, there is
    // no point in spinning up a Supabase client and (potentially) firing a
    // /token refresh. This keeps high-traffic pages from creating a refresh
    // storm against Supabase Auth (the source of repeated 429 responses).
    const accessTokenExp = readAccessTokenExpirySeconds(request);
    if (accessTokenExp) {
        const nowSeconds = Math.floor(Date.now() / 1000);
        const remainingSeconds = accessTokenExp - nowSeconds;
        if (remainingSeconds > ACCESS_TOKEN_REFRESH_MARGIN_SECONDS) {
            logRefreshFlow('proxy_session_fast_path', {
                path: request.nextUrl.pathname,
                remainingSeconds,
                durationMs: Date.now() - updateStartedAt,
            }, 'auth');
            logRefreshLoop('proxy_fast_path', {
                path: request.nextUrl.pathname,
                reason: 'access_token_fresh',
                remainingSeconds,
                durationMs: Date.now() - updateStartedAt,
            });
            logPerf(
                ['PROXY'],
                {
                    path: request.nextUrl.pathname,
                    authChecked: true,
                    authFastPath: true,
                    remainingSeconds,
                },
                'server',
            )
            const fastUser = readUserFromCookie(request);
            return { response, user: fastUser };
        }
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
        console.error('[Middleware] Missing Supabase auth environment variables');
        logRefreshFlow('proxy_auth_cookies_cleared', {
            path: request.nextUrl.pathname,
            reason: 'missing_supabase_env',
            durationMs: Date.now() - updateStartedAt,
        }, 'auth');
        logRefreshLoop('proxy_session_invalid', {
            path: request.nextUrl.pathname,
            action: 'clear_cookies',
            reason: 'missing_supabase_env',
            durationMs: Date.now() - updateStartedAt,
        });
        clearAuthCookies(request, response);
        return { response, user: null };
    }

    const supabase = createServerClient(
        supabaseUrl,
        supabaseAnonKey,
        {
            cookieOptions: getSupabaseAuthCookieOptions(
                getRequestHost(request),
            ),
            cookies: {
                getAll() {
                    return normalizeSupabaseAuthCookies(request.cookies.getAll())
                },
                setAll(cookiesToSet) {
                    if (SHOULD_LOG_PROXY_AUTH) {
                        console.log('[Middleware] Setting cookies:', cookiesToSet.map(c => c.name).join(', '));
                    }
                    const staleAuthCookieNames = getStaleAuthCookieNamesToClear(cookiesToSet);

                    cookiesToSet.forEach(({ name, value }) => {
                        request.cookies.set(name, value)
                    })
                    staleAuthCookieNames.forEach((name) => {
                        request.cookies.delete(name)
                    })

                    const requestHeaders = new Headers(forwardedHeaders)
                    let currentCookie = requestHeaders.get('Cookie') || '';
                    cookiesToSet.forEach(({ name, value }) => {
                        currentCookie = upsertCookieHeaderValue(currentCookie, name, value);
                    })
                    staleAuthCookieNames.forEach((name) => {
                        currentCookie = removeCookieHeaderValue(currentCookie, name);
                    })
                    requestHeaders.set('Cookie', currentCookie)

                    response = NextResponse.next({
                        request: {
                            headers: requestHeaders,
                        },
                    })

                    cookiesToSet.forEach(({ name, value, options }) => {
                        // NOTE on httpOnly: @supabase/ssr requires the browser
                        // client to read the auth cookie via document.cookie to
                        // refresh sessions, so we cannot set httpOnly: true on
                        // the sb-*-auth-token cookies without breaking client
                        // auth. Mitigations: secure+sameSite=lax in prod, short
                        // access-token TTL, refresh-token rotation, and a strong
                        // CSP at the app shell to limit XSS exfiltration.
                        response.cookies.set(name, value, buildResponseAuthCookieOptions(request, options))
                    })
                    staleAuthCookieNames.forEach((name) => {
                        response.cookies.set(name, '', {
                            ...buildResponseAuthCookieOptions(request),
                            maxAge: 0,
                            expires: new Date(0),
                        })
                    })
                },
            },
            global: {
                fetch: createRetryableRefreshFetch(
                    supabaseUrl,
                    createInstrumentedSupabaseFetch('server', supabaseUrl, fetch),
                ),
            },
        }
    )

    // Refresh session if expired - required for Server Components and OAuth PKCE flow.
    // We use getSession() instead of getUser() because getSession() reads from
    // cookies and only triggers a /token refresh when the access_token is close
    // to expiry, while getUser() always pings /auth/v1/user. With many parallel
    // middleware invocations (RSC payloads, prefetches, sub-fetches) the
    // getUser() approach was the source of repeated 429 rate-limit responses.
    let authResult: Awaited<ReturnType<typeof supabase.auth.getSession>> | null = null;

    const getSessionStartedAt = Date.now();
    try {
        logRefreshFlow('proxy_get_session_start', {
            path: request.nextUrl.pathname,
        }, 'auth');
        logRefreshLoop('proxy_getSession_start', {
            path: request.nextUrl.pathname,
            reason: 'access_token_expiring_or_unknown',
        });
        authResult = await measureAsync(
            'proxy_get_session',
            async () => withTimeout(supabase.auth.getSession(), refreshTimeoutMs, 'proxy_get_session'),
            {
                runtime: 'server',
                tags: ['PROXY'],
                metadata: {
                    path: request.nextUrl.pathname,
                    authChecked: true,
                },
                describeResult: (result) => ({
                    success: !result.error,
                    hasSession: Boolean(result.data?.session),
                }),
            },
        )
    } catch (error) {
        logRefreshFlow('proxy_get_session_skipped', {
            path: request.nextUrl.pathname,
            reason: 'timeout_or_error',
            durationMs: Date.now() - updateStartedAt,
        }, 'auth');
        logRefreshLoop('proxy_getSession_end', {
            path: request.nextUrl.pathname,
            durationMs: Date.now() - getSessionStartedAt,
            hasSession: false,
            errorCode: error instanceof Error ? error.name : 'unknown_error',
            outcome: 'timeout_or_error',
        });
        if (SHOULD_LOG_PROXY_AUTH) {
            console.warn('[Middleware] Session refresh skipped:', error);
        }
        const fallbackUser = readUserFromCookie(request);
        logPerf(
            ['PROXY', 'WARN'],
            {
                path: request.nextUrl.pathname,
                authChecked: false,
                skipped: 'timeout_or_error',
                preservedCookieUser: Boolean(fallbackUser),
            },
            'server',
        )
        return { response, user: fallbackUser }
    }

    const { data: { session }, error } = authResult
    const user = session?.user
        ? { id: session.user.id, email: session.user.email || '' }
        : null;

    if (error) {
        if (isRetryableAuthRefreshError(error)) {
            const fallbackUser = readUserFromCookie(request);
            logRefreshFlow('proxy_session_preserved_after_retryable_auth_error', {
                path: request.nextUrl.pathname,
                hasFallbackUser: Boolean(fallbackUser),
                durationMs: Date.now() - updateStartedAt,
            }, 'auth');
            return { response, user: fallbackUser };
        }

        if (isInvalidRefreshTokenError(error)) {
            const fallbackUser = readUserFromCookie(request);
            logRefreshFlow('proxy_session_preserved_after_invalid_refresh_token', {
                path: request.nextUrl.pathname,
                reason: 'invalid_refresh_token',
                hasFallbackUser: Boolean(fallbackUser),
                durationMs: Date.now() - updateStartedAt,
            }, 'auth');
            logRefreshLoop('proxy_session_invalid', {
                path: request.nextUrl.pathname,
                action: 'preserve_cookies',
                reason: 'invalid_refresh_token',
                errorCode: 'code' in error && typeof error.code === 'string' ? error.code : null,
                durationMs: Date.now() - updateStartedAt,
            });
            return { response, user: fallbackUser };
        }

        // Only log if it's not a common "no session" state
        if (!error.message.includes('Auth session missing') && !isInvalidRefreshTokenError(error)) {
            console.error('[Middleware] getSession error:', error.message);
        }
    } else if (user) {
        if (SHOULD_LOG_PROXY_AUTH) {
            console.log('[Middleware] Active session for:', user.email);
        }
    } else {
        if (SHOULD_LOG_PROXY_AUTH) {
            console.log('[Middleware] No session found on request');
        }
    }

    logPerf(
        ['PROXY'],
        {
            path: request.nextUrl.pathname,
            authChecked: true,
            hasUser: Boolean(user),
        },
        'server',
    )

    logRefreshFlow('proxy_get_session_complete', {
        path: request.nextUrl.pathname,
        hasUser: Boolean(user),
        hasError: Boolean(error),
        durationMs: Date.now() - updateStartedAt,
    }, 'auth');
    logRefreshLoop('proxy_getSession_end', {
        path: request.nextUrl.pathname,
        durationMs: Date.now() - getSessionStartedAt,
        hasSession: Boolean(session),
        hasUser: Boolean(user),
        errorCode: error && 'code' in error && typeof error.code === 'string' ? error.code : null,
        outcome: error ? 'error' : (user ? 'session_ok' : 'no_session'),
    });

    return { response, user }
}
