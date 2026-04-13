import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { AUTHORIZED_SUPER_ADMIN_EMAILS, SUPER_ADMIN_EMAIL } from '@/lib/types/user'

const SUPER_ADMIN_PASSWORD = 'SuperAdmin123!'

type SetupResult = {
    auth?: string
    publicUser?: string
    role?: string
    autoConfirmed?: boolean
}

function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
}

async function ensureAdminAccount(
    supabase: ReturnType<typeof createClient>,
    email: string,
): Promise<SetupResult> {
    const result: SetupResult = {}

    const { data: authUser, error: authLookupError } = await supabase
        .schema('auth')
        .from('users')
        .select('id, email')
        .eq('email', email)
        .maybeSingle()

    if (authLookupError) {
        result.auth = `Auth lookup error: ${authLookupError.message}`
        return result
    }

    let authUserId = authUser?.id ?? null

    if (!authUser) {
        const { data, error } = await supabase.auth.admin.createUser({
            email,
            password: SUPER_ADMIN_PASSWORD,
            email_confirm: true,
            user_metadata: { full_name: 'Super Admin' },
        })

        if (error) {
            result.auth = `Admin create error: ${error.message}`
            return result
        }

        authUserId = data.user?.id ?? null
        result.auth = authUserId ? `Created (id: ${authUserId})` : 'Created'
        result.autoConfirmed = true
    } else {
        const { error: updateError } = await supabase.auth.admin.updateUserById(authUser.id, {
            password: SUPER_ADMIN_PASSWORD,
            email_confirm: true,
        })

        if (updateError) {
            result.auth = `Password update error: ${updateError.message}`
            return result
        }

        authUserId = authUser.id
        result.auth = `Password reset (id: ${authUser.id})`
        result.autoConfirmed = true
    }

    const { data: publicUser, error: publicUserError } = await supabase
        .from('users')
        .update({ role: 'super_admin' })
        .eq('email', email)
        .select('id, role')
        .maybeSingle()

    if (publicUserError) {
        result.role = `Update error: ${publicUserError.message}`
    } else if (publicUser) {
        result.role = `OK (${publicUser.role})`
        result.publicUser = `Found: ${email} (role: ${publicUser.role})`
    } else if (authUserId) {
        result.publicUser = 'User not in public.users yet (trigger may not be set up, or schema not applied)'
        result.role = 'User not found to update role'
    }

    return result
}

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

    const key = serviceKey || anonKey
    const supabase = createClient(url, key, {
        auth: { autoRefreshToken: false, persistSession: false },
    })

    try {
        const { error } = await supabase.from('users').select('count').limit(1)
        if (error) {
            results.connection = `ERROR: ${error.message}`
            if (error.message.includes('does not exist') || error.message.includes('relation')) {
                results.schema = 'NOT APPLIED - Run supabase/schema.sql in the Supabase SQL Editor'
            }
        } else {
            results.connection = 'OK'
        }
    } catch (error: unknown) {
        results.connection = `EXCEPTION: ${getErrorMessage(error)}`
    }

    if (serviceKey) {
        const adminResults = await Promise.all(
            AUTHORIZED_SUPER_ADMIN_EMAILS.map(async (email) => {
                const accountResult = await ensureAdminAccount(supabase, email)
                return [email, accountResult] as const
            }),
        )

        results.admin_accounts = Object.fromEntries(adminResults)
    } else {
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
            if (data.user.identities && data.user.identities.length === 0) {
                results.super_admin = 'Already exists (email taken)'
            } else {
                results.super_admin = `Created (id: ${data.user.id})`
            }
        }

        results.auto_confirmed = false
        results.note = 'Without SUPABASE_SERVICE_ROLE_KEY the user may need email confirmation. Add the key to .env.local or confirm the user in the Supabase dashboard.'
    }

    return NextResponse.json({
        ok: results.connection === 'OK',
        credentials: AUTHORIZED_SUPER_ADMIN_EMAILS.map((email) => ({
            email,
            password: SUPER_ADMIN_PASSWORD,
            primary: email === SUPER_ADMIN_EMAIL,
        })),
        results,
    })
}
