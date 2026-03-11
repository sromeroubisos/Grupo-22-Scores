import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isSuperAdminEmail } from '@/lib/types/user'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
    try {
        const supabase = await createClient()

        // Get current session
        const { data: { session }, error: sessionError } = await supabase.auth.getSession()

        if (sessionError || !session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const user = session.user
        const shouldBeSuperAdmin = isSuperAdminEmail(user.email)

        // Check if user exists in public.users
        const { data: existingUser } = await supabase
            .from('users')
            .select('*')
            .eq('id', user.id)
            .single()

        if (!existingUser) {
            // Determine role
            const role = shouldBeSuperAdmin ? 'super_admin' : 'user'

            // Create user in public.users
            const { error: insertError } = await supabase
                .from('users')
                .insert({
                    id: user.id,
                    email: user.email!,
                    name: user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0],
                    avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture,
                    role: role,
                })

            if (insertError) {
                console.error('Error creating user:', insertError)
                return NextResponse.json({ error: 'Error creating user' }, { status: 500 })
            }
        } else {
            // Update last_login_at
            await supabase
                .from('users')
                .update({ last_login_at: new Date().toISOString() })
                .eq('id', user.id)
        }

        if (shouldBeSuperAdmin) {
            try {
                const admin = createAdminClient()
                await admin
                    .from('users')
                    .update({ role: 'super_admin' })
                    .eq('id', user.id)
            } catch (error) {
                console.error('Error enforcing super admin role:', error)
            }
        }

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Sync user error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
