// Proxy handler
// This proxy handles Auth initialization via Supabase SSR (updateSession).
// Because auth requires cookie interception on requests, this is kept here.

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { logRefreshFlow } from '@/lib/debug/refreshFlow'
import { logRefreshLoop } from '@/lib/debug/refreshLoop'
import { updateSession, readUserFromCookie, clearAllAuthCookieScopes, PROTECTED_AUTH_REFRESH_TIMEOUT_MS } from '@/lib/supabase/proxy'
import { measureAsync } from '@/lib/perf/measure';

// Only refresh the Supabase session on routes that genuinely depend on auth.
// This avoids hitting `auth/v1/user` on public traffic, which is what was
// triggering long proxy stalls in production.
const SESSION_REFRESH_REQUIRED_PREFIXES = [
    '/admin',
    '/club-admin',
    '/profile',
    '/favorites',
    '/onboarding',
    '/prode/ligas',
    '/api/auth',
    '/api/profile',
    '/api/club-admin',
    '/api/admin',
    '/api/prode/private-leagues',
    '/api/prode/predictions',
]

const AUTH_CALLBACK_PATHS = new Set([
    '/api/auth/callback/google',
    '/auth/callback',
])

const PROTECTED_ROUTE_PREFIXES = ['/admin', '/club-admin', '/profile', '/prode/ligas/crear'];
const GUEST_CLUB_ACCESS_COOKIE = 'g22_guest_club_access';

function shouldRefreshSession(pathname: string, searchParams: URLSearchParams): boolean {
    if (pathname === '/' && searchParams.has('code')) {
        return true
    }

    if (AUTH_CALLBACK_PATHS.has(pathname)) {
        return false
    }

    return SESSION_REFRESH_REQUIRED_PREFIXES.some(prefix => pathname.startsWith(prefix))
}

function isProtectedRoute(pathname: string): boolean {
    return PROTECTED_ROUTE_PREFIXES.some(prefix => pathname.startsWith(prefix));
}

function hasGuestClubAccess(request: NextRequest): boolean {
    const rawValue = request.cookies.get(GUEST_CLUB_ACCESS_COOKIE)?.value;
    if (!rawValue) return false;

    try {
        const parsed = JSON.parse(rawValue) as { kind?: unknown; clubHint?: unknown };
        return parsed.kind === 'club_family_guest' && typeof parsed.clubHint === 'string';
    } catch {
        return false;
    }
}

function redirectToLogin(request: NextRequest) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('returnTo', `${request.nextUrl.pathname}${request.nextUrl.search}`);
    const response = NextResponse.redirect(loginUrl);
    // Flush every auth cookie variant in both scopes. If we reached here for
    // a protected route the session is unusable for this request anyway, and
    // a stale host-only duplicate left over from the old inconsistent cookie
    // scoping is exactly what keeps the user trapped in a /login loop. Wiping
    // it guarantees the next login writes a single, clean, consistently
    // scoped cookie instead of layering on top of the poisoned one.
    clearAllAuthCookieScopes(request, response);
    return response;
}

export async function proxy(request: NextRequest) {
    const { pathname, searchParams } = request.nextUrl;

    // 1. Auth Code Redirect Handler
    // Supabase redirects to site URL. If root and code present, forward to API handler.
    if (pathname === '/' && searchParams.has('code')) {
        const callbackUrl = new URL('/auth/callback', request.url)
        callbackUrl.searchParams.set('code', searchParams.get('code')!)
        const next = searchParams.get('next')
        if (next) callbackUrl.searchParams.set('next', next)
        return NextResponse.redirect(callbackUrl)
    }

    const needsRefresh = shouldRefreshSession(pathname, searchParams);
    const protectedRoute = isProtectedRoute(pathname);
    const isApiPath = pathname.startsWith('/api');
    const isAdminPath = pathname.startsWith('/admin') || pathname.startsWith('/club-admin');
    logRefreshFlow('proxy_route_decision', {
        path: pathname,
        needsRefresh,
        protectedRoute,
    }, 'route');
    logRefreshLoop('proxy_request', {
        path: pathname,
        method: request.method,
        isAdminPath,
        isApiPath,
        protectedRoute,
        needsSessionRefresh: needsRefresh,
        reason: needsRefresh ? 'matched_session_refresh_prefix' : (protectedRoute ? 'protected_no_refresh' : 'public'),
    });

    // 2. Public routes that don't need auth check at all
    if (!needsRefresh && !protectedRoute) {
        logRefreshLoop('proxy_fast_path', {
            path: pathname,
            reason: 'public_route',
        });
        return measureAsync(
            'proxy_bypass',
            async () => NextResponse.next(),
            {
                runtime: 'server',
                tags: ['PROXY'],
                metadata: {
                    path: pathname,
                    authChecked: false,
                },
            },
        )
    }

    if (protectedRoute && pathname.startsWith('/club-admin') && hasGuestClubAccess(request)) {
        logRefreshLoop('proxy_fast_path', {
            path: pathname,
            reason: 'guest_club_access_cookie',
        });
        return measureAsync(
            'proxy_guest_club_bypass',
            async () => NextResponse.next(),
            {
                runtime: 'server',
                tags: ['PROXY'],
                metadata: {
                    path: pathname,
                    authChecked: false,
                    guestClubAccess: true,
                },
            },
        )
    }

    // 3. Protected routes that DON'T require a session refresh (fast-path):
    // read the user directly from the access_token cookie to avoid Supabase roundtrips.
    if (protectedRoute && !needsRefresh) {
        const user = readUserFromCookie(request);
        if (!user) {
            logRefreshLoop('proxy_session_invalid', {
                path: pathname,
                action: 'redirect_login',
                reason: 'cookie_user_missing_protected_no_refresh',
            });
            return redirectToLogin(request);
        }
        logRefreshLoop('proxy_fast_path', {
            path: pathname,
            reason: 'cookie_user_present_no_refresh_needed',
        });
        return NextResponse.next();
    }

    // 4. Routes that require session refresh (and may also be protected)
    return measureAsync(
        'proxy',
        async () => {
            const { response, user } = await updateSession(
                request,
                protectedRoute ? { refreshTimeoutMs: PROTECTED_AUTH_REFRESH_TIMEOUT_MS } : undefined,
            );

            if (protectedRoute && !user) {
                logRefreshLoop('proxy_session_invalid', {
                    path: pathname,
                    action: 'redirect_login',
                    reason: 'no_user_after_update_session',
                });
                return redirectToLogin(request);
            }

            return response;
        },
        {
            runtime: 'server',
            tags: ['PROXY'],
            metadata: {
                path: pathname,
                authChecked: true,
            },
        },
    )
}

export const config = {
    // Exclude static assets, favicon, etc.
    matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
