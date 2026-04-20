import { NextRequest, NextResponse } from 'next/server';

const GUEST_CLUB_ACCESS_COOKIE = 'g22_guest_club_access';

function sanitizeClubHint(rawValue?: string | null) {
    const normalized = (rawValue || 'la-tablada')
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

    return normalized === 'tablada' || normalized === 'la-tablada'
        ? 'la-tablada'
        : 'la-tablada';
}

function buildRedirectUrl(request: NextRequest) {
    const nextParam = request.nextUrl.searchParams.get('next');
    const nextPath = nextParam && nextParam.startsWith('/') ? nextParam : '/club-admin';
    return new URL(nextPath, request.url);
}

export async function GET(request: NextRequest) {
    const clubHint = sanitizeClubHint(request.nextUrl.searchParams.get('club'));
    const response = NextResponse.redirect(buildRedirectUrl(request));

    response.cookies.set(GUEST_CLUB_ACCESS_COOKIE, JSON.stringify({
        kind: 'club_family_guest',
        clubHint,
        membershipRole: 'editor',
    }), {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 60 * 60 * 12,
    });

    return response;
}

export async function DELETE() {
    const response = NextResponse.json({ ok: true });
    response.cookies.set(GUEST_CLUB_ACCESS_COOKIE, '', {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 0,
    });
    return response;
}
