'use client'

import {
    forwardRef,
    useCallback,
    useRef,
    useState,
    type AnchorHTMLAttributes,
    type MouseEvent,
} from 'react'
import { createClient } from '@/lib/supabase/client'
import { commitSupabaseSessionForServer } from '@/lib/supabase/sessionBridge'

type ProtectedLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string
}

type SessionOutcome = 'navigate' | 'login'

type SessionLike = {
    access_token?: string | null
    refresh_token?: string | null
}

async function commitAndNavigate(session: SessionLike | null, href: string): Promise<SessionOutcome> {
    if (!session?.access_token || !session?.refresh_token) return 'login'
    try {
        await commitSupabaseSessionForServer(
            { access_token: session.access_token, refresh_token: session.refresh_token },
            href,
        )
        return 'navigate'
    } catch {
        return 'login'
    }
}

/**
 * Make sure the auth cookie carries a usable session BEFORE we hand off to a
 * server-guarded route — without losing the session on mobile.
 *
 * COMMIT-FIRST (mobile-robust): we read the current session and POST it to
 * `/api/auth/commit-session`. The server's `supabase.auth.setSession()`
 * refreshes an EXPIRED access token using the refresh token *server-side*
 * (server -> Supabase, fast, not subject to a backgrounded mobile tab or a
 * flaky mobile network). This is what made desktop work but mobile keep
 * bouncing: on mobile the tab is frozen so the access token expires, and the
 * old client-side `refreshSession()` raced GoTrue's tab-resume auto-refresh
 * for the *rotating* refresh token — one call invalidated the other and the
 * session died. Letting the server do the single authoritative refresh
 * removes that race.
 *
 * Source of truth = the real supabase-ssr client (`getSession`), never the
 * bespoke cookie hint (it misreads large chunked Google sessions). We only
 * end at `/login` after server commit, a re-read, and a last-resort client
 * refresh have all failed.
 */
async function ensureFreshSession(href: string): Promise<SessionOutcome> {
    const supabase = createClient()

    const readSession = async (): Promise<SessionLike | null> => {
        try {
            const { data } = await supabase.auth.getSession()
            return (data?.session as SessionLike | null) ?? null
        } catch {
            return null
        }
    }
    const clientRefresh = async (): Promise<SessionLike | null> => {
        try {
            const { data, error } = await supabase.auth.refreshSession()
            return !error ? ((data?.session as SessionLike | null) ?? null) : null
        } catch {
            return null
        }
    }

    const session = await readSession()

    if (session?.access_token && session?.refresh_token) {
        // 1. Commit as-is. Server-side setSession() refreshes it if the
        //    access token is expired (the mobile case).
        if ((await commitAndNavigate(session, href)) === 'navigate') return 'navigate'

        // 2. Commit failed — most likely the refresh token rotated under us
        //    because a concurrent refresher (GoTrue tab-resume auto-refresh)
        //    won. Whoever won persisted a fresh session to the cookie; re-read
        //    and commit that one.
        const reread = await readSession()
        if (
            reread?.access_token &&
            reread.refresh_token &&
            reread.access_token !== session.access_token &&
            (await commitAndNavigate(reread, href)) === 'navigate'
        ) {
            return 'navigate'
        }

        // 3. Last resort: a single awaited client refresh. browserFetch
        //    coalesces this with any in-flight GoTrue refresh, so it cannot
        //    double-spend the refresh token. Never raced against a timeout.
        const refreshed = await clientRefresh()
        if (refreshed && (await commitAndNavigate(refreshed, href)) === 'navigate') {
            return 'navigate'
        }

        return 'login'
    }

    // No session in storage — the refresh-token cookie may still be present
    // (only the access token was dropped). One real refresh, then commit.
    const refreshed = await clientRefresh()
    if (refreshed && (await commitAndNavigate(refreshed, href)) === 'navigate') {
        return 'navigate'
    }
    return 'login'
}

/**
 * Drop-in replacement for `next/link` on entries into server-guarded admin
 * routes (super admin panel, match editor). App Router soft navigations issue
 * an RSC fetch whose cookie state can lag the browser client's in-memory
 * session on mobile — the server guard then throws and bounces the user out.
 * Forcing a fresh session cookie + a real document navigation makes the
 * server see a valid session reliably.
 *
 * Plain `<a>` is used on purpose so Next.js does NOT intercept it as a client
 * navigation. Modifier / middle clicks keep their native "open in new tab"
 * behaviour.
 */
const ProtectedLink = forwardRef<HTMLAnchorElement, ProtectedLinkProps>(
    function ProtectedLink({ href, onClick, children, style, ...rest }, ref) {
        const [pending, setPending] = useState(false)
        const navigatingRef = useRef(false)

        const handleClick = useCallback(
            (event: MouseEvent<HTMLAnchorElement>) => {
                onClick?.(event)

                if (
                    event.defaultPrevented ||
                    event.button !== 0 ||
                    event.metaKey ||
                    event.ctrlKey ||
                    event.shiftKey ||
                    event.altKey ||
                    (rest.target && rest.target !== '_self')
                ) {
                    return
                }

                event.preventDefault()

                // Guard against double taps while the refresh is in flight.
                if (navigatingRef.current) return
                navigatingRef.current = true
                setPending(true)

                void ensureFreshSession(href).then((outcome) => {
                    if (outcome === 'login') {
                        const loginUrl = `/login?returnTo=${encodeURIComponent(href)}`
                        window.location.assign(loginUrl)
                        return
                    }
                    window.location.assign(href)
                })
            },
            [href, onClick, rest.target],
        )

        return (
            <a
                ref={ref}
                href={href}
                onClick={handleClick}
                aria-busy={pending || undefined}
                style={
                    pending
                        ? { ...style, pointerEvents: 'none', opacity: 0.7 }
                        : style
                }
                {...rest}
            >
                {children}
            </a>
        )
    },
)

export default ProtectedLink
