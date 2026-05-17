import 'server-only'

import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { getAuthCookieHost, getRequestOrigin } from '@/lib/auth/requestOrigin'
import { syncUserProfile } from '@/lib/auth/syncUserProfile';
import { sanitizeNext } from '@/lib/auth/redirect'
import { rateLimitAuthCallback } from '@/lib/rateLimit';
import { getSupabaseAuthCookieOptions } from '@/lib/supabase/auth-cookie';
import { appendAuthSetCookieHeader, clearAllAuthCookieScopes } from '@/lib/supabase/proxy';

function getClientIp(request: NextRequest | Request): string {
    const req = request as any;
    const forwarded = req.headers?.get?.('x-forwarded-for');
    if (forwarded) {
        return forwarded.split(',')[0].trim();
    }
    if (req.socket?.remoteAddress) return req.socket.remoteAddress;
    return 'unknown';
}

export async function handleAuthCallback(request: NextRequest | Request) {
    const ip = getClientIp(request);
    const limit = rateLimitAuthCallback(ip);
    if (!limit.allowed) {
        return NextResponse.json(
            { error: 'Too many requests. Please try again later.' },
            { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } }
        );
    }

    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const rawNext = searchParams.get('next');
    const next = sanitizeNext(rawNext);
    const origin = getRequestOrigin(request);

    // If user cancelled or provider returned an error
    const providerError = searchParams.get('error');
    if (providerError || !code) {
        const errorMessage = providerError
            ? 'login_provider_error'
            : 'login_cancelled';
        const response = NextResponse.redirect(
            `${origin}/login?error=${errorMessage}&next=${encodeURIComponent(next)}`
        );
        if ((request as NextRequest).cookies?.getAll) {
            clearAllAuthCookieScopes(request as NextRequest, response);
        }
        return response;
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) {
        console.error('[AuthCallback] Missing Supabase env');
        return NextResponse.redirect(
            `${origin}/login?error=auth-code-error&next=${encodeURIComponent(next)}`
        );
    }

    // CRITICAL: build the Supabase server client INLINE with a cookies
    // handler that captures the session cookies into a local array,
    // instead of using the shared `createClient()` from server.ts which
    // writes through `cookieStore.set()` of `next/headers`. Cookies set
    // that way are NOT carried over into a `NextResponse.redirect()`
    // body, which is exactly why a fresh OAuth login looked successful
    // but landed the user back on the home page as a guest: the
    // exchangeCodeForSession() call set session cookies that were
    // immediately lost by the redirect response.
    type CookieToSet = {
        name: string
        value: string
        options?: Parameters<NextResponse['cookies']['set']>[2]
    }
    const cookiesToSet: CookieToSet[] = []

    const requestNext = request as NextRequest
    const requestHost = getAuthCookieHost(request)

    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
        cookieOptions: getSupabaseAuthCookieOptions(requestHost),
        cookies: {
            getAll() {
                return requestNext.cookies?.getAll?.() ?? []
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

    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error || !data.user) {
        const errorMsg = error?.message || 'No user';
        console.error('[AuthCallback] exchangeCodeForSession failed:', errorMsg);
        try {
            const cookieNames = requestNext.cookies?.getAll?.()?.map((c: { name: string }) => c.name) ?? [];
            console.error(
                '[AuthCallback] cookie names present at callback:',
                cookieNames.filter((n: string) => n.startsWith('sb-') || n.includes('auth')).join(','),
            );
        } catch {
            // best-effort
        }
        let errorCode = 'auth-code-error';
        const lowerMsg = errorMsg.toLowerCase();
        if (lowerMsg.includes('code verifier') || lowerMsg.includes('code_verifier')) {
            errorCode = 'auth-pkce-error';
        } else if (lowerMsg.includes('expired')) {
            errorCode = 'auth-expired';
        } else if (lowerMsg.includes('state')) {
            errorCode = 'auth-state-error';
        }
        const detail = errorMsg.replace(/[^\x20-\x7E]/g, '').slice(0, 160);
        const response = NextResponse.redirect(
            `${origin}/login?error=${errorCode}&detail=${encodeURIComponent(detail)}&next=${encodeURIComponent(next)}`
        );
        if (requestNext.cookies?.getAll) {
            clearAllAuthCookieScopes(requestNext, response);
        }
        return response;
    }

    // Sync user profile in database (best effort).
    try {
        await syncUserProfile(data.user);
    } catch (syncError) {
        console.error('[AuthCallback] syncUserProfile error:', syncError);
        // Continue: session is valid even if profile sync fails; it will retry via AuthContext
    }

    console.info(
        '[AuthCallback] session cookies queued for response:',
        cookiesToSet.map((c) => c.name).join(',') || '(none)',
    );

    // Redirect to the client-side finalize bridge instead of straight to
    // `next`. The bridge mounts a client component that explicitly waits
    // for supabase.auth.getSession() to see the freshly-set cookies before
    // navigating onward. Going directly to `next` previously raced with
    // the AuthContext mount: by the time AuthContext called getSession(),
    // the browser had committed the cookies but the in-memory supabase
    // client had already cached a no-session result, leaving the user as
    // a guest on the destination page.
    const finalizeUrl = new URL('/auth/callback/finalize', origin)
    finalizeUrl.searchParams.set('next', next)
    const response = NextResponse.redirect(finalizeUrl);
    if (requestNext.cookies?.getAll) {
        clearAllAuthCookieScopes(requestNext, response);
    }

    // The session cookie MUST be written with the exact same scope the rest
    // of the app uses (browser client on email login + proxy on refresh both
    // use getSupabaseAuthCookieOptions -> Domain=.g22scores.com in prod).
    // Previously this stripped the Domain (`domain: undefined`), making the
    // OAuth-login cookie host-only while every other path was domain-scoped.
    // On g22scores.com that produced TWO `sb-<ref>-auth-token` cookies at
    // different scopes that shadow each other: the server reads the stale
    // one, fails to see the fresh session, and bounces to /login -> infinite
    // login loop (and "works in incognito only"). Keep it consistent so
    // there is exactly one cookie scope.
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

    // Clean up guest cookie after successful OAuth login (parity with email
    // login). CRITICAL: this MUST be a raw Set-Cookie append, not
    // `response.cookies.set(...)`. The first access to `response.cookies`
    // lazily builds a ResponseCookies that parses every existing Set-Cookie
    // header into a name-keyed Map and then `.set()` runs `replace()` which
    // deletes the whole Set-Cookie header and re-emits one cookie per name —
    // collapsing the dual-scope clears and corrupting the freshly-written
    // (often chunked) session cookie, so OAuth login never persisted a
    // usable session. Keep every cookie on this response raw-header only.
    appendAuthSetCookieHeader(response, 'g22_guest_club_access', '', {
        path: '/',
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 0,
    });

    return response;
}
