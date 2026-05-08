import 'server-only'

import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { syncUserProfile } from '@/lib/auth/syncUserProfile';
import { sanitizeNext } from '@/lib/auth/redirect'
import { rateLimitAuthCallback } from '@/lib/rateLimit';
import { getSupabaseAuthCookieOptions } from '@/lib/supabase/auth-cookie';

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
    const origin = new URL(request.url).origin;

    // If user cancelled or provider returned an error
    const providerError = searchParams.get('error');
    if (providerError || !code) {
        const errorMessage = providerError
            ? 'login_provider_error'
            : 'login_cancelled';
        return NextResponse.redirect(
            `${origin}/login?error=${errorMessage}&next=${encodeURIComponent(next)}`
        );
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
    const requestHost =
        request.headers.get('x-forwarded-host') ||
        request.headers.get('host') ||
        requestNext.nextUrl?.hostname

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
        return NextResponse.redirect(
            `${origin}/login?error=${errorCode}&detail=${encodeURIComponent(detail)}&next=${encodeURIComponent(next)}`
        );
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

    // Build the redirect response and APPLY the captured cookies onto
    // it. Without this, the access_token / refresh_token cookies set by
    // exchangeCodeForSession() never reach the browser and the user
    // arrives at the destination unauthenticated.
    const response = NextResponse.redirect(`${origin}${next}`);

    cookiesToSet.forEach(({ name, value, options }) => {
        const safeOptions = options ? { ...options, domain: undefined } : undefined
        response.cookies.set(name, value, {
            path: '/',
            sameSite: 'lax',
            secure: process.env.NODE_ENV === 'production',
            httpOnly: false,
            ...safeOptions,
        })
    })

    // Clean up guest cookie after successful OAuth login (parity with email login).
    response.cookies.set('g22_guest_club_access', '', {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 0,
    });

    return response;
}
