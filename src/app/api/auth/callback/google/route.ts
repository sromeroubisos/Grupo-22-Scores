import { type NextRequest, NextResponse } from 'next/server';
import { getRequestOrigin } from '@/lib/auth/requestOrigin';

/**
 * Legacy Google callback — permanently redirects to the unified auth callback.
 *
 * IMPORTANT: Update your Supabase Auth dashboard so the Google provider
 * redirect URI points to `/auth/callback` instead of `/api/auth/callback/google`.
 * This route remains as a safety net during the transition.
 */
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const target = new URL('/auth/callback', getRequestOrigin(request));
    searchParams.forEach((value, key) => {
        target.searchParams.set(key, value);
    });
    return NextResponse.redirect(target, 307);
}
