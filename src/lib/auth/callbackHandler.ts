import 'server-only'

import { NextResponse, type NextRequest } from 'next/server';
import { syncUserProfile } from '@/lib/auth/syncUserProfile';
import { sanitizeNext } from '@/lib/auth/redirect'
import { createClient } from '@/lib/supabase/server';
import { rateLimitAuthCallback } from '@/lib/rateLimit';

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

    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error || !data.user) {
        console.error('[AuthCallback] exchangeCodeForSession failed:', error?.message || 'No user');
        // Differentiate known error types for better UX
        let errorCode = 'auth-code-error';
        if (error?.message?.includes('code verifier')) {
            errorCode = 'auth-pkce-error';
        } else if (error?.message?.includes('expired')) {
            errorCode = 'auth-expired';
        } else if (error?.message?.includes('state')) {
            errorCode = 'auth-state-error';
        }
        return NextResponse.redirect(
            `${origin}/login?error=${errorCode}&next=${encodeURIComponent(next)}`
        );
    }

    // Sync user profile in database
    try {
        await syncUserProfile(data.user);
    } catch (syncError) {
        console.error('[AuthCallback] syncUserProfile error:', syncError);
        // Continue: session is valid even if profile sync fails; it will retry via AuthContext
    }

    // Clean up guest cookie after successful OAuth login (parity with email login)
    const response = NextResponse.redirect(`${origin}${next}`);
    response.cookies.set('g22_guest_club_access', '', {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 0,
    });

    return response;
}
