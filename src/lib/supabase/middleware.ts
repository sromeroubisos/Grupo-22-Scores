import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
    let response = NextResponse.next({
        request: {
            headers: request.headers,
        },
    })

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll()
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value }) => {
                        request.cookies.set(name, value)
                    })
                    response = NextResponse.next({
                        request: {
                            headers: request.headers,
                        },
                    })
                    cookiesToSet.forEach(({ name, value, options }) => {
                        const isProd = process.env.NODE_ENV === 'production';
                        const cookieOptions = {
                            ...options,
                            sameSite: 'lax' as const,
                            secure: isProd,
                            // Note: HttpOnly must be false for Supabase 'createBrowserClient' to read the session
                            // on the client side. If HttpOnly is true, user will appear logged out on client.
                            httpOnly: false,
                            path: '/',
                            ...(isProd && { domain: '.g22scores.com' })
                        };
                        response.cookies.set(name, value, cookieOptions)
                    })
                },
            },
        }
    )

    // Refresh session if expired - required for Server Components and OAuth PKCE flow.
    // DO NOT skip this call: it is needed to exchange OAuth codes and refresh tokens.
    await supabase.auth.getUser()

    return response
}
