import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { createInstrumentedSupabaseFetch } from '@/lib/perf/supabase';
import { logPerf, measureAsync } from '@/lib/perf/measure';

const AUTH_REFRESH_TIMEOUT_MS = 2500;
const SHOULD_LOG_PROXY_AUTH = process.env.ENABLE_SERVER_PERF_LOGS === 'true' || process.env.NODE_ENV !== 'production';
const MAX_AUTH_COOKIE_CHUNKS = 12;
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

function getSupabaseAuthCookieBaseName(): string | null {
    const projectRef = getSupabaseProjectRef();
    return projectRef ? `sb-${projectRef}-auth-token` : null;
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
        for (let i = 0; i < MAX_AUTH_COOKIE_CHUNKS; i += 1) {
            staleNames.add(`${baseName}.${i}`);
        }
    }

    if (chunkIndexes.length > 0) {
        staleNames.add(baseName);
        const lastIncomingChunk = Math.max(...chunkIndexes);
        for (let i = lastIncomingChunk + 1; i < MAX_AUTH_COOKIE_CHUNKS; i += 1) {
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
    const baseName = getSupabaseAuthCookieBaseName();
    if (!baseName) return null;

    const direct = request.cookies.get(baseName)?.value;
    if (direct) return direct;

    // The cookie is chunked (.0, .1, ...) when it exceeds the browser's size limit.
    const chunks: string[] = [];
    for (let i = 0; i < MAX_AUTH_COOKIE_CHUNKS; i++) {
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

export async function updateSession(request: NextRequest): Promise<{ response: NextResponse; user: { id: string; email: string } | null }> {
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
            const fastUser = readUserFromCookie(request);
            return { response, user: fastUser };
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
                    const staleAuthCookieNames = getStaleAuthCookieNamesToClear(cookiesToSet);

                    cookiesToSet.forEach(({ name, value }) => {
                        request.cookies.set(name, value)
                    })
                    staleAuthCookieNames.forEach((name) => {
                        request.cookies.delete(name)
                    })

                    const requestHeaders = new Headers(request.headers)
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
                    type ResponseCookieOptions = NonNullable<Parameters<typeof response.cookies.set>[2]>;
                    const buildCookieOptions = (options?: ResponseCookieOptions): ResponseCookieOptions => {
                        const isProd = process.env.NODE_ENV === 'production';
                        // NOTE on httpOnly: @supabase/ssr requires the browser
                        // client to read the auth cookie via document.cookie to
                        // refresh sessions, so we cannot set httpOnly: true on
                        // the sb-*-auth-token cookies without breaking client
                        // auth. Mitigations: secure+sameSite=lax in prod, short
                        // access-token TTL, refresh-token rotation, and a strong
                        // CSP at the app shell to limit XSS exfiltration.
                        return {
                            ...options,
                            sameSite: 'lax' as const,
                            secure: isProd,
                            httpOnly: false,
                            path: '/',
                            ...(isProd && { domain: '.g22scores.com' })
                        };
                    };

                    cookiesToSet.forEach(({ name, value, options }) => {
                        response.cookies.set(name, value, buildCookieOptions(options))
                    })
                    staleAuthCookieNames.forEach((name) => {
                        response.cookies.set(name, '', {
                            ...buildCookieOptions(),
                            maxAge: 0,
                            expires: new Date(0),
                        })
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
        return { response, user: null }
    }

    const { data: { session }, error } = authResult
    const user = session?.user
        ? { id: session.user.id, email: session.user.email || '' }
        : null;

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

    return { response, user }
}
