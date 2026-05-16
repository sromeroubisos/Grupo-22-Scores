'use client'

import { forwardRef, type AnchorHTMLAttributes, type MouseEvent } from 'react'
import { createClient } from '@/lib/supabase/client'

type ProtectedLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string
}

const SESSION_REFRESH_BUDGET_MS = 4000

/**
 * Refresh the Supabase session and let the cookie adapter persist the rotated
 * tokens to `document.cookie` before we hand off to a full-document
 * navigation. `getSession()` is a no-op when the access token is still fresh
 * and only triggers a `/token` refresh when it is expiring, so this is cheap
 * on the common path.
 */
async function ensureFreshSessionCookie(): Promise<void> {
    try {
        const supabase = createClient()
        await Promise.race([
            supabase.auth.getSession(),
            new Promise((resolve) => setTimeout(resolve, SESSION_REFRESH_BUDGET_MS)),
        ])
    } catch {
        // Best effort only — fall through to the navigation and let the
        // server guard / login flow take over if the session is truly gone.
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
    function ProtectedLink({ href, onClick, children, ...rest }, ref) {
        return (
            <a
                ref={ref}
                href={href}
                onClick={(event: MouseEvent<HTMLAnchorElement>) => {
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
                    void ensureFreshSessionCookie().finally(() => {
                        window.location.assign(href)
                    })
                }}
                {...rest}
            >
                {children}
            </a>
        )
    },
)

export default ProtectedLink
