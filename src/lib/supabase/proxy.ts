import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { createInstrumentedSupabaseFetch } from '@/lib/perf/supabase';
import { logPerf, measureAsync } from '@/lib/perf/measure';

const AUTH_REFRESH_TIMEOUT_MS = 2500;
const SHOULD_LOG_PROXY_AUTH = process.env.ENABLE_SERVER_PERF_LOGS === 'true' || process.env.NODE_ENV !== 'production';
// Margin before access_token expiry where the proxy will trigger a refresh.
// Anything fresher than this window is treated as valid and the entire auth
// roundtrip is skipped to avoid hammering Supabase Auth with /token calls.
const ACCESS_TOKEN_REFRESH_MARGIN_SECONDS = 120;

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

function getSupabaseProjectRef(): string | null {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) return null;
    try {
        return new URL(supabaseUrl).hostname.split('.')[0] || null;
    } catch {
        return null;
    }
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
    const projectRef = getSupabaseProjectRef();
    if (!projectRef) return null;

    const baseName = `sb-${projectRef}-auth-token`;
    const direct = request.cookies.get(baseName)?.value;
    if (direct) return direct;

    // The cookie is chunked (.0, .1, ...) when it exceeds the browser's size limit.
    const chunks: string[] = [];
    for (let i = 0; i < 8; i++) {
        const chunk = request.cookies.get(`${baseName}.${i}`)?.value;
        if (!chunk) break;
        chunks.push(chunk);
    }
    return chunks.length ? chunks.join('') : null;
}

function extractAccessTokenFromCookie(cookieValue: string): string | null {
    let payload = cookieValue;
    if (payload.startsWith('base64-')) {
        const decoded = decodeBase64Url(payload.slice('base64-'.length));
        if (!decoded) return null;
        payload = decoded;
    }
    try {
        const parsed = JSON.parse(payload) as { access_token?: unknown };
        return typeof parsed.access_token === 'string' ? parsed.access_token : null;
    } catch {
        return null;
    }
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

export async function updateSession(request: NextRequest) {
    let response = NextResponse.next({
        request: {
            headers: request.headers,
        },
    })

    // Fast-path: if the access_token cookie has plenty of life left, there is
    // no point in spinning up a Supabase client and (potentially) firing a
    // /token refresh. This keeps high-traffic pages from creating a refresh
    // storm against Supabase Auth (the source of repeated 429 responses).
    const accessTokenExp = readAccessTokenExpirySeconds(request);
    if (accessTokenExp) {
        const nowSeconds = Math.floor(Date.now() / 1000);
        const remainingSeconds = accessTokenExp - nowSeconds;
        if (remainingSeconds > ACCESS_TOKEN_REFRESH_MARGIN_SECONDS) {
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
            return response;
        }
    }

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll()
                },
                setAll(cookiesToSet) {
                    if (SHOULD_LOG_PROXY_AUTH) {
                        console.log('[Middleware] Setting cookies:', cookiesToSet.map(c => c.name).join(', '));
                    }
                    cookiesToSet.forEach(({ name, value }) => {
                        request.cookies.set(name, value)
                    })
                    const requestHeaders = new Headers(request.headers)
                    let currentCookie = requestHeaders.get('Cookie') || '';
                    cookiesToSet.forEach(({ name, value }) => {
                        // For the upstream REQUEST being passed to the application,
                        // we need to set/update the 'Cookie' header.
                        // Append or update existing cookie values
                        if (currentCookie.includes(`${name}=`)) {
                            // Simple replacement if already exists (naive)
                            const reg = new RegExp(`${name}=[^;]+`);
                            currentCookie = currentCookie.replace(reg, `${name}=${value}`);
                        } else {
                            currentCookie = currentCookie ? `${currentCookie}; ${name}=${value}` : `${name}=${value}`;
                        }
                    })
                    requestHeaders.set('Cookie', currentCookie)

                    response = NextResponse.next({
                        request: {
                            headers: requestHeaders,
                        },
                    })
                    cookiesToSet.forEach(({ name, value, options }) => {
                        const isProd = process.env.NODE_ENV === 'production';
                        // NOTE on httpOnly: @supabase/ssr requires the browser
                        // client to read the auth cookie via document.cookie to
                        // refresh sessions, so we cannot set httpOnly: true on
                        // the sb-*-auth-token cookies without breaking client
                        // auth. Mitigations: secure+sameSite=lax in prod, short
                        // access-token TTL, refresh-token rotation, and a strong
                        // CSP at the app shell to limit XSS exfiltration.
                        const cookieOptions = {
                            ...options,
                            sameSite: 'lax' as const,
                            secure: isProd,
                            httpOnly: false,
                            path: '/',
                            ...(isProd && { domain: '.g22scores.com' })
                        };
                        response.cookies.set(name, value, cookieOptions)
                    })
                },
            },
            global: {
                fetch: createInstrumentedSupabaseFetch('server', process.env.NEXT_PUBLIC_SUPABASE_URL, fetch),
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

    try {
        authResult = await measureAsync(
            'proxy_get_session',
            async () => withTimeout(supabase.auth.getSession(), AUTH_REFRESH_TIMEOUT_MS, 'proxy_get_session'),
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
        if (SHOULD_LOG_PROXY_AUTH) {
            console.warn('[Middleware] Session refresh skipped:', error);
        }
        logPerf(
            ['PROXY', 'WARN'],
            {
                path: request.nextUrl.pathname,
                authChecked: false,
                skipped: 'timeout_or_error',
            },
            'server',
        )
        return response
    }

    const { data: { session }, error } = authResult
    const user = session?.user ?? null
    if (error) {
        // Only log if it's not a common "no session" state
        if (!error.message.includes('Auth session missing')) {
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

    return response
}
