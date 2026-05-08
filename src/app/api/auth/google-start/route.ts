import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sanitizeNext } from '@/lib/auth/redirect'

// Start the Google OAuth flow on the SERVER. Why server-side:
// when the client called supabase.auth.signInWithOAuth() directly,
// supabase-ssr stored the PKCE `code_verifier` in localStorage. The
// callback route handler at /auth/callback runs on the server and only
// has access to cookies, not localStorage, so exchangeCodeForSession()
// always failed with "PKCE code verifier not found in storage. ... For
// SSR". Doing the start here lets supabase write the verifier directly
// to a cookie that the callback can read back.
export async function POST(request: NextRequest) {
    try {
        const body = await request.json().catch(() => ({})) as { next?: unknown }
        const next = sanitizeNext(typeof body.next === 'string' ? body.next : null)

        const origin = new URL(request.url).origin
        const callbackUrl = new URL('/auth/callback', origin)
        callbackUrl.searchParams.set('next', next)

        const supabase = await createClient()
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
            console.error('[auth/google-start] supabase returned no redirect URL')
            return NextResponse.json({ error: 'No redirect URL returned by Supabase' }, { status: 500 })
        }

        // The supabase server client's cookies handler has already written
        // the code_verifier to the response via cookieStore.set(...). We
        // just need to surface the URL the client should navigate to.
        return NextResponse.json({ url: data.url })
    } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown'
        console.error('[auth/google-start] unexpected error:', message)
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
