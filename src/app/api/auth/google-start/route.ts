import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import {
    getAuthCookieHost,
    getRequestOrigin,
    getRequestOriginDebugInfo,
    isSameOriginRequest,
} from '@/lib/auth/requestOrigin'
import { sanitizeNext } from '@/lib/auth/redirect'
import { getSupabaseAuthCookieOptions } from '@/lib/supabase/auth-cookie'
import { clearAllAuthCookieScopes } from '@/lib/supabase/proxy'

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

        cookiesToSet.forEach(({ name, value, options }) => {
            // Strip Domain so the verifier is a host-only cookie. Some
            // strict browsers (notably Brave Shields on desktop) reject or
            // drop cookies that combine Domain=.g22scores.com + Secure +
            // SameSite=Lax for OAuth-style flows. Host-only is also fine
            // because the callback runs on the same hostname as this
            // start endpoint.
            const safeOptions = options ? { ...options, domain: undefined } : undefined
            response.cookies.set(name, value, {
                path: '/',
                sameSite: 'lax',
                secure: process.env.NODE_ENV === 'production',
                httpOnly: false,
                ...safeOptions,
            })
        })

        return response
    } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown'
        console.error('[auth/google-start] unexpected error:', message)
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
