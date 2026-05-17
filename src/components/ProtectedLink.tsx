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

// Treat the access token as "good enough to navigate" only if it still has
// this much life left. The server proxy fast-paths anything with >120s left
// (ACCESS_TOKEN_REFRESH_MARGIN_SECONDS); a 90s floor guarantees the token
// will not expire mid-navigation + server roundtrip.
const FRESH_ACCESS_TOKEN_MARGIN_SECONDS = 90

type SessionOutcome = 'navigate' | 'login'

type SessionLike = {
    access_token?: string | null
    refresh_token?: string | null
    expires_at?: number | null
}

// Resolve the access-token expiry (unix seconds) from the real Supabase
// session. Prefer the session's own `expires_at`; fall back to decoding the
// JWT only if it is absent.
function readSessionExpirySeconds(session: SessionLike): number | null {
    if (typeof session.expires_at === 'number' && Number.isFinite(session.expires_at)) {
        return session.expires_at
    }

    const token = typeof session.access_token === 'string' ? session.access_token : ''
    const segments = token.split('.')
    if (segments.length < 2) return null

    try {
        let payload = segments[1].replace(/-/g, '+').replace(/_/g, '/')
        const padding = payload.length % 4
        if (padding) payload += '='.repeat(4 - padding)
        const parsed = JSON.parse(atob(payload)) as { exp?: unknown }
        return typeof parsed.exp === 'number' ? parsed.exp : null
    } catch {
        return null
    }
}

async function commitAndNavigate(session: SessionLike, href: string): Promise<SessionOutcome> {
    if (!session.access_token || !session.refresh_token) return 'login'
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
 * Make sure the auth cookie carries a non-expired access token BEFORE we hand
 * off to a server-guarded route.
 *
 * The SOURCE OF TRUTH is the real Supabase client (`supabase.auth.getSession`)
 * — supabase-ssr reliably reassembles chunked/Google session cookies. The
 * previous implementation gated this decision on the bespoke
 * `getSupabaseBrowserSessionHint()` parser, which misreads large chunked
 * OAuth session cookies and was therefore routing fully logged-in users to
 * `/login` on every "Super Admin" / "Editar partido" click ("me saca de la
 * sesion"). We only fall back to `/login` when a real `getSession()` AND a
 * real `refreshSession()` both yield nothing — and we never race a timeout or
 * abandon an in-flight refresh (that is what previously consumed the refresh
 * token and broke the session).
 */
async function ensureFreshSession(href: string): Promise<SessionOutcome> {
    const supabase = createClient()

    let session: SessionLike | null = null
    try {
        const { data } = await supabase.auth.getSession()
        session = (data?.session as SessionLike | null) ?? null
    } catch {
        session = null
    }

    const nowSeconds = Math.floor(Date.now() / 1000)

    if (session?.access_token && session?.refresh_token) {
        const expSeconds = readSessionExpirySeconds(session)
        const isFresh =
            typeof expSeconds === 'number' &&
            expSeconds > nowSeconds + FRESH_ACCESS_TOKEN_MARGIN_SECONDS

        if (isFresh) {
            return commitAndNavigate(session, href)
        }

        // Token missing/expiring: refresh and WAIT for it to settle (never
        // race a timeout, never abandon an in-flight refresh).
        try {
            const { data, error } = await supabase.auth.refreshSession()
            if (!error && data?.session?.access_token && data.session.refresh_token) {
                return commitAndNavigate(data.session as SessionLike, href)
            }
        } catch {
            // fall through and try the session we already hold
        }

        // Refresh failed but we still hold a session locally. Commit it and
        // let the server validate it, instead of nuking a recoverable session.
        return commitAndNavigate(session, href)
    }

    // No session from getSession — the refresh-token cookie may still be
    // present (e.g. only the access token was dropped). Attempt one real
    // refresh before giving up.
    try {
        const { data, error } = await supabase.auth.refreshSession()
        if (!error && data?.session?.access_token && data.session.refresh_token) {
            return commitAndNavigate(data.session as SessionLike, href)
        }
    } catch {
        // genuinely no session
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
