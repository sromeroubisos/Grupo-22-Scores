import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { sanitizeNext } from '@/lib/auth/redirect'
import { getAuthCookieHost, getRequestOriginDebugInfo, isSameOriginRequest } from '@/lib/auth/requestOrigin'
import { syncUserProfile } from '@/lib/auth/syncUserProfile'
import { getSupabaseAuthCookieOptions } from '@/lib/supabase/auth-cookie'
import { appendAuthSetCookieHeader, clearAllAuthCookieScopes } from '@/lib/supabase/proxy'

type CookieToSet = {
    name: string
    value: string
    options?: Parameters<NextResponse['cookies']['set']>[2]
}

export async function POST(request: NextRequest) {
    if (!isSameOriginRequest(request)) {
        if (process.env.DEBUG_AUTH_FLOW === 'true') {
            console.warn('[auth/commit-session] invalid origin', getRequestOriginDebugInfo(request))
        }
        return NextResponse.json({ error: 'Invalid origin' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({})) as {
        accessToken?: unknown
        refreshToken?: unknown
        next?: unknown
    }
    const accessToken = typeof body.accessToken === 'string' ? body.accessToken : ''
    const refreshToken = typeof body.refreshToken === 'string' ? body.refreshToken : ''
    const next = sanitizeNext(typeof body.next === 'string' ? body.next : null)

    if (!accessToken || !refreshToken) {
        return NextResponse.json({ error: 'Missing session tokens' }, { status: 400 })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!supabaseUrl || !supabaseAnonKey) {
        return NextResponse.json({ error: 'Supabase env not configured' }, { status: 500 })
    }

    const cookiesToSet: CookieToSet[] = []
    const requestHost = getAuthCookieHost(request)

    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
        cookieOptions: getSupabaseAuthCookieOptions(requestHost),
        cookies: {
            getAll() {
                return request.cookies.getAll()
            },
            setAll(incoming) {
                incoming.forEach((cookie) => {
                    cookiesToSet.push({
                        name: cookie.name,
                        value: cookie.value,
                        options: cookie.options as CookieToSet['options'],
                    })
                })
            },
        },
        auth: {
            flowType: 'pkce',
        },
    })

    const { data, error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
    })

    if (error || !data.session || !data.user) {
        console.error('[auth/commit-session] setSession failed:', error?.message || 'No session')
        return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
    }

    try {
        await syncUserProfile(data.user)
    } catch (syncError) {
        console.warn('[auth/commit-session] syncUserProfile failed, preserving session:', syncError)
    }

    const response = NextResponse.json({ success: true, next })
    clearAllAuthCookieScopes(request, response)

    const sharedCookieOptions = getSupabaseAuthCookieOptions(requestHost)
    cookiesToSet.filter(({ value }) => value).forEach(({ name, value, options }) => {
        appendAuthSetCookieHeader(response, name, value, {
            ...options,
            path: '/',
            sameSite: 'lax',
            secure: process.env.NODE_ENV === 'production',
            httpOnly: false,
            ...(sharedCookieOptions.domain ? { domain: sharedCookieOptions.domain } : {}),
        })
    })

    // CRITICAL: do NOT use `response.cookies.set(...)` here. The session
    // cookies above were written as raw `Set-Cookie` headers (clearAll +
    // appendAuthSetCookieHeader). The FIRST access to `response.cookies`
    // lazily constructs a ResponseCookies that parses every existing
    // Set-Cookie header into a Map keyed by cookie name (collapsing the
    // dual-scope clears and any chunked session cookies) and then `.set()`
    // calls `replace()` -> `headers.delete('set-cookie')` and re-emits one
    // cookie per name from that collapsed Map. That silently destroyed the
    // freshly-written auth cookie on every login. Append the guest-cookie
    // expiry as a raw header too so the auth Set-Cookie headers survive
    // untouched.
    appendAuthSetCookieHeader(response, 'g22_guest_club_access', '', {
        path: '/',
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 0,
    })

    return response
}
