// TODO (Next.js 16/Turbopack): 
// "The middleware file convention is deprecated. Please use proxy instead."
// This middleware currently handles heavy Auth initialization via Supabase SSR (updateSession).
// Because auth requires cookie interception on requests, migrating from middleware to proxy
// is a major change that needs careful rewriting so we don't break existing login state.
// Left as TODO to not break current features/build.

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
    const { pathname, searchParams } = request.nextUrl
    const host = request.headers.get('host') || ''
    const isProd = process.env.NODE_ENV === 'production'

    // 1. Unify Canonical Domain (www -> non-www)
    // Only in production to avoid localhost issues
    if (isProd && host.startsWith('www.')) {
        const newUrl = new URL(request.url)
        newUrl.host = 'g22scores.com'
        // Preserves protocol (http/https) and path/query
        return NextResponse.redirect(newUrl, { status: 301 })
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
