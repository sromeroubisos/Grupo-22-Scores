'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { sanitizeNext } from '@/lib/auth/redirect'
import { createClient } from '@/lib/supabase/client'

export default function AuthConfirmPage() {
    const searchParams = useSearchParams()
    const next = useMemo(() => sanitizeNext(searchParams.get('next')), [searchParams])
    const [message, setMessage] = useState('Confirmando tu cuenta...')
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        const supabase = createClient()
        let finished = false

        const completeFlow = async () => {
            if (finished) {
                return false
            }

            try {
                const {
                    data: { session },
                } = await supabase.auth.getSession()

                if (!session) {
                    return false
                }

                finished = true
                setMessage('Cuenta confirmada. Redirigiendo...')

                try {
                    await fetch('/api/auth/sync-user', {
                        method: 'POST',
                        credentials: 'same-origin',
                    })
                } catch (syncError) {
                    console.warn('[AuthConfirmPage] sync-user failed, continuing:', syncError)
                }

                window.location.assign(next)
                return true
            } catch (sessionError) {
                console.error('[AuthConfirmPage] Session completion error:', sessionError)
                return false
            }
        }

        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, session) => {
            if (session) {
                void completeFlow()
            }
        })

        void completeFlow()

        const timeoutId = window.setTimeout(() => {
            if (finished) return
            setError('No pudimos completar la confirmación del email. Intentá iniciar sesión nuevamente.')
            setMessage('Confirmación pendiente')
        }, 5000)

        return () => {
            subscription.unsubscribe()
            window.clearTimeout(timeoutId)
        }
    }, [next])

    return (
        <main
            style={{
                minHeight: '100vh',
                display: 'grid',
                placeItems: 'center',
                padding: '24px',
                background: 'var(--color-background, #050816)',
                color: 'white',
            }}
        >
            <section
                style={{
                    width: '100%',
                    maxWidth: 420,
                    padding: '32px 24px',
                    borderRadius: 20,
                    background: 'rgba(15, 23, 42, 0.88)',
                    border: '1px solid rgba(148, 163, 184, 0.2)',
                    boxShadow: '0 24px 80px rgba(0, 0, 0, 0.35)',
                    textAlign: 'center',
                }}
            >
                <p
                    style={{
                        margin: 0,
                        fontSize: 12,
                        letterSpacing: '0.28em',
                        textTransform: 'uppercase',
                        color: 'rgba(148, 163, 184, 0.9)',
                    }}
                >
                    G22 Scores
                </p>
                <h1 style={{ margin: '14px 0 10px', fontSize: 28, fontWeight: 800 }}>
                    Confirmación de email
                </h1>
                <p style={{ margin: 0, color: 'rgba(226, 232, 240, 0.92)', lineHeight: 1.6 }}>
                    {message}
                </p>
                {error ? (
                    <p style={{ margin: '18px 0 0', color: '#fca5a5', lineHeight: 1.6 }}>
                        {error}
                    </p>
                ) : null}
            </section>
        </main>
    )
}
