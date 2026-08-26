'use client'

import {
    forwardRef,
    useCallback,
    useRef,
    useState,
    type AnchorHTMLAttributes,
    type MouseEvent,
} from 'react'
import { ensureFreshSession } from '@/lib/supabase/freshSession'

type ProtectedLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string
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
