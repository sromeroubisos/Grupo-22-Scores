import { createClient } from '@/lib/supabase/server'
import { getReservedAdminRole, User } from '@/lib/types/user'
import { isGlobalAdminRole, resolveBestUserRole } from '@/lib/auth/roles'

/**
 * Get the current authenticated user from the session
 * This should be called from Server Components or Server Actions
 */
export async function getCurrentUser(): Promise<User | null> {
    const supabase = await createClient()

    const { data: { session } } = await supabase.auth.getSession()

    if (!session?.user) {
        return null
    }

    // Fetch user profile from public.users
    const { data: user, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', session.user.id)
        .single()

    if (error || !user) {
        return null
    }

    return {
        ...user,
        role: resolveBestUserRole({
            reservedRole: getReservedAdminRole(session.user.email),
            profileRole: user.role,
            appMetadata: session.user.app_metadata,
            userMetadata: session.user.user_metadata,
        }),
    } as User
}

/**
 * Check if current user is super admin
 */
export async function isSuperAdmin(): Promise<boolean> {
    const user = await getCurrentUser()
    return isGlobalAdminRole(user?.role)
}

/**
 * Require authentication - throws if not authenticated
 */
export async function requireAuth(): Promise<User> {
    const user = await getCurrentUser()

    if (!user) {
        throw new Error('Unauthorized')
    }

    return user
}

/**
 * Require super admin - throws if not super admin
 */
export async function requireSuperAdmin(): Promise<User> {
    const user = await requireAuth()

    if (!isGlobalAdminRole(user.role)) {
        throw new Error('Forbidden: Super admin access required')
    }

    return user
}
