// Middleware handler
// This middleware handles Auth initialization via Supabase SSR (updateSession).
// Because auth requires cookie interception on requests, this is kept here.

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/proxy'
import { measureAsync } from '@/lib/perf/measure';

// Only refresh the Supabase session on routes that genuinely depend on auth.
// This avoids hitting `auth/v1/user` on public traffic, which is what was
// triggering long middleware stalls in production.
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

function shouldRefreshSession(pathname: string, searchParams: URLSearchParams): boolean {
    if (pathname === '/' && searchParams.has('code')) {
        return true
    }

    if (AUTH_CALLBACK_PATHS.has(pathname)) {
        return false
    }

    return SESSION_REFRESH_REQUIRED_PREFIXES.some(prefix => pathname.startsWith(prefix))
}

export async function middleware(request: NextRequest) {
    const { pathname, searchParams } = request.nextUrl;

    // 1. Skip proxy-level auth refresh for public routes.
    if (!shouldRefreshSession(pathname, searchParams)) {
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

    return measureAsync(
        'proxy',
        async () => {
            // 2. Auth Code Redirect Handler
            // Supabase redirects to site URL. If root and code present, forward to API handler.
            if (pathname === '/' && searchParams.has('code')) {
                const callbackUrl = new URL('/api/auth/callback/google', request.url)
                callbackUrl.searchParams.set('code', searchParams.get('code')!)
                const next = searchParams.get('next')
                if (next) callbackUrl.searchParams.set('next', next)
                return NextResponse.redirect(callbackUrl)
            }

            // 3. Update Session (Refresh Auth Tokens via Cookie Management)
            return await updateSession(request)
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
