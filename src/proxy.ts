// Proxy handler (Next.js 16 format)
// This proxy handles Auth initialization via Supabase SSR (updateSession).
// Because auth requires cookie interception on requests, this is kept here.

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/proxy'

export async function proxy(request: NextRequest) {
    console.log('[Proxy] Request to:', request.nextUrl.pathname);
    const { pathname, searchParams } = request.nextUrl;
    const host = request.headers.get('host') || ''
    const isProd = process.env.NODE_ENV === 'production'


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
