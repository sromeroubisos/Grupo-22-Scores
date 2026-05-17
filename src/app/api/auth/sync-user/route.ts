import { NextResponse } from 'next/server'
import { getRequestOriginDebugInfo, isSameOriginRequest } from '@/lib/auth/requestOrigin'
import { syncUserProfile } from '@/lib/auth/syncUserProfile'
import { createClient } from '@/lib/supabase/server'
import { rateLimitByIp } from '@/lib/rateLimit'

function getClientIp(request: Request): string {
    const forwarded = (request as any).headers?.get?.('x-forwarded-for');
    if (forwarded) return forwarded.split(',')[0].trim();
    return 'unknown';
}

export async function POST(request: Request) {
    const ip = getClientIp(request);
    // Namespaced key (parity with commit-session) so this never shares a
    // bucket with another bare-IP caller, plus a higher cap: sync-user is
    // idempotent/best-effort and legitimately fires several times per login
    // (login + finalize + AuthContext profile miss). 30/min/IP absorbs a few
    // users behind a shared NAT/CGNAT IP without false 429s.
    const limit = rateLimitByIp(`sync-user:${ip}`, 30);
    if (!limit.allowed) {
        return NextResponse.json(
            { error: 'Too many requests' },
            { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } }
        );
    }

    if (!isSameOriginRequest(request)) {
        if (process.env.DEBUG_AUTH_FLOW === 'true') {
            console.warn('[auth/sync-user] invalid origin', getRequestOriginDebugInfo(request))
        }
        return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
    }

    try {
        const supabase = await createClient()
        const {
            data: { session },
            error: sessionError,
        } = await supabase.auth.getSession()

        if (sessionError || !session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        await syncUserProfile(session.user)

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Sync user error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
