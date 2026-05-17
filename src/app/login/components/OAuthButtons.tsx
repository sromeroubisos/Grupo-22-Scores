'use client'

import { getSupabaseAuthStorageKey, getSupabaseSharedCookieDomain } from '@/lib/supabase/auth-cookie'
import { clearSupabaseBrowserSession } from '@/lib/supabase/client'
import styles from '../login.module.css'
import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { sanitizeReturnTo } from '../redirects'
import { getAuthErrorMessage } from '@/lib/auth/errors'

// Wipe any stale `-code-verifier` cookie/storage entry before starting a
// fresh PKCE flow. Stuck cookies from an earlier abandoned attempt are a
// common cause of "code verifier" errors when the user retries Google.
function clearStalePkceState() {
    if (typeof window === 'undefined') return
    const storageKey = getSupabaseAuthStorageKey()
    if (!storageKey) return

    const verifierKey = `${storageKey}-code-verifier`

    try { window.localStorage.removeItem(verifierKey) } catch { /* best-effort */ }
    try { window.sessionStorage.removeItem(verifierKey) } catch { /* best-effort */ }

    const expire = (domain?: string) => {
        const secure = window.location.protocol === 'https:' ? '; Secure' : ''
        const cookieDomain = domain ? `; Domain=${domain}` : ''
        document.cookie = `${verifierKey}=; Max-Age=0; Path=/; SameSite=Lax${cookieDomain}${secure}`
    }
    expire()
    const sharedDomain = getSupabaseSharedCookieDomain(window.location.hostname)
    if (sharedDomain) expire(sharedDomain)
}

export default function OAuthButtons({ onError }: { onError?: (msg: string | null) => void }) {
    const [loading, setLoading] = useState<string | null>(null)
    const searchParams = useSearchParams()
    const roleIntent = searchParams.get('roleIntent')
    const returnTo = sanitizeReturnTo(searchParams.get('returnTo'), roleIntent)

    const handleLogin = async () => {
        if (loading) return
        onError?.(null)
        setLoading('google')

        let navigated = false
        try {
            console.info('[OAuth] starting Google sign-in via /api/auth/google-start')
            clearSupabaseBrowserSession()
            clearStalePkceState()

            // Server-side OAuth start. The server creates the PKCE
            // code_verifier and writes it as a cookie in the response, so
            // the /auth/callback route handler (which also runs on the
            // server) can read it back when exchanging the code. Doing
            // this in the browser caused the verifier to land in
            // localStorage, where the SSR callback couldn't see it.
            const response = await fetch('/api/auth/google-start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ next: returnTo }),
            })
            const payload = await response.json().catch(() => ({})) as { url?: string; error?: string }

            if (!response.ok || payload.error) {
                throw new Error(payload.error || `OAuth start failed (HTTP ${response.status})`)
            }

            const targetUrl = payload.url
            if (!targetUrl) {
                throw new Error('OAuth start did not return a redirect URL')
            }

            console.info('[OAuth] redirecting to provider', targetUrl)
            navigated = true
            window.location.href = targetUrl
        } catch (error) {
            console.error('[OAuth] Google sign-in failed', error)
            onError?.(getAuthErrorMessage(error, 'No pudimos iniciar sesion con Google. Intenta nuevamente.'))
        } finally {
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
