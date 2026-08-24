import { headers } from 'next/headers'
import {
    MFA_CHALLENGE_ERROR,
    MFA_CHALLENGE_PATH,
    MFA_ENROLL_ERROR,
    MFA_ENROLL_PATH,
} from '@/lib/auth/mfa'

/**
 * Resolve where an admin layout guard should send a caller that failed
 * `requireGlobalAdminContext` / `requireTournamentAdminContext`.
 *
 * - `Unauthorized` means there is no usable session (commonly a stale auth
 *   cookie on mobile). Bounce to `/login` with a `returnTo` so the user lands
 *   back on the panel once the session is re-established, instead of being
 *   silently dropped on the home page with no explanation.
 * - Anything else (`Forbidden`, lookup failure) means the caller is
 *   authenticated but lacks the role — send them home.
 */
async function currentPathname(): Promise<string> {
    try {
        const pathname = (await headers()).get('x-pathname') || ''
        return pathname.startsWith('/') ? pathname : ''
    } catch {
        return ''
    }
}

function withReturnTo(base: string, pathname: string): string {
    return pathname ? `${base}?returnTo=${encodeURIComponent(pathname)}` : base
}

export async function resolveAdminGuardRedirect(error: unknown): Promise<string> {
    const message = error instanceof Error ? error.message : ''

    // El segundo factor no es un rechazo: el usuario TIENE el permiso, le falta
    // terminar de probar quien es. Va a la pantalla que corresponde con el
    // `returnTo` puesto, para volver a donde queria ir.
    if (message === MFA_CHALLENGE_ERROR) {
        return withReturnTo(MFA_CHALLENGE_PATH, await currentPathname())
    }

    if (message === MFA_ENROLL_ERROR) {
        return withReturnTo(MFA_ENROLL_PATH, await currentPathname())
    }

    if (message !== 'Unauthorized') {
        return '/'
    }

    const pathname = await currentPathname()
    return pathname ? withReturnTo('/login', pathname) : '/login'
}
