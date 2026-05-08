'use client'

import { createClient } from '@/lib/supabase/client'
import styles from '../login.module.css'
import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { sanitizeReturnTo } from '../redirects'
import { getAuthErrorMessage } from '@/lib/auth/errors'

export default function OAuthButtons({ onError }: { onError?: (msg: string | null) => void }) {
    const [loading, setLoading] = useState<string | null>(null)
    const searchParams = useSearchParams()
    const roleIntent = searchParams.get('roleIntent')
    const returnTo = sanitizeReturnTo(searchParams.get('returnTo'), roleIntent)

    const getCallbackUrl = () => {
        const callbackUrl = new URL('/auth/callback', window.location.origin)
        callbackUrl.searchParams.set('next', returnTo)
        return callbackUrl.toString()
    }

    const handleLogin = async () => {
        // Guard via state, NOT a ref. A stale `ref.current = true` from a
        // previous failed attempt would otherwise leave the button silently
        // unclickable forever — that was the symptom the user was seeing on
        // desktop when this handler hit the no-`data.url` path below without
        // resetting state.
        if (loading) return
        onError?.(null)
        setLoading('google')

        let navigated = false
        try {
            console.info('[OAuth] starting Google sign-in flow')
            const supabase = createClient()
            const { data, error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: getCallbackUrl(),
                    skipBrowserRedirect: true,
                },
            })

            if (error) throw error

            const targetUrl = data?.url
            if (!targetUrl) {
                // The Supabase JS SDK normally always returns a URL here. If
                // it doesn't, surfacing a clear error is much better than
                // silently doing nothing.
                throw new Error('Supabase did not return an OAuth redirect URL')
            }

            console.info('[OAuth] redirecting to provider', targetUrl)
            navigated = true
            window.location.href = targetUrl
        } catch (error) {
            console.error('[OAuth] Google sign-in failed', error)
            onError?.(getAuthErrorMessage(error, 'No pudimos iniciar sesion con Google. Intenta nuevamente.'))
        } finally {
            // Only re-enable the button when we did NOT navigate away. If we
            // did navigate, the page is being unloaded and any setState here
            // is harmless — but skipping it keeps the spinner visible until
            // the redirect completes, which is the better UX.
            if (!navigated) {
                setLoading(null)
            }
        }
    }

    return (
        <div className={styles.socialButtons}>
            <button
                type="button"
                className={styles.socialBtn}
                onClick={() => handleLogin()}
                disabled={!!loading}
            >
                {loading === 'google' ? 'Conectando...' : (
                    <>
                        <svg className={styles.icon} viewBox="0 0 24 24">
                            <path fill="#EA4335" d="M24 12.276c0-.853-.075-1.67-.215-2.457H12.273v4.646h6.577a5.618 5.618 0 0 1-2.44 3.702v3.08h3.948c2.311-2.126 3.642-5.26 3.642-8.97z" />
                            <path fill="#34A853" d="M12.273 24c3.303 0 6.079-1.106 8.103-3.003l-3.95-3.08c-1.096.732-2.503 1.161-4.153 1.161-3.189 0-5.892-2.155-6.85-5.068H1.362v3.176A12.26 12.26 0 0 0 12.273 24z" />
                            <path fill="#FBBC05" d="M5.423 13.99A7.37 7.37 0 0 1 5.097 12c0-.69.12-1.353.326-1.99V6.833H1.362a12.25 12.25 0 0 0 0 10.334l4.06-3.177z" />
                            <path fill="#4285F4" d="M12.273 4.757c1.795 0 3.407.618 4.672 1.83l3.504-3.505C18.348 1.14 15.61 0 12.273 0 7.424 0 3.193 2.76 1.362 6.833l4.062 3.176c.958-2.912 3.66-5.252 6.849-5.252z" />
                        </svg>
                        Continuar con Google
                    </>
                )}
            </button>
        </div>
    )
}
