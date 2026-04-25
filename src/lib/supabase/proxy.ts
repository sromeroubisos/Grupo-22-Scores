import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { createInstrumentedSupabaseFetch } from '@/lib/perf/supabase';
import { logPerf, measureAsync } from '@/lib/perf/measure';

const AUTH_REFRESH_TIMEOUT_MS = 2500;
const SHOULD_LOG_PROXY_AUTH = process.env.ENABLE_SERVER_PERF_LOGS === 'true' || process.env.NODE_ENV !== 'production';

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

export async function updateSession(request: NextRequest) {
    let response = NextResponse.next({
        request: {
            headers: request.headers,
        },
    })

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
    // DO NOT skip this call: it is needed to exchange OAuth codes and refresh tokens.
    let authResult: Awaited<ReturnType<typeof supabase.auth.getUser>> | null = null;

    try {
        authResult = await measureAsync(
            'proxy_get_user',
            async () => withTimeout(supabase.auth.getUser(), AUTH_REFRESH_TIMEOUT_MS, 'proxy_get_user'),
            {
                runtime: 'server',
                tags: ['PROXY'],
                metadata: {
                    path: request.nextUrl.pathname,
                    authChecked: true,
                },
                describeResult: (result) => ({
                    success: !result.error,
                    hasUser: Boolean(result.data?.user),
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

    const { data: { user }, error } = authResult
    if (error) {
        // Only log if it's not a common "no session" state
        if (!error.message.includes('Auth session missing')) {
            console.error('[Middleware] getUser error:', error.message);
        }
    } else if (user) {
        if (SHOULD_LOG_PROXY_AUTH) {
            console.log('[Middleware] Active session for:', user.email);
        }
    } else {
        if (SHOULD_LOG_PROXY_AUTH) {
            console.log('[Middleware] No session session found on request');
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
