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
        const errorMsg = error?.message || 'No user';
        console.error('[AuthCallback] exchangeCodeForSession failed:', errorMsg);
        // Log surrounding state to help diagnose stuck PKCE issues. These
        // logs go to Vercel function logs (not the user's browser).
        try {
            const cookieNames = (request as NextRequest).cookies?.getAll?.()?.map((c: { name: string }) => c.name) ?? [];
            console.error(
                '[AuthCallback] cookie names present at callback:',
                cookieNames.filter((n: string) => n.startsWith('sb-') || n.includes('auth')).join(','),
            );
        } catch {
            // Cookie inspection is best-effort.
        }
        // Differentiate known error types for better UX
        let errorCode = 'auth-code-error';
        const lowerMsg = errorMsg.toLowerCase();
        if (lowerMsg.includes('code verifier') || lowerMsg.includes('code_verifier')) {
            errorCode = 'auth-pkce-error';
        } else if (lowerMsg.includes('expired')) {
            errorCode = 'auth-expired';
        } else if (lowerMsg.includes('state')) {
            errorCode = 'auth-state-error';
        }
        // Pass a short sanitized detail so the user (and us) can see WHAT
        // failed without checking server logs. Capped + URL-encoded.
        const detail = errorMsg.replace(/[^\x20-\x7E]/g, '').slice(0, 160);
        return NextResponse.redirect(
            `${origin}/login?error=${errorCode}&detail=${encodeURIComponent(detail)}&next=${encodeURIComponent(next)}`
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
