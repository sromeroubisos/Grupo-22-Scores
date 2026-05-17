import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import {
    getAuthCookieHost,
    getRequestOrigin,
    getRequestOriginDebugInfo,
    isSameOriginRequest,
} from '@/lib/auth/requestOrigin'
import { sanitizeNext } from '@/lib/auth/redirect'
import { getSupabaseAuthCookieOptions, getSupabaseSharedCookieDomain } from '@/lib/supabase/auth-cookie'
import { appendAuthSetCookieHeader, clearAllAuthCookieScopes } from '@/lib/supabase/proxy'

// Start the Google OAuth flow on the SERVER. Why server-side:
// when the client called supabase.auth.signInWithOAuth() directly,
// supabase-ssr stored the PKCE `code_verifier` in localStorage. The
// callback route handler at /auth/callback runs on the server and only
// has access to cookies, not localStorage, so exchangeCodeForSession()
// always failed with "PKCE code verifier not found in storage. ... For
// SSR".
//
// IMPORTANT: we manually capture the cookies supabase wants to set and
// apply them to the NextResponse via `response.cookies.set()`. Going
// through `cookies()` from `next/headers` + `cookieStore.set()` does NOT
// reliably attach the cookie to a `NextResponse.json()` body — that's
// why earlier server-side attempts still failed at the callback.
export async function POST(request: NextRequest) {
    if (!isSameOriginRequest(request)) {
        if (process.env.DEBUG_AUTH_FLOW === 'true') {
            console.warn('[auth/google-start] invalid origin', getRequestOriginDebugInfo(request))
        }
        return NextResponse.json({ error: 'Invalid origin' }, { status: 403 })
    }

    type CookieToSet = {
        name: string
        value: string
        options?: Parameters<NextResponse['cookies']['set']>[2]
    }
    const cookiesToSet: CookieToSet[] = []

    try {
        const body = await request.json().catch(() => ({})) as { next?: unknown }
        const next = sanitizeNext(typeof body.next === 'string' ? body.next : null)

        const origin = getRequestOrigin(request)
        const callbackUrl = new URL('/auth/callback', origin)
        callbackUrl.searchParams.set('next', next)

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
        const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
        if (!supabaseUrl || !supabaseAnonKey) {
            return NextResponse.json({ error: 'Supabase env not configured' }, { status: 500 })
        }

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

        const { data, error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: callbackUrl.toString(),
                skipBrowserRedirect: true,
            },
        })

        if (error) {
            console.error('[auth/google-start] signInWithOAuth error:', error.message)
            return NextResponse.json({ error: error.message }, { status: 500 })
        }
        if (!data?.url) {
            console.error('[auth/google-start] no redirect URL returned')
            return NextResponse.json({ error: 'No redirect URL returned by Supabase' }, { status: 500 })
        }

        console.info(
            '[auth/google-start] cookies queued for response:',
            cookiesToSet.map((c) => c.name).join(',') || '(none)',
        )

        const response = NextResponse.json({ url: data.url })

        // Starting a new OAuth flow is a hard auth reset. Clear every old
        // Supabase auth cookie scope before writing the fresh PKCE verifier,
        // otherwise a stale host-only/domain-scoped verifier can shadow the
        // new one and make every retry fail until the user manually clears
        // browser data.
        clearAllAuthCookieScopes(request, response)

        // The PKCE `code_verifier` cookie MUST be written with the SAME
        // scope the session cookie uses everywhere else
        // (getSupabaseAuthCookieOptions -> Domain=.g22scores.com in prod).
        // It was previously forced host-only (`domain: undefined`) to dodge
        // a niche desktop Brave-Shields edge case, but that broke Google
        // login for everyone whose OAuth round-trip crossed the apex/www
        // boundary: this start endpoint may run on `www.g22scores.com`
        // while Supabase's configured redirect lands the callback on the
        // apex `g22scores.com` (or vice versa). A host-only verifier set on
        // one host is simply not sent to the other, so
        // exchangeCodeForSession() always failed with "code verifier not
        // found" -> /login?error=auth-pkce-error (this is why ZERO accounts
        // had a Google identity and mobile users "never got past Google").
        // Domain-scoping it to `.g22scores.com` makes the verifier valid on
        // both hosts, exactly like the rest of the auth cookies.
        const sharedVerifierDomain = getSupabaseSharedCookieDomain(requestHost)
        cookiesToSet.filter(({ value }) => value).forEach(({ name, value, options }) => {
            appendAuthSetCookieHeader(response, name, value, {
                ...options,
                path: '/',
                sameSite: 'lax',
                secure: process.env.NODE_ENV === 'production',
                httpOnly: false,
                ...(sharedVerifierDomain ? { domain: sharedVerifierDomain } : { domain: undefined }),
            })
        })

        return response
    } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown'
        console.error('[auth/google-start] unexpected error:', message)
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
