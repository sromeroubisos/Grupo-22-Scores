import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
    const { pathname, searchParams } = request.nextUrl

    // Supabase falls back to Site URL when redirectTo isn't whitelisted.
    // Intercept the code at root and route it to the Google callback handler.
    if (pathname === '/' && searchParams.has('code')) {
        const callbackUrl = new URL('/api/auth/callback/google', request.url)
        callbackUrl.searchParams.set('code', searchParams.get('code')!)
        const next = searchParams.get('next')
        if (next) callbackUrl.searchParams.set('next', next)
        return NextResponse.redirect(callbackUrl)
    }
}

export const config = {
    matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
