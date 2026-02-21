import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { SUPER_ADMIN_EMAIL } from '@/lib/types/user'

export async function GET(request: Request) {
    const { searchParams, origin } = new URL(request.url)
    const code = searchParams.get('code')
    const next = searchParams.get('next') ?? '/'

    if (code) {
        // Exchange code using the user-scoped client (sets the session cookie)
        const supabase = await createClient()
        const { data, error } = await supabase.auth.exchangeCodeForSession(code)

        if (!error && data.user) {
            try {
                const user = data.user
                // Use admin client for DB ops — bypasses RLS, no INSERT policy needed.
                const admin = createAdminClient()

                const { data: existingUser } = await admin
                    .from('users')
                    .select('id')
                    .eq('id', user.id)
                    .single()

                if (!existingUser) {
                    // 'fan' is the correct default role (CHECK: role IN ('fan', 'super_admin'))
                    const role = user.email === SUPER_ADMIN_EMAIL ? 'super_admin' : 'fan'
                    const { error: insertError } = await admin.from('users').insert({
                        id: user.id,
                        email: user.email!,
                        name: user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0],
                        avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture,
                        role,
                    })
                    if (insertError) {
                        console.error('Error creating user profile:', insertError.message)
                    }
                } else {
                    await admin
                        .from('users')
                        .update({ last_login_at: new Date().toISOString() })
                        .eq('id', user.id)
                }
            } catch (syncError) {
                console.error('Error syncing user:', syncError)
                // Continue — user is authenticated even if sync fails
            }

            return NextResponse.redirect(`${origin}${next}`)
        }
    }

    return NextResponse.redirect(`${origin}/login?error=auth-code-error`)
}
