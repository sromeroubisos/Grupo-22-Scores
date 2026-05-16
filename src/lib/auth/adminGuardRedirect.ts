import { headers } from 'next/headers'

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
export async function resolveAdminGuardRedirect(error: unknown): Promise<string> {
    const message = error instanceof Error ? error.message : ''

    if (message !== 'Unauthorized') {
        return '/'
    }

    let pathname = ''
    try {
        const headerStore = await headers()
        pathname = headerStore.get('x-pathname') || ''
    } catch {
        pathname = ''
    }

    if (!pathname || !pathname.startsWith('/')) {
        return '/login'
    }

    return `/login?returnTo=${encodeURIComponent(pathname)}`
}
