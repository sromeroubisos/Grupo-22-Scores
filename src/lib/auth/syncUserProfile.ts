import type { User as AuthUser } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { createAdminClient } from '@/lib/supabase/admin'
import { isDefaultRoleValue, resolveBestUserRole } from '@/lib/auth/roles'
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
    const metadataRole = resolveBestUserRole({
        reservedRole,
        appMetadata: user.app_metadata,
        userMetadata: user.user_metadata,
    })
    const now = new Date().toISOString()

    const { data: existingUser, error: lookupError } = await admin
        .from('users')
        .select('id, role')
        .eq('id', user.id)
        .maybeSingle()

    if (lookupError) {
        throw lookupError
    }

    const updates: { last_login_at: string; role?: string } = {
        last_login_at: now,
    }

    if (reservedRole) {
        updates.role = reservedRole
    } else if (existingUser && isDefaultRoleValue(existingUser.role) && metadataRole !== 'fan') {
        updates.role = metadataRole
    }

    if (existingUser) {
        const { error: updateError } = await admin
            .from('users')
            .update(updates)
            .eq('id', user.id)

        if (updateError) {
            throw updateError
        }

        return { created: false as const }
    }

    const insertPayload: UserInsert = {
        id: user.id,
        email,
        name: resolveDisplayName(user, email),
        last_login_at: now,
        role: reservedRole ?? metadataRole,
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
