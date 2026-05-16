'use client'

import {
    forwardRef,
    useCallback,
    useRef,
    useState,
    type AnchorHTMLAttributes,
    type MouseEvent,
} from 'react'
import { createClient, getSupabaseBrowserSessionHint } from '@/lib/supabase/client'

type ProtectedLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string
}

// Treat the access token as "good enough to navigate" only if it still has
// this much life left. The server proxy fast-paths anything with >120s left
// (ACCESS_TOKEN_REFRESH_MARGIN_SECONDS); a 90s floor guarantees the token
// will not expire mid-navigation + server roundtrip.
const FRESH_ACCESS_TOKEN_MARGIN_SECONDS = 90

type SessionOutcome = 'navigate' | 'login'

/**
 * Make sure the auth cookie carries a non-expired access token BEFORE we hand
 * off to a server-guarded route.
 *
 * The previous implementation raced `getSession()` against a 4s timeout and
 * then navigated regardless. On mobile (backgrounded tabs let the access token
 * expire; slow networks make `/token` take >4s) the timeout won the race and
 * the full-document navigation aborted the in-flight refresh — consuming the
 * refresh token without persisting the rotated session. Both tokens ended up
 * unusable, so the server guard bounced the user to `/login` ~4s later.
 *
 * This version never abandons an in-flight refresh: it either confirms a fresh
 * token locally (instant navigation, the common case) or awaits a real
 * `refreshSession()` to settle. If the session is genuinely gone it routes to
 * `/login` immediately instead of dead-ending there after a doomed navigation.
 */
async function ensureFreshSession(): Promise<SessionOutcome> {
    let hint = getSupabaseBrowserSessionHint()
    const nowSeconds = Math.floor(Date.now() / 1000)

    // Fast path: local cookie/storage already has a comfortably-fresh access
    // token. The server will validate it without a refresh — navigate now and
    // skip the slow path entirely (this is what removes the perceived delay
    // when the token is actually fine).
    if (
        hint.hasSession &&
        typeof hint.accessTokenExpiresAt === 'number' &&
        hint.accessTokenExpiresAt > nowSeconds + FRESH_ACCESS_TOKEN_MARGIN_SECONDS
    ) {
        return 'navigate'
    }

    // No session material at all — go straight to login, no point navigating
    // into a guarded route.
    if (!hint.hasSession && !hint.hasRefreshToken) {
        return 'login'
    }

    // Slow path: the access token is missing/expiring. Deterministically
    // refresh and WAIT for it to fully settle so the rotated session is
    // written to `document.cookie` before the server reads it. We do NOT race
    // a timeout here: the app's auth fetch already caps the request
    // (SUPABASE_AUTH_TIMEOUT_MS) and coalesces concurrent refreshes, so this
    // resolves on its own — and never gets aborted by an early navigation.
    try {
        const supabase = createClient()
        const { data, error } = await supabase.auth.refreshSession()

        if (!error && data.session) {
            return 'navigate'
        }

        // The browser auth fetch turns transient network failures into a
        // synthetic error while preserving local session state, so re-check
        // the local hint: if a usable, non-expired token survived, let the
        // server (which gets its own 9s refresh budget) make the final call.
        hint = getSupabaseBrowserSessionHint()
        return hint.isAccessTokenFresh ? 'navigate' : 'login'
    } catch {
        hint = getSupabaseBrowserSessionHint()
        return hint.isAccessTokenFresh ? 'navigate' : 'login'
    }
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

                void ensureFreshSession().then((outcome) => {
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
