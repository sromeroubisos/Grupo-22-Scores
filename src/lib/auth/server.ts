import { createClient } from '@/lib/supabase/server'
import { getReservedAdminRole, User } from '@/lib/types/user'
import { isGlobalAdminRole, resolveBestUserRole } from '@/lib/auth/roles'

/**
 * Get the current authenticated user from the session
 * This should be called from Server Components or Server Actions
 */
export async function getCurrentUser(): Promise<User | null> {
    const supabase = await createClient()

    // getUser() y NO getSession(). getSession() lee la cookie de sesion y la
    // decodifica sin verificar la firma contra el servidor de auth: como la
    // cookie se emite sin httpOnly (ver api/auth/commit-session), un token
    // fabricado pasaba el chequeo. getUser() la valida contra Supabase.
    // De esto cuelgan isSuperAdmin() y requireSuperAdmin(), asi que el ida y
    // vuelta extra es el precio de que el guard sea real.
    const { data: { user: authUser } } = await supabase.auth.getUser()

    if (!authUser) {
        return null
    }

    // Fetch user profile from public.users
    const { data: user, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', authUser.id)
        .single()

    if (error || !user) {
        return null
    }

    return {
        ...user,
        role: resolveBestUserRole({
            reservedRole: getReservedAdminRole(authUser.email),
            profileRole: user.role,
            appMetadata: authUser.app_metadata,
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
