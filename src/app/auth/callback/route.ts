import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

function sanitizeNext(raw: string | null): string {
    if (!raw) return '/'
    return raw.startsWith('/') && !raw.startsWith('//') ? raw : '/'
}

export async function GET(request: Request) {
    const { searchParams, origin } = new URL(request.url)
    const code = searchParams.get('code')
    const next = sanitizeNext(searchParams.get('next'))

    if (code) {
        const cookieStore = await cookies()
        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key',
            {
                cookies: {
                    getAll() {
                        return cookieStore.getAll()
                    },
                    setAll(cookiesToSet) {
                        try {
                            cookiesToSet.forEach(({ name, value, options }) =>
                                cookieStore.set(name, value, options)
                            )
                        } catch {
                            // Safe to ignore from Server Components.
                        }
                    },
                },
            }
        )

        const { data, error } = await supabase.auth.exchangeCodeForSession(code)

        if (!error && data.user) {
            try {
                const user = data.user
                const { data: existingUser } = await supabase
                    .from('users')
                    .select('id')
                    .eq('id', user.id)
                    .single()

                if (!existingUser) {
                    const { getReservedAdminRole } = await import('@/lib/types/user')
                    const role = getReservedAdminRole(user.email) ?? 'fan'

                    await supabase.from('users').insert({
                        id: user.id,
                        email: user.email!,
                        name: user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0],
                        avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture,
                        role,
                    })
                } else {
                    const { getReservedAdminRole } = await import('@/lib/types/user')
                    const reservedRole = getReservedAdminRole(user.email)
                    const updates: { last_login_at: string; role?: 'super_admin' | 'admin_general' } = {
                        last_login_at: new Date().toISOString(),
                    }

                    if (reservedRole) {
                        updates.role = reservedRole
                    }

                    await supabase
                        .from('users')
                        .update(updates)
                        .eq('id', user.id)
                }
            } catch (syncError) {
                console.error('Error syncing user:', syncError)
            }

            return NextResponse.redirect(`${origin}${next}`)
        }
    }

    return NextResponse.redirect(`${origin}/login?error=auth-code-error`)
}
