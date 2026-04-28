import { NextResponse } from 'next/server'
import { syncUserProfile } from '@/lib/auth/syncUserProfile'
import { createClient } from '@/lib/supabase/server'
import { rateLimitByIp } from '@/lib/rateLimit'

function getClientIp(request: Request): string {
    const forwarded = (request as any).headers?.get?.('x-forwarded-for');
    if (forwarded) return forwarded.split(',')[0].trim();
    return 'unknown';
}

function isValidOrigin(request: Request): boolean {
    const origin = request.headers.get('origin');
    const host = new URL(request.url).host;
    if (!origin) return true; // Same-origin direct fetch may omit origin
    try {
        return new URL(origin).host === host;
    } catch {
        return false;
    }
}

export async function POST(request: Request) {
    const ip = getClientIp(request);
    const limit = rateLimitByIp(ip);
    if (!limit.allowed) {
        return NextResponse.json(
            { error: 'Too many requests' },
            { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } }
        );
    }

    if (!isValidOrigin(request)) {
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
