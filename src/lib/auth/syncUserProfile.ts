import type { User as AuthUser } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { createAdminClient } from '@/lib/supabase/admin'
import { getReservedAdminRole } from '@/lib/types/user'

type UserInsert = Database['public']['Tables']['users']['Insert']

function resolveDisplayName(user: AuthUser, email: string) {
    return user.user_metadata?.full_name
        || user.user_metadata?.name
        || email.split('@')[0]
        || 'Usuario'
}

function resolveAvatarUrl(user: AuthUser) {
    const avatar = user.user_metadata?.avatar_url || user.user_metadata?.picture
    return typeof avatar === 'string' && avatar.trim() ? avatar : null
}

function isDuplicateKeyError(error: unknown) {
    return Boolean(
        error
        && typeof error === 'object'
        && 'code' in error
        && (error as { code?: unknown }).code === '23505'
    )
}

export async function syncUserProfile(user: AuthUser) {
    const email = user.email

    if (!email) {
        throw new Error('Authenticated user is missing an email address')
    }

    const admin = createAdminClient()
    const reservedRole = getReservedAdminRole(email)
    const now = new Date().toISOString()
    const updates: { last_login_at: string; role?: 'super_admin' | 'admin_general' } = {
        last_login_at: now,
    }

    if (reservedRole) {
        updates.role = reservedRole
    }

    const { data: updatedUser, error: updateError } = await admin
        .from('users')
        .update(updates)
        .eq('id', user.id)
        .select('id')
        .maybeSingle()

    if (updateError) {
        throw updateError
    }

    if (updatedUser) {
        return { created: false as const }
    }

    const insertPayload: UserInsert = {
        id: user.id,
        email,
        name: resolveDisplayName(user, email),
        last_login_at: now,
        role: reservedRole ?? 'fan',
    }

    const avatarUrl = resolveAvatarUrl(user)
    if (avatarUrl) {
        insertPayload.avatar_url = avatarUrl
    }

    const { error: insertError } = await admin
        .from('users')
        .insert(insertPayload)

    if (insertError) {
        if (isDuplicateKeyError(insertError)) {
            const { error: retryError } = await admin
                .from('users')
                .update(updates)
                .eq('id', user.id)

            if (retryError) {
                throw retryError
            }

            return { created: false as const }
        }

        throw insertError
    }

    return { created: true as const }
}
