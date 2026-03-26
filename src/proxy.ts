// Proxy handler (Next.js 16 format)
// This proxy handles Auth initialization via Supabase SSR (updateSession).
// Because auth requires cookie interception on requests, this is kept here.

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/proxy'

// Public API routes that do NOT need session refresh in the proxy.
// Checking auth on these adds 30-40s latency per request for no benefit.
const PUBLIC_API_PREFIXES = [
    '/api/matches',
    '/api/news',
    '/api/home/',
    '/api/tournaments',
    '/api/search',
    '/api/clubs',
    '/api/players',
    '/manifest.json',
]

function isPublicRoute(pathname: string): boolean {
    return PUBLIC_API_PREFIXES.some(prefix => pathname.startsWith(prefix))
}

export async function proxy(request: NextRequest) {
    const { pathname, searchParams } = request.nextUrl;

    // 1. Skip auth session check for public API routes and static assets.
    //    This prevents 30-40s latency on every public data fetch.
    if (isPublicRoute(pathname)) {
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
