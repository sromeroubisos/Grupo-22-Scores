import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isSuperAdminEmail } from '@/lib/types/user'
import { NextResponse } from 'next/server'

export async function POST() {
    try {
        const supabase = await createClient()

        // Get current session
        const {
            data: { session },
            error: sessionError,
        } = await supabase.auth.getSession()

        if (sessionError || !session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const user = session.user
        const shouldBeSuperAdmin = isSuperAdminEmail(user.email)
        const admin = createAdminClient()
        const now = new Date().toISOString()

        // Query with the admin client so profile sync does not depend on RLS state.
        const { data: existingUser, error: existingUserError } = await admin
            .from('users')
            .select('id, role')
            .eq('id', user.id)
            .maybeSingle()

        if (existingUserError) {
            console.error('Error loading existing user:', existingUserError)
            return NextResponse.json({ error: 'Error loading user profile' }, { status: 500 })
        }

        if (!existingUser) {
            const role = shouldBeSuperAdmin ? 'super_admin' : 'fan'

            const { error: insertError } = await admin
                .from('users')
                .insert({
                    id: user.id,
                    email: user.email!,
                    name: user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0],
                    avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture,
                    role,
                    last_login_at: now,
                })

            if (insertError) {
                console.error('Error creating user:', insertError)
                return NextResponse.json({ error: 'Error creating user' }, { status: 500 })
            }
        } else {
            const updates: { last_login_at: string; role?: 'super_admin' } = {
                last_login_at: now,
            }

            if (shouldBeSuperAdmin && existingUser.role !== 'super_admin') {
                updates.role = 'super_admin'
            }

            const { error: updateError } = await admin
                .from('users')
                .update(updates)
                .eq('id', user.id)

            if (updateError) {
                console.error('Error updating user:', updateError)
                return NextResponse.json({ error: 'Error updating user' }, { status: 500 })
            }
        }

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Sync user error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
