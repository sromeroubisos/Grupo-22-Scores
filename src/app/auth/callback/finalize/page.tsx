'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient, persistAppAuthUserHint } from '@/lib/supabase/client'
import { sanitizeNext } from '@/lib/auth/redirect'
import { resolveBestUserRole } from '@/lib/auth/roles'
import { getReservedAdminRole } from '@/lib/types/user'

const POLL_INTERVAL_MS = 200
const MAX_WAIT_MS = 4000

function FinalizeContent() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const next = sanitizeNext(searchParams.get('next'))
    const [phase, setPhase] = useState<'waiting' | 'success' | 'failed'>('waiting')
    const startedRef = useRef<number>(0)

    useEffect(() => {
        let cancelled = false
        let timer: ReturnType<typeof setTimeout> | null = null
        const startedAt = Date.now()
        startedRef.current = startedAt

        const supabase = createClient()

        // Best-effort: kick the AuthContext to re-read by triggering a guest cleanup
        // and a sync-user. Both are no-ops if not authenticated.
        const finalize = async () => {
            try {
                // Force supabase to read fresh cookies set by the callback.
                const { data: { session } } = await supabase.auth.getSession()
                if (cancelled) return
                if (session?.user) {
                    // Persist the app-auth user hint BEFORE navigating. The
                    // destination (often the public home) would otherwise see
                    // an empty g22_user cache and AuthContext could bail to
                    // guest via its skipPublicAnonymousAuth gate without ever
                    // calling getSession(). This makes the bootstrap run.
                    try {
                        const sb = session.user
                        persistAppAuthUserHint({
                            id: sb.id,
                            email: sb.email || '',
                            name:
                                (typeof sb.user_metadata?.full_name === 'string' && sb.user_metadata.full_name) ||
                                (typeof sb.user_metadata?.name === 'string' && sb.user_metadata.name) ||
                                null,
                            role: resolveBestUserRole({
                                reservedRole: getReservedAdminRole(sb.email),
                                appMetadata: sb.app_metadata,
                                userMetadata: sb.user_metadata,
                            }),
                            avatarUrl:
                                typeof sb.user_metadata?.avatar_url === 'string'
                                    ? sb.user_metadata.avatar_url
                                    : null,
                        })
                    } catch (hintError) {
                        console.warn('[auth/finalize] persist user hint failed:', hintError)
                    }
                    // Persist a server-side profile sync (parity with password login flow).
                    try {
                        await fetch('/api/auth/sync-user', {
                            method: 'POST',
                            credentials: 'same-origin',
                        })
                    } catch (syncError) {
                        console.warn('[auth/finalize] sync-user failed:', syncError)
                    }
                    try {
                        await fetch('/api/auth/guest-club-family', {
                            method: 'DELETE',
                            credentials: 'same-origin',
                        })
                    } catch (guestError) {
                        console.warn('[auth/finalize] guest cleanup failed:', guestError)
                    }
                    setPhase('success')
                    // Full navigation (not router.replace) so AuthContext re-mounts
                    // against the now-authenticated cookies. router.replace can keep
                    // the previous AuthProvider tree which already concluded "no session".
                    window.location.replace(next)
                    return
                }

                if (Date.now() - startedAt > MAX_WAIT_MS) {
                    if (!cancelled) setPhase('failed')
                    return
                }
                timer = setTimeout(finalize, POLL_INTERVAL_MS)
            } catch (error) {
                console.error('[auth/finalize] getSession error:', error)
                if (Date.now() - startedAt > MAX_WAIT_MS) {
                    if (!cancelled) setPhase('failed')
                    return
                }
                timer = setTimeout(finalize, POLL_INTERVAL_MS)
            }
        }

        // Run the first attempt on next tick to let the browser commit the
        // cookies from the redirect response before we poll.
        timer = setTimeout(finalize, 0)

        return () => {
            cancelled = true
            if (timer) clearTimeout(timer)
        }
    }, [next, router])

    return (
        <div
            style={{
                minHeight: '100vh',
                display: 'grid',
                placeItems: 'center',
                background: '#0f1117',
                color: '#f8fafc',
                fontFamily: 'Inter, system-ui, sans-serif',
            }}
        >
            <div style={{ display: 'grid', gap: 14, justifyItems: 'center', textAlign: 'center', padding: 24 }}>
                {phase === 'waiting' && (
                    <>
                        <div
                            style={{
                                width: 36,
                                height: 36,
                                border: '3px solid rgba(255,255,255,0.15)',
                                borderTopColor: '#00a365',
                                borderRadius: '50%',
                                animation: 'spin 0.9s linear infinite',
                            }}
                        />
                        <p style={{ margin: 0, fontSize: 14, opacity: 0.7 }}>Iniciando sesion...</p>
                    </>
                )}
                {phase === 'success' && (
                    <p style={{ margin: 0 }}>Listo. Redirigiendo...</p>
                )}
                {phase === 'failed' && (
                    <>
                        <p style={{ margin: 0, fontSize: 15 }}>
                            No pudimos finalizar el inicio de sesion.
                        </p>
                        <p style={{ margin: 0, fontSize: 13, opacity: 0.7 }}>
                            Probalo de nuevo o limpia los cookies del sitio si persiste.
                        </p>
                        <a
                            href="/login?error=auth-code-error"
                            style={{
                                marginTop: 8,
                                padding: '10px 16px',
                                background: '#00a365',
                                color: '#03120c',
                                borderRadius: 12,
                                textDecoration: 'none',
                                fontWeight: 700,
                                fontSize: 13,
                            }}
                        >
                            Volver al login
                        </a>
                    </>
                )}
            </div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    )
}

export default function FinalizePage() {
    return <FinalizeContent />
}
