import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { SUPER_ADMIN_EMAIL } from '@/lib/types/user'

export async function GET(request: Request) {
    const { searchParams, origin } = new URL(request.url)
    const code = searchParams.get('code')
    const next = searchParams.get('next') ?? '/'

    if (code) {
        const supabase = await createClient()
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
                    const role = user.email === SUPER_ADMIN_EMAIL ? 'super_admin' : 'user'
                    await supabase.from('users').insert({
                        id: user.id,
                        email: user.email!,
                        name: user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0],
                        avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture,
                        role,
                    })
                } else {
                    await supabase
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
