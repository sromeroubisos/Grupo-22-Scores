import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const SUPER_ADMIN_EMAIL = 'superadmin@g22scores.com'
const SUPER_ADMIN_PASSWORD = 'SuperAdmin123!'

export async function GET() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    const results: Record<string, unknown> = {
        supabase_url: url ? `${url.slice(0, 30)}...` : 'MISSING',
        anon_key: anonKey ? `${anonKey.slice(0, 20)}...` : 'MISSING',
        service_key: serviceKey ? 'SET' : 'MISSING (optional)',
    }

    if (!url || !anonKey || url.includes('placeholder')) {
        return NextResponse.json({
            ok: false,
            error: 'Supabase not configured. Check .env.local',
            results,
        })
    }

    // Use service role key if available, otherwise anon key
    const key = serviceKey || anonKey
    const supabase = createClient(url, key, {
        auth: { autoRefreshToken: false, persistSession: false },
    })

    // 1. Test connection
    try {
        const { error } = await supabase.from('users').select('count').limit(1)
        if (error) {
            results.connection = `ERROR: ${error.message}`
            // Table might not exist - try to check if schema is applied
            if (error.message.includes('does not exist') || error.message.includes('relation')) {
                results.schema = 'NOT APPLIED - Run supabase/schema.sql in the Supabase SQL Editor'
            }
        } else {
            results.connection = 'OK'
        }
    } catch (e: any) {
        results.connection = `EXCEPTION: ${e.message}`
    }

    // 2. Create super admin user
    try {
        // Try signUp (works with anon key)
        const { data, error } = await supabase.auth.signUp({
            email: SUPER_ADMIN_EMAIL,
            password: SUPER_ADMIN_PASSWORD,
            options: {
                data: { full_name: 'Super Admin' },
            },
        })

        if (error) {
            if (error.message.includes('already registered') || error.message.includes('already been registered')) {
                results.super_admin = 'Already exists'
            } else {
                results.super_admin = `SignUp error: ${error.message}`
            }
        } else if (data.user) {
            // Check if user was actually created or if it's a fake response (email confirmation required)
            if (data.user.identities && data.user.identities.length === 0) {
                results.super_admin = 'Already exists (email taken)'
            } else {
                results.super_admin = `Created (id: ${data.user.id})`

                // If we have service key, auto-confirm the user
                if (serviceKey) {
                    const { error: updateError } = await supabase.auth.admin.updateUserById(data.user.id, {
                        email_confirm: true,
                    })
                    results.auto_confirmed = updateError ? `Error: ${updateError.message}` : true
                } else {
                    results.auto_confirmed = false
                    results.note = 'Without SUPABASE_SERVICE_ROLE_KEY the user may need email confirmation. Add the key to .env.local or confirm the user in the Supabase dashboard.'
                }
            }
        }
    } catch (e: any) {
        results.super_admin = `EXCEPTION: ${e.message}`
    }

    // 3. Try to verify the user exists in public.users table
    try {
        const { data, error } = await supabase
            .from('users')
            .select('id, email, role')
            .eq('email', SUPER_ADMIN_EMAIL)
            .maybeSingle()

        if (error) {
            results.users_table = `Query error: ${error.message}`
        } else if (data) {
            results.users_table = `Found: ${data.email} (role: ${data.role})`
        } else {
            results.users_table = 'User not in public.users yet (trigger may not be set up, or schema not applied)'
        }
    } catch (e: any) {
        results.users_table = `EXCEPTION: ${e.message}`
    }

    return NextResponse.json({
        ok: results.connection === 'OK',
        credentials: {
            email: SUPER_ADMIN_EMAIL,
            password: SUPER_ADMIN_PASSWORD,
        },
        results,
    })
}
