// Proxy handler (Next.js 16 format)
// This proxy handles Auth initialization via Supabase SSR (updateSession).
// Because auth requires cookie interception on requests, this is kept here.

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/proxy'

// Routes that do NOT need a proxy-level session refresh.
// Some are public, while others enforce auth inside the route handler itself.
// Skipping the proxy check here avoids an extra Supabase auth round-trip that
// can add 30-40s latency to data-heavy admin requests.
const SESSION_REFRESH_BYPASS_PREFIXES = [
    '/api/matches',
    '/api/news',
    '/api/home/',
    '/api/tournaments',
    '/api/search',
    '/api/clubs',
    '/api/players',
    '/api/admin/super/console-data',
    '/api/admin/super/matches',
    '/manifest.json',
    '/sw.js',
]

function shouldBypassSessionRefresh(pathname: string): boolean {
    return SESSION_REFRESH_BYPASS_PREFIXES.some(prefix => pathname.startsWith(prefix))
}

export async function proxy(request: NextRequest) {
    const { pathname, searchParams } = request.nextUrl;

    // 1. Skip proxy-level auth refresh for routes that do not need it.
    if (shouldBypassSessionRefresh(pathname)) {
        return NextResponse.next()
    }

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
}

export const config = {
    // Exclude static assets, favicon, etc.
    matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
