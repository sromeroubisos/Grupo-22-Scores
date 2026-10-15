import { NextRequest, NextResponse } from 'next/server';
import {
    GUEST_CLUB_ACCESS_COOKIE,
    GUEST_CLUB_ACCESS_TTL_SECONDS,
    isGuestClubAccessEnabled,
    signGuestClubCookie,
} from '@/lib/auth/guestClubAccess';
import { sanitizeNext } from '@/lib/auth/redirect';

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
    // `startsWith('/')` dejaba pasar `//evil.example` y `/\tevil...`: un open redirect
    // con nuestra cookie recién puesta. `sanitizeNext` es la validación única del sitio.
    const nextParam = request.nextUrl.searchParams.get('next');
    const nextPath = nextParam ? sanitizeNext(nextParam) : '/club-admin';
    return new URL(nextPath, request.url);
}

export async function GET(request: NextRequest) {
    // Puerta sin credenciales: apagada salvo que se prenda a proposito.
    if (!isGuestClubAccessEnabled()) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const clubHint = sanitizeClubHint(request.nextUrl.searchParams.get('club'));

    // Firmada con GUEST_ACCESS_SECRET y sin rol adentro: el rol lo fija el
    // servidor al leerla (ver guestClubAccess.ts). Sin secreto no se emite nada.
    const cookieValue = await signGuestClubCookie(clubHint);
    if (!cookieValue) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const response = NextResponse.redirect(buildRedirectUrl(request));

    response.cookies.set(GUEST_CLUB_ACCESS_COOKIE, cookieValue, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: GUEST_CLUB_ACCESS_TTL_SECONDS,
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
