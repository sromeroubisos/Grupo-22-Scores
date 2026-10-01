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
 *   authenticated but lacks the role — send them home. Salvo el editor de
 *   partido (ver `matchEditorFallback`).
 */
async function currentPathname(): Promise<string> {
    try {
        const headerStore = await headers()
        const pathname = headerStore.get('x-pathname') || ''
        return pathname.startsWith('/') ? pathname : ''
    } catch {
        return ''
    }
}

const ADMIN_MATCH_EDITOR = /^\/admin\/(?:super|torneo)\/partidos\/([^/?#]+)\/?$/

/**
 * El editor de partido vive en tres lugares: `/admin/super/partidos/[id]`,
 * `/admin/torneo/partidos/[id]` y `/matches/[id]/editar`. Los tres montan el
 * mismo MatchCenterClient con la misma guarda por partido; los dos primeros
 * además exigen un ROL (super admin, gestor de torneos).
 *
 * Hay varios botones que llevan a los de `/admin` sin mirar el rol —el control
 * de partido del gestor de torneos, el buscador del admin, enlaces guardados—,
 * y un admin de club o de un torneo por membresía rebotaba a la portada. En vez
 * de perseguir cada botón, el rebote de rol sobre un editor de partido manda al
 * editor sin rol propio, que decide partido por partido (y da 404, no la
 * portada, si de verdad no le corresponde).
 */
export function matchEditorFallback(pathname: string): string | null {
    const match = ADMIN_MATCH_EDITOR.exec(pathname)
    if (!match) return null
    const id = match[1]
    if (id === 'crear') return null
    return `/matches/${id}/editar`
}

export async function resolveAdminGuardRedirect(error: unknown): Promise<string> {
    const message = error instanceof Error ? error.message : ''
    const pathname = await currentPathname()

    if (message !== 'Unauthorized') {
        return matchEditorFallback(pathname) ?? '/'
    }

    if (!pathname) {
        return '/login'
    }

    return `/login?returnTo=${encodeURIComponent(pathname)}`
}
