import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { SUPER_ADMIN_EMAIL } from '@/lib/types/user'

export async function GET(request: Request) {
    const { searchParams, origin } = new URL(request.url)
    const code = searchParams.get('code')
    // if "next" is in param, use it as the redirect URL
    const next = searchParams.get('next') ?? '/'

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
                            // The `setAll` method was called from a Server Component.
                            // This can be ignored if you have middleware refreshing
                            // user sessions.
                        }
                    },
                },
            }
        )

        const { data, error } = await supabase.auth.exchangeCodeForSession(code)

        if (!error && data.user) {
            // Sync user to public.users table
            try {
                const user = data.user

                // Check if user exists
                const { data: existingUser } = await supabase
                    .from('users')
                    .select('id')
                    .eq('id', user.id)
                    .single()

                if (!existingUser) {
                    const { isSuperAdminEmail } = await import('@/lib/types/user')
                    // Determine role
                    const role = isSuperAdminEmail(user.email) ? 'super_admin' : 'fan'

                    // Create user
                    await supabase.from('users').insert({
                        id: user.id,
                        email: user.email!,
                        name: user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0],
                        avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture,
                        role: role,
                    })
                } else {
                    // Update last_login_at
                    await supabase
                        .from('users')
                        .update({ last_login_at: new Date().toISOString() })
                        .eq('id', user.id)
                }
            } catch (syncError) {
                console.error('Error syncing user:', syncError)
                // Continue anyway - user is authenticated
            }

            return NextResponse.redirect(`${origin}${next}`)
        }
    }

    // return the user to an error page with instructions
    return NextResponse.redirect(`${origin}/login?error=auth-code-error`)
}
